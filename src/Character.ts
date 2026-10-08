import Phaser from 'phaser';
import { FORM_DEFS } from './config/content';
import { styledKey } from './settings';
import { ensureTextures } from './textureLoader';
import {
  Form,
  formBodyTexture,
  formHasHorn,
  formHasWings,
  formHeadTexture,
  Outfit,
  Person,
  texturesFor,
} from './wardrobe';

// Movement traits per form come from config/content.ts (FORM_DEFS.traits).
type MoveTraits = (typeof FORM_DEFS)[number]['traits'];

// Walking longer than this (ms) breaks into a run
const RUN_AFTER = 2000;

function traitsFor(form: Form): MoveTraits {
  return (FORM_DEFS.find((f) => f.id === form) ?? FORM_DEFS[0]).traits;
}

// Repacked sheets (see repack script): 13 columns of 64x64 frames, 5 rows:
// walk up/left/down/right (col 0 = standing, cols 1-8 = cycle) + lying row.
const COLS = 13;
const WALK_ROW: Record<Dir, number> = { up: 0, left: 1, down: 2, right: 3 };
const LIE_FRAME = 4 * COLS + 5;

export type Dir = 'up' | 'down' | 'left' | 'right';

// Draw order, bottom to top
const LAYERS = [
  'wingsBg',
  'body',
  'shoes',
  'pants',
  'shirt',
  'dress',
  'jewelry',
  'wingsFg',
  'head',
  'hair',
  'hat',
] as const;
type Layer = (typeof LAYERS)[number];

function layerTextures(person: Person): Partial<Record<Layer, string>> {
  const { sex, outfit } = person;
  const [humanBody, humanHead] = texturesFor(sex, 'skin', outfit.skin);
  const wings = formHasWings(person.form);
  return {
    wingsBg: wings ? 'wings_bg' : undefined,
    body: formBodyTexture(person) || humanBody,
    head: formHeadTexture(person) || humanHead,
    hair: texturesFor(sex, 'hair', outfit.hair)[0],
    shirt: texturesFor(sex, 'shirt', outfit.shirt)[0],
    pants: texturesFor(sex, 'pants', outfit.pants)[0],
    dress: texturesFor(sex, 'dress', outfit.dress)[0],
    shoes: texturesFor(sex, 'shoes', outfit.shoes)[0],
    jewelry: texturesFor(sex, 'jewelry', outfit.jewelry)[0],
    hat: texturesFor(sex, 'hat', outfit.hat)[0],
    wingsFg: wings ? 'wings_fg' : undefined,
  };
}

/** Create walk animations for a texture key if they don't exist yet. */
function ensureAnims(scene: Phaser.Scene, key: string) {
  for (const dir of Object.keys(WALK_ROW) as Dir[]) {
    const animKey = `${key}-walk-${dir}`;
    if (scene.anims.exists(animKey)) continue;
    const start = WALK_ROW[dir] * COLS + 1;
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(key, { start, end: start + 7 }),
      frameRate: 12,
      repeat: -1,
    });
  }
}

export class Character extends Phaser.GameObjects.Container {
  readonly person: Person;
  private layers = new Map<string, Phaser.GameObjects.Sprite>();
  private baseY = -32; // sprite baseline within the container (style-dependent)
  private ring: Phaser.GameObjects.Ellipse;
  private horn!: Phaser.GameObjects.Graphics;
  private dir: Dir = 'down';
  private target: Phaser.Math.Vector2 | null = null;
  private onArrive: (() => void) | null = null;
  private lying = false;
  private bobPhase = 0;
  private grown = false;
  private walkMs = 0; // continuous walking time; > RUN_AFTER means running
  private dustMs = 0;

  private get traits(): MoveTraits {
    return traitsFor(this.person.form);
  }

  get isRunning(): boolean {
    return this.walkMs > RUN_AFTER;
  }

  get speed(): number {
    return this.traits.speed * (this.isRunning ? 1.9 : 1);
  }

  get canFly(): boolean {
    return !!this.traits.fly;
  }

  get facing(): Dir {
    return this.dir;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, person: Person) {
    super(scene, x, y);
    this.person = person;

    // Selection ring under the feet (local space; container is scaled 2x)
    this.ring = scene.add.ellipse(0, -2, 54, 18, 0xffd166, 0.45);
    this.ring.setVisible(false);
    this.add(this.ring);

    // Layer sprites are (re)built by applyOutfit — styles differ in layer sets

    // Unicorn horn (drawn; LPC has no single-spiral horn sprite)
    this.horn = scene.add.graphics();
    this.horn.fillStyle(0xf2c94e).fillTriangle(-4, -53, 4, -53, 0, -72);
    this.horn.lineStyle(1, 0xd9a72e).lineBetween(-3, -58, 3, -60).lineBetween(-2, -64, 2, -66);
    this.horn.setVisible(false);
    this.add(this.horn);

    this.setScale(2);
    this.applyOutfit();

    // Tappable: local-space rect covering the body
    this.setInteractive(
      new Phaser.Geom.Rectangle(-18, -60, 36, 62),
      Phaser.Geom.Rectangle.Contains,
    );
    scene.add.existing(this);
    this.setDepth(y);
  }

  setSelected(selected: boolean) {
    this.ring.setVisible(selected);
  }

  /** Grown-up room effect: smoothly grow/shrink. Returns true if it changed. */
  setGrown(grown: boolean): boolean {
    if (this.grown === grown) return false;
    this.grown = grown;
    const s = grown ? 2.6 : 2;
    this.scene.tweens.add({ targets: this, scaleX: s, scaleY: s, duration: 450, ease: 'back.out' });
    return true;
  }

  /** Quick squeeze animation (hugs, gulps). */
  pulse() {
    this.scene.tweens.add({
      targets: this,
      scaleX: this.scaleX * 1.15,
      scaleY: this.scaleY * 0.9,
      duration: 130,
      yoyo: true,
      repeat: 2,
    });
  }

  face(x: number) {
    this.dir = x < this.x ? 'left' : 'right';
    this.refreshPose();
  }

  setOutfit(outfit: Outfit) {
    this.person.outfit = outfit;
    this.applyOutfit();
  }

  /** Re-render after a form (transformation) change. */
  refreshForm() {
    this.applyOutfit();
  }

  private bareMode = false;

  /** Bath time: render without clothes (does not touch the saved outfit). */
  setBare(bare: boolean) {
    this.bareMode = bare;
    this.applyOutfit();
  }

  private tumbling = false;

  cartwheel(onDone?: () => void) {
    if (this.tumbling || this.isLying) return;
    this.tumbling = true;
    this.target = null;
    const dir = this.dir === 'left' ? -1 : 1;
    const spin = 360 * dir;
    this.scene.tweens.add({
      targets: this,
      angle: `+=${spin}`,
      x: this.x + 130 * dir,
      duration: 700,
      ease: 'sine.inout',
      onComplete: () => {
        this.setAngle(0);
        this.tumbling = false;
        this.setDepth(this.y);
        onDone?.();
      },
    });
  }

  /** Rebuild the layer sprites for the current outfit (style adapters hook in here). */
  private applyOutfit() {
    // Lazy-load any sheet this look needs, then rebuild (old layers stay
    // visible in the meantime so the character never blinks out).
    const neededRaw = Object.values(layerTextures(this.person)).filter(Boolean) as string[];
    const needed = neededRaw.map((k) => styledKey(k));
    const missing = needed.filter((k) => !this.scene.textures.exists(k));
    if (missing.length > 0) {
      ensureTextures(this.scene, missing, () => {
        if (this.active) this.buildLayers();
      });
      return;
    }
    this.buildLayers();
  }

  private buildLayers() {
    for (const s of this.layers.values()) s.destroy();
    this.layers.clear();

    this.baseY = -32;
    const model = this.bareMode
      ? {
          ...this.person,
          outfit: {
            ...this.person.outfit,
            shirt: 'none',
            pants: 'none',
            dress: 'none',
            shoes: 'none',
            jewelry: 'none',
            hat: 'none',
          },
        }
      : this.person;
    const textures = layerTextures(model);
    for (const layer of LAYERS) {
      const base = textures[layer];
      if (!base) continue;
      const key = styledKey(base);
      ensureAnims(this.scene, key);
      const sprite = this.scene.add.sprite(0, -32, key, 26);
      this.layers.set(layer, sprite);
      this.add(sprite);
    }
    this.bringToTop(this.horn);
    this.refreshPose();
  }

  walkTo(x: number, y: number, onArrive?: () => void) {
    this.standUp();
    this.target = new Phaser.Math.Vector2(x, y);
    this.onArrive = onArrive ?? null;
  }

  /** Run away immediately (skips the walk phase). */
  flee(x: number, y: number) {
    this.walkTo(x, y);
    this.walkMs = RUN_AFTER + 1;
    this.refreshPose();
  }

  lieDown() {
    this.target = null;
    this.lying = true;
    this.refreshPose();
  }

  standUp() {
    if (!this.lying) return;
    this.lying = false;
    if (!this.tumbling) this.setAngle(0);
    this.refreshPose();
  }

  get isLying() {
    return this.lying;
  }

  private eachVisible(fn: (s: Phaser.GameObjects.Sprite) => void) {
    for (const s of this.layers.values()) if (s.visible) fn(s);
  }

  private updateHorn() {
    const show = formHasHorn(this.person.form) && !this.lying && this.dir !== 'up';
    this.horn.setVisible(show);
    if (show) this.horn.setX(this.dir === 'left' ? -7 : this.dir === 'right' ? 7 : 0);
  }

  /** Re-apply the current pose (idle / walking / lying) to all layers. */
  private refreshPose() {
    this.updateHorn();

    if (this.lying) {
      this.eachVisible((s) => {
        s.stop();
        s.setFrame(LIE_FRAME);
      });
    } else if (this.target) {
      const rate = (this.traits.animRate ?? 1) * (this.isRunning ? 1.8 : 1);
      this.eachVisible((s) => {
        s.play(`${s.texture.key}-walk-${this.dir}`, true);
        s.anims.timeScale = rate;
      });
    } else {
      const idle = WALK_ROW[this.dir] * COLS;
      this.eachVisible((s) => {
        s.stop();
        s.setFrame(idle);
      });
    }
  }

  // Called by the scene's update() — containers are not on Phaser's update list
  update(_time: number, delta: number) {
    // Form-specific bounce: while walking, or all the time for hover forms
    const t = this.traits;
    if (!this.lying && (t.hover || (t.bobAmp > 0 && this.target))) {
      this.bobPhase += (delta / 1000) * t.bobFreq * Math.PI * 2;
      const bob = Math.abs(Math.sin(this.bobPhase)) * t.bobAmp + (t.hover ? 3 : 0);
      for (const s of this.layers.values()) s.y = this.baseY - bob;
      this.horn.setY(-bob);
    } else {
      for (const s of this.layers.values()) s.y = this.baseY;
      this.horn.setY(0);
    }

    if (!this.target) {
      this.walkMs = 0;
      return;
    }

    // Break into a run after walking continuously for a while
    const wasRunning = this.isRunning;
    this.walkMs += delta;
    if (this.isRunning && !wasRunning) this.refreshPose(); // speed up the legs

    // Dust puffs behind a running character
    if (this.isRunning) {
      this.dustMs += delta;
      if (this.dustMs > 130) {
        this.dustMs = 0;
        const back = this.dir === 'left' ? 26 : this.dir === 'right' ? -26 : 0;
        const dust = this.scene.add
          .circle(this.x + back + Phaser.Math.Between(-6, 6), this.y - 4, Phaser.Math.Between(4, 7), 0xd8cbb8, 0.55)
          .setDepth(this.y - 1);
        this.scene.tweens.add({
          targets: dust,
          y: dust.y - 14,
          scale: 1.8,
          alpha: 0,
          duration: 420,
          onComplete: () => dust.destroy(),
        });
      }
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * delta) / 1000;

    if (dist <= step) {
      this.setPosition(this.target.x, this.target.y);
      this.target = null;
      this.walkMs = 0;
      this.refreshPose();
      const cb = this.onArrive;
      this.onArrive = null;
      cb?.();
      return;
    }

    const prevDir = this.dir;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.setDepth(this.y);

    // (Re)start walk anims when direction changes or when we just started moving
    const sample = [...this.layers.values()].find((s) => s.visible);
    if (prevDir !== this.dir || !sample?.anims.isPlaying) this.refreshPose();
  }
}

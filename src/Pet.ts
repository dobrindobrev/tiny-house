import Phaser from 'phaser';
import { PetData } from './economy';

// LPC cats-and-dogs sheet: 512x256, 32x32 grid, 16 cols.
// 4 color blocks of 4 columns each. Per block (base = color*4):
//   row 0: walk right f0-f2, sleeping at base+3
//   row 1: walk up    f0-f2
//   row 2: walk down  f0-f2
//   row 3: walk left  f0-f2, sleeping (left) at base+3
//   row 4: sit/eat    f0-f3
const GRID = 16;
type Dir = 'up' | 'down' | 'left' | 'right';
const DIR_ROW: Record<Dir, number> = { right: 0, up: 1, down: 2, left: 3 };

type PetState = 'idle' | 'wander' | 'sleep' | 'mischief' | 'eat';

export interface PetHooks {
  /** Returns a breakable's approach point if any intact one exists. */
  requestMischief(): { x: number; y: number; doBreak: () => void } | null;
  /** Returns the food bowl approach point if it is full. */
  requestFood(): { x: number; y: number; eat: () => void } | null;
  /** Walkable bands per floor (index 0 = upper, 1 = ground) + stairs. */
  bands: { top: number; bottom: number }[];
  left: number;
  right: number;
  /** Staircase x positions. */
  stairsX: number[];
  /** Stair landing y per floor (same indexing as bands). */
  stairsY: number[];
}

export class Pet extends Phaser.GameObjects.Container {
  readonly info: PetData;
  private sprite: Phaser.GameObjects.Sprite;
  private mode: PetState = 'idle';
  private stateT = 0; // ms remaining in current state
  private dir: Dir = 'left';
  private target: Phaser.Math.Vector2 | null = null;
  private onArrive: (() => void) | null = null;
  private hooks: PetHooks;
  private hunger = Phaser.Math.Between(30, 80);
  readonly speed = 120;

  constructor(scene: Phaser.Scene, x: number, y: number, data: PetData, hooks: PetHooks) {
    super(scene, x, y);
    this.info = data;
    this.hooks = hooks;
    const tex = `pet_${data.kind}`;
    this.sprite = scene.add.sprite(0, -16, tex, this.frame0('down'));
    this.add(this.sprite);
    this.ensureAnims(tex);
    this.setScale(2);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-14, -30, 28, 32),
      Phaser.Geom.Rectangle.Contains,
    );
    scene.add.existing(this);
    this.setDepth(y);
    this.enterIdle();
  }

  private get base() {
    return this.info.color * 4;
  }

  private frame0(dir: Dir) {
    return DIR_ROW[dir] * GRID + this.base;
  }

  private ensureAnims(tex: string) {
    const mk = (key: string, frames: number[], rate = 6, repeat = -1) => {
      if (this.scene.anims.exists(key)) return;
      this.scene.anims.create({
        key,
        frames: frames.map((f) => ({ key: tex, frame: f })),
        frameRate: rate,
        repeat,
      });
    };
    for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
      const f = this.frame0(dir);
      mk(`${tex}${this.base}-walk-${dir}`, [f, f + 1, f + 2, f + 1], 8);
    }
    const eat = 4 * GRID + this.base;
    mk(`${tex}${this.base}-eat`, [eat, eat + 1, eat + 2, eat + 3], 5);
  }

  private play(kind: 'walk' | 'eat') {
    const tex = `pet_${this.info.kind}`;
    this.sprite.play(kind === 'eat' ? `${tex}${this.base}-eat` : `${tex}${this.base}-walk-${this.dir}`, true);
  }

  private showSleep() {
    this.sprite.stop();
    const row = this.dir === 'right' ? 0 : 3;
    this.sprite.setFrame(row * GRID + this.base + 3);
  }

  /** Emote bubble above the pet (e.g. when petted). */
  emote(emoji: string) {
    const t = this.scene.add
      .text(this.x, this.y - 70, emoji, { fontSize: '28px' })
      .setOrigin(0.5)
      .setDepth(1500);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 40,
      alpha: 0,
      duration: 1200,
      onComplete: () => t.destroy(),
    });
  }

  pet() {
    // Petting wakes it up happy
    this.emote(Phaser.Math.RND.pick(['❤️', '😻', '🎵']));
    this.enterIdle(600);
  }

  /** While set, the pet is carried: AI paused, position driven by the carrier. */
  carriedBy: string | null = null;

  setCarried(by: string | null) {
    this.carriedBy = by;
    this.target = null;
    this.onArrive = null;
    if (by) {
      this.sprite.stop();
      this.dir = 'down';
      this.sprite.setFrame(this.frame0('down'));
      this.emote('❤️');
    } else {
      this.enterIdle(800);
    }
  }

  // ---------- state machine ----------

  private enterIdle(ms = Phaser.Math.Between(800, 2600)) {
    this.mode = 'idle';
    this.stateT = ms;
    this.target = null;
    this.sprite.stop();
    this.sprite.setFrame(this.frame0(this.dir));
  }

  private bandOf(y: number): number {
    return y < 1000 ? 0 : 1;
  }

  /** Walk somewhere, taking the stairs when the target is on another floor. */
  private goVia(x: number, y: number, cb: () => void) {
    const from = this.bandOf(this.y);
    const to = this.bandOf(y);
    if (from === to) {
      this.walkTo(x, y, cb);
      return;
    }
    const h = this.hooks;
    const mid = (this.x + x) / 2;
    let sx = h.stairsX[0];
    for (const c of h.stairsX) if (Math.abs(c - mid) < Math.abs(sx - mid)) sx = c;
    this.walkTo(sx, h.stairsY[from], () =>
      this.walkTo(sx, h.stairsY[to], () => this.walkTo(x, y, cb)),
    );
  }

  private enterWander() {
    const h = this.hooks;
    // Mostly roam the current floor; sometimes take the stairs
    const band = Math.random() < 0.75 ? h.bands[this.bandOf(this.y)] : Phaser.Math.RND.pick(h.bands);
    const x = Phaser.Math.Between(h.left, h.right);
    const y = Phaser.Math.Between(band.top, band.bottom);
    this.goVia(x, y, () => this.decide());
    this.mode = 'wander';
  }

  private enterSleep() {
    this.mode = 'sleep';
    this.stateT = Phaser.Math.Between(6000, 14000);
    this.target = null;
    this.showSleep();
  }

  private decide() {
    this.hunger += 4;
    const roll = Math.random();
    if (this.hunger > 70) {
      const bowl = this.hooks.requestFood();
      if (bowl) {
        this.mode = 'eat';
        this.goVia(bowl.x, bowl.y, () => {
          this.play('eat');
          this.stateT = 3500;
          this.scene.time.delayedCall(3500, () => {
            if (this.mode === 'eat') {
              bowl.eat();
              this.hunger = 0;
              this.emote('😋');
              this.enterIdle();
            }
          });
        });
        return;
      }
    }
    if (roll < 0.18) {
      const target = this.hooks.requestMischief();
      if (target) {
        this.mode = 'mischief';
        this.goVia(target.x, target.y, () => {
          target.doBreak();
          this.emote('😼');
          // Scamper away from the scene of the crime, same floor
          const band = this.hooks.bands[this.bandOf(this.y)];
          this.walkTo(
            Phaser.Math.Clamp(this.x + Phaser.Math.Between(-500, 500), this.hooks.left, this.hooks.right),
            Phaser.Math.Between(band.top, band.bottom),
            () => this.enterIdle(),
          );
        });
        return;
      }
    }
    if (roll < 0.38) {
      this.enterSleep();
      return;
    }
    if (roll < 0.6) {
      this.enterIdle();
      return;
    }
    this.enterWander();
  }

  private walkTo(x: number, y: number, onArrive: () => void) {
    this.target = new Phaser.Math.Vector2(x, y);
    this.onArrive = onArrive;
  }

  update(_time: number, delta: number) {
    if (this.carriedBy) return; // position is driven by the carrier
    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = (this.speed * delta) / 1000;
      if (dist <= step) {
        this.setPosition(this.target.x, this.target.y);
        this.target = null;
        const cb = this.onArrive;
        this.onArrive = null;
        this.sprite.stop();
        this.sprite.setFrame(this.frame0(this.dir));
        cb?.();
        return;
      }
      const prev = this.dir;
      this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.setDepth(this.y);
      if (prev !== this.dir || !this.sprite.anims.isPlaying) this.play('walk');
      return;
    }

    if (this.mode === 'idle' || this.mode === 'sleep') {
      this.stateT -= delta;
      this.hunger += delta / 4000;
      if (this.stateT <= 0) this.decide();
    }
  }
}

import Phaser from 'phaser';
import { Character } from './Character';
import { Pet } from './Pet';
import { Breakable } from './Breakable';
import { sfx } from './sfx';
import { dlog, frameTick } from './debug';
import { puzzleKeys } from './PuzzleScene';
import { getActiveStyle, getActiveTheme, nextStyle, nextTheme, setActiveStyle, setActiveTheme } from './settings';
import { hasVoice, playVoice, recordVoice } from './voice';
import { STYLE_LIST } from './config/styles';
import { FORM_DEFS, ROOM_THEMES } from './config/content';
import {
  Form,
  loadPeople,
  newPerson,
  Person,
  savePeople,
  Sex,
} from './wardrobe';
import {
  loadCoins,
  loadPets,
  loadUnlocks,
  newPet,
  PetData,
  PetKind,
  REWARDS,
  saveCoins,
  savePets,
} from './economy';

export const GAME_W = 1024;
export const GAME_H = 768;
export const ROOMS = 4; // per floor
export const FLOORS = 2;
export const WORLD_W = GAME_W * ROOMS;
export const WORLD_H = GAME_H * FLOORS;

// Walkable floor bands: 0 = upper floor, 1 = ground floor, 2 = secret sky roof
const BAND = [
  { top: 540, bottom: 720 },
  { top: 540 + GAME_H, bottom: 720 + GAME_H },
  { top: 540 - GAME_H, bottom: 720 - GAME_H },
];
const SKY_STAIRS_X = 2048; // the magic staircase to the roof
const STAIRS_XS = [1024, 2048, 4010]; // staircases across the house
const STAIR_Y = [690, 1400, 690 - GAME_H]; // stair landing per floor (incl. sky)

function nearestStairs(a: number, b: number): number {
  const mid = (a + b) / 2;
  let best = STAIRS_XS[0];
  for (const sx of STAIRS_XS) if (Math.abs(sx - mid) < Math.abs(best - mid)) best = sx;
  return best;
}
const WALL_H = 560;
const DOOR_X = 60;

interface Needs {
  hunger: number;
  energy: number;
  lastBubble: number;
}

export class RoomScene extends Phaser.Scene {
  private characters = new Map<string, Character>();
  private pets = new Map<string, Pet>();
  private needs = new Map<string, Needs>();
  private away = new Set<string>();
  private selectedId = '';
  private people: Person[] = [];
  private petList: PetData[] = [];
  private breakables: Breakable[] = [];
  private bedOccupant: string | null = null;
  private fixing = false;
  private zzz: Phaser.GameObjects.Text[] = [];
  private zzzTimer?: Phaser.Time.TimerEvent;
  private tvOn = false;
  private tvScreen!: Phaser.GameObjects.Rectangle;
  private bowlFull = false;
  private bowlG!: Phaser.GameObjects.Graphics;
  private doorG!: Phaser.GameObjects.Graphics;
  private houseG!: Phaser.GameObjects.Graphics;
  private panning = false;
  private bathBusy = false;
  private spider?: Phaser.GameObjects.Text;
  private batPickup?: Phaser.GameObjects.Text;
  private batCarrier: string | null = null;
  private batIcon?: Phaser.GameObjects.Text;
  private tasks: { id: string; label: string; need: number; got: number }[] = [];
  private skyUnlocked = false;
  private skyObjects: Phaser.GameObjects.GameObject[] = [];
  private flying = false;
  private meals: Phaser.GameObjects.Text[] = [];
  private ingredientCount = 0;

  constructor() {
    super('room');
  }

  preload() {
    // Loading screen — the sprite sheets (especially the 3D style) are heavy
    const barW = 520;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const label = this.add
      .text(cx, cy - 60, '🏠 Зареждане...', { fontSize: '40px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0.5);
    const barBg = this.add.rectangle(cx, cy, barW, 26, 0x2e2438).setStrokeStyle(3, 0x7c5cbf);
    const bar = this.add.rectangle(cx - barW / 2 + 3, cy, 1, 18, 0xffd166).setOrigin(0, 0.5);
    const pct = this.add.text(cx, cy + 44, '0%', { fontSize: '24px', color: '#bdb3cc' }).setOrigin(0.5);
    const onProgress = (v: number) => {
      bar.width = Math.max(1, (barW - 6) * v);
      pct.setText(`${Math.round(v * 100)}%`);
    };
    this.load.on('progress', onProgress);
    this.load.once('complete', () => {
      // Unhook: the loader runs again later for lazy textures, and these
      // objects will be long destroyed by then.
      this.load.off('progress', onProgress);
      label.destroy();
      barBg.destroy();
      bar.destroy();
      pct.destroy();
    });

    // Character sheets load lazily (textureLoader.ts) — only pets, puzzle
    // photos and other small always-needed assets load up front.
    this.load.spritesheet('pet_cat', 'assets/pets/cat.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('pet_dog', 'assets/pets/dog.png', { frameWidth: 32, frameHeight: 32 });
    for (const key of puzzleKeys) this.load.image(key, `assets/puzzles/${key}.jpg`);
  }

  create() {
    this.drawHouse();
    this.buildLivingRoom();
    this.buildKitchen();
    this.buildBedroom();
    this.buildLab();
    this.buildGrownUpRoom();
    this.buildPuzzleRoom();
    this.buildBathroom();
    this.buildGameRoom();
    this.buildDoor();
    this.buildBreakables();

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.registry.set('coins', loadCoins());
    this.registry.set('unlocks', loadUnlocks());

    this.people = loadPeople();
    this.people.forEach((p, i) => this.spawnCharacter(p, 360 + i * 260, 640 + GAME_H));
    this.select(this.people[0].id, true);

    this.petList = loadPets();
    this.petList.forEach((p, i) => this.spawnPet(p, 700 + i * 220, 660 + GAME_H));

    const on = (ev: string, fn: (...a: never[]) => void) => {
      this.game.events.on(ev, fn, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(ev, fn, this));
    };
    on('outfit-changed', this.onOutfitChanged);
    on('coins-spent', () => saveCoins(this.registry.get('coins')));
    on('ui-add-person', (sex: Sex) => this.addPerson(sex));
    on('ui-add-pet', (kind: PetKind) => this.addPet(kind));
    on('ui-cartwheel', () => {
      const char = this.selected;
      if (char && !char.isLying) {
        sfx.boing();
        char.cartwheel();
        this.taskProgress('cartwheel');
      }
    });
    on('form-chosen', (form: Form) => {
      dlog(`form ${form}`);
      this.applyForm(form);
    });
    on('ui-theme-toggle', () => {
      setActiveTheme(nextTheme());
      this.drawHouse();
      sfx.pop();
      this.toast(`🖼 Тема: ${ROOM_THEMES[getActiveTheme()].label}`);
    });
    on('ui-style-toggle', () => {
      setActiveStyle(nextStyle());
      const info = STYLE_LIST.find((st) => st.id === getActiveStyle())!;
      for (const char of this.characters.values()) char.setOutfit(char.person.outfit);
      sfx.whoosh();
      this.toast(`🎨 Стил: ${info.emoji} ${info.label}`);
      this.game.events.emit('style-changed');
    });
    on('earn-coins', (n: number) => this.addCoins(n));
    on('minigame-done', (kind: string) => this.taskProgress(kind));
    on('puzzle-solved', () => {
      this.taskProgress('puzzle');
      const char = this.selected;
      this.addCoins(REWARDS.puzzle, char?.x, char ? char.y - 160 : undefined);
      this.toast(`Пъзелът е решен! +${REWARDS.puzzle} 🪙`);
    });

    this.registry.set('basket', 0);
    this.time.addEvent({
      delay: Phaser.Math.Between(35000, 70000),
      loop: true,
      callback: () => this.dropGift(),
    });
    this.time.addEvent({
      delay: Phaser.Math.Between(20000, 40000),
      loop: true,
      callback: () => this.dropIngredient(),
    });
    this.time.delayedCall(4000, () => this.dropIngredient());
    this.time.addEvent({
      delay: Phaser.Math.Between(70000, 120000),
      loop: true,
      callback: () => this.spawnSpider(),
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickNeeds() });

    this.resetTasks();
    this.setupPointerControls();
    this.scene.launch('ui');
  }

  /**
   * Drag pans the camera (without moving anyone); a short tap on the floor
   * sends the selected character there.
   */
  private setupPointerControls() {
    let downX = 0;
    let downY = 0;
    let overSomething = false;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: unknown[]) => {
      downX = pointer.x;
      downY = pointer.y;
      overSomething = over.length > 0;
      this.panning = false;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      if (!this.panning && Math.abs(pointer.x - downX) + Math.abs(pointer.y - downY) > 16) {
        this.panning = true;
        this.cameras.main.stopFollow();
      }
      if (this.panning) {
        this.cameras.main.scrollX -= pointer.x - pointer.prevPosition.x;
        this.cameras.main.scrollY -= pointer.y - pointer.prevPosition.y;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.menuJustOpened) this.menuJustOpened = false;
      else this.closeMenu();
      if (this.panning || overSomething) return;
      const char = this.selected;
      if (!char) return;
      sfx.pop();
      // Fairies can fly: they may be sent high up into the tapped room
      const band = this.bandFor(pointer.worldY);
      const minY = char.canFly ? band.top - 300 : band.top;
      const y = Phaser.Math.Clamp(pointer.worldY, minY, band.bottom);
      const x = Phaser.Math.Clamp(pointer.worldX, 40, WORLD_W - 40);
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, x, y);
    });
  }

  update(time: number, delta: number) {
    frameTick();
    for (const [id, char] of this.characters) {
      if (this.away.has(id)) continue;
      char.update(time, delta);
      // Grown-up room: kids grow up inside, shrink back when they leave
      if (char.setGrown(char.y > GAME_H && char.x >= GAME_W * 2 && char.x < GAME_W * 3)) {
        sfx.whoosh();
        this.sparkle(char.x, char.y - 80);
      }
    }
    // Safety net: if the bed's occupant is no longer lying (woken through any
    // path), release the bed and stop the snoring.
    if (this.bedOccupant) {
      const occ = this.characters.get(this.bedOccupant);
      if (!occ || !occ.isLying) {
        this.bedOccupant = null;
        this.zzzTimer?.remove();
        this.zzz.forEach((z) => z.destroy());
        this.zzz = [];
      }
    }
    if (this.batCarrier && this.batIcon) {
      const carrier = this.characters.get(this.batCarrier);
      if (carrier) this.batIcon.setPosition(carrier.x + 32, carrier.y - 130).setDepth(carrier.depth + 3);
    }
    for (const pet of this.pets.values()) {
      pet.update(time, delta);
      if (pet.carriedBy) {
        const char = this.characters.get(pet.carriedBy);
        if (char) {
          const dx = char.facing === 'left' ? -26 : char.facing === 'right' ? 26 : 0;
          pet.setPosition(char.x + dx, char.y - 104);
          pet.setDepth(char.depth + 2);
        }
      }
    }
  }

  /** Launch an overlay scene and mute the room's input until it closes. */
  private launchOverlay(key: string) {
    if (this.scene.isActive(key)) return;
    dlog(`overlay ${key}`);
    this.scene.launch(key);
    this.input.enabled = false;
    this.scene.get(key).events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.enabled = true;
    });
  }

  private floorOf(y: number): number {
    if (y < 0) return 2; // secret roof
    return y < GAME_H ? 0 : 1;
  }

  private bandFor(y: number): { top: number; bottom: number } {
    return BAND[this.floorOf(y)];
  }

  /** Walk somewhere, taking stairs across floors (roof only via the magic stairs). */
  private routeTo(char: Character, x: number, y: number, cb?: () => void) {
    const from = this.floorOf(char.y);
    const to = this.floorOf(y);
    if (from === to) {
      char.walkTo(x, y, cb);
      return;
    }
    // Next hop: ground(1) <-> upper(0) <-> sky(2)
    let next: number;
    let sx: number;
    if (from === 1) {
      next = 0;
      sx = nearestStairs(char.x, to === 0 ? x : SKY_STAIRS_X);
    } else if (from === 2) {
      next = 0;
      sx = SKY_STAIRS_X;
    } else {
      next = to === 2 ? 2 : 1;
      sx = next === 2 ? SKY_STAIRS_X : nearestStairs(char.x, x);
    }
    char.walkTo(sx, STAIR_Y[from], () =>
      char.walkTo(sx, STAIR_Y[next], () => this.routeTo(char, x, y, cb)),
    );
  }

  // ---------- economy ----------

  private get coins(): number {
    return this.registry.get('coins') ?? 0;
  }

  private addCoins(n: number, atX?: number, atY?: number) {
    this.registry.set('coins', this.coins + n);
    saveCoins(this.coins);
    sfx.coin();
    if (atX !== undefined && atY !== undefined) {
      const t = this.add
        .text(atX, atY, `+${n} 🪙`, { fontSize: '28px', color: '#f7d154', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(1600);
      this.tweens.add({ targets: t, y: t.y - 70, alpha: 0, duration: 1300, onComplete: () => t.destroy() });
    }
  }

  private toast(msg: string) {
    this.game.events.emit('toast', msg);
  }

  // ---------- characters ----------

  private get selected(): Character | undefined {
    const char = this.characters.get(this.selectedId);
    return char && !this.away.has(this.selectedId) ? char : undefined;
  }

  private spawnCharacter(person: Person, x: number, y: number) {
    const char = new Character(this, x, y, person);
    this.needs.set(person.id, { hunger: 80, energy: 80, lastBubble: 0 });
    // Single tap selects (after a short wait); double tap opens actions
    let lastTap = 0;
    let pendingSelect: Phaser.Time.TimerEvent | undefined;
    char.on('pointerdown', () => {
      if (char.isLying) {
        this.wakeUp(char);
        return;
      }
      const now = this.time.now;
      const isDouble = now - lastTap < 350;
      lastTap = now;
      if (!isDouble) {
        pendingSelect?.remove();
        pendingSelect = this.time.delayedCall(360, () => this.select(person.id));
        return;
      }
      pendingSelect?.remove();
      this.openCharMenu(char);
    });
    this.characters.set(person.id, char);
    return char;
  }

  /** Double-tap menu: self = voice actions; someone else = interactions. */
  private openCharMenu(char: Character) {
    const person = char.person;
    const sel = this.selected;
    const voiceEntries = () => {
      const e: { label: string; fn: () => void }[] = [
        { label: '🎤 Запиши глас', fn: () => this.doRecordVoice(person.id) },
      ];
      if (hasVoice(person.id)) e.push({ label: '🔊 Пусни глас', fn: () => playVoice(person.id) });
      return e;
    };
    if (!sel || sel === char) {
      this.select(person.id);
      this.showMenu(char.x, char.y - 150, voiceEntries());
      return;
    }
    this.showMenu(char.x, char.y - 150, [
      { label: '🤗 Прегърни', fn: () => this.hug(sel, char) },
      this.formAction(sel, char),
      ...voiceEntries().slice(hasVoice(person.id) ? 1 : 2), // only 🔊 for others
    ]);
  }

  private doRecordVoice(id: string) {
    recordVoice(
      id,
      3000,
      () => this.toast('Говори сега! 🎤 (3 секунди)'),
      () => {
        sfx.sparkle();
        this.toast('Гласът е записан! 🔊');
      },
      (msg) => this.toast(msg),
    );
  }

  private select(id: string, snap = false) {
    this.selectedId = id;
    this.registry.set('selected', this.characters.get(id)?.person ?? null);
    for (const [pid, char] of this.characters) char.setSelected(pid === id);
    // Selecting deliberately does NOT move the camera; only the initial
    // spawn snaps so the game doesn't open on an empty room.
    const char = this.characters.get(id);
    if (char && snap) this.cameras.main.centerOn(char.x, char.y);
  }

  private onOutfitChanged = (person: Person) => {
    dlog('outfit change');
    this.characters.get(person.id)?.setOutfit(person.outfit);
    savePeople(this.people);
  };

  private addPerson(sex: Sex) {
    const person = newPerson(sex);
    this.people.push(person);
    savePeople(this.people);
    const cam = this.cameras.main;
    const x = Phaser.Math.Clamp(cam.midPoint.x + 120, 60, WORLD_W - 60);
    const char = this.spawnCharacter(person, x, this.bandFor(cam.midPoint.y).bottom - 60);
    char.setAlpha(0);
    this.tweens.add({ targets: char, alpha: 1, duration: 400 });
    this.select(person.id);
  }

  // ---------- transformation ----------

  private applyForm(form: Form) {
    const char = this.selected;
    if (!char) return;
    char.person.form = form;
    savePeople(this.people);
    // Flash + lightning at the machine
    const flash = this.add
      .rectangle(char.x, char.y - 64, 260, 300, 0x9ff2ea, 0.9)
      .setDepth(1700);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      onComplete: () => flash.destroy(),
    });
    for (let i = 0; i < 4; i++) {
      const bolt = this.add
        .text(char.x + Phaser.Math.Between(-70, 70), char.y - 120 + Phaser.Math.Between(-60, 60), '⚡', {
          fontSize: '36px',
        })
        .setOrigin(0.5)
        .setDepth(1701)
        .setAlpha(0);
      this.tweens.add({
        targets: bolt,
        alpha: { from: 1, to: 0 },
        delay: i * 110,
        duration: 420,
        onComplete: () => bolt.destroy(),
      });
    }
    char.refreshForm();
    const def = FORM_DEFS.find((f) => f.id === form);
    this.toast(`✨ Превръщане: ${def?.toastName ?? form}!`);
  }

  // ---------- pets ----------

  private spawnPet(data: PetData, x: number, y: number) {
    const pet = new Pet(this, x, y, data, {
      bands: BAND.map((b) => ({ ...b })),
      left: 40,
      right: WORLD_W - 40,
      stairsX: [...STAIRS_XS],
      stairsY: [...STAIR_Y],
      requestMischief: () => {
        const intact = this.breakables.filter((b) => !b.broken);
        if (intact.length === 0 || Math.random() < 0.3) return null;
        const b = Phaser.Math.RND.pick(intact);
        return {
          x: b.standX + Phaser.Math.Between(-20, 20),
          y: b.standY,
          doBreak: () => {
            b.breakIt();
            sfx.crash();
            this.toast(`${data.name} счупи нещо! Докосни ❗, за да го поправиш.`);
          },
        };
      },
      requestFood: () => {
        if (!this.bowlFull) return null;
        return {
          x: GAME_W + 640,
          y: 600 + GAME_H,
          eat: () => {
            this.setBowl(false);
            sfx.munch();
            this.addCoins(REWARDS.feedPet, GAME_W + 660, 560 + GAME_H);
            this.toast(`${data.name} хапна вкусно! 😋`);
          },
        };
      },
    });
    pet.on('pointerdown', () => {
      if (pet.carriedBy) {
        // Put the pet down at the carrier's feet
        const char = this.characters.get(pet.carriedBy);
        pet.setCarried(null);
        if (char) {
          pet.setPosition(char.x + (char.facing === 'left' ? -50 : 50), char.y);
          pet.setDepth(pet.y);
        }
        return;
      }
      const entries = [
        {
          label: '❤️ Погали',
          fn: () => {
            if (data.kind === 'cat') sfx.meow();
            else sfx.woof();
            pet.pet();
          },
        },
        {
          label: '🙌 Вдигни',
          fn: () => {
            const char = this.selected;
            if (!char) return;
            this.routeTo(char, pet.x + 40, pet.y, () => {
              if (!pet.carriedBy) pet.setCarried(char.person.id);
            });
          },
        },
      ];
      this.showMenu(pet.x, pet.y - 90, entries);
    });
    this.pets.set(data.id, pet);
    return pet;
  }

  private addPet(kind: PetKind) {
    const data = newPet(kind);
    this.petList.push(data);
    savePets(this.petList);
    const cam = this.cameras.main;
    const x = Phaser.Math.Clamp(cam.midPoint.x - 140, 60, WORLD_W - 60);
    const pet = this.spawnPet(data, x, this.bandFor(cam.midPoint.y).bottom - 50);
    pet.setAlpha(0);
    this.tweens.add({ targets: pet, alpha: 1, duration: 400 });
    this.toast(`${kind === 'cat' ? 'Котето' : 'Кучето'} ${data.name} се нанесе! 🎉`);
  }

  // ---------- needs ----------

  private tickNeeds() {
    const now = this.time.now;
    for (const [id, char] of this.characters) {
      if (this.away.has(id)) continue;
      const n = this.needs.get(id)!;
      n.hunger = Math.max(0, n.hunger - 0.35);
      if (char.isLying) {
        n.energy = Math.min(100, n.energy + 8);
      } else {
        n.energy = Math.max(0, n.energy - 0.25);
      }
      if (now - n.lastBubble > 9000) {
        let emoji: string | null = null;
        if (n.hunger < 25) emoji = '🍎';
        else if (n.energy < 25) emoji = '💤';
        if (emoji && !char.isLying) {
          n.lastBubble = now;
          if (emoji === '🍎') sfx.hungry();
          else sfx.sleepy();
          const t = this.add
            .text(char.x, char.y - 150, emoji, { fontSize: '30px' })
            .setOrigin(0.5)
            .setDepth(1500);
          this.tweens.add({
            targets: t,
            y: t.y - 30,
            alpha: { from: 1, to: 0 },
            duration: 2400,
            onComplete: () => t.destroy(),
          });
        }
      }
    }
  }

  // ---------- front door ----------

  private buildDoor() {
    this.doorG = this.add.graphics().setDepth(400);
    this.drawDoor(false);
    const hit = this.add.zone(DOOR_X, GAME_H + 430, 130, 270).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.useDoor());
  }

  private drawDoor(open: boolean) {
    const g = this.doorG;
    const yo = GAME_H;
    g.clear();
    // Frame
    g.fillStyle(0x6e563d).fillRect(DOOR_X - 62, yo + 296, 124, 260);
    if (open) {
      g.fillStyle(0x2d2438).fillRect(DOOR_X - 50, yo + 308, 100, 244);
      g.fillStyle(0xf7e9a0, 0.25).fillRect(DOOR_X - 50, yo + 308, 26, 244);
    } else {
      g.fillStyle(0x9a6b45).fillRect(DOOR_X - 50, yo + 308, 100, 244);
      g.fillStyle(0x82573a).fillRoundedRect(DOOR_X - 36, yo + 326, 72, 92, 6);
      g.fillStyle(0x82573a).fillRoundedRect(DOOR_X - 36, yo + 436, 72, 92, 6);
      g.fillStyle(0xf2d94e).fillCircle(DOOR_X + 34, yo + 440, 7); // knob
    }
  }

  private useDoor() {
    const char = this.selected;
    if (char) {
      // Selected character leaves the house
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, DOOR_X, GAME_H + 585, () => {
        sfx.door();
        this.drawDoor(true);
        this.tweens.add({
          targets: char,
          alpha: 0,
          y: char.y - 30,
          duration: 500,
          onComplete: () => {
            char.setVisible(false);
            char.disableInteractive();
            this.away.add(char.person.id);
            this.toast(`${this.formLabel(char.person)} излезе навън 🌳`);
            this.time.delayedCall(600, () => this.drawDoor(false));
            // Hand selection to someone still home
            const present = this.people.find((p) => !this.away.has(p.id));
            if (present) this.select(present.id);
            else this.registry.set('selected', null);
          },
        });
      });
      return;
    }
    // Nobody (selectable) home: bring the first away character back
    const returningId = [...this.away][0];
    if (!returningId) return;
    const char2 = this.characters.get(returningId)!;
    this.comeHome(char2);
  }

  private comeHome(char: Character) {
    sfx.door();
    this.drawDoor(true);
    this.away.delete(char.person.id);
    char.setPosition(DOOR_X, GAME_H + 585);
    char.setAlpha(0);
    char.setVisible(true);
    char.setInteractive(
      new Phaser.Geom.Rectangle(-18, -60, 36, 62),
      Phaser.Geom.Rectangle.Contains,
    );
    this.tweens.add({
      targets: char,
      alpha: 1,
      duration: 400,
      onComplete: () => {
        this.time.delayedCall(400, () => this.drawDoor(false));
        char.walkTo(DOOR_X + 220, GAME_H + 640);
        this.select(char.person.id);
      },
    });
  }

  private formLabel(p: Person): string {
    return p.sex === 'm' ? 'Едно момче' : 'Едно момиче';
  }

  // ---------- UI hooks handled by UIScene ----------

  // ---------- interactions ----------

  private menu?: Phaser.GameObjects.Container;
  private menuJustOpened = false;

  private closeMenu() {
    this.menu?.destroy();
    this.menu = undefined;
  }

  private showMenu(x: number, y: number, entries: { label: string; fn: () => void }[]) {
    this.closeMenu();
    this.menuJustOpened = true; // survive this tap's own pointerup
    const menu = this.add.container(x, y).setDepth(2500);
    entries.forEach((e, i) => {
      const btn = this.add
        .text(0, i * 58, e.label, {
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#4b3a63',
        })
        .setOrigin(0.5)
        .setPadding(16, 8, 16, 8)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.closeMenu();
        e.fn();
      });
      menu.add(btn);
    });
    this.menu = menu;
  }

  private hug(a: Character, b: Character) {
    if (b.isLying) this.wakeUp(b);
    const side = a.x < b.x ? -1 : 1;
    this.routeTo(a, b.x + side * 55, b.y, () => {
      a.face(b.x);
      b.face(a.x);
      sfx.hug();
      this.taskProgress('hug');
      a.pulse();
      b.pulse();
      for (let i = 0; i < 5; i++) {
        const h = this.add
          .text((a.x + b.x) / 2 + Phaser.Math.Between(-30, 30), b.y - 130 - i * 8, '❤️', {
            fontSize: '26px',
          })
          .setOrigin(0.5)
          .setDepth(1600)
          .setAlpha(0);
        this.tweens.add({
          targets: h,
          alpha: { from: 1, to: 0 },
          y: h.y - 60,
          delay: i * 140,
          duration: 1100,
          onComplete: () => h.destroy(),
        });
      }
    });
  }

  /** Cartoon gulp: the lizard swallows the other character... and spits them back out. */
  private gobble(eater: Character, meal: Character) {
    if (meal.isLying) this.wakeUp(meal);
    const side = eater.x < meal.x ? -1 : 1;
    this.routeTo(eater, meal.x + side * 55, meal.y, () => {
      eater.face(meal.x);
      sfx.gulp();
      this.tweens.add({
        targets: meal,
        scaleX: 0,
        scaleY: 0,
        x: eater.x,
        duration: 350,
        ease: 'back.in',
        onComplete: () => {
          meal.setVisible(false);
          eater.pulse();
          // A few seconds later: ptooey!
          this.time.delayedCall(2500, () => {
            meal.setPosition(eater.x - side * 90, eater.y);
            meal.setVisible(true);
            sfx.boing();
            this.tweens.add({
              targets: meal,
              scaleX: 2,
              scaleY: 2,
              duration: 380,
              ease: 'back.out',
            });
            this.sparkle(meal.x, meal.y - 60);
            meal.setDepth(meal.y);
          });
        },
      });
    });
  }

  /** Each transformation's signature move; which one is set in config/content.ts. */
  private formAction(a: Character, b: Character): { label: string; fn: () => void } {
    const action = FORM_DEFS.find((f) => f.id === a.person.form)?.action ?? 'five';
    const table: Record<string, { label: string; fn: () => void }> = {
      eat: { label: '😋 Изяж', fn: () => this.gobble(a, b) },
      scare: { label: '😱 Стресни', fn: () => this.scare(a, b) },
      boop: { label: '🐽 Бооп', fn: () => this.boop(a, b) },
      charge: { label: '💨 Блъсни', fn: () => this.charge(a, b) },
      levitate: { label: '🛸 Левитирай', fn: () => this.levitate(a, b) },
      bless: { label: '🌈 Дъга', fn: () => this.bless(a, b) },
      shrink: { label: '✨ Смали', fn: () => this.shrink(a, b) },
      hop: { label: '🐰 Подскок', fn: () => this.hopTogether(a, b) },
      baa: { label: '🐑 Беее', fn: () => this.baa(a, b) },
      five: { label: '🖐 Дай пет', fn: () => this.highFive(a, b) },
    };
    return table[action] ?? table.five;
  }

  /** Rabbit: both friends bounce together. */
  private hopTogether(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.boing();
      for (const c of [a, b]) {
        this.tweens.add({
          targets: c,
          y: c.y - 60,
          duration: 260,
          yoyo: true,
          repeat: 2,
          ease: 'quad.out',
        });
      }
      this.floatEmoji((a.x + b.x) / 2, b.y - 170, '🐰', 34);
    });
  }

  /** Sheep: a big fluffy BAAA that makes the friend giggle. */
  private baa(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.meow();
      this.floatEmoji(a.x, a.y - 160, 'БЕЕЕ! 🐑', 30);
      this.time.delayedCall(500, () => {
        this.floatEmoji(b.x, b.y - 150, '😂', 34);
        b.pulse();
      });
    });
  }

  /** Walk a next to b, face each other, then run the payoff. */
  private approach(a: Character, b: Character, fn: () => void) {
    if (b.isLying) this.wakeUp(b);
    const side = a.x < b.x ? -1 : 1;
    this.routeTo(a, b.x + side * 55, b.y, () => {
      a.face(b.x);
      b.face(a.x);
      fn();
    });
  }

  private floatEmoji(x: number, y: number, emoji: string, size = 30) {
    const t = this.add.text(x, y, emoji, { fontSize: `${size}px` }).setOrigin(0.5).setDepth(1600);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 1300, onComplete: () => t.destroy() });
  }

  private highFive(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.pop();
      a.pulse();
      b.pulse();
      this.floatEmoji((a.x + b.x) / 2, b.y - 150, '🖐', 36);
      this.floatEmoji((a.x + b.x) / 2, b.y - 180, '⭐', 26);
    });
  }

  private scare(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.boing();
      this.floatEmoji(b.x, b.y - 160, '😱', 38);
      b.pulse();
      // Runs away screaming, instantly at full speed
      const away = b.x + (b.x >= a.x ? 1 : -1) * Phaser.Math.Between(400, 700);
      const bb = this.bandFor(b.y);
      b.flee(Phaser.Math.Clamp(away, 60, WORLD_W - 60), Phaser.Math.Between(bb.top, bb.bottom));
    });
  }

  private boop(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.munch();
      this.floatEmoji(b.x, b.y - 160, '🐽', 34);
      this.time.delayedCall(400, () => this.floatEmoji(b.x, b.y - 150, '😂', 34));
      b.pulse();
    });
  }

  private charge(a: Character, b: Character) {
    if (b.isLying) this.wakeUp(b);
    const side = a.x < b.x ? 1 : -1;
    this.routeTo(a, b.x - side * 260, b.y, () => {
      a.face(b.x);
      sfx.whoosh();
      this.tweens.add({
        targets: a,
        x: b.x - side * 60,
        duration: 260,
        ease: 'quad.in',
        onComplete: () => {
          sfx.crash();
          this.floatEmoji(b.x, b.y - 160, '💥', 40);
          // b flies across the room and lands dizzy
          const landX = Phaser.Math.Clamp(b.x + side * 340, 60, WORLD_W - 60);
          this.tweens.add({
            targets: b,
            x: landX,
            angle: side * 360,
            duration: 700,
            ease: 'quad.out',
            onComplete: () => {
              b.setAngle(0);
              this.floatEmoji(landX, b.y - 160, '💫', 32);
            },
          });
        },
      });
    });
  }

  private levitate(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.whoosh();
      this.floatEmoji(b.x, b.y - 190, '🛸', 36);
      const groundY = b.y;
      this.tweens.chain({
        targets: b,
        tweens: [
          { y: groundY - 170, angle: 360, duration: 900, ease: 'sine.out' },
          { y: groundY - 170, angle: 720, duration: 700 },
          { y: groundY, angle: 1080, duration: 700, ease: 'bounce.out' },
        ],
        onComplete: () => {
          b.setAngle(0);
          b.setDepth(groundY);
        },
      });
    });
  }

  private bless(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.sparkle();
      // Little rainbow arc over the friend
      const colors = [0xd4453e, 0xf2a13e, 0xf2d94e, 0x7fb069, 0x4a7fd4, 0xb08ed9];
      const arc = this.add.graphics().setDepth(1600);
      colors.forEach((c, i) => {
        arc.lineStyle(6, c, 0.9);
        arc.beginPath();
        arc.arc(b.x, b.y - 90, 78 - i * 7, Math.PI, 0, false);
        arc.strokePath();
      });
      this.tweens.add({ targets: arc, alpha: 0, delay: 1400, duration: 700, onComplete: () => arc.destroy() });
      this.sparkle(b.x, b.y - 80);
      b.pulse();
      this.floatEmoji(b.x, b.y - 180, '🌈', 36);
    });
  }

  private shrink(a: Character, b: Character) {
    this.approach(a, b, () => {
      sfx.sparkle();
      this.sparkle(b.x, b.y - 60);
      const back = b.scaleX;
      this.tweens.add({
        targets: b,
        scaleX: back * 0.45,
        scaleY: back * 0.45,
        duration: 500,
        ease: 'back.in',
        onComplete: () => {
          this.floatEmoji(b.x, b.y - 60, '✨', 26);
          this.time.delayedCall(3500, () => {
            this.tweens.add({ targets: b, scaleX: back, scaleY: back, duration: 500, ease: 'back.out' });
            this.sparkle(b.x, b.y - 60);
          });
        },
      });
    });
  }

  // ---------- breakables & fixing ----------

  private buildBreakables() {
    const make = (x: number, y: number, kind: 'plant' | 'trash' | 'toybox') => {
      const b = new Breakable(this, x, y, kind, (br) => this.goFix(br));
      this.breakables.push(b);
    };
    make(700, GAME_H + 500, 'plant'); // living room
    make(GAME_W + 560, GAME_H + 498, 'trash'); // kitchen
    make(470, 500, 'toybox'); // bedroom (upstairs)
    make(660, 500, 'plant'); // bedroom
  }

  private goFix(b: Breakable) {
    const char = this.selected;
    if (!char || this.fixing) return;
    if (char.isLying) this.wakeUp(char);
    this.fixing = true;
    this.routeTo(char, b.standX, b.standY, () => {
      const ring = this.add.graphics().setDepth(1600);
      const state = { t: 0 };
      this.tweens.add({
        targets: state,
        t: 1,
        duration: 1400,
        onUpdate: () => {
          ring.clear();
          ring.lineStyle(7, 0xffd166, 1);
          ring.beginPath();
          ring.arc(char.x, char.y - 150, 24, -Math.PI / 2, -Math.PI / 2 + state.t * Math.PI * 2);
          ring.strokePath();
        },
        onComplete: () => {
          ring.destroy();
          b.fix();
          this.fixing = false;
          this.taskProgress('fix');
          sfx.sparkle();
          this.addCoins(REWARDS.fixMess, b.x, b.y - 60);
          this.sparkle(b.x, b.y);
        },
      });
    });
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const s = this.add
        .text(x + Phaser.Math.Between(-40, 40), y + Phaser.Math.Between(-30, 20), '✨', {
          fontSize: '24px',
        })
        .setOrigin(0.5)
        .setDepth(1600)
        .setAlpha(0);
      this.tweens.add({
        targets: s,
        alpha: { from: 1, to: 0 },
        y: s.y - 40,
        delay: i * 90,
        duration: 800,
        onComplete: () => s.destroy(),
      });
    }
  }

  // ---------- gifts ----------

  private dropGift() {
    dlog('gift drop');
    const x = Phaser.Math.Between(200, WORLD_W - 200);
    const gFloor = Phaser.Math.Between(0, 1);
    const gift = this.add
      .text(x, gFloor * GAME_H - 60, '🎁', { fontSize: '52px' })
      .setOrigin(0.5)
      .setDepth(1400)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: gift, y: gFloor * GAME_H + 620, duration: 900, ease: 'bounce.out' });
    sfx.gift();
    this.toast('Някъде в къщата се появи подарък! 🎁');

    gift.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, gift.x, this.bandFor(gift.y).bottom - 80, () => {
        gift.destroy();
        this.addCoins(REWARDS.gift, gift.x, 560);
        this.sparkle(gift.x, 600);
      });
    });
    this.time.delayedCall(30000, () => {
      if (gift.active) {
        this.tweens.add({ targets: gift, alpha: 0, duration: 600, onComplete: () => gift.destroy() });
      }
    });
  }

  // ---------- house drawing ----------

  private drawHouse() {
    if (!this.houseG) this.houseG = this.add.graphics().setDepth(-10);
    const g = this.houseG;
    g.clear();
    const theme = ROOM_THEMES[getActiveTheme()] ?? ROOM_THEMES.classic;
    // Theme wall-color index per room; -1 = the game room's fixed wood walls
    const wallIdx = [
      [2, 6, 3, -1], // upper: bedroom, bathroom, lab, game room
      [0, 1, 4, 5], // ground: living, kitchen, grown-up, puzzle
    ];

    for (let f = 0; f < FLOORS; f++) {
      const yTop = f * GAME_H;
      for (let r = 0; r < ROOMS; r++) {
        const x0 = r * GAME_W;
        const wi = wallIdx[f][r];
        const col = wi < 0 ? 0xd8c8a8 : theme.walls[wi % theme.walls.length];
        g.fillStyle(col).fillRect(x0, yTop, GAME_W, WALL_H);
        g.fillStyle(0xffffff, 0.14);
        for (let x = x0 + 30; x < x0 + GAME_W; x += 90) g.fillRect(x, yTop, 26, 548);
      }
      g.fillStyle(theme.floor).fillRect(0, yTop + WALL_H, WORLD_W, GAME_H - WALL_H);
      g.lineStyle(2, theme.floorLine);
      for (let y = yTop + 600; y < yTop + GAME_H; y += 44) g.lineBetween(0, y, WORLD_W, y);
      g.fillStyle(theme.baseboard).fillRect(0, yTop + 548, WORLD_W, 14);
      g.fillStyle(theme.divider);
      for (let r = 1; r < ROOMS; r++) {
        g.fillRect(r * GAME_W - 10, yTop, 20, 400);
        g.fillRect(r * GAME_W - 16, yTop + 390, 32, 14);
      }
    }

    // Staircases connecting the floors
    for (const sx of STAIRS_XS) {
      g.fillStyle(0x7a5f42).fillRect(sx - 72, 620, 144, 810);
      g.fillStyle(0x9a7a58);
      for (let y = 700; y <= 1400; y += 44) g.fillRect(sx - 62, y, 124, 12);
      g.fillStyle(0x5c4530).fillRect(sx - 72, 620, 10, 810);
      g.fillStyle(0x5c4530).fillRect(sx + 62, 620, 10, 810);
    }
  }

  private buildLivingRoom() {
    const yo = GAME_H;
    const g = this.add.graphics();

    // Window with sky
    g.fillStyle(0x8a6f52).fillRoundedRect(160, yo + 90, 260, 200, 10);
    g.fillStyle(0xa8dcf0).fillRoundedRect(172, yo + 102, 236, 176, 6);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(230, yo + 150, 22).fillCircle(260, yo + 142, 28).fillCircle(290, yo + 152, 20);
    g.fillStyle(0x8a6f52).fillRect(284, yo + 102, 12, 176).fillRect(172, yo + 182, 236, 12);

    // Rug
    g.fillStyle(0xd96b5b, 0.9).fillEllipse(512, yo + 660, 340, 110);
    g.fillStyle(0xe8907f, 0.9).fillEllipse(512, yo + 660, 250, 76);

    // Sofa
    g.fillStyle(0x5f8f6d).fillRoundedRect(430, yo + 420, 260, 110, 18);
    g.fillStyle(0x6fa57e).fillRoundedRect(442, yo + 400, 110, 60, 12);
    g.fillStyle(0x6fa57e).fillRoundedRect(568, yo + 400, 110, 60, 12);
    g.fillStyle(0x4a7355).fillRect(440, yo + 520, 18, 22).fillRect(662, yo + 520, 18, 22);

    // TV on a stand (tap to switch on/off)
    g.fillStyle(0x8a6f52).fillRoundedRect(790, yo + 470, 170, 60, 8);
    g.fillStyle(0x2b2b33).fillRoundedRect(800, yo + 330, 150, 140, 8);
    this.tvScreen = this.add.rectangle(875, yo + 398, 130, 104, 0x14141a).setDepth(1);
    const tvHit = this.add.zone(875, yo + 430, 180, 210).setInteractive({ useHandCursor: true });
    tvHit.on('pointerdown', () => this.toggleTV());

    // Picture frame
    g.fillStyle(0x8a6f52).fillRoundedRect(470, yo + 130, 120, 96, 8);
    g.fillStyle(0xbfe3b4).fillRect(480, yo + 140, 100, 76);
    g.fillStyle(0x7fb069).fillTriangle(490, yo + 216, 530, yo + 168, 566, yo + 216);
    g.fillStyle(0xf7d154).fillCircle(556, yo + 158, 12);
  }

  private toggleTV() {
    this.tvOn = !this.tvOn;
    if (this.tvOn) this.taskProgress('tv');
    sfx.pop();
    this.tvScreen.setFillStyle(this.tvOn ? 0x9fd8ef : 0x14141a);
    if (this.tvOn) {
      this.tweens.add({
        targets: this.tvScreen,
        alpha: { from: 0.75, to: 1 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
    } else {
      this.tweens.killTweensOf(this.tvScreen);
      this.tvScreen.setAlpha(1);
    }
  }

  private buildKitchen() {
    const x0 = GAME_W;
    const yo = GAME_H;
    const g = this.add.graphics();

    g.fillStyle(0x8a6f52).fillRoundedRect(x0 + 120, yo + 100, 220, 170, 10);
    g.fillStyle(0xa8dcf0).fillRoundedRect(x0 + 132, yo + 112, 196, 146, 6);
    g.fillStyle(0x8a6f52).fillRect(x0 + 222, yo + 112, 12, 146);

    g.fillStyle(0xb0b7c4).fillRect(x0 + 60, yo + 430, 460, 24);
    g.fillStyle(0x7e8796).fillRect(x0 + 70, yo + 454, 440, 96);
    g.fillStyle(0x5d6673);
    g.fillCircle(x0 + 180, yo + 502, 7).fillCircle(x0 + 300, yo + 502, 7).fillCircle(x0 + 420, yo + 502, 7);
    g.fillStyle(0xdfe6ee).fillRoundedRect(x0 + 240, yo + 408, 120, 22, 6);
    g.fillStyle(0x9aa3b0).fillRect(x0 + 292, yo + 386, 10, 26);

    g.fillStyle(0x4a4f58).fillRect(x0 + 380, yo + 410, 110, 20);
    g.fillStyle(0x2f333a).fillCircle(x0 + 410, yo + 420, 12).fillCircle(x0 + 460, yo + 420, 12);
    const cookHint = this.add.text(x0 + 435, yo + 375, '🍳', { fontSize: '30px' }).setOrigin(0.5).setDepth(2);
    this.tweens.add({ targets: cookHint, y: yo + 363, yoyo: true, repeat: -1, duration: 900, ease: 'sine.inout' });
    const stoveHit = this.add.zone(x0 + 435, yo + 470, 130, 160).setInteractive({ useHandCursor: true });
    stoveHit.on('pointerdown', () => this.goCook());

    g.fillStyle(0xe8ecf1).fillRoundedRect(x0 + 800, yo + 330, 130, 230, 10);
    g.fillStyle(0xcdd4dc).fillRect(x0 + 800, yo + 410, 130, 8);
    g.fillStyle(0x9aa3b0).fillRoundedRect(x0 + 910, yo + 360, 8, 34, 4).fillRoundedRect(x0 + 910, yo + 430, 8, 44, 4);
    const fridgeHit = this.add.zone(x0 + 865, yo + 445, 150, 250).setInteractive({ useHandCursor: true });
    fridgeHit.on('pointerdown', () => this.goSnack(x0 + 760, yo + 590));

    g.fillStyle(0x9a6b45).fillEllipse(x0 + 620, yo + 640, 190, 60);
    g.fillStyle(0x8a5f3d).fillRect(x0 + 610, yo + 640, 20, 70);

    this.bowlG = this.add.graphics().setDepth(560 + yo);
    this.drawBowl();
    const bowlHit = this.add.zone(x0 + 660, yo + 600, 90, 60).setInteractive({ useHandCursor: true });
    bowlHit.on('pointerdown', () => this.goFillBowl());
  }

  private drawBowl() {
    const x = GAME_W + 660;
    const y = GAME_H + 604;
    this.bowlG.clear();
    this.bowlG.fillStyle(0xd45c5c).fillEllipse(x, y, 64, 22);
    this.bowlG.fillStyle(0xb84848).fillEllipse(x, y - 4, 56, 16);
    if (this.bowlFull) {
      this.bowlG.fillStyle(0x9a6b3d).fillEllipse(x, y - 6, 46, 12);
      this.bowlG.fillStyle(0x7d552f);
      this.bowlG.fillCircle(x - 10, y - 8, 4).fillCircle(x + 4, y - 10, 4).fillCircle(x + 12, y - 6, 4);
    }
  }

  private setBowl(full: boolean) {
    this.bowlFull = full;
    this.drawBowl();
  }

  private goFillBowl() {
    const char = this.selected;
    if (!char || this.bowlFull) return;
    if (char.isLying) this.wakeUp(char);
    this.routeTo(char, GAME_W + 610, GAME_H + 600, () => {
      this.setBowl(true);
      this.taskProgress('bowl');
      sfx.pop();
      this.toast('Купичката е пълна! Гладните любимци идват. 🐾');
    });
  }

  /** Feed a character; eating on a full stomach knocks them out on the spot. */
  private feed(char: Character) {
    const n = this.needs.get(char.person.id);
    const wasFull = (n?.hunger ?? 0) > 75;
    if (n) n.hunger = 100;
    if (!wasFull) return;
    this.toast('Ох, преяждане! Време за дрямка... 😴');
    sfx.sleepy();
    this.time.delayedCall(600, () => {
      if (char.isLying) return;
      char.lieDown();
      const zt = this.time.addEvent({
        delay: 900,
        repeat: 6,
        callback: () => {
          const z = this.add
            .text(char.x + 36, char.y - 70, 'z', { fontSize: '28px', color: '#4a4a6a', fontStyle: 'bold' })
            .setDepth(1500);
          this.tweens.add({ targets: z, y: z.y - 60, x: z.x + 20, alpha: 0, duration: 1600, onComplete: () => z.destroy() });
        },
      });
      this.time.delayedCall(6500, () => {
        zt.remove();
        if (char.isLying && this.bedOccupant !== char.person.id) char.standUp();
      });
    });
  }

  private goSnack(x: number, y: number) {
    const char = this.selected;
    if (!char) return;
    if (char.isLying) this.wakeUp(char);
    this.routeTo(char, x, y, () => {
      this.feed(char);
      sfx.munch();
      const food = this.add
        .text(char.x + 30, char.y - 130, Phaser.Math.RND.pick(['🍎', '🥕', '🧀', '🍪', '🥛']), {
          fontSize: '40px',
        })
        .setDepth(1500);
      this.tweens.add({
        targets: food,
        y: food.y - 60,
        alpha: { from: 1, to: 0 },
        duration: 1400,
        ease: 'sine.out',
        onComplete: () => food.destroy(),
      });
    });
  }

  private buildBedroom() {
    const x0 = 0;
    const g = this.add.graphics();

    g.fillStyle(0x8a6f52).fillRoundedRect(x0 + 560, 100, 220, 170, 10);
    g.fillStyle(0xa8dcf0).fillRoundedRect(x0 + 572, 112, 196, 146, 6);
    g.fillStyle(0xb08ed9).fillRect(x0 + 572, 112, 40, 146).fillRect(x0 + 728, 112, 40, 146);

    g.fillStyle(0x9ec5e8, 0.9).fillEllipse(x0 + 470, 660, 300, 100);

    const bed = this.add.container(x0 + 850, 470);
    const bg = this.add.graphics();
    bg.fillStyle(0x9a6b45).fillRoundedRect(-110, -40, 220, 130, 12);
    bg.fillStyle(0xffffff).fillRoundedRect(-100, -34, 200, 80, 10);
    bg.fillStyle(0x6ea4d4).fillRoundedRect(-100, 2, 200, 60, 10);
    bg.fillStyle(0xf2f2f2).fillRoundedRect(-92, -30, 70, 34, 8);
    bed.add(bg);
    bed.setDepth(430);
    bed.setSize(220, 170);
    bed.setInteractive({ useHandCursor: true });
    bed.on('pointerdown', () => this.goNap());

    const dresser = this.add.container(x0 + 130, 470);
    const dg = this.add.graphics();
    dg.fillStyle(0x9a6b45).fillRoundedRect(-85, -70, 170, 150, 10);
    dg.fillStyle(0xb98a5e).fillRoundedRect(-73, -58, 146, 40, 6);
    dg.fillStyle(0xb98a5e).fillRoundedRect(-73, -10, 146, 40, 6);
    dg.fillStyle(0xb98a5e).fillRoundedRect(-73, 38, 146, 34, 6);
    dg.fillStyle(0x5c3d24);
    dg.fillCircle(0, -38, 7).fillCircle(0, 10, 7).fillCircle(0, 55, 6);
    dresser.add(dg);
    const hint = this.add.text(0, -100, '👕', { fontSize: '34px' }).setOrigin(0.5);
    dresser.add(hint);
    this.tweens.add({ targets: hint, y: -112, yoyo: true, repeat: -1, duration: 900, ease: 'sine.inout' });
    dresser.setDepth(430);
    dresser.setSize(170, 210);
    dresser.setInteractive({ useHandCursor: true });
    dresser.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, x0 + 260, 580, () => this.launchOverlay('wardrobe'));
    });
  }

  private buildLab() {
    const x0 = GAME_W * 2;
    const g = this.add.graphics();

    // Lab decorations: shelf with bubbling flasks
    g.fillStyle(0x8a6f52).fillRect(x0 + 560, 180, 300, 14);
    g.fillStyle(0x74d8a0, 0.9).fillRoundedRect(x0 + 590, 130, 40, 50, 8);
    g.fillStyle(0xd874b8, 0.9).fillRoundedRect(x0 + 660, 118, 34, 62, 8);
    g.fillStyle(0x74a9d8, 0.9).fillRoundedRect(x0 + 720, 140, 46, 40, 8);
    g.fillStyle(0xf2d94e, 0.9).fillCircle(x0 + 812, 158, 22);

    // Warning stripes floor mat
    g.fillStyle(0xf2d94e).fillRect(x0 + 330, 556, 340, 20);
    g.fillStyle(0x2b2b33);
    for (let i = 0; i < 8; i++) g.fillRect(x0 + 336 + i * 42, 556, 22, 20);

    // The transformation machine: a glass capsule
    const mx = x0 + 500;
    const machine = this.add.container(mx, 400);
    const mg = this.add.graphics();
    mg.fillStyle(0x3e5668).fillRoundedRect(-130, 120, 260, 46, 12); // base
    mg.fillStyle(0x59e3d8, 0.28).fillRoundedRect(-95, -160, 190, 290, 90); // glass
    mg.lineStyle(6, 0x59e3d8, 0.9).strokeRoundedRect(-95, -160, 190, 290, 90);
    mg.fillStyle(0x3e5668).fillRoundedRect(-110, -205, 220, 55, 16); // cap
    mg.fillStyle(0xf2d94e).fillCircle(-70, -178, 9);
    mg.fillStyle(0x74d8a0).fillCircle(-35, -178, 9);
    mg.fillStyle(0xd874b8).fillCircle(0, -178, 9);
    mg.fillStyle(0x74a9d8).fillCircle(35, -178, 9);
    mg.fillStyle(0xe8907f).fillCircle(70, -178, 9);
    machine.add(mg);
    const bolt = this.add.text(0, -230, '⚡', { fontSize: '40px' }).setOrigin(0.5);
    machine.add(bolt);
    this.tweens.add({ targets: bolt, y: -244, yoyo: true, repeat: -1, duration: 800, ease: 'sine.inout' });
    machine.setDepth(430);
    machine.setSize(280, 420);
    machine.setInteractive({ useHandCursor: true });
    machine.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, mx, 560, () => {
        sfx.whoosh();
        this.launchOverlay('transform');
      });
    });
  }

  private buildGrownUpRoom() {
    const x0 = GAME_W * 2;
    const yo = GAME_H;
    const g = this.add.graphics();

    // Sign
    const sign = this.add
      .text(x0 + 512, yo + 70, '🚫🧒  СТАЯ ЗА ВЪЗРАСТНИ  🧑‍💼', {
        fontSize: '34px',
        color: '#5c4a32',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    sign.setDepth(2);

    // Diploma on the wall
    g.fillStyle(0x8a6f52).fillRoundedRect(x0 + 150, yo + 130, 110, 86, 6);
    g.fillStyle(0xfff8e8).fillRect(x0 + 158, yo + 138, 94, 70);
    g.fillStyle(0xd4453e).fillCircle(x0 + 232, yo + 194, 9);

    // Desk with laptop
    g.fillStyle(0x9a6b45).fillRect(x0 + 120, yo + 470, 300, 20);
    g.fillStyle(0x8a5f3d).fillRect(x0 + 135, yo + 490, 16, 66).fillRect(x0 + 390, yo + 490, 16, 66);
    g.fillStyle(0x4a4f58).fillRect(x0 + 190, yo + 414, 90, 56);
    g.fillStyle(0x9fd8ef).fillRect(x0 + 196, yo + 420, 78, 44);
    g.fillStyle(0x3a3f48).fillRect(x0 + 180, yo + 468, 110, 8);

    // Bookshelf — psst: the three green books hide a secret...
    g.fillStyle(0x8a6f52).fillRect(x0 + 700, yo + 150, 220, 300);
    const greenBooks: { x: number; y: number }[] = [];
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = yo + 190 + shelf * 90;
      g.fillStyle(0x6e563d).fillRect(x0 + 708, sy + 52, 204, 10);
      const cols = [0xd4453e, 0x4a7fd4, 0x7fb069, 0xf2d94e, 0xb08ed9];
      for (let b = 0; b < 5; b++) {
        const bx = x0 + 716 + b * 40;
        g.fillStyle(cols[(shelf + b) % cols.length]).fillRect(bx, sy, 30, 52);
        if ((shelf + b) % cols.length === 2) greenBooks.push({ x: bx, y: sy });
      }
    }
    const found = new Set<number>();
    const glows: Phaser.GameObjects.Rectangle[] = [];
    let resetTimer: Phaser.Time.TimerEvent | undefined;
    const resetBooks = () => {
      found.clear();
      glows.forEach((gl) => gl.setFillStyle(0xf2ffb0, 0));
    };
    greenBooks.forEach((book, i) => {
      const glow = this.add.rectangle(book.x + 15, book.y + 26, 34, 56, 0xf2ffb0, 0).setDepth(3);
      glows.push(glow);
      const zone = this.add.zone(book.x + 15, book.y + 26, 34, 56).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (found.has(i)) return;
        found.add(i);
        sfx.pop();
        glow.setFillStyle(0xf2ffb0, 0.55);
        resetTimer?.remove();
        if (found.size === 3) {
          sfx.transform();
          this.cameras.main.flash(400, 242, 255, 176);
          this.time.delayedCall(450, () => {
            this.launchOverlay('market');
            resetBooks();
          });
        } else {
          // Forget the combination after a while
          resetTimer = this.time.delayedCall(15000, resetBooks);
        }
      });
    });

    // Coffee machine (tap for coffee = full energy!)
    g.fillStyle(0x4a4f58).fillRoundedRect(x0 + 470, yo + 400, 90, 90, 10);
    g.fillStyle(0x2f333a).fillRect(x0 + 485, yo + 430, 60, 30);
    g.fillStyle(0xd4453e).fillCircle(x0 + 515, yo + 416, 7);
    g.fillStyle(0xfff8e8).fillRoundedRect(x0 + 498, yo + 462, 34, 24, 4);
    const coffeeHit = this.add.zone(x0 + 515, yo + 445, 120, 130).setInteractive({ useHandCursor: true });
    coffeeHit.on('pointerdown', () => this.goCoffee(x0 + 515, yo + 590));
  }

  private goCoffee(x: number, y: number) {
    const char = this.selected;
    if (!char) return;
    if (char.isLying) this.wakeUp(char);
    this.routeTo(char, x, y, () => {
      const n = this.needs.get(char.person.id);
      if (n) n.energy = 100;
      sfx.munch();
      this.taskProgress('coffee');
      const cup = this.add
        .text(char.x + 30, char.y - 130, '☕', { fontSize: '40px' })
        .setDepth(1500);
      this.tweens.add({
        targets: cup,
        y: cup.y - 60,
        alpha: { from: 1, to: 0 },
        duration: 1400,
        onComplete: () => cup.destroy(),
      });
    });
  }

  private buildPuzzleRoom() {
    const x0 = GAME_W * 3;
    const yo = GAME_H;
    const g = this.add.graphics();

    // Sign
    this.add
      .text(x0 + 512, yo + 70, '🧩 СТАЯ С ПЪЗЕЛИ 🧩', { fontSize: '34px', color: '#8a6f2e', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);

    // Framed mini-photos on the wall (the puzzle motifs)
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x8a6f52).fillRoundedRect(x0 + 150 + i * 250, yo + 140, 130, 160, 8);
      const photo = this.add.image(x0 + 215 + i * 250, yo + 220, puzzleKeys[i % puzzleKeys.length]);
      photo.setDisplaySize(110, 140).setDepth(1);
    }

    // Alphabet rug
    g.fillStyle(0x9ec5e8, 0.85).fillEllipse(x0 + 320, yo + 660, 300, 100);
    this.add.text(x0 + 320, yo + 660, 'ABC', { fontSize: '40px', color: '#4a6a8a', fontStyle: 'bold' })
      .setOrigin(0.5).setAlpha(0.6).setDepth(1);

    // Puzzle table (tap to play)
    const table = this.add.container(x0 + 660, yo + 470);
    const tg = this.add.graphics();
    tg.fillStyle(0x9a6b45).fillRoundedRect(-130, -30, 260, 90, 12);
    tg.fillStyle(0x8a5f3d).fillRect(-118, 60, 18, 40).fillRect(100, 60, 18, 40);
    // A few colorful puzzle pieces on the tabletop
    tg.fillStyle(0xd4453e).fillRoundedRect(-90, -14, 40, 40, 8);
    tg.fillStyle(0x4a7fd4).fillRoundedRect(-40, -18, 40, 40, 8);
    tg.fillStyle(0x7fb069).fillRoundedRect(12, -10, 40, 40, 8);
    tg.fillStyle(0xf2d94e).fillRoundedRect(60, -16, 40, 40, 8);
    table.add(tg);
    const hint = this.add.text(0, -70, '🧩', { fontSize: '34px' }).setOrigin(0.5);
    table.add(hint);
    this.tweens.add({ targets: hint, y: -84, yoyo: true, repeat: -1, duration: 900, ease: 'sine.inout' });
    table.setDepth(yo + 430);
    table.setSize(280, 160);
    table.setInteractive({ useHandCursor: true });
    table.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, x0 + 660, yo + 590, () => this.launchOverlay('puzzle'));
    });
  }

  // ---------- ingredients & cooking ----------

  private dropIngredient() {
    if (this.ingredientCount >= 4) return;
    dlog('ingredient drop');
    this.ingredientCount++;
    const x = Phaser.Math.Between(150, WORLD_W - 150);
    const iFloor = Phaser.Math.Between(0, 1);
    const item = this.add
      .text(x, iFloor * GAME_H + Phaser.Math.Between(600, 700), Phaser.Math.RND.pick(['🍅', '🥔', '🥕', '🧀', '🥚', '🍄']), {
        fontSize: '34px',
      })
      .setOrigin(0.5)
      .setDepth(600)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: item, alpha: 1, duration: 500 });
    item.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      const ib = this.bandFor(item.y);
      this.routeTo(char, item.x, Phaser.Math.Clamp(item.y, ib.top, ib.bottom), () => {
        if (!item.active) return;
        item.destroy();
        this.ingredientCount--;
        this.registry.set('basket', (this.registry.get('basket') ?? 0) + 1);
        this.taskProgress('ingredient');
        sfx.pop();
        const t = this.add
          .text(char.x, char.y - 150, '+1 🧺', { fontSize: '26px', color: '#a8e6a0', fontStyle: 'bold' })
          .setOrigin(0.5)
          .setDepth(1600);
        this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
      });
    });
  }

  private goCook() {
    const char = this.selected;
    if (!char) return;
    const basket: number = this.registry.get('basket') ?? 0;
    if (basket < 3) {
      this.toast('Трябват 3 съставки за готвене! 🧺');
      sfx.deny();
      return;
    }
    if (this.meals.filter((m) => m.active).length >= 3) {
      this.toast('Масата е пълна с ястия! Първо ги изяжте 🍲');
      return;
    }
    if (char.isLying) this.wakeUp(char);
    this.routeTo(char, GAME_W + 430, GAME_H + 590, () => {
      this.registry.set('basket', basket - 3);
      sfx.sizzle();
      const steamT = this.time.addEvent({
        delay: 450,
        repeat: 5,
        callback: () => {
          const st = this.add
            .text(GAME_W + 435 + Phaser.Math.Between(-15, 15), GAME_H + 395, '☁️', { fontSize: '24px' })
            .setOrigin(0.5)
            .setDepth(1500);
          this.tweens.add({ targets: st, y: st.y - 50, alpha: 0, duration: 1200, onComplete: () => st.destroy() });
        },
      });
      this.time.delayedCall(3000, () => {
        steamT.remove();
        this.spawnMeal();
        sfx.sparkle();
        this.toast('Ястието е готово! 🍲');
        this.taskProgress('cook');
      });
    });
  }

  private spawnMeal() {
    const slot = this.meals.filter((m) => m.active).length;
    const meal = this.add
      .text(GAME_W + 560 + slot * 62, GAME_H + 618, '🍲', { fontSize: '34px' })
      .setOrigin(0.5)
      .setDepth(640)
      .setInteractive({ useHandCursor: true });
    meal.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, meal.x, GAME_H + 650, () => {
        if (!meal.active) return;
        meal.destroy();
        this.meals = this.meals.filter((m) => m.active);
        sfx.munch();
        this.feed(char);
        this.taskProgress('eat');
      });
    });
    this.meals.push(meal);
  }

  // ---------- bathroom ----------

  private buildBathroom() {
    const x0 = GAME_W;
    const g = this.add.graphics();

    // Wall tiles
    g.fillStyle(0xffffff, 0.25);
    for (let ty = 240; ty < 540; ty += 44) {
      for (let tx = 40; tx < GAME_W - 40; tx += 48) g.fillRect(x0 + tx, ty, 40, 36);
    }

    // Sink with mirror
    g.fillStyle(0xb8dce8).fillRoundedRect(x0 + 640, 140, 130, 150, 8);
    g.fillStyle(0xdff2f8).fillRoundedRect(x0 + 650, 150, 110, 130, 6);
    g.fillStyle(0xe8ecf1).fillRoundedRect(x0 + 620, 420, 170, 60, 12);
    g.fillStyle(0xcdd4dc).fillRect(x0 + 660, 480, 90, 70);
    g.fillStyle(0x9aa3b0).fillRect(x0 + 700, 400, 10, 24);

    // Bath mat + duck
    g.fillStyle(0x9ec5e8, 0.9).fillEllipse(x0 + 300, 655, 260, 90);
    this.add.text(x0 + 520, 600, '🦆', { fontSize: '30px' }).setOrigin(0.5).setDepth(560);

    // Towel hook
    g.fillStyle(0x8a6f52).fillRect(x0 + 430, 330, 8, 18);
    g.fillStyle(0xf2f2f2).fillRoundedRect(x0 + 408, 344, 52, 90, 8);
    g.fillStyle(0xd96b5b).fillRect(x0 + 408, 380, 52, 12);

    // Shower stall
    const sx = x0 + 220;
    g.fillStyle(0x8a9aa8).fillRect(sx - 90, 200, 12, 360); // pipes/frame
    g.fillStyle(0x8a9aa8).fillRect(sx + 78, 200, 12, 360);
    g.fillStyle(0x8a9aa8).fillRect(sx - 90, 200, 180, 12);
    g.fillStyle(0x9aa3b0).fillRect(sx - 8, 212, 16, 40); // shower pipe
    g.fillStyle(0xc8d4dc).fillEllipse(sx, 262, 56, 20); // shower head
    g.fillStyle(0xaee2f0, 0.25).fillRect(sx - 78, 212, 156, 348); // glass

    const hint = this.add.text(sx, 170, '🚿', { fontSize: '34px' }).setOrigin(0.5).setDepth(2);
    this.tweens.add({ targets: hint, y: 158, yoyo: true, repeat: -1, duration: 900, ease: 'sine.inout' });

    const showerHit = this.add.zone(sx, 400, 190, 380).setInteractive({ useHandCursor: true });
    showerHit.on('pointerdown', () => this.goBathe(sx, x0 + 434, 590));
  }

  /** Undress -> shower -> towel off -> dress again. */
  private goBathe(showerX: number, towelX: number, y: number) {
    const char = this.selected;
    if (!char || this.bathBusy) return;
    if (char.isLying) this.wakeUp(char);
    this.bathBusy = true;
    this.routeTo(char, showerX, y, () => {
      // 1) clothes off
      char.setBare(true);
      sfx.pop();
      this.floatEmoji(char.x, char.y - 160, '👕👖', 26);
      // 2) water on
      sfx.water();
      const dropsT = this.time.addEvent({
        delay: 90,
        repeat: 40,
        callback: () => {
          const d = this.add
            .circle(showerX + Phaser.Math.Between(-24, 24), 280, Phaser.Math.Between(2, 3), 0x9fd8ef, 0.8)
            .setDepth(1500);
          this.tweens.add({
            targets: d,
            y: char.y - 6,
            duration: Phaser.Math.Between(350, 500),
            onComplete: () => d.destroy(),
          });
        },
      });
      const bubblesT = this.time.addEvent({
        delay: 700,
        repeat: 4,
        callback: () => this.floatEmoji(char.x + Phaser.Math.Between(-30, 30), char.y - 110, '🫧', 26),
      });
      this.time.delayedCall(4200, () => {
        dropsT.remove();
        bubblesT.remove();
        // 3) towel off next to the hook
        char.walkTo(towelX, y, () => {
          const towel = this.add.graphics().setDepth(char.depth + 1);
          towel.fillStyle(0xf2f2f2).fillRoundedRect(char.x - 26, char.y - 96, 52, 62, 10);
          towel.fillStyle(0xd96b5b).fillRect(char.x - 26, char.y - 70, 52, 8);
          char.pulse();
          this.floatEmoji(char.x, char.y - 160, '💨', 28);
          this.time.delayedCall(1800, () => {
            towel.destroy();
            // 4) dress again
            char.setBare(false);
            sfx.sparkle();
            this.sparkle(char.x, char.y - 80);
            this.toast('Чист и свеж! ✨🛁');
            this.bathBusy = false;
            this.taskProgress('bath');
          });
        });
      });
    });
  }

  // ---------- game room ----------

  private buildGameRoom() {
    const x0 = GAME_W * 3;
    const g = this.add.graphics();

    this.add
      .text(x0 + 460, 70, '🎮 ИГРАЛНА ЗАЛА 🎮', { fontSize: '34px', color: '#6a5a3a', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);

    // Blackboard with a chalk problem (tap for the math game)
    g.fillStyle(0x8a6f52).fillRoundedRect(x0 + 120, 140, 360, 240, 10);
    g.fillStyle(0x2e4a3a).fillRoundedRect(x0 + 134, 154, 332, 212, 6);
    this.add
      .text(x0 + 300, 240, '2 + 3 = ?', { fontSize: '44px', color: '#e8f0e0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.add.text(x0 + 300, 300, '🧮', { fontSize: '30px' }).setOrigin(0.5).setDepth(2);
    // Desk
    g.fillStyle(0x9a6b45).fillRect(x0 + 180, 470, 240, 18);
    g.fillStyle(0x8a5f3d).fillRect(x0 + 195, 488, 14, 60).fillRect(x0 + 390, 488, 14, 60);
    const mathHit = this.add.zone(x0 + 300, 320, 380, 420).setInteractive({ useHandCursor: true });
    mathHit.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, x0 + 300, 600, () => {
        // A pet carried along becomes the math helper
        const helper = [...this.pets.values()].find((pt) => pt.carriedBy === char.person.id);
        this.registry.set('petHelper', helper ? helper.info.name : null);
        this.launchOverlay('math');
      });
    });

    // Whack-a-mole arcade cabinet
    g.fillStyle(0xd4453e).fillRoundedRect(x0 + 600, 300, 200, 260, 12);
    g.fillStyle(0x2b2b33).fillRoundedRect(x0 + 618, 322, 164, 120, 8);
    this.add.text(x0 + 700, 380, '🐹', { fontSize: '44px' }).setOrigin(0.5).setDepth(2);
    g.fillStyle(0xf2d94e).fillCircle(x0 + 650, 490, 14);
    g.fillStyle(0x4a7fd4).fillCircle(x0 + 700, 490, 14);
    g.fillStyle(0x7fb069).fillCircle(x0 + 750, 490, 14);
    const hint = this.add.text(x0 + 700, 270, '🔨', { fontSize: '32px' }).setOrigin(0.5).setDepth(2);
    this.tweens.add({ targets: hint, y: 258, yoyo: true, repeat: -1, duration: 900, ease: 'sine.inout' });
    const moleHit = this.add.zone(x0 + 700, 430, 220, 280).setInteractive({ useHandCursor: true });
    moleHit.on('pointerdown', () => {
      const char = this.selected;
      if (!char) return;
      if (char.isLying) this.wakeUp(char);
      this.routeTo(char, x0 + 700, 600, () => this.launchOverlay('mole'));
    });
  }

  // ---------- spiders ----------

  private spawnSpider() {
    if (this.spider) return;
    dlog('spider spawn');
    const sFloor = Phaser.Math.Between(0, 1);
    const sx = Phaser.Math.Between(150, WORLD_W - 200);
    const sy = sFloor * GAME_H + Phaser.Math.Between(240, 480);
    const spider = this.add
      .text(sx, sy, '🕷️', { fontSize: '40px' })
      .setOrigin(0.5)
      .setDepth(650)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });
    this.spider = spider;
    this.tweens.add({ targets: spider, alpha: 1, duration: 600 });
    const crawl = () => {
      if (!spider.active) return;
      this.tweens.add({
        targets: spider,
        x: Phaser.Math.Clamp(spider.x + Phaser.Math.Between(-120, 120), 100, WORLD_W - 100),
        y: Phaser.Math.Clamp(spider.y + Phaser.Math.Between(-60, 60), sFloor * GAME_H + 200, sFloor * GAME_H + 500),
        duration: Phaser.Math.Between(1200, 2200),
        onComplete: () => this.time.delayedCall(Phaser.Math.Between(400, 1500), crawl),
      });
    };
    crawl();
    spider.on('pointerdown', () => this.attackSpider());

    // The bat appears somewhere else in the house
    if (!this.batPickup && !this.batCarrier) {
      const bFloor = Phaser.Math.Between(0, 1);
      const bat = this.add
        .text(Phaser.Math.Between(200, WORLD_W - 200), bFloor * GAME_H + Phaser.Math.Between(620, 700), '🏏', {
          fontSize: '38px',
        })
        .setOrigin(0.5)
        .setDepth(600)
        .setInteractive({ useHandCursor: true });
      this.batPickup = bat;
      bat.on('pointerdown', () => {
        const char = this.selected;
        if (!char) return;
        if (char.isLying) this.wakeUp(char);
        const bb = this.bandFor(bat.y);
        this.routeTo(char, bat.x, Phaser.Math.Clamp(bat.y, bb.top, bb.bottom), () => {
          if (!bat.active) return;
          bat.destroy();
          this.batPickup = undefined;
          this.batCarrier = char.person.id;
          this.batIcon = this.add.text(char.x + 32, char.y - 130, '🏏', { fontSize: '34px' }).setOrigin(0.5).setDepth(1500);
          sfx.pop();
          this.toast('Бухалката е у теб! Удари паяка 🕷️');
        });
      });
    }
    sfx.deny();
    this.toast('Паяк се появи! Намери бухалката 🏏');
  }

  private attackSpider() {
    const spider = this.spider;
    if (!spider) return;
    if (!this.batCarrier) {
      sfx.deny();
      this.toast('Трябва ти бухалка! Потърси я някъде в къщата 🏏');
      return;
    }
    const char = this.characters.get(this.batCarrier);
    if (!char || this.away.has(this.batCarrier)) return;
    const sb = this.bandFor(spider.y);
    this.routeTo(char, spider.x, sb.top + 40, () => {
      if (!spider.active) return;
      // Swing!
      if (this.batIcon) {
        this.tweens.add({ targets: this.batIcon, angle: -120, duration: 150, yoyo: true });
      }
      sfx.crash();
      this.tweens.killTweensOf(spider);
      spider.setText('💫');
      this.tweens.add({
        targets: spider,
        y: sb.top + 100,
        angle: 360,
        alpha: 0,
        duration: 700,
        onComplete: () => {
          spider.destroy();
          this.spider = undefined;
        },
      });
      this.sparkle(spider.x, spider.y);
      this.addCoins(8, spider.x, spider.y - 40);
      this.toast('Паякът е победен! 🎉');
      this.batCarrier = null;
      this.batIcon?.destroy();
      this.batIcon = undefined;
    });
  }

  // ---------- secret tasks & the sky floor ----------

  private static TASK_POOL: { id: string; label: string; need: number }[] = [
    { id: 'bowl', label: 'Напълни купичката 🥣', need: 1 },
    { id: 'cook', label: 'Сготви ястие 🍳', need: 1 },
    { id: 'eat', label: 'Изяж ястие 🍲', need: 1 },
    { id: 'fix', label: 'Поправи нещо счупено 🔧', need: 1 },
    { id: 'bath', label: 'Изкъпи се 🛁', need: 1 },
    { id: 'puzzle', label: 'Реши пъзел 🧩', need: 1 },
    { id: 'math', label: 'Реши задачите по математика 🧮', need: 1 },
    { id: 'mole', label: 'Удари 5 къртици 🔨', need: 1 },
    { id: 'cartwheel', label: 'Направи 3 колела 🤸', need: 3 },
    { id: 'hug', label: 'Прегърни приятел 🤗', need: 1 },
    { id: 'nap', label: 'Дремни в леглото 🛏', need: 1 },
    { id: 'coffee', label: 'Изпий кафе ☕', need: 1 },
    { id: 'tv', label: 'Пусни телевизора 📺', need: 1 },
    { id: 'ingredient', label: 'Събери 3 съставки 🧺', need: 3 },
  ];

  private resetTasks() {
    const pool = Phaser.Utils.Array.Shuffle([...RoomScene.TASK_POOL]);
    this.tasks = pool.slice(0, 3).map((t) => ({ ...t, got: 0 }));
    this.publishTasks();
  }

  private publishTasks() {
    this.registry.set(
      'tasks',
      this.tasks.map((t) => ({ label: t.label, done: t.got >= t.need, got: t.got, need: t.need })),
    );
  }

  private taskProgress(id: string) {
    if (this.skyUnlocked) return;
    const t = this.tasks.find((x) => x.id === id && x.got < x.need);
    if (!t) return;
    t.got++;
    this.publishTasks();
    const done = this.tasks.filter((x) => x.got >= x.need).length;
    if (t.got >= t.need) {
      sfx.sparkle();
      this.toast(`✔ Тайна задача изпълнена! (${done}/3) 📋`);
    } else {
      this.toast(`📋 ${t.label}: ${t.got}/${t.need}`);
    }
    if (done === 3) this.unlockSky();
  }

  private unlockSky() {
    this.skyUnlocked = true;
    sfx.transform();
    this.cameras.main.flash(600, 255, 240, 180);
    this.toast('🌟 ТАЕН ЕТАЖ! Вълшебна стълба се появи в средата на къщата!');
    this.cameras.main.setBounds(0, -GAME_H, WORLD_W, WORLD_H + GAME_H);

    const keep = (o: Phaser.GameObjects.GameObject) => {
      this.skyObjects.push(o);
      return o;
    };
    const g = this.add.graphics().setDepth(-12);
    keep(g);
    // Night sky
    g.fillGradientStyle(0x0e1030, 0x0e1030, 0x2a2a55, 0x2a2a55, 1);
    g.fillRect(0, -GAME_H, WORLD_W, GAME_H - 208);
    for (let i = 0; i < 90; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.4, 1));
      g.fillCircle(Phaser.Math.Between(0, WORLD_W), Phaser.Math.Between(-GAME_H + 20, -280), Phaser.Math.Between(1, 3));
    }
    keep(this.add.text(600, -600, '🌙', { fontSize: '64px' }).setDepth(-11));
    // Rooftop terrace
    g.fillStyle(0x5a5f6e).fillRect(0, -208, WORLD_W, 208);
    g.lineStyle(2, 0x4a4f5e);
    for (let y = -170; y < 0; y += 44) g.lineBetween(0, y, WORLD_W, y);
    g.fillStyle(0x8a8f9e).fillRect(0, -218, WORLD_W, 12);
    // Railing
    g.lineStyle(5, 0x3a3f4e);
    for (let x = 30; x < WORLD_W; x += 90) g.lineBetween(x, -218, x, -290);
    g.lineStyle(6, 0x3a3f4e).lineBetween(0, -290, WORLD_W, -290);

    // Magic staircase (upper floor -> roof)
    const mg = this.add.graphics().setDepth(4);
    keep(mg);
    const cols = [0xd4453e, 0xf2a13e, 0xf2d94e, 0x7fb069, 0x4a7fd4, 0xb08ed9];
    mg.fillStyle(0x7a5f42, 0.35).fillRect(SKY_STAIRS_X - 72, -160, 144, 850);
    let ci = 0;
    for (let y = -120; y <= 660; y += 44) {
      mg.fillStyle(cols[ci++ % cols.length], 0.9).fillRect(SKY_STAIRS_X - 62, y, 124, 12);
    }
    const glowT = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (!this.skyUnlocked) return;
        this.sparkle(SKY_STAIRS_X + Phaser.Math.Between(-50, 50), Phaser.Math.Between(-100, 640));
      },
    });
    this.skyObjects.push({ destroy: () => glowT.remove() } as unknown as Phaser.GameObjects.GameObject);

    // Fireworks launcher
    const lg = this.add.graphics().setDepth(-11);
    keep(lg);
    lg.fillStyle(0xd4453e).fillRoundedRect(1860, -140, 120, 90, 8);
    lg.fillStyle(0x8a3a34).fillRect(1850, -60, 140, 14);
    for (let i = 0; i < 3; i++) {
      lg.fillStyle([0xf2d94e, 0x4a7fd4, 0x7fb069][i]).fillRect(1880 + i * 30, -190, 12, 56);
      lg.fillStyle(0x3a3a44).fillRect(1883 + i * 30, -202, 6, 14);
    }
    const hint = this.add.text(1920, -230, '🎆', { fontSize: '36px' }).setOrigin(0.5).setDepth(-11);
    keep(hint);
    this.tweens.add({ targets: hint, y: -246, yoyo: true, repeat: -1, duration: 800 });
    const hit = this.add.zone(1920, -130, 200, 220).setInteractive({ useHandCursor: true });
    keep(hit);
    hit.on('pointerdown', () => this.launchFireworks());
  }

  private launchFireworks() {
    const char = this.selected;
    if (!char || this.flying) return;
    if (char.isLying) this.wakeUp(char);
    this.flying = true;
    this.routeTo(char, 1990, -90, () => {
      // Firework show
      for (let i = 0; i < 6; i++) {
        this.time.delayedCall(i * 550, () => {
          sfx.firework();
          const fx = 1600 + Math.random() * 800;
          const fy = -GAME_H + 120 + Math.random() * 260;
          const rocket = this.add.circle(1920, -170, 4, 0xffe9a0).setDepth(-11);
          this.tweens.add({
            targets: rocket,
            x: fx,
            y: fy,
            duration: 450,
            onComplete: () => {
              rocket.destroy();
              const col = Phaser.Math.RND.pick([0xd4453e, 0xf2d94e, 0x4a7fd4, 0x7fb069, 0xb08ed9, 0xe8907f]);
              for (let p = 0; p < 14; p++) {
                const ang = (p / 14) * Math.PI * 2;
                const dot = this.add.circle(fx, fy, 4, col).setDepth(-11);
                this.tweens.add({
                  targets: dot,
                  x: fx + Math.cos(ang) * Phaser.Math.Between(60, 120),
                  y: fy + Math.sin(ang) * Phaser.Math.Between(60, 120) + 30,
                  alpha: 0,
                  duration: 900,
                  onComplete: () => dot.destroy(),
                });
              }
            },
          });
        });
      }
      // Then the character rides one into the sky...
      this.time.delayedCall(3600, () => {
        sfx.whoosh();
        const trail = this.time.addEvent({
          delay: 60,
          repeat: 20,
          callback: () => this.floatEmoji(char.x + Phaser.Math.Between(-10, 10), char.y + 20, '✨', 20),
        });
        char.setDepth(1600); // stay visible above the sky while rocketing up
        this.tweens.add({
          targets: char,
          y: -GAME_H - 200,
          duration: 1300,
          ease: 'quad.in',
          onComplete: () => {
            trail.remove();
            // ...and lands back on the ground floor
            const lx = Phaser.Math.Between(300, 900);
            char.setPosition(lx, GAME_H + 300);
            this.tweens.add({
              targets: char,
              y: GAME_H + 640,
              duration: 900,
              ease: 'bounce.out',
              onComplete: () => {
                char.setDepth(char.y);
                this.sparkle(char.x, char.y - 60);
                sfx.boing();
                this.flying = false;
                this.dismantleSky();
              },
            });
          },
        });
      });
    });
  }

  private dismantleSky() {
    this.skyUnlocked = false;
    this.skyObjects.forEach((o) => o.destroy());
    this.skyObjects = [];
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    // Anyone still on the vanished roof tumbles safely down to the ground floor
    for (const [id, other] of this.characters) {
      if (this.away.has(id) || other.y >= 0) continue;
      const lx = Phaser.Math.Between(300, WORLD_W - 300);
      other.setPosition(lx, GAME_H + 300);
      this.tweens.add({
        targets: other,
        y: GAME_H + 640,
        duration: 900,
        ease: 'bounce.out',
        onComplete: () => {
          other.setDepth(other.y);
          this.sparkle(other.x, other.y - 60);
        },
      });
    }
    this.resetTasks();
    this.toast('Тайният етаж изчезна... Нови тайни задачи в 📋!');
  }

  // ---------- bed interaction ----------

  private goNap() {
    const char = this.selected;
    if (!char || char.isLying || this.bedOccupant) return;
    const bedX = 850;
    this.routeTo(char, bedX - 120, 590, () => {
      // Claim the bed only on arrival — an interrupted walk must not
      // leave the bed reserved forever. Latecomer loses if it got taken.
      if (this.bedOccupant) return;
      this.bedOccupant = char.person.id;
      char.setPosition(bedX, 470);
      char.setDepth(500);
      char.lieDown();
      this.taskProgress('nap');
      this.zzzTimer = this.time.addEvent({
        delay: 900,
        loop: true,
        callback: () => this.spawnZ(char),
      });
    });
  }

  private wakeUp(char: Character) {
    const wasInBed = this.bedOccupant === char.person.id;
    if (char.isLying) {
      char.standUp();
      if (wasInBed) {
        char.setPosition(char.x - 120, 590);
        char.setDepth(char.y);
      }
    }
    if (wasInBed) {
      this.bedOccupant = null;
      this.zzzTimer?.remove();
      this.zzz.forEach((z) => z.destroy());
      this.zzz = [];
    }
  }

  private spawnZ(char: Character) {
    const z = this.add
      .text(char.x + 40, char.y - 60, 'z', {
        fontSize: '30px',
        color: '#4a4a6a',
        fontStyle: 'bold',
      })
      .setDepth(600);
    this.zzz.push(z);
    this.tweens.add({
      targets: z,
      y: z.y - 70,
      x: z.x + 24,
      alpha: 0,
      duration: 1800,
      onComplete: () => {
        z.destroy();
        this.zzz = this.zzz.filter((t) => t !== z);
      },
    });
  }
}

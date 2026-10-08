import Phaser from 'phaser';
import { Category, OPTIONS, Person, texturesFor } from './wardrobe';
import { isSecret, priceOf, saveUnlocks, unlockKey } from './economy';
import { sfx } from './sfx';
import { styledKey } from './settings';
import { ensureTextures } from './textureLoader';
import { GAME_W, GAME_H } from './RoomScene';

const PANEL_H = 430;
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'skin', label: 'Кожа' },
  { key: 'hair', label: 'Коса' },
  { key: 'shirt', label: 'Блузи' },
  { key: 'pants', label: 'Долнища' },
  { key: 'dress', label: 'Рокли' },
  { key: 'shoes', label: 'Обувки' },
  { key: 'jewelry', label: 'Бижута' },
  { key: 'hat', label: 'Шапки' },
];

// Preview frame: walk-down standing pose (row 2, col 0 in repacked sheets)
const PREVIEW_FRAME = 26;

// The scrollable list lives far below the visible world so only its own
// camera ever shows it.
const LIST_OFFSET_Y = 10000;

export class WardrobeScene extends Phaser.Scene {
  private category: Category = 'shirt';
  private tabButtons = new Map<Category, Phaser.GameObjects.Text>();
  private optionItems: Phaser.GameObjects.GameObject[] = [];
  // Options render in a far-away world region viewed through a dedicated
  // camera whose viewport is the list area — pixels physically cannot leak out.
  private optionsCam!: Phaser.Cameras.Scene2D.Camera;
  private baseScrollY = 0;
  private scrollOff = 0;
  private scrollMax = 0;
  private scrolled = false; // true while this gesture is a scroll, not a tap

  constructor() {
    super('wardrobe');
  }

  create() {
    // Scene instances persist across stop/launch: drop references from the
    // previous open or setColor would touch destroyed text objects.
    this.tabButtons.clear();
    this.optionItems = [];
    const top = GAME_H - PANEL_H;

    // Panel background
    const g = this.add.graphics();
    g.fillStyle(0x2e2438, 0.97).fillRoundedRect(-20, top, GAME_W + 40, PANEL_H + 20, 24);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(GAME_W / 2 - 30, top + 10, 60, 6, 3);

    // Swallow taps on the panel so they don't reach the room
    this.add.zone(GAME_W / 2, top + PANEL_H / 2, GAME_W, PANEL_H).setInteractive();

    // Scrollable options area (below the tabs), clipped by a viewport camera
    const viewTop = top + 76;
    const viewH = GAME_H - viewTop - 8;
    this.baseScrollY = LIST_OFFSET_Y + viewTop;
    this.optionsCam = this.cameras.add(0, viewTop, GAME_W, viewH);
    this.optionsCam.setScroll(0, this.baseScrollY);

    // Drag to scroll (and mouse wheel on desktop)
    let dragStartY = 0;
    let scrollStart = 0;
    let dragging = false;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.scrolled = false;
      dragging = pointer.y > viewTop;
      dragStartY = pointer.y;
      scrollStart = this.scrollOff;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !dragging) return;
      const dy = pointer.y - dragStartY;
      if (Math.abs(dy) > 12) this.scrolled = true;
      if (this.scrolled) this.setScroll(scrollStart - dy);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.setScroll(this.scrollOff + dy * 0.6);
    });

    // Close button
    const close = this.add
      .text(GAME_W - 46, top + 40, '✕', { fontSize: '34px', color: '#ffffff' })
      .setOrigin(0.5)
      .setPadding(14)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.scene.stop());

    // Category tabs (skip empty categories, e.g. dresses for boys)
    const person = this.registry.get('selected') as Person | null;
    const visible = CATEGORIES.filter((c) => !person || OPTIONS[person.sex][c.key].length > 0);
    visible.forEach((cat, i) => {
      const tab = this.add
        .text(28 + i * 104, top + 40, cat.label, {
          fontSize: '19px',
          color: '#bdb3cc',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
        .setPadding(10, 10, 10, 10)
        .setInteractive({ useHandCursor: true });
      tab.on('pointerdown', () => this.setCategory(cat.key));
      this.tabButtons.set(cat.key, tab);
    });

    if (person && OPTIONS[person.sex][this.category].length === 0) this.category = 'shirt';
    this.setCategory(this.category);
  }

  private setScroll(v: number) {
    this.scrollOff = Phaser.Math.Clamp(v, 0, this.scrollMax);
    this.optionsCam.setScroll(0, this.baseScrollY + this.scrollOff);
  }

  private get person(): Person | null {
    return this.registry.get('selected') ?? null;
  }

  private setCategory(cat: Category) {
    this.category = cat;
    for (const [key, tab] of this.tabButtons) {
      tab.setColor(key === cat ? '#ffd166' : '#bdb3cc');
    }
    this.renderOptions();
  }

  private renderOptions() {
    this.optionItems.forEach((o) => o.destroy());
    this.optionItems = [];
    const person = this.person;
    if (!person) return;

    const cat = this.category;

    const top = GAME_H - PANEL_H;
    const unlocks: Set<string> = this.registry.get('unlocks') ?? new Set();
    const options = OPTIONS[person.sex][cat].filter(
      (o) => !isSecret(cat, o) || unlocks.has(unlockKey(cat, o)),
    );

    // Lazy-load this category's sheets, then render
    const needed = options.flatMap((o) => texturesFor(person.sex, cat, o)).map((k) => styledKey(k));
    if (needed.some((k) => !this.textures.exists(k))) {
      const wait = this.add
        .text(GAME_W / 2, top + 200, '⏳ Зареждане...', { fontSize: '28px', color: '#bdb3cc' })
        .setOrigin(0.5);
      this.optionItems.push(wait);
      const catAtRequest = cat;
      ensureTextures(this, needed, () => {
        if (this.scene.isActive() && this.category === catAtRequest) this.renderOptions();
      });
      return;
    }
    const size = 72;
    const gap = 8;
    const perRow = Math.floor((GAME_W - 60) / (size + gap));
    const startX = 60 + size / 2;

    options.forEach((option, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * (size + gap);
      const y = LIST_OFFSET_Y + top + 116 + row * (size + gap + 4);
      const selected = person.outfit[cat] === option;

      const g = this.add.graphics();
      g.fillStyle(selected ? 0xffd166 : 0x453a55, 1).fillRoundedRect(
        x - size / 2,
        y - size / 2,
        size,
        size,
        14,
      );
      g.fillStyle(0x362c44, 1).fillRoundedRect(
        x - size / 2 + 4,
        y - size / 2 + 4,
        size - 8,
        size - 8,
        11,
      );
      this.optionItems.push(g);

      const locked = this.isLocked(option);

      if (option === 'none') {
        const label = this.add
          .text(x, y, '∅', { fontSize: '36px', color: '#8d80a0' })
          .setOrigin(0.5);
        this.optionItems.push(label);
      } else {
        // Live sprite preview of just this layer (skin previews show head over body)
        for (const tex of texturesFor(person.sex, cat, option)) {
          const preview = this.add.sprite(x, y, styledKey(tex), PREVIEW_FRAME).setScale(1.1);
          if (locked) preview.setAlpha(0.45);
          this.optionItems.push(preview);
        }
      }

      if (locked) {
        const price = this.add
          .text(x, y + size / 2 - 12, `🔒${priceOf(this.category, option)}`, {
            fontSize: '18px',
            color: '#ffd166',
            backgroundColor: '#2e2438',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setPadding(6, 2, 6, 2);
        this.optionItems.push(price);
      }

      const hit = this.add.zone(x, y, size, size).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (!this.scrolled) this.pick(option, x, y);
      });
      this.optionItems.push(hit);
    });

    // How far the list may scroll
    const rows = Math.ceil(options.length / perRow);
    const contentBottom = top + 116 + (rows - 1) * (size + gap + 4) + size / 2 + 10;
    this.scrollMax = Math.max(0, contentBottom - (GAME_H - 8));
    this.setScroll(this.scrollOff);
  }

  private isLocked(option: string): boolean {
    if (priceOf(this.category, option) === 0) return false;
    const unlocks: Set<string> = this.registry.get('unlocks') ?? new Set();
    return !unlocks.has(unlockKey(this.category, option));
  }

  private pick(option: string, x: number, y: number) {
    const person = this.person;
    if (!person) return;

    if (this.isLocked(option)) {
      const price = priceOf(this.category, option);
      const coins: number = this.registry.get('coins') ?? 0;
      if (coins >= price) {
        const unlocks: Set<string> = this.registry.get('unlocks') ?? new Set();
        unlocks.add(unlockKey(this.category, option));
        this.registry.set('unlocks', unlocks);
        saveUnlocks(unlocks);
        this.registry.set('coins', coins - price);
        this.game.events.emit('coins-spent');
        sfx.chaching();
      } else {
        // Can't afford: shake a "need more coins" hint
        const hint = this.add
          .text(x, y - 60, `Трябват 🪙${price}`, {
            fontSize: '22px',
            color: '#ff8f8f',
            backgroundColor: '#2e2438',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setPadding(8, 4, 8, 4);
        sfx.deny();
        this.tweens.add({
          targets: hint,
          x: { from: x - 6, to: x + 6 },
          yoyo: true,
          repeat: 3,
          duration: 50,
          onComplete: () => {
            this.tweens.add({ targets: hint, alpha: 0, delay: 700, duration: 300, onComplete: () => hint.destroy() });
          },
        });
        return;
      }
    }

    person.outfit = { ...person.outfit, [this.category]: option };
    if (priceOf(this.category, option) === 0) sfx.pop();
    this.game.events.emit('outfit-changed', person);
    this.renderOptions(); // refresh selection highlight
  }
}

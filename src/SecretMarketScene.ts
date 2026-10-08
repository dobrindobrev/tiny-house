import Phaser from 'phaser';
import { Category, OPTIONS, Person, texturesFor } from './wardrobe';
import { isSecret, priceOf, saveUnlocks, SECRET_ITEMS, unlockKey } from './economy';
import { sfx } from './sfx';
import { styledKey } from './settings';
import { ensureTextures } from './textureLoader';

const GAME_W = 1024;
const GAME_H = 768;
const PREVIEW_FRAME = 26;

/** Hidden shop reached via the green-books easter egg. */
export class SecretMarketScene extends Phaser.Scene {
  constructor() {
    super('market');
  }

  create() {
    const person: Person | null = this.registry.get('selected');
    if (!person) {
      this.scene.stop();
      return;
    }

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x140b1e, 0.96).setInteractive();

    this.add
      .text(GAME_W / 2, 60, '🤫 ТАЕН ПАЗАР 🤫', {
        fontSize: '44px',
        color: '#d9a72e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, 110, 'Шшшт... свръхредки съкровища, само срещу жълтици!', {
        fontSize: '22px',
        color: '#a893c2',
      })
      .setOrigin(0.5);

    const close = this.add
      .text(GAME_W - 46, 50, '✕', { fontSize: '38px', color: '#ffffff' })
      .setOrigin(0.5)
      .setPadding(14)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.scene.stop());

    this.renderItems(person);
  }

  private renderItems(person: Person) {
    // Everything below the header is rebuilt on each purchase
    const items: { cat: Category; option: string }[] = [];
    for (const cat of Object.keys(SECRET_ITEMS) as Category[]) {
      for (const option of SECRET_ITEMS[cat]) {
        if (OPTIONS[person.sex][cat]?.includes(option)) items.push({ cat, option });
      }
    }

    const needed = items.flatMap(({ cat, option }) => texturesFor(person.sex, cat, option)).map((k) => styledKey(k));
    if (needed.some((k) => !this.textures.exists(k))) {
      const wait = this.add
        .text(GAME_W / 2, 300, '⏳ Зареждане...', { fontSize: '28px', color: '#a893c2' })
        .setOrigin(0.5);
      ensureTextures(this, needed, () => {
        if (this.scene.isActive()) {
          wait.destroy();
          this.renderItems(person);
        }
      });
      return;
    }

    const size = 108;
    const gap = 18;
    const perRow = 7;
    const startX = GAME_W / 2 - ((size + gap) * perRow - gap) / 2 + size / 2;
    const unlocks: Set<string> = this.registry.get('unlocks') ?? new Set();

    items.forEach(({ cat, option }, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * (size + gap);
      const y = 210 + row * (size + gap + 18);
      const owned = unlocks.has(unlockKey(cat, option));

      const g = this.add.graphics();
      g.fillStyle(owned ? 0x2e5c3a : 0x3d2a55, 1).fillRoundedRect(x - size / 2, y - size / 2, size, size, 16);
      g.fillStyle(0x1f1430, 1).fillRoundedRect(x - size / 2 + 5, y - size / 2 + 5, size - 10, size - 10, 13);

      for (const tex of texturesFor(person.sex, cat, option)) {
        this.add.sprite(x, y, styledKey(tex), PREVIEW_FRAME).setScale(1.5);
      }

      const label = owned ? '✓ купено' : `🪙${priceOf(cat, option)}`;
      this.add
        .text(x, y + size / 2 + 14, label, {
          fontSize: '19px',
          color: owned ? '#7fd894' : '#ffd166',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      const hit = this.add.zone(x, y, size + 6, size + 26).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.pick(person, cat, option, x, y));
    });
  }

  private pick(person: Person, cat: Category, option: string, x: number, y: number) {
    const unlocks: Set<string> = this.registry.get('unlocks') ?? new Set();
    const key = unlockKey(cat, option);

    if (!unlocks.has(key)) {
      const price = priceOf(cat, option);
      const coins: number = this.registry.get('coins') ?? 0;
      if (coins < price) {
        sfx.deny();
        const hint = this.add
          .text(x, y - 70, `Трябват 🪙${price}`, {
            fontSize: '22px',
            color: '#ff8f8f',
            backgroundColor: '#140b1e',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setPadding(8, 4, 8, 4);
        this.tweens.add({
          targets: hint,
          x: { from: x - 6, to: x + 6 },
          yoyo: true,
          repeat: 3,
          duration: 50,
          onComplete: () => {
            this.tweens.add({ targets: hint, alpha: 0, delay: 600, duration: 300, onComplete: () => hint.destroy() });
          },
        });
        return;
      }
      unlocks.add(key);
      this.registry.set('unlocks', unlocks);
      saveUnlocks(unlocks);
      this.registry.set('coins', coins - price);
      this.game.events.emit('coins-spent');
      sfx.chaching();
    } else {
      sfx.pop();
    }

    // Equip immediately — half the fun
    person.outfit = { ...person.outfit, [cat]: option };
    this.game.events.emit('outfit-changed', person);
    this.scene.restart();
  }
}

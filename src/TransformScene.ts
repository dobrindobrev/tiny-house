import Phaser from 'phaser';
import {
  FORMS,
  formBodyTexture,
  formHasWings,
  formHeadTexture,
  Person,
  texturesFor,
} from './wardrobe';
import { sfx } from './sfx';
import { styledKey } from './settings';
import { ensureTextures } from './textureLoader';

const GAME_W = 1024;
const GAME_H = 768;
const PANEL_H = 560;
const PREVIEW_FRAME = 26;
const PER_ROW = 5;

/** Bottom panel with the transformation machine's form choices. */
export class TransformScene extends Phaser.Scene {
  constructor() {
    super('transform');
  }

  create() {
    const top = GAME_H - PANEL_H;
    const person: Person | null = this.registry.get('selected');
    if (!person) {
      this.scene.stop();
      return;
    }

    const g = this.add.graphics();
    g.fillStyle(0x1d3040, 0.97).fillRoundedRect(-20, top, GAME_W + 40, PANEL_H + 20, 24);
    g.fillStyle(0x59e3d8, 0.25).fillRoundedRect(GAME_W / 2 - 30, top + 10, 60, 6, 3);

    this.add.zone(GAME_W / 2, top + PANEL_H / 2, GAME_W, PANEL_H).setInteractive();

    this.add
      .text(GAME_W / 2, top + 42, '⚡ Машина за трансформации ⚡', {
        fontSize: '30px',
        color: '#59e3d8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const close = this.add
      .text(GAME_W - 46, top + 40, '✕', { fontSize: '34px', color: '#ffffff' })
      .setOrigin(0.5)
      .setPadding(14)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.scene.stop());

    const size = 118;
    const gapX = 66;
    const gapY = 36;
    const startX = GAME_W / 2 - ((size + gapX) * PER_ROW - gapX) / 2 + size / 2;

    // Lazy-load all form preview sheets first
    const [humanBody0, humanHead0] = texturesFor(person.sex, 'skin', person.outfit.skin);
    const previewKeys: string[] = [humanBody0, humanHead0, 'wings_bg'];
    for (const f of FORMS) {
      const pv: Person = { ...person, form: f.id };
      const h = formHeadTexture(pv);
      const b = formBodyTexture(pv);
      if (h) previewKeys.push(h);
      if (b) previewKeys.push(b);
    }
    if (previewKeys.some((k) => !this.textures.exists(styledKey(k)))) {
      const wait = this.add
        .text(GAME_W / 2, top + 200, '⏳ Зареждане...', { fontSize: '26px', color: '#8fb8c8' })
        .setOrigin(0.5);
      ensureTextures(this, previewKeys.map((k) => styledKey(k)), () => {
        if (this.scene.isActive()) this.scene.restart();
      });
      return;
    }
    FORMS.forEach((form, i) => {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      const x = startX + col * (size + gapX);
      const y = top + 140 + row * (size + gapY);
      const selected = person.form === form.id;

      const tile = this.add.graphics();
      tile.fillStyle(selected ? 0x59e3d8 : 0x2c4a60, 1).fillRoundedRect(x - size / 2, y - size / 2 + 10, size, size - 20, 18);
      tile.fillStyle(0x1a2c3c, 1).fillRoundedRect(x - size / 2 + 5, y - size / 2 + 15, size - 10, size - 30, 14);

      // Full-body preview: body + head (+ wings for the fairy)
      const preview: Person = { ...person, form: form.id };
      const [humanBody, humanHead] = texturesFor(person.sex, 'skin', person.outfit.skin);
      if (formHasWings(form.id)) this.add.sprite(x, y - 16, styledKey('wings_bg'), PREVIEW_FRAME).setScale(1.35);
      this.add.sprite(x, y - 16, styledKey(formBodyTexture(preview) || humanBody), PREVIEW_FRAME).setScale(1.35);
      this.add.sprite(x, y - 16, styledKey(formHeadTexture(preview) || humanHead), PREVIEW_FRAME).setScale(1.35);
      if (form.id === 'unicorn') {
        const horn = this.add.graphics();
        horn.fillStyle(0xf2c94e).fillTriangle(x - 5, y - 52, x + 5, y - 52, x, y - 76);
      }

      this.add
        .text(x, y + 52, `${form.emoji} ${form.label}`, { fontSize: '19px', color: '#cfe8f2' })
        .setOrigin(0.5);

      const hit = this.add.zone(x, y, size + gapX - 8, size).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        sfx.transform();
        this.game.events.emit('form-chosen', form.id);
        this.scene.stop();
      });
    });
  }
}

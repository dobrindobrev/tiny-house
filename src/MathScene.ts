import Phaser from 'phaser';
import { sfx } from './sfx';

const GAME_W = 1024;
const GAME_H = 768;
const ROUNDS = 5;
const REWARD = 3;

/** Math mini-game: 5 problems, coins per correct answer. A carried pet helps. */
export class MathScene extends Phaser.Scene {
  private round = 0;
  private correct = 0;
  private items: Phaser.GameObjects.GameObject[] = [];
  private helperShown = false;

  constructor() {
    super('math');
  }

  create() {
    this.round = 0;
    this.correct = 0;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x14231a, 0.96).setInteractive();
    this.add
      .text(GAME_W / 2, 70, '🧮 МАТЕМАТИКА', { fontSize: '44px', color: '#8fd894', fontStyle: 'bold' })
      .setOrigin(0.5);
    const helper: string | null = this.registry.get('petHelper');
    if (helper) {
      this.add
        .text(GAME_W / 2, 122, `🐾 ${helper} ще ти подсказва!`, { fontSize: '24px', color: '#c8e8c0' })
        .setOrigin(0.5);
    }
    const close = this.add
      .text(GAME_W - 46, 50, '✕', { fontSize: '38px', color: '#ffffff' })
      .setOrigin(0.5)
      .setPadding(14)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.scene.stop());
    this.nextRound();
  }

  private nextRound() {
    this.items.forEach((i) => i.destroy());
    this.items = [];
    this.helperShown = false;
    if (this.round >= ROUNDS) {
      this.finish();
      return;
    }
    this.round++;

    // Build a problem: +, - or small ×
    const kind = Phaser.Math.RND.pick(['+', '+', '-', '×']);
    let a: number, b: number, answer: number;
    if (kind === '+') {
      a = Phaser.Math.Between(2, 12);
      b = Phaser.Math.Between(1, 8);
      answer = a + b;
    } else if (kind === '-') {
      a = Phaser.Math.Between(5, 18);
      b = Phaser.Math.Between(1, a - 1);
      answer = a - b;
    } else {
      a = Phaser.Math.Between(2, 5);
      b = Phaser.Math.Between(2, 5);
      answer = a * b;
    }

    const progress = this.add
      .text(GAME_W / 2, 170, `${this.round} / ${ROUNDS}`, { fontSize: '22px', color: '#7aa87e' })
      .setOrigin(0.5);
    const problem = this.add
      .text(GAME_W / 2, 270, `${a} ${kind} ${b} = ?`, { fontSize: '84px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.items.push(progress, problem);

    // 4 answers, one correct
    const answers = new Set<number>([answer]);
    while (answers.size < 4) {
      const wrong = answer + Phaser.Math.Between(-5, 5);
      if (wrong !== answer && wrong >= 0) answers.add(wrong);
    }
    const opts = Phaser.Utils.Array.Shuffle([...answers]);
    opts.forEach((val, i) => {
      const x = GAME_W / 2 + (i % 2 === 0 ? -160 : 160);
      const y = 430 + Math.floor(i / 2) * 150;
      const tile = this.add
        .text(x, y, String(val), {
          fontSize: '52px',
          color: '#ffffff',
          backgroundColor: '#2e5c3a',
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5)
        .setPadding(44, 20, 44, 20)
        .setInteractive({ useHandCursor: true });
      tile.on('pointerdown', () => {
        if (val === answer) {
          sfx.coin();
          this.correct++;
          this.game.events.emit('earn-coins', REWARD);
          const yay = this.add
            .text(x, y - 80, `✅ +${REWARD} 🪙`, { fontSize: '30px', color: '#ffd166', fontStyle: 'bold' })
            .setOrigin(0.5);
          this.items.push(yay);
          this.time.delayedCall(700, () => this.nextRound());
        } else {
          sfx.deny();
          this.tweens.add({ targets: tile, x: { from: x - 8, to: x + 8 }, yoyo: true, repeat: 3, duration: 50 });
        }
      });
      this.items.push(tile);

      // The carried pet paws at the right answer after a moment
      if (val === answer && this.registry.get('petHelper')) {
        this.time.delayedCall(3000, () => {
          if (this.helperShown || !tile.active) return;
          this.helperShown = true;
          const paw = this.add.text(x + 90, y - 40, '🐾', { fontSize: '34px' }).setOrigin(0.5);
          this.tweens.add({ targets: paw, y: y - 55, yoyo: true, repeat: -1, duration: 500 });
          this.items.push(paw);
        });
      }
    });
  }

  private finish() {
    sfx.sparkle();
    if (this.correct >= 3) this.game.events.emit('minigame-done', 'math');
    this.add
      .text(GAME_W / 2, GAME_H / 2, `🏆 ${this.correct} от ${ROUNDS} верни!`, {
        fontSize: '54px',
        color: '#ffd166',
        fontStyle: 'bold',
        backgroundColor: '#14231a',
      })
      .setOrigin(0.5)
      .setPadding(30, 16, 30, 16);
    this.time.delayedCall(2200, () => this.scene.stop());
  }
}

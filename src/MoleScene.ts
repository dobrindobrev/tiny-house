import Phaser from 'phaser';
import { sfx } from './sfx';

const GAME_W = 1024;
const GAME_H = 768;
const PLAY_MS = 25000;

/** Whack-a-mole: bonk as many moles as possible, earn coins. */
export class MoleScene extends Phaser.Scene {
  private score = 0;
  private moles: (Phaser.GameObjects.Text | null)[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private done = false;

  constructor() {
    super('mole');
  }

  create() {
    this.score = 0;
    this.done = false;
    this.moles = Array(9).fill(null);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x2a1d14, 0.96).setInteractive();
    this.add
      .text(GAME_W / 2, 60, '🔨 УДАРИ КЪРТИЦАТА!', { fontSize: '42px', color: '#f2c94e', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.scoreText = this.add
      .text(120, 60, '⭐ 0', { fontSize: '34px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    const timeText = this.add
      .text(GAME_W - 130, 110, '⏱ 25', { fontSize: '28px', color: '#e8d0b0' })
      .setOrigin(0.5);
    const close = this.add
      .text(GAME_W - 46, 50, '✕', { fontSize: '38px', color: '#ffffff' })
      .setOrigin(0.5)
      .setPadding(14)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.scene.stop());

    // 3x3 holes
    const holes: { x: number; y: number }[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x = GAME_W / 2 - 260 + c * 260;
        const y = 260 + r * 180;
        holes.push({ x, y });
        this.add.ellipse(x, y + 34, 150, 52, 0x140d08);
        this.add.ellipse(x, y + 30, 150, 52, 0x3d2a1a);
      }
    }

    // Mole popping
    const popper = this.time.addEvent({
      delay: 650,
      loop: true,
      callback: () => {
        if (this.done) return;
        const free = holes.map((h, i) => i).filter((i) => !this.moles[i]);
        if (!free.length) return;
        const i = Phaser.Math.RND.pick(free);
        const h = holes[i];
        const mole = this.add
          .text(h.x, h.y + 20, '🐹', { fontSize: '54px' })
          .setOrigin(0.5)
          .setScale(0)
          .setInteractive({ useHandCursor: true });
        this.moles[i] = mole;
        this.tweens.add({ targets: mole, scale: 1, y: h.y - 8, duration: 140, ease: 'back.out' });
        mole.on('pointerdown', () => {
          if (!mole.active) return;
          this.score++;
          this.scoreText.setText(`⭐ ${this.score}`);
          sfx.boing();
          mole.setText('💥');
          if (mole.input) mole.input.enabled = false;
          this.tweens.add({ targets: mole, scale: 1.4, alpha: 0, duration: 250, onComplete: () => mole.destroy() });
          this.moles[i] = null;
        });
        // Escapes if not bonked in time
        this.time.delayedCall(750, () => {
          if (mole.active && this.moles[i] === mole) {
            this.tweens.add({ targets: mole, scale: 0, y: h.y + 24, duration: 140, onComplete: () => mole.destroy() });
            this.moles[i] = null;
          }
        });
      },
    });

    // Countdown
    let remain = PLAY_MS / 1000;
    this.time.addEvent({
      delay: 1000,
      repeat: remain - 1,
      callback: () => {
        remain--;
        timeText.setText(`⏱ ${remain}`);
      },
    });
    this.time.delayedCall(PLAY_MS, () => {
      this.done = true;
      popper.remove();
      const coins = Math.max(1, Math.ceil(this.score / 2));
      this.game.events.emit('earn-coins', coins);
      if (this.score >= 5) this.game.events.emit('minigame-done', 'mole');
      sfx.sparkle();
      this.add
        .text(GAME_W / 2, GAME_H / 2, `🏆 ${this.score} къртици! +${coins} 🪙`, {
          fontSize: '50px',
          color: '#ffd166',
          fontStyle: 'bold',
          backgroundColor: '#2a1d14',
        })
        .setOrigin(0.5)
        .setPadding(30, 16, 30, 16)
        .setDepth(10);
      this.time.delayedCall(2400, () => this.scene.stop());
    });
  }
}

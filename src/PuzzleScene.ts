import Phaser from 'phaser';
import { sfx } from './sfx';

const GAME_W = 1024;
const GAME_H = 768;

// Portrait family photos -> 5 wide x 6 tall = 30 pieces
const COLS = 5;
const ROWS = 6;
const SNAP = 46;

export const PUZZLE_COUNT = 8;
export const puzzleKeys = Array.from({ length: PUZZLE_COUNT }, (_, i) => `puzzle${i + 1}`);

const BOARD_X = 60;
const BOARD_Y = 64;
const BOARD_W = 480;
const BOARD_H = 640;
const PIECE_W = BOARD_W / COLS;
const PIECE_H = BOARD_H / ROWS;

export class PuzzleScene extends Phaser.Scene {
  private placed = 0;
  private solved = false;

  constructor() {
    super('puzzle');
  }

  create() {
    this.placed = 0;
    this.solved = false;
    const key = Phaser.Math.RND.pick(puzzleKeys);

    // Dim the house behind and swallow all taps
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x1a1423, 0.93).setInteractive();

    this.add
      .text(782, 40, '🧩 Време за пъзел!', { fontSize: '34px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0.5);

    const close = this.add
      .text(GAME_W - 44, 40, '✕', { fontSize: '36px', color: '#ffffff' })
      .setOrigin(0.5)
      .setPadding(14)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.scene.stop());

    // Board outline + faint ghost of the finished picture
    const g = this.add.graphics();
    g.fillStyle(0x2e2438, 1).fillRoundedRect(BOARD_X - 14, BOARD_Y - 14, BOARD_W + 28, BOARD_H + 28, 14);
    const ghost = this.add.image(BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2, key);
    ghost.setDisplaySize(BOARD_W, BOARD_H).setAlpha(0.16);
    g.lineStyle(2, 0xffffff, 0.35);
    for (let c = 0; c <= COLS; c++) g.lineBetween(BOARD_X + c * PIECE_W, BOARD_Y, BOARD_X + c * PIECE_W, BOARD_Y + BOARD_H);
    for (let r = 0; r <= ROWS; r++) g.lineBetween(BOARD_X, BOARD_Y + r * PIECE_H, BOARD_X + BOARD_W, BOARD_Y + r * PIECE_H);

    // Cut the photo into frames (once per texture)
    const tex = this.textures.get(key);
    const src = tex.getSourceImage();
    const cellW = src.width / COLS;
    const cellH = src.height / ROWS;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const frameName = `p_${c}_${r}`;
        if (!tex.has(frameName)) tex.add(frameName, 0, c * cellW, r * cellH, cellW, cellH);
      }
    }

    // Scatter draggable pieces in the tray on the right
    let topDepth = 10;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = this.add
          .image(Phaser.Math.Between(650, 950), Phaser.Math.Between(120, 690), key, `p_${c}_${r}`)
          .setDisplaySize(PIECE_W, PIECE_H)
          .setDepth(++topDepth)
          .setInteractive({ useHandCursor: true, draggable: true });

        const targetX = BOARD_X + c * PIECE_W + PIECE_W / 2;
        const targetY = BOARD_Y + r * PIECE_H + PIECE_H / 2;

        piece.on('dragstart', () => piece.setDepth(++topDepth));
        piece.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          piece.setPosition(dragX, dragY);
        });
        piece.on('dragend', () => {
          if (Phaser.Math.Distance.Between(piece.x, piece.y, targetX, targetY) < SNAP) {
            piece.setPosition(targetX, targetY);
            piece.setDepth(5); // under still-loose pieces
            // Never call disableInteractive() inside dragend: it mutates the
            // input plugin's lists mid-iteration and wedges all input.
            if (piece.input) piece.input.enabled = false;
            sfx.pop();
            this.placed++;
            if (this.placed === COLS * ROWS) this.win();
          }
        });
      }
    }
  }

  private win() {
    if (this.solved) return;
    this.solved = true;
    sfx.sparkle();
    this.game.events.emit('puzzle-solved');

    // Confetti!
    for (let i = 0; i < 40; i++) {
      const conf = this.add
        .rectangle(
          Phaser.Math.Between(0, GAME_W),
          -20,
          10,
          14,
          Phaser.Math.RND.pick([0xd4453e, 0x4a7fd4, 0x7fb069, 0xf2d94e, 0xb08ed9, 0xe8907f]),
        )
        .setDepth(100)
        .setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({
        targets: conf,
        y: GAME_H + 40,
        angle: conf.angle + Phaser.Math.Between(-360, 360),
        delay: Phaser.Math.Between(0, 600),
        duration: Phaser.Math.Between(1400, 2400),
        onComplete: () => conf.destroy(),
      });
    }

    this.add
      .text(GAME_W / 2, GAME_H / 2, '🎉 БРАВО! ГОТОВО! 🎉', {
        fontSize: '54px',
        color: '#ffd166',
        fontStyle: 'bold',
        backgroundColor: '#2e2438',
      })
      .setOrigin(0.5)
      .setPadding(30, 16, 30, 16)
      .setDepth(101);

    this.time.delayedCall(2800, () => this.scene.stop());
  }
}

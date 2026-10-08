import Phaser from 'phaser';

export type BreakableKind = 'plant' | 'trash' | 'toybox';

/**
 * A prop with an intact and a broken look. Pets break it; a character
 * taps it to walk over and repair it for coins.
 */
export class Breakable extends Phaser.GameObjects.Container {
  readonly kind: BreakableKind;
  broken = false;
  /** Where a character/pet should stand to interact. */
  readonly standX: number;
  readonly standY: number;
  private intact: Phaser.GameObjects.Graphics;
  private brokenG: Phaser.GameObjects.Graphics;
  private alert: Phaser.GameObjects.Text;
  private onFixRequest: (b: Breakable) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: BreakableKind,
    onFixRequest: (b: Breakable) => void,
  ) {
    super(scene, x, y);
    this.kind = kind;
    this.onFixRequest = onFixRequest;
    this.standX = x;
    this.standY = y + 100;

    this.intact = scene.add.graphics();
    this.brokenG = scene.add.graphics();
    this.drawIntact(this.intact);
    this.drawBroken(this.brokenG);
    this.brokenG.setVisible(false);
    this.add([this.intact, this.brokenG]);

    this.alert = scene.add
      .text(0, -95, '❗', { fontSize: '30px' })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.alert);

    this.setDepth(y);
    this.setSize(120, 140);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (this.broken) this.onFixRequest(this);
    });
    scene.add.existing(this);
  }

  breakIt() {
    if (this.broken) return;
    this.broken = true;
    this.intact.setVisible(false);
    this.brokenG.setVisible(true);
    this.alert.setVisible(true);
    this.scene.tweens.add({
      targets: this.alert,
      y: -108,
      yoyo: true,
      repeat: -1,
      duration: 500,
      ease: 'sine.inout',
    });
  }

  fix() {
    this.broken = false;
    this.brokenG.setVisible(false);
    this.intact.setVisible(true);
    this.scene.tweens.killTweensOf(this.alert);
    this.alert.setVisible(false).setY(-95);
  }

  private drawIntact(g: Phaser.GameObjects.Graphics) {
    switch (this.kind) {
      case 'plant':
        g.fillStyle(0xc96f4a).fillRoundedRect(-28, 10, 56, 44, 6); // pot
        g.fillStyle(0xa85838).fillRect(-32, 4, 64, 10);
        g.fillStyle(0x5f9e56); // bush
        g.fillCircle(0, -26, 30).fillCircle(-20, -8, 22).fillCircle(20, -8, 22);
        g.fillStyle(0x74b569).fillCircle(-6, -22, 16).fillCircle(12, -14, 12);
        break;
      case 'trash':
        g.fillStyle(0x8fa3b8).fillRoundedRect(-24, -30, 48, 84, 8);
        g.fillStyle(0x7b8fa5).fillRect(-28, -36, 56, 10);
        g.fillStyle(0x6d8095).fillRect(-4, -30, 8, 84);
        break;
      case 'toybox':
        g.fillStyle(0xd4a04a).fillRoundedRect(-46, -20, 92, 62, 8);
        g.fillStyle(0xb98431).fillRect(-46, -26, 92, 12);
        g.fillStyle(0xe86a5e).fillCircle(-18, 4, 9); // peeking toys
        g.fillStyle(0x6fa5d8).fillCircle(6, -2, 8);
        g.fillStyle(0x8fc76f).fillCircle(26, 6, 8);
        break;
    }
  }

  private drawBroken(g: Phaser.GameObjects.Graphics) {
    switch (this.kind) {
      case 'plant':
        // Tipped pot + spilled dirt + drooping plant
        g.fillStyle(0x6b4a2f).fillEllipse(6, 46, 110, 26); // dirt
        g.fillStyle(0x5a3d26).fillEllipse(-14, 50, 50, 14);
        g.fillStyle(0xc96f4a).fillRoundedRect(-52, 18, 44, 34, 6); // pot on its side
        g.fillStyle(0x5f9e56).fillEllipse(28, 36, 60, 24); // flattened bush
        g.fillStyle(0x74b569).fillEllipse(40, 30, 30, 14);
        break;
      case 'trash':
        // Tipped bin + rubbish
        g.fillStyle(0x8fa3b8).fillRoundedRect(-56, 16, 84, 40, 8);
        g.fillStyle(0x7b8fa5).fillRect(28, 12, 10, 48);
        g.fillStyle(0xf2e394).fillCircle(48, 44, 9); // crumpled paper
        g.fillStyle(0xffffff).fillCircle(66, 50, 8);
        g.fillStyle(0xa8d8a0).fillCircle(58, 30, 7);
        g.fillStyle(0xf2b6a0).fillEllipse(84, 46, 18, 10);
        break;
      case 'toybox':
        // Box tipped, toys everywhere
        g.fillStyle(0xd4a04a).fillRoundedRect(-60, 8, 70, 48, 8);
        g.fillStyle(0xe86a5e).fillCircle(30, 40, 10);
        g.fillStyle(0x6fa5d8).fillCircle(56, 28, 9);
        g.fillStyle(0x8fc76f).fillCircle(76, 46, 9);
        g.fillStyle(0xc98fd8).fillCircle(44, 54, 8);
        g.fillStyle(0xf2d94e).fillRect(60, 50, 16, 10);
        break;
    }
  }
}

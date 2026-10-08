import Phaser from 'phaser';
import { isSoundOn, sfx, toggleSound } from './sfx';
import { debugReport } from './debug';
import { PetKind } from './economy';
import { STYLE_LIST } from './config/styles';
import { Sex } from './wardrobe';

export const GAME_W = 1024;
export const GAME_H = 768;

/**
 * Fixed HUD in its own scene so buttons keep working no matter where the
 * room camera has scrolled or panned.
 */
export class UIScene extends Phaser.Scene {
  private coinText!: Phaser.GameObjects.Text;
  private toastText?: Phaser.GameObjects.Text;

  constructor() {
    super('ui');
  }

  create() {
    this.coinText = this.add
      .text(24, 24, `🪙 ${this.registry.get('coins') ?? 0}`, {
        fontSize: '32px',
        color: '#ffffff',
        backgroundColor: '#4b3a63',
        fontStyle: 'bold',
      })
      .setPadding(16, 8, 16, 10)
      .setDepth(10);

    this.registry.events.on('changedata-coins', () => {
      this.coinText.setText(`🪙 ${this.registry.get('coins')}`);
    });

    // 🧺 collected ingredients
    const basketText = this.add
      .text(24, 84, `🧺 ${this.registry.get('basket') ?? 0}`, {
        fontSize: '28px',
        color: '#ffffff',
        backgroundColor: '#4b3a63',
        fontStyle: 'bold',
      })
      .setPadding(16, 6, 16, 8)
      .setDepth(10);
    this.registry.events.on('changedata-basket', () => {
      basketText.setText(`🧺 ${this.registry.get('basket') ?? 0}`);
    });

    // ＋ add menu
    const addBtn = this.add
      .text(GAME_W - 56, 56, '＋', { fontSize: '44px', color: '#ffffff', backgroundColor: '#7c5cbf' })
      .setOrigin(0.5)
      .setPadding(16, 8, 16, 12)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    const chooser = this.add.container(GAME_W - 110, 130).setDepth(10).setVisible(false);
    const entries: { label: string; bg: string; fn: () => void }[] = [
      { label: '👦 Момче', bg: '#4a7fd4', fn: () => this.game.events.emit('ui-add-person', 'm' as Sex) },
      { label: '👧 Момиче', bg: '#d45c9e', fn: () => this.game.events.emit('ui-add-person', 'f' as Sex) },
      { label: '🐱 Котка', bg: '#c98a3d', fn: () => this.game.events.emit('ui-add-pet', 'cat' as PetKind) },
      { label: '🐶 Куче', bg: '#7a9a4a', fn: () => this.game.events.emit('ui-add-pet', 'dog' as PetKind) },
    ];
    entries.forEach((e, i) => {
      const btn = this.add
        .text(0, i * 64, e.label, { fontSize: '30px', color: '#ffffff', backgroundColor: e.bg })
        .setOrigin(0.5)
        .setPadding(18, 10, 18, 10)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        sfx.pop();
        chooser.setVisible(false);
        e.fn();
      });
      chooser.add(btn);
    });
    addBtn.on('pointerdown', () => {
      sfx.pop();
      chooser.setVisible(!chooser.visible);
    });

    // 🔊 sound effects on/off
    const soundBtn = this.add
      .text(24, GAME_H - 204, isSoundOn() ? '🔊' : '🔇', { fontSize: '40px', backgroundColor: '#4b3a63' })
      .setOrigin(0, 0.5)
      .setPadding(12, 8, 12, 10)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    soundBtn.on('pointerdown', () => {
      soundBtn.setText(toggleSound() ? '🔊' : '🔇');
    });

    // 🖼 room theme toggle
    const themeBtn = this.add
      .text(24, GAME_H - 130, '🖼', { fontSize: '40px', backgroundColor: '#4b3a63' })
      .setOrigin(0, 0.5)
      .setPadding(12, 8, 12, 10)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    themeBtn.on('pointerdown', () => this.game.events.emit('ui-theme-toggle'));

    // 🎨 global art style toggle (hidden while only one style is registered)
    if (STYLE_LIST.length > 1) {
      const styleBtn = this.add
        .text(24, GAME_H - 278, '🎨', { fontSize: '40px', backgroundColor: '#4b3a63' })
        .setOrigin(0, 0.5)
        .setPadding(12, 8, 12, 10)
        .setDepth(10)
        .setInteractive({ useHandCursor: true });
      styleBtn.on('pointerdown', () => this.game.events.emit('ui-style-toggle'));
    }

    // 🤸 cartwheel button
    const flip = this.add
      .text(24, GAME_H - 56, '🤸', { fontSize: '40px', backgroundColor: '#4b3a63' })
      .setOrigin(0, 0.5)
      .setPadding(12, 8, 12, 10)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    flip.on('pointerdown', () => this.game.events.emit('ui-cartwheel'));

    // 📋 secret tasks
    const taskBtn = this.add
      .text(24, 148, '📋', { fontSize: '28px', backgroundColor: '#4b3a63' })
      .setPadding(12, 6, 12, 8)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    const taskBg = this.add.rectangle(320, 320, 520, 240, 0x2e2438, 0.95).setDepth(15).setVisible(false);
    const taskText = this.add
      .text(90, 220, '', { fontSize: '24px', color: '#ffffff', lineSpacing: 14 })
      .setDepth(16)
      .setVisible(false);
    const renderTasks = () => {
      const list: { label: string; done: boolean; got: number; need: number }[] = this.registry.get('tasks') ?? [];
      taskText.setText(
        ['🤫 ТАЙНИ ЗАДАЧИ:', ...list.map((t) => `${t.done ? '✅' : '⬜'} ${t.label}${t.need > 1 ? ` (${t.got}/${t.need})` : ''}`)].join('\n'),
      );
    };
    taskBtn.on('pointerdown', () => {
      const show = !taskBg.visible;
      renderTasks();
      taskBg.setVisible(show);
      taskText.setVisible(show);
    });
    this.registry.events.on('changedata-tasks', () => {
      if (taskBg.visible) renderTasks();
    });

    // 🐞 debug panel (tap to toggle; screenshot it when a freeze happens)
    const dbgBtn = this.add
      .text(GAME_W - 44, 130, '🐞', { fontSize: '22px' })
      .setOrigin(0.5)
      .setPadding(10)
      .setAlpha(0.5)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    const dbgBg = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, 720, 560, 0x000000, 0.85)
      .setDepth(20)
      .setVisible(false);
    const dbgText = this.add
      .text(GAME_W / 2 - 340, GAME_H / 2 - 260, '', {
        fontSize: '17px',
        color: '#a8f0a8',
        fontFamily: 'Menlo, monospace',
        lineSpacing: 5,
      })
      .setDepth(21)
      .setVisible(false);
    let dbgTimer: Phaser.Time.TimerEvent | undefined;
    dbgBtn.on('pointerdown', () => {
      const show = !dbgBg.visible;
      dbgBg.setVisible(show);
      dbgText.setVisible(show);
      dbgTimer?.remove();
      if (show) {
        const refresh = () => dbgText.setText(debugReport(this.game, this).join('\n'));
        refresh();
        dbgTimer = this.time.addEvent({ delay: 500, loop: true, callback: refresh });
      }
    });

    // Toasts
    this.game.events.on('toast', this.showToast, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('toast', this.showToast, this);
    });
  }

  private showToast(msg: string) {
    this.toastText?.destroy();
    const t = this.add
      .text(GAME_W / 2, 96, msg, {
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#4b3a63',
        align: 'center',
      })
      .setOrigin(0.5)
      .setPadding(18, 10, 18, 10)
      .setDepth(11)
      .setAlpha(0);
    this.toastText = t;
    this.tweens.add({
      targets: t,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 2200,
      onComplete: () => t.destroy(),
    });
  }
}

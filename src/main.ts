import Phaser from 'phaser';
import { loadCustomSounds } from './sfx';
import { RoomScene, GAME_W, GAME_H } from './RoomScene';
import { WardrobeScene } from './WardrobeScene';
import { TransformScene } from './TransformScene';
import { UIScene } from './UIScene';
import { PuzzleScene } from './PuzzleScene';
import { SecretMarketScene } from './SecretMarketScene';
import { MathScene } from './MathScene';
import { MoleScene } from './MoleScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1a1423',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [RoomScene, UIScene, WardrobeScene, TransformScene, PuzzleScene, SecretMarketScene, MathScene, MoleScene],
});

// Kid-recorded sounds (public/assets/sounds/) load in the background
loadCustomSounds();

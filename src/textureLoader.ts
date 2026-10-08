import Phaser from 'phaser';
import { dlog } from './debug';

// Lazy texture loading: character sheets are fetched only when something
// actually needs them (a worn outfit, an opened wardrobe category), keeping
// GPU memory far below Safari's per-tab budget — loading everything up
// front caused periodic multi-second freezes while the OS purged textures.

const PATH = 'assets/character';

/** Load any missing sheets, then call back (immediately if all present). */
export function ensureTextures(scene: Phaser.Scene, keys: string[], cb: () => void) {
  const missing = [...new Set(keys.filter((k) => k && !scene.textures.exists(k)))];
  if (missing.length === 0) {
    cb();
    return;
  }
  const t0 = performance.now();
  dlog(`texload start ${missing.length} (${missing[0]}…)`);
  for (const k of missing) {
    scene.load.spritesheet(k, `${PATH}/${k}.png`, { frameWidth: 64, frameHeight: 64 });
  }
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    dlog(`texload done ${missing.length} in ${(performance.now() - t0).toFixed(0)}ms`);
    cb();
  });
  scene.load.start();
}

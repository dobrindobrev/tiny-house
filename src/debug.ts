// Lightweight in-game diagnostics for hunting freezes.
//
// - dlog(msg): records timestamped events in a ring buffer
// - a frame watchdog detects gaps > 500ms and snapshots the recent events
// - the 🐞 panel (UIScene) shows live stats + freeze history on screen,
//   so it works on the iPad where there is no dev console.

interface Ev {
  t: number;
  msg: string;
}

interface Freeze {
  at: number;
  dur: number;
  before: string[];
}

const events: Ev[] = [];
const freezes: Freeze[] = [];
let lastFrame = 0;

export function dlog(msg: string) {
  events.push({ t: performance.now(), msg });
  if (events.length > 80) events.shift();
}

/** Call once per frame; detects main-thread stalls. */
export function frameTick() {
  const now = performance.now();
  if (lastFrame > 0) {
    const gap = now - lastFrame;
    if (gap > 500) {
      const before = events.slice(-8).map((e) => `${(e.t / 1000).toFixed(1)}s ${e.msg}`);
      freezes.push({ at: now, dur: gap, before });
      if (freezes.length > 10) freezes.shift();
      dlog(`⚠️ FREEZE ${(gap / 1000).toFixed(1)}s`);
      // eslint-disable-next-line no-console
      console.warn(`[freeze] ${gap.toFixed(0)}ms; recent:`, before);
      try {
        localStorage.setItem(
          'tiny-house-freeze-log',
          JSON.stringify(freezes.map((f) => ({ at: Math.round(f.at), dur: Math.round(f.dur), before: f.before }))),
        );
      } catch {
        /* full */
      }
    }
  }
  lastFrame = now;
}

export function debugReport(game: Phaser.Game, scene: Phaser.Scene): string[] {
  const lines: string[] = [];
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  lines.push(
    `FPS ${game.loop.actualFps.toFixed(0)}  textures ${Object.keys(scene.textures.list).length}` +
      (mem ? `  heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : ''),
  );
  const room = game.scene.getScene('room');
  if (room) {
    lines.push(
      `objects ${room.children.length}  tweens ${room.tweens.getTweens().length}  timers ${
        (room.time as unknown as { _active: unknown[] })._active?.length ?? '?'
      }`,
    );
  }
  lines.push(`— freezes (${freezes.length}) —`);
  for (const f of freezes.slice(-4)) {
    lines.push(`▸ ${(f.dur / 1000).toFixed(1)}s at ${(f.at / 1000).toFixed(0)}s`);
    for (const b of f.before.slice(-4)) lines.push(`   ${b}`);
  }
  lines.push('— recent —');
  for (const e of events.slice(-10)) lines.push(`${(e.t / 1000).toFixed(1)}s ${e.msg}`);
  return lines;
}

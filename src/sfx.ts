// Tiny WebAudio synth for kid-friendly sound effects. No audio files needed —
// but any sound can be replaced by a recording: drop a file named
// <sound>.m4a / .mp3 / .wav / .ogg into public/assets/sounds/
// (e.g. hungry.m4a recorded by the kids) and it plays instead of the synth.

let ctx: AudioContext | null = null;

const CUSTOMIZABLE = [
  'pop', 'coin', 'crash', 'sparkle', 'whoosh', 'transform', 'boing', 'door',
  'munch', 'meow', 'woof', 'chaching', 'deny', 'gift', 'hungry', 'sleepy', 'hug', 'gulp', 'water', 'sizzle', 'firework',
];
const EXTS = ['m4a', 'mp3', 'wav', 'ogg'];
const custom = new Map<string, AudioBuffer>();

/** Try to fetch kid-recorded sounds; missing files are silently skipped. */
export async function loadCustomSounds() {
  await Promise.all(
    CUSTOMIZABLE.map(async (name) => {
      for (const ext of EXTS) {
        try {
          const res = await fetch(`assets/sounds/${name}.${ext}`);
          if (!res.ok) continue;
          const buf = await ac().decodeAudioData(await res.arrayBuffer());
          custom.set(name, buf);
          return;
        } catch {
          /* not a playable file -> try next extension */
        }
      }
    }),
  );
}

function playCustom(name: string): boolean {
  if (!soundOn) return true; // swallow: synth fallback must stay quiet too
  const buf = custom.get(name);
  if (!buf) return false;
  const a = ac();
  const src = a.createBufferSource();
  src.buffer = buf;
  const gain = a.createGain();
  gain.gain.value = 0.85;
  src.connect(gain).connect(a.destination);
  src.start();
  return true;
}

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  from: number; // start frequency
  to?: number; // end frequency (glide)
  dur: number; // seconds
  vol?: number;
  delay?: number;
}

function tone({ type = 'sine', from, to, dur, vol = 0.25, delay = 0 }: ToneOpts) {
  if (!soundOn) return;
  const a = ac();
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, vol = 0.2, delay = 0, lowpass = 1200) {
  if (!soundOn) return;
  const a = ac();
  const t0 = a.currentTime + delay;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Soft tap/walk-command pop */
  pop() {
    if (playCustom('pop')) return;
    tone({ type: 'sine', from: 500, to: 900, dur: 0.08, vol: 0.12 });
  },
  coin() {
    if (playCustom('coin')) return;
    tone({ type: 'square', from: 988, dur: 0.08, vol: 0.12 });
    tone({ type: 'square', from: 1319, dur: 0.18, vol: 0.12, delay: 0.08 });
  },
  crash() {
    if (playCustom('crash')) return;
    noise(0.35, 0.3, 0, 900);
    tone({ type: 'sawtooth', from: 220, to: 60, dur: 0.3, vol: 0.18 });
  },
  sparkle() {
    if (playCustom('sparkle')) return;
    [880, 1109, 1319, 1760].forEach((f, i) =>
      tone({ type: 'triangle', from: f, dur: 0.15, vol: 0.14, delay: i * 0.07 }),
    );
  },
  whoosh() {
    if (playCustom('whoosh')) return;
    noise(0.5, 0.22, 0, 2400);
    tone({ type: 'sine', from: 200, to: 1200, dur: 0.45, vol: 0.15 });
    tone({ type: 'sine', from: 1200, to: 300, dur: 0.4, vol: 0.12, delay: 0.4 });
  },
  transform() {
    if (playCustom('transform')) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone({ type: 'square', from: f, dur: 0.12, vol: 0.1, delay: i * 0.06 }),
    );
    noise(0.5, 0.12, 0, 3000);
  },
  boing() {
    if (playCustom('boing')) return;
    tone({ type: 'sine', from: 150, to: 500, dur: 0.25, vol: 0.25 });
    tone({ type: 'sine', from: 500, to: 250, dur: 0.2, vol: 0.18, delay: 0.22 });
  },
  door() {
    if (playCustom('door')) return;
    tone({ type: 'sawtooth', from: 90, to: 180, dur: 0.35, vol: 0.1 });
    tone({ type: 'triangle', from: 500, dur: 0.06, vol: 0.12, delay: 0.4 });
  },
  munch() {
    if (playCustom('munch')) return;
    [0, 0.15, 0.3].forEach((d) => noise(0.09, 0.2, d, 700));
  },
  meow() {
    if (playCustom('meow')) return;
    tone({ type: 'triangle', from: 500, to: 900, dur: 0.18, vol: 0.16 });
    tone({ type: 'triangle', from: 900, to: 400, dur: 0.22, vol: 0.14, delay: 0.16 });
  },
  woof() {
    if (playCustom('woof')) return;
    tone({ type: 'sawtooth', from: 220, to: 90, dur: 0.12, vol: 0.22 });
    noise(0.1, 0.15, 0, 500);
  },
  chaching() {
    if (playCustom('chaching')) return;
    tone({ type: 'square', from: 784, dur: 0.07, vol: 0.1 });
    tone({ type: 'square', from: 988, dur: 0.07, vol: 0.1, delay: 0.07 });
    tone({ type: 'square', from: 1319, dur: 0.2, vol: 0.12, delay: 0.14 });
  },
  deny() {
    if (playCustom('deny')) return;
    tone({ type: 'square', from: 220, dur: 0.12, vol: 0.1 });
    tone({ type: 'square', from: 180, dur: 0.2, vol: 0.1, delay: 0.12 });
  },
  gift() {
    if (playCustom('gift')) return;
    [659, 784, 988].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.14, vol: 0.13, delay: i * 0.09 }));
  },
  hungry() {
    if (playCustom('hungry')) return;
    tone({ type: 'triangle', from: 440, to: 300, dur: 0.25, vol: 0.14 });
    tone({ type: 'triangle', from: 330, to: 220, dur: 0.3, vol: 0.12, delay: 0.25 });
  },
  sleepy() {
    if (playCustom('sleepy')) return;
    tone({ type: 'sine', from: 520, to: 380, dur: 0.5, vol: 0.1 });
    tone({ type: 'sine', from: 390, to: 280, dur: 0.6, vol: 0.08, delay: 0.5 });
  },
  hug() {
    if (playCustom('hug')) return;
    tone({ type: 'triangle', from: 523, dur: 0.3, vol: 0.12 });
    tone({ type: 'triangle', from: 659, dur: 0.3, vol: 0.12, delay: 0.05 });
    tone({ type: 'triangle', from: 784, dur: 0.4, vol: 0.1, delay: 0.1 });
  },
  gulp() {
    if (playCustom('gulp')) return;
    tone({ type: 'sine', from: 500, to: 120, dur: 0.3, vol: 0.22 });
    noise(0.12, 0.12, 0.28, 600);
  },
  water() {
    if (playCustom('water')) return;
    for (let i = 0; i < 6; i++) noise(0.5, 0.07, i * 0.4, 3200);
  },
  sizzle() {
    if (playCustom('sizzle')) return;
    for (let i = 0; i < 8; i++) noise(0.15, 0.09, i * 0.3, 5000);
  },
  firework() {
    if (playCustom('firework')) return;
    tone({ type: 'sine', from: 200, to: 900, dur: 0.5, vol: 0.1 }); // whistle up
    noise(0.4, 0.3, 0.55, 1200); // boom
    [1319, 1109, 880].forEach((f, i) => tone({ type: 'triangle', from: f, to: f / 2, dur: 0.5, vol: 0.08, delay: 0.6 + i * 0.08 }));
  },
};

// ---------------------------------------------------------------------------
// Global sound effects on/off (persisted).
// ---------------------------------------------------------------------------

const SOUND_KEY = 'tiny-house-sound';
let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';

export function isSoundOn(): boolean {
  return soundOn;
}

export function toggleSound(): boolean {
  soundOn = !soundOn;
  localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
  return soundOn;
}

// Per-character voice recordings, captured with the microphone and stored
// as data URLs in localStorage (a few seconds each, ~40KB).
// Note: the microphone needs a secure context — works on http://localhost;
// over plain http on the LAN (iPad) browsers block it.

const key = (id: string) => `tiny-house-voice-${id}`;

export function hasVoice(id: string): boolean {
  return !!localStorage.getItem(key(id));
}

import { dlog } from './debug';

export function playVoice(id: string) {
  dlog('voice play');
  const url = localStorage.getItem(key(id));
  if (!url) return;
  new Audio(url).play().catch(() => undefined);
}

let recording = false;

export async function recordVoice(
  id: string,
  ms: number,
  onStart: () => void,
  onDone: () => void,
  onError: (msg: string) => void,
) {
  if (recording) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    onError('Микрофонът не е достъпен тук 🎤');
    return;
  }
  try {
    recording = true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(key(id), reader.result as string);
          onDone();
        } catch {
          onError('Записът е твърде дълъг за запазване');
        }
        recording = false;
      };
      reader.readAsDataURL(blob);
    };
    rec.start();
    onStart();
    setTimeout(() => rec.state !== 'inactive' && rec.stop(), ms);
  } catch {
    recording = false;
    onError('Няма достъп до микрофона 🎤');
  }
}

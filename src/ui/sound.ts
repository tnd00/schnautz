/* Kleine Klänge, mit der Web Audio API erzeugt. Kein Ton, bevor jemand geklickt hat (Browser-Regel). */
import { App } from './app';
import { $ } from './dom';

let AC: AudioContext | null = null;

export function unlockAudio(): void {
  if (!AC) {
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      AC = new Ctx();
    } catch {
      return;
    }
  }
  if (AC.state === 'suspended') void AC.resume();
}

function tone(ac: AudioContext, f: number, t0: number, dur: number, type: OscillatorType = 'sine', gain = 0.12): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Dumpfes Klopfen auf den Tisch (gefiltertes Rauschen). */
function thump(ac: AudioContext, t0: number): void {
  const len = Math.floor(ac.sampleRate * 0.12);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  s.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = 220;
  g.gain.value = 0.9;
  s.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  s.start(t0);
}

const SFX = {
  turn: (a: AudioContext, t: number) => {
    tone(a, 784, t, 0.28, 'sine', 0.09);
    tone(a, 1175, t + 0.11, 0.4, 'sine', 0.08);
  },
  card: (a: AudioContext, t: number) => tone(a, 320, t, 0.06, 'triangle', 0.05),
  knock: (a: AudioContext, t: number) => {
    thump(a, t);
    thump(a, t + 0.17);
  },
  win: (a: AudioContext, t: number) =>
    [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.1, 0.35, 'triangle', 0.08)),
  lose: (a: AudioContext, t: number) => {
    tone(a, 392, t, 0.3, 'triangle', 0.07);
    tone(a, 311, t + 0.16, 0.45, 'triangle', 0.07);
  },
  pop: (a: AudioContext, t: number) => {
    tone(a, 880, t, 0.08, 'sine', 0.06);
    tone(a, 1320, t + 0.05, 0.1, 'sine', 0.05);
  },
  burn: (a: AudioContext, t: number) => {
    tone(a, 220, t, 0.25, 'sawtooth', 0.035);
    tone(a, 140, t + 0.08, 0.4, 'sawtooth', 0.035);
  },
  bomb: (a: AudioContext, t: number) => {
    thump(a, t);
    thump(a, t + 0.12);
    tone(a, 90, t, 0.55, 'square', 0.045);
  },
  nope: (a: AudioContext, t: number) => {
    tone(a, 260, t, 0.14, 'square', 0.04);
    tone(a, 200, t + 0.13, 0.22, 'square', 0.04);
  },
} satisfies Record<string, (a: AudioContext, t: number) => void>;

export type SoundName = keyof typeof SFX;

export function sfx(name: SoundName): void {
  if (App.muted || !AC) return;
  try {
    SFX[name](AC, AC.currentTime + 0.01);
  } catch {
    /* Ton ist nicht wichtig genug für einen Fehler */
  }
}

const ICON_MUTED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
const ICON_SOUND =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

export function renderSoundBtn(): void {
  $('#btn-sound').innerHTML = App.muted ? ICON_MUTED : ICON_SOUND;
}

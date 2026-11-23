/* Kleine Klänge, mit der Web Audio API erzeugt. Kein Ton, bevor jemand geklickt hat (Browser-Regel). */
import { App } from './app';
import { $ } from './dom';
import { loadSamples, startSample, type SampleName } from './samples';
import { trombone } from './soundboard';

let AC: AudioContext | null = null;

let primed = false;

export function unlockAudio(): void {
  // iPhone: Ohne diese Einstellung schweigt Web Audio, sobald der Lautlos-Schalter an ist.
  // Den Ton im Spiel schaltet man über den eigenen Knopf ab.
  try {
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s && s.type !== 'playback') s.type = 'playback';
  } catch {
    /* ältere Browser kennen das nicht */
  }
  if (!AC) {
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      AC = new Ctx();
    } catch {
      return;
    }
  }
  // Safari kennt neben suspended auch interrupted
  if (AC.state !== 'running') void AC.resume().catch(() => undefined);
  // Ein stummer Mini-Ton direkt im Tipp schaltet Web Audio auf iPhones zuverlässig frei
  if (!primed) {
    primed = true;
    try {
      const b = AC.createBuffer(1, 1, 22050);
      const src = AC.createBufferSource();
      src.buffer = b;
      src.connect(AC.destination);
      src.start(0);
    } catch {
      primed = false;
    }
  }
  loadSamples(AC);
}

/** Laufender Audio-Kontext oder null. Solange er nicht läuft, wird nichts eingeplant, sonst plärrt es später auf einmal. */
export function audio(): AudioContext | null {
  return AC && AC.state === 'running' ? AC : null;
}

/** Kontext existiert, läuft aber nicht (meist fehlt am Handy noch ein Tipp). */
export function audioLocked(): boolean {
  return !AC || AC.state !== 'running';
}

export function tone(
  ac: AudioContext,
  f: number,
  t0: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.12,
  out: AudioNode = ac.destination,
  to?: number,
): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Weißes Rauschen mit Hüllkurve, durch einen Filter. Grundlage für Klatschen, Platschen und Becken. */
export function noise(
  ac: AudioContext,
  t0: number,
  dur: number,
  type: BiquadFilterType,
  freq: number,
  gain: number,
  out: AudioNode = ac.destination,
  q = 1,
  curve = 3,
): void {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, curve);
  const s = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  s.buffer = buf;
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.value = gain;
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(t0);
}

/** Dumpfes Klopfen auf den Tisch (gefiltertes Rauschen). */
function thump(ac: AudioContext, t0: number, out: AudioNode = ac.destination): void {
  noise(ac, t0, 0.12, 'lowpass', 220, 0.9, out);
}

type Sfx = (a: AudioContext, t: number, out: AudioNode) => void;

const SFX = {
  /** Du bist dran: deutlich, aber freundlich */
  turn: (a, t, o) => {
    tone(a, 659, t, 0.22, 'triangle', 0.13, o);
    tone(a, 988, t + 0.1, 0.28, 'triangle', 0.12, o);
    tone(a, 1319, t + 0.2, 0.45, 'sine', 0.1, o);
  },
  /** Die letzten Sekunden der Uhr */
  tick: (a, t, o) => {
    noise(a, t, 0.03, 'bandpass', 2400, 0.5, o, 3);
    tone(a, 1760, t, 0.05, 'square', 0.025, o);
  },
  /** Zeit abgelaufen, die KI hat übernommen */
  timeout: (a, t, o) => {
    tone(a, 523, t, 0.16, 'square', 0.05, o);
    tone(a, 392, t + 0.15, 0.16, 'square', 0.05, o);
    tone(a, 262, t + 0.3, 0.4, 'square', 0.05, o);
  },
  /** Leises Signal, wenn eine Meldung erscheint */
  msg: (a, t, o) => {
    tone(a, 1047, t, 0.09, 'sine', 0.04, o);
    tone(a, 1568, t + 0.06, 0.14, 'sine', 0.035, o);
  },
  /** Karten werden ausgeteilt */
  deal: (a, t, o) => [0, 0.07, 0.14].forEach((d) => noise(a, t + d, 0.05, 'highpass', 3000, 0.25, o)),
  card: (a, t, o) => tone(a, 320, t, 0.06, 'triangle', 0.05, o),
  knock: (a, t, o) => {
    thump(a, t, o);
    thump(a, t + 0.17, o);
  },
  win: (a, t, o) => [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.1, 0.35, 'triangle', 0.08, o)),
  lose: (a, t, o) => {
    tone(a, 392, t, 0.3, 'triangle', 0.07, o);
    tone(a, 311, t + 0.16, 0.45, 'triangle', 0.07, o);
  },
  pop: (a, t, o) => {
    tone(a, 880, t, 0.08, 'sine', 0.06, o);
    tone(a, 1320, t + 0.05, 0.1, 'sine', 0.05, o);
  },
  burn: (a, t, o) => {
    tone(a, 220, t, 0.25, 'sawtooth', 0.035, o);
    tone(a, 140, t + 0.08, 0.4, 'sawtooth', 0.035, o);
  },
  bomb: (a, t, o) => {
    thump(a, t, o);
    thump(a, t + 0.12, o);
    tone(a, 90, t, 0.55, 'square', 0.045, o);
  },
  nope: (a, t, o) => {
    tone(a, 260, t, 0.14, 'square', 0.04, o);
    tone(a, 200, t + 0.13, 0.22, 'square', 0.04, o);
  },
  /** Tomate klatscht auf */
  splat: (a, t, o) => {
    noise(a, t, 0.22, 'bandpass', 900, 1.4, o, 0.8, 2);
    tone(a, 130, t, 0.16, 'sine', 0.12, o, 60);
  },
  /** Ei: kurzes Knacken, dann Platschen */
  crack: (a, t, o) => {
    noise(a, t, 0.025, 'highpass', 3200, 0.9, o);
    noise(a, t + 0.05, 0.02, 'highpass', 2600, 0.7, o);
    noise(a, t + 0.09, 0.2, 'bandpass', 1100, 1.1, o, 0.9, 2);
  },
  /** Haufen plumpst */
  plop: (a, t, o) => tone(a, 420, t, 0.22, 'sine', 0.14, o, 110),
  /** Herz: Herzklopfen mit Spieluhr (erzeugter Ersatz, solange die Aufnahme lädt) */
  love: (a, t, o) => {
    tone(a, 784, t, 0.25, 'sine', 0.08, o);
    tone(a, 1175, t + 0.12, 0.4, 'sine', 0.07, o);
  },
  /** Hase: Schmatzer (erzeugter Ersatz, solange die Aufnahme lädt) */
  smack: (a, t, o) => {
    noise(a, t, 0.035, 'bandpass', 2200, 0.7, o, 2);
    tone(a, 1100, t + 0.01, 0.07, 'sine', 0.07, o, 380);
  },
  /** Revanche: Schlag und zwei Fanfarentöne */
  duel: (a, t, o) => {
    thump(a, t, o);
    tone(a, 392, t + 0.05, 0.22, 'sawtooth', 0.05, o);
    tone(a, 523, t + 0.25, 0.4, 'sawtooth', 0.05, o);
  },
  /** Zeitlupe: tiefer, fallender Ton */
  slowmo: (a, t, o) => tone(a, 300, t, 1.6, 'sine', 0.06, o, 100),
  /** Traurige Posaune für den Shithead (Ersatz, solange die Aufnahme lädt) */
  trombone: (a, t, o) => void trombone(a, t, o),
  /** Krone funkelt */
  crown: (a, t, o) => [1047, 1319, 1568, 2093].forEach((f, i) => tone(a, f, t + i * 0.06, 0.3, 'triangle', 0.05, o)),
} satisfies Record<string, Sfx>;

export type SoundName = keyof typeof SFX;

/** Für diese Töne gibt es Aufnahmen, die erzeugten Klänge springen nur ein, solange sie noch laden. */
const SAMPLE_OF: Partial<Record<SoundName, SampleName>> = {
  splat: 'tomato',
  crack: 'egg',
  plop: 'poo',
  crown: 'crown',
  pop: 'emote',
  deal: 'deal',
  trombone: 'sad',
  love: 'heart',
  smack: 'bunny',
};

const NOOP = (): void => undefined;

/** Spielton. `vol` unter 1 dämpft, etwa für fremde Würfe. Gibt eine Funktion zurück, die den Ton abbricht. */
export function sfx(name: SoundName, vol = 1): () => void {
  const ac = audio();
  if (App.muted || !ac) return NOOP;
  try {
    const sample = SAMPLE_OF[name];
    const played = sample ? startSample(ac, sample, ac.destination, Math.max(0, vol)) : null;
    if (played) return played.stop;
    // Eigener Bus pro Ton, damit er sich sanft abbrechen lässt
    const g = ac.createGain();
    g.gain.value = Math.max(0, vol);
    g.connect(ac.destination);
    SFX[name](ac, ac.currentTime + 0.01, g);
    return () => {
      try {
        g.gain.setTargetAtTime(0, ac.currentTime, 0.015);
        setTimeout(() => g.disconnect(), 300);
      } catch {
        /* schon vorbei */
      }
    };
  } catch {
    /* Ton ist nicht wichtig genug für einen Fehler */
    return NOOP;
  }
}

const lastAt: Partial<Record<SoundName, number>> = {};

/** Wie sfx, aber höchstens einmal in `gap` Millisekunden, für Töne, die sich sonst häufen. */
export function sfxCalm(name: SoundName, gap: number, vol = 1): void {
  const now = Date.now();
  if (now - (lastAt[name] ?? 0) < gap) return;
  lastAt[name] = now;
  void sfx(name, vol);
}

let SB: GainNode | null = null;

/** Eigener Ausgang fürs Soundboard mit Kompressor, damit mehrere Klänge nicht übersteuern. */
export function sbBus(ac: AudioContext): GainNode {
  if (!SB || SB.context !== ac) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    comp.connect(ac.destination);
    SB = ac.createGain();
    SB.connect(comp);
  }
  SB.gain.value = App.muted || App.sbOff ? 0 : 0.7;
  return SB;
}

/** Stummschalten wirkt sofort, auch mitten in einem Klang. */
export function setSbVolume(): void {
  if (SB) SB.gain.value = App.muted || App.sbOff ? 0 : 0.7;
}

const ICON_MUTED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
const ICON_SOUND =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

export function renderSoundBtn(): void {
  $('#btn-sound').innerHTML = App.muted ? ICON_MUTED : ICON_SOUND;
  $('#menu-sound').textContent = App.muted ? 'Ton einschalten' : 'Ton ausschalten';
  $('#menu-sb').textContent = App.sbOff ? 'Soundboard einschalten' : 'Soundboard ausschalten';
}

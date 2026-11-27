/*
 * Soundboard für alle am Tisch: Tröte, Wirbel, Uuuh, Applaus, Wah wah und Grillen. Alles synthetisch, ohne Dateien.
 * Gesendet wird über den Host, abgespielt bei allen, sobald der Logeintrag ankommt.
 */
import { SOUNDS } from '../game/constants';
import type { LogEntry } from '../game/types';
import { App } from './app';
import { $, $opt, esc, reduceMotion } from './dom';
import { toast } from './feedback';
import { playSample, type SampleName } from './samples';
import { audio, audioLocked, noise, sbBus, tone } from './sound';
import { clampToOpps, tossAnchor } from './toss';

export type SoundEntry = Extract<LogEntry, { k: 'sound' }>;

export const SOUND_META: Readonly<Record<string, { icon: string; label: string }>> = {
  horn: { icon: '📯', label: 'Tröte' },
  roll: { icon: '🥁', label: 'Wirbel' },
  ooh: { icon: '😮', label: 'Uuuh' },
  clap: { icon: '👏', label: 'Applaus' },
  sad: { icon: '🎺', label: 'Wah wah' },
  crick: { icon: '🦗', label: 'Grillen' },
};

type Clip = (a: AudioContext, t: number, out: AudioNode) => number;

/** Ein Ton der Posaune: Sägezahn durch einen Tiefpass, auf Wunsch mit Vibrato. */
function brass(a: AudioContext, f: number, t: number, dur: number, out: AudioNode, vib = 0, gain = 0.16): void {
  const o = a.createOscillator();
  const g = a.createGain();
  const lp = a.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t);
  if (vib) {
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = vib;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.linearRampToValueAtTime(1600, t + 0.08);
  lp.frequency.linearRampToValueAtTime(700, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp);
  lp.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Traurige Posaune, auch für spätere Zeremonien. Gibt die Länge in Sekunden zurück. */
export function trombone(a: AudioContext, t: number, out: AudioNode): number {
  [311, 294, 277].forEach((f, i) => brass(a, f, t + i * 0.32, 0.3, out));
  brass(a, 262, t + 0.96, 0.9, out, 6);
  return 1.9;
}

const CLIPS: Readonly<Record<string, Clip>> = {
  horn: (a, t, o) => {
    [466, 469].forEach((f) => {
      const osc = a.createOscillator();
      const g = a.createGain();
      const lp = a.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(350, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
      g.gain.setValueAtTime(0.12, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(lp);
      lp.connect(g);
      g.connect(o);
      osc.start(t);
      osc.stop(t + 0.95);
    });
    return 0.95;
  },
  roll: (a, t, o) => {
    for (let i = 0; i < 36; i++) noise(a, t + i * 0.028, 0.05, 'bandpass', 220, 0.25 + (i / 36) * 0.9, o, 1.2);
    noise(a, t + 1.02, 0.9, 'highpass', 5000, 0.5, o, 0.7, 1.5);
    noise(a, t + 1.02, 0.2, 'lowpass', 160, 1, o);
    return 1.9;
  },
  ooh: (a, t, o) => {
    [170, 196, 220, 240, 260].forEach((f, i) => {
      const osc = a.createOscillator();
      const g = a.createGain();
      const f1 = a.createBiquadFilter();
      const f2 = a.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 1.08, t + 0.45);
      osc.frequency.linearRampToValueAtTime(f * 0.86, t + 1.2);
      f1.type = 'bandpass';
      f1.frequency.value = 320;
      f1.Q.value = 4;
      f2.type = 'bandpass';
      f2.frequency.value = 800;
      f2.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.25 + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      osc.connect(f1);
      osc.connect(f2);
      f1.connect(g);
      f2.connect(g);
      g.connect(o);
      osc.start(t);
      osc.stop(t + 1.25);
    });
    return 1.25;
  },
  clap: (a, t, o) => {
    for (let i = 0; i < 45; i++) {
      const x = i / 45;
      const at = t + x * 1.5 + Math.random() * 0.03;
      noise(
        a,
        at,
        0.04,
        'bandpass',
        1200 + Math.random() * 900,
        0.5 * Math.sin(Math.PI * Math.min(1, x * 1.6)),
        o,
        1.5,
      );
    }
    return 1.6;
  },
  sad: (a, t, o) => trombone(a, t, o),
  crick: (a, t, o) => {
    for (let c = 0; c < 4; c++)
      for (let k = 0; k < 3; k++) tone(a, 4400, t + c * 0.42 + k * 0.045, 0.03, 'sine', 0.05, o);
    return 1.7;
  },
};

let playing = 0;
let hintShown = false;

/** Spielt einen Klang über den Soundboard-Bus. Höchstens zwei gleichzeitig pro Gerät. */
export function boardSfx(s: string): boolean {
  if (App.muted || App.sbOff) return false;
  const ac = audio();
  if (!ac) {
    if (audioLocked() && !hintShown) {
      hintShown = true;
      toast('Tippe kurz auf den Tisch, dann hörst du die Sounds.');
    }
    return false;
  }
  const clip = CLIPS[s];
  if (!clip || playing >= 2) return false;
  try {
    // Aufnahme, solange sie noch lädt der erzeugte Klang
    const len = playSample(ac, s as SampleName, sbBus(ac)) ?? clip(ac, ac.currentTime + 0.02, sbBus(ac));
    playing++;
    setTimeout(() => (playing = Math.max(0, playing - 1)), len * 1000 + 100);
    App.sbHeard++;
    return true;
  } catch {
    return false;
  }
}

/** Symbol mit Schallringen steigt über dem Platz auf, darunter der Name. */
export function soundFly(pid: string | undefined, s: string): void {
  const meta = SOUND_META[s];
  if (!meta || !SOUNDS.includes(s)) return;
  App.sbSeen++;
  const a = pid ? tossAnchor(pid) : null;
  const src = a?.el ?? $opt('#center');
  if (!src) return;
  const r = src.getBoundingClientRect();
  const p =
    a?.edge && a.el.matches('.opp')
      ? clampToOpps(r)
      : { x: r.left + r.width / 2 + (Math.random() - 0.5) * 50, y: r.top + Math.min(r.height / 2, 70) };
  const el = document.createElement('div');
  el.className = 'emo snd';
  const who = pid === App.me ? 'Du' : (App.view?.players.find((x) => x.id === pid)?.name ?? '');
  el.innerHTML = `<i>${meta.icon}</i><small>${esc(who)}</small>`;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  $('#fly').appendChild(el);
  const frames: Keyframe[] = reduceMotion()
    ? [
        { transform: 'translate(-50%, -50%)', opacity: 0 },
        { transform: 'translate(-50%, -50%)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, -50%)', opacity: 0 },
      ]
    : [
        { transform: 'translate(-50%, -30%) scale(.5)', opacity: 0 },
        { transform: 'translate(-50%, -80%) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -150%) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%, -210%) scale(.95)', opacity: 0 },
      ];
  el.animate(frames, { duration: 2000, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).onfinish = () =>
    el.remove();
  setTimeout(() => el.remove(), 2500);
}

/** Knöpfe fürs Reaktionsfenster und die Soundzeile im Ergebnisfenster. */
export function soundBtnsHTML(withLabels: boolean): string {
  return SOUNDS.map((s) => {
    const m = SOUND_META[s];
    return (
      `<button type="button" data-act="sb" data-s="${s}" aria-label="Klang ${m.label} abspielen" title="${m.label}"` +
      `${App.sbBlock ? ' aria-disabled="true"' : ''}><i>${m.icon}</i>${withLabels ? `<small>${m.label}</small>` : ''}</button>`
    );
  }).join('');
}

/** Sperre nach dem Senden, sichtbar in allen Soundknöpfen, ohne neu zu zeichnen. */
export function setSbBlock(on: boolean): void {
  App.sbBlock = on;
  document.body.classList.remove('sbcool');
  if (on) {
    void document.body.offsetWidth;
    document.body.classList.add('sbcool');
  }
  document.querySelectorAll('[data-act="sb"]').forEach((b) => {
    if (on) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
  });
}

/** Mehrere neue Klänge in einer Ansicht: alle Symbole, aber nur der neueste hörbare Klang. */
export function playSounds(list: readonly SoundEntry[]): void {
  list.forEach((e) => soundFly(e.p, e.s));
  const last = [...list].reverse().find((e) => !e.quiet);
  if (last) boardSfx(last.s);
}

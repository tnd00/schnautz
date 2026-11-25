/*
 * Entscheidungen der Rückmeldungen ohne DOM, damit Vitest sie prüfen kann. `src/ui/feedback.ts` misst den
 * Bildschirm und setzt sie um: welche Stufe im Schub bleibt, welcher Ton spielt, wo eine Meldung steht und
 * ob sich das Verschieben nach dem Zeichnen lohnt.
 */
import type { LogEntry } from '../game/types';
import { SEAT } from '../content/texts/seat';
import type { Cue, Level } from './levels';

/**
 * Schübe mit diesen Arten bleiben ungekürzt: Zeremonie, Rundenende, Partiesieg und Revanche-Ergebnis rechnen mit
 * der Länge aller Ansagen (annLeft, revealDelayOf), sonst fällt KI-Spott in die Enthüllung.
 */
const HOLD_KINDS: ReadonlySet<string> = new Set([
  'shend',
  'dkend',
  'cbend',
  'result',
  'winner',
  'cbround',
  'rematchend',
]);

export const holdsBatch = (fresh: readonly Pick<LogEntry, 'k'>[]): boolean => fresh.some((e) => HOLD_KINDS.has(e.k));

/** Stand eines Schubs: lief schon ein großer Moment, und darf überhaupt gekürzt werden? */
export interface BatchState {
  big: boolean;
  hold: boolean;
}

export const newBatch = (fresh: readonly Pick<LogEntry, 'k'>[] = []): BatchState => ({
  big: false,
  hold: holdsBatch(fresh),
});

/**
 * Pro Zug höchstens ein Großes. Takte (Rundenstart, Rundenende, Revanche, eigene Zeit um) zählen nicht mit,
 * ein zweites Großes wird mittel. Steht ein Ende im Schub, bleibt alles, wie es ist.
 */
export function levelInBatch(cue: Cue, b: BatchState): Level {
  if (cue.level !== 'big' || cue.beat) return cue.level;
  if (b.big && !b.hold) return 'mid';
  b.big = true;
  return 'big';
}

/** Was klingt: der Klang des Ereignisses, sonst der leise Meldeton oder nichts. */
export interface Tone<S extends string = string> {
  sfx?: S;
  calm: boolean;
}

/**
 * Klein ist still, außer das Ereignis hat einen eigenen Klang oder geschah automatisch (`cue.sound`).
 * Mittel klingt immer, mit eigenem Klang oder leise. Groß spielt den Meldeton in `announce` selbst.
 */
export function toneOf<S extends string>(cue: Cue, level: Level, sfx?: S): Tone<S> {
  switch (level) {
    case 'small':
      return sfx ? { sfx, calm: false } : { calm: !!cue.sound };
    case 'mid':
      return sfx ? { sfx, calm: false } : { calm: true };
    case 'big':
      return sfx ? { sfx, calm: false } : { calm: false };
  }
}

/** Wo eine Meldung steht: in der Spielfläche oder als Band über der Statuszeile. */
export type Slot = 'band' | 'field';

/**
 * Bin ich am Zug oder in der Tauschrunde, bleiben eigene Karten, Gegner, Trumpfzeile und Stapel frei, dann steht
 * alles als Band über der Statuszeile. Ohne freie Spielfläche ebenso, statt oben über den Gegnern.
 */
export const slotOf = (o: { swap: boolean; myMove: boolean; field: boolean }): Slot =>
  o.swap || o.myMove || !o.field ? 'band' : 'field';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Rechteck einer großen Meldung im Band: unten bündig mit der Statuszeile, nach oben bis knapp unter den Stapel,
 * höchstens `maxH` hoch und nie niedriger als die Statuszeile selbst.
 */
export function bandBox(status: Box, floor: number, maxH = 150): Box {
  const bottom = status.top + status.height;
  const top = Math.min(status.top, Math.max(floor + 4, bottom - maxH));
  return { left: status.left, width: status.width, top, height: bottom - top };
}

/** Nach dem Zeichnen nur verschieben, wenn sich die Lage um mehr als ein paar Pixel ändert (kein Flackern). */
export const MOVE_TOL = 4;
export const movedEnough = (a: Partial<Box>, b: Partial<Box>, tol = MOVE_TOL): boolean =>
  (['left', 'top', 'width', 'height'] as const).some((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > tol);

type SeatEntry = Extract<LogEntry, { k: 'takeover' | 'back' | 'tobot' }>;
const isSeat = (e: LogEntry): e is SeatEntry => e.k === 'takeover' || e.k === 'back' || e.k === 'tobot';

/**
 * Eigene Übernahme oder Rückkehr nach der ersten Ansicht (dort laufen keine Effekte). Zählt nur der letzte
 * Sitz-Eintrag für mich, `seen` ist die gemerkte Lognummer aus sessionStorage, damit Neuladen nichts wiederholt.
 */
export function ownSeatNote(log: readonly LogEntry[], me: string, seen: number): { n: number; text: string } | null {
  let last: SeatEntry | null = null;
  for (const e of log) if (isSeat(e) && e.p === me && (!last || e.n > last.n)) last = e;
  if (!last || last.n === seen) return null;
  if (last.k === 'takeover') return { n: last.n, text: SEAT.takeoverSelf(last.from) };
  if (last.k === 'back') return { n: last.n, text: SEAT.backSelf };
  return null;
}

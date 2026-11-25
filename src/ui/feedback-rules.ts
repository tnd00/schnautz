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
 * Der Klang des Ereignisses (Karte, Tipp, Schnappen, Blindtausch) gehört zum Ereignis, nicht zur Meldung. Er
 * spielt auf jeder Stufe, auch bei klein, und ersetzt dann den leisen Meldeton. Ohne eigenen Klang entscheidet
 * die Stufe: Klein hat keinen Meldeton, außer es geschah automatisch (`cue.sound`). Mittel spielt den leisen
 * Meldeton. Groß spielt den Meldeton in `announce` selbst.
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

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Nach dem Zeichnen nur verschieben, wenn sich die Lage um mehr als ein paar Pixel ändert (kein Flackern). */
export const MOVE_TOL = 4;
export const movedEnough = (a: Partial<Box>, b: Partial<Box>, tol = MOVE_TOL): boolean =>
  (['left', 'top', 'width', 'height'] as const).some((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > tol);

type SeatEntry = Extract<LogEntry, { k: 'takeover' | 'back' | 'tobot' }>;
const isSeat = (e: LogEntry): e is SeatEntry => e.k === 'takeover' || e.k === 'back' || e.k === 'tobot';

/**
 * So viele Einträge dürfen nach dem eigenen Sitz-Eintrag stehen, damit er noch als frisch gilt. Der Gastgeber
 * schickt die erste Ansicht gleich nach der Übernahme, dazwischen liegen höchstens ein paar Einträge.
 */
export const SEAT_FRESH = 6;

/**
 * Neuer Anfang (Partie, Runde, Lobby, Abbruch), wie ihn src/game loggt. Was davor geschah, gehört zu einer
 * früheren Partie oder zur Lobby: Eine Übernahme in der Lobby kam ohne Karten und heißt am Tisch nie „samt Karten“.
 */
const RESTART: ReadonlySet<string> = new Set(['game', 'lobby', 'abort', 'round', 'shdeal', 'dkdeal', 'cbdeal']);

/**
 * Eigene Übernahme oder Rückkehr nach der ersten Ansicht (dort laufen keine Effekte). Zählt nur der letzte
 * Sitz-Eintrag für mich und nur, solange er frisch ist: höchstens `SEAT_FRESH` Einträge danach und kein neuer
 * Anfang dazwischen. Sonst käme die Meldung in einem neuen Tab oder Browser noch einmal, solange der alte Eintrag
 * im Verlauf der Ansicht steht. `seen` ist die gemerkte Lognummer aus sessionStorage, damit Neuladen nichts
 * wiederholt.
 */
export function ownSeatNote(log: readonly LogEntry[], me: string, seen: number): { n: number; text: string } | null {
  let last: SeatEntry | null = null;
  for (const e of log) if (isSeat(e) && e.p === me && (!last || e.n > last.n)) last = e;
  if (!last || last.n === seen) return null;
  const at = last.n;
  const after = log.filter((e) => e.n > at);
  if (after.length > SEAT_FRESH || after.some((e) => RESTART.has(e.k))) return null;
  if (last.k === 'takeover') return { n: last.n, text: SEAT.takeoverSelf(last.from) };
  if (last.k === 'back') return { n: last.n, text: SEAT.backSelf };
  return null;
}

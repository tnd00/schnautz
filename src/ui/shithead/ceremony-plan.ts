/*
 * Zeitplan der Shithead-Zeremonie, ohne DOM, damit Node-Tests und die KI beim Host ihn nutzen können.
 * Die letzte Karte fliegt in Zeitlupe, danach kurz die Fertig-Meldung, dann die Enthüllung.
 */
import type { Card, LogEntry } from '../../game/types';

/** Zusätzliche Flugzeit der entscheidenden Karte in Zeitlupe */
export const ZER_SLOW_FLIGHT_MS = 740;
/** Abstand zwischen mehreren Karten eines Zugs */
export const SEQ_CARD_GAP_MS = 110;
/** So kurz steht die Fertig-Meldung direkt vor der Enthüllung */
export const ZER_SHDONE_MS = 1100;
/** So lange läuft die Enthüllung */
export const ZER_REVEAL_MS = 3000;

type PlayEntry = Extract<LogEntry, { k: 'shplay' | 'shthrow' | 'shbomb' }>;

/** Der Zug, mit dem die vorletzte Person fertig wurde und damit den Shithead festgelegt hat. */
export function decisivePlay(fresh: readonly LogEntry[]): PlayEntry | null {
  let end = -1;
  for (let i = fresh.length - 1; i >= 0; i--)
    if (fresh[i].k === 'shend' && fresh[i].p) {
      end = i;
      break;
    }
  if (end < 1) return null;
  const done = fresh[end - 1];
  if (done.k !== 'shdone') return null;
  for (let i = end - 2; i >= 0; i--) {
    const e = fresh[i];
    if ((e.k === 'shplay' || e.k === 'shthrow' || e.k === 'shbomb') && e.p === done.p) return e;
  }
  return null;
}

export const slowExtraMs = (e: { cards?: Card[] }): number =>
  ZER_SLOW_FLIGHT_MS + Math.max(0, (e.cards?.length ?? 1) - 1) * SEQ_CARD_GAP_MS;

/** Ungefähr ab hier läuft die Enthüllung. Die KI wartet so lange mit Spott und Würfen. */
export function zerRevealDelay(fresh: readonly LogEntry[], seqMs: number): number {
  const d = seqMs > 0 ? decisivePlay(fresh) : null;
  return seqMs + (d ? slowExtraMs(d) : 0) + ZER_SHDONE_MS + 240 + 600;
}

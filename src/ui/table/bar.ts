/*
 * Baustein Knopfleiste (Plan 2.8 Abschnitt 8, geruest.md 3.6): feste Knopfplätze, Gründe statt `disabled` und eine
 * Sperre gegen Tipps, die einem gerade getauschten Knopf galten. `BAR` ersetzt später App.dkBtn und App.cbBtn und gilt
 * dann für alle vier Spiele.
 *
 * Stummel aus Runde 1: `barHTML` zeichnet noch nichts, die Sperre greift erst, wenn `barHTML` `BAR` setzt. Runde 2
 * (Gerüst) baut den Baustein.
 */
import type { BarModel } from './types';

/** So lange nach einem Wechsel der Knopfzeile gilt ein Tipp als gemeint für den vorigen Knopf */
export const BAR_GUARD_MS = 400;

/** Zuletzt gezeichnete Knopfzeile und wann sie sich geändert hat */
export const BAR = { sig: '', at: 0 };

/** Knopfleiste als HTML, setzt `BAR` bei einem Wechsel. Stummel, Runde 2. */
export function barHTML(_b: BarModel | null): string {
  return '';
}

/** true, wenn der Tipp wohl dem vorigen Knopf galt */
export function barGuard(): boolean {
  return Date.now() - BAR.at < BAR_GUARD_MS;
}

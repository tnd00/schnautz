/*
 * Vorleser (Plan 2.8 Abschnitt 8, gefuehl.md 3.6): eine Region `#sr-say` fest in index.html außerhalb von `#app`, die
 * nur über textContent schreibt. Es gibt kein sayLog, der Vorleser hängt in `emit` (nach levelInBatch, nur groß und
 * eigene Meldungen) und in `showReject` (der Grundtext). So sagt er nie früher etwas als der Bildschirm (Zeremonie,
 * SEQ, Cabo-Einblendung).
 *
 * Stummel aus Runde 1: alles still. Runde 2 (A11y) baut ihn mit allen Sperren.
 */
import type { Status } from '../status';

/** Rang einer Ansage: eigener Zug, großer Moment, betrifft mich, sonstiges */
export type SayPrio = 'turn' | 'big' | 'mine' | 'info';

/** Satz in die Warteschlange. Stummel, Runde 2. */
export function say(_text: string, _prio?: SayPrio): void {
  // Stummel, Runde 2
}

/** Aus renderTable: nur bei geänderter Hauptzeile, entprellt. Stummel, Runde 2. */
export function sayStatus(_s: Status): void {
  // Stummel, Runde 2
}

/** Nach Laden, welcome und Aufwachen: Wasserstand setzen, nichts nachsprechen. Stummel, Runde 2. */
export function resetSay(_n: number): void {
  // Stummel, Runde 2
}

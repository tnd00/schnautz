/*
 * Vibration nach Stufe (Plan 2.8 Abschnitt 8, gefuehl.md 3.9): drei Muster statt freier navigator.vibrate-Stellen,
 * nur bei eigenen Ereignissen, nur mit Schalter, immer im try.
 *
 * Stummel aus Runde 1: vibriert nicht. Runde 2 (A11y) baut es und zieht die heutigen Stellen hierher.
 */
import type { Level } from '../levels';

/** Kurzer Stoß zur Stufe einer Meldung. Stummel, Runde 2. */
export function haptic(_tier: Level): void {
  // Stummel, Runde 2
}

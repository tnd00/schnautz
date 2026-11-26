/*
 * Vibration nach Stufe (Plan 2.8 Abschnitt 8, gefuehl.md 3.9): drei Muster statt freier navigator.vibrate-Stellen,
 * nur bei eigenen Ereignissen (das entscheidet der Aufrufer), nur auf Android, nur mit Schalter, immer im try.
 */
import type { Level } from '../levels';
import { prefs } from '../prefs';

const PATTERN: Record<Level, number | number[]> = { small: 8, mid: 20, big: [30, 40, 60] };

/** Gibt es hier echte Vibration? iPhones kennen navigator.vibrate nicht, Rechner haben keinen Motor. */
export const canVibrate = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && /Android/i.test(navigator.userAgent);

/** Kurzer Stoß zur Stufe einer Meldung. */
export function haptic(tier: Level): void {
  if (!canVibrate() || !prefs().haptic) return;
  try {
    navigator.vibrate(PATTERN[tier]);
  } catch {
    // Manche Browser verbieten Vibration ohne vorherige Geste
  }
}

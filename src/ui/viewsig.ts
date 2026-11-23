/*
 * Fingerabdruck einer Ansicht ohne Verlauf und ohne Restzeiten. Ändern sich nur Chat, Reaktionen, Würfe,
 * Klänge, die Restzeit der Uhr oder der Countdown zur nächsten Runde, zeichnet die Oberfläche nicht neu. So bricht kein Austeilen ab und keine
 * Kartenauswahl geht verloren. Nur Typ-Importe, damit Unit-Tests die Datei laden können.
 */
import type { View } from '../game/types';

export function viewSig(v: View): string {
  const flat: Record<string, unknown> = { ...v, log: null, n: null };
  if (v.clock) flat.clock = { ...v.clock, left: 0, at: 0 };
  if (v.next != null) flat.next = 1;
  if (v.sh?.win) flat.sh = { ...v.sh, win: { ...v.sh.win, left: 0, at: 0, until: 0 } };
  return JSON.stringify(flat);
}

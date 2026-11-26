/*
 * Fokus halten über ein Neuzeichnen (Plan 2.8 Abschnitt 8, gefuehl.md 3.4). Jedes fokussierbare Element am Tisch
 * trägt `data-fk`. Aufgerufen nur von renderTable und vom Ergebnisblatt.
 *
 * Stummel aus Runde 1: merkt sich nichts. Runde 2 (A11y) baut es.
 */

/** Gemerkter Fokus: Schlüssel aus `data-fk` und die Zone, in der er lag */
export interface FocusMark {
  fk: string;
  zone: string | null;
}

/** Vor dem Zeichnen: Schlüssel des Fokus merken, falls er in #table oder #overlay liegt. Stummel, Runde 2. */
export function holdFocus(): FocusMark | null {
  return null;
}

/** Nach dem Zeichnen: gleicher Schlüssel, sonst gleicher Platz in derselben Zone, sonst die Zone. Stummel, Runde 2. */
export function restoreFocus(_m: FocusMark | null): void {
  // Stummel, Runde 2
}

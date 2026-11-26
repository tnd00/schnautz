/*
 * Look am Tisch (Plan 2.8 Abschnitt 8, legacy.md 8 und 9): Sticker oder Legacy-Design als `data-look` an `html`, dazu
 * das Thema als `data-theme`, aber nur unter Sticker. Render-Code verzweigt nie nach dem Look, Ausnahmen stehen nur
 * hier (Paletten, theme-color, Nachladen der Stücke).
 *
 * Stummel aus Runde 1: setzt noch nichts und lädt nichts nach. Runde 2 (A11y) baut den Schalter, Runde 6 (Look)
 * schaltet auf Sticker als Standard und lädt das Legacy-Stück nach.
 */
import { PREFS_DEFAULT, type Prefs } from '../net/protocol';
import { setPref } from './prefs';

export type Look = Prefs['look'];

/** Bis Runde 6 'legacy', danach 'sticker'. Der Wert steht in PREFS_DEFAULT, damit asPrefs denselben nimmt. */
export const DEFAULT_LOOK: Look = PREFS_DEFAULT.look;

/** Paletten für Konfetti und Zeremonien nach Namen */
export type PaletteName = 'gold' | 'brown' | 'jester' | 'party';

/**
 * Erste Zeile in main.ts: setzt data-look und data-theme (data-theme nur unter Sticker) und lädt Sticker- und
 * Dunkel-Stück nach. Stummel, Runde 2.
 */
export function applyLook(): void {
  // Stummel, Runde 2
}

/** Speichert die Wahl. Anwenden, render() und relayoutOpps() kommen in Runde 2. */
export function setLook(l: Look): void {
  setPref('look', l);
}

/**
 * Farben einer Palette im Moment des Auslösens. Stummel: Bis Runde 6 die Listen aus ceremony-plan.ts und
 * animations.ts hierher zieht, liefert es nichts, aufgerufen wird es vorher nicht.
 */
export function paletteOf(_l: Look, _name: PaletteName): readonly string[] {
  return [];
}

/** Farbe der Browserleiste je Bildschirm, heute Filz am Tisch und Periwinkle im Rahmen */
export function themeColorOf(_l: Look, screen: string): string {
  return screen === 'game' ? '#123326' : '#6f6cf0';
}

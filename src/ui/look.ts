/*
 * Look am Tisch (Plan 2.8 Abschnitt 8, legacy.md 8 und 9): Sticker oder Legacy-Design als `data-look` an `html`, dazu
 * das Thema als `data-theme`, aber nur unter Sticker. Render-Code verzweigt nie nach dem Look, Ausnahmen stehen nur
 * hier (Paletten, theme-color, Nachladen der Stücke).
 *
 * Bis Runde 6 ist Legacy Standard, dann lädt nichts nach. Das Sticker-Stück und das dunkle Thema kommen per import()
 * erst, wenn jemand sie wählt.
 */
import { PREFS_DEFAULT, type Prefs } from '../net/protocol';
import { relayoutOpps } from './carousel';
import { prefs, setPref } from './prefs';
import { render } from './render/index';

export type Look = Prefs['look'];

/** Bis Runde 6 'legacy', danach 'sticker'. Der Wert steht in PREFS_DEFAULT, damit asPrefs denselben nimmt. */
export const DEFAULT_LOOK: Look = PREFS_DEFAULT.look;

/** Paletten für Konfetti und Zeremonien nach Namen */
export type PaletteName = 'gold' | 'brown' | 'jester' | 'party';

/**
 * Erste Zeile in main.ts: setzt data-look und data-theme (data-theme nur unter Sticker) und lädt Sticker- und
 * Dunkel-Stück nach. Der Schalter im Menü ist an, solange Legacy gilt.
 */
export function applyLook(): void {
  const p = prefs();
  const h = document.documentElement;
  h.dataset.look = p.look;
  if (p.look === 'sticker') {
    h.dataset.theme = p.theme;
    void import('../styles/looks/sticker.css');
    if (p.theme === 'dark') void import('../styles/looks/dark.css');
  } else delete h.dataset.theme;
  document.getElementById('menu-look')?.setAttribute('aria-checked', String(p.look === 'legacy'));
}

/** Speichert die Wahl, wendet sie an und zeichnet den Tisch neu (das Karussell misst neu aus). */
export function setLook(l: Look): void {
  setPref('look', l);
  applyLook();
  render();
  if (document.getElementById('opps')) relayoutOpps();
}

/* Heutige Farben aus ceremony-plan.ts und animations.ts. Runde 6 zieht die Listen dort hierher. */
const PALETTES: Record<PaletteName, readonly string[]> = {
  gold: ['#f3cd7d', '#e8b64c', '#fff1c7', '#c9962e', '#f6efdf'],
  brown: ['#9c6b3a', '#b07a42', '#c08a50', '#d9a96b', '#e8c9a0'],
  jester: ['#e0362b', '#f3cd7d', '#2e8b57', '#4a6fd1', '#f6efdf', '#b3312a'],
  party: ['#f3cd7d', '#d6a24a', '#f6efdf', '#b3312a', '#8fd3e8', '#7fe3a3'],
};

/** Farben einer Palette im Moment des Auslösens. Bis Runde 6 in beiden Looks die heutigen. */
export function paletteOf(_l: Look, name: PaletteName): readonly string[] {
  return PALETTES[name];
}

/** Farbe der Browserleiste je Bildschirm: Legacy Filz am Tisch und Periwinkle im Rahmen, Sticker immer Periwinkle */
export function themeColorOf(l: Look, screen: string): string {
  return l === 'legacy' && screen === 'game' ? '#123326' : '#6f6cf0';
}

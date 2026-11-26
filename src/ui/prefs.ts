/*
 * Vorlieben pro Gerät (Plan 2.8 Abschnitt 8, gefuehl.md 3.7): Look, Thema, Ruhig, Karten ziehen, Vibration,
 * Lautstärke und Zug-Ton. Look und Thema stehen einzeln unter `look` und `theme` im Speicher (so setzen sie auch
 * tests/e2e/fit.spec.ts und tests/design), alles Übrige als ein Objekt unter `prefs`. Geprüft wird mit asPrefs aus
 * src/net/protocol.ts.
 *
 * Ruhig hat eine Quelle, die Klasse `calm` an html: applyCalm setzt sie, reduceMotion() in dom.ts und das CSS
 * (`:where(html.calm)`) lesen sie. Der Bogen „Bedienung“ lädt nach (src/ui/render/prefs.ts).
 */
import { asPrefs, type Prefs } from '../net/protocol';
import { LS } from './storage';

export type { Prefs } from '../net/protocol';

/** Das Objekt unter `prefs` ohne Look und Thema, kaputt oder fehlend ist es leer */
function stored(): Record<string, unknown> {
  const raw = LS.get<unknown>('prefs', null);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Alle Vorlieben, geprüft */
export function prefs(): Prefs {
  return asPrefs({ ...stored(), look: LS.get<unknown>('look', null), theme: LS.get<unknown>('theme', null) });
}

/** Eine Vorliebe speichern */
export function setPref<K extends keyof Prefs>(k: K, val: Prefs[K]): void {
  if (k === 'look' || k === 'theme') {
    LS.set(k, val);
    return;
  }
  const rest = stored();
  delete rest.look;
  delete rest.theme;
  LS.set('prefs', { ...rest, [k]: val });
}

const SYS_CALM = '(prefers-reduced-motion: reduce)';
const sysCalm = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.(SYS_CALM).matches;

/** Bewegung reduzieren? 'on' an, 'off' aus, 'auto' folgt dem System. */
export const calm = (): boolean => {
  const c = prefs().calm;
  return c === 'on' || (c === 'auto' && sysCalm());
};

/** Bogen „Bedienung“ in #modal, lädt beim ersten Öffnen nach. */
export function openPrefs(): void {
  void import('./render/prefs').then((m) => m.renderPrefs());
}

let watching = false;

/** Setzt die Klasse calm an html. Folgt Änderungen der Systemeinstellung, solange Ruhig auf auto steht. */
export function applyCalm(): void {
  document.documentElement.classList.toggle('calm', calm());
  if (watching || !window.matchMedia) return;
  watching = true;
  window.matchMedia(SYS_CALM).addEventListener?.('change', () => {
    if (prefs().calm === 'auto') applyCalm();
  });
}

/*
 * Vorlieben pro Gerät (Plan 2.8 Abschnitt 8, gefuehl.md 3.7): Look, Kartendeck, Thema, Ruhig, Karten ziehen,
 * Vibration, Lautstärke und Zug-Ton. Look, Deck und Thema stehen einzeln im Speicher (so setzen sie auch die Tests und
 * tests/design), alles Übrige als ein Objekt unter `prefs`. Geprüft wird mit asPrefs aus src/net/protocol.ts.
 *
 * Der Look steht unter `design`. Unter `look` lag er, solange Legacy Standard war (vor Runde 6 von 2.8): Dort steht
 * meist nur der alte Standard und keine bewusste Wahl, deshalb wird der Schlüssel nicht mehr gelesen und alle
 * bekommen Sticker. Wer jetzt im Bogen „Design“ wählt, landet unter `design` (Migration, tests/unit/prefs.test.ts).
 *
 * Ruhig hat eine Quelle, die Klasse `calm` an html: applyCalm setzt sie, reduceMotion() in dom.ts und das CSS
 * (`:where(html.calm)`) lesen sie. Der Bogen „Bedienung“ lädt nach (src/ui/render/prefs.ts).
 */
import { asPrefs, type Prefs } from '../net/protocol';
import { LS } from './storage';

export type { Prefs } from '../net/protocol';

/** Was nicht im Speicher ankam (gesperrt oder voll), gilt bis zum Neuladen */
const session = new Map<string, unknown>();
const read = (k: string): unknown => (session.has(k) ? session.get(k) : LS.get<unknown>(k, null));
function keep(k: string, v: unknown): void {
  LS.set(k, v);
  if (JSON.stringify(LS.get<unknown>(k, null)) === JSON.stringify(v)) session.delete(k);
  else session.set(k, v);
}

/** Das Objekt unter `prefs` ohne Look, Deck und Thema, kaputt oder fehlend ist es leer */
function stored(): Record<string, unknown> {
  const raw = read('prefs');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const rest = { ...(raw as Record<string, unknown>) };
  for (const k of ['look', 'deck', 'theme']) delete rest[k];
  return rest;
}

/** Alle Vorlieben, geprüft */
export function prefs(): Prefs {
  return asPrefs({ ...stored(), look: read('design'), deck: read('deck'), theme: read('theme') });
}

/** Eine Vorliebe speichern */
export function setPref<K extends keyof Prefs>(k: K, val: Prefs[K]): void {
  if (k === 'look' || k === 'deck' || k === 'theme') keep(k === 'look' ? 'design' : k, val);
  else keep('prefs', { ...stored(), [k]: val });
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

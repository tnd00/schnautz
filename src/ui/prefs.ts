/*
 * Vorlieben pro Gerät (Plan 2.8 Abschnitt 8, gefuehl.md 3.7): Look, Thema, Ruhig, Karten ziehen, Vibration,
 * Lautstärke und Zug-Ton. Look und Thema stehen einzeln unter `look` und `theme` im Speicher (so setzen sie auch
 * tests/e2e/fit.spec.ts und tests/design), alles Übrige als ein Objekt unter `prefs`. Geprüft wird mit asPrefs aus
 * src/net/protocol.ts.
 *
 * Stummel aus Runde 1: Lesen und Schreiben gehen, wirken tut noch nichts. `calm()` folgt wie heute nur dem System.
 * Runde 2 (A11y) baut den Bogen „Bedienung“ und schließt Ton, Haptik und Ruhig an.
 */
import { asPrefs, type Prefs } from '../net/protocol';
import { reduceMotion } from './dom';
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

/** Bewegung reduzieren? Ersetzt später reduceMotion() an allen Stellen, heute nur das System. */
export const calm = (): boolean => reduceMotion();

/** Bogen „Bedienung“ in #modal. Stummel, Runde 2. */
export function openPrefs(): void {
  // Stummel, Runde 2
}

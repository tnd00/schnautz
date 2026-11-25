import { TAUNTS } from '../content/taunts';
import { hashStr } from './dom';

/** Daten für die Platzhalter. `what` ist der Titel des Verlierers im laufenden Spiel, etwa „Shithead“ oder „Durak“. */
export interface TauntData {
  name?: string;
  n?: number;
  what?: string;
}

/**
 * Frecher Spruch aus einer Kategorie. Mit `seed` immer derselbe (stabil über Neuzeichnen),
 * sonst zufällig. Platzhalter {name}, {n} und {what} werden ersetzt. Fehlt `what` (oder ist leer,
 * wie bei Spielen ohne Verlierertitel), steht dort „Verlierer“.
 */
export function taunt(cat: string, data?: TauntData | null, seed?: string | number): string {
  const arr = TAUNTS.screen[cat] ?? [];
  if (!arr.length) return '';
  const i = seed != null ? hashStr(String(seed) + cat) % arr.length : Math.floor(Math.random() * arr.length);
  const name = data?.name || 'Jemand';
  const n = data?.n != null ? String(data.n) : '';
  const what = data?.what || 'Verlierer';
  // Ersetzen per Funktion, damit $-Zeichen im Namen nicht als Muster gelten
  return arr[i]
    .replace(/\{name\}/g, () => name)
    .replace(/\{n\}/g, () => n)
    .replace(/\{what\}/g, () => what);
}

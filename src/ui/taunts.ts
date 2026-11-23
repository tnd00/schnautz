import { TAUNTS } from '../content/taunts';
import { hashStr } from './dom';

/**
 * Frecher Spruch aus einer Kategorie. Mit `seed` immer derselbe (stabil über Neuzeichnen),
 * sonst zufällig. Platzhalter {name} und {n} werden ersetzt.
 */
export function taunt(cat: string, data?: { name?: string; n?: number } | null, seed?: string | number): string {
  const arr = TAUNTS.screen[cat] ?? [];
  if (!arr.length) return '';
  const i = seed != null ? hashStr(String(seed) + cat) % arr.length : Math.floor(Math.random() * arr.length);
  const name = data?.name || 'Jemand';
  const n = data?.n != null ? String(data.n) : '';
  // Ersetzen per Funktion, damit $-Zeichen im Namen nicht als Muster gelten
  return arr[i].replace(/\{name\}/g, () => name).replace(/\{n\}/g, () => n);
}

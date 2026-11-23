/*
 * Sperren beim Host gegen Dauerfeuer bei Reaktionen, Würfen und Klängen. Sie hängen am Platz, nicht an der
 * Verbindung, ein Neuverbinden setzt sie also nicht zurück. Rein und ohne PeerJS, damit Unit-Tests sie laden können.
 */
import { BURST, SOUND_HOST_WINDOW_MS, SOUND_TABLE_MAX, SOUND_TABLE_WINDOW_MS } from '../game/constants';

export interface RateBook {
  /** Zeitpunkte der letzten angenommenen Aktionen je `art|platz` */
  seat: Record<string, number[]>;
  /** Zeitpunkte der hörbaren Klänge am ganzen Tisch */
  table: number[];
}

/** `quiet`: angenommen, aber nur als Symbol ohne Ton. `seat`: zu schnell, still verworfen. */
export type RateVerdict = 'ok' | 'quiet' | 'seat';

export function newRateBook(): RateBook {
  return { seat: Object.create(null) as Record<string, number[]>, table: [] };
}

/** Höchstens `max` Aktionen dieser Art pro Platz im Fenster. So gehen drei schnell hintereinander. */
export function allowBurst(
  book: RateBook,
  kind: string,
  pid: string,
  windowMs: number,
  now: number,
  max = BURST,
): boolean {
  const key = kind + '|' + pid;
  const hits = (book.seat[key] ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    book.seat[key] = hits;
    return false;
  }
  hits.push(now);
  book.seat[key] = hits;
  return true;
}

/** Platzsperre plus Tischfenster: Ist am Tisch zu viel los, wird der Klang nur noch gezeigt. */
export function rateSound(book: RateBook, pid: string, now: number): RateVerdict {
  if (!allowBurst(book, 'sound', pid, SOUND_HOST_WINDOW_MS, now)) return 'seat';
  book.table = book.table.filter((t) => now - t < SOUND_TABLE_WINDOW_MS);
  if (book.table.length >= SOUND_TABLE_MAX) return 'quiet';
  book.table.push(now);
  return 'ok';
}

/** Gerade Ruhe am Tisch? Die KI tutet nur in die Stille. */
export function tableQuiet(book: RateBook, now: number): boolean {
  return book.table.every((t) => now - t >= SOUND_TABLE_WINDOW_MS);
}

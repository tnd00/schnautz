/*
 * Sperre im eigenen Browser für Reaktionen, Würfe und Klänge: drei gehen schnell hintereinander, danach sperrt
 * der Knopf. Jede weitere Pause beginnt erst, wenn die vorige vorbei ist, und wird länger, höchstens 5 Sekunden.
 * Nach einer Weile Ruhe gehen wieder drei auf einmal. Rein, damit Unit-Tests sie prüfen können.
 */
import { BURST, BURST_CALM_MS, BURST_MAX_MS } from '../game/constants';

interface Burst {
  used: number;
  level: number;
  last: number;
  until: number;
}

const BOOK: Record<string, Burst> = {};

/** Darf ich gerade senden? `cool` größer als null heißt: danach so lange sperren. */
export function burst(kind: string, gap: number, now = Date.now()): { ok: boolean; cool: number } {
  const b = (BOOK[kind] ??= { used: 0, level: 0, last: -Infinity, until: 0 });
  if (now < b.until) return { ok: false, cool: 0 };
  if (now - b.last >= BURST_CALM_MS) {
    b.used = 0;
    b.level = 0;
  }
  b.last = now;
  b.used++;
  if (b.used < BURST) return { ok: true, cool: 0 };
  const cool = Math.min(BURST_MAX_MS, Math.round(gap * Math.pow(1.6, b.level)));
  b.level++;
  // Nach der Pause löst schon der nächste die nächste, längere Pause aus
  b.used = BURST - 1;
  b.until = now + cool;
  return { ok: true, cool };
}

export function resetBurst(): void {
  Object.keys(BOOK).forEach((k) => delete BOOK[k]);
}

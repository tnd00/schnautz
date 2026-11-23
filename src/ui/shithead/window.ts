/* Shithead: Countdown des 4er-Fensters am Anfang der Partie. */
import { SH_WIN_MS } from '../../game/constants';
import type { View } from '../../game/types';
import { $opt, num } from '../dom';

export const WIN = {
  id: null as number | null,
  until: 0,
  iv: null as ReturnType<typeof setInterval> | null,
};

function stopTicker(): void {
  if (WIN.iv) clearInterval(WIN.iv);
  WIN.iv = null;
}

/** Übernimmt Fenster und Restzeit aus der Ansicht und startet die Anzeige. */
export function syncWin(v: View | null): void {
  const w = v?.game === 'shithead' && v.phase === 'play' ? v.sh?.win : null;
  if (!w) {
    WIN.id = null;
    stopTicker();
    return;
  }
  const until = w.at ? num(w.at) : Date.now() + (w.left != null ? num(w.left) : SH_WIN_MS);
  if (WIN.id !== w.id || w.at || Math.abs(until - WIN.until) > 600) WIN.until = until;
  WIN.id = w.id;
  WIN.iv ??= setInterval(tickWin, 100);
}

export const winLeft = (): number => Math.max(0, WIN.until - Date.now());

export function resetWin(): void {
  WIN.id = null;
  stopTicker();
}

function tickWin(): void {
  if (!WIN.id) {
    stopTicker();
    return;
  }
  const el = $opt('#wincd');
  if (!el) return;
  const left = winLeft();
  el.style.setProperty('--p', (left / SH_WIN_MS).toFixed(3));
  const b = el.querySelector('b');
  if (b) b.textContent = String(Math.ceil(left / 1000));
}

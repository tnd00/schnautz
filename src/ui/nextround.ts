/* Countdown im Ergebnisfenster bis zur nächsten Schnautz-Runde. Die Restzeit kommt vom Host. */
import type { View } from '../game/types';

const NR = { at: 0, iv: null as ReturnType<typeof setInterval> | null };

/** Sekunden bis zur nächsten Runde, höchstens 10, oder 0 ohne Countdown. */
export function nextSecs(): number {
  return NR.at ? Math.min(10, Math.max(0, Math.ceil((NR.at - Date.now()) / 1000))) : 0;
}

function tick(): void {
  const s = nextSecs();
  document.querySelectorAll('.nextcd').forEach((e) => (e.textContent = String(s)));
  if (!NR.at && NR.iv) {
    clearInterval(NR.iv);
    NR.iv = null;
  }
}

export function syncNext(v: View): void {
  if (v.next == null || v.phase !== 'end') {
    NR.at = 0;
    tick();
    return;
  }
  const at = Date.now() + v.next;
  if (!NR.at || Math.abs(at - NR.at) > 700) NR.at = at;
  NR.iv ??= setInterval(tick, 250);
  tick();
}

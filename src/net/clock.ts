/*
 * Zeitlimit beim Host: Für jeden Menschen am Zug läuft eine Uhr. Sie steht, solange Animation oder 4er-Sperre laufen.
 * Ist sie abgelaufen, macht die normale KI genau einen Zug (in der Tauschrunde: tauschen und fertig).
 * Das gilt auch für den Host selbst und für alle, die gerade offline sind.
 */
import { botDecide } from '../bots/index';
import { act } from '../game/actions';
import { clockTurn, noteTimeout } from '../game/clock';
import { shAuto } from '../game/shithead';
import type { State, View } from '../game/types';
import { viewFor } from '../game/view';
import { App } from '../ui/app';
import type { Timer } from '../ui/dom';
import { H, hostCommit } from './host';

export const CLOCK = {
  key: '',
  until: 0,
  total: 0,
  ids: [] as string[],
  t: null as Timer | null,
};

export function resetClock(): void {
  if (CLOCK.t) clearTimeout(CLOCK.t);
  Object.assign(CLOCK, { key: '', until: 0, total: 0, ids: [], t: null });
}

/** Nach jeder Änderung: neuer Zug, neue Uhr. `pauseMs`: so lange laufen noch Animation oder Sperre. */
export function hostClock(st: State, pauseMs: number): void {
  const turn = clockTurn(st);
  if (!turn.ids.length) {
    resetClock();
    return;
  }
  if (turn.key !== CLOCK.key) {
    if (CLOCK.t) clearTimeout(CLOCK.t);
    CLOCK.key = turn.key;
    CLOCK.total = st.rules.turnSecs * 1000 * (turn.swap ? 2 : 1);
    CLOCK.until = Date.now() + Math.max(0, pauseMs) + CLOCK.total;
    const key = turn.key;
    CLOCK.t = setTimeout(() => timeUp(key), CLOCK.until - Date.now());
  }
  // In der Tauschrunde werden es weniger, sobald jemand fertig ist
  CLOCK.ids = turn.ids;
}

/** Restzeit für eine Ansicht. Der Host bekommt zusätzlich das Ende, damit seine Anzeige nicht springt. */
export function clockFor(v: View, own: boolean): void {
  if (!CLOCK.ids.length) {
    v.clock = null;
    return;
  }
  v.clock = { ids: CLOCK.ids.slice(), left: Math.max(0, CLOCK.until - Date.now()), total: CLOCK.total };
  if (own) v.clock.at = CLOCK.until;
}

/** Dev-Menü: Die laufende Uhr sofort ablaufen lassen. Ohne Uhr false. */
export function expireClock(): boolean {
  if (!CLOCK.key) return false;
  if (CLOCK.t) clearTimeout(CLOCK.t);
  timeUp(CLOCK.key);
  return true;
}

function timeUp(key: string): void {
  CLOCK.t = null;
  const st = H.st;
  if (App.role !== 'host' || !st) return;
  const turn = clockTurn(st);
  if (turn.key !== key) return;
  turn.ids.forEach((id) => autoMove(st, id, turn.swap));
  hostCommit();
}

/** Die normale KI zieht für jemanden. Klappt ihr Zug nicht, gibt es einen einfachen Ersatzzug. */
function autoMove(st: State, id: string, swap: boolean): void {
  noteTimeout(st, id);
  for (let i = 0; i < 12; i++) {
    const a = botDecide(viewFor(st, id), undefined, 'normal');
    if (!a) break;
    const err = act(st, id, a);
    if (err) {
      if (st.game === 'shithead') {
        if (st.phase === 'swap') act(st, id, { type: 'shready' });
        else shAuto(st, id);
      } else act(st, id, st.phase === 'choose' ? { type: 'keep' } : { type: 'pass' });
      return;
    }
    // Ein Zug reicht, nur die Tauschrunde geht bis "fertig"
    if (!swap || a.type === 'shready') return;
  }
}

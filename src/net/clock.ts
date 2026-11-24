/*
 * Zeitlimit beim Host: Für jeden Menschen am Zug läuft eine Uhr. Sie steht, solange Animation oder 4er-Sperre laufen.
 * Ist sie abgelaufen, macht die normale KI genau einen Zug (in der Tauschrunde: tauschen und fertig, bei Cabo den
 * ganzen Zug).
 * Das gilt auch für den Host selbst und für alle, die gerade offline sind.
 */
import { botDecide } from '../bots/index';
import { act, fallbackMove } from '../game/actions';
import { clockTurn, noteTimeout } from '../game/clock';
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
  // Endet durch einen Ersatzzug der Angriff (Durak), haben die anderen im neuen Angriff wieder volle Zeit
  const bout = st.dk?.bout;
  turn.ids.forEach((id) => {
    if (st.dk?.bout !== bout || !clockTurn(st).ids.includes(id)) return;
    autoMove(st, id, turn.swap);
  });
  hostCommit();
}

/**
 * Die normale KI zieht für jemanden. Klappt ihr Zug nicht, gibt es einen einfachen Ersatzzug. Bei Cabo spielt sie den
 * ganzen Zug zu Ende, denn die Uhr läuft erst mit dem nächsten Zug neu (src/game/clock.ts).
 */
function autoMove(st: State, id: string, swap: boolean): void {
  noteTimeout(st, id);
  const t0 = st.cb?.t;
  const caboTurn = () => st.game === 'cabo' && st.phase === 'play' && st.cb?.t === t0 && st.players[st.turn]?.id === id;
  for (let i = 0; i < 12; i++) {
    const a = botDecide(viewFor(st, id), undefined, 'normal');
    if (!a) break;
    const err = act(st, id, a);
    if (err) {
      fallbackMove(st, id);
      if (!caboTurn()) return;
      continue;
    }
    // Ein Zug reicht, nur die Tauschrunde geht bis "fertig". Bei Cabo ist nach dem Ansehen Schluss, auch wenn
    // dadurch die Runde beginnt und dieselbe Person als Erste dran ist
    if (swap) {
      if (a.type === 'shready' || a.type === 'cblook') return;
      continue;
    }
    if (!caboTurn()) return;
  }
  // Notfalls einfache Ersatzzüge, bis der Cabo-Zug wirklich vorbei ist, sonst liefe keine Uhr mehr
  for (let i = 0; i < 4 && caboTurn(); i++) fallbackMove(st, id);
}

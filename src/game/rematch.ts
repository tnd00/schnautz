/*
 * Revanche: Nach der Partie fordert der Shithead (bei Schnautz, wer zuletzt rausgeflogen ist) den Sieger heraus.
 * Fordern heißt bereit melden plus eine öffentliche Markierung. Es gibt keine eigene Phase, annehmen ist bereit.
 * Ausgewertet wird am Ende der nächsten Partie. Nur Imports aus state.ts, sonst entsteht ein Kreis über flow.ts.
 */
import { addLog, pIdx } from './state';
import type { Player, State } from './types';

const byId = (st: State, id: string | null | undefined): Player | null =>
  id ? (st.players[pIdx(st, id)] ?? null) : null;

/** Am Partieende: Wer darf fordern? Der Sieger nie. */
export function offerRematch(st: State, can: string[]): void {
  st.rematch = { game: st.games, can: can.filter((id) => id !== st.winner && pIdx(st, id) >= 0), by: null };
}

/** Darf diese Person gerade fordern? */
export function rematchOpen(st: State, pid: string): boolean {
  const r = st.rematch;
  return st.phase === 'over' && !!r && r.game === st.games && !r.by && Array.isArray(r.can) && r.can.includes(pid);
}

/** Forderung: Logeintrag, Markierung und Duell gegen den Sieger. Der Sieger muss danach selbst annehmen. */
export function challenge(st: State, pid: string): void {
  const r = st.rematch;
  if (!r) return;
  const me = byId(st, pid);
  const vsP = byId(st, st.reign?.win ?? null);
  const vs = vsP && vsP.id !== pid ? vsP.id : null;
  const old = st.rematchDuel;
  const same = !!old && !!vs && ((old.by === pid && old.vs === vs) || (old.by === vs && old.vs === pid));
  const n = old && old.res && old.game === st.games && same ? old.n + 1 : 1;
  addLog(st, { k: 'rematch', p: pid, name: me?.name, to: vs, tn: vsP?.name, c: n });
  r.by = pid;
  st.rematchDuel = vs ? { by: pid, vs, game: st.games + 1, n } : null;
  // Ein Mensch als Sieger soll bewusst annehmen, auch wenn er schon weiter wollte
  if (vsP && vs && !vsP.bot && vsP.online) vsP.ready = false;
}

/**
 * Am Ende der Revanche-Partie: Wer hat das Duell gewonnen? Shithead über den Platz, Schnautz über die Runde
 * des Ausscheidens (wer bis zum Schluss drin war, gilt als nie raus). Gleiche Runde heißt unentschieden.
 */
export function settleDuel(st: State): void {
  const d = st.rematchDuel;
  if (!d || d.game !== st.games || d.res) return;
  const by = byId(st, d.by);
  const vs = byId(st, d.vs);
  if (!by || !vs || by.gone || vs.gone) {
    st.rematchDuel = null;
    return;
  }
  let res: 'won' | 'lost' | 'tie';
  if (st.game === 'shithead') {
    const pb = by.place || Infinity;
    const pv = vs.place || Infinity;
    res = pb < pv ? 'won' : pb > pv ? 'lost' : 'tie';
  } else {
    const ob = by.id === st.winner ? Infinity : (by.outRound ?? Infinity);
    const ov = vs.id === st.winner ? Infinity : (vs.outRound ?? Infinity);
    res = ob > ov ? 'won' : ob < ov ? 'lost' : 'tie';
  }
  d.res = res;
  addLog(st, { k: 'rematchend', p: by.id, name: by.name, to: vs.id, tn: vs.name, res, c: d.n });
}

/** Ein neuer Mensch übernimmt den Platz: Forderungen und Duelle der KI gehen nicht auf ihn über. */
export function forgetRematch(st: State, id: string): void {
  const r = st.rematch;
  if (r && Array.isArray(r.can)) {
    r.can = r.can.filter((x) => x !== id);
    if (r.by === id) r.by = null;
  }
  const d = st.rematchDuel;
  if (d && (d.by === id || d.vs === id)) st.rematchDuel = null;
}

/** Fordert eine KI? Nur gegen einen menschlichen Sieger und nur, wenn kein Mensch selbst fordern darf. */
export function botRematchSeat(st: State): string | null {
  const r = st.rematch;
  if (!r || !Array.isArray(r.can)) return null;
  const winner = byId(st, st.reign?.win ?? null);
  if (!winner || winner.bot) return null;
  if (r.can.some((id) => !byId(st, id)?.bot)) return null;
  return r.can.find((id) => byId(st, id)?.bot && !byId(st, id)?.left && rematchOpen(st, id)) ?? null;
}

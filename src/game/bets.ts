/*
 * Tipps bei Shithead: Wer fertig ist, tippt einmal pro Partie, wer Shithead wird. Früh lohnt sich, die Punkte
 * schreibt der Host beim Tippen fest. Alles ist öffentlich. Nur Imports aus state.ts, sonst entsteht ein Kreis.
 */
import { MAX_SEATS } from './constants';
import { addLog, pIdx, statsOf } from './state';
import type { ActResult, Player, ShBet, ShBetResult, State, Table } from './types';

/** Wer noch Karten hat, kann Shithead werden. */
export function shBetCandidates(t: Table): Player[] {
  const S = t.sh;
  if (!S) return [];
  return t.players.filter((p) => !p.out && !S.finished.includes(p.id) && !!S.P[p.id]);
}

/** Punkte für einen Treffer, wenn jetzt getippt wird: Kandidaten minus eins, mindestens einer. */
export const shBetQuote = (t: Table): number => Math.max(1, shBetCandidates(t).length - 1);

const validBet = (b: unknown): b is ShBet =>
  !!b &&
  typeof b === 'object' &&
  typeof (b as ShBet).on === 'string' &&
  typeof (b as ShBet).q === 'number' &&
  typeof (b as ShBet).n === 'number';

/** Alle Tipps auf diese Person, der erste zuerst. */
export function shBetsOn(t: Table, on: string): ShBet[] {
  const bets = t.sh?.bets;
  if (!bets || typeof bets !== 'object') return [];
  return Object.values(bets)
    .filter((b) => validBet(b) && b.on === on)
    .sort((a, b) => a.n - b.n);
}

/** Darf diese Person gerade tippen? Fertig, noch kein Tipp und mindestens zwei im Rennen. */
export function shCanBet(t: Table, pid: string): boolean {
  const S = t.sh;
  return (
    t.game === 'shithead' &&
    t.phase === 'play' &&
    !!S &&
    S.finished.includes(pid) &&
    !S.bets?.[pid] &&
    shBetCandidates(t).length >= 2
  );
}

export function shPlaceBet(st: State, pid: string, raw: unknown): ActResult {
  const S = st.sh;
  if (!S || st.phase !== 'play') return 'Tippen geht nur während der Partie.';
  if (!S.finished.includes(pid)) return 'Tippen kannst du, sobald du fertig bist.';
  if (S.bets?.[pid]) return 'Du hast schon getippt.';
  const on = String(raw ?? '').slice(0, 40);
  const i = pIdx(st, on);
  if (i < 0) return 'Diese Person sitzt nicht am Tisch.';
  const target = st.players[i];
  if (target.out || S.finished.includes(on)) return `${target.name} ist schon fertig. Tipp auf jemand anderen.`;
  if (shBetCandidates(st).length < 2) return 'Tippen geht nur während der Partie.';
  if (!S.bets || typeof S.bets !== 'object') S.bets = {};
  const q = shBetQuote(st);
  addLog(st, { k: 'shbet', p: pid, on, onName: target.name, q });
  S.bets[pid] = { on, q, n: st.n };
  return null;
}

/** Abrechnung am Partieende: Treffer bringen die festgeschriebenen Punkte. */
export function shSettleBets(st: State, loser: string | null): ShBetResult[] {
  const bets = st.sh?.bets;
  if (!bets || typeof bets !== 'object') return [];
  const out: ShBetResult[] = [];
  Object.entries(bets)
    .filter(([, b]) => validBet(b))
    .sort(([, a], [, b]) => a.n - b.n)
    .forEach(([pid, b]) => {
      const p = st.players[pIdx(st, pid)];
      if (!p || p.gone) return;
      const q = Math.min(Math.max(1, Math.round(b.q)), MAX_SEATS.shithead - 2);
      const ok = !!loser && b.on === loser;
      const ps = statsOf(p, 'shithead');
      ps.bets = (ps.bets ?? 0) + 1;
      if (ok) {
        ps.betHits = (ps.betHits ?? 0) + 1;
        ps.betPts = (ps.betPts ?? 0) + q;
      }
      out.push({ p: pid, on: b.on, q, ok });
    });
  return out;
}

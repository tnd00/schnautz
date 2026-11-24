/*
 * Tipps bei Shithead und Durak: Wer fertig ist, tippt einmal pro Partie, wer verliert. Früh lohnt sich, die Punkte
 * schreibt der Host beim Tippen fest. Alles ist öffentlich. Nur Imports aus state.ts und games.ts, sonst entsteht
 * ein Kreis. Die Namen mit sh stammen aus der Zeit, als es Tipps nur bei Shithead gab.
 */
import { MAX_SEATS } from './constants';
import { unreachable } from './games';
import { addLog, pIdx, statsOf } from './state';
import type { ActResult, GameKind, Player, ShBet, ShBetResult, State, Table } from './types';

/** Der Teil des Spielzustands mit Fertigen, Plätzen und Tipps. Spiele ohne Verlierer am Ende haben keinen. */
interface BetPart {
  finished: string[];
  P: Record<string, unknown>;
  bets?: Record<string, ShBet>;
}

/** Spiele, bei denen am Ende ein Verlierer feststeht und Fertige tippen dürfen. */
export function hasBets(game: GameKind): boolean {
  switch (game) {
    case 'shithead':
    case 'durak':
      return true;
    case 'schnautz':
    case 'cabo':
      return false;
    default:
      return unreachable(game);
  }
}

export function betPart(t: Table): BetPart | null {
  switch (t.game) {
    case 'shithead':
      return t.sh;
    case 'durak':
      return t.dk ?? null;
    case 'schnautz':
    case 'cabo':
      return null;
    default:
      return unreachable(t.game);
  }
}

/** Wer noch Karten hat, kann verlieren. */
export function shBetCandidates(t: Table): Player[] {
  const S = betPart(t);
  if (!S) return [];
  return t.players.filter((p) => !p.out && !S.finished.includes(p.id) && p.id in S.P);
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
  const bets = betPart(t)?.bets;
  if (!bets || typeof bets !== 'object') return [];
  return Object.values(bets)
    .filter((b) => validBet(b) && b.on === on)
    .sort((a, b) => a.n - b.n);
}

/** Darf diese Person gerade tippen? Fertig, noch kein Tipp und mindestens zwei im Rennen. */
export function shCanBet(t: Table, pid: string): boolean {
  const S = betPart(t);
  return t.phase === 'play' && !!S && S.finished.includes(pid) && !S.bets?.[pid] && shBetCandidates(t).length >= 2;
}

export function shPlaceBet(st: State, pid: string, raw: unknown): ActResult {
  const S = betPart(st);
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
  const bets = betPart(st)?.bets;
  if (!bets || typeof bets !== 'object') return [];
  const out: ShBetResult[] = [];
  Object.entries(bets)
    .filter(([, b]) => validBet(b))
    .sort(([, a], [, b]) => a.n - b.n)
    .forEach(([pid, b]) => {
      const p = st.players[pIdx(st, pid)];
      if (!p || p.gone) return;
      const q = Math.min(Math.max(1, Math.round(b.q)), MAX_SEATS[st.game] - 2);
      const ok = !!loser && b.on === loser;
      const ps = statsOf(p, st.game);
      ps.bets = (ps.bets ?? 0) + 1;
      if (ok) {
        ps.betHits = (ps.betHits ?? 0) + 1;
        ps.betPts = (ps.betPts ?? 0) + q;
      }
      out.push({ p: pid, on: b.on, q, ok });
    });
  return out;
}

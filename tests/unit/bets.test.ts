import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { shBetCandidates, shBetQuote, shBetsOn, shCanBet } from '../../src/game/bets';
import { clockTurn } from '../../src/game/clock';
import { addPlayer, newState, statsOf } from '../../src/game/state';
import type { State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { codeOf, msgOf, playOut, rngF } from './helpers';

/** Shithead zu fünft, gespielt bis der Erste fertig ist. */
function firstDone(seed: number): State {
  const rng = rngF(seed);
  const st = newState('h', 'Host');
  ['Paul', 'Lena', 'Ede', 'Mia'].forEach((n, i) => addPlayer(st, `p${i + 1}`, n));
  act(st, 'h', { type: 'game', game: 'shithead' }, rng);
  act(st, 'h', { type: 'rules', rules: { turnSecs: 20 } }, rng);
  act(st, 'h', { type: 'start' }, rng);
  playOut(st, rng, (s) => (s.sh?.finished.length ?? 0) >= 1);
  expect(st.phase).toBe('play');
  return st;
}

describe('Tipps bei Shithead', () => {
  it('nur Fertige tippen, einmal, auf jemanden mit Karten, Quote beim Tippen festgeschrieben', () => {
    const st = firstDone(2);
    const done = st.sh!.finished[0];
    const other = st.players.find((p) => p.id !== done)!.id;
    expect(shCanBet(st, done)).toBe(true);
    expect(shCanBet(st, other)).toBe(false);
    expect(msgOf(act(st, other, { type: 'shbet', on: done }))).toBe('Tippen kannst du, sobald du fertig bist.');
    expect(codeOf(act(st, done, { type: 'shbet', on: 'weg' }))).toBe('any.noSuchSeat');
    expect(msgOf(act(st, done, { type: 'shbet', on: done }), st, done)).toBe(
      'Du bist schon fertig. Tipp auf jemand anderen.',
    );
    const q = shBetQuote(st);
    expect(q).toBe(Math.max(1, shBetCandidates(st).length - 1));
    expect(q).toBeGreaterThanOrEqual(1);
    const before = { turn: st.turn, last: st.last, key: clockTurn(st).key, win: st.sh!.win };
    expect(act(st, done, { type: 'shbet', on: other })).toBeNull();
    expect({ turn: st.turn, last: st.last, key: clockTurn(st).key, win: st.sh!.win }).toEqual(before);
    expect(st.sh!.bets![done]).toMatchObject({ on: other, q });
    expect(st.log.at(-1)).toMatchObject({ k: 'shbet', p: done, on: other, q });
    expect(msgOf(act(st, done, { type: 'shbet', on: other }))).toBe('Du hast schon getippt.');
    // Öffentlich für alle
    expect(viewFor(st, other).sh!.bets![done].on).toBe(other);
    expect(shBetsOn(st, other)).toHaveLength(1);
  });

  it('rechnet am Ende ab: Treffer bringen die Punkte, Fehltipps zählen nur als abgegeben', () => {
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const st = firstDone(seed);
      const done = st.sh!.finished[0];
      const rng = rngF(seed + 100);
      // Auf den mit den meisten Karten tippen
      const cand = st.players.filter((p) => p.id !== done && !st.sh!.finished.includes(p.id));
      const count = (id: string) => {
        const P = st.sh!.P[id];
        return P.hand.length + P.up.length + P.down.length;
      };
      const on = cand.sort((a, b) => count(b.id) - count(a.id))[0].id;
      const q = shBetQuote(st);
      act(st, done, { type: 'shbet', on });
      playOut(st, rng);
      expect(st.phase).toBe('over');
      const r = st.result!.reason === 'shithead' ? st.result! : null;
      const ok = r!.shithead === on;
      expect(r!.bets).toEqual([{ p: done, on, q, ok }]);
      const ps = statsOf(
        st.players.find((p) => p.id === done)!,
        'shithead',
      );
      expect(ps.bets).toBe(1);
      expect(ps.betPts ?? 0).toBe(ok ? q : 0);
      const end = st.log.find((e) => e.k === 'shend');
      expect(end && end.k === 'shend' ? !!end.hits?.[done] : false).toBe(ok);
      if (ok) hits++;
      else misses++;
    }
    expect(hits + misses).toBe(12);
  });

  it('beginnt jede Partie ohne Tipps und löscht den Tipp eines übernommenen Platzes', () => {
    const st = firstDone(6);
    const done = st.sh!.finished[0];
    const other = st.players.find((p) => p.id !== done && !st.sh!.finished.includes(p.id))!.id;
    act(st, done, { type: 'shbet', on: other });
    const rng = rngF(66);
    playOut(st, rng);
    st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
    expect(st.phase).toBe('swap');
    expect(st.sh!.bets).toBeUndefined();
  });
});

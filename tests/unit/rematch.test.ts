import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { botRematchSeat } from '../../src/game/rematch';
import { takeSeat } from '../../src/game/seats';
import { addBot, addPlayer, newState } from '../../src/game/state';
import type { GameKind, State } from '../../src/game/types';
import { playOut, rngF } from './helpers';
import { szResult } from '../../src/game/games';

/** Drei Menschen ohne Zeitlimit, Partie zu Ende gespielt. */
function finished(game: GameKind, seed: number): State {
  const rng = rngF(seed);
  const st = newState('h', 'Host');
  addPlayer(st, 'p1', 'Paul');
  addPlayer(st, 'p2', 'Lena');
  act(st, 'h', { type: 'game', game }, rng);
  act(st, 'h', { type: 'rules', rules: { turnSecs: 0, dealerChoice: false } }, rng);
  act(st, 'h', { type: 'start' }, rng);
  playOut(st, rng);
  expect(st.phase).toBe('over');
  return st;
}

describe('Revanche', () => {
  it('bietet bei Shithead dem Shithead die Revanche an, nie dem Sieger', () => {
    const st = finished('shithead', 3);
    const loser = st.sh!.shithead!;
    expect(st.rematch).toEqual({ game: st.games, can: [loser], by: null });
    expect(st.rematch!.can).not.toContain(st.winner);
  });

  it('bietet bei Schnautz an, wer in der letzten Runde rausgeflogen ist', () => {
    const st = finished('schnautz', 5);
    const res = szResult(st.result);
    const outs = Object.keys(res!.changes).filter((id) => res!.changes[id].to === 'out');
    expect(st.rematch!.can.sort()).toEqual(outs.filter((id) => id !== st.winner).sort());
  });

  it('fordern zählt als bereit, der Sieger muss selbst annehmen, dann läuft das Duell', () => {
    const rng = rngF(8);
    const st = finished('shithead', 8);
    const loser = st.sh!.shithead!;
    const winner = st.winner!;
    const third = st.players.find((p) => p.id !== loser && p.id !== winner)!.id;
    act(st, winner, { type: 'ready' }, rng);
    expect(act(st, loser, { type: 'rematch' }, rng)).toBeNull();
    expect(st.log.at(-1)).toMatchObject({ k: 'rematch', p: loser, to: winner, c: 1 });
    expect(st.rematch!.by).toBe(loser);
    expect(st.rematchDuel).toMatchObject({ by: loser, vs: winner, game: st.games + 1, n: 1 });
    // Wer schon weiter wollte, muss die Revanche bewusst annehmen
    expect(st.players.find((p) => p.id === winner)!.ready).toBe(false);
    act(st, third, { type: 'ready' }, rng);
    expect(st.phase).toBe('over');
    // Ein zweiter Tipp auf Revanche ist nur noch bereit
    const n = st.log.length;
    act(st, loser, { type: 'rematch' }, rng);
    expect(st.log.length).toBe(n);
    act(st, winner, { type: 'ready' }, rng);
    expect(st.phase).toBe('swap');
    playOut(st, rng);
    const end = st.log.find((e) => e.k === 'rematchend');
    expect(end).toMatchObject({ k: 'rematchend', p: loser, to: winner });
    const lp = st.players.find((p) => p.id === loser)!;
    const wp = st.players.find((p) => p.id === winner)!;
    const want = lp.place! < wp.place! ? 'won' : 'lost';
    expect(st.rematchDuel!.res).toBe(want);
  });

  it('zählt Revanchen in Folge und vergisst Duelle beim Übernehmen eines Platzes', () => {
    const rng = rngF(21);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'rules', rules: { turnSecs: 0 } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    let last = 0;
    for (let g = 0; g < 3; g++) {
      playOut(st, rng);
      const loser = st.sh!.shithead!;
      act(st, loser, { type: 'rematch' }, rng);
      const e = st.log.filter((x) => x.k === 'rematch').at(-1);
      // Dasselbe Paar gleich wieder: Die Zahl steigt
      if (e && e.k === 'rematch') {
        if (last) expect(e.c).toBe(last + 1);
        last = e.c;
      }
      st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
    }
    expect(last).toBeGreaterThanOrEqual(2);
    // Ein Platz mit Duell wird übernommen: Das Duell gilt nicht für den neuen Menschen
    st.rematchDuel = { by: 'p1', vs: 'h', game: st.games + 1, n: 1 };
    st.rematch = { game: st.games, can: ['p1'], by: null };
    takeSeat(st, 'p1', 'Neu');
    expect(st.rematchDuel).toBeNull();
    expect(st.rematch.can).toEqual([]);
  });

  it('lässt eine KI nur gegen einen menschlichen Sieger fordern und nie für einen Menschen', () => {
    const rng = rngF(4);
    const st = newState('h', 'Host');
    addBot(st, rng);
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'rules', rules: { turnSecs: 0 } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    playOut(st, rng);
    const bot = st.players.find((p) => p.bot)!.id;
    if (st.sh!.shithead === bot) expect(botRematchSeat(st)).toBe(bot);
    else expect(botRematchSeat(st)).toBeNull();
    // Ein KI-Platz ohne bot:true fordert nicht
    const n = st.log.length;
    act(st, bot, { type: 'rematch' }, rng);
    expect(st.log.length).toBe(n);
  });
});

describe('Partieende', () => {
  it('schreibt bei allen Wegen ins Ziel shdone direkt vor shend', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const st = finished('shithead', seed);
      const i = st.log.findIndex((e) => e.k === 'shend');
      expect(i).toBeGreaterThan(0);
      if (st.sh!.shithead) expect(st.log[i - 1].k).toBe('shdone');
    }
  });
});

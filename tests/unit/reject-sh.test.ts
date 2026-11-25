import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { shBombWhy, shThrowWhy } from '../../src/game/shithead';
import { addPlayer, newState } from '../../src/game/state';
import type { State } from '../../src/game/types';
import { codeOf, msgOf, rngF } from './helpers';

function table(seed = 7): State {
  const rng = rngF(seed);
  const st = newState('h', 'H');
  addPlayer(st, 'p1', 'Lena');
  act(st, 'h', { type: 'game', game: 'shithead' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  assert.ok(st.sh);
  return st;
}

function play(st: State): State {
  st.players.forEach((p) => act(st, p.id, { type: 'shready' }, rngF(1)));
  expect(st.phase).toBe('play');
  return st;
}

describe('Shithead: Ablehnungen als Codes', () => {
  it('teilt die Sammelgründe nach Phase auf', () => {
    const st = table();
    expect(codeOf(act(st, 'h', { type: 'shpickup' }, rngF(1)))).toBe('sh.swapping');
    play(st);
    expect(codeOf(act(st, 'h', { type: 'shswap', h: 0, u: 0 }, rngF(1)))).toBe('sh.swapOver');
    st.phase = 'over';
    expect(codeOf(act(st, 'h', { type: 'shswap', h: 0, u: 0 }, rngF(1)))).toBe('any.over');
  });

  it('nennt die Person am Zug und meldet Kartenfehler', () => {
    const st = play(table());
    const other = st.players[1 - st.turn].id;
    const now = st.players[st.turn].id;
    const r = act(st, other, { type: 'shpickup' }, rngF(1));
    expect(r).toEqual({ e: 'any.notYourTurn', a: { p: now } });
    expect(msgOf(r, st, other)).toBe('Du bist gerade nicht dran.');
    assert.ok(st.sh);
    if (st.sh.win) st.sh.win.lock = false;
    expect(codeOf(act(st, now, { type: 'shplay', from: 'hand', idx: [] }, rngF(1)))).toBe('any.pickCard');
    expect(codeOf(act(st, now, { type: 'shblind', i: 0 }, rngF(1)))).toBe('sh.blindLast');
  });

  it('Tauschen mit falschem Index und nach Fertig', () => {
    const st = table();
    expect(codeOf(act(st, 'h', { type: 'shswap', h: 99, u: 0 }, rngF(1)))).toBe('any.cardGone');
    act(st, 'h', { type: 'shready' }, rngF(1));
    expect(codeOf(act(st, 'h', { type: 'shswap', h: 0, u: 0 }, rngF(1)))).toBe('any.ready');
  });

  it('shThrowWhy und shBombWhy', () => {
    const st = play(table());
    const S = st.sh;
    assert.ok(S);
    S.win = { r: '4', by: [], id: st.n, lock: false };
    S.P.h.hand = ['H9'];
    expect(codeOf(shThrowWhy(st, 'h'))).toBe('sh.noFour');
    expect(codeOf(shBombWhy(st, 'h'))).toBe('sh.bombWin');
    S.win = null;
    expect(codeOf(shThrowWhy(st, 'h'))).toBe('sh.winClosed');
    st.rules.sh.cut = false;
    expect(codeOf(shBombWhy(st, 'h'))).toBe('sh.cutOff');
    st.rules.sh.cut = true;
    expect(codeOf(shBombWhy(st, 'h'))).toBe('sh.bombLate');
    S.P.h.hand = [];
    S.P.h.up = [];
    expect(codeOf(shThrowWhy(st, 'h'))).toBe('sh.blindOnly');
    expect(codeOf(shBombWhy(st, 'h'))).toBe('sh.blindOnly');
    S.finished.push('h');
    expect(codeOf(shThrowWhy(st, 'h'))).toBe('any.done');
    expect(codeOf(shBombWhy(st, 'h'))).toBe('any.done');
    st.phase = 'swap';
    expect(codeOf(shThrowWhy(st, 'h'))).toBe('sh.swapping');
  });

  it('Bombe über act: dauerhafte Gründe vor dem offenen Fenster', () => {
    const st = play(table());
    const S = st.sh;
    assert.ok(S);
    S.win = { r: '4', by: [], id: st.n, lock: false };
    S.P.h.hand = ['H9'];
    expect(codeOf(act(st, 'h', { type: 'shbomb' }, rngF(1)))).toBe('sh.bombWin');
    st.rules.sh.cut = false;
    expect(codeOf(act(st, 'h', { type: 'shbomb' }, rngF(1)))).toBe('sh.cutOff');
    expect(codeOf(shBombWhy(st, 'h'))).toBe('sh.cutOff');
    st.rules.sh.cut = true;
    S.P.h.hand = [];
    S.P.h.up = [];
    expect(codeOf(act(st, 'h', { type: 'shbomb' }, rngF(1)))).toBe('sh.blindOnly');
    expect(codeOf(shBombWhy(st, 'h'))).toBe('sh.blindOnly');
    S.win = null;
    S.P.h.hand = ['H9'];
    S.pile = ['CK'];
    expect(codeOf(act(st, 'h', { type: 'shbomb' }, rngF(1)))).toBe('sh.bombLate');
    S.finished.push('h');
    expect(codeOf(act(st, 'h', { type: 'shbomb' }, rngF(1)))).toBe('any.done');
  });

  it('vor dem Start, nach dem Ende und mit unpassender Karte', () => {
    const lobby = newState('h', 'H');
    addPlayer(lobby, 'p1', 'Lena');
    act(lobby, 'h', { type: 'game', game: 'shithead' }, rngF(1));
    expect(codeOf(act(lobby, 'h', { type: 'shpickup' }, rngF(1)))).toBe('any.notStarted');

    const st = play(table());
    const S = st.sh;
    assert.ok(S);
    S.win = null;
    const now = st.players[st.turn].id;
    S.P[now].hand = ['C5', 'D9'];
    S.pile = ['HK'];
    expect(act(st, now, { type: 'shplay', from: 'hand', idx: [0] }, rngF(1))).toEqual({
      e: 'sh.noFit',
      a: { c: 'C5', top: 'HK' },
    });
    S.P[now].hand = [];
    S.P[now].up = [];
    expect(codeOf(act(st, now, { type: 'shblind', i: 99 }, rngF(1)))).toBe('any.cardGone');
    expect(codeOf(act(st, now, { type: 'shfoo' } as never, rngF(1)))).toBe('any.unknown');
    const off = st.players.find((p) => p.id !== now)!.id;
    delete S.P[off];
    expect(codeOf(act(st, off, { type: 'shpickup' }, rngF(1)))).toBe('any.notPlaying');

    const over = play(table());
    over.phase = 'over';
    expect(codeOf(act(over, 'h', { type: 'shpickup' }, rngF(1)))).toBe('any.over');
    expect(codeOf(act(over, 'h', { type: 'shbomb' }, rngF(1)))).toBe('any.over');
  });
});

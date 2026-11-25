import { describe, expect, it } from 'vitest';
import { cbAct } from '../../src/game/cabo';
import type { State } from '../../src/game/types';
import { codeOf } from './helpers';

const base = (phase: State['phase'], snap = true): State =>
  ({
    phase,
    turn: 0,
    dealer: 0,
    players: [
      { id: 'a', ready: false },
      { id: 'b', ready: false },
    ],
    rules: { cb: { snap } },
    cb: {
      P: { a: [{ id: 1, c: 'H5' }], b: [{ id: 2, c: 'S5' }] },
      pile: [],
      deck: ['C2'],
      hold: null,
      power: null,
      cabo: null,
      know: {},
    },
  }) as unknown as State;

describe('Cabo Ablehnungen als Codes', () => {
  it('ohne Cabo-Zustand: noch nicht angefangen', () => {
    const st = base('play');
    delete (st as { cb?: unknown }).cb;
    expect(codeOf(cbAct(st, 'a', 0, { type: 'cbdraw', from: 'deck' }))).toBe('any.notStarted');
  });
  it('Zug in der Ansehrunde und nach dem Ende über phaseReject', () => {
    expect(codeOf(cbAct(base('peek'), 'a', 0, { type: 'cbdraw', from: 'deck' }))).toBe('cb.peeking');
    expect(codeOf(cbAct(base('end'), 'a', 0, { type: 'cbdraw', from: 'deck' }))).toBe('any.roundOver');
    expect(codeOf(cbAct(base('over'), 'a', 0, { type: 'cbcabo' }))).toBe('any.over');
  });
  it('Ansehen in der Partie: peekOver, nach dem Ende: Phasengrund', () => {
    expect(codeOf(cbAct(base('play'), 'a', 0, { type: 'cblook', ids: [1] }))).toBe('cb.peekOver');
    expect(codeOf(cbAct(base('end'), 'a', 0, { type: 'cblook', ids: [1] }))).toBe('any.roundOver');
  });
  it('Schnappen außerhalb der Runde und auf leere Ablage', () => {
    expect(codeOf(cbAct(base('peek'), 'b', 1, { type: 'cbsnap', id: 2 }))).toBe('cb.peeking');
    expect(codeOf(cbAct(base('over'), 'b', 1, { type: 'cbsnap', id: 2 }))).toBe('any.over');
    expect(codeOf(cbAct(base('play'), 'b', 1, { type: 'cbsnap', id: 2 }))).toBe('cb.pileEmpty');
    const st = base('play');
    st.cb!.pile.push('D5');
    expect(codeOf(cbAct(st, 'b', 1, { type: 'cbsnap', id: 99 }))).toBe('cb.pickOwn');
  });
  it('fremder Platz, nicht dran, unbekannter Zug', () => {
    expect(codeOf(cbAct(base('play'), 'x', 0, { type: 'cbdraw', from: 'deck' }))).toBe('any.notPlaying');
    const r = cbAct(base('play'), 'b', 1, { type: 'cbdraw', from: 'deck' });
    expect(r).toEqual({ e: 'any.notYourTurn', a: { p: 'a' } });
    expect(codeOf(cbAct(base('play'), 'a', 0, { type: 'cbnix' } as never))).toBe('any.unknown');
  });
  it('Cabo schon gerufen trägt den Rufer, keine Karten', () => {
    const st = base('play');
    st.cb!.cabo = 'b';
    expect(cbAct(st, 'a', 0, { type: 'cbcabo' })).toEqual({ e: 'cb.called', a: { p: 'b' } });
  });
});

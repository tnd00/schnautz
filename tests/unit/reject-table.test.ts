import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { addPlayer, newState } from '../../src/game/state';
import type { Action, State } from '../../src/game/types';
import { codeOf, msgOf, rngF } from './helpers';

const rng = rngF(7);

function lobby(): State {
  const st = newState('h', 'Host');
  addPlayer(st, 'p1', 'Lena');
  addPlayer(st, 'p2', 'Tom');
  return st;
}

/** Schnautz-Tisch in der Phase play, h ist dran. */
function playing(): State {
  const st = lobby();
  expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
  st.phase = 'play';
  st.spare = null;
  st.turn = 0;
  st.knocker = null;
  st.turns = 0;
  return st;
}

const res = (st: State, pid: string, a: unknown) => act(st, pid, a as Action, rng);

describe('Ablehnungen am Tisch als Codes', () => {
  it('Grundprüfungen', () => {
    const st = lobby();
    expect(codeOf(res(st, 'h', {}))).toBe('any.unknown');
    expect(codeOf(res(st, 'x', { type: 'chat', text: 'hi' }))).toBe('any.notSeated');
  });

  it('Lobby-Aktionen von Gästen: any.hostOnly', () => {
    const st = lobby();
    for (const type of ['rules', 'game', 'start', 'addbot', 'rmbot', 'tolobby', 'restart', 'skip', 'force'])
      expect(codeOf(res(st, 'p1', { type })), type).toBe('any.hostOnly');
    expect(msgOf(res(st, 'p1', { type: 'start' }))).toBe('Nur der Gastgeber kann das.');
  });

  it('Lobby-Aktionen außerhalb der Lobby', () => {
    const st = playing();
    expect(codeOf(res(st, 'h', { type: 'rules', rules: {} }))).toBe('any.lobbyOnly');
    expect(codeOf(res(st, 'h', { type: 'game', game: 'durak' }))).toBe('any.lobbyOnly');
    expect(codeOf(res(st, 'h', { type: 'rmbot', id: 'p1' }))).toBe('any.lobbyOnly');
    expect(codeOf(res(st, 'h', { type: 'start' }))).toBe('any.running');
    expect(codeOf(res(lobby(), 'h', { type: 'restart' }))).toBe('any.notStarted');
  });

  it('Spielwechsel mit zu vielen Leuten: seat.tooMany mit Zielspiel', () => {
    const st = lobby();
    // Alte Tische konnten mehr Menschen haben, als ein Spiel heute erlaubt
    for (let i = 3; i < 10; i++) st.players.push({ ...st.players[1], id: `p${i}`, name: `P${i}` });
    expect(res(st, 'h', { type: 'game', game: 'cabo' })).toEqual({ e: 'seat.tooMany', a: { max: 8, g: 'cabo' } });
  });

  it('Wahl des Gebers: phaseReject, sz.chosen, sz.dealerOnly', () => {
    const st = lobby();
    act(st, 'h', { type: 'start' }, rng);
    st.phase = 'choose';
    st.dealer = 1;
    expect(res(st, 'h', { type: 'swap', h: 0, m: 0 })).toEqual({ e: 'sz.choosing', a: { p: 'p1' } });
    expect(msgOf(res(st, 'h', { type: 'pass' }), st)).toBe('Erst entscheidet Lena, ob die Karten bleiben.');
    expect(res(st, 'h', { type: 'keep' })).toEqual({ e: 'sz.dealerOnly', a: { p: 'p1' } });
    st.phase = 'play';
    expect(codeOf(res(st, 'p1', { type: 'keep' }))).toBe('sz.chosen');
    st.phase = 'end';
    expect(codeOf(res(st, 'p1', { type: 'take' }))).toBe('any.roundOver');
    expect(codeOf(res(st, 'h', { type: 'pass' }))).toBe('any.roundOver');
    st.phase = 'over';
    expect(codeOf(res(st, 'h', { type: 'pass' }))).toBe('any.over');
  });

  it('Züge: nicht dran, Karte, Klopfen', () => {
    const st = playing();
    expect(res(st, 'p1', { type: 'pass' })).toEqual({ e: 'any.notYourTurn', a: { p: 'h' } });
    expect(codeOf(res(st, 'h', { type: 'swap', h: 5, m: 0 }))).toBe('any.cardGone');
    st.rules.knockFirst = false;
    expect(codeOf(res(st, 'h', { type: 'knock' }))).toBe('sz.knockEarly');
    st.knocker = 'p2';
    expect(res(st, 'h', { type: 'knock' })).toEqual({ e: 'sz.knocked', a: { p: 'p2' } });
  });

  it('Züge fremder Spiele: any.unknown (E8)', () => {
    const st = playing();
    expect(codeOf(res(st, 'h', { type: 'shplay', idx: [0] }))).toBe('any.unknown');
    for (const game of ['shithead', 'durak', 'cabo'] as const) {
      const t = lobby();
      t.game = game;
      act(t, 'h', { type: 'start' }, rng);
      expect(codeOf(res(t, 'h', { type: game === 'cabo' ? 'shplay' : 'cbdraw' })), game).toBe('any.unknown');
    }
  });

  it('Überspringen, wenn die Person am Zug online ist: any.allHere mit Platz', () => {
    const st = playing();
    expect(res(st, 'h', { type: 'skip' })).toEqual({ e: 'any.allHere', a: { p: 'h' } });
  });
});

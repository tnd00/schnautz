import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { seatGuest } from '../../src/game/seats';
import { beginGame } from '../../src/game/flow';
import { newState, pIdx } from '../../src/game/state';
import type { State } from '../../src/game/types';
import { rngF } from './helpers';

const ids = (st: State) => st.players.map((p) => p.id);

/** Gastgeber h, dazu Lena (offline) und Uschi (online) an einem Tisch mit vier Plätzen, ohne Auffüllen. */
function table(): State {
  const st = newState('h', 'Tahna');
  act(st, 'h', { type: 'rules', rules: { seats: 4 } }, rngF(1));
  seatGuest(st, 'p-lena', 'Lena');
  seatGuest(st, 'p-uschi', 'Uschi');
  st.players[pIdx(st, 'p-lena')].online = false;
  st.players[pIdx(st, 'p-lena')].offSince = 1;
  return st;
}

describe('Lobby: Plätze entfernen', () => {
  it('entfernt in der Lobby auch Menschen, die gerade offline sind', () => {
    const st = table();
    expect(act(st, 'h', { type: 'rmbot', id: 'p-lena' }, rngF(2))).toBeNull();
    expect(ids(st)).toEqual(['h', 'p-uschi']);
    expect(st.log.at(-1)).toMatchObject({ k: 'leave', p: 'p-lena', name: 'Lena' });
    // Ohne Auffüllen bleibt der Platz frei
    expect(st.rules.seats).toBe(4);
  });

  it('lässt online sitzende Menschen und den Gastgeber selbst sitzen', () => {
    const st = table();
    expect(act(st, 'h', { type: 'rmbot', id: 'p-uschi' }, rngF(3))).toBeNull();
    expect(act(st, 'h', { type: 'rmbot', id: 'h' }, rngF(3))).toBeNull();
    // Auch ein offline markierter Gastgeber bleibt
    st.players[pIdx(st, 'h')].online = false;
    expect(act(st, 'h', { type: 'rmbot', id: 'h' }, rngF(3))).toBeNull();
    expect(ids(st)).toEqual(['h', 'p-lena', 'p-uschi']);
  });

  it('lässt beim Auffüllen den Platz frei, die KI kommt erst beim Start', () => {
    const st = table();
    act(st, 'h', { type: 'rules', rules: { fill: true } }, rngF(4));
    expect(st.players).toHaveLength(3);
    expect(act(st, 'h', { type: 'rmbot', id: 'p-lena' }, rngF(4))).toBeNull();
    expect(st.rules.seats).toBe(4);
    expect(ids(st)).toEqual(['h', 'p-uschi']);
    expect(act(st, 'h', { type: 'start' }, rngF(4))).toBeNull();
    expect(st.players).toHaveLength(4);
    expect(st.players.filter((p) => p.bot)).toHaveLength(2);
  });

  it('erlaubt das nur dem Gastgeber und nie mitten in der Partie', () => {
    const st = table();
    expect(act(st, 'p-uschi', { type: 'rmbot', id: 'p-lena' }, rngF(5))).toBe('Nur der Gastgeber kann das.');
    expect(ids(st)).toContain('p-lena');

    // Wer beim Start offline ist, spielt nicht mit. Lena geht deshalb erst mitten in der Partie
    st.players[pIdx(st, 'p-lena')].online = true;
    expect(beginGame(st, rngF(5))).toBeNull();
    expect(st.phase).not.toBe('lobby');
    st.players[pIdx(st, 'p-lena')].online = false;
    expect(act(st, 'h', { type: 'rmbot', id: 'p-lena' }, rngF(5))).toBe('KIs lassen sich nur in der Lobby entfernen.');
    expect(ids(st)).toContain('p-lena');
  });

  it('entfernt KIs weiter wie bisher', () => {
    const st = newState('h', 'Tahna');
    act(st, 'h', { type: 'rules', rules: { seats: 3 } }, rngF(6));
    expect(act(st, 'h', { type: 'addbot' }, rngF(6))).toBeNull();
    const bot = st.players.find((p) => p.bot);
    expect(bot).toBeDefined();
    expect(act(st, 'h', { type: 'rmbot', id: bot!.id }, rngF(6))).toBeNull();
    expect(ids(st)).toEqual(['h']);
  });
});

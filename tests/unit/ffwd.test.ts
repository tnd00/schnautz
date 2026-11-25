import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { livePlayers, onlyBotsPlaying } from '../../src/game/games';
import { addPlayer, newState } from '../../src/game/state';
import type { GameKind, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { rngF } from './helpers';

/** Gastgeber mit drei KIs, ohne Auffüllen, das gewählte Spiel läuft. */
function table(game: GameKind, seed = 1): State {
  const rng = rngF(seed);
  const st = newState('h', 'Host');
  act(st, 'h', { type: 'rules', rules: { fill: false } }, rng);
  act(st, 'h', { type: 'game', game }, rng);
  while (st.players.length < 4) expect(act(st, 'h', { type: 'addbot' }, rng)).toBeNull();
  expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
  return st;
}

/** Auf dem Zustand und in der Ansicht des Gastgebers gleich */
const both = (st: State): boolean => {
  const a = onlyBotsPlaying(st);
  expect(onlyBotsPlaying(viewFor(st, 'h'))).toBe(a);
  return a;
};

describe('Nur noch KIs im Spiel', () => {
  it('Schnautz: erst wenn alle Menschen raus sind, nicht zwischen den Runden', () => {
    const st = table('schnautz');
    expect(livePlayers(st)).toHaveLength(4);
    expect(both(st)).toBe(false);
    st.players[0].out = true;
    expect(livePlayers(st).every((p) => p.bot)).toBe(true);
    expect(both(st)).toBe(true);
    st.phase = 'end';
    expect(both(st)).toBe(false);
  });

  it('Shithead: wer fertig ist, spielt nicht mehr mit', () => {
    const st = table('shithead');
    expect(st.phase).toBe('swap');
    expect(both(st)).toBe(false);
    st.phase = 'play';
    st.sh!.finished.push('h');
    expect(livePlayers(st).map((p) => p.id)).not.toContain('h');
    expect(both(st)).toBe(true);
  });

  it('Durak: fertig heißt raus aus dem Rennen', () => {
    const st = table('durak');
    expect(st.phase).toBe('play');
    expect(both(st)).toBe(false);
    st.dk!.finished.push('h');
    expect(both(st)).toBe(true);
  });

  it('Cabo: jeder Platz hat eine Reihe, ohne Reihe des Gastgebers nur KIs', () => {
    const st = table('cabo');
    expect(both(st)).toBe(false);
    delete st.cb!.P.h;
    expect(both(st)).toBe(true);
  });

  it('in Lobby und nach der Partie nie', () => {
    const st = table('durak');
    st.dk!.finished.push('h');
    st.phase = 'over';
    expect(both(st)).toBe(false);
    act(st, 'h', { type: 'tolobby' });
    expect(both(st)).toBe(false);
  });

  it('ein Mensch, der noch spielt, zählt auch neben fertigen KIs', () => {
    const st = table('shithead');
    st.phase = 'play';
    st.players.filter((p) => p.bot).forEach((p) => st.sh!.finished.push(p.id));
    expect(both(st)).toBe(false);
  });
});

describe('Partie abbrechen', () => {
  it('Neue Partie mitten im Spiel schreibt abort vor lobby, die Bilanz bleibt', () => {
    const rng = rngF(5);
    const st = table('shithead', 5);
    const stats = JSON.stringify(st.players.map((p) => p.stats));
    const n = st.n;
    expect(act(st, 'h', { type: 'restart' }, rng)).toBeNull();
    const fresh = st.log.filter((e) => e.n > n);
    const ai = fresh.findIndex((e) => e.k === 'abort');
    expect(ai).toBeGreaterThanOrEqual(0);
    expect(fresh[ai]).toMatchObject({ k: 'abort', p: 'h', game: 'shithead' });
    expect(fresh[ai]).not.toHaveProperty('bets');
    expect(fresh[ai + 1]).toMatchObject({ k: 'lobby' });
    expect(JSON.stringify(st.players.map((p) => p.stats))).toBe(stats);
    expect(st.phase).toBe('swap');
  });

  it('Zur Lobby mitten im Spiel ebenso, liegende Tipps verfallen', () => {
    const st = table('durak', 6);
    st.dk!.bets = { h: { on: st.players[1].id, q: 2, n: 1 } };
    const n = st.n;
    expect(act(st, 'h', { type: 'tolobby' })).toBeNull();
    const fresh = st.log.filter((e) => e.n > n);
    expect(fresh.map((e) => e.k)).toEqual(['abort', 'lobby']);
    expect(fresh[0]).toMatchObject({ k: 'abort', game: 'durak', bets: true });
    expect(st.phase).toBe('lobby');
  });

  it('Schnautz zwischen zwei Runden zählt als laufende Partie', () => {
    const st = table('schnautz', 7);
    st.phase = 'end';
    const n = st.n;
    act(st, 'h', { type: 'tolobby' });
    expect(st.log.filter((e) => e.n > n).map((e) => e.k)).toEqual(['abort', 'lobby']);
  });

  it('nach der Partie bricht Zur Lobby nichts ab', () => {
    const st = table('cabo', 8);
    st.phase = 'over';
    const n = st.n;
    act(st, 'h', { type: 'tolobby' });
    expect(st.log.filter((e) => e.n > n).map((e) => e.k)).toEqual(['lobby']);
  });

  it('nur der Gastgeber, Gäste schreiben nichts', () => {
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    act(st, 'h', { type: 'game', game: 'shithead' });
    act(st, 'h', { type: 'start' });
    const n = st.n;
    expect(act(st, 'p1', { type: 'tolobby' })).toBeTruthy();
    expect(act(st, 'p1', { type: 'restart' })).toBeTruthy();
    expect(st.n).toBe(n);
  });
});

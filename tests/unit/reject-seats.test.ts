import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { shPlaceBet } from '../../src/game/bets';
import { seatGuest } from '../../src/game/seats';
import { addBot, addPlayer, newState } from '../../src/game/state';
import type { State } from '../../src/game/types';
import { codeOf, msgOf, playOut, rngF } from './helpers';

function lobby(n: number): State {
  const st = newState('h', 'Host');
  for (let i = 1; i < n; i++) addPlayer(st, `p${i}`, `P${i}`);
  return st;
}

function shDone(): State {
  const rng = rngF(2);
  const st = lobby(5);
  act(st, 'h', { type: 'game', game: 'shithead' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  playOut(st, rng, (s) => (s.sh?.finished.length ?? 0) >= 1);
  return st;
}

describe('Ablehnungen bei Plätzen und Tipps als Codes', () => {
  it('addPlayer und addBot außerhalb der Lobby', () => {
    const rng = rngF(1);
    const st = lobby(2);
    act(st, 'h', { type: 'start' }, rng);
    expect(codeOf(addPlayer(st, 'x', 'X'))).toBe('any.running');
    expect(msgOf(addPlayer(st, 'x', 'X'))).toBe('Die Partie läuft schon.');
    expect(codeOf(addBot(st, rng))).toBe('any.lobbyOnly');
    expect(msgOf(addBot(st, rng))).toBe('Das geht nur in der Lobby.');
  });

  it('voller Tisch in der Lobby und während der Partie', () => {
    const rng = rngF(3);
    const st = lobby(2);
    act(st, 'h', { type: 'rules', rules: { seats: 2 } }, rng);
    expect(codeOf(addBot(st, rng))).toBe('seat.full');
    const r = seatGuest(st, 'x', 'X');
    expect('err' in r && codeOf(r.err)).toBe('seat.full');
    act(st, 'h', { type: 'start' }, rng);
    const r2 = seatGuest(st, 'y', 'Y');
    expect('err' in r2 && codeOf(r2.err)).toBe('seat.fullPlaying');
    expect('err' in r2 && msgOf(r2.err)).toBe('Die Partie läuft schon und alle Plätze sind besetzt.');
  });

  it('Tipps: geschlossen, doppelt, Ziel fertig', () => {
    const st = lobby(2);
    expect(codeOf(shPlaceBet(st, 'h', 'p1'))).toBe('bet.closed');
    const sh = shDone();
    const done = sh.sh!.finished[0];
    const self = act(sh, done, { type: 'shbet', on: done });
    expect(self).toEqual({ e: 'bet.targetDone', a: { p: done } });
    const other = sh.players.find((p) => p.id !== done)!;
    expect(msgOf(self, sh, other.id)).toBe(
      `${sh.players.find((p) => p.id === done)!.name} ist schon fertig. Tipp auf jemand anderen.`,
    );
    const on = sh.players.find((p) => p.id !== done && !p.out)!.id;
    expect(act(sh, done, { type: 'shbet', on })).toBeNull();
    expect(act(sh, done, { type: 'shbet', on })).toEqual({ e: 'bet.twice', a: { on } });
  });
});

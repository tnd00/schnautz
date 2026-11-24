import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { shCanBet } from '../../src/game/bets';
import { addBot, newState } from '../../src/game/state';
import type { GameKind, State } from '../../src/game/types';
import { spool, spoolCheck, type Spooled } from '../../src/dev/spool';
import { rngF } from './helpers';

/** Host mit KIs in der Lobby. */
function table(game: GameKind, bots: number): State {
  const rng = rngF(5);
  const st = newState('h', 'Host');
  act(st, 'h', { type: 'game', game }, rng);
  act(st, 'h', { type: 'rules', rules: { turnSecs: 0 } }, rng);
  for (let i = 0; i < bots; i++) addBot(st, rng);
  return st;
}

function ok(r: Spooled | null): Spooled {
  if (!r) throw new Error('nichts gefunden');
  return r;
}

describe('Zeitraffer im Dev-Menü', () => {
  it('Shithead: Stand direkt vor dem letzten Zug, ich werde Shithead', () => {
    const st0 = table('shithead', 3);
    const before = st0.log.length;
    const r = ok(spool(st0, 'h', 'end', 'lose', 11));
    expect(st0.phase).toBe('lobby');
    expect(r.st.phase).toBe('play');
    // Verlauf von vorher plus ein Hinweis, die Zählung läuft weiter
    expect(r.st.log).toHaveLength(before + 1);
    expect(r.st.log.at(-1)).toMatchObject({ k: 'chat', p: 'h' });
    expect(r.st.log.at(-1)!.n).toBe(r.st.n);
    expect(r.last).not.toBeNull();
    expect(act(r.st, r.last!.pid, r.last!.a)).toBeNull();
    expect(r.st.phase).toBe('over');
    expect(r.st.result).toMatchObject({ reason: 'shithead', shithead: 'h' });
    expect(r.st.log.map((e) => e.k).slice(-2)).toEqual(['shdone', 'shend']);
  });

  it('Shithead: ich gewinne, auch aus einer laufenden Partie', () => {
    const st0 = table('shithead', 3);
    const r0 = ok(spool(st0, 'h', 'end', 'any', 3));
    act(r0.st, r0.last!.pid, r0.last!.a);
    const r = ok(spool(r0.st, 'h', 'end', 'win', 21));
    act(r.st, r.last!.pid, r.last!.a);
    expect(r.st.phase).toBe('over');
    expect(r.st.sh!.finished[0]).toBe('h');
    expect(r.st.games).toBe(r0.st.games + 1);
  });

  it('Shithead: ich bin fertig und darf tippen, auch direkt nach einer Partie', () => {
    const r = ok(spool(table('shithead', 3), 'h', 'done', 'any', 4));
    expect(r.last).toBeNull();
    expect(r.st.phase).toBe('play');
    expect(shCanBet(r.st, 'h')).toBe(true);
    const over = ok(spool(table('shithead', 3), 'h', 'end', 'any', 6));
    act(over.st, over.last!.pid, over.last!.a);
    expect(over.st.phase).toBe('over');
    const next = ok(spool(over.st, 'h', 'done', 'any', 7));
    expect(next.st.games).toBe(over.st.games + 1);
    expect(shCanBet(next.st, 'h')).toBe(true);
  });

  it('Schnautz: Runde und Partie', () => {
    const round = ok(spool(table('schnautz', 2), 'h', 'round', 'any', 8));
    expect(['choose', 'play']).toContain(round.st.phase);
    act(round.st, round.last!.pid, round.last!.a);
    expect(['end', 'over']).toContain(round.st.phase);
    const end = ok(spool(table('schnautz', 2), 'h', 'end', 'win', 9));
    act(end.st, end.last!.pid, end.last!.a);
    expect(end.st.phase).toBe('over');
    expect(end.st.winner).toBe('h');
  });

  it('sagt, wenn etwas nicht geht', () => {
    expect(spoolCheck(table('schnautz', 2), 'done', 'h')).toMatch(/nur bei Shithead/);
    expect(spoolCheck(table('shithead', 2), 'round', 'h')).toMatch(/nur bei Schnautz/);
    expect(spoolCheck(table('shithead', 1), 'done', 'h')).toMatch(/drei Plätzen/);
    expect(spoolCheck(table('shithead', 0), 'end', 'h')).toMatch(/zwei Plätze/);
    expect(spoolCheck(table('shithead', 2), 'end', 'h')).toBeNull();
    expect(spool(table('shithead', 0), 'h', 'end', 'any', 1)).toBeNull();
  });
});

describe('Zeitraffer bei Durak', () => {
  it('spult bis vor das Ende, ich werde Durak oder gewinne, oder bis ich tippen darf', () => {
    const lose = ok(spool(table('durak', 3), 'h', 'end', 'lose', 41));
    expect(act(lose.st, lose.last!.pid, lose.last!.a)).toBeNull();
    expect(lose.st.result).toMatchObject({ reason: 'durak', durak: 'h' });
    expect(lose.st.log.at(-1)).toMatchObject({ k: 'dkend', p: 'h' });
    const win = ok(spool(table('durak', 3), 'h', 'end', 'win', 42));
    act(win.st, win.last!.pid, win.last!.a);
    expect(win.st.dk!.finished[0]).toBe('h');
    const done = ok(spool(table('durak', 4), 'h', 'done', 'any', 43));
    expect(shCanBet(done.st, 'h')).toBe(true);
    expect(spoolCheck(table('durak', 2), 'round', 'h')).toMatch(/nur bei Schnautz/);
  });
});

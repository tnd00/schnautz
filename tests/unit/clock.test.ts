import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { clockTurn, noteTimeout } from '../../src/game/clock';
import { DEFAULT_RULES } from '../../src/game/constants';
import { addBot, addPlayer, newState, sanitizeRules } from '../../src/game/state';
import { rngF } from './helpers';

describe('Zeitlimit', () => {
  it('nimmt nur die angebotenen Zeiten, 20 Sekunden sind voreingestellt', () => {
    expect(DEFAULT_RULES.turnSecs).toBe(20);
    expect(sanitizeRules({ turnSecs: 33 }).turnSecs).toBe(30);
    expect(sanitizeRules({ turnSecs: 500 }).turnSecs).toBe(90);
    expect(sanitizeRules({ turnSecs: 0 }).turnSecs).toBe(0);
    expect(sanitizeRules({ turnSecs: 'bald' }).turnSecs).toBe(20);
  });

  it('läuft für Menschen am Zug und nicht für KIs, mit jedem Zug beginnt sie neu', () => {
    const rng = rngF(1);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    addBot(st, rng);
    act(st, 'h', { type: 'rules', rules: { dealerChoice: false } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const who = st.players[st.turn];
    const t = clockTurn(st);
    expect(t.ids).toEqual(who.bot ? [] : [who.id]);
    // Einen Menschen an den Zug bringen und ziehen lassen
    st.turn = 0;
    const before = clockTurn(st);
    expect(before.ids).toEqual(['h']);
    expect(act(st, 'h', { type: 'pass' }, rng)).toBeNull();
    const after = clockTurn(st);
    expect(after.key).not.toBe(before.key);

    // Ausgeschaltet läuft keine Uhr (eingestellt wird das in der Lobby)
    st.rules.turnSecs = 0;
    expect(clockTurn(st).ids).toEqual([]);
  });

  it('läuft in der Tauschrunde für alle, die noch nicht fertig sind, mit einer gemeinsamen Uhr', () => {
    const rng = rngF(2);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    addBot(st, rng);
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const t = clockTurn(st);
    expect(t.swap).toBe(true);
    expect(t.ids.sort()).toEqual(['h', 'p1']);
    act(st, 'p1', { type: 'shready' }, rng);
    const t2 = clockTurn(st);
    expect(t2.ids).toEqual(['h']);
    expect(t2.key).toBe(t.key);
  });

  it('hält im Verlauf fest, wenn die KI wegen der Zeit gezogen hat', () => {
    const st = newState('h', 'Host');
    noteTimeout(st, 'h');
    expect(st.log.at(-1)).toMatchObject({ k: 'timeout', p: 'h' });
  });
});

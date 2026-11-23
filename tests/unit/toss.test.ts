import { describe, expect, it } from 'vitest';
import { act, soundOk } from '../../src/game/actions';
import { botTossReply } from '../../src/bots/toss';
import { clockTurn } from '../../src/game/clock';
import { addBot, addPlayer, cosmeticOnly, newState } from '../../src/game/state';
import type { LogEntry, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { rngF } from './helpers';

/** Schnautz mit Host, Paul und einer KI, Zeitlimit an, mitten in der Partie. */
function table(game: 'schnautz' | 'shithead' = 'schnautz'): { st: State; bot: string } {
  const rng = rngF(4);
  const st = newState('h', 'Host');
  addPlayer(st, 'p1', 'Paul');
  addBot(st, rng);
  act(st, 'h', { type: 'game', game }, rng);
  act(st, 'h', { type: 'rules', rules: { dealerChoice: false, turnSecs: 20 } }, rng);
  act(st, 'h', { type: 'start' }, rng);
  return { st, bot: st.players.find((p) => p.bot)!.id };
}

const tosses = (st: State) => st.log.filter((e) => e.k === 'toss');
const sounds = (st: State) => st.log.filter((e) => e.k === 'sound');

describe('Wurfgeschosse', () => {
  it('schreibt nur einen Logeintrag, Zug und Uhr bleiben unberührt', () => {
    const { st } = table();
    st.turn = 0;
    const before = { last: st.last, turn: st.turn, key: clockTurn(st).key };
    expect(act(st, 'p1', { type: 'toss', item: 'tomato', to: 'h' })).toBeNull();
    expect(st.log.at(-1)).toMatchObject({ k: 'toss', p: 'p1', to: 'h', item: 'tomato', name: 'Paul' });
    expect({ last: st.last, turn: st.turn, key: clockTurn(st).key }).toEqual(before);
    // Für alle sichtbar, auch für Unbeteiligte
    expect(viewFor(st, 'h').log.some((e) => e.k === 'toss')).toBe(true);
  });

  it('verwirft Unsinn still, nur ein fehlendes Ziel bekommt einen Hinweis', () => {
    const { st, bot } = table();
    const n = st.log.length;
    expect(act(st, 'p1', { type: 'toss', item: 'brick' as never, to: 'h' })).toBeNull();
    expect(act(st, 'p1', { type: 'toss', item: 'egg', to: 'p1' })).toBeNull();
    expect(act(st, bot, { type: 'toss', item: 'egg', to: 'h' })).toBeNull();
    expect(st.log.length).toBe(n);
    expect(act(st, 'p1', { type: 'toss', item: 'egg', to: 'weg' })).toBe('Die Person sitzt nicht mehr am Tisch.');
    expect(act(st, bot, { type: 'toss', item: 'crown', to: 'h', bot: true })).toBeNull();
    expect(st.log.at(-1)).toMatchObject({ k: 'toss', p: bot, item: 'crown' });
    for (const item of ['heart', 'bunny'] as const) {
      expect(act(st, 'p1', { type: 'toss', item, to: 'h' })).toBeNull();
      expect(st.log.at(-1)).toMatchObject({ k: 'toss', item });
    }
  });

  it('geht nicht in der Lobby, aber in der Tauschrunde und für Fertige', () => {
    const lobby = newState('h', 'Host');
    addPlayer(lobby, 'p1', 'Paul');
    act(lobby, 'p1', { type: 'toss', item: 'egg', to: 'h' });
    expect(tosses(lobby)).toHaveLength(0);

    const { st } = table('shithead');
    expect(st.phase).toBe('swap');
    expect(act(st, 'h', { type: 'toss', item: 'poo', to: 'p1' })).toBeNull();
    st.players.find((p) => p.id === 'h')!.out = true;
    expect(act(st, 'h', { type: 'toss', item: 'crown', to: 'p1' })).toBeNull();
    expect(tosses(st)).toHaveLength(2);
  });

  it('hält höchstens sechs Würfe im Verlauf und verdrängt weder Reaktionen noch Spielzüge', () => {
    const { st } = table();
    const moves = st.log.filter((e) => !['toss', 'emote', 'sound', 'chat'].includes(e.k)).length;
    for (let i = 0; i < 6; i++) act(st, 'h', { type: 'emote', e: '😂' });
    for (let i = 0; i < 8; i++) act(st, 'p1', { type: 'toss', item: 'tomato', to: 'h' });
    expect(tosses(st)).toHaveLength(6);
    expect(st.log.filter((e) => e.k === 'emote')).toHaveLength(6);
    for (let i = 0; i < 6; i++) act(st, 'h', { type: 'emote', e: '🔥' });
    expect(tosses(st)).toHaveLength(6);
    expect(st.log.filter((e) => !['toss', 'emote', 'sound', 'chat'].includes(e.k)).length).toBe(moves);
  });

  it('lässt die KI nur auf Treffer von Menschen antworten, nie auf einem verlassenen Platz', () => {
    const { st, bot } = table();
    const e = (p: string, item: 'tomato' | 'crown' = 'tomato'): Extract<LogEntry, { k: 'toss' }> => ({
      k: 'toss',
      n: 1,
      p,
      to: bot,
      item,
    });
    const v = viewFor(st, bot);
    expect(botTossReply(v, e('h'), 0.1)).toEqual({ item: 'tomato', to: 'h' });
    expect(botTossReply(v, e('h'), 0.5)).toBeNull();
    expect(botTossReply(v, e('h', 'crown'), 0.1)).toEqual({ item: 'crown', to: 'h' });
    expect(botTossReply(v, e('h', 'crown'), 0.2)).toBeNull();
    expect(botTossReply(viewFor(st, 'p1'), e('h'), 0.1)).toBeNull();
    st.players.find((p) => p.id === bot)!.left = true;
    expect(botTossReply(viewFor(st, bot), e('h'), 0.1)).toBeNull();
  });
});

describe('Soundboard', () => {
  it('schreibt einen Klang ins Log, quiet nur wenn mitgegeben', () => {
    const { st } = table();
    st.turn = 0;
    const key = clockTurn(st).key;
    expect(act(st, 'p1', { type: 'sound', s: 'horn' })).toBeNull();
    expect(st.log.at(-1)).toMatchObject({ k: 'sound', p: 'p1', s: 'horn' });
    expect(st.log.at(-1)).not.toHaveProperty('quiet');
    act(st, 'p1', { type: 'sound', s: 'clap', quiet: true });
    expect(st.log.at(-1)).toMatchObject({ k: 'sound', s: 'clap', quiet: true });
    expect(clockTurn(st).key).toBe(key);
  });

  it('kennt nur die sechs Klänge, keine Lobby und das KI-Zeichen muss zum Platz passen', () => {
    const { st, bot } = table();
    expect(soundOk(st, 'p1', { type: 'sound', s: 'airhorn' })).toBe(false);
    expect(soundOk(st, bot, { type: 'sound', s: 'horn' })).toBe(false);
    expect(soundOk(st, bot, { type: 'sound', s: 'horn', bot: true })).toBe(true);
    expect(soundOk(st, 'p1', { type: 'sound', s: 'horn', bot: true })).toBe(false);
    const n = st.log.length;
    act(st, bot, { type: 'sound', s: 'horn' });
    act(st, 'p1', { type: 'sound', s: 'airhorn' });
    expect(st.log.length).toBe(n);
    const lobby = newState('h', 'Host');
    expect(soundOk(lobby, 'h', { type: 'sound', s: 'horn' })).toBe(false);
  });

  it('hält höchstens vier Klänge im Verlauf, Reaktionen bleiben', () => {
    const { st } = table();
    act(st, 'h', { type: 'emote', e: '😂' });
    for (const s of ['horn', 'roll', 'ooh', 'clap', 'sad', 'crick']) act(st, 'p1', { type: 'sound', s });
    expect(sounds(st).map((e) => (e.k === 'sound' ? e.s : ''))).toEqual(['ooh', 'clap', 'sad', 'crick']);
    expect(st.log.filter((e) => e.k === 'emote')).toHaveLength(1);
  });

  it('erkennt Commits ohne Spielzug, damit die KI ihre Denkpause behält', () => {
    const e = (k: string) => ({ k, n: 1 }) as LogEntry;
    expect(cosmeticOnly([e('toss')])).toBe(true);
    expect(cosmeticOnly([e('emote'), e('chat'), e('sound')])).toBe(true);
    expect(cosmeticOnly([])).toBe(false);
    expect(cosmeticOnly([e('toss'), e('shplay')])).toBe(false);
  });
});

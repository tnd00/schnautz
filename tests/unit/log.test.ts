/*
 * Verlauf aus dem Textkatalog (src/content/texts/log.ts). Jede Logart wird aus mehreren Blickwinkeln gerendert und
 * mit dem Schnappschuss verglichen. Der Schnappschuss stammt aus der Fassung vor dem Umbau (2.6, alles in
 * src/ui/render/log.ts), jede Zeile bleibt wortgleich, außer sie wurde mit Absicht geändert (2.7: Setzt sich eine KI
 * an den Tisch, nennt die Zeile den Namen aus dem Eintrag und nie „Du“). Ändert sich ein Text mit Absicht, den
 * Schnappschuss mit `npx vitest run tests/unit/log.test.ts -u` neu schreiben und den Unterschied im Diff prüfen.
 */
import { describe, expect, it } from 'vitest';
import type { GameKind, LogEntry, LogKind, View } from '../../src/game/types';
import { addBot, addPlayer, newState } from '../../src/game/state';
import { takeSeat } from '../../src/game/seats';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { logLine } from '../../src/ui/render/log';
import { rngF } from './helpers';

/** Lena handelt, Tom ist das Ziel, Mia schaut zu. Zora hat den Tisch verlassen und steht nur noch im Eintrag. */
const PEOPLE = [
  ['a', 'Lena'],
  ['b', 'Tom & Jo'],
  ['c', 'Elfi'],
  ['o', 'Mia'],
] as const;
const GAMES: readonly GameKind[] = ['schnautz', 'shithead', 'durak', 'cabo'];
/** Aus Sicht der Handelnden („du“), des Ziels und einer Unbeteiligten (Name) */
const VIEWERS = ['a', 'b', 'o'] as const;

function view(game: GameKind): View {
  return {
    game,
    phase: 'play',
    games: 1,
    turn: 0,
    dealer: 0,
    log: [],
    players: PEOPLE.map(([id, name]) => ({ id, name })),
  } as unknown as View;
}

type Sample<K extends LogKind> = Omit<Extract<LogEntry, { k: K }>, 'n'>;

/** Beispiele für jede Logart. Kommt eine neue Art dazu, kompiliert der Test erst mit einem Beispiel dafür. */
const SAMPLES: { [K in LogKind]: readonly Sample<K>[] } = {
  join: [
    { k: 'join', p: 'a' },
    { k: 'join', p: 'a', bot: true },
    { k: 'join', p: 'a', name: 'Igor & Co', bot: true },
  ],
  leave: [
    { k: 'leave', p: 'a', name: 'Lena' },
    { k: 'leave', p: 'z', name: 'Zora <3' },
    { k: 'leave', p: 'z' },
  ],
  quit: [{ k: 'quit', p: 'a' }],
  takeover: [
    { k: 'takeover', p: 'a', from: 'KI Igor & Co' },
    { k: 'takeover', p: 'a', from: 'KI Igor & Co', lobby: true },
  ],
  tobot: [
    { k: 'tobot', p: 'a' },
    { k: 'tobot', p: 'z', name: 'Zora' },
  ],
  back: [{ k: 'back', p: 'a' }],
  timeout: [
    { k: 'timeout', p: 'a' },
    { k: 'timeout', p: 'z', name: 'Zora' },
    { k: 'timeout', p: 'z' },
  ],
  game: [
    { k: 'game', g: 2, game: 'shithead' },
    { k: 'game', g: 3, game: 'schnautz' },
    { k: 'game', g: 4, game: 'cabo' },
    { k: 'game', g: 1 },
  ],
  round: [
    { k: 'round', r: 2, p: 'a', start: 'b' },
    { k: 'round', r: 2, p: 'b', start: 'a' },
    { k: 'round', r: 1, p: 'a' },
  ],
  keep: [{ k: 'keep', p: 'a' }],
  take: [{ k: 'take', p: 'a' }],
  swap: [{ k: 'swap', p: 'a', take: 'H7', give: 'SK' }],
  swapAll: [{ k: 'swapAll', p: 'a' }],
  pass: [{ k: 'pass', p: 'a' }],
  renew: [{ k: 'renew' }],
  knock: [{ k: 'knock', p: 'a' }],
  result: [
    {
      k: 'result',
      reason: 'schnautz',
      by: 'a',
      changes: { b: { n: 1, to: 'life' }, c: { n: 1, to: 'swim' } },
      tie: false,
      names: { b: 'Tom & Jo', c: 'Elfi' },
    },
    {
      k: 'result',
      reason: 'feuer',
      by: 'a',
      changes: { b: { n: 1, to: 'out' }, c: { n: 1, to: 'life' } },
      tie: false,
      names: { b: 'Tom & Jo', c: 'Elfi' },
    },
    { k: 'result', reason: 'knock', by: null, changes: { b: { n: 2, to: 'life' } }, tie: false, names: {} },
    { k: 'result', reason: 'knock', by: null, changes: {}, tie: true, names: {} },
    { k: 'result', reason: 'quit', by: null, changes: { a: { n: 1, to: 'out' } }, tie: false, names: { a: 'Lena' } },
    { k: 'result', reason: 'schnautz', by: 'z', changes: { z: { n: 1, to: 'out' } }, tie: false, names: { z: 'Zora' } },
  ],
  winner: [{ k: 'winner', p: 'a' }, { k: 'winner' }],
  lobby: [{ k: 'lobby' }],
  abort: [
    { k: 'abort', p: 'a', game: 'shithead' },
    { k: 'abort', p: 'a', game: 'durak', bets: true },
  ],
  ffwd: [{ k: 'ffwd', p: 'a' }],
  chat: [
    { k: 'chat', p: 'a', text: 'Hallo <i>' },
    { k: 'chat', p: 'b', text: 'Na & so', bot: true },
  ],
  emote: [{ k: 'emote', p: 'a', e: '😀' }],
  toss: [{ k: 'toss', p: 'a', item: 'tomato', to: 'b' }],
  sound: [{ k: 'sound', p: 'a', s: 'tusch' }],
  shdeal: [{ k: 'shdeal' }],
  shstart: [
    { k: 'shstart', p: 'a', card: 'H3' },
    { k: 'shstart', p: 'a', card: null },
  ],
  shplay: [
    { k: 'shplay', p: 'a', cards: ['H7', 'S7'], src: 'hand' },
    { k: 'shplay', p: 'a', cards: ['H7:2'], src: 'up' },
    { k: 'shplay', p: 'a', cards: ['H7'], src: 'down' },
  ],
  shthrow: [
    { k: 'shthrow', p: 'a', cards: ['H4'], src: 'hand' },
    { k: 'shthrow', p: 'a', cards: ['H4'], src: 'up' },
    { k: 'shthrow', p: 'a', cards: ['H4'] },
  ],
  shbomb: [
    { k: 'shbomb', p: 'a', cards: ['H9', 'S9', 'C9', 'D9'], src: 'hand', out: true },
    { k: 'shbomb', p: 'a', cards: ['H9', 'S9', 'C9', 'D9'], src: 'up', out: false },
  ],
  shburn: [
    { k: 'shburn', p: 'a', four: true, cut: true },
    { k: 'shburn', p: 'a', four: true, cut: false },
    { k: 'shburn', p: 'a', four: false, cut: false },
  ],
  shpickup: [
    { k: 'shpickup', p: 'a', cnt: 1 },
    { k: 'shpickup', p: 'a', cnt: 7 },
  ],
  shblindfail: [
    { k: 'shblindfail', p: 'a', card: 'HK', cnt: 1 },
    { k: 'shblindfail', p: 'a', card: 'HK', cnt: 5 },
    { k: 'shblindfail', p: 'z', name: 'Zora', card: 'HK', cnt: 5 },
  ],
  shdone: [{ k: 'shdone', p: 'a', place: 1 }],
  shend: [{ k: 'shend', p: 'a' }, { k: 'shend' }],
  shbet: [{ k: 'shbet', p: 'a', on: 'b', onName: 'Tom & Jo', q: 2 }],
  rematch: [
    { k: 'rematch', p: 'a', to: 'b', tn: 'Tom & Jo', c: 1 },
    { k: 'rematch', p: 'a', to: 'b', tn: 'Tom & Jo', c: 2 },
    { k: 'rematch', p: 'a', to: null, c: 1 },
    { k: 'rematch', p: 'z', name: 'Zora', to: 'y', tn: 'Yuri', c: 3 },
  ],
  rematchend: [
    { k: 'rematchend', p: 'a', to: 'b', tn: 'Tom & Jo', res: 'won', c: 1 },
    { k: 'rematchend', p: 'a', to: 'b', tn: 'Tom & Jo', res: 'lost', c: 1 },
    { k: 'rematchend', p: 'a', to: 'b', tn: 'Tom & Jo', res: 'tie', c: 1 },
    { k: 'rematchend', p: 'z', name: 'Zora', to: 'y', tn: 'Yuri', res: 'won', c: 1 },
  ],
  dkdeal: [
    { k: 'dkdeal', trump: 'H6', att: 'a', def: 'b' },
    { k: 'dkdeal', trump: 'H6', att: 'a', def: 'b', prev: true },
    { k: 'dkdeal', trump: 'H6', att: 'b', def: 'a', prev: true },
    { k: 'dkdeal', trump: 'H6', att: 'a', def: 'b', rnd: true },
  ],
  dkattack: [
    { k: 'dkattack', p: 'a', cards: ['H7'], lead: true },
    { k: 'dkattack', p: 'a', cards: ['S7', 'C7'] },
  ],
  dkdefend: [{ k: 'dkdefend', p: 'a', a: 'H7', d: 'H9' }],
  dktransfer: [
    { k: 'dktransfer', p: 'a', cards: ['S7'], to: 'b', tn: 'Tom & Jo' },
    { k: 'dktransfer', p: 'a', cards: ['S7'], to: 'z', tn: 'Zora' },
  ],
  dktake: [{ k: 'dktake', p: 'a' }],
  dkpass: [{ k: 'dkpass', p: 'a' }],
  dkbito: [
    { k: 'dkbito', p: 'a', cnt: 1 },
    { k: 'dkbito', p: 'a', cnt: 6 },
  ],
  dkpickup: [
    { k: 'dkpickup', p: 'a', cnt: 1 },
    { k: 'dkpickup', p: 'a', cnt: 3 },
    { k: 'dkpickup', p: 'a', cnt: 9 },
  ],
  dkout: [{ k: 'dkout', p: 'a', place: 2 }],
  dkend: [{ k: 'dkend', p: 'a' }, { k: 'dkend' }],
  cbdeal: [
    { k: 'cbdeal', r: 1, start: 'a' },
    { k: 'cbdeal', r: 2, start: 'b' },
  ],
  cblook: [{ k: 'cblook', p: 'a', ids: [0, 1] }],
  cbdraw: [
    { k: 'cbdraw', p: 'a', from: 'pile', c: 'H5' },
    { k: 'cbdraw', p: 'a', from: 'deck' },
  ],
  cbswap: [
    { k: 'cbswap', p: 'a', out: ['H5'], ok: true, slots: 1 },
    { k: 'cbswap', p: 'a', out: ['H5', 'S5'], ok: true, slots: 2 },
    { k: 'cbswap', p: 'a', out: ['H5', 'S5', 'C5', 'D5', 'H5', 'S5', 'C5'], ok: true, slots: 7 },
    { k: 'cbswap', p: 'a', out: ['H5', 'S6'], ok: false, slots: 2, pen: true },
    { k: 'cbswap', p: 'a', out: ['H5', 'S6'], ok: false, slots: 2 },
  ],
  cbdiscard: [
    { k: 'cbdiscard', p: 'a', c: 'H7', power: 'peek' },
    { k: 'cbdiscard', p: 'a', c: 'H9', power: 'spy' },
    { k: 'cbdiscard', p: 'a', c: 'HB', power: 'swap' },
    { k: 'cbdiscard', p: 'a', c: 'H3' },
  ],
  cbpeek: [{ k: 'cbpeek', p: 'a', id: 0 }],
  cbspy: [
    { k: 'cbspy', p: 'a', to: 'b', tn: 'Tom & Jo', id: 1 },
    { k: 'cbspy', p: 'a', to: 'z', tn: 'Zora', id: 1 },
  ],
  cbblind: [
    { k: 'cbblind', p: 'a', to: 'b', tn: 'Tom & Jo', id: 1, oid: 2 },
    { k: 'cbblind', p: 'a', to: 'z', tn: 'Zora', id: 1, oid: 2 },
  ],
  cbskip: [{ k: 'cbskip', p: 'a' }],
  cbcabo: [{ k: 'cbcabo', p: 'a' }],
  cbsnap: [
    { k: 'cbsnap', p: 'a', c: 'H5', ok: true },
    { k: 'cbsnap', p: 'a', c: 'H5', ok: false },
  ],
  cbround: [
    { k: 'cbround', scores: { a: 0, b: 50, c: 50 }, caller: null, ok: null, kami: 'a' },
    { k: 'cbround', scores: { a: 0, b: 12, c: 5 }, caller: 'a', ok: true, kami: null },
    { k: 'cbround', scores: { a: 22, b: 12, c: 5 }, caller: 'a', ok: false, kami: null },
    { k: 'cbround', scores: { a: 8, b: 12, c: 5 }, caller: 'b', ok: null, kami: null },
    { k: 'cbround', scores: { a: 8, b: 12, c: 5 }, caller: null, ok: null, kami: null },
    { k: 'cbround', scores: {}, caller: null, ok: null, kami: null },
  ],
  cbreset: [{ k: 'cbreset', p: 'a' }],
  cbend: [{ k: 'cbend', p: 'a' }, { k: 'cbend', p: 'a', again: true }, { k: 'cbend' }],
  dev: [{ k: 'dev', fx: 'confetti' }],
};

/** Hängt die Zeile vom Spiel am Tisch ab? Dann aus allen vier Spielen rendern, sonst reicht eines. */
const BY_GAME: ReadonlySet<LogKind> = new Set<LogKind>(['rematch', 'rematchend']);

function render(me: string, game: GameKind, e: LogEntry): ReturnType<typeof logLine> {
  const me0 = App.me;
  try {
    App.me = me;
    return logLine(view(game), e);
  } finally {
    App.me = me0;
  }
}

/** Alle Beispiele aus allen Blickwinkeln, als „Art Beispiel aus Sicht von x (Spiel)“ → [Klasse, HTML] */
function renderAll(): Record<string, ReturnType<typeof logLine>> {
  const out: Record<string, ReturnType<typeof logLine>> = {};
  let n = 1;
  for (const [k, list] of Object.entries(SAMPLES) as [LogKind, readonly Sample<LogKind>[]][]) {
    for (const s of list) {
      const e = { ...s, n: n++ } as LogEntry;
      for (const game of BY_GAME.has(k) ? GAMES : (['shithead'] as const)) {
        for (const me of VIEWERS) out[`${k} ${JSON.stringify(s)} aus Sicht von ${me} (${game})`] = render(me, game, e);
      }
    }
  }
  return out;
}

describe('Verlauf aus dem Textkatalog', () => {
  it('rendert jede Logart wortgleich zur Fassung vor dem Umbau', () => {
    expect(renderAll()).toMatchSnapshot();
  });

  it('nennt die KI beim Hinsetzen mit dem Namen aus dem Eintrag, auch nachdem jemand ihren Platz übernommen hat', () => {
    const st = newState('h', 'Tahna');
    addPlayer(st, 'g', 'Lena');
    expect(addBot(st, rngF(4))).toBeNull();
    const seat = st.players[2];
    const kiName = seat.name;
    // Die Partie läuft, ein neuer Gast übernimmt den KI-Platz samt ID
    st.phase = 'play';
    takeSeat(st, seat.id, 'Bartholomäus-Kim');
    const join = st.log.find((e) => e.k === 'join' && e.p === seat.id)!;
    for (const me of [seat.id, 'h', 'g']) {
      App.me = me;
      const line = logLine(viewFor(st, me), join);
      expect(line?.[1], me).toBe(`<b>${kiName}</b> (KI) setzt sich an den Tisch.`);
      expect(line?.[1]).not.toMatch(/\bDu\b|Bartholom/);
    }
    App.me = '';
  });

  it('überspringt unbekannte Logarten von neueren Gastgebern still', () => {
    for (const k of ['zukunft', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      const e = { k, n: 1, p: 'a' } as unknown as LogEntry;
      for (const me of VIEWERS) expect(render(me, 'shithead', e)).toBeNull();
    }
  });

  it('übersteht Einträge mit fehlenden oder fremden Feldern wie vor dem Umbau', () => {
    const broken = [
      { k: 'shplay', n: 1, p: 'a' },
      { k: 'shplay', n: 2, p: 'a', cards: ['XX', 7], src: 'hand' },
      { k: 'dkattack', n: 3, p: 'a', cards: 'H7' },
      { k: 'cbround', n: 4 },
      { k: 'cbround', n: 5, scores: { a: 'x', b: 3 }, caller: 'a', ok: true },
      { k: 'result', n: 6, reason: 'knock' },
      { k: 'game', n: 7, g: 'x', game: 'poker' },
      { k: 'shpickup', n: 8, p: 'a' },
      { k: 'dkbito', n: 9, p: 'a', cnt: 'viele' },
      { k: 'cbswap', n: 10, p: 'a', out: ['H5'], ok: true, slots: 9 },
      { k: 'cbdiscard', n: 11, p: 'a', c: 'H7' },
      { k: 'takeover', n: 12, p: 'a' },
    ] as unknown as LogEntry[];
    const out: Record<string, ReturnType<typeof logLine>> = {};
    for (const e of broken)
      for (const me of VIEWERS) out[`${JSON.stringify(e)} aus Sicht von ${me}`] = render(me, 'shithead', e);
    expect(out).toMatchSnapshot();
  });
});

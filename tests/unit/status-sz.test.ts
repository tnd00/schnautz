/*
 * Schnautz: Statuszeile (szStatus) in allen Phasen, Grund am Tisch (szWhyNot mit denselben Codes wie act) und das
 * Ergebnisblatt (szSheet) bei Rundenende und Partieende. Alles ohne DOM.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { finishRound, szWhyNot, type SzMove } from '../../src/game/schnautz';
import { addPlayer, newState } from '../../src/game/state';
import type { Action, State, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { szSheet, szStatus } from '../../src/ui/render/schnautz';
import type { Status } from '../../src/ui/status';
import { rngF } from './helpers';

/** Hände ohne 31 und ohne Feuer, damit keine Runde von selbst endet */
const LOW = {
  h: ['C7', 'S8', 'H9'],
  a: ['D7', 'C8', 'S9'],
  b: ['H7', 'D8', 'C9'],
};
const MID = ['S7', 'H8', 'D9'];

/** Schnautz zu dritt: h (Gastgeber), a und b. Die Runde steht in der Wahl des Gebers. */
function table(seed = 3): State {
  const rng = rngF(seed);
  const st = newState('h', 'H');
  addPlayer(st, 'a', 'Anna');
  addPlayer(st, 'b', 'Bert');
  act(st, 'h', { type: 'game', game: 'schnautz' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  return st;
}

/** Der Geber behält, danach liegen feste Hände ohne 31 auf dem Tisch. */
function play(st: State): State {
  const dealer = st.players[st.dealer].id;
  expect(act(st, dealer, { type: 'keep' })).toBeNull();
  st.hands = { h: [...LOW.h], a: [...LOW.a], b: [...LOW.b] };
  st.middle = [...MID];
  st.phase = 'play';
  st.result = null;
  return st;
}

const strip = (h: string) => h.replace(/<[^>]+>/g, '');

function statusFor(st: State, me: string): { s: Status; v: View; text: string } {
  App.me = me;
  const v = viewFor(st, me);
  const s = szStatus(v);
  return { s, v, text: `${strip(s.main)} | ${strip(s.sub)}` };
}

const idAt = (st: State, i: number): string => st.players[i]?.id ?? '';
const nameOfId = (st: State, id: string): string => st.players.find((p) => p.id === id)?.name ?? '';

afterEach(() => {
  App.me = '';
  App.role = null;
});

describe('Statuszeile Schnautz', () => {
  it('Wahl des Gebers: Geber ist dran mit Hinweis, die anderen sehen, wer gibt', () => {
    const st = table();
    const dealer = idAt(st, st.dealer);
    const own = statusFor(st, dealer);
    expect(own.s.tone).toBe('turn');
    expect(own.text).toBe(
      'Du bist dran. | Behalte dein Blatt oder nimm blind das zweite. Das andere kommt offen in die Mitte.',
    );
    const other = st.players.find((p) => p.id !== dealer)!.id;
    const o = statusFor(st, other);
    expect(o.s.tone).toBe('calm');
    expect(o.text).toBe(`${nameOfId(st, dealer)} ist dran. | Wer gibt, behält das Blatt oder nimmt blind das zweite.`);
  });

  it('eigener Zug: Du bist dran mit Tipp, fremder Zug ohne Unterzeile', () => {
    const st = play(table());
    const now = idAt(st, st.turn);
    const own = statusFor(st, now);
    expect(own.s.tone).toBe('turn');
    expect(own.text).toBe('Du bist dran. | Tippe eine Handkarte und eine Karte aus der Mitte an.');
    const other = st.players.find((p) => p.id !== now)!.id;
    const o = statusFor(st, other);
    expect(o.text).toBe(`${nameOfId(st, now)} ist dran. | `);
    expect(o.text).not.toMatch(/Du ist/);
  });

  it('nach Schieben: Stand in der Unterzeile, am eigenen Zug kurz neben dem Tipp', () => {
    const st = play(table());
    expect(act(st, idAt(st, st.turn), { type: 'pass' })).toBeNull();
    const now = idAt(st, st.turn);
    const own = statusFor(st, now);
    expect(own.text).toBe(
      'Du bist dran. | Tippe eine Handkarte und eine Karte aus der Mitte an. 1 von 3 hat geschoben.',
    );
    expect(own.s.sub).toContain('class="tip"');
    expect(own.s.sub).toContain('class="np"');
    const other = st.players.find((p) => p.id !== now)!.id;
    expect(statusFor(st, other).text).toBe(
      `${nameOfId(st, now)} ist dran. | 1 von 3 hat geschoben. Schieben alle, kommen neue Karten.`,
    );
  });

  it('geklopft: letzter Zug für die anderen, wer klopft, sieht die übrigen Züge', () => {
    const st = play(table());
    st.turns = 3;
    const knocker = idAt(st, st.turn);
    expect(act(st, knocker, { type: 'knock' })).toBeNull();
    const now = idAt(st, st.turn);
    const own = statusFor(st, now);
    expect(own.s.tone).toBe('knock');
    expect(own.text).toBe(`Du bist dran. | ${nameOfId(st, knocker)} hat geklopft, das ist dein letzter Zug.`);
    const k = statusFor(st, knocker);
    expect(k.s.tone).toBe('knock');
    expect(k.text).toBe(`${nameOfId(st, now)} ist dran. | Du hast geklopft. Noch 2 Züge bis zum Aufdecken.`);
    const third = st.players.find((p) => p.id !== now && p.id !== knocker)!.id;
    expect(statusFor(st, third).text).toBe(
      `${nameOfId(st, now)} ist dran. | ${nameOfId(st, knocker)} hat geklopft. Noch 2 Züge bis zum Aufdecken.`,
    );
    act(st, now, { type: 'pass' });
    expect(statusFor(st, knocker).text).toMatch(/Noch ein Zug bis zum Aufdecken\.$/);
  });

  it('KI am Zug heißt „KI Name“', () => {
    const st = play(table());
    const now = st.players[st.turn];
    now.bot = true;
    const other = st.players.find((p) => p.id !== now.id)!.id;
    expect(statusFor(st, other).text.startsWith(`KI ${now.name} ist dran.`)).toBe(true);
  });

  it('Person am Zug offline: Gastgeber darf für sie schieben oder behalten, Gast wartet', () => {
    const st = table();
    const dealer = st.players[st.dealer];
    dealer.online = false;
    const others = st.players.filter((p) => p.id !== dealer.id).map((p) => p.id);
    App.role = 'host';
    const hc = statusFor(st, others[0]);
    expect(hc.s.quick).toContain('data-act="skip"');
    expect(hc.s.quick).toContain(`Für ${dealer.name} behalten`);
    expect(hc.text.startsWith(`${dealer.name} ist gerade offline.`)).toBe(true);
    dealer.online = true;
    play(st);
    const now = st.players[st.turn];
    now.online = false;
    const watcher = st.players.find((p) => p.id !== now.id)!.id;
    const hp = statusFor(st, watcher);
    expect(hp.s.quick).toContain(`Für ${now.name} schieben`);
    expect(hp.s.quick).toContain('class="qlbl"');
    App.role = 'guest';
    const g = statusFor(st, watcher);
    expect(g.s.quick).toBeUndefined();
    expect(g.text).toBe(`${now.name} ist dran. | ${now.name} ist gerade offline. Das Spiel wartet.`);
  });

  it('raus und nur noch KIs: Vorspulen steht statt der Unterzeile', () => {
    const st = play(table());
    const out = st.players.find((p) => p.id === 'h')!;
    out.out = true;
    if (st.turn === 0) st.turn = 1;
    for (const p of st.players) if (p.id !== 'h') p.bot = true;
    App.role = 'host';
    const { s } = statusFor(st, 'h');
    expect(s.quick).toContain('data-act="ffwd"');
  });

  it('Runde vorbei nur am Rundenende, Partie vorbei nur am Partieende', () => {
    const st = play(table());
    finishRound(st, 'knock', 'a');
    expect(st.phase).toBe('end');
    const end = statusFor(st, 'h');
    expect(end.s.tone).toBe('over');
    expect(end.text).toBe('Runde vorbei. | ');
    st.phase = 'over';
    expect(statusFor(st, 'h').text).toBe('Partie vorbei. | ');
  });

  it('Texte halten die Regeln aus CLAUDE.md ein', () => {
    const st = play(table());
    act(st, idAt(st, st.turn), { type: 'pass' });
    const all = st.players.map((p) => statusFor(st, p.id).text).join(' ');
    expect(all).not.toMatch(/[–—]|,\s+und\b|undefined|null|NaN|Du ist|Du hat/);
  });
});

/** Aktion zum Zug für act */
const ACTION: Record<SzMove, Action> = {
  keep: { type: 'keep' },
  take: { type: 'take' },
  swap: { type: 'swap', h: 0, m: 0 },
  swapAll: { type: 'swapAll' },
  pass: { type: 'pass' },
  knock: { type: 'knock' },
};
const MOVES = Object.keys(ACTION) as SzMove[];

/** Was act zu diesem Zug sagt, auf einer Kopie, damit der Tisch bleibt */
const actOn = (st: State, pid: string, m: SzMove) => act(structuredClone(st), pid, ACTION[m]);

describe('Grund am Tisch: szWhyNot sagt dasselbe wie act', () => {
  const cases: [string, () => State][] = [
    ['Wahl des Gebers', () => table()],
    ['Zug läuft', () => play(table())],
    [
      'Klopfen erlaubt',
      () => {
        const st = play(table());
        st.turns = 3;
        return st;
      },
    ],
    [
      'Klopfen sofort erlaubt',
      () => {
        const st = play(table());
        st.rules.knockFirst = true;
        return st;
      },
    ],
    [
      'schon geklopft',
      () => {
        const st = play(table());
        st.turns = 3;
        act(st, idAt(st, st.turn), { type: 'knock' });
        return st;
      },
    ],
    [
      'Rundenende',
      () => {
        const st = play(table());
        finishRound(st, 'knock', 'a');
        return st;
      },
    ],
  ];
  for (const [name, mk] of cases) {
    it(name, () => {
      const st = mk();
      for (const p of st.players)
        for (const m of MOVES) {
          const want = actOn(st, p.id, m);
          expect(szWhyNot(st, p.id, m), `${p.id} ${m}`).toEqual(want);
          // Dasselbe auf der eigenen Ansicht, so fragt die Oberfläche
          expect(szWhyNot(viewFor(st, p.id), p.id, m), `${p.id} ${m} View`).toEqual(want);
        }
    });
  }
});

describe('Ergebnisblatt Schnautz', () => {
  it('Rundenende: wer Leben verliert, steht als Schlüsselzeile da, jede Platz-ID genau einmal', () => {
    const st = play(table());
    // b hat die schlechteste Hand
    st.hands.b = ['H7', 'D8', 'C9'];
    st.hands.h = ['HA', 'HK', 'HD'];
    st.hands.a = ['SA', 'SK', 'C7'];
    st.knocker = 'h';
    finishRound(st, 'knock', 'h');
    App.me = 'h';
    const s = szSheet(viewFor(st, 'h'))!;
    expect(s.next).toBe('round');
    expect(s.key).toBe('b');
    const keyRow = s.rows.find((r) => r.id === 'b')!;
    expect(keyRow.tone).toBe('lose');
    expect(keyRow.hat).toBe('💔');
    expect(keyRow.cards).toHaveLength(3);
    expect(s.rows.map((r) => r.id).sort()).toEqual(['a', 'b', 'h']);
    expect(s.rows.every((r) => r.place === null)).toBe(true);
    expect(s.rows.find((r) => r.id === 'h')!.tone).toBe('win');
    expect(s.icon).toBe('👑');
    // Ohne Unterzeile im Kopf, wer geklopft hat, steht in der eigenen Zeile
    expect(s.lead).toBe('');
    expect(strip(s.rows.find((r) => r.id === 'h')!.core)).toBe('hast geklopft · beste Hand');
    expect(strip(keyRow.core)).toBe('1 Leben weg · Hand 9');
    expect(keyRow.val).toBeUndefined();
    // Aus Sicht von b steht die eigene Folge oben
    App.me = 'b';
    const sb = szSheet(viewFor(st, 'b'))!;
    expect(sb.key).toBe('b');
    expect(sb.icon).toBe('💔');
  });

  it('Kurzformen für lange Namen: das Zeichen vor dem Namen sagt die Folge, die Leben stehen als Deckel mit Zahl', () => {
    const rng = rngF(4);
    const st = newState('h', 'H');
    act(st, 'h', { type: 'game', game: 'schnautz' }, rng);
    act(st, 'h', { type: 'rules', rules: { seats: 5 } }, rng);
    for (const [id, name] of [
      ['a', 'Anna'],
      ['b', 'Bert'],
      ['c', 'Cleo'],
      ['d', 'Dora'],
    ])
      addPlayer(st, id, name);
    act(st, 'h', { type: 'start' }, rng);
    expect(act(st, st.players[st.dealer].id, { type: 'keep' })).toBeNull();
    st.middle = [...MID];
    st.phase = 'play';
    st.players.forEach((p) => (p.lives = 2));
    st.players.find((p) => p.id === 'c')!.lives = 0;
    // Die drei Neuner verlieren, h hat 31
    st.hands = {
      h: ['HA', 'HK', 'HD'],
      a: ['SA', 'D10', 'C8'],
      b: ['H7', 'D8', 'C9'],
      c: ['D7', 'H9', 'S8'],
      d: ['S7', 'D9', 'H8'],
    };
    st.knocker = 'b';
    finishRound(st, 'knock', 'b');
    App.me = 'h';
    const s = szSheet(viewFor(st, 'h'))!;
    const row = (id: string) => s.rows.find((r) => r.id === id)!;
    const short = (id: string) => strip(row(id).short ?? '');
    // b hat geklopft und ein Leben verloren: kurz nur „geklopft“, 💔 sagt den Rest
    expect(row('b').hat).toBe('💔');
    expect(s.key).toBe('b');
    // Die Schlüsselzeile bricht um und hat keine Kurzform
    expect(row('b').short).toBeUndefined();
    // c schwamm schon und ist jetzt raus, d verliert ein Leben
    expect(row('c').hat).toBe('🫧');
    expect(short('c')).toBe('raus');
    expect(row('d').hat).toBe('💔');
    expect(strip(row('d').core)).toBe('1 Leben weg');
    expect(short('d')).toBe('');
    // h hat die beste Hand: die Krone sagt es, a zeigt die Leben als Deckel mit Zahl
    expect(row('h').hat).toBe('👑');
    expect(short('h')).toBe('');
    expect(row('a').short).toContain('class="coaster"');
    expect(short('a')).toBe('2');
    // Klopfen und Folge in derselben Zeile, kurz bleibt „geklopft“
    st.phase = 'play';
    st.result = null;
    st.players.forEach((p) => {
      p.lives = 2;
      p.out = false;
    });
    st.hands = {
      h: ['H7', 'D8', 'C9'],
      a: ['SA', 'D10', 'C8'],
      b: ['HA', 'HK', 'HD'],
      c: ['D7', 'H9', 'S8'],
      d: ['S7', 'D9', 'H8'],
    };
    st.knocker = 'b';
    finishRound(st, 'knock', 'b');
    const s2 = szSheet(viewFor(st, 'h'))!;
    const b2 = s2.rows.find((r) => r.id === 'b')!;
    expect(strip(b2.core)).toBe('hat geklopft · beste Hand');
    expect(strip(b2.short ?? '')).toBe('geklopft');
  });

  it('Gleichstand: kein Schlüssel, Hinweis statt Verlierer', () => {
    const st = play(table());
    st.hands.h = ['C7', 'S8', 'H9'];
    st.hands.a = ['D7', 'C8', 'S9'];
    st.hands.b = ['H7', 'D8', 'C9'];
    finishRound(st, 'knock', 'h');
    App.me = 'a';
    const s = szSheet(viewFor(st, 'a'))!;
    expect(s.key).toBeNull();
    expect(s.keyNote).toContain('Gleichstand');
  });

  it('Partieende: Sieger als Schlüsselzeile, wer zuletzt unterging, gleich danach', () => {
    const st = play(table());
    for (const p of st.players) p.lives = 0;
    st.players.find((p) => p.id === 'a')!.out = true;
    st.players.find((p) => p.id === 'a')!.outRound = 1;
    delete st.hands.a;
    st.hands.h = ['HA', 'HK', 'HD'];
    st.hands.b = ['H7', 'D8', 'C9'];
    finishRound(st, 'knock', 'h');
    expect(st.phase).toBe('over');
    App.me = 'b';
    const s = szSheet(viewFor(st, 'b'))!;
    expect(s.next).toBe('game');
    expect(s.key).toBe('h');
    expect(strip(s.title)).toBe('H gewinnt!');
    expect(s.keyNote).toBe('🫧 Du bist zuletzt untergegangen.');
    expect(s.rows.map((r) => [r.id, r.place])).toEqual([
      ['h', 1],
      ['b', 2],
      ['a', 3],
    ]);
    expect(s.rows.find((r) => r.id === 'b')!.tone).toBe('lose');
    // Kurzformen: „Runde 1“ statt „raus in Runde 1“
    expect(s.rows.find((r) => r.id === 'a')!.core).toBe('raus in Runde 1');
    expect(s.rows.find((r) => r.id === 'a')!.short).toBe('Runde 1');
    App.me = 'h';
    const sh = szSheet(viewFor(st, 'h'))!;
    expect(strip(sh.title)).toBe('Du gewinnst!');
    expect(sh.keyNote).toBe('🫧 Bert ist zuletzt untergegangen.');
    // Lange Namen: kurzer Titel, der Name steht in der Siegerzeile
    st.players.find((p) => p.id === 'h')!.name = 'Wolfgang-Amadeus';
    App.me = 'b';
    expect(strip(szSheet(viewFor(st, 'b'))!.title)).toBe('Partie entschieden!');
  });

  it('außerhalb von Runden- und Partieende kein Blatt', () => {
    const st = play(table());
    App.me = 'h';
    expect(szSheet(viewFor(st, 'h'))).toBeNull();
  });
});

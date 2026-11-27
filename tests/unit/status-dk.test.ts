/*
 * Statuszeile (dkStatus in src/ui/render/durak.ts) für Durak in allen Lagen, ohne DOM. Mehrere können zugleich
 * dran sein, die Zeile nennt sie zusammen. Dazu der Grund für ausgegraute Karten (dkWhyNot) und das Ergebnisblatt.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { dkWhyNot } from '../../src/game/durak';
import { addPlayer, newState } from '../../src/game/state';
import type { Card, DkState, State, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { dkSheet, dkStatus } from '../../src/ui/render/durak';
import type { Status } from '../../src/ui/status';
import { rngF } from './helpers';

const NAMES = ['Tina', 'Lena', 'Tom', 'Uschi', 'Max'];
const IDS = ['h', 'a', 'b', 'c', 'd'];

/**
 * Durak mit `n` Leuten (h Gastgeber, a, b, …), gestartet und dann auf feste Hände gesetzt: Trumpf Herz, h greift a
 * an. Jede Hand hat eine Sieben, damit alle nachlegen können, sobald eine Sieben liegt.
 */
function table(n = 3, transfer = false): { st: State; D: DkState } {
  const rng = rngF(3);
  const st = newState('h', NAMES[0]);
  act(st, 'h', { type: 'game', game: 'durak' }, rng);
  act(st, 'h', { type: 'rules', rules: { seats: Math.max(4, n), dk: { transfer } } }, rng);
  for (let i = 1; i < n; i++) addPlayer(st, IDS[i], NAMES[i]);
  expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
  const D = st.dk!;
  D.trump = 'H6';
  const hands: Record<string, Card[]> = {
    h: ['C7', 'S8', 'DK'],
    a: ['C9', 'S7', 'D6'],
    b: ['D7', 'S10', 'CA'],
    c: ['H7', 'SB', 'C6'],
    d: ['S9', 'DB', 'CD'],
  };
  D.P = Object.fromEntries(IDS.slice(0, n).map((id) => [id, hands[id]]));
  Object.assign(D, { att: 'h', def: 'a', table: [], take: false, done: [], limit: 3, finished: [] });
  return { st, D };
}

const strip = (h: string): string => h.replace(/<[^>]+>/g, '');

/** Ansicht aus Sicht von `me` und deren Status als reiner Text. */
function statusFor(st: State, me: string, sel: number[] = []): { s: Status; v: View; text: string } {
  App.me = me;
  App.zerHide = '';
  App.ds = { idx: sel, pair: null };
  const v = viewFor(st, me);
  const s = dkStatus(v);
  return { s, v, text: `${strip(s.main)} | ${strip(s.sub)}` };
}

afterEach(() => {
  App.me = '';
  App.zerHide = '';
  App.role = null;
  App.ds = { idx: [], pair: null };
});

describe('Statuszeile Durak', () => {
  it('Angriff: ich greife an, die anderen sehen, wer wen angreift', () => {
    const { st } = table();
    const lead = statusFor(st, 'h');
    expect(lead.s.tone).toBe('turn');
    expect(lead.text).toBe('Du greifst an. | Tippe eine Karte oder gleiche Werte an und greif Lena an.');
    expect(statusFor(st, 'a').text).toBe('Tina greift dich an. | Gleich musst du verteidigen.');
    const other = statusFor(st, 'b');
    expect(other.text).toBe('Tina greift Lena an. | ');
    expect(other.s.tone).toBe('calm');
  });

  it('KI greift an: „KI Name“, nie „Du greift“', () => {
    const { st, D } = table();
    D.att = 'b';
    D.def = 'h';
    st.players.find((p) => p.id === 'b')!.bot = true;
    expect(statusFor(st, 'a').text).toBe('KI Tom greift Tina an. | ');
    expect(statusFor(st, 'h').text).toMatch(/^KI Tom greift dich an\./);
  });

  it('Verteidigen: was zu tun ist, mit Weiterschieben eigener Hinweis', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    const def = statusFor(st, 'a');
    expect(def.s.tone).toBe('turn');
    expect(def.text).toBe(
      'Du verteidigst. | Tippe eine Karte und dann den Angriff, den sie schlagen soll. Oder nimm alles auf.',
    );
    const tr = table(3, true);
    tr.D.table = [{ a: 'C7', by: 'h' }];
    expect(statusFor(tr.st, 'a').text).toBe(
      'Du verteidigst. | Schlag jede Karte, nimm alles auf oder schieb mit gleichem Wert weiter.',
    );
  });

  it('während der Verteidigung: „Lena verteidigt, Tom darf nachlegen.“ und ich darf schon nachlegen', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    const h = statusFor(st, 'h');
    expect(h.text).toBe('Lena verteidigt, Tom darf nachlegen. | Werte vom Tisch darfst du schon nachlegen.');
    expect(h.s.tone).toBe('calm');
    expect(statusFor(st, 'b').text).toBe(
      'Lena verteidigt, Tina darf nachlegen. | Werte vom Tisch darfst du schon nachlegen.',
    );
  });

  it('alles geschlagen: wer nachlegen darf, ist dran, wer verteidigt hat, wartet', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', d: 'C9', by: 'h' }];
    const h = statusFor(st, 'h');
    expect(h.s.tone).toBe('turn');
    expect(h.text).toBe(
      'Alles geschlagen, du darfst nachlegen. | Nachlegen darfst du Werte, die schon liegen. Sonst tippe Passen.',
    );
    expect(statusFor(st, 'a').text).toBe('Alles geschlagen. | Warte auf Tina und Tom.');
  });

  it('Aufnehmen: wer aufnimmt, wartet auf die anderen, die anderen dürfen nachlegen', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    D.take = true;
    const a = statusFor(st, 'a');
    expect(a.text).toBe('Du nimmst auf. | Warte auf Tina und Tom.');
    expect(a.s.tone).toBe('calm');
    expect(statusFor(st, 'h').text).toMatch(/^Lena nimmt auf, du darfst nachlegen\. \| /);
  });

  it('gepasst: der Satz nennt die anderen, die Unterzeile sagt, wie lange Passen gilt', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    D.take = true;
    D.done = ['h'];
    const take = statusFor(st, 'h');
    expect(take.text).toBe(
      'Lena nimmt auf, Tom darf nachlegen. | Du hast gepasst. Die anderen dürfen noch etwas obendrauf legen.',
    );
    expect(take.s.tone).toBe('calm');
    D.take = false;
    D.table = [{ a: 'C7', d: 'C9', by: 'h' }];
    expect(statusFor(st, 'h').text).toBe(
      'Alles geschlagen, Tom darf nachlegen. | Du hast gepasst. Das gilt, bis ein neuer Wert liegt oder Lena aufnimmt.',
    );
    D.done = ['h', 'b'];
    expect(statusFor(st, 'h').text).toMatch(/^Alles geschlagen\. \| Du hast gepasst\./);
  });

  it('ab drei Leuten zum Nachlegen bleibt der erste Teil, die Namen stehen in der Unterzeile', () => {
    const { st, D } = table(5);
    D.table = [{ a: 'C7', by: 'h' }];
    D.take = true;
    D.done = ['h'];
    expect(statusFor(st, 'h').text).toBe(
      'Lena nimmt auf. | Du hast gepasst. Die anderen dürfen noch etwas obendrauf legen.',
    );
    expect(statusFor(st, 'a').text).toBe('Du nimmst auf. | Warte auf Tom, Uschi und Max.');
    // Während der Verteidigung wartet die Partie nur auf Lena
    D.take = false;
    D.done = [];
    D.P.c = [];
    expect(statusFor(st, 'c').text).toBe('Lena verteidigt. | ');
  });

  it('lange Namen: der Satz wird kürzer statt abgeschnitten, die Namen wandern nach unten', () => {
    const { st, D } = table(4);
    const rename = (id: string, name: string) => (st.players.find((p) => p.id === id)!.name = name);
    rename('h', 'Tina Langername1');
    rename('a', 'Lena Langername1');
    rename('b', 'Tom Langername12');
    D.table = [{ a: 'C7', by: 'h' }];
    expect(statusFor(st, 'b').text).toBe('Lena Langername1 verteidigt. | Werte vom Tisch darfst du schon nachlegen.');
    D.take = true;
    expect(statusFor(st, 'h').text).toMatch(/^Du darfst nachlegen\. \| /);
    // Uschi hat gerade keine Karten und schaut zu: Wer nachlegen darf, steht in der Unterzeile
    D.P.c = [];
    expect(statusFor(st, 'c').text).toBe(
      'Lena Langername1 nimmt auf. | Warte auf Tina Langername1 und Tom Langername12.',
    );
  });

  it('acht Leute mit langen Namen: ab vier Wartenden nennt die Unterzeile zwei Namen und zählt den Rest', () => {
    const rng = rngF(5);
    const st = newState('h', 'Tina Langername1');
    act(st, 'h', { type: 'game', game: 'durak' }, rng);
    act(st, 'h', { type: 'rules', rules: { seats: 8 } }, rng);
    for (let i = 1; i < 8; i++) addPlayer(st, `p${i}`, `Wolfgang-Amadeu${i}`);
    // Drei KIs, damit „KI “ vor dem Namen mitzählt
    for (const id of ['p2', 'p3', 'p4']) st.players.find((p) => p.id === id)!.bot = true;
    expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
    expect(st.players.every((p) => p.name.length === 16)).toBe(true);
    const D = st.dk!;
    const ids = st.players.map((p) => p.id);
    D.P = Object.fromEntries(ids.map((id) => [id, ['C7', 'S8', 'DK']]));
    Object.assign(D, { att: 'h', def: 'p1', table: [{ a: 'H7', by: 'h' }], take: true, done: [], limit: 6 });
    // Wer aufnimmt, wartet auf sieben: zwei Namen und der Rest als Zahl
    const take = statusFor(st, 'p1').text;
    expect(take).toBe('Du nimmst auf. | Warte auf Tina Langername1, KI Wolfgang-Amadeu2 und 5 weitere.');
    // Alles geschlagen, sechs dürfen noch nachlegen
    Object.assign(D, { table: [{ a: 'H7', d: 'HA', by: 'h' }], take: false, done: ['h'] });
    const beaten = statusFor(st, 'p1').text;
    expect(beaten).toBe('Alles geschlagen. | Warte auf KI Wolfgang-Amadeu2, KI Wolfgang-Amadeu3 und 4 weitere.');
    // Bei drei Wartenden stehen noch alle da, bei vier schon die Kurzform
    D.done = ['h', 'p2', 'p3', 'p4'];
    expect(statusFor(st, 'p1').text).toBe(
      'Alles geschlagen. | Warte auf Wolfgang-Amadeu5, Wolfgang-Amadeu6 und Wolfgang-Amadeu7.',
    );
    D.done = ['h', 'p2', 'p3'];
    expect(statusFor(st, 'p1').text).toBe(
      'Alles geschlagen. | Warte auf KI Wolfgang-Amadeu4, Wolfgang-Amadeu5 und 2 weitere.',
    );
    // Zwei Zeilen zu rund 56 Zeichen hat die Unterzeile bei 360 px, beide Kurzformen bleiben darunter
    for (const t of [take, beaten]) expect(t.split(' | ')[1].length).toBeLessThanOrEqual(2 * 56);
  });

  it('Auswahl, die nicht geht: die Unterzeile nennt den Grund', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    // Tom wählt die Zehn, liegen tut nur eine Sieben
    const b = statusFor(st, 'b', [1]);
    expect(b.text).toBe(
      'Lena verteidigt, Tina darf nachlegen. | Nachlegen geht nur mit Werten, die schon auf dem Tisch liegen.',
    );
    // Lena wählt die Pik Sieben, die schlägt die Kreuz Sieben nicht
    expect(statusFor(st, 'a', [1]).text).toBe('Du verteidigst. | Diese Karte schlägt keinen offenen Angriff.');
  });

  it('fertig: Platz und Werfen', () => {
    const { st, D } = table();
    D.finished = ['b'];
    D.P.b = [];
    st.players.find((p) => p.id === 'b')!.place = 1;
    const { s, text } = statusFor(st, 'b');
    expect(text.startsWith('Du bist fertig! | Platz 1.')).toBe(true);
    expect(s.tone).toBe('calm');
  });

  it('wer aufhält, ist offline: Gastgeber darf für sie spielen, Gast wartet, wer selbst dran ist, behält seine Zeile', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    st.players.find((p) => p.id === 'a')!.online = false;
    App.role = 'host';
    const host = statusFor(st, 'h');
    expect(strip(host.s.main)).toBe('Lena ist gerade offline.');
    expect(host.s.quick).toContain('data-act="skip"');
    expect(host.s.quick).toContain('Für Lena spielen');
    App.role = 'guest';
    const guest = statusFor(st, 'b');
    expect(guest.s.quick).toBeUndefined();
    expect(guest.text).toBe('Lena verteidigt, Tina darf nachlegen. | Lena ist gerade offline. Das Spiel wartet.');
    // Alles geschlagen, Tom ist offline, ich darf selbst nachlegen: meine Zeile bleibt
    st.players.find((p) => p.id === 'a')!.online = true;
    st.players.find((p) => p.id === 'b')!.online = false;
    D.table = [{ a: 'C7', d: 'C9', by: 'h' }];
    App.role = 'host';
    const mine = statusFor(st, 'h');
    expect(mine.s.quick).toBeUndefined();
    expect(mine.text).toMatch(/^Alles geschlagen, du darfst nachlegen\./);
  });

  it('Partieende: Aufdecken bis zur Enthüllung, danach Partie vorbei', () => {
    const { st } = table();
    st.phase = 'over';
    const plain = statusFor(st, 'h');
    expect(plain.s.tone).toBe('over');
    expect(plain.text).toBe('Partie vorbei. | ');
    App.me = 'h';
    App.zerHide = 'a';
    const s = dkStatus(viewFor(st, 'h'));
    expect(s.main).toBe('Aufdecken …');
    expect(s.sub).toBe('Gleich kommt das Ergebnis.');
  });

  it('Lobby: leere Zeile', () => {
    const st = newState('h', 'Tina');
    addPlayer(st, 'a', 'Lena');
    act(st, 'h', { type: 'game', game: 'durak' }, rngF(1));
    App.me = 'h';
    expect(dkStatus(viewFor(st, 'h'))).toEqual({ main: '', sub: '', tone: 'calm' });
  });

  it('Texte halten die Regeln aus CLAUDE.md ein', () => {
    const lines: string[] = [];
    const set = (f: (D: DkState) => void) => {
      const { st, D } = table(5, true);
      f(D);
      for (const id of IDS) lines.push(statusFor(st, id).text);
    };
    set(() => {});
    set((D) => (D.table = [{ a: 'C7', by: 'h' }]));
    set((D) => (D.table = [{ a: 'C7', d: 'C9', by: 'h' }]));
    set((D) => Object.assign(D, { table: [{ a: 'C7', by: 'h' }], take: true, done: ['b'] }));
    const all = lines.join(' ');
    expect(all).not.toMatch(/[–—]|,\s+und\b|undefined|null|Jemand/);
    expect(all).not.toMatch(/\bDu (?:ist|hat|greift|verteidigt|nimmt|darf)\b/);
  });
});

describe('Grund für ausgegraute Karten (dkWhyNot)', () => {
  it('Angriff: jede Karte geht, wer nicht dran ist, erfährt warum', () => {
    const { st } = table();
    expect(dkWhyNot(st, 'h', 'S8')).toBeNull();
    expect(dkWhyNot(st, 'b', 'D7')?.e).toBe('dk.notLead');
    expect(dkWhyNot(st, 'a', 'C9')?.e).toBe('dk.notLead');
  });

  it('Nachlegen: gleiche Werte gehen, andere nicht, gepasst heißt gepasst', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    expect(dkWhyNot(st, 'b', 'D7')).toBeNull();
    expect(dkWhyNot(st, 'b', 'S10')?.e).toBe('dk.rankNotOnTable');
    D.done = ['b'];
    D.table = [{ a: 'C7', d: 'C9', by: 'h' }];
    expect(dkWhyNot(st, 'b', 'D7')?.e).toBe('dk.passed');
    D.take = true;
    expect(dkWhyNot(st, 'b', 'D7')?.e).toBe('dk.passedTake');
  });

  it('Verteidigen: schlagen oder weiterschieben geht, sonst kein Ziel', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    expect(dkWhyNot(st, 'a', 'C9')).toBeNull();
    expect(dkWhyNot(st, 'a', 'S7')?.e).toBe('dk.noTarget');
    expect(dkWhyNot(st, 'a', 'D6')?.e).toBe('dk.noTarget');
    const tr = table(3, true);
    tr.D.table = [{ a: 'C7', by: 'h' }];
    expect(dkWhyNot(tr.st, 'a', 'S7')).toBeNull();
    D.take = true;
    expect(dkWhyNot(st, 'a', 'C9')?.e).toBe('dk.taking');
    D.take = false;
    D.table = [{ a: 'C7', d: 'C9', by: 'h' }];
    expect(dkWhyNot(st, 'a', 'S7')?.e).toBe('dk.allBeaten');
  });

  it('fertig oder nicht dabei', () => {
    const { st, D } = table();
    D.finished = ['b'];
    expect(dkWhyNot(st, 'b', 'D7')?.e).toBe('any.done');
    expect(dkWhyNot(st, 'x', 'D7')?.e).toBe('any.notPlaying');
  });

  it('dieselbe Antwort in der Ansicht wie im Zustand', () => {
    const { st, D } = table();
    D.table = [{ a: 'C7', by: 'h' }];
    const v = viewFor(st, 'b');
    for (const c of D.P.b) expect(dkWhyNot(v, 'b', c)).toEqual(dkWhyNot(st, 'b', c));
  });
});

describe('Ergebnisblatt Durak', () => {
  it('Durak als Schlüsselzeile mit Restkarten, Krone für den Ersten', () => {
    const { st, D } = table();
    st.phase = 'over';
    D.durak = 'a';
    D.P = { h: [], a: ['C9', 'S7'], b: [] };
    st.players.find((p) => p.id === 'h')!.place = 1;
    st.players.find((p) => p.id === 'b')!.place = 2;
    st.winner = 'h';
    st.result = { reason: 'durak', ranking: ['h', 'b'], durak: 'a', names: {} };
    App.me = 'b';
    const s = dkSheet(viewFor(st, 'b'))!;
    expect(s.key).toBe('a');
    expect(s.title).toContain('Durak');
    expect(s.next).toBe('game');
    expect(s.rows.map((r) => r.id)).toEqual(['h', 'b', 'a']);
    const key = s.rows.find((r) => r.id === 'a')!;
    expect(key.cards).toEqual(['C9', 'S7']);
    expect(key.core).toBe('2 Karten übrig');
    expect(key.tone).toBe('lose');
    expect(s.rows[0].hat).toBe('👑');
    expect(s.rows[0].core).toBe('zuerst fertig');
    // Kurzform für lange Namen: die Krone sagt „fertig“ schon, „fertig“ allein braucht keine
    expect(s.rows[0].short).toBe('zuerst');
    expect(s.rows[1].core).toBe('fertig');
    expect(s.rows[1].short).toBeUndefined();
    // Mit Zähler früherer Partien bleibt kurz nur der Zähler, Platz und Krone sagen den Rest
    st.players.find((p) => p.id === 'h')!.dkc = 2;
    st.players.find((p) => p.id === 'b')!.place = 1;
    const t = dkSheet(viewFor(st, 'b'))!;
    expect(t.rows[0].core).toBe('zuerst fertig · 2× Durak');
    expect(strip(t.rows[0].short ?? '')).toBe('🤡 2');
    expect(t.rows[1].core).toBe('gleichzeitig fertig');
    expect(t.rows[1].short).toBe('gleichzeitig');
    // Krone und „zuerst fertig“ sagen es schon, die Einleitung bleibt frei
    expect(s.lead).toBe('');
  });

  it('Unentschieden ohne Schlüsselzeile, außerhalb des Endes kein Blatt', () => {
    const { st } = table();
    App.me = 'h';
    expect(dkSheet(viewFor(st, 'h'))).toBeNull();
    st.phase = 'over';
    st.result = { reason: 'durak', ranking: ['h', 'a', 'b'], durak: null, names: {} };
    const s = dkSheet(viewFor(st, 'h'))!;
    expect(s.key).toBeNull();
    expect(s.title).toBe('Unentschieden!');
    expect(s.taunt).toBeNull();
    expect(s.lead).toContain('keinen Durak');
  });
});

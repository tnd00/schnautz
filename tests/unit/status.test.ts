/*
 * Statuszeile (src/ui/status.ts) für Shithead in allen Phasen, ohne DOM. Geprüft wird der Text der Haupt- und
 * Unterzeile, die Stimmung und ob Knöpfe statt der Unterzeile stehen.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { rankOf } from '../../src/game/cards';
import { addPlayer, newState } from '../../src/game/state';
import type { State, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { statusOf, type Status } from '../../src/ui/status';
import { rngF } from './helpers';

/** Shithead zu dritt: h (Gastgeber), a und b. Tauschrunde, bis alle bereit sind. */
function table(seed = 7): State {
  const rng = rngF(seed);
  const st = newState('h', 'H');
  addPlayer(st, 'a', 'Anna');
  addPlayer(st, 'b', 'Bert');
  act(st, 'h', { type: 'game', game: 'shithead' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  return st;
}

function play(st: State): State {
  for (const id of ['h', 'a', 'b']) act(st, id, { type: 'shready' });
  // Das 4er-Fenster vom Start schließen, damit der Zug frei ist
  if (st.sh) st.sh.win = null;
  return st;
}

/** Ansicht aus Sicht von `me` und deren Status als reiner Text. */
function statusFor(st: State, me: string): { s: Status; v: View; text: string } {
  App.me = me;
  App.zerHide = '';
  const v = viewFor(st, me);
  const s = statusOf(v);
  if (!s) throw new Error('Shithead liefert immer einen Status');
  const strip = (h: string) => h.replace(/<[^>]+>/g, '');
  return { s, v, text: `${strip(s.main)} | ${strip(s.sub)}` };
}

const turnOf = (st: State): string => st.players[st.turn]?.id ?? '';

afterEach(() => {
  App.me = '';
  App.zerHide = '';
  App.role = null;
});

const noFour = (cs: string[]): string[] => cs.filter((c) => rankOf(c) !== '4');

describe('Statuszeile Shithead', () => {
  it('liefert für andere Spiele noch null', () => {
    const st = newState('h', 'H');
    addPlayer(st, 'a', 'Anna');
    act(st, 'h', { type: 'game', game: 'durak' }, rngF(1));
    App.me = 'h';
    expect(statusOf(viewFor(st, 'h'))).toBeNull();
  });

  it('Tauschrunde: erst tauschen, nach Bereit warten mit KI-Zeichen', () => {
    const st = table();
    const own = statusFor(st, 'h');
    expect(own.s.tone).toBe('turn');
    expect(own.text).toContain('Tauschrunde');
    act(st, 'h', { type: 'shready' });
    st.players.find((p) => p.id === 'b')!.bot = true;
    const wait = statusFor(st, 'h');
    expect(wait.text).toBe('Tauschrunde | Warte auf Anna und KI Bert.');
  });

  it('eigener Zug: Du bist dran mit Hinweis, was zu tun ist', () => {
    const st = play(table());
    const me = turnOf(st);
    const { s, text } = statusFor(st, me);
    expect(s.tone).toBe('turn');
    expect(text).toMatch(/^Du bist dran\. \| (Tippe gleiche Karten an und leg sie ab\.|Keine Karte passt\.)/);
  });

  it('fremder Zug: Name ist dran, nie „Du ist“', () => {
    const st = play(table());
    const other = st.players.find((p) => p.id !== turnOf(st))!.id;
    const { s, text } = statusFor(st, other);
    expect(s.tone).toBe('calm');
    const name = st.players[st.turn].name;
    expect(text.startsWith(`${name} ist dran.`)).toBe(true);
    expect(text).not.toMatch(/Du ist/);
  });

  it('4er-Sperre: Gleich bist du dran mit Uhr', () => {
    const st = play(table());
    const me = turnOf(st);
    st.sh!.win = { r: '4', by: [], id: 1, lock: true };
    const { s, text } = statusFor(st, me);
    expect(s.tone).toBe('alert');
    expect(s.main).toContain('id="wincd"');
    expect(text).toContain('Gleich bist du dran.');
    expect(text).toContain('Neuer Stapel, alle dürfen jetzt ihre 4er reinwerfen, du auch.');
  });

  it('offenes Fenster ohne eigene 4: kein Hinweis zur 4, kein Knopf', () => {
    const st = play(table());
    const other = st.players.find((p) => p.id !== turnOf(st))!.id;
    const S = st.sh!;
    S.P[other].hand = noFour(S.P[other].hand);
    S.P[other].up = noFour(S.P[other].up);
    S.win = { r: '4', by: [], id: 1, lock: false };
    const { s, text } = statusFor(st, other);
    expect(text).not.toContain('4');
    expect(s.quick).toBeUndefined();
    expect(s.tone).toBe('calm');
  });

  it('offenes Fenster mit eigener 4: 4er-Knopf statt Unterzeile', () => {
    const st = play(table());
    const other = st.players.find((p) => p.id !== turnOf(st))!.id;
    const S = st.sh!;
    S.P[other].hand = ['C4', ...noFour(S.P[other].hand)];
    S.win = { r: '4', by: [], id: 1, lock: false };
    const { s } = statusFor(st, other);
    expect(s.quick).toContain('data-act="shthrow"');
    expect(s.tone).toBe('alert');
  });

  it('Person am Zug offline: der 4er-Knopf bleibt für den Gastgeber', () => {
    const st = play(table());
    const now = turnOf(st);
    const host = now === 'h' ? 'a' : 'h';
    st.players.find((p) => p.id === now)!.online = false;
    const S = st.sh!;
    S.P[host].hand = ['C4', ...noFour(S.P[host].hand)];
    S.win = { r: '4', by: [], id: 1, lock: true };
    App.role = 'host';
    const { s } = statusFor(st, host);
    expect(s.quick).toContain('data-act="shthrow"');
    expect(s.quick).not.toContain('data-act="skip"');
  });

  it('Person am Zug offline: Gastgeber ohne Knopf darf für sie spielen, Gast wartet', () => {
    const st = play(table());
    const now = turnOf(st);
    const others = st.players.filter((p) => p.id !== now).map((p) => p.id);
    const actor = st.players.find((p) => p.id === now)!;
    actor.online = false;
    for (const id of others) {
      st.sh!.P[id].hand = noFour(st.sh!.P[id].hand);
      st.sh!.P[id].up = noFour(st.sh!.P[id].up);
    }
    App.role = 'host';
    const host = statusFor(st, others[0]);
    expect(host.text.startsWith(`${actor.name} ist gerade offline.`)).toBe(true);
    expect(host.s.quick).toContain('data-act="skip"');
    expect(host.s.quick).toContain(`Für ${actor.name} spielen`);
    App.role = 'guest';
    const guest = statusFor(st, others[1]);
    expect(guest.s.quick).toBeUndefined();
    expect(guest.text).toBe(`${actor.name} ist dran. | ${actor.name} ist gerade offline. Das Spiel wartet.`);
  });

  it('KI am Zug heißt „KI Name“, kein „Danach bist du dran.“', () => {
    const st = play(table());
    const now = turnOf(st);
    const actor = st.players.find((p) => p.id === now)!;
    actor.bot = true;
    const all = st.players.filter((p) => p.id !== now).map((p) => statusFor(st, p.id));
    for (const { text } of all) {
      expect(text.startsWith(`KI ${actor.name} ist dran.`)).toBe(true);
      expect(text).not.toContain('Danach');
    }
  });

  it('eigener Zug mit leerer Hand: erst offene, dann verdeckte Tischkarten', () => {
    const st = play(table());
    const me = turnOf(st);
    const P = st.sh!.P[me];
    P.hand = [];
    const up = statusFor(st, me);
    expect(up.text).toContain('Deine Hand ist leer. Jetzt sind die offenen Tischkarten dran.');
    P.up = [];
    const blind = statusFor(st, me);
    expect(blind.text.startsWith('Jetzt blind! | Tippe eine verdeckte Karte an.')).toBe(true);
    expect(blind.s.tone).toBe('turn');
  });

  it('fertig: Platz und Werfen', () => {
    const st = play(table());
    const other = st.players.find((p) => p.id !== turnOf(st))!.id;
    st.sh!.finished.push(other);
    st.players.find((p) => p.id === other)!.place = 1;
    const { text } = statusFor(st, other);
    expect(text.startsWith('Du bist fertig! | Platz 1.')).toBe(true);
  });

  it('Partieende: Aufdecken bis zur Enthüllung, danach Partie vorbei', () => {
    const st = play(table());
    st.phase = 'over';
    const plain = statusFor(st, 'h');
    expect(plain.s.tone).toBe('over');
    expect(plain.text).toBe('Partie vorbei. | ');
    App.me = 'h';
    App.zerHide = 'a';
    const s = statusOf(viewFor(st, 'h'));
    expect(s?.main).toBe('Aufdecken …');
  });

  it('Texte halten die Regeln aus CLAUDE.md ein', () => {
    const st = play(table());
    const all = st.players.map((p) => statusFor(st, p.id).text).join(' ');
    expect(all).not.toMatch(/[–—]|,\s+und\b|undefined|null/);
  });
});

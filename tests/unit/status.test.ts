/*
 * Statuszeile (src/ui/status.ts) für Shithead in allen Phasen, ohne DOM. Geprüft wird der Text der Haupt- und
 * Unterzeile, die Stimmung und ob Knöpfe statt der Unterzeile stehen.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { rankOf } from '../../src/game/cards';
import { SH_ORD } from '../../src/game/constants';
import { shCanPlay, shNeed, shWhyNot, type ShCardRef } from '../../src/game/shithead';
import { addPlayer, newState } from '../../src/game/state';
import type { State, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { shPileInfo } from '../../src/ui/render/shithead';
import { shDimWhy } from '../../src/ui/shithead/input';
import { statusOf, type Status } from '../../src/ui/status';
import { codeOf, msgOf, playOut, rngF } from './helpers';

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
  it('liefert für alle vier Spiele eine Statuszeile mit Hauptzeile', () => {
    for (const game of ['shithead', 'durak', 'cabo', 'schnautz'] as const) {
      const rng = rngF(1);
      const st = newState('h', 'H');
      addPlayer(st, 'a', 'Anna');
      act(st, 'h', { type: 'game', game }, rng);
      act(st, 'h', { type: 'start' }, rng);
      App.me = 'h';
      const s = statusOf(viewFor(st, 'h'));
      expect(s.main, game).not.toBe('');
      expect(['calm', 'turn', 'alert', 'knock', 'over']).toContain(s.tone);
    }
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
    expect(s.main).toBe('Aufdecken …');
  });

  it('Texte halten die Regeln aus CLAUDE.md ein', () => {
    const st = play(table());
    const all = st.players.map((p) => statusFor(st, p.id).text).join(' ');
    expect(all).not.toMatch(/[–—]|,\s+und\b|undefined|null/);
  });
});

/** Alle eigenen Karten als Verweis, dazu je einer hinter dem Ende (fehlt, wird verworfen). */
function refsOf(st: State, pid: string): ShCardRef[] {
  const P = st.sh!.P[pid];
  const out: ShCardRef[] = [];
  for (const [src, n] of [
    ['hand', P.hand.length],
    ['up', P.up.length],
    ['down', P.down.length],
  ] as const)
    for (let i = 0; i <= n; i++) out.push({ src, i });
  return out;
}

/** Was shAct für genau diese eine Karte sagen würde, auf einer Kopie. */
function actFor(st: State, pid: string, ref: ShCardRef): ReturnType<typeof act> {
  const copy = structuredClone(st);
  const a =
    ref.src === 'down'
      ? { type: 'shblind' as const, i: ref.i }
      : { type: 'shplay' as const, from: ref.src, idx: [ref.i] };
  return act(copy, pid, a);
}

describe('shWhyNot: Grund zur einzelnen Karte', () => {
  it('liefert in vielen Lagen denselben Code und dieselben Argumente wie act, auf Zustand und eigener Ansicht', () => {
    let checked = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const st = table(seed);
      const rng = rngF(seed * 31);
      for (const id of ['h', 'a', 'b']) act(st, id, { type: 'shready' }, rng);
      let step = 0;
      playOut(st, rng, (s) => {
        step++;
        if (step % 3 || s.phase !== 'play') return false;
        for (const p of s.players)
          for (const ref of refsOf(s, p.id)) {
            const want = actFor(s, p.id, ref);
            const got = shWhyNot(s, p.id, ref);
            const gotView = shWhyNot(viewFor(s, p.id), p.id, ref);
            expect(got).toEqual(want);
            expect(gotView).toEqual(want);
            seen.add(codeOf(want) ?? 'ok');
            checked++;
          }
        return false;
      });
    }
    expect(checked).toBeGreaterThan(500);
    for (const c of ['ok', 'any.notYourTurn', 'sh.noFit', 'sh.handFirst', 'sh.blindLast', 'any.pickCard'])
      expect(seen.has(c)).toBe(true);
  });

  it('nennt die 4er-Sperre, die Tauschrunde und das Partieende wie act', () => {
    const st = table();
    const ref: ShCardRef = { src: 'hand', i: 0 };
    expect(shWhyNot(st, 'h', ref)).toEqual(actFor(st, 'h', ref));
    expect(codeOf(shWhyNot(st, 'h', ref))).toBe('sh.swapping');
    for (const id of ['h', 'a', 'b']) act(st, id, { type: 'shready' });
    const me = turnOf(st);
    expect(st.sh!.win?.lock).toBe(true);
    expect(codeOf(shWhyNot(st, me, ref))).toBe('sh.winLock');
    expect(shWhyNot(st, me, ref)).toEqual(actFor(st, me, ref));
    st.phase = 'over';
    expect(codeOf(shWhyNot(st, me, ref))).toBe('any.over');
  });

  it('shNeed und shCanPlay sind sich für jeden Wert einig, der Hinweis am Stapel liest shNeed', () => {
    const st = play(table());
    App.me = 'h';
    const ranks = Object.keys(SH_ORD) as (keyof typeof SH_ORD)[];
    for (const top of ranks)
      for (const three of [false, true]) {
        const pile = three ? [`H${top}`, 'S3'] : [`H${top}`];
        const t = { rules: st.rules, sh: { pile } };
        const n = shNeed(t);
        for (const r of ranks) {
          const free = r === '2' || r === '3' || r === '10';
          const byNeed =
            free ||
            n.k === 'empty' ||
            n.k === 'threes' ||
            n.k === 'two' ||
            (n.k === 'max' ? SH_ORD[r] <= SH_ORD[n.r] : n.k === 'min' && SH_ORD[r] >= SH_ORD[n.r]);
          expect(shCanPlay(t, r), `${pile.join(' ')} ${r}`).toBe(byNeed);
        }
        if (top !== '3') expect(n.k === 'two' || n.k === 'max' || n.k === 'min').toBe(true);
        if (top !== '3') expect('through' in n && n.through).toBe(three);
      }
    const v = viewFor(st, 'h');
    expect(shPileInfo(v, [])).toBe('Leer, alles geht');
    expect(shPileInfo(v, ['S3'])).toBe('Nur Dreier, alles geht');
    expect(shPileInfo(v, ['HB', 'S3'])).toBe('Bube oder höher (durch die 3)');
    expect(shPileInfo(v, ['H7'])).toBe('7 oder niedriger');
    expect(shPileInfo(v, ['H2'])).toBe('Nach der 2 geht alles');
  });

  it('ausgegraute Karte: Grund nur am eigenen Zug, nicht in der 4er-Sperre', () => {
    const st = play(table());
    const me = turnOf(st);
    const S = st.sh!;
    S.pile = ['HA'];
    S.P[me].hand = ['S5', 'D2'];
    App.me = me;
    const v = viewFor(st, me);
    const why = shDimWhy(v, { src: 'hand', i: 0 });
    expect(codeOf(why)).toBe('sh.noFit');
    expect(msgOf(why, st, me)).toBe('Die Karte passt nicht auf den Stapel.');
    expect(shDimWhy(v, { src: 'hand', i: 1 })).toBeNull();
    S.win = { r: '4', by: [], id: st.n, lock: true };
    expect(shDimWhy(viewFor(st, me), { src: 'hand', i: 0 })).toBeNull();
    S.win = null;
    const other = st.players.find((p) => p.id !== me)!.id;
    App.me = other;
    expect(shDimWhy(viewFor(st, other), { src: 'hand', i: 0 })).toBeNull();
  });
});

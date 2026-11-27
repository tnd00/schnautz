/*
 * Cabo: Statuszeile (cbStatus in src/ui/render/cabo.ts) in allen Phasen, ohne DOM, cbWhyNot (Grund am Tisch) mit
 * denselben Codes wie der Gastgeber und das Ergebnisblatt (cbSheet) aus echt gespielten Runden.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { cbWhyNot } from '../../src/game/cabo';
import { addPlayer, newState } from '../../src/game/state';
import type { Action, CaboResult, Card, State, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { cbHintText, cbRole, cbSheet, cbStatus } from '../../src/ui/render/cabo';
import type { Sheet } from '../../src/ui/render/result';
import type { Status } from '../../src/ui/status';
import { codeOf, rngF } from './helpers';

/** Cabo zu dritt: h (Gastgeber), a und b, dazu auf Wunsch weitere Leute, in der Ansehrunde. */
function table(seed = 3, snap = false, more: [string, string][] = []): State {
  const rng = rngF(seed);
  const st = newState('h', 'H');
  addPlayer(st, 'a', 'Anna');
  addPlayer(st, 'b', 'Bert');
  for (const [id, name] of more) addPlayer(st, id, name);
  act(st, 'h', { type: 'game', game: 'cabo' }, rng);
  if (snap) act(st, 'h', { type: 'rules', rules: { cb: { snap: true } } }, rng);
  act(st, 'h', { type: 'start' }, rng);
  return st;
}

/** Alle haben angesehen, die Runde läuft. */
function play(seed = 3, snap = false, more: [string, string][] = []): State {
  const st = table(seed, snap, more);
  for (const p of st.players) act(st, p.id, { type: 'cblook', ids: st.cb!.P[p.id].slice(0, 2).map((s) => s.id) });
  return st;
}

const turnOf = (st: State): string => st.players[st.turn]?.id ?? '';
const other = (st: State): string => st.players.find((p) => p.id !== turnOf(st))!.id;
const strip = (h: string): string => h.replace(/<[^>]+>/g, '');

function statusFor(st: State, me: string, role: 'host' | 'guest' = 'guest'): { s: Status; v: View; text: string } {
  App.me = me;
  App.role = role;
  const v = viewFor(st, me);
  const s = cbStatus(v);
  return { s, v, text: `${strip(s.main)} | ${strip(s.sub)}` };
}

afterEach(() => {
  App.me = '';
  App.zerHide = '';
  App.role = null;
  App.cs = { ids: [], opp: null, snap: false };
});

describe('Statuszeile Cabo', () => {
  it('Ansehrunde: erst zwei Karten antippen, dann warten mit KI-Zeichen', () => {
    const st = table();
    const own = statusFor(st, 'h');
    expect(own.s.tone).toBe('turn');
    expect(own.text).toBe(
      'Karten ansehen | Tippe zwei deiner Karten an. Sie sind nur kurz zu sehen, merk sie dir gut.',
    );
    App.cs.ids = [st.cb!.P.h[0].id];
    expect(statusFor(st, 'h').text).toBe('Karten ansehen | Noch eine. Sie ist nur kurz zu sehen, merk sie dir gut.');
    act(st, 'h', { type: 'cblook', ids: st.cb!.P.h.slice(0, 2).map((s) => s.id) });
    st.players.find((p) => p.id === 'b')!.bot = true;
    const wait = statusFor(st, 'h');
    expect(wait.s.tone).toBe('calm');
    expect(wait.text).toBe('Karten ansehen | Warte auf Anna und KI Bert.');
  });

  it('eigener Zug: Du bist dran mit Hinweis, was zu tun ist', () => {
    const st = play();
    const { s, text } = statusFor(st, turnOf(st));
    expect(s.tone).toBe('turn');
    expect(text).toBe(
      'Du bist dran. | Zieh vom Stapel, nimm die Ablage oder ruf Cabo, wenn du glaubst, du hast am wenigsten.',
    );
  });

  it('fremder Zug: Name ist dran, KI mit Zeichen, nie „Du ist“', () => {
    const st = play();
    const cur = turnOf(st);
    const name = st.players[st.turn].name;
    const a = statusFor(st, other(st));
    expect(a.s.tone).toBe('calm');
    expect(a.text).toBe(`${name} ist dran. | `);
    st.players[st.turn].bot = true;
    expect(statusFor(st, other(st)).text.startsWith(`KI ${name} ist dran.`)).toBe(true);
    expect(statusFor(st, other(st)).text).not.toMatch(/Du ist/);
    expect(cur).not.toBe(other(st));
  });

  it('gezogene Karte vom Stapel mit Fähigkeit, von der Ablage und mehrere gewählt', () => {
    const st = play();
    const me = turnOf(st);
    st.cb!.hold = { by: me, c: 'SD', from: 'deck' };
    const deck = statusFor(st, me);
    expect(deck.s.tone).toBe('turn');
    expect(deck.text).toBe(
      'Du hast eine Dame gezogen. | Tausch sie gegen eine deiner Karten ein oder leg sie ab, dann darfst du blind tauschen.',
    );
    st.cb!.hold = { by: me, c: 'HK', from: 'pile' };
    expect(statusFor(st, me).text).toBe(
      'Du hast einen roten König genommen. | Tausch sie gegen eine deiner Karten oder mehrere gleiche ein. Sie liegt danach offen.',
    );
    st.cb!.hold = { by: me, c: 'H3', from: 'deck' };
    expect(statusFor(st, me).text).toBe(
      'Du hast eine 3 gezogen. | Tausch sie gegen eine oder mehrere gleiche Karten ein oder leg sie ab.',
    );
    App.cs.ids = st.cb!.P[me].slice(0, 2).map((s) => s.id);
    expect(statusFor(st, me).text).toContain('Du tauschst 2 Karten auf einmal ein.');
  });

  it('Kurzhinweis statt Statuszeile: gezogene Karte einmal je Partie, Ablage nennt offene Karten, Fähigkeit jedes Mal', () => {
    const st = play(5);
    const me = turnOf(st);
    App.me = me;
    const hint = (): string | null => {
      const v = viewFor(st, me);
      return cbHintText(v, v.cb!, cbRole(v), false);
    };
    st.cb!.hold = { by: me, c: 'H3', from: 'deck' };
    expect(hint()).toBe('Tausch sie gegen eine oder mehrere gleiche Karten ein oder leg sie ab.');
    expect(hint()).toBeNull();
    st.cb!.hold = { by: me, c: 'HK', from: 'pile' };
    expect(hint()).toBe('Karten von der Ablage liegen danach offen vor dir, alle haben sie gesehen.');
    expect(hint()).toBeNull();
    st.cb!.hold = null;
    st.cb!.power = { by: me, kind: 'spy', c: 'H9' };
    expect(hint()).toBe('Tippe eine Karte von jemand anderem an. Nur du siehst sie.');
    expect(hint()).toBe('Tippe eine Karte von jemand anderem an. Nur du siehst sie.');
    st.cb!.power = null;
    expect(hint()).toBeNull();
  });

  it('Fähigkeiten: Ansehen, Spionieren, Blindtausch', () => {
    const st = play();
    const me = turnOf(st);
    st.cb!.power = { by: me, kind: 'peek', c: 'H7' };
    expect(statusFor(st, me).text).toBe('Ansehen! | Tippe eine deiner Karten an. Nur du siehst sie.');
    st.cb!.power = { by: me, kind: 'spy', c: 'H9' };
    expect(statusFor(st, me).text).toBe('Spionieren! | Tippe eine Karte von jemand anderem an. Nur du siehst sie.');
    st.cb!.power = { by: me, kind: 'swap', c: 'HB' };
    expect(statusFor(st, me).text).toBe(
      'Blindtausch! | Wähle eine eigene und eine fremde Karte. Was du bekommst, siehst du nicht.',
    );
    App.cs.ids = [st.cb!.P[me][0].id];
    App.cs.opp = { to: other(st), id: st.cb!.P[other(st)][0].id };
    expect(statusFor(st, me).text).toBe('Blindtausch! | Alles gewählt. Tippe auf Blind tauschen.');
    // Fremde Fähigkeit, ohne KI-Zeichen im Nebensatz
    expect(statusFor(st, other(st)).text).toMatch(/ ist dran\. \| \w+ darf blind tauschen\.$/);
  });

  it('fremde gezogene Karte: von der Ablage mit Karte, vom Stapel ohne', () => {
    const st = play();
    const cur = turnOf(st);
    const name = st.players[st.turn].name;
    st.cb!.hold = { by: cur, c: 'SD', from: 'pile' };
    expect(statusFor(st, other(st)).text).toBe(`${name} ist dran. | ${name} hat die Dame von der Ablage genommen, 12.`);
    st.cb!.hold = { by: cur, c: 'SD', from: 'deck' };
    expect(statusFor(st, other(st)).text).toBe(`${name} ist dran. | ${name} hat vom Stapel gezogen und überlegt.`);
  });

  it('nach dem Cabo-Ruf: letzter Zug, danach noch einmal dran oder kein Zug mehr', () => {
    const st = play();
    const caller = turnOf(st);
    act(st, caller, { type: 'cbcabo' });
    const next = turnOf(st);
    const last = statusFor(st, next);
    expect(last.s.tone).toBe('knock');
    expect(last.text).toBe(
      'Dein letzter Zug! | Zieh vom Stapel oder nimm die Ablage. Danach ist noch eine Person dran.',
    );
    const third = st.players.find((p) => p.id !== caller && p.id !== next)!.id;
    expect(statusFor(st, third).text).toMatch(/ ist dran\. \| Du bist danach noch einmal dran\.$/);
    expect(statusFor(st, caller).text).toMatch(/ ist dran\. \| Du hast keinen Zug mehr in dieser Runde\.$/);
  });

  it('Schnappen: Hinweis statt Unterzeile, solange der Modus an ist', () => {
    const st = play(3, true);
    st.cb!.pile.push('H5');
    App.cs.snap = true;
    expect(statusFor(st, other(st)).s.sub).toBe(
      'Tippe die Karte an, die zur Ablage passt. Daneben gibt es eine Strafkarte.',
    );
  });

  it('offline am Zug: Gastgeber bekommt den Knopf, Gäste lesen, dass das Spiel wartet', () => {
    const st = play();
    const cur = st.players[st.turn];
    cur.online = false;
    const host = statusFor(st, other(st), 'host');
    expect(strip(host.s.main)).toBe(`${cur.name} ist gerade offline.`);
    expect(host.s.quick).toContain('data-act="skip"');
    expect(host.s.quick).toContain('class="qlbl"');
    const guest = statusFor(st, other(st), 'guest');
    expect(guest.s.quick).toBeUndefined();
    expect(guest.text).toBe(`${cur.name} ist dran. | ${cur.name} ist gerade offline. Das Spiel wartet.`);
  });

  it('wer noch ansehen muss, liest seinen Hinweis, auch wenn jemand offline ist', () => {
    const st = table();
    st.players.find((p) => p.id === 'a')!.online = false;
    expect(statusFor(st, 'h', 'host').text).toContain('Tippe zwei deiner Karten an.');
  });

  it('Runde vorbei, Partie vorbei, während der Krönung Aufdecken', () => {
    const st = play();
    st.phase = 'end';
    const end = statusFor(st, 'h');
    expect(end.s.tone).toBe('over');
    expect(end.text).toBe('Runde vorbei. | ');
    st.phase = 'over';
    expect(statusFor(st, 'h').text).toBe('Partie vorbei. | ');
    App.me = 'h';
    App.zerHide = 'a';
    const v = viewFor(st, 'h');
    expect(strip(cbStatus(v).main)).toBe('Aufdecken …');
    expect(cbStatus(v).sub).toBe('Gleich kommt das Ergebnis.');
  });

  it('ohne eigene Reihe: zusehen bis zur nächsten Runde', () => {
    const st = play();
    delete st.cb!.P.b;
    const { text } = statusFor(st, 'b');
    expect(text).toMatch(/ ist dran\. \| Du spielst ab der nächsten Runde mit\.$/);
  });

  it('am Zug ohne eigene Karten', () => {
    const st = play();
    const me = turnOf(st);
    st.cb!.P[me] = [];
    const { s, text } = statusFor(st, me);
    expect(s.tone).toBe('turn');
    expect(text).toBe('Du bist dran. | Du hast keine Karten mehr. Zieh vom Stapel und leg ab oder ruf Cabo.');
  });

  it('letzter Zug nach dem Cabo-Ruf ohne Nachfolger, mit und ohne eigene Karten', () => {
    const st = play();
    act(st, turnOf(st), { type: 'cbcabo' });
    // Die nächste Person zieht eine Karte ohne Fähigkeit und legt sie ab, danach kommt die letzte
    st.cb!.deck.push('H2');
    const next = turnOf(st);
    expect(act(st, next, { type: 'cbdraw', from: 'deck' })).toBeNull();
    expect(act(st, next, { type: 'cbdiscard' })).toBeNull();
    const last = turnOf(st);
    expect(st.cb!.left).toEqual([last]);
    const withCards = statusFor(st, last);
    expect(withCards.s.tone).toBe('knock');
    expect(withCards.text).toBe('Dein letzter Zug! | Zieh vom Stapel oder nimm die Ablage, dann wird aufgedeckt.');
    st.cb!.P[last] = [];
    expect(statusFor(st, last).text).toBe('Dein letzter Zug! | Zieh vom Stapel, dann wird aufgedeckt.');
  });

  it('nach dem Ansehen: gleich geht es los, wenn niemand mehr fehlt', () => {
    const st = table();
    act(st, 'h', { type: 'cblook', ids: st.cb!.P.h.slice(0, 2).map((s) => s.id) });
    // Durch act startet die Runde mit dem letzten Ansehen, hier steht die Ansehrunde noch kurz
    st.players.forEach((p) => (p.ready = true));
    expect(st.phase).toBe('peek');
    const { s, text } = statusFor(st, 'h');
    expect(s.tone).toBe('calm');
    expect(text).toBe('Karten ansehen | Gleich geht es los.');
  });

  it('zusehen, wenn nur noch KIs spielen: Gastgeber mit Vorspul-Knöpfen, Gäste mit Satz', () => {
    const st = play(3, false, [['c', 'Cleo']]);
    delete st.cb!.P.h;
    delete st.cb!.P.c;
    st.players.filter((p) => p.id === 'a' || p.id === 'b').forEach((p) => (p.bot = true));
    // Am Zug ist eine KI, auch wenn vorher der Gastgeber dran war
    if (!st.cb!.P[turnOf(st)]) st.turn = st.players.findIndex((p) => p.id === 'a');
    const host = statusFor(st, 'h', 'host');
    expect(strip(host.s.main)).toMatch(/^KI (Anna|Bert) ist dran\.$/);
    expect(host.s.quick).toContain('data-act="ffwd"');
    expect(host.s.quick).toContain('data-act="restart"');
    expect(host.s.quick).toContain('data-act="lobbynow"');
    const guest = statusFor(st, 'c', 'guest');
    expect(strip(guest.s.quick ?? '')).toBe('Nur noch KIs im Spiel. Der Gastgeber kann vorspulen.');
    expect(guest.s.quick).not.toContain('data-act=');
  });

  it('nach dem Ansehen mit jemandem offline: Gastgeber bekommt den Knopf, Gäste lesen, dass es wartet', () => {
    const st = table();
    act(st, 'h', { type: 'cblook', ids: st.cb!.P.h.slice(0, 2).map((s) => s.id) });
    act(st, 'b', { type: 'cblook', ids: st.cb!.P.b.slice(0, 2).map((s) => s.id) });
    st.players.find((p) => p.id === 'a')!.online = false;
    const host = statusFor(st, 'h', 'host');
    expect(strip(host.s.main)).toBe('Anna ist gerade offline.');
    expect(host.s.quick).toContain('data-act="skip"');
    expect(strip(host.s.quick ?? '')).toBe('Für Anna spielen');
    const guest = statusFor(st, 'b', 'guest');
    expect(guest.s.quick).toBeUndefined();
    expect(guest.text).toBe('Karten ansehen | Anna ist gerade offline. Das Spiel wartet.');
  });
});

/** Karten einer Reihe setzen, die Platz-IDs bleiben, neue Plätze bekommen neue IDs. */
function setRow(st: State, id: string, cards: Card[]): void {
  const C = st.cb!;
  C.P[id] = cards.map((c, i) => ({ id: C.P[id][i]?.id ?? C.sid++, c }));
}

/**
 * Eine Runde echt bis zum Aufdecken spielen: Karten und Stände setzen, `caller` ruft Cabo. Ohne Rufer liegt nur eine
 * Karte im Stapel, die Runde endet mit „Stapel leer“. Alle anderen ziehen vom Stapel und legen ab, der Stapel hat nur
 * Zweien ohne Fähigkeit, die Hände bleiben also, wie sie gesetzt sind.
 */
function finish(hands: Record<string, Card[]>, caller: string | null, pts: Record<string, number> = {}): State {
  const st = play();
  for (const [id, cards] of Object.entries(hands)) setRow(st, id, cards);
  for (const [id, n] of Object.entries(pts)) st.players.find((p) => p.id === id)!.cbp = n;
  st.cb!.deck = caller ? Array<Card>(8).fill('H2') : ['H2'];
  if (caller) {
    st.turn = st.players.findIndex((p) => p.id === caller);
    expect(act(st, caller, { type: 'cbcabo' })).toBeNull();
  }
  for (let k = 0; k < 8 && st.phase === 'play'; k++) {
    const cur = turnOf(st);
    expect(act(st, cur, { type: 'cbdraw', from: 'deck' })).toBeNull();
    expect(act(st, cur, { type: 'cbdiscard' })).toBeNull();
  }
  expect(['end', 'over']).toContain(st.phase);
  return st;
}

function sheetFor(st: State, me: string): { s: Sheet; r: CaboResult; core: Record<string, string> } {
  App.me = me;
  const s = cbSheet(viewFor(st, me));
  expect(s).not.toBeNull();
  // Ohne Auszeichnung: Das Urteil am Partieende steckt in einem span (.cbwhy)
  const core = Object.fromEntries(s!.rows.map((x) => [x.id, strip(x.core)]));
  return { s: s!, r: st.result as CaboResult, core };
}

/** Jede Platz-ID der Runde genau einmal, die Schlüsselzeile ist darunter */
function rowsOnce(s: Sheet, r: CaboResult): void {
  const ids = s.rows.map((x) => x.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect([...ids].sort()).toEqual(Object.keys(r.totals).sort());
  if (s.key) expect(ids).toContain(s.key);
}

/** Hände, die nichts Besonderes können: wenig, mittel, viel */
const LOW: Card[] = ['HA', 'H2', 'H3', 'HK'];
const MID: Card[] = ['H5', 'D5', 'S5', 'C5'];
const HIGH: Card[] = ['H9', 'D9', 'S9', 'C9'];
const KAMI: Card[] = ['SD', 'CD', 'SK', 'CK'];

describe('Ergebnisblatt Cabo', () => {
  it('außerhalb von Rundenende und Partieende kein Blatt', () => {
    const st = play();
    App.me = 'h';
    expect(cbSheet(viewFor(st, 'h'))).toBeNull();
    const peek = table();
    expect(cbSheet(viewFor(peek, 'h'))).toBeNull();
  });

  it('Cabo geschafft: Rufer als Schlüssel mit Karten, Satz aus Sicht des Rufers und der anderen', () => {
    const st = finish({ h: LOW, a: MID, b: HIGH }, 'h');
    expect(st.phase).toBe('end');
    const self = sheetFor(st, 'h');
    expect(self.s.title).toBe('Cabo geschafft!');
    expect(self.s.icon).toBe('🎯');
    expect(self.s.lead).toBe('Du hattest am wenigsten.');
    expect(self.s.key).toBe('h');
    expect(self.s.next).toBe('round');
    expect(self.s.taunt?.good).toBe(true);
    rowsOnce(self.s, self.r);
    const key = self.s.rows.find((x) => x.id === 'h')!;
    expect(key.name).toBe('Du');
    expect(key.hat).toBe('📣');
    expect(key.tone).toBe('win');
    // Karten am Rundenende in jeder Zeile, die Schlüsselzeile zeigt sie
    expect(key.cards).toEqual(LOW);
    expect(self.s.rows.find((x) => x.id === 'b')!.cards).toEqual(HIGH);
    // Summe nur, wenn sie von den Punkten abweicht
    expect(self.core).toEqual({ h: 'Summe 6 · +0', a: '+20', b: '+36' });
    const them = sheetFor(st, 'a');
    expect(them.s.title).toBe('Cabo geschafft!');
    expect(them.s.lead).toBe('H hatte am wenigsten.');
    expect(them.s.key).toBe('h');
    // Für alle anderen gibt es bei geschafftem Cabo keinen Spruch, dann fällt er weg statt leer Platz zu kosten
    expect(them.s.taunt).toBeNull();
  });

  it('Cabo daneben: Strafpunkte in der Kernzahl, Satz für Rufer und andere', () => {
    const st = finish({ h: LOW, a: ['H2', 'H3', 'H4', 'HA'], b: HIGH }, 'a');
    const self = sheetFor(st, 'a');
    expect(self.s.title).toBe('Cabo daneben!');
    expect(self.s.icon).toBe('🙈');
    expect(self.s.lead).toBe('Du bekommst 10 Strafpunkte obendrauf.');
    expect(self.s.key).toBe('a');
    expect(self.s.taunt?.good).toBe(false);
    expect(self.s.taunt?.text).toBeTruthy();
    expect(self.s.rows.find((x) => x.id === 'a')!.tone).toBe('lose');
    expect(self.core).toEqual({ h: '+6', a: 'Summe 10 · +20', b: '+36' });
    // Kurzform ohne Summe für lange Namen am Handy (fitRows), nur wo die Summe abweicht
    expect(self.s.rows.find((x) => x.id === 'a')!.short).toBe('+20');
    expect(self.s.rows.find((x) => x.id === 'h')!.short).toBeUndefined();
    const them = sheetFor(st, 'h');
    expect(them.s.lead).toBe('Anna bekommt 10 Strafpunkte obendrauf.');
    expect(them.s.taunt?.text).toBeTruthy();
    rowsOnce(them.s, them.r);
  });

  it('Kamikaze geht vor dem Rufer', () => {
    const st = finish({ h: LOW, a: MID, b: KAMI }, 'h');
    const { s, r, core } = sheetFor(st, 'a');
    expect(r.caller).toBe('h');
    expect(r.kami).toBe('b');
    expect(s.title).toBe('Kamikaze!');
    expect(s.icon).toBe('💥');
    expect(s.lead).toBe('Alle anderen bekommen 50 Punkte.');
    expect(s.key).toBe('b');
    expect(s.rows.find((x) => x.id === 'b')!.hat).toBe('💥');
    expect(s.rows.find((x) => x.id === 'h')!.hat).toBe('📣');
    // Die Summe der anderen zählt bei Kamikaze nicht, ihre 50 erklärt der Satz unter dem Titel
    expect(core).toEqual({ h: '+50', a: '+50', b: 'Summe 50 · +0' });
    expect(s.rows.find((x) => x.id === 'b')!.cards).toEqual(KAMI);
    expect(s.taunt?.text).toBeTruthy();
    rowsOnce(s, r);
  });

  it('Stapel leer: ohne Schlüsselzeile und ohne Spruch, genau 100 fällt auf 50', () => {
    const st = finish({ h: LOW, a: MID, b: HIGH }, null, { h: 94 });
    expect(st.phase).toBe('end');
    const them = sheetFor(st, 'a');
    expect(them.s.title).toBe('Stapel leer!');
    expect(them.s.lead).toBe('Keine Karten mehr, die Runde ist vorbei.');
    expect(them.s.key).toBeNull();
    expect(them.s.taunt).toBeNull();
    expect(them.s.next).toBe('round');
    expect(them.core).toEqual({ h: '+6 · auf 50', a: '+20', b: '+36' });
    expect(them.s.rows.find((x) => x.id === 'h')!.core).toBe('<span class="cbwhy">+6 · auf 50</span>');
    expect(them.s.rows.find((x) => x.id === 'h')!.val).toBe('50');
    rowsOnce(them.s, them.r);
    // Wer zurückfällt, bekommt einen eigenen Spruch
    expect(sheetFor(st, 'h').s.taunt?.good).toBe(true);
  });

  it('Partieende: König als Schlüssel ohne Karten, Urteil der letzten Runde in der Zeile', () => {
    // Anna ruft daneben und kommt über 100, H hat am wenigsten
    const st = finish({ h: ['HA', 'H2', 'HK', 'DK'], a: ['H2', 'H3', 'H4', 'H5'], b: HIGH }, 'a', { a: 80 });
    expect(st.phase).toBe('over');
    const king = sheetFor(st, 'h');
    expect(king.s.icon).toBe('👑');
    expect(strip(king.s.title)).toBe('Du bist Cabo-König!');
    expect(king.s.lead).toBe('');
    expect(king.s.key).toBe('h');
    expect(king.s.next).toBe('game');
    expect(king.s.taunt?.good).toBe(true);
    expect(king.s.rows.find((x) => x.id === 'h')!.hat).toBe('👑');
    expect(king.s.rows.find((x) => x.id === 'h')!.tone).toBe('win');
    // Am Partieende zählen nur noch die Punkte, auch der König steht ohne Karten
    expect(king.s.rows.every((x) => x.cards === undefined)).toBe(true);
    expect(king.core).toEqual({ h: '+3', a: 'Cabo daneben · +24', b: '+36' });
    // Das Urteil kann am Handy unter den Namen rücken
    expect(king.s.rows.find((x) => x.id === 'a')!.core).toBe('<span class="cbwhy">Cabo daneben · +24</span>');
    expect(king.s.rows.find((x) => x.id === 'h')!.core).toBe('+3');
    expect(king.s.rows.map((x) => x.place)).toEqual([1, 2, 3]);
    rowsOnce(king.s, king.r);
    const them = sheetFor(st, 'b');
    expect(strip(them.s.title)).toBe('H ist Cabo-König!');
    expect(them.s.title).not.toMatch(/Du ist/);
    expect(them.s.taunt?.good).toBe(false);
  });

  it('Partieende nach Kamikaze und nach genau 100', () => {
    const kami = finish({ h: LOW, a: MID, b: KAMI }, null, { h: 60, b: 10 });
    expect(kami.phase).toBe('over');
    const k = sheetFor(kami, 'a');
    expect(k.s.key).toBe('b');
    expect(k.core).toEqual({ h: '+50', a: '+50', b: 'Kamikaze · +0' });
    const reset = finish({ h: LOW, a: MID, b: HIGH }, null, { h: 94, a: 95 });
    expect(reset.phase).toBe('over');
    const r = sheetFor(reset, 'b');
    expect(r.core).toEqual({ h: 'genau 100 · auf 50', a: '+20', b: '+36' });
    expect(r.s.key).toBe('b');
  });

  it('Unentschieden: kein König, keine Schlüsselzeile, kein Spruch', () => {
    const st = finish({ h: MID, a: HIGH, b: MID }, null, { a: 90 });
    expect(st.phase).toBe('over');
    const { s } = sheetFor(st, 'h');
    expect(s.title).toBe('Unentschieden!');
    expect(s.icon).toBe('🤝');
    expect(s.key).toBeNull();
    expect(s.taunt).toBeNull();
    expect(s.lead).toBe('Vorne liegen mehrere gleichauf, diesmal gibt es keinen neuen König.');
    expect(s.next).toBe('game');
  });
});

/** Code einer Ablehnung, null wenn es geht, beim Gastgeber auf einer Kopie gerechnet */
const hostCode = (st: State, pid: string, a: Action): string | null => codeOf(act(structuredClone(st), pid, a));
const viewCode = (st: State, pid: string, a: Action): string | null => cbWhyNot(viewFor(st, pid), pid, a)?.e ?? null;

describe('cbWhyNot: dieselben Codes wie der Gastgeber', () => {
  const cases = (st: State): [string, Action][] => {
    const cur = turnOf(st);
    const o = other(st);
    const mine = st.cb!.P[cur][0].id;
    const theirs = st.cb!.P[o][0].id;
    return [
      [cur, { type: 'cbdraw', from: 'deck' }],
      [cur, { type: 'cbdraw', from: 'pile' }],
      [cur, { type: 'cbcabo' }],
      [cur, { type: 'cbswap', ids: [] }],
      [cur, { type: 'cbswap', ids: [mine] }],
      [cur, { type: 'cbdiscard' }],
      [cur, { type: 'cbpeek', id: mine }],
      [cur, { type: 'cbspy', to: o, id: theirs }],
      [cur, { type: 'cbspy', to: cur, id: mine }],
      [cur, { type: 'cbblind', id: mine, to: o, oid: theirs }],
      [cur, { type: 'cbblind', id: -1, to: '', oid: -1 }],
      [cur, { type: 'cblook', ids: [mine] }],
      [cur, { type: 'cbsnap', id: mine }],
      [cur, { type: 'cbskip' }],
      [o, { type: 'cbdraw', from: 'deck' }],
      [o, { type: 'cbskip' }],
      [o, { type: 'cbswap', ids: [theirs] }],
      [o, { type: 'cbsnap', id: theirs }],
    ];
  };
  const check = (st: State) => {
    for (const [pid, a] of cases(st)) {
      const want = hostCode(st, pid, a);
      expect(viewCode(st, pid, a), `${pid} ${JSON.stringify(a)}`).toBe(want);
      expect(cbWhyNot(st, pid, a)?.e ?? null, `Zustand ${pid} ${JSON.stringify(a)}`).toBe(want);
    }
  };

  it('Ansehrunde', () => {
    const st = table();
    expect(viewCode(st, 'h', { type: 'cblook', ids: [st.cb!.P.h[0].id] })).toBe('cb.pickTwo');
    expect(hostCode(st, 'h', { type: 'cblook', ids: [st.cb!.P.h[0].id] })).toBe('cb.pickTwo');
    expect(viewCode(st, 'h', { type: 'cbdraw', from: 'deck' })).toBe(
      hostCode(st, 'h', { type: 'cbdraw', from: 'deck' }),
    );
    expect(viewCode(st, 'h', { type: 'cbdraw', from: 'deck' })).toBe('cb.peeking');
  });

  it('am Zug ohne Karte, mit Karte vom Stapel und von der Ablage, mit Fähigkeiten', () => {
    const st = play(5, true);
    check(st);
    const cur = turnOf(st);
    st.cb!.cabo = other(st);
    check(st);
    st.cb!.cabo = null;
    st.cb!.hold = { by: cur, c: st.cb!.deck.pop()!, from: 'deck' };
    check(st);
    st.cb!.hold = { by: cur, c: 'SD', from: 'pile' };
    check(st);
    st.cb!.hold = null;
    for (const kind of ['peek', 'spy', 'swap'] as const) {
      st.cb!.power = { by: cur, kind, c: 'H7' };
      check(st);
    }
    st.cb!.power = null;
    st.cb!.pile = [];
    st.cb!.deck = [];
    check(st);
  });

  it('Schnappen aus und Rundenende über die Phase', () => {
    const st = play(5, false);
    check(st);
    st.phase = 'end';
    check(st);
  });

  it('Codes tragen keine Karten', () => {
    const st = play(5, true);
    for (const [pid, a] of cases(st)) {
      const r = cbWhyNot(viewFor(st, pid), pid, a);
      for (const val of Object.values(r?.a ?? {})) expect(String(val)).not.toMatch(/^[HSDC]/);
    }
  });
});

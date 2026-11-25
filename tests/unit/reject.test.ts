/*
 * Ablehnungen als Codes (Stufe 2.7 „Klare Worte“). Geprüft werden die Codeliste, die Vorlagen im Katalog, der
 * Phasengrund, der Draht in beide Richtungen (auch mit Gastgebern und Gästen von 2.6) und in Zufallspartien aller
 * vier Spiele, dass jede Ablehnung ein Code ist und any.unknown nur für Aktionen eines anderen Spiels steht.
 */
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act, fallbackMove } from '../../src/game/actions';
import { EMOTES, TOSS_ITEMS } from '../../src/game/constants';
import { GAME_NAME, GAMES } from '../../src/game/games';
import { isReject, isRejectCode, phaseReject, REJECT_CODES, rj, type RejectCode } from '../../src/game/reject';
import { addPlayer, newState } from '../../src/game/state';
import type { Action, ActionType, Card, GameKind, Phase, Rng, State } from '../../src/game/types';
import { ctxOfState, ctxOfView, REJECT_TEXT, rejectLog, rejectText, type RejectCtx } from '../../src/content/texts';
import { asReject, readReject, rejectAct, wireReject } from '../../src/net/protocol';
import { keepsInvite } from '../../src/net/guest';
import { viewFor } from '../../src/game/view';
import { REJECT_SAMPLES, rngF } from './helpers';

/** Hanna schaut zu, Lena ist p1. */
const NAMES: Readonly<Record<string, string>> = { h: 'Hanna', p1: 'Lena' };
const ctxFor = (me: string): RejectCtx => ({ me, name: (id) => NAMES[id] });
const sample = (e: RejectCode) => rj(e, REJECT_SAMPLES[e]);

/** So prüft ein Gast von 2.6 nach einer Abweisung, ob die Einladung bleibt (eingefroren). */
const OLD_KEEPS = /voll|alle Plätze sind besetzt|Lade die Seite neu/;

/**
 * Wortlaut, auf den sich Gäste von 2.6 verlassen: Sie lesen nur `msg`, und `keepsInvite` prüft dort den Regex oben.
 * Diese Sätze bleiben, solange `msg` gesendet wird (Entscheidung E6). Alle anderen Vorlagen stehen im Schnappschuss
 * und dürfen sich ändern (Entscheidung E2). Viele Spieltests prüfen noch den Wortlaut mit msgOf, wer einen Satz
 * ändert, stellt sie dabei auf codeOf um.
 */
const OLD_GUEST_TEXT: Readonly<Partial<Record<RejectCode, string>>> = {
  'seat.full': 'Der Tisch ist voll.',
  'seat.fullPlaying': 'Die Partie läuft schon und alle Plätze sind besetzt.',
  'seat.taken': 'Dieser Platz ist schon besetzt.',
  'net.oldPage': 'An diesem Tisch läuft Cabo. Lade die Seite neu, dann kannst du mitspielen.',
};

/** Regeln aus CLAUDE.md und Fehler beim Zusammensetzen */
const BAD: readonly (readonly [string, RegExp])[] = [
  ['Platzhalter', /[{}]/],
  ['undefined', /\bundefined\b|\bNaN\b|\[object/],
  ['Gedankenstrich', /[–—]/],
  ['Komma vor „und“', /,\s+und\b/],
  ['Doppelpunkt-Label', /(?:^|[.!?]\s+)[A-ZÄÖÜ][\wäöüß-]*(?: [\wäöüß-]+){0,2}:\s/],
  ['„Du“ mit Verb der dritten Person', /\bDu (?:ist|hat|war|wird|kann|darf|muss|will)\b/],
  ['Leerzeichen am Rand oder doppelt', /^\s|\s$| {2}/],
];

describe('Codeliste', () => {
  it('hat jeden Code genau einmal, alle in einer der acht Gruppen', () => {
    expect(new Set(REJECT_CODES).size).toBe(REJECT_CODES.length);
    for (const e of REJECT_CODES) expect(e).toMatch(/^(?:any|seat|net|sh|dk|cb|sz|bet)\.[a-z][A-Za-z]+$/);
    expect(REJECT_CODES.length).toBe(85);
  });

  it('erkennt Codes und Ablehnungen', () => {
    expect(isRejectCode('dk.room')).toBe(true);
    expect(isRejectCode('dk.nix')).toBe(false);
    expect(isRejectCode(42)).toBe(false);
    expect(isReject(rj('seat.full'))).toBe(true);
    expect(isReject({ e: 'seat.full', a: { n: 1 } })).toBe(true);
    expect(isReject('Der Tisch ist voll.')).toBe(false);
    expect(isReject({ e: 'gibt.es.nicht' })).toBe(false);
    expect(isReject(null)).toBe(false);
  });

  it('baut ohne Argumente kein leeres a', () => {
    expect(rj('any.over')).toEqual({ e: 'any.over' });
    expect(rj('dk.room', { n: 0 })).toEqual({ e: 'dk.room', a: { n: 0 } });
  });
});

describe('Katalog', () => {
  it('hat zu jedem Code eine Vorlage und keine übrigen', () => {
    expect(Object.keys(REJECT_TEXT).sort()).toEqual([...REJECT_CODES].sort());
  });

  it('zeigt jeden Wortlaut im Schnappschuss, die Sätze für Gäste von 2.6 bleiben fest', () => {
    const got = Object.fromEntries(REJECT_CODES.map((e) => [e, rejectText(sample(e), ctxFor('h'))]));
    // Neuer Wortlaut: Schnappschuss mit `npx vitest run -u tests/unit/reject.test.ts` erneuern und Diff ansehen
    expect(got).toMatchSnapshot();
    for (const [e, text] of Object.entries(OLD_GUEST_TEXT)) expect(got[e], e).toBe(text);
  });

  it('rendert jede Vorlage aus jedem Blickwinkel ohne kaputte Sätze', () => {
    const hits: string[] = [];
    for (const e of REJECT_CODES)
      for (const me of ['h', 'p1', '']) {
        const t = rejectText(sample(e), ctxFor(me));
        for (const [name, re] of BAD) if (re.test(t)) hits.push(`${e} (${me || 'niemand'}) ${name}: „${t}“`);
        if (!/[.!?]$/.test(t)) hits.push(`${e} ohne Satzende: „${t}“`);
      }
    expect(hits).toEqual([]);
  });

  it('nutzt nur erlaubte Argumente, keines heißt key', () => {
    for (const e of REJECT_CODES) {
      const a = REJECT_SAMPLES[e] ?? {};
      for (const [k, v] of Object.entries(a)) {
        expect(k).not.toMatch(/key|secret|token/i);
        expect(['p', 'on', 'g', 'n', 'min', 'max', 'c', 'a', 'top']).toContain(k);
        if (typeof v === 'string') expect(v.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it('spricht den eigenen Platz mit du an', () => {
    expect(rejectText(rj('any.allHere', { p: 'p1' }), ctxFor('p1'))).toBe('Du bist wieder da.');
    expect(rejectText(rj('any.allHere'), ctxFor('h'))).toBe('Alle sind da.');
    expect(rejectText(rj('sz.choosing', { p: 'h' }), ctxFor('h'))).toBe(
      'Erst entscheidest du, ob deine Karten bleiben.',
    );
    expect(rejectText(rj('sz.choosing'), ctxFor('h'))).toBe('Erst wird entschieden, ob die Karten bleiben.');
    expect(rejectText(rj('bet.targetDone', { p: 'h' }), ctxFor('h'))).toBe(
      'Du bist schon fertig. Tipp auf jemand anderen.',
    );
  });

  it('kennt die Mehrzahl', () => {
    expect(rejectText(rj('dk.room', { n: 0 }), ctxFor('h'))).toBe('In diesen Angriff passt nichts mehr.');
    expect(rejectText(rj('dk.room', { n: 1 }), ctxFor('h'))).toBe('Es passt nur noch eine Karte in diesen Angriff.');
    expect(rejectText(rj('dk.room', { n: 4 }), ctxFor('h'))).toBe('Es passen nur noch 4 Karten in diesen Angriff.');
    expect(rejectText(rj('seat.tooFew', { min: 3 }), ctxFor('h'))).toBe('Ihr braucht mindestens 3 Leute am Tisch.');
    expect(rejectText(rj('cb.pickTwo', { n: 1 }), ctxFor('h'))).toBe('Wähle eine deiner Karten.');
  });

  it('fällt bei fehlenden oder falschen Argumenten und unbekannten Codes zurück', () => {
    expect(rejectText(null, ctxFor('h'))).toBe('');
    expect(rejectText(rj('seat.tooMany', { max: 8 }), ctxFor('h'), 'Rückfall.')).toBe('Rückfall.');
    expect(rejectText(rj('net.oldPage', { g: 'poker' }), ctxFor('h'), 'Rückfall.')).toBe('Rückfall.');
    expect(rejectText(rj('dk.room', { n: 'viele' }), ctxFor('h'), 'Rückfall.')).toBe('Rückfall.');
    // Code aus einer neueren Version, der hier noch keine Vorlage hat
    expect(rejectText({ e: 'dk.zukunft' as RejectCode }, ctxFor('h'), 'Rückfall.')).toBe('Rückfall.');
    // Unbekannte Platz-IDs werden nie selbst zum Namen
    expect(rejectText(rj('any.allHere', { p: 'p-fremd' }), ctxFor('h'))).toBe('Jemand ist wieder da.');
  });

  it('schreibt fürs Protokoll Text und Code', () => {
    expect(rejectLog(rj('dk.room', { n: 2 }))).toBe('Es passen nur noch 2 Karten in diesen Angriff. [dk.room n=2]');
    expect(rejectLog(null)).toBe('');
  });

  it('nimmt Namen und Blickwinkel aus Zustand und Ansicht', () => {
    const st = newState('h', 'Hanna');
    st.players.push({ ...st.players[0], id: 'p1', name: 'Lena' });
    const r = rj('bet.targetDone', { p: 'p1' });
    expect(rejectText(r, ctxOfState(st, 'h'))).toBe('Lena ist schon fertig. Tipp auf jemand anderen.');
    expect(rejectText(r, ctxOfState(st, 'p1'))).toBe('Du bist schon fertig. Tipp auf jemand anderen.');
    expect(rejectText(r, ctxOfView(viewFor(st, 'p1')))).toBe('Du bist schon fertig. Tipp auf jemand anderen.');
    // Beim Beitritt gibt es noch keine Ansicht
    expect(rejectText(rj('net.oldPage', { g: 'durak' }), ctxOfView(null))).toBe(
      'An diesem Tisch läuft Durak. Lade die Seite neu, dann kannst du mitspielen.',
    );
  });
});

describe('Phasengrund', () => {
  const PHASES: Readonly<Record<Phase, RejectCode | null>> = {
    lobby: 'any.notStarted',
    choose: 'sz.choosing',
    swap: 'sh.swapping',
    peek: 'cb.peeking',
    play: null,
    end: 'any.roundOver',
    over: 'any.over',
  };

  it('nennt zu jeder Phase den Grund, in play entscheidet die Stelle', () => {
    for (const [phase, code] of Object.entries(PHASES)) {
      const st = newState('h', 'Hanna');
      st.phase = phase as Phase;
      expect(phaseReject(st)?.e ?? null).toBe(code);
    }
  });

  it('nennt in choose den Geber, auch auf der Ansicht', () => {
    const st = newState('h', 'Hanna');
    st.players.push({ ...st.players[0], id: 'p1', name: 'Lena' });
    st.phase = 'choose';
    st.dealer = 1;
    expect(phaseReject(st)).toEqual({ e: 'sz.choosing', a: { p: 'p1' } });
    expect(phaseReject(viewFor(st, 'h'))).toEqual({ e: 'sz.choosing', a: { p: 'p1' } });
  });
});

describe('Einladung nach Abweisung', () => {
  it('die drei eingefrorenen Vorlagen treffen den Regex von 2.6, in jedem Spiel', () => {
    for (const g of GAMES) {
      for (const r of [rj('seat.full'), rj('seat.fullPlaying'), rj('net.oldPage', { g })])
        expect(rejectText(r, ctxOfView(null))).toMatch(OLD_KEEPS);
    }
  });

  it('entscheidet nach Code, den Regex gibt es nur ohne Code', () => {
    expect(keepsInvite('egal', 'seat.full')).toBe(true);
    expect(keepsInvite('egal', 'net.oldPage')).toBe(true);
    expect(keepsInvite('Der Tisch ist voll.', 'seat.taken')).toBe(false);
    expect(keepsInvite('Der Tisch ist voll.', null)).toBe(true);
    expect(keepsInvite('Dieser Platz ist schon besetzt.')).toBe(false);
  });
});

describe('Draht', () => {
  const ctxGuest = ctxFor('p1');

  it('asReject nimmt nur bekannte Codes mit flachen, kurzen Argumenten', () => {
    expect(asReject({ t: 'err', msg: 'x', e: 'dk.room', a: { n: 2 } })).toEqual({ e: 'dk.room', a: { n: 2 } });
    expect(asReject({ t: 'err', msg: 'x', e: 'seat.full' })).toEqual({ e: 'seat.full' });
    expect(asReject({ t: 'err', msg: 'x' })).toBeNull();
    expect(asReject({ t: 'err', msg: 'x', e: 'dk.zukunft' })).toBeNull();
    expect(asReject({ e: 'dk.room', a: [2] })).toBeNull();
    expect(asReject({ e: 'dk.room', a: { n: { x: 1 } } })).toBeNull();
    expect(asReject({ e: 'dk.room', a: { n: Infinity } })).toBeNull();
    expect(asReject({ e: 'dk.room', a: { p: 'x'.repeat(41) } })).toBeNull();
    expect(asReject({ e: 'dk.room', a: { a: 1, b: 2, c: 3, d: 4, f: 5 } })).toBeNull();
    expect(asReject(null)).toBeNull();
    expect(asReject('seat.full')).toBeNull();
  });

  it('nimmt Karten als Argumente, auch aus Deck 2, sonst nichts Kartenähnliches', () => {
    expect(asReject({ e: 'sh.noFit', a: { c: 'H7', top: 'SK' } })).toEqual({
      e: 'sh.noFit',
      a: { c: 'H7', top: 'SK' },
    });
    expect(asReject({ e: 'dk.noBeat', a: { c: 'D10', a: 'CA:2' } })).toEqual({
      e: 'dk.noBeat',
      a: { c: 'D10', a: 'CA:2' },
    });
    expect(asReject({ e: 'dk.beaten', a: { a: 'S9' } })).toEqual({ e: 'dk.beaten', a: { a: 'S9' } });
    expect(asReject({ e: 'dk.transferRank', a: { c: 'HB' } })).toEqual({ e: 'dk.transferRank', a: { c: 'HB' } });
    for (const bad of ['X7', 'H1', 'H', 'HA:3', 'HA:2:2', 'h7', 'H7 ', '<b>', 7, null, 'p1'])
      expect(asReject({ e: 'sh.noFit', a: { c: bad } }), String(bad)).toBeNull();
  });

  it('jede Ablehnung kommt beim Gast mit Code und Argumenten an (Rundreise als JSON)', () => {
    for (const e of REJECT_CODES) {
      const m: unknown = JSON.parse(JSON.stringify({ t: 'err', ...wireReject(sample(e), ctxGuest), act: 'shplay' }));
      expect(asReject(m), e).toEqual(sample(e));
      expect(readReject(m as Record<string, unknown>, ctxGuest, '').code, e).toBe(e);
    }
  });

  it('der Gastgeber schickt Code, Argumente und den Text aus Sicht des Gastes', () => {
    const w = wireReject(rj('bet.targetDone', { p: 'p1' }), ctxGuest);
    expect(w).toEqual({ e: 'bet.targetDone', a: { p: 'p1' }, msg: 'Du bist schon fertig. Tipp auf jemand anderen.' });
    expect(wireReject(rj('seat.full'), ctxGuest)).toEqual({ e: 'seat.full', msg: 'Der Tisch ist voll.' });
    // Jede Ablehnung reist mit Code, msg bleibt nur für Gäste von 2.6
    for (const e of REJECT_CODES) {
      const w = wireReject(sample(e), ctxGuest);
      expect(w.e).toBe(e);
      expect(w.msg).toBe(rejectText(sample(e), ctxGuest));
      expect(JSON.stringify({ t: 'err', ...w, act: 'dktransfer' }).length).toBeLessThan(300);
    }
  });

  it('neuer Gastgeber an Gast von 2.6: msg reicht, die Einladung bleibt wie vorher', () => {
    const cases: readonly [RejectCode, boolean][] = [
      ['seat.full', true],
      ['seat.fullPlaying', true],
      ['net.oldPage', true],
      ['seat.taken', false],
    ];
    for (const [e, keep] of cases) {
      const m = { t: 'reject', ...wireReject(sample(e), ctxGuest) };
      // So liest ein Gast von 2.6 die Nachricht: nur msg
      const shown = m.msg || 'Beitreten hat nicht geklappt.';
      expect(shown).toBe(OLD_GUEST_TEXT[e]);
      expect(OLD_KEEPS.test(m.msg)).toBe(keep);
    }
  });

  it('neuer Gast an Gastgeber von 2.6: nur msg kommt an und wird gezeigt', () => {
    const old = { t: 'err', msg: 'Die Karte passt nicht auf den Stapel.' };
    expect(readReject(old, ctxGuest, 'Rückfall.')).toEqual({ text: old.msg, code: null });
    expect(keepsInvite('Der Tisch ist voll.', readReject({ msg: 'Der Tisch ist voll.' }, ctxGuest, '').code)).toBe(
      true,
    );
    expect(readReject({ t: 'reject' }, ctxGuest, 'Beitreten hat nicht geklappt.')).toEqual({
      text: 'Beitreten hat nicht geklappt.',
      code: null,
    });
  });

  it('neuer Gast an neuen Gastgeber: rendert selbst, mit eigenem Blickwinkel', () => {
    const m = { t: 'err', msg: 'Lena ist schon fertig. Tipp auf jemand anderen.', e: 'bet.targetDone', a: { p: 'p1' } };
    expect(readReject(m, ctxGuest, '')).toEqual({
      text: 'Du bist schon fertig. Tipp auf jemand anderen.',
      code: 'bet.targetDone',
    });
    // Code aus einer neueren Version oder Argumente, die nicht passen: dann gilt msg
    expect(readReject({ msg: 'Neu.', e: 'dk.zukunft' }, ctxGuest, '')).toEqual({ text: 'Neu.', code: null });
    expect(readReject({ msg: 'Alt.', e: 'seat.tooMany', a: { max: 8 } }, ctxGuest, '')).toEqual({
      text: 'Alt.',
      code: 'seat.tooMany',
    });
  });

  it('der Typ des abgelehnten Zugs ist ein kurzer Name oder fehlt', () => {
    expect(rejectAct({ act: 'shplay' })).toBe('shplay');
    expect(rejectAct({})).toBeNull();
    expect(rejectAct({ act: 'x'.repeat(30) })).toBeNull();
    expect(rejectAct({ act: '<b>' })).toBeNull();
    expect(rejectAct({ act: 3 })).toBeNull();
  });
});

describe('asReject lässt nur bekannte Argumente durch', () => {
  it('nimmt Platz-IDs, Spiele und kleine Zahlen', () => {
    expect(asReject({ e: 'sz.choosing', a: { p: 'p-0a1b2c3d4e5f' } })).toEqual({
      e: 'sz.choosing',
      a: { p: 'p-0a1b2c3d4e5f' },
    });
    expect(asReject({ e: 'net.oldPage', a: { g: 'durak' } })).toEqual({ e: 'net.oldPage', a: { g: 'durak' } });
  });
  it('verwirft fremde Namen, Schlüssel, Unsinn und zu viele Argumente', () => {
    expect(asReject({ e: 'sz.choosing', a: { key: 'x' } })).toBeNull();
    expect(asReject({ e: 'sz.choosing', a: { p: 'k-0a1b2c3d4e5f' } })).toBeNull();
    expect(asReject({ e: 'net.oldPage', a: { g: 'poker' } })).toBeNull();
    expect(asReject({ e: 'sz.choosing', a: { n: 1.5 } })).toBeNull();
    expect(asReject({ e: 'sz.choosing', a: { p: 'a', on: 'b', n: 1, min: 1, max: 2 } })).toBeNull();
  });
});

/** Aktionen, die in jedem Spiel einen eigenen Weg haben. Hier ist any.unknown nie der richtige Grund. */
const COMMON = new Set([
  'chat',
  'emote',
  'toss',
  'sound',
  'rules',
  'game',
  'start',
  'addbot',
  'rmbot',
  'tolobby',
  'rematch',
  'restart',
  'skip',
  'force',
  'ready',
]);

/** Gehört die Aktion zum Spiel? Nur fremde Aktionen dürfen any.unknown heißen (Entscheidung E8). */
function ownAction(game: GameKind, type: string): boolean {
  if (COMMON.has(type)) return true;
  switch (game) {
    case 'shithead':
      return type.startsWith('sh');
    case 'durak':
      return type.startsWith('dk') || type === 'shbet';
    case 'cabo':
      return type.startsWith('cb');
    case 'schnautz':
      return ['keep', 'take', 'swap', 'swapAll', 'pass', 'knock'].includes(type);
  }
}

/** Jede Aktionsart mit zufälligen, aber wohlgeformten Angaben. Karten stammen aus der eigenen Hand oder dem Tisch. */
function everyAction(st: State, pid: string, rng: Rng): Action[] {
  const n = (max: number) => Math.floor(rng() * max);
  const someone = () => st.players[n(st.players.length)]?.id ?? 'h';
  const own: Card[] = [...(st.dk?.P[pid] ?? []), ...(st.sh?.P[pid]?.hand ?? []), ...(st.hands[pid] ?? [])];
  const card = (): Card => own[n(own.length)] ?? 'HA';
  const idx = () => (rng() < 0.3 ? [n(6), n(6)] : [n(6)]);
  const cards = () => (rng() < 0.5 ? undefined : [card()]);
  return [
    { type: 'chat', text: 'hallo' },
    { type: 'emote', e: EMOTES[0] },
    { type: 'toss', item: TOSS_ITEMS[0], to: someone() },
    { type: 'toss', item: TOSS_ITEMS[1], to: 'p-weg' },
    { type: 'sound', s: 'x' },
    { type: 'rules', rules: {} },
    { type: 'game', game: GAMES[n(GAMES.length)] },
    { type: 'start' },
    { type: 'addbot' },
    { type: 'rmbot', id: someone() },
    { type: 'rematch' },
    { type: 'skip' },
    { type: 'ready' },
    { type: 'keep' },
    { type: 'take' },
    { type: 'swap', h: n(3), m: n(3) },
    { type: 'swapAll' },
    { type: 'pass' },
    { type: 'knock' },
    { type: 'shswap', h: n(3), u: n(3) },
    { type: 'shready' },
    { type: 'shplay', from: rng() < 0.5 ? 'hand' : 'up', idx: idx() },
    { type: 'shpickup' },
    { type: 'shblind', i: n(3) },
    { type: 'shthrow' },
    { type: 'shbomb' },
    { type: 'shunlock', id: n(4) },
    { type: 'shbet', on: someone() },
    { type: 'dkattack', idx: idx(), cards: cards() },
    { type: 'dkdefend', a: n(6), i: n(6), c: rng() < 0.5 ? card() : undefined },
    { type: 'dktake' },
    { type: 'dkpass' },
    { type: 'dktransfer', idx: idx(), cards: cards() },
    { type: 'cblook', ids: [n(4), n(4)] },
    { type: 'cbdraw', from: rng() < 0.5 ? 'deck' : 'pile' },
    { type: 'cbcabo' },
    { type: 'cbswap', ids: idx() },
    { type: 'cbdiscard' },
    { type: 'cbpeek', id: n(4) },
    { type: 'cbspy', to: someone(), id: n(4) },
    { type: 'cbblind', id: n(4), to: someone(), oid: n(4) },
    { type: 'cbskip' },
    { type: 'cbsnap', id: n(4) },
    // Die zerstörerischen zuletzt, sie laufen ohnehin auf einer Kopie
    { type: 'force' },
    { type: 'restart' },
    { type: 'tolobby' },
  ];
}

/** Alle Arten, die everyAction schickt, damit keine Aktionsart vergessen wird. */
const SENT: readonly ActionType[] = everyAction(newState('h', 'Hanna'), 'h', () => 0).map((a) => a.type);

/** Wie sieht eine Ablehnung aus? Nur Code und flache Argumente, nie ein Text. */
function shapeProblem(r: unknown): string | null {
  if (r === null) return null;
  if (typeof r === 'string') return `Text statt Code: „${r}“`;
  if (!isReject(r)) return `keine Ablehnung: ${JSON.stringify(r)}`;
  const extra = Object.keys(r).filter((k) => k !== 'e' && k !== 'a');
  if (extra.length) return `${r.e} mit fremden Feldern ${extra.join(', ')}`;
  for (const [k, v] of Object.entries(r.a ?? {}))
    if (typeof v !== 'number' && typeof v !== 'string') return `${r.e} mit krummem Argument ${k}`;
  return null;
}

describe('Zufallspartien: jede Aktion an jeden Platz in jeder Phase', () => {
  it('schickt jede Aktionsart', () => {
    const all: readonly ActionType[] = [
      ...COMMON,
      ...['keep', 'take', 'swap', 'swapAll', 'pass', 'knock'],
      ...['shswap', 'shready', 'shplay', 'shpickup', 'shblind', 'shthrow', 'shbomb', 'shunlock', 'shbet'],
      ...['dkattack', 'dkdefend', 'dktake', 'dkpass', 'dktransfer'],
      ...['cblook', 'cbdraw', 'cbcabo', 'cbswap', 'cbdiscard', 'cbpeek', 'cbspy', 'cbblind', 'cbskip', 'cbsnap'],
    ] as ActionType[];
    expect([...new Set(SENT)].sort()).toEqual([...new Set(all)].sort());
  });

  for (const game of GAMES)
    for (const humans of [2, 5, 8]) {
      it(`${GAME_NAME[game]} mit ${humans} Leuten`, () => {
        const rng = rngF(10 + humans);
        const st = newState('h', 'Hanna');
        expect(act(st, 'h', { type: 'game', game }, rng)).toBeNull();
        // Ein Platz mehr als Menschen, den füllt beim Start eine KI (bei acht bleibt es bei acht)
        const seats = Math.min(8, humans + 1);
        expect(act(st, 'h', { type: 'rules', rules: { turnSecs: 0, seats, fill: true } }, rng)).toBeNull();
        for (let i = 1; i < humans; i++) expect(addPlayer(st, `p${i}`, `Gast ${i}`)).toBeNull();
        const problems = new Set<string>();
        const phases = new Set<string>();
        const codes = new Set<string>();
        let probes = 0;
        /** Jede Aktion auf einer Kopie an einen Platz, auch an einen, den es nicht gibt. */
        const probe = (pid: string) => {
          for (const a of everyAction(st, pid, rng)) {
            const copy = structuredClone(st);
            const r: unknown = act(copy, pid, a, rngF(probes++));
            const shape = shapeProblem(r);
            if (shape) problems.add(`${st.phase} ${pid} ${a.type}: ${shape}`);
            if (!isReject(r)) continue;
            codes.add(r.e);
            // Was der Gastgeber schickt, muss der Gast mit Code lesen können, sonst wird es ein Toast
            if (JSON.stringify(asReject(JSON.parse(JSON.stringify(r)))) !== JSON.stringify(r))
              problems.add(`${st.phase} ${a.type}: ${JSON.stringify(r)} verliert auf dem Draht den Code`);
            if (pid === 'p-weg' && r.e !== 'any.notSeated') problems.add(`${a.type} ohne Platz: ${r.e}`);
            if (r.e === 'any.unknown' && ownAction(game, a.type))
              problems.add(`${st.phase} ${a.type}: any.unknown, obwohl die Aktion zu ${game} gehört`);
          }
        };
        phases.add(st.phase);
        for (const pid of ['h', 'p1', 'p-weg']) probe(pid);
        expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
        const every = game === 'cabo' ? 6 : 2;
        // Eine ganze Partie, danach noch einmal alle Plätze im Zustand „vorbei“
        for (let step = 0; st.phase !== 'over' && step < 3000; step++) {
          // Bei jedem Phasenwechsel alle Plätze, sonst reihum ein Platz (Cabo-Partien sind lang, dort seltener)
          const fresh = !phases.has(st.phase);
          phases.add(st.phase);
          const ids = st.players.map((p) => p.id);
          if (fresh) ids.forEach(probe);
          else if (step % every === 0) probe(ids[(step / every) % ids.length]);
          if (step % 40 === 0) probe('p-weg');
          if (st.sh?.win?.lock) act(st, st.host, { type: 'shunlock', id: st.sh.win.id }, rng);
          let moved = false;
          for (const p of st.players) {
            const a = botDecide(viewFor(st, p.id), rng, 'normal');
            if (!a) continue;
            const r: unknown = act(st, p.id, a, rng);
            const shape = shapeProblem(r);
            if (shape) problems.add(`KI ${st.phase} ${a.type}: ${shape}`);
            if (r === null) {
              moved = true;
              if (a.type !== 'ready') break;
            }
          }
          if (!moved) fallbackMove(st, st.players[st.turn]?.id ?? 'h', rng);
        }
        expect(st.phase).toBe('over');
        phases.add(st.phase);
        for (const pid of [...st.players.map((p) => p.id), 'p-weg']) probe(pid);
        expect([...problems]).toEqual([]);
        // Die Partie ist durch mehrere Phasen gelaufen, sonst prüft der Test zu wenig
        expect(phases.size).toBeGreaterThanOrEqual(game === 'durak' ? 3 : 4);
        // Und es wurde wirklich abgelehnt, auch mit Gründen des eigenen Spiels
        const prefix = { shithead: 'sh.', durak: 'dk.', cabo: 'cb.', schnautz: 'sz.' }[game];
        for (const e of ['any.notSeated', 'any.hostOnly', 'any.unknown', 'any.over']) expect(codes, e).toContain(e);
        expect([...codes].filter((e) => e.startsWith(prefix)).length).toBeGreaterThanOrEqual(3);
      });
    }
});

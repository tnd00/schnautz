/*
 * Ablehnungen als Codes (Stufe 2.7 „Klare Worte“, Fundament). Geprüft werden die Codeliste, die Vorlagen im Katalog,
 * der Phasengrund und der Draht in beide Richtungen, auch mit Gastgebern und Gästen von 2.6.
 */
import { describe, expect, it } from 'vitest';
import { GAMES } from '../../src/game/games';
import { isReject, isRejectCode, phaseReject, REJECT_CODES, rj, type RejectCode } from '../../src/game/reject';
import { newState } from '../../src/game/state';
import type { Phase } from '../../src/game/types';
import { ctxOfState, ctxOfView, REJECT_TEXT, rejectLog, rejectText, type RejectCtx } from '../../src/content/texts';
import { asReject, readReject, rejectAct, wireReject } from '../../src/net/protocol';
import { keepsInvite } from '../../src/net/guest';
import { viewFor } from '../../src/game/view';
import { REJECT_SAMPLES } from './helpers';

/** Hanna schaut zu, Lena ist p1. */
const NAMES: Readonly<Record<string, string>> = { h: 'Hanna', p1: 'Lena' };
const ctxFor = (me: string): RejectCtx => ({ me, name: (id) => NAMES[id] });
const sample = (e: RejectCode) => rj(e, REJECT_SAMPLES[e]);

/** So prüft ein Gast von 2.6 nach einer Abweisung, ob die Einladung bleibt (eingefroren). */
const OLD_KEEPS = /voll|alle Plätze sind besetzt|Lade die Seite neu/;

/**
 * Wortlaut jeder Vorlage mit den Beispielwerten aus Hannas Sicht. Wo es den Text schon gab, ist er aus dem Quelltext
 * vor dem Umbau abgeschrieben. Zusammengelegte und neue Codes (Tabelle codes-final.md, Spalte „Ändert“) haben den
 * dort festgelegten Wortlaut. Ändert sich hier etwas, ändert sich ein Text im Spiel.
 */
const FROZEN: Readonly<Record<RejectCode, string>> = {
  'any.unknown': 'Unbekannte Aktion.',
  'any.notSeated': 'Du sitzt nicht an diesem Tisch.',
  'any.noSuchSeat': 'Die Person sitzt nicht mehr am Tisch.',
  'any.hostOnly': 'Nur der Gastgeber kann das.',
  'any.lobbyOnly': 'Das geht nur in der Lobby.',
  'any.running': 'Die Partie läuft schon.',
  'any.notStarted': 'Die Partie hat noch gar nicht angefangen.',
  'any.over': 'Die Partie ist vorbei.',
  'any.roundOver': 'Die Runde ist vorbei.',
  'any.notYourTurn': 'Du bist gerade nicht dran.',
  'any.cardGone': 'Die Karte ist nicht mehr da.',
  'any.pickCard': 'Wähle zuerst eine Karte.',
  'any.sameRank': 'Zusammen geht nur mit gleichem Wert.',
  'any.notPlaying': 'Du spielst diese Partie nicht mit.',
  'any.done': 'Du bist schon fertig.',
  'any.ready': 'Du hast schon auf Fertig gedrückt.',
  'any.allHere': 'Lena ist wieder da.',
  'seat.tooFew': 'Ihr braucht mindestens zwei Leute am Tisch.',
  'seat.tooMany': 'Durak geht mit höchstens 8 Leuten.',
  'seat.full': 'Der Tisch ist voll.',
  'seat.fullPlaying': 'Die Partie läuft schon und alle Plätze sind besetzt.',
  'seat.taken': 'Dieser Platz ist schon besetzt.',
  'net.oldPage': 'An diesem Tisch läuft Cabo. Lade die Seite neu, dann kannst du mitspielen.',
  'sh.swapOver': 'Tauschen geht nur vor dem Start.',
  'sh.swapping': "Erst wird getauscht. Los geht's, wenn alle fertig getauscht haben.",
  'sh.noFour': 'Du hast keine 4.',
  'sh.winClosed': 'Zu spät, die erste Karte liegt schon.',
  'sh.blindOnly': 'Mit verdeckten Karten geht das nicht.',
  'sh.bombWin': 'Moment, die 4er werden noch reingeworfen.',
  'sh.bombLate': 'Zu spät, das geht nicht mehr.',
  'sh.cutOff': 'Bomben sind an diesem Tisch aus.',
  'sh.winLock': 'Kurz warten, erst dürfen alle ihre 4er reinwerfen.',
  'sh.handFirst': 'Erst die Handkarten ausspielen.',
  'sh.noFit': 'Die Karte passt nicht auf den Stapel.',
  'sh.pileEmpty': 'Der Stapel ist leer. Leg einfach eine Karte.',
  'sh.blindLast': 'Erst Hand und offene Karten spielen.',
  'dk.defending': 'Du verteidigst gerade.',
  'dk.notLead': 'Zuerst greift jemand anderes an.',
  'dk.rankNotOnTable': 'Nachlegen geht nur mit Werten, die schon auf dem Tisch liegen.',
  'dk.passed': 'Du hast gepasst. Nachlegen geht erst wieder bei einem neuen Wert oder wenn aufgenommen wird.',
  'dk.passedTake': 'Du hast gepasst. In diesen Angriff legst du nichts mehr nach.',
  'dk.room': 'Es passen nur noch 2 Karten in diesen Angriff.',
  'dk.transferOff': 'Weiterschieben ist an diesem Tisch aus.',
  'dk.notDefender': 'Das kann nur, wer verteidigt.',
  'dk.transferLate': 'Weiterschieben geht nur, bevor du etwas geschlagen hast.',
  'dk.taking': 'Du nimmst schon auf.',
  'dk.tableEmpty': 'Noch liegt nichts auf dem Tisch.',
  'dk.transferRank': 'Weiterschieben geht nur mit dem gleichen Wert.',
  'dk.nextShort': 'Der Nächste hat dafür zu wenige Karten.',
  'dk.pairGone': 'Diese Karte liegt nicht auf dem Tisch.',
  'dk.beaten': 'Diese Karte ist schon geschlagen.',
  'dk.noBeat': 'Die Karte schlägt das nicht.',
  'dk.allBeaten': 'Alles ist geschlagen.',
  'dk.leadFirst': 'Du musst zuerst angreifen.',
  'dk.openCards': 'Erst muss alles geschlagen sein.',
  'dk.noTarget': 'Diese Karte schlägt keinen offenen Angriff.',
  'cb.peekOver': 'Ansehen geht nur zu Beginn der Runde.',
  'cb.pickTwo': 'Wähle zwei deiner Karten.',
  'cb.peeking': 'Erst sehen sich alle ihre zwei Karten an.',
  'cb.drawn': 'Du hast schon gezogen.',
  'cb.pileNoCards': 'Ohne eigene Karten kannst du die Ablage nicht nehmen. Zieh vom Stapel.',
  'cb.pileEmpty': 'Die Ablage ist leer.',
  'cb.deckEmpty': 'Der Stapel ist leer.',
  'cb.caboLate': 'Cabo rufst du statt zu ziehen.',
  'cb.called': 'Cabo wurde schon gerufen.',
  'cb.drawFirst': 'Zieh zuerst eine Karte.',
  'cb.mustSwap': 'Eine Karte von der Ablage musst du tauschen.',
  'cb.noPeek': 'Ansehen geht nur mit einer 7 oder 8.',
  'cb.pickOwn': 'Wähle eine deiner Karten.',
  'cb.noSpy': 'Ausspionieren geht nur mit einer 9 oder 10.',
  'cb.pickOther': 'Wähle eine Karte von jemand anderem.',
  'cb.noBlind': 'Blind tauschen geht nur mit Bube oder Dame.',
  'cb.pickPair': 'Wähle eine eigene und eine fremde Karte.',
  'cb.pickSwap': 'Wähle die Karten, die du tauschen willst.',
  'cb.snapOff': 'Schnappen ist an diesem Tisch aus.',
  'cb.finishTurn': 'Spiel erst deinen Zug zu Ende.',
  'sz.chosen': 'Die Karten sind schon verteilt, gewählt wird jetzt nicht mehr.',
  'sz.dealerOnly': 'Das entscheidet, wer gibt.',
  'sz.choosing': 'Erst entscheidet Lena, ob die Karten bleiben.',
  'sz.knocked': 'Es wurde schon geklopft.',
  'sz.knockEarly': 'Klopfen geht erst, wenn jeder einmal dran war.',
  'bet.closed': 'Tippen geht nur während der Partie.',
  'bet.notDone': 'Tippen kannst du, sobald du fertig bist.',
  'bet.twice': 'Du hast schon getippt.',
  'bet.targetDone': 'Lena ist schon fertig. Tipp auf jemand anderen.',
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
    expect(Object.keys(FROZEN).sort()).toEqual([...REJECT_CODES].sort());
  });

  it('trifft den heutigen Wortlaut', () => {
    const got = Object.fromEntries(REJECT_CODES.map((e) => [e, rejectText(sample(e), ctxFor('h'))]));
    expect(got).toEqual(FROZEN);
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

  it('lässt Strings durch und fällt bei fehlenden oder falschen Argumenten zurück', () => {
    expect(rejectText('Alter Text.', ctxFor('h'))).toBe('Alter Text.');
    expect(rejectText(null, ctxFor('h'))).toBe('');
    expect(rejectText(rj('seat.tooMany', { max: 8 }), ctxFor('h'), 'Rückfall.')).toBe('Rückfall.');
    expect(rejectText(rj('net.oldPage', { g: 'poker' }), ctxFor('h'), 'Rückfall.')).toBe('Rückfall.');
    expect(rejectText(rj('dk.room', { n: 'viele' }), ctxFor('h'), 'Rückfall.')).toBe('Rückfall.');
    // Unbekannte Platz-IDs werden nie selbst zum Namen
    expect(rejectText(rj('any.allHere', { p: 'p-fremd' }), ctxFor('h'))).toBe('Jemand ist wieder da.');
  });

  it('schreibt fürs Protokoll Text und Code', () => {
    expect(rejectLog(rj('dk.room', { n: 2 }))).toBe('Es passen nur noch 2 Karten in diesen Angriff. [dk.room n=2]');
    expect(rejectLog('Alter Text.')).toBe('Alter Text.');
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

  it('der Gastgeber schickt Code, Argumente und den Text aus Sicht des Gastes', () => {
    const w = wireReject(rj('bet.targetDone', { p: 'p1' }), ctxGuest);
    expect(w).toEqual({ e: 'bet.targetDone', a: { p: 'p1' }, msg: 'Du bist schon fertig. Tipp auf jemand anderen.' });
    expect(wireReject(rj('seat.full'), ctxGuest)).toEqual({ e: 'seat.full', msg: 'Der Tisch ist voll.' });
    // Noch nicht umgestellte Stellen liefern Text, dann reist nur msg
    expect(wireReject('Das geht gerade nicht.', ctxGuest)).toEqual({ msg: 'Das geht gerade nicht.' });
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
      expect(shown).toBe(FROZEN[e]);
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

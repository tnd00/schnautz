/*
 * Bausteine am Tisch als String (Plan 2.8 Abschnitt 9.1): Platzhalter-Etikett, Knöpfe bleiben gesperrt statt zu
 * verschwinden, aria-pressed, aria-disabled mit Grund, Namen für Rückseiten, data-st. Ohne DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rj } from '../../src/game/reject';
import { REJECT_TEXT } from '../../src/content/texts/reject';
import { TABLE } from '../../src/content/texts/table';
import { BAR, BAR_GUARD_MS, barGuard, barHTML } from '../../src/ui/table/bar';
import { handHTML } from '../../src/ui/table/hand';
import { meClass, meHTML, meLabel } from '../../src/ui/table/me';
import { centerHTML, deckCards, stackHTML } from '../../src/ui/table/pile';
import { seatHTML, tagHTML } from '../../src/ui/table/seat';
import type { BarModel, HandModel, SeatModel } from '../../src/ui/table/types';
import { parseHTML, qsa } from './helpers';

const one = (html: string, sel: string) => {
  const els = qsa(parseHTML(html), sel);
  expect(els, sel).toHaveLength(1);
  return els[0].attrs;
};

const SEAT: SeatModel = {
  id: 'p2',
  name: 'Lena <3',
  marks: '',
  value: '',
  count: '<span class="shc">💩 2</span>',
  tag: { text: 'ist dran', kind: 'turn', think: true, cls: 'turn' },
  body: '<div class="tcards"></div>',
  st: ['turn', 'offline'],
  aim: true,
  cls: ['sh'],
  say: 'KI, 5 Karten, ist dran',
};

describe('Etikett', () => {
  it('ohne Etikett ein unsichtbarer Platzhalter, damit die Kachel ihre Höhe behält', () => {
    const a = one(tagHTML(null), '.tag');
    expect(a.style).toBe('visibility:hidden');
    expect(a['aria-hidden']).toBe('true');
  });
  it('mit Art, alter Klasse und Denkpünktchen', () => {
    const h = tagHTML({ text: 'ist <dran>', kind: 'turn', think: true, cls: 'turn' });
    expect(one(h, '.tag.turn')['data-k']).toBe('turn');
    expect(qsa(parseHTML(h), '.tag .thinking i')).toHaveLength(3);
    expect(h).toContain('ist &lt;dran&gt;');
  });
});

describe('Platz', () => {
  it('schreibt Zustände in data-st und behält die alten Klassen', () => {
    const a = one(seatHTML(SEAT), '.opp[data-pid=p2]');
    expect(a['data-st']).toBe('turn offline');
    expect(a.class.split(' ')).toEqual(['opp', 'sh', 'turn', 'offline']);
    expect(a.role).toBe('listitem');
    expect(a['aria-label']).toBe('Lena &lt;3, KI, 5 Karten, ist dran');
    expect(a['data-act']).toBe('aim');
    expect(a.title).toBe(TABLE.aim('Lena &lt;3'));
  });
  it('Name, Zähler und Etikett an den alten Stellen', () => {
    const h = seatHTML(SEAT);
    expect(qsa(parseHTML(h), '.opp > .ometa > .nm')).toHaveLength(1);
    expect(qsa(parseHTML(h), '.ometa .shc')).toHaveLength(1);
    expect(qsa(parseHTML(h), '.opp > .tcards')).toHaveLength(1);
  });
  it('Ziel einer Fähigkeit ist kein Wurfziel, Rolle steht in data-role', () => {
    const a = one(seatHTML({ ...SEAT, st: ['target'], role: 'def', tag: null }), '.opp');
    expect(a['data-act']).toBeUndefined();
    expect(a['data-role']).toBe('def');
    expect(a.class).not.toContain('target');
  });
});

describe('Hand', () => {
  const H: HandModel = {
    kind: 'row',
    cls: 'shhand',
    label: 'Deine Hand, 4 Karten',
    fit: true,
    cards: [
      { c: 'HA', i: 0, act: 'shh' },
      { c: 'S3', i: 1, act: 'shh', dim: true, why: rj('sh.noFit', { c: 'S3', top: 'SK' }) },
      { c: 'D9', i: 2, act: 'shh', sel: true, delay: 0.3 },
      { c: null, i: 3, label: 'Verdeckte Karte 4' },
    ],
  };
  const h = handHTML(H);
  it('ist eine Gruppe mit Namen und data-fit', () => {
    const a = one(h, '.shhand.tb-hand');
    expect(a.role).toBe('group');
    expect(a['aria-label']).toBe('Deine Hand, 4 Karten');
    expect(a['data-kind']).toBe('row');
    expect('data-fit' in a).toBe(true);
  });
  it('hat genau eine Tabulatorstelle, die gewählte Karte', () => {
    const tabs = qsa(parseHTML(h), '.card[data-act]').map((e) => e.attrs.tabindex);
    expect(tabs).toEqual(['-1', '-1', '0']);
    expect(one(h, '.card.sel')['aria-pressed']).toBe('true');
    expect(one(h, '[data-i="0"]')['aria-pressed']).toBe('false');
    expect(one(h, '[data-i="2"]').style).toBe('--d:0.3s');
  });
  it('ausgegraut bleibt antippbar und nennt den Grund', () => {
    const a = one(h, '.card.dim');
    expect(a['data-act']).toBe('shh');
    expect(a['aria-disabled']).toBe('true');
    expect(a['aria-description']).toBe(REJECT_TEXT['sh.noFit'] as string);
    expect(a.disabled).toBeUndefined();
  });
  it('Rücken mit Namen, Schlüssel aus Karte oder Platz', () => {
    expect(one(h, '.card.back')['aria-label']).toBe('Verdeckte Karte 4');
    expect(one(h, '.card.back')['data-fk']).toBe('hand:3');
    expect(one(h, '[data-i="0"]')['data-fk']).toBe('hand:HA');
  });
  it('ohne antippbare Karte keine Tabulatorstelle', () => {
    const x = handHTML({ ...H, cards: [{ c: 'HA', i: 0 }] });
    expect(one(x, '.card').tabindex).toBeUndefined();
    expect(one(x, '.card').role).toBe('img');
  });
});

describe('Knopfleiste', () => {
  beforeEach(() => vi.useFakeTimers({ now: 10_000 }));
  afterEach(() => vi.useRealTimers());
  const B: BarModel = {
    btns: [
      { act: 'shplay', label: 'Ausspielen', intent: 'go', cls: 'primary', ok: true, pulse: true },
      { act: 'shpickup', label: 'Aufnehmen', intent: 'take', cls: 'ghost', ok: false, why: rj('sh.handFirst') },
      { act: 'cbsnap', label: 'Schnappen', intent: 'toggle', cls: 'snapb', ok: true, on: false, aria: 'Schnappen an' },
    ],
  };
  it('gesperrt heißt aria-disabled mit Grund, kein Knopf fällt weg', () => {
    const h = barHTML(B);
    expect(one(h, '.actions').role).toBe('group');
    expect(qsa(parseHTML(h), '.actions .btn')).toHaveLength(3);
    expect(qsa(parseHTML(h), '[disabled]')).toHaveLength(0);
    const off = one(h, '[data-act=shpickup]');
    expect(off['aria-disabled']).toBe('true');
    expect(off['aria-description']).toBe(REJECT_TEXT['sh.handFirst'] as string);
    expect(one(h, '[data-act=shplay]').class).toBe('btn primary pulse');
    expect(one(h, '[data-act=shplay]')['data-intent']).toBe('go');
    expect(one(h, '[data-act=cbsnap]')['aria-pressed']).toBe('false');
    expect(barHTML(null)).toBe('');
  });
  it('merkt sich einen Wechsel der Knöpfe für die Sperre', () => {
    barHTML({ btns: [] });
    vi.advanceTimersByTime(BAR_GUARD_MS + 1);
    barHTML(B);
    expect(BAR.at).toBe(Date.now());
    expect(barGuard()).toBe(true);
    vi.advanceTimersByTime(BAR_GUARD_MS + 1);
    barHTML({ ...B, btns: B.btns.map((b) => ({ ...b, ok: false })) });
    // Nur gesperrt, die Knöpfe stehen an denselben Plätzen: kein Wechsel
    expect(barGuard()).toBe(false);
  });
});

describe('Tischmitte', () => {
  it('Stapel mit Aktion sind Knöpfe mit Namen, Ziele tragen data-drop', () => {
    const h = stackHTML({
      k: 'deck',
      cls: 'deck cbdeck',
      title: 'Nachziehstapel',
      body: deckCards(5),
      count: 5,
      act: { act: 'cbdeck', label: 'Karte ziehen' },
      can: true,
      drop: 'pile',
    });
    const a = one(h, '.cbdeck[data-act=cbdeck]');
    expect(a.role).toBe('button');
    expect(a['aria-label']).toBe('Karte ziehen');
    expect(a['data-drop']).toBe('pile');
    expect(a.class).toBe('deck cbdeck can');
    expect(qsa(parseHTML(h), '.deck .card.back')).toHaveLength(3);
    expect(qsa(parseHTML(h), '.deck .pcount')).toHaveLength(1);
  });
  it('leerer Stapel zeigt den Platzhalter, Hinweis mit Warnung', () => {
    expect(deckCards(0)).toContain('emptyslot');
    const h = centerHTML({
      cap: 'Stapel',
      label: 'Tischmitte',
      stacks: [{ k: 'pile', cls: 'pile', title: '', body: '', cnt: { text: '7 oder niedriger', warn: true } }],
    });
    expect(one(h, '.cap').class).toBe('cap');
    expect(one(h, '.pile .cnt.warn').class).toBe('cnt warn');
  });
});

describe('Eigener Platz', () => {
  it('nicht dabei: Satz und Knopfleiste', () => {
    const m = { out: 'Du spielst <nicht> mit.', bar: { btns: [] } };
    expect(meHTML(m)).toContain('<div class="outmsg">Du spielst &lt;nicht&gt; mit.</div>');
    expect(meClass(m)).toBe('me');
    expect(meLabel(m)).toBe(TABLE.me('Du spielst <nicht> mit.'));
  });
  it('Kopf, Reihen und Knöpfe, Zustände als alte Klassen', () => {
    const m = {
      head: { marks: '<span class="reign">👑</span>', pill: '<span class="pill">3</span>' },
      rows: '<div class="shrow"></div>',
      bar: { btns: [] },
      st: ['turn', 'win'] as const,
      cls: ['shme'],
      say: 'Du bist dran',
    };
    const h = meHTML(m);
    expect(qsa(parseHTML(h), '.mehead > .nm')).toHaveLength(1);
    expect(qsa(parseHTML(h), '.mehead .pill')).toHaveLength(1);
    expect(qsa(parseHTML(h), '.actions')).toHaveLength(1);
    expect(meClass(m)).toBe('me shme turn');
    expect(meLabel(m)).toBe('Dein Platz. Du bist dran');
  });
  it('Tauschrunde ohne Kopf, mit Slot darüber', () => {
    const h = meHTML({
      head: null,
      lead: '<div class="swhead"><b>Tauschrunde</b></div>',
      rows: '',
      bar: null,
      st: [],
      cls: [],
      say: '',
    });
    expect(qsa(parseHTML(h), '.mehead')).toHaveLength(0);
    expect(qsa(parseHTML(h), '.swhead b')).toHaveLength(1);
  });
});

/*
 * Selektorvertrag (Plan 2.8 Abschnitt 8, abgleich.md 1.1): Die Bausteine am Tisch erzeugen aus Beispielmodellen je
 * Spiel jeden Selektor, den E2E, Flüge, Abläufe, Band und Mess-Skripte lesen. Bis Runde 3 sind die Modelle hier von
 * Hand gebaut, danach kommen sie über specOf aus den Spielen. #status (paintStatus), #emofab und #logfab stehen fest in
 * index.html und gehören nicht zu den Bausteinen.
 */
import { describe, expect, it } from 'vitest';
import { rj } from '../../src/game/reject';
import { cardHTML, livesHTML } from '../../src/ui/cards';
import { handHTML } from '../../src/ui/table/hand';
import { meClass, meHTML } from '../../src/ui/table/me';
import { centerHTML, deckCards } from '../../src/ui/table/pile';
import { seatHTML } from '../../src/ui/table/seat';
import type { CenterModel, MeModel, MeOut, SeatModel } from '../../src/ui/table/types';
import { parseHTML, qsa } from './helpers';

interface Models {
  opps: SeatModel[];
  center: CenterModel;
  me: MeModel | MeOut;
}

/** Tisch wie in index.html, die Teile so, wie renderTable sie schreibt */
const tableHTML = (m: Models): string =>
  '<div class="table" id="table"><div class="scorebar" id="scorebar"></div>' +
  `<div class="opps" id="opps">${m.opps.map(seatHTML).join('')}</div>` +
  `<div class="center" id="center">${centerHTML(m.center)}</div>` +
  '<div class="status" id="status"></div>' +
  `<div class="seat"><div class="${meClass(m.me)}" id="me" data-pid="p1">${meHTML(m.me)}</div></div></div>`;

const seat = (o: Partial<SeatModel> & Pick<SeatModel, 'id' | 'body'>): SeatModel => ({
  name: 'Lena',
  marks: '',
  value: '',
  count: '',
  tag: null,
  st: [],
  aim: true,
  cls: [],
  say: '',
  ...o,
});

const SH: Models = {
  opps: [
    seat({
      id: 'p2',
      cls: ['sh'],
      st: ['turn'],
      tag: { text: 'ist dran', kind: 'turn', think: true, cls: 'turn' },
      body: `<div class="tcards"><div class="tslot">${cardHTML(null)}<div class="upc">${cardHTML('H7')}</div></div></div>`,
      count: '<span class="ohand" title="Karten auf der Hand"><span class="hcount">5</span></span>',
    }),
    seat({ id: 'p3', cls: ['sh'], st: ['done'], tag: { text: 'Platz 1', kind: 'done', cls: 'done' }, body: '' }),
  ],
  center: {
    cap: 'Stapel',
    label: 'Tischmitte',
    stacks: [
      { k: 'deck', cls: 'deck', title: 'Nachziehstapel', body: deckCards(12), count: 12 },
      { k: 'pile', cls: 'pile', title: '', body: cardHTML('SK'), cnt: { text: 'König oder höher' }, drop: 'pile' },
      { k: 'counter', cls: 'burned', title: 'Verbrannte Karten', body: '<b>3</b>', cnt: { text: 'verbrannt' } },
    ],
  },
  me: {
    head: { marks: '', pill: '<span class="pill">3 Handkarten</span>' },
    rows:
      '<div class="shrow"><div class="tcards"><div class="tslot">' +
      cardHTML(null, { key: 'down:0', act: 'shd', i: 0 }) +
      `<div class="upc">${cardHTML('D9', { key: 'up:D9', act: 'shu', i: 0 })}</div></div></div>` +
      handHTML({
        kind: 'row',
        cls: 'shhand',
        label: 'Deine Hand, 3 Karten',
        fit: true,
        cards: [
          { c: 'HA', i: 0, act: 'shh', sel: true, drag: 'hand' },
          { c: 'S3', i: 1, act: 'shh', dim: true, why: rj('sh.noFit', { c: 'S3', top: 'SK' }) },
          { c: 'C2', i: 2, act: 'shh' },
        ],
      }) +
      '</div>',
    bar: {
      btns: [
        { act: 'shplay', label: 'Ausspielen', intent: 'go', cls: 'primary', ok: true },
        { act: 'shpickup', label: 'Aufnehmen (4)', intent: 'take', cls: 'ghost', ok: false, why: rj('sh.handFirst') },
      ],
    },
    st: ['turn'],
    cls: ['shme'],
    say: 'Du bist dran',
  },
};

const SH_SWAP: Models = {
  ...SH,
  me: {
    head: null,
    lead: '<div class="swhead"><b>Tauschrunde</b><span>Tippe eine Handkarte und eine Tischkarte an.</span></div>',
    rows:
      '<div class="swrow"><span class="swlbl">Auf der Hand</span>' +
      handHTML({ kind: 'row', cls: 'shhand', label: 'Deine Hand', cards: [{ c: 'H2', i: 0, act: 'shh' }] }) +
      '</div>',
    bar: { btns: [{ act: 'shready', label: 'Bereit', intent: 'go', cls: 'primary', ok: true }] },
    st: ['swapping', 'turn'],
    cls: ['shme'],
    say: '',
  },
};

const DK: Models = {
  opps: [
    seat({
      id: 'p2',
      cls: ['sh', 'dk', 'def'],
      role: 'def',
      body: `<span class="ohand">${cardHTML(null)}${cardHTML(null)}</span>`,
      tag: { text: 'verteidigt', kind: 'role', cls: 'def' },
    }),
  ],
  center: {
    cap: 'Trumpf ♥ Herz',
    label: 'Tischmitte, Trumpf Herz',
    stacks: [
      {
        k: 'deck',
        cls: 'deck dkdeck',
        title: 'Nachziehstapel',
        body: `<div class="dktrump" title="Trumpf">${cardHTML('H6')}</div>${deckCards(8)}`,
        count: 8,
      },
      {
        k: 'table',
        cls: 'dktable',
        title: '',
        drop: 'table',
        body:
          `<div class="dkpair open" data-i="0" data-act="dkt" role="button" tabindex="0">${cardHTML('S9', 'dka')}</div>` +
          `<div class="dkpair beaten" data-i="1">${cardHTML('C7', 'dka')}${cardHTML('C9', 'dkd')}</div>`,
        cnt: { text: 'noch 3 Karten passen dazu' },
      },
      { k: 'counter', cls: 'burned dkbito', title: '', body: '<b>6</b>', cnt: { text: 'Bito' } },
    ],
  },
  me: {
    head: { marks: '', pill: '<span class="pill">2 Handkarten</span>' },
    rows:
      '<div class="shrow">' +
      handHTML({
        kind: 'row',
        cls: 'shhand dkhand',
        label: 'Deine Hand, 2 Karten',
        fit: true,
        cards: [
          { c: 'HK', i: 0, act: 'dkh', cls: 'pick trumpc' },
          { c: 'S2', i: 1, act: 'dkh', dim: true, why: rj('dk.rankNotOnTable') },
        ],
      }) +
      '</div>',
    bar: {
      btns: [
        { act: 'dkbeat', label: 'Schlagen', intent: 'go', cls: 'primary', ok: true },
        { act: 'dktake', label: 'Aufnehmen', intent: 'take', cls: 'wood', ok: false, why: rj('dk.taking') },
      ],
    },
    st: ['turn'],
    cls: ['shme', 'dkme'],
    say: 'Du verteidigst, 2 Karten',
  },
};

const CB: Models = {
  opps: [
    seat({
      id: 'p2',
      cls: ['cb'],
      st: ['target'],
      body:
        handHTML({
          kind: 'slots',
          cls: 'cbrow',
          label: 'Lenas Karten',
          cards: [
            { c: null, i: 0, sid: 3, owner: 'p2', act: 'cbo', cls: 'cbslot', fk: 'cb:p2:3', label: 'Lenas 1. Karte' },
            { c: 'D5', i: 1, sid: 4, owner: 'p2', cls: 'cbslot seen', fk: 'cb:p2:4' },
          ],
        }) + `<div class="cbheld">${cardHTML(null)}</div>`,
    }),
  ],
  center: {
    cap: '',
    label: 'Tischmitte',
    stacks: [
      {
        k: 'deck',
        cls: 'deck cbdeck',
        title: 'Nachziehstapel',
        body: deckCards(30),
        count: 30,
        act: { act: 'cbdeck', label: 'Karte ziehen' },
      },
      { k: 'hold', cls: 'cbhold', title: '', body: cardHTML('HK'), cnt: { text: 'gezogen' } },
      {
        k: 'pile',
        cls: 'pile cbpile',
        title: '',
        body: cardHTML('S4', 'under') + cardHTML('C8'),
        act: { act: 'cbpile', label: 'Ablage nehmen' },
        drop: 'pile',
      },
    ],
  },
  me: {
    head: { marks: '', tags: '<span class="tag">📣 Cabo!</span>', pill: '<span class="pill">12 Punkte</span>' },
    rows: handHTML({
      kind: 'slots',
      cls: 'cbrow mine',
      label: 'Deine Karten',
      cards: [
        { c: null, i: 0, sid: 0, act: 'cbmine', cls: 'cbslot', fk: 'cb:p1:0', label: 'Deine 1. Karte, verdeckt' },
        { c: 'H3', i: 1, sid: 1, act: 'cbmine', cls: 'cbslot seen', fk: 'cb:p1:1' },
      ],
    }),
    bar: {
      btns: [
        { act: 'cbswap', label: 'Eintauschen', intent: 'go', cls: 'primary', ok: false, why: rj('cb.drawFirst') },
        { act: 'cbsnap', label: 'Schnappen', intent: 'toggle', cls: 'snapb', ok: true, on: false },
      ],
    },
    st: ['turn'],
    cls: ['shme', 'cbme'],
    say: '',
  },
};

const SZ: Models = {
  opps: [
    seat({
      id: 'p2',
      st: ['lose'],
      body: `<div class="ocards">${cardHTML(null)}${cardHTML(null)}${cardHTML(null)}</div>`,
      count: livesHTML({ out: false, lives: 2 }, { lives: 3 }),
      tag: { text: 'hat geklopft', kind: 'knock', cls: 'knock' },
    }),
  ],
  center: {
    cap: 'Mitte',
    label: 'Tischmitte',
    stacks: [
      {
        k: 'middle',
        cls: 'middle',
        title: '',
        body: ['HA', 'SK', 'C7'].map((c, i) => cardHTML(c, { key: `mid:${i}`, act: 'mid', i })).join(''),
      },
    ],
  },
  me: {
    head: {
      marks: '',
      count: livesHTML({ out: false, lives: 3 }, { lives: 3 }),
      pill: '<span class="pill">→ 26</span>',
    },
    rows: handHTML({
      kind: 'fan3',
      cls: 'hand',
      label: 'Deine Hand, 3 Karten',
      cards: ['H10', 'HB', 'D8'].map((c, i) => ({ c, i, act: 'hand' })),
    }),
    bar: {
      btns: [
        { act: 'swap', label: 'Tauschen', intent: 'go', cls: 'primary', ok: false, why: rj('any.pickCard') },
        { act: 'swapAll', label: 'Alle drei', intent: 'alt', cls: 'ghost', ok: true },
        { act: 'knock', label: 'Klopfen', intent: 'alt', cls: 'ghost', ok: true },
      ],
    },
    st: ['turn'],
    cls: [],
    say: '',
  },
};

/** Gilt für jeden Tisch */
const COMMON = [
  '#table',
  '#scr-game #table',
  '#me',
  '#me .card',
  '.opp[data-pid]',
  '#opps .opp[data-pid]',
  '[data-pid]',
  '#me .actions',
  '#me .actions .btn',
  '#center *',
  '#table *',
];

const CASES: [string, Models, string[]][] = [
  [
    'Shithead',
    SH,
    [
      '.shme .card[data-act=shd]',
      '.shme [data-act=shh][data-i]',
      '.shme [data-act=shu][data-i]',
      '.shme .upc .card',
      '.shme .shhand .card',
      '.shme .shhand [data-act=shh].dim',
      '#me .shhand .card',
      '#me .tcards .upc .card',
      '.tcards',
      '.shhand',
      '.ohand',
      '#center .pile',
      '#center .pile .card',
      '#center .burned',
      '#center .deck',
      '#center .deck .card',
      '#center .cap',
      '#center .cnt',
      '.tag.done',
      '.mehead',
      '#me .mehead',
      '#me .mehead .nm',
      '#me [data-act=shplay]:not([disabled])',
      '[data-drop=pile]',
      '[data-drag=hand]',
      '[data-st~=turn]',
      '#me [data-fk]',
    ],
  ],
  ['Shithead Tauschrunde', SH_SWAP, ['.swhead', '#me .swhead', '#me .swhead b', '.shme.swapping']],
  [
    'Durak',
    DK,
    [
      '#me [data-act=dkh][data-i]',
      '#center .dkpair[data-i]',
      '#center .dkbito',
      '#me .dkhand .card.dim[data-act=dkh]',
      '#me [data-act=dkh]:not(.pick)',
      '#center .dkpair[data-i] .dka',
      '.dkd',
      '#center .dkdeck',
      '#center .deck .card',
      '#me .dkhand .card',
      '#center .dktrump .card',
      '#center .cnt',
      '#me [data-act=dkbeat]:not([disabled])',
      '.opp[data-role=def]',
      '#me .mehead .nm',
    ],
  ],
  [
    'Cabo',
    CB,
    [
      '#me .cbslot[data-sid]',
      '#me .cbslot.seen',
      '#center .cbdeck[data-act=cbdeck]',
      '#opps .opp .cbslot[data-act=cbo]',
      '#opps .cbslot.seen',
      '#me [data-act=cbswap][aria-disabled=true]',
      '#me .cbrow',
      '#me .cbrow.mine [data-act]',
      '.opp[data-pid] .cbrow .cbslot[data-sid]',
      '.opp[data-pid] .cbheld',
      '#center .cbdeck',
      '#center .cbpile',
      '#center .cbhold',
      '#center .cbpile > .card:not(.under)',
      '#center .cbhold .cnt',
      '[data-st~=target]',
      '[data-o=p2][data-sid="3"]',
      '#me .mehead .nm',
    ],
  ],
  [
    'Schnautz',
    SZ,
    [
      '#me [data-act=hand][data-i]',
      '#center [data-act=mid][data-i]',
      '#me .hand',
      '#center .middle .card',
      '.opp[data-pid] .ocards',
      '.coaster.lost',
      '#me .mehead .nm',
    ],
  ],
];

describe('Selektorvertrag der Bausteine', () => {
  for (const [name, m, sels] of CASES) {
    it(name, () => {
      // Der Tisch steht in #scr-game wie in index.html
      const root = parseHTML(`<section class="game" id="scr-game">${tableHTML(m)}</section>`);
      const missing = [...COMMON, ...sels].filter((s) => !qsa(root, s).length);
      expect(missing).toEqual([]);
    });
  }

  it('die fünf Kinder von #table bleiben', () => {
    const root = parseHTML(tableHTML(SH));
    expect(qsa(root, '#table > *').map((e) => e.attrs.id ?? e.attrs.class)).toEqual([
      'scorebar',
      'opps',
      'center',
      'status',
      'seat',
    ]);
  });

  it('wer nicht mitspielt, behält #me mit Satz und Knopfleiste', () => {
    const root = parseHTML(
      tableHTML({
        ...SZ,
        me: {
          out: 'Du bist raus.',
          bar: { btns: [{ act: 'ffwd', label: 'Vorspulen', intent: 'alt', cls: 'ghost small', ok: true }] },
        },
      }),
    );
    expect(qsa(root, '#me .outmsg')).toHaveLength(1);
    expect(qsa(root, '#me [data-act=ffwd]')).toHaveLength(1);
  });
});

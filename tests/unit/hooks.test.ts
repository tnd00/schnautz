/*
 * Selektorvertrag (Plan 2.8 Abschnitt 8, abgleich.md 1.1): Die Bausteine am Tisch erzeugen jeden Selektor, den E2E,
 * Flüge, Abläufe, Band und Mess-Skripte lesen. Shithead ist umgestellt, seine Modelle kommen über specOf aus echten
 * Spielständen. Durak, Cabo und Schnautz sind bis 4a von Hand gebaut. #status (paintStatus), #emofab und #logfab
 * stehen fest in index.html und gehören nicht zu den Bausteinen.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { rj } from '../../src/game/reject';
import { REJECT_TEXT } from '../../src/content/texts/reject';
import { addPlayer, newState } from '../../src/game/state';
import type { State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { cardHTML, livesHTML } from '../../src/ui/cards';
import { seatOrder } from '../../src/ui/helpers';
import { shBtnTap } from '../../src/ui/render/shithead';
import { SEQ } from '../../src/ui/shithead/sequence';
import { SH_TABLE } from '../../src/content/texts/table-sh';
import { TABLE } from '../../src/content/texts/table';
import { BAR } from '../../src/ui/table/bar';
import { handHTML } from '../../src/ui/table/hand';
import { meClass, meHTML } from '../../src/ui/table/me';
import { centerHTML, deckCards } from '../../src/ui/table/pile';
import { seatHTML } from '../../src/ui/table/seat';
import { isOld, specOf } from '../../src/ui/table/spec';
import type { CenterModel, MeModel, MeOut, SeatModel } from '../../src/ui/table/types';
import { parseHTML, qsa, rngF } from './helpers';

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
  `<div class="seat"><div class="${meClass(m.me)}" id="me" data-pid="p1"` +
  `${'out' in m.me ? '' : ` data-st="${m.me.st.join(' ')}"`}>${meHTML(m.me)}</div></div></div>`;

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

/** Shithead zu dritt, ich bin h: Tauschrunde, auf Wunsch schon im Spiel mit h am Zug und offenem Stapel */
function shTable(play: boolean, edit?: (st: State) => void): State {
  const rng = rngF(7);
  const st = newState('h', 'H');
  addPlayer(st, 'a', 'Anna');
  addPlayer(st, 'b', 'Bert');
  act(st, 'h', { type: 'game', game: 'shithead' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  if (play && st.sh) {
    for (const id of ['h', 'a', 'b']) act(st, id, { type: 'shready' });
    st.sh.win = null;
    st.turn = 0;
  }
  edit?.(st);
  return st;
}

/** Modelle aus specOf, so wie renderTable sie für h zeichnet, mit Auswahl `ss` */
function shModels(st: State, ss: typeof App.ss = { src: null, idx: [] }): Models {
  const v = viewFor(st, 'h');
  Object.assign(App, { me: 'h', view: v, role: 'host', ss, anim: {} });
  const spec = specOf('shithead');
  if (isOld(spec)) throw new Error('Shithead ist noch nicht umgestellt');
  const center = spec.center(v);
  const me = spec.me(v);
  if (!center || !me) throw new Error('Shithead liefert keine Mitte oder keinen eigenen Platz');
  return { opps: seatOrder(v).flatMap((p) => spec.seat(v, p) ?? []), center, me };
}

/** Am Zug mit zwei Assen und einer Fünf auf einem König, ein Ass gewählt. Anna hat keine Tischkarten mehr. */
const shPlay = (): Models =>
  shModels(
    shTable(true, (st) => {
      if (!st.sh) return;
      st.sh.pile = ['SK'];
      st.sh.P.h.hand = ['HA', 'C5', 'DA'];
      st.sh.P.a.up = [];
      st.sh.P.a.down = [];
    }),
    { src: 'hand', idx: [0] },
  );

/** Hand leer, erst die offenen, dann nur noch die verdeckten Tischkarten */
const shUp = (): Models => shModels(shTable(true, (st) => st.sh && (st.sh.P.h.hand = [])));
const shDown = (): Models =>
  shModels(
    shTable(true, (st) => {
      if (!st.sh) return;
      st.sh.P.h.hand = [];
      st.sh.P.h.up = [];
    }),
  );

/** Tauschrunde, Anna ist schon bereit */
const shSwap = (): Models => shModels(shTable(false, (st) => act(st, 'a', { type: 'shready' })));

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

/** Name, Modelle, Selektoren, ob COMMON dazugehört (Teilstände wie „nur verdeckte Karten“ haben keine Knöpfe) */
const CASES: [string, () => Models, string[], boolean?][] = [
  [
    'Shithead am Zug',
    shPlay,
    [
      '.shme [data-act=shh][data-i]',
      '.shme .upc .card',
      '.shme .shhand .card',
      '.shme .shhand [data-act=shh].dim',
      '#me .shhand .card',
      '#me .tcards .upc .card',
      '.tcards',
      '.tcards .tslot',
      '.shhand',
      '.ohand',
      '#opps .opp .hcount',
      '.opp.handonly .bighand .ohand .card',
      '.opp.sh[data-act=aim]',
      '#center .pile',
      '#center .pile .card',
      '#center .burned',
      '#center .burned b',
      '#center .deck',
      '#center .deck .card',
      '#center .pcount',
      '#center .cap',
      '#center .cnt',
      '.mehead',
      '#me .mehead',
      '#me .mehead .nm',
      '#me .mehead .pill',
      '#me [data-act=shplay]:not([disabled])',
      '#me [data-act=shselall]',
      '#me [data-act=shpickup]',
      '[data-drop=pile]',
      '[data-drag=hand]',
      '[data-st~=turn]',
      '#me [data-fk]',
      '#me .tb-hand[data-fit]',
    ],
  ],
  ['Shithead offene Tischkarten', shUp, ['.shme [data-act=shu][data-i]', '[data-drag=up]', '.shme .tcards.focus']],
  ['Shithead verdeckte Tischkarten', shDown, ['.shme .card[data-act=shd]', '[data-drag=down]'], false],
  [
    'Shithead Tauschrunde',
    shSwap,
    [
      '.swhead',
      '#me .swhead',
      '#me .swhead b',
      '.shme.swapping',
      '.tag.done',
      '.tag.turn .thinking',
      '#me [data-act=shready]',
      '.shme [data-act=shh][data-i][data-drop=hand]',
      '.shme [data-act=shu][data-i][data-drop=up]',
    ],
  ],
  [
    'Durak',
    () => DK,
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
    () => CB,
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
    () => SZ,
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

afterEach(() => {
  Object.assign(App, { me: '', view: null, role: null, ss: { src: null, idx: [] } });
});

describe('Selektorvertrag der Bausteine', () => {
  for (const [name, models, sels, common = true] of CASES) {
    it(name, () => {
      // Der Tisch steht in #scr-game wie in index.html
      const root = parseHTML(`<section class="game" id="scr-game">${tableHTML(models())}</section>`);
      const missing = [...(common ? COMMON : []), ...sels].filter((s) => !qsa(root, s).length);
      expect(missing).toEqual([]);
    });
  }

  it('Shithead: Fremde verdeckte Karten tragen keinen Wert und keinen Fokus-Schlüssel', () => {
    const root = parseHTML(tableHTML(shPlay()));
    expect(qsa(root, '#opps .card.back[aria-label]')).toEqual([]);
    expect(qsa(root, '#opps [data-fk]')).toEqual([]);
    expect(qsa(root, '#center [data-fk]')).toEqual([]);
  });

  it('die fünf Kinder von #table bleiben', () => {
    const root = parseHTML(tableHTML(shPlay()));
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

describe('Shithead nach Runde 3', () => {
  afterEach(() => {
    App.zerHide = '';
  });

  it('Handkarten stehen als Wert auf der Unterkante, KI vor dem Namen', () => {
    const m = shModels(shTable(true));
    const html = m.opps.map(seatHTML).join('');
    const vals = qsa(parseHTML(html), '.opp > .val.hcount[data-k=cards]');
    expect(vals).toHaveLength(2);
    expect(vals[0].attrs.title).toMatch(/^\d+ Handkarten?$/);
    expect(qsa(parseHTML(html), '.ometa .hcount')).toHaveLength(0);
  });

  it('bis zur Enthüllung verraten Wert und Vorlesetext den Shithead nicht', () => {
    const st = shTable(true, (s) => {
      if (!s.sh) return;
      s.phase = 'over';
      s.sh.shithead = 'a';
    });
    App.zerHide = 'a';
    const m = shModels(st);
    // Der Wert bleibt unsichtbar stehen (.hold), damit der Tisch nicht springt
    expect(m.opps.every((o) => /\bhold\b/.test(o.value))).toBe(true);
    expect(m.opps.some((o) => /Handkarte/.test(o.say))).toBe(false);
    App.zerHide = '';
    expect(shModels(st).opps.every((o) => o.value !== '' && !/\bhold\b/.test(o.value))).toBe(true);
  });

  it('bis zur Enthüllung tragen Platz und Vorlesetext des neuen Shitheads weder 💩 noch Krone', () => {
    const st = shTable(true, (s) => {
      if (!s.sh) return;
      s.phase = 'over';
      s.sh.shithead = 'a';
      s.reigns = { shithead: { win: 'b', lose: 'a', game: 'shithead' } };
    });
    App.zerHide = 'a';
    const anna = shModels(st).opps.find((o) => o.id === 'a');
    App.zerHide = '';
    expect(anna?.marks).toBe('');
    expect(anna?.say).not.toContain(SH_TABLE.reign);
    expect(anna?.say).not.toContain(TABLE.crown);
    // Nach der Enthüllung trägt sie ihn
    const after = shModels(st).opps.find((o) => o.id === 'a');
    expect(after?.marks).toContain('reign');
    expect(after?.say).toContain(SH_TABLE.reign);
  });

  it('gesperrter Knopf nennt beim Tipp seinen Grund und schickt keinen Zug, während eines Ablaufs schweigt er', () => {
    const st = shTable(true, (s) => {
      if (!s.sh) return;
      s.sh.pile = ['SK'];
      s.sh.P.h.hand = ['HA', 'C5', 'DA'];
    });
    shModels(st);
    const v = viewFor(st, 'h');
    BAR.at = 0;
    // Nichts gewählt: gesperrt gezeichnet nennt er den Grund, sonst bleibt es still, ein Zug geht nie raus
    expect(shBtnTap(v, 'shplay', true)).toEqual(rj('any.pickCard'));
    expect(shBtnTap(v, 'shplay', false)).toBe(false);
    expect(shBtnTap(v, 'shpickup', false)).toBe(true);
    SEQ.busy = true;
    expect(shBtnTap(v, 'shplay', true)).toBe(false);
    SEQ.busy = false;
    // Die Fünf passt nicht auf den König
    App.ss = { src: 'hand', idx: [1] };
    expect(shBtnTap(v, 'shplay', true)).toEqual(rj('sh.noFit', { c: 'C5', top: 'SK' }));
    App.ss = { src: 'hand', idx: [0] };
    expect(shBtnTap(v, 'shplay', false)).toBe(true);
    // 4er-Sperre: Ausspielen und „Für X spielen“ nennen sh.winLock
    if (st.sh) st.sh.win = { r: 'K', by: [], id: 1, lock: true };
    const w = viewFor(st, 'h');
    expect(shBtnTap(w, 'shplay', true)).toEqual(rj('sh.winLock'));
    expect(shBtnTap(w, 'skip', true)).toEqual(rj('sh.winLock'));
    expect(shBtnTap(w, 'skip', false)).toBe(true);
    SEQ.busy = true;
    expect(shBtnTap(w, 'skip', true)).toBe(false);
    SEQ.busy = false;
    App.ss = { src: null, idx: [] };
  });

  it('gesperrte Knöpfe und ausgegraute Karten nennen ihren Grund statt disabled', () => {
    const m = shModels(
      shTable(true, (st) => {
        if (!st.sh) return;
        st.sh.pile = ['SK'];
        st.sh.P.h.hand = ['HA', 'C5', 'DA'];
      }),
    );
    const doc = parseHTML(meHTML(m.me));
    expect(qsa(doc, '[disabled]')).toHaveLength(0);
    const play = qsa(doc, '[data-act=shplay]')[0].attrs;
    expect(play['aria-disabled']).toBe('true');
    expect(play['aria-description']).toBe(REJECT_TEXT['any.pickCard']);
    const five = qsa(doc, '[data-act=shh].dim')[0].attrs;
    expect(five['aria-disabled']).toBe('true');
    expect(five['aria-description']).toBeTruthy();
    // Ausspielen und Aufnehmen bleiben an ihren Plätzen, „Alle wählen“ kommt dahinter
    const sel = shModels(
      shTable(true, (st) => {
        if (!st.sh) return;
        st.sh.pile = ['SK'];
        st.sh.P.h.hand = ['HA', 'C5', 'DA'];
      }),
      { src: 'hand', idx: [0] },
    );
    const acts = qsa(parseHTML(meHTML(sel.me)), '.actions .btn').map((b) => b.attrs['data-act']);
    expect(acts).toEqual(['shplay', 'shpickup', 'shselall']);
  });
});

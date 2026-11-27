/*
 * Durak auf den Bausteinen (Plan 2.8 Runde 4a): Modelle aus dkSpec für echte Spielstände, gezeichnet wie in
 * renderTable. Geprüft werden die Selektoren, die E2E, Flüge und events.ts lesen, dass mehrere zugleich dran sein
 * können (dkWaiting) und dass gesperrte Knöpfe aria-disabled mit dem Grund aus der Spiellogik tragen. Seit 4b auch
 * Eckaufkleber und KI-Zeichen, Trumpf mit Zeichen, feste Knopfplätze und Gründe an Karten beim Warten.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { LOSER_MARK } from '../../src/game/games';
import { addPlayer, newState } from '../../src/game/state';
import type { Card, DkState, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { seatOrder } from '../../src/ui/helpers';
import { dkBtnState } from '../../src/ui/render/durak';
import { meClass, meHTML } from '../../src/ui/table/me';
import { centerHTML } from '../../src/ui/table/pile';
import { seatHTML } from '../../src/ui/table/seat';
import { specOf } from '../../src/ui/table/spec';
import { parseHTML, qsa, rngF } from './helpers';

const NAMES = ['Tina', 'Lena', 'Tom', 'Uschi'];
const IDS = ['h', 'a', 'b', 'c'];

/** Durak zu `n` mit festen Händen: Trumpf Herz, h greift a an, jede Hand hat eine Sieben. */
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
  };
  D.P = Object.fromEntries(IDS.slice(0, n).map((id) => [id, hands[id]]));
  Object.assign(D, { att: 'h', def: 'a', table: [], take: false, done: [], limit: 3, finished: [] });
  return { st, D };
}

/** Der Tisch so, wie renderTable ihn für `me` schreibt, mit Auswahl `idx` */
function draw(st: State, me: string, idx: number[] = []) {
  const v = viewFor(st, me);
  Object.assign(App, { me, view: v, role: me === 'h' ? 'host' : 'guest', ds: { idx, pair: null }, anim: {} });
  const spec = specOf('durak');
  const opps = seatOrder(v).flatMap((p) => spec.seat(v, p) ?? []);
  const center = spec.center(v);
  const m = spec.me(v);
  if (!center || !m) throw new Error('Durak liefert keine Mitte oder keinen eigenen Platz');
  const root = parseHTML(
    '<div class="table" id="table" data-game="durak">' +
      `<div class="opps" id="opps">${opps.map(seatHTML).join('')}</div>` +
      `<div class="center" id="center">${centerHTML(center)}</div>` +
      `<div class="seat"><div class="${meClass(m)}" id="me">${meHTML(m)}</div></div></div>`,
  );
  return { v, opps, m, sel: (s: string) => qsa(root, s) };
}

afterEach(() => {
  Object.assign(App, { me: '', view: null, role: null, ds: { idx: [], pair: null }, anim: {} });
});

describe('Durak auf den Bausteinen', () => {
  it('Angriff: Selektoren für Taps, Flüge und Tests, Knopf gesperrt mit Grund', () => {
    const { st } = table();
    const { sel } = draw(st, 'h');
    const missing = [
      '#me [data-act=dkh][data-i]',
      '#me .dkhand .card.pick',
      '#me .shhand.dkhand.tb-hand[data-fit]',
      '#center .dkdeck .pcount',
      '#center .dktrump .card',
      '#center .dktable.empty .emptyslot',
      '#center .dktable .cnt',
      '#center .dkbito .cnt',
      '#me.shme.dkme.turn',
      '#me .mehead .nm',
      '#me .actions [data-act=dkgo][aria-disabled=true][aria-description]',
      '.opp.sh.dk.def[data-role=def]',
      '.opp .ometa .nm',
    ].filter((s) => !sel(s).length);
    expect(missing).toEqual([]);
    // Kein echtes disabled mehr. Kein Wert, die Kartenzahl steht im Fächer, und ohne Krone kein Eckaufkleber
    expect(sel('#me [disabled]')).toEqual([]);
    expect(sel('.opp .val, .opp .rmark, .opp .marks')).toEqual([]);
  });

  it('mehrere dürfen zugleich nachlegen, alle Kacheln und der eigene Platz stehen auf turn', () => {
    const { st } = table(4);
    // h greift mit der Sieben an, a schlägt: jetzt dürfen h, b und c nachlegen
    expect(act(st, 'h', { type: 'dkattack', idx: [0] })).toBeNull();
    expect(act(st, 'a', { type: 'dkdefend', a: 0, i: 0 })).toBeNull();
    const { opps, m, sel } = draw(st, 'h');
    expect(opps.filter((o) => o.st.includes('turn')).map((o) => o.id)).toEqual(['b', 'c']);
    expect(sel('.opp.turn .tag.turn .thinking')).toHaveLength(2);
    expect('out' in m ? [] : m.st).toEqual(['turn']);
    expect(sel('#me [data-act=dkgo]')).toHaveLength(1);
    expect(sel('#me [data-act=dkpass]:not([aria-disabled])')).toHaveLength(1);
  });

  it('Knopfgründe kommen aus der Spiellogik, ohne Probezug', () => {
    const { st, D } = table(3, true);
    App.me = 'h';
    App.ds = { idx: [], pair: null };
    expect(dkBtnState(viewFor(st, 'h'), 'dkgo')).toMatchObject({ ok: false, why: { e: 'any.pickCard' } });
    App.ds = { idx: [0], pair: null };
    expect(dkBtnState(viewFor(st, 'h'), 'dkgo')).toEqual({ ok: true, why: null });
    // Angriff liegt offen: Passen geht erst, wenn alles geschlagen ist
    expect(act(st, 'h', { type: 'dkattack', idx: [0] })).toBeNull();
    App.ds = { idx: [], pair: null };
    expect(dkBtnState(viewFor(st, 'h'), 'dkpass')).toMatchObject({ ok: false, why: { e: 'dk.openCards' } });
    // Verteidigung: ohne Karte, mit einer, die nichts schlägt, mit einer, die schlägt
    App.me = 'a';
    expect(dkBtnState(viewFor(st, 'a'), 'dkbeat')).toMatchObject({ ok: false, why: { e: 'any.pickCard' } });
    App.ds = { idx: [2], pair: null };
    expect(dkBtnState(viewFor(st, 'a'), 'dkbeat')).toMatchObject({ ok: false, why: { e: 'dk.noTarget' } });
    App.ds = { idx: [0], pair: null };
    expect(dkBtnState(viewFor(st, 'a'), 'dkbeat')).toEqual({ ok: true, why: null });
    // Weiterschieben mit einer anderen Sieben geht, mit der Neun nicht
    App.ds = { idx: [1], pair: null };
    expect(dkBtnState(viewFor(st, 'a'), 'dktransfer').ok).toBe(true);
    App.ds = { idx: [0], pair: null };
    expect(dkBtnState(viewFor(st, 'a'), 'dktransfer')).toMatchObject({ ok: false, why: { e: 'dk.transferRank' } });
    // Gepasst: Passen und Nachlegen nennen beide das Passen
    expect(act(st, 'a', { type: 'dkdefend', a: 0, i: 0 })).toBeNull();
    expect(act(st, 'h', { type: 'dkpass' })).toBeNull();
    expect(D.done).toContain('h');
    App.me = 'h';
    App.ds = { idx: [], pair: null };
    expect(dkBtnState(viewFor(st, 'h'), 'dkpass')).toMatchObject({ ok: false, why: { e: 'dk.passed' } });
    expect(dkBtnState(viewFor(st, 'h'), 'dkgo')).toMatchObject({ ok: false, why: { e: 'dk.passed' } });
  });

  it('Krone und Durak-Zeichen als Eckaufkleber, KI vor dem Namen, bis zur Enthüllung verborgen', () => {
    const { st } = table(4);
    st.players.forEach((p) => p.id !== 'h' && (p.bot = true));
    st.players.find((p) => p.id === 'b')!.dkc = 2;
    st.reigns = { durak: { win: 'a', lose: 'b', game: 'durak' } };
    const { opps, sel } = draw(st, 'h');
    expect(sel('.opp[data-pid=a] > .rmark .reign, .opp[data-pid=b] > .rmark .reign')).toHaveLength(2);
    expect(opps.find((o) => o.id === 'a')?.marks).toContain('👑');
    expect(opps.find((o) => o.id === 'b')?.marks).toContain(LOSER_MARK.durak);
    expect(sel('.opp .ometa .botb')).toHaveLength(3);
    expect(sel('.opp[data-pid=b] .ometa .shc')).toHaveLength(1);
    expect(opps.find((o) => o.id === 'a')?.say).toBe('KI, trägt die Krone, 3 Handkarten, verteidigt');
    expect(opps.find((o) => o.id === 'b')?.say).toBe('KI, amtierender Durak, 3 Handkarten');
    App.zerHide = 'b';
    try {
      const hid = draw(st, 'h');
      expect(hid.sel('.opp[data-pid=b] .rmark')).toEqual([]);
      expect(hid.opps.find((o) => o.id === 'b')?.say).toBe('KI');
    } finally {
      App.zerHide = '';
    }
  });

  it('Trumpf trägt ein Zeichen, Karten beim Warten nennen ihren Grund ohne Grau', () => {
    const { st } = table(4);
    // c wartet: Der Tisch ist leer und h greift an, H7 ist Trumpf
    const { sel } = draw(st, 'c');
    expect(sel('#me .dkhand .card.trumpc .trm')).toHaveLength(1);
    expect(sel('#me .dkhand .card:not(.trumpc) .trm')).toEqual([]);
    expect(sel('#me [data-act=dkh][aria-disabled=true][aria-description]')).toHaveLength(3);
    expect(sel('#me .dkhand .card.dim, #me .dkhand .card.pick')).toEqual([]);
  });

  it('feste Knopfplätze: Weiterschieben steht hinten und lässt beim Wegfallen einen Platz frei', () => {
    const { st } = table(3, true);
    expect(act(st, 'h', { type: 'dkattack', idx: [0] })).toBeNull();
    const acts = (r: ReturnType<typeof draw>) => r.sel('#me .actions > *').map((e) => e.attrs['data-act'] ?? null);
    const a = draw(st, 'a');
    expect(acts(a)).toEqual(['dkbeat', 'dktake', 'dktransfer']);
    expect(a.sel('#me .actions.slots')).toHaveLength(1);
    // a schlägt die Sieben, b legt seine Sieben nach: Weiterschieben geht nicht mehr, sein Platz bleibt frei
    expect(act(st, 'a', { type: 'dkdefend', a: 0, i: 0 })).toBeNull();
    expect(act(st, 'b', { type: 'dkattack', idx: [0] })).toBeNull();
    const b = draw(st, 'a');
    expect(acts(b)).toEqual(['dkbeat', 'dktake', null]);
    expect(b.sel('#me .actions .bslot[aria-hidden=true]')).toHaveLength(1);
    // Wer nachlegen darf, hat zwei Plätze
    expect(draw(st, 'h').sel('#me .actions.slots > .btn')).toHaveLength(2);
    expect(draw(st, 'h').sel('#me .actions .bslot')).toEqual([]);
  });

  it('wer nicht mitspielt, behält die Breite von #me', () => {
    const { st } = table();
    addPlayer(st, 'z', 'Zoe');
    const { m, sel } = draw(st, 'z');
    expect(m).toMatchObject({ out: 'Du spielst diese Partie nicht mit.' });
    expect(sel('#me.shme.dkme .outmsg')).toHaveLength(1);
  });
});

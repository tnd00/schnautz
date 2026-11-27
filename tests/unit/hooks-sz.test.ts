/*
 * Schnautz auf den Bausteinen (Plan 2.8 Runde 4a): Modelle aus szSpec für echte Spielstände, gezeichnet mit den
 * Bausteinen wie in renderTable. Geprüft werden die Selektoren, die E2E, Flüge und events.ts lesen, und dass das Bild
 * wie vorher bleibt (Zeichen im Zähler, Kopf auch für wer raus ist, leere Knopfreihe, kein Wert in der Kachel).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { addPlayer, newState } from '../../src/game/state';
import type { State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { seatOrder } from '../../src/ui/helpers';
import { meClass, meHTML } from '../../src/ui/table/me';
import { centerHTML } from '../../src/ui/table/pile';
import { seatHTML } from '../../src/ui/table/seat';
import { specOf } from '../../src/ui/table/spec';
import { parseHTML, qsa, rngF } from './helpers';

/** Schnautz zu dritt, h gibt (dealer 0), Anna ist eine KI mit Krone */
function table(): State {
  const rng = rngF(3);
  const st = newState('h', 'H');
  addPlayer(st, 'a', 'Anna');
  addPlayer(st, 'b', 'Bert');
  act(st, 'h', { type: 'game', game: 'schnautz' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  st.dealer = 0;
  st.players[1].bot = true;
  return st;
}

/** Der Geber behält, h ist dran mit festen Händen ohne 31 */
function play(st: State, turn = 0): State {
  act(st, 'h', { type: 'keep' });
  st.hands = { h: ['C7', 'S8', 'H9'], a: ['D7', 'C8', 'S9'], b: ['H7', 'D8', 'C9'] };
  st.middle = ['S7', 'H8', 'D9'];
  st.phase = 'play';
  st.turn = turn;
  st.turns = 0;
  st.result = null;
  return st;
}

/** Der Tisch so, wie renderTable ihn für `me` schreibt */
function draw(st: State, me = 'h', sel: typeof App.sel = { h: null, m: null }) {
  const v = viewFor(st, me);
  Object.assign(App, { me, view: v, role: 'host', sel, anim: {} });
  const spec = specOf('schnautz');
  const opps = seatOrder(v).flatMap((p) => spec.seat(v, p) ?? []);
  const center = spec.center(v);
  const m = spec.me(v);
  if (!center || !m) throw new Error('Schnautz liefert keine Mitte oder keinen eigenen Platz');
  const root = parseHTML(
    '<div class="table" id="table" data-game="schnautz">' +
      `<div class="opps" id="opps">${opps.map(seatHTML).join('')}</div>` +
      `<div class="center" id="center">${centerHTML(center)}</div>` +
      `<div class="seat"><div class="${meClass(m)}" id="me">${meHTML(m)}</div></div></div>`,
  );
  return { root, opps, m, sel: (s: string) => qsa(root, s) };
}

afterEach(() => {
  Object.assign(App, { me: '', view: null, role: null, sel: { h: null, m: null }, anim: {} });
});

describe('Schnautz auf den Bausteinen', () => {
  it('am Zug: Selektoren für Taps, Flüge und Tests', () => {
    const { sel } = draw(play(table()), 'h', { h: 0, m: 1 });
    const missing = [
      '#me [data-act=hand][data-i]',
      '#center [data-act=mid][data-i]',
      '#me .hand .card.pick.sel',
      '#center .middle .slot .card.pick.sel',
      '#center .deck .pcount',
      '.opp[data-pid] .ocards .card.back',
      '#me .mehead .nm',
      '#me .mehead .pill.pre .to',
      '#me .actions [data-act=swap].pulse',
      '#me .actions [data-act=swapAll]',
      '#me .actions [data-act=pass]',
      '#me .actions [data-act=knock][aria-disabled=true]',
      '#me .actions .hint',
      '#me.turn',
    ].filter((s) => !sel(s).length);
    expect(missing).toEqual([]);
    // Drei Rücken am Stapel, auch wenn er fast leer ist
    expect(sel('#center .deck .card.back')).toHaveLength(3);
    expect(sel('#me [data-act=swap][aria-disabled]')).toHaveLength(0);
  });

  it('Krone und KI stehen im Zähler vor den Leben, Wert und Eckaufkleber bleiben leer', () => {
    const st = play(table());
    st.reigns = { schnautz: { win: 'a', lose: null, game: 'schnautz' } };
    const { opps, sel } = draw(st);
    expect(opps.every((o) => o.value === '' && o.marks === '')).toBe(true);
    expect(sel('.opp .rmark')).toHaveLength(0);
    expect(sel('.opp .val')).toHaveLength(0);
    expect(sel('.opp[data-pid=a] .ometa .tb-count > .marks.two .botb.sq')).toHaveLength(1);
    expect(sel('.opp[data-pid=a] .ometa .tb-count > .lives')).toHaveLength(1);
  });

  it('nicht dran: Karten bleiben antippbar mit Grund, Knopfreihe leer', () => {
    const { sel } = draw(play(table(), 1));
    expect(sel('#me [data-act=hand][aria-disabled=true]')).toHaveLength(3);
    expect(sel('#center [data-act=mid][aria-disabled=true]')).toHaveLength(3);
    expect(sel('#me .card.pick, #center .card.pick')).toHaveLength(0);
    expect(sel('#me .actions')).toHaveLength(1);
    expect(sel('#me .actions .btn')).toHaveLength(0);
    expect(sel('.opp[data-pid=a].turn .tag.turn .thinking')).toHaveLength(1);
  });

  it('Wahl des Gebers: Behalten oder Nehmen, das zweite Blatt verdeckt', () => {
    const { sel } = draw(table());
    expect(sel('#me .actions [data-act=keep]')).toHaveLength(1);
    expect(sel('#me .actions [data-act=take]')).toHaveLength(1);
    expect(sel('#center .middle .slot .card.back')).toHaveLength(3);
    expect(sel('#center [data-act=mid]')).toHaveLength(0);
    expect(sel('#me .mehead .tag')).toHaveLength(1);
  });

  it('wer raus ist, behält Kopf mit Namen und Leben', () => {
    const st = play(table(), 1);
    st.players[0].out = true;
    const { sel, m } = draw(st);
    expect('out' in m).toBe(false);
    expect(sel('#me .mehead .nm')).toHaveLength(1);
    expect(sel('#me .mehead .tag.outt')).toHaveLength(1);
    expect(sel('#me .outmsg')).toHaveLength(1);
    expect(sel('#me .actions')).toHaveLength(0);
  });
});

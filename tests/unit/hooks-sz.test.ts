/*
 * Schnautz auf den Bausteinen (Plan 2.8 Runde 4a und 4b): Modelle aus szSpec für echte Spielstände, gezeichnet mit
 * den Bausteinen wie in renderTable. Geprüft werden die Selektoren, die E2E, Flüge und events.ts lesen, dazu Wert,
 * Eckaufkleber und Plakette aus 4b (Kopf auch für wer raus ist, leere Knopfreihe).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { finishRound } from '../../src/game/schnautz';
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

  it('Leben als Wert, Krone als Eckaufkleber, KI vor dem Namen, Runde in der Mitte', () => {
    const st = play(table());
    st.reigns = { schnautz: { win: 'a', lose: null, game: 'schnautz' } };
    st.round = 3;
    st.players[2].lives = 0;
    st.knocker = 'b';
    const { opps, sel } = draw(st);
    expect(sel('.opp[data-pid=a] > .rmark .reign')).toHaveLength(1);
    expect(sel('.opp[data-pid=b] > .rmark')).toHaveLength(0);
    expect(sel('.opp[data-pid=a] .ometa .botb')).toHaveLength(1);
    expect(sel('.opp .tb-count > *')).toHaveLength(0);
    expect(sel('.opp[data-pid=a] > .val.hcount[data-k=lives] .lives .coaster')).toHaveLength(3);
    // Wer schwimmt, zeigt Zeichen und Wort, wer geklopft hat, trägt ✊ am Etikett
    expect(sel('.opp[data-pid=b] > .val .swim .swt')).toHaveLength(1);
    const [a, b] = opps;
    expect(b.tag?.text).toBe('✊ geklopft');
    expect(a.say).toBe('KI, trägt die Krone, 3 Leben');
    expect(b.say).toBe('schwimmt, hat geklopft');
    expect(specOf('schnautz').center(viewFor(st, 'h'))?.cap).toBe('Runde 3');
  });

  it('Rundenende: Plakette mit Zeichen statt nur Rahmenfarbe, der Wert hält Platz, wo sie den Stand nennt', () => {
    const st = play(table());
    st.players[1].lives = 1;
    st.hands = { h: ['CA', 'CK', 'CD'], a: ['D7', 'C8', 'S9'], b: ['H7', 'H8', 'H9'] };
    finishRound(st, 'schnautz', 'h');
    const { opps, m, sel } = draw(st);
    expect(sel('.opp[data-pid=a].rlose .tag.outt[data-k=loser]')).toHaveLength(1);
    expect(opps[0].tag?.text).toBe('🛟 schwimmt');
    expect(sel('.opp[data-pid=a] > .val.hold')).toHaveLength(1);
    expect(opps[0].say).toBe('KI, schwimmt jetzt');
    expect(opps[1].tag).toBeNull();
    expect(sel('#me.rwin .mehead .tag[data-k=king]')).toHaveLength(1);
    expect('say' in m && m.say).toContain('beste Hand');
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

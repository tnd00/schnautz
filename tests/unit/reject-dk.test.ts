import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { dkAttackError, dkTransferError } from '../../src/game/durak';
import { addPlayer, newState } from '../../src/game/state';
import type { DkState, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { codeOf, msgOf, rngF } from './helpers';

/** Drei Leute, feste Karten: Trumpf Herz, h greift p1 an, p2 legt nach. */
function fixed(transfer = true): { st: State; D: DkState } {
  const rng = rngF(5);
  const st = newState('h', 'Host');
  act(st, 'h', { type: 'game', game: 'durak' }, rng);
  act(st, 'h', { type: 'rules', rules: { turnSecs: 20, seats: 4, dk: { transfer } } }, rng);
  addPlayer(st, 'p1', 'Lena');
  addPlayer(st, 'p2', 'Tom');
  assert.equal(act(st, 'h', { type: 'start' }, rng), null);
  const D = st.dk as DkState;
  D.trump = 'H6';
  D.deck = ['H6', 'C6', 'S6', 'D6', 'C9', 'CK', 'SB', 'DA', 'HK'];
  D.P.h = ['C7', 'S7', 'D9', 'DB', 'SK', 'H7'];
  D.P.p1 = ['D7', 'S9', 'D10', 'H8', 'HA', 'SD'];
  D.P.p2 = ['C8', 'S10', 'CB', 'CD', 'DK', 'H9'];
  D.att = 'h';
  D.def = 'p1';
  D.limit = 6;
  D.table = [];
  D.done = [];
  D.take = false;
  st.turn = 0;
  return { st, D };
}

describe('Durak: Ablehnungen als Codes', () => {
  it('Phase statt „Das geht gerade nicht.“', () => {
    const { st } = fixed();
    st.phase = 'over';
    expect(codeOf(dkAttackError(st, 'h', ['C7']))).toBe('any.over');
    expect(codeOf(dkTransferError(st, 'p1', ['D7']))).toBe('any.over');
    expect(codeOf(act(st, 'h', { type: 'dkattack', idx: [0] }))).toBe('any.over');
    st.phase = 'end';
    expect(codeOf(act(st, 'h', { type: 'dkpass' }))).toBe('any.roundOver');
    const lobby = newState('h', 'Host');
    expect(codeOf(dkAttackError(lobby, 'h', ['C7']))).toBe('any.notStarted');
    expect(codeOf(dkTransferError(lobby, 'h', ['C7']))).toBe('any.notStarted');
  });

  it('unbekannte Züge und fremde Plätze', () => {
    const { st, D } = fixed();
    // Fremder Zug scheitert schon an der Weiche in actions.ts, ein dk-Typ erst am Ende von dkAct
    expect(codeOf(act(st, 'h', { type: 'cbcabo' } as never))).toBe('any.unknown');
    expect(codeOf(act(st, 'h', { type: 'dkfoo' } as never))).toBe('any.unknown');
    delete D.P.p2;
    expect(codeOf(act(st, 'p2', { type: 'dkpass' }))).toBe('any.notPlaying');
    const { st: s2, D: D2 } = fixed();
    D2.finished.push('p2');
    expect(codeOf(act(s2, 'p2', { type: 'dkpass' }))).toBe('any.done');
  });

  it('Weiterschieben: aufnehmen, leerer Tisch und schon geschlagen sind drei Gründe', () => {
    const { st, D } = fixed();
    expect(dkTransferError(st, 'p1', ['D7'])).toEqual({ e: 'dk.tableEmpty', a: { p: 'h' } });
    expect(msgOf(dkTransferError(st, 'p1', ['D7']))).toBe('Noch liegt nichts auf dem Tisch.');
    expect(act(st, 'h', { type: 'dkattack', idx: [0] })).toBeNull();
    expect(dkTransferError(st, 'p2', ['C8'])).toEqual({ e: 'dk.notDefender', a: { p: 'p1' } });
    expect(msgOf(dkTransferError(st, 'p2', ['C8']))).toBe('Das kann nur, wer verteidigt.');
    expect(dkTransferError(st, 'p1', ['D10'])).toEqual({ e: 'dk.transferRank', a: { c: 'C7' } });
    D.take = true;
    expect(codeOf(dkTransferError(st, 'p1', ['D7']))).toBe('dk.taking');
    D.take = false;
    D.table[0].d = 'C9';
    expect(codeOf(dkTransferError(st, 'p1', ['D7']))).toBe('dk.transferLate');
  });

  it('Weiterschieben über sechs Karten nennt den freien Platz', () => {
    const { st, D } = fixed();
    // Mit zwei Decks gibt es mehr als vier Siebenen
    D.table = ['C7', 'S7', 'D7', 'H7', 'C7:2'].map((a) => ({ a, by: 'h' }));
    D.P.p1 = ['S7:2', 'D7:2', 'H8', 'HA', 'SD', 'D10'];
    const r = dkTransferError(st, 'p1', ['S7:2', 'D7:2']);
    expect(r).toEqual({ e: 'dk.room', a: { n: 1 } });
    expect(msgOf(r)).toBe('Es passt nur noch eine Karte in diesen Angriff.');
  });

  it('Angriff und Verteidigung tragen nur offene Karten und Platz-IDs', () => {
    const { st, D } = fixed();
    expect(dkAttackError(st, 'p2', ['C8'])).toEqual({ e: 'dk.notLead', a: { p: 'h' } });
    expect(codeOf(act(st, 'h', { type: 'dkattack', idx: [0, 2] }))).toBe('any.sameRank');
    expect(codeOf(act(st, 'p2', { type: 'dkpass' }))).toBe('dk.tableEmpty');
    expect(codeOf(act(st, 'h', { type: 'dkpass' }))).toBe('dk.leadFirst');
    expect(act(st, 'h', { type: 'dkattack', idx: [0] })).toBeNull();
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 1, ac: 'C7', c: 'S9' })).toEqual({
      e: 'dk.noBeat',
      a: { c: 'S9', a: 'C7' },
    });
    expect(act(st, 'p2', { type: 'dkdefend', a: 0, i: 0 })).toEqual({ e: 'dk.notDefender', a: { p: 'p1' } });
    expect(act(st, 'h', { type: 'dkpass' })).toEqual({ e: 'dk.openCards', a: { p: 'p1' } });
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'X9', c: 'D7' })).toEqual({ e: 'dk.pairGone' });
    D.table[0].d = 'C9';
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0 })).toEqual({ e: 'dk.beaten', a: { a: 'C7' } });
    expect(codeOf(act(st, 'p1', { type: 'dktake' }))).toBe('dk.allBeaten');
  });

  it('geht auch auf der Gast-Ansicht', () => {
    const { st } = fixed();
    const v = viewFor(st, 'p2');
    expect(codeOf(dkAttackError(v, 'p2', ['C8']))).toBe('dk.notLead');
    expect(msgOf(dkAttackError(v, 'p2', ['C8']))).toBe('Zuerst greift jemand anderes an.');
  });
});

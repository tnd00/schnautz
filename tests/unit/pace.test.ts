import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { newState } from '../../src/game/state';
import type { LogEntry } from '../../src/game/types';
import { SH_WIN_MS } from '../../src/game/constants';
import { animFloor, FAST, fastDelay, fastOk, ffwdInLog } from '../../src/net/pace';
import { rngF } from './helpers';

const e = (x: Partial<LogEntry> & { k: LogEntry['k'] }): LogEntry => ({ n: 1, ...x }) as LogEntry;

describe('Takt beim Vorspulen', () => {
  it('reguläre Züge kurz, aber nie vor dem Ende der Animation', () => {
    expect(fastDelay({ kind: 'turn', r: 0.5, floor: 0 })).toBe(FAST.turn);
    expect(fastDelay({ kind: 'turn', r: 0.5, floor: 760 })).toBe(FAST.turn + 760);
    expect(fastDelay({ kind: 'turn', r: 0, floor: -50 })).toBe(FAST.turn);
    // Deutlich schneller als die normale Denkpause (600 bis 3200 ms plus Animation)
    expect(fastDelay({ kind: 'turn', r: 1, floor: 0 })).toBeLessThan(600);
  });

  it('bereit bei Schnautz: Rundenergebnis steht kurz, Meldungen laufen aus', () => {
    expect(fastDelay({ kind: 'ready', r: 0, floor: 0 })).toBe(FAST.readyMin);
    expect(fastDelay({ kind: 'ready', r: 0, floor: 0, hold: 3000 })).toBe(3000 + FAST.readyAfterHold);
    expect(fastDelay({ kind: 'ready', r: 0, floor: 0, hold: 3000 })).toBeLessThan(4000);
  });

  it('Reaktionen, Tauschrunde und Tipps in festen kurzen Spannen', () => {
    expect(fastDelay({ kind: 'react', r: 0, floor: 0 })).toBe(100);
    expect(fastDelay({ kind: 'react', r: 1, floor: 650 })).toBe(300 + 650);
    expect(fastDelay({ kind: 'swap', r: 1, floor: 9999 })).toBe(FAST.turn + FAST.swapSpan);
    expect(fastDelay({ kind: 'bet', r: 0, floor: 0 })).toBe(300);
    expect(fastDelay({ kind: 'bet', r: 1, floor: 0 })).toBe(900);
  });

  it('die 4er-Sperre ist kürzer als sonst', () => {
    expect(FAST.win).toBeLessThan(SH_WIN_MS);
  });
});

describe('Animationsboden', () => {
  it('Shithead nimmt die Ablauflänge der neuen Einträge', () => {
    expect(animFloor('shithead', [e({ k: 'shplay' })], 760)).toBe(760);
    expect(animFloor('shithead', [], 0)).toBe(0);
  });

  it('Durak wartet nach Bito und Aufnehmen länger, weil das Nachziehen verzögert fliegt', () => {
    expect(animFloor('durak', [e({ k: 'dkattack' })], 0)).toBe(FAST.dkMove);
    expect(animFloor('durak', [e({ k: 'dkdefend' }), e({ k: 'dkbito' })], 0)).toBe(FAST.dkClear);
    expect(animFloor('durak', [e({ k: 'dkpickup' })], 0)).toBe(FAST.dkClear);
    expect(animFloor('durak', [e({ k: 'chat' }), e({ k: 'ffwd' })], 0)).toBe(0);
  });

  it('Schnautz und Cabo mit festen Böden je Zug', () => {
    expect(animFloor('schnautz', [e({ k: 'swap' })], 0)).toBe(FAST.szMove);
    expect(animFloor('schnautz', [e({ k: 'emote' })], 0)).toBe(0);
    expect(animFloor('cabo', [e({ k: 'cbdraw' })], 0)).toBe(FAST.cbMove);
  });
});

describe('Wann das Vorspulen gilt', () => {
  it('nur für dieselbe Partie, solange nur KIs spielen, bei Schnautz auch zwischen den Runden', () => {
    const rng = rngF(3);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { fill: false } }, rng);
    while (st.players.length < 3) act(st, 'h', { type: 'addbot' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    st.phase = 'play';
    expect(fastOk(st, st.games)).toBe(false);
    st.players[0].out = true;
    expect(fastOk(st, st.games)).toBe(true);
    expect(fastOk(st, null)).toBe(false);
    expect(fastOk(st, st.games - 1)).toBe(false);
    st.phase = 'end';
    expect(fastOk(st, st.games)).toBe(true);
    st.phase = 'over';
    expect(fastOk(st, st.games)).toBe(false);
    // Übernimmt ein Mensch wieder einen Platz, ist es vorbei
    st.phase = 'play';
    st.players[0].out = false;
    expect(fastOk(st, st.games)).toBe(false);
  });
});

describe('Vorspulen im Verlauf', () => {
  it('gilt ab ffwd bis zur nächsten Partie, Lobby oder Übernahme', () => {
    expect(ffwdInLog([])).toBe(false);
    expect(ffwdInLog([e({ k: 'game' }), e({ k: 'shplay' })])).toBe(false);
    expect(ffwdInLog([e({ k: 'game' }), e({ k: 'ffwd' }), e({ k: 'shplay' }), e({ k: 'chat' })])).toBe(true);
    expect(ffwdInLog([e({ k: 'ffwd' }), e({ k: 'takeover' }), e({ k: 'shplay' })])).toBe(false);
    expect(ffwdInLog([e({ k: 'ffwd' }), e({ k: 'back' })])).toBe(false);
    expect(ffwdInLog([e({ k: 'ffwd' }), e({ k: 'shend' }), e({ k: 'game' })])).toBe(false);
    expect(ffwdInLog([e({ k: 'ffwd' }), e({ k: 'lobby' })])).toBe(false);
    // Schnautz: neue Runden beenden es nicht
    expect(ffwdInLog([e({ k: 'ffwd' }), e({ k: 'result' }), e({ k: 'round' })])).toBe(true);
  });
});

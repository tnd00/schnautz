/*
 * Shithead ziehen (Plan 2.8 Nachtrag nach Runde 0 Punkt 9, ziehen.md 4.4): Handkarten, offene und verdeckte
 * Tischkarten auf den Stapel, gewählte gleiche Werte gehen zusammen. In der Tauschrunde Handkarte auf offene
 * Tischkarte und umgekehrt. Ob eine Karte passt, entscheidet dieselbe Regel wie beim Tippen (shWhyNot), deshalb startet
 * während der 4er-Sperre und außerhalb des eigenen Zugs kein Ziehen. 4er reinwerfen und Bombe bleiben Knöpfe.
 * Ziehbar ist nur, was ein gültiges Ziel hat, ausgegraute Karten bleiben ein Tipp mit Grund.
 */
import { rankOf } from '../cards';
import type { DragKey, DropKey, DropResult } from '../drop';
import { phaseReject, rj, type Reject } from '../reject';
import { shWhyNot } from '../shithead';
import type { Card, View } from '../types';

export type ShDragKey = Extract<DragKey, { g: 'shithead' }>;

const no = (r: Reject): DropResult => ({ ok: false, r });

/** Eigene offene Reihen, nur in der eigenen Ansicht ist die Hand ein Array */
function own(v: View, me: string): { hand: Card[]; up: Card[] } | null {
  const P = v.sh?.P[me];
  return P && Array.isArray(P.hand) ? { hand: P.hand, up: P.up } : null;
}

/** Indizes der Karten in der Reihe, null wenn eine fehlt oder doppelt vorkommt */
function idxOf(arr: readonly Card[], cards: readonly Card[]): number[] | null {
  const idx = cards.map((c) => arr.indexOf(c));
  return idx.length && idx.every((i, k) => i >= 0 && idx.indexOf(i) === k) ? idx : null;
}

/** Auf den Stapel: shplay oder shblind, mit demselben Grund wie beim Tippen */
function playOf(v: View, me: string, src: ShDragKey): DropResult {
  if (src.from === 'down') {
    const why = shWhyNot(v, me, { src: 'down', i: src.i });
    return why ? no(why) : { ok: true, a: { type: 'shblind', i: src.i }, say: { k: 'sh.blind' } };
  }
  const P = own(v, me);
  const idx = P ? idxOf(P[src.from], src.cards) : null;
  if (!idx) return no(rj('any.cardGone'));
  if (!src.cards.every((c) => rankOf(c) === rankOf(src.cards[0]))) return no(rj('any.sameRank'));
  const why = shWhyNot(v, me, { src: src.from, i: idx[0] });
  if (why) return no(why);
  return { ok: true, a: { type: 'shplay', from: src.from, idx }, say: { k: 'sh.play', a: { n: idx.length } } };
}

/** Tauschrunde: eine Handkarte gegen eine offene Tischkarte, in beide Richtungen */
function swapOf(v: View, me: string, src: ShDragKey, dst: DropKey): DropResult {
  const p = v.players.find((x) => x.id === me);
  const P = own(v, me);
  if (!p || p.out || !P) return no(rj('any.notPlaying'));
  if (p.ready) return no(rj('any.ready'));
  if (src.from === 'down' || src.cards.length !== 1) return no(rj('any.noDrop'));
  const i = P[src.from].indexOf(src.cards[0]);
  if (i < 0) return no(rj('any.cardGone'));
  const to = src.from === 'hand' ? 'up' : 'hand';
  if (dst.z !== to) return no(rj('any.noDrop'));
  const on = P[to][dst.i];
  if (!on) return no(rj('any.cardGone'));
  const [h, u] = to === 'up' ? [i, dst.i] : [dst.i, i];
  return { ok: true, a: { type: 'shswap', h, u }, say: { k: 'sh.swap', a: { on } } };
}

export function shDropOf(v: View, me: string, src: ShDragKey, dst: DropKey): DropResult {
  if (v.phase === 'swap') return swapOf(v, me, src, dst);
  if (v.phase !== 'play') return no(phaseReject(v) ?? rj('any.unknown'));
  return dst.z === 'pile' ? playOf(v, me, src) : no(rj('any.noDrop'));
}

/** Alle Ziele, die ein Shithead-Tisch haben kann: Stapel, offene Tischkarten und Handkarten */
function targets(v: View, me: string): DropKey[] {
  const P = own(v, me);
  return [
    { z: 'pile' },
    ...(P?.up ?? []).map((_, i) => ({ z: 'up' as const, i })),
    ...(P?.hand ?? []).map((_, i) => ({ z: 'hand' as const, i })),
  ];
}

export function shDropsFor(v: View, me: string, src: ShDragKey): DropKey[] {
  return targets(v, me).filter((d) => shDropOf(v, me, src, d).ok);
}

/** Ziehbar ist, was gerade ein gültiges Ziel hat */
export function shCanDrag(v: View, me: string, src: ShDragKey): boolean {
  return shDropsFor(v, me, src).length > 0;
}

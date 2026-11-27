/*
 * Schnautz ziehen: Handkarte auf Mittelkarte oder umgekehrt tauscht in einer Geste (ziehen.md 4.3). Das Etikett nennt
 * den Handwert nach dem Tausch, dieselbe Rechnung wie die Vorschau in der Pille. „Alle drei“, Schieben, Klopfen und die
 * Wahl am Anfang bleiben Knöpfe.
 */
import type { DragKey, DropKey, DropResult } from '../drop';
import { rj } from '../reject';
import { handValue, szWhyNot } from '../schnautz';
import type { Card, View } from '../types';

export type SzDragKey = Extract<DragKey, { g: 'schnautz' }>;

const myHand = (v: View, me: string): Card[] | null => {
  const h = v.hands[me];
  return Array.isArray(h) ? h : null;
};

/** Gibt es die Karte an diesem Platz? */
const has = (xs: readonly Card[] | null | undefined, i: number): boolean =>
  !!xs && Number.isInteger(i) && i >= 0 && i < xs.length;

export function szCanDrag(v: View, me: string, src: SzDragKey): boolean {
  if (szWhyNot(v, me, 'swap')) return false;
  const hand = myHand(v, me);
  return has(hand, 0) && has(src.from === 'hand' ? hand : v.middle, src.i);
}

export function szDropOf(v: View, me: string, src: SzDragKey, dst: DropKey): DropResult {
  const why = szWhyNot(v, me, 'swap');
  if (why) return { ok: false, r: why };
  const hand = myHand(v, me);
  // Die Karte ist nicht mehr da (neue Runde, anderer Stand), wie bei Durak und Shithead
  if (!szCanDrag(v, me, src) || !hand) return { ok: false, r: rj('any.cardGone') };
  // Immer auf die andere Seite: Hand auf Mitte oder Mitte auf Hand
  const to = src.from === 'hand' ? 'mid' : 'hand';
  if (dst.z !== to || !has(to === 'hand' ? hand : v.middle, dst.i)) return { ok: false, r: rj('any.noDrop') };
  const h = src.from === 'hand' ? src.i : dst.i;
  const m = src.from === 'mid' ? src.i : dst.i;
  const after = hand.slice();
  after[h] = v.middle[m];
  return { ok: true, a: { type: 'swap', h, m }, say: { k: 'sz.swap', a: { v: handValue(after, v.rules).v } } };
}

export function szDropsFor(v: View, me: string, src: SzDragKey): DropKey[] {
  if (!szCanDrag(v, me, src)) return [];
  const z = src.from === 'hand' ? 'mid' : 'hand';
  const n = (z === 'hand' ? myHand(v, me) : v.middle)?.length ?? 0;
  return [...Array(n).keys()].map((i) => ({ z, i }));
}

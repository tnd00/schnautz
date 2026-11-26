/*
 * Schnautz ziehen: Handkarte auf Mittelkarte oder umgekehrt tauscht in einer Geste (ziehen.md 4.3).
 * Stummel aus Runde 1: nichts ist ziehbar, jeder Abwurf wird abgelehnt. Runde 5 füllt die Regeln.
 */
import type { DragKey, DropKey, DropResult } from '../drop';
import { rj } from '../reject';
import type { View } from '../types';

export type SzDragKey = Extract<DragKey, { g: 'schnautz' }>;

export function szCanDrag(_v: View, _me: string, _src: SzDragKey): boolean {
  return false;
}

export function szDropOf(_v: View, _me: string, _src: SzDragKey, _dst: DropKey): DropResult {
  return { ok: false, r: rj('any.unknown') };
}

export function szDropsFor(_v: View, _me: string, _src: SzDragKey): DropKey[] {
  return [];
}

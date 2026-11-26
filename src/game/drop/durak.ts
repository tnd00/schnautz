/*
 * Durak ziehen: Angreifen und Nachlegen auf die Tischfläche, Schlagen auf eine Angriffskarte, Schieben auf
 * das Schiebefeld (ziehen.md 4.2).
 * Stummel aus Runde 1: nichts ist ziehbar, jeder Abwurf wird abgelehnt. Runde 5 füllt die Regeln.
 */
import type { DragKey, DropKey, DropResult } from '../drop';
import { rj } from '../reject';
import type { View } from '../types';

export type DkDragKey = Extract<DragKey, { g: 'durak' }>;

export function dkCanDrag(_v: View, _me: string, _src: DkDragKey): boolean {
  return false;
}

export function dkDropOf(_v: View, _me: string, _src: DkDragKey, _dst: DropKey): DropResult {
  return { ok: false, r: rj('any.unknown') };
}

export function dkDropsFor(_v: View, _me: string, _src: DkDragKey): DropKey[] {
  return [];
}

/*
 * Cabo ziehen: Schnappen, Eintauschen, Ablegen, Nehmen, Ziehen und Blindtausch (ziehen.md 4.1). Fremde Plätze
 * sind nur Ziel, nie Quelle.
 * Stummel aus Runde 1: nichts ist ziehbar, jeder Abwurf wird abgelehnt. Runde 5 füllt die Regeln.
 */
import type { DragKey, DropKey, DropResult } from '../drop';
import { rj } from '../reject';
import type { View } from '../types';

export type CbDragKey = Extract<DragKey, { g: 'cabo' }>;

export function cbCanDrag(_v: View, _me: string, _src: CbDragKey): boolean {
  return false;
}

export function cbDropOf(_v: View, _me: string, _src: CbDragKey, _dst: DropKey): DropResult {
  return { ok: false, r: rj('any.unknown') };
}

export function cbDropsFor(_v: View, _me: string, _src: CbDragKey): DropKey[] {
  return [];
}

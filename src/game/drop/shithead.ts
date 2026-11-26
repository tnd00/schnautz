/*
 * Shithead ziehen: Karten auf den Stapel (mehrere gleiche zusammen) und in der Tauschrunde Handkarte auf
 * Tischkarte (Plan 2.8 Frage 1, ziehen.md 4.4). Kein Start während SEQ.busy oder offener 4er-Sperre.
 * Stummel aus Runde 1: nichts ist ziehbar, jeder Abwurf wird abgelehnt. Runde 5 füllt die Regeln.
 */
import type { DragKey, DropKey, DropResult } from '../drop';
import { rj } from '../reject';
import type { View } from '../types';

export type ShDragKey = Extract<DragKey, { g: 'shithead' }>;

export function shCanDrag(_v: View, _me: string, _src: ShDragKey): boolean {
  return false;
}

export function shDropOf(_v: View, _me: string, _src: ShDragKey, _dst: DropKey): DropResult {
  return { ok: false, r: rj('any.unknown') };
}

export function shDropsFor(_v: View, _me: string, _src: ShDragKey): DropKey[] {
  return [];
}

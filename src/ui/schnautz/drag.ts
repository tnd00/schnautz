/*
 * Schnautz ziehen (ziehen.md 4.3): Handkarte auf Mittelkarte oder umgekehrt tauscht in einer Geste. Lädt mit dem Motor
 * nach (Muster in src/ui/table/drag.ts). Abgeschickt wird wie mit dem Knopf „Tauschen“ in src/ui/events.ts, die Flüge
 * starten in runFlights (src/ui/animations.ts) an der Abwurfstelle.
 */
import type { DragKey, DropKey } from '../../game/drop';
import type { Action, View } from '../../game/types';
import { doAct } from '../../net/dispatch';
import { noteTap } from '../feedback';
import { sfx } from '../sound';
import type { DragAdapter } from '../table/drag';

const HOME = { hand: '#me', mid: '#center' } as const;

const cardAt = (z: 'hand' | 'mid', i: number): string => `${HOME[z]} [data-act="${z}"][data-i="${i}"]`;

function source(el: HTMLElement): { key: DragKey; els: HTMLElement[] } | null {
  const from = el.dataset.drag;
  const i = Number(el.dataset.i);
  if ((from !== 'hand' && from !== 'mid') || !Number.isInteger(i) || !el.closest(HOME[from])) return null;
  return { key: { g: 'schnautz', from, i }, els: [el] };
}

function zone(dst: DropKey): HTMLElement | null {
  if (dst.z !== 'hand' && dst.z !== 'mid') return null;
  return document.querySelector<HTMLElement>(cardAt(dst.z, dst.i));
}

function commit(_v: View, a: Action): void {
  if (a.type !== 'swap') return;
  sfx('card');
  noteTap('swap', [cardAt('hand', a.h), cardAt('mid', a.m)]);
  doAct(a);
}

export const adapter: DragAdapter = { source, zone, commit };

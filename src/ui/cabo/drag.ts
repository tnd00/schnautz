/*
 * Cabo ziehen (ziehen.md 4.1): eigene Plätze, meine gezogene Karte, Ablage und Stapel sind Quelle, fremde Plätze nur
 * Ziel. Lädt mit dem Motor nach (Muster in src/ui/table/drag.ts). Abgeschickt wird wie beim Tippen über send() in
 * ./input.ts, die Flüge starten in ./flights.ts an der Abwurfstelle (dragLanded). Die Vorderseite des Geists folgt
 * dem DOM, also cbSeen: Endet die Einblendung mitten im Ziehen, zeichnet der Zeitgeber neu und der Geist dreht sich.
 */
import type { DragKey, DropKey } from '../../game/drop';
import { unreachable } from '../../game/games';
import type { Action, Card, View } from '../../game/types';
import { App } from '../app';
import { carouselNudge } from '../carousel';
import { cbRole, cbSeen } from '../render/cabo';
import type { DragAdapter } from '../table/drag';
import { cbDragSend } from './input';

const mineEl = (id: number): HTMLElement | null =>
  document.querySelector<HTMLElement>(`#me .cbslot[data-drag="slot"][data-sid="${Number(id)}"]`);

function source(el: HTMLElement): { key: DragKey; els: HTMLElement[] } | null {
  const from = el.dataset.drag;
  if (!el.closest('#center') && (from === 'hold' || from === 'pile' || from === 'deck')) return null;
  // Die gezogene Karte kennt die Auswahl: Landet sie auf einem gewählten Platz, tauscht sie alle gewählten
  if (from === 'hold')
    return { key: App.cs.ids.length ? { g: 'cabo', from, sel: App.cs.ids.slice() } : { g: 'cabo', from }, els: [el] };
  if (from === 'pile' || from === 'deck') return { key: { g: 'cabo', from }, els: [el] };
  const id = Number(el.dataset.sid);
  if (from !== 'slot' || !Number.isInteger(id) || !el.closest('#me')) return null;
  // Eine gewählte Karte nimmt alle gewählten mit, eine andere zieht allein und die Auswahl bleibt
  const ids = App.cs.ids.includes(id) ? App.cs.ids.slice() : [id];
  const els = ids.map(mineEl).filter((x): x is HTMLElement => !!x);
  return els.length === ids.length ? { key: { g: 'cabo', from: 'slot', ids }, els } : null;
}

function zone(dst: DropKey): HTMLElement | null {
  switch (dst.z) {
    case 'pile':
    case 'hold':
      return document.querySelector<HTMLElement>(`#center [data-drop="${dst.z}"]`);
    case 'slot':
      return document.querySelector<HTMLElement>(
        `#table .cbslot[data-drop="slot"][data-o="${CSS.escape(dst.owner)}"][data-sid="${Number(dst.id)}"]`,
      );
    default:
      return null;
  }
}

/** Vorderseite für die Ansage: offen liegend oder gerade eingeblendet, sonst Rücken */
function face(key: DragKey, v: View): Card | null {
  const C = v.cb;
  if (key.g !== 'cabo' || !C) return null;
  switch (key.from) {
    case 'slot': {
      if (key.ids.length !== 1) return null;
      const s = C.P[App.me]?.find((x) => x.id === key.ids[0]);
      return s?.c ?? (s ? cbSeen(App.me, s.id) : null);
    }
    case 'hold':
      return C.hold?.by === App.me ? (C.hold.c ?? null) : null;
    case 'pile':
      return C.pile.at(-1) ?? null;
    case 'deck':
      return null;
    default:
      return unreachable(key);
  }
}

/** Blindtausch im Karussell: Finger ruht im linken oder rechten Drittel von #opps, dann einen Platz weiter */
function rest(x: number, y: number, v: View): void {
  if (cbRole(v) !== 'blind') return;
  const r = document.getElementById('opps')?.getBoundingClientRect();
  if (!r || y < r.top || y > r.bottom || x < r.left || x > r.right) return;
  const third = r.width / 3;
  if (x < r.left + third) carouselNudge(-1);
  else if (x > r.right - third) carouselNudge(1);
}

function commit(_v: View, a: Action): void {
  cbDragSend(a);
}

export const adapter: DragAdapter = { source, zone, commit, face, rest };

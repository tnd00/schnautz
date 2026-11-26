/*
 * Ziehen als reine Regel (Plan 2.8, ziehen.md 5.2). Was eine gezogene Quelle ist, wohin sie darf und welche Aktion ein
 * Abwurf bedeutet. Ohne DOM und ohne Texte: Das Etikett am Geist ist ein Code mit Argumenten (`DropSay`), den Satz baut
 * src/content/texts/drag.ts, eine Ablehnung ist ein Code aus src/game/reject.ts. Jedes Spiel hat seine Regeln in
 * src/game/drop/<spiel>.ts, hier stehen nur die Schlüssel und die Weiche nach Spiel.
 *
 * Stand Runde 1: Vertrag mit Stummeln, nichts ist ziehbar. Runde 2 (Ziehen-Kern) baut den Regelrahmen, Runde 5 die
 * Regeln je Spiel.
 */
import { cbCanDrag, cbDropOf, cbDropsFor } from './drop/cabo';
import { dkCanDrag, dkDropOf, dkDropsFor } from './drop/durak';
import { szCanDrag, szDropOf, szDropsFor } from './drop/schnautz';
import { shCanDrag, shDropOf, shDropsFor } from './drop/shithead';
import { unreachable } from './games';
import { rj, type Reject, type RejectArgs } from './reject';
import type { Action, Card, View } from './types';

/**
 * Was gezogen wird, mit stabilen Schlüsseln statt Indizes, wo sich die Lage verschieben kann. Karten laufen per Wert
 * (aus Deck 2 mit `:2`), Cabo-Plätze per Platz-ID, Schnautz per festem Platz in Hand und Mitte.
 */
export type DragKey =
  /** Shithead: eine Handkarte oder offene Tischkarte, mehrere nur mit gleichem Wert (auch in der Tauschrunde) */
  | { g: 'shithead'; from: 'hand' | 'up'; cards: Card[] }
  /** Shithead: verdeckte Tischkarte, immer einzeln */
  | { g: 'shithead'; from: 'down'; i: number }
  /** Durak: eine Handkarte oder ein Bündel gleicher Werte */
  | { g: 'durak'; cards: Card[] }
  /** Cabo: eigene Plätze, bei Auswahl alle gewählten */
  | { g: 'cabo'; from: 'slot'; ids: number[] }
  /** Cabo: meine gezogene Karte, die Ablage oder der Stapel */
  | { g: 'cabo'; from: 'hold' | 'pile' | 'deck' }
  /** Schnautz: Handkarte oder Mittelkarte */
  | { g: 'schnautz'; from: 'hand' | 'mid'; i: number };

/** Wohin ein Abwurf geht. `z` steht als `data-drop` am Ziel. */
export type DropKey =
  /** Shithead-Stapel, Cabo-Ablage */
  | { z: 'pile' }
  /** Shithead in der Tauschrunde: offene Tischkarte */
  | { z: 'up'; i: number }
  /** Shithead in der Tauschrunde und Schnautz: Handkarte */
  | { z: 'hand'; i: number }
  /** Durak: freie Tischfläche zum Angreifen und Nachlegen */
  | { z: 'table' }
  /** Durak: offene Angriffskarte zum Schlagen */
  | { z: 'pair'; i: number }
  /** Durak: Schiebefeld an den Nächsten */
  | { z: 'transfer' }
  /** Cabo: Feld „gezogen“ */
  | { z: 'hold' }
  /** Cabo: eigener oder fremder Platz */
  | { z: 'slot'; owner: string; id: number }
  /** Schnautz: Mittelkarte */
  | { z: 'mid'; i: number };

/** Codes fürs Etikett am Geist. Neue Codes kommen nur hier dazu, die Sätze stehen in src/content/texts/drag.ts. */
export const DROP_SAY_CODES = [
  // Shithead
  'sh.play',
  'sh.swap',
  // Durak
  'dk.attack',
  'dk.throw',
  'dk.beat',
  'dk.transfer',
  // Cabo
  'cb.snap',
  'cb.swap',
  'cb.discard',
  'cb.take',
  'cb.takeSwap',
  'cb.draw',
  'cb.blind',
  // Schnautz
  'sz.swap',
] as const;

export type DropSayCode = (typeof DROP_SAY_CODES)[number];

/** Etikett am Geist: Code mit flachen Argumenten wie bei Ablehnungen (Zahl, Karte, Platz-ID) */
export type DropSay = { k: DropSayCode; a?: RejectArgs };

/** Was ein Abwurf bedeutet: eine Aktion mit Etikett oder eine Ablehnung mit Code */
export type DropResult = { ok: true; a: Action; say: DropSay } | { ok: false; r: Reject };

/** Darf `me` diese Quelle gerade anfassen? Quelle und Ansicht müssen zum selben Spiel gehören. */
export function canDrag(v: View, me: string, src: DragKey): boolean {
  if (v.game !== src.g) return false;
  switch (src.g) {
    case 'shithead':
      return shCanDrag(v, me, src);
    case 'durak':
      return dkCanDrag(v, me, src);
    case 'cabo':
      return cbCanDrag(v, me, src);
    case 'schnautz':
      return szCanDrag(v, me, src);
    default:
      return unreachable(src);
  }
}

/** Was ein Abwurf von `src` auf `dst` bedeutet. */
export function dropOf(v: View, me: string, src: DragKey, dst: DropKey): DropResult {
  if (v.game !== src.g) return { ok: false, r: rj('any.unknown') };
  switch (src.g) {
    case 'shithead':
      return shDropOf(v, me, src, dst);
    case 'durak':
      return dkDropOf(v, me, src, dst);
    case 'cabo':
      return cbDropOf(v, me, src, dst);
    case 'schnautz':
      return szDropOf(v, me, src, dst);
    default:
      return unreachable(src);
  }
}

/** Alle Ziele, für die `dropOf` ok liefert, zum Hervorheben. */
export function dropsFor(v: View, me: string, src: DragKey): DropKey[] {
  if (v.game !== src.g) return [];
  switch (src.g) {
    case 'shithead':
      return shDropsFor(v, me, src);
    case 'durak':
      return dkDropsFor(v, me, src);
    case 'cabo':
      return cbDropsFor(v, me, src);
    case 'schnautz':
      return szDropsFor(v, me, src);
    default:
      return unreachable(src);
  }
}

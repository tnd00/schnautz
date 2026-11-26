/*
 * Gemeinsames Zeichnen des Tisches (Plan 2.8 Abschnitt 8, geruest.md 3.3): Fokus halten, Teile schreiben, Karussell,
 * Uhren und Würfe nachziehen, Status an den Vorleser. Ein `OldTable` zeichnet wie heute selbst.
 *
 * Stummel aus Runde 1: `renderTable` ruft nur das alte Zeichnen, eingebunden ist es noch nicht. Runde 2 (Gerüst) baut
 * den gemeinsamen Ablauf und hängt ihn in render() ein.
 */
import type { View } from '../../game/types';
import { App } from '../app';
import { SEQ } from '../shithead/sequence';
import { isOld, specOf } from './spec';

/** Teile des Tisches, die einzeln neu gezeichnet werden können */
export type Part = 'opps' | 'center' | 'status' | 'me';

export interface RenderOpts {
  /** Standard alle vier */
  parts?: readonly Part[];
  /** Ansicht für Gegner, Status und Kopf während einer Sequenz (Kino 36). Standard v */
  hold?: View;
}

/** Zeichnet den Tisch. Heute für jedes Spiel wie bisher über dessen eigenes Zeichnen. */
export function renderTable(v: View, _o?: RenderOpts): void {
  const spec = specOf(v.game);
  if (isOld(spec)) spec.old.draw(v);
}

/**
 * Läuft am Tisch gerade etwas, das Eingaben wie Ziehen nicht stören dürfen? Heute Sperre nach einem Zug und
 * Shithead-Ablauf. Runde 2 nimmt Zeremonie und offene Fenster dazu.
 */
export function tableBusy(): boolean {
  return App.busy || SEQ.busy;
}

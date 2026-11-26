/*
 * Motor fürs Ziehen am Tisch (Plan 2.8 Abschnitt 8, ziehen.md 5.2 und 5.3): Zeiger, Geist, Markierungen, Ansagen,
 * Abbruch und Zurückfliegen für alle vier Spiele. Die Regeln stehen rein in src/game/drop.ts, jedes Spiel liefert nur
 * einen Adapter über `specOf(game).drag`.
 *
 * Stummel aus Runde 1: im Fundament abgeschaltet, alle Funktionen tun nichts. Runde 2 (Ziehen-Kern) baut den Motor.
 */
import type { DragKey, DropKey } from '../../game/drop';
import type { Reject } from '../../game/reject';
import type { Action, Card, View } from '../../game/types';

/** Was ein Spiel dem Motor liefert, in src/ui/<spiel>/drag.ts */
export interface DragAdapter {
  /** Element unter dem Finger als Quelle samt Elementen des Bündels, sonst null (dann bleibt es ein Tipp) */
  source(el: HTMLElement, v: View): { key: DragKey; els: HTMLElement[] } | null;
  /** Zielelement im aktuellen DOM */
  zone(dst: DropKey): HTMLElement | null;
  /** Gültiger Abwurf: über die vorhandene send() des Spiels schicken */
  commit(v: View, a: Action): void;
  /** Vorderseite oder Rücken des Geists nach dem aktuellen Stand (Cabo-Einblendung) */
  face?(key: DragKey, v: View): Card | null;
}

/** Einmal beim Start: Zeiger am Tisch anhängen, der Adapter kommt aus specOf(game).drag. */
export function initDrag(): void {
  // Stummel, Runde 2
}

/** Am Ende von renderTable: Quelle wiederfinden, Ziele neu messen, Markierungen setzen oder abbrechen. */
export function dragRefresh(_v: View): void {
  // Stummel, Runde 2
}

/** Laufendes Ziehen abbrechen, die Karte fliegt zurück. Bei 'reject' nennt `r` den Grund am Ziel. */
export function dragCancel(_why: 'cancel' | 'view' | 'reject', _r?: Reject): void {
  // Stummel, Runde 2
}

/** Für die Flüge: Startstelle eigener Karten nach einem Abwurf, bis die passende Ansicht kommt. */
export function dragLanded(): DOMRect[] | null {
  return null;
}

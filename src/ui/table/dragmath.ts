/*
 * Rechnen fürs Ziehen ohne DOM (Plan 2.8, ziehen.md 5.4): Schwelle je Zeigerart, Treffer unter der Fingerspitze mit
 * Fangradius, Versatz des Geists. Die Werte stehen im Plan fest.
 *
 * Stummel aus Runde 1: Werte und Formen, `hitTest` trifft noch nichts. Runde 2 (Ziehen-Kern) baut und testet es.
 */

export type PointerKind = 'touch' | 'pen' | 'mouse';

/** Weg in px, ab dem aus einem Tipp ein Ziehen wird. Keine Haltezeit, weil der Tisch nicht scrollt. */
export const DRAG_SLOP: Readonly<Record<PointerKind, number>> = { touch: 8, pen: 6, mouse: 4 };

/** Geist über der Fingerspitze in Kartenhöhen. Der Stift hat den halben Versatz, die Maus behält den Griffpunkt. */
export const GHOST_LIFT: Readonly<Record<PointerKind, number>> = { touch: 0.35, pen: 0.175, mouse: 0 };

/** Fangradius ist max(10 px, 0,15 Kartenbreiten). Die Cabo-Ablage beim Schnappen hat keinen. */
export const CATCH_MIN_PX = 10;
export const CATCH_CARD_W = 0.15;

/** Rechteck wie DOMRect, damit die Tests ohne DOM laufen */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Zeigerart aus PointerEvent.pointerType, Unbekanntes gilt als Finger */
export const pointerKind = (t: string): PointerKind => (t === 'pen' || t === 'mouse' ? t : 'touch');

/** Fangradius in px zur Kartenbreite */
export const catchRadius = (cardW: number): number => Math.max(CATCH_MIN_PX, CATCH_CARD_W * cardW);

/** Index des Ziels unter (x, y) samt Fangradius `pad`, bei zweien das nähere, sonst -1. Stummel, Runde 2. */
export function hitTest(_x: number, _y: number, _boxes: readonly Box[], _pad: number): number {
  return -1;
}

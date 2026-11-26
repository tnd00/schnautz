/*
 * Rechnen fürs Ziehen ohne DOM (Plan 2.8, ziehen.md 5.4): Schwelle je Zeigerart, Treffer unter der Fingerspitze mit
 * Fangradius, Versatz des Geists. Die Werte stehen im Plan fest.
 *
 * Getestet in tests/unit/dragmath.test.ts.
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

/** Hat der Zeiger den Weg für ein Ziehen zurückgelegt? Genau die Schwelle zählt schon. */
export const pastSlop = (kind: PointerKind, dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_SLOP[kind];

/** Abstand eines Punkts zum Rechteck, 0 innen */
const gap = (x: number, y: number, b: Box): number =>
  Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));

/** Abstand zur Mitte, entscheidet zwischen zwei Zielen, in denen der Punkt gleich tief liegt */
const mid = (x: number, y: number, b: Box): number =>
  Math.hypot((b.left + b.right) / 2 - x, (b.top + b.bottom) / 2 - y);

/**
 * Index des Ziels unter (x, y) samt Fangradius `pad` (einer für alle oder einer je Ziel), sonst -1. Liegen mehrere
 * im Radius, gewinnt das nähere, bei gleichem Abstand (etwa beide unter dem Punkt) das mit der näheren Mitte.
 */
export function hitTest(x: number, y: number, boxes: readonly Box[], pad: number | readonly number[]): number {
  let best = -1;
  let bestGap = Infinity;
  let bestMid = Infinity;
  boxes.forEach((b, i) => {
    const g = gap(x, y, b);
    if (g > (typeof pad === 'number' ? pad : (pad[i] ?? 0))) return;
    const m = mid(x, y, b);
    if (g < bestGap || (g === bestGap && m < bestMid)) [best, bestGap, bestMid] = [i, g, m];
  });
  return best;
}

/**
 * Linke obere Ecke des Geists: Er behält den Griffpunkt (`dx`, `dy` ab der Ecke der Karte) und sitzt beim Finger um
 * 0,35 Kartenhöhen höher, beim Stift um die Hälfte davon.
 */
export const ghostAt = (
  kind: PointerKind,
  x: number,
  y: number,
  dx: number,
  dy: number,
  h: number,
): { x: number; y: number } => ({ x: x - dx, y: y - dy - GHOST_LIFT[kind] * h });

/** Anteil, um den der Geist über einem gültigen Ziel zu dessen Mitte rückt (Einrasten als Vorschau) */
export const SNAP_PULL = 0.3;

/** Punkt `k` Anteile auf dem Weg von a nach b */
export const towards = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  k: number,
): { x: number; y: number } => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});

/** Höchste Neigung des Geists in Grad (DESIGN.md: höchstens 3 Grad im Rahmen) */
export const MAX_TILT = 3;

/** Neigung zur seitlichen Geschwindigkeit in px je Frame, geglättet gegen die vorige. In Ruhe richtet er sich auf. */
export function tiltOf(prev: number, vx: number): number {
  const want = Math.max(-MAX_TILT, Math.min(MAX_TILT, vx * 0.4));
  const t = prev * 0.75 + want * 0.25;
  return Math.abs(t) < 0.05 ? 0 : t;
}

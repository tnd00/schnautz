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

/** Ein Ziel beim Ziehen: angezeigtes Rechteck, gültig oder nicht, Fangradius (0 fängt nicht daneben) */
export interface Target {
  box: Box;
  ok: boolean;
  pad: number;
}

/** Um so viele eigene Höhen wächst eine Fläche nach oben und unten, wenn es mehrere Ziele gibt */
export const REACH_LONG = 0.5;

const meets = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const holds = (a: Box, b: Box): boolean =>
  a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
const union = (a: Box, b: Box): Box => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});
const cut = (a: Box, b: Box): Box => ({
  left: Math.max(a.left, b.left),
  top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom),
});
const grow = (b: Box, x: number, y: number): Box => ({
  left: b.left - x,
  top: b.top - y,
  right: b.right + x,
  bottom: b.bottom + y,
});
const inBox = (x: number, y: number, b: Box): boolean => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
const cx = (b: Box): number => (b.left + b.right) / 2;
const cy = (b: Box): number => (b.top + b.bottom) / 2;

/** Fläche `r` des Ziels `b` endet vor dem Nachbarn `o`, der ganz auf einer Seite liegt (freie Richtung) */
function stopAt(r: Box, b: Box, o: Box): Box {
  if (!meets(r, o) || meets(b, o) || holds(o, b)) return r;
  if (o.top >= b.bottom) return { ...r, bottom: Math.min(r.bottom, o.top) };
  if (o.bottom <= b.top) return { ...r, top: Math.max(r.top, o.bottom) };
  if (o.left >= b.right) return { ...r, right: Math.min(r.right, o.left) };
  return { ...r, left: Math.max(r.left, o.right) };
}

/** Zwei gültige Flächen überlappen: Schnitt in der Mitte zwischen ihnen, auf der Achse, auf der sie weiter auseinander liegen */
function split(ra: Box, rb: Box, a: Box, b: Box): [Box, Box] {
  if (!meets(ra, rb)) return [ra, rb];
  const flip = Math.abs(cx(a) - cx(b)) >= Math.abs(cy(a) - cy(b));
  const [lo, hi, s] = flip ? (['left', 'right', cx] as const) : (['top', 'bottom', cy] as const);
  const [p, q, rp, rq] = s(a) <= s(b) ? [a, b, ra, rb] : [b, a, rb, ra];
  // Lücke zwischen den angezeigten Rechtecken halbieren, überlappen sie (Fächer), die Mitten
  const m = p[hi] <= q[lo] ? (p[hi] + q[lo]) / 2 : (s(p) + s(q)) / 2;
  const np = { ...rp, [hi]: Math.min(rp[hi], m) };
  const nq = { ...rq, [lo]: Math.max(rq[lo], m) };
  return s(a) <= s(b) ? [np, nq] : [nq, np];
}

/**
 * Angenommene Flächen zu den angezeigten (Punkt 28 der Abnahme 1). Das Leuchten bleibt am Ziel, angenommen wird
 * großzügiger: Gibt es nur ein Ziel mit Fangradius und liegt es in `area` (Tischmitte), zählt die ganze `area`. Bei
 * mehreren wachsen die Flächen nach oben und unten statt in die Breite, nur bis vor Nachbarn und die eigene Quelle
 * (`home`), in der Tischmitte nicht über sie hinaus, und überlappen nie. Ungültige behalten den Fangradius.
 */
export function reachOf(ts: readonly Target[], area: Box | null, home: readonly Box[] = []): Box[] {
  const live = ts.filter((t) => t.ok && t.pad > 0).length;
  const out = ts.map((t) => {
    const near = grow(t.box, t.pad, t.pad);
    if (!t.ok || !t.pad) return near;
    const mid = area && meets(t.box, area) ? area : null;
    if (mid && live === 1) return union(near, mid);
    let r = grow(t.box, t.pad, Math.max(t.pad, REACH_LONG * (t.box.bottom - t.box.top)));
    if (mid) r = cut(r, union(near, mid));
    for (const o of ts) if (o !== t && !holds(o.box, t.box) && !holds(t.box, o.box)) r = stopAt(r, t.box, o.box);
    for (const o of home) r = stopAt(r, t.box, o);
    return r;
  });
  for (let i = 0; i < ts.length; i++)
    for (let j = i + 1; j < ts.length; j++)
      if (ts[i].ok && ts[j].ok && ts[i].pad && ts[j].pad)
        [out[i], out[j]] = split(out[i], out[j], ts[i].box, ts[j].box);
  return out;
}

/**
 * Ziel unter (x, y) zu den Flächen aus reachOf, sonst -1, in dieser Reihenfolge: über der eigenen Quelle -1, außer ein
 * gültiges Ziel liegt direkt darunter. Dann gültige Ziele samt Fangradius, dann ungültige direkt unter dem Finger, die
 * kein gültiges umschließen (eine Angriffskarte, die man nicht schlägt, nennt ihren Grund). Dann die großzügigen
 * Flächen der gültigen, zuletzt die übrigen ungültigen wie hitTest. Unter mehreren gültigen gewinnt die nähere Mitte.
 */
export function hitReach(
  x: number,
  y: number,
  ts: readonly Target[],
  reach: readonly Box[],
  home: readonly Box[] = [],
): number {
  const near = ts.map((t) => grow(t.box, t.pad, t.pad));
  if (home.some((b) => inBox(x, y, b)) && !ts.some((t, i) => t.ok && inBox(x, y, near[i]))) return -1;
  const ok = (rs: readonly Box[]): number => {
    let best = -1;
    let bestMid = Infinity;
    ts.forEach((t, i) => {
      const m = Math.hypot(cx(t.box) - x, cy(t.box) - y);
      if (t.ok && inBox(x, y, rs[i]) && m < bestMid) [best, bestMid] = [i, m];
    });
    return best;
  };
  const direct = ok(near);
  if (direct >= 0) return direct;
  const own = ts.findIndex((t) => !t.ok && inBox(x, y, t.box) && !ts.some((o) => o.ok && holds(t.box, o.box)));
  if (own >= 0) return own;
  const wide = ok(reach);
  if (wide >= 0) return wide;
  const no = ts.flatMap((t, i) => (t.ok ? [] : [i]));
  const k = hitTest(
    x,
    y,
    no.map((i) => ts[i].box),
    no.map((i) => ts[i].pad),
  );
  return k < 0 ? -1 : no[k];
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

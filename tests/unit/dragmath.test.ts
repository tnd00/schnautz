/*
 * Rechnen fürs Ziehen (src/ui/table/dragmath.ts, ziehen.md 5.4 und 7), ohne DOM: Schwelle je Zeigerart, Treffer mit
 * Fangradius, das nähere von zwei Zielen, kein Fangradius an der Cabo-Ablage, angenommene Flächen größer als die
 * angezeigten (Abnahme 1 Punkt 28), Lage und Neigung des Geists.
 */
import { describe, expect, it } from 'vitest';
import {
  catchRadius,
  DRAG_SLOP,
  ghostAt,
  hitReach,
  hitTest,
  MAX_TILT,
  pastSlop,
  pointerKind,
  reachOf,
  tiltOf,
  towards,
  type Box,
  type Target,
} from '../../src/ui/table/dragmath';

const box = (left: number, top: number, w = 60, h = 84): Box => ({ left, top, right: left + w, bottom: top + h });

describe('Schwelle', () => {
  it('Finger 8 px, Stift 6 px, Maus 4 px, nur über den Weg', () => {
    expect(DRAG_SLOP).toEqual({ touch: 8, pen: 6, mouse: 4 });
    expect(pastSlop('touch', 7.9, 0)).toBe(false);
    expect(pastSlop('touch', 0, 8)).toBe(true);
    expect(pastSlop('pen', 3, 4)).toBe(false);
    expect(pastSlop('pen', 6, 0)).toBe(true);
    expect(pastSlop('mouse', 3, 0)).toBe(false);
    expect(pastSlop('mouse', -4, 0)).toBe(true);
  });

  it('Zeigerart, Unbekanntes gilt als Finger', () => {
    expect(pointerKind('mouse')).toBe('mouse');
    expect(pointerKind('pen')).toBe('pen');
    expect(pointerKind('touch')).toBe('touch');
    expect(pointerKind('')).toBe('touch');
  });
});

describe('Treffer', () => {
  it('Fangradius ist max(10 px, 0,15 Kartenbreiten)', () => {
    expect(catchRadius(40)).toBe(10);
    expect(catchRadius(100)).toBe(15);
  });

  it('innen trifft, knapp daneben nur im Radius', () => {
    const b = [box(100, 100)];
    expect(hitTest(130, 140, b, 0)).toBe(0);
    expect(hitTest(165, 140, b, 10)).toBe(0);
    expect(hitTest(171, 140, b, 10)).toBe(-1);
    expect(hitTest(165, 140, b, 0)).toBe(-1);
    expect(hitTest(130, 140, [], 10)).toBe(-1);
  });

  it('von zwei Zielen im Radius gewinnt das nähere', () => {
    const b = [box(0, 0), box(80, 0)];
    expect(hitTest(66, 40, b, 15)).toBe(0);
    expect(hitTest(76, 40, b, 15)).toBe(1);
  });

  it('liegt der Punkt in zweien, gewinnt die nähere Mitte', () => {
    const b = [box(0, 0, 100, 100), box(50, 50, 40, 40)];
    expect(hitTest(70, 70, b, 10)).toBe(1);
    expect(hitTest(20, 20, b, 10)).toBe(0);
  });

  it('Radius je Ziel: die Cabo-Ablage beim Schnappen fängt nicht daneben', () => {
    const b = [box(0, 0), box(200, 0)];
    expect(hitTest(65, 40, b, [0, 15])).toBe(-1);
    expect(hitTest(195, 40, b, [0, 15])).toBe(1);
    expect(hitTest(30, 40, b, [0, 15])).toBe(0);
  });
});

describe('Angenommene Flächen', () => {
  const t = (b: Box, ok = true, pad = 10): Target => ({ box: b, ok, pad });
  const center = box(0, 200, 390, 160);
  const hit = (x: number, y: number, ts: Target[], home: Box[] = []): number =>
    hitReach(x, y, ts, reachOf(ts, center, home), home);

  it('ein Ziel in der Tischmitte: die ganze Mitte zählt, die Quelle nicht', () => {
    const pile = box(160, 230);
    const home = [box(150, 600)];
    // Ziehstapel und Verbrannt sind in Shithead keine Ziele
    const ts = [t(pile), t(box(0, 600, 60, 84), false)];
    expect(reachOf(ts, center, home)[0]).toEqual({ left: 0, top: 200, right: 390, bottom: 360 });
    // über Ziehstapel und Verbrannt hinweg
    expect(hit(60, 260, ts, home)).toBe(0);
    expect(hit(380, 350, ts, home)).toBe(0);
    expect(hit(195, 400, ts, home)).toBe(-1);
    expect(hit(180, 640, ts, home)).toBe(-1);
  });

  it('die Cabo-Ablage beim Schnappen wächst nicht', () => {
    const ts = [t(box(160, 230), true, 0)];
    expect(reachOf(ts, center)[0]).toEqual(box(160, 230));
    expect(hit(150, 260, ts)).toBe(-1);
  });

  it('mehrere Ziele: länger statt breiter, in der Mitte nicht über sie hinaus', () => {
    const a = box(100, 240);
    const b = box(170, 240);
    const [ra, rb] = reachOf([t(a), t(b)], center);
    // 0,5 Höhen nach oben und unten, bis an den Rand der Mitte
    expect(ra.top).toBe(200);
    expect(ra.bottom).toBe(360);
    // Seitlich nur bis zur Mitte der Lücke, nie überlappend
    expect(ra.left).toBe(90);
    expect(ra.right).toBe(165);
    expect(rb.left).toBe(165);
    expect(rb.right).toBe(240);
    expect(hit(164, 210, [t(a), t(b)])).toBe(0);
    expect(hit(166, 350, [t(a), t(b)])).toBe(1);
  });

  it('außerhalb der Mitte wächst eine Fläche nur in die freie Richtung', () => {
    const up = box(100, 500);
    const other = box(100, 600, 60, 84);
    const [r] = reachOf([t(up), t(other, false)], center, [box(200, 600)]);
    expect(r.top).toBe(500 - 42);
    expect(r.bottom).toBe(600);
  });

  it('überlappende Ziele (Fächer) teilen an der Mitte, gültige vor ungültigen, eigene Quelle bricht ab', () => {
    const a = box(100, 600);
    const b = box(130, 600);
    const [ra, rb] = reachOf([t(a), t(b)], center);
    expect(ra.right).toBe(145);
    expect(rb.left).toBe(145);
    // Durak mit zwei offenen Angriffen: die Tischfläche drumherum nennt nur den Grund
    const ts = [t(box(100, 240)), t(box(170, 240)), t(box(0, 200, 390, 160), false)];
    expect(hit(110, 260, ts)).toBe(0);
    expect(hit(300, 330, ts)).toBe(2);
    const home = [box(250, 240)];
    expect(hit(270, 260, ts, home)).toBe(-1);
  });

  it('eine ungültige Karte unter dem Finger nennt ihren Grund, auch wenn die Mitte sonst annimmt', () => {
    // Durak: Karo König schlägt Kreuz Sechs nicht, aber Karo Sechs daneben
    const ts = [t(box(100, 240), false), t(box(170, 240)), t(box(0, 200, 390, 160), false)];
    expect(reachOf(ts, center)[1]).toEqual({ left: 0, top: 200, right: 390, bottom: 360 });
    expect(hit(130, 280, ts)).toBe(0);
    expect(hit(30, 330, ts)).toBe(1);
    expect(hit(165, 280, ts)).toBe(1);
  });
});

describe('Geist', () => {
  it('behält den Griffpunkt, beim Finger 0,35 Kartenhöhen höher, beim Stift die Hälfte', () => {
    expect(ghostAt('mouse', 100, 200, 20, 30, 100)).toEqual({ x: 80, y: 170 });
    expect(ghostAt('touch', 100, 200, 20, 30, 100)).toEqual({ x: 80, y: 135 });
    expect(ghostAt('pen', 100, 200, 20, 30, 100).y).toBeCloseTo(152.5);
  });

  it('rückt zur Zielmitte', () => {
    expect(towards({ x: 0, y: 0 }, { x: 10, y: -20 }, 0.3)).toEqual({ x: 3, y: -6 });
  });

  it('neigt sich höchstens 3 Grad und richtet sich in Ruhe auf', () => {
    let t = 0;
    for (let i = 0; i < 40; i++) t = tiltOf(t, 200);
    expect(t).toBeLessThanOrEqual(MAX_TILT);
    expect(t).toBeGreaterThan(2.9);
    for (let i = 0; i < 40; i++) t = tiltOf(t, -200);
    expect(t).toBeGreaterThanOrEqual(-MAX_TILT);
    for (let i = 0; i < 60; i++) t = tiltOf(t, 0);
    expect(t).toBe(0);
  });
});

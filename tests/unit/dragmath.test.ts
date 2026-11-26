/*
 * Rechnen fürs Ziehen (src/ui/table/dragmath.ts, ziehen.md 5.4 und 7), ohne DOM: Schwelle je Zeigerart, Treffer mit
 * Fangradius, das nähere von zwei Zielen, kein Fangradius an der Cabo-Ablage, Lage und Neigung des Geists.
 */
import { describe, expect, it } from 'vitest';
import {
  catchRadius,
  DRAG_SLOP,
  ghostAt,
  hitTest,
  MAX_TILT,
  pastSlop,
  pointerKind,
  tiltOf,
  towards,
  type Box,
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

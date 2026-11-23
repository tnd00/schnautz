/*
 * KI-Mitspieler: Die KI bekommt nur die Ansicht, die auch ein Mensch an ihrem Platz hätte (viewFor).
 * Stufen: 'weak' und 'strong' dienen nur zum Kalibrieren, am Tisch spielt 'normal'.
 */
import type { Rng } from '../game/types';

export type BotLevel = 'weak' | 'normal' | 'strong';

export interface BotConfig {
  /** Wahrscheinlichkeit für einen menschlichen Fehler. */
  mistake: number;
  /** Ab diesem Blattwert wird geklopft (plus Rauschen). */
  knockBase: number;
  knockNoise: number;
  /** Bonus für zwei Karten derselben Farbe (Potenzial). */
  pot: number;
  /** Geber behält das erste Blatt ab diesem Wert. */
  keepBase: number;
  keepNoise: number;
  smart: boolean;
  /** Schwache KI macht auch grobe Fehler. */
  sloppy?: boolean;
}

export const BOT_CFG: Readonly<Record<BotLevel, BotConfig>> = {
  weak: { mistake: 0.45, knockBase: 23, knockNoise: 4, pot: 0, keepBase: 17, keepNoise: 5, smart: false, sloppy: true },
  normal: { mistake: 0.2, knockBase: 26, knockNoise: 3, pot: 0.5, keepBase: 20, keepNoise: 2, smart: false },
  strong: { mistake: 0.02, knockBase: 24, knockNoise: 0, pot: 0.8, keepBase: 19, keepNoise: 0, smart: true },
};

export const botRand = (rng?: Rng): number => (rng ? rng() : Math.random());

/** Ganzzahliges Rauschen im Bereich [-n, n]. */
export const botNoise = (rng: Rng | undefined, n: number): number => (n ? Math.round((botRand(rng) * 2 - 1) * n) : 0);

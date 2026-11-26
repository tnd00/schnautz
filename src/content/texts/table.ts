/*
 * Namen und Sätze der Bausteine am Tisch (src/ui/table, src/ui/cards.ts): Kartennamen für den Vorleser, Namen der
 * Gruppen und Zonen. Reiner Text ohne HTML, die Bausteine maskieren ihn.
 */
import type { Rank, Suit } from '../../game/types';

export const SUIT_NAME: Readonly<Record<Suit, string>> = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };

export const RANK_NAME: Readonly<Record<Rank, string>> = {
  2: 'Zwei',
  3: 'Drei',
  4: 'Vier',
  5: 'Fünf',
  6: 'Sechs',
  7: 'Sieben',
  8: 'Acht',
  9: 'Neun',
  10: 'Zehn',
  B: 'Bube',
  D: 'Dame',
  K: 'König',
  A: 'Ass',
};

export const TABLE = {
  /** Liste der Gegnerkacheln */
  opps: 'Leute am Tisch',
  /** Knopfleiste am eigenen Platz */
  bar: 'Aktionen',
  /** Rücken ohne eigenen Namen, aber antippbar */
  back: 'verdeckte Karte',
  /** Anhang am Kartennamen bei Durak */
  trump: ', Trumpf',
  /** Anhang am Kartennamen bei Cabo, nur für offene Karten */
  points: (n: number) => `, ${n} ${n === 1 ? 'Punkt' : 'Punkte'}`,
  /** Name des eigenen Platzes, dahinter der Satz aus dem Modell */
  me: (say: string) => (say ? `Dein Platz. ${say}` : 'Dein Platz'),
  /** Kachel eines Gegners: Name und Satz aus dem Modell */
  seat: (name: string, say: string) => (say ? `${name}, ${say}` : name),
  /** Wurfziel an der Kachel */
  aim: (name: string) => `Auf ${name} werfen`,
  /** Leerer Stapel */
  empty: 'leer',
} as const;

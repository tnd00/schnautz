/*
 * Cabo am gemeinsamen Tisch (Plan 2.8 Runde 4b): Namen, Etiketten und Sätze für Vorleser und Gruppen, die
 * src/ui/render/cabo.ts in die Modelle schreibt. Reiner Text ohne HTML, die Bausteine maskieren ihn.
 */
import { TABLE } from './table';

export const CB_TABLE = {
  /** Punkte dieser Partie, auch sichtbar im Wert am Platz und in der Pille am eigenen Platz */
  points: (n: number): string => `${n} ${n === 1 ? 'Punkt' : 'Punkte'}`,
  /**
   * Satz am Gegnerplatz ohne Namen, etwa „KI, trägt die Krone, 23 Punkte, Cabo gerufen, ist dran“. Krone und
   * Etikett sind bis zur Krönung leer, die Punkte zeigen dann noch den Stand vor der letzten Runde.
   */
  seat: (o: { bot: boolean; crown: boolean; points: number; called: boolean; tag: string }): string =>
    [o.bot && 'KI', o.crown && TABLE.crown, CB_TABLE.points(o.points), o.called && 'Cabo gerufen', o.tag]
      .filter(Boolean)
      .join(', '),
  /** Eigener Platz, etwa „Du bist dran, Cabo gerufen, 12 Punkte“ */
  me: (o: { turn: boolean; called: boolean; points: number }): string =>
    [o.turn && 'Du bist dran', o.called && 'Cabo gerufen', CB_TABLE.points(o.points)].filter(Boolean).join(', '),
  /** Wer diese Runde nicht mitspielt */
  out: 'Du spielst diese Runde nicht mit.',
  /** Gegner ohne Reihe */
  later: 'spielt ab der nächsten Runde mit',
  /** Gruppe der eigenen Reihe */
  row: 'Deine Karten',
  /** Eigene Karte, `i` ab 0 */
  mine: (i: number): string => `Deine ${i + 1}. Karte`,
  /** Fremde Karte, `i` ab 0 */
  theirs: (i: number, name: string): string => `${i + 1}. Karte von ${name}`,
  /** Anhang am Namen einer Karte, die niemand gerade sieht */
  hidden: ', verdeckt',
  /** Fremde gezogene Karte über der Reihe */
  held: 'Gezogene Karte',
  /** Stapel und Ablage, antippbar */
  pile: 'Von der Ablage nehmen',
  discard: 'Ablegen',
  deckCount: 'Karten im Stapel',
  /** Name des Stapels mit der Zahl, die sichtbar darauf steht */
  deckSay: (n: number): string =>
    `Vom Stapel ziehen, ${n ? `${n} ${n === 1 ? 'Karte' : 'Karten'} im Stapel` : TABLE.empty}`,
  /** Tischmitte, dahinter die Zeile über den Stapeln */
  center: (cap: string): string => `Tischmitte, ${cap}`,
  /** Etiketten, die es nur bei Cabo gibt */
  tag: {
    look: 'schaut',
    spy: 'spioniert',
    blind: 'tauscht blind',
    hold: 'überlegt',
    again: 'noch einmal',
    call: '📣 Cabo!',
    king: '👑 Cabo-König',
  },
} as const;

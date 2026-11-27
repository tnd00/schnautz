/*
 * Durak am gemeinsamen Tisch (Plan 2.8 Runde 4b): Etiketten und Sätze für Vorleser und Gruppen, die
 * src/ui/render/durak.ts in die Modelle schreibt. Reiner Text ohne HTML, die Bausteine maskieren ihn.
 */
import { TABLE } from './table';

/** Was ich gerade tue, am Anfang des Satzes zum eigenen Platz */
const DOING = { lead: 'Du greifst an', defend: 'Du verteidigst', throw: 'Du darfst nachlegen' } as const;

export const DK_TABLE = {
  /**
   * Satz am Gegnerplatz ohne Namen, etwa „KI, trägt die Krone, 5 Handkarten, verteidigt“. Mit `hide` (bis zur
   * Enthüllung des Durak) ohne Kartenzahl, denn am Ende hat nur der Durak noch Karten.
   */
  seat: (o: { bot: boolean; reign: string; hand: number; tag: string; hide: boolean }): string =>
    [o.bot ? 'KI' : '', o.reign, o.hide ? '' : TABLE.cards(o.hand), o.tag].filter(Boolean).join(', '),
  /** Amtierender Durak am Platz, für den Vorleser */
  reign: 'amtierender Durak',
  /** Etiketten, die es nur bei Durak gibt */
  tag: { take: 'nimmt auf', def: 'verteidigt', att: 'greift an', passed: 'gepasst ✓', add: 'legt nach?' },
  /** Fächer an der Kachel: Wort unter der Zahl und Hinweis beim Überfahren */
  fan: (n: number): { word: string; title: string } => {
    const word = n === 1 ? 'Karte' : 'Karten';
    return { word, title: `${n} ${word} auf der Hand` };
  },
  /** Kachel ohne Handkarten: fertig oder gerade leer */
  empty: (done: boolean): string => (done ? 'keine Karten mehr' : 'Hand leer'),
  /** Eigener Platz, etwa „Du verteidigst, 6 Handkarten“ */
  me: (o: { doing: keyof typeof DOING | null; place: number; hand: number }): string =>
    [o.doing ? DOING[o.doing] : '', o.place ? TABLE.tag.place(o.place) : '', TABLE.cards(o.hand)]
      .filter(Boolean)
      .join(', '),
  /** Tischmitte mit dem Trumpf */
  center: (suit: string): string => `Tischmitte, Trumpf ${suit}`,
  /** Wer nicht mitspielt */
  out: 'Du spielst diese Partie nicht mit.',
} as const;

/*
 * Shithead am gemeinsamen Tisch (Plan 2.8 Runde 3): Namen und Sätze für Vorleser und Gruppen, die
 * src/ui/render/shithead.ts in die Modelle schreibt. Reiner Text ohne HTML, die Bausteine maskieren ihn.
 */

const cards = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const SH_TABLE = {
  /** Satz am Gegnerplatz ohne Namen, etwa „KI, 5 Handkarten, 3 offen, 3 verdeckt, ist dran“ */
  seat: (o: { bot: boolean; hand: number; up: number; down: number; tag: string }): string =>
    [
      o.bot ? 'KI' : '',
      cards(o.hand, 'Handkarte', 'Handkarten'),
      o.up ? `${o.up} offen` : '',
      o.down ? `${o.down} verdeckt` : '',
      o.tag,
    ]
      .filter(Boolean)
      .join(', '),
  /** Eigener Platz, etwa „Du bist dran, 5 Handkarten, 3 offen, 3 verdeckt“ */
  me: (o: { turn: boolean; place: number; hand: number; up: number; down: number }): string =>
    [
      o.turn ? 'Du bist dran' : '',
      o.place ? `Platz ${o.place}` : '',
      cards(o.hand, 'Handkarte', 'Handkarten'),
      o.up ? `${o.up} offen` : '',
      o.down ? `${o.down} verdeckt` : '',
    ]
      .filter(Boolean)
      .join(', '),
  /** Eigener Platz in der Tauschrunde */
  meSwap: (ready: boolean): string => (ready ? 'Bereit, die anderen tauschen noch' : 'Tauschrunde, du tauschst'),
  /** Gruppe der eigenen Hand */
  hand: (n: number): string => `Deine Hand, ${cards(n, 'Karte', 'Karten')}`,
  /** Verdeckte eigene Tischkarte, wenn sie dran ist */
  down: (i: number): string => `Verdeckte Karte ${i + 1}`,
  /** Tischmitte mit dem Regelhinweis zum Stapel */
  center: (n: number, info: string): string => `Tischmitte, ${cards(n, 'Karte', 'Karten')} auf dem Stapel. ${info}`,
} as const;

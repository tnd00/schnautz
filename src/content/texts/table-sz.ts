/*
 * Schnautz am gemeinsamen Tisch (Plan 2.8 Runde 4b): Etiketten, Plaketten und Sätze für Vorleser und Gruppen, die
 * src/ui/render/schnautz.ts in die Modelle schreibt. Reiner Text ohne HTML, die Bausteine maskieren ihn.
 */
import { TABLE } from './table';

const cards = (n: number): string => `${n} ${n === 1 ? 'Karte' : 'Karten'}`;

export const SZ_TABLE = {
  /** Leben als Wort für Wert, Vorleser und Hinweis */
  lives: (p: { out: boolean; lives: number }): string =>
    p.out ? 'raus' : p.lives === 0 ? 'schwimmt' : `${p.lives} Leben`,
  /** Etiketten an der Kachel, `knock` kurz mit Zeichen wie früher in der Punkteleiste, der Vorleser sagt `knockSay` */
  tag: { turn: TABLE.tag.turn, deal: 'gibt', knock: '✊ geklopft', knockSay: 'hat geklopft' },
  /** Etiketten am eigenen Platz */
  me: { knock: '✊ geklopft', knockSay: 'geklopft', deal: 'du gibst' },
  /**
   * Plakette am Rundenende, damit Sieg und Verlust nicht nur am Rahmen hängen (Zeichen wie im Ergebnisblatt). `say`
   * ist der Klartext für Vorleser und Hinweis.
   */
  plaque: {
    best: { text: '🏅 beste Hand', say: 'beste Hand' },
    life: (n: number) => ({ text: `💔 −${n}`, say: n === 1 ? '1 Leben weg' : `${n} Leben weg` }),
    swim: { text: '🛟 schwimmt', say: 'schwimmt jetzt' },
    out: { text: '🫧 raus', say: 'ist raus' },
  },
  /** Satz am Gegnerplatz ohne Namen, etwa „KI, trägt die Krone, 2 Leben, hat geklopft“ */
  seat: (o: { bot: boolean; crown: boolean; lives: string; tag: string }): string =>
    [o.bot && 'KI', o.crown && TABLE.crown, o.lives, o.tag].filter(Boolean).join(', '),
  /** Eigener Platz, etwa „Du bist dran, 2 Leben, geklopft, Handwert 27“ */
  meSay: (o: { turn: boolean; crown: boolean; lives: string; tag: string; val: string }): string =>
    [o.turn && 'Du bist dran', o.crown && TABLE.crown, o.lives, o.tag, o.val && `Handwert ${o.val}`]
      .filter(Boolean)
      .join(', '),
  /** Beschriftung der Mitte mit der Runde, beim Wählen des Gebers liegt dort das zweite Blatt */
  cap: (round: number, choose: boolean): string => `Runde ${round}${choose ? ' · zweites Blatt' : ''}`,
  /** Gruppe Tischmitte */
  center: (round: number, n: number): string => `Tischmitte, Runde ${round}, ${cards(n)} im Stapel`,
  /** Hinweis am Stapel */
  deck: (n: number): string => `${cards(n)} im Stapel`,
  /** Gruppe der eigenen Hand */
  hand: (n: number): string => `Deine Hand, ${cards(n)}`,
} as const;

/*
 * Texte der Cabo-Statuszeile (cbStatus in src/ui/render/cabo.ts). Die gemeinsamen Formen („Du bist dran.“,
 * „Lena ist dran.“, „Warte auf …“) stehen in status.ts. Namen und Karten kommen schon maskiert aus der Oberfläche.
 */

export const CB_STATUS = {
  peek: 'Karten ansehen',
  peekSub: 'Tippe zwei deiner Karten an. Sie sind nur kurz zu sehen, merk sie dir gut.',
  peekOne: 'Noch eine. Sie ist nur kurz zu sehen, merk sie dir gut.',
  peekGo: 'Gleich geht es los.',
  draw: 'Zieh vom Stapel, nimm die Ablage oder ruf Cabo, wenn du glaubst, du hast am wenigsten.',
  drawNoCards: 'Du hast keine Karten mehr. Zieh vom Stapel und leg ab oder ruf Cabo.',
  last: 'Dein letzter Zug!',
  holdMany: (n: number): string =>
    `Du tauschst ${n} Karten auf einmal ein. Sind sie nicht alle gleich, gibt es eine Strafkarte.`,
  holdPile: 'Tausch sie gegen eine deiner Karten oder mehrere gleiche ein. Sie liegt danach offen.',
  holdPower: (what: string): string =>
    `Tausch sie gegen eine deiner Karten ein oder leg sie ab, dann darfst du ${what}.`,
  holdPlain: 'Tausch sie gegen eine oder mehrere gleiche Karten ein oder leg sie ab.',
  ownpeek: 'Ansehen!',
  ownpeekSub: 'Tippe eine deiner Karten an. Nur du siehst sie.',
  spy: 'Spionieren!',
  spySub: 'Tippe eine Karte von jemand anderem an. Nur du siehst sie.',
  blind: 'Blindtausch!',
  blindSub: 'Wähle eine eigene und eine fremde Karte. Was du bekommst, siehst du nicht.',
  blindReady: 'Alles gewählt. Tippe auf Blind tauschen.',
  again: 'Du bist danach noch einmal dran.',
  noMore: 'Du hast keinen Zug mehr in dieser Runde.',
  snap: 'Tippe die Karte an, die zur Ablage passt. Daneben gibt es eine Strafkarte.',
  nextRound: 'Du spielst ab der nächsten Runde mit.',
  overSub: 'Gleich kommt das Ergebnis.',
} as const;

/** „Du hast eine Dame gezogen.“, der Wert steht an der Karte */
export const cbHeld = (card: string, fromPile: boolean): string =>
  `Du hast ${card} ${fromPile ? 'genommen' : 'gezogen'}.`;

/** Nach dem Cabo-Ruf: Wie viele kommen nach mir noch dran? */
export function cbLastSub(after: number, pile: boolean): string {
  const how = pile ? 'Zieh vom Stapel oder nimm die Ablage' : 'Zieh vom Stapel';
  if (!after) return `${how}, dann wird aufgedeckt.`;
  return `${how}. Danach ${after === 1 ? 'ist noch eine Person' : `sind noch ${after}`} dran.`;
}

/** „Lena darf spionieren.“ */
export const cbOtherPower = (name: string, what: string): string => `${name} darf ${what}.`;
/** „Lena hat die Dame von der Ablage genommen, 12.“ */
export const cbOtherPile = (name: string, card: string, val: string): string =>
  `${name} hat ${card} von der Ablage genommen${val}.`;
export const cbOtherDeck = (name: string): string => `${name} hat vom Stapel gezogen und überlegt.`;

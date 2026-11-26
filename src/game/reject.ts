/*
 * Ablehnungen als Codes (Stufe 2.7 „Klare Worte“). Die Spiellogik sagt nur noch, warum etwas nicht geht, den Text
 * baut der Katalog in src/content/texts. Argumente kommen nur aus dem Host-Zustand: Zahlen, Platz-IDs, eigene oder
 * offene Karten und GameKind. Nie Namen, nie Schlüssel, nie fremde Handkarten, nie Werte aus dem Payload.
 */
import type { Table } from './types';

/** Alle Codes. Neue Codes kommen nur hier dazu, die Tabelle steht in codes-final.md. */
export const REJECT_CODES = [
  // Spielübergreifend
  'any.unknown',
  'any.notSeated',
  'any.noSuchSeat',
  'any.hostOnly',
  'any.lobbyOnly',
  'any.running',
  'any.notStarted',
  'any.over',
  'any.roundOver',
  'any.notYourTurn',
  'any.cardGone',
  'any.pickCard',
  'any.sameRank',
  'any.notPlaying',
  'any.done',
  'any.ready',
  'any.allHere',
  // Plätze
  'seat.tooFew',
  'seat.tooMany',
  'seat.full',
  'seat.fullPlaying',
  'seat.taken',
  // Draht
  'net.oldPage',
  // Gast mit älterem Build (Neulade-Pflicht ab 2.8). Die Vorlage nennt „Lade die Seite neu“, damit Gäste von 2.7
  // die Einladung behalten
  'net.update',
  // Shithead
  'sh.swapOver',
  'sh.swapping',
  'sh.noFour',
  'sh.winClosed',
  'sh.blindOnly',
  'sh.bombWin',
  'sh.bombLate',
  'sh.cutOff',
  'sh.winLock',
  'sh.handFirst',
  'sh.noFit',
  'sh.pileEmpty',
  'sh.blindLast',
  // Durak
  'dk.defending',
  'dk.notLead',
  'dk.rankNotOnTable',
  'dk.passed',
  'dk.passedTake',
  'dk.room',
  'dk.transferOff',
  'dk.notDefender',
  'dk.transferLate',
  'dk.taking',
  'dk.tableEmpty',
  'dk.transferRank',
  'dk.nextShort',
  'dk.pairGone',
  'dk.beaten',
  'dk.noBeat',
  'dk.allBeaten',
  'dk.leadFirst',
  'dk.openCards',
  'dk.noTarget',
  // Cabo
  'cb.peekOver',
  'cb.pickTwo',
  'cb.peeking',
  'cb.drawn',
  'cb.pileNoCards',
  'cb.pileEmpty',
  'cb.deckEmpty',
  'cb.caboLate',
  'cb.called',
  'cb.drawFirst',
  'cb.mustSwap',
  'cb.noPeek',
  'cb.pickOwn',
  'cb.noSpy',
  'cb.pickOther',
  'cb.noBlind',
  'cb.pickPair',
  'cb.pickSwap',
  'cb.snapOff',
  'cb.finishTurn',
  // Schnautz
  'sz.chosen',
  'sz.dealerOnly',
  'sz.choosing',
  'sz.knocked',
  'sz.knockEarly',
  // Tipps
  'bet.closed',
  'bet.notDone',
  'bet.twice',
  'bet.targetDone',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

/** Flache Argumente: Zahlen, Platz-IDs, Kartencodes, GameKind. */
export type RejectArgs = Record<string, string | number>;

export interface Reject {
  e: RejectCode;
  a?: RejectArgs;
}

const CODE_SET: ReadonlySet<string> = new Set(REJECT_CODES);

export const isRejectCode = (s: unknown): s is RejectCode => typeof s === 'string' && CODE_SET.has(s);

/** Ablehnung bauen. Ohne Argumente bleibt `a` weg. */
export const rj = (e: RejectCode, a?: RejectArgs): Reject => (a ? { e, a } : { e });

export const isReject = (x: unknown): x is Reject =>
  !!x && typeof x === 'object' && isRejectCode((x as { e?: unknown }).e);

/** Der Grund aus der Phase. In `play` gibt es keinen, dann entscheidet die aufrufende Stelle. Geht auch auf der View. */
export function phaseReject(t: Table): Reject | null {
  switch (t.phase) {
    case 'lobby':
      return rj('any.notStarted');
    case 'choose': {
      const dealer = t.players[t.dealer]?.id;
      return dealer ? rj('sz.choosing', { p: dealer }) : rj('sz.choosing');
    }
    case 'swap':
      return rj('sh.swapping');
    case 'peek':
      return rj('cb.peeking');
    case 'end':
      return rj('any.roundOver');
    case 'over':
      return rj('any.over');
    case 'play':
      return null;
  }
}

import { strict as assert } from 'node:assert';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import type { Action, ActResult, Card, Rng, SchnautzResult, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { szResult } from '../../src/game/games';
import type { RejectArgs, RejectCode } from '../../src/game/reject';
import type { SeatResult } from '../../src/game/seats';
import { rejectText, type RejectCtx } from '../../src/content/texts';

/** Reproduzierbarer Zufall (LCG), damit fehlschlagende Partien nachspielbar sind. */
export function rngF(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function schnautzResult(st: State): SchnautzResult {
  const r = szResult(st.result);
  assert.ok(r, 'Schnautz-Ergebnis erwartet');
  return r;
}

/** Alle Shithead-Karten (52 je Deck) genau einmal im Spiel? */
export function shCardsOk(st: State): void {
  const S = st.sh;
  assert.ok(S);
  const want = 52 * (S.decks ?? 1);
  const all: Card[] = [...S.deck, ...S.pile, ...S.burned];
  Object.values(S.P).forEach((P) => all.push(...P.hand, ...P.up, ...P.down));
  assert.equal(all.length, want, `Kartenzahl ${all.length}`);
  assert.equal(new Set(all).size, want, 'doppelte Karten');
}

export const action = (a: Action): Action => a;

/** Alle spielen wie die KI, bis die Partie vorbei ist. `stop` bricht vorher ab. */
export function playOut(st: State, rng: Rng, stop?: (st: State) => boolean): void {
  for (let guard = 0; st.phase !== 'over' && guard < 20000; guard++) {
    if (stop?.(st)) return;
    if (st.sh?.win?.lock) act(st, st.host, { type: 'shunlock', id: st.sh.win.id }, rng);
    let moved = false;
    for (const p of st.players) {
      const a = botDecide(viewFor(st, p.id), rng, 'normal');
      if (a && !act(st, p.id, a, rng)) moved = true;
      if (moved && a?.type !== 'ready') break;
    }
    if (!moved) break;
  }
}

/**
 * Text einer Ablehnung, wie ihn die Person sieht. Mit `st` werden Platz-IDs zu Namen, ohne steht die ID. `me` ist der
 * Blickwinkel (eigener Platz heißt „du“), ohne `me` sieht niemand Bestimmtes zu.
 */
export function msgOf(r: ActResult | undefined, st?: State, me = ''): string {
  if (!r) return '';
  const ctx: RejectCtx = { me, name: (id) => (st ? st.players.find((p) => p.id === id)?.name : id) };
  return rejectText(r, ctx);
}

/** Code einer Ablehnung, null bei Erfolg. */
export function codeOf(r: ActResult | undefined): RejectCode | null {
  return r ? r.e : null;
}

/** Text der Ablehnung beim Platzsuchen, null wenn es einen Platz gab. */
export function seatErr(r: SeatResult, st?: State): string | null {
  return 'err' in r ? msgOf(r.err, st) : null;
}

/** Beispielbelegung je Code, nur mit erlaubten Argumentarten (Zahlen, Platz-IDs, Karten, Spiel). */
export const REJECT_SAMPLES: Readonly<Record<RejectCode, RejectArgs | undefined>> = {
  'any.unknown': undefined,
  'any.notSeated': undefined,
  'any.noSuchSeat': undefined,
  'any.hostOnly': undefined,
  'any.lobbyOnly': undefined,
  'any.running': undefined,
  'any.notStarted': undefined,
  'any.over': undefined,
  'any.roundOver': undefined,
  'any.notYourTurn': { p: 'p1' },
  'any.cardGone': undefined,
  'any.pickCard': undefined,
  'any.sameRank': undefined,
  'any.notPlaying': undefined,
  'any.done': undefined,
  'any.ready': undefined,
  'any.allHere': { p: 'p1' },
  'seat.tooFew': { min: 2 },
  'seat.tooMany': { max: 8, g: 'durak' },
  'seat.full': undefined,
  'seat.fullPlaying': undefined,
  'seat.taken': undefined,
  'net.oldPage': { g: 'cabo' },
  'sh.swapOver': undefined,
  'sh.swapping': undefined,
  'sh.noFour': undefined,
  'sh.winClosed': undefined,
  'sh.blindOnly': undefined,
  'sh.bombWin': undefined,
  'sh.bombLate': undefined,
  'sh.cutOff': undefined,
  'sh.winLock': undefined,
  'sh.handFirst': undefined,
  'sh.noFit': { c: 'H7', top: 'SK' },
  'sh.pileEmpty': undefined,
  'sh.blindLast': undefined,
  'dk.defending': undefined,
  'dk.notLead': { p: 'p1' },
  'dk.rankNotOnTable': undefined,
  'dk.passed': undefined,
  'dk.passedTake': undefined,
  'dk.room': { n: 2 },
  'dk.transferOff': undefined,
  'dk.notDefender': { p: 'p1' },
  'dk.transferLate': undefined,
  'dk.taking': undefined,
  'dk.tableEmpty': { p: 'p1' },
  'dk.transferRank': { c: 'S9' },
  'dk.nextShort': { p: 'p1' },
  'dk.pairGone': undefined,
  'dk.beaten': { a: 'S9' },
  'dk.noBeat': { c: 'H7', a: 'S9' },
  'dk.allBeaten': undefined,
  'dk.leadFirst': undefined,
  'dk.openCards': { p: 'p1' },
  'dk.noTarget': undefined,
  'cb.peekOver': undefined,
  'cb.pickTwo': { n: 2 },
  'cb.peeking': undefined,
  'cb.drawn': undefined,
  'cb.pileNoCards': undefined,
  'cb.pileEmpty': undefined,
  'cb.deckEmpty': undefined,
  'cb.caboLate': undefined,
  'cb.called': { p: 'p1' },
  'cb.drawFirst': undefined,
  'cb.mustSwap': undefined,
  'cb.noPeek': undefined,
  'cb.pickOwn': undefined,
  'cb.noSpy': undefined,
  'cb.pickOther': undefined,
  'cb.noBlind': undefined,
  'cb.pickPair': undefined,
  'cb.pickSwap': undefined,
  'cb.snapOff': undefined,
  'cb.finishTurn': undefined,
  'sz.chosen': undefined,
  'sz.dealerOnly': { p: 'p1' },
  'sz.choosing': { p: 'p1' },
  'sz.knocked': { p: 'p1' },
  'sz.knockEarly': undefined,
  'bet.closed': undefined,
  'bet.notDone': undefined,
  'bet.twice': { on: 'p1' },
  'bet.targetDone': { p: 'p1' },
};

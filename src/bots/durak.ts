/*
 * Durak-KI: entscheidet nur aus ihrer Ansicht. Sie greift mit kleinen Karten an, hebt sich Trümpfe auf,
 * schlägt so billig wie möglich und nimmt lieber auf, als früh einen hohen Trumpf zu opfern. Nimmt jemand auf,
 * legt sie gern noch Kleinkram obendrauf. Ab und zu macht sie Fehler wie ein Mensch.
 */
import { dkBeats, rankOf, suitOf } from '../game/cards';
import { SH_ORD } from '../game/constants';
import { dkCount, dkLive, dkOpen, dkRoom, dkTableRanks, dkTransferError, dkTrump } from '../game/durak';
import type { Action, Card, DkPair, Rng, Suit, View } from '../game/types';
import { BOT_CFG, type BotLevel, botRand } from './config';

/** Wert einer Karte für die KI: Trümpfe sind viel mehr wert als alles andere. */
const val = (c: Card, ts: Suit): number => (suitOf(c) === ts ? 20 : 0) + SH_ORD[rankOf(c)];

/**
 * Kann die Hand alle offenen Karten schlagen? Die stärksten Angriffe zuerst, jeweils mit der billigsten Karte.
 * Gibt für jede offene Karte (Tischindex) den Handindex zurück oder null.
 */
export function botDkPlan(hand: Card[], table: DkPair[], ts: Suit): Map<number, number> | null {
  const open = table
    .map((p, i) => ({ p, i }))
    .filter((x) => !x.p.d)
    .sort((x, y) => val(y.p.a, ts) - val(x.p.a, ts));
  const used = new Set<number>();
  const plan = new Map<number, number>();
  for (const { p, i } of open) {
    let best = -1;
    let bv = 999;
    hand.forEach((c, j) => {
      if (used.has(j) || !dkBeats(c, p.a, ts)) return;
      const cv = val(c, ts);
      if (cv < bv) {
        bv = cv;
        best = j;
      }
    });
    if (best < 0) return null;
    used.add(best);
    plan.set(i, best);
  }
  return plan;
}

/** Indizes der Hand, gruppiert nach Wert, ohne Trümpfe zuerst. */
function lowestLead(hand: Card[], ts: Suit, room: number): number[] {
  const order = hand.map((c, i) => ({ c, i })).sort((a, b) => val(a.c, ts) - val(b.c, ts));
  const first = order[0];
  if (!first) return [];
  const r = rankOf(first.c);
  // Kleine Paare gleich mitlegen, Trümpfe nie freiwillig im Doppelpack
  const same = order.filter((x) => rankOf(x.c) === r && suitOf(x.c) !== ts).map((x) => x.i);
  if (same.length > 1 && SH_ORD[r] <= 10) return same.slice(0, Math.max(1, room));
  return [first.i];
}

export function botDurak(v: View, rng?: Rng, lvl: BotLevel = 'normal'): Action | null {
  const D = v.dk;
  if (!D || v.phase !== 'play' || !dkLive(v, v.me)) return null;
  const hand = D.P[v.me];
  if (!Array.isArray(hand) || !hand.length) return null;
  const me = v.me;
  const ts = dkTrump(D);
  const cfg = BOT_CFG[lvl];
  const late = D.deck === 0;

  // Verteidigen
  if (me === D.def) {
    if (D.take || !dkOpen(D).length) return null;
    const plan = botDkPlan(hand, D.table, ts);
    // Weiterschieben, wenn es billig geht und noch nichts geschlagen ist
    if (v.rules.dk?.transfer && !D.table.some((p) => p.d)) {
      const r = rankOf(D.table[0].a);
      const same = hand.map((c, i) => ({ c, i })).filter((x) => rankOf(x.c) === r && suitOf(x.c) !== ts);
      if (same.length && !dkTransferError(v, me, [same[0].c]) && (!plan || botRand(rng) < 0.6))
        return { type: 'dktransfer', idx: [same[0].i] };
    }
    if (!plan) return { type: 'dktake' };
    // Teure Verteidigung früh im Spiel: lieber aufnehmen und die Trümpfe behalten
    const cost = [...plan.values()].reduce((s, j) => s + (suitOf(hand[j]) === ts ? SH_ORD[rankOf(hand[j])] : 0), 0);
    if (!late && D.deck > 8 && cost >= 13 && dkOpen(D).length <= 2 && botRand(rng) < 0.5) return { type: 'dktake' };
    // Ab und zu verschätzt sie sich und nimmt einfach
    if (botRand(rng) < cfg.mistake * 0.1) return { type: 'dktake' };
    const [a, i] = [...plan.entries()][0];
    return { type: 'dkdefend', a, i };
  }

  // Angreifen am leeren Tisch
  if (!D.table.length) {
    if (me !== D.att) return null;
    return { type: 'dkattack', idx: lowestLead(hand, ts, dkRoom(D)) };
  }

  // Nachlegen erst, wenn alles geschlagen ist oder der Verteidiger aufnimmt
  if (!D.take && dkOpen(D).length) return null;
  const room = dkRoom(D);
  const ranks = dkTableRanks(D);
  if (room > 0) {
    // Nimmt jemand auf, darf es auch etwas mehr sein. Gegen Ende wird nichts mehr geschont
    const cap = D.take ? 12 : late ? 15 : 11;
    const cand = hand
      .map((c, i) => ({ c, i }))
      .filter((x) => ranks.has(rankOf(x.c)) && (late || suitOf(x.c) !== ts) && SH_ORD[rankOf(x.c)] <= cap)
      .sort((a, b) => val(a.c, ts) - val(b.c, ts));
    // Hat der Verteidiger kaum noch Karten, lohnt Nachlegen besonders
    const press = dkCount(v, D.def) <= 3 || D.take || late;
    if (cand.length && (press || botRand(rng) < 0.7)) {
      const n = D.take ? Math.min(room, cand.length) : 1;
      return { type: 'dkattack', idx: cand.slice(0, n).map((x) => x.i) };
    }
  }
  return D.done.includes(me) ? null : { type: 'dkpass' };
}

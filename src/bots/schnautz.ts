import { suitOf } from '../game/cards';
import { handValue } from '../game/schnautz';
import { activeList, pIdx } from '../game/state';
import type { Action, Card, Rng, Rules, View } from '../game/types';
import { BOT_CFG, type BotConfig, type BotLevel, botNoise, botRand } from './config';

/** Bewertung einer Hand aus KI-Sicht: Wert plus etwas Bonus für Potenzial in einer Farbe. */
export function botEval(cards: Card[], R: Rules, cfg: BotConfig): number {
  const hv = handValue(cards, R);
  let v = hv.v;
  if (hv.kind === 'normal' && cfg.pot && cards.filter((c) => suitOf(c) === hv.suit).length === 2) v += cfg.pot;
  return v;
}

interface Option {
  a: Action;
  val: number;
  ev: number;
}

export function botSchnautz(v: View, rng: Rng | undefined, lvl: BotLevel = 'normal'): Action | null {
  const cfg = BOT_CFG[lvl];
  const R = v.rules;
  const hand = v.hands[v.me];
  if (!Array.isArray(hand)) return null;
  const pi = pIdx(v, v.me);
  if (v.phase === 'choose') {
    if (v.dealer !== pi) return null;
    const hv0 = handValue(hand, R);
    if (hv0.v >= 21 || hv0.kind === 'feuer') return { type: 'keep' };
    return { type: hv0.v >= cfg.keepBase + botNoise(rng, cfg.keepNoise) ? 'keep' : 'take' };
  }
  if (v.phase !== 'play' || v.turn !== pi) return null;
  const mid = v.middle;
  const cur = handValue(hand, R);
  const active = activeList(v).length;
  const opts: Option[] = [];
  for (let h = 0; h < 3; h++) {
    for (let m = 0; m < 3; m++) {
      const nh = hand.slice();
      nh[h] = mid[m];
      opts.push({ a: { type: 'swap', h, m }, val: handValue(nh, R).v, ev: botEval(nh, R, cfg) });
    }
  }
  opts.push({ a: { type: 'swapAll' }, val: handValue(mid, R).v, ev: botEval(mid, R, cfg) });
  // Sofort gewinnen geht immer vor
  const win = opts.find((o) => o.val >= 31);
  if (win) return win.a;
  opts.sort((x, y) => y.ev - x.ev);
  const curEv = botEval(hand, R, cfg);
  const lastMove = !!v.knocker;
  // Klopfen: nur wenn erlaubt und das Blatt gut genug ist
  const canKnock = !v.knocker && (R.knockFirst || v.turns >= active);
  if (canKnock) {
    let thr = cfg.knockBase + botNoise(rng, cfg.knockNoise) + (active - 2) * 0.5 + (R.knockDouble ? 2 : 0);
    if (cfg.smart && v.turns > active * 4) thr += 1;
    if (cur.v >= thr && (cfg.sloppy || opts[0].val <= cur.v + 2)) return { type: 'knock' };
  }
  let best = opts[0];
  if (
    !lastMove &&
    cfg.mistake &&
    botRand(rng) < cfg.mistake &&
    opts.length > 1 &&
    (cfg.sloppy || opts[0].val - cur.v < 5)
  ) {
    // Menschlicher Fehler: eine knapp schlechtere Option, aber nie ein grober Patzer
    const close = cfg.sloppy ? opts.slice(1) : opts.slice(1).filter((o) => opts[0].ev - o.ev <= 3 && o.ev > curEv);
    if (close.length) best = close[Math.floor(botRand(rng) * close.length)];
  }
  const gain = lastMove ? best.val - cur.v : best.ev - curEv;
  return gain > 0.01 ? best.a : { type: 'pass' };
}

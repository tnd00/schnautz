import { rankOf } from '../game/cards';
import { SH_ORD } from '../game/constants';
import { shAlways, shCanBomb, shCanPlay, shCanThrow, shR, shTopRun } from '../game/shithead';
import { pIdx } from '../game/state';
import type { Action, Card, Rank, Rng, Rules, ShPlayerView, View } from '../game/types';
import { BOT_CFG, type BotLevel, botRand } from './config';

/** Wie wertvoll ist eine Karte? Sonderkarten hebt sich die KI gern auf. */
export function botShStrength(st: { rules: Pick<Rules, 'sh'> }, r: Rank): number {
  const R = shR(st);
  if (r === '10' && R.ten) return 30;
  if (r === '2' && R.two) return 28;
  if (r === '3' && R.three) return 24;
  if (r === '7' && R.seven) return 9;
  return SH_ORD[r] + 1;
}

const count = (x: Card[] | number): number => (typeof x === 'number' ? x : x.length);
const cardsLeft = (P: ShPlayerView): number => count(P.hand) + P.up.length + count(P.down);

/** Tauschrunde: Die drei stärksten Karten gehören offen auf den Tisch. */
function botSwap(v: View, hand: Card[], up: Card[], rng?: Rng): Action {
  const all = [
    ...hand.map((c, i) => ({ c, src: 'h' as const, i, s: 0 })),
    ...up.map((c, i) => ({ c, src: 'u' as const, i, s: 0 })),
  ];
  all.forEach((x) => {
    x.s = botShStrength(v, rankOf(x.c)) + botRand(rng) * 0.01;
  });
  const top = all
    .slice()
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);
  const weakUp = up
    .map((c, i) => ({ c, i, s: botShStrength(v, rankOf(c)) }))
    .filter((x) => !top.some((t) => t.src === 'u' && t.i === x.i));
  const strongHand = top.filter((t) => t.src === 'h');
  if (weakUp.length && strongHand.length) {
    weakUp.sort((a, b) => a.s - b.s);
    if (botShStrength(v, rankOf(strongHand[0].c)) > weakUp[0].s) {
      return { type: 'shswap', h: strongHand[0].i, u: weakUp[0].i };
    }
  }
  return { type: 'shready' };
}

export function botShithead(v: View, rng: Rng | undefined, lvl: BotLevel = 'normal'): Action | null {
  const cfg = BOT_CFG[lvl];
  const me = v.me;
  const S = v.sh;
  const pi = pIdx(v, me);
  const P = S?.P[me];
  if (!S || !P || !Array.isArray(P.hand)) return null;
  const hand = P.hand;
  if (v.phase === 'swap') return v.players[pi].ready ? null : botSwap(v, hand, P.up, rng);
  if (v.phase !== 'play') return null;
  // 4er-Fenster: schnell die eigenen 4er reinwerfen
  if (S.win) return shCanThrow(v, me) ? { type: 'shthrow' } : null;
  // Außer der Reihe nur, um vier gleiche vollzumachen
  if (v.turn !== pi) return shCanBomb(v, me) ? { type: 'shbomb' } : null;
  const src = hand.length ? 'hand' : P.up.length ? 'up' : null;
  if (!src) return { type: 'shblind', i: Math.floor(botRand(rng) * count(P.down)) };
  const arr = src === 'hand' ? hand : P.up;
  const groups: Record<Rank, number[]> = {};
  arr.forEach((c, i) => {
    const r = rankOf(c);
    if (shCanPlay(v, r)) (groups[r] ??= []).push(i);
  });
  const ranks = Object.keys(groups);
  if (!ranks.length) return { type: 'shpickup' };
  const R = shR(v);
  const pileN = S.pile.length;
  let minOther = 99;
  v.players.forEach((o) => {
    const OP = S.P[o.id];
    if (o.id === me || o.out || !OP) return;
    const n = cardsLeft(OP);
    if (n > 0 && n < minOther) minOther = n;
  });
  const { r: topR, k: topRun } = shTopRun(v);
  const score = (r: Rank): number => {
    let s = botShStrength(v, r);
    // Vier Gleiche vollmachen verbrennt den Stapel
    if (r === topR && topRun + groups[r].length >= 4) s -= 30;
    // Die 10 lohnt sich bei großem Stapel oder wenn es eng wird
    if (r === '10' && R.ten && (pileN >= 6 || minOther <= 3)) s -= 22;
    // Eine 7 bremst, wenn ein Gegner fast fertig ist
    if (r === '7' && R.seven && minOther <= 4) s -= 3;
    return s;
  };
  const jit: Record<Rank, number> = {};
  ranks.forEach((r) => {
    jit[r] = botRand(rng) * 0.5;
  });
  ranks.sort((a, b) => score(a) + jit[a] - (score(b) + jit[b]));
  let pick = ranks[0];
  if (cfg.mistake && ranks.length > 1 && botRand(rng) < cfg.mistake * 0.6 && !shAlways(v, ranks[1])) pick = ranks[1];
  let idx = groups[pick];
  // Normalerweise alle gleichen Karten zusammen, manchmal nur eine
  if (idx.length > 1 && cfg.mistake && botRand(rng) < cfg.mistake * 0.5) idx = [idx[0]];
  return { type: 'shplay', from: src, idx };
}

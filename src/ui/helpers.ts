/* Hilfen, um aus der Ansicht Namen, Zugrecht und Reihenfolge abzulesen. */
import { pIdx } from '../game/state';
import type { Player, SchnautzResult, View } from '../game/types';
import { App } from './app';
import { esc } from './dom';
import { szResult, unreachable } from '../game/games';

export function schnautzResult(v: View): SchnautzResult | null {
  return szResult(v.result);
}

/** Wer hatte in dieser Schnautz-Runde die beste Hand? */
export function roundBest(v: View): string[] {
  const r = schnautzResult(v);
  if (!r?.vals) return [];
  if ((r.reason === 'feuer' || r.reason === 'schnautz') && r.by) return [r.by];
  const max = Math.max(-1, ...Object.values(r.vals).map((x) => x.v));
  return Object.keys(r.vals).filter((id) => r.vals[id].v === max);
}

export const pById = (v: { players: Player[] }, id: string | null | undefined): Player | null =>
  v.players.find((p) => p.id === id) ?? null;

/** Anzeigename aus Sicht dieses Browsers: der eigene Name heißt "Du". */
export function nameOf(v: View, id: string | null | undefined, fallback?: string): string {
  if (id === App.me) return 'Du';
  return pById(v, id)?.name ?? fallback ?? 'Jemand';
}

export const turnId = (v: View): string | null => (v.turn >= 0 ? (v.players[v.turn]?.id ?? null) : null);
export const dealerId = (v: View): string | null => (v.dealer >= 0 ? (v.players[v.dealer]?.id ?? null) : null);
export const myTurn = (v: View): boolean => v.phase === 'play' && turnId(v) === App.me;

/** Verbform passend zu "Du" oder einem Namen, zum Beispiel vb(id, ' legst', ' legt'). */
export const vb = (id: string | null | undefined, du: string, er: string): string => (id === App.me ? du : er);

/** Fett gesetzter, escapter Name. */
export const W = (v: View, id: string | null | undefined, fallback?: string): string =>
  `<b>${esc(nameOf(v, id, fallback))}</b>`;

/** Mitspieler in Sitzreihenfolge, beginnend links von mir. */
export function seatOrder(v: View): Player[] {
  const idx = pIdx(v, App.me);
  const n = v.players.length;
  const out: Player[] = [];
  for (let k = 1; k < n; k++) out.push(v.players[(idx + k + n) % n]);
  return out;
}

/** Spielen gerade nur noch KIs? Dann darf der Host die Partie abkürzen. */
export function onlyBotsPlaying(v: View): boolean {
  if (v.phase !== 'play' && v.phase !== 'choose' && v.phase !== 'swap') return false;
  const live = livePlayers(v);
  return live.length > 0 && live.every((p) => p.bot);
}

/** Wer in der laufenden Partie noch mitspielt. */
export function livePlayers(v: View): Player[] {
  switch (v.game) {
    case 'shithead':
      return v.players.filter((p) => !p.out && !!v.sh?.P[p.id] && !v.sh.finished.includes(p.id));
    case 'schnautz':
      return v.players.filter((p) => !p.out);
    default:
      return unreachable(v.game);
  }
}

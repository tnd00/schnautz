/*
 * Cabo ziehen: Schnappen, Eintauschen, Ablegen, Nehmen, Ziehen und Blindtausch (ziehen.md 4.1). Fremde Plätze
 * sind nur Ziel, nie Quelle. Ob ein Abwurf geht, entscheidet dieselbe Prüfung wie beim Tippen (cbWhyNot), hier steht
 * nur, welche Aktion zu Quelle und Ziel gehört. Die gezogene Karte tauscht den Platz, auf dem sie landet, oder alle
 * gewählten, wenn sie auf einem gewählten landet. Ebenso zieht man gewählte Plätze auf die gezogene Karte oder die Ablage.
 */
import { cbCurrent, cbPower, cbWhyNot } from '../cabo';
import { cbVal } from '../cards';
import type { DragKey, DropKey, DropResult, DropSay } from '../drop';
import { unreachable } from '../games';
import { rj } from '../reject';
import type { Action, View } from '../types';

export type CbDragKey = Extract<DragKey, { g: 'cabo' }>;

/**
 * Was ich gerade tun kann, wie cbRole in src/ui/render/cabo.ts, nur mit `me` statt App.me und ohne die Rollen, in denen
 * nichts ziehbar ist (Ansehen, Spionieren: 'none'). Doppelt, damit diese Datei mit dem Motor nachlädt und nicht im
 * Einstieg landet. drop-cabo.test.ts prüft, dass beide gleich bleiben.
 */
export function cbRoleOf(v: View, me: string): 'draw' | 'hold' | 'blind' | 'wait' | 'none' {
  const C = v.cb;
  if (!C?.P[me] || v.phase !== 'play') return 'none';
  if (cbCurrent(v) !== me) return 'wait';
  if (C.power?.by === me) return C.power.kind === 'swap' ? 'blind' : 'none';
  if (C.hold?.by === me) return 'hold';
  return 'draw';
}

/** Schnappen geht: Schalter an, etwas auf der Ablage und ich bin nicht mitten im eigenen Zug */
const snapOk = (v: View, me: string): boolean => {
  const r = cbRoleOf(v, me);
  return !!v.rules.cb?.snap && !!v.cb?.pile.length && (r === 'wait' || r === 'draw');
};

export function cbCanDrag(v: View, me: string, src: CbDragKey): boolean {
  const C = v.cb;
  const row = C?.P[me];
  if (!C || !row) return false;
  const role = cbRoleOf(v, me);
  switch (src.from) {
    case 'slot': {
      const ids = src.ids;
      if (!ids.length || !ownIds(row, ids)) return false;
      if (role === 'hold') return true;
      return ids.length === 1 && (role === 'blind' || snapOk(v, me));
    }
    case 'hold':
      return role === 'hold' && ownIds(row, src.sel ?? []);
    case 'pile':
      return role === 'draw' && C.pile.length > 0 && row.length > 0;
    case 'deck':
      return role === 'draw' && C.deck > 0;
    default:
      return unreachable(src);
  }
}

/** Alles eigene Plätze und keiner doppelt? */
const ownIds = (row: readonly { id: number }[], ids: readonly number[]): boolean =>
  new Set(ids).size === ids.length && ids.every((id) => row.some((s) => s.id === id));

/** Etikett fürs Eintauschen: Anzahl und Warnung, wenn nicht sichtbar alle gleich sind (verdeckte zählen als offen) */
function swapSay(v: View, me: string, ids: readonly number[], k: 'cb.swap' | 'cb.takeSwap'): DropSay {
  if (ids.length < 2) return { k };
  const vals = ids.map((id) => v.cb?.P[me]?.find((s) => s.id === id)?.c);
  const same = vals.every((c) => c && vals[0] && cbVal(c) === cbVal(vals[0]));
  return { k, a: same ? { n: ids.length } : { n: ids.length, odd: 1 } };
}

/** Aktion samt Etikett zu Quelle und Ziel, ohne zu prüfen, ob sie gerade geht. null: passt nicht zusammen. */
function pairOf(v: View, me: string, src: CbDragKey, dst: DropKey): { a: Action; say: DropSay } | null {
  const C = v.cb;
  if (!C) return null;
  const role = cbRoleOf(v, me);
  const own = dst.z === 'slot' && dst.owner === me;
  switch (src.from) {
    case 'slot': {
      const ids = src.ids;
      if (role === 'hold' && (dst.z === 'pile' || dst.z === 'hold'))
        return { a: { type: 'cbswap', ids: [...ids] }, say: swapSay(v, me, ids, 'cb.swap') };
      if (ids.length !== 1) return null;
      if (dst.z === 'pile') return { a: { type: 'cbsnap', id: ids[0], top: C.pile.at(-1) }, say: { k: 'cb.snap' } };
      if (dst.z === 'slot' && !own)
        return {
          a: { type: 'cbblind', id: ids[0], to: dst.owner, oid: dst.id },
          say: { k: 'cb.blind', a: { p: dst.owner } },
        };
      return null;
    }
    case 'hold': {
      if (own) {
        // Auf einen gewählten Platz: alle gewählten, sonst nur dieser
        const ids = src.sel?.includes(dst.id) ? [...src.sel] : [dst.id];
        return { a: { type: 'cbswap', ids }, say: swapSay(v, me, ids, 'cb.swap') };
      }
      if (dst.z !== 'pile') return null;
      const h = C.hold;
      const f = h?.by === me && h.from === 'deck' && h.c ? cbPower(h.c) : null;
      return { a: { type: 'cbdiscard' }, say: f ? { k: 'cb.discard', a: { f } } : { k: 'cb.discard' } };
    }
    case 'pile':
      if (own) return { a: { type: 'cbdraw', from: 'pile', into: [dst.id] }, say: { k: 'cb.takeSwap' } };
      return dst.z === 'hold' ? { a: { type: 'cbdraw', from: 'pile' }, say: { k: 'cb.take' } } : null;
    case 'deck':
      return dst.z === 'hold' ? { a: { type: 'cbdraw', from: 'deck' }, say: { k: 'cb.draw' } } : null;
    default:
      return unreachable(src);
  }
}

export function cbDropOf(v: View, me: string, src: CbDragKey, dst: DropKey): DropResult {
  const p = pairOf(v, me, src, dst);
  if (!p) return { ok: false, r: rj('any.noDrop') };
  const r = cbWhyNot(v, me, p.a);
  if (r) return { ok: false, r };
  return cbCanDrag(v, me, src) ? { ok: true, a: p.a, say: p.say } : { ok: false, r: rj('any.noDrop') };
}

export function cbDropsFor(v: View, me: string, src: CbDragKey): DropKey[] {
  const C = v.cb;
  if (!C || !cbCanDrag(v, me, src)) return [];
  const all: DropKey[] = [
    { z: 'pile' },
    { z: 'hold' },
    ...Object.entries(C.P).flatMap(([owner, row]) => row.map((s) => ({ z: 'slot' as const, owner, id: s.id }))),
  ];
  return all.filter((d) => cbDropOf(v, me, src, d).ok);
}

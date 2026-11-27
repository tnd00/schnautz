/*
 * Durak ziehen (ziehen.md 4.2): Angreifen und Nachlegen auf die Tischfläche, Schlagen auf eine offene Angriffskarte,
 * Weiterschieben auf das Schiebefeld. Mehrere können zugleich dran sein, deshalb hängt alles an der eigenen Rolle und
 * an den Karten selbst, nie an Indizes. Die Prüfungen sind dieselben wie beim Gastgeber (dkAttackError,
 * dkTransferError, dkBeats), hier wird keine Regel neu erfunden.
 */
import { dkBeats } from '../cards';
import { DK_MAX_ATTACK } from '../constants';
import type { DragKey, DropKey, DropResult } from '../drop';
import { dkAttackError, dkCount, dkLive, dkNextTarget, dkOpen, dkTransferError, dkTrump, dkWhyNot } from '../durak';
import { rj, type Reject } from '../reject';
import type { Card, View } from '../types';

export type DkDragKey = Extract<DragKey, { g: 'durak' }>;

/**
 * Rolle wie dkRole in src/ui/render/durak.ts, nur mit `me` statt App.me. Doppelt, damit diese Datei mit dem Motor
 * nachlädt und nicht im Einstieg landet. drop-durak.test.ts prüft, dass beide gleich bleiben.
 */
export function dkRoleOf(v: View, me: string): 'lead' | 'throw' | 'defend' | 'taking' | 'wait' | 'done' | 'none' {
  const D = v.dk;
  if (!D || v.phase !== 'play' || !(me in D.P)) return 'none';
  if (!dkLive(v, me)) return 'done';
  if (me === D.def) return D.take ? 'taking' : dkOpen(D).length ? 'defend' : 'wait';
  if (!D.table.length) return me === D.att ? 'lead' : 'wait';
  return dkCount(v, me) ? 'throw' : 'wait';
}

/** Indizes der Karten in der eigenen Hand, jede Karte einmal. Fehlt eine, null. */
function idxOf(v: View, me: string, cards: readonly Card[]): number[] | null {
  const hand = v.dk?.P[me];
  if (!Array.isArray(hand) || !cards.length || cards.length > DK_MAX_ATTACK) return null;
  const idx: number[] = [];
  for (const c of cards) {
    const i = hand.findIndex((x, j) => x === c && !idx.includes(j));
    if (i < 0) return null;
    idx.push(i);
  }
  return idx;
}

const ACTING = new Set(['lead', 'throw', 'defend']);

/** Ziehbar, wer handeln kann, mit eigenen Karten, die nicht ausgegraut sind. Ausgegraute bleiben ein Tipp mit Grund. */
export function dkCanDrag(v: View, me: string, src: DkDragKey): boolean {
  return ACTING.has(dkRoleOf(v, me)) && !!idxOf(v, me, src.cards) && src.cards.every((c) => !dkWhyNot(v, me, c));
}

const no = (r: Reject): DropResult => ({ ok: false, r });

export function dkDropOf(v: View, me: string, src: DkDragKey, dst: DropKey): DropResult {
  const D = v.dk;
  const idx = idxOf(v, me, src.cards);
  if (!D || !idx) return no(rj('any.cardGone'));
  const cards = [...src.cards];
  const n = cards.length;
  const role = dkRoleOf(v, me);
  if (role === 'lead' || role === 'throw') {
    if (dst.z !== 'table') return no(rj('any.noDrop'));
    const err = dkAttackError(v, me, cards);
    if (err) return no(err);
    return {
      ok: true,
      a: { type: 'dkattack', idx, cards },
      say: { k: role === 'lead' ? 'dk.attack' : 'dk.throw', a: { n } },
    };
  }
  if (role !== 'defend') return no(dkWhyNot(v, me, cards[0]) ?? rj('any.noDrop'));
  const beat = (i: number): DropResult => {
    const p = D.table[i];
    if (!p) return no(rj('any.noDrop'));
    if (n > 1) return no(rj('dk.oneCard'));
    if (p.d) return no(rj('dk.beaten'));
    if (!dkBeats(cards[0], p.a, dkTrump(D))) return no(rj('dk.noBeat'));
    return {
      ok: true,
      a: { type: 'dkdefend', a: i, i: idx[0], ac: p.a, c: cards[0] },
      say: { k: 'dk.beat', a: { on: p.a } },
    };
  };
  switch (dst.z) {
    case 'pair':
      return beat(dst.i);
    case 'table': {
      // Freie Fläche nennt nur den Grund. Ist genau ein Angriff offen, nimmt dessen Fläche die ganze Tischmitte an
      // (reachOf), ein zweites leuchtendes Ziel für denselben Zug würde sich mit Paar und Schiebefeld überschneiden.
      if (n > 1) return no(rj('dk.oneCard'));
      const open = D.table.flatMap((p, i) => (p.d ? [] : [i]));
      const r = open.length === 1 ? beat(open[0]) : no(rj('dk.dropPair'));
      return r.ok ? no(rj('dk.dropPair')) : r;
    }
    case 'transfer': {
      const err = dkTransferError(v, me, cards);
      if (err) return no(err);
      return {
        ok: true,
        a: { type: 'dktransfer', idx, cards },
        say: { k: 'dk.transfer', a: { p: dkNextTarget(v, me), n } },
      };
    }
    default:
      return no(rj('any.noDrop'));
  }
}

export function dkDropsFor(v: View, me: string, src: DkDragKey): DropKey[] {
  if (!dkCanDrag(v, me, src)) return [];
  const all: DropKey[] = [
    { z: 'table' },
    { z: 'transfer' },
    ...(v.dk?.table ?? []).map((_, i) => ({ z: 'pair' as const, i })),
  ];
  return all.filter((d) => dkDropOf(v, me, src, d).ok);
}

/*
 * Sätze fürs Ziehen (Plan 2.8, ziehen.md 4, 5.5 und 5.8): das Etikett am Geist zu jedem Code aus `DROP_SAY_CODES`
 * (src/game/drop.ts) und die Ansagen für den Vorleser. Argumente wie bei Ablehnungen: `n` Anzahl, `on` die Zielkarte,
 * `p` eine Platz-ID, `v` ein Wert nach dem Zug (Schnautz), `odd` 1 bei ungleichen Werten (Cabo), `f` die Fähigkeit
 * der Karte (Cabo, Schlüssel aus CB_POWER). Fehlt ein Argument, steht die kurze Form da. Reiner Text, wer ihn in
 * HTML setzt, maskiert ihn selbst.
 */
import type { DropSay, DropSayCode } from '../../game/drop';
import { CB_POWER } from './common';

/** Wie Karten und Platz-IDs zu Wörtern werden, die Oberfläche liefert es (Kartennamen stehen in src/ui/cards.ts) */
export interface DragCtx {
  card: (c: string) => string;
  name: (id: string) => string | undefined;
}

interface Arg {
  n: number;
  on: string | null;
  p: string | null;
  v: number | null;
  odd: boolean;
  f: keyof typeof CB_POWER | null;
}

/** „Alle 3“ als Zusatz „×3“, eine Karte ohne */
const times = (n: number): string => (n > 1 ? ` ×${n}` : '');

const LABEL: Readonly<Record<DropSayCode, (a: Arg) => string>> = {
  'sh.play': (a) => (a.n > 1 ? `Alle ${a.n} ablegen` : 'Ablegen'),
  'sh.blind': () => 'Aufdecken',
  'sh.swap': (a) => (a.on ? `Gegen ${a.on} tauschen` : 'Tauschen'),
  'dk.attack': (a) => `Angreifen${times(a.n)}`,
  'dk.throw': (a) => `Nachlegen${times(a.n)}`,
  'dk.beat': (a) => (a.on ? `${a.on} schlagen` : 'Schlagen'),
  'dk.transfer': (a) => `${a.p ? `Schieben → ${a.p}` : 'Schieben'}${times(a.n)}`,
  'cb.snap': () => '⚡ Schnappen',
  'cb.swap': (a) => `${a.n > 1 ? `${a.n} eintauschen` : 'Eintauschen'}${a.odd ? ' · nur gleiche' : ''}`,
  'cb.discard': (a) => (a.f ? `Ablegen + ${CB_POWER[a.f].sign} ${CB_POWER[a.f].name}` : 'Ablegen'),
  'cb.take': () => 'Nehmen',
  'cb.takeSwap': (a) => `Nehmen und ${a.n > 1 ? `${a.n} tauschen` : 'tauschen'}${a.odd ? ' · nur gleiche' : ''}`,
  'cb.draw': () => 'Ziehen',
  'cb.blind': (a) => (a.p ? `🔀 mit ${a.p} tauschen` : '🔀 Blind tauschen'),
  'sz.swap': (a) =>
    a.v != null ? `Tauschen → ${String(a.v).replace('.', ',')}` : a.on ? `Gegen ${a.on} tauschen` : 'Tauschen',
};

/** Etikett am Geist zum Code */
export function dragLabel(s: DropSay, ctx: DragCtx): string {
  const a = s.a ?? {};
  const str = (k: string): string | null => (typeof a[k] === 'string' && a[k] !== '' ? (a[k] as string) : null);
  const card = (k: string): string | null => {
    const c = str(k);
    return c ? ctx.card(c) : null;
  };
  const p = str('p');
  const num = (k: string): number | null => {
    const x = a[k];
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
  };
  const f = str('f');
  return LABEL[s.k]({
    n: num('n') ?? 1,
    on: card('on'),
    p: p ? (ctx.name(p) ?? 'Jemand') : null,
    v: num('v'),
    odd: a.odd === 1,
    f: f && Object.hasOwn(CB_POWER, f) ? (f as keyof typeof CB_POWER) : null,
  });
}

/** Ansagen für den Vorleser */
export const DRAG_SR = {
  /** Beim Anheben, `what` ist der Name der Karte */
  lift: (what: string, n: number): string => (n > 1 ? `${n} Karten aufgenommen` : `${what} aufgenommen`),
  /** Abbruch oder ungültiger Abwurf */
  back: 'Zurück in die Hand',
  /** Ohne Namen am Element */
  card: 'Karte',
} as const;

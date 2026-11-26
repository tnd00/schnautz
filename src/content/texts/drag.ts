/*
 * Sätze fürs Ziehen (Plan 2.8, ziehen.md 5.5 und 5.8): das Etikett am Geist zu jedem Code aus `DROP_SAY_CODES`
 * (src/game/drop.ts) und die Ansagen für den Vorleser. Argumente wie bei Ablehnungen: `n` Anzahl, `on` die Zielkarte,
 * `p` eine Platz-ID. Fehlt ein Argument, steht die kurze Form da. Reiner Text, wer ihn in
 * HTML setzt, maskiert ihn selbst.
 */
import type { DropSay, DropSayCode } from '../../game/drop';

/** Wie Karten und Platz-IDs zu Wörtern werden, die Oberfläche liefert es (Kartennamen stehen in src/ui/cards.ts) */
export interface DragCtx {
  card: (c: string) => string;
  name: (id: string) => string | undefined;
}

interface Arg {
  n: number;
  on: string | null;
  p: string | null;
}

const LABEL: Readonly<Record<DropSayCode, (a: Arg) => string>> = {
  'sh.play': (a) => (a.n > 1 ? `Alle ${a.n} ablegen` : 'Ablegen'),
  'sh.swap': (a) => (a.on ? `Gegen ${a.on} tauschen` : 'Tauschen'),
  'dk.attack': () => 'Angreifen',
  'dk.throw': () => 'Nachlegen',
  'dk.beat': (a) => (a.on ? `${a.on} schlagen` : 'Schlagen'),
  'dk.transfer': (a) => (a.p ? `Weiter an ${a.p}` : 'Weiterschieben'),
  'cb.snap': () => 'Schnappen!',
  'cb.swap': () => 'Eintauschen',
  'cb.discard': () => 'Ablegen',
  'cb.take': () => 'Nehmen',
  'cb.takeSwap': () => 'Nehmen und tauschen',
  'cb.draw': () => 'Ziehen',
  'cb.blind': (a) => (a.p ? `Blind mit ${a.p} tauschen` : 'Blind tauschen'),
  'sz.swap': (a) => (a.on ? `Gegen ${a.on} tauschen` : 'Tauschen'),
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
  return LABEL[s.k]({
    n: typeof a.n === 'number' ? a.n : 1,
    on: card('on'),
    p: p ? (ctx.name(p) ?? 'Jemand') : null,
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

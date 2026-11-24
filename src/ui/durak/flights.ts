/*
 * Durak: Karten fliegen sichtbar. Neue Karten auf dem Tisch kommen vom Platz der Person (eigene von ihrer Stelle
 * in der Hand). Endet ein Angriff, fliegt alles zu den weggelegten Karten oder zu dem, der aufnimmt. Danach
 * kommen die nachgezogenen Karten vom Stapel. Vor dem Zeichnen merkt sich dkSnap, wo die alten Karten lagen.
 */
import type { Card, LogEntry, View } from '../../game/types';
import { flyG, type Rect } from '../animations';
import { App } from '../app';
import { $opt, reduceMotion } from '../dom';
import { panelFor } from '../feedback';
import { dkCount } from '../../game/durak';

export interface DkSnap {
  /** Karte und wo sie vor dem Zeichnen lag */
  cards: Map<Card, DOMRect>;
}

const rectOf = (el: Element | null | undefined): DOMRect | null => (el ? el.getBoundingClientRect() : null);

/** Vor dem Zeichnen: Positionen der Karten auf dem Tisch. */
export function dkSnap(prev: View | null): DkSnap | null {
  const D = prev?.dk;
  if (!D || prev?.game !== 'durak') return null;
  const cards = new Map<Card, DOMRect>();
  D.table.forEach((p, i) => {
    const pair = $opt(`#center .dkpair[data-i="${i}"]`);
    const a = rectOf(pair?.querySelector('.dka'));
    if (a) cards.set(p.a, a);
    const d = rectOf(pair?.querySelector('.dkd'));
    if (p.d && d) cards.set(p.d, d);
  });
  return { cards };
}

/** Mitte eines Platzes als kleines Rechteck, von dem eine Karte losfliegt. */
function seatRect(pid: string | undefined, w: number): Rect | null {
  const el = panelFor(pid);
  const r = el?.getBoundingClientRect();
  if (!r) return null;
  return { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 3 - w * 0.7, width: w, height: w * 1.4 };
}

const cardW = (): number => $opt<HTMLElement>('#center .dkpair .card, #center .deck .card')?.offsetWidth ?? 60;

/** Nach dem Zeichnen: Flüge zwischen alter und neuer Ansicht. */
export function dkFlights(prev: View, v: View, snap: DkSnap | null, fresh: LogEntry[]): void {
  const P = prev.dk;
  const D = v.dk;
  if (!P || !D || !snap || reduceMotion() || prev.games !== v.games) return;
  const w = cardW();
  const mine = App.playRects && Date.now() - App.playRects.t < 6000 ? App.playRects : null;
  let own = 0;
  // Neue Karten auf dem Tisch
  D.table.forEach((p, i) => {
    const pair = $opt(`#center .dkpair[data-i="${i}"]`);
    const fly = (c: Card, by: string, sel: string) => {
      if (snap.cards.has(c)) return;
      const to = pair?.querySelector<HTMLElement>(sel);
      if (!to) return;
      const from = by === App.me && mine?.rects[own] ? mine.rects[own++] : seatRect(by, w);
      flyG(from, to.getBoundingClientRect(), c, {
        w: to.offsetWidth,
        hideEl: to,
        dur: 420,
        spin: by === App.me ? -6 : 8,
      });
    };
    fly(p.a, p.by, '.dka');
    if (p.d) fly(p.d, D.def, '.dkd');
  });
  if (mine && own) App.playRects = null;
  // Angriff vorbei: alles weg oder zu dem, der aufnimmt
  const end = fresh.find((e) => e.k === 'dkbito' || e.k === 'dkpickup');
  if (end && !D.table.length) {
    const target =
      end.k === 'dkbito'
        ? rectOf($opt('#center .dkbito'))
        : rectOf(end.p === App.me ? ($opt('#me .dkhand') ?? panelFor(App.me)) : panelFor(end.p));
    // Die letzte Verteidigung lag nie auf dem Tisch: Sie fliegt direkt vom Verteidiger mit
    const last = fresh.filter((e) => e.k === 'dkdefend' && !snap.cards.has(e.d));
    let k = 0;
    snap.cards.forEach((r, c) => {
      flyG(r, target, c, {
        w: r.width,
        fade: true,
        dur: 520,
        delay: 80 + k++ * 40,
        spin: end.k === 'dkbito' ? 14 : -10,
      });
    });
    last.forEach((e) => {
      if (e.k !== 'dkdefend') return;
      flyG(seatRect(e.p, w), target, e.d, { w, fade: true, dur: 520, delay: 80 + k++ * 40 });
    });
  }
  // Nachziehen: Kartenrücken vom Stapel zu allen, die mehr Karten haben als vorher
  if (num(D.deck) < num(P.deck)) {
    const deck = rectOf($opt('#center .dkdeck'));
    let d = 0;
    v.players.forEach((p) => {
      if (p.id === App.me) return;
      const gain = dkCount(v, p.id) - dkCount(prev, p.id);
      const took = end?.k === 'dkpickup' && end.p === p.id;
      if (gain <= 0 || took) return;
      for (let i = 0; i < Math.min(gain, 3); i++)
        flyG(deck, seatRect(p.id, w), null, { w, fade: true, dur: 480, delay: 520 + d++ * 70 });
    });
    // Eigene neue Karten: von hinten aufdecken
    const before = new Set(Array.isArray(P.P[App.me]) ? (P.P[App.me] as Card[]) : []);
    const hand = D.P[App.me];
    if (Array.isArray(hand)) {
      const els = Array.from(document.querySelectorAll<HTMLElement>('#me .dkhand .card'));
      hand.forEach((c, i) => {
        if (before.has(c) || snap.cards.has(c) || !els[i]) return;
        flyG(deck, els[i].getBoundingClientRect(), c, {
          w: els[i].offsetWidth,
          hideEl: els[i],
          flip: true,
          dur: 560,
          delay: 560 + d++ * 80,
        });
      });
    }
  }
}

const num = (x: unknown): number => (typeof x === 'number' ? x : 0);

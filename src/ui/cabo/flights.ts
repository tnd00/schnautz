/*
 * Cabo: Karten fliegen sichtbar. Gezogene Karten kommen vom Stapel oder der Ablage, getauschte Karten fliegen von
 * ihrem Platz auf die Ablage, beim Blindtausch kreuzen sich zwei Rücken. Wer sich eine Karte ansieht, hebt sie
 * kurz an, damit alle sehen, welche. Vor dem Zeichnen merkt sich cbSnap, wo alles lag.
 */
import type { Card, LogEntry, View } from '../../game/types';
import { flyG } from '../animations';
import { App } from '../app';
import { $opt, reduceMotion } from '../dom';

export interface CbSnap {
  /** Platz (Besitzer und Platz-ID) und wo er vor dem Zeichnen lag */
  slots: Map<string, DOMRect>;
  deck: DOMRect | null;
  pile: DOMRect | null;
  /** Meine gezogene Karte in der Mitte */
  hold: DOMRect | null;
  /** Gezogene Karten der anderen über ihrer Reihe */
  held: Map<string, DOMRect>;
}

const key = (owner: string, id: number | undefined): string => `${owner}:${id ?? ''}`;
const rectOf = (el: Element | null | undefined): DOMRect | null => (el ? el.getBoundingClientRect() : null);

/** Element eines Platzes im aktuellen DOM. */
function slotEl(owner: string, id: number | undefined): HTMLElement | null {
  if (id == null) return null;
  const box = owner === App.me ? $opt('#me .cbrow') : $opt(`.opp[data-pid="${CSS.escape(owner)}"] .cbrow`);
  return box?.querySelector<HTMLElement>(`.cbslot[data-sid="${id}"]`) ?? null;
}

/** Vor dem Zeichnen: wo Plätze, Stapel, Ablage und gezogene Karten liegen. */
export function cbSnap(prev: View | null): CbSnap | null {
  if (!prev?.cb || prev.game !== 'cabo') return null;
  const slots = new Map<string, DOMRect>();
  Object.entries(prev.cb.P).forEach(([owner, row]) =>
    row.forEach((s) => {
      const r = rectOf(slotEl(owner, s.id));
      if (r) slots.set(key(owner, s.id), r);
    }),
  );
  const held = new Map<string, DOMRect>();
  document.querySelectorAll<HTMLElement>('.opp[data-pid] .cbheld').forEach((el) => {
    const pid = el.closest<HTMLElement>('.opp')?.dataset.pid;
    if (pid) held.set(pid, el.getBoundingClientRect());
  });
  return {
    slots,
    deck: rectOf($opt('#center .cbdeck')),
    pile: rectOf($opt('#center .cbpile')),
    hold: rectOf($opt('#center .cbhold')),
    held,
  };
}

const cardW = (): number => $opt<HTMLElement>('#center .cbpile .card, #center .cbdeck .card')?.offsetWidth ?? 60;

/** Kurz anheben: Hier schaut gerade jemand hin. */
function lift(owner: string, ids: (number | undefined)[]): void {
  ids.forEach((id) => {
    const el = slotEl(owner, id);
    if (!el) return;
    el.classList.remove('lift');
    void el.offsetWidth;
    el.classList.add('lift');
    setTimeout(() => el.classList.remove('lift'), 1400);
  });
}

/** Nach dem Zeichnen: Flüge zwischen alter und neuer Ansicht. */
export function cbFlights(prev: View, v: View, snap: CbSnap, fresh: LogEntry[]): void {
  const C = v.cb;
  if (!C || prev.games !== v.games || prev.round !== v.round) return;
  const calm = reduceMotion();
  const w = cardW();
  const pileTop = (): HTMLElement | null => $opt<HTMLElement>('#center .cbpile > .card:not(.under)');
  // Wo die gezogene Karte vorher lag: bei mir in der Mitte, sonst über der Reihe
  const heldFrom = (pid: string | undefined): DOMRect | null =>
    pid === App.me ? snap.hold : pid ? (snap.held.get(pid) ?? null) : null;
  let d = 0;
  fresh.forEach((e) => {
    const pid = e.p ?? '';
    switch (e.k) {
      case 'cblook':
        if (pid !== App.me) lift(pid, e.ids ?? []);
        return;
      case 'cbpeek':
        if (pid !== App.me) lift(pid, [e.id]);
        return;
      case 'cbspy':
        if (pid !== App.me) lift(e.to, [e.id]);
        return;
      default:
        break;
    }
    if (calm) return;
    switch (e.k) {
      case 'cbdraw': {
        const to =
          pid === App.me
            ? $opt<HTMLElement>('#center .cbhold > .card')
            : $opt<HTMLElement>(`.opp[data-pid="${CSS.escape(pid)}"] .cbheld .card`);
        const from = e.from === 'pile' ? snap.pile : snap.deck;
        const c: Card | null = e.from === 'pile' ? (e.c ?? null) : pid === App.me ? (C.hold?.c ?? null) : null;
        if (to)
          flyG(from, to.getBoundingClientRect(), c, {
            w: to.offsetWidth,
            hideEl: to,
            dur: 420,
            flip: pid === App.me && e.from === 'deck',
            delay: d,
          });
        return;
      }
      case 'cbdiscard': {
        const to = pileTop();
        if (to)
          flyG(heldFrom(pid), to.getBoundingClientRect(), e.c, { w: to.offsetWidth, hideEl: to, dur: 420, spin: 10 });
        return;
      }
      case 'cbswap': {
        const ids = e.ids ?? [];
        const to = pileTop();
        // Die alten Karten gehen auf die Ablage
        if (e.ok && to)
          e.out.forEach((c, i) =>
            flyG(snap.slots.get(key(pid, ids[i])), to.getBoundingClientRect(), c, {
              w: to.offsetWidth,
              fade: i < e.out.length - 1,
              hideEl: i === e.out.length - 1 ? to : undefined,
              dur: 460,
              delay: 80 + i * 90,
              spin: -8,
            }),
          );
        // Die gezogene Karte kommt an ihren Platz, oder bei einem Fehlgriff auf die Ablage
        const slot = slotEl(pid, ids[0]);
        if (e.ok && slot) {
          const c = slot.querySelector<HTMLElement>('.card');
          flyG(
            heldFrom(pid),
            slot.getBoundingClientRect(),
            e.up ? (C.P[pid]?.find((s) => s.id === ids[0])?.c ?? null) : null,
            {
              w: c?.offsetWidth ?? w,
              hideEl: c ?? undefined,
              dur: 480,
              delay: 160,
            },
          );
        } else if (!e.ok && to) flyG(heldFrom(pid), to.getBoundingClientRect(), null, { w, fade: true, dur: 420 });
        if (e.pen) penalty(pid);
        return;
      }
      case 'cbsnap': {
        const to = pileTop();
        if (e.ok && to)
          flyG(snap.slots.get(key(pid, e.id)), to.getBoundingClientRect(), e.c, {
            w: to.offsetWidth,
            hideEl: to,
            dur: 380,
            spin: 14,
          });
        else if (!e.ok) penalty(pid);
        return;
      }
      case 'cbblind': {
        const a = slotEl(pid, e.id);
        const b = slotEl(e.to, e.oid);
        const ra = snap.slots.get(key(pid, e.id));
        const rb = snap.slots.get(key(e.to, e.oid));
        const ca = a?.querySelector<HTMLElement>('.card');
        const cb = b?.querySelector<HTMLElement>('.card');
        const faceA = C.P[pid]?.find((s) => s.id === e.id);
        const faceB = C.P[e.to]?.find((s) => s.id === e.oid);
        if (ca && rb)
          flyG(rb, ca.getBoundingClientRect(), faceA?.up ? (faceA.c ?? null) : null, {
            w: ca.offsetWidth,
            hideEl: ca,
            dur: 640,
            arc: 90,
            spin: 20,
          });
        if (cb && ra)
          flyG(ra, cb.getBoundingClientRect(), faceB?.up ? (faceB.c ?? null) : null, {
            w: cb.offsetWidth,
            hideEl: cb,
            dur: 640,
            arc: -60,
            spin: -20,
          });
        return;
      }
      default:
        return;
    }
  });

  /** Strafkarte: ein Rücken vom Stapel an den neuen, letzten Platz. */
  function penalty(pid: string): void {
    const row = C?.P[pid];
    const last = row?.[row.length - 1];
    const el = slotEl(pid, last?.id)?.querySelector<HTMLElement>('.card');
    if (el)
      flyG(snap.deck, el.getBoundingClientRect(), null, {
        w: el.offsetWidth,
        hideEl: el,
        dur: 520,
        delay: 380 + d++ * 60,
      });
  }
}

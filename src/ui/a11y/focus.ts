/*
 * Fokus halten über ein Neuzeichnen (Plan 2.8 Abschnitt 8, gefuehl.md 3.4). Jedes fokussierbare Element am Tisch
 * trägt `data-fk`, Knöpfe ohne `data-fk` (etwa im Ergebnisblatt) zählen über `data-act`. Aufgerufen von renderTable
 * und vom Ergebnisblatt. Wiederhergestellt wird nur, wenn der Fokus vorher dort lag und jetzt verloren ist (auf
 * body), wer im Chat tippt, verliert also nichts.
 */

/** Gemerkter Fokus: Schlüssel, die Zone, in der er lag, und sein Platz unter den Schlüsseln der Zone */
export interface FocusMark {
  fk: string;
  zone: string | null;
  i: number;
}

/** Zonen von innen nach außen, die erste passende gilt */
const ZONES = ['#opps', '#center', '#me', '#overlay', '#table'];
const KEYED = '[data-fk], [data-act]';

function keyOf(el: HTMLElement): string {
  const fk = el.closest<HTMLElement>('[data-fk]')?.dataset.fk;
  if (fk) return fk;
  const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
  return act ? `act:${act}` : '';
}

function selOf(key: string): string {
  return key.startsWith('act:')
    ? `[data-act="${CSS.escape(key.slice(4))}"]:not([data-fk])`
    : `[data-fk="${CSS.escape(key)}"]`;
}

const usable = (el: HTMLElement | null | undefined): el is HTMLElement =>
  !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[inert]');

/** Vor dem Zeichnen: Schlüssel des Fokus merken, falls er in #table oder #overlay liegt. */
export function holdFocus(): FocusMark | null {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || a === document.body || !a.closest('#table, #overlay')) return null;
  const zone = ZONES.find((z) => a.closest(z)) ?? null;
  const fk = keyOf(a);
  const root = zone ? document.querySelector(zone) : null;
  const list = root ? [...root.querySelectorAll<HTMLElement>(KEYED)] : [];
  return {
    fk,
    zone,
    i: Math.max(
      0,
      list.findIndex((el) => el === a || el.contains(a)),
    ),
  };
}

/** Nach dem Zeichnen: gleicher Schlüssel, sonst gleicher Platz in derselben Zone, sonst die Zone selbst. */
export function restoreFocus(m: FocusMark | null): void {
  if (!m) return;
  const a = document.activeElement;
  if (a && a !== document.body) return;
  const root = m.zone ? document.querySelector<HTMLElement>(m.zone) : null;
  const same = m.fk ? [...document.querySelectorAll<HTMLElement>(selOf(m.fk))].find(usable) : undefined;
  const list = root ? [...root.querySelectorAll<HTMLElement>(KEYED)].filter(usable) : [];
  const to = same ?? list[Math.min(m.i, list.length - 1)] ?? (usable(root) ? root : null);
  if (!to) return;
  if (to === root && !to.hasAttribute('tabindex')) to.tabIndex = -1;
  to.focus({ preventScroll: true });
}

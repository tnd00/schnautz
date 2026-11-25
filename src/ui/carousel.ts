/*
 * Gegner-Karussell: Gibt es mehr Gegner, als nebeneinander passen, stehen drei (am Desktop fünf) in der Mitte
 * und die nächsten schauen links und rechts angeschnitten hervor. Es dreht endlos im Uhrzeigersinn, ohne
 * Scrollbalken. Wer dran ist, rückt von selbst in die Mitte. Wischen geht jederzeit, beim Loslassen
 * schnappt es zurück zur Person am Zug.
 * Jeder Gegner steht genau einmal im DOM, damit Flugkarten, Sprechblasen und Tests ihn weiter finden.
 */
import type { View } from '../game/types';
import { App } from './app';
import { $, isMobile } from './dom';
import { dealerId, turnId } from './helpers';

/** Abstand zwischen den Gegnern und wie weit die nächsten am Rand hervorschauen. */
const GAP = { mobile: 5, desktop: 8 };
const PEEK = { mobile: 12, desktop: 30 };

export const CAR = {
  /** Angezeigter Versatz: Index des Gegners in der Mitte, beim Wischen auch gebrochen */
  shown: 0,
  /** Für wen zuletzt automatisch zentriert wurde */
  actor: null as string | null,
  n: 0,
  step: 1,
  drag: null as { x: number; off: number; moved: boolean; id: number } | null,
  wheelT: 0,
  /** Gerade am Trackpad seitlich scrollen */
  wheeling: false,
  /** Bis dahin nicht von selbst zur Person am Zug drehen (eigener Wurf auf eine Kachel am Rand) */
  hold: 0,
  /** Letzter Tipp auf eine Kachel, damit der Klick danach nicht doppelt zählt */
  tapAt: 0,
};

/** So lange gleitet das Karussell (CSS in fit.css). */
const SLIDE_MS = 450;
export const CAR_GLIDE_MS = SLIDE_MS;

/** So lange ohne Bewegung am Trackpad gilt als losgelassen. */
const WHEEL_IDLE_MS = 700;

const actorOf = (v: View): string | null =>
  v.phase === 'choose' ? dealerId(v) : v.phase === 'play' ? turnId(v) : null;

const visible = (): number => (isMobile() ? 3 : 5);

/** Abstand auf dem Kreis, zwischen -n/2 und n/2. */
function circ(d: number, n: number): number {
  const w = ((d % n) + n) % n;
  return w >= n / 2 ? w - n : w;
}

const boxesOf = (el: HTMLElement): HTMLElement[] =>
  [...el.children].filter((x) => x.classList.contains('opp')) as HTMLElement[];

/** Setzt alle Gegner an ihren Platz. `animate`: gleitend, sonst sofort. */
function place(el: HTMLElement, off: number, animate: boolean): void {
  const boxes = boxesOf(el);
  const n = boxes.length;
  const vis = visible();
  const cs = getComputedStyle(el);
  const pt = parseFloat(cs.paddingTop) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const W = el.clientWidth;
  const m = isMobile();
  const gap = m ? GAP.mobile : GAP.desktop;
  const peek = m ? PEEK.mobile : PEEK.desktop;
  const w = Math.max(60, (W - (vis + 1) * gap - 2 * peek) / vis);
  CAR.step = w + gap;
  const x0 = W / 2 - w / 2;
  // Mitte, Nachbarn und die angeschnittenen am Rand, alles weiter weg bleibt unsichtbar
  const reach = Math.floor(vis / 2) + 1;
  let h = 0;
  boxes.forEach((b, i) => {
    const s = circ(i - off, n);
    const prev = Number(b.dataset.slot);
    // Wer auf die andere Seite springt, soll nicht quer über den Tisch gleiten
    const jump = Number.isFinite(prev) && Math.abs(s - prev) > n / 2;
    b.style.transition = animate && !jump ? '' : 'none';
    b.style.width = `${w}px`;
    b.style.top = `${pt}px`;
    b.style.transform = `translateX(${(x0 + s * CAR.step).toFixed(1)}px)`;
    b.style.visibility = Math.abs(s) < reach + 0.5 ? '' : 'hidden';
    b.dataset.slot = String(s);
    h = Math.max(h, b.offsetHeight);
  });
  el.style.height = `${Math.ceil(h + pt + pb)}px`;
}

function clear(el: HTMLElement): void {
  el.classList.remove('car');
  el.style.removeProperty('height');
  boxesOf(el).forEach((b) => {
    ['transition', 'width', 'top', 'transform', 'visibility'].forEach((k) => b.style.removeProperty(k));
    delete b.dataset.slot;
  });
}

/** Nach jedem Neuzeichnen der Gegner: Karussell an oder aus, wer dran ist, in die Mitte. */
export function layoutOpps(v: View): void {
  const el = $('#opps');
  const n = boxesOf(el).length;
  // In der Tauschrunde am Handy stehen alle als Kacheln da, wenn sie groß genug werden (layoutSwapOpps)
  const on = n > visible() && !el.dataset.grid;
  if (!on) {
    clear(el);
    CAR.n = n;
    return;
  }
  el.classList.add('car');
  if (CAR.n !== n) {
    CAR.shown = 0;
    CAR.actor = null;
  }
  CAR.n = n;
  const actor = actorOf(v);
  let target = CAR.shown;
  // Bei jedem Zugwechsel zur Person am Zug. Bin ich selbst dran oder wische gerade, bleibt es stehen
  if (actor !== CAR.actor && !CAR.drag && !CAR.wheeling && Date.now() >= CAR.hold) {
    CAR.actor = actor;
    const i = boxesOf(el).findIndex((b) => b.dataset.pid === actor);
    if (actor && actor !== App.me && i >= 0) target = CAR.shown + circ(i - CAR.shown, n);
  }
  place(el, CAR.shown, false);
  if (target !== CAR.shown) {
    void el.offsetWidth;
    CAR.shown = target;
    place(el, target, true);
  }
}

/** Nach Größenänderung neu ausmessen. */
export function relayoutOpps(): void {
  const el = $('#opps');
  if (el.classList.contains('car')) place(el, CAR.shown, false);
}

function snap(el: HTMLElement, to: number): void {
  CAR.shown = to;
  place(el, to, true);
}

/** Loslassen: sofort zurück zur Person, die gerade dran ist. Bin ich selbst dran, zum nächsten Gegner. */
function snapBack(el: HTMLElement): void {
  const v = App.view;
  const actor = v ? actorOf(v) : null;
  CAR.actor = actor;
  const i = boxesOf(el).findIndex((b) => b.dataset.pid === actor);
  if (actor && actor !== App.me && i >= 0) snap(el, CAR.shown + circ(i - CAR.shown, CAR.n));
  else snap(el, Math.round(CAR.shown));
}

/** Liegt die Mitte der Kachel außerhalb des sichtbaren Bereichs? */
export function offscreen(box: Element): boolean {
  const r = box.getBoundingClientRect();
  const o = $('#opps').getBoundingClientRect();
  const cx = r.left + r.width / 2;
  return (box as HTMLElement).style.visibility === 'hidden' || cx < o.left || cx > o.right;
}

/** Dreht eine Kachel in die Mitte und hält sie dort, bis carouselRelease. Gibt zurück, wie lange das Drehen dauert. */
export function carouselShow(pid: string): number {
  const el = $('#opps');
  if (!el.classList.contains('car')) return 0;
  const boxes = boxesOf(el);
  const i = boxes.findIndex((b) => b.dataset.pid === pid);
  if (i < 0 || !offscreen(boxes[i])) return 0;
  CAR.hold = Infinity;
  snap(el, CAR.shown + circ(i - CAR.shown, CAR.n));
  return SLIDE_MS;
}

/** Zeremonie: Kachel in die Mitte holen, ohne sie festzuhalten. Gibt zurück, ob gedreht wird. */
export function focusOpp(pid: string): boolean {
  const el = $('#opps');
  if (!el.classList.contains('car') || CAR.drag || CAR.wheeling) return false;
  const boxes = boxesOf(el);
  const i = boxes.findIndex((b) => b.dataset.pid === pid);
  if (i < 0) return false;
  const to = CAR.shown + circ(i - CAR.shown, CAR.n);
  if (Math.abs(to - CAR.shown) < 0.01) return false;
  CAR.actor = pid;
  snap(el, to);
  return true;
}

/** Wieder frei: zurück zur Person am Zug, außer es wischt gerade jemand. */
export function carouselRelease(): void {
  if (CAR.hold === 0) return;
  CAR.hold = 0;
  const el = $('#opps');
  if (el.classList.contains('car') && !CAR.drag && !CAR.wheeling) snapBack(el);
}

/**
 * Wischen mit Finger oder Maus und seitliches Scrollen am Trackpad. `onTap`: Tipp ohne Wischen auf eine Kachel, die
 * Wurfziel ist. `onAct`: Tipp ohne Wischen auf etwas anderes Antippbares in einer Kachel (Cabo: fremde Karte).
 */
export function initCarousel(onTap?: (pid: string) => void, onAct?: (el: HTMLElement) => void): void {
  const el = $('#opps');
  // Im resize-Ereignis und im Frame danach liefert der Browser manchmal noch Abstände und Höhen der vorigen Größe
  // (gesehen mit „Bewegung reduzieren“, dann wird das Karussell zu hoch). Erst im übernächsten Frame stimmen sie,
  // dann noch einmal setzen. Gleitend, damit ein laufendes Drehen nicht abbricht, ohne Änderung bewegt sich nichts
  let settle = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(settle);
    settle = requestAnimationFrame(() => {
      settle = requestAnimationFrame(() => {
        if (el.classList.contains('car') && !CAR.drag) place(el, CAR.shown, true);
      });
    });
  });
  el.addEventListener('pointerdown', (e) => {
    if (!el.classList.contains('car') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    CAR.drag = { x: e.clientX, off: CAR.shown, moved: false, id: e.pointerId };
    // Sofort festhalten: Die Gegner werden bei jedem Zug neu gezeichnet, ohne Festhalten gingen die Ereignisse verloren
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    const d = CAR.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    d.moved = true;
    CAR.shown = d.off - dx / CAR.step;
    place(el, CAR.shown, false);
  });
  const end = (e: PointerEvent) => {
    const d = CAR.drag;
    if (!d || d.id !== e.pointerId) return;
    CAR.drag = null;
    if (d.moved) {
      snapBack(el);
      return;
    }
    // Mit Festhalten erreicht der Klick die Kachel nicht immer, deshalb hier selbst nachsehen
    if (e.type !== 'pointerup') return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const box = hit?.closest<HTMLElement>('.opp[data-pid]');
    if (!box?.dataset.pid) return;
    // Liegt unter dem Finger etwas anderes als das Wurfziel, gilt der Tipp dem (etwa eine fremde Karte bei Cabo)
    const target = hit?.closest<HTMLElement>('[data-act]');
    if (target && target.dataset.act !== 'aim' && box.contains(target)) {
      onAct?.(target);
      // Erst danach: Der Klick, den der Browser vielleicht noch hinterherschickt, zählt dann nicht doppelt
      CAR.tapAt = Date.now();
      return;
    }
    if (!onTap || box.dataset.act !== 'aim') return;
    CAR.tapAt = Date.now();
    onTap(box.dataset.pid);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener(
    'wheel',
    (e) => {
      if (!el.classList.contains('car') || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      CAR.wheeling = true;
      CAR.shown += e.deltaX / CAR.step;
      place(el, CAR.shown, false);
      clearTimeout(CAR.wheelT);
      // Das Trackpad meldet kein Loslassen, nur Bewegung samt Nachschwingen. Erst wenn eine Weile nichts kommt, zurück
      CAR.wheelT = window.setTimeout(() => {
        CAR.wheeling = false;
        snapBack(el);
      }, WHEEL_IDLE_MS);
    },
    { passive: false },
  );
}

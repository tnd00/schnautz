/*
 * Motor fürs Ziehen (Plan 2.8 Abschnitt 8, ziehen.md 5.3 bis 5.8), nachgeladen von ./drag.ts. Ein Zeiger zur Zeit:
 * Unter der Schwelle bleibt es ein Tipp über data-act, darüber hebt sich ein Geist in #fly, gültige Ziele leuchten,
 * das Ziel unter der Fingerspitze bekommt Ring und Etikett. Loslassen auf gültigem Ziel schickt die Aktion über den
 * Adapter, sonst fliegt der Geist zurück. Ruhig (calm) lässt Einrasten, Neigung, Platsch und Zurückfliegen weg, der
 * Geist blendet dann nur aus.
 *
 * Gestartet wird nie in #opps (Karussell-Wischen) und nie, solange tableBusy() gilt. Nach einem Ziehen verschluckt ein
 * Wächter 400 ms lang Zeiger-Klicks am Tisch (dort liegen alle Quellen), Tastatur-Klicks und Tipps außerhalb gehen
 * immer durch.
 *
 * Die Adapter der Spiele kommen per import.meta.glob mit in dieses Stück (Muster oben in ./drag.ts).
 */
import '../../styles/table/drag.css';
import { DRAG_SR, dragLabel, type DragCtx } from '../../content/texts/drag';
import { ctxOfView, rejectText } from '../../content/texts/reject';
import {
  canDrag,
  catches,
  dropKeyOf,
  dropOf,
  dropsFor,
  sameDrag,
  sameDrop,
  type DragKey,
  type DropKey,
  type DropResult,
} from '../../game/drop';
import type { Card, View } from '../../game/types';
import { haptic } from '../a11y/haptic';
import { say } from '../a11y/say';
import { App } from '../app';
import { CARD_RE, cardName } from '../cards';
import { CAR, carouselRelease } from '../carousel';
import type { Timer } from '../dom';
import { fixedLabel, shakeEl } from '../feedback';
import { calm, prefs } from '../prefs';
import { closePick } from '../toss';
import type { DragAdapter, DragMotor, Landed } from './drag';
import {
  catchRadius,
  ghostAt,
  hitReach,
  hitTest,
  pastSlop,
  pointerKind,
  reachOf,
  SNAP_PULL,
  tiltOf,
  towards,
  type Box,
  type PointerKind,
  type Target,
} from './dragmath';
import { tableBusy } from './index';
import { specOf } from './spec';

/** Zeiten aus ziehen.md 5.3 bis 5.5 */
const GLIDE_MS = 160;
const BACK_MS = 260;
const FADE_MS = 120;
const GUARD_MS = 400;
/** So lange liegt ein abgelegter Geist ohne Antwort, passend zur Sperre in doAct */
const WAIT_MS = 2500;
/** Finger ruht so lange, dann fragt der Motor adapter.rest (Cabo: Karussell am Rand drehen, ziehen.md 4.1) */
const REST_MS = 600;
/** So weit darf der ruhende Finger zittern */
const REST_SLOP = 8;
/** Höchstens so oft sagt der Vorleser ein neues Ziel an */
const SAY_GAP_MS = 600;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Versatz der Karten im Fächer eines Bündels in Kartenbreiten, mehr als vier zeigt der Geist nicht */
const FAN_STEP = 0.18;
const FAN_MAX = 4;

interface Zone {
  key: DropKey;
  el: HTMLElement;
  res: DropResult;
  box: Box;
  pad: number;
  /** Angenommene Fläche aus reachOf, das Leuchten bleibt an `el` */
  reach: Box;
}

/** Ein abgelegter Geist, der auf die passende Ansicht wartet */
interface Pending {
  key: DragKey;
  ad: DragAdapter;
  ghost: HTMLElement;
  /** Höchster Logeintrag beim Abwurf */
  n: number;
  /** Typ der geschickten Aktion: Nur eine Ablehnung dazu holt den Geist zurück */
  act: string;
  t: Timer;
}

const D = {
  /** pointerId, -1 ohne Zeiger */
  id: -1,
  kind: 'touch' as PointerKind,
  x0: 0,
  y0: 0,
  x: 0,
  y: 0,
  lastX: 0,
  ad: null as DragAdapter | null,
  key: null as DragKey | null,
  els: [] as HTMLElement[],
  /** Über der Schwelle, der Geist ist da */
  on: false,
  ghost: null as HTMLElement | null,
  lbl: null as HTMLElement | null,
  /** Größe der gegriffenen Karte und Griffpunkt ab ihrer Ecke */
  w: 0,
  h: 0,
  dx: 0,
  dy: 0,
  /** Ecke des Geists zuletzt */
  gx: 0,
  gy: 0,
  zones: [] as Zone[],
  /** Rechtecke der Quelle beim Messen: Loslassen dort bricht ab */
  home: [] as Box[],
  over: -1,
  tilt: 0,
  raf: 0,
  sayAt: 0,
  okSeen: false,
  /** Ende des letzten echten Ziehens, für den Klick-Wächter */
  endAt: 0,
  /** Zuletzt angesagtes Ziel samt Gültigkeit, damit ein Neuzeichnen es nicht noch einmal vorliest */
  said: '',
  /** Ruhender Finger: Stelle und Zeitgeber für adapter.rest */
  rx: 0,
  ry: 0,
  restT: 0 as Timer | 0,
};

/** Adapter je Spiel, Schlüssel wie '../cabo/drag.ts' */
const ADAPTERS = import.meta.glob<{ adapter: DragAdapter }>('../{shithead,durak,cabo,schnautz}/drag.ts', {
  eager: true,
});

let pend: Pending | null = null;
let landed: (Landed & { t: number }) | null = null;

const html = (): HTMLElement => document.documentElement;
const table = (): HTMLElement | null => document.getElementById('table');

/** Adapter des Spiels, wenn seine Spec Ziehen einschaltet (drag: true) */
function adapterOf(v: View | null): DragAdapter | null {
  if (!v || !specOf(v.game).drag) return null;
  return ADAPTERS[`../${v.game}/drag.ts`]?.adapter ?? null;
}

const dctx = (v: View): DragCtx => ({
  card: (c) => (CARD_RE.test(c) ? cardName(c as Card) : c),
  name: ctxOfView(v).name,
});

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

const maxLog = (v: View): number => v.log.reduce((m, e) => Math.max(m, e.n), 0);

/** Zeigt die Ansicht schon einen eigenen Zug nach dem Abwurf? */
const ownAfter = (v: View, n: number): boolean => v.log.some((e) => e.n > n && e.p === v.me);

/** Quelle zum Schlüssel im aktuellen DOM, nie aus #opps */
function findSource(v: View, ad: DragAdapter, key: DragKey): { key: DragKey; els: HTMLElement[] } | null {
  const t = table();
  if (!t) return null;
  for (const el of t.querySelectorAll<HTMLElement>('[data-drag]')) {
    if (el.closest('#opps')) continue;
    const s = ad.source(el, v);
    if (s && sameDrag(s.key, key)) return s;
  }
  return null;
}

/**
 * Kopie ohne Bedienung: keine IDs, keine Aktionen, kein Fokus. aria-label bleibt, daran erkennt das Vinyl-Deck die
 * Farbe (cards-vinyl.css), ohne es werden die Farbzeichen zu Vierecken. Der Geist selbst ist aria-hidden.
 */
function strip(el: HTMLElement): void {
  for (const n of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
    for (const a of [...n.attributes]) {
      if (/^(id|tabindex|role|data-act|data-fk|data-drag|data-drop|aria-(?!label$).*)$/.test(a.name))
        n.removeAttribute(a.name);
    }
  }
  el.classList.remove('tb-dragsrc', 'tb-drop-ok', 'tb-drop-hot', 'tb-drop-no');
}

/** Füllt den Geist mit Kopien der Quelle, ein Bündel als kleiner Fächer mit Zahl */
function fillGhost(g: HTMLElement, els: readonly HTMLElement[]): void {
  const n = els.length;
  const shown = els.slice(0, FAN_MAX);
  const step = D.w * FAN_STEP;
  const kids: HTMLElement[] = shown.map((el, i) => {
    const c = el.cloneNode(true) as HTMLElement;
    strip(c);
    c.classList.add('tb-ghost-c');
    const cw = getComputedStyle(el).getPropertyValue('--cw').trim();
    if (cw) c.style.setProperty('--cw', cw);
    c.style.left = `${i * step}px`;
    c.style.width = `${D.w}px`;
    c.style.height = `${D.h}px`;
    const deg = shown.length > 1 ? Math.max(-3, Math.min(3, (i - (shown.length - 1) / 2) * 2)) : 0;
    c.style.transform = deg ? `rotate(${deg}deg)` : 'none';
    return c;
  });
  const lbl = document.createElement('span');
  lbl.className = 'tb-ghost-lbl';
  lbl.hidden = true;
  if (D.lbl && !D.lbl.hidden) {
    lbl.textContent = D.lbl.textContent;
    lbl.hidden = false;
  }
  const parts: HTMLElement[] = [...kids, lbl];
  if (n > 1) {
    const cnt = document.createElement('span');
    cnt.className = 'tb-ghost-n';
    cnt.textContent = `×${n}`;
    parts.push(cnt);
  }
  g.replaceChildren(...parts);
  g.style.width = `${D.w + (shown.length - 1) * step}px`;
  g.style.height = `${D.h}px`;
  D.lbl = lbl;
}

function place(x: number, y: number, tilt: number, scale: number): void {
  D.gx = x;
  D.gy = y;
  if (D.ghost) D.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${tilt}deg) scale(${scale})`;
}

function clearZones(): void {
  for (const z of D.zones) z.el.classList.remove('tb-drop-ok', 'tb-drop-hot', 'tb-drop-no');
  for (const el of document.querySelectorAll('#fly .tb-reach')) el.remove();
  D.zones = [];
  D.over = -1;
}

const targets = (): Target[] => D.zones.map((z) => ({ box: z.box, ok: z.res.ok, pad: z.pad }));

/** Angenommene Flächen aus den aktuellen Rechtecken, mit dem Schalter „Trefferflächen anzeigen“ gestrichelt in #fly */
function layout(): void {
  const c = document.getElementById('center');
  const reach = reachOf(targets(), c ? boxOf(c) : null, D.home);
  D.zones.forEach((z, i) => (z.reach = reach[i]));
  for (const el of document.querySelectorAll('#fly .tb-reach')) el.remove();
  if (!prefs().zones) return;
  const fly = document.getElementById('fly');
  for (const z of D.zones) {
    if (!z.res.ok) continue;
    const el = document.createElement('div');
    el.className = 'tb-reach';
    el.setAttribute('aria-hidden', 'true');
    const r = z.reach;
    el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px`;
    fly?.appendChild(el);
  }
}

/** Ziele messen: alle aus dropsFor (gültig) und jedes andere data-drop am Tisch (zeigt beim Drüberfahren den Grund) */
function measure(v: View): void {
  clearZones();
  const ad = D.ad;
  const key = D.key;
  const t = table();
  if (!ad || !key || !t) return;
  const pad = catchRadius(D.w);
  const add = (k: DropKey, el: HTMLElement): void => {
    if (D.els.includes(el) || D.zones.some((z) => z.el === el || sameDrop(z.key, k))) return;
    const res = dropOf(v, v.me, key, k);
    const box = boxOf(el);
    D.zones.push({ key: k, el, res, box, pad: catches(key, k) ? pad : 0, reach: box });
    if (res.ok) el.classList.add('tb-drop-ok');
  };
  for (const k of dropsFor(v, v.me, key)) {
    const el = ad.zone(k);
    if (el) add(k, el);
  }
  // Auch ungültige zeigen ihr Element aus zone, etwa die Angriffskarte statt des ganzen Durak-Paars
  for (const el of t.querySelectorAll<HTMLElement>('[data-drop]')) {
    const k = dropKeyOf(el.dataset, v.me);
    if (k) add(k, ad.zone(k) ?? el);
  }
  D.home = D.els.map(boxOf);
  layout();
}

/** Nur die Rechtecke neu, etwa nachdem das Karussell gedreht hat */
function remeasure(): void {
  for (const z of D.zones) z.box = boxOf(z.el);
  D.home = D.els.map(boxOf);
  layout();
}

function setOver(i: number, v: View): void {
  const old = D.zones[D.over];
  old?.el.classList.remove('tb-drop-hot', 'tb-drop-no');
  D.over = i;
  const z = D.zones[i];
  const lbl = D.lbl;
  if (!z) {
    if (lbl) lbl.hidden = true;
    return;
  }
  z.el.classList.add(z.res.ok ? 'tb-drop-hot' : 'tb-drop-no');
  const text = z.res.ok ? dragLabel(z.res.say, dctx(v)) : rejectText(z.res.r, ctxOfView(v));
  if (lbl) {
    lbl.textContent = text;
    lbl.hidden = false;
  }
  if (z.res.ok && !D.okSeen) {
    D.okSeen = true;
    haptic('small');
  }
  // shortcut: wer schneller als 600 ms wechselt, hört das letzte Ziel nicht, reicht für die Tipp-Wege daneben
  const tag = JSON.stringify([z.key, z.res.ok]);
  if (tag !== D.said && Date.now() - D.sayAt >= SAY_GAP_MS) {
    D.sayAt = Date.now();
    D.said = tag;
    say(text);
  }
}

/** Ein Frame: Geist setzen, Ziel unter der Fingerspitze prüfen, in Ruhe aufrichten */
function frame(): void {
  D.raf = 0;
  const v = App.view;
  if (!D.on || !D.ghost || !v) return;
  const quiet = calm();
  const hit = hitReach(
    D.x,
    D.y,
    targets(),
    D.zones.map((z) => z.reach),
    D.home,
  );
  if (hit !== D.over) setOver(hit, v);
  let p = ghostAt(D.kind, D.x, D.y, D.dx, D.dy, D.h);
  const z = D.zones[hit];
  // Einrasten nur nahe am Ziel, nicht schon am anderen Ende der Tischmitte
  if (z?.res.ok && !quiet && hitTest(D.x, D.y, [z.box], z.pad) === 0) {
    const mid = { x: (z.box.left + z.box.right - D.w) / 2, y: (z.box.top + z.box.bottom - D.h) / 2 };
    p = towards(p, mid, SNAP_PULL);
  }
  D.tilt = quiet ? 0 : tiltOf(D.tilt, D.x - D.lastX);
  D.lastX = D.x;
  place(p.x, p.y, D.tilt, quiet ? 1 : 1.03);
  if (D.tilt !== 0) D.raf = requestAnimationFrame(frame);
}

const schedule = (): void => {
  if (!D.raf) D.raf = requestAnimationFrame(frame);
};

/** Aus dem Tipp wird ein Ziehen */
function begin(v: View): boolean {
  const ad = D.ad;
  const key = D.key;
  if (!ad || !key || tableBusy() || !canDrag(v, v.me, key)) return false;
  const src = findSource(v, ad, key);
  if (!src?.els.length) return false;
  D.els = src.els;
  const grab = D.els.find((el) => el.contains(document.elementFromPoint(D.x0, D.y0))) ?? D.els[0];
  const r = grab.getBoundingClientRect();
  D.w = r.width;
  D.h = r.height;
  D.dx = D.x0 - r.left;
  D.dy = D.y0 - r.top;
  try {
    table()?.setPointerCapture(D.id);
  } catch {
    // Zeiger schon weg, dann endet es mit dem nächsten Ereignis
  }
  // Wurfleiste und Reaktionsfenster zu (ziehen.md 5.6), am Handy verhindert tableBusy() den Start ohnehin
  closePick();
  document.body.classList.remove('emoopen');
  CAR.hold = Infinity;
  const g = document.createElement('div');
  g.className = 'tb-ghost';
  g.setAttribute('aria-hidden', 'true');
  D.ghost = g;
  D.lbl = null;
  fillGhost(g, D.els);
  document.getElementById('fly')?.appendChild(g);
  for (const el of D.els) el.classList.add('tb-dragsrc');
  html().classList.add('tb-dragging');
  D.on = true;
  D.lastX = D.x;
  measure(v);
  landed = null;
  D.said = '';
  armRest();
  haptic('small');
  const face = ad.face?.(key, v);
  say(DRAG_SR.lift(face ? cardName(face) : grab.getAttribute('aria-label') || DRAG_SR.card, D.els.length), 'mine');
  frame();
  return true;
}

/** Aufräumen nach dem Ziehen. Der Geist bleibt, wer ihn noch braucht, hat ihn schon übernommen. */
function finish(): void {
  if (D.raf) cancelAnimationFrame(D.raf);
  D.raf = 0;
  clearTimeout(D.restT);
  D.restT = 0;
  if (D.on) D.endAt = Date.now();
  clearZones();
  if (D.on) D.ad?.end?.();
  html().classList.remove('tb-dragging');
  try {
    if (D.id !== -1) table()?.releasePointerCapture(D.id);
  } catch {
    // schon freigegeben
  }
  if (D.on) carouselRelease();
  Object.assign(D, {
    id: -1,
    on: false,
    ad: null,
    key: null,
    els: [],
    home: [],
    ghost: null,
    lbl: null,
    tilt: 0,
    okSeen: false,
  });
}

/** Geist weg ohne Zurückfliegen (Quelle ist weg oder Ruhig) */
function fade(g: HTMLElement, els: readonly HTMLElement[]): void {
  const done = (): void => {
    g.remove();
    for (const el of els) el.classList.remove('tb-dragsrc');
  };
  if (typeof g.animate !== 'function') return done();
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' }).onfinish = done;
}

/** Geist fliegt an die Stelle der Quelle zurück, unter Ruhig blendet er nur aus */
function flyBack(g: HTMLElement, els: readonly HTMLElement[]): void {
  const home = els[0]?.isConnected ? els[0].getBoundingClientRect() : null;
  if (calm() || !home || typeof g.animate !== 'function') return fade(g, els);
  const to = `translate3d(${home.left}px, ${home.top}px, 0) rotate(0deg) scale(1)`;
  g.animate([{ transform: g.style.transform }, { transform: to }], {
    duration: BACK_MS,
    easing: EASE,
    fill: 'forwards',
  }).onfinish = () => {
    g.remove();
    for (const el of els) el.classList.remove('tb-dragsrc');
  };
}

/** Wartender Geist hat seine Ansicht bekommen, die Flüge übernehmen ab dragLanded() */
function resolve(): void {
  if (!pend) return;
  clearTimeout(pend.t);
  pend.ghost.remove();
  for (const el of document.querySelectorAll('.tb-dragsrc')) el.classList.remove('tb-dragsrc');
  pend = null;
}

/** Loslassen auf gültigem Ziel */
function drop(v: View, z: Zone & { res: { ok: true } }): void {
  const g = D.ghost;
  const ad = D.ad;
  const key = D.key;
  if (!g || !ad || !key) return finish();
  const quiet = calm();
  const to = quiet
    ? { x: D.gx, y: D.gy }
    : { x: (z.box.left + z.box.right - D.w) / 2, y: (z.box.top + z.box.bottom - D.h) / 2 };
  const [mx, my] = [to.x - D.gx, to.y - D.gy];
  landed = {
    t: Date.now(),
    key,
    rects: [...g.querySelectorAll('.tb-ghost-c')].map((c) => {
      const r = c.getBoundingClientRect();
      return new DOMRect(r.left + mx, r.top + my, r.width, r.height);
    }),
  };
  if (D.lbl) D.lbl.hidden = true;
  const at = `translate3d(${to.x}px, ${to.y}px, 0) rotate(0deg) scale(1)`;
  if (typeof g.animate !== 'function') {
    g.style.opacity = '0';
  } else if (quiet) {
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' });
  } else {
    g.classList.add('tb-ghost-down');
    g.animate([{ transform: g.style.transform }, { transform: at }], {
      duration: GLIDE_MS,
      easing: EASE,
      fill: 'forwards',
    });
  }
  g.style.transform = at;
  pend = { key, ad, ghost: g, n: maxLog(v), act: z.res.a.type, t: setTimeout(back, WAIT_MS) };
  say(dragLabel(z.res.say, dctx(v)), 'mine');
  finish();
  ad.commit(v, z.res.a);
}

/** Wartender Geist fliegt zurück (Ablehnung oder keine Antwort) */
function back(): void {
  if (!pend) return;
  const p = pend;
  clearTimeout(p.t);
  pend = null;
  landed = null;
  const v = App.view;
  const src = v ? findSource(v, p.ad, p.key) : null;
  p.ghost.classList.remove('tb-ghost-down');
  p.ghost.style.opacity = '';
  flyBack(p.ghost, src?.els ?? [...document.querySelectorAll<HTMLElement>('.tb-dragsrc')]);
}

/** Laufendes Ziehen ohne Abwurf beenden */
function abort(): void {
  const g = D.ghost;
  const els = D.els;
  finish();
  if (g) flyBack(g, els);
}

function onDown(e: PointerEvent): void {
  if (D.id !== -1) {
    // zweiter Finger: zurück, ohne Meldung
    if (e.pointerId !== D.id) abort();
    return;
  }
  if (pend || !e.isPrimary || e.button !== 0) return;
  const t = e.target instanceof Element ? e.target : null;
  if (!t || t.closest('#opps')) return;
  const el = t.closest<HTMLElement>('[data-drag]');
  const v = App.view;
  const ad = adapterOf(v);
  if (!el || !v || !ad || !prefs().drag || tableBusy()) return;
  const src = ad.source(el, v);
  if (!src || !canDrag(v, v.me, src.key)) return;
  Object.assign(D, { id: e.pointerId, kind: pointerKind(e.pointerType), ad, key: src.key, els: src.els });
  D.x0 = D.x = e.clientX;
  D.y0 = D.y = e.clientY;
}

function onMove(e: PointerEvent): void {
  if (e.pointerId !== D.id) return;
  D.x = e.clientX;
  D.y = e.clientY;
  if (!D.on) {
    if (!pastSlop(D.kind, D.x - D.x0, D.y - D.y0)) return;
    const v = App.view;
    if (!v || !begin(v)) return finish();
  }
  e.preventDefault();
  if (Math.hypot(D.x - D.rx, D.y - D.ry) > REST_SLOP) armRest();
  schedule();
}

/** Ruhenden Finger neu messen: nach REST_MS ohne nennenswerte Bewegung fragt der Motor den Adapter */
function armRest(): void {
  clearTimeout(D.restT);
  D.rx = D.x;
  D.ry = D.y;
  D.restT = D.ad?.rest ? setTimeout(onRest, REST_MS) : 0;
}

function onRest(): void {
  const v = App.view;
  if (!D.on || !v || !D.ad?.rest) return;
  D.ad.rest(D.x, D.y, v);
  remeasure();
  schedule();
  D.restT = setTimeout(onRest, REST_MS);
}

function onUp(e: PointerEvent): void {
  if (e.pointerId !== D.id) return;
  if (!D.on) return finish();
  D.x = e.clientX;
  D.y = e.clientY;
  if (D.raf) cancelAnimationFrame(D.raf);
  frame();
  const v = App.view;
  const z = D.zones[D.over];
  if (!v || !z) {
    say(DRAG_SR.back);
    return abort();
  }
  if (z.res.ok) return drop(v, z as Zone & { res: { ok: true } });
  // Ungültig: nichts geht raus, die Quelle wackelt, der Grund steht am Ziel
  const text = rejectText(z.res.r, ctxOfView(v));
  const els = D.els;
  abort();
  for (const el of els) shakeEl(el);
  fixedLabel('nopelbl', text, z.el, 2600, 14);
  say(text, 'mine');
}

/** Am Ende von renderTable */
function refresh(v: View): void {
  const ad = adapterOf(v);
  html().classList.toggle('tb-drag', !!ad && prefs().drag && v.phase !== 'lobby');
  if (pend) {
    const src = findSource(v, pend.ad, pend.key);
    if (!src || !canDrag(v, v.me, pend.key) || ownAfter(v, pend.n)) resolve();
    else for (const el of src.els) el.classList.add('tb-dragsrc');
  }
  if (D.id === -1) return;
  if (!D.on) {
    // angetippt, noch kein Ziehen: die Elemente sind neu, begin() sucht die Quelle über den Schlüssel
    if (tableBusy() || ad !== D.ad) finish();
    return;
  }
  if (tableBusy() || !prefs().drag || ad !== D.ad || !D.key || !ad) return abort();
  const src = findSource(v, ad, D.key);
  if (!src) {
    // Quelle ist ganz weg (Uhr, KI): ausblenden statt zurückfliegen
    const g = D.ghost;
    const els = D.els;
    finish();
    if (g) fade(g, els);
    return;
  }
  if (!canDrag(v, v.me, D.key)) return abort();
  D.els = src.els;
  for (const el of D.els) el.classList.add('tb-dragsrc');
  // Neu füllen, damit der Geist der Ansicht folgt (Cabo-Einblendung dreht ihn um)
  if (D.ghost) fillGhost(D.ghost, D.els);
  measure(v);
  frame();
}

function cancel(why: 'cancel' | 'view' | 'reject', act?: string | null): void {
  // Ablehnung holt nur den abgelegten Geist zurück und nur, wenn sie zu seinem Zug gehört, ein laufendes Ziehen bleibt
  if (why === 'reject') {
    if (pend && act === pend.act) back();
    return;
  }
  if (D.id === -1) return;
  if (!D.on) return finish();
  abort();
}

/**
 * Klick-Wächter in der Capture-Phase: Zeiger-Klicks direkt nach einem Ziehen schalten am Tisch keine Auswahl um. Alle
 * Quellen liegen in #table, auch der Klick nach dem Loslassen (der Zeiger hängt an #table). Was außerhalb liegt
 * (Menü, Verlauf am PC, Fenster), nimmt den Tipp sofort an.
 */
function guard(e: MouseEvent): void {
  const t = table();
  if (e.detail > 0 && Date.now() - D.endAt < GUARD_MS && t && e.target instanceof Node && t.contains(e.target)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

let started: DragMotor | null = null;

/** Hängt die Zeiger an, einmal. Aufgerufen von initDrag in ./drag.ts. */
export function startMotor(): DragMotor {
  if (started) return started;
  table()?.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === D.id) cancel('cancel');
  });
  window.addEventListener('click', guard, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && D.on) cancel('cancel');
  });
  window.addEventListener('resize', () => cancel('cancel'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel('cancel');
  });
  table()?.addEventListener('dragstart', (e) => {
    if (D.id !== -1) e.preventDefault();
  });
  document.getElementById('opps')?.addEventListener('transitionend', () => {
    if (D.on) remeasure();
  });
  started = {
    refresh,
    cancel,
    landed: () => (landed && Date.now() - landed.t < WAIT_MS ? { key: landed.key, rects: landed.rects } : null),
  };
  return started;
}

/* Kartenflüge, Konfetti, Emoji-Reaktionen. Alles läuft mit der Web Animations API in der Ebene #fly. */
import { EMOTES } from '../game/constants';
import type { Card, LastMove, View } from '../game/types';
import { App } from './app';
import { cardHTML } from './cards';
import { $, $opt, reduceMotion } from './dom';
import { haptic } from './a11y/haptic';
import { panelFor, shakeEl } from './feedback';
import { pById } from './helpers';
import { paletteOf } from './look';
import { prefs } from './prefs';
import { sfx, sfxCalm } from './sound';
import { dragLanded } from './table/drag';

const EASE = 'cubic-bezier(.3,.7,.2,1)';

function elAt(sel: string, i: number): HTMLElement | null {
  return (document.querySelectorAll<HTMLElement>(sel)[i] as HTMLElement | undefined) ?? null;
}

function cardElFor(pid: string | undefined, i: number): HTMLElement | null {
  const root = pid === App.me ? $opt('#me .hand') : $opt(`.opp[data-pid="${pid}"] .ocards`);
  return root ? (root.querySelectorAll<HTMLElement>('.card')[i] ?? null) : null;
}

const midEl = (i: number) => elAt('#center .middle .card', i);

function deckTop(): HTMLElement | null {
  const d = document.querySelectorAll<HTMLElement>('#center .deck .card');
  return d[d.length - 1] ?? null;
}

function cardGhost(card: Card | null | undefined): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = cardHTML(card ?? null);
  return wrap.firstElementChild as HTMLElement;
}

interface FlyOptions {
  /** Startrechteck nach einem Abwurf (dragLanded): ersetzt die Lage von fromEl, die Karte gleitet ohne Bogen ins Ziel */
  from?: Rect;
  hide?: boolean;
  fadeIn?: boolean;
  fadeOut?: boolean;
  flipBack?: boolean;
  spin?: number;
  dur?: number;
  delay?: number;
}

/** Schnautz: Eine Karte fliegt von einem Element zu einem anderen. Das Ziel bleibt so lange unsichtbar. */
function fly(
  fromEl: HTMLElement | null,
  toEl: HTMLElement | null,
  card: Card | null | undefined,
  o: FlyOptions = {},
): void {
  const a = o.from ?? fromEl?.getBoundingClientRect();
  if (!a || !toEl || !toEl.isConnected) return;
  const b = toEl.getBoundingClientRect();
  const w = toEl.offsetWidth;
  const hh = toEl.offsetHeight;
  const w0 = (o.from ? o.from.width : fromEl?.offsetWidth) || w;
  const arc = o.from ? 0 : 46;
  if (!w || !hh) return;
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  const dx = a.left + a.width / 2 - cx;
  const dy = a.top + a.height / 2 - cy;
  const g = cardGhost(card);
  g.style.cssText = `position:fixed; left:${cx - w / 2}px; top:${cy - hh / 2}px; --cw:${w}px; z-index:44; pointer-events:none; transition:none`;
  $('#fly').appendChild(g);
  const rot = getComputedStyle(toEl).getPropertyValue('--rot').trim() || '0deg';
  const s0 = w0 / w;
  if (o.hide !== false) toEl.style.visibility = 'hidden';
  App.flying++;
  const anim = g.animate(
    [
      { transform: `translate(${dx}px,${dy}px) scale(${s0})`, opacity: o.fadeIn ? 0 : 1 },
      {
        transform: `translate(${dx / 2}px,${dy / 2 - arc}px) scale(${((s0 + 1) / 2) * 1.1}) rotate(${o.spin ?? 0}deg)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `rotate(${rot})`, opacity: o.fadeOut ? 0 : 1 },
    ],
    { duration: o.dur ?? 640, delay: o.delay ?? 0, easing: EASE, fill: 'both' },
  );
  const done = () => {
    g.remove();
    toEl.style.visibility = '';
    App.flying = Math.max(0, App.flying - 1);
  };
  anim.onfinish = () => {
    if (o.flipBack) {
      g.animate([{ transform: `rotate(${rot}) scaleX(1)` }, { transform: `rotate(${rot}) scaleX(0)` }], {
        duration: 150,
        fill: 'forwards',
      }).onfinish = done;
    } else done();
  };
}

const asCards = (x: LastMove['take']): Card[] => (Array.isArray(x) ? x : []);

/** Schnautz: zeigt, welche Karten genommen und abgelegt wurden. */
export function runFlights(prev: View, v: View): void {
  const L = v.last;
  if (v.game !== 'schnautz' || !L) return;
  if (prev.last?.n === L.n || L.n <= App.flownN) return;
  App.flownN = L.n;
  if (reduceMotion()) return;
  const me = L.p === App.me;
  const hidden = !me && v.phase !== 'end' && v.phase !== 'over';
  if (L.k === 'swap' && L.h != null && L.m != null) {
    const hEl = cardElFor(L.p, L.h);
    const mEl = midEl(L.m);
    // Per Ziehen getauscht: die gezogene Karte fliegt dort weiter, wo der Finger sie losließ
    const d = me ? dragLanded() : null;
    const at = (from: 'hand' | 'mid'): Rect | undefined =>
      d?.key.g === 'schnautz' && d.key.from === from ? d.rects[0] : undefined;
    fly(hEl, mEl, L.give as Card, { spin: -8, from: at('hand') });
    fly(mEl, hEl, L.take as Card, { delay: 90, flipBack: hidden, spin: 8, from: at('mid') });
  } else if (L.k === 'swapAll' && L.give && L.take) {
    const give = asCards(L.give);
    const take = asCards(L.take);
    for (let i = 0; i < 3; i++) {
      fly(cardElFor(L.p, i), midEl(i), give[i], { delay: i * 80, spin: -6 });
      fly(midEl(i), cardElFor(L.p, i), take[i], { delay: 120 + i * 80, flipBack: hidden, spin: 6 });
    }
  } else if (L.k === 'take' && L.give) {
    const give = asCards(L.give);
    const mine = v.hands[App.me];
    for (let i = 0; i < 3; i++) {
      fly(cardElFor(L.p, i), midEl(i), give[i], { delay: i * 80 });
      fly(midEl(i), cardElFor(L.p, i), me && Array.isArray(mine) ? mine[i] : null, { delay: 140 + i * 80 });
    }
  } else if (L.k === 'keep') {
    document.querySelectorAll<HTMLElement>('#center .middle .card').forEach((c, k) => {
      c.style.animationDelay = `${k * 0.08}s`;
      c.classList.add('flipin');
    });
  } else if (L.k === 'renew' && L.old) {
    const dk = deckTop();
    for (let i = 0; i < 3; i++) {
      fly(midEl(i), dk, L.old[i], { delay: i * 60, fadeOut: true, hide: false, dur: 520 });
      fly(dk, midEl(i), v.middle[i], { delay: 380 + i * 110, spin: 10 });
    }
  }
  App.holdUntil = Math.max(App.holdUntil, Date.now() + 900);
}

/** Lässt den Bereich von Spielern wackeln, die gerade ein Leben verloren haben. */
export function markLost(lost: Record<string, true>, v: View): void {
  Object.keys(lost).forEach((id) => {
    if (!pById(v, id)) return;
    document.querySelectorAll<HTMLElement>(`[data-pid="${id}"]`).forEach((box) => {
      box.querySelector('.coaster.lost')?.classList.add('justlost');
      box.classList.remove('hit');
      void box.offsetWidth;
      box.classList.add('hit');
    });
  });
}

interface FallOptions {
  n: number;
  /** Seitliche Drift in px (gesamt). */
  spread: number;
  /** Start- und Endpunkt relativ zum oberen und unteren Bildschirmrand. */
  startY: number;
  endBelow: number;
  /** Enddrehung in Grad. */
  rot: () => number;
  endOpacity: number;
  /** Dauer: Basis plus zufälliger Anteil, in ms. */
  dur: [base: number, random: number];
  maxDelay: number;
  easing: string;
}

/** Lässt Elemente von oben über den ganzen Bildschirm fallen. */
function fall(make: (i: number) => HTMLElement, o: FallOptions): void {
  // Weniger Bewegung gewünscht: kein Konfetti und kein Regen
  if (reduceMotion()) return;
  const layer = $('#fly');
  for (let i = 0; i < o.n; i++) {
    const c = make(i);
    const dx = (Math.random() - 0.5) * o.spread;
    layer.appendChild(c);
    c.animate(
      [
        { transform: `translate(0,${o.startY}px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${dx}px,${innerHeight + o.endBelow}px) rotate(${o.rot()}deg)`, opacity: o.endOpacity },
      ],
      {
        duration: o.dur[0] + Math.random() * o.dur[1],
        delay: Math.random() * o.maxDelay,
        easing: o.easing,
        fill: 'forwards',
      },
    ).onfinish = () => c.remove();
  }
}

export interface ConfettiOptions {
  colors?: string[];
  n?: number;
  dur?: [number, number];
  /** Zusätzliche Teile als Zeichen, etwa ein paar 💩 */
  extra?: { ch: string; n: number }[];
  /** Klasse für alle Teile, damit sie sich gezielt ausblenden lassen */
  cls?: string;
}

export function confetti(o: ConfettiOptions = {}): void {
  const colors = o.colors ?? paletteOf(prefs().look, 'party');
  const chars = (o.extra ?? []).flatMap((x) => Array.from({ length: x.n }, () => x.ch));
  const n = o.n ?? 70;
  fall(
    (i) => {
      const c = document.createElement('i');
      const ch = i >= n ? chars[i - n] : '';
      c.className = `confetti${ch ? ' ch' : ''}${o.cls ? ` ${o.cls}` : ''}`;
      if (ch) {
        c.textContent = ch;
        c.style.cssText = `left:${Math.random() * innerWidth}px; font-size:${18 + Math.random() * 10}px; background:none`;
      } else
        c.style.cssText = `left:${Math.random() * innerWidth}px; background:${colors[i % colors.length]}; width:${6 + Math.random() * 6}px; height:${8 + Math.random() * 10}px`;
      return c;
    },
    {
      n: n + chars.length,
      spread: 240,
      startY: -40,
      endBelow: 60,
      rot: () => Math.random() * 720,
      endOpacity: 0.9,
      dur: o.dur ?? [1800, 1400],
      maxDelay: 400,
      easing: 'cubic-bezier(.2,.6,.4,1)',
    },
  );
}

/** Brauner Spritzer rund um einen Punkt, für den landenden Haufen. */
function splash(x: number, y: number, colors: readonly string[], n = 12): void {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'zersplash';
    const size = 5 + Math.random() * 8;
    s.style.cssText = `left:${x}px; top:${y}px; width:${size}px; height:${size}px; background:${colors[i % colors.length]}`;
    $('#fly').appendChild(s);
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const dist = 34 + Math.random() * 56;
    s.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist * 0.7 + 14}px)) scale(.5)`,
          opacity: 0,
        },
      ],
      { duration: 620 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    ).onfinish = () => s.remove();
    setTimeout(() => s.remove(), 1200);
  }
}

const POO_SPLASH = ['#7a4a1f', '#9c6b3a', '#5e3714', '#b07a42'];

/**
 * Ein Zeichen plumpst von oben mitten auf ein Element: staucht sich, spritzt, der Platz wackelt, es macht plopp.
 * `stay`: so lange bleibt es liegen.
 */
export function dropOn(el: HTMLElement, ch: string, onLand?: () => void, stay = 3200): void {
  const r = el.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'zerdrop';
  d.textContent = ch;
  // Am eigenen Platz liegen rechts oben Knöpfe und unten die Karten, dort landet der Haufen auf der Namenszeile
  const x = r.left + r.width / 2;
  const y = el.id === 'me' ? r.top + Math.min(r.height * 0.18, 40) : r.top + r.height * 0.42;
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  $('#fly').appendChild(d);
  const a = d.animate(
    [
      { transform: 'translate(-50%, calc(-50% - 260px)) scale(.8) rotate(-14deg)', opacity: 0 },
      { transform: 'translate(-50%, calc(-50% - 60px)) scale(1) rotate(6deg)', opacity: 1, offset: 0.55 },
      { transform: 'translate(-50%, -38%) scale(1.45, .6)', opacity: 1, offset: 0.78 },
      { transform: 'translate(-50%, -54%) scale(.92, 1.12)', opacity: 1, offset: 0.9 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
    ],
    { duration: 820, easing: 'cubic-bezier(.45,0,.75,.5)', fill: 'forwards' },
  );
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    sfx('plop');
    splash(x, y + 10, POO_SPLASH);
    shakeEl(el);
    if (el.id === 'me') haptic('big');
    onLand?.();
  };
  // Der Aufprall ist bei 78 Prozent, dort spritzt es
  setTimeout(land, 820 * 0.78);
  a.onfinish = () => {
    land();
    setTimeout(() => {
      d.style.transition = 'opacity .4s';
      d.style.opacity = '0';
      setTimeout(() => d.remove(), 450);
    }, stay);
  };
}

/** Regen aus Emojis, etwa Kackhaufen für den Shithead. */
export function rain(ch: string, n: number): void {
  fall(
    () => {
      const c = document.createElement('i');
      c.className = 'rainp';
      c.textContent = ch;
      c.style.cssText = `left:${Math.random() * innerWidth}px; font-size:${22 + Math.random() * 26}px`;
      return c;
    },
    {
      n,
      spread: 180,
      startY: 0,
      endBelow: 120,
      rot: () => (Math.random() - 0.5) * 540,
      endOpacity: 0.95,
      dur: [2200, 1600],
      maxDelay: 800,
      easing: 'cubic-bezier(.35,.4,.6,1)',
    },
  );
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FlyGOptions {
  /**
   * Startrechteck nach einem Abwurf (dragLanded): ersetzt fromR, die Karte startet in dessen Größe und gleitet ohne
   * Bogen ins Ziel. s0 und arc gelten dann nicht.
   */
  from?: Rect;
  /** Breite der fliegenden Karte am Ziel. */
  w?: number;
  /** Skalierung am Start und am Ziel. */
  s0?: number;
  s1?: number;
  /** Drehung am Ziel, etwa die zufällige Lage auf dem Stapel. */
  rot?: string;
  arc?: number;
  spin?: number;
  dur?: number;
  delay?: number;
  fade?: boolean;
  /** Verdeckt starten und im Flug umdrehen. */
  flip?: boolean;
  /** Dieses Element bleibt unsichtbar, bis die Karte gelandet ist. */
  hideEl?: HTMLElement;
  /** Ebene der fliegenden Karte, sonst 44 */
  z?: number;
  /** Zeitlupe ab der Mitte des Flugs: `extra` Millisekunden länger, Rückrufe beim Bremsen und Landen */
  slow?: { extra: number; onSlow?: () => void; onLand?: () => void };
}

/** Bei dieser Kurve ist die Hälfte des Wegs nach rund 19 Prozent der Zeit geschafft. */
const EASE_HALF = 0.188;

/** Shithead: allgemeiner Kartenflug zwischen zwei Rechtecken, optional mit Umdrehen. */
export function flyG(
  fromR: Rect | null | undefined,
  toR: Rect | null | undefined,
  card: Card | null,
  o: FlyGOptions = {},
): void {
  const from = o.from ?? fromR;
  if (!from || !toR || !toR.width) return;
  const w = o.w ?? 80;
  const h = w * 1.4;
  const s0 = o.from ? o.from.width / w : (o.s0 ?? 1);
  const s1 = o.s1 ?? 1;
  const cx = toR.left + toR.width / 2;
  const cy = toR.top + toR.height / 2;
  const dx = from.left + from.width / 2 - cx;
  const dy = from.top + from.height / 2 - cy;
  let g: HTMLElement;
  if (o.flip) {
    g = document.createElement('div');
    g.className = 'g3d';
    g.innerHTML = cardHTML(card) + cardHTML(null, 'gb');
  } else {
    g = cardGhost(card);
  }
  g.style.cssText = `position:fixed; left:${cx - w / 2}px; top:${cy - h / 2}px; width:${w}px; height:${h}px; --cw:${w}px; z-index:${o.z ?? 44}; pointer-events:none; transition:none`;
  $('#fly').appendChild(g);
  const rot = o.rot ?? '0deg';
  const arc = o.from ? 0 : (o.arc ?? 54);
  const pre = o.flip ? 'perspective(900px) ' : '';
  const flipAt = (deg: number) => (o.flip ? ` rotateY(${deg}deg)` : '');
  const k0 = `${pre}translate(${dx}px,${dy}px) scale(${s0})${flipAt(180)}`;
  const k1 = `${pre}translate(${dx / 2}px,${dy / 2 - arc}px) scale(${((s0 + s1) / 2) * 1.12}) rotate(${o.spin ?? 0}deg)${flipAt(90)}`;
  const k2 = `${pre}translate(0px,0px) scale(${s1}) rotate(${rot})${flipAt(0)}`;
  if (o.hideEl) o.hideEl.style.visibility = 'hidden';
  App.flying++;
  const dur = o.dur ?? 620;
  const delay = o.delay ?? 0;
  const anim = g.animate(
    [
      { transform: k0, opacity: 1 },
      { transform: k1, opacity: 1, offset: 0.5 },
      { transform: k2, opacity: o.fade ? 0 : 1 },
    ],
    { duration: dur, delay, easing: EASE, fill: 'both' },
  );
  const fin = () => {
    if (!g.parentNode) return;
    g.remove();
    if (o.hideEl) o.hideEl.style.visibility = '';
    App.flying = Math.max(0, App.flying - 1);
    o.slow?.onLand?.();
  };
  anim.onfinish = fin;
  const extra = o.slow?.extra ?? 0;
  if (o.slow) {
    // Normales Tempo bis zur Mitte, dann so gebremst, dass die Karte genau `extra` später landet
    const rest = dur * (1 - EASE_HALF);
    setTimeout(
      () => {
        if (!g.parentNode) return;
        const rate = rest / (rest + extra);
        if (typeof anim.updatePlaybackRate === 'function') anim.updatePlaybackRate(rate);
        else anim.playbackRate = rate;
        o.slow?.onSlow?.();
      },
      delay + dur * EASE_HALF,
    );
  }
  // Im Hintergrund-Tab laufen Animationen nicht, dann räumt der Timer auf
  setTimeout(fin, dur + delay + extra + 400);
}

/** Emoji-Reaktion steigt groß über dem Platz des Absenders auf. */
export function emojiFly(pid: string | undefined, ch: string): void {
  if (!EMOTES.includes(ch)) return;
  const src = panelFor(pid) ?? $opt('#center');
  if (!src) return;
  const r = src.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'emo';
  el.textContent = ch;
  const x = r.left + r.width / 2 + (Math.random() - 0.5) * 70;
  const y = r.top + Math.min(r.height / 2, 90);
  el.style.left = `${x - 33}px`;
  el.style.top = `${y - 33}px`;
  $('#fly').appendChild(el);
  const tilt = (Math.random() - 0.5) * 34;
  el.animate(
    [
      { transform: 'translateY(20px) scale(.4)', opacity: 0 },
      { transform: `translateY(-30px) scale(1.55) rotate(${tilt}deg)`, opacity: 1, offset: 0.22 },
      { transform: `translateY(-90px) scale(1.25) rotate(${-tilt}deg)`, opacity: 1, offset: 0.7 },
      { transform: 'translateY(-160px) scale(1)', opacity: 0 },
    ],
    { duration: 1900, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
  ).onfinish = () => el.remove();
  setTimeout(() => el.remove(), 2400);
  // Ein gemeinsamer Ton für alle Reaktionen, damit man hört, dass etwas passiert ist
  sfxCalm('pop', 120);
}

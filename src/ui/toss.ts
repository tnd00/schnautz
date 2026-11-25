/*
 * Wurfgeschosse: Tomate, Ei, Kackhaufen und Krone fliegen im Bogen zu jemandem und kleben dort ein paar Sekunden.
 * Ein Wurf ist nur ein Logeintrag, alles Sichtbare lebt hier im Browser mit eigenen Timern, nie an CSS-Animationen.
 */
import { TOSS_GAP_MS, TOSS_ICON, TOSS_LIFE_MS } from '../game/constants';
import type { LogEntry, Player, TossItem, View } from '../game/types';
import { App } from './app';
import { burst } from './burst';
import { carouselRelease, carouselShow, offscreen } from './carousel';
import { $, $opt, esc, reduceMotion, type Timer } from './dom';
import { floatLabel, shakeEl } from './feedback';
import { seatOrder } from './helpers';
import { sfx, type SoundName } from './sound';

export type TossEntry = Extract<LogEntry, { k: 'toss' }>;

interface TossMark {
  item: TossItem;
  by: string;
  at: number;
  until: number;
  t: Timer;
}

export const TOSS = {
  marks: new Map<string, TossMark[]>(),
  hintAt: 0,
  sfxAt: 0,
  flights: 0,
  /** Eigener Wurf auf eine Kachel am Rand: Flug erst, wenn das Karussell fertig gedreht hat */
  waitUntil: 0,
  back: null as Timer | null,
  /** Für wen die kleine Wurfleiste offen ist */
  pick: null as string | null,
};

export const TOSS_TEXT: Readonly<
  Record<TossItem, { hit: string; title: string; ask: string; btn: string; on: string }>
> = {
  tomato: {
    hit: 'wirft eine Tomate auf dich',
    title: 'Tomate von',
    ask: 'Tomate auf wen?',
    btn: 'Tomate werfen',
    on: 'Tomate auf',
  },
  egg: { hit: 'wirft ein Ei auf dich', title: 'Ei von', ask: 'Ei auf wen?', btn: 'Ei werfen', on: 'Ei auf' },
  poo: {
    hit: 'wirft einen Kackhaufen auf dich',
    title: 'Kackhaufen von',
    ask: 'Kackhaufen auf wen?',
    btn: 'Kackhaufen werfen',
    on: 'Kackhaufen auf',
  },
  crown: { hit: 'krönt dich', title: 'Gekrönt von', ask: 'Wen krönst du?', btn: 'Krone aufsetzen', on: 'Krone für' },
  heart: {
    hit: 'wirft dir ein Herz zu',
    title: 'Herz von',
    ask: 'Herz für wen?',
    btn: 'Herz zuwerfen',
    on: 'Herz für',
  },
  bunny: {
    hit: 'schickt dir einen Hasen',
    title: 'Hase von',
    ask: 'Hase zu wem?',
    btn: 'Hasen schicken',
    on: 'Hase zu',
  },
};

const ITEMS: readonly TossItem[] = ['tomato', 'egg', 'poo', 'crown', 'heart', 'bunny'];
const SFX_OF: Readonly<Record<TossItem, SoundName>> = {
  tomato: 'splat',
  egg: 'crack',
  poo: 'plop',
  crown: 'crown',
  heart: 'love',
  bunny: 'smack',
};
/** Tomate und Ei sind Kleckse aus CSS, alles andere steht als Zeichen da */
const BLOB: readonly TossItem[] = ['tomato', 'egg'];
const FLY_MS = 650;
const MAX_MARKS = 3;
const MAX_FLIGHTS = 8;
const FADE_MS = 300;

const nameOf = (pid: string): string =>
  pid === App.me ? 'Du' : (App.view?.players.find((p) => p.id === pid)?.name ?? '');

/** Wo steht diese Person gerade? Ergebniszeile, eigener Platz oder Gegnerkachel. `edge`: nicht ganz zu sehen. */
export function tossAnchor(pid: string): { el: HTMLElement; edge: boolean; mark: boolean } | null {
  const modal = $opt('#overlay .modal');
  if (modal) {
    const row = modal.querySelector<HTMLElement>(`[data-pid="${CSS.escape(pid)}"]`);
    if (row) return { el: row, edge: false, mark: true };
    const h = modal.querySelector<HTMLElement>('h2');
    return h ? { el: h, edge: true, mark: false } : null;
  }
  if (pid === App.me) {
    const el = $opt('#me .mehead .nm') ?? $opt('#me .swhead b') ?? $opt('#me');
    return el ? { el, edge: false, mark: true } : null;
  }
  const box = $opt(`#opps .opp[data-pid="${CSS.escape(pid)}"]`);
  return box ? { el: box, edge: offscreen(box), mark: true } : null;
}

/** Punkt am nächsten Rand der Gegnerleiste, für Kacheln, die gerade nicht im Bild sind. */
export function clampToOpps(r: DOMRect): { x: number; y: number } {
  const o = $('#opps').getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const x = Math.min(Math.max(cx, o.left + 8, 8), Math.min(o.right - 8, window.innerWidth - 8));
  return { x, y: Math.min(Math.max(r.top + r.height / 2, o.top + 10), o.bottom - 10) };
}

function centerOf(a: { el: HTMLElement; edge: boolean }): { x: number; y: number } {
  const r = a.el.getBoundingClientRect();
  if (a.edge && a.el.matches('.opp')) return clampToOpps(r);
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 60) };
}

/** Wer ein Ziel hat, steht in der Auswahl, in Sitzreihenfolge. */
export function tossTargets(v: View | null): Player[] {
  if (!v) return [];
  return seatOrder(v).filter((p) => p.id !== App.me && !!tossAnchor(p.id));
}

/** Neuer Wurf aus dem Verlauf: fliegen lassen und am Ziel festkleben. */
export function playToss(e: TossEntry): void {
  const to = tossAnchor(e.to);
  if (!to) return;
  const mine = e.p === App.me;
  const start = (): void => {
    if (reduceMotion() || TOSS.flights >= MAX_FLIGHTS) {
      land(e);
      return;
    }
    const fromA = e.p ? tossAnchor(e.p) : null;
    const goal = tossAnchor(e.to);
    if (!goal) return;
    const a = fromA ? centerOf(fromA) : { x: window.innerWidth / 2, y: window.innerHeight };
    const b = centerOf(goal);
    fly(a, b, e.item, goal.edge, () => {
      if (goal.edge) edgeLabel(b, e);
      land(e);
    });
  };
  const wait = mine ? TOSS.waitUntil - Date.now() : 0;
  if (wait > 0) setTimeout(start, wait);
  else start();
}

function fly(
  a: { x: number; y: number },
  b: { x: number; y: number },
  item: TossItem,
  fade: boolean,
  onLand: () => void,
) {
  const el = document.createElement('div');
  el.className = `tossfly ${item}`;
  el.textContent = TOSS_ICON[item];
  el.style.left = `${a.x}px`;
  el.style.top = `${a.y}px`;
  $('#fly').appendChild(el);
  TOSS.flights++;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const arc = item === 'poo' || item === 'bunny' ? 150 : item === 'crown' || item === 'heart' ? 40 : 70;
  const spin = item === 'tomato' || item === 'egg' ? 540 : item === 'poo' ? 200 : 0;
  const frames: Keyframe[] = [
    { transform: 'translate(-50%, -50%) scale(.7) rotate(0deg)', opacity: 0.9 },
    {
      transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - arc}px)) scale(1.15) rotate(${spin / 2}deg)`,
      opacity: 1,
      offset: 0.5,
    },
    {
      transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${item === 'poo' ? '1.2, .8' : '1'}) rotate(${spin}deg)`,
      opacity: fade ? 0 : 1,
    },
  ];
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    TOSS.flights = Math.max(0, TOSS.flights - 1);
    el.remove();
    onLand();
  };
  const an = el.animate(frames, { duration: FLY_MS, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'forwards' });
  an.onfinish = finish;
  setTimeout(finish, FLY_MS + 400);
}

/** Ziel ist nicht im Bild: kleines Schild am Rand, wen es getroffen hat. */
function edgeLabel(p: { x: number; y: number }, e: TossEntry): void {
  const l = document.createElement('div');
  l.className = 'tosslbl';
  l.textContent = `${TOSS_ICON[e.item]} ${nameOf(e.to)}`;
  l.style.left = `${Math.min(Math.max(p.x, 50), window.innerWidth - 50)}px`;
  l.style.top = `${p.y}px`;
  $('#fly').appendChild(l);
  setTimeout(() => l.remove(), 1200);
}

function land(e: TossEntry): void {
  const now = Date.now();
  const life = TOSS_LIFE_MS[e.item];
  const list = (TOSS.marks.get(e.to) ?? []).filter((m) => m.until > now);
  while (list.length >= MAX_MARKS) clearTimeout(list.shift()!.t);
  const mark: TossMark = {
    item: e.item,
    by: e.p ?? '',
    at: now,
    until: now + life,
    t: setTimeout(() => expire(e.to, mark), life),
  };
  list.push(mark);
  TOSS.marks.set(e.to, list);
  markTosses();
  const mine = e.p === App.me;
  const hitMe = e.to === App.me;
  if (now - TOSS.sfxAt >= 400) {
    TOSS.sfxAt = now;
    sfx(SFX_OF[e.item], mine || hitMe ? 1 : 0.5);
  }
  if (BLOB.includes(e.item)) {
    const box = $opt(`#opps .opp[data-pid="${CSS.escape(e.to)}"]`);
    if (box && !$opt('#overlay .modal')) shakeEl(box);
  }
  if (hitMe) hitMeFx(e.item);
  if (hitMe && e.p && now - TOSS.hintAt >= 1500) {
    TOSS.hintAt = now;
    floatLabel(e.p, TOSS_TEXT[e.item].hit);
  }
  if (mine) {
    if (TOSS.back) clearTimeout(TOSS.back);
    TOSS.back = setTimeout(() => {
      TOSS.back = null;
      carouselRelease();
    }, 1500);
  }
}

/** Farben der Spritzer, wenn es mich trifft */
const HIT_COLORS: Readonly<Record<TossItem, readonly string[]>> = {
  tomato: ['#e0362b', '#ff7a66', '#b21c16'],
  egg: ['#ffcb2e', '#f8f3e4', '#f6a91d'],
  poo: ['#7a4a1f', '#9c6b3a', '#5e3714'],
  crown: ['#f3cd7d', '#ffe9a8', '#d6a24a'],
  heart: ['#ff5a78', '#ff9db0', '#e0365a'],
  bunny: ['#f6efdf', '#ffd1dc', '#e8dccb'],
};

/**
 * Volltreffer auf mich: Das Ding klatscht groß auf den eigenen Platz, der Rand färbt sich, es spritzt und wackelt.
 * Bei weniger Bewegung bleibt nur der farbige Rand.
 */
function hitMeFx(item: TossItem): void {
  const flash = document.createElement('div');
  flash.className = `hitflash ${item}`;
  $('#fly').appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
  try {
    navigator.vibrate?.([50, 40, 90]);
  } catch {
    /* Vibrieren ist nur Zierde */
  }
  if (reduceMotion()) return;
  const modal = $opt('#overlay .modal');
  const anchor = modal ? tossAnchor(App.me)?.el : $opt('#me');
  if (!anchor) return;
  if (!modal) shakeEl(anchor);
  const r = anchor.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + Math.min(r.height / 2, 110);
  const big = document.createElement('div');
  big.className = `hitbig ${item}`;
  big.textContent = TOSS_ICON[item];
  big.style.left = `${x}px`;
  big.style.top = `${y}px`;
  $('#fly').appendChild(big);
  big.animate(
    [
      { transform: 'translate(-50%, -50%) scale(2.8) rotate(-14deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.3) rotate(6deg)', opacity: 1, offset: 0.16 },
      { transform: 'translate(-50%, -50%) scale(1.45, .8)', opacity: 1, offset: 0.24 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%, calc(-50% + 30px)) scale(.96)', opacity: 0 },
    ],
    { duration: 1500, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
  ).onfinish = () => big.remove();
  setTimeout(() => big.remove(), 1900);
  const colors = HIT_COLORS[item];
  for (let i = 0; i < 16; i++) {
    const d = document.createElement('i');
    d.className = 'hitdrop';
    const size = 6 + Math.random() * 10;
    d.style.cssText = `left:${x}px; top:${y}px; width:${size}px; height:${size}px; background:${colors[i % colors.length]}`;
    $('#fly').appendChild(d);
    const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
    const dist = 50 + Math.random() * 90;
    d.animate(
      [
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.12 },
        {
          transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 24}px)) scale(.6)`,
          opacity: 0,
        },
      ],
      { duration: 800 + Math.random() * 300, delay: 160, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    ).onfinish = () => d.remove();
    setTimeout(() => d.remove(), 1600);
  }
}

function expire(pid: string, mark: TossMark): void {
  const list = TOSS.marks.get(pid);
  if (!list) return;
  const rest = list.filter((m) => m !== mark);
  if (rest.length) TOSS.marks.set(pid, rest);
  else TOSS.marks.delete(pid);
  markTosses();
}

/** Hängt alle lebenden Zeichen an ihre Ziele. Läuft nach jedem Zeichnen, die Animation läuft dabei weiter. */
export function markTosses(): void {
  document.querySelectorAll('.tossmark').forEach((x) => x.remove());
  if (!TOSS.marks.size) return;
  const now = Date.now();
  TOSS.marks.forEach((list, pid) => {
    const a = tossAnchor(pid);
    if (!a?.mark) return;
    list.forEach((m) => {
      if (m.until <= now) return;
      const s = document.createElement('span');
      s.className = `tossmark ${m.item}`;
      if (m.until - now <= FADE_MS) s.classList.add('out');
      // „Tomate von dir“, nie „von Du“
      s.title = `${TOSS_TEXT[m.item].title} ${m.by === App.me ? 'dir' : nameOf(m.by)}`;
      s.style.animationDelay = `-${now - m.at}ms`;
      if (BLOB.includes(m.item)) s.innerHTML = '<i></i><i></i><i></i>';
      else s.textContent = TOSS_ICON[m.item];
      a.el.appendChild(s);
      // Kurz vor Schluss ausblenden
      const fadeIn = m.until - now - FADE_MS;
      if (fadeIn > 0) setTimeout(() => s.classList.add('out'), fadeIn);
    });
  });
}

/** Eigener Wurf. Danach kurz gesperrt, damit niemand Dauerfeuer gibt. */
export function sendToss(item: TossItem, to: string, send: (item: TossItem, to: string) => void, redraw: () => void) {
  if (App.tossBlock || !ITEMS.includes(item) || to === App.me) return;
  const r = burst('toss', TOSS_GAP_MS);
  if (!r.ok) return;
  if (r.cool) {
    App.tossBlock = true;
    App.coolUntil.toss = Date.now() + r.cool;
    redraw();
    setTimeout(() => {
      App.tossBlock = false;
      redraw();
    }, r.cool);
  }
  if (!$opt('#overlay .modal')) {
    const turn = carouselShow(to);
    TOSS.waitUntil = Date.now() + turn;
    // Kommt der Wurf nie an (Verbindung weg, Sperre beim Host), gibt das Karussell sich trotzdem wieder frei
    if (turn) {
      if (TOSS.back) clearTimeout(TOSS.back);
      TOSS.back = setTimeout(() => {
        TOSS.back = null;
        carouselRelease();
      }, turn + 5000);
    }
  }
  send(item, to);
}

/** Kleine Leiste mit den vier Gegenständen direkt an einer Kachel oder Ergebniszeile. */
export function openPick(pid: string): void {
  const a = tossAnchor(pid);
  if (!a || pid === App.me) {
    closePick();
    return;
  }
  TOSS.pick = pid;
  let el = $opt('#tosspick');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tosspick';
    el.setAttribute('role', 'group');
    document.body.appendChild(el);
  }
  const name = nameOf(pid);
  el.setAttribute('aria-label', `Auf ${name} werfen`);
  el.innerHTML = ITEMS.map(
    (it) =>
      `<button type="button" data-act="toss" data-item="${it}" data-to="${esc(pid)}" aria-label="${esc(`${TOSS_TEXT[it].on} ${name}`)}"${App.tossBlock ? ' disabled' : ''}>${TOSS_ICON[it]}</button>`,
  ).join('');
  placePick();
}

/** Leiste unter ihrem Ziel halten, am Bildschirmrand eingeklemmt. */
export function placePick(): void {
  const el = $opt('#tosspick');
  if (!el || !TOSS.pick) return;
  const a = tossAnchor(TOSS.pick);
  if (!a || !a.el.isConnected) {
    closePick();
    return;
  }
  el.querySelectorAll('button').forEach((b) => (b.disabled = App.tossBlock));
  const r = a.el.getBoundingClientRect();
  const w = el.offsetWidth || 190;
  const h = el.offsetHeight || 48;
  const x = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), window.innerWidth - w - 8);
  let y = r.bottom + 6;
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export function closePick(): void {
  TOSS.pick = null;
  $opt('#tosspick')?.remove();
}

/** Neuer Tisch oder neu geladen: alles weg. */
export function resetToss(): void {
  TOSS.marks.forEach((l) => l.forEach((m) => clearTimeout(m.t)));
  TOSS.marks.clear();
  if (TOSS.back) clearTimeout(TOSS.back);
  TOSS.back = null;
  TOSS.waitUntil = 0;
  TOSS.flights = 0;
  closePick();
  document.querySelectorAll('.tossmark, .tossfly, .tosslbl').forEach((x) => x.remove());
}

/** In der Lobby gibt es keine Kacheln, alte Zeichen verschwinden. */
export function clearTossMarks(): void {
  if (!TOSS.marks.size) return;
  TOSS.marks.forEach((l) => l.forEach((m) => clearTimeout(m.t)));
  TOSS.marks.clear();
  markTosses();
}

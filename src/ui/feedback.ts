/*
 * Rückmeldungen: Toasts, große Meldungen, Sprechblasen und kleine Einblendungen am Tisch.
 * Was am Tisch passiert, läuft über `emit` mit einer Stufe aus `cueOf` (src/ui/levels.ts). Die Entscheidungen ohne
 * DOM (Stufe im Schub, Ton, Lage) stehen in src/ui/feedback-rules.ts.
 */
import { App } from './app';
import { $, $opt, esc, type Timer } from './dom';
import { render } from './render/index';
import type { Cue } from './levels';
import type { Reject } from '../game/reject';
import type { LogEntry } from '../game/types';
import { ctxOfView, rejectText } from '../content/texts';
import { myMoveNow } from './helpers';
import { sfx, sfxCalm, type SoundName } from './sound';
import {
  bandBox,
  type BatchState,
  type Box,
  levelInBatch,
  movedEnough,
  newBatch,
  slotOf,
  toneOf,
} from './feedback-rules';

const ms = (x: number | undefined, d: number) => x || d;

/** Am PC mit Maus heißt es Klicken, sonst Antippen. Erst beim Aufruf gefragt, damit das Modul auch ohne Browser lädt. */
export function skipHint(): string {
  const mouse = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  return mouse ? 'Klicken zum Überspringen' : 'Antippen zum Überspringen';
}

export function toast(msg: string, duration?: number): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(
    () => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    },
    ms(duration, 2600),
  );
}

/** Oberkante des offenen Reaktionsfensters am Handy, Meldungen sollen es nicht verdecken. */
function emotesTop(): number {
  if (!document.body.classList.contains('emoopen')) return Infinity;
  const e = $opt('#emotes');
  const r = e?.getBoundingClientRect();
  return r && r.height ? r.top : Infinity;
}

/** Sichtbares Rechteck oder null (ausgeblendete Elemente liefern ein Rechteck aus Nullen). */
function shown(sel: string): DOMRect | null {
  const r = $opt(sel)?.getBoundingClientRect();
  return r && r.height > 0 && r.width > 0 ? r : null;
}

/**
 * Freie Spielfläche zwischen Gegnern und eigenem Platz. Meldungen liegen nur dort,
 * damit sie weder die eigenen Karten noch die Gegner verdecken. Ohne Platz (etwa in der Tauschrunde) `null`.
 */
function fieldRect(min = 90): Box | null {
  if (!document.body.classList.contains('ingame')) return null;
  const table = $opt('#table');
  const opps = $opt('#opps');
  const me = $opt('#me');
  if (!table || !opps || !me) return null;
  const t = table.getBoundingClientRect();
  const top = Math.max(t.top, opps.getBoundingClientRect().bottom) + 6;
  const bottom = Math.min(t.bottom, me.getBoundingClientRect().top, emotesTop()) - 6;
  if (bottom - top < min) return null;
  return { left: t.left, top, width: t.width, height: bottom - top };
}

/**
 * Anker des Bands: die Statuszeile, in der Tauschrunde (dort ist sie aus) der Kopf am Platz, zur Not die Oberkante
 * des eigenen Platzes. Nur am Tisch.
 */
function bandBase(): Box | null {
  if (!document.body.classList.contains('ingame')) return null;
  const me = shown('#me');
  for (const sel of ['#status', '#me .swhead']) {
    const r = shown(sel);
    // So breit wie der eigene Platz, damit lange Titel nicht in vier Zeilen umbrechen und über den Stapel wachsen
    const x0 = Math.min(r?.left ?? 0, me?.left ?? Infinity);
    const x1 = Math.max(r?.right ?? 0, me?.right ?? -Infinity);
    if (r) return { left: x0, top: r.top, width: x1 - x0, height: r.height };
  }
  return me ? { left: me.left, top: me.top - 4, width: me.width, height: 0 } : null;
}

/**
 * Bin ich am Zug oder in der Tauschrunde (oder gibt es keine Spielfläche)? Dann stehen Meldungen als Band über der
 * Statuszeile, nie über eigenen Karten, Gegnern, Trumpfzeile oder Stapel (slotOf).
 */
function bandAnchor(): Box | null {
  const v = App.view;
  if (!v || !document.body.classList.contains('ingame')) return null;
  const slot = slotOf({ swap: v.phase === 'swap', myMove: myMoveNow(v), field: !!fieldRect(0) });
  return slot === 'band' ? bandBase() : null;
}

/** Unterkante von Stapel und Gegnern: so weit darf das Band nach oben wachsen. */
function bandFloor(band: Box): number {
  // Stapel und Ablage ragen bei manchen Spielen über die Mitte hinaus, deshalb jedes Kind einzeln
  const parts = [...document.querySelectorAll<HTMLElement>('#center, #center > *, #opps')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.width > 0 && r.bottom <= band.top + band.height);
  return Math.min(band.top, Math.max(band.top - 150, ...parts.map((r) => r.bottom)));
}

/**
 * Lage einer Meldung nach dem Einblenden. Während der Pop-Animation ist das gemessene Rechteck verschoben und
 * verkleinert, deshalb aus der gesetzten Lage und der Höhe ohne Transform.
 */
function restBox(el: HTMLElement): { top: number; bottom: number } {
  const top = parseFloat(el.style.top) || el.getBoundingClientRect().top;
  return { top, bottom: top + el.offsetHeight };
}

/** Dasselbe für die große Meldung im Band: Ebene plus Abstand darin. */
function annBox(el: HTMLElement): { top: number; bottom: number } {
  const host = el.parentElement;
  const top = (parseFloat(host?.style.top ?? '') || 0) + el.offsetTop;
  return { top, bottom: top + el.offsetHeight };
}

/**
 * Platz im Band: unten bündig mit der Statuszeile, weitere Meldungen stapeln sich nach oben bis zum Stapel, über
 * einer großen Meldung im Band. Ist kein Platz mehr, weichen die ältesten, damit nichts über eigene Karten rutscht.
 * Der Grund einer Ablehnung bleibt stehen.
 */
function bandSlot(el: HTMLElement, band: Box, h: number): number {
  const floor = bandFloor(band);
  const base = band.top + band.height - h;
  const ann = $opt('#announce.band .ann:not(.out)');
  let live = [...document.querySelectorAll<HTMLElement>('#fly .mid.band')].filter(
    (o) => o !== el && !o.classList.contains('out') && o.style.top !== '-999px',
  );
  const fit = (): number => {
    const rects = [...live.map(restBox), ...(ann ? [annBox(ann)] : [])].sort((p, q) => q.top - p.top);
    let top = base;
    for (const o of rects) if (top < o.bottom + 2 && top + h > o.top - 2) top = o.top - h - 2;
    return top;
  };
  let top = fit();
  const nope = el.classList.contains('nopelbl');
  while (top < floor) {
    const old = live.find((o) => nope || !o.classList.contains('nopelbl'));
    if (!old) break;
    old.classList.add('out');
    setTimeout(() => old.remove(), 320);
    live = live.filter((o) => o !== old);
    top = fit();
  }
  // Immer noch kein Platz (eine große Meldung füllt das Band): unten im Band unter ihr warten statt über den Karten
  return top < floor ? base : top;
}

/**
 * Wohin mit einer Meldung in der Spielfläche?
 * Kleine Hinweise (`cap`) sitzen genau auf dem Label "Stapel" (bei Schnautz "Mitte"): gleiche Unterkante, es wird
 * überdeckt. Sprüche (`center`) stehen mittig wie die großen Meldungen. Mehrere gleichzeitig reihen sich darunter.
 * Bin ich am Zug, stehen beide als Band über der Statuszeile (bandAnchor).
 * Gibt `false` zurück, wenn kein Tisch zu sehen ist.
 */
function placeMessage(el: HTMLElement, mode: 'cap' | 'center'): boolean {
  if (!fieldRect(0) && !bandBase()) return false;
  ensureResize();
  el.classList.add('mid');
  el.dataset.mode = mode;
  el.style.top = '-999px';
  $('#fly').appendChild(el);
  positionMessage(el, mode);
  return true;
}

/** Setzt eine Meldung aus placeMessage (neu) an ihren Platz. Auch nach dem Zeichnen über realignFeedback. */
function positionMessage(el: HTMLElement, mode: 'cap' | 'center'): void {
  const band = bandAnchor();
  const area = band ? null : fieldRect(0);
  el.classList.toggle('band', !!band);
  if (band) {
    el.style.left = `${Math.round(band.left + band.width / 2)}px`;
    el.style.top = `${Math.round(bandSlot(el, band, el.offsetHeight))}px`;
    return;
  }
  if (!area) return;
  el.style.left = `${Math.round(area.left + area.width / 2)}px`;
  const h = el.offsetHeight;
  const cap = shown('#center .cap');
  const oppsBottom = $opt('#opps')?.getBoundingClientRect().bottom ?? area.top;
  let top =
    mode === 'cap' && cap ? Math.max(oppsBottom, cap.bottom - h) : area.top + Math.max(0, (area.height - h) / 2);
  const taken = [...document.querySelectorAll<HTMLElement>('#fly .mid')]
    .filter((o) => o !== el && !o.classList.contains('out') && o.style.top !== '-999px')
    .map(restBox)
    .sort((p, q) => p.top - q.top);
  for (const o of taken) if (top < o.bottom + 4 && top + h > o.top - 4) top = o.bottom + 4;
  // Ist das Reaktionsfenster offen, rückt die Meldung darüber
  const limit = emotesTop() - 6;
  if (top + h > limit) top = Math.max(oppsBottom, limit - h);
  el.style.top = `${Math.round(top)}px`;
}

/** Inline-Maße einer festen Ebene, um die Lage vor und nach dem Zeichnen zu vergleichen. */
const boxOfStyle = (el: HTMLElement): Box => ({
  left: parseFloat(el.style.left) || 0,
  top: parseFloat(el.style.top) || 0,
  width: parseFloat(el.style.width) || 0,
  height: parseFloat(el.style.height) || 0,
});

/**
 * Legt die Ebene der großen Meldungen genau über die Spielfläche. Ist es dort eng, wird die Meldung kompakter.
 * Bin ich am Zug oder in der Tauschrunde, wird sie ein schmales Band über der Statuszeile.
 */
function placeInField(el: HTMLElement | null): void {
  if (!el) return;
  ensureResize();
  const band = bandAnchor();
  const r = band ? bandBox(band, bandFloor(band)) : fieldRect();
  const cls = { field: !!r, band: !!band, tight: !!r && (!!band || r.height < 220) };
  const same = Object.entries(cls).every(([k, on]) => el.classList.contains(k) === on);
  for (const [k, on] of Object.entries(cls)) el.classList.toggle(k, on);
  if (!r) {
    ['left', 'top', 'width', 'height', 'right', 'bottom'].forEach((k) => el.style.removeProperty(k));
    return;
  }
  // Nur verschieben, wenn sich die Lage spürbar ändert, sonst flackert es bei jedem Zeichnen
  if (same && el.style.top && !movedEnough(boxOfStyle(el), r)) return;
  Object.assign(el.style, {
    left: `${Math.round(r.left)}px`,
    top: `${Math.round(r.top)}px`,
    width: `${Math.round(r.width)}px`,
    height: `${Math.round(r.height)}px`,
    right: 'auto',
    bottom: 'auto',
  });
}

/** Größenwechsel richtet laufende Meldungen neu aus. Erst beim ersten Gebrauch angemeldet, nicht beim Laden. */
let resizeOn = false;
let resizeRaf = 0;
function ensureResize(): void {
  if (resizeOn || typeof window === 'undefined') return;
  resizeOn = true;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(realignFeedback);
  });
}

/** Große Meldung in der Tischmitte. `title` und `sub` sind HTML und müssen bereits escaped sein. */
export interface Announcement {
  icon?: string;
  tone?: '' | 'gold' | 'red' | 'wood' | 'sea' | 'brown';
  title: string;
  sub?: string;
  ms?: number;
  /** Zusätzliche Klasse, etwa für die Zeremonie */
  cls?: string;
  /** Wenn die Meldung erscheint und wenn sie endet (übersprungen oder abgelaufen) */
  onShow?: () => void;
  onEnd?: (skipped: boolean) => void;
}

export const ANN = {
  q: [] as Announcement[],
  busy: false,
  curEnd: 0,
  el: null as HTMLElement | null,
  t: undefined as Timer | undefined,
  /** Die Meldung, die gerade steht */
  cur: null as Announcement | null,
};

/** Laufende Meldung beenden und ihren Abschluss genau einmal melden. */
function endCur(skipped: boolean): void {
  const o = ANN.cur;
  ANN.cur = null;
  o?.onEnd?.(skipped);
}

export function resetAnnouncements(): void {
  ANN.q = [];
  clearTimeout(ANN.t);
  ANN.busy = false;
  ANN.curEnd = 0;
  ANN.el = null;
  endCur(true);
  $('#announce').innerHTML = '';
}

/** Wartende Meldungen einer Art verwerfen, die laufende davon schließen. */
export function dropAnnouncements(cls: string): void {
  ANN.q = ANN.q.filter((o) => o.cls !== cls);
  if (ANN.cur?.cls === cls) skipAnnouncement();
}

export function announce(o: Announcement): void {
  ANN.q.push(o);
  if (!ANN.busy) annNext();
}

/** Wie lange laufen die Meldungen noch (aktuelle plus Warteschlange)? */
export function annLeft(): number {
  return ANN.q.reduce((t, o) => t + ms(o.ms, 1700) + 260, Math.max(0, ANN.curEnd - Date.now()));
}

/** Ergebnisfenster erst zeigen, wenn alle Meldungen durch sind. */
export function holdForAnnouncements(extra = 250): void {
  App.holdUntil = Math.max(App.holdUntil, Date.now() + annLeft() + extra);
}

function annNext(): void {
  const o = ANN.q.shift();
  if (!o) {
    ANN.busy = false;
    ANN.curEnd = 0;
    ANN.el = null;
    return;
  }
  ANN.busy = true;
  ANN.curEnd = Date.now() + ms(o.ms, 1700) + 240;
  const el = document.createElement('div');
  el.className = `ann ${o.tone ?? ''} ${o.cls ?? ''}`.trim();
  el.innerHTML =
    (o.icon ? `<div class="ann-ic">${o.icon}</div>` : '') +
    `<div class="ann-t">${o.title}</div>` +
    (o.sub ? `<div class="ann-s">${o.sub}</div>` : '');
  el.title = skipHint();
  el.addEventListener('click', skipAnnouncement);
  placeInField($('#announce'));
  $('#announce').appendChild(el);
  ANN.el = el;
  ANN.cur = o;
  ANN.t = setTimeout(() => annClose(false), ms(o.ms, 1700));
  if (o.cls !== 'zer') sfxCalm('msg', 500);
  o.onShow?.();
}

function annClose(skipped = false): void {
  const el = ANN.el;
  if (!el) return;
  ANN.el = null;
  endCur(skipped);
  el.classList.add('out');
  setTimeout(() => {
    el.remove();
    annNext();
  }, 240);
}

/** Laufende Meldung überspringen (Antippen, Klicken, Esc). */
export function skipAnnouncement(): void {
  clearTimeout(ANN.t);
  ANN.curEnd = Date.now();
  annClose(true);
  if (App.holdUntil > Date.now()) {
    App.holdUntil = Date.now() + annLeft() + 300;
    if (App.holdT) clearTimeout(App.holdT);
    App.holdT = setTimeout(render, App.holdUntil - Date.now() + 30);
  }
}

/** Hält das Ergebnisfenster zurück, solange noch Animationen oder Meldungen laufen. */
export function holdOverlay(): boolean {
  const left = App.holdUntil - Date.now();
  if (left <= 0) return false;
  $('#overlay').innerHTML = '';
  if (App.holdT) clearTimeout(App.holdT);
  App.holdT = setTimeout(() => {
    App.holdT = null;
    render();
  }, left + 30);
  return true;
}

/** Bereich eines Spielers am Tisch (eigener Platz oder Gegner). */
export const panelFor = (pid: string | null | undefined): HTMLElement | null =>
  pid === App.me ? $opt('#me') : $opt(`.opp[data-pid="${pid}"]`);

export function shakeEl(el: HTMLElement): void {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

export function shakePanel(pid: string | undefined): void {
  const el = panelFor(pid);
  if (el) shakeEl(el);
}

function addTemp(parent: HTMLElement, tag: string, cls: string, text: string, life: number): HTMLElement {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = text;
  parent.appendChild(el);
  setTimeout(() => el.remove(), life);
  return el;
}

/**
 * Sprechblase an einem Platz. Sie liegt in der festen Effekt-Ebene, damit der Tischrand sie nicht abschneidet
 * und das nächste Rendern sie nicht löscht. Gegner sitzen oben, ihre Blase hängt deshalb unter dem Platz.
 */
export function chatBubble(pid: string | undefined, text: string): void {
  const el = panelFor(pid);
  if (!el || !pid) return;
  for (const old of document.querySelectorAll<HTMLElement>('#fly .bubble')) if (old.dataset.pid === pid) old.remove();
  const r = el.getBoundingClientRect();
  const below = el.classList.contains('opp');
  const b = document.createElement('div');
  b.className = below ? 'bubble down' : 'bubble';
  b.dataset.pid = pid;
  b.textContent = text;
  $('#fly').appendChild(b);
  // Seitlich im Bild halten, der Zipfel zeigt trotzdem auf den Platz
  const cx = r.left + r.width / 2;
  const half = b.offsetWidth / 2;
  const x = Math.min(Math.max(cx, 8 + half), innerWidth - 8 - half);
  // Reden mehrere gleichzeitig, rückt die neue Blase unter (oder über) die schon sichtbaren
  const w = b.offsetWidth;
  const h = b.offsetHeight;
  let top = below ? r.bottom + 8 : r.top - 8;
  let stacked = false;
  const others = [...document.querySelectorAll<HTMLElement>('#fly .bubble:not(.out)')].filter((o) => o !== b);
  for (let k = 0; k < others.length; k++) {
    let moved = false;
    for (const o of others) {
      const q = o.getBoundingClientRect();
      const y0 = below ? top : top - h;
      if (x - half < q.right + 4 && x - half + w > q.left - 4 && y0 < q.bottom + 4 && y0 + h > q.top - 4) {
        top = below ? q.bottom + 6 : q.top - 6;
        moved = stacked = true;
      }
    }
    if (!moved) break;
  }
  if (stacked) b.classList.add('stacked');
  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(top)}px`;
  b.style.setProperty('--ax', `${Math.round(cx - x)}px`);
  setTimeout(() => {
    b.classList.add('out');
    setTimeout(() => b.remove(), 300);
  }, 2800);
}

/** Name vor dem Satz wie am Tisch üblich: „Lena nimmt 5 Karten“, für einen selbst „Du nimmst 5 Karten“. */
function labelText(pid: string | undefined, text: string, mineText?: string): string {
  const me = !!pid && pid === App.me;
  const name = !pid ? '' : me ? 'Du' : (App.view?.players.find((p) => p.id === pid)?.name ?? '');
  return `${name} ${me && mineText ? mineText : text}`.trim();
}

/**
 * Kurzer Hinweis, wer gerade was getan hat ("Heinzi nimmt 5 Karten"). Er erscheint in der Spielfläche,
 * damit er keinen Gegner verdeckt, bin ich am Zug im Band über der Statuszeile. Mehrere stehen untereinander.
 * `mineText` ist die Form für einen selbst ("Du nimmst 5 Karten"). Still, den Ton entscheidet `emit`.
 */
export function floatLabel(pid: string | undefined, text: string, mineText?: string): void {
  const f = document.createElement('div');
  f.className = 'fieldlbl';
  f.textContent = labelText(pid, text, mineText);
  if (placeMessage(f, 'cap')) {
    setTimeout(() => f.remove(), 1800);
    return;
  }
  const el = panelFor(pid);
  if (el) addTemp(el, 'span', 'floatlbl', text, 1600);
}

/** Einblendung über einem Element, die nicht beim nächsten Rendern verschwindet. Still, den Ton entscheidet `emit`. */
export function fixedLabel(cls: string, text: string, anchor: Element | null, duration = 2400, dy = 10): void {
  if (!anchor || !text) return;
  document.querySelector(`#fly .${cls}`)?.remove();
  const f = document.createElement('div');
  f.className = cls;
  f.textContent = text;
  // Sprüche und Hinweise stehen mittig in der Spielfläche wie die anderen Meldungen, nie über Gegnern
  if (!placeMessage(f, cls === 'tauntlbl' ? 'center' : 'cap')) {
    const r = anchor.getBoundingClientRect();
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top - dy}px`;
    $('#fly').appendChild(f);
  }
  setTimeout(() => {
    f.classList.add('out');
    setTimeout(() => f.remove(), 320);
  }, duration);
}

export const tauntLabel = (text: string, duration = 2800): void =>
  fixedLabel('tauntlbl', text, $opt('#center') ?? $opt('#me'), duration, 12);

export function boomFx(ch: string, el: Element | null): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'fxboom';
  f.textContent = ch;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height / 2}px`;
  $('#fly').appendChild(f);
  setTimeout(() => f.remove(), 1100);
}

/**
 * Eine Rückmeldung für `emit`. `text` ist der Satz für andere ohne Namen („nimmt 7 Karten“), der Name kommt davor.
 * Ohne `pid` steht `text` allein. Große Meldungen brauchen ihn auch, wird eine davon zu mittel, steht er klein da.
 */
export interface Msg {
  pid?: string;
  text: string;
  /** Form für einen selbst („nimmst 7 Karten“) */
  mine?: string;
  /** Nur groß */
  icon?: string;
  tone?: Announcement['tone'];
  /** Nur groß, HTML und bereits maskiert. Ohne Titel steht der Satz da */
  title?: string;
  /** Nur groß, HTML und bereits maskiert */
  sub?: string;
  ms?: number;
  /** Spruch dazu, wenn die Stufe einen vorsieht (`cue.taunt`). Groß steht er in der Meldung, sonst daneben */
  taunt?: string;
  /** Klang des Ereignisses. Er ersetzt bei klein und mittel den leisen Meldeton */
  sfx?: SoundName;
  /** Nur groß: Ergebnisfenster zurückhalten, bis die Meldungen durch sind (Zusatz in ms) */
  hold?: number;
  /** Kleine und mittlere Meldungen erscheinen nach dem Zeichnen (Standard 60 ms) */
  delay?: number;
}

/** Merkt sich, ob in diesem Schub schon ein großer Moment lief und ob Kürzen erlaubt ist. */
let BATCH: BatchState = newBatch();

/**
 * Neuer Schub von Logeinträgen (effects und der Shithead-Ablauf rufen das vorne auf): Der große Moment ist wieder
 * frei. Steht ein Ende im Schub, wird nichts gekürzt (feedback-rules.ts).
 */
export function beginBatch(fresh: readonly LogEntry[] = []): void {
  BATCH = newBatch(fresh);
}

/** Der Shithead-Ablauf hat sein Großes (Verbrennen, Bombe) schon gezeigt: Es zählt für den Zug mit. */
export function noteBig(): void {
  BATCH.big = true;
}

/**
 * Zeigt eine Rückmeldung in ihrer Stufe. Groß ist `announce`, mittel und klein sind Hinweise in der Spielfläche.
 * Ein zweites großes Ereignis im selben Schub, das kein Takt ist, wird mittel. Den Ton entscheidet die Stufe:
 * klein still (außer `cue.sound` oder eigener Klang), mittel mit Klang, groß mit Meldeton.
 */
export function emit(cue: Cue | null, m: Msg): void {
  if (!cue) return;
  const level = levelInBatch(cue, BATCH);
  const tone = toneOf(cue, level, m.sfx);
  if (tone.sfx) sfx(tone.sfx);
  else if (tone.calm) sfxCalm('msg', 500, 0.7);
  const taunt = cue.taunt && m.taunt ? m.taunt : '';
  if (level === 'big') {
    const sub = (m.sub ?? '') + (taunt ? `<span class="tt">${esc(taunt)}</span>` : '');
    announce({
      icon: m.icon,
      tone: m.tone,
      title: m.title ?? esc(labelText(m.pid, m.text, m.mine)),
      sub: sub || undefined,
      ms: m.ms,
    });
    if (m.hold !== undefined) holdForAnnouncements(m.hold);
    return;
  }
  // Hinweis zuerst, Spruch gleich danach: Ist im Band nur Platz für eins, bleibt der Spruch
  setTimeout(() => {
    floatLabel(m.pid, m.text, m.mine);
    if (taunt) tauntLabel(taunt);
  }, m.delay ?? 60);
}

/**
 * Laufende Ansagen und Hinweise nach dem Zeichnen neu an die Spielfläche setzen, so wie `markClocks` die Uhren
 * nachzieht. Läuft am Ende von `render()` und bei Größenwechsel. Verschoben wird nur, was sich um mehr als ein
 * paar Pixel bewegt hat oder zwischen Band und Spielfläche wechselt.
 */
export function realignFeedback(): void {
  const ann = $opt('#announce');
  if (ann?.firstElementChild) placeInField(ann);
  const live = [...document.querySelectorAll<HTMLElement>('#fly .mid:not(.out)')].filter(
    (el) => el.dataset.mode === 'cap' || el.dataset.mode === 'center',
  );
  if (!live.length) return;
  const was = live.map((el) => ({ box: boxOfStyle(el), band: el.classList.contains('band') }));
  // Der Reihe nach neu setzen, älteste zuerst, damit die Stapel dieselbe Ordnung behalten
  for (const el of live) el.style.top = '-999px';
  live.forEach((el, i) => {
    positionMessage(el, el.dataset.mode as 'cap' | 'center');
    const now = boxOfStyle(el);
    const old = was[i];
    if (old.band === el.classList.contains('band') && !movedEnough(old.box, now)) {
      el.style.left = `${old.box.left}px`;
      el.style.top = `${old.box.top}px`;
    }
  });
}

/** Zuletzt angetippte Karten oder Knöpfe je Aktion, damit eine Ablehnung das Richtige wackeln lässt. */
const TAP = { act: '', sel: [] as string[], at: 0 };

/** Merkt sich, was zur Aktion gehört (Selektoren, weil das nächste Zeichnen die Elemente ersetzt). */
export function noteTap(act: string, sel: readonly string[]): void {
  TAP.act = act;
  TAP.sel = [...sel];
  TAP.at = Date.now();
}

/** Aktionen am Tisch: Ablehnungen dazu erscheinen am Stapel, alles andere als Toast. */
const TABLE_ACT = /^(sh(?!bet)|dk|cb)[a-z]*$|^(swap|swapAll|pass|knock|keep|take|skip)$/;

/** Ablehnungen, die nie an den Tisch gehören: Plätze und Netz. */
const isSeatOrNet = (r: Reject): boolean => /^(seat|net)\./.test(r.e);

/** Was soll wackeln? Erst die gemerkten Karten, sonst der Knopf zur Aktion, sonst der eigene Platz. */
function rejectTargets(act: string | null): HTMLElement[] {
  if (act && TAP.act === act && Date.now() - TAP.at < 8000) {
    const els = TAP.sel.map((q) => $opt(q)).filter((x): x is HTMLElement => !!x);
    if (els.length) return els;
  }
  const btn = act ? $opt(`#me [data-act="${act}"], #status [data-act="${act}"], #center [data-act="${act}"]`) : null;
  if (btn) return [btn];
  const me = $opt('#me');
  return me ? [me] : [];
}

/**
 * Grund am Tisch: Lehnt der Gastgeber einen Zug ab, wackelt die angetippte Karte und der Grund steht klein am
 * Stapel. Lobby, Plätze, Netz und alles in Fenstern bleiben Toasts. `act` ist der Typ der abgelehnten Aktion.
 */
export function showReject(r: Reject, act?: string | null, fallback?: string): void {
  const text = rejectText(r, ctxOfView(App.view), fallback);
  if (!text) return;
  const v = App.view;
  const atTable =
    !!v &&
    v.phase !== 'lobby' &&
    document.body.classList.contains('ingame') &&
    !!act &&
    TABLE_ACT.test(act) &&
    !isSeatOrNet(r) &&
    !$opt('#overlay .modal') &&
    !$opt('#modal .paper') &&
    !!$opt('#center');
  if (!atTable) {
    toast(text);
    return;
  }
  for (const el of rejectTargets(act ?? null)) shakeEl(el);
  sfxCalm('nope', 400, 0.6);
  fixedLabel('nopelbl', text, $opt('#center .pile') ?? $opt('#center'), 2600, 14);
}

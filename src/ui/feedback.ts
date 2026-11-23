/* Rückmeldungen: Toasts, große Meldungen, Sprechblasen und kleine Einblendungen am Tisch. */
import { App } from './app';
import { $, $opt, esc, type Timer } from './dom';
import { render } from './render/index';
import { sfxCalm } from './sound';

const ms = (x: number | undefined, d: number) => x || d;

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

/**
 * Freie Spielfläche zwischen Gegnern und eigenem Platz. Meldungen liegen nur dort,
 * damit sie weder die eigenen Karten noch die Gegner verdecken. Ohne Platz (etwa in der Tauschrunde) `null`.
 */
/** Oberkante des offenen Reaktionsfensters am Handy, Meldungen sollen es nicht verdecken. */
function emotesTop(): number {
  if (!document.body.classList.contains('emoopen')) return Infinity;
  const e = $opt('#emotes');
  const r = e?.getBoundingClientRect();
  return r && r.height ? r.top : Infinity;
}

function fieldRect(min = 90): { left: number; top: number; width: number; height: number } | null {
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
 * Wohin mit einer Meldung in der Spielfläche?
 * Kleine Hinweise (`cap`) sitzen genau auf dem Label "Stapel" (bei Schnautz "Mitte"): gleiche Unterkante, es wird
 * überdeckt. Sprüche (`center`) stehen mittig wie die großen Meldungen. Mehrere gleichzeitig reihen sich darunter.
 * Gibt `false` zurück, wenn kein Tisch zu sehen ist.
 */
function placeMessage(el: HTMLElement, mode: 'cap' | 'center'): boolean {
  const r = fieldRect(0);
  const c = $opt('#center')?.getBoundingClientRect();
  if (!r && !c) return false;
  const area = r ?? { left: (c as DOMRect).left, width: (c as DOMRect).width, top: (c as DOMRect).top, height: 0 };
  el.classList.add('mid');
  el.style.left = `${Math.round(area.left + area.width / 2)}px`;
  el.style.top = '-999px';
  $('#fly').appendChild(el);
  const h = el.offsetHeight;
  const cap = $opt('#center .cap')?.getBoundingClientRect();
  const oppsBottom = $opt('#opps')?.getBoundingClientRect().bottom ?? area.top;
  let top =
    mode === 'cap' && cap?.height
      ? Math.max(oppsBottom, cap.bottom - h)
      : area.top + Math.max(0, (area.height - h) / 2);
  const taken = [...document.querySelectorAll<HTMLElement>('#fly .mid')]
    .filter((o) => o !== el && !o.classList.contains('out'))
    .map((o) => o.getBoundingClientRect())
    .sort((p, q) => p.top - q.top);
  for (const o of taken) if (top < o.bottom + 4 && top + h > o.top - 4) top = o.bottom + 4;
  // Ist das Reaktionsfenster offen, rückt die Meldung darüber
  const limit = emotesTop() - 6;
  if (top + h > limit) top = Math.max(oppsBottom, limit - h);
  el.style.top = `${Math.round(top)}px`;
  return true;
}

/** Legt eine feste Ebene genau über die Spielfläche. Ist es dort eng, wird die Meldung kompakter. */
function placeInField(el: HTMLElement | null): void {
  if (!el) return;
  const r = fieldRect();
  el.classList.toggle('field', !!r);
  el.classList.toggle('tight', !!r && r.height < 220);
  if (!r) {
    ['left', 'top', 'width', 'height', 'right', 'bottom'].forEach((k) => el.style.removeProperty(k));
    return;
  }
  Object.assign(el.style, {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    right: 'auto',
    bottom: 'auto',
  });
}

let bannerTimer: Timer | undefined;
export function banner(text: string): void {
  sfxCalm('msg', 500);
  const b = $('#banner');
  b.innerHTML = `<div class="banner"><div>${esc(text)}</div></div>`;
  placeInField(b.firstElementChild as HTMLElement | null);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    b.innerHTML = '';
  }, 1700);
}

/** Große Meldung in der Tischmitte. `title` und `sub` sind HTML und müssen bereits escaped sein. */
export interface Announcement {
  icon?: string;
  tone?: '' | 'gold' | 'red' | 'wood' | 'sea';
  title: string;
  sub?: string;
  ms?: number;
}

export const ANN = {
  q: [] as Announcement[],
  busy: false,
  curEnd: 0,
  el: null as HTMLElement | null,
  t: undefined as Timer | undefined,
};

export function resetAnnouncements(): void {
  ANN.q = [];
  clearTimeout(ANN.t);
  ANN.busy = false;
  ANN.curEnd = 0;
  ANN.el = null;
  $('#announce').innerHTML = '';
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
  el.className = `ann ${o.tone ?? ''}`;
  el.innerHTML =
    (o.icon ? `<div class="ann-ic">${o.icon}</div>` : '') +
    `<div class="ann-t">${o.title}</div>` +
    (o.sub ? `<div class="ann-s">${o.sub}</div>` : '');
  el.title = 'Antippen zum Überspringen';
  el.addEventListener('click', annSkip);
  placeInField($('#announce'));
  $('#announce').appendChild(el);
  ANN.el = el;
  ANN.t = setTimeout(annClose, ms(o.ms, 1700));
  sfxCalm('msg', 500);
}

function annClose(): void {
  const el = ANN.el;
  if (!el) return;
  ANN.el = null;
  el.classList.add('out');
  setTimeout(() => {
    el.remove();
    annNext();
  }, 240);
}

function annSkip(): void {
  clearTimeout(ANN.t);
  ANN.curEnd = Date.now();
  annClose();
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

export function centerLabel(text: string): void {
  sfxCalm('msg', 500, 0.7);
  const c = $opt('#center');
  if (c) addTemp(c, 'span', 'floatlbl center', text, 1600);
}

/**
 * Kurzer Hinweis, wer gerade was getan hat ("Heinzi nimmt 5 Karten"). Er erscheint oben in der Spielfläche,
 * damit er keinen Gegner verdeckt. Mehrere gleichzeitig stehen untereinander.
 * `mineText` ist die Form für einen selbst ("Du nimmst 5 Karten").
 */
export function floatLabel(pid: string | undefined, text: string, mineText?: string): void {
  const me = pid === App.me;
  const name = me ? 'Du' : (App.view?.players.find((p) => p.id === pid)?.name ?? '');
  const f = document.createElement('div');
  f.className = 'fieldlbl';
  f.textContent = `${name} ${me && mineText ? mineText : text}`.trim();
  sfxCalm('msg', 500, 0.7);
  if (placeMessage(f, 'cap')) {
    setTimeout(() => f.remove(), 1800);
    return;
  }
  const el = panelFor(pid);
  if (el) addTemp(el, 'span', 'floatlbl', text, 1600);
}

/** Einblendung über einem Element, die nicht beim nächsten Rendern verschwindet. */
export function fixedLabel(cls: string, text: string, anchor: Element | null, duration = 2400, dy = 10): void {
  if (!anchor || !text) return;
  sfxCalm('msg', 500, 0.7);
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
  fixedLabel('tauntlbl', text, $opt('#center'), duration, 12);

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

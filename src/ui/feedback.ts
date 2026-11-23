/* Rückmeldungen: Toasts, große Meldungen, Sprechblasen und kleine Einblendungen am Tisch. */
import { App } from './app';
import { $, $opt, esc, type Timer } from './dom';
import { render } from './render/index';

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

let bannerTimer: Timer | undefined;
export function banner(text: string): void {
  const b = $('#banner');
  b.innerHTML = `<div class="banner"><div>${esc(text)}</div></div>`;
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
  $('#announce').appendChild(el);
  ANN.el = el;
  ANN.t = setTimeout(annClose, ms(o.ms, 1700));
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

export function chatBubble(pid: string | undefined, text: string): void {
  const el = panelFor(pid);
  if (!el) return;
  el.querySelector('.bubble')?.remove();
  const b = document.createElement('span');
  b.className = 'bubble';
  b.textContent = text;
  el.appendChild(b);
  setTimeout(() => {
    b.classList.add('out');
    setTimeout(() => b.remove(), 300);
  }, 2800);
}

export function centerLabel(text: string): void {
  const c = $opt('#center');
  if (c) addTemp(c, 'span', 'floatlbl center', text, 1600);
}

export function floatLabel(pid: string | undefined, text: string): void {
  const el = panelFor(pid);
  if (el) addTemp(el, 'span', 'floatlbl', text, 1600);
}

/** Einblendung über einem Element, die nicht beim nächsten Rendern verschwindet. */
export function fixedLabel(cls: string, text: string, anchor: Element | null, duration = 2400, dy = 10): void {
  if (!anchor || !text) return;
  const r = anchor.getBoundingClientRect();
  document.querySelector(`#fly .${cls}`)?.remove();
  const f = document.createElement('div');
  f.className = cls;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top - dy}px`;
  $('#fly').appendChild(f);
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

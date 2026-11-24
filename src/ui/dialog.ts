/*
 * Fenster in #modal (Regeln, Bestenliste, Updates, Einladen, Rückfragen): Gerüst und Verhalten.
 * Die Inhalte bauen die Dateien in render/. Geöffnet und geschlossen wird weiter über #modal.innerHTML
 * (events.ts leert es bei Schließen, Tipp daneben und Escape). Ein MutationObserver hängt hier Rolle,
 * Fokus, Fokusfalle und den Rückweg zum auslösenden Knopf dran. Inhalte werden nur ergänzt, nie neu geschrieben,
 * damit Klick-Handler wie der von #cfm-ok erhalten bleiben.
 */
import { $opt, reduceMotion } from './dom';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11m0-11-11 11"/></svg>';

export interface Sheet {
  /** Art des Fensters als Klasse, etwa 'rules' */
  kind: string;
  /** Titel im festen Kopf, das eine große Wort des Fensters */
  title: string;
  /** Neben dem Titel, etwa die Versionsnummer als Zahl-Sticker */
  badge?: string;
  /** Runde Knöpfe links neben dem Kreuz, etwa „Auf Standard zurücksetzen“ */
  tools?: string;
  /** Im festen Kopf unter dem Titel, etwa Spiel-Reiter und Sprungmarken */
  head?: string;
  /** Der Inhalt, scrollt als Einziges */
  body: string;
}

/** Bogen mit festem Kopf (Titel und Schließen) und eigenem Scrollbereich darunter. */
export function sheetHTML(s: Sheet): string {
  return (
    `<div class="modal"><div class="paper sheet dlg ${s.kind}" role="dialog" aria-modal="true" aria-labelledby="dlg-t" tabindex="-1">` +
    '<div class="dlg-head"><div class="dlg-top">' +
    `<h2 class="dlg-title" id="dlg-t">${s.title}</h2>${s.badge ?? ''}${s.tools ?? ''}` +
    `<button type="button" class="x dlg-x" data-act="closemodal" aria-label="Schließen">${CLOSE_ICON}</button>` +
    `</div>${s.head ?? ''}</div>` +
    // Scrollbereich per Tastatur erreichbar, damit man ohne Maus mit Pfeiltasten lesen kann
    `<div class="dlg-body" tabindex="0" role="region" aria-labelledby="dlg-t">${s.body}</div>` +
    '</div></div>'
  );
}

/* ---------- Verhalten ---------- */

// summary gehört dazu: Die Bereiche im Dev-Menü sind aufklappbare details
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Bis hier kommt das Menü ⋯ als Bogen von unten (lobby.css), dann bleibt Tab darin wie im Fenster. */
const MENU_SHEET = '(max-width: 820px)';

type Key = { act: string; g: string };
const keyOf = (t: HTMLElement | null): Key | null =>
  t?.dataset.act ? { act: t.dataset.act, g: t.dataset.g ?? '' } : null;
const keySel = (k: Key): string =>
  `[data-act="${CSS.escape(k.act)}"]${k.g ? `[data-g="${CSS.escape(k.g)}"]` : ':not([data-g])'}`;

/** Wer das Fenster geöffnet hat. Dorthin kehrt der Fokus beim Schließen zurück. */
let trigger: HTMLElement | null = null;
/** data-act und data-g des Auslösers, falls die Lobby ihn inzwischen neu gezeichnet hat */
let triggerKey: Key | null = null;
/** Zuletzt angetippt. Am Handy und in Safari bekommen Knöpfe beim Tippen keinen Fokus. */
let pressed: HTMLElement | null = null;
/** Zuletzt im Fenster fokussiert, um nach einem Inhaltswechsel (Regel-Reiter) an derselben Stelle zu bleiben. */
let inner: { act: string; g: string } | null = null;
let open = false;

const paperOf = (box: Element): HTMLElement | null => box.querySelector<HTMLElement>(':scope > .modal > .paper');

function shown(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0;
}

/** In einem zugeklappten details ist nur die eigene summary erreichbar. Chrome liefert für den Rest trotzdem Rechtecke. */
function folded(el: HTMLElement): boolean {
  const d = el.closest('details:not([open])');
  return !!d && !(el.tagName === 'SUMMARY' && el.parentElement === d);
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => shown(el) && !folded(el));
}

/** Rolle, Modalität und Titel ergänzen, ohne Vorhandenes zu überschreiben (Tipps und Dev-Menü bringen eigene mit). */
function decorate(paper: HTMLElement): void {
  if (!paper.hasAttribute('role')) paper.setAttribute('role', 'dialog');
  paper.setAttribute('aria-modal', 'true');
  if (!paper.hasAttribute('aria-labelledby')) {
    const h = paper.querySelector('h2');
    if (h) {
      if (!h.id) h.id = 'dlg-t';
      paper.setAttribute('aria-labelledby', h.id);
    }
  }
  if (!paper.hasAttribute('tabindex')) paper.tabIndex = -1;
}

/** Derselbe Knopf nach dem Neuzeichnen: sichtbar, mit gleichem data-act und data-g, nicht im Fenster oder Menü. */
function twin(k: Key | null): HTMLElement | null {
  if (!k) return null;
  return (
    [...document.querySelectorAll<HTMLElement>(keySel(k))].find((el) => shown(el) && !el.closest('#modal, #menu')) ??
    null
  );
}

function restore(): void {
  const t = trigger;
  const k = triggerKey;
  trigger = null;
  triggerKey = null;
  const menuBtn = $opt('#btn-menu');
  // Einträge im Menü sind nach dem Tipp schon zu, dann zurück auf den Menüknopf.
  // Die Lobby zeichnet bei jeder Ansicht neu, dann der neue Knopf an derselben Stelle.
  const to = t && shown(t) ? t : t?.closest('#menu') ? menuBtn : (twin(k) ?? menuBtn);
  if (to && shown(to)) to.focus({ preventScroll: true });
}

function onChange(box: HTMLElement): void {
  const paper = paperOf(box);
  if (!paper) {
    if (open) {
      open = false;
      inner = null;
      restore();
    }
    return;
  }
  decorate(paper);
  if (!open) {
    open = true;
    const a = document.activeElement;
    trigger = a instanceof HTMLElement && a !== document.body && !box.contains(a) ? a : pressed;
    triggerKey = keyOf(trigger);
    paper.focus({ preventScroll: true });
  } else {
    // Inhalt gewechselt, etwa ein anderer Regel-Reiter: nicht neu einfliegen, Fokus bleibt an derselben Stelle
    paper.parentElement?.classList.add('swap');
    const same = inner
      ? paper.querySelector<HTMLElement>(`[data-act="${inner.act}"]${inner.g ? `[data-g="${inner.g}"]` : ''}`)
      : null;
    (same ?? paper).focus({ preventScroll: true });
  }
  markJump(paper);
}

/** Nächstes (oder mit back vorheriges) Element der Liste nach a in Dokumentreihenfolge, sonst rundherum. */
function step(list: HTMLElement[], a: Element, back: boolean): HTMLElement {
  if (back) {
    for (let i = list.length - 1; i >= 0; i--)
      if (a.compareDocumentPosition(list[i]) & Node.DOCUMENT_POSITION_PRECEDING) return list[i];
    return list[list.length - 1];
  }
  for (const el of list) if (a.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return el;
  return list[0];
}

/** Tab und Umschalt+Tab bleiben in root. Auch von einer Überschrift aus, auf die eine Sprungmarke den Fokus gelegt hat. */
function keepIn(e: KeyboardEvent, root: HTMLElement): void {
  const list = focusables(root);
  const a = document.activeElement;
  if (!list.length) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (!(a instanceof HTMLElement) || !root.contains(a)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (a === root) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (!list.includes(a)) {
    // Fokus liegt auf etwas, das Tab selbst nie erreicht (h3 mit tabindex -1): von dort aus weiterzählen
    e.preventDefault();
    step(list, a, e.shiftKey).focus();
  } else if (e.shiftKey && a === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && a === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Tab und Umschalt+Tab bleiben im offenen Fenster. Ist keins offen, kümmert sich menuTab ums Menü ⋯. */
function trap(e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const box = $opt('#modal');
  const paper = open && box ? paperOf(box) : null;
  if (paper) keepIn(e, paper);
  else menuTab(e);
}

/* ---------- Menü ⋯ ----------
 * Aufgehen und Schließen regelt events.ts (auch Escape). Hier: Fokus auf den ersten Eintrag, am Handy bleibt Tab
 * im Bogen, am PC führt Tab hinter dem letzten Eintrag (und Umschalt+Tab vor dem ersten) zurück zum Menüknopf. */

function menuTab(e: KeyboardEvent): void {
  const menu = $opt('#menu');
  if (!menu || menu.hidden) return;
  if (window.matchMedia?.(MENU_SHEET).matches) {
    keepIn(e, menu);
    return;
  }
  const btn = $opt('#btn-menu');
  const list = focusables(menu);
  const a = document.activeElement;
  if (!btn || !list.length) return;
  if (a === btn && !e.shiftKey) {
    e.preventDefault();
    list[0].focus();
  } else if (a instanceof HTMLElement && menu.contains(a)) {
    const out = e.shiftKey ? a === list[0] : a === list[list.length - 1];
    if (!out && list.includes(a)) return;
    e.preventDefault();
    if (out) btn.focus();
    else step(list, a, e.shiftKey).focus();
  }
}

function initMenu(): void {
  const menu = $opt('#menu');
  if (!menu) return;
  menu.setAttribute('role', 'group');
  if (!menu.hasAttribute('aria-label')) menu.setAttribute('aria-label', 'Menü');
  let was = menu.hidden;
  new MutationObserver(() => {
    if (menu.hidden === was) return;
    was = menu.hidden;
    if (menu.hidden) return;
    const first = focusables(menu).find((el) => el.classList.contains('mi'));
    first?.focus({ preventScroll: true });
  }).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
}

/* ---------- Sprungmarken in langen Fenstern (Regeln) ----------
 * Knöpfe statt Links: Der Hash der Adresse ist der Tischcode. */

function jump(btn: HTMLElement): void {
  const paper = btn.closest<HTMLElement>('.paper');
  const body = paper?.querySelector<HTMLElement>('.dlg-body');
  const sec = body?.querySelector<HTMLElement>(`[id="${btn.dataset.jump}"]`);
  if (!body || !sec) return;
  const top = sec.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 10;
  body.scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' });
  sec.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
  // Die Marke springt gleich aufs Ziel und flackert nicht durch die Abschnitte, an denen der Bogen vorbeiscrollt
  for (const b of paper?.querySelectorAll<HTMLElement>('[data-jump]') ?? []) {
    if (b === btn) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  }
  calmUntil = performance.now() + 700;
}

/** Die Sprungmarke des Abschnitts, in dem man gerade liest, ist markiert. */
function markJump(paper: HTMLElement): void {
  const btns = [...paper.querySelectorAll<HTMLElement>('[data-jump]')];
  const body = paper.querySelector<HTMLElement>('.dlg-body');
  if (!btns.length || !body) return;
  const edge = body.getBoundingClientRect().top + 48;
  const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
  let cur = '';
  for (const b of btns) {
    const sec = body.querySelector<HTMLElement>(`[id="${b.dataset.jump}"]`);
    if (sec && (sec.getBoundingClientRect().top <= edge || atEnd)) cur = b.dataset.jump ?? '';
  }
  for (const b of btns) {
    if (b.dataset.jump === cur) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  }
}

let raf = 0;
/** Nach einem Sprung kurz nicht nachmarkieren, solange der Bogen noch weich scrollt. */
let calmUntil = 0;
function onScroll(e: Event): void {
  const t = e.target;
  if (!(t instanceof HTMLElement) || !t.classList.contains('dlg-body') || raf || performance.now() < calmUntil) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const paper = t.closest<HTMLElement>('.paper');
    if (paper) markJump(paper);
  });
}

function init(): void {
  // Toasts (src/ui/feedback.ts) liest der Vorleser höflich vor. Die Region muss vor dem ersten Toast stehen
  $opt('#toasts')?.setAttribute('aria-live', 'polite');
  initMenu();
  document.addEventListener('keydown', trap, true);
  const box = $opt('#modal');
  if (!box) return;
  new MutationObserver(() => onChange(box)).observe(box, { childList: true });
  // Tippen und Klicks, auch per Tastatur ausgelöste (Enter auf einem Menüeintrag, der dabei verschwindet)
  const note = (e: Event) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>(`${FOCUSABLE}, [data-act]`) : null;
    if (!t) return;
    if (box.contains(t)) inner = keyOf(t);
    else pressed = t;
  };
  document.addEventListener('pointerdown', note, true);
  document.addEventListener('click', note, true);
  box.addEventListener('focusin', (e) => {
    inner = keyOf(e.target instanceof HTMLElement ? e.target : null);
  });
  box.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-jump]') : null;
    if (b) jump(b);
  });
  // Scroll steigt nicht auf, in der Einfangphase kommt er trotzdem an
  box.addEventListener('scroll', onScroll, { capture: true, passive: true });
}

if (typeof document !== 'undefined') init();

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
    `<h2 class="dlg-title" id="dlg-t">${s.title}</h2>${s.badge ?? ''}` +
    `<button type="button" class="x dlg-x" data-act="closemodal" aria-label="Schließen">${CLOSE_ICON}</button>` +
    `</div>${s.head ?? ''}</div>` +
    // Scrollbereich per Tastatur erreichbar, damit man ohne Maus mit Pfeiltasten lesen kann
    `<div class="dlg-body" tabindex="0" role="region" aria-labelledby="dlg-t">${s.body}</div>` +
    '</div></div>'
  );
}

/* ---------- Verhalten ---------- */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Wer das Fenster geöffnet hat. Dorthin kehrt der Fokus beim Schließen zurück. */
let trigger: HTMLElement | null = null;
/** Zuletzt angetippt. Am Handy und in Safari bekommen Knöpfe beim Tippen keinen Fokus. */
let pressed: HTMLElement | null = null;
/** Zuletzt im Fenster fokussiert, um nach einem Inhaltswechsel (Regel-Reiter) an derselben Stelle zu bleiben. */
let inner: { act: string; g: string } | null = null;
let open = false;

const paperOf = (box: Element): HTMLElement | null => box.querySelector<HTMLElement>(':scope > .modal > .paper');

function shown(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);
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

function restore(): void {
  let t = trigger;
  trigger = null;
  // Einträge im Menü sind nach dem Tipp schon zu, dann zurück auf den Menüknopf
  if (t && !shown(t) && t.closest('#menu')) t = $opt('#btn-menu');
  if (t && shown(t)) t.focus({ preventScroll: true });
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

/** Tab und Umschalt+Tab bleiben im offenen Fenster. */
function trap(e: KeyboardEvent): void {
  if (e.key !== 'Tab' || !open) return;
  const box = $opt('#modal');
  const paper = box ? paperOf(box) : null;
  if (!paper) return;
  const list = focusables(paper);
  const a = document.activeElement;
  if (!list.length) {
    e.preventDefault();
    paper.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (!(a instanceof HTMLElement) || !paper.contains(a)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && (a === first || a === paper)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && a === last) {
    e.preventDefault();
    first.focus();
  }
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
  const box = $opt('#modal');
  if (!box) return;
  new MutationObserver(() => onChange(box)).observe(box, { childList: true });
  const keyOf = (t: HTMLElement | null) => (t?.dataset.act ? { act: t.dataset.act, g: t.dataset.g ?? '' } : null);
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target instanceof Element ? e.target.closest<HTMLElement>(`${FOCUSABLE}, [data-act]`) : null;
      if (!t) return;
      if (box.contains(t)) inner = keyOf(t);
      else pressed = t;
    },
    true,
  );
  box.addEventListener('focusin', (e) => {
    inner = keyOf(e.target instanceof HTMLElement ? e.target : null);
  });
  box.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-jump]') : null;
    if (b) jump(b);
  });
  // Scroll steigt nicht auf, in der Einfangphase kommt er trotzdem an
  box.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('keydown', trap, true);
}

if (typeof document !== 'undefined') init();

import { EMOTES, TOSS_ICON, TOSS_ITEMS } from '../../game/constants';
import { App, type EmoTab } from '../app';
import { $opt, esc } from '../dom';
import { soundBtnsHTML } from '../soundboard';
import { TOSS_TEXT, tossTargets } from '../toss';

const TABS: readonly { t: EmoTab; icon: string; label: string }[] = [
  { t: 'emo', icon: '😀', label: 'Reaktionen' },
  { t: 'snd', icon: '🔊', label: 'Klänge' },
  { t: 'toss', icon: '🍅', label: 'Werfen' },
];

function tabsHTML(px: string): string {
  return (
    '<div class="etabs" role="tablist">' +
    TABS.map(({ t, icon, label }) => {
      const on = App.etab === t;
      const ic = t === 'snd' && (App.muted || App.sbOff) ? '🔇' : icon;
      return `<button type="button" class="etab${on ? ' on' : ''}" role="tab" id="${px}etab-${t}" data-act="etab" data-t="${t}" aria-selected="${on}" aria-controls="${px}erow" title="${label}"><i aria-hidden="true">${ic}</i><span>${label}</span></button>`;
    }).join('') +
    '</div>'
  );
}

function rowHTML(): string {
  if (App.etab === 'snd') return soundBtnsHTML(true);
  if (App.etab === 'toss')
    return TOSS_ITEMS.map(
      (it) =>
        `<button type="button" class="titem" data-act="tossitem" data-item="${it}" aria-label="${TOSS_TEXT[it].btn}" title="${TOSS_TEXT[it].btn}"${App.tossBlock ? ' disabled' : ''}>${TOSS_ICON[it]}</button>`,
    ).join('');
  return EMOTES.map(
    (e) =>
      `<button type="button" data-act="emote" data-e="${e}" aria-label="Reaktion ${e}"${App.emoBlock ? ' disabled' : ''}>${e}</button>`,
  ).join('');
}

const SVG =
  ' fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
/** Am Handy (Form B2) steht rechts oben an der Stelle des Chat-Knopfs ein X, das das Menü schließt */
const CLOSE = `<button type="button" class="fab emox" data-act="emotes" aria-label="Menü schließen"><svg viewBox="0 0 24 24"${SVG}><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;

/** Inhalt des Reaktionsfensters, am Tisch und im Ergebnisfenster gleich. `px` hält die ids eindeutig. */
function emotesHTML(px: string): string {
  if (App.aim) {
    const item = App.aim;
    const targets = tossTargets(App.view);
    return (
      '<div class="epanel"><div class="ehead"><button type="button" class="ex" data-act="tosscancel" aria-label="Zurück">' +
      `<svg viewBox="0 0 24 24"${SVG}><path d="M15 5l-7 7 7 7"/></svg></button><span>${TOSS_ICON[item]} ${TOSS_TEXT[item].ask}</span></div>` +
      `<div class="echips">${
        targets
          .map(
            (p) =>
              `<button type="button" class="chip" data-act="toss" data-to="${esc(p.id)}" data-item="${item}" aria-label="${esc(`${TOSS_TEXT[item].on} ${p.name}`)}"${App.tossBlock ? ' disabled' : ''}>${esc(p.name)}</button>`,
          )
          .join('') || '<span class="none">Gerade ist niemand zu sehen.</span>'
      }</div></div>`
    );
  }
  // Während der Sperre läuft unter der Reihe ein Balken leer
  const cool = Math.max(0, App.coolUntil[App.etab] - Date.now());
  const cls = cool > 50 ? ' cool' : '';
  const style = cool > 50 ? ` style="--cool:${cool}ms"` : '';
  return (
    tabsHTML(px) +
    `<div class="erow e-${App.etab}${cls}"${style} id="${px}erow" role="tabpanel" aria-labelledby="${px}etab-${App.etab}">${rowHTML()}</div>`
  );
}

/**
 * Reaktionsfenster mit Reitern für Emojis, Sounds und Würfe, am Tisch und im Ergebnisfenster.
 * Nach dem Senden kurz gesperrt, damit niemand spammt.
 */
export function renderEmotes(): void {
  watchOpen();
  const targets = App.aim ? tossTargets(App.view) : [];
  const key = [
    App.emoBlock,
    App.tossBlock,
    App.sbBlock,
    App.etab,
    App.aim,
    App.muted || App.sbOff,
    targets.map((p) => p.id + ':' + p.name).join(','),
  ].join('|');
  document.querySelectorAll<HTMLElement>('#emotes, #overlay .oemotes').forEach((el) => {
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.classList.toggle('aim', !!App.aim);
    // Tastatur: Wer gerade im Fenster steht, bleibt nach dem Neuzeichnen auf demselben Knopf, sonst auf dem Reiter
    const act = document.activeElement;
    const sel = act instanceof HTMLElement && el.contains(act) ? focusSel(act) : null;
    const mine = el.id === 'emotes';
    el.innerHTML = emotesHTML(mine ? '' : 'o') + (mine ? CLOSE : '');
    if (sel)
      (
        el.querySelector<HTMLElement>(sel) ??
        el.querySelector<HTMLElement>('[aria-selected="true"], [data-act="tosscancel"]')
      )?.focus();
  });
}

/** Wählt nach dem Neuzeichnen denselben Knopf wieder aus (Aktion plus Reiter, Klang, Emoji, Wurf oder Ziel) */
function focusSel(b: HTMLElement): string | null {
  const a = b.dataset.act;
  if (!a) return null;
  const extra = (['t', 's', 'e', 'item', 'to'] as const)
    .filter((k) => b.dataset[k] !== undefined)
    .map((k) => `[data-${k}="${CSS.escape(b.dataset[k] ?? '')}"]`)
    .join('');
  return `[data-act="${a}"]${extra}`;
}

/**
 * Schließt das Menü am Handy (Escape, X, Senden, Tipp daneben), kehrt der Fokus aus dem Fenster zum Smiley zurück.
 * Der Smiley meldet dabei, ob das Menü offen ist, offen ist das Fenster ein Dialog. Die Klasse `emoopen` setzt
 * events.ts. Eingerichtet beim ersten Zeichnen, damit der Import ohne DOM auskommt (Unit-Tests).
 */
let watching = false;
function watchOpen(): void {
  if (watching) return;
  watching = true;
  let open = false;
  $opt('#emofab')?.setAttribute('aria-expanded', 'false');
  new MutationObserver(() => {
    const now = document.body.classList.contains('emoopen');
    if (now === open) return;
    open = now;
    const fab = $opt('#emofab');
    fab?.setAttribute('aria-expanded', String(now));
    const box = $opt('#emotes');
    if (now) {
      box?.setAttribute('role', 'dialog');
      box?.setAttribute('aria-label', 'Reaktionen, Klänge und Werfen');
    } else {
      box?.removeAttribute('role');
      box?.removeAttribute('aria-label');
    }
    if (!now && document.activeElement?.closest('#emotes')) fab?.focus();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

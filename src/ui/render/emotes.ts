import { EMOTES, TOSS_ICON, TOSS_ITEMS } from '../../game/constants';
import { App, type EmoTab } from '../app';
import { esc } from '../dom';
import { soundBtnsHTML } from '../soundboard';
import { TOSS_TEXT, tossTargets } from '../toss';

const TABS: readonly { t: EmoTab; icon: string; label: string }[] = [
  { t: 'emo', icon: '😀', label: 'Reaktionen' },
  { t: 'snd', icon: '🔊', label: 'Sounds' },
  { t: 'toss', icon: '🍅', label: 'Werfen' },
];

function tabsHTML(px: string): string {
  return (
    '<div class="etabs" role="tablist">' +
    TABS.map(({ t, icon, label }) => {
      const on = App.etab === t;
      const ic = t === 'snd' && (App.muted || App.sbOff) ? '🔇' : icon;
      return `<button type="button" class="etab${on ? ' on' : ''}" role="tab" id="${px}etab-${t}" data-act="etab" data-t="${t}" aria-selected="${on}" aria-controls="${px}erow" title="${label}"><i>${ic}</i><span>${label}</span></button>`;
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

/** Inhalt des Reaktionsfensters, am Tisch und im Ergebnisfenster gleich. `px` hält die ids eindeutig. */
function emotesHTML(px: string): string {
  if (App.aim) {
    const item = App.aim;
    const targets = tossTargets(App.view);
    return (
      `<div class="epanel"><div class="ehead"><span>${TOSS_ICON[item]} ${TOSS_TEXT[item].ask}</span>` +
      '<button type="button" class="ex" data-act="tosscancel" aria-label="Abbrechen">×</button></div>' +
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
    el.innerHTML = emotesHTML(el.id === 'emotes' ? '' : 'o');
  });
}

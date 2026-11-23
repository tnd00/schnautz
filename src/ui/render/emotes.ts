import { EMOTES } from '../../game/constants';
import { App } from '../app';
import { $ } from '../dom';

/** Leiste mit Emoji-Reaktionen. Nach dem Senden kurz gesperrt, damit niemand spammt. */
export function renderEmotes(): void {
  const el = $('#emotes');
  const key = App.emoBlock ? '1' : '0';
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  el.innerHTML = EMOTES.map(
    (e) =>
      `<button type="button" data-act="emote" data-e="${e}" aria-label="Reaktion ${e}"${App.emoBlock ? ' disabled' : ''}>${e}</button>`,
  ).join('');
}

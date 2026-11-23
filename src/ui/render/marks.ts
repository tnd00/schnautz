/* Zeichen vor dem Namen: Krone der letzten Partie, amtierender Shithead und KI. Am Handy teilen sie sich ein Feld. */
import type { Player, View } from '../../game/types';
import { App } from '../app';
import { esc } from '../dom';

export function reignHTML(v: View, id: string): string {
  const rg = v.reign?.game === v.game ? v.reign : null;
  if (rg?.sh === id && App.zerHide !== id) return '<span class="reign" title="Amtierender Shithead">💩</span>';
  if (rg?.win === id) return '<span class="reign" title="Hat die letzte Partie gewonnen">👑</span>';
  return '';
}

/** KI-Zeichen als kleines Quadrat, so groß wie Krone oder 💩. */
const BOT_SQ = '<i class="botb sq" title="KI-Mitspieler">KI</i>';

/**
 * Alle Zeichen eines Gegners in einem Feld vor dem Namen. Sind es zwei, wechseln sie sich am Handy ab,
 * damit der Name nicht abgeschnitten wird. Am Desktop stehen sie nebeneinander.
 */
export function marksHTML(v: View, p: Player): string {
  const items = [reignHTML(v, p.id), p.bot ? BOT_SQ : ''].filter(Boolean);
  if (!items.length) return '';
  return `<span class="marks${items.length > 1 ? ' two' : ''}">${items.join('')}</span>`;
}

/** Ziel für Würfe: Ein Tipp auf Kachel oder Ergebniszeile öffnet die kleine Wurfleiste. */
export function aimAttrs(p: Player | null | undefined, row = false): string {
  const v = App.view;
  if (!p || !v || p.id === App.me || !v.players.some((q) => q.id === App.me)) return '';
  const name = esc(p.name);
  return ` data-act="aim"${row ? ` role="button" tabindex="0" aria-label="Auf ${name} werfen"` : ` title="Auf ${name} werfen"`}`;
}

/* Zeichen vor dem Namen: Krone der letzten Partie oder des Cabo-Königs, amtierender Shithead oder Durak und KI. Am Handy teilen sie sich ein Feld. */
import type { GameKind, Player, View } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { LOSER_MARK, LOSER_NAME, reignOf, unreachable } from '../../game/games';

export function reignHTML(v: View, id: string): string {
  const rg = reignOf(v);
  const mark = LOSER_MARK[v.game];
  if (mark && rg?.lose === id && App.zerHide !== id)
    return `<span class="reign" title="Amtierender ${LOSER_NAME[v.game]}">${mark}</span>`;
  // Bei Cabo ist der neue König bis zur Enthüllung noch geheim
  if (rg?.win === id && App.zerHide !== id) return `<span class="reign" title="${crownTitle(v.game)}">👑</span>`;
  return '';
}

/** Wofür die Krone steht: Bei Cabo ist es ein Titel, der bleibt, bis jemand anderes gewinnt. */
export function crownTitle(game: GameKind): string {
  switch (game) {
    case 'cabo':
      return 'Amtierender Cabo-König';
    case 'shithead':
    case 'durak':
    case 'schnautz':
      return 'Hat die letzte Partie gewonnen';
    default:
      return unreachable(game);
  }
}

/** Wie oft jemand in diesem Spiel schon Verlierer war (Shithead oder Durak). Schnautz und Cabo kennen keinen Titel. */
export function loserCount(game: GameKind, p: Pick<Player, 'shc' | 'dkc'>): number {
  switch (game) {
    case 'shithead':
      return num(p.shc);
    case 'durak':
      return num(p.dkc);
    case 'schnautz':
    case 'cabo':
      return 0;
    default:
      return unreachable(game);
  }
}

/** Wie oft jemand schon Durak war. Das Mal der gerade beendeten Partie zählt erst nach der Enthüllung. */
export function dkcHTML(p: Pick<Player, 'dkc' | 'id'>): string {
  const n = num(p.dkc) - (App.zerHide === p.id ? 1 : 0);
  return n > 0 ? `<span class="shc" title="So oft Durak gewesen">${LOSER_MARK.durak} ${n}</span>` : '';
}

/** KI-Zeichen als kleines Quadrat, so groß wie Krone oder 💩. */
const BOT_SQ = '<i class="botb sq" title="KI-Platz">KI</i>';

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
  // Als Zeile heißt der Knopf wie sein sichtbarer Text (WCAG 2.5.3), was er tut, sagt die Beschreibung
  return ` data-act="aim"${row ? ` role="button" tabindex="0" aria-description="Auf ${name} werfen"` : ` title="Auf ${name} werfen"`}`;
}

import { App } from '../app';
import { $, $opt } from '../dom';
import { showScreen } from '../screens';
import { rememberGame } from '../start';
import { renderBetModal } from './bets';
import { renderEmotes } from './emotes';
import { renderLegend } from './legend';
import { renderLobby } from './lobby';
import { renderLog } from './log';
import { renderGame, renderOverlay } from './schnautz';
import { renderScore } from './scorebar';
import { clearSwapGrid, renderSh, renderShOverlay } from './shithead';
import { renderTurnNote } from './turnnote';
import { markTosses } from '../toss';
import { fitDesktop } from '../fit';
import { GAME_NAME, unreachable } from '../../game/games';
import type { View } from '../../game/types';
import { renderDk, renderDkOverlay } from './durak';
import { renderCb, renderCbOverlay } from './cabo';
import { peelChosen } from '../peel';

/** Was jedes Spiel am Tisch zeichnet und ob die Leiste oben und das Abzeichen am Namen dazugehören. */
function tableOf(v: View): { draw: () => void; overlay: () => void; scorebar: boolean; badge: boolean } {
  switch (v.game) {
    case 'shithead':
      // Bei Shithead stehen alle schon auf dem Spielfeld, die Leiste wäre doppelt
      return { draw: () => renderSh(v), overlay: () => renderShOverlay(v), scorebar: false, badge: false };
    case 'durak':
      // Auch bei Durak zeigen die Kacheln alles, eine Leiste oben wäre doppelt
      return { draw: () => renderDk(v), overlay: () => renderDkOverlay(v), scorebar: false, badge: false };
    case 'cabo':
      // Die Leiste oben zeigt den Punktestand aller, das ist bei Cabo das Wichtigste
      return { draw: () => renderCb(v), overlay: () => renderCbOverlay(v), scorebar: true, badge: false };
    case 'schnautz':
      return { draw: () => renderGame(v), overlay: () => renderOverlay(v), scorebar: true, badge: true };
    default:
      return unreachable(v.game);
  }
}

/** Zeichnet alles neu, was zur aktuellen Ansicht gehört. */
export function render(): void {
  const v = App.view;
  if (!v) return;
  $('#codechip-code').textContent = App.code;
  $('#menu-lobby').hidden = !(App.role === 'host' && v.phase !== 'lobby');
  $('#menu-leave').textContent = App.role === 'host' ? 'Tisch auflösen' : 'Tisch verlassen';
  const t = tableOf(v);
  if (v.phase === 'lobby') {
    showScreen('lobby');
    renderLobby(v);
  } else {
    // Von der Lobby an den Tisch: Der gewählte Spiel-Sticker zieht sich ab, solange die Lobby noch zu sehen ist
    if (!$('#scr-lobby').hidden) peelChosen();
    showScreen('game');
    rememberGame(v.game);
    const tbl = $('#table');
    tbl.dataset.game = v.game;
    tbl.classList.toggle('swap', v.game === 'shithead' && v.phase === 'swap');
    // Das Raster der Shithead-Tauschrunde gehört nur dorthin, sonst bliebe das Karussell aus
    if (v.game !== 'shithead') clearSwapGrid();
    t.draw();
  }
  $('#brand-name').textContent = GAME_NAME[v.game];
  $('#brand-badge').hidden = !t.badge;
  if (v.phase !== 'lobby') {
    $('#scorebar').hidden = !t.scorebar;
    if (t.scorebar) renderScore(v);
    renderLegend(v);
    renderEmotes();
  }
  renderTurnNote();
  // Offenes Tipp-Fenster mitziehen oder schließen, wenn Tippen nicht mehr geht
  if ($opt('#modal .paper.bets')) renderBetModal(v);
  renderLog(v);
  t.overlay();
  // Beim Ansehen des Tisches nach einer Runde wird nur in der Übersicht reagiert
  document.body.classList.toggle('peeking', App.peek && (v.phase === 'end' || v.phase === 'over'));
  // Das Ergebnisfenster hat ein eigenes Reaktionsfenster
  if (v.phase !== 'lobby') renderEmotes();
  // Würfe kleben an Kacheln und Ergebniszeilen, nach dem Zeichnen wieder anhängen
  markTosses();
  fitDesktop();
}

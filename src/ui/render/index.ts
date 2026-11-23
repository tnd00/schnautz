import { App } from '../app';
import { $, $opt } from '../dom';
import { showScreen } from '../screens';
import { renderBetModal } from './bets';
import { renderEmotes } from './emotes';
import { renderLegend } from './legend';
import { renderLobby } from './lobby';
import { renderLog } from './log';
import { renderGame, renderOverlay } from './schnautz';
import { renderScore } from './scorebar';
import { renderSh, renderShOverlay } from './shithead';
import { renderTurnNote } from './turnnote';
import { markTosses } from '../toss';
import { fitDesktop } from '../fit';

/** Zeichnet alles neu, was zur aktuellen Ansicht gehört. */
export function render(): void {
  const v = App.view;
  if (!v) return;
  $('#codechip-code').textContent = App.code;
  $('#menu-lobby').hidden = !(App.role === 'host' && v.phase !== 'lobby');
  $('#menu-leave').textContent = App.role === 'host' ? 'Tisch auflösen' : 'Tisch verlassen';
  const sh = v.game === 'shithead';
  if (v.phase === 'lobby') {
    showScreen('lobby');
    renderLobby(v);
  } else {
    showScreen('game');
    const tbl = $('#table');
    tbl.dataset.game = v.game;
    tbl.classList.toggle('swap', sh && v.phase === 'swap');
    if (sh) renderSh(v);
    else renderGame(v);
  }
  $('#brand-name').textContent = sh ? 'Shithead' : 'Schnautz';
  $('#brand-badge').hidden = sh;
  if (v.phase !== 'lobby') {
    // Bei Shithead stehen alle schon auf dem Spielfeld, die Leiste wäre doppelt
    $('#scorebar').hidden = sh;
    if (!sh) renderScore(v);
    renderLegend(v);
    renderEmotes();
  }
  renderTurnNote();
  // Offenes Tipp-Fenster mitziehen oder schließen, wenn Tippen nicht mehr geht
  if ($opt('#modal .paper.bets')) renderBetModal(v);
  renderLog(v);
  if (sh) renderShOverlay(v);
  else renderOverlay(v);
  // Beim Ansehen des Tisches nach einer Runde wird nur in der Übersicht reagiert
  document.body.classList.toggle('peeking', App.peek && (v.phase === 'end' || v.phase === 'over'));
  // Das Ergebnisfenster hat ein eigenes Reaktionsfenster
  if (v.phase !== 'lobby') renderEmotes();
  // Würfe kleben an Kacheln und Ergebniszeilen, nach dem Zeichnen wieder anhängen
  markTosses();
  fitDesktop();
}

import { App } from '../app';
import { $ } from '../dom';
import { showScreen } from '../screens';
import { renderEmotes } from './emotes';
import { renderLegend } from './legend';
import { renderLobby } from './lobby';
import { renderLog } from './log';
import { renderGame, renderOverlay } from './schnautz';
import { renderScore } from './scorebar';
import { renderSh, renderShOverlay } from './shithead';

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
    if (sh) renderSh(v);
    else renderGame(v);
  }
  $('#brand-name').textContent = sh ? 'Shithead' : 'Schnautz';
  $('#brand-badge').hidden = sh;
  if (v.phase !== 'lobby') {
    renderScore(v);
    renderLegend(v);
    renderEmotes();
  }
  renderLog(v);
  if (sh) renderShOverlay(v);
  else renderOverlay(v);
}

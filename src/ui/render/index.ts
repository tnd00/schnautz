import { App } from '../app';
import { $, $opt } from '../dom';
import { labelNet, showScreen } from '../screens';
import { rememberGame } from '../start';
import { renderBetModal } from './bets';
import { renderEmotes } from './emotes';
import { renderLegend } from './legend';
import { renderLobby } from './lobby';
import { renderLog } from './log';
import { clearSwapGrid } from './shithead';
import { renderTurnNote } from './turnnote';
import { markTosses } from '../toss';
import { fitDesktop } from '../fit';
import { realignFeedback } from '../feedback';
import { GAME_NAME, GAMES } from '../../game/games';
import { renderResult } from './result';
import { renderTable } from '../table/index';
import { specOf } from '../table/spec';
import { peelChosen } from '../peel';

/** Zeichnet alles neu, was zur aktuellen Ansicht gehört. */
export function render(): void {
  const v = App.view;
  if (!v) return;
  $('#netcode').textContent = App.code;
  labelNet();
  $('#menu-lobby').hidden = !(App.role === 'host' && v.phase !== 'lobby');
  $('#menu-leave').textContent = App.role === 'host' ? 'Tisch auflösen' : 'Tisch verlassen';
  const spec = specOf(v.game);
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
    renderTable(v);
  }
  $('#brand-name').textContent = GAME_NAME[v.game];
  $('#brand-badge').hidden = !spec.badge;
  // Spielfarbe --g für den Sticker-Look am Tisch, auch für Fenster und Ergebnisblatt über dem Tisch
  GAMES.forEach((g) => document.body.classList.toggle(`g-${g}`, v.phase !== 'lobby' && g === v.game));
  if (v.phase !== 'lobby') {
    renderLegend(v);
    renderEmotes();
  }
  renderTurnNote();
  // Offenes Tipp-Fenster mitziehen oder schließen, wenn Tippen nicht mehr geht
  if ($opt('#modal .paper.bets')) renderBetModal(v);
  renderLog(v);
  renderResult(v, spec.sheet(v));
  // Beim Ansehen des Tisches nach einer Runde wird nur in der Übersicht reagiert
  document.body.classList.toggle('peeking', App.peek && (v.phase === 'end' || v.phase === 'over'));
  // Das Ergebnisfenster hat ein eigenes Reaktionsfenster
  if (v.phase !== 'lobby') renderEmotes();
  // Würfe kleben an Kacheln und Ergebniszeilen, nach dem Zeichnen wieder anhängen
  markTosses();
  fitDesktop();
  // Meldungen und Hinweise folgen dem neuen Bild, so wie die Uhren an den Plätzen
  realignFeedback();
}

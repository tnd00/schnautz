import { act } from '../game/actions';
import type { Action } from '../game/types';
import { App } from '../ui/app';
import { showReject, toast } from '../ui/feedback';
import { unlockAudio } from '../ui/sound';
import { sendToHost } from './guest';
import { gateAct, H, hostCommit, outdatedFor } from './host';
import { dlog } from '../ui/devlog';
import { GAME_NAME, isGame } from '../game/games';
import { ctxOfState, rejectLog, rejectText } from '../content/texts';

/** Eigene Aktion ausführen: Der Gastgeber rechnet selbst, Gäste schicken sie an den Gastgeber. */
/** Host: Ein Spiel wählen oder starten, das ein verbundener Gast noch nicht anzeigen kann? */
function blockedForOldGuests(a: Action): string | null {
  const st = H.st;
  if (!st) return null;
  const game =
    a.type === 'game' ? (isGame(a.game) ? a.game : null) : ['start', 'restart'].includes(a.type) ? st.game : null;
  if (!game) return null;
  const old = outdatedFor(game);
  if (!old.length) return null;
  const who = old.length === 1 ? `${old[0]} hat` : `${old.join(', ')} haben`;
  return `${who} noch eine alte Version ohne ${GAME_NAME[game]}. Erst neu laden lassen.`;
}

export function doAct(a: Action): void {
  unlockAudio();
  const blocked = App.role === 'host' ? blockedForOldGuests(a) : null;
  if (blocked) {
    dlog('game', blocked);
    toast(blocked, 5000);
    return;
  }
  if (App.role === 'host' && H.st) {
    const g = gateAct(H.st, App.me, a);
    if (!g) return;
    const e = act(H.st, App.me, g);
    if (e) {
      const ctx = ctxOfState(H.st, App.me);
      dlog('game', `${a.type} abgelehnt, ${rejectLog(e, ctx)}`);
      showReject(e, a.type, rejectText(e, ctx));
      App.busy = false;
    } else hostCommit();
  } else if (App.role === 'guest') {
    if (!sendToHost({ t: 'act', a })) toast('Gerade keine Verbindung. Einen Moment…');
  } else toast('Gerade keine Verbindung. Einen Moment…');
  setTimeout(() => {
    App.busy = false;
  }, 2500);
}

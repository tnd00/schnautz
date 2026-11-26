import { act } from '../game/actions';
import type { Action } from '../game/types';
import { App } from '../ui/app';
import { showReject, toast } from '../ui/feedback';
import { unlockAudio } from '../ui/sound';
import { sendToHost } from './guest';
import { gateAct, H, hostCommit } from './host';
import { dlog } from '../ui/devlog';
import { ctxOfState, rejectLog, rejectText } from '../content/texts';

/** Eigene Aktion ausführen: Der Gastgeber rechnet selbst, Gäste schicken sie an den Gastgeber. */
export function doAct(a: Action): void {
  unlockAudio();
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

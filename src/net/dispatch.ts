import { act } from '../game/actions';
import type { Action } from '../game/types';
import { App } from '../ui/app';
import { toast } from '../ui/feedback';
import { unlockAudio } from '../ui/sound';
import { sendToHost } from './guest';
import { H, hostCommit } from './host';

/** Eigene Aktion ausführen: Der Gastgeber rechnet selbst, Gäste schicken sie an den Gastgeber. */
export function doAct(a: Action): void {
  unlockAudio();
  if (App.role === 'host' && H.st) {
    const e = act(H.st, App.me, a);
    if (e) {
      toast(e);
      App.busy = false;
    } else hostCommit();
  } else if (App.role === 'guest') {
    if (!sendToHost({ t: 'act', a })) toast('Gerade keine Verbindung. Einen Moment…');
  } else toast('Gerade keine Verbindung. Einen Moment…');
  setTimeout(() => {
    App.busy = false;
  }, 2500);
}

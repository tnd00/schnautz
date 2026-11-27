/*
 * Anker für Meldungen am Tisch (Plan 2.8 geruest.md 3.6). `fieldBox` steht noch in src/ui/feedback.ts und zieht hierher,
 * sobald der Besitzer dort es freigibt.
 */
import { App } from '../app';

export type Anchor = 'field' | 'pile' | 'me' | 'seat';

/** Element, an dem eine Meldung hängt. Bei 'seat' der Platz `pid`, der eigene ist #me. */
export function anchorEl(a: Anchor, pid?: string): Element | null {
  switch (a) {
    case 'field':
      return document.getElementById('center');
    case 'pile':
      return document.querySelector('#center [data-k="pile"], #center .pile');
    case 'me':
      return document.getElementById('me');
    case 'seat':
      return pid === App.me
        ? document.getElementById('me')
        : document.querySelector(`#opps .opp[data-pid="${CSS.escape(pid ?? '')}"]`);
    default:
      return null;
  }
}

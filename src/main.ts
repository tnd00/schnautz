/* Einstiegspunkt: Schriften, Styles, Ereignisse und Startbildschirm. */
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './styles/index.css';

import { act } from './game/actions';
import { BOTS } from './net/bots';
import { G } from './net/guest';
import { H, hostCommit } from './net/host';
import { cleanCode } from './net/ids';
import { App } from './ui/app';
import { applyView } from './ui/apply';
import { $ } from './ui/dom';
import { initEvents } from './ui/events';
import { showScreen } from './ui/screens';
import { SEQ } from './ui/shithead/sequence';
import { renderSoundBtn } from './ui/sound';
import { initStart } from './ui/start';
import { autoResume, initUpdateCheck } from './ui/update';
import { LS } from './ui/storage';

declare global {
  interface Window {
    /** Zugriff für die Ende-zu-Ende-Tests. */
    __schnautz?: {
      App: typeof App;
      H: typeof H;
      G: typeof G;
      SEQ: typeof SEQ;
      applyView: typeof applyView;
      hostCommit: typeof hostCommit;
      act: typeof act;
      BOTS: typeof BOTS;
    };
  }
}

initEvents();
renderSoundBtn();
initStart();
showScreen('start');
initUpdateCheck();
// Nach dem Neuladen wegen einer neuen Version gleich zurück an den Tisch
autoResume();
if (cleanCode(location.hash.slice(1)) && LS.get('name', '')) $('#btn-join').focus();
// Zugang für die Ende-zu-Ende-Tests, nur beim Entwickeln oder mit lokalem PeerServer (Testparameter)
if (import.meta.env.DEV || new URLSearchParams(location.search).has('peerhost')) {
  window.__schnautz = { App, H, G, SEQ, applyView, hostCommit, act, BOTS };
}

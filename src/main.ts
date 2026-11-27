/* Einstiegspunkt: Schriften, Styles, Ereignisse und Startbildschirm. */
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
// Weiche Fraunces (SOFT) unter eigenem Namen, nur für den Rahmen
import './styles/fraunces-soft.css';
import './styles/index.css';

import { act } from './game/actions';
import { botDecide } from './bots/index';
import { viewFor } from './game/view';
import { BOTS } from './net/bots';
import { G } from './net/guest';
import { H, hostCommit, initHostTabs } from './net/host';
import { loadIce } from './net/ice';
import { cleanCode } from './net/ids';
import { App } from './ui/app';
import { applyView } from './ui/apply';
import { $ } from './ui/dom';
import { initEvents, resumeBack } from './ui/events';
import { lazyQuiet } from './ui/lazy';
import { showScreen } from './ui/screens';
import { SEQ } from './ui/shithead/sequence';
import { renderSoundBtn } from './ui/sound';
import { initStart } from './ui/start';
import { initBackMark, initUpdateCheck, reloadApp, showUpdate, takeBackMark, updateText } from './ui/update';
import { LS, SS } from './ui/storage';
import { initDevLog } from './ui/devlog';
import './ui/dialog'; // Fenster: Rolle, Fokus und Rückweg, richtet sich beim Laden selbst ein

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
      botDecide: typeof botDecide;
      viewFor: typeof viewFor;
    };
  }
}

// Zuerst, damit auch Fehler beim Start im Dev-Menü landen
initDevLog();

/*
 * Ein nachgeladenes Stück fehlt, meist weil inzwischen eine neue Version online ist und die alten Dateien weg sind.
 * Einmal neu laden (es geht danach an den Tisch zurück), beim zweiten Mal binnen einer Minute nur den Hinweis zeigen.
 */
window.addEventListener('vite:preloadError', (e) => {
  // Nur stilles Vorladen von Regeln oder Updates: nichts tun, beim Öffnen wird neu versucht (src/ui/lazy.ts)
  if (lazyQuiet()) return;
  const last = SS.get<number>('preloadAt', 0);
  if (Date.now() - last < 60_000) {
    showUpdate(updateText(), true);
    return;
  }
  e.preventDefault();
  SS.set('preloadAt', Date.now());
  reloadApp();
});

initEvents();
// TURN-Zugang im Hintergrund holen, bevor jemand einen Tisch aufmacht oder beitritt
loadIce();
initHostTabs();
initBackMark();
renderSoundBtn();
initStart();
showScreen('start');
initUpdateCheck();
// Nach dem Neuladen am Tisch (auch wegen einer neuen Version) ohne Tippen zurück
const back = takeBackMark();
if (back) void resumeBack(back);
if (cleanCode(location.hash.slice(1)) && LS.get('name', '')) $('#btn-join').focus();
// Zugang für die Ende-zu-Ende-Tests, nur beim Entwickeln oder mit lokalem PeerServer (Testparameter)
if (import.meta.env.DEV || new URLSearchParams(location.search).has('peerhost')) {
  window.__schnautz = { App, H, G, SEQ, applyView, hostCommit, act, BOTS, botDecide, viewFor };
}

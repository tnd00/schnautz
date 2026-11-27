/* Bildschirme umschalten, Verbindungsanzeige, Einladungslink. */
import { G } from '../net/guest';
import { App, type NetState } from './app';
import { $, $opt } from './dom';
import { toast } from './feedback';
import { dealerId, myMoveNow } from './helpers';
import { dlog } from './devlog';
import { bootFor } from './loading';
import { LS } from './storage';
import { themeColorOf } from './look';
import { prefs } from './prefs';
import { GAME_NAME } from '../game/games';

export type Screen = 'start' | 'wait' | 'lobby' | 'game';

export function showScreen(name: Screen): void {
  (['start', 'wait', 'lobby', 'game'] as const).forEach((s) => {
    $(`#scr-${s}`).hidden = s !== name;
  });
  // Am Tisch passt mobil alles auf einen Bildschirm, ohne Scrollen
  document.body.classList.toggle('ingame', name === 'game');
  // Ladebildschirm: nur die Rückkehr an den eigenen Platz oder Tisch zeigt ihn über dem Warten (src/ui/loading.ts)
  bootFor(
    name,
    name === 'wait' &&
      (App.role === 'guest' ? G.resume : LS.get<{ code?: unknown } | null>('host', null)?.code === App.code),
  );
  // Browserleiste in der Farbe des Grundes (look.ts)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColorOf(prefs().look, name, prefs().theme === 'dark'));
  document.body.classList.toggle('inlobby', name === 'lobby');
  document.body.classList.toggle('onstart', name === 'start');
  if (name !== 'start') document.body.classList.remove('startform');
  // Bestenliste oben in Lobby und am Tisch, zusätzlich im Menü ⋯ wie die Regeln (User 27.11.2026)
  $('#btn-board').hidden = name !== 'lobby' && name !== 'game';
  document.body.classList.toggle('intable', name === 'lobby' || name === 'game');
  const inTable = name === 'lobby' || name === 'game';
  // Das Menü gibt es ab der Lobby, die Startseite hat keine Kopfzeile
  $('#btn-menu').hidden = name === 'wait';
  $('#netchip').hidden = name === 'start';
  if (!inTable) {
    $('#brand-name').textContent = 'Schnautz';
    // Das Abzeichen 31 gibt es nur noch am Schnautz-Tisch
    $('#brand-badge').hidden = true;
    $('#menu').hidden = true;
    document.body.classList.remove('logopen', 'emoopen');
    $('#overlay').innerHTML = '';
    App.unread = 0;
  }
}

/** Name des Knopfs oben für Screenreader: Tisch und Stand der Verbindung, sichtbar sind nur Punkt und Code. */
export function labelNet(): void {
  const s = App.net;
  const state = s === 'online' ? 'verbunden' : s === 'off' ? 'getrennt' : 'verbinde';
  $('#netchip').setAttribute(
    'aria-label',
    `${App.code ? `Tisch ${App.code}, ` : ''}${state}. Tisch und Verbindung ansehen`,
  );
}

export function setNet(s: NetState): void {
  if (App.net !== s) dlog('net', `Netz ${s}`);
  App.net = s;
  $('#netdot').className = `dot ${s}`;
  $('#nettext').textContent = s === 'online' ? 'verbunden' : s === 'off' ? 'getrennt' : 'verbinde…';
  labelNet();
  if (s === 'online') G.downSince = 0;
  else if (!G.downSince) G.downSince = Date.now();
  $('#netbar').hidden = !(App.role === 'guest' && App.view && s !== 'online');
}

export function setWait(text: string, sub = ''): void {
  $('#wait-text').textContent = text;
  $('#wait-sub').textContent = sub;
}

export const shareLink = (): string => `${location.href.split('#')[0]}#${App.code}`;

export function copyLink(): void {
  const link = shareLink();
  const done = () => {
    toast('Link kopiert. Jetzt einfach verschicken.');
    const b = $opt('#btn-copy');
    const l = b?.querySelector('.lc-l');
    if (b && l) {
      b.classList.add('done');
      l.textContent = 'Kopiert!';
      setTimeout(() => {
        b.classList.remove('done');
        l.textContent = 'Link kopieren';
      }, 1800);
    }
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(done, () => {
      fallbackCopy(link);
      done();
    });
  } else {
    fallbackCopy(link);
    done();
  }
}

/** Für ältere Browser und unsichere Kontexte ohne Clipboard-API. */
function fallbackCopy(text: string): void {
  const t = document.createElement('textarea');
  t.value = text;
  document.body.appendChild(t);
  t.select();
  try {
    document.execCommand('copy');
  } catch {
    /* dann eben nicht */
  }
  t.remove();
}

/** Im Tab-Titel anzeigen, wenn man dran ist und gerade woanders ist. */
export function updateTitle(): void {
  const v = App.view;
  const yourTurn = v && (myMoveNow(v) || (v.phase === 'choose' && dealerId(v) === App.me)) && document.hidden;
  document.title = `${yourTurn ? '● Du bist dran · ' : ''}${GAME_NAME[v?.game ?? 'schnautz']} · Online`;
}

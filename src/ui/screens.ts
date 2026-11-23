/* Bildschirme umschalten, Verbindungsanzeige, Einladungslink. */
import { G } from '../net/guest';
import { App, type NetState } from './app';
import { $, $opt } from './dom';
import { toast } from './feedback';
import { dealerId, myTurn } from './helpers';

export type Screen = 'start' | 'wait' | 'lobby' | 'game';

export function showScreen(name: Screen): void {
  (['start', 'wait', 'lobby', 'game'] as const).forEach((s) => {
    $(`#scr-${s}`).hidden = s !== name;
  });
  // Am Tisch passt mobil alles auf einen Bildschirm, ohne Scrollen
  document.body.classList.toggle('ingame', name === 'game');
  document.body.classList.toggle('inlobby', name === 'lobby');
  document.body.classList.toggle('onstart', name === 'start');
  if (name !== 'start') document.body.classList.remove('startform');
  $('#btn-board').hidden = name !== 'game';
  document.body.classList.toggle('intable', name === 'lobby' || name === 'game');
  const inTable = name === 'lobby' || name === 'game';
  $('#codechip').hidden = !inTable;
  // Das Menü gibt es überall, außerhalb des Tisches nur mit den Updates
  $('#btn-menu').hidden = name === 'wait';
  $('#netchip').hidden = name === 'start';
  if (!inTable) {
    $('#brand-name').textContent = 'Schnautz';
    $('#brand-badge').hidden = false;
    $('#menu').hidden = true;
    document.body.classList.remove('logopen', 'emoopen');
    $('#overlay').innerHTML = '';
    App.unread = 0;
  }
}

export function setNet(s: NetState): void {
  App.net = s;
  $('#netdot').className = `dot ${s}`;
  $('#nettext').textContent = s === 'online' ? 'verbunden' : s === 'off' ? 'getrennt' : 'verbinde…';
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
    if (b) {
      b.textContent = 'Kopiert!';
      setTimeout(() => {
        b.textContent = 'Kopieren';
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
  const yourTurn = v && (myTurn(v) || (v.phase === 'choose' && dealerId(v) === App.me)) && document.hidden;
  document.title = `${yourTurn ? '● Du bist dran · ' : ''}${v?.game === 'shithead' ? 'Shithead' : 'Schnautz'} · Online`;
}

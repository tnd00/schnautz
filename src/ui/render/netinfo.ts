/*
 * Fenster hinter dem Punkt oben: Tischcode mit Link zum Einladen, darunter die Verbindung zum Aufklappen (Rolle,
 * Antwortzeit und wer gerade da ist). Punkt und Code waren früher zwei Knöpfe, jetzt ist es einer.
 */
import { APP_VERSION } from '../../content/version';
import { G } from '../../net/guest';
import { App } from '../app';
import { sheetHTML } from '../dialog';
import { esc } from '../dom';
import { inviteBody } from './invite';

const STATE: Record<string, string> = {
  online: 'Verbunden',
  connecting: 'Verbinde…',
  reconnecting: 'Verbindung wird wiederhergestellt…',
  off: 'Getrennt',
};

function ago(t: number): string {
  if (!t) return 'noch nie';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 2 ? 'gerade eben' : `vor ${s} Sekunden`;
}

function quality(ms: number): string {
  if (ms < 120) return 'sehr gut';
  if (ms < 300) return 'gut';
  return ms < 800 ? 'etwas langsam' : 'langsam';
}

const row = (k: string, v: string): string => `<div class="nrow"><span>${k}</span><b>${v}</b></div>`;

export function netInfoHTML(): string {
  const v = App.view;
  const host = v?.players.find((p) => p.id === v.host);
  const rows: string[] = [];
  if (App.role === 'host') rows.push(row('Rolle', 'Du bist Gastgeber, alle sind direkt mit dir verbunden'));
  else if (App.role === 'guest') {
    rows.push(row('Rolle', `Gast bei ${esc(host?.name ?? 'dem Gastgeber')}`));
    if (G.rtt) rows.push(row('Antwortzeit', `${G.rtt} ms, ${quality(G.rtt)}`));
    rows.push(row('Letztes Lebenszeichen', ago(G.lastPong)));
  }
  const people = (v?.players ?? []).filter((p) => !p.bot || p.left);
  const bots = (v?.players ?? []).filter((p) => p.bot && !p.left).length;
  const list = people
    .map((p) => {
      const on = p.online && !p.bot;
      const what = p.bot ? 'gegangen, die KI spielt weiter' : on ? 'online' : 'offline';
      return `<li><i class="dot ${on ? 'online' : 'off'}"></i>${esc(p.id === App.me ? 'Du' : p.name)}<span>${what}</span></li>`;
    })
    .join('');
  return sheetHTML({
    kind: 'netinfo invite',
    title: 'Tisch',
    body:
      (App.code && App.view ? inviteBody() : '') +
      // Zugeklappt steht nur der Status da, damit der Bogen am Handy nicht scrollt
      `<details><summary class="nrow"><h3>Verbindung</h3><b><i class="dot ${App.net}"></i>${STATE[App.net] ?? App.net}</b></summary>` +
      '<p class="lead">Ihr spielt direkt von Browser zu Browser, der Gastgeber hält den Tisch.</p>' +
      `<div class="nrows">${rows.join('')}</div>` +
      (list ? `<h3>Am Tisch</h3><ul class="npeople">${list}</ul>` : '') +
      (bots ? `<p class="nnote">Dazu ${bots === 1 ? 'eine KI' : `${bots} KIs`}.</p>` : '') +
      '</details>' +
      // Kurzform wie im Changelog (2.7.0 heißt 2.7), ohne ihn ins Startpaket zu holen (src/ui/lazy.ts)
      `<p class="nnote">Version ${esc(APP_VERSION.replace(/\.0$/, ''))}</p>`,
  });
}

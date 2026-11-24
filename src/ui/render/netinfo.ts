/*
 * Fenster hinter dem Punkt oben: Tischcode mit Link zum Einladen, darunter die Verbindung (Rolle, Antwortzeit und
 * wer gerade da ist). Punkt und Code waren früher zwei Knöpfe, jetzt ist es einer.
 */
import { CHANGELOG } from '../../content/changelog';
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
  const rows: string[] = [row('Status', `<i class="dot ${App.net}"></i> ${STATE[App.net] ?? App.net}`)];
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
      '<h3>Verbindung</h3><p class="lead">Ihr spielt direkt von Browser zu Browser, der Gastgeber hält den Tisch.</p>' +
      `<div class="nrows">${rows.join('')}</div>` +
      (list ? `<h3>Am Tisch</h3><ul class="npeople">${list}</ul>` : '') +
      (bots ? `<p class="nnote">Dazu ${bots === 1 ? 'eine KI' : `${bots} KIs`}.</p>` : '') +
      `<p class="nnote">Version ${esc(CHANGELOG[0]?.v ?? '')}</p>`,
  });
}

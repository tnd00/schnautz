/* Lobby: Plätze am Tisch, Spielauswahl und Regeln. */
import { DEFAULT_RULES, MAX_PLAYERS, SH_WIN_MS } from '../../game/constants';
import type { Player, Rules, ShRules, View } from '../../game/types';
import { App } from '../app';
import { livesHTML } from '../cards';
import { $, esc, num } from '../dom';
import { pById } from '../helpers';
import { shareLink } from '../screens';
import { shcHTML } from './shithead';

const ICON_MINUS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 12h12"/></svg>';
const ICON_PLUS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg>';

const EMPTY_SEAT =
  '<li class="empty"><span class="avatar" style="background:transparent;border:1px dashed rgba(246,239,223,.3);color:var(--muted)">?</span><span class="nm">Freier Platz</span></li>';

function seatHTML(v: View, p: Player): string {
  const host = App.role === 'host';
  return (
    `<li${p.online ? '' : ' class="off"'}>` +
    `<span class="avatar">${esc(p.name.charAt(0).toUpperCase())}</span>` +
    `<span class="nm">${esc(p.name)}` +
    (p.id === App.me ? ' <span style="color:var(--muted);font-weight:400">(du)</span>' : '') +
    (p.online ? '' : ' <span style="color:#f0a59c;font-weight:400">offline</span>') +
    '</span>' +
    (p.id === v.host ? '<span class="badge">Gastgeber</span>' : '') +
    (p.bot ? '<span class="badge kib">KI</span>' : '') +
    (v.game === 'shithead' ? shcHTML(p) : livesHTML({ lives: v.rules.lives, out: false }, v.rules)) +
    (p.bot && host
      ? `<button class="xbtn" data-act="rmbot" data-id="${esc(p.id)}" aria-label="KI entfernen">×</button>`
      : '') +
    '</li>'
  );
}

function toggle(
  attr: 'rule' | 'shrule',
  key: string,
  on: boolean,
  label: string,
  sub: string,
  disabled: boolean,
): string {
  return (
    `<label class="toggle"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>` +
    `<input type="checkbox" class="switch" data-${attr}="${key}"${on ? ' checked' : ''}${disabled ? ' disabled' : ''}></label>`
  );
}

function gameSelect(v: View, host: boolean): string {
  const btn = (g: 'schnautz' | 'shithead', label: string) =>
    `<button data-act="game" data-g="${g}" class="${v.game === g ? 'on' : ''}"${host ? '' : ' disabled'}>${label}</button>`;
  return `<div class="gamesel">${btn('schnautz', 'Schnautz')}${btn('shithead', 'Shithead')}</div>`;
}

function shitheadRules(sr: ShRules, dis: boolean): string {
  const t = (k: keyof ShRules, label: string, sub: string) => toggle('shrule', k, sr[k], label, sub, dis);
  return (
    t('two', '2 setzt zurück', 'Geht immer, danach ist wieder alles erlaubt') +
    t('ten', '10 verbrennt', 'Geht immer, der Stapel ist weg und du legst gleich nochmal') +
    t('seven', '7 heißt drunter', 'Der Nächste muss 7 oder niedriger legen') +
    t('three', '3 ist durchsichtig', 'Geht immer, es zählt die Karte darunter') +
    t('eight', '8 lässt aussetzen', 'Jede 8 überspringt einen Spieler') +
    t(
      'four',
      '4er am Anfang reinwerfen',
      `Wer eine 4 hat, fängt an. Die anderen haben ${Math.round(SH_WIN_MS / 1000)} Sekunden für ihre 4er`,
    ) +
    t('cut', 'Bombe einwerfen', 'Wer die fehlenden Karten zu vier gleichen hat, darf jederzeit reinwerfen') +
    '<p class="note" style="margin-top:8px">Vier gleiche Karten hintereinander verbrennen den Stapel immer. Wer sie vollmacht, legt gleich nochmal.</p>'
  );
}

function schnautzRules(r: Rules, host: boolean): string {
  const t = (k: 'feuer' | 'dealerChoice' | 'knockFirst' | 'knockDouble', label: string, sub: string) =>
    toggle('rule', k, r[k], label, sub, !host);
  const lives = host
    ? `<div class="stepper"><button data-act="lives" data-d="-1" aria-label="weniger">${ICON_MINUS}</button><b>${num(r.lives)}</b><button data-act="lives" data-d="1" aria-label="mehr">${ICON_PLUS}</button></div>`
    : `<b style="font-family:var(--display);font-size:18px">${num(r.lives)}</b>`;
  return (
    `<div class="toggle" style="cursor:default"><span>Bierdeckel pro Person<small>Das sind die Leben, danach schwimmt man</small></span>${lives}</div>` +
    t('feuer', 'Drei Asse sind Feuer', 'Zählt 33, alle anderen verlieren einen Bierdeckel') +
    t('dealerChoice', 'Geber bekommt ein zweites Blatt', 'Behalten oder blind tauschen') +
    t('knockFirst', 'Klopfen sofort erlaubt', 'Sonst erst, wenn jeder einmal dran war') +
    t('knockDouble', 'Klopfer verliert doppelt', 'Wer klopft und am wenigsten hat, verliert zwei Bierdeckel')
  );
}

export function renderLobby(v: View): void {
  const host = App.role === 'host';
  $('#lobby-code').textContent = App.code;
  $('#lobby-link').textContent = shareLink();
  $('#btn-share').hidden = !('share' in navigator);
  $('#seat-title').textContent = `Am Tisch (${v.players.length} von ${MAX_PLAYERS})`;

  let seats = v.players.map((p) => seatHTML(v, p)).join('');
  const shown = Math.max(2, v.players.length + (v.players.length < MAX_PLAYERS ? 1 : 0));
  for (let i = v.players.length; i < shown; i++) seats += EMPTY_SEAT;
  if (host && v.players.length < MAX_PLAYERS) {
    seats += '<li class="addbot"><button class="btn ghost" data-act="addbot">🤖 KI-Mitspieler dazuholen</button></li>';
  }
  $('#seats').innerHTML = seats;

  const rules =
    v.game === 'shithead' ? shitheadRules(v.rules.sh ?? DEFAULT_RULES.sh, !host) : schnautzRules(v.rules, host);
  $('#rules-form').innerHTML = gameSelect(v, host) + rules;
  $('#rules-note').textContent = host
    ? 'Du bist Gastgeber und legst die Regeln fest.'
    : 'Die Regeln legt der Gastgeber fest.';

  if (host) {
    $('#lobby-start').innerHTML =
      v.players.length >= 2
        ? '<button class="btn primary pulse" data-act="start" style="width:100%">Partie starten</button>'
        : '<button class="btn primary" disabled style="width:100%">Partie starten</button><p class="note" style="margin-top:8px;text-align:center">Sobald jemand beitritt, kann es losgehen.</p>';
  } else {
    const hostName = pById(v, v.host)?.name ?? 'Der Gastgeber';
    $('#lobby-start').innerHTML =
      `<p class="note" style="text-align:center;font-size:15px">${esc(hostName)} startet gleich die Partie<span class="thinking"><i></i><i></i><i></i></span></p>`;
  }
}

/* Lobby: Plätze am Tisch, Spielauswahl und Regeln. Am Handy als zwei Reiter, damit nichts scrollt. */
import {
  CB_TARGETS,
  CB_TWO_DECKS,
  DEFAULT_RULES,
  DK_FULL_DECK,
  MIN_SEATS,
  SH_WIN_MS,
  TURN_SECS,
} from '../../game/constants';
import { maxSeats, seatLimit } from '../../game/state';
import type { CbRules, DkRules, GameKind, Player, Rules, ShRules, View } from '../../game/types';
import { App } from '../app';
import { BOT_TAG } from '../cards';
import { $, esc, num } from '../dom';
import { pById } from '../helpers';
import { shareLink } from '../screens';
import { shcHTML } from './shithead';
import { dkcHTML } from './marks';
import { GAME_NAME, GAMES, LOSER_MARK, unreachable } from '../../game/games';

const ICON_MINUS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 12h12"/></svg>';
const ICON_PLUS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg>';

/** Freier Platz. Der Gastgeber kann ihn ohne Auffüllen per Knopf mit einer KI besetzen. */
function emptySeat(host: boolean, fill: boolean, many: boolean): string {
  return (
    `<li class="empty"><span class="avatar">?</span><span class="nm">${many ? 'Frei' : 'Freier Platz'}</span>` +
    (host && !fill ? '<button class="btn ghost small" data-act="addbot" aria-label="KI dazuholen">+ KI</button>' : '') +
    '</li>'
  );
}

function seatHTML(v: View, p: Player): string {
  const host = App.role === 'host';
  return (
    `<li${p.online ? '' : ' class="off"'}>` +
    `<span class="avatar">${esc(p.name.charAt(0).toUpperCase())}</span>` +
    `<span class="nm"><span class="nmt">${esc(p.name)}</span>` +
    (p.id === App.me ? '<span class="you">du</span>' : '') +
    (p.online ? '' : '<span class="offt">offline</span>') +
    (p.bot ? BOT_TAG : '') +
    '</span>' +
    (p.id === v.host ? '<span class="badge">Gastgeber</span>' : '') +
    (v.game === 'shithead' ? shcHTML(p) : v.game === 'durak' ? dkcHTML(p) : '') +
    (p.bot && host
      ? `<button class="xbtn" data-act="rmbot" data-id="${esc(p.id)}" aria-label="KI entfernen">×</button>`
      : '') +
    '</li>'
  );
}

/** Zeit pro Zug als Regler (Gastgeber) oder als Angabe (Gäste). */
export const turnLabel = (s: number): string => (s ? `${s} s` : 'aus');
/** Doppelte Zeit gibt es in der Tauschrunde, bei Cabo beim Ansehen zu Beginn jeder Runde. */
const turnSub = (s: number, game: GameKind): string =>
  s
    ? `Danach zieht die KI einen Zug, ${game === 'cabo' ? 'beim Ansehen' : 'in der Tauschrunde'} nach ${s * 2} s`
    : 'Niemand wird gehetzt';

function timeControl(v: View, host: boolean): string {
  const s = v.rules.turnSecs;
  const i = Math.max(0, TURN_SECS.indexOf(s));
  // Der Regler steht in derselben Zeile, auf kurzen Handys passt so alles ohne Scrollen
  const range = host
    ? `<input type="range" class="range" min="0" max="${TURN_SECS.length - 1}" step="1" value="${i}" data-range="turnSecs" aria-label="Zeit pro Zug">`
    : '';
  return `<div class="toggle tslider"><span>Zeit pro Zug<small id="tsub">${turnSub(s, v.game)}</small></span>${range}<b class="tval" id="tval">${turnLabel(s)}</b></div>`;
}

/** Platzzahl für den Gastgeber: nie weniger als die Menschen am Tisch, nie mehr als das Spiel erlaubt. */
function seatControl(v: View): string {
  const n = seatLimit(v);
  const lo = Math.max(MIN_SEATS, v.players.filter((p) => !p.bot).length);
  const hi = maxSeats(v.game);
  return (
    '<div class="stepper" title="Plätze am Tisch">' +
    `<button data-act="seats" data-d="-1" aria-label="ein Platz weniger"${n <= lo ? ' disabled' : ''}>${ICON_MINUS}</button>` +
    `<b>${num(n)}</b>` +
    `<button data-act="seats" data-d="1" aria-label="ein Platz mehr"${n >= hi ? ' disabled' : ''}>${ICON_PLUS}</button></div>`
  );
}

function toggle(
  attr: 'rule' | 'shrule' | 'dkrule' | 'cbrule',
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
  const btn = (g: GameKind) =>
    `<button data-act="game" data-g="${g}" class="${v.game === g ? 'on' : ''}"${host ? '' : ' disabled'}>${GAME_NAME[g]}</button>`;
  return `<div class="gamesel">${GAMES.map(btn).join('')}</div>`;
}

/** Regeln des gewählten Spiels in der Lobby. */
function gameRules(v: View, host: boolean): string {
  switch (v.game) {
    case 'shithead':
      return shitheadRules(v.rules.sh ?? DEFAULT_RULES.sh, !host);
    case 'durak':
      return durakRules(v.rules.dk ?? DEFAULT_RULES.dk, host);
    case 'schnautz':
      return schnautzRules(v.rules, host);
    case 'cabo':
      return caboRules(v.rules.cb ?? DEFAULT_RULES.cb, host);
    default:
      return unreachable(v.game);
  }
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
      '4er reinwerfen',
      `Bei jedem neuen Stapel dürfen alle, auch wer dran ist. Gespielt wird nach bis zu ${Math.round(SH_WIN_MS / 1000)} Sekunden`,
    ) +
    t('cut', 'Bombe einwerfen', 'Wer die fehlenden Karten zu vier gleichen hat, darf jederzeit reinwerfen') +
    t('deck5', 'Zwei Decks schon ab 5', 'Ab 6 Leuten wird immer mit zwei Decks gespielt') +
    '<p class="note" style="margin-top:8px">Vier gleiche Karten hintereinander sind immer eine Bombe und verbrennen den Stapel. Wer sie vollmacht, legt gleich nochmal.</p>'
  );
}

function durakRules(dr: DkRules, host: boolean): string {
  return (
    toggle(
      'dkrule',
      'transfer',
      dr.transfer,
      'Weiterschieben',
      'Vor dem ersten Schlag legt der Verteidiger den gleichen Wert dazu, dann muss der Nächste ran',
      !host,
    ) +
    `<p class="note" style="margin-top:8px">Bis ${DK_FULL_DECK - 1} Leute spielt ihr mit 36 Karten von der 6 bis zum Ass, ab ${DK_FULL_DECK} mit allen 52. Wer als Letzter Karten hat, ist der Durak und trägt den ${LOSER_MARK.durak}.</p>`
  );
}

/** Cabo: Zielpunkte als Auswahl aus zwei (auf kurzen Handys über beide Spalten), dazu der Schalter fürs Schnappen. */
function caboRules(cr: CbRules, host: boolean): string {
  const btn = (n: number) =>
    `<button data-act="cbtarget" data-v="${n}" class="${cr.target === n ? 'on' : ''}"${host ? '' : ' disabled'} style="padding:5px 12px">${num(n)}</button>`;
  return (
    `<div class="toggle cbtarget" style="cursor:default;grid-column:1/-1"><span>Zielpunkte<small>Wer drüber kommt, beendet die Partie</small></span>` +
    `<div class="gamesel" style="margin:0;padding:3px;flex:none">${CB_TARGETS.map(btn).join('')}</div></div>` +
    toggle(
      'cbrule',
      'snap',
      cr.snap,
      'Schnappen',
      'Gleichen Wert wie oben auf der Ablage jederzeit draufwerfen, daneben kostet eine Strafkarte',
      !host,
    ) +
    `<p class="note" style="margin-top:8px">Ab ${CB_TWO_DECKS} Leuten wird mit zwei Decks gespielt. Wer am Ende die wenigsten Punkte hat, wird Cabo-König und behält die Krone, bis jemand anderes gewinnt.</p>`
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
  const limit = seatLimit(v);
  $('#lobby-code').textContent = App.code;
  $('#lobby-link').textContent = shareLink();
  $('#btn-share').hidden = !('share' in navigator);
  $('#seat-title').textContent = `Am Tisch (${v.players.length} von ${limit})`;
  $('#seat-ctl').innerHTML = host ? seatControl(v) : '';

  let seats = v.players.map((p) => seatHTML(v, p)).join('');
  for (let i = v.players.length; i < limit; i++) seats += emptySeat(host, v.rules.fill, limit > 4);
  const seatsEl = $('#seats');
  seatsEl.innerHTML = seats;
  seatsEl.classList.toggle('many', limit > 4);
  $('#seat-opts').innerHTML =
    (host
      ? toggle(
          'rule',
          'fill',
          v.rules.fill,
          'Leere Plätze mit KI füllen',
          'Wer später kommt, übernimmt einen KI-Platz',
          false,
        )
      : '') + timeControl(v, host);

  // Reiter am Handy, am Desktop stehen beide Bereiche nebeneinander
  document.querySelectorAll<HTMLElement>('#lobby-tabs [data-t]').forEach((b) => {
    b.classList.toggle('on', b.dataset.t === App.ltab);
  });
  document.querySelectorAll<HTMLElement>('#scr-lobby .lpane').forEach((el) => {
    el.classList.toggle('on', el.dataset.pane === App.ltab);
  });

  $('#rules-form').innerHTML = gameSelect(v, host) + gameRules(v, host);
  $('#rules-note').textContent = host
    ? 'Du bist Gastgeber und legst die Regeln fest.'
    : 'Die Regeln legt der Gastgeber fest.';

  if (host) {
    $('#lobby-start').innerHTML =
      v.players.length >= 2
        ? '<button class="btn primary pulse" data-act="start" style="width:100%">Partie starten</button>'
        : '<button class="btn primary" disabled style="width:100%">Partie starten</button><p class="note" style="margin-top:8px;text-align:center">Sobald jemand beitritt oder du eine KI dazuholst, kann es losgehen.</p>';
  } else {
    const hostName = pById(v, v.host)?.name ?? 'Der Gastgeber';
    $('#lobby-start').innerHTML =
      `<p class="note" style="text-align:center;font-size:15px">${esc(hostName)} startet gleich die Partie<span class="thinking"><i></i><i></i><i></i></span></p>`;
  }
}

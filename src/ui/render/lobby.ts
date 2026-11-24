/*
 * Lobby: Plätze als Sticker, die Spielwahl als Spiel-Sticker, Regeln und eine feste Startleiste.
 * Am Handy zwei Reiter, am PC zwei Spalten. Nichts scrollt: fitLobby rückt die Inhalte stufenweise zusammen,
 * bis sie in die verfügbare Höhe passen.
 */
import {
  CB_TARGETS,
  CB_TWO_DECKS,
  DEFAULT_RULES,
  DK_FULL_DECK,
  MAX_SEATS,
  MIN_SEATS,
  SH_WIN_MS,
  TURN_SECS,
} from '../../game/constants';
import { maxSeats, seatLimit } from '../../game/state';
import type { CbRules, DkRules, GameKind, Player, Rules, ShRules, View } from '../../game/types';
import { App } from '../app';
import { BOT_TAG } from '../cards';
import { $, $opt, esc, num } from '../dom';
import { pById } from '../helpers';
import { MARK, PEOPLE, TILT } from '../start';
import { shcHTML } from './shithead';
import { dkcHTML } from './marks';
import { GAME_NAME, GAMES, LOSER_MARK, unreachable } from '../../game/games';

const svg = (d: string, w = 2.5): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_MINUS = svg('<path d="M6 12h12"/>');
const ICON_PLUS = svg('<path d="M6 12h12M12 6v12"/>');
const ICON_X = svg('<path d="M7 7l10 10M17 7 7 17"/>', 3);
const ICON_CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 3);
const ICON_OFF = svg('<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>', 2.2);
const ICON_BOT = svg(
  '<rect x="4" y="8" width="16" height="12" rx="4"/><path d="M12 8V4.5M9 13.5h.01M15 13.5h.01M9.5 17h5"/>',
  2,
);
const ICON_GONE = svg(
  '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-2.2-1.6"/>',
  2,
);
const ICON_CLOCK = svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>', 2);

/** Feste Neigung pro Platz, nie zufällig */
const SEAT_TILT = ['st-l2', 'st-r2', 'st-r1', 'st-l1', 'st-r3', 'st-l3', 'st-l1', 'st-r2', 'st-l2', 'st-r1'];
const tiltOf = (i: number): string => SEAT_TILT[i % SEAT_TILT.length];

/** „zu dritt“: wie viele am Tisch sitzen, so wie man es sagt */
const ZU = [
  '',
  'allein',
  'zu zweit',
  'zu dritt',
  'zu viert',
  'zu fünft',
  'zu sechst',
  'zu siebt',
  'zu acht',
  'zu neunt',
  'zu zehnt',
];
const lineup = (n: number): string => ZU[n] ?? `zu ${n}`;

/** Was zuletzt gezeichnet wurde: Nur was neu ist, klebt mit Platsch fest oder blättert um. */
const LOB = { seats: null as Set<string> | null, game: '', n: 0, code: '', ready: false, lives: 0 };

/** Neuer Tisch: vergessen, was gezeichnet war. */
function forgetLobby(): void {
  LOB.seats = null;
  LOB.game = '';
  LOB.n = 0;
  LOB.ready = false;
  LOB.lives = 0;
}

const seatKey = (p: Player): string => `${p.id}:${p.bot ? 'k' : 'm'}`;

function seatHTML(v: View, p: Player, i: number, fresh: boolean): string {
  const host = App.role === 'host';
  const me = p.id === App.me;
  const tag = me ? 'du' : p.id === v.host ? 'Gastgeber' : '';
  const cls = `lseat st ${tiltOf(i)}${p.bot ? ' bot' : ''}${p.online ? '' : ' off'}${me ? ' is-me' : ''}${fresh ? ' st-stick' : ''}`;
  const av = p.bot
    ? `<span class="av av-bot" aria-hidden="true">${ICON_BOT}</span>`
    : `<span class="av" aria-hidden="true">${esc(p.name.charAt(0).toUpperCase())}</span>`;
  const marks = v.game === 'shithead' ? shcHTML(p) : v.game === 'durak' ? dkcHTML(p) : '';
  return (
    `<li class="${cls}">${av}<span class="nm"><span class="nmt">${esc(p.name)}</span>` +
    (p.online ? '' : `<span class="offt">${ICON_GONE}offline</span>`) +
    '</span>' +
    marks +
    (p.bot ? BOT_TAG : '') +
    (tag ? `<span class="st-tag stag">${tag}</span>` : '') +
    (p.bot && host
      ? `<button class="lx" data-act="rmbot" data-id="${esc(p.id)}" aria-label="${esc(p.name)} entfernen">${ICON_X}</button>`
      : '') +
    '</li>'
  );
}

/** Freier Platz als gestrichelter Stanzrand. Der Gastgeber holt mit einem Tipp eine KI dazu. */
function emptySeat(host: boolean, fill: boolean, i: number): string {
  if (host && !fill)
    return (
      `<li class="lseat empty ${tiltOf(i)}"><button class="addseat" data-act="addbot" aria-label="KI dazuholen">` +
      `<span class="addchip">${ICON_PLUS}KI</span></button></li>`
    );
  return `<li class="lseat empty ${tiltOf(i)}"><span class="freet">frei</span></li>`;
}

/** Zeit pro Zug als Wort: „20 s“ oder „aus“. */
export const turnLabel = (s: number): string => (s ? `${s} s` : 'aus');
/** Dasselbe zum Vorlesen am Regler */
export const turnText = (s: number): string => (s ? `${s} Sekunden pro Zug` : 'ohne Zeitlimit');

/** Doppelte Zeit gibt es nur in der Shithead-Tauschrunde und beim Ansehen zu Beginn jeder Cabo-Runde. */
function turnSub(s: number, game: GameKind): string {
  if (!s) return 'Niemand wird gehetzt';
  switch (game) {
    case 'shithead':
      return `Danach zieht die KI für dich, in der Tauschrunde nach ${s * 2} s`;
    case 'cabo':
      return `Danach zieht die KI für dich, beim Ansehen nach ${s * 2} s`;
    case 'schnautz':
    case 'durak':
      return 'Danach zieht die KI einen Zug für dich';
    default:
      return unreachable(game);
  }
}

function timeControl(v: View): string {
  const s = v.rules.turnSecs;
  const i = Math.max(0, TURN_SECS.indexOf(s));
  return (
    '<div class="rrow rtime"><span class="rt">Zeit pro Zug</span>' +
    `<input type="range" class="range" min="0" max="${TURN_SECS.length - 1}" step="1" value="${i}" data-range="turnSecs" ` +
    `aria-label="Zeit pro Zug" aria-valuetext="${turnText(s)}">` +
    `<b class="st-num tval" id="tval">${turnLabel(s)}</b><small id="tsub">${turnSub(s, v.game)}</small></div>`
  );
}

/** Platzzahl als Zahl-Sticker mit Minus und Plus: nie weniger als die Menschen am Tisch, nie mehr als das Spiel erlaubt. */
function seatControl(v: View, flip: boolean): string {
  const n = seatLimit(v);
  const lo = Math.max(MIN_SEATS, v.players.filter((p) => !p.bot).length);
  const hi = maxSeats(v.game);
  return (
    '<div class="stepper" role="group" aria-label="Plätze am Tisch">' +
    `<button class="stp" data-act="seats" data-d="-1" aria-label="ein Platz weniger"${n <= lo ? ' disabled' : ''}>${ICON_MINUS}</button>` +
    `<b class="st-num snum${flip ? ' st-flip' : ''}" aria-live="polite">${num(n)}<span class="sr"> Plätze</span></b>` +
    `<button class="stp" data-act="seats" data-d="1" aria-label="ein Platz mehr"${n >= hi ? ' disabled' : ''}>${ICON_PLUS}</button></div>`
  );
}

/** Eine Regel, für Gastgeber als Schalter, für Gäste als ruhiger Chip mit an oder aus. */
type RuleDef = {
  attr: 'rule' | 'shrule' | 'dkrule' | 'cbrule';
  key: string;
  on: boolean;
  def: boolean;
  label: string;
  sub: string;
};

function ruleDefs(v: View): RuleDef[] {
  switch (v.game) {
    case 'shithead': {
      const sr: ShRules = v.rules.sh ?? DEFAULT_RULES.sh;
      const t = (key: keyof ShRules, label: string, sub: string): RuleDef => ({
        attr: 'shrule',
        key,
        on: sr[key],
        def: DEFAULT_RULES.sh[key],
        label,
        sub,
      });
      return [
        t('two', '2 setzt zurück', 'Geht immer, danach ist wieder alles erlaubt'),
        t('ten', '10 verbrennt', 'Geht immer, der Stapel ist weg und du legst gleich nochmal'),
        t('seven', '7 heißt drunter', 'Der Nächste muss 7 oder niedriger legen'),
        t('three', '3 ist durchsichtig', 'Geht immer, es zählt die Karte darunter'),
        t('eight', '8 lässt aussetzen', 'Jede 8 überspringt einen Spieler'),
        t(
          'four',
          '4er reinwerfen',
          `Bei jedem neuen Stapel dürfen alle, auch wer dran ist. Gespielt wird nach bis zu ${Math.round(SH_WIN_MS / 1000)} Sekunden`,
        ),
        t('cut', 'Bombe einwerfen', 'Wer die fehlenden Karten zu vier gleichen hat, darf jederzeit reinwerfen'),
        t('deck5', 'Zwei Decks schon ab 5', 'Ab 6 Leuten wird immer mit zwei Decks gespielt'),
      ];
    }
    case 'durak': {
      const dr: DkRules = v.rules.dk ?? DEFAULT_RULES.dk;
      return [
        {
          attr: 'dkrule',
          key: 'transfer',
          on: dr.transfer,
          def: DEFAULT_RULES.dk.transfer,
          label: 'Weiterschieben',
          sub: 'Vor dem ersten Schlag legt der Verteidiger den gleichen Wert dazu, dann muss der Nächste ran',
        },
      ];
    }
    case 'cabo': {
      const cr: CbRules = v.rules.cb ?? DEFAULT_RULES.cb;
      return [
        {
          attr: 'cbrule',
          key: 'snap',
          on: cr.snap,
          def: DEFAULT_RULES.cb.snap,
          label: 'Schnappen',
          sub: 'Gleichen Wert wie oben auf der Ablage jederzeit draufwerfen, daneben kostet eine Strafkarte',
        },
      ];
    }
    case 'schnautz': {
      const r: Rules = v.rules;
      const t = (
        key: 'feuer' | 'dealerChoice' | 'knockFirst' | 'knockDouble',
        label: string,
        sub: string,
      ): RuleDef => ({
        attr: 'rule',
        key,
        on: r[key],
        def: DEFAULT_RULES[key],
        label,
        sub,
      });
      return [
        t('feuer', 'Drei Asse sind Feuer', 'Zählt 33, alle anderen verlieren einen Bierdeckel'),
        t('dealerChoice', 'Geber bekommt ein zweites Blatt', 'Behalten oder blind tauschen'),
        t('knockFirst', 'Klopfen sofort erlaubt', 'Sonst erst, wenn jeder einmal dran war'),
        t('knockDouble', 'Klopfer verliert doppelt', 'Wer klopft und am wenigsten hat, verliert zwei Bierdeckel'),
      ];
    }
    default:
      return unreachable(v.game);
  }
}

/** Kurzer Hinweis, was das Spiel sonst noch ausmacht. Steht nur da, wenn Platz ist. */
function ruleNote(v: View): string {
  switch (v.game) {
    case 'shithead':
      return 'Vier gleiche Karten hintereinander sind immer eine Bombe und verbrennen den Stapel. Wer sie vollmacht, legt gleich nochmal.';
    case 'durak':
      return `Bis ${DK_FULL_DECK - 1} Leute spielt ihr mit 36 Karten von der 6 bis zum Ass, ab ${DK_FULL_DECK} mit allen 52. Wer als Letzter Karten hat, ist der Durak und trägt den ${LOSER_MARK.durak}.`;
    case 'cabo':
      return `Ab ${CB_TWO_DECKS} Leuten wird mit zwei Decks gespielt. Wer am Ende die wenigsten Punkte hat, wird Cabo-König und behält die Krone, bis jemand anderes gewinnt.`;
    case 'schnautz':
      return '';
    default:
      return unreachable(v.game);
  }
}

function switchRow(d: RuleDef): string {
  return (
    `<label class="rrow"><span class="rl"><span class="rt">${d.label}</span><small>${d.sub}</small></span>` +
    `<input type="checkbox" class="switch" data-${d.attr}="${d.key}"${d.on ? ' checked' : ''}></label>`
  );
}

/** Zahlen und Auswahl, die es nur in einem Spiel gibt: Bierdeckel bei Schnautz, Zielpunkte bei Cabo. */
function extraRows(v: View, flip = false): string {
  switch (v.game) {
    case 'schnautz':
      return (
        '<div class="rrow"><span class="rl"><span class="rt">Bierdeckel pro Person</span><small>Das sind die Leben, danach schwimmt man</small></span>' +
        '<div class="stepper" role="group" aria-label="Bierdeckel pro Person">' +
        `<button class="stp" data-act="lives" data-d="-1" aria-label="weniger">${ICON_MINUS}</button>` +
        `<b class="st-num snum${flip ? ' st-flip' : ''}">${num(v.rules.lives)}</b>` +
        `<button class="stp" data-act="lives" data-d="1" aria-label="mehr">${ICON_PLUS}</button></div></div>`
      );
    case 'cabo': {
      const t = (v.rules.cb ?? DEFAULT_RULES.cb).target;
      const btn = (n: number) =>
        `<button class="st-num seg${t === n ? ' on' : ''}" data-act="cbtarget" data-v="${n}" aria-pressed="${t === n}">${num(n)}</button>`;
      return (
        '<div class="rrow"><span class="rl"><span class="rt">Zielpunkte</span><small>Wer drüber kommt, beendet die Partie</small></span>' +
        `<div class="segs" role="group" aria-label="Zielpunkte">${CB_TARGETS.map(btn).join('')}</div></div>`
      );
    }
    case 'shithead':
    case 'durak':
      return '';
    default:
      return unreachable(v.game);
  }
}

/** Die vier Spiele als Sticker. Der gewählte ist angehoben und festgeklebt, die anderen ruhen. */
function gamePicker(v: View, slap: boolean): string {
  const humans = v.players.filter((p) => !p.bot).length;
  return (
    '<div class="lgames" role="group" aria-label="Spiel wählen">' +
    GAMES.map((g) => {
      const on = v.game === g;
      const tooMany = humans > maxSeats(g);
      return (
        `<button class="st st-lift lgs g-${g} ${TILT[g]}${on ? ' on' : ''}${on && slap ? ' st-stick' : ''}" data-act="game" data-g="${g}" ` +
        `aria-pressed="${on}"${tooMany ? ` disabled title="${GAME_NAME[g]} geht mit höchstens ${maxSeats(g)} Leuten"` : ''}>` +
        `<span class="lg-in"><span class="lg-mark" aria-hidden="true">${MARK[g]}</span>` +
        `<span class="lg-name">${GAME_NAME[g]}</span>` +
        `<span class="lg-n st-num">${PEOPLE}${MIN_SEATS} bis ${MAX_SEATS[g]}</span></span>` +
        (on ? `<span class="lg-check" aria-hidden="true">${ICON_CHECK}</span>` : '') +
        '</button>'
      );
    }).join('') +
    '</div>'
  );
}

/** Gastgeber: Spiel wählen, Regeln schalten, Zeit pro Zug. */
function hostGamePane(v: View, slap: boolean, flipLives: boolean): string {
  const defs = ruleDefs(v);
  const note = ruleNote(v);
  const extra = extraRows(v, flipLives);
  return (
    '<h2 class="lh lh-game st-display">Was spielt ihr?</h2>' +
    gamePicker(v, slap) +
    `<div class="st rsheet"><h3 class="rs-h">Regeln für ${GAME_NAME[v.game]}</h3>` +
    `<div class="rlist" data-n="${defs.length + (extra ? 1 : 0)}">${extra}${defs.map(switchRow).join('')}</div>` +
    timeControl(v) +
    (note ? `<p class="rnote">${note}</p>` : '') +
    '</div>'
  );
}

/**
 * Was Gäste über die Regeln wissen müssen: nur, was vom Üblichen abweicht. Zahlen (Zeit, Bierdeckel, Zielpunkte)
 * zählen genauso dazu wie die Schalter. Leer heißt, es wird nach Standard gespielt.
 */
function guestDeviations(v: View): string[] {
  const out: string[] = [];
  const s = v.rules.turnSecs;
  if (v.game === 'schnautz' && v.rules.lives !== DEFAULT_RULES.lives)
    out.push(`<li class="rc on num">${num(v.rules.lives)} Bierdeckel pro Person</li>`);
  const target = (v.rules.cb ?? DEFAULT_RULES.cb).target;
  if (v.game === 'cabo' && target !== DEFAULT_RULES.cb.target)
    out.push(`<li class="rc on num">Bis ${num(target)} Punkte</li>`);
  if (s !== DEFAULT_RULES.turnSecs)
    out.push(`<li class="rc on num">${ICON_CLOCK}${s ? `${s} s pro Zug` : 'Ohne Zeitlimit'}</li>`);
  ruleDefs(v)
    .filter((d) => d.on !== d.def)
    .forEach((d) =>
      out.push(
        `<li class="rc${d.on ? ' on' : ' off'}">${d.on ? ICON_CHECK : ICON_OFF}${d.label}` +
          (d.on ? '<span class="sr"> an</span>' : '<span class="rc-off">aus</span>') +
          '</li>',
      ),
    );
  return out;
}

/** Gäste: nur der gewählte Spiel-Sticker und was an den Regeln anders ist als sonst. */
function guestGamePane(v: View, hostName: string, slap: boolean): string {
  const g = v.game;
  const devs = guestDeviations(v);
  const note = ruleNote(v);
  const rules = devs.length
    ? `<h3 class="rs-h">Anders als sonst</h3><ul class="rchips">${devs.join('')}</ul>`
    : '<p class="rsame">Alles nach Standard. Wer verliert, hat also keine Ausrede.</p>';
  return (
    '<div class="lchosen">' +
    `<button class="st st-lift lgs big g-${g} ${TILT[g]}${slap ? ' st-stick' : ''}" data-act="rulestab" data-g="${g}" aria-label="Regeln für ${GAME_NAME[g]} ansehen">` +
    `<span class="lg-in"><span class="lg-mark" aria-hidden="true">${MARK[g]}</span>` +
    `<span class="lg-name">${GAME_NAME[g]}</span><span class="lg-n st-num">${PEOPLE}${MIN_SEATS} bis ${MAX_SEATS[g]}</span></span></button>` +
    `<h2 class="lh lh-chosen st-display">${esc(hostName)} hat ${GAME_NAME[g]} gewählt</h2></div>` +
    `<div class="st rsheet${devs.length ? '' : ' same'}">${rules}` +
    // Was zum Spiel selbst gehört, steht getrennt, damit es nicht wie eine Hausregel aussieht
    (note
      ? `<div class="rgame"><h3 class="rs-h">Bei ${GAME_NAME[g]} gilt immer</h3><p class="rnote">${note}</p></div>`
      : '') +
    '</div>'
  );
}

/**
 * Startleiste: Der Knopf nennt Spiel und Besetzung, die Zeile darunter, was mit freien Plätzen passiert.
 * Auf kurzen Handys steht die Zeile im Knopf selbst (.lu2).
 */
function startBar(v: View, slap: boolean): string {
  const n = v.players.length;
  const bots = v.players.filter((p) => p.bot).length;
  const free = Math.max(0, seatLimit(v) - n);
  const name = GAME_NAME[v.game];
  const fill =
    '<label class="lfill"><span class="rl"><span class="rt">Freie Plätze mit KI füllen</span>' +
    '<small>Wer später kommt, übernimmt einen KI-Platz</small></span>' +
    `<input type="checkbox" class="switch" data-rule="fill"${v.rules.fill ? ' checked' : ''}></label>`;
  if (n < 2)
    return (
      `${fill}<div class="lgo"><button class="lstart notyet" disabled aria-describedby="lline">${name} starten` +
      '<span class="lu2" aria-hidden="true">Hol eine KI dazu oder schick den Link</span></button>' +
      '<p class="lline" id="lline">Allein geht es nicht. Hol eine KI dazu oder schick den Link.</p></div>'
    );
  const line = free
    ? `${free === 1 ? 'Ein Platz bleibt' : `${free} Plätze bleiben`} beim Start leer.`
    : bots
      ? `Alle Plätze sind besetzt, ${bots === 1 ? 'einer' : `${bots} davon`} mit KI.`
      : 'Alle Plätze sind besetzt. Keine Ausreden mehr.';
  return (
    `${fill}<div class="lgo"><button class="st-btn st-primary lstart${slap ? ' st-stick' : ''}" data-act="start" aria-describedby="lline">` +
    `<span>${name} starten<span class="lu"> · ${lineup(n)}${bots ? `, ${bots} KI` : ''}</span></span>` +
    `<span class="lu2" aria-hidden="true">${line}</span></button>` +
    `<p class="lline" id="lline">${line}</p></div>`
  );
}

export function renderLobby(v: View): void {
  const host = App.role === 'host';
  const limit = seatLimit(v);
  const lob = $('#scr-lobby');
  // Neuer Tisch: alles gilt als schon gesehen, festgeklebt wird erst, was danach dazukommt
  if (LOB.code !== App.code) {
    forgetLobby();
    LOB.code = App.code;
  }
  const first = LOB.seats === null;
  const keys = new Set(v.players.map(seatKey));
  const slapGame = !first && LOB.game !== v.game;
  const flipSeats = !first && LOB.n !== limit;

  GAMES.forEach((g) => lob.classList.toggle(`g-${g}`, g === v.game));
  // Lichtphasen: Je voller der Tisch, desto satter die Lobby
  document.body.style.setProperty('--lfill', (v.players.length / limit).toFixed(2));

  const hostName = pById(v, v.host)?.name ?? 'Gastgeber';
  $('#lobby-title').textContent = host ? 'Dein Tisch' : `Tisch von ${hostName}`;
  const code = $('#lobby-code');
  code.textContent = App.code;
  code.setAttribute('aria-label', `Tischcode ${App.code.split('').join(' ')}, Einladung öffnen`);
  $('#btn-share').hidden = !('share' in navigator);
  $('#seat-title').textContent = host ? 'Plätze' : 'Am Tisch';
  $('#seat-ctl').innerHTML = host
    ? seatControl(v, flipSeats)
    : `<span class="st-num snum">${num(v.players.length)} von ${num(limit)}</span>`;

  let seats = v.players.map((p, i) => seatHTML(v, p, i, !first && !LOB.seats?.has(seatKey(p)))).join('');
  for (let i = v.players.length; i < limit; i++) seats += emptySeat(host, v.rules.fill, i);
  const seatsEl = $('#seats');
  seatsEl.innerHTML = seats;
  seatsEl.dataset.n = String(limit);

  // Reiter am Handy, am PC stehen beide Bereiche nebeneinander
  $('#ltab-n').textContent = `${v.players.length}/${limit}`;
  document.querySelectorAll<HTMLElement>('#lobby-tabs [data-t]').forEach((b) => {
    const on = b.dataset.t === App.ltab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>('#scr-lobby .lpane').forEach((el) => {
    el.classList.toggle('on', el.dataset.pane === App.ltab);
  });

  const flipLives = !first && !!LOB.lives && LOB.lives !== v.rules.lives;
  $('#rules-form').innerHTML = host ? hostGamePane(v, slapGame, flipLives) : guestGamePane(v, hostName, slapGame);
  lob.classList.toggle('guest', !host);

  const ready = v.players.length >= 2;
  $('#lobby-start').innerHTML = host
    ? `<div class="lbar">${startBar(v, !first && ready && !LOB.ready)}</div>`
    : `<div class="lbar lbar-guest"><p class="lwait">${esc(hostName)} startet gleich ${GAME_NAME[v.game]} ${lineup(v.players.length)}` +
      '<span class="thinking"><i></i><i></i><i></i></span></p></div>';

  LOB.seats = keys;
  LOB.game = v.game;
  LOB.n = limit;
  LOB.ready = ready;
  LOB.lives = v.rules.lives;
  fitLobby();
}

/** Stufen fürs Zusammenrücken, f1 bis f6. Jede Stufe behält die vorigen. */
const FIT_MAX = 6;

/** Spalten der Plätze je Stufe: wenige Plätze untereinander, viele nebeneinander. */
function seatCols(level: number, n: number, wide: boolean): number {
  if (wide) return level >= 4 ? 3 : 2;
  if (level >= 4) return n <= 4 ? 2 : 3;
  if (level >= 2) return 2;
  return n <= 4 ? 1 : 2;
}

/** Läuft der Bereich über? Die Plätze haben eine feste Höhe und laufen in sich über, alles andere wächst mit. */
const overflows = (el: HTMLElement): boolean =>
  el.scrollHeight > el.clientHeight + 1 ||
  Array.from(el.querySelectorAll<HTMLElement>('.seats')).some((c) => c.scrollHeight > c.clientHeight + 1);

/**
 * Lobby auf die verfügbare Höhe bringen: pro sichtbarem Bereich die kleinste Stufe suchen, bei der nichts überläuft.
 * Läuft nach jedem Zeichnen und beim Ändern der Fenstergröße.
 */
export function fitLobby(): void {
  const lob = $opt('#scr-lobby');
  if (!lob || lob.hidden) return;
  const wide = !window.matchMedia?.('(max-width: 820px)').matches;
  const seats = $('#seats');
  const n = num(seats.dataset.n);
  lob.querySelectorAll<HTMLElement>('.lpane').forEach((pane) => {
    if (!pane.getClientRects().length) return;
    pane.classList.remove('fscroll');
    for (let lv = 0; lv <= FIT_MAX; lv++) {
      for (let k = 1; k <= FIT_MAX; k++) pane.classList.toggle(`f${k}`, k <= lv);
      if (pane.dataset.pane === 'table') {
        const cols = seatCols(lv, n, wide);
        seats.style.setProperty('--cols', String(cols));
        seats.style.setProperty('--tiltk', cols === 1 ? '0.4' : '1');
      }
      if (!overflows(pane)) return;
    }
    pane.classList.add('fscroll');
  });
}

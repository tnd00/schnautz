/*
 * Lobby: Plätze als Sticker, die vier Spiele als große Spielkarten und eine feste Startleiste.
 * Am Handy zwei Reiter, am PC zwei Spalten. Regeln und Zeit stehen im Bogen „Einstellungen“ (render/gamesettings.ts).
 * Nichts scrollt: fitLobby rückt die Inhalte stufenweise zusammen, bis sie in die verfügbare Höhe passen.
 */
import { MIN_SEATS } from '../../game/constants';
import { maxSeats, seatLimit } from '../../game/state';
import { startPlan } from '../../game/seats';
import type { GameKind, Player, View } from '../../game/types';
import { App } from '../app';
import { BOT_TAG } from '../cards';
import { $, $opt, esc, num } from '../dom';
import { pById, zuWord } from '../helpers';
import { AKA, MARK, TILT } from '../gamestickers';
import { shcHTML } from './shithead';
import { dkcHTML } from './marks';
import { GAME_NAME, GAMES } from '../../game/games';
import { openedVsBots } from '../../net/host';
import {
  deviations,
  deviationWords,
  ICON_CHECK,
  ICON_MINUS,
  ICON_PLUS,
  ruleNote,
  svg,
  syncGameSettings,
} from './gamesettings';

export { turnLabel, turnText } from './gamesettings';

const ICON_X = svg('<path d="M7 7l10 10M17 7 7 17"/>', 3);
const ICON_BOT = svg(
  '<rect x="4" y="8" width="16" height="12" rx="4"/><path d="M12 8V4.5M9 13.5h.01M15 13.5h.01M9.5 17h5"/>',
  2,
);
const ICON_GONE = svg(
  '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-2.2-1.6"/>',
  2,
);
const ICON_BOOK = svg(
  '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5V4.5M19 18v3H6.5"/>',
  2.2,
);
const ICON_SLIDERS = svg(
  '<path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"/><circle cx="15" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/>',
  2.2,
);
const ICON_NEXT = svg('<path d="M5 12h13M13 6l6 6-6 6"/>', 2.6);

/** Feste Neigung pro Platz, nie zufällig */
const SEAT_TILT = ['st-l2', 'st-r2', 'st-r1', 'st-l1', 'st-r3', 'st-l3', 'st-l1', 'st-r2', 'st-l2', 'st-r1'];
const tiltOf = (i: number): string => SEAT_TILT[i % SEAT_TILT.length];

/** „zu dritt“: wie viele am Tisch sitzen, so wie man es sagt */
const lineup = zuWord;

/** Was zuletzt gezeichnet wurde: Nur was neu ist, klebt mit Platsch fest oder blättert um. */
const LOB = { seats: null as Set<string> | null, game: '', n: 0, code: '', ready: false, live: '' };

/** Neuer Tisch: vergessen, was gezeichnet war. */
function forgetLobby(): void {
  LOB.seats = null;
  LOB.game = '';
  LOB.n = 0;
  LOB.ready = false;
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
    // Entfernen kann der Gastgeber KIs und alle, die gerade offline sind, nie sich selbst
    (host && !me && p.id !== v.host && (p.bot || !p.online)
      ? `<button class="lx" data-act="rmbot" data-id="${esc(p.id)}" aria-label="${esc(p.name)} entfernen">${ICON_X}</button>`
      : '') +
    '</li>'
  );
}

/**
 * Freier Platz als gestrichelter Stanzrand. Der Gastgeber holt mit einem Tipp eine KI dazu, auch mit Auffüllen
 * (wer will, holt eine bestimmte KI schon vorher). Mit Auffüllen steht darunter, dass beim Start eine KI kommt.
 */
function emptySeat(host: boolean, fill: boolean, i: number): string {
  const cls = `lseat empty ${tiltOf(i)}${fill ? ' fillk' : ''}`;
  if (host)
    return (
      `<li class="${cls}"><button class="addseat" data-act="addbot" aria-label="${fill ? 'KI jetzt dazuholen' : 'KI dazuholen'}">` +
      `<span class="addchip">${ICON_PLUS}KI</span>` +
      (fill ? '<span class="freek" aria-hidden="true">KI beim Start</span>' : '') +
      '</button></li>'
    );
  return `<li class="${cls}"><span class="freet">${fill ? 'KI beim Start' : 'frei'}</span></li>`;
}

/** Platzzahl als Zahl-Sticker mit Minus und Plus: nie weniger als die Menschen am Tisch, nie mehr als das Spiel erlaubt. */
function seatControl(v: View, flip: boolean): string {
  const n = seatLimit(v);
  const lo = Math.max(MIN_SEATS, v.players.filter((p) => !p.bot).length);
  const hi = maxSeats(v.game);
  return (
    '<div class="stepper" role="group" aria-label="Plätze am Tisch">' +
    `<button class="stp" data-act="seats" data-d="-1" aria-label="ein Platz weniger"${n <= lo ? ' disabled' : ''}>${ICON_MINUS}</button>` +
    `<b class="st-num snum${flip ? ' st-flip' : ''}">${num(n)}<span class="sr"> Plätze</span></b>` +
    `<button class="stp" data-act="seats" data-d="1" aria-label="ein Platz mehr"${n >= hi ? ' disabled' : ''}>${ICON_PLUS}</button></div>`
  );
}

/**
 * Ein Spiel als große Karte. Die Fläche wählt beim Gastgeber das Spiel, darunter stehen zwei kleine Knöpfe für
 * Regeln und Einstellungen. Gäste sehen die Fläche ohne Wahl, Einstellungen nur beim gewählten Spiel.
 */
function gameCard(v: View, g: GameKind, host: boolean, slap: boolean): string {
  const on = v.game === g;
  const name = GAME_NAME[g];
  const humans = v.players.filter((p) => !p.bot).length;
  const tooMany = humans > maxSeats(g);
  const inner =
    `<span class="lg-mark" aria-hidden="true">${MARK[g]}</span>` +
    `<span class="lg-name">${name}</span><span class="lg-aka">${AKA[g]}</span>`;
  const face = host
    ? `<button class="lgc-face" data-act="game" data-g="${g}" aria-pressed="${on}"` +
      `${tooMany ? ` disabled title="${name} geht mit höchstens ${maxSeats(g)} Leuten"` : ''}>${inner}</button>`
    : `<div class="lgc-face">${inner}</div>`;
  // Weicht etwas vom Standard ab, trägt der Knopf Einstellungen einen Punkt in der Farbe des Spiels
  const changed = deviations(v.rules, g).length > 0;
  const btn = (act: string, icon: string, label: string, cls = '', extra = '') =>
    `<button class="lgc-b${cls}" data-act="${act}" data-g="${g}" aria-label="${label} für ${name}${extra}">${icon}` +
    `<span class="lgc-l">${label}</span>${cls && changed ? '<span class="lgc-dot" aria-hidden="true"></span>' : ''}</button>`;
  return (
    `<article class="lgc st g-${g} ${TILT[g]}${on ? ' on' : ''}${on && slap ? ' st-stick' : ''}${tooMany ? ' off' : ''}" ` +
    `aria-label="${name}${on ? ', gewählt' : ''}">${face}` +
    (on ? `<span class="lg-check" aria-hidden="true">${ICON_CHECK}</span>` : '') +
    `<div class="lgc-acts${host || on ? '' : ' one'}">${btn('rulestab', ICON_BOOK, 'Regeln')}` +
    (host || on
      ? btn('gsettings', ICON_SLIDERS, 'Einstellungen', ' lgc-set', changed ? ', anders als Standard' : '')
      : '') +
    '</div></article>'
  );
}

function gameCards(v: View, host: boolean, slap: boolean): string {
  return `<div class="lgames">${GAMES.map((g) => gameCard(v, g, host, slap)).join('')}</div>`;
}

/**
 * Was anders ist als sonst, als Stichpunkte auf einem weißen Streifen, der mit jeder Abweichung wächst. Der
 * Gastgeber sieht nur ihn, Gäste sehen ihn erst, wenn für die Chips kein Platz mehr ist (lobby.css). Leer, wenn
 * nach Standard gespielt wird.
 */
function deviationLine(v: View): string {
  const words = deviationWords(v.rules, v.game);
  return words.length
    ? `<div class="ldevline"><span class="ldev-tag">anders</span><ul class="ldev-t">${words.map((w) => `<li>${w}</li>`).join('')}</ul></div>`
    : '';
}

const CHIPS_MAX = 5;

/** Gäste: Abweichungen als Chips auf einem kleinen Bogen, ohne Abweichung ein Satz, darunter was immer gilt. */
function deviationSheet(v: View): string {
  const g = v.game;
  const devs = deviations(v.rules, g);
  const note = ruleNote(g);
  // Höchstens fünf Chips, sonst wächst der Bogen über die Karten. Alles steht im Bogen Einstellungen
  const shown = devs.length > CHIPS_MAX ? devs.slice(0, CHIPS_MAX - 1) : devs;
  const more = devs.length - shown.length;
  const rules = devs.length
    ? `<h3 class="rs-h">Anders als sonst</h3><ul class="rchips">${shown.join('')}` +
      (more ? `<li class="rc rc-more num">und ${more} mehr</li>` : '') +
      '</ul>'
    : '<p class="rsame">Alles nach Standard. Wer verliert, hat also keine Ausrede.</p>';
  return (
    `<div class="st rsheet ldev${devs.length ? ' has-devs' : ' same'}">${rules}` +
    // Was zum Spiel selbst gehört, steht getrennt, damit es nicht wie eine Hausregel aussieht
    (note
      ? `<div class="rgame"><h3 class="rs-h">Bei ${GAME_NAME[g]} gilt immer</h3><p class="rnote">${note}</p></div>`
      : '') +
    '</div>'
  );
}

/** Spiel und Regeln: Überschrift, die vier Spielkarten, darunter was anders ist als sonst. */
function gamePane(v: View, host: boolean, hostName: string, slap: boolean): string {
  const head = host
    ? '<h2 class="lh lh-game st-display">Was spielt ihr?</h2>'
    : `<h2 class="lh lh-game lh-chosen st-display">${esc(hostName)} hat ${GAME_NAME[v.game]} gewählt</h2>`;
  return head + gameCards(v, host, slap) + (host ? '' : deviationSheet(v)) + deviationLine(v);
}

/**
 * Startleiste: Am Handy führt „Weiter zum Spiel“ vom Tisch zur Spielwahl, gestartet wird erst dort. Am PC stehen
 * beide Bereiche nebeneinander, dann gibt es nur den Startknopf. Beide Knöpfe stehen im DOM, welcher zu sehen ist,
 * regelt lobby.css über data-ltab, damit Drehen oder Vergrößern kein Neuzeichnen braucht.
 * Der Startknopf nennt Spiel und Besetzung, die Zeile darunter, was mit freien Plätzen passiert.
 * Auf kurzen Handys steht die Zeile im Knopf selbst (.lu2).
 */
function startBar(v: View, slap: boolean): string {
  // Dieselbe Zählung wie beim Start: Wer offline sitzt, spielt nicht mit, mit Auffüllen kommen KIs dazu
  const { n, bots, add, empty } = startPlan(v);
  const name = GAME_NAME[v.game];
  const fill =
    '<label class="lfill"><span class="rl"><span class="rt">Freie Plätze beim Start mit KI füllen</span>' +
    '<small>Wer während der Partie kommt, übernimmt einen KI-Platz samt Karten</small></span>' +
    `<input type="checkbox" class="switch" data-rule="fill"${v.rules.fill ? ' checked' : ''}></label>`;
  const alone = n < MIN_SEATS;
  const line = alone
    ? 'Allein geht es nicht. Hol eine KI dazu oder schick den Link.'
    : add
      ? add === 1
        ? 'Den freien Platz spielt die KI.'
        : `Die ${add} freien Plätze spielt die KI.`
      : empty
        ? `${empty === 1 ? 'Ein Platz bleibt' : `${empty} Plätze bleiben`} beim Start leer.`
        : bots
          ? `Alle Plätze sind besetzt, ${bots === 1 ? 'einer' : `${bots} davon`} mit KI.`
          : 'Alle Plätze sind besetzt. Keine Ausreden mehr.';
  // Im Knopf ist auf kurzen Handys wenig Platz, dort steht die kurze Fassung
  const short = alone ? 'Hol eine KI dazu oder schick den Link' : line;
  const next =
    '<button class="st-btn st-primary lstart lnext" data-act="lnext" aria-describedby="lline">' +
    `<span class="lnx">Weiter zum Spiel${ICON_NEXT}</span><span class="lu2" aria-hidden="true">${short}</span></button>`;
  const start = alone
    ? `<button class="lstart lgo-start notyet" disabled aria-describedby="lline">${name} starten` +
      '<span class="lu2" aria-hidden="true">Hol eine KI dazu oder schick den Link</span></button>'
    : `<button class="st-btn st-primary lstart lgo-start${slap ? ' st-stick' : ''}" data-act="start" aria-describedby="lline">` +
      `<span>${name} starten<span class="lu"> · ${lineup(n)}${bots + add ? `, ${bots + add} KI` : ''}</span></span>` +
      `<span class="lu2" aria-hidden="true">${line}</span></button>`;
  return `${fill}<div class="lgo">${next}${start}<p class="lline" id="lline">${line}</p></div>`;
}

/** Plätze und Besetzung vorlesen, aber nur wenn sich etwas ändert. Die Region steht fest in index.html. */
function announceSeats(v: View, host: boolean, limit: number): void {
  const text = host ? `${limit} Plätze` : `${v.players.length} von ${limit} am Tisch`;
  if (text === LOB.live) return;
  LOB.live = text;
  const el = $opt('#seat-live');
  if (el) el.textContent = text;
}

export function renderLobby(v: View): void {
  const host = App.role === 'host';
  const limit = seatLimit(v);
  const lob = $('#scr-lobby');
  // Neuer Tisch: alles gilt als schon gesehen, festgeklebt wird erst, was danach dazukommt
  if (LOB.code !== App.code) {
    forgetLobby();
    LOB.code = App.code;
    // Neuer Tisch: am Handy erst Plätze und Einladen, auch wenn am vorigen Tisch zuletzt die Spielwahl offen war
    App.ltab = 'table';
  }
  // Über „Gegen die KI spielen“ sitzen die KIs schon, es fehlt nur noch das Spiel: einmal gleich dorthin
  if (host && openedVsBots()) App.ltab = 'game';
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
  // Der Name enthält den sichtbaren Code am Stück (axe label-content-name-mismatch, WCAG 2.5.3)
  code.setAttribute('aria-label', `Tischcode ${App.code}, Einladung öffnen`);
  $('#btn-share').hidden = !('share' in navigator);
  $('#seat-title').textContent = host ? 'Plätze' : 'Am Tisch';
  $('#seat-ctl').innerHTML = host
    ? seatControl(v, flipSeats)
    : `<span class="st-num snum">${num(v.players.length)} von ${num(limit)}</span>`;
  announceSeats(v, host, limit);

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
  lob.dataset.ltab = App.ltab;

  $('#rules-form').innerHTML = gamePane(v, host, hostName, slapGame);
  lob.classList.toggle('guest', !host);

  const plan = startPlan(v);
  const ready = plan.n >= MIN_SEATS;
  const joins = plan.add === 1 ? ', eine KI kommt dazu' : plan.add ? `, ${plan.add} KI kommen dazu` : '';
  $('#lobby-start').innerHTML = host
    ? `<div class="lbar">${startBar(v, !first && ready && !LOB.ready)}</div>`
    : `<div class="lbar lbar-guest"><p class="lwait">${esc(hostName)} startet gleich ${GAME_NAME[v.game]} ${lineup(plan.n)}${joins}` +
      '<span class="thinking"><i></i><i></i><i></i></span></p></div>';

  LOB.seats = keys;
  LOB.game = v.game;
  LOB.n = limit;
  LOB.ready = ready;
  fitLobby();
  syncGameSettings(v);
}

/** Stufen fürs Zusammenrücken, f1 bis f8. Jede Stufe behält die vorigen. */
const FIT_MAX = 8;

/** Spalten der Plätze je Stufe: wenige Plätze untereinander, viele nebeneinander. */
function seatCols(level: number, n: number, wide: boolean): number {
  if (wide) return level >= 4 ? 3 : 2;
  if (level >= 4) return n <= 4 ? 2 : 3;
  if (level >= 2) return 2;
  return n <= 4 ? 1 : 2;
}

/**
 * Läuft der Bereich über? Plätze, das Kartenraster und die Spielkarten haben eine feste Höhe und laufen in sich über, alles andere
 * wächst mit.
 */
const overflows = (el: HTMLElement): boolean =>
  el.scrollHeight > el.clientHeight + 1 ||
  Array.from(el.querySelectorAll<HTMLElement>('.seats, .lgames, .lgc')).some(
    (c) => c.scrollHeight > c.clientHeight + 1,
  );

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

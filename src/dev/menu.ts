/*
 * Verstecktes Dev-Menü: Abkürzungen, Würfe, Effekte, Klänge, Protokoll, Verlauf, Infos und Werkzeuge zum Testen.
 * Freischalten unter „Updates“ mit fünf schnellen Tipps auf die Versionszeile, danach steht es im Menü ⋯.
 * Abkürzungen ändern den Spielstand und gehen nur beim Host. Effekte und Klänge schickt der Host an alle
 * (Logeintrag `dev`), Gäste sehen und hören sie nur selbst. Die Datei wird erst beim Öffnen nachgeladen.
 */
import { BOT_LINES } from '../bots/lines';
import { botDecide } from '../bots/index';
import { EMOTES, SOUNDS, TOSS_ICON, TOSS_ITEMS } from '../game/constants';
import { APP_VERSION } from '../content/version';
import { act } from '../game/actions';
import { rematchOpen } from '../game/rematch';
import { addLog } from '../game/state';
import type { Action, DevFx, State, TossItem } from '../game/types';
import { fitView, VIEW_MAX_BYTES, viewFor } from '../game/view';
import { BOTS, botTick } from '../net/bots';
import { CLOCK, expireClock } from '../net/clock';
import { doAct } from '../net/dispatch';
import { G } from '../net/guest';
import { H, hostCommit, hostConns } from '../net/host';
import { App } from '../ui/app';
import { ZER } from '../ui/ceremony';
import { DEVLOG, dlog, type DevLogKind } from '../ui/devlog';
import { playDevFx } from '../ui/devfx';
import { $, $opt, esc, reduceMotion } from '../ui/dom';
import { ANN, toast } from '../ui/feedback';
import { nameOf } from '../ui/helpers';
import { resetTableUI } from '../ui/reset';
import { sampleStatus } from '../ui/samples';
import { SEQ } from '../ui/shithead/sequence';
import { audio, sfx, SOUND_NAMES, type SoundName, unlockAudio } from '../ui/sound';
import { LS } from '../ui/storage';
import { playToss } from '../ui/toss';
import { BUILD, reloadApp } from '../ui/update';
import { spool, spoolCheck, type Spooled, type SpoolGoal, type SpoolWant } from './spool';

interface Jump {
  id: string;
  label: string;
  goal: SpoolGoal;
  want: SpoolWant;
}

const JUMPS: Record<State['game'], Jump[]> = {
  shithead: [
    { id: 'sh-lose', label: 'Ende, ich werde Shithead', goal: 'end', want: 'lose' },
    { id: 'sh-win', label: 'Ende, ich gewinne', goal: 'end', want: 'win' },
    { id: 'sh-any', label: 'Ende, egal wer', goal: 'end', want: 'any' },
    { id: 'sh-done', label: 'Ich bin fertig und darf tippen', goal: 'done', want: 'any' },
  ],
  durak: [
    { id: 'dk-lose', label: 'Ende, ich werde Durak', goal: 'end', want: 'lose' },
    { id: 'dk-win', label: 'Ende, ich gewinne', goal: 'end', want: 'win' },
    { id: 'dk-any', label: 'Ende, egal wer', goal: 'end', want: 'any' },
    { id: 'dk-done', label: 'Ich bin fertig und darf tippen', goal: 'done', want: 'any' },
  ],
  schnautz: [
    { id: 'sz-round', label: 'Runde beenden', goal: 'round', want: 'any' },
    { id: 'sz-win', label: 'Partie beenden, ich gewinne', goal: 'end', want: 'win' },
    { id: 'sz-lose', label: 'Partie beenden, ich verliere', goal: 'end', want: 'lose' },
  ],
};

const EFFECTS: [DevFx, string][] = [
  ['ceremony', 'Zeremonie nochmal'],
  ['confetti', 'Konfetti'],
  ['poo', 'Kackhaufen auf mich'],
  ['ann', 'Ansage'],
  ['toast', 'Kurzer Hinweis'],
  ['updbar', 'Hinweis neue Version'],
];

const KIND: Record<DevLogKind, string> = {
  err: 'Fehler',
  warn: 'Warnung',
  net: 'Netz',
  game: 'Spiel',
  audio: 'Ton',
  dev: 'Dev',
};

/** So lange steht der vorgespulte Tisch, bevor der letzte Zug kommt */
const LAST_MOVE_MS = 1300;
/** So lange sucht der Zeitraffer höchstens, in Häppchen, damit die Seite nicht hängt */
const SEARCH_MS = 9000;
const TICK_MS = 700;
const RAW_ENTRIES = 60;

type Row = [string, string];

const DEV = {
  ticker: null as ReturnType<typeof setInterval> | null,
  searching: false,
  /** Host: Effekte und Klänge bei allen am Tisch */
  toAll: true,
  /** Aufgeklappte Bereiche, bleiben beim nächsten Öffnen so */
  open: new Set(['jump', 'react', 'fx']),
};

const btn = (dev: string, label: string, data = ''): string =>
  `<button class="btn ghost dbtn" data-act="dev" data-dev="${dev}"${data}>${esc(label)}</button>`;

const grid = (items: string[], cls = ''): string => `<div class="dgrid${cls ? ` ${cls}` : ''}">${items.join('')}</div>`;

const note = (text: string): string => `<p class="dnote">${esc(text)}</p>`;

const rowsHTML = (rows: Row[]): string =>
  rows.map(([k, v]) => `<div class="drow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

function section(id: string, title: string, body: string): string {
  return `<details class="dsec" data-sec="${id}"${DEV.open.has(id) ? ' open' : ''}><summary>${esc(title)}</summary>${body}</details>`;
}

function ago(t: number): string {
  if (!t) return 'noch nie';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 1 ? 'gerade eben' : `vor ${s} s`;
}

const hms = (t: number): string => new Date(t).toLocaleTimeString('de-DE', { hour12: false });

const host = (): State | null => (App.role === 'host' ? H.st : null);

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Jemand anderes am Tisch, am liebsten eine KI. */
function someoneElse(t: { players: { id: string; bot?: boolean }[] }): string | null {
  const others = t.players.filter((p) => p.id !== App.me);
  return (others.find((p) => p.bot) ?? others[0])?.id ?? null;
}

/** Eine zufällige KI am Tisch. */
function randomBot(): string | null {
  const bots = host()?.players.filter((p) => p.bot && p.id !== App.me) ?? [];
  return bots.length ? pick(bots).id : null;
}

/** KI, die gerade eine Revanche fordern dürfte. */
function rematchBot(st: State): string | null {
  const can = st.rematch?.can ?? [];
  return can.find((id) => st.players.some((p) => p.id === id && p.bot) && rematchOpen(st, id)) ?? null;
}

// ---------- Bereiche ----------

function jumpsHTML(): string {
  const st = host();
  const v = App.view;
  const mine = v && v.phase !== 'lobby' ? [btn('botme', 'KI zieht einmal für mich')] : [];
  if (!st) {
    return (
      (mine.length ? grid(mine) : '') +
      note('Alle anderen Abkürzungen gibt es nur beim Gastgeber, denn nur dort liegt der Spielstand.')
    );
  }
  const list = JUMPS[st.game].map((j) => btn(j.id, j.label));
  if (st.game === 'shithead' && st.phase === 'swap') list.push(btn('force', 'Tauschrunde beenden'));
  if (st.game === 'schnautz' && st.phase === 'end') list.push(btn('force', 'Nächste Runde sofort'));
  list.push(...mine);
  if (CLOCK.key) list.push(btn('timeup', 'Zeit sofort ablaufen lassen'));
  if (rematchBot(st)) list.push(btn('rematch-bot', 'KI fordert Revanche'));
  if (st.phase !== 'lobby') list.push(btn('restart', 'Partie neu starten'));
  const show = st.game === 'shithead' ? 'ganz normal, mit Zeitlupe und Zeremonie' : 'ganz normal';
  return (
    grid(list) +
    note(
      `Die KI spielt im Zeitraffer für alle Plätze, auch für Gäste. Den letzten Zug sehen alle ${show}. ` +
        'Vorgespulte Partien zählen in der Bilanz mit.',
    )
  );
}

function reactHTML(): string {
  const tosses = TOSS_ITEMS.map((t) => btn('toss', `${TOSS_ICON[t]} auf mich`, ` data-s="${t}"`));
  if (!host())
    return grid(tosses, 'snd') + note('Als Gast fliegen die Würfe nur bei dir. KI-Reaktionen gibt es beim Gastgeber.');
  return (
    grid(tosses, 'snd') +
    grid([btn('botemote', 'KI-Reaktion'), btn('botsound', 'KI-Klang'), btn('botchat', 'KI-Spruch')]) +
    note('Kommt von einer KI am Tisch und läuft bei allen wie echt, ohne Sperre gegen Dauerfeuer.')
  );
}

function toAllHTML(): string {
  if (!host())
    return note('Als Gast laufen Effekte und Klänge nur bei dir, weil nur der Gastgeber allen etwas schicken kann.');
  return `<label class="dall"><input type="checkbox" data-devall${DEV.toAll ? ' checked' : ''}> Bei allen am Tisch abspielen</label>`;
}

function fxHTML(): string {
  return toAllHTML() + grid(EFFECTS.map(([f, label]) => btn('fx', label, ` data-s="${f}"`)));
}

function soundsHTML(): string {
  return (
    toAllHTML() +
    grid(
      SOUND_NAMES.map((s) => btn('sfx', s, ` data-s="${s}"`)),
      'snd',
    ) +
    grid([btn('unlock', 'Ton freischalten')]) +
    '<div class="drows" id="dev-audio"></div>'
  );
}

function protoHTML(): string {
  if (!DEVLOG.length) return note('Noch nichts mitgeschrieben.');
  const items = DEVLOG.slice()
    .reverse()
    .map((l) => `<li class="${l.k}"><time>${hms(l.t)}</time><i>${KIND[l.k]}</i><span>${esc(l.msg)}</span></li>`);
  return `<ol class="dlog">${items.join('')}</ol>`;
}

function rawHTML(): string {
  const v = App.view;
  if (!v) return note('Kein Tisch offen.');
  const items = v.log
    .slice(-RAW_ENTRIES)
    .reverse()
    .map((e) => {
      const { n, k, p, name, ...rest } = e as unknown as Record<string, unknown>;
      const who = typeof name === 'string' ? name : typeof p === 'string' ? nameOf(v, p) : '';
      const more = Object.keys(rest).length ? JSON.stringify(rest) : '';
      return `<li><time>${esc(String(n))}</time><i>${esc(String(k))}</i><span>${esc(`${who} ${more}`.trim())}</span></li>`;
    });
  return `<ol class="dlog raw">${items.join('')}</ol>`;
}

function infoRows(): Row[] {
  const v = App.view;
  const rows: Row[] = [
    ['Version', `${APP_VERSION} · ${BUILD || 'Entwicklung'}`],
    ['Rolle', App.role === 'host' ? 'Gastgeber' : App.role === 'guest' ? 'Gast' : 'nicht am Tisch'],
  ];
  if (App.code) rows.push(['Tisch', `${App.code} · ${App.net}`]);
  if (App.me) rows.push(['Meine ID', App.me]);
  if (App.role === 'host') {
    const conns = hostConns();
    rows.push(['Signalserver', H.peer ? (H.peer.disconnected ? 'getrennt' : 'verbunden') : 'aus']);
    rows.push(['Verbindungen', String(conns.length)]);
    conns.forEach((c) => {
      const name = v ? nameOf(v, c.pid) : c.pid;
      rows.push([name, `${c.open ? 'offen' : 'zu'} · ${ago(c.seen)} · ${c.v ?? 'Version unbekannt'}`]);
    });
    rows.push(['KI', `${BOTS.hold ? 'angehalten' : 'läuft'} · Zug ${BOTS.timer ? 'geplant' : 'nicht geplant'}`]);
  } else if (App.role === 'guest') {
    rows.push(['Verbindung', G.conn?.open ? 'offen' : 'zu']);
    rows.push(['Antwortzeit', G.rtt ? `${G.rtt} ms` : 'noch keine']);
    rows.push(['Letztes Lebenszeichen', ago(G.lastPong)]);
    rows.push(['Fehlversuche', `${G.fails}${G.downSince ? ` · weg seit ${ago(G.downSince)}` : ''}`]);
  }
  if (v) {
    const bots = v.players.filter((p) => p.bot).length;
    const online = v.players.filter((p) => !p.bot && p.online).length;
    const lastN = v.log.reduce((m, e) => Math.max(m, e.n), 0);
    const turn = v.phase === 'play' || v.phase === 'choose' ? v.players[v.turn] : undefined;
    rows.push(['Spiel', `${v.game} · ${v.phase} · Runde ${v.round} · Partie ${v.games}`]);
    rows.push(['Am Zug', turn ? nameOf(v, turn.id) : 'niemand']);
    rows.push(['Plätze', `${v.players.length}, davon ${bots} KI, ${online} Menschen online`]);
    rows.push(['Regeln', JSON.stringify(v.rules)]);
    if (v.rematch) rows.push(['Revanche', JSON.stringify(v.rematch)]);
    if (v.rematchDuel) rows.push(['Duell', JSON.stringify(v.rematchDuel)]);
    if (v.sh?.bets && Object.keys(v.sh.bets).length) rows.push(['Tipps', JSON.stringify(v.sh.bets)]);
    if (v.next != null) rows.push(['Nächste Runde', `in ${Math.ceil(v.next / 1000)} s`]);
    rows.push(['Verlauf', `${v.log.length} Einträge bis Nr. ${lastN}`]);
    rows.push(['Eigene Ansicht', `${JSON.stringify(v).length} Bytes`]);
    const st = host();
    if (st) {
      const max = H.conns.size
        ? Math.max(...[...H.conns.keys()].map((pid) => JSON.stringify(fitView(viewFor(st, pid))).length))
        : 0;
      rows.push(['Größte Gast-Ansicht', max ? `${max} von ${VIEW_MAX_BYTES} Bytes` : 'keine Gäste']);
      rows.push([
        'Zeitlimit',
        CLOCK.key ? `noch ${Math.max(0, Math.ceil((CLOCK.until - Date.now()) / 1000))} s` : 'keine Uhr',
      ]);
    } else rows.push(['Zeitlimit', v.clock ? 'läuft' : 'keine Uhr']);
  }
  const hold = Math.max(0, App.holdUntil - Date.now());
  rows.push([
    'Abläufe',
    `Sequenz ${SEQ.busy ? 'läuft' : 'frei'} · Meldungen ${ANN.busy ? `laufen, ${ANN.q.length} warten` : 'frei'}`,
  ]);
  rows.push([
    'Zeremonie',
    `${ZER.on ? 'Enthüllung' : ZER.slow ? 'Zeitlupe' : 'aus'} · Sperre ${hold ? `${hold} ms` : 'frei'} · ${App.flying} im Flug`,
  ]);
  const table = $opt('.table');
  const u = table ? getComputedStyle(table).getPropertyValue('--u').trim() : '';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  rows.push(['Bildschirm', `${innerWidth} × ${innerHeight} px · Faktor ${devicePixelRatio}`]);
  rows.push([
    'Darstellung',
    `${coarse ? 'Touch' : 'Maus'} · Bewegung ${reduceMotion() ? 'reduziert' : 'normal'}${u ? ` · --u ${u}` : ''}`,
  ]);
  rows.push(['Browser', navigator.userAgent]);
  rows.push(['Speicher', storageLine()]);
  return rows;
}

function audioRows(): Row[] {
  const ac = audio();
  const s = sampleStatus();
  const session = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
  return [
    ['Audio', ac ? ac.state : 'noch nicht gestartet'],
    ['Audio-Sitzung', session ? session.type || 'leer' : 'gibt es hier nicht'],
    ['Aufnahmen', s.started ? `${s.loaded} von ${s.total} geladen` : 'laden beim ersten Tipp'],
    ['Ton', `${App.muted ? 'aus' : 'an'} · Soundboard ${App.sbOff ? 'stumm' : 'an'}`],
  ];
}

function storageLine(): string {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    return `${localStorage.length} Einträge, ${(bytes / 1024).toFixed(1)} KB`;
  } catch {
    return 'nicht lesbar';
  }
}

function toolsHTML(): string {
  const list = [btn('reload', 'Neu laden, zurück an den Tisch')];
  if (App.role === 'guest') list.push(btn('drop', 'Verbindung kurz trennen'));
  list.push(btn('hide', 'Dev-Menü ausblenden'));
  return grid(list);
}

function devHTML(): string {
  return (
    '<div class="modal"><div class="paper sheet devm" role="dialog" aria-labelledby="dev-h">' +
    '<button class="x" data-act="closemodal" aria-label="Schließen">×</button>' +
    '<h2 id="dev-h">Dev-Menü</h2><p class="lead">Testen, ohne jedes Mal eine ganze Partie zu spielen.</p>' +
    section('jump', 'Abkürzungen', jumpsHTML()) +
    section('react', 'Würfe und Reaktionen', reactHTML()) +
    section('fx', 'Effekte', fxHTML()) +
    section('snd', 'Klänge', soundsHTML()) +
    section(
      'log',
      'Protokoll',
      `<div id="dev-log"></div>${grid([btn('copylog', 'Protokoll kopieren'), btn('clearlog', 'Protokoll leeren')])}`,
    ) +
    section('raw', 'Verlauf roh', `<div id="dev-raw"></div>${grid([btn('copyraw', 'Verlauf kopieren')])}`) +
    section('info', 'Infos', `<div class="drows" id="dev-info"></div>${grid([btn('copyinfo', 'Infos kopieren')])}`) +
    section('tools', 'Werkzeuge', toolsHTML()) +
    '</div></div>'
  );
}

// ---------- Aktualisieren ----------

/** Nur offene Bereiche neu und nur bei Änderungen, damit Knöpfe und Scrollstand bleiben. */
function refresh(): void {
  const set = (sec: string, sel: string, html: () => string) => {
    if (!DEV.open.has(sec)) return;
    const el = $opt(sel);
    if (!el) return;
    const h = html();
    if (el.innerHTML !== h) el.innerHTML = h;
  };
  set('snd', '#dev-audio', () => rowsHTML(audioRows()));
  set('log', '#dev-log', protoHTML);
  set('raw', '#dev-raw', rawHTML);
  set('info', '#dev-info', () => rowsHTML(infoRows()));
}

function stopTicker(): void {
  if (DEV.ticker) clearInterval(DEV.ticker);
  DEV.ticker = null;
}

export function openDev(): void {
  $('#menu').hidden = true;
  $('#modal').innerHTML = devHTML();
  const sheet = $('#modal .devm');
  sheet.querySelectorAll<HTMLDetailsElement>('details.dsec').forEach((d) =>
    d.addEventListener('toggle', () => {
      const id = d.dataset.sec ?? '';
      if (d.open) DEV.open.add(id);
      else DEV.open.delete(id);
      refresh();
    }),
  );
  sheet.querySelectorAll<HTMLInputElement>('[data-devall]').forEach((c) =>
    c.addEventListener('change', () => {
      DEV.toAll = c.checked;
      sheet.querySelectorAll<HTMLInputElement>('[data-devall]').forEach((o) => (o.checked = c.checked));
    }),
  );
  refresh();
  stopTicker();
  DEV.ticker = setInterval(() => {
    if ($opt('#modal .devm')) refresh();
    else stopTicker();
  }, TICK_MS);
}

function closeDev(): void {
  stopTicker();
  if ($opt('#modal .devm')) $('#modal').innerHTML = '';
}

// ---------- Abkürzungen ----------

/** Vorgespulten Stand übernehmen wie beim Fortsetzen, ohne etwas nachzuspielen. Dann kommt der letzte Zug echt. */
function land(r: Spooled): void {
  BOTS.hold = true;
  resetTableUI();
  App.view = null;
  App.seenN = 0;
  H.st = r.st;
  H.commitN = r.st.n;
  hostCommit();
  dlog(
    'dev',
    `Zeitraffer gelandet, Partie ${r.st.games}, ${r.last ? `letzter Zug ${r.last.a.type}` : 'ohne letzten Zug'}`,
  );
  const st = r.st;
  const last = r.last;
  if (!last) {
    BOTS.hold = false;
    botTick();
    return;
  }
  setTimeout(() => {
    BOTS.hold = false;
    if (H.st !== st || App.role !== 'host') return;
    const e = act(st, last.pid, last.a);
    if (e) {
      dlog('dev', `Letzter Zug abgelehnt, ${e}`);
      toast('Der letzte Zug ging nicht mehr, es geht normal weiter.');
    }
    hostCommit();
  }, LAST_MOVE_MS);
}

async function jump(j: Jump): Promise<void> {
  const st0 = host();
  if (!st0) {
    toast('Abkürzungen gehen nur beim Gastgeber.');
    return;
  }
  const why = spoolCheck(st0, j.goal, App.me);
  if (why) {
    toast(why);
    return;
  }
  if (DEV.searching) {
    toast('Ich suche noch, einen Moment.');
    return;
  }
  DEV.searching = true;
  toast('Spule vor…', 1500);
  const seed = Math.floor(Math.random() * 2 ** 30);
  const t0 = Date.now();
  try {
    for (let i = 0; Date.now() - t0 < SEARCH_MS; i++) {
      // Kurz Luft holen, damit Hinweis und Seite nicht einfrieren
      await new Promise((ok) => setTimeout(ok, i ? 0 : 60));
      const st = host();
      if (!st) return;
      const r = spool(st, App.me, j.goal, j.want, seed + i * 1_000_003, 250);
      if (r) {
        land(r);
        return;
      }
    }
    dlog('dev', `Zeitraffer ${j.id}: nichts gefunden`);
    toast('Keine passende Partie gefunden. Einfach nochmal tippen.');
  } finally {
    DEV.searching = false;
  }
}

/** Ein Zug oder eine Reaktion beim Host, wie sie auch von selbst käme. */
function hostDo(pid: string, a: Action): void {
  const st = host();
  if (!st) return;
  const e = act(st, pid, a);
  if (e) {
    dlog('dev', `${a.type} abgelehnt, ${e}`);
    toast(e);
  } else hostCommit();
}

function botMoveForMe(): void {
  const v = App.view;
  const a = v ? botDecide(v, undefined, 'normal') : null;
  if (!a) {
    toast('Gerade gibt es für dich nichts zu tun.');
    return;
  }
  dlog('dev', `KI zieht für mich: ${a.type}`);
  doAct(a);
}

// ---------- Effekte, Klänge, Würfe ----------

/** Effekt oder Klang: beim Host als Logeintrag an alle, sonst nur hier. */
function fx(e: { fx: DevFx; s?: string; to?: string }): void {
  const st = host();
  if (st && DEV.toAll) {
    addLog(st, { k: 'dev', fx: e.fx, ...(e.s ? { s: e.s } : {}), ...(e.to ? { to: e.to } : {}) });
    hostCommit();
  } else playDevFx(e);
  dlog('dev', `${e.fx}${e.s ? ` ${e.s}` : ''}${st && DEV.toAll ? ', bei allen' : ', nur hier'}`);
}

function tossAtMe(item: TossItem): void {
  const st = host();
  const v = App.view;
  const from = st ? someoneElse(st) : v ? someoneElse(v) : null;
  if (!from || !v) {
    toast('Dafür braucht es jemanden, der wirft.');
    return;
  }
  if (st) hostDo(from, { type: 'toss', item, to: App.me, bot: st.players.some((p) => p.id === from && p.bot) });
  else playToss({ k: 'toss', n: 0, p: from, item, to: App.me });
}

function copy(text: string, what: string): void {
  if (!navigator.clipboard) {
    toast('Kopieren ging nicht.');
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => toast(`${what} kopiert.`),
    () => toast('Kopieren ging nicht.'),
  );
}

/** Diese Knöpfe lassen das Fenster offen, alles andere schließt es, damit man den Effekt sieht. */
const STAY = new Set(['sfx', 'unlock', 'copylog', 'clearlog', 'copyraw', 'copyinfo']);

function stayAct(id: string, s: string): void {
  switch (id) {
    case 'sfx':
      unlockAudio();
      if (host() && DEV.toAll) fx({ fx: 'sfx', s });
      else sfx(s as SoundName);
      return;
    case 'unlock':
      unlockAudio();
      toast(`Audio: ${audio()?.state ?? 'noch nicht gestartet'}`);
      return;
    case 'copylog':
      copy(DEVLOG.map((l) => `${hms(l.t)} ${KIND[l.k]} ${l.msg}`).join('\n'), 'Protokoll');
      return;
    case 'clearlog':
      DEVLOG.length = 0;
      return;
    case 'copyraw':
      copy(JSON.stringify(App.view?.log ?? [], null, 1), 'Verlauf');
      return;
    case 'copyinfo':
      copy([...infoRows(), ...audioRows()].map(([k, v]) => `${k}: ${v}`).join('\n'), 'Infos');
      return;
  }
}

/** Knöpfe im Dev-Menü. */
export function devAct(id: string, t: HTMLElement): void {
  const s = t.dataset.s ?? '';
  if (STAY.has(id)) {
    stayAct(id, s);
    setTimeout(refresh, 300);
    return;
  }
  closeDev();
  const st = host();
  const j = st ? JUMPS[st.game].find((x) => x.id === id) : undefined;
  if (j) {
    void jump(j);
    return;
  }
  const bot = randomBot();
  switch (id) {
    case 'botme':
      botMoveForMe();
      break;
    case 'force':
      if (st) hostDo(App.me, { type: 'force' });
      break;
    case 'restart':
      if (st) hostDo(App.me, { type: 'restart' });
      break;
    case 'timeup':
      if (!expireClock()) toast('Gerade läuft keine Uhr.');
      break;
    case 'rematch-bot': {
      const rb = st ? rematchBot(st) : null;
      if (!rb) toast('Gerade darf keine KI fordern.');
      else hostDo(rb, { type: 'rematch', bot: true });
      break;
    }
    case 'toss':
      if ((TOSS_ITEMS as readonly string[]).includes(s)) tossAtMe(s as TossItem);
      break;
    case 'botemote':
      if (bot) hostDo(bot, { type: 'emote', e: pick(EMOTES), bot: true });
      else toast('Keine KI am Tisch.');
      break;
    case 'botsound':
      if (bot) hostDo(bot, { type: 'sound', s: pick(SOUNDS), bot: true });
      else toast('Keine KI am Tisch.');
      break;
    case 'botchat':
      if (bot) hostDo(bot, { type: 'chat', text: pick(Object.values(BOT_LINES).flat()), bot: true });
      else toast('Keine KI am Tisch.');
      break;
    case 'fx':
      fx({ fx: s as DevFx, ...(s === 'poo' ? { to: App.me } : {}) });
      break;
    case 'reload':
      reloadApp();
      break;
    case 'drop':
      dlog('dev', 'Verbindung absichtlich getrennt');
      G.conn?.close();
      break;
    case 'hide':
      LS.del('dev');
      toast('Dev-Menü ausgeblendet. Unter Updates lässt es sich wieder freischalten.', 4000);
      break;
  }
}

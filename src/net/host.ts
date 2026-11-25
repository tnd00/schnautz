/*
 * Gastgeber: hält den vollständigen Spielzustand, rechnet alle Züge und schickt jedem Gast
 * seine gefilterte Ansicht. Der Zustand wird lokal gespeichert, damit man nach dem Neuladen
 * weitermachen kann.
 */
import { type DataConnection, Peer } from 'peerjs';
import { hostAutoNext, nextFor, stopAutoNext } from './autonext';
import { botChatter, botTick } from './bots';
import { clockFor, hostClock, resetClock } from './clock';
import { act, soundOk } from '../game/actions';
import { EMOTE_HOST_WINDOW_MS, REMATCH_ANN_MS, SH_WIN_MS, TOSS_HOST_WINDOW_MS } from '../game/constants';
import { checkReady, quitPlayer } from '../game/flow';
import { isOwnLeftSeat, reclaimSeat, seatGuest, syncSeats, takeSeat } from '../game/seats';
import { cosmeticOnly, migrate, newState, pIdx, removePlayer } from '../game/state';
import type { Action, GameKind, LogEntry, State, View } from '../game/types';
import { fitView, viewFor } from '../game/view';
import { App } from '../ui/app';
import { applyView } from '../ui/apply';
import { annLeft } from '../ui/feedback';
import { num, type Timer } from '../ui/dom';
import { resetTableUI } from '../ui/reset';
import { seqMsOf } from '../ui/shithead/sequence';
import { setNet, setWait, showScreen } from '../ui/screens';
import { renderResume, showStartError } from '../ui/start';
import { LS } from '../ui/storage';
import { noteGuestVersion, showBackHint } from '../ui/update';
import { APP_VERSION } from '../content/version';
import { cleanName, genCode, genId, PREFIX, peerOptions } from './ids';
import { asMessage, asSavedHost, type GuestMessage, type HostMessage, type SavedHost } from './protocol';
import { allowBurst, newRateBook, rateSound } from './rate';
import { keepSignal, safeClose, safeDestroy } from './signal';
import { dlog } from '../ui/devlog';
import { canShow, GAME_NAME } from '../game/games';
import {
  browserBus,
  browserLocks,
  claimVerdict,
  dedupe,
  holdsHostLock,
  newClaim,
  onHostLockLost,
  releaseHostLock,
  TAB,
  type Claim,
} from './tablock';

const GUEST_ID = /^p-[0-9a-f]{12}$/;
const HEARTBEAT_MS = 5000;
const GUEST_TIMEOUT_MS = 16000;
const LOBBY_DROP_MS = 75000;
const RESUME_WINDOW_MS = 8000;

/** Was der Gastgeber pro Verbindung wissen muss. */
interface ConnInfo {
  pid?: string;
  seen: number;
  chat: number;
  /** Absichtlich geschlossen (ersetzt oder verabschiedet), kein Verbindungsabbruch. */
  replaced: boolean;
  /** Version des Gastes aus hello */
  v?: string;
}

export const H = {
  st: null as State | null,
  peer: null as Peer | null,
  conns: new Map<string, DataConnection>(),
  info: new WeakMap<DataConnection, ConnInfo>(),
  /** Neue Spieler-ID eines Gastes, der einen verwaisten Platz übernommen hat. */
  alias: Object.create(null) as Record<string, string>,
  /** Geheimer Schlüssel pro Platz, damit niemand einen fremden Platz kapert. */
  keys: Object.create(null) as Record<string, string>,
  retries: 0,
  hb: null as ReturnType<typeof setInterval> | null,
  winT: null as Timer | null,
  winId: null as number | null,
  /** Stand des Verlaufs beim letzten Versand. */
  commitN: 0,
  /** Zeitsperren für Würfe und Klänge, nur im Speicher */
  rate: newRateBook(),
  /**
   * Der Peer war schon einmal offen. Vorher wird nichts gespeichert, keine KI zieht und keine Uhr läuft, damit ein
   * zweiter Tab, der noch auf den Tischcode wartet, keine eigene Kopie weiterspielt (Wartebildschirm).
   */
  live: false,
};

function info(conn: DataConnection): ConnInfo {
  let i = H.info.get(conn);
  if (!i) {
    i = { seen: 0, chat: 0, replaced: false };
    H.info.set(conn, i);
  }
  return i;
}

/** Gegen die KI: Spiel, das nach dem Öffnen des Tisches gewählt wird, freie Plätze füllt die KI. */
let vsBots: GameKind | null = null;
/** Der Tisch wurde über „Gegen die KI spielen“ aufgemacht und die Lobby hat das noch nicht abgeholt. */
let vsBotsOpened = false;

/**
 * Für die Lobby: Kam dieser Tisch über „Gegen die KI spielen“? Liefert genau einmal true, beim ersten Abfragen
 * nach dem Aufbau, danach false. Die Lobby zeigt dann gleich „Spiel und Regeln“.
 */
export function openedVsBots(): boolean {
  const was = vsBotsOpened;
  vsBotsOpened = false;
  return was;
}

function resetHost(): void {
  vsBots = null;
  vsBotsOpened = false;
  H.conns = new Map();
  H.alias = Object.create(null);
  H.keys = Object.create(null);
  H.retries = 0;
  H.commitN = 0;
  H.rate = newRateBook();
  H.live = false;
  App.view = null;
  App.seenN = 0;
}

export function hostNew(name: string): void {
  App.role = 'host';
  App.name = name;
  App.me = genId('h');
  App.code = genCode();
  H.st = newState(App.me, name);
  resetHost();
  resetTableUI();
  hostOpen(false);
}

/** Neuer Tisch gegen die KI. Spiel und KI-Plätze kommen, sobald der Tisch offen ist (siehe hostOpen). */
export function hostNewVsBots(name: string, game: GameKind): void {
  hostNew(name);
  vsBots = game;
}

/**
 * Zuletzt gespieltes Spiel wählen und drei KI-Plätze füllen, mit denselben Aktionen wie in der Lobby. Gestartet wird
 * nicht: Der Host landet in der Lobby und kann Regeln und Plätze noch ändern.
 */
function startVsBots(st: State, game: GameKind): void {
  vsBots = null;
  if (st.phase !== 'lobby') return;
  const steps: Action[] = [
    { type: 'game', game },
    { type: 'rules', rules: { fill: true, seats: 4 } },
  ];
  for (const a of steps) {
    const e = act(st, App.me, a);
    if (e) {
      dlog('game', `Gegen die KI: ${a.type} abgelehnt, ${e}`);
      return;
    }
  }
  vsBotsOpened = true;
}

export function hostResume(saved: SavedHost): void {
  App.role = 'host';
  App.me = saved.me;
  App.name = saved.name;
  App.code = saved.code;
  const st = saved.st;
  H.st = st;
  resetHost();
  Object.entries(saved.keys ?? {}).forEach(([k, v]) => {
    H.keys[k] = String(v);
  });
  st.players.forEach((p) => {
    if (p.id !== App.me && !p.bot) p.online = false;
  });
  resetTableUI();
  migrate(st);
  // Gespeichert, gezeichnet und gezogen wird erst, wenn der Tischcode wirklich diesem Tab gehört (open in hostOpen)
  hostOpen(true);
}

function hostSave(): void {
  if (!H.st || !H.live) return;
  const saved: SavedHost = {
    code: App.code,
    me: App.me,
    name: App.name,
    st: H.st,
    keys: H.keys,
    ts: Date.now(),
    tab: TAB,
  };
  LS.set('host', saved);
}

function hostOpen(resume: boolean): void {
  setNet('connecting');
  if (!App.view) {
    showScreen('wait');
    setWait(resume ? 'Dein Tisch wird wieder aufgebaut…' : 'Tisch wird aufgebaut…');
  }
  if (H.peer) {
    const old = H.peer;
    H.peer = null;
    safeDestroy(old);
  }
  const peer = new Peer(PREFIX + App.code, peerOptions());
  H.peer = peer;
  const cur = () => H.peer === peer;
  let opened = false;
  peer.on('open', () => {
    if (!cur()) return;
    opened = true;
    H.retries = 0;
    setNet('online');
    const first = !H.live;
    H.live = true;
    // Die Gäste brauchen einen Moment zum Neuverbinden, bevor die 4er-Sperre endet
    if (first && resume && H.st?.sh?.win?.lock) H.st.sh.win.until = Date.now() + RESUME_WINDOW_MS;
    if (vsBots && H.st) startVsBots(H.st, vsBots);
    hostCommit();
    if (first && resume) showBackHint();
  });
  peer.on('connection', (conn) => {
    if (cur()) hostAttach(conn);
  });
  peer.on('disconnected', () => {
    if (!cur() || peer.destroyed) return;
    dlog('net', 'Signalserver getrennt, verbinde neu');
    setNet('reconnecting');
    keepSignal(peer, cur);
  });
  peer.on('error', (err) => {
    if (!cur()) return;
    const t = err?.type;
    dlog('net', `Peer-Fehler ${t ?? String(err)}`);
    if (t === 'unavailable-id') {
      // Code belegt: neuer Tisch bekommt einfach einen neuen Code
      if (!resume && !opened && H.st?.phase === 'lobby' && H.st.players.length === 1) {
        App.code = genCode();
        hostOpen(false);
        return;
      }
      if (H.retries++ < 40) {
        setNet('reconnecting');
        setWait(
          'Dein Tisch wird wieder aufgebaut…',
          'Der alte Tisch wird gerade freigegeben. Das dauert manchmal ein paar Sekunden.',
        );
        setTimeout(() => {
          if (cur()) hostOpen(true);
        }, 3000);
        return;
      }
      hostFail('Der Tischcode ist gerade belegt. Versuch es in einer Minute noch einmal.');
      return;
    }
    if (t === 'browser-incompatible') {
      hostFail('Dein Browser unterstützt keine direkten Verbindungen (WebRTC). Probier Chrome, Firefox oder Safari.');
      return;
    }
    if (t === 'peer-unavailable') return;
    setNet('reconnecting');
    if (peer.destroyed) {
      setTimeout(() => {
        if (cur()) hostOpen(true);
      }, 3000);
    } else if (peer.disconnected) keepSignal(peer, cur);
  });
  H.hb ??= setInterval(hostHeartbeat, HEARTBEAT_MS);
}

function hostFail(msg: string, destroyDelay = 0): void {
  vsBots = null;
  vsBotsOpened = false;
  H.live = false;
  resetTableUI();
  const p = H.peer;
  H.peer = null;
  safeDestroy(p, destroyDelay);
  releaseHostLock();
  App.role = null;
  App.view = null;
  showScreen('start');
  renderResume();
  showStartError(msg);
}

function hostAttach(conn: DataConnection): void {
  conn.on('data', (m) => hostMsg(conn, m));
  conn.on('close', () => hostClosed(conn));
  conn.on('error', () => hostClosed(conn));
}

function hostSend(conn: DataConnection, m: HostMessage): void {
  try {
    if (conn.open) void conn.send(m);
  } catch {
    /* Verbindung gerade weg, der Herzschlag merkt das */
  }
}

function rejectConn(conn: DataConnection, msg: string): void {
  hostSend(conn, { t: 'reject', msg });
  safeClose(conn, 600);
}

/**
 * Ein Gast meldet sich an: neuer Platz, Wiederkehr, Übernahme eines verwaisten Platzes oder eines KI-Platzes.
 * Ein übernommener Platz behält seine ID, der Gast bekommt sie mit `welcome` und meldet sich künftig damit.
 */
function hostHello(conn: DataConnection, st: State, m: Extract<GuestMessage, { t: 'hello' }>): void {
  const ci = info(conn);
  let pid = String(m.pid || '');
  const key = String(m.key || '').slice(0, 40);
  const name = cleanName(m.name) || 'Gast';
  // Eine alte Seite würde ein neueres Spiel falsch zeichnen
  const v = typeof m.v === 'string' ? m.v.slice(0, 20) : undefined;
  if (!canShow(st.game, v)) {
    dlog('net', `${name} abgewiesen, Version ${v ?? 'unbekannt'} kennt ${GAME_NAME[st.game]} nicht`);
    rejectConn(conn, `An diesem Tisch läuft ${GAME_NAME[st.game]}. Lade die Seite neu, dann kannst du mitspielen.`);
    return;
  }
  // Eigene Gast-ID oder ein Platz, den dieser Gast mit seinem Schlüssel schon hatte
  const ownSeat = !!key && H.keys[pid] === key && pIdx(st, pid) >= 0;
  if (!key || ci.pid) return;
  // Eine Platz-ID, die nicht mehr diesem Gast gehört (übernommen oder weg): wie ein frischer Beitritt
  if (!GUEST_ID.test(pid) && !ownSeat) pid = genId('p');
  let takeover = false;
  // Umleitungen nur für IDs, die selbst kein Platz sind, sonst landet der echte Besitzer woanders
  if (H.alias[pid] && pIdx(st, pid) < 0) pid = H.alias[pid];
  let p = st.players[pIdx(st, pid)];
  if (p?.bot) {
    // Mit dem eigenen Schlüssel ist es die Person, die gegangen war, sonst eine Übernahme
    if (H.keys[pid] === key || isOwnLeftSeat(p, name)) reclaimSeat(st, pid);
    else takeSeat(st, pid, name);
    takeover = true;
  }
  if (p && H.keys[pid] && H.keys[pid] !== key && !takeover) {
    rejectConn(conn, 'Dieser Platz ist schon besetzt.');
    return;
  }
  if (!p) {
    // Auch der Platz, auf dem dieselbe Person gerade offline sitzt (neuer Tab oder Browser, gleicher Name)
    const r = seatGuest(st, pid, name);
    if ('err' in r) {
      rejectConn(conn, r.err);
      return;
    }
    if (r.id !== pid) {
      dlog('net', `${name} bekommt den Platz ${r.id}`);
      H.alias[pid] = r.id;
      pid = r.id;
    }
    p = st.players[pIdx(st, pid)];
  }
  H.keys[pid] = key;
  const old = H.conns.get(pid);
  if (old && old !== conn) {
    info(old).replaced = true;
    hostSend(old, { t: 'replaced' });
    safeClose(old, 300);
  }
  H.conns.set(pid, conn);
  ci.pid = pid;
  p.online = true;
  delete p.offSince;
  delete p.gone;
  hostSend(conn, { t: 'welcome', pid, v: APP_VERSION });
  ci.v = typeof m.v === 'string' ? m.v.slice(0, 20) : undefined;
  dlog('net', `${name} kommt an den Tisch, Version ${ci.v ?? 'unbekannt'}`);
  noteGuestVersion(name, ci.v);
  hostCommit();
}

function hostMsg(conn: DataConnection, raw: unknown): void {
  const m = asMessage<GuestMessage>(raw);
  const st = H.st;
  if (!m || !st) return;
  const ci = info(conn);
  ci.seen = Date.now();
  if (m.t === 'hello') {
    hostHello(conn, st, m);
    return;
  }
  const id = ci.pid;
  if (!id) return;
  if (H.conns.get(id) !== conn) {
    safeClose(conn);
    return;
  }
  switch (m.t) {
    case 'ping': {
      hostSend(conn, { t: 'pong' });
      const pp = st.players[pIdx(st, id)];
      if (pp && !pp.online) {
        pp.online = true;
        delete pp.offSince;
        hostCommit();
      }
      return;
    }
    case 'act': {
      const a = m.a as Action | undefined;
      const now = Date.now();
      // Einfacher Schutz gegen Spam, Reaktionen, Würfe und Klänge prüft gateAct
      if (a?.type === 'chat') {
        if (now - ci.chat < 600) return;
        ci.chat = now;
      }
      const g = gateAct(st, id, a as Action, now);
      if (!g) return;
      const e = act(st, id, g);
      if (e) {
        dlog('game', `${st.players[pIdx(st, id)]?.name ?? id}: ${g.type} abgelehnt, ${e}`);
        hostSend(conn, { t: 'err', msg: e });
      } else hostCommit();
      return;
    }
    case 'bye':
      ci.replaced = true;
      H.conns.delete(id);
      quitPlayer(st, id);
      hostCommit();
      safeClose(conn, 300);
      return;
  }
}

/**
 * Zeitsperren für Würfe und Klänge, gleich für Gäste, den Host und die KI. Zu schnell heißt still verworfen.
 * Klänge baut der Host neu zusammen, `quiet` kommt nur von hier und nie vom Gast.
 */
export function gateAct(st: State, pid: string, a: Action, now = Date.now()): Action | null {
  if (a?.type === 'emote') return allowBurst(H.rate, 'emote', pid, EMOTE_HOST_WINDOW_MS, now) ? a : null;
  if (a?.type === 'toss') return allowBurst(H.rate, 'toss', pid, TOSS_HOST_WINDOW_MS, now) ? a : null;
  if (a?.type !== 'sound') return a;
  if (!soundOk(st, pid, a)) return null;
  const verdict = rateSound(H.rate, pid, now);
  if (verdict === 'seat') return null;
  const s: Action = { type: 'sound', s: a.s };
  if (a.bot) s.bot = true;
  if (verdict === 'quiet') s.quiet = true;
  return s;
}

/** Namen verbundener Gäste, deren Seite dieses Spiel noch nicht kennt. */
export function outdatedFor(game: GameKind): string[] {
  const st = H.st;
  if (!st) return [];
  return [...H.conns]
    .filter(([, c]) => c.open && !canShow(game, info(c).v))
    .map(([pid]) => st.players[pIdx(st, pid)]?.name ?? 'Jemand');
}

/** Dev-Menü: offene Verbindungen mit letztem Lebenszeichen und Version. */
export function hostConns(): { pid: string; open: boolean; seen: number; v?: string }[] {
  return [...H.conns].map(([pid, c]) => ({ pid, open: c.open, seen: info(c).seen, v: info(c).v }));
}

function hostClosed(conn: DataConnection): void {
  const ci = info(conn);
  if (ci.replaced || !ci.pid || !H.st || H.conns.get(ci.pid) !== conn) return;
  dlog('net', `Verbindung zu ${H.st.players[pIdx(H.st, ci.pid)]?.name ?? ci.pid} zu`);
  H.conns.delete(ci.pid);
  hostDrop(ci.pid);
}

function hostDrop(pid: string, noCommit = false): void {
  const st = H.st;
  if (!st) return;
  const i = pIdx(st, pid);
  if (i < 0) return;
  H.conns.delete(pid);
  const p = st.players[i];
  p.online = false;
  p.offSince ??= Date.now();
  if (st.phase !== 'lobby') checkReady(st);
  if (!noCommit) hostCommit();
}

/** Erkennt Gäste, die still verschwunden sind, und räumt verwaiste Plätze in der Lobby ab. */
function hostHeartbeat(): void {
  const st = H.st;
  if (App.role !== 'host' || !st || !H.live) return;
  const now = Date.now();
  let changed = false;
  st.players.slice().forEach((p) => {
    if (p.id === App.me || p.bot) return;
    const c = H.conns.get(p.id);
    const alive = !!(c && c.open && now - info(c).seen < GUEST_TIMEOUT_MS);
    if (!alive && p.online) {
      dlog('net', `${p.name} antwortet nicht mehr`);
      changed = true;
      if (c) {
        info(c).replaced = true;
        safeClose(c);
      }
      hostDrop(p.id, true);
    }
    if (!p.online && st.phase === 'lobby' && p.offSince && now - p.offSince > LOBBY_DROP_MS) {
      changed = true;
      removePlayer(st, p.id);
      syncSeats(st);
    }
  });
  if (changed) hostCommit();
}

/** Ansicht für einen Platz, mit Restzeit der 4er-Sperre statt absoluter Uhrzeit. */
function hostView(st: State, pid: string, own = false): View {
  const v = viewFor(st, pid);
  if (v.sh?.win) {
    v.sh.win.left = Math.max(0, num(v.sh.win.until) - Date.now());
    delete v.sh.win.until;
  }
  clockFor(v, own);
  nextFor(v);
  // Was übers Netz geht, muss in eine PeerJS-Nachricht passen
  return own ? v : fitView(v);
}

function hostOwnView(st: State): View {
  const v = hostView(st, App.me, true);
  if (v.sh?.win) v.sh.win.at = num(st.sh?.win?.until);
  return v;
}

/**
 * Neuer Stapel: Die Person am Zug wartet kurz, damit alle ihre 4er reinwerfen können.
 * Die Sperre beginnt erst nach der Animation, die alle gerade sehen.
 */
function hostWin(st: State, fresh: LogEntry[]): void {
  const w = st.game === 'shithead' && st.phase === 'play' ? st.sh?.win : null;
  if (!w?.lock) {
    resetHostTimers();
    return;
  }
  if (H.winId === w.id) return;
  if (!w.until || w.until < Date.now()) w.until = Date.now() + seqMsOf(fresh) + SH_WIN_MS;
  H.winId = w.id;
  if (H.winT) clearTimeout(H.winT);
  H.winT = setTimeout(
    () => {
      H.winT = null;
      const s2 = H.st;
      const win = s2?.sh?.win;
      if (!s2 || !win?.lock || win.id !== w.id) return;
      act(s2, App.me, { type: 'shunlock', id: w.id });
      hostCommit();
    },
    Math.max(0, w.until - Date.now()),
  );
}

export function resetHostTimers(): void {
  if (H.winT) clearTimeout(H.winT);
  H.winT = null;
  H.winId = null;
}

/** Alles, was beim Host im Hintergrund läuft, anhalten (Tisch zu oder neu). */
export function stopHostClocks(): void {
  resetHostTimers();
  resetClock();
  stopAutoNext();
}

/** Nach jeder Änderung: speichern, an alle senden, selbst anzeigen, KI anstoßen. */
export function hostCommit(): void {
  const st = H.st;
  if (!st || !H.live) return;
  pruneSeats(st);
  const fresh = st.log.filter((e) => e.n > H.commitN);
  H.commitN = st.n;
  hostWin(st, fresh);
  // Die Uhr fürs Zeitlimit steht, solange die Animation oder die 4er-Sperre läuft
  const win = st.game === 'shithead' ? st.sh?.win : null;
  // Startet mit einer Revanche-Forderung gleich die neue Partie, steht die Uhr bis die Ansage durch ist
  const rematchAnn = fresh.some((e) => e.k === 'rematch') ? REMATCH_ANN_MS : 0;
  hostClock(st, Math.max(seqMsOf(fresh), win?.lock ? num(win.until) - Date.now() : 0) + rematchAnn);
  botChatter();
  hostSave();
  H.conns.forEach((conn, pid) => hostSend(conn, { t: 'state', s: hostView(st, pid) }));
  applyView(hostOwnView(st));
  // Countdown zur nächsten Schnautz-Runde erst, wenn die Meldungen beim Host durch sind, dann allen schicken
  if (hostAutoNext(st, seqMsOf(fresh) + annLeft() + 400)) {
    H.conns.forEach((conn, pid) => hostSend(conn, { t: 'state', s: hostView(st, pid) }));
    applyView(hostOwnView(st));
  }
  // Nur Chat, Reaktionen, Würfe oder Klänge: Geplante KI-Züge behalten ihre Denkpause
  if (!cosmeticOnly(fresh)) botTick();
}

export function hostClose(): void {
  H.conns.forEach((conn) => hostSend(conn, { t: 'closed' }));
  safeDestroy(H.peer, 400);
  H.peer = null;
  H.live = false;
  LS.del('host');
  H.st = null;
  H.conns = new Map();
  releaseHostLock();
}

/** Abbrechen, während der Tisch noch aufgebaut wird. */
export function hostCancel(): void {
  vsBots = null;
  vsBotsOpened = false;
  safeDestroy(H.peer);
  H.peer = null;
  if (H.live && H.st && H.st.players.length === 1 && H.st.phase === 'lobby') LS.del('host');
  H.live = false;
  H.st = null;
  releaseHostLock();
}

/**
 * Weg mit Schlüsseln und Umleitungen für Plätze, die es nicht mehr gibt (in der Lobby entfernt). Sonst landet eine
 * alte Gast-ID über `H.alias` auf einer fremden Platz-ID.
 */
function pruneSeats(st: State): void {
  const seat = (id: string) => pIdx(st, id) >= 0;
  for (const k of Object.keys(H.alias)) if (!seat(H.alias[k])) delete H.alias[k];
  if (st.phase !== 'lobby') return;
  for (const k of Object.keys(H.keys)) if (!seat(k)) delete H.keys[k];
}

/**
 * Ein anderer Tab übernimmt. `save`: ein letztes Mal speichern, bevor die Sperre frei wird (nur bei einer frischen,
 * freiwilligen Übergabe). `end`: Im anderen Tab geht ein neuer Tisch auf, dieser hier ist für alle zu.
 * Danach speichert dieser Tab nichts mehr, KI und Uhr stehen, der Peer ist zu und gibt den Tischcode frei.
 */
function hostYield(save: boolean, end: boolean): void {
  if (App.role !== 'host' || !H.st) return;
  dlog('net', `Anderer Tab übernimmt${save ? ', letzter Stand gespeichert' : ''}${end ? ', Tisch zu' : ''}`);
  // Gespeichert wird nur, solange dieser Tab die Sperre noch hält, sonst liest der neue Tab womöglich schon
  if (save && (holdsHostLock() || !browserLocks())) hostSave();
  H.live = false;
  if (end) {
    H.conns.forEach((conn) => hostSend(conn, { t: 'closed' }));
    if (asSavedHost(LS.get<unknown>('host', null))?.code === App.code) LS.del('host');
  }
  H.st = null;
  H.conns = new Map();
  hostFail(
    end
      ? 'In einem anderen Tab hast du einen neuen Tisch aufgemacht. Dieser hier ist jetzt zu.'
      : 'Der Tisch läuft jetzt im anderen Tab.',
    end ? 400 : 0,
  );
}

function onClaim(c: Claim): void {
  const v = claimVerdict(c, { tab: TAB, code: App.code, hosting: App.role === 'host' && !!H.st }, Date.now());
  if (v === 'ignore') return;
  hostYield(v === 'keep', v === 'end');
}

const bus = typeof window === 'undefined' ? null : browserBus();

/** Ein anderer Tab will Gastgeber werden: Anspruch an alle Tabs dieses Browsers. Nie mit Schlüssel oder Stand. */
export function sendHostClaim(code: string): void {
  dlog('net', `Anspruch auf ${code || 'einen neuen Tisch'} an andere Tabs`);
  bus?.send(newClaim(code));
}

/** Einmal beim Start: auf Ansprüche anderer Tabs hören, auf eine weggenommene Sperre und auf fremde Speicherstände. */
export function initHostTabs(): void {
  bus?.listen(dedupe(onClaim));
  onHostLockLost(() => {
    dlog('net', 'Ein anderer Tab hat sich den Tisch genommen');
    hostYield(false, false);
  });
  window.addEventListener('storage', (e) => {
    if (e.key !== 'schnautz:host' || !e.newValue || App.role !== 'host' || !H.live) return;
    let tab: unknown;
    let code: unknown;
    try {
      const o = JSON.parse(e.newValue) as { tab?: unknown; code?: unknown };
      tab = o.tab;
      code = o.code;
    } catch {
      return;
    }
    // Ein anderer Tab mit 2.7 schreibt den Eintrag: Er ist jetzt Gastgeber, dieser Tab hört ohne Speichern auf
    if (typeof tab !== 'string' || tab === TAB) return;
    hostYield(false, code !== App.code);
  });
}

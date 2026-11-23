/*
 * Gastgeber: hält den vollständigen Spielzustand, rechnet alle Züge und schickt jedem Gast
 * seine gefilterte Ansicht. Der Zustand wird lokal gespeichert, damit man nach dem Neuladen
 * weitermachen kann.
 */
import { type DataConnection, Peer } from 'peerjs';
import { botChatter, botTick } from './bots';
import { clockFor, hostClock, resetClock } from './clock';
import { act } from '../game/actions';
import { SH_WIN_MS } from '../game/constants';
import { checkReady, quitPlayer } from '../game/flow';
import { isOwnLeftSeat, reclaimSeat, seatGuest, syncSeats, takeSeat } from '../game/seats';
import { migrate, newState, pIdx, removePlayer } from '../game/state';
import type { Action, LogEntry, State, View } from '../game/types';
import { viewFor } from '../game/view';
import { App } from '../ui/app';
import { applyView } from '../ui/apply';
import { num, type Timer } from '../ui/dom';
import { resetTableUI } from '../ui/reset';
import { seqMsOf } from '../ui/shithead/sequence';
import { setNet, setWait, showScreen } from '../ui/screens';
import { renderResume, showStartError } from '../ui/start';
import { LS } from '../ui/storage';
import { cleanName, genCode, genId, PREFIX, peerOptions } from './ids';
import { asMessage, type GuestMessage, type HostMessage, type SavedHost } from './protocol';
import { keepSignal, safeClose, safeDestroy } from './signal';

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
  emote: number;
  /** Absichtlich geschlossen (ersetzt oder verabschiedet), kein Verbindungsabbruch. */
  replaced: boolean;
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
};

function info(conn: DataConnection): ConnInfo {
  let i = H.info.get(conn);
  if (!i) {
    i = { seen: 0, chat: 0, emote: 0, replaced: false };
    H.info.set(conn, i);
  }
  return i;
}

function resetHost(): void {
  H.conns = new Map();
  H.alias = Object.create(null);
  H.keys = Object.create(null);
  H.retries = 0;
  H.commitN = 0;
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
  // Die Gäste brauchen einen Moment zum Neuverbinden, bevor die 4er-Sperre endet
  if (st.sh?.win?.lock) st.sh.win.until = Date.now() + RESUME_WINDOW_MS;
  hostCommit();
  hostOpen(true);
}

function hostSave(): void {
  if (!H.st) return;
  const saved: SavedHost = { code: App.code, me: App.me, name: App.name, st: H.st, keys: H.keys, ts: Date.now() };
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
    hostCommit();
  });
  peer.on('connection', (conn) => {
    if (cur()) hostAttach(conn);
  });
  peer.on('disconnected', () => {
    if (!cur() || peer.destroyed) return;
    setNet('reconnecting');
    keepSignal(peer, cur);
  });
  peer.on('error', (err) => {
    if (!cur()) return;
    const t = err?.type;
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
          'Der alte Raum wird gerade freigegeben. Das dauert manchmal ein paar Sekunden.',
        );
        setTimeout(() => {
          if (cur()) hostOpen(true);
        }, 3000);
        return;
      }
      hostFail('Der Tisch-Code ist gerade belegt. Versuch es in einer Minute noch einmal.');
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

function hostFail(msg: string): void {
  resetTableUI();
  const p = H.peer;
  H.peer = null;
  safeDestroy(p);
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
  if (!p && st.phase !== 'lobby') {
    // Wer mit neuem Browser zurückkommt, bekommt seinen alten Platz über den Namen
    const lower = name.toLowerCase();
    const seat = st.players.find((x) => !x.online && x.id !== st.host && x.name.toLowerCase() === lower);
    if (seat) {
      H.alias[pid] = seat.id;
      pid = seat.id;
      p = seat;
      takeover = true;
    }
  }
  if (p && H.keys[pid] && H.keys[pid] !== key && !takeover) {
    rejectConn(conn, 'Dieser Platz ist schon besetzt.');
    return;
  }
  if (!p) {
    const r = seatGuest(st, pid, name);
    if ('err' in r) {
      rejectConn(conn, r.err);
      return;
    }
    if (r.id !== pid) {
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
  hostSend(conn, { t: 'welcome', pid });
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
      // Einfacher Schutz gegen Spam
      if (a?.type === 'emote') {
        if (now - ci.emote < 900) return;
        ci.emote = now;
      }
      if (a?.type === 'chat') {
        if (now - ci.chat < 600) return;
        ci.chat = now;
      }
      const e = act(st, id, a as Action);
      if (e) hostSend(conn, { t: 'err', msg: e });
      else hostCommit();
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

function hostClosed(conn: DataConnection): void {
  const ci = info(conn);
  if (ci.replaced || !ci.pid || !H.st || H.conns.get(ci.pid) !== conn) return;
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
  if (App.role !== 'host' || !st) return;
  const now = Date.now();
  let changed = false;
  st.players.slice().forEach((p) => {
    if (p.id === App.me || p.bot) return;
    const c = H.conns.get(p.id);
    const alive = !!(c && c.open && now - info(c).seen < GUEST_TIMEOUT_MS);
    if (!alive && p.online) {
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
  return v;
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
}

/** Nach jeder Änderung: speichern, an alle senden, selbst anzeigen, KI anstoßen. */
export function hostCommit(): void {
  const st = H.st;
  if (!st) return;
  const fresh = st.log.filter((e) => e.n > H.commitN);
  H.commitN = st.n;
  hostWin(st, fresh);
  // Die Uhr fürs Zeitlimit steht, solange die Animation oder die 4er-Sperre läuft
  const win = st.game === 'shithead' ? st.sh?.win : null;
  hostClock(st, Math.max(seqMsOf(fresh), win?.lock ? num(win.until) - Date.now() : 0));
  botChatter();
  hostSave();
  H.conns.forEach((conn, pid) => hostSend(conn, { t: 'state', s: hostView(st, pid) }));
  applyView(hostOwnView(st));
  botTick();
}

export function hostClose(): void {
  H.conns.forEach((conn) => hostSend(conn, { t: 'closed' }));
  safeDestroy(H.peer, 400);
  H.peer = null;
  LS.del('host');
  H.st = null;
  H.conns = new Map();
}

/** Abbrechen, während der Tisch noch aufgebaut wird. */
export function hostCancel(): void {
  safeDestroy(H.peer);
  H.peer = null;
  if (H.st && H.st.players.length === 1 && H.st.phase === 'lobby') LS.del('host');
  H.st = null;
}

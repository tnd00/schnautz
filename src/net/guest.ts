/* Mitspieler (Gast): verbindet sich mit dem Gastgeber, schickt Züge und zeigt die empfangene Ansicht. */
import { type DataConnection, Peer } from 'peerjs';
import { App } from '../ui/app';
import { applyView } from '../ui/apply';
import { $, num, type Timer } from '../ui/dom';
import { toast } from '../ui/feedback';
import { resetTableUI } from '../ui/reset';
import { setNet, setWait, showScreen } from '../ui/screens';
import { endInvite, renderResume, showStartError } from '../ui/start';
import { LS, SS } from '../ui/storage';
import { noteHostVersion } from '../ui/update';
import { APP_VERSION } from '../content/version';
import { genId, PREFIX, peerOptions } from './ids';
import { asMessage, isView, type GuestMessage, type HostMessage, type SavedGuest } from './protocol';
import { keepSignal, safeClose, safeDestroy } from './signal';
import { dlog } from '../ui/devlog';

const RETRY_MS = 2500;
const CONNECT_TIMEOUT_MS = 15000;
const HEARTBEAT_MS = 4000;
const HOST_TIMEOUT_MS = 16000;

export const G = {
  peer: null as Peer | null,
  conn: null as DataConnection | null,
  /** Verbindung wird gerade aufgebaut. */
  pending: false,
  reTimer: null as Timer | null,
  lastPong: 0,
  /** Wann der letzte Ping rausging und wie lange die Antwort brauchte */
  pingAt: 0,
  rtt: 0,
  stopped: true,
  hb: null as ReturnType<typeof setInterval> | null,
  /** Mindestens einmal verbunden gewesen. */
  ever: false,
  notFound: 0,
  fails: 0,
  downSince: 0,
};

export function guestStart(code: string, name: string, pid: string, key?: string): void {
  App.role = 'guest';
  App.code = code;
  App.name = name;
  App.me = pid;
  App.key = key || genId('k');
  App.view = null;
  App.seenN = 0;
  resetTableUI();
  SS.set(`pid:${code}`, pid);
  SS.set(`key:${code}`, App.key);
  Object.assign(G, { stopped: false, ever: false, notFound: 0, fails: 0, downSince: 0 });
  showScreen('wait');
  setWait(`Verbinde mit Tisch ${code}…`, 'Das dauert meist nur ein paar Sekunden.');
  setNet('connecting');
  guestPeer();
  G.hb ??= setInterval(guestHeartbeat, HEARTBEAT_MS);
}

/** Schickt eine Nachricht an den Gastgeber. Gibt false zurück, wenn gerade keine Verbindung besteht. */
export function sendToHost(m: GuestMessage): boolean {
  if (!G.conn?.open) return false;
  try {
    void G.conn.send(m);
    return true;
  } catch {
    // Nur bei Spielzügen melden, nicht bei Herzschlag oder Abschied
    if (m.t === 'act') toast('Senden hat nicht geklappt.');
    return true;
  }
}

function guestPeer(): void {
  if (G.peer) {
    const o = G.peer;
    G.peer = null;
    safeDestroy(o);
  }
  const peer = new Peer(peerOptions());
  G.peer = peer;
  const cur = () => G.peer === peer && !G.stopped;
  peer.on('open', () => {
    if (!cur()) return;
    if (G.reTimer) clearTimeout(G.reTimer);
    G.reTimer = null;
    guestConnect();
  });
  peer.on('disconnected', () => {
    if (cur() && !peer.destroyed) keepSignal(peer, cur);
  });
  peer.on('error', (err) => {
    if (!cur()) return;
    const t = err?.type;
    dlog('net', `Peer-Fehler ${t ?? String(err)}`);
    if (t === 'peer-unavailable') {
      if (!G.ever && ++G.notFound >= 4) {
        guestFail(
          `Kein Tisch mit dem Code ${App.code} gefunden. Prüf den Code oder lass dir einen neuen Link schicken.`,
          true,
        );
        return;
      }
      setNet('reconnecting');
      if (!G.ever) setWait(`Suche Tisch ${App.code}…`, 'Der Tisch antwortet noch nicht. Ist der Gastgeber online?');
      guestRetry();
      return;
    }
    if (t === 'browser-incompatible') {
      guestFail('Dein Browser unterstützt keine direkten Verbindungen (WebRTC). Probier Chrome, Firefox oder Safari.');
      return;
    }
    if (!G.conn?.open) setNet('reconnecting');
    guestRetry(peer.destroyed);
  });
}

function guestConnect(): void {
  if (G.stopped) return;
  const peer = G.peer;
  if (!peer || peer.destroyed) {
    guestRetry(true);
    return;
  }
  if (G.conn && (G.conn.open || G.pending)) return;
  if (peer.disconnected || !peer.open) {
    guestRetry();
    return;
  }
  if (G.conn) {
    const old = G.conn;
    G.conn = null;
    safeClose(old);
  }
  const conn = peer.connect(PREFIX + App.code, { reliable: true, serialization: 'json' });
  if (!conn) {
    guestRetry();
    return;
  }
  G.conn = conn;
  G.pending = true;
  const to = setTimeout(() => {
    G.pending = false;
    if (G.conn === conn && !conn.open) {
      G.conn = null;
      safeClose(conn);
      if (!G.ever && ++G.fails >= 2) {
        setWait(
          'Verbindung klappt noch nicht…',
          'Die direkte Verbindung kommt gerade nicht zustande. Oft hilft ein Wechsel zwischen WLAN und mobilen Daten. Ich versuche es weiter.',
        );
      }
      guestRetry();
    }
  }, CONNECT_TIMEOUT_MS);
  conn.on('open', () => {
    clearTimeout(to);
    G.pending = false;
    if (G.conn !== conn) return;
    G.fails = 0;
    G.lastPong = Date.now();
    sendToHost({ t: 'hello', pid: App.me, key: App.key, name: App.name, v: APP_VERSION });
  });
  conn.on('data', (m) => {
    if (G.conn === conn) guestMsg(m);
  });
  conn.on('close', () => {
    clearTimeout(to);
    G.pending = false;
    if (G.conn !== conn) return;
    G.conn = null;
    dlog('net', 'Verbindung zum Gastgeber zu');
    if (!G.stopped) {
      setNet('reconnecting');
      guestRetry();
    }
  });
  conn.on('error', () => {
    /* close folgt */
  });
}

function guestRetry(recreate = false): void {
  if (G.reTimer || G.stopped) return;
  G.reTimer = setTimeout(() => {
    G.reTimer = null;
    if (G.stopped) return;
    if (recreate || !G.peer || G.peer.destroyed) guestPeer();
    else guestConnect();
  }, RETRY_MS);
}

/** Sofort neu verbinden, etwa wenn der Tab wieder sichtbar wird. */
export function guestWake(): void {
  if (App.role !== 'guest' || G.stopped || G.conn?.open) return;
  if (G.reTimer) clearTimeout(G.reTimer);
  G.reTimer = null;
  guestRetry();
}

function guestHeartbeat(): void {
  if (App.role !== 'guest' || G.stopped) return;
  const c = G.conn;
  if (c?.open) {
    G.pingAt = Date.now();
    sendToHost({ t: 'ping' });
    if (Date.now() - G.lastPong > HOST_TIMEOUT_MS) {
      G.conn = null;
      safeClose(c);
      setNet('reconnecting');
      guestRetry();
    }
  } else if (!c && !G.reTimer) guestRetry();
  if (App.view && App.net !== 'online') {
    $('#netbar').textContent =
      G.downSince && Date.now() - G.downSince > 20000
        ? 'Gastgeber gerade nicht erreichbar. Neuer Versuch läuft…'
        : 'Verbindung unterbrochen. Verbinde neu…';
  }
}

function guestMsg(raw: unknown): void {
  const m = asMessage<HostMessage>(raw);
  if (!m) return;
  switch (m.t) {
    case 'pong':
      G.lastPong = Date.now();
      if (G.pingAt) G.rtt = G.lastPong - G.pingAt;
      if (App.net !== 'online') setNet('online');
      return;
    case 'welcome': {
      G.ever = true;
      // Nach dem Neuverbinden keine alten Würfe und Klänge nachspielen
      App.fxSync = true;
      noteHostVersion(typeof m.v === 'string' ? m.v : undefined);
      G.lastPong = Date.now();
      setNet('online');
      if (typeof m.pid === 'string' && m.pid && m.pid !== App.me) {
        App.me = m.pid;
        SS.set(`pid:${App.code}`, m.pid);
      }
      const saved: SavedGuest = { code: App.code, pid: App.me, key: App.key, name: App.name, ts: Date.now() };
      LS.set('guest', saved);
      return;
    }
    case 'state': {
      G.lastPong = Date.now();
      setNet('online');
      if (!isView(m.s)) {
        dlog('err', 'Ansicht vom Gastgeber war ungültig und wurde verworfen');
        return;
      }
      const win = m.s.sh?.win;
      // Restzeit in lokale Uhrzeit umrechnen, sofort beim Empfang
      if (win && win.left != null) win.at = Date.now() + num(win.left);
      applyView(m.s);
      return;
    }
    case 'reject':
      dlog('net', `Abgewiesen: ${m.msg ?? ''}`);
      guestFail(m.msg || 'Beitreten hat nicht geklappt.', !keepsInvite(m.msg));
      return;
    case 'err':
      dlog('game', `Gastgeber lehnt ab: ${m.msg}`);
      toast(m.msg);
      App.busy = false;
      return;
    case 'closed':
      dlog('net', 'Tisch aufgelöst');
      LS.del('guest');
      guestFail('Der Gastgeber hat den Tisch aufgelöst.', true);
      return;
    case 'replaced':
      guestFail('Du sitzt jetzt in einem anderen Tab oder auf einem anderen Gerät am Tisch.');
      return;
  }
}

export function guestStop(): void {
  G.stopped = true;
  if (G.reTimer) clearTimeout(G.reTimer);
  G.reTimer = null;
  const c = G.conn;
  const p = G.peer;
  G.conn = null;
  G.peer = null;
  safeClose(c);
  safeDestroy(p, 300);
}

/** Tisch verlassen: dem Gastgeber Bescheid geben und die Verbindung beenden. */
export function guestLeave(): void {
  sendToHost({ t: 'bye' });
  LS.del('guest');
  guestStop();
}

/**
 * Abweisungen, nach denen die Einladung bleibt: Der Tisch ist voll (später klappt es vielleicht) oder die Seite soll
 * neu laden (dann braucht es den Code im Link). Die Texte kommen aus src/game/state.ts, seats.ts und hostHello.
 */
function keepsInvite(msg: string | undefined): boolean {
  return !!msg && /voll|alle Plätze sind besetzt|Lade die Seite neu/.test(msg);
}

/** Zurück zur Startseite mit Fehler. `endInv`: Der Tisch ist nicht zu erreichen, die Einladung endet. */
function guestFail(msg: string, endInv = false): void {
  resetTableUI();
  guestStop();
  App.role = null;
  $('#netbar').hidden = true;
  App.view = null;
  setNet('off');
  showScreen('start');
  renderResume();
  if (endInv) endInvite();
  showStartError(msg);
}

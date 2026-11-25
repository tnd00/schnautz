/* Gast: verbindet sich mit dem Gastgeber, schickt Züge und zeigt die empfangene Ansicht. */
import { type DataConnection, Peer } from 'peerjs';
import { App } from '../ui/app';
import { applyView } from '../ui/apply';
import { $, num, type Timer } from '../ui/dom';
import { showReject, toast } from '../ui/feedback';
import { resetTableUI } from '../ui/reset';
import { setNet, setWait, showScreen } from '../ui/screens';
import { endInvite, renderResume, showStartError } from '../ui/start';
import { LS, SS } from '../ui/storage';
import { noteHostVersion } from '../ui/update';
import { APP_VERSION } from '../content/version';
import { genId, PREFIX, peerOptions } from './ids';
import {
  asMessage,
  asReject,
  asSavedGuest,
  isView,
  readReject,
  rejectAct,
  type GuestMessage,
  type HostMessage,
  type SavedGuest,
} from './protocol';
import { ctxOfView } from '../content/texts';
import type { RejectCode } from '../game/reject';
import { keepSignal, safeClose, safeDestroy } from './signal';
import { dlog } from '../ui/devlog';

const RETRY_MS = 2500;
const CONNECT_TIMEOUT_MS = 15000;
const HEARTBEAT_MS = 4000;
const HOST_TIMEOUT_MS = 16000;

/** Frischer Beitritt: So lange ab dem Tipp auf Beitreten, dann steht fest, ob es den Tisch gibt. */
export const JOIN_GIVEUP_MS = 9000;
/** Nach dem WLAN-Rat: so lange weiter versuchen, dann aufgeben. */
export const SLOW_GIVEUP_MS = 30_000;
/** Zurück an den eigenen Tisch: länger als die mindestens 120 Sekunden, die ein Gastgeber zum Wiederaufbau braucht. */
export const RESUME_GIVEUP_MS = 150_000;
/** So lange braucht der Vermittlungsserver höchstens für „gibt es nicht“ (Frist 5 Sekunden plus Aufräumtakt). */
export const EXPIRE_WAIT_MS = 6500;
/** Verbindung steht, aber noch kein welcome: kurz darauf noch einmal nachsehen. */
const LINKED_RECHECK_MS = 2000;

/** Was die Suche nach dem Tisch bisher weiß. Zeiten in Millisekunden wie Date.now(). */
export interface Search {
  /** Rückkehr an einen Tisch, an dem dieser Platz schon saß, statt frischer Beitritt */
  resume: boolean;
  /** Beginn der Suche */
  since: number;
  /** Der eigene Peer war schon offen, der Vermittlungsserver antwortet also */
  signal: boolean;
  /** Der Vermittlungsserver hat mindestens einmal gemeldet, dass es den Tisch nicht gibt (peer-unavailable) */
  notFound: boolean;
  /** Eine Verbindung zum Tisch steht gerade, die Antwort des Gastgebers fehlt noch */
  linked: boolean;
  /** Start des letzten Verbindungsversuchs, 0 ohne */
  tryAt: number;
  /** Seit wann der WLAN-Rat steht, 0 ohne */
  slowAt: number;
}

/** Warum die Suche endet: kein Tisch (frisch), Tisch weg (Rückkehr), kein Server oder keine direkte Verbindung. */
export type SearchEnd = 'notfound' | 'gone' | 'server' | 'slow';

export type SearchStep =
  /** Weiter suchen, nächste Prüfung um `at` */
  | { t: 'wait'; at: number }
  /** Den Tisch gibt es, nur die direkte Verbindung hakt: WLAN-Rat zeigen, nächste Prüfung um `at` */
  | { t: 'slow'; at: number }
  | { t: 'end'; why: SearchEnd };

/**
 * Reine Zeitlogik der Suche nach dem Tisch, solange noch kein welcome kam. Ein frischer Beitritt endet beim ersten
 * peer-unavailable, sonst nach JOIN_GIVEUP_MS. Ohne peer-unavailable hängt es dann an der direkten Verbindung, also
 * WLAN-Rat und noch SLOW_GIVEUP_MS. Die Rückkehr an den eigenen Tisch versucht es RESUME_GIVEUP_MS lang.
 */
export function searchStep(s: Search, now: number): SearchStep {
  if (s.linked) return { t: 'wait', at: now + LINKED_RECHECK_MS };
  if (s.resume) {
    const end = s.since + RESUME_GIVEUP_MS;
    if (now < end) return { t: 'wait', at: end };
    return { t: 'end', why: s.notFound ? 'gone' : s.signal ? 'slow' : 'server' };
  }
  if (s.notFound) return { t: 'end', why: 'notfound' };
  if (s.slowAt) {
    const end = s.slowAt + SLOW_GIVEUP_MS;
    return now < end ? { t: 'wait', at: end } : { t: 'end', why: 'slow' };
  }
  const end = s.since + JOIN_GIVEUP_MS;
  if (now < end) return { t: 'wait', at: end };
  if (!s.signal) return { t: 'end', why: 'server' };
  // Ging der letzte Versuch spät los, erst abwarten, ob der Server „gibt es nicht“ meldet
  const heard = s.tryAt + EXPIRE_WAIT_MS;
  if (s.tryAt && now < heard) return { t: 'wait', at: heard };
  return { t: 'slow', at: now + SLOW_GIVEUP_MS };
}

/** Meldung auf der Startseite und ob die Einladung endet. */
export function searchEndText(why: SearchEnd, code: string): { msg: string; endInv: boolean } {
  switch (why) {
    case 'notfound':
      return {
        msg: `Kein Tisch mit dem Code ${code} gefunden. Prüf den Code oder frag, ob der Tisch noch offen ist.`,
        endInv: true,
      };
    case 'gone':
      return {
        msg: `Tisch ${code} antwortet nicht mehr. Vielleicht hat der Gastgeber ihn aufgelöst oder einen neuen aufgemacht.`,
        endInv: true,
      };
    case 'server':
      return { msg: 'Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.', endInv: false };
    case 'slow':
      return {
        msg: `Die direkte Verbindung zu Tisch ${code} kommt nicht zustande. Ein Wechsel zwischen WLAN und mobilen Daten hilft oft.`,
        endInv: false,
      };
  }
}

/** Saß dieser Platz schon an diesem Tisch? Der Eintrag entsteht erst bei welcome, ein bloßer Versuch zählt nicht. */
function wasSeated(code: string, pid: string): boolean {
  const gs = asSavedGuest(LS.get<unknown>('guest', null));
  return !!gs && gs.code === code && gs.pid === pid;
}

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
  /** Zurück an den eigenen Tisch statt frischer Beitritt (längere Frist). */
  resume: false,
  /** Beginn der Suche (guestStart) */
  since: 0,
  /** Eigener Peer war seit guestStart schon offen. */
  signal: false,
  /** Meldungen „gibt es nicht“ (peer-unavailable) seit guestStart oder der letzten Zeitgrenze */
  notFound: 0,
  /** Verbindungsversuche, die in die Zeitgrenze liefen */
  fails: 0,
  /** Start des letzten Verbindungsversuchs */
  tryAt: 0,
  /** Seit wann der WLAN-Rat steht */
  slowAt: 0,
  downSince: 0,
  /** Zeitgrenze des laufenden Verbindungsversuchs */
  connTo: null as Timer | null,
  /** Nächste Prüfung der Fristen (searchStep) */
  giveTo: null as Timer | null,
};

/**
 * Beitreten oder an den eigenen Tisch zurück. `resume` (ohne Angabe: Dieser Platz wurde an diesem Tisch schon
 * begrüßt) gibt dem Gastgeber Zeit zum Neuladen, ein frischer Beitritt mit falschem Code endet schnell.
 */
export function guestStart(code: string, name: string, pid: string, key?: string, resume = wasSeated(code, pid)): void {
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
  Object.assign(G, {
    stopped: false,
    ever: false,
    resume,
    since: Date.now(),
    signal: false,
    notFound: 0,
    fails: 0,
    tryAt: 0,
    slowAt: 0,
    downSince: 0,
  });
  dlog('net', resume ? `Zurück an Tisch ${code}` : `Beitritt zu Tisch ${code}`);
  showScreen('wait');
  setWait(`Verbinde mit Tisch ${code}…`, 'Das dauert meist nur ein paar Sekunden.');
  setNet('connecting');
  // Ein Versuch von vorher darf den neuen nicht blockieren
  dropPending();
  guestPeer();
  G.hb ??= setInterval(guestHeartbeat, HEARTBEAT_MS);
  searchCheck();
}

/** Fristen der Suche prüfen und die nächste Prüfung planen. Gibt true zurück, wenn die Suche damit endet. */
function searchCheck(): boolean {
  if (G.giveTo) clearTimeout(G.giveTo);
  G.giveTo = null;
  if (G.stopped || G.ever) return false;
  const now = Date.now();
  const s = searchStep(
    {
      resume: G.resume,
      since: G.since,
      signal: G.signal,
      notFound: G.notFound > 0,
      linked: !!G.conn?.open,
      tryAt: G.tryAt,
      slowAt: G.slowAt,
    },
    now,
  );
  if (s.t === 'end') {
    dlog('net', `Suche endet (${s.why})`);
    const e = searchEndText(s.why, App.code);
    guestFail(e.msg, e.endInv);
    return true;
  }
  if (s.t === 'slow') {
    G.slowAt = now;
    waitSlow();
  }
  G.giveTo = setTimeout(searchCheck, Math.max(0, s.at - now));
  return false;
}

/** WLAN-Rat: Den Tisch gibt es, nur die direkte Verbindung kommt nicht zustande. */
function waitSlow(): void {
  setWait(
    'Verbindung klappt noch nicht…',
    'Die direkte Verbindung kommt gerade nicht zustande. Oft hilft ein Wechsel zwischen WLAN und mobilen Daten. Der nächste Versuch läuft schon.',
  );
}

/** Zeitgrenze des Verbindungsversuchs abräumen. */
function clearConnTo(): void {
  if (G.connTo) clearTimeout(G.connTo);
  G.connTo = null;
}

/** Halb offene Verbindung abräumen, damit der nächste Versuch gleich starten kann. */
function dropPending(): void {
  clearConnTo();
  G.pending = false;
  const c = G.conn;
  if (c && !c.open) {
    // Erst lösen, dann schließen: So plant close keinen zweiten Versuch
    G.conn = null;
    safeClose(c);
  }
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
    G.signal = true;
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
      // Der Server kennt den Tisch gerade nicht. PeerJS lässt die Verbindung halb offen stehen, sie würde sonst bis
      // zur Zeitgrenze jeden neuen Versuch blockieren.
      G.notFound++;
      dropPending();
      if (searchCheck()) return;
      setNet('reconnecting');
      if (!G.ever)
        setWait(
          `Tisch ${App.code} antwortet gerade nicht…`,
          'Vielleicht lädt der Gastgeber gerade neu. Der nächste Versuch läuft schon.',
        );
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
  G.tryAt = Date.now();
  clearConnTo();
  G.connTo = setTimeout(() => {
    // Nur den eigenen Versuch abräumen, nie einen neueren
    if (G.conn !== conn) return;
    G.connTo = null;
    G.pending = false;
    if (conn.open) return;
    G.conn = null;
    safeClose(conn);
    G.fails++;
    // Zeitgrenze ohne „gibt es nicht“: Den Tisch gibt es, die direkte Verbindung hakt. Die letzte Auskunft zählt.
    G.notFound = 0;
    if (!G.ever && !G.stopped) waitSlow();
    guestRetry();
  }, CONNECT_TIMEOUT_MS);
  conn.on('open', () => {
    if (G.conn !== conn) return;
    clearConnTo();
    G.pending = false;
    G.fails = 0;
    G.lastPong = Date.now();
    sendToHost({ t: 'hello', pid: App.me, key: App.key, name: App.name, v: APP_VERSION });
  });
  conn.on('data', (m) => {
    if (G.conn === conn) guestMsg(m);
  });
  conn.on('close', () => {
    if (G.conn !== conn) return;
    clearConnTo();
    G.pending = false;
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
      // Ab jetzt sucht der Gast ohne Frist weiter, wenn die Verbindung abreißt
      if (G.giveTo) clearTimeout(G.giveTo);
      G.giveTo = null;
      G.slowAt = 0;
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
    case 'reject': {
      // Mit Code rendert der Gast selbst, sonst zeigt er den Text vom Gastgeber (auch von 2.6)
      const r = readReject(m, ctxOfView(App.view), 'Beitreten hat nicht geklappt.');
      dlog('net', `Abgewiesen: ${r.text}${r.code ? ` [${r.code}]` : ''}`);
      guestFail(r.text, !keepsInvite(typeof m.msg === 'string' ? m.msg : undefined, r.code));
      return;
    }
    case 'err': {
      const r = readReject(m, ctxOfView(App.view), 'Das geht gerade nicht.');
      dlog('game', `Gastgeber lehnt ab: ${r.text}${r.code ? ` [${r.code}]` : ''}`);
      // Mit Code zeigt der Gast den Grund am Tisch (Karte wackelt, Hinweis am Stapel), sonst wie bisher als Toast
      const rj = asReject(m);
      if (rj) showReject(rj, rejectAct(m), r.text);
      else toast(r.text);
      App.busy = false;
      return;
    }
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
  if (G.giveTo) clearTimeout(G.giveTo);
  G.giveTo = null;
  clearConnTo();
  G.pending = false;
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

/** Codes, nach denen die Einladung bleibt. */
const KEEP_INVITE: ReadonlySet<RejectCode> = new Set<RejectCode>(['seat.full', 'seat.fullPlaying', 'net.oldPage']);

/**
 * Abweisungen, nach denen die Einladung bleibt: Der Tisch ist voll (später klappt es vielleicht) oder die Seite soll
 * neu laden (dann braucht es den Code im Link). Mit Code entscheidet der Code. Ohne Code (Gastgeber von 2.6) der
 * Text, die drei Wortteile sind deshalb in src/content/texts/reject.ts eingefroren.
 */
export function keepsInvite(msg: string | undefined, code?: RejectCode | null): boolean {
  if (code) return KEEP_INVITE.has(code);
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

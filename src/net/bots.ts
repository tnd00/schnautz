/*
 * KI am Tisch: läuft nur im Browser des Gastgebers. Die KI entscheidet auf Basis ihrer eigenen
 * Ansicht (kein Schummeln) und spielt mit menschlich wirkenden Pausen. Außerdem gelegentliche
 * Chat-Sprüche und Emoji-Reaktionen.
 */
import { act, fallbackMove, soundOk } from '../game/actions';
import { hasBets, shBetsOn, shCanBet } from '../game/bets';
import { botRematchSeat } from '../game/rematch';
import { rankOf, suitOf } from '../game/cards';
import { handValue } from '../game/schnautz';
import { addLog, pIdx } from '../game/state';
import type { Action, Card, LogEntry, Player, State, TossItem } from '../game/types';
import { viewFor } from '../game/view';
import { gateAct, H, hostCommit } from './host';
import { tableQuiet } from './rate';
import { App } from '../ui/app';
import { hashStr, num, type Timer } from '../ui/dom';
import { ANN } from '../ui/feedback';
import { seqLeft, seqMsOf } from '../ui/shithead/sequence';
import { botDecide } from '../bots/index';
import { BOT_LINES } from '../bots/lines';
import { botTossReply } from '../bots/toss';
import { botBet } from '../bots/bets';
import { revealDelayOf } from '../ui/ceremony-plan';
import { onlyBotsPlaying, szResult } from '../game/games';
import { animFloor, fastDelay, fastOk, ffwdInLog, type PaceIn } from './pace';

/** Wie oft die KI eine Gelegenheit außer der Reihe bemerkt (in Prozent). */
const NOTICE_THROW = 88;
const NOTICE_BOMB = 80;
const CHAT_PAUSE_MS = 7000;
const RECENT_LINES = 12;
/** Jede KI wirft höchstens alle 6 Sekunden, alle zusammen höchstens alle 3 */
const BOT_TOSS_GAP_MS = 6000;
const BOT_TOSS_ALL_MS = 3000;
/** Für den ganzen Tisch höchstens ein KI-Klang in dieser Zeit */
const BOT_SOUND_GAP_MS = 20000;

interface Reaction {
  key: string;
  t: Timer | null;
}

export const BOTS = {
  timer: null as Timer | null,
  key: null as string | null,
  chatAt: 0,
  scanN: -1,
  recent: [] as string[],
  react: {} as Record<string, Reaction>,
  /** Tauschrunde: eine Denkpause pro KI, alle tauschen gleichzeitig */
  swap: {} as Record<string, Timer>,
  tossAt: {} as Record<string, number>,
  tossAll: 0,
  sndAt: 0,
  /** Geplante Tipps fertiger KIs */
  bet: {} as Record<string, Timer>,
  /** Geplante Revanche-Forderung einer KI */
  rematch: null as Timer | null,
  rematchKey: '',
  /** Dev-Menü: Bis der gemerkte letzte Zug gespielt ist, planen die KIs nichts */
  hold: false,
  /** Vorspulen: Partienummer (`st.games`), für die die KIs zügig ausspielen. Bleibt beim Host, reist nicht in der View */
  fast: null as number | null,
  /** Vorspulen: bis hierhin gelesene Einträge und bis wann der letzte Zug noch zu sehen ist */
  paceN: -1,
  floorAt: 0,
  /**
   * Nur für Tests (über window.__schnautz): Die KIs ziehen in der Vorspul-Taktung, auch wenn Menschen mitspielen.
   * Lange E2E-Partien laufen so in einem Bruchteil der Zeit. Die 4er-Sperre bleibt normal (hostWin fragt fastOn).
   */
  quick: false,
};

/** Spulen die KIs gerade vor? Dieselbe Prüfung wie in botTick, nicht das rohe Feld (siehe hostWin). */
export const fastOn = (st: State): boolean => fastOk(st, BOTS.fast);
/** Taktung der KI-Züge: Vorspulen oder Testmodus */
const paced = (st: State): boolean => BOTS.quick || fastOn(st);

/** Takt beim Vorspulen, mit dem Boden aus dem zuletzt gespielten Zug. */
const fastMs = (kind: PaceIn['kind'], hold = 0): number =>
  fastDelay({ kind, r: Math.random(), floor: Math.max(seqLeft(), BOTS.floorAt - Date.now()), hold });

/**
 * Gastgeber tippt „⏩ Vorspulen“: Geplante lange Denkpausen verwerfen, denn botTick behält bei gleichem Schlüssel
 * den alten Timer. Der Eintrag `ffwd` sagt allen am Tisch Bescheid.
 */
export function fastForward(): void {
  const st = H.st;
  if (App.role !== 'host' || !st || !onlyBotsPlaying(st) || BOTS.fast === st.games) return;
  BOTS.fast = st.games;
  BOTS.paceN = st.n;
  BOTS.floorAt = Date.now() + seqLeft();
  clearTurnTimer();
  clearReactions();
  clearSwaps();
  clearBets();
  addLog(st, { k: 'ffwd', p: App.me });
  hostCommit();
}

function clearBets(): void {
  Object.values(BOTS.bet).forEach((t) => clearTimeout(t));
  BOTS.bet = {};
}

function clearRematch(): void {
  if (BOTS.rematch) clearTimeout(BOTS.rematch);
  BOTS.rematch = null;
  BOTS.rematchKey = '';
}

/** Fertige KIs tippen nach einer Weile, wer Shithead oder Durak wird. */
function botBets(st: State): void {
  st.players.forEach((p) => {
    if (!p.bot || p.out || !shCanBet(st, p.id)) {
      if (BOTS.bet[p.id]) {
        clearTimeout(BOTS.bet[p.id]);
        delete BOTS.bet[p.id];
      }
      return;
    }
    if (BOTS.bet[p.id]) return;
    const d = paced(st)
      ? fastMs('bet')
      : 2500 + Math.random() * 4500 + Math.min(seqLeft(), 2000) + (ANN.busy ? 1500 : 0);
    BOTS.bet[p.id] = setTimeout(() => {
      delete BOTS.bet[p.id];
      const s = H.st;
      if (App.role !== 'host' || !s || !hasBets(s.game) || s.phase !== 'play') return;
      if (!s.players[pIdx(s, p.id)]?.bot || !shCanBet(s, p.id)) return;
      const a = botBet(viewFor(s, p.id));
      if (a && !act(s, p.id, a)) hostCommit();
    }, d);
  });
}

/** Eine KI als Verliererin fordert manchmal einen menschlichen Sieger heraus, nach den Meldungen zum Ende. */
function planBotRematch(st: State): void {
  const id = st.phase === 'over' ? botRematchSeat(st) : null;
  if (!id || hashStr(`${st.games}${id}`) % 100 >= 45) {
    clearRematch();
    return;
  }
  const key = `${st.games}|${id}`;
  if (BOTS.rematch && BOTS.rematchKey === key) return;
  clearRematch();
  BOTS.rematchKey = key;
  const games = st.games;
  const fire = (): void => {
    BOTS.rematch = null;
    const s = H.st;
    if (App.role !== 'host' || !s || s.games !== games || botRematchSeat(s) !== id) return;
    // Erst wenn alle Meldungen durch sind, sonst geht die Forderung unter
    if (App.holdUntil > Date.now() || ANN.busy || seqLeft() > 0) {
      BOTS.rematch = setTimeout(fire, Math.max(400, App.holdUntil - Date.now()) + 1200 + Math.random() * 1800);
      return;
    }
    if (act(s, id, { type: 'rematch', bot: true })) return;
    hostCommit();
    const text = Math.random() < 0.9 ? pickLine('rematchCall') : null;
    if (text) {
      BOTS.chatAt = Date.now() + CHAT_PAUSE_MS;
      setTimeout(
        () => {
          if (!H.st || H.st.games !== games || pIdx(H.st, id) < 0) return;
          act(H.st, id, { type: 'chat', text, bot: true });
          hostCommit();
        },
        900 + Math.random() * 600,
      );
    }
  };
  BOTS.rematch = setTimeout(fire, Math.max(0, App.holdUntil - Date.now()) + 1200 + Math.random() * 1800);
}

function clearSwaps(): void {
  Object.values(BOTS.swap).forEach((t) => clearTimeout(t));
  BOTS.swap = {};
}

const isReaction = (a: Action | null): a is Extract<Action, { type: 'shthrow' | 'shbomb' }> =>
  !!a && (a.type === 'shthrow' || a.type === 'shbomb');

function clearReactions(): void {
  Object.values(BOTS.react).forEach((r) => {
    if (r.t) clearTimeout(r.t);
  });
  BOTS.react = {};
}

function clearTurnTimer(): void {
  if (BOTS.timer) clearTimeout(BOTS.timer);
  BOTS.timer = null;
  BOTS.key = null;
}

export function resetBots(): void {
  clearTurnTimer();
  clearReactions();
  clearSwaps();
  BOTS.scanN = -1;
  BOTS.recent = [];
  BOTS.tossAt = {};
  BOTS.tossAll = 0;
  BOTS.sndAt = 0;
  clearBets();
  clearRematch();
  BOTS.fast = null;
  BOTS.paceN = -1;
  BOTS.floorAt = 0;
}

/** Vorspulen beenden, wenn es nicht mehr passt, sonst den Animationsboden aus den neuen Einträgen fortschreiben. */
function paceTick(st: State): void {
  if (BOTS.fast !== null && !fastOn(st)) BOTS.fast = null;
  // Nach dem Neuladen des Gastgebers: Der Verlauf weiß noch, dass vorgespult wird
  if (BOTS.fast === null && fastOk(st, st.games) && ffwdInLog(st.log)) {
    BOTS.fast = st.games;
    BOTS.paceN = st.n;
    BOTS.floorAt = Date.now() + seqLeft();
  }
  if (BOTS.fast === null && !BOTS.quick) {
    BOTS.paceN = st.n;
    return;
  }
  const fresh = st.log.filter((e) => e.n > BOTS.paceN);
  BOTS.paceN = st.n;
  if (fresh.length) BOTS.floorAt = Math.max(BOTS.floorAt, Date.now() + animFloor(st.game, fresh, seqMsOf(fresh)));
}

/** Reaktionen außer der Reihe (4er reinwerfen, Bombe einwerfen) laufen für jede KI parallel. */
function botReact(st: State): void {
  st.players.forEach((p) => {
    if (!p.bot || p.out) {
      // Hat ein Mensch den Platz übernommen, darf keine geplante Reaktion mehr feuern
      const old = BOTS.react[p.id];
      if (old?.t) clearTimeout(old.t);
      delete BOTS.react[p.id];
      return;
    }
    const a = botDecide(viewFor(st, p.id), undefined, 'normal');
    if (!isReaction(a)) {
      const old = BOTS.react[p.id];
      if (old?.t) clearTimeout(old.t);
      delete BOTS.react[p.id];
      return;
    }
    // Wer eine 4 reinwirft und wieder eine 4 zieht, darf nochmal: Die eigenen Karten gehören zum Schlüssel
    const own = st.sh?.P[p.id];
    const key =
      a.type === 'shthrow'
        ? `${a.type}|${st.games}|${st.sh?.win?.id}|${own?.hand.join()}|${own?.up.length}`
        : `${a.type}|${st.games}|${st.last?.n ?? 0}`;
    const old = BOTS.react[p.id];
    if (old?.key === key) return;
    if (old?.t) clearTimeout(old.t);
    const R: Reaction = { key, t: null };
    BOTS.react[p.id] = R;
    // Manchmal bemerkt die KI die Gelegenheit nicht, fest pro Gelegenheit
    if (hashStr(p.id + key) % 100 >= (a.type === 'shthrow' ? NOTICE_THROW : NOTICE_BOMB)) return;
    // Bei einem neuen Stapel muss es schnell gehen, die Person am Zug wartet nur kurz
    const d = paced(st)
      ? fastMs('react')
      : (a.type === 'shthrow' ? 500 + Math.random() * 1900 : 700 + Math.random() * 1600) + seqLeft();
    R.t = setTimeout(() => {
      R.t = null;
      if (App.role !== 'host' || !H.st) return;
      if (!H.st.players[pIdx(H.st, p.id)]?.bot) return;
      const a2 = botDecide(viewFor(H.st, p.id), undefined, 'normal');
      if (a2?.type !== a.type) return;
      if (!act(H.st, p.id, a2)) hostCommit();
    }, d);
  });
}

/** Wie lange "denkt" die KI über diesen Zug nach? */
function thinkTime(st: State, who: Player, a: Action): number {
  if (paced(st)) return fastMs(a.type === 'ready' ? 'ready' : 'turn', App.holdUntil - Date.now());
  const r = Math.random();
  let d: number;
  switch (a.type) {
    case 'ready':
      return Math.max(4000 + r * 1500, App.holdUntil - Date.now() + 3500);
    case 'shswap':
      return 450 + r * 350 + (ANN.busy ? 700 : 0);
    case 'shready':
      return 900 + r * 700 + (ANN.busy ? 700 : 0);
    case 'knock':
      d = 1700 + r * 1200;
      break;
    case 'keep':
    case 'take':
      d = 1500 + r * 1000;
      break;
    case 'shpickup':
    case 'shblind':
      d = 1100 + r * 700;
      break;
    case 'dkattack':
      // Den ersten Angriff überlegt sie, Nachlegen geht schnell
      d = (st.dk?.table.length ? 700 : 1300) + r * 900;
      break;
    case 'dkdefend':
    case 'dktransfer':
      d = 900 + r * 900;
      break;
    case 'dktake':
      d = 1300 + r * 900;
      break;
    case 'dkpass':
      d = 600 + r * 600;
      break;
    case 'cblook':
      return 900 + r * 900 + (ANN.busy ? 700 : 0);
    case 'cbdraw':
      d = 900 + r * 900;
      break;
    case 'cbswap':
    case 'cbdiscard':
      d = 1000 + r * 1000;
      break;
    case 'cbcabo':
      // Cabo rufen will gut überlegt aussehen
      d = 1800 + r * 1400;
      break;
    case 'cbpeek':
    case 'cbspy':
    case 'cbblind':
    case 'cbskip':
      d = 1100 + r * 1000;
      break;
    case 'cbsnap':
      d = 500 + r * 700;
      break;
    default:
      d = a.type === 'pass' && passIsObvious(st, who.id) ? 800 + r * 600 : 1200 + r * 1400;
  }
  if (ANN.busy) d += 700;
  // Bei Shithead erst zuschauen, bis die laufende Animation durch ist
  if (st.game === 'shithead') d += seqLeft();
  return d;
}

/**
 * Tauschrunde bei Shithead und Ansehen bei Cabo: Alle KIs gleichzeitig, jede mit eigener Denkpause.
 * Nacheinander dauerte das bei neun KIs eine halbe Minute.
 */
function botSwapRound(st: State): void {
  clearTurnTimer();
  st.players.forEach((p) => {
    if (!p.bot || p.out || p.ready || BOTS.swap[p.id]) return;
    const a = botDecide(viewFor(st, p.id), undefined, 'normal');
    if (!a) return;
    BOTS.swap[p.id] = setTimeout(
      () => {
        delete BOTS.swap[p.id];
        const s = H.st;
        if (App.role !== 'host' || !s || s.phase !== st.phase) return;
        const me = s.players[pIdx(s, p.id)];
        if (!me?.bot || me.ready) return;
        const a2 = botDecide(viewFor(s, p.id), undefined, 'normal');
        // Klappt es nicht, macht die KI einen einfachen Ersatzzug, damit niemand wartet
        if (a2 && act(s, p.id, a2)) fallbackMove(s, p.id);
        hostCommit();
      },
      paced(st) ? fastMs('swap') : thinkTime(st, p, a) + Math.random() * 900,
    );
  });
}

/** Der nächste reguläre Zug einer KI, mit Pause, damit es menschlich wirkt. */
export function botTick(): void {
  const st = H.st;
  if (App.role !== 'host' || !st || BOTS.hold) return;
  paceTick(st);
  if (st.phase === 'lobby') {
    clearTurnTimer();
    clearBets();
    clearRematch();
    return;
  }
  // Reaktionen außer der Reihe gibt es nur bei Shithead, Tipps bei allen Spielen mit Verlierer
  if (st.game === 'shithead' && st.phase === 'play') botReact(st);
  else clearReactions();
  if (hasBets(st.game) && st.phase === 'play') botBets(st);
  else clearBets();
  planBotRematch(st);
  if ((st.game === 'shithead' && st.phase === 'swap') || (st.game === 'cabo' && st.phase === 'peek')) {
    botSwapRound(st);
    return;
  }
  clearSwaps();
  // KIs warten auf Menschen, statt sie mit "bereit" zu drängeln
  const humansNeeded = st.players.some((p) => !p.bot && p.online && (st.phase === 'over' || !p.out));
  let who: Player | null = null;
  let a0: Action | null = null;
  for (const p of st.players) {
    if (!p.bot) continue;
    const a = botDecide(viewFor(st, p.id), undefined, 'normal');
    if (!a || isReaction(a) || (a.type === 'ready' && humansNeeded)) continue;
    who = p;
    a0 = a;
    break;
  }
  if (!who || !a0) {
    clearTurnTimer();
    return;
  }
  const readyCount = st.players.filter((p) => p.ready).length;
  const key = [who.id, st.phase, st.turn, st.round, st.games, st.last?.n ?? 0, a0.type, readyCount].join('|');
  if (BOTS.timer && BOTS.key === key) return;
  clearTurnTimer();
  BOTS.key = key;
  const botId = who.id;
  BOTS.timer = setTimeout(
    () => {
      BOTS.timer = null;
      BOTS.key = null;
      const s = H.st;
      if (App.role !== 'host' || !s) return;
      // Inzwischen von einem Menschen übernommen: nichts tun, der nächste Tick plant neu
      if (!s.players[pIdx(s, botId)]?.bot) {
        botTick();
        return;
      }
      const a = botDecide(viewFor(s, botId), undefined, 'normal');
      if (!a || isReaction(a)) {
        botTick();
        return;
      }
      const e = act(s, botId, a);
      if (e) {
        // Sollte nie passieren, aber das Spiel darf nicht hängen
        console.warn('KI-Zug abgelehnt', e, a);
        fallbackMove(s, botId);
      }
      hostCommit();
    },
    thinkTime(st, who, a0),
  );
}

/** Schieben ist offensichtlich, wenn kein Tausch die Hand verbessert. Dann zieht die KI schneller. */
function passIsObvious(st: State, id: string): boolean {
  const hand = st.hands[id];
  if (st.game !== 'schnautz' || !hand) return false;
  const cur = handValue(hand, st.rules).v;
  let best = 0;
  for (let h = 0; h < 3; h++) {
    for (let m = 0; m < 3; m++) {
      const nh = hand.slice();
      nh[h] = st.middle[m];
      best = Math.max(best, handValue(nh, st.rules).v);
    }
  }
  return best <= cur;
}

/** Schaut auf neue Ereignisse und lässt die KI ab und zu etwas sagen oder reagieren. */
/** Zufälliger Spruch, der zuletzt nicht kam. */
function pickLine(cat: string): string | null {
  const arr = BOT_LINES[cat];
  if (!arr?.length) return null;
  const unused = arr.filter((x) => !BOTS.recent.includes(x));
  const pool = unused.length ? unused : arr;
  const text = pool[Math.floor(Math.random() * pool.length)];
  BOTS.recent.push(text);
  if (BOTS.recent.length > RECENT_LINES) BOTS.recent.shift();
  return text;
}

/**
 * Durak: Hatte beim Eintrag `n` schon jemand Aufnehmen gesagt? Dann war der Angriff ein Nachlegen auf diese Person.
 * Der Verlauf zählt, nicht `st.dk.take`: Füllt die Karte den Angriff, ist längst aufgenommen, wenn die KI schaut.
 */
function dkTakerAt(log: readonly LogEntry[], n: number): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.n >= n) continue;
    if (e.k === 'dktake') return e.p ?? null;
    if (e.k === 'dkbito' || e.k === 'dkpickup' || e.k === 'dkdeal' || e.k === 'game') return null;
    if (e.k === 'dkattack' && e.lead) return null;
  }
  return null;
}

/** Durak: König oder Ass in Trumpf */
const dkHighTrump = (c: Card, trump: Card | undefined): boolean =>
  !!trump && suitOf(c) === suitOf(trump) && (rankOf(c) === 'K' || rankOf(c) === 'A');

export function botChatter(): void {
  const st = H.st;
  if (!st) return;
  if (BOTS.scanN < 0) {
    BOTS.scanN = st.n;
    return;
  }
  const fresh = st.log.filter((e) => e.n > BOTS.scanN && e.k !== 'chat');
  BOTS.scanN = st.n;
  const bot = (id: string | null | undefined): Player | null => {
    const i = pIdx(st, id);
    return i >= 0 && st.players[i].bot ? st.players[i] : null;
  };
  const anyBot = (): Player | null => {
    const bs = st.players.filter((p) => p.bot && !p.gone);
    return bs.length ? bs[Math.floor(Math.random() * bs.length)] : null;
  };
  /** Eine KI außer `id`, damit niemand über sich selbst spottet */
  const otherBot = (id: string | null | undefined): Player | null => {
    const bs = st.players.filter((p) => p.bot && !p.gone && p.id !== id);
    return bs.length ? bs[Math.floor(Math.random() * bs.length)] : null;
  };
  // Am Partieende reagiert die KI erst, wenn die Zeremonie den Shithead, Durak oder Cabo-König enthüllt hat
  const endWait = revealDelayOf(st.game, fresh, seqMsOf(fresh));
  // Durak: Letzter Angriff, Rausgehen und Ende kommen zusammen. Dann gehört die Bühne dem Ende,
  // Sprüche wie "Wer bleibt übrig?" passen nicht mehr, auch nicht bei Unentschieden
  const dkOver = fresh.some((e) => e.k === 'dkend');
  // Cabo: Die letzte Runde, der Rückfall auf 50 und das Ende kommen zusammen. Wird eine KI König,
  // gehört ihr die Bühne und Sprüche zur Runde bleiben aus
  const cbKing = bot(fresh.find((e) => e.k === 'cbend')?.p);
  const cbKingTalks = !!cbKing && !cbKing.left;
  const cbKami = fresh.some((e) => e.k === 'cbround' && !!e.kami);
  const games = st.games;
  /** Noch dieselbe Partie in derselben Phase? Sonst landet Spott in der nächsten Tauschrunde. */
  const still = (phase?: string) => !!H.st && H.st.games === games && (!phase || H.st.phase === phase);
  const say = (p: Player | null, cat: string, prob: number, extra = 0, force = false) => {
    if (!p || p.left || Math.random() > prob || (!force && Date.now() < BOTS.chatAt)) return;
    const text = pickLine(cat);
    if (!text) return;
    BOTS.chatAt = Date.now() + extra + CHAT_PAUSE_MS;
    const phase = extra ? st.phase : undefined;
    setTimeout(
      () => {
        if (!H.st || pIdx(H.st, p.id) < 0 || !still(phase)) return;
        act(H.st, p.id, { type: 'chat', text, bot: true });
        hostCommit();
      },
      extra + 900 + Math.random() * 1200,
    );
  };
  // Plätze, auf denen nach dem Gehen eines Menschen die KI weiterspielt, werfen und tröten nie
  const realBot = (id: string | null | undefined): Player | null => {
    const p = bot(id);
    return p && !p.left && !p.gone ? p : null;
  };
  const tossBot = (): Player | null => {
    const bs = st.players.filter((p) => p.bot && !p.left && !p.gone);
    return bs.length ? bs[Math.floor(Math.random() * bs.length)] : null;
  };
  /** Wurf einer KI, erst wenn die laufende Animation durch ist */
  const toss = (p: Player | null, item: TossItem, to: string | null | undefined, prob: number) => {
    if (!p || p.left || !to || to === p.id || Math.random() > prob) return;
    const now = Date.now();
    if (now < (BOTS.tossAt[p.id] ?? 0) || now < BOTS.tossAll) return;
    BOTS.tossAt[p.id] = now + BOT_TOSS_GAP_MS;
    BOTS.tossAll = now + BOT_TOSS_ALL_MS;
    setTimeout(
      () => {
        const s = H.st;
        if (App.role !== 'host' || !s || s.phase === 'lobby') return;
        const me = s.players[pIdx(s, p.id)];
        if (!me?.bot || me.left || pIdx(s, to) < 0) return;
        const a = gateAct(s, p.id, { type: 'toss', item, to, bot: true });
        if (a && !act(s, p.id, a)) hostCommit();
      },
      seqLeft() + seqMsOf(fresh) + endWait + 1200 + Math.random() * 1400,
    );
  };
  /** Klang einer KI: selten, nach der Pointe und nur in die Stille */
  const snd = (p: Player | null, s: string, prob: number) => {
    if (!p || p.left || Math.random() > prob || Date.now() < BOTS.sndAt) return;
    BOTS.sndAt = Date.now() + BOT_SOUND_GAP_MS;
    setTimeout(
      () => {
        const t = H.st;
        const a: Action = { type: 'sound', s, bot: true };
        if (App.role !== 'host' || !t || !soundOk(t, p.id, a) || !tableQuiet(H.rate, Date.now())) return;
        const me = t.players[pIdx(t, p.id)];
        if (me?.left) return;
        const g = gateAct(t, p.id, a);
        if (g?.type === 'sound' && !g.quiet && !act(t, p.id, g)) hostCommit();
      },
      seqLeft() + seqMsOf(fresh) + endWait + 2500 + Math.random() * 1500,
    );
  };
  const emo = (p: Player | null, ch: string, prob: number, extra = 0) => {
    if (!p || p.left || Math.random() > prob) return;
    const phase = extra ? st.phase : undefined;
    setTimeout(
      () => {
        if (!H.st || pIdx(H.st, p.id) < 0 || H.st.phase === 'lobby' || !still(phase)) return;
        act(H.st, p.id, { type: 'emote', e: ch, bot: true });
        hostCommit();
      },
      extra + 500 + Math.random() * 900,
    );
  };

  // Revanche und Tipps zuerst: Ein Duell-Spruch geht vor dem üblichen Spott
  fresh.forEach((e) => {
    switch (e.k) {
      case 'rematch': {
        if (bot(e.p)) break;
        const vs = realBot(e.to);
        if (vs) say(vs, 'rematchAccept', 0.8, 0, true);
        else if (e.to) say(anyBot(), 'rematchHype', 0.35, 0, true);
        break;
      }
      case 'rematchend': {
        const winnerId = e.res === 'won' ? e.p : e.res === 'lost' ? e.to : null;
        const loserId = e.res === 'won' ? e.to : e.res === 'lost' ? e.p : null;
        if (winnerId && realBot(winnerId)) say(realBot(winnerId), 'rematchWin', 0.7, endWait, true);
        else if (loserId === e.p && e.p && !bot(e.p)) {
          say(anyBot(), 'mockRematchLost', 0.5, endWait, true);
          emo(anyBot(), '😂', 0.3, endWait);
        }
        break;
      }
      case 'shbet':
        // Nur der erste Tipp auf ein Ziel bekommt einen Spruch
        if (bot(e.p) && shBetsOn(st, e.on)[0]?.n === e.n) say(bot(e.p), 'betOn', 0.4);
        break;
      case 'shend':
      case 'dkend':
        Object.keys(e.hits ?? {}).forEach((id) => emo(realBot(id), '👏', 0.5, endWait));
        break;
    }
  });

  // Sticheleien und Reaktionen auf Shithead-Ereignisse
  fresh.forEach((e) => {
    switch (e.k) {
      case 'shbomb':
        if (bot(e.p)) {
          say(bot(e.p), 'bomb', 0.7);
          emo(bot(e.p), '🔥', 0.35);
        }
        break;
      case 'shthrow':
        // Macht der Wurf die Vier voll, kommt der Bomben-Spruch statt des 4er-Spruchs
        if (fresh.some((x) => x.k === 'shburn' && x.p === e.p && x.four && x.n > e.n)) {
          if (bot(e.p)) say(bot(e.p), 'bomb', 0.7);
        } else say(bot(e.p), 'throw4', 0.35);
        break;
      case 'shblindfail':
        if (!bot(e.p)) say(anyBot(), 'mockBlindFail', 0.3);
        break;
      case 'shpickup':
        if (!bot(e.p) && num(e.cnt) >= 6) {
          say(anyBot(), 'mockPickup', 0.35);
          emo(anyBot(), '😂', 0.3);
        }
        if (!bot(e.p) && num(e.cnt) >= 8) {
          toss(tossBot(), 'tomato', e.p, 0.2);
          snd(tossBot(), 'ooh', 0.25);
        }
        break;
      case 'shend':
        if (e.p && !bot(e.p)) {
          say(anyBot(), 'mockShithead', 0.8, endWait);
          emo(anyBot(), '💩', 0.3, endWait);
          toss(tossBot(), 'poo', e.p, 0.5);
          snd(tossBot(), 'sad', 0.4);
        }
        break;
      case 'result': {
        const ids = Object.keys(e.changes ?? {});
        if (ids.length && !ids.some((id) => bot(id))) {
          say(anyBot(), 'mockLoseLife', 0.3);
          emo(anyBot(), '😂', 0.2);
        }
        const out = ids.find((id) => e.changes[id].to === 'out' && !bot(id));
        if (out) {
          toss(tossBot(), 'egg', out, 0.25);
          snd(tossBot(), 'sad', 0.3);
        }
        break;
      }
      case 'winner':
        if (e.p && !bot(e.p)) toss(tossBot(), 'crown', e.p, 0.3);
        break;
      case 'shdone':
        if (e.place === 1 && e.p && !bot(e.p)) toss(tossBot(), 'crown', e.p, 0.3);
        break;
      case 'dkpickup':
        // Nimmt der Mensch zuletzt auf und wird Durak, wartet der Spott auf die Zeremonie
        if (bot(e.p) || dkOver) break;
        if (num(e.cnt) >= 6) {
          say(anyBot(), 'mockDkTake', 0.35);
          emo(anyBot(), '😂', 0.3);
        }
        if (num(e.cnt) >= 10) {
          toss(tossBot(), 'tomato', e.p, 0.2);
          snd(tossBot(), 'ooh', 0.25);
        }
        break;
      case 'dkout':
        if (e.place === 1 && e.p && !bot(e.p)) toss(tossBot(), 'crown', e.p, 0.3);
        break;
      case 'dkend':
        if (e.p && !bot(e.p)) {
          say(anyBot(), 'mockDurak', 0.8, endWait);
          emo(anyBot(), '🤡', 0.3, endWait);
          toss(tossBot(), 'poo', e.p, 0.5);
          snd(tossBot(), 'sad', 0.4);
        }
        break;
      case 'cbround':
        // Kamikaze hat kein Ergebnis für den Cabo-Ruf (ok bleibt null), genauso wie eine Runde ohne Ruf
        if (e.kami && !bot(e.kami)) {
          emo(anyBot(), '😭', 0.45, endWait);
          snd(tossBot(), 'sad', 0.3);
        }
        if (e.caller && e.ok === false && !bot(e.caller)) {
          if (!cbKingTalks) say(anyBot(), 'mockCaboFail', 0.6, endWait);
          emo(anyBot(), '😂', 0.35, endWait);
          toss(tossBot(), 'tomato', e.caller, 0.25);
          snd(tossBot(), 'ooh', 0.2);
        }
        break;
      case 'cbreset':
        // Schiebt eine Kamikaze jemanden genau auf 100, gehört der Spruch der Kamikaze
        if (!cbKingTalks && !cbKami) say(otherBot(e.p), 'mockReset', 0.35, endWait);
        break;
      case 'cbsnap':
        if (!e.ok && !bot(e.p)) emo(anyBot(), '😂', 0.25);
        break;
      case 'cbend':
        if (e.p && !bot(e.p)) {
          emo(anyBot(), '👏', 0.45, endWait);
          toss(tossBot(), 'crown', e.p, 0.35);
          snd(tossBot(), 'clap', 0.3);
        }
        break;
      case 'toss': {
        // Nur Treffer von Menschen auf KIs, so gibt es kein Hin und Her zwischen KIs
        const hit = realBot(e.to);
        if (!hit || bot(e.p)) break;
        if (e.item === 'crown') {
          say(hit, 'crowned', 0.5);
          emo(hit, '👏', 0.4);
        } else say(hit, 'tossBack', 0.3);
        const back = botTossReply(viewFor(st, hit.id), e, Math.random());
        if (back) toss(hit, back.item, back.to, 1);
        break;
      }
    }
  });

  // Sprüche über das eigene Spiel der KI
  fresh.forEach((e) => {
    switch (e.k) {
      case 'join':
        if (e.bot) say(bot(e.p), 'greet', 0.7);
        break;
      case 'knock':
        snd(realBot(e.p), 'roll', 0.2);
        if (bot(e.p)) say(bot(e.p), 'knock', 0.5);
        else {
          const bs = st.players.filter((p) => p.bot && !p.out);
          if (bs.length) say(bs[Math.floor(Math.random() * bs.length)], 'otherKnock', 0.3);
        }
        break;
      case 'swapAll':
        say(bot(e.p), 'swapAll', 0.2);
        break;
      case 'result': {
        if (e.reason === 'schnautz') say(bot(e.by), 'schnautz', 0.8);
        else if (e.reason === 'feuer') say(bot(e.by), 'feuer', 0.85);
        if (e.reason === 'schnautz' || e.reason === 'feuer') snd(realBot(e.by), 'horn', 0.3);
        Object.entries(e.changes ?? {}).forEach(([id, c]) => {
          say(bot(id), c.to === 'out' ? 'out' : c.to === 'swim' ? 'swim' : 'loseLife', c.to === 'life' ? 0.35 : 0.7);
        });
        const res = szResult(st.result);
        if (res?.vals && e.reason === 'knock') {
          const max = Math.max(...Object.values(res.vals).map((x) => x.v));
          const top = Object.keys(res.vals).filter((id) => res.vals[id].v === max);
          if (top.length === 1) say(bot(top[0]), 'roundWin', 0.3);
        }
        break;
      }
      case 'winner':
        say(bot(e.p), 'winGame', 0.85);
        snd(realBot(e.p), 'horn', 0.4);
        break;
      case 'shburn':
        if (!e.four) say(bot(e.p), 'shBurn', 0.3);
        else snd(realBot(e.p), 'horn', 0.25);
        break;
      case 'shpickup':
        if (num(e.cnt) >= 6) say(bot(e.p), 'shPickup', 0.45);
        break;
      case 'shdone':
        say(bot(e.p), 'shFinish', 0.5);
        if (e.place === 1) snd(realBot(e.p), 'horn', 0.3);
        break;
      case 'shend':
        say(bot(e.p), 'shShithead', 0.8, endWait);
        break;
      case 'dkattack': {
        if (e.lead || dkOver || !bot(e.p)) break;
        const taker = dkTakerAt(st.log, e.n);
        if (!taker) break;
        say(bot(e.p), 'dkThrowIn', bot(taker) ? 0.2 : 0.35);
        if (!bot(taker)) emo(bot(e.p), '🫵', 0.15);
        break;
      }
      case 'dkdefend':
        if (!dkOver && bot(e.p) && dkHighTrump(e.d, st.dk?.trump)) say(bot(e.p), 'dkTrump', 0.25);
        break;
      case 'dktransfer':
        say(bot(e.p), 'dkTransfer', 0.3);
        break;
      case 'dkbito':
        if (!dkOver) say(bot(e.p), 'dkBito', num(e.cnt) >= 6 ? 0.35 : 0.15);
        break;
      case 'dkpickup':
        if (!dkOver) say(bot(e.p), 'dkTake', num(e.cnt) >= 6 ? 0.45 : 0.2);
        break;
      case 'dkout':
        if (dkOver) break;
        say(bot(e.p), e.place === 1 ? 'dkWin' : 'dkOut', e.place === 1 ? 0.7 : 0.45);
        if (e.place === 1) snd(realBot(e.p), 'horn', 0.3);
        break;
      case 'dkend':
        say(bot(e.p), 'dkDurak', 0.8, endWait);
        emo(bot(e.p), '😭', 0.25, endWait);
        break;
      case 'cbcabo':
        snd(realBot(e.p), 'roll', 0.2);
        say(bot(e.p), 'cbCabo', 0.7);
        break;
      // Endet mit diesem Zug die Partie und wird eine KI König, gehört der Chat ihrem Spruch
      case 'cbpeek':
        // Die KI vergisst mit Absicht und muss ab und zu zugeben, dass sie nachschauen musste
        if (!cbKingTalks) say(bot(e.p), 'cbForgot', 0.1);
        break;
      case 'cbspy':
        if (!cbKingTalks) say(bot(e.p), 'cbSpy', 0.2);
        break;
      case 'cbblind':
        if (!bot(e.p)) break;
        if (!cbKingTalks) say(bot(e.p), 'cbBlind', 0.3);
        if (!bot(e.to)) emo(bot(e.p), '🫵', 0.2);
        break;
      case 'cbsnap':
        say(bot(e.p), e.ok ? 'cbSnap' : 'cbSnapFail', e.ok ? 0.4 : 0.6);
        break;
      case 'cbround':
        // Kamikaze geht vor, dann der eigene Cabo-Ruf
        if (e.kami) {
          say(bot(e.kami), 'cbKamikaze', 0.85, endWait);
          snd(realBot(e.kami), 'horn', 0.3);
        } else if (!cbKingTalks && e.caller && e.ok === false) say(bot(e.caller), 'cbCaboFail', 0.7, endWait);
        else if (!cbKingTalks && e.caller && e.ok) say(bot(e.caller), 'roundWin', 0.3, endWait);
        break;
      case 'cbend':
        say(bot(e.p), 'cbKing', 0.8, endWait);
        snd(realBot(e.p), 'horn', 0.4);
        break;
    }
  });
}

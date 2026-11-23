/*
 * KI am Tisch: läuft nur im Browser des Gastgebers. Die KI entscheidet auf Basis ihrer eigenen
 * Ansicht (kein Schummeln) und spielt mit menschlich wirkenden Pausen. Außerdem gelegentliche
 * Chat-Sprüche und Emoji-Reaktionen.
 */
import { act } from '../game/actions';
import { handValue } from '../game/schnautz';
import { shAuto } from '../game/shithead';
import { pIdx } from '../game/state';
import type { Action, Player, State } from '../game/types';
import { viewFor } from '../game/view';
import { H, hostCommit } from './host';
import { App } from '../ui/app';
import { hashStr, num, type Timer } from '../ui/dom';
import { ANN } from '../ui/feedback';
import { seqLeft } from '../ui/shithead/sequence';
import { botDecide } from '../bots/index';
import { BOT_LINES } from '../bots/lines';

/** Wie oft die KI eine Gelegenheit außer der Reihe bemerkt (in Prozent). */
const NOTICE_THROW = 88;
const NOTICE_BOMB = 80;
const CHAT_PAUSE_MS = 7000;
const RECENT_LINES = 12;

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
  /** Menschen, die beim 4er-Fenster zu langsam waren (nur beim Gastgeber bekannt). */
  slow: null as string[] | null,
  slowOk: false,
};

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
  BOTS.scanN = -1;
  BOTS.recent = [];
}

/** Reaktionen außer der Reihe (4er reinwerfen, Bombe einwerfen) laufen für jede KI parallel. */
function botReact(st: State): void {
  st.players.forEach((p) => {
    if (!p.bot || p.out) return;
    const a = botDecide(viewFor(st, p.id), undefined, 'normal');
    if (!isReaction(a)) {
      const old = BOTS.react[p.id];
      if (old?.t) clearTimeout(old.t);
      delete BOTS.react[p.id];
      return;
    }
    const key = `${a.type}|${st.games}|${a.type === 'shthrow' ? st.sh?.win?.id : (st.last?.n ?? 0)}`;
    const old = BOTS.react[p.id];
    if (old?.key === key) return;
    if (old?.t) clearTimeout(old.t);
    const R: Reaction = { key, t: null };
    BOTS.react[p.id] = R;
    // Manchmal bemerkt die KI die Gelegenheit nicht, fest pro Gelegenheit
    if (hashStr(p.id + key) % 100 >= (a.type === 'shthrow' ? NOTICE_THROW : NOTICE_BOMB)) return;
    const d = a.type === 'shthrow' ? 900 + Math.random() * 3300 : 700 + Math.random() * 1600 + seqLeft();
    R.t = setTimeout(() => {
      R.t = null;
      if (App.role !== 'host' || !H.st) return;
      const a2 = botDecide(viewFor(H.st, p.id), undefined, 'normal');
      if (a2?.type !== a.type) return;
      if (!act(H.st, p.id, a2)) hostCommit();
    }, d);
  });
}

/** Wie lange "denkt" die KI über diesen Zug nach? */
function thinkTime(st: State, who: Player, a: Action): number {
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
    default:
      d = a.type === 'pass' && passIsObvious(st, who.id) ? 800 + r * 600 : 1200 + r * 1400;
  }
  if (ANN.busy) d += 700;
  // Bei Shithead erst zuschauen, bis die laufende Animation durch ist
  if (st.game === 'shithead') d += seqLeft();
  return d;
}

/** Der nächste reguläre Zug einer KI, mit Pause, damit es menschlich wirkt. */
export function botTick(): void {
  const st = H.st;
  if (App.role !== 'host' || !st) return;
  if (st.phase === 'lobby') {
    clearTurnTimer();
    return;
  }
  if (st.game === 'shithead' && st.phase === 'play') botReact(st);
  else clearReactions();
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
      const a = botDecide(viewFor(s, botId), undefined, 'normal');
      if (!a || isReaction(a)) {
        botTick();
        return;
      }
      const e = act(s, botId, a);
      if (e) {
        // Sollte nie passieren, aber das Spiel darf nicht hängen
        console.warn('KI-Zug abgelehnt', e, a);
        if (s.game === 'shithead') {
          if (s.phase === 'swap') act(s, botId, { type: 'shready' });
          else shAuto(s, botId);
        } else act(s, botId, s.phase === 'choose' ? { type: 'keep' } : { type: 'pass' });
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
  const say = (p: Player | null, cat: string, prob: number) => {
    if (!p || Math.random() > prob || Date.now() < BOTS.chatAt) return;
    const arr = BOT_LINES[cat];
    if (!arr?.length) return;
    BOTS.chatAt = Date.now() + CHAT_PAUSE_MS;
    const unused = arr.filter((x) => !BOTS.recent.includes(x));
    const pool = unused.length ? unused : arr;
    const text = pool[Math.floor(Math.random() * pool.length)];
    BOTS.recent.push(text);
    if (BOTS.recent.length > RECENT_LINES) BOTS.recent.shift();
    setTimeout(
      () => {
        if (!H.st || pIdx(H.st, p.id) < 0) return;
        act(H.st, p.id, { type: 'chat', text, bot: true });
        hostCommit();
      },
      900 + Math.random() * 1200,
    );
  };
  const emo = (p: Player | null, ch: string, prob: number) => {
    if (!p || Math.random() > prob) return;
    setTimeout(
      () => {
        if (!H.st || pIdx(H.st, p.id) < 0 || H.st.phase === 'lobby') return;
        act(H.st, p.id, { type: 'emote', e: ch, bot: true });
        hostCommit();
      },
      500 + Math.random() * 900,
    );
  };

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
        say(bot(e.p), 'throw4', 0.35);
        break;
      case 'shwinend':
        // Nur wenn genau ein Mensch am Tisch sitzt, sonst würde der Spruch verraten, wer eine 4 hat
        if (BOTS.slowOk && BOTS.slow?.length) say(anyBot(), 'slow4', 0.6);
        BOTS.slow = null;
        break;
      case 'shblindfail':
        if (!bot(e.p)) say(anyBot(), 'mockBlindFail', 0.3);
        break;
      case 'shpickup':
        if (!bot(e.p) && num(e.cnt) >= 6) {
          say(anyBot(), 'mockPickup', 0.35);
          emo(anyBot(), '😂', 0.3);
        }
        break;
      case 'shend':
        if (e.p && !bot(e.p)) {
          say(anyBot(), 'mockShithead', 0.8);
          emo(anyBot(), '💩', 0.6);
        }
        break;
      case 'result': {
        const ids = Object.keys(e.changes ?? {});
        if (ids.length && !ids.some((id) => bot(id))) {
          say(anyBot(), 'mockLoseLife', 0.3);
          emo(anyBot(), '😂', 0.2);
        }
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
        Object.entries(e.changes ?? {}).forEach(([id, c]) => {
          say(bot(id), c.to === 'out' ? 'out' : c.to === 'swim' ? 'swim' : 'loseLife', c.to === 'life' ? 0.35 : 0.7);
        });
        const res = st.result && st.result.reason !== 'shithead' ? st.result : null;
        if (res?.vals && e.reason === 'knock') {
          const max = Math.max(...Object.values(res.vals).map((x) => x.v));
          const top = Object.keys(res.vals).filter((id) => res.vals[id].v === max);
          if (top.length === 1) say(bot(top[0]), 'roundWin', 0.3);
        }
        break;
      }
      case 'winner':
        say(bot(e.p), 'winGame', 0.85);
        break;
      case 'shburn':
        if (!e.four) say(bot(e.p), 'shBurn', 0.3);
        break;
      case 'shpickup':
        if (num(e.cnt) >= 6) say(bot(e.p), 'shPickup', 0.45);
        break;
      case 'shdone':
        say(bot(e.p), 'shFinish', 0.5);
        break;
      case 'shend':
        say(bot(e.p), 'shShithead', 0.8);
        break;
    }
  });
}

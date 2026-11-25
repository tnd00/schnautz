/* Plätze am Tisch: beim Start mit KI auffüllen, Gäste setzen und KI-Plätze an Menschen übergeben. */
import { MIN_SEATS } from './constants';
import { addBot, addLog, addPlayer, MAX_SEATS_ALL, pIdx, seatLimit, uniqueName } from './state';
import type { ActResult, GameKind, Player, Rng, Rules, State } from './types';
import type { Reject } from './reject';
import { forgetRematch } from './rematch';
import { betPart } from './bets';

export type SeatResult = { id: string } | { err: Reject | string };

/**
 * Lobby: Platzzahl in gültige Grenzen bringen und überzählige KIs abräumen. Freie Plätze bleiben in der Lobby frei,
 * mit KI gefüllt wird erst beim Start (fillForStart). Weniger Plätze als Menschen am Tisch gibt es nicht.
 */
export function syncSeats(st: State): void {
  if (st.phase !== 'lobby') return;
  const humans = st.players.filter((p) => !p.bot).length;
  // Die Einstellung gilt für beide Spiele, gekürzt wird erst beim Anwenden (seatLimit)
  st.rules.seats = Math.max(MIN_SEATS, humans, Math.min(st.rules.seats || MIN_SEATS, MAX_SEATS_ALL));
  const limit = Math.max(humans, seatLimit(st));
  while (st.players.length > limit) {
    const bi = st.players.map((p) => !!p.bot).lastIndexOf(true);
    if (bi < 0) break;
    const [b] = st.players.splice(bi, 1);
    addLog(st, { k: 'leave', p: b.id, name: b.name });
  }
}

/** Was der Start aus der Lobby macht, für start() und die Texte in der Lobby. */
export type StartPlan = {
  /** Spielen mit: Gastgeber, alle online und die KIs. Wer offline sitzt, fällt beim Start weg */
  seated: number;
  /** Davon KIs */
  bots: number;
  /** So viele KIs kommen beim Start dazu (nur mit Auffüllen) */
  add: number;
  /** So viele Leute spielen die Partie */
  n: number;
  /** So viele Plätze bleiben beim Start leer */
  empty: number;
};

type SeatsOf = { players: readonly Player[]; rules: Rules; game: GameKind; host: string };

/**
 * Wer beim Start mitspielt und wie viele KIs dazukommen. Gilt für State und View gleich. Mit Auffüllen kommen KIs bis
 * zur Platzzahl, nie mehr, als das Spiel erlaubt (seatLimit).
 */
export function startPlan(st: SeatsOf): StartPlan {
  const playing = st.players.filter((p) => p.id === st.host || p.online);
  const seated = playing.length;
  const limit = seatLimit(st);
  const add = st.rules.fill ? Math.max(0, limit - seated) : 0;
  const n = seated + add;
  return { seated, bots: playing.filter((p) => p.bot).length, add, n, empty: Math.max(0, limit - n) };
}

/**
 * Start mit Auffüllen: Wer offline sitzt, spielt ohnehin nicht mit und räumt den Platz (wie in den Startfunktionen,
 * ohne Logeintrag), dann kommen KIs auf alle freien Plätze. Ohne Auffüllen bleibt alles, wie es ist.
 */
export function fillForStart(st: State, rng?: Rng): ActResult {
  const plan = startPlan(st);
  if (st.phase !== 'lobby' || !plan.add) return null;
  st.players = st.players.filter((p) => p.id === st.host || p.online);
  for (let i = 0; i < plan.add; i++) {
    const err = addBot(st, rng);
    if (err) return err;
  }
  return null;
}

/** Welchen KI-Platz bekommt jemand? Gleicher Name zuerst, dann Plätze, die noch im Spiel sind, sonst der letzte. */
function botSeatFor(st: State, name: string): Player | null {
  const bots = st.players.filter((p) => p.bot);
  if (!bots.length) return null;
  const lower = name.toLowerCase();
  const same = bots.find((p) => p.name.toLowerCase() === lower);
  if (same) return same;
  const fin = betPart(st)?.finished ?? [];
  const playing = bots.filter((p) => !p.out && !fin.includes(p.id));
  return (playing.length ? playing : bots)[(playing.length ? playing : bots).length - 1];
}

/**
 * Ein Mensch übernimmt einen KI-Platz mit allem, was dazugehört: Karten, Platz in der Reihenfolge, Leben.
 * Er heißt dann wie er selbst und startet in der Bestenliste bei null.
 */
export function takeSeat(st: State, seatId: string, name: string): void {
  const p = st.players[pIdx(st, seatId)];
  if (!p) return;
  const from = p.name;
  delete p.bot;
  delete p.left;
  p.name = uniqueName(st, name, p.id);
  p.online = true;
  delete p.offSince;
  delete p.gone;
  p.stats = {};
  p.wins = 0;
  p.shc = 0;
  p.dkc = 0;
  // Krone oder Shithead-Titel der KI gehen nicht auf den Menschen über
  Object.values(st.reigns ?? {}).forEach((rg) => {
    if (rg.win === p.id) rg.win = null;
    if (rg.lose === p.id) rg.lose = null;
  });
  // Ebenso Forderung, Duell und Tipp der KI
  forgetRematch(st, p.id);
  const bets = betPart(st)?.bets;
  if (bets) delete bets[p.id];
  // Tauschrunde und Ansehen: Wer übernimmt, entscheidet selbst und meldet sich selbst bereit. Was die KI bei Cabo
  // gerade gesehen hat, sieht der Mensch nicht, im Ansehen sieht er selbst zwei an
  if (st.phase === 'swap' || st.phase === 'peek') p.ready = false;
  if (st.cb) delete st.cb.reveal[p.id];
  addLog(st, { k: 'takeover', p: p.id, name: p.name, from });
}

/** KI-Platz, den eine Person mit diesem Namen verlassen hat. */
export const isOwnLeftSeat = (p: Player, name: string): boolean =>
  !!p.bot && !!p.left && p.name.toLowerCase() === name.toLowerCase();

/** Wer gegangen war, holt sich den eigenen Platz von der KI zurück. Name und Bilanz bleiben. */
export function reclaimSeat(st: State, seatId: string): void {
  const p = st.players[pIdx(st, seatId)];
  if (!p?.bot) return;
  delete p.bot;
  delete p.left;
  p.online = true;
  delete p.offSince;
  // Die KI kann in der Tauschrunde schon bereit gewesen sein, tauschen soll die Person selbst. Beim Cabo-Ansehen
  // nicht, denn dort hätte sie ihre zwei Karten schon gesehen
  if (st.phase === 'swap') p.ready = false;
  addLog(st, { k: 'back', p: p.id });
}

/**
 * Ein Mensch mit diesem Namen, der gerade offline am Tisch sitzt: Das ist die Person selbst, etwa mit neuem Tab oder
 * Browser. Der Gastgeber zählt nicht, KI-Plätze holt `reclaimSeat` zurück.
 */
function ghostSeatFor(st: State, name: string): Player | null {
  const lower = name.toLowerCase();
  return st.players.find((p) => !p.bot && !p.online && p.id !== st.host && p.name.toLowerCase() === lower) ?? null;
}

/**
 * Platz für einen Gast: Sitzt jemand mit gleichem Namen gerade offline am Tisch, ist das sein Platz. Sonst in der
 * Lobby ein freier Platz, sonst ein KI-Platz. Läuft schon eine Partie, geht nur ein KI-Platz, den der Gast dann
 * mitten im Spiel übernimmt.
 */
export function seatGuest(st: State, pid: string, name: string): SeatResult {
  const ghost = ghostSeatFor(st, name);
  if (ghost) {
    ghost.online = true;
    delete ghost.offSince;
    delete ghost.gone;
    return { id: ghost.id };
  }
  if (st.phase === 'lobby' && st.players.length < seatLimit(st)) {
    const err = addPlayer(st, pid, name);
    return err ? { err } : { id: pid };
  }
  const seat = botSeatFor(st, name);
  if (seat) {
    // Gleicher Name auf dem Platz, den ein Mensch verlassen hat: Das ist die Person selbst
    if (isOwnLeftSeat(seat, name)) reclaimSeat(st, seat.id);
    else takeSeat(st, seat.id, name);
    return { id: seat.id };
  }
  return {
    err: st.phase === 'lobby' ? 'Der Tisch ist voll.' : 'Die Partie läuft schon und alle Plätze sind besetzt.',
  };
}

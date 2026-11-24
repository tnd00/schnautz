/*
 * Dev-Menü, Zeitraffer: Auf einer Kopie des Spielstands spielt die KI für alle Plätze, bis kurz vor den gewünschten
 * Moment. Der letzte Zug wird nur gemerkt, damit der Host ihn danach echt ausführt und alle Animationen laufen.
 * Ohne DOM und Netz, damit Unit-Tests es prüfen können.
 */
import { botDecide } from '../bots/index';
import { act } from '../game/actions';
import { betPart, hasBets, shCanBet } from '../game/bets';
import { addLog } from '../game/state';
import type { Action, Rng, State } from '../game/types';
import { viewFor } from '../game/view';
import { unreachable } from '../game/games';

/** end: Partie vorbei · round: Schnautz-Runde vorbei · done: ich bin fertig und darf tippen */
export type SpoolGoal = 'end' | 'round' | 'done';
/** lose: ich werde Shithead oder gewinne bei Schnautz nicht · win: ich werde Erste oder gewinne */
export type SpoolWant = 'any' | 'lose' | 'win';

export interface Move {
  pid: string;
  a: Action;
}

export interface Spooled {
  st: State;
  /** Dieser Zug führt zum Ziel, der Host spielt ihn selbst. Bei `done` ist das Ziel schon erreicht. */
  last: Move | null;
  seed: number;
}

const MAX_MOVES = 20000;
const COSMETIC = new Set(['chat', 'emote', 'toss', 'sound']);

/** Reproduzierbarer Zufall, damit der zweite Durchlauf genau wie der erste spielt. */
function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ein Zug wie am Tisch: Partie starten, 4er-Sperre lösen oder der erste Platz, dessen KI etwas tun darf. */
function step(st: State, rng: Rng): Move | null {
  if (st.phase === 'lobby') {
    const m: Move = { pid: st.host, a: { type: 'start' } };
    return act(st, m.pid, m.a, rng) ? null : m;
  }
  if (st.game === 'shithead' && st.sh?.win?.lock) {
    const m: Move = { pid: st.host, a: { type: 'shunlock', id: st.sh.win.id } };
    return act(st, m.pid, m.a, rng) ? null : m;
  }
  for (const p of st.players) {
    const a = botDecide(viewFor(st, p.id), rng, 'normal');
    if (!a || COSMETIC.has(a.type)) continue;
    if (!act(st, p.id, a, rng)) return { pid: p.id, a };
  }
  return null;
}

/** Ist das Ziel mit diesem Zug erreicht? `ph` ist die Phase davor. */
function reached(goal: SpoolGoal, ph: State['phase'], st: State, me: string): boolean {
  if (goal === 'end') return ph !== 'over' && st.phase === 'over';
  if (goal === 'round') return (ph === 'choose' || ph === 'play') && (st.phase === 'end' || st.phase === 'over');
  return shCanBet(st, me);
}

/** Passt der Ausgang zum Wunsch? Wird nach dem Zielzug geprüft. */
function wanted(want: SpoolWant, st: State, me: string): boolean {
  if (want === 'any') return true;
  switch (st.game) {
    case 'shithead': {
      const r = st.result?.reason === 'shithead' ? st.result : null;
      return want === 'lose' ? r?.shithead === me : st.sh?.finished[0] === me;
    }
    case 'durak': {
      const r = st.result?.reason === 'durak' ? st.result : null;
      return want === 'lose' ? r?.durak === me : st.dk?.finished[0] === me;
    }
    case 'schnautz':
    case 'cabo':
      return want === 'win' ? st.winner === me : st.winner !== me;
    default:
      return unreachable(st.game);
  }
}

/** Spielt bis zum Ziel. Gibt die Zahl der Züge davor zurück oder -1, wenn das Ziel nicht kam oder nicht passt. */
function run(st: State, rng: Rng, goal: SpoolGoal, want: SpoolWant, me: string): number {
  for (let k = 0; k < MAX_MOVES; k++) {
    const ph = st.phase;
    if (!step(st, rng)) return -1;
    if (reached(goal, ph, st, me)) return wanted(want, st, me) ? k : -1;
    // Ziel verpasst: Für done ist die Partie zu Ende gegangen, für round und end läuft sie weiter
    if (goal === 'done' && ph !== 'over' && st.phase === 'over') return -1;
  }
  return -1;
}

/** Geht dieses Ziel an diesem Tisch überhaupt? Sonst die Erklärung. */
export function spoolCheck(st: State, goal: SpoolGoal, me: string): string | null {
  if (goal === 'round' && st.game !== 'schnautz' && st.game !== 'cabo') return 'Runden gibt es nur bei Schnautz und Cabo.';
  if (goal === 'done' && !hasBets(st.game)) return 'Tippen gibt es nur bei Shithead und Durak.';
  const active = st.phase === 'lobby' || st.phase === 'over' ? st.players : st.players.filter((p) => !p.out);
  if (active.length < 2) return 'Dafür braucht es mindestens zwei Plätze.';
  if (goal === 'done' && active.length < 3) return 'Tippen geht erst ab drei Plätzen.';
  if (goal === 'done' && st.phase === 'play' && betPart(st)?.finished.includes(me)) return 'Du bist schon fertig.';
  if (!st.players.some((p) => p.id === me)) return 'Du sitzt nicht am Tisch.';
  return null;
}

/**
 * Sucht eine Partie, die wie gewünscht ausgeht, und liefert den Stand direkt davor. Vorher `spoolCheck` fragen.
 * Null heißt: in der Zeit nichts Passendes gefunden. Der Verlauf behält nur, was vorher da war, plus einen Hinweis.
 * Sonst würde jeder Gast alles nachspielen.
 */
export function spool(
  st0: State,
  me: string,
  goal: SpoolGoal,
  want: SpoolWant,
  seed: number,
  budgetMs = 2500,
): Spooled | null {
  if (spoolCheck(st0, goal, me)) return null;
  const t0 = Date.now();
  for (let i = 0; i < 80 && Date.now() - t0 < budgetMs; i++) {
    const s = seed + i * 7919;
    const k = run(structuredClone(st0), seeded(s), goal, want, me);
    if (k < 0) continue;
    // Zweiter Durchlauf mit gleichem Zufall bis direkt vor den Zielzug
    const st = structuredClone(st0);
    const rng = seeded(s);
    let ok = true;
    for (let j = 0; j < k && ok; j++) ok = !!step(st, rng);
    if (!ok) continue;
    if (goal === 'done') {
      if (!step(st, rng) || !shCanBet(st, me)) continue;
      return { st: compact(st0, st, me), last: null, seed: s };
    }
    const probe = structuredClone(st);
    const ph = probe.phase;
    const last = step(probe, rng);
    if (!last || !reached(goal, ph, probe, me) || !wanted(want, probe, me)) continue;
    return { st: compact(st0, st, me), last, seed: s };
  }
  return null;
}

/** Verlauf von vorher, die Zählung läuft weiter. Der Hinweis erklärt allen, warum der Tisch springt. */
function compact(st0: State, st: State, me: string): State {
  st.log = structuredClone(st0.log);
  addLog(st, { k: 'chat', p: me, text: '🛠 Zeitraffer aus dem Dev-Menü' });
  return st;
}

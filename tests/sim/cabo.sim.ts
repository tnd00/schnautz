/*
 * Kalibrierung der Cabo-KI (npm run sim): Wie enden Runden mit KIs, je nach Zahl der Plätze? Gewünscht ist ein
 * Tisch, an dem regelmäßig Cabo gerufen wird und der Ruf nicht immer klappt, statt dass fast jede Runde mit leerem
 * Stapel endet. Dazu: stärkere Stufen haben am Ende weniger Punkte.
 */
import { describe, expect, it } from 'vitest';
import type { BotLevel } from '../../src/bots/config';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { addPlayer, newState } from '../../src/game/state';
import type { Rng, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { rngF } from '../unit/helpers';

const N = Number(process.env.SIM_GAMES ?? 60);

interface Stats {
  rounds: number;
  cabo: number;
  ok: number;
  kami: number;
  games: number;
  /** Summe der Rundenpunkte über alle Plätze und wie viele Plätze dabei gezählt wurden */
  sum: number;
  seats: number;
  points: number[];
}

const fresh = (n: number): Stats => ({
  rounds: 0,
  cabo: 0,
  ok: 0,
  kami: 0,
  games: 0,
  sum: 0,
  seats: 0,
  points: Array(n).fill(0),
});

function partie(levels: BotLevel[], seed: number, s: Stats): void {
  const rng: Rng = rngF(seed);
  const st: State = newState('p0', 'P0');
  levels.slice(1).forEach((_, i) => addPlayer(st, `p${i + 1}`, `P${i + 1}`));
  act(st, 'p0', { type: 'game', game: 'cabo' }, rng);
  act(st, 'p0', { type: 'rules', rules: { seats: Math.max(4, levels.length) } }, rng);
  st.players.forEach((p) => (p.bot = true));
  act(st, 'p0', { type: 'start' }, rng);
  for (let guard = 0; st.phase !== 'over' && guard < 20_000; guard++) {
    if (st.phase === 'end') {
      st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
      continue;
    }
    let moved = false;
    for (let i = 0; i < levels.length; i++) {
      const id = `p${i}`;
      const a = botDecide(viewFor(st, id), rng, levels[i]);
      if (!a || a.type === 'ready') continue;
      const before = st.phase;
      const err = act(st, id, a, rng);
      if (err) throw new Error(`KI-Zug ungültig: ${JSON.stringify(a)} (${err})`);
      // Runde vorbei: direkt am Ergebnis zählen, der Verlauf wird gekürzt
      if (before === 'play' && st.phase !== 'play' && st.result?.reason === 'cabo') {
        s.rounds++;
        if (st.result.caller) s.cabo++;
        if (st.result.ok) s.ok++;
        if (st.result.kami) s.kami++;
        st.players.forEach((p) => (s.sum += st.result?.reason === 'cabo' ? (st.result.scores[p.id] ?? 0) : 0));
        s.seats += st.players.length;
      }
      moved = true;
      break;
    }
    if (!moved) throw new Error(`Kein Zug möglich in Phase ${st.phase}`);
  }
  s.games++;
  levels.forEach((_, i) => (s.points[i] += st.players.find((p) => p.id === `p${i}`)?.cbp ?? 0));
}

const pct = (a: number, b: number): string => `${b ? Math.round((100 * a) / b) : 0} %`;

describe('Cabo-Kalibrierung', () => {
  it('ruft an jedem Tisch regelmäßig Cabo, nicht immer erfolgreich', () => {
    const lines: string[] = [];
    for (let n = 2; n <= 8; n++) {
      const s = fresh(n);
      for (let g = 0; g < N; g++) partie(Array(n).fill('normal'), 1000 * n + g, s);
      lines.push(
        `${n} Plätze: ${(s.rounds / s.games).toFixed(1)} Runden je Partie, ${(s.sum / s.seats).toFixed(1)} Punkte je Runde, Cabo in ${pct(s.cabo, s.rounds)} der Runden, davon geklappt ${pct(s.ok, s.cabo)}, Kamikaze ${s.kami}`,
      );
      expect(s.cabo / s.rounds).toBeGreaterThan(0.25);
      expect(s.ok / Math.max(1, s.cabo)).toBeLessThan(0.95);
    }
    console.log(`Cabo mit normalen KIs\n  ${lines.join('\n  ')}`);
  });

  it('stärkere Stufen haben am Ende weniger Punkte', () => {
    const levels: BotLevel[] = ['strong', 'normal', 'weak'];
    const s = fresh(3);
    for (let g = 0; g < N * 2; g++) {
      // Plätze rotieren, damit der Startvorteil nicht ins Ergebnis fällt
      const rot = g % 3;
      const seats = levels.map((_, i) => levels[(i + rot) % 3]);
      const t = fresh(3);
      partie(seats, 50_000 + g, t);
      t.points.forEach((p, i) => (s.points[(i + rot) % 3] += p));
    }
    const avg = s.points.map((p) => p / (N * 2));
    console.log(`Cabo Punkte am Ende im Schnitt\n  ${levels.map((l, i) => `${l} ${avg[i].toFixed(1)}`).join(', ')}`);
    expect(avg[0]).toBeLessThan(avg[2]);
  });
});

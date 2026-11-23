/*
 * Kalibrierung der KI: ganze Partien zwischen den KI-Stufen.
 * Läuft nicht mit den normalen Tests, sondern mit `npm run sim` (dauert etwas).
 * Die Sitzplätze rotieren, damit der Vorteil des ersten Platzes nicht ins Ergebnis fällt.
 */
import { describe, expect, it } from 'vitest';
import { BOT_CFG, type BotLevel } from '../../src/bots/config';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { addPlayer, newState } from '../../src/game/state';
import type { GameKind, Rng } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { rngF } from '../unit/helpers';

const N = Number(process.env.SIM_GAMES ?? 600);

/** Spielt eine Partie und liefert den Platz des Siegers (Schnautz) oder des Shitheads. */
function partie(levels: BotLevel[], seed: number, game: GameKind): number | null {
  const rng: Rng = rngF(seed);
  const st = newState('p0', 'P0');
  levels.slice(1).forEach((_, i) => addPlayer(st, `p${i + 1}`, `P${i + 1}`));
  if (game !== 'schnautz') act(st, 'p0', { type: 'game', game }, rng);
  act(st, 'p0', { type: 'start' }, rng);
  for (let guard = 0; st.phase !== 'over' && guard < 4000; guard++) {
    let moved = false;
    for (let i = 0; i < levels.length; i++) {
      const id = `p${i}`;
      const a = botDecide(viewFor(st, id), rng, levels[i]);
      if (!a) continue;
      const err = act(st, id, a, rng);
      if (err && a.type !== 'ready') throw new Error(`KI-Zug ungültig: ${JSON.stringify(a)} (${err})`);
      if (!err) moved = true;
      if (a.type !== 'ready') break;
    }
    if (!moved && st.sh?.win) {
      act(st, 'p0', { type: 'shwinend', id: st.sh.win.id }, rng);
      moved = true;
    }
    if (!moved) throw new Error(`Kein Zug möglich in Phase ${st.phase}`);
  }
  if (st.phase !== 'over') return null;
  const id = game === 'shithead' ? st.sh?.shithead : st.winner;
  return id ? Number(id.slice(1)) : null;
}

/** Quote in Prozent pro Stufe (Sieg bei Schnautz, Shithead bei Shithead). */
function match(levels: BotLevel[], game: GameKind = 'schnautz', seed0 = 1): number[] {
  const hits = levels.map(() => 0);
  for (let g = 0; g < N; g++) {
    const rot = g % levels.length;
    const seats = levels.map((_, i) => levels[(i + rot) % levels.length]);
    const w = partie(seats, seed0 * 100_000 + g, game);
    if (w != null) hits[(w + rot) % levels.length]++;
  }
  return hits.map((x) => (100 * x) / N);
}

const fmt = (levels: BotLevel[], q: number[]): string => levels.map((l, i) => `${l} ${q[i].toFixed(1)} %`).join(', ');

describe('KI-Kalibrierung', () => {
  it('Schnautz: stärkere Stufen gewinnen öfter', () => {
    const a = match(['normal', 'weak']);
    const b = match(['strong', 'normal']);
    const c = match(['strong', 'weak']);
    console.log(
      'Schnautz Siegquote\n ',
      fmt(['normal', 'weak'], a),
      '\n ',
      fmt(['strong', 'normal'], b),
      '\n ',
      fmt(['strong', 'weak'], c),
    );
    expect(a[0]).toBeGreaterThan(a[1]);
    expect(b[0]).toBeGreaterThan(b[1]);
    expect(c[0]).toBeGreaterThan(c[1]);
  });

  it('Schnautz zu dritt endet immer mit einem Sieger', () => {
    const q = match(['normal', 'strong', 'weak'], 'schnautz', 2);
    console.log('Schnautz zu dritt\n ', fmt(['normal', 'strong', 'weak'], q));
    expect(q.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 5);
  });

  it('Shithead: die schwache Stufe wird öfter Shithead', () => {
    const q = match(['normal', 'weak'], 'shithead', 3);
    console.log('Shithead Quote (verloren)\n ', fmt(['normal', 'weak'], q));
    expect(q[1]).toBeGreaterThan(q[0]);
  });

  it('Stufen sind sinnvoll konfiguriert', () => {
    expect(BOT_CFG.weak.mistake).toBeGreaterThan(BOT_CFG.normal.mistake);
    expect(BOT_CFG.normal.mistake).toBeGreaterThan(BOT_CFG.strong.mistake);
  });
});

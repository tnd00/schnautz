import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { addPlayer, newState } from '../../src/game/state';
import type { GameKind, State } from '../../src/game/types';
import { fitView, VIEW_MAX_BYTES, viewFor } from '../../src/game/view';
import { botDecide } from '../../src/bots/index';
import { rngF } from './helpers';

/** Grenze von PeerJS für eine Nachricht im JSON-Kanal */
const PEER_LIMIT = 16_300;
const bytes = (x: unknown): number => new TextEncoder().encode(JSON.stringify(x)).byteLength;

/** Voller Tisch mit 16 Zeichen langen Namen voller Umlaute */
function fullTable(game: GameKind, n: number): State {
  const rng = rngF(7);
  const st = newState('h', 'Hostmensch Langer');
  act(st, 'h', { type: 'game', game }, rng);
  act(st, 'h', { type: 'rules', rules: { seats: n } }, rng);
  for (let i = 1; i < n; i++)
    expect(addPlayer(st, 'g-' + String(i).padStart(10, 'x'), `Spielerin Nr ${i} äöü`.slice(0, 16))).toBeNull();
  return st;
}

/** Spielt zwei Partien und chattet dabei ständig mit der längsten erlaubten Emoji-Nachricht. Prüft jede Ansicht. */
function stress(game: GameKind, n: number): { raw: number; sent: number; rest: number } {
  const rng = rngF(3);
  const st = fullTable(game, n);
  const spam = '😂'.repeat(120);
  let raw = 0,
    sent = 0,
    rest = 0;
  act(st, 'h', { type: 'start' }, rng);
  for (let g = 0; g < 2; g++) {
    for (let step = 0; step < 20000 && st.phase !== 'over'; step++) {
      if (st.sh?.win?.lock) act(st, st.host, { type: 'shunlock', id: st.sh.win.id }, rng);
      if (step % 5 === 0) act(st, st.players[step % n].id, { type: 'chat', text: spam }, rng);
      for (const p of st.players) {
        const v = viewFor(st, p.id);
        v.clock = { ids: [p.id], left: 12345, total: 20000 };
        raw = Math.max(raw, bytes({ t: 'state', s: v }));
        const fit = fitView(v);
        const b = bytes({ t: 'state', s: fit });
        sent = Math.max(sent, b);
        rest = Math.max(rest, bytes({ ...fit, log: [] }));
        // Das Neueste bleibt immer drin
        expect(fit.log[fit.log.length - 1]?.n).toBe(st.n);
      }
      let moved = false;
      for (const p of st.players) {
        const a = botDecide(viewFor(st, p.id), rng, 'normal');
        if (a && !act(st, p.id, a, rng)) moved = true;
        if (moved && a?.type !== 'ready') break;
      }
      if (!moved) break;
    }
    if (g === 0) st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
  }
  expect(st.games).toBeGreaterThanOrEqual(2);
  return { raw, sent, rest };
}

describe('Nachrichtengröße', () => {
  it('lässt kleine Ansichten unverändert', () => {
    const st = fullTable('shithead', 3);
    const v = viewFor(st, 'h');
    const before = v.log.length;
    expect(fitView(v).log).toHaveLength(before);
  });

  it('kürzt den Verlauf von vorn, bis die Ansicht passt', () => {
    const st = fullTable('schnautz', 4);
    for (let i = 0; i < 80; i++) act(st, 'h', { type: 'chat', text: '🎉'.repeat(120) });
    const v = fitView(viewFor(st, 'h'), 6000);
    expect(bytes(v)).toBeLessThanOrEqual(6000);
    expect(v.log[v.log.length - 1].n).toBe(st.n);
    expect(v.log.length).toBeLessThan(80);
  });

  it.each([
    ['schnautz', 8],
    ['shithead', 8],
    ['durak', 8],
    ['cabo', 8],
  ] as const)('%s zu %i bleibt mit Emoji-Chat unter der Grenze von PeerJS', (game, n) => {
    const { raw, sent, rest } = stress(game, n);
    // Ohne Kürzen wäre die Grenze gerissen, der Test prüft also den Ernstfall
    expect(raw).toBeGreaterThan(PEER_LIMIT);
    expect(sent).toBeLessThanOrEqual(VIEW_MAX_BYTES + 20);
    expect(sent).toBeLessThan(PEER_LIMIT);
    // Ohne Verlauf bleibt die Ansicht klein, damit für den Verlauf immer genug Platz ist
    expect(rest).toBeLessThan(6000);
  });
});

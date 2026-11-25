/*
 * Geheimnis der Karten (Plan 1.4): Was ein Gast vom Gastgeber bekommt, verrät keine fremden Handkarten, keine
 * verdeckten Karten (bei Cabo außer der eigenen Einblendung) und keinen Platzschlüssel. Der Verlauf trägt nie einen
 * Schlüssel. Geprüft wird auf drei Arten:
 * - Felder: Wo eine Karte verdeckt liegt, steht in der Ansicht nur eine Anzahl.
 * - Vertauschen: Mischt man alles Verdeckte neu, bleibt die Ansicht Zeichen für Zeichen gleich. Das fängt auch
 *   neue Felder ab, die jemand später in die Ansicht schreibt.
 * - Frisch ausgeteilt: Direkt nach dem ersten Austeilen steht keine verdeckte Karte irgendwo in der Ansicht.
 */
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { toBot } from '../../src/game/flow';
import { reclaimSeat, seatGuest } from '../../src/game/seats';
import { addBot, newState } from '../../src/game/state';
import type { Card, GameKind, Phase, Rng, State, View } from '../../src/game/types';
import { fitView, viewFor } from '../../src/game/view';
import { genId } from '../../src/net/ids';
import { rngF } from './helpers';

/** Wie der Gastgeber Schlüssel vergibt (src/net/guest.ts). Sie liegen nur in H.keys, nie im Spielstand. */
const KEY_SHAPE = /(^|[^a-z0-9])k-[0-9a-f]{12}(?![0-9a-f])/;
const KEY_PROP = /^(key|keys|secret|token)$/i;

/** Jedes Feld eines Objekts, mit Pfad. */
function walk(x: unknown, fn: (path: string, k: string, v: unknown) => void, path = ''): void {
  if (!x || typeof x !== 'object') return;
  for (const [k, v] of Object.entries(x)) {
    fn(`${path}.${k}`, k, v);
    walk(v, fn, `${path}.${k}`);
  }
}

/** Schlüssel als Feldname, in Form eines Schlüssels oder als einer der vergebenen Werte. */
function keyFindings(x: unknown, keys: string[], where: string): string[] {
  const out: string[] = [];
  walk(x, (path, k, v) => {
    if (KEY_PROP.test(k)) out.push(`${where}${path} heißt wie ein Schlüssel`);
    if (typeof v === 'string' && (KEY_SHAPE.test(v) || keys.some((key) => v.includes(key))))
      out.push(`${where}${path} trägt einen Schlüssel`);
  });
  return out;
}

const revealed = (phase: Phase, game: GameKind): boolean => phase === 'over' || (game === 'cabo' && phase === 'end');

/** Felder der Ansicht: Fremdes und Verdecktes nur als Anzahl. */
function fieldFindings(v: View, st: State, pid: string, human: boolean): string[] {
  const out: string[] = [];
  const open = revealed(st.phase, st.game);
  for (const k of ['deck', 'discard', 'spare'] as const)
    if (typeof v[k] !== 'number') out.push(`${k} ist keine Anzahl`);
  Object.entries(v.hands).forEach(([id, h]) => {
    if (id !== pid && typeof h !== 'number') out.push(`hands.${id} zeigt fremde Karten`);
  });
  if (v.sh) {
    if (typeof v.sh.deck !== 'number' || typeof v.sh.burned !== 'number') out.push('sh: Stapel nicht verdeckt');
    if (!open)
      Object.entries(v.sh.P).forEach(([id, p]) => {
        if (id !== pid && typeof p.hand !== 'number') out.push(`sh.P.${id}.hand zeigt fremde Karten`);
        if (typeof p.down !== 'number') out.push(`sh.P.${id}.down zeigt verdeckte Karten`);
      });
  }
  if (v.dk) {
    if (typeof v.dk.deck !== 'number') out.push('dk: Stapel nicht verdeckt');
    if (!open)
      Object.entries(v.dk.P).forEach(([id, h]) => {
        if (id !== pid && typeof h !== 'number') out.push(`dk.P.${id} zeigt fremde Karten`);
      });
  }
  if (v.cb) {
    if (typeof v.cb.deck !== 'number') out.push('cb: Stapel nicht verdeckt');
    if (!open)
      Object.entries(v.cb.P).forEach(([id, row]) =>
        row.forEach((s) => {
          if (!s.up && 'c' in s) out.push(`cb.P.${id} Platz ${s.id} zeigt eine verdeckte Karte`);
        }),
      );
    const h = v.cb.hold;
    if (h && 'c' in h && h.by !== pid && h.from !== 'pile') out.push('cb.hold zeigt die gezogene Karte eines anderen');
    if (human && v.cb.know) out.push('cb.know bei einem Menschen');
    const own = st.cb?.reveal[pid];
    if (v.cb.reveal && JSON.stringify(v.cb.reveal) !== JSON.stringify(own)) out.push('cb.reveal ist nicht die eigene');
  }
  return out;
}

type Ref = { o: Record<string | number, Card>; k: string | number };

/** Alle Stellen, an denen für `pid` eine Karte verdeckt liegt. */
function hiddenRefs(st: State, pid: string): Ref[] {
  const refs: Ref[] = [];
  const arr = (a: Card[] | null | undefined) => a?.forEach((_, i) => refs.push({ o: a as unknown as Ref['o'], k: i }));
  const open = revealed(st.phase, st.game);
  // Am Ende einer Schnautz-Runde liegen die Hände offen (st.result.hands)
  if (!(st.game === 'schnautz' && (st.phase === 'end' || open)))
    Object.entries(st.hands).forEach(([id, h]) => id !== pid && arr(h));
  arr(st.deck);
  arr(st.discard);
  arr(st.spare);
  if (st.sh && !open) {
    arr(st.sh.deck);
    Object.entries(st.sh.P).forEach(([id, p]) => {
      if (id !== pid) arr(p.hand);
      arr(p.down);
    });
  }
  if (st.dk && !open) {
    arr(st.dk.deck);
    Object.entries(st.dk.P).forEach(([id, h]) => id !== pid && arr(h));
  }
  if (st.cb && !open) {
    // Was man selbst gerade eingeblendet bekommt, darf man sehen
    const shown = new Set((st.cb.reveal[pid]?.items ?? []).map((it) => it.c));
    arr(st.cb.deck);
    Object.values(st.cb.P).forEach((row) =>
      row.forEach((s) => {
        if (!s.up && !shown.has(s.c)) refs.push({ o: s as unknown as Ref['o'], k: 'c' });
      }),
    );
    const h = st.cb.hold;
    if (h && h.by !== pid && h.from !== 'pile') refs.push({ o: h as unknown as Ref['o'], k: 'c' });
  }
  return refs;
}

/** Kopie, in der alles für `pid` Verdeckte neu gemischt ist. */
function reshuffled(st: State, pid: string, rng: Rng): State {
  const copy = structuredClone(st);
  const refs = hiddenRefs(copy, pid);
  const cards = refs.map((r) => r.o[r.k]);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  refs.forEach((r, i) => (r.o[r.k] = cards[i]));
  return copy;
}

/** Ändert sich die Ansicht, wenn man das Verdeckte neu mischt? Dann hängt sie von geheimen Karten ab. */
function shuffleFindings(build: (st: State, pid: string) => unknown, st: State, pid: string, rng: Rng) {
  const a = JSON.stringify(build(st, pid));
  for (let k = 0; k < 2; k++)
    if (JSON.stringify(build(reshuffled(st, pid, rng), pid)) !== a) return ['hängt von Verdecktem ab'];
  return [];
}

/** Direkt nach dem Austeilen: Keine verdeckte Karte steht irgendwo in der Ansicht. Der Trumpf bei Durak liegt offen. */
function dealtFindings(v: unknown, st: State, pid: string): string[] {
  const json = JSON.stringify(v);
  const open = new Set([st.dk?.trump].filter(Boolean));
  return hiddenRefs(st, pid)
    .map((r) => r.o[r.k])
    .filter((c) => !open.has(c) && json.includes(`"${c}"`))
    .map((c) => `verdeckte Karte ${c} steht in der Ansicht`);
}

/** Alles prüfen, was ein Platz gerade zu sehen bekäme, auch nach dem Kürzen für das Netz. */
function viewFindings(st: State, keys: string[]): string[] {
  const out: string[] = [];
  for (const p of st.players) {
    const human = !p.bot;
    const v = viewFor(st, p.id);
    out.push(...fieldFindings(v, st, p.id, human).map((f) => `${p.id}: ${f}`));
    out.push(...keyFindings(v, keys, `${p.id}`));
    out.push(...fieldFindings(fitView(viewFor(st, p.id), 6000), st, p.id, human).map((f) => `${p.id} gekürzt: ${f}`));
  }
  out.push(...keyFindings(st.log, keys, 'log'));
  return out;
}

const GUESTS = [
  { id: 'p-a1a1a1a1a1a1', name: 'Lena' },
  { id: 'p-b2b2b2b2b2b2', name: 'Bartholomäus-Kim' },
];
const LATE = { id: 'p-c3c3c3c3c3c3', name: 'Uschi' };

/** Gastgeber, zwei Gäste mit Schlüssel und KIs bis n. Sechs Plätze heißt bei Shithead zwei Decks. */
function table(game: GameKind, n: number, rng: Rng): { st: State; keys: Record<string, string> } {
  const st = newState('h', 'Tahna');
  const keys: Record<string, string> = {};
  expect(act(st, 'h', { type: 'game', game }, rng)).toBeNull();
  expect(act(st, 'h', { type: 'rules', rules: { seats: n, fill: false, turnSecs: 0 } }, rng)).toBeNull();
  for (const g of GUESTS) {
    expect(seatGuest(st, g.id, g.name)).toEqual({ id: g.id });
    keys[g.id] = genId('k');
  }
  while (st.players.length < n) expect(addBot(st, rng)).toBeNull();
  return { st, keys };
}

/**
 * Spielt eine Partie wie die KI zu Ende und prüft bei jedem Schritt alle Ansichten. Unterwegs geht ein Gast
 * (toBot), kommt mit Schlüssel zurück (reclaimSeat) und jemand Neues übernimmt einen KI-Platz (takeSeat).
 */
function playChecked(game: GameKind, n: number, seed: number) {
  const rng = rngF(seed);
  const { st, keys } = table(game, n, rng);
  if (game === 'schnautz') act(st, 'h', { type: 'rules', rules: { dealerChoice: true, lives: 2 } }, rng);
  const seen = new Set<Phase>();
  // Der Spielstand kürzt seinen Verlauf, deshalb hier mitschreiben, welche Einträge es gab
  const kinds = new Set<string>();
  const found: string[] = [];
  const note = (step: number, list: string[]) => list.forEach((f) => found.length < 20 && found.push(`#${step} ${f}`));
  note(0, viewFindings(st, Object.values(keys)));
  expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
  // Direkt nach dem ersten Austeilen
  for (const p of st.players) if (!p.bot) note(0, dealtFindings(viewFor(st, p.id), st, p.id));

  const [g1, g2] = GUESTS;
  let late: string | null = null;
  for (let step = 1; step < 20000 && st.phase !== 'over'; step++) {
    seen.add(st.phase);
    st.log.forEach((e) => kinds.add(e.k));
    if (st.sh?.win?.lock) act(st, st.host, { type: 'shunlock', id: st.sh.win.id }, rng);
    if (step === 25) toBot(st, g2.id, rng);
    // Zurück mit eigenem Schlüssel, wie hostHello in src/net/host.ts
    if (step === 50) reclaimSeat(st, g2.id);
    if (step === 75) {
      const r = seatGuest(st, LATE.id, LATE.name);
      if ('id' in r) {
        late = r.id;
        keys[late] = genId('k');
        // Wer übernimmt, sieht nichts von dem, was die KI auf diesem Platz wusste
        const v = viewFor(st, late);
        if (v.cb?.know || v.cb?.reveal) note(step, ['Übernahme sieht das Wissen der KI']);
      }
    }
    note(step, viewFindings(st, Object.values(keys)));
    if (step % 4 === 0)
      for (const id of ['h', g1.id, g2.id, late]) {
        if (!id || st.players.find((p) => p.id === id)?.bot) continue;
        note(
          step,
          shuffleFindings(viewFor, st, id, rng).map((f) => `${id}: ${f}`),
        );
      }
    let moved = false;
    for (const p of st.players) {
      const a = botDecide(viewFor(st, p.id), rng, 'normal');
      if (a && !act(st, p.id, a, rng)) moved = true;
      if (moved && a?.type !== 'ready') break;
    }
    if (!moved) break;
  }
  seen.add(st.phase);
  note(-1, viewFindings(st, Object.values(keys)));
  return { st, seen, kinds, found, late };
}

describe('Geheimnis der Karten', () => {
  it.each([
    ['schnautz', 6, ['choose', 'play', 'end', 'over']],
    ['shithead', 6, ['swap', 'play', 'over']],
    ['durak', 6, ['play', 'over']],
    ['cabo', 6, ['peek', 'play', 'end', 'over']],
  ] as const)('%s zu %i: Gäste sehen nichts Verdecktes und keinen Schlüssel', (game, n, phases) => {
    const { st, seen, kinds, found, late } = playChecked(game, n, 11);
    expect(found).toEqual([]);
    expect(st.phase).toBe('over');
    for (const ph of phases) expect(seen, `Phase ${ph} durchlaufen`).toContain(ph);
    // Die Wege über die Plätze sind wirklich gelaufen
    for (const k of ['tobot', 'back', 'takeover'] as const) expect(kinds, `Verlauf ${k}`).toContain(k);
    expect(late).not.toBeNull();
  });

  it('Cabo: Eingeblendet wird nur die eigene Karte und nur in der eigenen Ansicht', () => {
    const rng = rngF(5);
    const { st } = table('cabo', 4, rng);
    act(st, 'h', { type: 'start' }, rng);
    expect(st.phase).toBe('peek');
    const [g1, g2] = GUESTS;
    // Lena sieht sich zwei Karten an, wie die KI es täte
    for (let i = 0; i < 4 && !st.cb?.reveal[g1.id]; i++) {
      const a = botDecide(viewFor(st, g1.id), rng, 'normal');
      if (a) act(st, g1.id, a, rng);
    }
    const shows = st.cb?.reveal[g1.id];
    expect(shows?.items.length).toBeGreaterThan(0);
    expect(viewFor(st, g1.id).cb?.reveal).toEqual(shows);
    expect(viewFor(st, g2.id).cb?.reveal).toBeUndefined();
    expect(viewFor(st, 'h').cb?.reveal).toBeUndefined();
    // Die eingeblendeten Karten stehen sonst nirgends, auch nicht bei Lena selbst
    for (const it of shows?.items ?? []) {
      expect(JSON.stringify(viewFor(st, g2.id))).not.toContain(`"${it.c}"`);
      const mine = viewFor(st, g1.id);
      expect(JSON.stringify({ ...mine, cb: { ...mine.cb, reveal: null } })).not.toContain(`"${it.c}"`);
    }
  });

  it('die Prüfungen schlagen an, wenn etwas durchsickert', () => {
    const rng = rngF(9);
    const { st, keys } = table('shithead', 4, rng);
    act(st, 'h', { type: 'start' }, rng);
    const [g1, g2] = GUESTS;
    const v = viewFor(st, g1.id);
    const leaky = structuredClone(v);
    leaky.hands[g2.id] = ['HA'];
    if (leaky.sh) leaky.sh.P[g2.id].hand = st.sh?.P[g2.id].hand ?? [];
    expect(fieldFindings(leaky, st, g1.id, true).length).toBeGreaterThan(0);
    // Verdeckte Karten irgendwo in der Ansicht, etwa in einem neuen Feld
    const top = st.sh?.deck[0] ?? '';
    expect(dealtFindings({ ...v, hint: top }, st, g1.id)).toContain(`verdeckte Karte ${top} steht in der Ansicht`);
    expect(shuffleFindings((s, id) => ({ ...viewFor(s, id), hint: s.sh?.deck[0] }), st, g1.id, rng)).toEqual([
      'hängt von Verdecktem ab',
    ]);
    // Schlüssel als Feld, als Wert und in einem Logeintrag
    const key = keys[g1.id];
    expect(keyFindings({ ...v, players: [{ ...v.players[1], key }] }, [key], 'v').length).toBeGreaterThan(0);
    expect(keyFindings([{ k: 'join', n: 1, p: g1.id, name: key }], [], 'log')).toEqual([
      'log.0.name trägt einen Schlüssel',
    ]);
    // Ohne Leck bleibt alles still
    expect(fieldFindings(v, st, g1.id, true)).toEqual([]);
    expect(keyFindings(v, Object.values(keys), 'v')).toEqual([]);
  });
});

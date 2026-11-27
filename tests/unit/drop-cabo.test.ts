/*
 * Cabo ziehen (ziehen.md 4.1 und 7): jede Zeile der Tabelle, Grenzfälle und die gemeinsamen Prüfungen aus helpers.ts
 * (Menge, Gastgeber, Geheimnis, Tipp-Wege) über Zufallspartien mit und ohne Schnappen.
 */
import { strict as assert } from 'node:assert';
import { afterEach, describe, expect, it } from 'vitest';
import { dragLabel } from '../../src/content/texts/drag';
import { act } from '../../src/game/actions';
import { cbVal } from '../../src/game/cards';
import { canDrag, dropOf, dropsFor, type DragKey, type DropKey, type DropResult } from '../../src/game/drop';
import { cbRoleOf } from '../../src/game/drop/cabo';
import { addPlayer, newState } from '../../src/game/state';
import type { State, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { cbRole, cbSlotsDrag } from '../../src/ui/render/cabo';
import { dropProblems, dropStates, msgOf, rngF, type DropCase, type TapWays } from './helpers';

/** Dieselben Züge mit Tippen und Knöpfen (src/ui/events.ts), in der Reihenfolge der Tipps */
const TAP: TapWays = {
  cbsnap: ['cbsnapmode', 'cbm'],
  cbswap: ['cbm', 'cbswap'],
  cbdiscard: ['cbdiscard'],
  // Ablage auf eigene Karte: Ablage antippen, Platz wählen, Eintauschen
  cbdraw: ['cbdeck', 'cbpile', 'cbm', 'cbswap'],
  cbblind: ['cbm', 'cbo', 'cbblind'],
};

const NAMES: Record<string, string> = { h: 'Hanna', a: 'Rudi', b: 'Ben' };
const label = (r: DropResult): string =>
  r.ok ? dragLabel(r.say, { card: (c) => c, name: (id) => NAMES[id] }) : `nein: ${msgOf(r.r)}`;

const slot = (owner: string, id: number): DropKey => ({ z: 'slot', owner, id });
const PILE: DropKey = { z: 'pile' };
const HOLD: DropKey = { z: 'hold' };
const mine = (ids: number[]): DragKey => ({ g: 'cabo', from: 'slot', ids });
const FROM = (from: 'hold' | 'pile' | 'deck'): DragKey => ({ g: 'cabo', from });
/** Gezogene Karte mit gewählten eigenen Plätzen */
const HELD = (sel: number[]): DragKey => ({ g: 'cabo', from: 'hold', sel });

/** Drei Leute, alle haben angesehen, die Runde läuft und `me` ist dran */
function table(snap = true): { st: State; me: string; other: string } {
  const rng = rngF(11);
  const st = newState('h', 'Hanna');
  assert.equal(addPlayer(st, 'a', 'Rudi'), null);
  assert.equal(addPlayer(st, 'b', 'Ben'), null);
  assert.equal(act(st, 'h', { type: 'game', game: 'cabo' }, rng), null);
  assert.equal(act(st, 'h', { type: 'rules', rules: { turnSecs: 0, cb: { snap } } }, rng), null);
  assert.equal(act(st, 'h', { type: 'start' }, rng), null);
  for (const p of st.players) act(st, p.id, { type: 'cblook', ids: st.cb!.P[p.id].slice(0, 2).map((s) => s.id) });
  assert.equal(st.phase, 'play');
  st.turn = st.players.findIndex((p) => p.id === 'h');
  return { st, me: 'h', other: 'a' };
}

const ids = (st: State, p: string): number[] => st.cb!.P[p].map((s) => s.id);
const v = (st: State, me = 'h'): View => viewFor(st, me);

describe('Cabo ziehen, Tabelle ziehen.md 4.1', () => {
  it('Schnappen: eigener Platz auf die Ablage, mit gesehener Oberkarte, nur unter dem Finger', () => {
    const { st } = table();
    const id = ids(st, 'a')[0];
    // Nicht am Zug (wait)
    const r = dropOf(v(st, 'a'), 'a', mine([id]), PILE);
    expect(r).toEqual({
      ok: true,
      a: { type: 'cbsnap', id, top: st.cb!.pile.at(-1) },
      say: { k: 'cb.snap' },
    });
    expect(label(r)).toBe('⚡ Schnappen');
    expect(dropsFor(v(st, 'a'), 'a', mine([id]))).toEqual([PILE]);
    // Am Zug vor dem Ziehen (draw) geht es auch
    expect(dropOf(v(st), 'h', mine([ids(st, 'h')[0]]), PILE).ok).toBe(true);
  });

  it('Schnappen aus: nicht ziehbar, die Ablage nennt den Grund und leuchtet nicht', () => {
    const { st } = table(false);
    const src = mine([ids(st, 'a')[0]]);
    expect(canDrag(v(st, 'a'), 'a', src)).toBe(false);
    expect(dropsFor(v(st, 'a'), 'a', src)).toEqual([]);
    expect(label(dropOf(v(st, 'a'), 'a', src, PILE))).toBe('nein: Schnappen ist an diesem Tisch aus.');
  });

  it('Oberkarte inzwischen anders: der Gastgeber lehnt ab, ohne Strafkarte', () => {
    const { st } = table();
    const r = dropOf(v(st, 'a'), 'a', mine([ids(st, 'a')[0]]), PILE);
    assert.ok(r.ok);
    // Bevor der Abwurf ankommt, legt jemand anders etwas ab
    st.cb!.pile.push(st.cb!.deck.pop()!);
    const row = st.cb!.P.a.length;
    expect(msgOf(act(st, 'a', r.a))).toBe('Zu spät, oben liegt schon eine andere Karte.');
    expect(st.cb!.P.a).toHaveLength(row);
  });

  it('gezogene Karte auf eigenen Platz: Eintauschen, jeder eigene Platz gilt', () => {
    const { st } = table();
    act(st, 'h', { type: 'cbdraw', from: 'deck' });
    const all = ids(st, 'h');
    const r = dropOf(v(st), 'h', FROM('hold'), slot('h', all[2]));
    expect(r).toMatchObject({ ok: true, a: { type: 'cbswap', ids: [all[2]] } });
    expect(label(r)).toBe('Eintauschen');
    const hits = dropsFor(v(st), 'h', FROM('hold'));
    expect(hits).toEqual(expect.arrayContaining([PILE, ...all.map((id) => slot('h', id))]));
    // Fremde Plätze sind beim Eintauschen kein Ziel
    expect(label(dropOf(v(st), 'h', FROM('hold'), slot('a', ids(st, 'a')[0])))).toBe('nein: Da passt das nicht hin.');
  });

  it('gezogene Karte auf einen gewählten Platz tauscht alle gewählten, auf einen anderen nur ihn', () => {
    const { st } = table();
    act(st, 'h', { type: 'cbdraw', from: 'deck' });
    const all = ids(st, 'h');
    const three = all.slice(0, 3);
    const r = dropOf(v(st), 'h', HELD(three), slot('h', three[1]));
    expect(r).toMatchObject({ ok: true, a: { type: 'cbswap', ids: three } });
    expect(label(r)).toBe('3 eintauschen · nur gleiche');
    // Ein nicht gewählter Platz tauscht allein, die Auswahl bleibt dabei unberührt
    const one = dropOf(v(st), 'h', HELD(three), slot('h', all[3]));
    expect(one).toMatchObject({ ok: true, a: { type: 'cbswap', ids: [all[3]] } });
    expect(label(one)).toBe('Eintauschen');
    expect(dropsFor(v(st), 'h', HELD(three))).toEqual(dropsFor(v(st), 'h', FROM('hold')));
    // Fremde oder doppelte Plätze in der Auswahl: nicht ziehbar
    expect(canDrag(v(st), 'h', HELD([all[0], ids(st, 'a')[0]]))).toBe(false);
    expect(canDrag(v(st), 'h', HELD([all[0], all[0]]))).toBe(false);
  });

  it('gewählte Plätze auf die gezogene Karte oder die Ablage: „3 eintauschen · nur gleiche“', () => {
    const { st } = table();
    act(st, 'h', { type: 'cbdraw', from: 'deck' });
    const three = ids(st, 'h').slice(0, 3);
    for (const dst of [HOLD, PILE]) {
      const r = dropOf(v(st), 'h', mine(three), dst);
      expect(r).toMatchObject({ ok: true, a: { type: 'cbswap', ids: three } });
      // Verdeckte Karten kennt man nicht sicher, die Warnung steht da
      expect(label(r)).toBe('3 eintauschen · nur gleiche');
    }
    // Offen und gleich: keine Warnung
    const C = st.cb!;
    const [x, y] = C.P.h;
    const twin = C.deck.find((c) => cbVal(c) === cbVal(x.c))!;
    C.deck = C.deck.filter((c) => c !== twin);
    C.deck.push(y.c);
    y.c = twin;
    x.up = y.up = true;
    expect(label(dropOf(v(st), 'h', mine([x.id, y.id]), HOLD))).toBe('2 eintauschen');
    // Ein Platz allein heißt nur Eintauschen
    expect(label(dropOf(v(st), 'h', mine([x.id]), PILE))).toBe('Eintauschen');
  });

  it('vom Stapel gezogen auf die Ablage: Ablegen samt Fähigkeit, von der Ablage genommen nicht', () => {
    const { st } = table();
    const C = st.cb!;
    const seven = C.deck.findIndex((c) => cbVal(c) === 7);
    C.deck.push(...C.deck.splice(seven, 1));
    act(st, 'h', { type: 'cbdraw', from: 'deck' });
    const r = dropOf(v(st), 'h', FROM('hold'), PILE);
    expect(r).toMatchObject({ ok: true, a: { type: 'cbdiscard' }, say: { k: 'cb.discard', a: { f: 'peek' } } });
    expect(label(r)).toBe('Ablegen + 👁️ Ansehen');
    const t = table();
    act(t.st, 'h', { type: 'cbdraw', from: 'pile' });
    expect(label(dropOf(v(t.st), 'h', FROM('hold'), PILE))).toBe('nein: Eine Karte von der Ablage musst du tauschen.');
    expect(dropsFor(v(t.st), 'h', FROM('hold'))).not.toContainEqual(PILE);
  });

  it('Ablage auf eigenen Platz: Nehmen und tauschen in einem Zug, auf „gezogen“ nur Nehmen', () => {
    const { st } = table();
    const id = ids(st, 'h')[1];
    const r = dropOf(v(st), 'h', FROM('pile'), slot('h', id));
    expect(r).toMatchObject({ ok: true, a: { type: 'cbdraw', from: 'pile', into: [id] } });
    expect(label(r)).toBe('Nehmen und tauschen');
    const take = dropOf(v(st), 'h', FROM('pile'), HOLD);
    expect(take).toMatchObject({ ok: true, a: { type: 'cbdraw', from: 'pile' } });
    expect(take.ok && 'into' in take.a).toBe(false);
    expect(label(take)).toBe('Nehmen');
    // Ohne eigene Karten leuchtet nichts
    st.cb!.P.h = [];
    expect(canDrag(v(st), 'h', FROM('pile'))).toBe(false);
    expect(dropsFor(v(st), 'h', FROM('pile'))).toEqual([]);
  });

  it('Stapel auf „gezogen“: Ziehen, nie direkt auf einen Platz, leer kein Start', () => {
    const { st } = table();
    const r = dropOf(v(st), 'h', FROM('deck'), HOLD);
    expect(r).toMatchObject({ ok: true, a: { type: 'cbdraw', from: 'deck' } });
    expect(label(r)).toBe('Ziehen');
    expect(dropsFor(v(st), 'h', FROM('deck'))).toEqual([HOLD]);
    expect(dropOf(v(st), 'h', FROM('deck'), slot('h', ids(st, 'h')[0])).ok).toBe(false);
    st.cb!.deck = [];
    expect(canDrag(v(st), 'h', FROM('deck'))).toBe(false);
  });

  it('Blindtausch: eigener Platz auf jeden fremden, das Etikett nennt die Person', () => {
    const { st } = table();
    const C = st.cb!;
    C.power = { by: 'h', kind: 'swap', c: 'HB' };
    C.pile.push('HB');
    const id = ids(st, 'h')[0];
    const oid = ids(st, 'a')[3];
    const r = dropOf(v(st), 'h', mine([id]), slot('a', oid));
    expect(r).toMatchObject({ ok: true, a: { type: 'cbblind', id, to: 'a', oid } });
    expect(label(r)).toBe('🔀 mit Rudi tauschen');
    const hits = dropsFor(v(st), 'h', mine([id]));
    expect(hits).toHaveLength(ids(st, 'a').length + ids(st, 'b').length);
    expect(hits.every((d) => d.z === 'slot' && d.owner !== 'h')).toBe(true);
    // Zwei gewählte gehen beim Blindtausch nicht
    expect(canDrag(v(st), 'h', mine(ids(st, 'h').slice(0, 2)))).toBe(false);
  });

  it('Ansehen, eigene Karte ansehen und Spionieren: nichts ist ziehbar, Tippen reicht', () => {
    const rng = rngF(3);
    const st = newState('h', 'Hanna');
    addPlayer(st, 'a', 'Rudi');
    act(st, 'h', { type: 'game', game: 'cabo' }, rng);
    act(st, 'h', { type: 'rules', rules: { turnSecs: 0, cb: { snap: true } } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const srcs: DragKey[] = [mine([ids(st, 'h')[0]]), FROM('hold'), FROM('pile'), FROM('deck')];
    expect(st.phase).toBe('peek');
    expect(srcs.filter((s) => canDrag(v(st), 'h', s))).toEqual([]);
    for (const kind of ['peek', 'spy'] as const) {
      const t = table();
      t.st.cb!.power = { by: 'h', kind, c: 'H9' };
      expect(srcs.filter((s) => canDrag(v(t.st), 'h', s))).toEqual([]);
    }
  });

  it('fremde Plätze sind nie Quelle, auch nicht mit fremden IDs', () => {
    const { st } = table();
    st.cb!.power = { by: 'h', kind: 'swap', c: 'HB' };
    expect(canDrag(v(st), 'h', mine([ids(st, 'a')[0]]))).toBe(false);
    expect(canDrag(v(st), 'h', mine([ids(st, 'h')[0], ids(st, 'h')[0]]))).toBe(false);
  });
});

/** Alle Quellen, die ich in dieser Ansicht anfassen könnte: jeder eigene Platz, Paare, Dreier, Mitte */
function srcsOf(st: State, me: string): DragKey[] {
  const own = st.cb?.P[me]?.map((s) => s.id) ?? [];
  return [
    ...own.map((id) => mine([id])),
    ...(own.length > 1 ? [mine(own.slice(0, 2)), mine(own.slice(-3))] : []),
    FROM('hold'),
    ...(own.length > 1 ? [HELD(own.slice(0, 2))] : []),
    FROM('pile'),
    FROM('deck'),
  ];
}

describe('Cabo ziehen, gemeinsame Prüfungen', () => {
  it('Menge, Gastgeber, Geheimnis und Tipp-Wege über Zufallspartien', () => {
    const cases: DropCase[] = [
      ...dropStates('cabo', 5, { players: 3, every: 2, max: 120, rules: { cb: { snap: true } } }),
      ...dropStates('cabo', 6, { players: 4, every: 3, max: 80 }),
    ].map(({ st, me }) => ({ st, me, srcs: srcsOf(st, me) }));
    // Die Fälle müssen auch wirklich etwas Ziehbares enthalten
    expect(cases.some((c) => c.srcs.some((s) => canDrag(viewFor(c.st, c.me), c.me, s)))).toBe(true);
    expect(dropProblems(cases, TAP)).toEqual([]);
  });

  afterEach(() => {
    App.me = '';
    App.cs.snap = false;
  });

  it('cbRoleOf ist dieselbe Rolle wie cbRole am Tisch, cbSlotsDrag dasselbe wie cbCanDrag', () => {
    const cases = [
      ...dropStates('cabo', 5, { players: 3, every: 2, max: 120, rules: { cb: { snap: true } } }),
      ...dropStates('cabo', 6, { players: 4, every: 3, max: 80 }),
    ];
    // Ansehen, eigene Karte ansehen und Spionieren: beim Ziehen gibt es dort nichts zu tun
    const NONE = new Set(['look', 'looked', 'ownpeek', 'spy']);
    const roles = new Set<string>();
    for (const { st, me } of cases) {
      App.me = me;
      const view = viewFor(st, me);
      const r = cbRole(view);
      roles.add(r);
      expect(cbRoleOf(view, me)).toBe(NONE.has(r) ? 'none' : r);
      const own = st.cb?.P[me]?.[0];
      if (own) expect(cbSlotsDrag(view)).toBe(canDrag(view, me, mine([own.id])));
    }
    expect([...roles]).toEqual(expect.arrayContaining(['draw', 'hold', 'wait']));
  });
});

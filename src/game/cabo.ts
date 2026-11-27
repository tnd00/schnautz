/*
 * Cabo nach der zweiten Ausgabe (2019), umgerechnet auf normale Decks: Ass 1, 2 bis 10, Bube 11, Dame 12,
 * schwarzer König 13, roter König 0. Jeder hat vier verdeckte Karten und sieht sich zu Beginn zwei davon an.
 * Wer dran ist, zieht vom Stapel oder nimmt die oberste Ablage und tauscht sie gegen eigene Karten (mehrere nur mit
 * gleichem Wert, daneben kostet eine Strafkarte). Vom Stapel darf man die Karte auch ablegen und ihre Fähigkeit
 * nutzen: 7 und 8 eigene ansehen, 9 und 10 fremde ansehen, Bube und Dame blind tauschen. Statt zu ziehen ruft man
 * Cabo, dann sind alle anderen noch einmal dran. Am Ende zählt die Summe, wer Cabo rief und nicht am wenigsten hat,
 * bekommt 10 dazu, Kamikaze (zwei Damen und beide schwarzen Könige) gibt allen anderen 50. Genau 100 fällt einmal
 * pro Partie auf 50. Wer über die Zielpunkte kommt, beendet die Partie, die wenigsten Punkte gewinnen.
 * Wissen hängt an Platz-IDs und wandert beim Tauschen mit der Karte. Die KI sieht ihr Wissen in der Ansicht und
 * vergisst selbst, Menschen bekommen nur eine kurze Einblendung.
 */
import { cbVal, rnd, shDeck } from './cards';
import {
  CB_HAND,
  CB_KAMI,
  CB_PENALTY,
  CB_RESET_AT,
  CB_RESET_TO,
  CB_TWO_DECKS,
  MAX_SEATS,
  MIN_SEATS,
} from './constants';
import { setReign } from './games';
import { phaseReject, rj, type Reject } from './reject';
import { offerRematch, settleDuel } from './rematch';
import { addLog, countGame, pIdx, statsOf } from './state';
import type { Action, ActResult, CaboResult, Card, CbReveal, CbSlot, CbState, Rng, State, Table } from './types';

function cb(st: State): CbState {
  if (!st.cb) throw new Error('Cabo ist nicht gestartet');
  return st.cb;
}

/** Wer gerade dran ist. */
export const cbCurrent = (st: Pick<State, 'players' | 'turn'>): string | null => st.players[st.turn]?.id ?? null;

/** Fähigkeit einer abgelegten Karte. */
export function cbPower(c: Card): 'peek' | 'spy' | 'swap' | null {
  const v = cbVal(c);
  if (v === 7 || v === 8) return 'peek';
  if (v === 9 || v === 10) return 'spy';
  if (v === 11 || v === 12) return 'swap';
  return null;
}

/** Kamikaze: genau zwei Zwölfen und zwei Dreizehnen, sonst nichts. */
export function cbKamikaze(cards: Card[]): boolean {
  if (cards.length !== 4) return false;
  const v = cards.map(cbVal);
  return v.filter((x) => x === 12).length === 2 && v.filter((x) => x === 13).length === 2;
}

const slotIdx = (row: CbSlot[], id: number): number => row.findIndex((s) => s.id === Number(id));

/** Plätze zum Tauschen aus einer Aktion vom Netz: eigene, ohne doppelte, mindestens einer, sonst null. */
function swapIds(row: readonly { id: number }[], raw: unknown): number[] | null {
  const ids = Array.isArray(raw) ? [...new Set(raw.map(Number))] : [];
  return ids.length && ids.length <= row.length && ids.every((id) => row.some((s) => s.id === id)) ? ids : null;
}

/** Gültige fremde Person aus einer Aktion vom Netz: nur echte Reihen, nie man selbst. */
function otherId(C: CbState, pid: string, raw: unknown): string | null {
  return typeof raw === 'string' && raw !== pid && Object.hasOwn(C.P, raw) ? raw : null;
}

/** Merkt sich, was `pid` gerade über einen Platz erfährt, und blendet es ihm kurz ein. */
function learn(st: State, pid: string, items: { owner: string; slot: number; c: Card }[]): void {
  const C = cb(st);
  const know = (C.know[pid] ??= {});
  items.forEach((x) => (know[x.slot] = { c: x.c, t: C.t }));
  C.rid++;
  const r: CbReveal = { id: C.rid, t: C.t, items };
  C.reveal[pid] = r;
}

/** Ein Platz bekommt eine neue Karte: altes Wissen aller über ihn ist wertlos. */
function forget(st: State, slot: number): void {
  Object.values(cb(st).know).forEach((k) => delete k[slot]);
}

export function cbStart(st: State, rng?: Rng): ActResult {
  const keep = st.players.filter((p) => p.id === st.host || (st.phase === 'lobby' ? p.online : !p.gone));
  if (keep.length < 2) return rj('seat.tooFew', { min: MIN_SEATS });
  if (keep.length > MAX_SEATS.cabo) return rj('seat.tooMany', { max: MAX_SEATS.cabo, g: 'cabo' });
  st.players = keep;
  st.players.forEach((p) => {
    p.out = false;
    p.ready = false;
    p.place = 0;
    p.cbp = 0;
    delete p.gone;
  });
  st.games++;
  st.round = 0;
  st.winner = null;
  st.result = null;
  st.last = null;
  st.sh = null;
  st.dk = null;
  addLog(st, { k: 'game', g: st.games, game: 'cabo' });
  const start = st.players[Math.floor(rnd(rng) * st.players.length)].id;
  st.cb = null;
  cbDeal(st, rng, start, []);
  return null;
}

/** Neue Runde: vier verdeckte Karten, eine offen auf der Ablage, dann sieht sich jeder zwei Karten an. */
export function cbDeal(st: State, rng: Rng | undefined, start: string, resets?: string[]): void {
  const decks = st.players.length >= CB_TWO_DECKS ? 2 : 1;
  const deck = shDeck(rng, decks);
  let sid = 1;
  const P: Record<string, CbSlot[]> = {};
  st.players.forEach((p) => {
    P[p.id] = [];
    for (let i = 0; i < CB_HAND; i++) P[p.id].push({ id: sid++, c: deck.pop() as Card });
    p.ready = false;
  });
  const pile = [deck.pop() as Card];
  st.round++;
  st.cb = {
    deck,
    pile,
    P,
    sid,
    hold: null,
    power: null,
    cabo: null,
    left: [],
    t: 0,
    know: {},
    reveal: {},
    rid: st.cb?.rid ?? 0,
    resets: resets ?? st.cb?.resets ?? [],
    start,
    decks,
  };
  st.phase = 'peek';
  st.turn = Math.max(0, pIdx(st, start));
  st.result = null;
  addLog(st, { k: 'cbdeal', r: st.round, start });
}

/** Alle haben sich ihre zwei Karten angesehen: Los geht's. */
export function cbBegin(st: State): void {
  st.phase = 'play';
  st.turn = Math.max(0, pIdx(st, cb(st).start));
  st.players.forEach((p) => (p.ready = false));
}

export function cbAct(st: State, pid: string, pi: number, a: Action, rng?: Rng): ActResult {
  const C = st.cb;
  if (!C) return rj('any.notStarted');
  const row = C.P[pid];
  if (!row) return rj('any.notPlaying');
  const me = st.players[pi];
  if (a.type === 'cblook') {
    if (st.phase !== 'peek') return phaseReject(st) ?? rj('cb.peekOver');
    if (me.ready) return null;
    const ids = Array.isArray(a.ids) ? [...new Set(a.ids.map(Number))] : [];
    const want = Math.min(2, row.length);
    if (ids.length !== want || ids.some((id) => slotIdx(row, id) < 0)) return rj('cb.pickTwo', { n: want });
    learn(
      st,
      pid,
      ids.map((id) => ({ owner: pid, slot: id, c: row[slotIdx(row, id)].c })),
    );
    me.ready = true;
    addLog(st, { k: 'cblook', p: pid, ids });
    if (st.players.every((p) => p.ready || !C.P[p.id])) cbBegin(st);
    return null;
  }
  if (a.type === 'cbsnap') return snap(st, pid, a.id, a.top);
  if (st.phase !== 'play') return phaseReject(st) ?? rj('any.unknown');
  const cur = cbCurrent(st);
  if (cur !== pid) return cur ? rj('any.notYourTurn', { p: cur }) : rj('any.notYourTurn');
  switch (a.type) {
    case 'cbdraw': {
      if (C.hold || C.power) return rj('cb.drawn');
      const from = a.from === 'pile' ? 'pile' : 'deck';
      // Die Ablage muss man tauschen, ohne eigene Karten geht das nicht
      if (from === 'pile' && !row.length) return rj('cb.pileNoCards');
      const src = from === 'pile' ? C.pile : C.deck;
      if (!src.length) return rj(from === 'pile' ? 'cb.pileEmpty' : 'cb.deckEmpty');
      // Ablage direkt auf eigene Karten (ziehen.md 6.2): erst prüfen, dann nehmen und tauschen in einem Aufruf
      const into = intoOf(a, row);
      if (into === false) return rj(from === 'pile' ? 'cb.pickSwap' : 'any.unknown');
      const c = src.pop() as Card;
      C.hold = { by: pid, c, from };
      addLog(st, from === 'pile' ? { k: 'cbdraw', p: pid, from, c } : { k: 'cbdraw', p: pid, from });
      st.last = { k: 'cbdraw', p: pid, n: st.n };
      return into ? swap(st, pid, into, rng) : null;
    }
    case 'cbcabo': {
      if (C.hold || C.power) return rj('cb.caboLate');
      if (C.cabo) return rj('cb.called', { p: C.cabo });
      C.cabo = pid;
      const n = st.players.length;
      C.left = [];
      for (let k = 1; k < n; k++) {
        const id = st.players[(pi + k) % n]?.id;
        if (id && C.P[id]) C.left.push(id);
      }
      addLog(st, { k: 'cbcabo', p: pid });
      st.last = { k: 'cbcabo', p: pid, n: st.n };
      endTurn(st, rng);
      return null;
    }
    case 'cbswap':
      return swap(st, pid, a.ids, rng);
    case 'cbdiscard': {
      if (!C.hold) return rj('cb.drawFirst');
      if (C.hold.from === 'pile') return rj('cb.mustSwap');
      const c = C.hold.c;
      C.hold = null;
      C.pile.push(c);
      const power = cbPower(c);
      addLog(st, power ? { k: 'cbdiscard', p: pid, c, power } : { k: 'cbdiscard', p: pid, c });
      st.last = { k: 'cbdiscard', p: pid, n: st.n, cards: [c] };
      if (power) C.power = { by: pid, kind: power, c };
      else endTurn(st, rng);
      return null;
    }
    case 'cbpeek': {
      if (C.power?.kind !== 'peek') return rj('cb.noPeek');
      const i = slotIdx(row, a.id);
      if (i < 0) return rj('cb.pickOwn');
      learn(st, pid, [{ owner: pid, slot: row[i].id, c: row[i].c }]);
      addLog(st, { k: 'cbpeek', p: pid, id: row[i].id });
      endTurn(st, rng);
      return null;
    }
    case 'cbspy': {
      if (C.power?.kind !== 'spy') return rj('cb.noSpy');
      const to = otherId(C, pid, a.to);
      const other = to ? C.P[to] : null;
      if (!to || !other) return rj('cb.pickOther');
      const i = slotIdx(other, a.id);
      if (i < 0) return rj('cb.pickOther');
      learn(st, pid, [{ owner: to, slot: other[i].id, c: other[i].c }]);
      addLog(st, { k: 'cbspy', p: pid, to, tn: st.players[pIdx(st, to)]?.name, id: other[i].id });
      endTurn(st, rng);
      return null;
    }
    case 'cbblind': {
      if (C.power?.kind !== 'swap') return rj('cb.noBlind');
      const to = otherId(C, pid, a.to);
      const other = to ? C.P[to] : null;
      if (!to || !other) return rj('cb.pickOther');
      const i = slotIdx(row, a.id);
      const j = slotIdx(other, a.oid);
      if (i < 0 || j < 0) return rj('cb.pickPair');
      const mine = row[i];
      const theirs = other[j];
      [mine.c, theirs.c] = [theirs.c, mine.c];
      [mine.up, theirs.up] = [theirs.up, mine.up];
      if (!mine.up) delete mine.up;
      if (!theirs.up) delete theirs.up;
      // Wissen wandert mit der Karte: Wer wusste, was hier lag, weiß jetzt, was dort liegt
      Object.values(C.know).forEach((k) => {
        const a1 = k[mine.id];
        const b1 = k[theirs.id];
        delete k[mine.id];
        delete k[theirs.id];
        if (a1) k[theirs.id] = a1;
        if (b1) k[mine.id] = b1;
      });
      addLog(st, {
        k: 'cbblind',
        p: pid,
        to,
        tn: st.players[pIdx(st, to)]?.name,
        id: mine.id,
        oid: theirs.id,
      });
      st.last = { k: 'cbblind', p: pid, n: st.n };
      endTurn(st, rng);
      return null;
    }
    case 'cbskip': {
      if (!C.power) return null;
      addLog(st, { k: 'cbskip', p: pid });
      endTurn(st, rng);
      return null;
    }
  }
  return rj('any.unknown');
}

/** Gezogene Karte gegen einen oder mehrere eigene Plätze tauschen. */
function swap(st: State, pid: string, raw: unknown, rng?: Rng): ActResult {
  const C = cb(st);
  if (!C.hold) return rj('cb.drawFirst');
  const row = C.P[pid];
  const ids = swapIds(row, raw);
  if (!ids) return rj('cb.pickSwap');
  const hold = C.hold;
  C.hold = null;
  const up = hold.from === 'pile';
  const slots = ids.map((id) => row[slotIdx(row, id)]);
  const vals = slots.map((s) => cbVal(s.c));
  const same = vals.every((x) => x === vals[0]);
  if (slots.length === 1 || same) {
    const out = slots.map((s) => s.c);
    C.pile.push(...out);
    const first = slots[0];
    first.c = hold.c;
    if (up) first.up = true;
    else delete first.up;
    slots.forEach((s) => forget(st, s.id));
    // Die übrigen Plätze fallen weg, die Reihe wird kürzer
    C.P[pid] = row.filter((s) => s === first || !slots.includes(s));
    (C.know[pid] ??= {})[first.id] = { c: hold.c, t: C.t };
    addLog(st, { k: 'cbswap', p: pid, out, ok: true, slots: slots.length, ids, ...(up ? { up: true } : {}) });
    st.last = { k: 'cbswap', p: pid, n: st.n, cards: out };
  } else {
    // Daneben: Die Karten liegen jetzt offen, die gezogene geht auf die Ablage, dazu eine Strafkarte
    slots.forEach((s) => (s.up = true));
    C.pile.push(hold.c);
    const pen = C.deck.length > 0;
    if (pen) row.push({ id: C.sid++, c: C.deck.pop() as Card });
    addLog(st, {
      k: 'cbswap',
      p: pid,
      out: slots.map((s) => s.c),
      ok: false,
      slots: slots.length,
      ids,
      ...(pen ? { pen: true } : {}),
    });
    st.last = { k: 'cbswap', p: pid, n: st.n };
  }
  endTurn(st, rng);
  return null;
}

/**
 * `into` aus cbdraw vom Netz: undefined ohne, false wenn ungültig (nur von der Ablage und nur eigene Plätze), sonst
 * die Plätze.
 */
function intoOf(a: Action, row: readonly { id: number }[]): number[] | false | undefined {
  const raw = (a as { into?: unknown }).into;
  if (raw === undefined) return undefined;
  return (a.type === 'cbdraw' && a.from === 'pile' && swapIds(row, raw)) || false;
}

/**
 * Schnappen: außer der Reihe eine eigene Karte auf eine gleiche oben auf der Ablage werfen. `top` ist die Oberkarte,
 * die man gesehen hat. Liegt inzwischen eine andere oben, hat man das Rennen verloren: Ablehnung ohne Strafkarte.
 */
function snap(st: State, pid: string, id: number, seen: unknown): ActResult {
  const C = cb(st);
  if (!st.rules.cb?.snap) return rj('cb.snapOff');
  if (st.phase !== 'play') return phaseReject(st) ?? rj('any.unknown');
  // Mitten im eigenen Zug nicht, sonst könnte man die letzte Karte loswerden und die gezogene nicht mehr tauschen
  if (C.hold?.by === pid || C.power?.by === pid) return rj('cb.finishTurn');
  const row = C.P[pid];
  const top = C.pile[C.pile.length - 1];
  const i = slotIdx(row, id);
  if (!top) return rj('cb.pileEmpty');
  if (seen !== undefined && seen !== top) return rj('cb.snapLate');
  if (i < 0) return rj('cb.pickOwn');
  const s = row[i];
  if (cbVal(s.c) === cbVal(top)) {
    row.splice(i, 1);
    C.pile.push(s.c);
    forget(st, s.id);
    addLog(st, { k: 'cbsnap', p: pid, c: s.c, ok: true, id: s.id });
  } else {
    // Daneben: Die Karte liegt offen und es gibt eine Strafkarte
    s.up = true;
    if (C.deck.length) row.push({ id: C.sid++, c: C.deck.pop() as Card });
    addLog(st, { k: 'cbsnap', p: pid, c: s.c, ok: false, id: s.id });
  }
  // Absichtlich kein st.last: Schnappen ist kein Zug, Uhr und Denkpause der Person am Zug laufen weiter
  // Hat die Strafkarte den Stapel geleert, bevor die Person am Zug gezogen hat, ist die Runde vorbei
  if (!C.deck.length && !C.hold && !C.power) endRound(st);
  return null;
}

/**
 * Warum diese Aktion gerade nicht geht, oder null, wenn sie geht (Grund am Tisch für ausgegraute Knöpfe und Karten).
 * Dieselben Codes in derselben Reihenfolge wie `cbAct`, geht auf dem Zustand und auf der Ansicht. Was erst beim
 * Aufdecken entscheidet (ungleiche Karten tauschen, daneben schnappen), ist eine Strafe und kein Grund, hier also null.
 */
export function cbWhyNot(t: Table, pid: string, a: Action): Reject | null {
  const C = t.cb;
  if (!C) return rj('any.notStarted');
  const row: readonly { id: number }[] | undefined = C.P[pid];
  if (!row) return rj('any.notPlaying');
  const has = (r: readonly { id: number }[], id: unknown): boolean => r.some((s) => s.id === Number(id));
  const other = (raw: unknown): readonly { id: number }[] | null =>
    typeof raw === 'string' && raw !== pid && Object.hasOwn(C.P, raw) ? C.P[raw] : null;
  if (a.type === 'cblook') {
    if (t.phase !== 'peek') return phaseReject(t) ?? rj('cb.peekOver');
    if (t.players.find((p) => p.id === pid)?.ready) return null;
    const ids = Array.isArray(a.ids) ? [...new Set(a.ids.map(Number))] : [];
    const want = Math.min(2, row.length);
    return ids.length !== want || ids.some((id) => !has(row, id)) ? rj('cb.pickTwo', { n: want }) : null;
  }
  if (a.type === 'cbsnap') {
    if (!t.rules.cb?.snap) return rj('cb.snapOff');
    if (t.phase !== 'play') return phaseReject(t) ?? rj('any.unknown');
    if (C.hold?.by === pid || C.power?.by === pid) return rj('cb.finishTurn');
    if (!C.pile.length) return rj('cb.pileEmpty');
    if (a.top !== undefined && a.top !== C.pile[C.pile.length - 1]) return rj('cb.snapLate');
    return has(row, a.id) ? null : rj('cb.pickOwn');
  }
  if (t.phase !== 'play') return phaseReject(t) ?? rj('any.unknown');
  const cur = cbCurrent(t);
  if (cur !== pid) return cur ? rj('any.notYourTurn', { p: cur }) : rj('any.notYourTurn');
  const deck = typeof C.deck === 'number' ? C.deck : C.deck.length;
  switch (a.type) {
    case 'cbdraw': {
      if (C.hold || C.power) return rj('cb.drawn');
      const from = a.from === 'pile' ? 'pile' : 'deck';
      if (from === 'pile' && !row.length) return rj('cb.pileNoCards');
      if (from === 'pile' ? !C.pile.length : !deck) return rj(from === 'pile' ? 'cb.pileEmpty' : 'cb.deckEmpty');
      return intoOf(a, row) === false ? rj(from === 'pile' ? 'cb.pickSwap' : 'any.unknown') : null;
    }
    case 'cbcabo':
      if (C.hold || C.power) return rj('cb.caboLate');
      return C.cabo ? rj('cb.called', { p: C.cabo }) : null;
    case 'cbswap':
      if (!C.hold) return rj('cb.drawFirst');
      return swapIds(row, a.ids) ? null : rj('cb.pickSwap');
    case 'cbdiscard':
      if (!C.hold) return rj('cb.drawFirst');
      return C.hold.from === 'pile' ? rj('cb.mustSwap') : null;
    case 'cbpeek':
      if (C.power?.kind !== 'peek') return rj('cb.noPeek');
      return has(row, a.id) ? null : rj('cb.pickOwn');
    case 'cbspy': {
      if (C.power?.kind !== 'spy') return rj('cb.noSpy');
      const o = other(a.to);
      return o && has(o, a.id) ? null : rj('cb.pickOther');
    }
    case 'cbblind': {
      if (C.power?.kind !== 'swap') return rj('cb.noBlind');
      const o = other(a.to);
      if (!o) return rj('cb.pickOther');
      return has(row, a.id) && has(o, a.oid) ? null : rj('cb.pickPair');
    }
    case 'cbskip':
      return null;
  }
  return rj('any.unknown');
}

/** Zug vorbei: weiter im Kreis. Nach dem Cabo-Ruf ist jeder noch einmal dran, leerer Stapel beendet die Runde. */
function endTurn(st: State, _rng?: Rng): void {
  const C = cb(st);
  const cur = cbCurrent(st);
  C.hold = null;
  C.power = null;
  C.t++;
  if (C.cabo && cur !== C.cabo) C.left = C.left.filter((id) => id !== cur);
  st.turn = (st.turn + 1) % st.players.length;
  if ((C.cabo && !C.left.length) || !C.deck.length) {
    endRound(st);
    return;
  }
  // Wer nicht mitspielt (später dazugekommen), wird übersprungen
  for (let k = 0; k < st.players.length && !C.P[st.players[st.turn].id]; k++)
    st.turn = (st.turn + 1) % st.players.length;
}

/** Runde vorbei: alle Karten aufdecken, zählen, Punkte vergeben, vielleicht ist die Partie vorbei. */
function endRound(st: State): void {
  const C = cb(st);
  const ids = st.players.map((p) => p.id).filter((id) => C.P[id]);
  const hands = Object.fromEntries(ids.map((id) => [id, C.P[id].map((s) => s.c)]));
  const sums = Object.fromEntries(ids.map((id) => [id, hands[id].reduce((s, c) => s + cbVal(c), 0)]));
  // Mit zwei Decks können zwei Leute gleichzeitig Kamikaze haben, dann bekommen beide 0
  const kamis = ids.filter((id) => cbKamikaze(hands[id]));
  const kami = kamis[0] ?? null;
  const caller = C.cabo;
  const scores: Record<string, number> = {};
  let ok: boolean | null = null;
  if (kami) ids.forEach((id) => (scores[id] = kamis.includes(id) ? 0 : CB_KAMI));
  else {
    ids.forEach((id) => (scores[id] = sums[id]));
    if (caller && caller in sums) {
      ok = ids.every((id) => id === caller || sums[caller] <= sums[id]);
      scores[caller] = ok ? 0 : sums[caller] + CB_PENALTY;
    }
  }
  const resets: string[] = [];
  st.players.forEach((p) => {
    if (!(p.id in scores)) return;
    p.cbp = (p.cbp ?? 0) + scores[p.id];
    // Genau 100 fällt einmal pro Partie auf 50 zurück
    if (p.cbp === CB_RESET_AT && !C.resets.includes(p.id)) {
      p.cbp = CB_RESET_TO;
      C.resets.push(p.id);
      resets.push(p.id);
    }
    const s = statsOf(p, 'cabo');
    if (p.id === caller) {
      s.cabos = (s.cabos ?? 0) + 1;
      if (ok) s.cabosOk = (s.cabosOk ?? 0) + 1;
    }
    if (kamis.includes(p.id)) s.kami = (s.kami ?? 0) + 1;
  });
  const totals = Object.fromEntries(st.players.filter((p) => p.id in scores).map((p) => [p.id, p.cbp ?? 0]));
  const names = Object.fromEntries(st.players.map((p) => [p.id, p.name]));
  const result: CaboResult = { reason: 'cabo', sums, scores, totals, caller, ok, kami, resets, hands, names };
  st.result = result;
  addLog(st, { k: 'cbround', p: caller ?? undefined, scores, caller, ok, kami });
  resets.forEach((id) => addLog(st, { k: 'cbreset', p: id }));
  st.players.forEach((p) => (p.ready = false));
  // Wer diese Runde am wenigsten hatte, beginnt die nächste. Bei Gleichstand, wer zuerst nach dem letzten Start kommt
  const n = st.players.length;
  const si = pIdx(st, C.start);
  let best = C.start;
  let bs = Infinity;
  for (let k = 1; k <= n; k++) {
    const id = st.players[(si + k) % n]?.id;
    if (id && id in scores && scores[id] < bs) {
      bs = scores[id];
      best = id;
    }
  }
  C.start = best;
  const target = st.rules.cb?.target ?? 100;
  if (Object.values(totals).some((x) => x > target)) cbEnd(st, result);
  else {
    st.phase = 'end';
    st.turn = -1;
  }
}

/** Partie vorbei: die wenigsten Punkte gewinnen und werden Cabo-König. */
function cbEnd(st: State, r: CaboResult): void {
  st.phase = 'over';
  st.turn = -1;
  const ids = Object.keys(r.totals);
  const low = Math.min(...ids.map((id) => r.totals[id]));
  let best = ids.filter((id) => r.totals[id] === low);
  // Gleichstand: die wenigsten Punkte in der letzten Runde
  if (best.length > 1) {
    const ls = Math.min(...best.map((id) => r.scores[id]));
    best = best.filter((id) => r.scores[id] === ls);
  }
  const winner = best.length === 1 ? best[0] : null;
  // Verteidigt der König seine Krone?
  const again = !!winner && st.reigns?.cabo?.win === winner;
  st.winner = winner;
  r.winner = winner;
  // Plätze wie beim Sieger: erst die Gesamtpunkte, dann die letzte Runde. Nur wer in beidem gleich ist, teilt
  const better = (x: string, id: string) =>
    r.totals[x] < r.totals[id] || (r.totals[x] === r.totals[id] && r.scores[x] < r.scores[id]);
  ids.forEach((id) => {
    const p = st.players[pIdx(st, id)];
    if (p) p.place = 1 + ids.filter((x) => better(x, id)).length;
  });
  // Ohne klaren Sieger bleibt der bisherige König im Amt
  if (winner) setReign(st, 'cabo', winner);
  if (winner) {
    const wp = st.players[pIdx(st, winner)];
    if (wp) wp.wins = (wp.wins || 0) + 1;
  }
  countGame(st, 'cabo', winner);
  st.players.forEach((p) => {
    if (p.gone || !p.place) return;
    const ps = statsOf(p, 'cabo');
    ps.places = (ps.places ?? 0) + p.place;
  });
  addLog(st, { k: 'cbend', p: winner ?? undefined, ...(again ? { again: true } : {}) });
  settleDuel(st);
  // Wer am meisten hat, darf den neuen König herausfordern. Ohne Sieger gibt es niemanden zum Fordern
  const high = Math.max(...ids.map((id) => r.totals[id]));
  if (winner)
    offerRematch(
      st,
      ids.filter((id) => r.totals[id] === high),
    );
}

/** Nächste Runde, wenn alle bereit sind. */
export function cbNextRound(st: State, rng?: Rng): void {
  const C = cb(st);
  cbDeal(st, rng, C.start, C.resets);
}

/**
 * Einfacher Ersatzzug für Offline oder abgelehnte KI-Züge: zwei Karten ansehen, sonst ziehen, ablegen oder
 * tauschen und Fähigkeiten auslassen.
 */
export function cbAuto(st: State, pid: string, rng?: Rng): ActResult {
  const C = st.cb;
  if (!C) return null;
  const pi = pIdx(st, pid);
  const row = C.P[pid];
  if (!row) return null;
  if (st.phase === 'peek') return cbAct(st, pid, pi, { type: 'cblook', ids: row.slice(0, 2).map((s) => s.id) }, rng);
  if (st.phase !== 'play' || cbCurrent(st) !== pid) return null;
  if (C.power) return cbAct(st, pid, pi, { type: 'cbskip' }, rng);
  if (C.hold)
    return cbAct(
      st,
      pid,
      pi,
      C.hold.from === 'pile' && row.length ? { type: 'cbswap', ids: [row[0].id] } : { type: 'cbdiscard' },
      rng,
    );
  // Hat eine Strafkarte den Stapel geleert, bleibt die Ablage
  return cbAct(st, pid, pi, { type: 'cbdraw', from: C.deck.length ? 'deck' : 'pile' }, rng);
}

/** Auf wen die Runde wartet: zu Beginn alle, die noch nicht angesehen haben, sonst die Person am Zug. */
export function cbWaiting(
  st: Pick<State, 'phase' | 'players' | 'turn'> & { cb?: { P: Record<string, unknown> } | null },
): string[] {
  if (!st.cb) return [];
  if (st.phase === 'peek') return st.players.filter((p) => !p.ready && st.cb && p.id in st.cb.P).map((p) => p.id);
  if (st.phase !== 'play') return [];
  const cur = cbCurrent(st);
  return cur ? [cur] : [];
}

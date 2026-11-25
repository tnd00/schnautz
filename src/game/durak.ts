/*
 * Durak nach Pagat (Podkidnoy). Wer angreift, legt eine oder mehrere Karten gleichen Werts. Der Verteidiger schlägt
 * jede mit einer höheren Karte derselben Farbe oder mit Trumpf oder nimmt alles auf. Alle außer dem Verteidiger
 * dürfen Werte nachlegen, die schon auf dem Tisch liegen, höchstens sechs und nie mehr, als der Verteidiger zu
 * Beginn Karten hatte. Danach ziehen alle auf sechs nach, der Angreifer zuerst und der Verteidiger zuletzt.
 * Wer zuletzt Karten hat, ist der Durak. Werden die Letzten gleichzeitig fertig, ist es unentschieden.
 * Weiterschieben (Perevodnoy) ist ein Schalter: Der Verteidiger legt gleiche Werte dazu und gibt weiter.
 * Alle Abfragen nehmen auch eine Ansicht, damit KI und Oberfläche dieselben Regeln nutzen.
 */
import { shPlaceBet, shSettleBets } from './bets';
import { dkBeats, dkDeck, dkSort, rankOf, rnd, suitOf } from './cards';
import { DK_HAND, DK_MAX_ATTACK, MAX_SEATS, SH_ORD } from './constants';
import { reignOf, setReign } from './games';
import { offerRematch, settleDuel } from './rematch';
import { addLog, countGame, pIdx, statsOf } from './state';
import type { Action, ActResult, Card, DkPair, DkState, DkView, Rng, State, Suit, Table } from './types';

type DkAny = DkState | DkView;

function dk(st: State): DkState {
  if (!st.dk) throw new Error('Durak ist nicht gestartet');
  return st.dk;
}

const count = (x: Card[] | number | undefined): number => (typeof x === 'number' ? x : (x?.length ?? 0));

export const dkTrump = (D: Pick<DkAny, 'trump'>): Suit => suitOf(D.trump);

/** Spielt diese Person noch mit (am Tisch und nicht fertig)? */
export const dkLive = (t: Table, id: string): boolean => !!t.dk && id in t.dk.P && !t.dk.finished.includes(id);

/** Karten auf der Hand, auch in einer Ansicht mit fremden Händen als Zahl. */
export const dkCount = (t: Table, id: string): number => count(t.dk?.P[id]);

/** Alle, die noch mitspielen, in Sitzreihenfolge. */
export function dkLiveIds(t: Table): string[] {
  return t.players.filter((p) => dkLive(t, p.id)).map((p) => p.id);
}

/** Nächste Person im Uhrzeigersinn nach `id`, die noch mitspielt. Gibt es keine andere, `id` selbst. */
export function dkNext(t: Table, id: string): string {
  const n = t.players.length;
  const i = pIdx(t, id);
  for (let k = 1; k <= n; k++) {
    const p = t.players[(i + k) % n];
    if (p && dkLive(t, p.id) && p.id !== id) return p.id;
  }
  return id;
}

/**
 * Wer den Angriff beim Weiterschieben bekäme: der Nächste, der noch Karten hat. Bei leerem Stapel ist schon fertig,
 * wer gerade seine letzte Karte gelegt hat, auch wenn das erst am Ende des Angriffs eingetragen wird.
 */
export function dkNextTarget(t: Table, id: string): string {
  const n = t.players.length;
  const i = pIdx(t, id);
  const deck = count(t.dk?.deck as Card[] | number | undefined);
  for (let k = 1; k <= n; k++) {
    const p = t.players[(i + k) % n];
    if (p && p.id !== id && dkLive(t, p.id) && (deck > 0 || dkCount(t, p.id) > 0)) return p.id;
  }
  return id;
}

/** Person vor `id` im Uhrzeigersinn, die noch mitspielt. */
export function dkPrev(t: Table, id: string): string {
  const n = t.players.length;
  const i = pIdx(t, id);
  for (let k = 1; k <= n; k++) {
    const p = t.players[(i - k + n * 2) % n];
    if (p && dkLive(t, p.id) && p.id !== id) return p.id;
  }
  return id;
}

/** Werte, die gerade auf dem Tisch liegen (Angriff und Verteidigung). Nur diese dürfen nachgelegt werden. */
export function dkTableRanks(D: Pick<DkAny, 'table'>): Set<string> {
  const s = new Set<string>();
  D.table.forEach((p) => {
    s.add(rankOf(p.a));
    if (p.d) s.add(rankOf(p.d));
  });
  return s;
}

export const dkOpen = (D: Pick<DkAny, 'table'>): DkPair[] => D.table.filter((p) => !p.d);

/** So viele Karten passen noch in diesen Angriff. */
export const dkRoom = (D: Pick<DkAny, 'table' | 'limit'>): number => Math.max(0, D.limit - D.table.length);

/**
 * Auf wen die Partie gerade wartet: leerer Tisch heißt der Angreifer, offene Karten der Verteidiger, sonst alle,
 * die noch nachlegen könnten und nicht gepasst haben. Passen gilt, bis durch Schlagen ein neuer Wert auf dem Tisch
 * liegt oder der Verteidiger aufnimmt oder weiterschiebt. Bis dahin darf, wer gepasst hat, nicht nachlegen und
 * wird nicht abgewartet.
 */
export function dkWaiting(t: Table): string[] {
  const D = t.dk;
  if (!D || t.phase !== 'play') return [];
  if (!D.table.length) return [D.att];
  if (!D.take && dkOpen(D).length) return [D.def];
  return dkAttackers(t).filter((id) => !D.done.includes(id));
}

/** Wer gerade nachlegen darf: alle außer dem Verteidiger, die noch Karten haben. */
export function dkAttackers(t: Table): string[] {
  const D = t.dk;
  if (!D) return [];
  return dkLiveIds(t).filter((id) => id !== D.def && dkCount(t, id) > 0);
}

/** Darf `pid` diese Karten (Indizes seiner Hand) jetzt angreifen oder nachlegen? Sonst die Erklärung. */
export function dkAttackError(t: Table, pid: string, cards: Card[]): string | null {
  const D = t.dk;
  if (!D || t.phase !== 'play') return 'Das geht gerade nicht.';
  if (pid === D.def) return 'Du verteidigst gerade.';
  if (!cards.length) return 'Wähle zuerst eine Karte.';
  if (!D.table.length) {
    if (pid !== D.att) return 'Zuerst greift jemand anderes an.';
    const r = rankOf(cards[0]);
    if (!cards.every((c) => rankOf(c) === r)) return 'Angreifen geht nur mit gleichen Werten.';
  } else {
    // Passen gilt, bis ein neuer Wert liegt oder aufgenommen wird. Das hängt nur am offenen Tisch, nie an Handkarten
    if (D.done.includes(pid))
      return D.take
        ? 'Du hast gepasst. In diesen Angriff legst du nichts mehr nach.'
        : 'Du hast gepasst. Nachlegen geht erst wieder bei einem neuen Wert oder wenn aufgenommen wird.';
    const ranks = dkTableRanks(D);
    if (!cards.every((c) => ranks.has(rankOf(c))))
      return 'Nachlegen geht nur mit Werten, die schon auf dem Tisch liegen.';
  }
  const room = dkRoom(D);
  if (cards.length > room)
    return room === 1
      ? 'Es passt nur noch eine Karte in diesen Angriff.'
      : room
        ? `Es passen nur noch ${room} Karten in diesen Angriff.`
        : 'In diesen Angriff passt nichts mehr.';
  return null;
}

/** Kann der Verteidiger mit diesen Karten weiterschieben? Sonst die Erklärung. */
export function dkTransferError(t: Table, pid: string, cards: Card[]): string | null {
  const D = t.dk;
  if (!D || t.phase !== 'play') return 'Das geht gerade nicht.';
  if (!t.rules.dk?.transfer) return 'Weiterschieben ist an diesem Tisch aus.';
  if (pid !== D.def) return 'Weiterschieben kann nur, wer verteidigt.';
  if (D.take || !D.table.length || D.table.some((p) => p.d))
    return 'Weiterschieben geht nur, bevor du etwas geschlagen hast.';
  if (!cards.length) return 'Wähle zuerst eine Karte.';
  const r = rankOf(D.table[0].a);
  if (!cards.every((c) => rankOf(c) === r)) return 'Weiterschieben geht nur mit dem gleichen Wert.';
  const total = D.table.length + cards.length;
  if (total > DK_MAX_ATTACK) return 'Mehr als sechs Karten gehen in keinen Angriff.';
  const nd = dkNextTarget(t, pid);
  if (nd === pid || dkCount(t, nd) < total) return 'Der Nächste hat dafür zu wenige Karten.';
  return null;
}

/** Wer den niedrigsten Trumpf hat, beginnt die erste Partie. Hat niemand Trumpf, gibt es null. */
function lowestTrump(st: State, D: DkState): string | null {
  const ts = dkTrump(D);
  let best: string | null = null;
  let bo = 99;
  st.players.forEach((p) => {
    D.P[p.id]?.forEach((c) => {
      if (suitOf(c) === ts && SH_ORD[rankOf(c)] < bo) {
        bo = SH_ORD[rankOf(c)];
        best = p.id;
      }
    });
  });
  return best;
}

/** `st.turn` zeigt auf die erste Person, auf die die Partie wartet (Zug-Ton, Tab-Hinweis). */
function syncTurn(st: State): void {
  const D = dk(st);
  const who = dkWaiting(st)[0] ?? (D.table.length ? D.def : D.att);
  st.turn = pIdx(st, who);
}

function beginBout(st: State, att: string, def?: string): void {
  const D = dk(st);
  D.att = att;
  D.def = def ?? dkNext(st, att);
  D.table = [];
  D.take = false;
  D.done = [];
  D.bout++;
  D.limit = Math.min(DK_MAX_ATTACK, D.P[D.def].length);
  syncTurn(st);
}

export function dkStart(st: State, rng?: Rng): ActResult {
  const keep = st.players.filter((p) => p.id === st.host || (st.phase === 'lobby' ? p.online : !p.gone));
  if (keep.length < 2) return 'Ihr braucht mindestens zwei Leute am Tisch.';
  if (keep.length > MAX_SEATS.durak) return `Durak geht mit höchstens ${MAX_SEATS.durak} Leuten.`;
  st.players = keep;
  st.players.forEach((p) => {
    p.out = false;
    p.ready = false;
    p.place = 0;
    delete p.gone;
    p.dkc ??= 0;
  });
  st.games++;
  st.round = 1;
  st.winner = null;
  st.result = null;
  st.turn = -1;
  st.last = null;
  st.sh = null;
  const deck = dkDeck(st.players.length, rng);
  const size = deck.length;
  const P: Record<string, Card[]> = {};
  st.players.forEach((p) => (P[p.id] = []));
  for (let r = 0; r < DK_HAND; r++) {
    for (const p of st.players) {
      const c = deck.pop();
      if (c) P[p.id].push(c);
    }
  }
  // Die unterste Karte liegt offen unter dem Stapel. Ist nichts übrig, zählt die zuletzt gegebene Karte
  const last = P[st.players[st.players.length - 1].id];
  const trump = deck.length ? deck[0] : last[last.length - 1];
  const ts = suitOf(trump);
  Object.values(P).forEach((h) => dkSort(h, ts));
  st.dk = {
    deck,
    trump,
    P,
    table: [],
    att: '',
    def: '',
    take: false,
    done: [],
    limit: DK_MAX_ATTACK,
    bout: 0,
    discard: 0,
    finished: [],
    durak: null,
    size,
  };
  st.phase = 'play';
  addLog(st, { k: 'game', g: st.games, game: 'durak' });
  // Der Durak der letzten Partie wird zuerst angegriffen, sonst beginnt der niedrigste Trumpf
  const prev = reignOf(st, 'durak')?.lose;
  const D = st.dk;
  let rand = false;
  if (prev && prev in P) beginBout(st, dkPrev(st, prev), prev);
  else {
    const low = lowestTrump(st, D);
    rand = !low;
    beginBout(st, low ?? st.players[Math.floor(rnd(rng) * st.players.length)].id);
  }
  addLog(st, {
    k: 'dkdeal',
    trump,
    att: D.att,
    def: D.def,
    ...(prev && prev in P ? { prev: true } : {}),
    ...(rand ? { rnd: true } : {}),
  });
  return null;
}

function takeAt(arr: Card[], idx: number[]): Card[] {
  const cards = idx.map((i) => arr[i]);
  [...idx].sort((x, y) => y - x).forEach((i) => arr.splice(i, 1));
  return cards;
}

/**
 * Gültige, eindeutige Indizes einer Hand. Kommen Karten mit, zählen sie: So spielt ein Gast nie eine andere
 * Karte, nur weil sich seine Hand verschoben hat, bevor die neue Ansicht da war. Fehlt eine, gibt es null.
 */
function pick(hand: Card[], raw: unknown, cards?: unknown): number[] | null {
  const idx: number[] = [];
  if (Array.isArray(cards) && cards.length) {
    for (const c of cards.slice(0, DK_MAX_ATTACK)) {
      const i = hand.findIndex((x, j) => x === c && !idx.includes(j));
      if (i < 0) return null;
      idx.push(i);
    }
    return idx;
  }
  (Array.isArray(raw) ? raw.slice(0, DK_MAX_ATTACK) : []).forEach((x) => {
    const i = Number(x) | 0;
    if (i >= 0 && i < hand.length && !idx.includes(i)) idx.push(i);
  });
  return idx;
}

const GONE = 'Die Karte hast du nicht mehr auf der Hand.';

export function dkAct(st: State, pid: string, _pi: number, a: Action, rng?: Rng): ActResult {
  const D = st.dk;
  if (!D) return 'Das geht gerade nicht.';
  if (a.type === 'shbet') return shPlaceBet(st, pid, a.on);
  if (st.phase !== 'play') return 'Das geht gerade nicht.';
  if (!dkLive(st, pid)) return 'Du bist schon fertig.';
  const hand = D.P[pid];
  switch (a.type) {
    case 'dkattack': {
      const idx = pick(hand, a.idx, a.cards);
      if (!idx) return GONE;
      const cards = idx.map((i) => hand[i]);
      const err = dkAttackError(st, pid, cards);
      if (err) return err;
      const lead = !D.table.length;
      takeAt(hand, idx);
      D.table.push(...cards.map((c) => ({ a: c, by: pid })));
      // Wer gepasst hat, kommt nicht bis hier (dkAttackError). Das Passen der anderen bleibt stehen
      addLog(st, lead ? { k: 'dkattack', p: pid, cards, lead: true } : { k: 'dkattack', p: pid, cards });
      st.last = { k: 'dkattack', p: pid, n: st.n, cards };
      check(st, rng);
      return null;
    }
    case 'dkdefend': {
      if (pid !== D.def) return 'Schlagen kann nur, wer verteidigt.';
      if (D.take) return 'Du nimmst schon auf.';
      // Mit Karten statt Indizes: gemeint ist genau dieser Angriff und genau diese Karte
      const pair = a.ac ? D.table.find((p) => p.a === a.ac) : D.table[Number(a.a) | 0];
      if (!pair) return 'Diese Karte liegt nicht auf dem Tisch.';
      if (pair.d) return 'Diese Karte ist schon geschlagen.';
      const hi = a.c ? hand.indexOf(a.c) : Number(a.i) | 0;
      if (a.c && hi < 0) return GONE;
      const c = hand[hi];
      if (!c || hi < 0) return 'Wähle zuerst eine Karte.';
      if (!dkBeats(c, pair.a, dkTrump(D))) return 'Die Karte schlägt das nicht.';
      // Nur ein neuer Wert auf dem Tisch bringt neue Möglichkeiten zum Nachlegen. Das hängt nur vom Tisch ab,
      // nie von Handkarten, sonst verriete das Etikett „passt ✓“, wer den Wert hat
      const fresh = !dkTableRanks(D).has(rankOf(c));
      hand.splice(hi, 1);
      pair.d = c;
      if (fresh) D.done = [];
      addLog(st, { k: 'dkdefend', p: pid, a: pair.a, d: c });
      st.last = { k: 'dkdefend', p: pid, n: st.n, cards: [c] };
      check(st, rng);
      return null;
    }
    case 'dktake': {
      if (pid !== D.def) return 'Aufnehmen kann nur, wer verteidigt.';
      if (D.take) return null;
      if (!dkOpen(D).length) return 'Alles ist geschlagen.';
      D.take = true;
      D.done = [];
      addLog(st, { k: 'dktake', p: pid });
      st.last = { k: 'dktake', p: pid, n: st.n };
      check(st, rng);
      return null;
    }
    case 'dkpass': {
      if (pid === D.def) return 'Du verteidigst gerade.';
      if (!D.table.length) return pid === D.att ? 'Du musst zuerst angreifen.' : 'Noch liegt nichts auf dem Tisch.';
      if (!D.take && dkOpen(D).length) return 'Erst muss alles geschlagen sein.';
      if (D.done.includes(pid)) return null;
      D.done.push(pid);
      addLog(st, { k: 'dkpass', p: pid });
      st.last = { k: 'dkpass', p: pid, n: st.n };
      check(st, rng);
      return null;
    }
    case 'dktransfer': {
      const idx = pick(hand, a.idx, a.cards);
      if (!idx) return GONE;
      const cards = idx.map((i) => hand[i]);
      const err = dkTransferError(st, pid, cards);
      if (err) return err;
      const nd = dkNextTarget(st, pid);
      takeAt(hand, idx);
      D.table.push(...cards.map((c) => ({ a: c, by: pid })));
      // Der ursprüngliche Angreifer bleibt, er zieht weiter zuerst nach
      D.def = nd;
      D.limit = Math.min(DK_MAX_ATTACK, D.P[nd].length);
      D.done = [];
      const tn = st.players[pIdx(st, nd)]?.name;
      addLog(st, { k: 'dktransfer', p: pid, cards, to: nd, tn });
      st.last = { k: 'dktransfer', p: pid, n: st.n, cards };
      syncTurn(st);
      return null;
    }
  }
  return 'Das geht gerade nicht.';
}

/** Nach jedem Zug: Ist der Angriff vorbei? */
function check(st: State, rng?: Rng): void {
  const D = dk(st);
  syncTurn(st);
  if (!D.table.length) return;
  const allDone = dkAttackers(st).every((id) => D.done.includes(id));
  const full = D.table.length >= D.limit;
  if (D.take) {
    if (full || allDone) resolve(st, false, rng);
    return;
  }
  if (dkOpen(D).length) return;
  if (full || !D.P[D.def].length || allDone) resolve(st, true, rng);
}

/** Angriff vorbei: geschlagen heißt alles weg, sonst nimmt der Verteidiger. Dann nachziehen und weiter. */
function resolve(st: State, beaten: boolean, _rng?: Rng): void {
  const D = dk(st);
  const def = D.def;
  const cards = D.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a]));
  if (beaten) {
    D.discard += cards.length;
    addLog(st, { k: 'dkbito', p: def, cnt: cards.length });
    st.last = { k: 'dkbito', p: def, n: st.n, cnt: cards.length };
  } else {
    D.P[def].push(...cards);
    dkSort(D.P[def], dkTrump(D));
    addLog(st, { k: 'dkpickup', p: def, cnt: cards.length });
    st.last = { k: 'dkpickup', p: def, n: st.n, cnt: cards.length };
  }
  D.table = [];
  D.take = false;
  D.done = [];
  draw(st);
  finish(st);
  const live = dkLiveIds(st);
  if (live.length <= 1) {
    dkEnd(st, live[0] ?? null);
    return;
  }
  // Geschlagen: Der Verteidiger greift als Nächstes an. Aufgenommen: Er setzt aus
  const next = beaten && dkLive(st, def) ? def : dkNext(st, def);
  beginBout(st, next);
}

/** Auf sechs nachziehen: zuerst der Angreifer, dann reihum, der Verteidiger zuletzt. */
function draw(st: State): void {
  const D = dk(st);
  if (!D.deck.length) return;
  const n = st.players.length;
  const ai = pIdx(st, D.att);
  const order: string[] = [];
  for (let k = 0; k < n; k++) {
    const id = st.players[(ai + k) % n]?.id;
    if (id && id !== D.def && dkLive(st, id)) order.push(id);
  }
  if (dkLive(st, D.def)) order.push(D.def);
  const ts = dkTrump(D);
  for (const id of order) {
    const h = D.P[id];
    while (h.length < DK_HAND && D.deck.length) h.push(D.deck.pop() as Card);
    dkSort(h, ts);
  }
}

/**
 * Ist der Stapel leer, ist fertig, wer keine Karten mehr hat. Wer im selben Angriff fertig wird, teilt sich den
 * Platz, die Sitzreihenfolge entscheidet nichts.
 */
function finish(st: State): void {
  const D = dk(st);
  if (D.deck.length) return;
  const place = D.finished.length + 1;
  st.players.forEach((p) => {
    if (!dkLive(st, p.id) || D.P[p.id].length) return;
    D.finished.push(p.id);
    p.place = place;
    addLog(st, { k: 'dkout', p: p.id, place });
  });
}

/** Partie vorbei: Bilanz, Krone, Narrenkappe, Tipps, dann Revanche. `dkend` steht vor allem, was danach kommt. */
function dkEnd(st: State, durak: string | null): void {
  const D = dk(st);
  D.durak = durak;
  st.phase = 'over';
  st.turn = -1;
  if (durak) {
    const lp = st.players[pIdx(st, durak)];
    if (lp) {
      lp.dkc = (lp.dkc ?? 0) + 1;
      lp.place = D.finished.length + 1;
    }
  }
  const names = Object.fromEntries(st.players.map((p) => [p.id, p.name]));
  st.result = { reason: 'durak', ranking: D.finished.slice(), durak, names };
  // Sieger nur, wenn jemand allein als Erster fertig war. Geteilter erster Platz heißt keine Krone
  const firsts = st.players.filter((p) => p.place === 1 && D.finished.includes(p.id));
  st.winner = firsts.length === 1 ? firsts[0].id : null;
  setReign(st, 'durak', st.winner, durak);
  if (st.winner) {
    const wp = st.players[pIdx(st, st.winner)];
    if (wp) wp.wins = (wp.wins || 0) + 1;
  }
  countGame(st, 'durak', st.winner);
  st.players.forEach((p) => {
    if (p.gone || !p.place) return;
    const ps = statsOf(p, 'durak');
    ps.places = (ps.places ?? 0) + p.place;
  });
  st.players.forEach((p) => {
    p.ready = false;
  });
  const bets = shSettleBets(st, durak);
  if (bets.length) st.result.bets = bets;
  const hits = Object.fromEntries(bets.filter((b) => b.ok).map((b) => [b.p, { q: b.q, name: names[b.p] ?? '' }]));
  addLog(
    st,
    Object.keys(hits).length ? { k: 'dkend', p: durak ?? undefined, hits } : { k: 'dkend', p: durak ?? undefined },
  );
  settleDuel(st);
  offerRematch(st, durak ? [durak] : []);
}

/** Günstigste Karte, die `a` schlägt: erst ohne Trumpf, dann der kleinste Trumpf. */
export function dkCheapest(hand: Card[], a: Card, trump: Suit): number {
  let best = -1;
  let bo = 999;
  hand.forEach((c, i) => {
    if (!dkBeats(c, a, trump)) return;
    const o = (suitOf(c) === trump ? 100 : 0) + SH_ORD[rankOf(c)];
    if (o < bo) {
      bo = o;
      best = i;
    }
  });
  return best;
}

/**
 * Einfacher Ersatzzug, wenn jemand offline ist oder ein Zug der KI scheitert: Verteidiger schlagen die erste
 * offene Karte so billig wie möglich oder nehmen, Angreifer legen die kleinste Karte oder passen.
 */
export function dkAuto(st: State, pid: string, rng?: Rng): ActResult {
  const D = st.dk;
  if (!D || st.phase !== 'play' || !dkLive(st, pid)) return null;
  const hand = D.P[pid];
  const pi = pIdx(st, pid);
  if (pid === D.def) {
    if (D.take) return null;
    const open = D.table.findIndex((p) => !p.d);
    if (open < 0) return null;
    const i = dkCheapest(hand, D.table[open].a, dkTrump(D));
    return dkAct(st, pid, pi, i >= 0 ? { type: 'dkdefend', a: open, i } : { type: 'dktake' }, rng);
  }
  if (!D.table.length) {
    if (pid !== D.att || !hand.length) return null;
    // Die kleinste Karte, Trumpf nur, wenn nichts anderes da ist (die Hand ist so sortiert)
    return dkAct(st, pid, pi, { type: 'dkattack', idx: [0] }, rng);
  }
  if (!D.take && dkOpen(D).length) return null;
  return dkAct(st, pid, pi, { type: 'dkpass' }, rng);
}

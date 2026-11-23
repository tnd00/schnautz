/* Shithead (Palace, Karma) mit 52 Karten, Ass hoch. */
import { rankOf, shDeck, shSort } from './cards';
import { DEFAULT_RULES, SH_ORD, SH_TWO_DECKS } from './constants';
import { checkReady } from './flow';
import { addLog, countGame, nextActive, pIdx, statsOf } from './state';
import type {
  Action,
  ActResult,
  Card,
  Player,
  Rank,
  Rng,
  Rules,
  ShPlayerState,
  ShRules,
  ShSource,
  ShState,
  State,
  Table,
} from './types';
import { shPlaceBet, shSettleBets } from './bets';
import { offerRematch, settleDuel } from './rematch';
import { setReign } from './games';

type PileTable = { rules: Pick<Rules, 'sh'>; sh: { pile: Card[] } | null };

export const shR = (st: { rules: Pick<Rules, 'sh'> }): ShRules => st.rules?.sh ?? DEFAULT_RULES.sh;

/** 2, 3 und 10 gehen (je nach Regel) immer. */
export function shAlways(st: { rules: Pick<Rules, 'sh'> }, r: Rank): boolean {
  const R = shR(st);
  return (r === '2' && R.two) || (r === '10' && R.ten) || (r === '3' && R.three);
}

/** Oberste Karte, die zählt. Durchsichtige 3er werden übersprungen. */
export function shTop(st: PileTable): Rank | null {
  const R = shR(st);
  const pile = st.sh?.pile ?? [];
  for (let i = pile.length - 1; i >= 0; i--) {
    const r = rankOf(pile[i]);
    if (r === '3' && R.three) continue;
    return r;
  }
  return null;
}

export function shCanPlay(st: PileTable, r: Rank): boolean {
  if (shAlways(st, r)) return true;
  const R = shR(st);
  const t = shTop(st);
  if (!t) return true;
  if (t === '2' && R.two) return true;
  if (t === '7' && R.seven) return SH_ORD[r] <= 7;
  return SH_ORD[r] >= SH_ORD[t];
}

/** Liegen oben vier gleiche Karten? */
export function shFour(st: State): boolean {
  const p = sh(st).pile;
  if (p.length < 4) return false;
  const r = rankOf(p[p.length - 1]);
  for (let i = 2; i <= 4; i++) if (rankOf(p[p.length - i]) !== r) return false;
  return true;
}

/** Shithead-Zustand, der in allen Spielphasen nach shStart existiert. */
function sh(st: State): ShState {
  if (!st.sh) throw new Error('Shithead ist nicht gestartet');
  return st.sh;
}

/** Ab sechs Leuten reicht ein Deck nicht mehr (9 Karten je Person), auf Wunsch schon ab fünf zwei. */
export const shDecksFor = (n: number, R: ShRules): number =>
  n >= SH_TWO_DECKS || (n === SH_TWO_DECKS - 1 && R.deck5) ? 2 : 1;

export function shStart(st: State, rng?: Rng): ActResult {
  const keep = st.players.filter((p) => p.id === st.host || (st.phase === 'lobby' ? p.online : !p.gone));
  if (keep.length < 2) return 'Ihr braucht mindestens zwei Leute am Tisch.';
  st.players = keep;
  st.players.forEach((p) => {
    p.out = false;
    p.ready = false;
    p.place = 0;
    delete p.gone;
    p.shc ??= 0;
  });
  st.games++;
  st.round = 1;
  st.winner = null;
  st.result = null;
  st.turn = -1;
  st.last = null;
  const decks = shDecksFor(st.players.length, shR(st));
  const deck = shDeck(rng, decks);
  const P: Record<string, ShPlayerState> = {};
  st.players.forEach((p) => {
    P[p.id] = { down: deck.splice(0, 3), up: deck.splice(0, 3), hand: shSort(deck.splice(0, 3)) };
  });
  st.sh = { deck, pile: [], burned: [], P, finished: [], shithead: null, decks };
  st.phase = 'swap';
  addLog(st, { k: 'game', g: st.games, game: 'shithead' });
  addLog(st, { k: 'shdeal' });
  return null;
}

/** Nach der Tauschrunde: Die niedrigste Handkarte fängt an (Sonderkarten zählen nicht). */
export function shBegin(st: State): void {
  const S = sh(st);
  st.phase = 'play';
  st.players.forEach((p) => {
    p.ready = false;
  });
  const n = st.players.length;
  const off = st.games % n;
  let best = 99;
  let bi = -1;
  let bc: Card | null = null;
  for (let k = 0; k < n; k++) {
    const i = (off + k) % n;
    const p = st.players[i];
    if (p.out) continue;
    S.P[p.id].hand.forEach((c) => {
      const r = rankOf(c);
      if (shAlways(st, r)) return;
      if (SH_ORD[r] < best) {
        best = SH_ORD[r];
        bi = i;
        bc = c;
      }
    });
  }
  if (bi < 0) {
    bi = st.players[off].out ? nextActive(st, off) : off;
    bc = null;
  }
  st.turn = bi;
  addLog(st, { k: 'shstart', p: st.players[bi].id, card: bc });
  shSyncWin(st);
}

/**
 * Neuer Stapel: Ist der Stapel leer, öffnet sich das 4er-Fenster (falls die Regel an ist).
 * Es bleibt offen, bis die Person am Zug ihre erste Karte legt.
 */
export function shSyncWin(st: State): void {
  const S = st.sh;
  if (!S) return;
  if (st.phase !== 'play' || !shR(st).four) {
    S.win = null;
    return;
  }
  if (S.pile.length || S.win) return;
  S.win = { r: '4', by: [], id: st.n, lock: true };
}

/** Wert und Anzahl der gleichen Karten ganz oben auf dem Stapel. */
export function shTopRun(st: { sh: { pile: Card[] } | null }): { r: Rank | null; k: number } {
  const p = st.sh?.pile ?? [];
  if (!p.length) return { r: null, k: 0 };
  const r = rankOf(p[p.length - 1]);
  let k = 0;
  for (let i = p.length - 1; i >= 0 && rankOf(p[i]) === r; i--) k++;
  return { r, k };
}

/** Eigene Karten eines Spielers, falls sie in dieser Ansicht sichtbar sind. */
function ownCards(st: Table, pid: string): { hand: Card[]; up: Card[] } | null {
  const P = st.sh?.P[pid];
  if (!P || !Array.isArray(P.hand)) return null;
  return { hand: P.hand, up: P.up };
}

function canAct(st: Table, pid: string): boolean {
  const pi = pIdx(st, pid);
  return pi >= 0 && !st.players[pi].out && !!st.sh && !st.sh.finished.includes(pid);
}

export interface BombOption {
  src: 'hand' | 'up';
  idx: number[];
  r: Rank;
}

/** Bombe einwerfen: Wer die fehlenden Karten zu vier gleichen hat, darf sie jederzeit reinwerfen. */
export function shCanBomb(st: Table, pid: string): BombOption | null {
  const S = st.sh;
  if (!S || st.phase !== 'play' || S.win || !shR(st).cut || !canAct(st, pid)) return null;
  const own = ownCards(st, pid);
  if (!own) return null;
  const t = shTopRun(st);
  if (!t.r || t.k >= 4) return null;
  const src = own.hand.length ? 'hand' : own.up.length ? 'up' : null;
  if (!src) return null;
  const idx: number[] = [];
  own[src].forEach((c, i) => {
    if (rankOf(c) === t.r) idx.push(i);
  });
  // Mit zwei Decks kann man mehr gleiche haben als fehlen, eingeworfen werden genau die fehlenden
  if (idx.length < 4 - t.k) return null;
  return { src, idx: idx.slice(0, 4 - t.k), r: t.r };
}

export interface ThrowOption {
  src: 'hand' | 'up';
  idx: number[];
}

/**
 * Eigene 4er, solange das Fenster offen ist. Das gilt auch für die Person am Zug, sie spielt danach ganz normal.
 * Wie bei der Bombe zählen erst die Handkarten, bei leerer Hand die offenen Tischkarten.
 */
export function shCanThrow(st: Table, pid: string): ThrowOption | null {
  const S = st.sh;
  if (!S?.win || st.phase !== 'play' || !canAct(st, pid)) return null;
  const own = ownCards(st, pid);
  if (!own) return null;
  const src = own.hand.length ? 'hand' : own.up.length ? 'up' : null;
  if (!src) return null;
  const idx: number[] = [];
  own[src].forEach((c, i) => {
    if (rankOf(c) === S.win?.r) idx.push(i);
  });
  return idx.length ? { src, idx } : null;
}

export function shBurnNow(st: State, pid: string, cut: boolean): void {
  const S = sh(st);
  S.burned.push(...S.pile);
  S.pile = [];
  addLog(st, { k: 'shburn', p: pid, four: true, cut });
  st.last = { k: 'shburn', p: pid, n: st.n };
}

/** Nächster Spieler, der noch Karten hat. */
export function shNextIdx(st: State, i: number): number {
  const n = st.players.length;
  const finished = sh(st).finished;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    const p = st.players[j];
    if (!p.out && !finished.includes(p.id)) return j;
  }
  return i;
}

export function shAdvance(st: State, skip: number): void {
  let j = st.turn;
  for (let s = 0; s <= skip; s++) j = shNextIdx(st, j);
  st.turn = j;
}

/** Zieht wieder auf drei Handkarten nach, solange der Stapel reicht. */
export function shDraw(st: State, P: ShPlayerState): void {
  const deck = sh(st).deck;
  while (P.hand.length < 3 && deck.length) P.hand.push(deck.shift() as Card);
  shSort(P.hand);
}

export function shEnd(st: State, loser: string | null, quitter?: string): void {
  const S = sh(st);
  S.shithead = loser;
  S.win = null;
  if (loser) {
    const lp = st.players[pIdx(st, loser)];
    if (lp) {
      lp.shc = (lp.shc ?? 0) + 1;
      lp.place = S.finished.length + 1;
    }
  }
  const names = Object.fromEntries(st.players.map((p) => [p.id, p.name]));
  st.result = { reason: 'shithead', ranking: S.finished.slice(), shithead: loser, quit: quitter ?? null, names };
  st.phase = 'over';
  st.turn = -1;
  st.winner = S.finished[0] ?? null;
  setReign(st, 'shithead', st.winner, loser);
  if (st.winner) {
    const wp = st.players[pIdx(st, st.winner)];
    if (wp) wp.wins = (wp.wins || 0) + 1;
  }
  countGame(st, 'shithead', st.winner);
  st.players.forEach((p) => {
    if (p.gone || !p.place) return;
    const ps = statsOf(p, 'shithead');
    ps.places = (ps.places ?? 0) + p.place;
  });
  st.players.forEach((p) => {
    p.ready = false;
  });
  // Feste Reihenfolge am Partieende: shdone steht direkt vor shend, alles Weitere kommt danach
  const bets = shSettleBets(st, loser);
  if (bets.length) st.result.bets = bets;
  const hits = Object.fromEntries(bets.filter((b) => b.ok).map((b) => [b.p, { q: b.q, name: names[b.p] ?? '' }]));
  addLog(
    st,
    Object.keys(hits).length ? { k: 'shend', p: loser ?? undefined, hits } : { k: 'shend', p: loser ?? undefined },
  );
  settleDuel(st);
  offerRematch(st, loser && !quitter ? [loser] : []);
}

const stillPlaying = (st: State): Player[] => st.players.filter((x) => !x.out && !sh(st).finished.includes(x.id));

/**
 * Hat der Spieler keine Karten mehr, ist er fertig. Bleibt nur einer übrig, ist das der Shithead.
 * War er dran, geht es beim Nächsten weiter (`advance`).
 */
export function shFinishCheck(st: State, pid: string, skip: number, advance = true): boolean {
  const S = sh(st);
  const P = S.P[pid];
  if (P.hand.length || P.up.length || P.down.length) return false;
  S.finished.push(pid);
  const p = st.players[pIdx(st, pid)];
  p.place = S.finished.length;
  addLog(st, { k: 'shdone', p: pid, place: p.place });
  const left = stillPlaying(st);
  if (left.length <= 1) {
    shEnd(st, left[0]?.id ?? null);
    return true;
  }
  if (advance) shAdvance(st, skip);
  return true;
}

export function shAfterPlay(st: State, pid: string, cards: Card[], src: ShSource): ActResult {
  const S = sh(st);
  const P = S.P[pid];
  const R = shR(st);
  const r = rankOf(cards[0]);
  S.pile.push(...cards);
  addLog(st, { k: 'shplay', p: pid, cards, src });
  st.last = { k: 'shplay', p: pid, n: st.n, cards, src };
  shDraw(st, P);
  const burn = r === '10' && R.ten;
  const four = !burn && shFour(st);
  if (burn || four) {
    S.burned.push(...S.pile);
    S.pile = [];
    addLog(st, { k: 'shburn', p: pid, four, cut: false });
    st.last = { k: 'shburn', p: pid, n: st.n };
  }
  const skip = r === '8' && R.eight && !burn && !four ? cards.length : 0;
  if (shFinishCheck(st, pid, skip)) return null;
  if (burn || four) return null;
  shAdvance(st, skip);
  return null;
}

/** Spielt einen einfachen Zug für jemanden, der offline ist. */
export function shAuto(st: State, pid: string, rng?: Rng): ActResult {
  const S = sh(st);
  const P = S.P[pid];
  const pi = pIdx(st, pid);
  if (st.phase === 'swap') {
    st.players[pi].ready = true;
    checkReady(st, rng);
    return null;
  }
  if (st.phase !== 'play' || st.turn !== pi || S.win?.lock) return null;
  const src = P.hand.length ? 'hand' : P.up.length ? 'up' : null;
  if (!src) return shAct(st, pid, pi, { type: 'shblind', i: 0 }, rng);
  let best = -1;
  let bo = 99;
  P[src].forEach((c, i) => {
    const r = rankOf(c);
    if (!shCanPlay(st, r)) return;
    const o = shAlways(st, r) ? 50 + SH_ORD[r] : SH_ORD[r];
    if (o < bo) {
      bo = o;
      best = i;
    }
  });
  if (best < 0) return shAct(st, pid, pi, { type: 'shpickup' }, rng);
  return shAct(st, pid, pi, { type: 'shplay', from: src, idx: [best] }, rng);
}

/** Entfernt die Karten an den Indizes (absteigend, damit die übrigen Indizes stimmen). */
function takeAt(arr: Card[], idx: number[]): Card[] {
  const cards = idx.map((i) => arr[i]);
  [...idx].sort((x, y) => y - x).forEach((i) => arr.splice(i, 1));
  return cards;
}

export function shAct(st: State, pid: string, pi: number, a: Action, rng?: Rng): ActResult {
  const S = st.sh;
  if (!S) return 'Das geht gerade nicht.';
  const P = S.P[pid];
  if (!P || st.players[pi].out) return 'Du spielst diese Partie nicht mit.';
  switch (a.type) {
    case 'shbet':
      // Tippen ändert weder Zug noch Uhr noch 4er-Fenster
      return shPlaceBet(st, pid, a.on);
    case 'shswap': {
      if (st.phase !== 'swap') return 'Tauschen geht nur vor dem Start.';
      if (st.players[pi].ready) return 'Du hast schon auf Fertig gedrückt.';
      const h = a.h | 0;
      const u = a.u | 0;
      if (h < 0 || h >= P.hand.length || u < 0 || u >= P.up.length) return 'Ungültige Karte.';
      [P.hand[h], P.up[u]] = [P.up[u], P.hand[h]];
      shSort(P.hand);
      return null;
    }
    case 'shready':
      if (st.phase !== 'swap') return null;
      st.players[pi].ready = true;
      checkReady(st, rng);
      return null;
  }
  if (st.phase !== 'play') return 'Das geht gerade nicht.';
  const err = shPlayAct(st, S, P, pid, pi, a);
  if (!err) shSyncWin(st);
  return err;
}

/** Züge während der Partie. Danach prüft shAct, ob ein neuer Stapel beginnt. */
function shPlayAct(st: State, S: ShState, P: ShPlayerState, pid: string, pi: number, a: Action): ActResult {
  switch (a.type) {
    case 'shunlock':
      if (pid === st.host && S.win && a.id === S.win.id) S.win.lock = false;
      return null;
    case 'shthrow': {
      const t = shCanThrow(st, pid);
      if (!t) return S.win ? 'Du hast keine 4.' : 'Zu spät, die erste Karte liegt schon.';
      const cards = takeAt(P[t.src], t.idx);
      S.pile.push(...cards);
      if (!S.win?.by.includes(pid)) S.win?.by.push(pid);
      shDraw(st, P);
      addLog(st, { k: 'shthrow', p: pid, cards, src: t.src });
      st.last = { k: 'shplay', p: pid, n: st.n, cards, src: t.src, thrown: true };
      if (shFour(st)) {
        // Die vierte 4 ist eine Bombe: Wer sie reinwirft, ist dran
        S.win = null;
        shBurnNow(st, pid, true);
        st.turn = pi;
        shFinishCheck(st, pid, 0);
        // Ohne Bombe bleibt die Reihenfolge. Nur wer am Zug war und jetzt fertig ist, gibt weiter
      } else shFinishCheck(st, pid, 0, pi === st.turn);
      return null;
    }
    case 'shbomb': {
      const bm = shCanBomb(st, pid);
      if (!bm) return S.win ? 'Moment, die 4er werden noch reingeworfen.' : 'Zu spät, das geht nicht mehr.';
      const cards = takeAt(P[bm.src], bm.idx);
      S.pile.push(...cards);
      const out = pi !== st.turn;
      addLog(st, { k: 'shbomb', p: pid, cards, src: bm.src, out });
      st.last = { k: 'shplay', p: pid, n: st.n, cards, src: bm.src };
      shDraw(st, P);
      shBurnNow(st, pid, out);
      st.turn = pi;
      shFinishCheck(st, pid, 0);
      return null;
    }
  }
  if (pi !== st.turn) return 'Du bist gerade nicht dran.';
  if (S.win?.lock) return 'Kurz warten, erst dürfen alle ihre 4er reinwerfen.';
  switch (a.type) {
    case 'shplay': {
      const src = a.from === 'up' ? 'up' : 'hand';
      if (src === 'up' && P.hand.length) return 'Erst die Handkarten ausspielen.';
      const arr = P[src];
      const idx: number[] = [];
      (Array.isArray(a.idx) ? a.idx.slice(0, 60) : []).forEach((raw) => {
        const i = raw | 0;
        if (i >= 0 && i < arr.length && !idx.includes(i)) idx.push(i);
      });
      if (!idx.length) return 'Wähle zuerst eine Karte.';
      const r = rankOf(arr[idx[0]]);
      if (!idx.every((i) => rankOf(arr[i]) === r)) return 'Zusammen geht nur mit gleichem Wert.';
      if (!shCanPlay(st, r)) return 'Die Karte passt nicht auf den Stapel.';
      // Die erste Karte schließt das 4er-Fenster
      S.win = null;
      return shAfterPlay(st, pid, takeAt(arr, idx), src);
    }
    case 'shpickup': {
      if (!S.pile.length) return 'Der Stapel ist leer. Leg einfach eine Karte.';
      S.win = null;
      const cnt = S.pile.length;
      P.hand.push(...S.pile);
      S.pile = [];
      shSort(P.hand);
      addLog(st, { k: 'shpickup', p: pid, cnt });
      st.last = { k: 'shpickup', p: pid, n: st.n, cnt };
      shAdvance(st, 0);
      return null;
    }
    case 'shblind': {
      if (P.hand.length || P.up.length) return 'Erst Hand und offene Karten spielen.';
      const bi = a.i | 0;
      if (bi < 0 || bi >= P.down.length) return 'Ungültige Karte.';
      S.win = null;
      const [c] = P.down.splice(bi, 1);
      if (shCanPlay(st, rankOf(c))) return shAfterPlay(st, pid, [c], 'down');
      const cnt = S.pile.length + 1;
      P.hand.push(...S.pile, c);
      S.pile = [];
      shSort(P.hand);
      addLog(st, { k: 'shblindfail', p: pid, card: c, cnt });
      st.last = { k: 'shpickup', p: pid, n: st.n, cnt };
      shAdvance(st, 0);
      return null;
    }
  }
  return 'Unbekannte Aktion.';
}

import { strict as assert } from 'node:assert';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import type { Action, ActResult, Card, Rng, SchnautzResult, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { szResult } from '../../src/game/games';
import type { RejectArgs, RejectCode } from '../../src/game/reject';
import type { SeatResult } from '../../src/game/seats';
import { rejectText, type RejectCtx } from '../../src/content/texts';

/** Reproduzierbarer Zufall (LCG), damit fehlschlagende Partien nachspielbar sind. */
export function rngF(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function schnautzResult(st: State): SchnautzResult {
  const r = szResult(st.result);
  assert.ok(r, 'Schnautz-Ergebnis erwartet');
  return r;
}

/** Alle Shithead-Karten (52 je Deck) genau einmal im Spiel? */
export function shCardsOk(st: State): void {
  const S = st.sh;
  assert.ok(S);
  const want = 52 * (S.decks ?? 1);
  const all: Card[] = [...S.deck, ...S.pile, ...S.burned];
  Object.values(S.P).forEach((P) => all.push(...P.hand, ...P.up, ...P.down));
  assert.equal(all.length, want, `Kartenzahl ${all.length}`);
  assert.equal(new Set(all).size, want, 'doppelte Karten');
}

export const action = (a: Action): Action => a;

/** Alle spielen wie die KI, bis die Partie vorbei ist. `stop` bricht vorher ab. */
export function playOut(st: State, rng: Rng, stop?: (st: State) => boolean): void {
  for (let guard = 0; st.phase !== 'over' && guard < 20000; guard++) {
    if (stop?.(st)) return;
    if (st.sh?.win?.lock) act(st, st.host, { type: 'shunlock', id: st.sh.win.id }, rng);
    let moved = false;
    for (const p of st.players) {
      const a = botDecide(viewFor(st, p.id), rng, 'normal');
      if (a && !act(st, p.id, a, rng)) moved = true;
      if (moved && a?.type !== 'ready') break;
    }
    if (!moved) break;
  }
}

/**
 * Text einer Ablehnung, wie ihn die Person sieht. Mit `st` werden Platz-IDs zu Namen, ohne steht die ID. `me` ist der
 * Blickwinkel (eigener Platz heißt „du“), ohne `me` sieht niemand Bestimmtes zu.
 */
export function msgOf(r: ActResult | undefined, st?: State, me = ''): string {
  if (!r) return '';
  const ctx: RejectCtx = { me, name: (id) => (st ? st.players.find((p) => p.id === id)?.name : id) };
  return rejectText(r, ctx);
}

/** Code einer Ablehnung, null bei Erfolg. */
export function codeOf(r: ActResult | undefined): RejectCode | null {
  return r ? r.e : null;
}

/** Text der Ablehnung beim Platzsuchen, null wenn es einen Platz gab. */
export function seatErr(r: SeatResult, st?: State): string | null {
  return 'err' in r ? msgOf(r.err, st) : null;
}

/** Beispielbelegung je Code, nur mit erlaubten Argumentarten (Zahlen, Platz-IDs, Karten, Spiel). */
export const REJECT_SAMPLES: Readonly<Record<RejectCode, RejectArgs | undefined>> = {
  'any.unknown': undefined,
  'any.notSeated': undefined,
  'any.noSuchSeat': undefined,
  'any.hostOnly': undefined,
  'any.lobbyOnly': undefined,
  'any.running': undefined,
  'any.notStarted': undefined,
  'any.over': undefined,
  'any.roundOver': undefined,
  'any.notYourTurn': { p: 'p1' },
  'any.cardGone': undefined,
  'any.pickCard': undefined,
  'any.sameRank': undefined,
  'any.notPlaying': undefined,
  'any.done': undefined,
  'any.ready': undefined,
  'any.allHere': { p: 'p1' },
  'seat.tooFew': { min: 2 },
  'seat.tooMany': { max: 8, g: 'durak' },
  'seat.full': undefined,
  'seat.fullPlaying': undefined,
  'seat.taken': undefined,
  'net.oldPage': { g: 'cabo' },
  'net.update': undefined,
  'net.hostOld': undefined,
  'sh.swapOver': undefined,
  'sh.swapping': undefined,
  'sh.noFour': undefined,
  'sh.winClosed': undefined,
  'sh.blindOnly': undefined,
  'sh.bombWin': undefined,
  'sh.bombLate': undefined,
  'sh.cutOff': undefined,
  'sh.winLock': undefined,
  'sh.handFirst': undefined,
  'sh.noFit': { c: 'H7', top: 'SK' },
  'sh.pileEmpty': undefined,
  'sh.blindLast': undefined,
  'dk.defending': undefined,
  'dk.notLead': { p: 'p1' },
  'dk.rankNotOnTable': undefined,
  'dk.passed': undefined,
  'dk.passedTake': undefined,
  'dk.room': { n: 2 },
  'dk.transferOff': undefined,
  'dk.notDefender': { p: 'p1' },
  'dk.transferLate': undefined,
  'dk.taking': undefined,
  'dk.tableEmpty': { p: 'p1' },
  'dk.transferRank': { c: 'S9' },
  'dk.nextShort': { p: 'p1' },
  'dk.pairGone': undefined,
  'dk.beaten': { a: 'S9' },
  'dk.noBeat': { c: 'H7', a: 'S9' },
  'dk.allBeaten': undefined,
  'dk.leadFirst': undefined,
  'dk.openCards': { p: 'p1' },
  'dk.noTarget': undefined,
  'cb.peekOver': undefined,
  'cb.pickTwo': { n: 2 },
  'cb.peeking': undefined,
  'cb.drawn': undefined,
  'cb.pileNoCards': undefined,
  'cb.pileEmpty': undefined,
  'cb.deckEmpty': undefined,
  'cb.caboLate': undefined,
  'cb.called': { p: 'p1' },
  'cb.drawFirst': undefined,
  'cb.mustSwap': undefined,
  'cb.noPeek': undefined,
  'cb.pickOwn': undefined,
  'cb.noSpy': undefined,
  'cb.pickOther': undefined,
  'cb.noBlind': undefined,
  'cb.pickPair': undefined,
  'cb.pickSwap': undefined,
  'cb.snapOff': undefined,
  'cb.finishTurn': undefined,
  'sz.chosen': undefined,
  'sz.dealerOnly': { p: 'p1' },
  'sz.choosing': { p: 'p1' },
  'sz.knocked': { p: 'p1' },
  'sz.knockEarly': undefined,
  'bet.closed': undefined,
  'bet.notDone': undefined,
  'bet.twice': { on: 'p1' },
  'bet.targetDone': { p: 'p1' },
};

/*
 * Kleiner HTML-Baum und CSS-Selektoren ohne DOM, für die Bausteine am Tisch (tests/unit/table.test.ts, hooks.test.ts).
 * Kann Tags, #id, .klasse, [attr], [attr=wert], [attr~=wert], :not(einfach), Nachfahre, > und Kommalisten. Gedacht für
 * eigenes, wohlgeformtes HTML aus den Bausteinen, kein allgemeiner Parser.
 */
export interface El {
  tag: string;
  attrs: Record<string, string>;
  kids: El[];
  parent: El | null;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr']);

export function parseHTML(html: string): El {
  const root: El = { tag: '#root', attrs: {}, kids: [], parent: null };
  let cur = root;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>/g)) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let up: El | null = cur;
      while (up && up !== root && up.tag !== tag) up = up.parent;
      if (up && up !== root) cur = up.parent ?? root;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
    const el: El = { tag, attrs, kids: [], parent: cur };
    cur.kids.push(el);
    if (!m[4] && !VOID_TAGS.has(tag)) cur = el;
  }
  return root;
}

interface Comp {
  tag?: string;
  ids: string[];
  cls: string[];
  attrs: { k: string; op: '' | '=' | '~='; v: string }[];
  not: Comp[];
}

/** Teilt an Zeichen auf oberster Ebene, also nicht in [] oder () */
function splitTop(s: string, at: (ch: string) => boolean): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;
    if (!depth && at(ch)) {
      out.push(buf);
      buf = '';
    } else buf += ch;
  }
  out.push(buf);
  return out;
}

function parseComp(s: string): Comp {
  const c: Comp = { ids: [], cls: [], attrs: [], not: [] };
  const re = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w:-]+)(?:(~?=)"?([^"\]]*)"?)?\]|:not\(([^)]*)\)/g;
  for (const m of s.matchAll(re)) {
    if (m[1]) c.tag = m[1].toLowerCase();
    else if (m[2]) c.ids.push(m[2]);
    else if (m[3]) c.cls.push(m[3]);
    else if (m[4]) c.attrs.push({ k: m[4], op: (m[5] ?? '') as '' | '=' | '~=', v: m[6] ?? '' });
    else if (m[7]) c.not.push(parseComp(m[7]));
  }
  return c;
}

function matchComp(el: El, c: Comp): boolean {
  const cls = (el.attrs.class ?? '').split(/\s+/);
  if (c.tag && el.tag !== c.tag) return false;
  if (c.ids.some((id) => el.attrs.id !== id)) return false;
  if (c.cls.some((x) => !cls.includes(x))) return false;
  for (const a of c.attrs) {
    const v = el.attrs[a.k];
    if (v == null) return false;
    if (a.op === '=' && v !== a.v) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(a.v)) return false;
  }
  return !c.not.some((n) => matchComp(el, n));
}

type Step = { c: Comp; comb: ' ' | '>' };

/** Passt el auf die Kette bis Index i, rückwärts gelesen */
function matchChain(el: El, steps: Step[], i: number): boolean {
  if (!matchComp(el, steps[i].c)) return false;
  if (i === 0) return true;
  const comb = steps[i].comb;
  for (let p = el.parent; p && p.tag !== '#root'; p = p.parent) {
    if (matchChain(p, steps, i - 1)) return true;
    if (comb === '>') return false;
  }
  return false;
}

function parseSel(sel: string): Step[] {
  const steps: Step[] = [];
  let comb: ' ' | '>' = ' ';
  for (const part of splitTop(sel.replace(/\s*>\s*/g, ' > ').trim(), (ch) => ch === ' ')) {
    if (!part) continue;
    if (part === '>') comb = '>';
    else {
      steps.push({ c: parseComp(part), comb });
      comb = ' ';
    }
  }
  return steps;
}

/** Alle Elemente im Baum, auf die der Selektor passt */
export function qsa(root: El, sel: string): El[] {
  const chains = splitTop(sel, (ch) => ch === ',').map(parseSel);
  const out: El[] = [];
  const walk = (el: El): void => {
    for (const k of el.kids) {
      if (chains.some((ch) => matchChain(k, ch, ch.length - 1))) out.push(k);
      walk(k);
    }
  };
  walk(root);
  return out;
}

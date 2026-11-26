/*
 * Shithead-Tisch als `NewTable` (Plan 2.8 Runde 3): Gegner, Stapel, Status mit 4er-Fenster und Bombe, eigener Platz,
 * Tauschrunde und Ergebnis als Modelle, die Bausteine in src/ui/table zeichnen. Während eines Ablaufs liest die Mitte
 * den Zwischenstand aus `SEQ.ov`, die eigene Hand vor dem Aufnehmen ebenso.
 */
import { shBetsOn } from '../../game/bets';
import { rankOf } from '../../game/cards';
import { SH_WIN_MS } from '../../game/constants';
import { rj, type Reject } from '../../game/reject';
import { shCanBomb, shCanPlay, shCanThrow, shNeed, shTopRun } from '../../game/shithead';
import type { Card, Player, Rank, ShitheadResult, ShPlayerView, View } from '../../game/types';
import { LOSER_MARK } from '../../game/games';
import { App } from '../app';
import { cardHTML, HAND_ICON } from '../cards';
import { marksHTML, reignHTML } from './marks';
import { $, esc, hashStr, isMobile, num } from '../dom';
import { myTurn, nameOf, onlyBotsPlaying, pById, turnId, vb } from '../helpers';
import { SEQ } from '../shithead/sequence';
import { winLeft, winSecs } from '../shithead/window';
import { taunt } from '../taunts';
import { betActionHTML, betsOnMeSub, betSub } from './bets';
import { betResultHTML, botsOnlyHTML, type Sheet, type SheetRow } from './result';
import { STATUS, SH_SHEET, SH_STATUS, OFFLINE_WAIT, offline, playFor, waitWho } from '../../content/texts/status';
import { SH_TABLE } from '../../content/texts/table-sh';
import { ceremonyOn } from '../ceremony';
import { endMain, turnMain, waitSub, type Status } from '../status';
import { renderTable } from '../table/index';
import { fitHand, handHTML } from '../table/hand';
import { cardsMini, deckCards } from '../table/pile';
import { fanHTML, numHTML, THINKING } from '../table/seat';
import type { NewTable } from '../table/spec';
import type {
  BarButton,
  BarModel,
  CenterModel,
  HandCard,
  MeModel,
  MeOut,
  SeatModel,
  SeatState,
  TagModel,
} from '../table/types';

type Source = 'hand' | 'up' | 'down';
type OwnCards = { hand: Card[]; up: Card[]; down: Card[] | number };

const count = (x: Card[] | number): number => (typeof x === 'number' ? x : x.length);

/** Wie oft jemand schon Shithead war. Das Mal der gerade beendeten Partie zählt erst nach der Enthüllung. */
export function shcHTML(p: Pick<Player, 'shc' | 'id'>): string {
  const n = num(p.shc) - (App.zerHide === p.id ? 1 : 0);
  return n > 0 ? `<span class="shc" title="So oft Shithead gewesen">💩 ${n}</span>` : '';
}

/** Krone für den letzten Sieger, Haufen für den amtierenden Shithead. */
export { reignHTML };

/** Die eigenen Karten (nur in der eigenen Ansicht sind Handkarten sichtbar). */
export function shMine(v: View): OwnCards | null {
  const P = v.sh?.P[App.me];
  return P && Array.isArray(P.hand) ? { hand: P.hand, up: P.up, down: P.down } : null;
}

/** Woher man gerade spielen muss: erst Hand, dann offene, dann verdeckte Tischkarten. */
export function shSrc(v: View): Source | null {
  const P = shMine(v);
  if (!P) return null;
  if (P.hand.length) return 'hand';
  if (P.up.length) return 'up';
  return count(P.down) ? 'down' : null;
}

const RANK_LABEL: Record<string, string> = { B: 'Bube', D: 'Dame', K: 'König', A: 'Ass' };
export const shRankLabel = (r: Rank): string => RANK_LABEL[r] ?? r;

/** Was als Nächstes auf den Stapel darf. Die Regel dahinter steht in shNeed, dieselbe prüft shWhyNot. */
export function shPileInfo(v: View, pile: Card[]): string {
  const n = shNeed({ rules: v.rules, sh: { pile } });
  switch (n.k) {
    case 'empty':
      return 'Leer, alles geht';
    case 'threes':
      return 'Nur Dreier, alles geht';
    case 'two':
    case 'max':
    case 'min': {
      const txt =
        n.k === 'two' ? 'Nach der 2 geht alles' : n.k === 'max' ? '7 oder niedriger' : `${shRankLabel(n.r)} oder höher`;
      return txt + (n.through ? ' (durch die 3)' : '');
    }
  }
}

/** Klassen aus Teilen, leere fallen weg */
const cl = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join(' ');

/** Grund einer ausgegrauten Karte, derselbe Code wie shWhyNot beim Gastgeber (eigener Zug, Karte passt nicht) */
function noFit(v: View, c: Card): Reject {
  const pile = v.sh?.pile ?? [];
  const top = pile[pile.length - 1];
  return rj('sh.noFit', top ? { c, top } : { c });
}

/** Verdeckte und offene Tischkarten einer Person. `focus`: Die Hand ist leer, jetzt sind sie dran. */
function shTableHTML(v: View, P: ShPlayerView, mine: boolean, focus = false): string {
  const down = count(P.down);
  const up = P.up ?? [];
  const slots = Math.max(down, up.length);
  const src = mine ? shSrc(v) : null;
  const playing = mine && myTurn(v) && !v.sh?.win?.lock;
  const meP = pById(v, App.me);
  const swapping = mine && v.phase === 'swap' && !!meP && !meP.ready;
  // Am eigenen Platz sieht man die Hand ohnehin, bei Gegnern steht der Hinweis so hoch wie die Karten
  if (!slots) return mine ? '' : '<div class="tcards"><div class="tnone">keine Tischkarten</div></div>';
  const deal = App.anim.deal && 'deal';
  let h = `<div class="tcards${focus ? ' focus' : ''}">`;
  for (let i = 0; i < slots; i++) {
    h += '<div class="tslot">';
    if (i < down) {
      const blind = playing && src === 'down';
      h += cardHTML(Array.isArray(P.down) ? P.down[i] : null, {
        key: mine ? `down:${i}` : '',
        ...(blind ? { act: 'shd', i, drag: 'down', backName: SH_TABLE.down(i) } : {}),
        cls: cl(blind && 'pick blindc', deal),
        style: `--d:${0.05 + i * 0.05}s`,
      });
    }
    if (i < up.length) {
      const c = up[i];
      const selectable = swapping || (mine && myTurn(v) && src === 'up');
      const selected = mine && ((swapping && App.sw.u === i) || (App.ss.src === 'up' && App.ss.idx.includes(i)));
      // Ausgegraut bleibt antippbar, der Tipp nennt dann den Grund (src/ui/shithead/input.ts)
      const dim = playing && src === 'up' && !shCanPlay(v, rankOf(c));
      const card = cardHTML(c, {
        key: mine ? `up:${c}` : '',
        ...(selectable ? { act: 'shu', i, drag: 'up' as const } : {}),
        // In der Tauschrunde ist die offene Karte auch Ziel für eine Handkarte
        ...(swapping ? { drop: 'up' as const } : {}),
        sel: selected,
        // Ohne why: aria-disabled ließe Playwright in shithead.spec.ts nicht mehr tippen, das stellt erst 3b um
        dim,
        cls: cl(selectable && 'pick', deal),
        style: `--d:${0.2 + i * 0.05}s`,
      });
      h += `<div class="upc">${card}</div>`;
    }
    h += '</div>';
  }
  return `${h}</div>`;
}

/** Etikett an der Kachel: gegangen, Platz, Shithead, Tauschrunde, am Zug, 4er rein, sonst die Zahl der Tipps */
function shTag(v: View, p: Player): TagModel | null {
  const S = v.sh;
  if (!S) return null;
  const over = v.phase === 'over';
  if (p.out) return { text: 'gegangen', kind: 'plain', cls: 'outt' };
  if (S.finished.includes(p.id)) return { text: `Platz ${num(p.place)}`, kind: 'plain' };
  // Bis zur Enthüllung verrät auch das Etikett den Shithead nicht
  if (over && S.shithead === p.id && App.zerHide !== p.id)
    return { text: `${LOSER_MARK.shithead} Shithead`, kind: 'loser', cls: 'outt' };
  if (v.phase === 'swap')
    return p.ready
      ? { text: 'bereit ✓', kind: 'done', cls: 'done' }
      : { text: 'tauscht', kind: 'turn', cls: 'turn', think: true };
  if (v.phase === 'play' && turnId(v) === p.id) return { text: 'ist dran', kind: 'turn', cls: 'turn', think: true };
  if (v.phase === 'play' && S.win?.by.includes(p.id)) return { text: '4er rein', kind: 'four', cls: 'four' };
  const n = v.phase === 'play' ? shBetsOn(v, p.id).length : 0;
  return n ? { text: `🔮 ${n}`, kind: 'bet', cls: 'bet', title: 'So oft getippt' } : null;
}

/**
 * Gegnerkachel: Tischkarten oder ohne sie ein gehaltener Fächer mit „auf der Hand“ in der Mitte. Ohne die Worte
 * sähen zwei Kartenrücken aus wie verdeckte Tischkarten, die man nur einzeln aufdecken darf. Höchstens vier Karten,
 * damit es auch in schmale Kacheln passt. Am Ende liegen die übrigen Handkarten offen.
 */
function shSeat(v: View, p: Player): SeatModel | null {
  const S = v.sh;
  const P = S?.P[p.id];
  if (!S || !P) return null;
  const over = v.phase === 'over';
  const hn = count(P.hand);
  // Keine Tischkarten mehr: Dann zählen nur noch die Handkarten und die sollen alle sehen
  const handOnly = !over && hn > 0 && !P.up.length && !count(P.down);
  // shortcut: höchstens acht ohne „+n“ wie in 2.7, der sichtbare Schritt (3b) gibt cardsMini das ganze Blatt
  const revealed = Array.isArray(P.hand) && over ? cardsMini(P.hand.slice(0, 8)) : '';
  const done = S.finished.includes(p.id);
  const on = v.phase === 'play' && turnId(v) === p.id;
  const tag = shTag(v, p);
  const st: SeatState[] = [];
  if (on) st.push('turn');
  if (done) st.push('done');
  if (p.out || done) st.push('out');
  if (!p.online) st.push('offline');
  const body = handOnly
    ? fanHTML(hn, {
        max: 4,
        deg: 14,
        word: 'auf der Hand',
        title: `Keine Tischkarten mehr, nur noch ${hn} ${hn === 1 ? 'Handkarte' : 'Handkarten'}`,
        deal: !!App.anim.deal,
      })
    : shTableHTML(v, P, false);
  const ohand = handOnly
    ? ''
    : `<span class="ohand" title="Karten auf der Hand">${revealed}<span class="hcount${hn ? '' : ' zero'}">${hn}${HAND_ICON}</span></span>`;
  return {
    id: p.id,
    name: p.name,
    marks: marksHTML(v, p),
    value: '',
    count: ohand + shcHTML(p),
    tag,
    body,
    st,
    aim: v.players.some((q) => q.id === App.me),
    cls: handOnly ? ['sh', 'handonly'] : ['sh'],
    say: SH_TABLE.seat({ bot: !!p.bot, hand: hn, up: P.up.length, down: count(P.down), tag: tag?.text ?? '' }),
  };
}

/** Nachziehstapel, Ablagestapel und verbrannte Karten. Während einer Sequenz zeigt sie deren Zwischenstand. */
function shCenter(v: View): CenterModel | null {
  const S = v.sh;
  if (!S) return null;
  const ov = SEQ.ov;
  const pile = ov ? ov.pile : S.pile;
  const burned = ov ? ov.burned : num(S.burned);
  const dn = num(S.deck);
  let pileHTML = '';
  for (let k = Math.max(0, pile.length - 5); k < pile.length; k++) {
    // Jede Karte liegt leicht schief, aber immer gleich (Hash statt Zufall). Nur wenig, sonst ragt sie in den Hinweis darunter
    const hh = hashStr(`${pile[k]}:${k}`);
    const isTop = k === pile.length - 1;
    pileHTML += cardHTML(pile[k], {
      key: '',
      cls: isTop && App.anim.pilePop && !ov ? 'pop' : '',
      style: `--rot:${(hh % 15) - 7}deg; left:${(hh % 7) - 3}px; top:${((hh >> 3) % 5) - 2}px`,
    });
  }
  if (!pile.length) pileHTML = '<div class="emptyslot">leer</div>';
  const info = shPileInfo(v, pile);
  return {
    cap: 'Stapel',
    label: SH_TABLE.center(pile.length, info),
    stacks: [
      {
        k: 'deck',
        cls: 'deck',
        title: 'Nachziehstapel',
        // Die Zahl am Stapel reicht als Beschriftung, darunter ist Platz für lange Hinweise zum Ablagestapel
        body: deckCards(dn) + (dn ? numHTML(dn, { cls: 'pcount', title: 'Karten zum Nachziehen' }) : ''),
      },
      {
        k: 'pile',
        cls: 'pile',
        title: '',
        body: pileHTML,
        cnt: { text: info, warn: shNeed({ rules: v.rules, sh: { pile } }).k === 'max' },
        count: pile.length > 5 ? pile.length : undefined,
        drop: 'pile',
      },
      {
        k: 'counter',
        cls: 'burned',
        title: 'Verbrannte Karten',
        body: `<span class="flame">🔥</span><b>${burned}</b>`,
        cnt: { text: 'verbrannt' },
      },
    ],
  };
}

/** Knopf zum Reinwerfen der eigenen 4er. Macht die letzte 4 den Stapel voll, ist es eine Bombe. */
function throwBtn(v: View): string {
  const t = shCanThrow(v, App.me);
  if (!t) return '';
  const top = shTopRun(v);
  const have = (top.r === '4' ? top.k : 0) + t.idx.length;
  const n = t.idx.length;
  const label = `${n > 1 ? `${n} Vieren` : '4'}${t.src === 'up' ? ' vom Tisch' : ''} reinwerfen`;
  if (have >= 4) return `<button class="btn bomb pulse" data-act="shthrow">💣 Bombe! ${label}</button>`;
  return `<button class="btn throw pulse" data-act="shthrow">${label}</button>`;
}

/** Knopf für eine schnelle Aktion außer der Reihe: 4er reinwerfen oder Bombe einwerfen. */
export function quickHTML(v: View): string {
  const S = v.sh;
  if (v.game !== 'shithead' || v.phase !== 'play' || !S || !shMine(v)) return '';
  if (S.win) return throwBtn(v);
  const bm = shCanBomb(v, App.me);
  if (!bm) return '';
  const what = `${bm.idx.length > 1 ? `${bm.idx.length}× ` : ''}${esc(shRankLabel(bm.r))}`;
  return `<button class="btn bomb pulse" data-act="shbomb">💣 Bombe! ${what} einwerfen</button>`;
}

/**
 * Status über dem eigenen Platz als Daten: wer dran ist, neuer Stapel mit 4er-Knopf, Bombe-Knopf. Ohne DOM, damit
 * Vitest jede Phase prüfen kann. renderTable schreibt ihn über paintStatus (src/ui/status.ts).
 */
export function shStatus(v: View): Status {
  const S = v.sh;
  const me = pById(v, App.me);
  const mine = shMine(v);
  const src = shSrc(v);
  const tId = turnId(v);
  if (!S) return { main: '', sub: '', tone: 'calm' };
  if (v.phase === 'swap') {
    const wait = v.players.filter((p) => !p.ready && !p.out).map((p) => p.id);
    return me && !me.ready
      ? { main: `<em>${SH_STATUS.swap}</em>`, sub: SH_STATUS.swapSub, tone: 'turn' }
      : { main: SH_STATUS.swap, sub: waitSub(v, wait), tone: 'calm' };
  }
  if (v.phase === 'over') {
    const revealing = !!App.zerHide || ceremonyOn();
    return { main: endMain(v, revealing), sub: revealing ? SH_STATUS.overSub : '', tone: 'over' };
  }
  if (v.phase !== 'play') return { main: '', sub: '', tone: 'calm' };
  const canAny = !!mine && (src === 'hand' || src === 'up') && mine[src].some((c) => shCanPlay(v, rankOf(c)));
  const meDone = S.finished.includes(App.me);
  let st: Status = { main: '', sub: '', tone: 'calm' };
  let quick = '';
  if (meDone && me) {
    st = {
      main: STATUS.done,
      sub: betSub(v, num(me.place)) ?? SH_STATUS.doneSub(num(me.place)),
      tone: 'calm',
    };
    // Nur noch KIs am Spielen: abkürzen statt zuschauen
    if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
  }
  if (myTurn(v) && S.win?.lock) {
    const wl = winLeft();
    st = {
      main: `<em>${STATUS.soon}</em><span class="wincd" id="wincd" style="--p:${Math.min(1, wl / SH_WIN_MS).toFixed(3)}"><b>${winSecs(wl)}</b></span>`,
      sub: SH_STATUS.winMine,
      tone: 'alert',
    };
  } else if (myTurn(v)) {
    const sub =
      src === 'down' ? SH_STATUS.blindSub : !canAny ? SH_STATUS.noFit : src === 'up' ? SH_STATUS.upNow : SH_STATUS.pick;
    st = { main: `<em>${src === 'down' ? SH_STATUS.blind : STATUS.myTurn}</em>`, sub, tone: 'turn' };
  } else if (!meDone) {
    // Mit eigener 4 steht der Knopf statt der Unterzeile (quickHTML), ohne bleibt nur der Tipp-Hinweis
    const four = !!shCanThrow(v, App.me);
    st = { main: turnMain(v, tId), sub: betsOnMeSub(v) ?? '', tone: S.win && four ? 'alert' : 'calm' };
  }
  if (mine && !quick) quick = quickHTML(v);

  const actor = tId ? pById(v, tId) : null;
  if (actor && actor.id !== App.me && !actor.online) {
    const nm = esc(actor.name);
    // Ein schneller Knopf (4er, Bombe, Vorspulen) hat Vorrang, sonst hätte der Gastgeber gar keine Aktion mehr
    if (App.role === 'host' && !quick) {
      if (!meDone) st = { ...st, main: offline(`<b>${nm}</b>`) };
      quick = `<button class="btn ghost small" data-act="skip"${S.win?.lock ? ' disabled' : ''}><span class="qlbl">${playFor(nm)}</span></button>`;
    } else st = { ...st, sub: `${offline(nm)} ${OFFLINE_WAIT}` };
  }
  // Schnelle Knöpfe ersetzen den Hinweis, die Zeile behält ihre Höhe
  return quick ? { ...st, quick } : st;
}

/** Tauschrunde: eigene Tisch- und Handkarten groß über dem Spielfeld, das noch nicht gebraucht wird. */
function swapModel(v: View, me: Player, mine: OwnCards): MeModel {
  const ready = me.ready;
  let head: string;
  let btns: BarButton[];
  if (!ready) {
    head =
      '<b>Tauschrunde</b><span>Tippe eine Handkarte und eine Tischkarte an, um sie zu tauschen. Starke Karten gehören auf den Tisch.</span>';
    btns = [{ act: 'shready', label: 'Bereit', intent: 'go', cls: 'primary', ok: true }];
  } else {
    const wn = v.players.filter((p) => !p.ready && !p.out).map((p) => p.name);
    head = wn.length
      ? `<b>Bereit!</b><span>Warte auf ${waitWho(wn.map(esc))}${THINKING}</span>`
      : '<b>Bereit!</b><span>Gleich geht es los.</span>';
    btns =
      wn.length && App.role === 'host'
        ? [{ act: 'force', label: 'Nicht warten, jetzt starten', intent: 'alt', cls: 'ghost', ok: true }]
        : [];
  }
  const deal = App.anim.deal && 'deal';
  const cards: HandCard[] = mine.hand.map((c, i) => ({
    c,
    i,
    ...(ready ? {} : { act: 'shh', drag: 'hand' as const, drop: 'hand' as const }),
    sel: !ready && App.sw.h === i,
    cls: cl(!ready && 'pick', deal),
    delay: 0.3 + i * 0.06,
  }));
  return {
    head: null,
    lead: `<div class="swhead">${head}</div>`,
    rows:
      '<div class="swrow"><span class="swlbl">Auf dem Tisch</span>' +
      shTableHTML(v, mine, true) +
      '</div><div class="swrow"><span class="swlbl">Auf der Hand</span>' +
      handHTML({ kind: 'row', cls: 'shhand', label: SH_TABLE.hand(cards.length), cards, fit: true }) +
      '</div>',
    bar: { btns },
    st: ready ? ['swapping'] : ['swapping', 'turn'],
    cls: ['shme'],
    say: SH_TABLE.meSwap(ready),
  };
}

/** Knöpfe am eigenen Platz im Spiel: Ausspielen, Alle n wählen, Aufnehmen, wer fertig ist, den Tipp-Knopf. */
function shBar(v: View, mine: OwnCards, src: Source | null, canAny: boolean): BarModel {
  const S = v.sh;
  const locked = myTurn(v) && !!S?.win?.lock;
  const playing = myTurn(v) && !locked;
  if (S && myTurn(v) && (src === 'hand' || src === 'up')) {
    const arr = mine[src];
    const selIdx = App.ss.src === src ? App.ss.idx : [];
    const selRank = selIdx.length ? rankOf(arr[selIdx[0]]) : null;
    const label = selRank
      ? `${selIdx.length > 1 ? `${selIdx.length}× ` : ''}${shRankLabel(selRank)} ausspielen`
      : 'Ausspielen';
    const okSel = playing && !!selRank && shCanPlay(v, selRank);
    const btns: BarButton[] = [
      {
        act: 'shplay',
        label: esc(locked ? 'Moment…' : label),
        intent: 'go',
        cls: 'primary',
        ok: okSel,
        pulse: okSel,
        hard: true,
        why: locked ? rj('sh.winLock') : !selRank ? rj('any.pickCard') : okSel ? null : noFit(v, arr[selIdx[0]]),
      },
    ];
    if (selRank) {
      const sameN = arr.filter((c) => rankOf(c) === selRank).length;
      if (sameN > selIdx.length)
        btns.push({ act: 'shselall', label: `Alle ${sameN} wählen`, intent: 'alt', cls: 'ghost', ok: true });
    }
    const pileN = S.pile.length;
    const pickOk = playing && pileN > 0;
    const calm = canAny || !pickOk;
    btns.push({
      act: 'shpickup',
      label: `Aufnehmen (${pileN})`,
      intent: 'take',
      cls: calm ? 'ghost' : 'wood',
      ok: pickOk,
      pulse: !calm,
      hard: true,
      why: locked ? rj('sh.winLock') : pickOk ? null : rj('sh.pileEmpty'),
    });
    return { btns };
  }
  return { btns: [], extra: S?.finished.includes(App.me) ? betActionHTML(v) : '' };
}

/** Eigener Platz: Kopf, Tischkarten und Hand, Knöpfe. Wer nicht mitspielt, bekommt einen Satz. */
function shMe(v: View): MeModel | MeOut | null {
  const S = v.sh;
  if (!S) return null;
  const me = pById(v, App.me);
  const mine = shMine(v);
  const swap = v.phase === 'swap';
  // Auch ohne eigenen Platz bleiben die alten Klassen, .shme gibt die Breite vor
  if (!me || !mine) return { out: 'Du spielst diese Partie nicht mit.', cls: swap ? ['shme', 'swapping'] : ['shme'] };
  if (swap) return swapModel(v, me, mine);
  const src = shSrc(v);
  const canAny = (src === 'hand' || src === 'up') && mine[src].some((c) => shCanPlay(v, rankOf(c)));
  const playing = myTurn(v) && !S.win?.lock;
  const meDone = S.finished.includes(App.me);
  const hand = SEQ.ov?.myHand ?? mine.hand;
  // Ist die Hand leer, rücken die Tischkarten groß in den Fokus
  const focus = !hand.length && (src === 'up' || src === 'down');
  const deal = App.anim.deal && 'deal';
  const cards: HandCard[] = hand.map((c, i) => {
    // Während der kurzen Sperre darf man schon auswählen, nur noch nicht legen
    const selectable = myTurn(v) && src === 'hand';
    const dim = playing && src === 'hand' && !shCanPlay(v, rankOf(c));
    return {
      c,
      i,
      ...(selectable ? { act: 'shh', drag: 'hand' as const } : {}),
      sel: App.ss.src === 'hand' && App.ss.idx.includes(i),
      // Den Grund nennt der Tipp (shWhyTap), `why` mit aria-disabled kommt mit 3b wie bei den offenen Karten
      dim,
      cls: cl(selectable && 'pick', deal),
      delay: 0.3 + Math.min(i, 8) * 0.06,
    };
  });
  const rows =
    `<div class="shrow${focus ? ' focus' : ''}">${shTableHTML(v, mine, true, focus)}` +
    (hand.length ? handHTML({ kind: 'row', cls: 'shhand', label: SH_TABLE.hand(hand.length), cards, fit: true }) : '') +
    '</div>';
  const pill = hand.length
    ? `${hand.length}${HAND_ICON}${hand.length === 1 ? 'Handkarte' : 'Handkarten'}`
    : `${HAND_ICON}Hand leer`;
  return {
    head: {
      marks: reignHTML(v, me.id),
      count: shcHTML(me),
      tags: meDone ? `<span class="tag">Platz ${num(me.place)}</span>` : '',
      pill: `<span class="pill">${pill}</span>`,
    },
    rows,
    bar: shBar(v, mine, src, canAny),
    st: playing ? ['turn'] : [],
    cls: ['shme'],
    say: SH_TABLE.me({
      turn: playing,
      place: meDone ? num(me.place) : 0,
      hand: hand.length,
      up: mine.up.length,
      down: count(mine.down),
    }),
  };
}

/** Zeichnet den ganzen Tisch neu (Auswahl, Ende eines Aufnehmens im Ablauf). */
export function renderSh(v: View): void {
  renderTable(v);
}

/** Abstände zwischen den Gegnerkacheln in der Tauschrunde, wie in fit.css. */
const SWAP_GAP_X = 8;
const SWAP_GAP_Y = 16;
/** Kleiner dürfen Kacheln nicht werden, sonst übernimmt das Karussell. */
const SWAP_MIN_W = 92;
const SWAP_MIN_H = 80;

/** Raster der Tauschrunde weg, damit andere Spiele wieder das Karussell bekommen. */
export function clearSwapGrid(): void {
  const el = $('#opps');
  delete el.dataset.grid;
  el.style.removeProperty('--cols');
  el.style.removeProperty('--rowh');
}

/**
 * Tauschrunde am Handy: Die Mitte wird noch nicht gebraucht, also füllen die Gegner den Platz.
 * Alle Kacheln sind gleich groß. Gewählt wird die Aufteilung in eine bis drei Reihen mit den größten Karten,
 * bei drei Gegnern auf einem langen Handy also zwei oben und einer darunter.
 */
export function layoutSwapOpps(v: View): void {
  const el = $('#opps');
  const n = el.children.length;
  if (v.phase !== 'swap' || !isMobile() || !n) {
    clearSwapGrid();
    return;
  }
  // Als Raster ausmessen: Das Karussell gibt den Platz frei, den das Raster füllen würde
  el.classList.remove('car');
  el.style.removeProperty('height');
  el.dataset.grid = '1';
  const w0 = el.clientWidth;
  const h0 = el.clientHeight - parseFloat(getComputedStyle(el).paddingTop || '0');
  let best: { tw: number; cols: number; rowh: number } | null = null;
  for (let rows = 1; rows <= Math.min(3, n); rows++) {
    const cols = Math.ceil(n / rows);
    const w = (w0 - (cols - 1) * SWAP_GAP_X) / cols;
    const h = (h0 - (rows - 1) * SWAP_GAP_Y) / rows;
    // Zu schmale oder zu flache Kacheln überlappen, dann lieber das Karussell
    if (w < SWAP_MIN_W || h < SWAP_MIN_H) continue;
    // Kartenbreite wie in fit.css: drei Stapel nebeneinander, darunter Name und Anzahl
    const tw = Math.min((w - 18) / 3.25, (h - 54) / 1.5, 78);
    // Mehr Reihen nur, wenn die Karten dadurch spürbar größer werden
    if (!best || tw > best.tw + 2) best = { tw, cols, rowh: Math.min(h, tw * 1.5 + 54) };
  }
  if (!best) {
    clearSwapGrid();
    return;
  }
  el.style.setProperty('--cols', String(best.cols));
  el.style.setProperty('--rowh', `${Math.floor(best.rowh)}px`);
}

function shitheadResult(v: View): ShitheadResult | null {
  return v.result?.reason === 'shithead' ? v.result : null;
}

/**
 * Ergebnisblatt am Ende als Daten: Shithead mit übrigen Karten als Schlüsselzeile, Spruch oder Duell, Tipps,
 * eigene Zeile und die übrigen in Reihenfolge. `null` außerhalb des Partieendes.
 */
export function shSheet(v: View): Sheet | null {
  const r = shitheadResult(v);
  if (v.phase !== 'over' || !r) return null;
  const loser = r.shithead;
  const names = r.names ?? {};
  const nm = (id: string) => esc(nameOf(v, id, names[id]));
  const title =
    loser === App.me
      ? 'Du bist der <span class="r">Shithead!</span>'
      : loser
        ? `${nm(loser)} ist der <span class="r">Shithead!</span>`
        : 'Partie vorbei';
  const first = r.ranking[0];
  const lead = r.quit ? `${nm(r.quit)}${vb(r.quit, ' hast', ' hat')} den Tisch verlassen.` : '';
  let tt: Sheet['taunt'] = null;
  if (!r.quit && loser) {
    const seed = `o${v.games}`;
    if (loser === App.me) tt = { text: taunt('shLoserSelf', null, seed), good: false };
    else if (first === App.me) tt = { text: taunt('shWinSelf', null, seed), good: true };
    else tt = { text: taunt('shLoserOther', { name: nameOf(v, loser, names[loser]) }, seed), good: false };
  }
  const order = loser ? [...r.ranking, loser] : r.ranking;
  const rows: SheetRow[] = order.map((id, i) => {
    const p = pById(v, id);
    const isL = id === loser;
    const P = v.sh?.P[id];
    const left: Card[] =
      isL && P
        ? [...(Array.isArray(P.hand) ? P.hand : []), ...(P.up ?? []), ...(Array.isArray(P.down) ? P.down : [])]
        : [];
    const what = isL ? SH_SHEET.left(left.length) : i === 0 ? SH_SHEET.first : SH_SHEET.done;
    const n = num(p?.shc);
    return {
      id,
      place: i + 1,
      name: nm(id),
      hat: isL ? LOSER_MARK.shithead : i === 0 ? '👑' : undefined,
      core: n ? `${what} · ${SH_SHEET.count(n)}` : what,
      // Kurzform für lange Namen am Handy: Platz und Krone sagen „fertig“ und „zuerst“ schon, der Zähler wie am Tisch
      short: n ? SH_SHEET.countShort(n) : i === 0 ? SH_SHEET.firstShort : undefined,
      cards: isL ? left : undefined,
      tone: isL ? 'lose' : i === 0 ? 'win' : undefined,
    };
  });
  return {
    icon: loser === App.me ? LOSER_MARK.shithead : loser ? '🏆' : '👋',
    title,
    lead,
    key: loser,
    taunt: tt,
    bets: betResultHTML(v, r.bets, r.shithead, 'Shithead'),
    rows,
    next: 'game',
  };
}

export const shSpec: NewTable = {
  badge: false,
  actor: (v) => (v.phase === 'play' ? turnId(v) : null),
  seat: shSeat,
  center: shCenter,
  me: shMe,
  status: shStatus,
  sheet: shSheet,
  drag: null,
  after(v) {
    fitHand();
    layoutSwapOpps(v);
  },
};

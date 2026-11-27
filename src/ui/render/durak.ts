/*
 * Durak-Tisch als `NewTable` (Plan 2.8 Runde 4a): Gegner mit Kartenzahl und Rolle, Stapel mit offenem Trumpf, die
 * Angriffe auf dem Tisch, weggelegte Karten, Status, eigene Hand mit Knöpfen und das Ergebnis am Ende als Modelle, die
 * Bausteine in src/ui/table zeichnen. Was ich gerade tun kann, steht in `dkRole`. Auswahl und Tipps verarbeitet
 * src/ui/durak/input.ts.
 */
import { shBetsOn } from '../../game/bets';
import { dkBeats, suitOf } from '../../game/cards';
import { SUIT_SYM } from '../../game/constants';
import {
  dkAttackError,
  dkAttackers,
  dkCount,
  dkLive,
  dkOpen,
  dkRoom,
  dkTransferError,
  dkTrump,
  dkWaiting,
  dkWhyNot,
} from '../../game/durak';
import { LOSER_MARK, reignOf, unreachable } from '../../game/games';
import { type Reject, rj } from '../../game/reject';
import { ctxOfView, rejectText } from '../../content/texts';
import { OFFLINE_WAIT, offline, playFor, STATUS } from '../../content/texts/status';
import { DK_SHEET, DK_STATUS } from '../../content/texts/status-dk';
import { SUIT_NAME, TABLE } from '../../content/texts/table';
import { DK_TABLE } from '../../content/texts/table-dk';
import { SH_TABLE } from '../../content/texts/table-sh';
import type { Card, DkView, DurakResult, Player, Suit, View } from '../../game/types';
import { App } from '../app';
import { cardHTML, HAND_ICON } from '../cards';
import { ceremonyOn } from '../ceremony';
import { esc, listJoin, num } from '../dom';
import { nameOf, onlyBotsPlaying, pById, turnId, vb, W } from '../helpers';
import { endMain, waitSub, whoHTML, type Status } from '../status';
import { taunt } from '../taunts';
import { twoLabel } from '../table/bar';
import { fitHand, handHTML } from '../table/hand';
import { cardsMini, deckCards } from '../table/pile';
import { fanHTML, numHTML } from '../table/seat';
import type { NewTable } from '../table/spec';
import type {
  BarButton,
  BarModel,
  BtnIntent,
  CenterModel,
  HandCard,
  MeModel,
  MeOut,
  SeatModel,
  SeatState,
  TagModel,
} from '../table/types';
import { betActionHTML, betsOnMeSub, betSub } from './bets';
import { dkcHTML, reignHTML } from './marks';
import { betResultHTML, botsOnlyHTML, type Sheet, type SheetRow } from './result';

export type DkRole = 'lead' | 'throw' | 'defend' | 'taking' | 'wait' | 'done' | 'none';

/** Eigene Hand, wenn ich mitspiele. */
export function dkMine(v: View): Card[] | null {
  const h = v.dk?.P[App.me];
  return Array.isArray(h) ? h : null;
}

/** Was ich gerade tun kann. */
export function dkRole(v: View): DkRole {
  const D = v.dk;
  if (!D || v.phase !== 'play') return 'none';
  if (!(App.me in D.P)) return 'none';
  if (!dkLive(v, App.me)) return 'done';
  if (App.me === D.def) return D.take ? 'taking' : dkOpen(D).length ? 'defend' : 'wait';
  if (!D.table.length) return App.me === D.att ? 'lead' : 'wait';
  return dkCount(v, App.me) ? 'throw' : 'wait';
}

/** Gültige Auswahl: nur Indizes, die es in der Hand noch gibt. */
export function dkSelected(v: View): { idx: number[]; cards: Card[] } {
  const hand = dkMine(v) ?? [];
  const idx = App.ds.idx.filter((i) => i >= 0 && i < hand.length);
  return { idx, cards: idx.map((i) => hand[i]) };
}

/** Darf ich gerade passen? */
export function dkCanPass(v: View): boolean {
  const D = v.dk;
  if (!D || dkRole(v) !== 'throw') return false;
  return (D.take || !dkOpen(D).length) && !D.done.includes(App.me);
}

/** Offene Angriffe, die diese Karte schlagen kann (Tischindizes). */
export function dkTargets(v: View, c: Card): number[] {
  const D = v.dk;
  if (!D) return [];
  const ts = dkTrump(D);
  return D.table.flatMap((p, i) => (!p.d && dkBeats(c, p.a, ts) ? [i] : []));
}

const suitHTML = (s: Suit): string => `<span class="suit ${s === 'H' || s === 'D' ? 'red' : ''}">${SUIT_SYM[s]}</span>`;

/** Etikett an der Kachel: Rolle im Angriff, passt, Platz, am Ende der Durak, sonst die Zahl der Tipps */
function dkTag(v: View, D: DkView, p: Player, waiting: readonly string[]): TagModel | null {
  if (v.phase === 'over') {
    // Bis zur Enthüllung verrät auch das Etikett den Durak nicht
    if (D.durak === p.id)
      return App.zerHide === p.id ? null : { text: `${LOSER_MARK.durak} Durak`, kind: 'loser', cls: 'outt' };
    return p.place ? { text: TABLE.tag.place(num(p.place)), kind: 'plain' } : null;
  }
  if (D.finished.includes(p.id)) return { text: TABLE.tag.place(num(p.place)), kind: 'plain' };
  const think = waiting.includes(p.id);
  if (p.id === D.def) {
    if (D.take) return { text: DK_TABLE.tag.take, kind: 'take', cls: 'take', think };
    return { text: DK_TABLE.tag.def, kind: 'role', cls: think ? 'turn' : 'def', think };
  }
  if (p.id === D.att && !D.table.length) return { text: DK_TABLE.tag.att, kind: 'turn', cls: 'turn', think };
  // Hängt nur an der Passen-Liste, nie an Handkarten
  if (D.table.length && D.done.includes(p.id)) return { text: DK_TABLE.tag.passed, kind: 'done', cls: 'done' };
  if (D.table.length && think && dkCount(v, p.id)) return { text: DK_TABLE.tag.add, kind: 'turn', cls: 'turn', think };
  if (p.id === D.att) return { text: DK_TABLE.tag.att, kind: 'role', cls: 'att' };
  const n = v.phase === 'play' ? shBetsOn(v, p.id).length : 0;
  return n ? { text: `🔮 ${n}`, kind: 'bet', cls: 'bet', title: SH_TABLE.tag.bets } : null;
}

/**
 * Gegnerkachel: gehaltener Fächer mit Kartenzahl, am Ende die offenen Karten des Durak. Mehrere können zugleich dran
 * sein (dkWaiting), alle bekommen `turn`. Krone und 🤡 kleben als Eckaufkleber oben rechts, KI steht vor dem Namen.
 * Einen Wert auf der Unterkante gibt es nicht, die Kartenzahl steht schon im Fächer (wie Shithead ohne Tischkarten).
 */
function dkSeat(v: View, p: Player): SeatModel | null {
  const D = v.dk;
  const raw = D?.P[p.id];
  if (!D || raw == null) return null;
  const waiting = v.phase === 'play' ? dkWaiting(v) : [];
  const hn = dkCount(v, p.id);
  const play = v.phase === 'play';
  const done = D.finished.includes(p.id);
  let body: string;
  if (v.phase === 'over' && Array.isArray(raw) && raw.length) body = `<div class="dkshow">${cardsMini(raw)}</div>`;
  else if (hn) body = fanHTML(hn, { max: 5, deg: 12, ...DK_TABLE.fan(hn), deal: !!App.anim.deal });
  else body = `<div class="tcards"><div class="tnone">${DK_TABLE.empty(done)}</div></div>`;
  const st: SeatState[] = [];
  if (waiting.includes(p.id)) st.push('turn');
  if (done) st.push('done');
  if (p.out || done) st.push('out');
  if (!p.online) st.push('offline');
  const role = !play ? undefined : p.id === D.def ? 'def' : p.id === D.att ? 'att' : undefined;
  const tag = dkTag(v, D, p, waiting);
  const rg = reignOf(v);
  const reign = App.zerHide === p.id ? '' : rg?.lose === p.id ? DK_TABLE.reign : rg?.win === p.id ? TABLE.crown : '';
  return {
    id: p.id,
    name: p.name,
    marks: reignHTML(v, p.id),
    bot: !!p.bot,
    value: '',
    count: dkcHTML(p),
    tag,
    body,
    st,
    ...(role ? { role } : {}),
    aim: v.players.some((q) => q.id === App.me),
    cls: role ? ['sh', 'dk', role] : ['sh', 'dk'],
    say: DK_TABLE.seat({ bot: !!p.bot, reign, hand: hn, tag: tag?.text ?? '', hide: !!App.zerHide }),
  };
}

/** Tischmitte: Stapel mit Trumpf, Angriffe, weggelegte Karten. */
function dkCenter(v: View): CenterModel | null {
  const D = v.dk;
  if (!D) return null;
  const ts = dkTrump(D);
  const role = dkRole(v);
  const sel = dkSelected(v);
  const targets = role === 'defend' && sel.cards.length === 1 ? dkTargets(v, sel.cards[0]) : [];
  const dn = num(D.deck);
  const trumpCard = dn ? `<div class="dktrump" title="Trumpf">${cardHTML(D.trump, { key: '' })}</div>` : '';
  // Liegt nur noch der Trumpf, gibt es keinen Kartenrücken mehr darüber
  const deck =
    (dn > 1 ? deckCards(Math.min(dn - 1, 2)) : dn ? '' : `<div class="emptyslot">${TABLE.empty}</div>`) +
    (dn ? numHTML(dn, { cls: 'pcount', title: 'Karten zum Nachziehen' }) : '') +
    trumpCard;
  const pairs = D.table
    .map((p, i) => {
      const pick = role === 'defend' && !p.d;
      const cls = ['dkpair', p.d ? 'beaten' : 'open', targets.includes(i) && 'target', App.ds.pair === i && 'chosen']
        .filter(Boolean)
        .join(' ');
      const attrs = pick ? ` data-act="dkt" role="button" tabindex="0" data-fk="pair:${p.a}" data-drop="pair"` : '';
      return (
        `<div class="${cls}" data-i="${i}"${attrs}>` +
        cardHTML(p.a, { key: '', cls: 'dka' }) +
        (p.d ? cardHTML(p.d, { key: '', cls: 'dkd' }) : '') +
        '</div>'
      );
    })
    .join('');
  const room = dkRoom(D);
  const over = v.phase !== 'play';
  const info = over
    ? ''
    : !D.table.length
      ? `Bis zu ${num(D.limit)} ${D.limit === 1 ? 'Karte' : 'Karten'}`
      : D.take
        ? `${W(v, D.def)}${vb(D.def, ' nimmst', ' nimmt')} auf · ${room ? `noch ${room} dazu` : 'voll'}`
        : room
          ? `Platz für ${room} ${room === 1 ? 'Karte' : 'Karten'}`
          : 'voll';
  const empty = over ? '<div class="emptyslot">Vorbei</div>' : '<div class="emptyslot">Hier wird angegriffen</div>';
  return {
    cap: `Trumpf ${suitHTML(ts)} ${SUIT_NAME[ts]}`,
    label: DK_TABLE.center(SUIT_NAME[ts]),
    stacks: [
      { k: 'deck', cls: 'deck dkdeck', title: 'Nachziehstapel', body: deck },
      {
        k: 'table',
        cls: `dktable${D.table.length ? '' : ' empty'}`,
        title: '',
        ...(over ? {} : { drop: 'table' as const }),
        // Die Zeile nennt Namen als <b>, deshalb im Slot statt als Klartext in cnt
        body: (pairs || empty) + (info ? `<span class="cnt">${info}</span>` : ''),
      },
      {
        k: 'counter',
        cls: 'burned dkbito',
        title: 'Bito, abgewehrte Karten',
        body: `<b>${num(D.discard)}</b>`,
        cnt: { text: 'Bito' },
      },
    ],
  };
}

/** Längster Hauptsatz ohne Markup, der am Handy noch in eine Zeile passt. Längere Sätze kürzt die Zeile. */
const MAIN_FIT = 38;
const fits = (h: string): boolean => h.replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, 'x').length <= MAIN_FIT;

/** Wer außer mir gerade nachlegen darf: alle außer dem Verteidiger mit Karten, die nicht gepasst haben. */
function addersOf(v: View, D: DkView): string[] {
  return dkAttackers(v).filter((id) => id !== App.me && !D.done.includes(id));
}

/** „Lena darf nachlegen“, „Lena und KI Igor dürfen nachlegen“ */
const mayAddHTML = (v: View, ids: readonly string[]): string =>
  DK_STATUS.mayAdd(listJoin(ids.map((id) => whoHTML(v, id))), ids.length);

/**
 * Lage am Tisch in einem Satz, wenn ich gerade nichts tun muss: „Lena greift Tom an.“, „Tom verteidigt, Lena darf
 * nachlegen.“ Sind es mehr als zwei oder passt der Satz nicht in die Zeile, bleibt der erste Teil. Wartet die Partie
 * auf die, die nachlegen dürfen, nennt die Unterzeile sie dann („Warte auf Lena, Tom und KI Igor.“).
 */
function sceneOf(v: View, D: DkView): { main: string; sub: string } {
  if (!D.table.length) {
    const att = whoHTML(v, D.att);
    const full = `${DK_STATUS.attacks(att, D.def === App.me ? `<b>${DK_STATUS.you}</b>` : whoHTML(v, D.def))}.`;
    return { main: fits(full) ? full : `${DK_STATUS.attacksShort(att)}.`, sub: '' };
  }
  const open = dkOpen(D).length > 0;
  const head = D.take
    ? DK_STATUS.takes(whoHTML(v, D.def))
    : open
      ? DK_STATUS.defends(whoHTML(v, D.def))
      : DK_STATUS.beaten;
  const adders = addersOf(v, D);
  if (!adders.length) return { main: `${head}.`, sub: '' };
  const full = `${head}, ${mayAddHTML(v, adders)}.`;
  if (adders.length <= 2 && fits(full)) return { main: full, sub: '' };
  return { main: `${head}.`, sub: D.take || !open ? waitSub(v, adders) : '' };
}

/**
 * Status über dem eigenen Platz als Daten, ohne DOM, damit Vitest jede Lage prüfen kann. Mehrere können zugleich
 * dran sein (dkWaiting), die Zeile nennt sie zusammen. Eine Auswahl, die so nicht geht, erklärt die Unterzeile.
 * `renderStatus` (src/ui/status.ts) schreibt ihn.
 */
export function dkStatus(v: View): Status {
  const D = v.dk;
  if (!D) return { main: '', sub: '', tone: 'calm' };
  if (v.phase === 'over') {
    const revealing = !!App.zerHide || ceremonyOn();
    return { main: endMain(v, revealing), sub: revealing ? DK_STATUS.overSub : '', tone: 'over' };
  }
  if (v.phase !== 'play') return { main: '', sub: '', tone: 'calm' };
  const me = pById(v, App.me);
  const role = dkRole(v);
  const waiting = dkWaiting(v);
  const defN = whoHTML(v, D.def);
  let st: Status;
  let quick = '';
  switch (role) {
    case 'lead':
      st = { main: `<em>${DK_STATUS.lead}</em>`, sub: DK_STATUS.leadSub(defN), tone: 'turn' };
      break;
    case 'defend': {
      const canTransfer = (dkMine(v) ?? []).some((c) => !dkTransferError(v, App.me, [c]));
      st = {
        main: `<em>${DK_STATUS.defend}</em>`,
        sub: canTransfer ? DK_STATUS.defendSubTransfer : DK_STATUS.defendSub,
        tone: 'turn',
      };
      break;
    }
    case 'taking':
      st = { main: DK_STATUS.taking, sub: waitSub(v, waiting), tone: 'calm' };
      break;
    case 'throw':
      if (waiting.includes(App.me)) {
        // Die Partie wartet auf mich: nachlegen oder passen
        const full = `${D.take ? DK_STATUS.takes(defN) : DK_STATUS.beaten}, ${DK_STATUS.meMayAdd}.`;
        st = { main: `<em>${fits(full) ? full : DK_STATUS.meMayAddMain}</em>`, sub: DK_STATUS.throwFree, tone: 'turn' };
      } else {
        // Passen gilt, bis ein neuer Wert auf dem Tisch liegt oder aufgenommen wird. Bis dahin kein Nachlegen
        const passed = D.done.includes(App.me);
        const sub = passed ? (D.take ? DK_STATUS.passedTake : DK_STATUS.passed(defN)) : DK_STATUS.throwOpen;
        st = { main: sceneOf(v, D).main, sub, tone: 'calm' };
      }
      break;
    case 'done':
      st = {
        main: STATUS.done,
        sub: (me && betSub(v, num(me.place))) ?? DK_STATUS.doneSub(num(me?.place)),
        tone: 'calm',
      };
      if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
      break;
    case 'wait':
    case 'none': {
      // Ich verteidige und habe alles geschlagen: Jetzt dürfen die anderen noch nachlegen oder passen
      if (D.def === App.me && D.table.length && !dkOpen(D).length) {
        st = { main: DK_STATUS.beatenMine, sub: waitSub(v, waiting), tone: 'calm' };
        break;
      }
      const sc = sceneOf(v, D);
      const soon = role === 'wait' && D.def === App.me ? DK_STATUS.attackedSoon : '';
      st = { main: sc.main, sub: betsOnMeSub(v) ?? (sc.sub || soon), tone: 'calm' };
      break;
    }
    default:
      return unreachable(role);
  }
  // Eine Auswahl, die so nicht geht: sagen warum
  const why = selectionError(v, role);
  if (why) st = { ...st, sub: esc(rejectText(why, ctxOfView(v))) };
  // Wer gerade aufhält und offline ist. Wartet die Partie auch auf mich, bleibt meine Zeile stehen
  const off = waiting.includes(App.me)
    ? null
    : v.players.find((p) => waiting.includes(p.id) && !p.online && !p.bot && p.id !== App.me);
  if (off) {
    const nm = esc(off.name);
    // Ein schneller Knopf (Vorspulen) hat Vorrang, sonst hätte der Gastgeber gar keine Aktion mehr
    if (App.role === 'host' && !quick) {
      if (role !== 'done') st = { ...st, main: offline(`<b>${nm}</b>`) };
      quick = `<button class="btn ghost small" data-act="skip"><span class="qlbl">${playFor(nm)}</span></button>`;
    } else st = { ...st, sub: `${offline(nm)} ${OFFLINE_WAIT}` };
  }
  // Schnelle Knöpfe ersetzen den Hinweis, die Zeile behält ihre Höhe
  return quick ? { ...st, quick } : st;
}

/** Welchen Angriff die gewählte Karte schlagen würde: der gewählte oder der einzige mögliche. */
export function dkBeatPair(v: View): number | null {
  const sel = dkSelected(v);
  if (sel.cards.length !== 1) return null;
  const t = dkTargets(v, sel.cards[0]);
  if (App.ds.pair != null && t.includes(App.ds.pair)) return App.ds.pair;
  return t.length === 1 ? t[0] : null;
}

/** Warum die aktuelle Auswahl so nicht geht, oder null. */
function selectionError(v: View, role: DkRole): Reject | null {
  const sel = dkSelected(v);
  if (!sel.cards.length) return null;
  if (role === 'lead' || role === 'throw') return dkAttackError(v, App.me, sel.cards);
  if (role !== 'defend') return null;
  if (sel.cards.length > 1) return dkTransferError(v, App.me, sel.cards);
  if (dkTargets(v, sel.cards[0]).length || !dkTransferError(v, App.me, sel.cards)) return null;
  return rj('dk.noTarget');
}

/** Knöpfe der Durak-Knopfleiste */
export type DkBtn = 'dkgo' | 'dkpass' | 'dkbeat' | 'dktransfer' | 'dktake';

const OK = { ok: true, why: null } as const;
const passedWhy = (D: DkView): Reject => rj(D.take ? 'dk.passedTake' : 'dk.passed');

/**
 * Ob ein Knopf gerade geht und sonst warum, mit denselben Codes, die der Gastgeber schicken würde (dkAttackError,
 * dkTransferError und die Prüfung beim Passen). Ohne passenden Code bleibt `why` leer und der Tipp still, so beim
 * Schlagen mit mehreren gewählten Karten oder mit einer Karte, die mehrere Angriffe schlagen kann.
 */
export function dkBtnState(v: View, act: DkBtn): { ok: boolean; why: Reject | null } {
  const D = v.dk;
  if (!D) return { ok: false, why: rj('any.notStarted') };
  const sel = dkSelected(v).cards;
  const no = (why: Reject | null) => ({ ok: !why, why });
  switch (act) {
    case 'dkgo':
      // dkAttackError fragt zuerst nach Karten, wer gepasst hat, soll aber das hören
      if (!sel.length && D.table.length && App.me !== D.def && D.done.includes(App.me)) return no(passedWhy(D));
      return no(dkAttackError(v, App.me, sel));
    case 'dktransfer':
      return no(dkTransferError(v, App.me, sel));
    case 'dkpass': {
      if (dkCanPass(v)) return OK;
      // Wie dkAct beim Gastgeber, nur steht „schon gepasst“ vorn: der Knopf heißt dann „Gepasst ✓“, also passt nur das
      const why =
        App.me === D.def
          ? rj('dk.defending')
          : D.done.includes(App.me)
            ? passedWhy(D)
            : !D.table.length
              ? App.me === D.att
                ? rj('dk.leadFirst')
                : rj('dk.tableEmpty', { p: D.att })
              : !D.take && dkOpen(D).length
                ? rj('dk.openCards', { p: D.def })
                : null;
      return { ok: false, why };
    }
    case 'dkbeat':
      if (dkBeatPair(v) != null) return OK;
      if (App.me !== D.def) return { ok: false, why: rj('dk.notDefender', { p: D.def }) };
      if (D.take) return { ok: false, why: rj('dk.taking') };
      if (!sel.length) return { ok: false, why: rj('any.pickCard') };
      if (sel.length > 1) return { ok: false, why: rj('dk.oneCard') };
      // Eine Karte, die mehrere Angriffe schlagen kann: erst den Angriff antippen
      return { ok: false, why: dkTargets(v, sel[0]).length ? rj('dk.pickPair') : rj('dk.noTarget') };
    case 'dktake':
      return OK;
    default:
      return unreachable(act);
  }
}

/**
 * Knöpfe am eigenen Platz, je nach Rolle. Sie stehen immer an derselben Stelle und werden nur gesperrt (aria-disabled
 * mit Grund), damit nicht plötzlich ein anderer Knopf unter dem Finger liegt, wenn jemand anderes etwas tut. Jede
 * Rolle hat feste Plätze (`slots`): Weiterschieben steht hinten, damit Schlagen und Aufnehmen bleiben, wenn es nach
 * dem ersten Schlag wegfällt.
 */
function dkBar(v: View): BarModel {
  const role = dkRole(v);
  const D = v.dk;
  const n = dkSelected(v).cards.length;
  const many = n > 1 ? ` (${n})` : '';
  const btn = (act: DkBtn, cls: string, label: string, intent: BtnIntent): BarButton => ({
    act,
    label,
    intent,
    cls,
    ...dkBtnState(v, act),
  });
  const btns: BarButton[] = [];
  let slots = 1;
  if (role === 'lead') btns.push(btn('dkgo', 'primary', `Angreifen${many}`, 'go'));
  else if (role === 'throw' && D) {
    const can = dkBtnState(v, 'dkgo').ok;
    btns.push(btn('dkgo', can ? 'primary' : 'ghost', `Nachlegen${many}`, 'go'));
    btns.push(btn('dkpass', can ? 'ghost' : 'primary', D.done.includes(App.me) ? 'Gepasst ✓' : 'Passen', 'alt'));
    slots = 2;
  } else if (role === 'defend' && D) {
    const beat = btn('dkbeat', 'primary', 'Schlagen', 'go');
    btns.push(beat, btn('dktake', beat.ok ? 'ghost' : 'wood', 'Aufnehmen', 'take'));
    slots = v.rules.dk?.transfer ? 3 : 2;
    // Weiterschieben steht da, solange es in diesem Angriff noch gehen könnte
    if (v.rules.dk?.transfer && !D.table.some((p) => p.d))
      btns.push(btn('dktransfer', 'wood', twoLabel(`Weiterschieben${many}`, 'Schieben'), 'alt'));
  }
  return { btns, extra: betActionHTML(v), ...(btns.length ? { slots } : {}) };
}

/** Zeichen auf Trumpfkarten der eigenen Hand, unter dem Wert in der Ecke, die beim Überlappen frei bleibt */
const TRUMP_MARK = '<i class="trm" aria-hidden="true">★</i>';

/** Eigener Platz: Kopf, Hand, Knöpfe. Wer nicht mitspielt, bekommt einen Satz. */
function dkMe(v: View): MeModel | MeOut | null {
  const D = v.dk;
  if (!D) return null;
  const me = pById(v, App.me);
  const hand = dkMine(v);
  if (!me || !hand) return { out: DK_TABLE.out, cls: ['shme', 'dkme'] };
  const role = dkRole(v);
  const sel = new Set(dkSelected(v).idx);
  const ts = dkTrump(D);
  const done = D.finished.includes(App.me);
  const turn = v.phase === 'play' && dkWaiting(v).includes(App.me);
  // Wer am Zug sein könnte, sieht ausgegraut, was nicht geht. Antippbar bleibt jede Karte und trägt dann ihren Grund
  // (aria-disabled), beim Warten ohne Grau, denn dann geht gerade keine
  const acting = role === 'lead' || role === 'throw' || role === 'defend';
  const tappable = acting || role === 'wait' || role === 'taking';
  const cards: HandCard[] = hand.map((c, i) => {
    // Dieselbe Prüfung wie beim Host: Nachlegen nach dkAttackError, Verteidigen mit Schlagen oder Weiterschieben
    const why = tappable ? dkWhyNot(v, App.me, c) : null;
    const trump = suitOf(c) === ts;
    return {
      c,
      i,
      ...(tappable ? { act: 'dkh' } : {}),
      ...(acting ? { drag: 'hand' as const } : {}),
      sel: sel.has(i),
      dim: acting && !!why,
      why,
      cls: [acting && !why && 'pick', trump && 'trumpc', App.anim.deal && 'deal'].filter(Boolean).join(' '),
      delay: Number((0.3 + Math.min(i, 8) * 0.06).toFixed(2)),
      // Trumpf nie nur als Farbe: Zeichen in der Ecke (gefuehl M9), den Namen trägt die Mitte („Trumpf Herz“)
      ...(trump ? { extra: TRUMP_MARK, trump: true } : {}),
    };
  });
  const hn = hand.length;
  const doing = turn && (role === 'lead' || role === 'defend' || role === 'throw') ? role : null;
  return {
    head: {
      marks: reignHTML(v, me.id),
      count: dkcHTML(me),
      tags: done ? `<span class="tag">${TABLE.tag.place(num(me.place))}</span>` : '',
      pill: `<span class="pill">${hn ? `${hn}${HAND_ICON}${TABLE.handWord(hn)}` : `${HAND_ICON}Hand leer`}</span>`,
    },
    rows:
      '<div class="shrow">' +
      (hn ? handHTML({ kind: 'row', cls: 'shhand dkhand', label: SH_TABLE.hand(hn), cards, fit: true }) : '') +
      '</div>',
    bar: dkBar(v),
    st: turn ? ['turn'] : [],
    cls: ['shme', 'dkme'],
    say: DK_TABLE.me({ doing, place: done ? num(me.place) : 0, hand: hn }),
  };
}

function durakResult(v: View): DurakResult | null {
  return v.result?.reason === 'durak' ? v.result : null;
}

/**
 * Ergebnisblatt am Ende als Daten: der Durak mit seinen übrigen Karten als Schlüsselzeile, Spruch oder Duell, Tipps,
 * eigene Zeile und die übrigen in Reihenfolge. Unentschieden hat keine Schlüsselzeile. `null` außerhalb des
 * Partieendes, eine Rundenwertung gibt es bei Durak nicht.
 */
export function dkSheet(v: View): Sheet | null {
  const r = durakResult(v);
  if (v.phase !== 'over' || !r) return null;
  const loser = r.durak;
  const names = r.names ?? {};
  const nm = (id: string) => esc(nameOf(v, id, names[id]));
  const title =
    loser === App.me
      ? 'Du bist der <span class="r">Durak!</span>'
      : loser
        ? `${nm(loser)} ist der <span class="r">Durak!</span>`
        : 'Unentschieden!';
  // Nur wer allein zuerst fertig war, gilt als Erster. Das zeigen Krone und Zeile, die Einleitung erklärt nur das
  // Unentschieden, sonst kostet sie am Handy die Zeile, die zum Platz für acht fehlt
  const first = v.winner;
  const lead = loser ? '' : 'Die Letzten sind gleichzeitig fertig geworden. Diesmal gibt es keinen Durak.';
  let tt: Sheet['taunt'] = null;
  if (loser) {
    const seed = `d${v.games}`;
    if (loser === App.me) tt = { text: taunt('dkLoserSelf', null, seed), good: false };
    else if (first === App.me) tt = { text: taunt('dkWinSelf', null, seed), good: true };
    else tt = { text: taunt('dkLoserOther', { name: nameOf(v, loser, names[loser]) }, seed), good: false };
  }
  const order = loser ? [...r.ranking, loser] : r.ranking;
  const rows: SheetRow[] = order.map((id, i) => {
    const p = pById(v, id);
    const isL = id === loser;
    const P = v.dk?.P[id];
    const left: Card[] = isL && Array.isArray(P) ? P : [];
    // Wer im selben Angriff fertig wurde, teilt sich den Platz. Die Krone gibt es nur für einen allein vorn
    const place = num(p?.place) || i + 1;
    const top = first === id;
    const what = isL ? DK_SHEET.left(left.length) : top ? DK_SHEET.first : place === 1 ? DK_SHEET.tie : DK_SHEET.done;
    const n = num(p?.dkc);
    const count = n ? DK_SHEET.count(n) : '';
    // Kurzform für lange Namen am Handy: Platz und Krone sagen „fertig“ und „zuerst“ schon, der Zähler wie am Tisch
    const short = n ? DK_SHEET.countShort(n) : top ? DK_SHEET.firstShort : place === 1 ? DK_SHEET.tieShort : undefined;
    return {
      id,
      place,
      name: nm(id),
      hat: isL ? LOSER_MARK.durak : top ? '👑' : undefined,
      core: count ? `${what} · ${count}` : what,
      short,
      cards: isL ? left : undefined,
      tone: isL ? 'lose' : top ? 'win' : undefined,
    };
  });
  return {
    icon: loser === App.me ? LOSER_MARK.durak : loser ? '🏆' : '🤝',
    title,
    lead,
    key: loser,
    taunt: tt,
    bets: betResultHTML(v, r.bets, loser, 'Durak'),
    rows,
    next: 'game',
    cls: 'dk',
  };
}

export const dkSpec: NewTable = {
  badge: false,
  actor: (v) => (v.phase === 'play' ? turnId(v) : null),
  seat: dkSeat,
  center: dkCenter,
  me: dkMe,
  status: dkStatus,
  sheet: dkSheet,
  drag: true,
  after: () => fitHand(),
};

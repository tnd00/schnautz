/*
 * Durak-Tisch: Gegner mit Kartenzahl und Rolle, Stapel mit offenem Trumpf, die Angriffe auf dem Tisch,
 * weggelegte Karten, Status, eigene Hand mit Knöpfen und das Ergebnis am Ende.
 * Was ich gerade tun kann, steht in `dkRole`. Auswahl und Tipps verarbeitet src/ui/durak/input.ts.
 */
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
import { LOSER_MARK, unreachable } from '../../game/games';
import { type Reject, rj } from '../../game/reject';
import { ctxOfView, rejectText } from '../../content/texts';
import { OFFLINE_WAIT, offline, playFor, STATUS } from '../../content/texts/status';
import { DK_STATUS } from '../../content/texts/status-dk';
import type { Card, DkView, DurakResult, Player, Suit, View } from '../../game/types';
import { App } from '../app';
import { cardHTML, HAND_ICON } from '../cards';
import { layoutOpps } from '../carousel';
import { ceremonyOn } from '../ceremony';
import { markClocks } from '../clock';
import { $, esc, listJoin, num } from '../dom';
import { nameOf, onlyBotsPlaying, pById, seatOrder, vb, W } from '../helpers';
import { fitHand } from '../shithead/hand';
import { endMain, renderStatus, waitSub, whoHTML, type Status } from '../status';
import { taunt } from '../taunts';
import { markTosses } from '../toss';
import { betActionHTML, betsOnMeSub, betSub, betTagHTML } from './bets';
import { aimAttrs, dkcHTML, marksHTML, reignHTML } from './marks';
import { betResultHTML, botsOnlyHTML, renderResult, type Sheet, type SheetRow } from './result';

const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';
const SUIT_NAME: Record<Suit, string> = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };

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

function roleTag(v: View, D: DkView, p: Player, waiting: string[]): string {
  if (v.phase === 'over') {
    // Bis zur Enthüllung verrät auch das Etikett den Durak nicht
    if (D.durak === p.id) return App.zerHide === p.id ? '' : `<span class="tag outt">${LOSER_MARK.durak} Durak</span>`;
    return p.place ? `<span class="tag">Platz ${num(p.place)}</span>` : '';
  }
  if (D.finished.includes(p.id)) return `<span class="tag">Platz ${num(p.place)}</span>`;
  const busy = waiting.includes(p.id) ? THINKING : '';
  if (p.id === D.def) {
    if (D.take) return `<span class="tag take">nimmt auf${busy}</span>`;
    return `<span class="tag ${busy ? 'turn' : 'def'}">verteidigt${busy}</span>`;
  }
  if (p.id === D.att && !D.table.length) return `<span class="tag turn">greift an${busy}</span>`;
  // Hängt nur an der Passen-Liste, nie an Handkarten
  if (D.table.length && D.done.includes(p.id)) return '<span class="tag done">passt ✓</span>';
  if (D.table.length && busy && dkCount(v, p.id)) return `<span class="tag turn">legt nach?${busy}</span>`;
  if (p.id === D.att) return '<span class="tag att">greift an</span>';
  return betTagHTML(v, p.id);
}

/** Gegner: gehaltener Fächer mit Kartenzahl. Am Ende liegen die Karten des Durak offen. */
function opponentHTML(v: View, D: DkView, p: Player, waiting: string[]): string {
  const raw = D.P[p.id];
  if (raw == null) return '';
  const hn = dkCount(v, p.id);
  const over = v.phase === 'over';
  const done = D.finished.includes(p.id);
  let body: string;
  if (over && Array.isArray(raw) && raw.length) {
    body = `<div class="dkshow">${raw
      .slice(0, 8)
      .map((c) => cardHTML(c))
      .join('')}${raw.length > 8 ? `<span class="more">+${raw.length - 8}</span>` : ''}</div>`;
  } else if (hn) {
    let fan = '';
    const shown = Math.min(hn, 5);
    for (let i = 0; i < shown; i++) {
      const rot = (i - (shown - 1) / 2) * 12;
      fan += cardHTML(null, App.anim.deal ? 'deal' : '', `style="--rot:${rot}deg; --d:${i * 0.05}s"`);
    }
    body =
      `<div class="bighand" title="${hn} ${hn === 1 ? 'Karte' : 'Karten'} auf der Hand"><span class="ohand bigfan">${fan}</span>` +
      `<span class="bhn"><b>${hn}</b><span class="bht">${hn === 1 ? 'Karte' : 'Karten'}</span></span></div>`;
  } else body = `<div class="tcards"><div class="tnone">${done ? 'keine Karten mehr' : 'Hand leer'}</div></div>`;
  const on = waiting.includes(p.id);
  const cls = [
    'opp sh dk',
    on && 'turn',
    (p.out || done) && 'out',
    !p.online && 'offline',
    p.id === D.def && v.phase === 'play' && 'def',
    p.id === D.att && v.phase === 'play' && 'att',
  ]
    .filter(Boolean)
    .join(' ');
  const tag = roleTag(v, D, p, waiting);
  return (
    `<div data-pid="${esc(p.id)}" class="${cls}"${aimAttrs(p)}>` +
    body +
    `<div class="ometa">${marksHTML(v, p)}<span class="nm">${esc(p.name)}</span>${dkcHTML(p)}</div>` +
    (tag || '<span class="tag" style="visibility:hidden">.</span>') +
    '</div>'
  );
}

/** Tischmitte: Stapel mit Trumpf, Angriffe, weggelegte Karten. */
export function renderDkCenter(v: View): void {
  const D = v.dk;
  if (!D) return;
  const ts = dkTrump(D);
  const role = dkRole(v);
  const sel = dkSelected(v);
  const targets = role === 'defend' && sel.cards.length === 1 ? dkTargets(v, sel.cards[0]) : [];
  const dn = num(D.deck);
  const trumpCard = dn ? `<div class="dktrump" title="Trumpf">${cardHTML(D.trump)}</div>` : '';
  // Liegt nur noch der Trumpf, gibt es keinen Kartenrücken mehr darüber
  const deck =
    (dn > 1 ? cardHTML(null) + (dn > 2 ? cardHTML(null) : '') : dn ? '' : `<div class="emptyslot">leer</div>`) +
    (dn ? `<span class="pcount" title="Karten zum Nachziehen">${dn}</span>` : '') +
    trumpCard;
  const pairs = D.table
    .map((p, i) => {
      const pick = role === 'defend' && !p.d;
      const cls = ['dkpair', p.d ? 'beaten' : 'open', targets.includes(i) && 'target', App.ds.pair === i && 'chosen']
        .filter(Boolean)
        .join(' ');
      const attrs = pick ? ` data-act="dkt" data-i="${i}" role="button" tabindex="0"` : '';
      return (
        `<div class="${cls}" data-i="${i}"${attrs}>` +
        cardHTML(p.a, 'dka') +
        (p.d ? cardHTML(p.d, 'dkd') : '') +
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
          ? `noch ${room} ${room === 1 ? 'Karte passt' : 'Karten passen'} dazu`
          : 'voll';
  const empty = over ? '<div class="emptyslot">Vorbei</div>' : '<div class="emptyslot">Hier wird angegriffen</div>';
  $('#center').innerHTML =
    `<span class="cap">Trumpf ${suitHTML(ts)} ${SUIT_NAME[ts]}</span>` +
    `<div class="deck dkdeck" title="Nachziehstapel">${deck}</div>` +
    `<div class="dktable${D.table.length ? '' : ' empty'}">${pairs || empty}` +
    (info ? `<span class="cnt">${info}</span>` : '') +
    '</div>' +
    `<div class="burned dkbito" title="Bito, abgewehrte Karten"><b>${num(D.discard)}</b><span class="cnt">Bito</span></div>`;
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

/**
 * Knöpfe am eigenen Platz, je nach Rolle. Sie stehen immer an derselben Stelle und werden nur deaktiviert,
 * damit nicht plötzlich ein anderer Knopf unter dem Finger liegt, wenn jemand anderes etwas tut.
 */
function actionsHTML(v: View): string {
  const role = dkRole(v);
  const D = v.dk;
  const sel = dkSelected(v);
  const n = sel.cards.length;
  const many = n > 1 ? ` (${n})` : '';
  const btn = (act: string, cls: string, label: string, ok: boolean) =>
    `<button class="btn ${cls}" data-act="${act}"${ok ? '' : ' disabled'}>${label}</button>`;
  const btns: string[] = [];
  if (role === 'lead')
    btns.push(btn('dkgo', 'primary', `Angreifen${many}`, n > 0 && !dkAttackError(v, App.me, sel.cards)));
  else if (role === 'throw' && D) {
    const can = n > 0 && !dkAttackError(v, App.me, sel.cards);
    btns.push(btn('dkgo', can ? 'primary' : 'ghost', `Nachlegen${many}`, can));
    const done = D.done.includes(App.me);
    btns.push(btn('dkpass', can ? 'ghost' : 'primary', done ? 'Gepasst ✓' : 'Passen', dkCanPass(v)));
  } else if (role === 'defend' && D) {
    const pair = dkBeatPair(v);
    btns.push(btn('dkbeat', 'primary', 'Schlagen', pair != null));
    // Weiterschieben steht da, solange es in diesem Angriff noch gehen könnte
    if (v.rules.dk?.transfer && !D.table.some((p) => p.d)) {
      const ok = n > 0 && !dkTransferError(v, App.me, sel.cards);
      btns.push(
        btn(
          'dktransfer',
          'wood',
          `<span class="blong">Weiterschieben${many}</span><span class="bshort">Schieben</span>`,
          ok,
        ),
      );
    }
    btns.push(btn('dktake', pair != null ? 'ghost' : 'wood', 'Aufnehmen', true));
  }
  // Ändert sich die Zeile, sind Tipps kurz gesperrt (src/ui/durak/input.ts)
  const sig = `${role}|${btns.map((b) => /data-act="(\w+)"/.exec(b)?.[1]).join(',')}`;
  if (sig !== App.dkBtn.sig) App.dkBtn = { sig, at: Date.now() };
  const bet = betActionHTML(v);
  return `<div class="actions">${btns.join('')}${bet}</div>`;
}

/** Eigener Platz: Kopf, Hand, Knöpfe. */
function myPlaceHTML(v: View, D: DkView, me: Player, hand: Card[]): string {
  const role = dkRole(v);
  const sel = new Set(dkSelected(v).idx);
  const ts = dkTrump(D);
  const done = D.finished.includes(App.me);
  // Wer am Zug sein könnte, sieht ausgegraut, was nicht geht. Antippbar bleibt jede Karte, sie nennt dann ihren Grund
  const acting = role === 'lead' || role === 'throw' || role === 'defend';
  const tappable = acting || role === 'wait' || role === 'taking';
  let h =
    `<div class="mehead">${reignHTML(v, me.id)}<span class="nm">Du</span>${dkcHTML(me)}` +
    (done ? `<span class="tag">Platz ${num(me.place)}</span>` : '') +
    `<span class="pill">${hand.length ? `${hand.length}${HAND_ICON}${hand.length === 1 ? 'Handkarte' : 'Handkarten'}` : `${HAND_ICON}Hand leer`}</span></div>`;
  h += '<div class="shrow">';
  if (hand.length) h += '<div class="shhand dkhand">';
  hand.forEach((c, i) => {
    // Dieselbe Prüfung wie beim Host: Nachlegen nach dkAttackError, Verteidigen mit Schlagen oder Weiterschieben
    const usable = acting && !dkWhyNot(v, App.me, c);
    const cls =
      (usable ? 'pick' : '') +
      (sel.has(i) ? ' sel' : '') +
      (acting && !usable ? ' dim' : '') +
      (suitOf(c) === ts ? ' trumpc' : '') +
      (App.anim.deal ? ' deal' : '');
    const attrs =
      (tappable ? `data-act="dkh" data-i="${i}" role="button" tabindex="0" ` : '') +
      `style="--d:${(0.3 + Math.min(i, 8) * 0.06).toFixed(2)}s"`;
    h += cardHTML(c, cls, attrs);
  });
  if (hand.length) h += '</div>';
  h += '</div>';
  return h + actionsHTML(v);
}

export function renderDk(v: View): void {
  const D = v.dk;
  if (!D) return;
  const me = pById(v, App.me);
  const hand = dkMine(v);
  const waiting = v.phase === 'play' ? dkWaiting(v) : [];
  $('#opps').innerHTML = seatOrder(v)
    .map((p) => opponentHTML(v, D, p, waiting))
    .join('');
  renderDkCenter(v);
  renderStatus(v);
  const meEl = $('#me');
  meEl.className = `me shme dkme${waiting.includes(App.me) ? ' turn' : ''}`;
  meEl.innerHTML =
    me && hand ? myPlaceHTML(v, D, me, hand) : '<div class="outmsg">Du spielst diese Partie nicht mit.</div>';
  fitHand();
  layoutOpps(v);
  markClocks();
  markTosses();
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
    const what = isL
      ? `${left.length} ${left.length === 1 ? 'Karte übrig' : 'Karten übrig'}`
      : top
        ? 'zuerst fertig'
        : place === 1
          ? 'gleichzeitig fertig'
          : 'fertig';
    return {
      id,
      place,
      name: nm(id),
      hat: isL ? LOSER_MARK.durak : top ? '👑' : undefined,
      core: `${what}${p?.dkc ? ` · ${num(p.dkc)}× Durak` : ''}`,
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

/** Ergebnis am Ende über das gemeinsame Blatt. */
export function renderDkOverlay(v: View): void {
  renderResult(v, dkSheet(v));
}

/*
 * Durak-Tisch: Gegner mit Kartenzahl und Rolle, Stapel mit offenem Trumpf, die Angriffe auf dem Tisch,
 * weggelegte Karten, Status, eigene Hand mit Knöpfen und das Ergebnis am Ende.
 * Was ich gerade tun kann, steht in `dkRole`. Auswahl und Tipps verarbeitet src/ui/durak/input.ts.
 */
import { dkBeats, rankOf, suitOf } from '../../game/cards';
import { SUIT_SYM } from '../../game/constants';
import {
  dkAttackError,
  dkCount,
  dkLive,
  dkOpen,
  dkRoom,
  dkTableRanks,
  dkTransferError,
  dkTrump,
  dkWaiting,
} from '../../game/durak';
import { LOSER_MARK } from '../../game/games';
import type { Card, DkView, DurakResult, Player, Suit, View } from '../../game/types';
import { App } from '../app';
import { cardHTML, HAND_ICON } from '../cards';
import { layoutOpps } from '../carousel';
import { markClocks } from '../clock';
import { $, esc, num } from '../dom';
import { holdOverlay } from '../feedback';
import { nameOf, onlyBotsPlaying, pById, seatOrder, vb, W } from '../helpers';
import { fitHand } from '../shithead/hand';
import { taunt } from '../taunts';
import { markTosses } from '../toss';
import { betActionHTML, betsOnMeSub, betSub, betTagHTML } from './bets';
import { aimAttrs, dkcHTML, marksHTML, reignHTML } from './marks';
import { rematchLine, rematchMark } from './rematch';
import { botsOnlyHTML, overlayFoot, peekHTML } from './schnautz';
import { betResultHTML } from './shithead';

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

/** Darf ich gerade fertig sagen? */
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
    if (D.durak === p.id) return `<span class="tag outt">${LOSER_MARK.durak} Durak</span>`;
    return p.place ? `<span class="tag">Platz ${num(p.place)}</span>` : '';
  }
  if (D.finished.includes(p.id)) return `<span class="tag">Platz ${num(p.place)}</span>`;
  const busy = waiting.includes(p.id) ? THINKING : '';
  if (p.id === D.def) {
    if (D.take) return `<span class="tag take">nimmt auf${busy}</span>`;
    return `<span class="tag ${busy ? 'turn' : 'def'}">verteidigt${busy}</span>`;
  }
  if (p.id === D.att && !D.table.length) return `<span class="tag turn">greift an${busy}</span>`;
  if (D.table.length && D.done.includes(p.id)) return '<span class="tag done">fertig ✓</span>';
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
  const deck =
    (dn
      ? cardHTML(null) +
        (dn > 1 ? cardHTML(null) : '') +
        `<span class="pcount" title="Karten zum Nachziehen">${dn}</span>`
      : `<div class="emptyslot">leer</div>`) + trumpCard;
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
  const info = !D.table.length
    ? `Bis zu ${num(D.limit)} Karten`
    : D.take
      ? `${W(v, D.def)} nimmt auf · ${room ? `noch ${room} dazu` : 'voll'}`
      : room
        ? `noch ${room} ${room === 1 ? 'Karte passt' : 'Karten passen'} dazu`
        : 'voll';
  $('#center').innerHTML =
    `<span class="cap">Trumpf ${suitHTML(ts)} ${SUIT_NAME[ts]}</span>` +
    `<div class="deck dkdeck" title="Nachziehstapel">${deck}</div>` +
    `<div class="dktable${D.table.length ? '' : ' empty'}">${pairs || '<div class="emptyslot">Hier wird angegriffen</div>'}` +
    `<span class="cnt">${info}</span></div>` +
    `<div class="burned dkbito" title="Weggelegte Karten"><span class="flame">🗑️</span><b>${num(D.discard)}</b><span class="cnt">weg</span></div>`;
}

/** Status über dem eigenen Platz. */
function statusHTML(v: View, D: DkView, me: Player | null): string {
  const role = dkRole(v);
  const def = D.def;
  let main = '';
  let sub = '';
  let quick = '';
  if (v.phase === 'play') {
    switch (role) {
      case 'lead':
        main = '<em>Du greifst an.</em>';
        sub = `Tippe eine Karte oder gleiche Werte an und greif ${W(v, def)} an.`;
        break;
      case 'defend':
        main = '<em>Du verteidigst.</em>';
        sub =
          D.table.length && !D.table.some((p) => p.d) && v.rules.dk?.transfer
            ? 'Schlag jede Karte, nimm alles auf oder schieb mit gleichem Wert weiter.'
            : 'Tippe eine Karte und dann den Angriff, den sie schlagen soll. Oder nimm alles auf.';
        break;
      case 'taking':
        main = 'Du nimmst auf.';
        sub = 'Die anderen dürfen dir noch etwas obendrauf legen.';
        break;
      case 'throw':
        main = D.take
          ? `<em>${W(v, def)} nimmt auf.</em>`
          : dkOpen(D).length
            ? `${W(v, def)} verteidigt.`
            : '<em>Alles geschlagen.</em>';
        sub =
          D.take || !dkOpen(D).length
            ? 'Passende Werte darfst du nachlegen, sonst tippe Fertig.'
            : 'Passende Werte darfst du schon nachlegen.';
        break;
      case 'done':
        main = 'Du bist fertig!';
        sub = (me && betSub(v, num(me.place))) ?? `Platz ${num(me?.place)}. Werfen und tröten darfst du trotzdem.`;
        if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
        break;
      default: {
        // Werde ich angegriffen, heißt es dich statt Du
        const whom = def === App.me ? '<b>dich</b>' : W(v, def);
        main = D.table.length ? `${W(v, D.att)} greift ${whom} an.` : `${W(v, D.att)} greift gleich ${whom} an.`;
        sub = betsOnMeSub(v) ?? '';
      }
    }
  } else if (v.phase === 'over') main = 'Partie vorbei.';
  // Wer gerade aufhält und offline ist
  const waiting = dkWaiting(v);
  const off = v.players.find((p) => waiting.includes(p.id) && !p.online && !p.bot && p.id !== App.me);
  if (v.phase === 'play' && off) {
    sub =
      `${esc(off.name)} ist gerade offline.` +
      (App.role === 'host'
        ? ` <button class="btn ghost small" data-act="skip">Für ${esc(off.name)} spielen</button>`
        : ' Das Spiel wartet.');
  }
  const second = quick ? `<div class="quick">${quick}</div>` : sub ? `<div class="sub">${sub}</div>` : '';
  return `<div class="main">${main}</div>${second}`;
}

/** Knöpfe am eigenen Platz, je nach Rolle. */
function actionsHTML(v: View): string {
  const role = dkRole(v);
  const sel = dkSelected(v);
  const btns: string[] = [];
  const n = sel.cards.length;
  const many = n > 1 ? ` (${n})` : '';
  if (role === 'lead') {
    const err = n ? dkAttackError(v, App.me, sel.cards) : 'Wähle eine Karte.';
    btns.push(`<button class="btn primary" data-act="dkgo"${err ? ' disabled' : ''}>Angreifen${many}</button>`);
  } else if (role === 'throw') {
    if (n && !dkAttackError(v, App.me, sel.cards))
      btns.push(`<button class="btn primary" data-act="dkgo">Nachlegen${many}</button>`);
    if (dkCanPass(v)) btns.push(`<button class="btn ${n ? 'ghost' : 'primary'}" data-act="dkpass">Fertig</button>`);
  } else if (role === 'defend') {
    const t = n === 1 ? dkTargets(v, sel.cards[0]) : [];
    const pair = App.ds.pair != null && t.includes(App.ds.pair) ? App.ds.pair : t.length === 1 ? t[0] : null;
    if (pair != null) btns.push('<button class="btn primary" data-act="dkbeat">Schlagen</button>');
    if (n && !dkTransferError(v, App.me, sel.cards))
      btns.push(`<button class="btn wood" data-act="dktransfer">Weiterschieben${many}</button>`);
    btns.push(`<button class="btn ${pair != null ? 'ghost' : 'wood'}" data-act="dktake">Aufnehmen</button>`);
  }
  const bet = betActionHTML(v);
  return `<div class="actions">${btns.join('')}${bet}</div>`;
}

/** Eigener Platz: Kopf, Hand, Knöpfe. */
function myPlaceHTML(v: View, D: DkView, me: Player, hand: Card[]): string {
  const role = dkRole(v);
  const sel = new Set(dkSelected(v).idx);
  const ts = dkTrump(D);
  const ranks = dkTableRanks(D);
  const open = dkOpen(D);
  const done = D.finished.includes(App.me);
  let h =
    `<div class="mehead">${reignHTML(v, me.id)}<span class="nm">Du</span>${dkcHTML(me)}` +
    (done ? `<span class="tag">Platz ${num(me.place)}</span>` : '') +
    `<span class="pill">${hand.length ? `${hand.length}${HAND_ICON}${hand.length === 1 ? 'Handkarte' : 'Handkarten'}` : `${HAND_ICON}Hand leer`}</span></div>`;
  h += '<div class="shrow">';
  if (hand.length) h += '<div class="shhand dkhand">';
  hand.forEach((c, i) => {
    let usable = false;
    if (role === 'lead') usable = true;
    else if (role === 'throw') usable = ranks.has(rankOf(c)) && dkRoom(D) > 0;
    else if (role === 'defend')
      usable =
        open.some((p) => dkBeats(c, p.a, ts)) ||
        (!!v.rules.dk?.transfer && !D.table.some((p) => p.d) && rankOf(c) === rankOf(D.table[0]?.a ?? ''));
    const cls =
      (usable ? 'pick' : '') +
      (sel.has(i) ? ' sel' : '') +
      (role !== 'wait' && role !== 'done' && role !== 'none' && role !== 'taking' && !usable ? ' dim' : '') +
      (suitOf(c) === ts ? ' trumpc' : '') +
      (App.anim.deal ? ' deal' : '');
    const attrs =
      (usable ? `data-act="dkh" data-i="${i}" role="button" tabindex="0" ` : '') +
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
  const stEl = $('#status');
  stEl.className = 'status';
  stEl.innerHTML = statusHTML(v, D, me);
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

/** Ergebnis: Reihenfolge, der Durak mit seinen übrigen Karten und ein frecher Spruch. */
export function renderDkOverlay(v: View): void {
  const ov = $('#overlay');
  const r = durakResult(v);
  if (v.phase !== 'over' || !r) {
    ov.innerHTML = '';
    return;
  }
  if (holdOverlay()) return;
  if (App.peek) {
    ov.innerHTML = peekHTML(v, pById(v, App.me));
    return;
  }
  const me = pById(v, App.me);
  const loser = r.durak;
  const names = r.names ?? {};
  const nm = (id: string) => esc(nameOf(v, id, names[id]));
  const title =
    loser === App.me
      ? 'Du bist der <span class="r">Durak!</span>'
      : loser
        ? `${nm(loser)} ist der <span class="r">Durak!</span>`
        : 'Unentschieden!';
  const first = r.ranking[0];
  const lead = !loser
    ? 'Die Letzten sind gleichzeitig rausgegangen. Diesmal gibt es keinen Durak.'
    : first === App.me
      ? 'Du warst zuerst fertig.'
      : first
        ? `${nm(first)} war zuerst fertig.`
        : '';
  let tt = '';
  let good = false;
  if (loser) {
    const seed = `d${v.games}`;
    if (loser === App.me) tt = taunt('dkLoserSelf', null, seed);
    else if (first === App.me) {
      tt = taunt('dkWinSelf', null, seed);
      good = true;
    } else tt = taunt('dkLoserOther', { name: nameOf(v, loser, names[loser]) }, seed);
  }
  const rline = rematchLine(v);
  const order = loser ? [...r.ranking, loser] : r.ranking;
  const rows = order
    .map((id, i) => {
      const p = pById(v, id);
      const isL = id === loser;
      const P = v.dk?.P[id];
      const left: Card[] = isL && Array.isArray(P) ? P : [];
      const what = isL
        ? `${left.length} ${left.length === 1 ? 'Karte übrig' : 'Karten übrig'}`
        : i === 0
          ? 'zuerst fertig'
          : 'fertig';
      const hat = isL ? `<span class="hat">${LOSER_MARK.durak}</span>` : i === 0 ? '<span class="hat">👑</span>' : '';
      const leftCards = left.length
        ? `<div class="mini shleft">${left
            .slice(0, 8)
            .map((c) => cardHTML(c))
            .join('')}${left.length > 8 ? `<span class="more">+${left.length - 8}</span>` : ''}</div>`
        : '';
      return (
        `<div class="row${isL ? ' lose' : i === 0 ? ' win' : ''}" data-pid="${esc(id)}"${aimAttrs(p, true)}><div class="val" style="min-width:34px;text-align:left">${i + 1}.</div>` +
        `<div class="who"><b>${hat}${nm(id)}${rematchMark(v, id)}</b><span>${what}${p?.dkc ? ` · ${num(p.dkc)}× Durak` : ''}</span>${leftCards}</div></div>`
      );
    })
    .join('');
  ov.innerHTML =
    `<div class="modal"><div class="paper sheet result"><div class="trophy">${loser === App.me ? LOSER_MARK.durak : loser ? '🏆' : '🤝'}</div>` +
    `<h2>${title}</h2><p class="lead">${lead}</p>` +
    (rline ? `<p class="taunt rv">${rline}</p>` : tt ? `<p class="taunt${good ? ' good' : ''}">${esc(tt)}</p>` : '') +
    `<div class="rows">${rows}</div>${betResultHTML(v, r.bets, loser, 'Durak')}${overlayFoot(v, me)}</div></div>`;
}

/** Für Würfe und Meldungen: wer greift wen an, als Text. */
export function dkWho(v: View): string {
  const D = v.dk;
  if (!D) return '';
  return `${nameOf(v, D.att)} ${vb(D.att, 'greifst', 'greift')} ${nameOf(v, D.def)} an`;
}

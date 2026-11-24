/*
 * Cabo-Tisch: Gegner mit ihrer Reihe aus verdeckten Karten und ihrem Punktestand, in der Mitte Stapel, gezogene
 * Karte und Ablage, unten die eigene Reihe mit Knöpfen. Was man ansieht, blitzt nur kurz auf (App.cbShow), danach
 * muss man es sich merken. Was ich gerade tun kann, steht in `cbRole`. Tipps verarbeitet src/ui/cabo/input.ts.
 */
import { cbKamikaze, cbPower, cbWaiting } from '../../game/cabo';
import { cbVal } from '../../game/cards';
import { CB_REVEAL_MS } from '../../game/constants';
import type { CaboResult, Card, CbSlotView, CbView, Player, View } from '../../game/types';
import { App } from '../app';
import { cardHTML } from '../cards';
import { layoutOpps } from '../carousel';
import { markClocks } from '../clock';
import { $, esc, num } from '../dom';
import { holdOverlay } from '../feedback';
import { nameOf, onlyBotsPlaying, pById, seatOrder, turnId, vb, W } from '../helpers';
import { taunt } from '../taunts';
import { markTosses } from '../toss';
import { aimAttrs, marksHTML, reignHTML } from './marks';
import { rematchLine, rematchMark } from './rematch';
import { botsOnlyHTML, overlayFoot, peekHTML } from './schnautz';

const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';

export type CbRole = 'look' | 'looked' | 'draw' | 'hold' | 'ownpeek' | 'spy' | 'blind' | 'wait' | 'none';

/** Was eine abgelegte Karte kann, kurz für Knöpfe und lang für Hinweise. */
export const CB_POWER_SHORT = { peek: '👁️ eigene', spy: '🔍 fremde', swap: '🔀 tauschen' } as const;
const POWER_ICON = { peek: '👁️', spy: '🔍', swap: '🔀' } as const;
const POWER_LONG = {
  peek: 'eine eigene Karte ansehen',
  spy: 'eine fremde Karte ansehen',
  swap: 'blind mit jemandem tauschen',
} as const;

/** Eigene Reihe, wenn ich diese Runde mitspiele. */
export function cbMine(v: View): CbSlotView[] | null {
  return v.cb?.P[App.me] ?? null;
}

/** Was ich gerade tun kann. */
export function cbRole(v: View): CbRole {
  const C = v.cb;
  if (!C || !C.P[App.me]) return 'none';
  if (v.phase === 'peek') return pById(v, App.me)?.ready ? 'looked' : 'look';
  if (v.phase !== 'play') return 'none';
  if (turnId(v) !== App.me) return 'wait';
  if (C.power?.by === App.me) return C.power.kind === 'peek' ? 'ownpeek' : C.power.kind === 'spy' ? 'spy' : 'blind';
  if (C.hold?.by === App.me) return 'hold';
  return 'draw';
}

/** Darf ich gerade schnappen? Nur mit Schalter, während der Runde und wenn ich nicht gerade selbst ziehe. */
export function cbCanSnap(v: View): boolean {
  const C = v.cb;
  const role = cbRole(v);
  return !!v.rules.cb?.snap && !!C?.pile.length && !!cbMine(v)?.length && (role === 'wait' || role === 'draw');
}

/** Karte, die ich gerade kurz sehen darf, sonst null. */
export function cbSeen(owner: string, slot: number): Card | null {
  const S = App.cbShow;
  if (Date.now() >= S.until) return null;
  return S.items.find((x) => x.owner === owner && x.slot === slot)?.c ?? null;
}

const valBadge = (c: Card): string => `<span class="cbv${cbVal(c) === 0 ? ' zero' : ''}">${cbVal(c)}</span>`;

interface SlotOpts {
  act?: string;
  sel?: boolean;
}

/** Ein Platz: verdeckt, offen für alle, oder nur für mich gerade kurz zu sehen. */
function slotHTML(owner: string, s: CbSlotView, o: SlotOpts = {}): string {
  const seen = s.c ? null : cbSeen(owner, s.id);
  const c = s.c ?? seen;
  const cls = ['cbslot', s.up && 'up', seen && 'seen', o.sel && 'sel', o.act && 'pick'].filter(Boolean).join(' ');
  // Der Balken, der die Restzeit zeigt, läuft beim Neuzeichnen an derselben Stelle weiter
  const left = seen ? Math.max(0, App.cbShow.until - Date.now()) : 0;
  const style = seen ? ` style="--cbms:${CB_REVEAL_MS}ms; --cbgone:${CB_REVEAL_MS - left}ms"` : '';
  const attrs = o.act ? ` data-act="${o.act}" data-o="${esc(owner)}" role="button" tabindex="0"` : '';
  return (
    `<div class="${cls}" data-sid="${s.id}"${attrs}${style}>` +
    cardHTML(c, App.anim.deal ? 'deal' : '') +
    (c ? valBadge(c) : '') +
    (seen ? '<span class="cbeye" aria-hidden="true">👁️</span>' : '') +
    '</div>'
  );
}

/** Kleines Etikett unter einem Gegner. */
function tagOf(v: View, C: CbView, p: Player, waiting: string[]): string {
  const r = caboResult(v);
  if (v.phase === 'over') {
    if (v.winner === p.id && App.zerHide !== p.id) return '<span class="tag king">👑 Cabo-König</span>';
    return p.place ? `<span class="tag">Platz ${num(p.place)}</span>` : '';
  }
  if (v.phase === 'end' && r && p.id in r.scores) return `<span class="tag">+${num(r.scores[p.id])}</span>`;
  if (v.phase === 'peek')
    return p.ready ? '<span class="tag done">angesehen ✓</span>' : `<span class="tag turn">schaut${THINKING}</span>`;
  if (C.cabo === p.id) return '<span class="tag cabo">📣 Cabo!</span>';
  if (!waiting.includes(p.id)) return C.cabo && C.left.includes(p.id) ? '<span class="tag">noch einmal</span>' : '';
  if (C.power?.by === p.id) {
    const what = C.power.kind === 'peek' ? 'schaut' : C.power.kind === 'spy' ? 'spioniert' : 'tauscht blind';
    return `<span class="tag turn">${what}${THINKING}</span>`;
  }
  if (C.hold?.by === p.id) return `<span class="tag turn">überlegt${THINKING}</span>`;
  return `<span class="tag turn">ist dran${THINKING}</span>`;
}

/** Gezogene Karte einer anderen Person: Sie hält sie über ihrer Reihe, verdeckt, außer sie kam von der Ablage. */
function heldHTML(C: CbView, pid: string): string {
  if (C.hold?.by !== pid) return '';
  return `<div class="cbheld" title="Gezogene Karte">${cardHTML(C.hold.c ?? null)}</div>`;
}

function opponentHTML(v: View, C: CbView, p: Player, waiting: string[]): string {
  const row = C.P[p.id];
  const role = cbRole(v);
  const act = role === 'spy' || role === 'blind' ? 'cbo' : '';
  const slots = row
    ? row.map((s) => slotHTML(p.id, s, { act, sel: App.cs.opp?.to === p.id && App.cs.opp.id === s.id })).join('')
    : '<div class="tnone">spielt ab der nächsten Runde mit</div>';
  const on = waiting.includes(p.id);
  const cls = [
    'opp sh cb',
    on && 'turn',
    !p.online && 'offline',
    act && 'aimable',
    C.cabo === p.id && v.phase === 'play' && 'called',
  ]
    .filter(Boolean)
    .join(' ');
  const tag = tagOf(v, C, p, waiting);
  return (
    `<div data-pid="${esc(p.id)}" class="${cls}"${act ? '' : aimAttrs(p)}>` +
    `<div class="cbrow${row && row.length > 4 ? ' many' : ''}">${slots}${heldHTML(C, p.id)}</div>` +
    `<div class="ometa">${marksHTML(v, p)}<span class="nm">${esc(p.name)}</span><span class="cbp" title="Punkte">${num(p.cbp)}</span></div>` +
    (tag || '<span class="tag" style="visibility:hidden">.</span>') +
    '</div>'
  );
}

/** Tischmitte: Stapel, gezogene Karte, Ablage und darüber, was gerade los ist. */
export function renderCbCenter(v: View): void {
  const C = v.cb;
  if (!C) return;
  const role = cbRole(v);
  const dn = num(C.deck);
  const play = v.phase === 'play';
  const deckAct = role === 'draw' && dn > 0;
  const top = C.pile[C.pile.length - 1];
  const under = C.pile[C.pile.length - 2];
  const pileAct = role === 'draw' && !!top ? 'cbpile' : role === 'hold' && C.hold?.from === 'deck' ? 'cbdiscard' : '';
  const tap = (act: string, label: string) => ` data-act="${act}" role="button" tabindex="0" aria-label="${label}"`;
  const deck = dn
    ? cardHTML(null) +
      (dn > 1 ? cardHTML(null) : '') +
      (dn > 2 ? cardHTML(null) : '') +
      `<span class="pcount" title="Karten im Stapel">${dn}</span>`
    : '<div class="emptyslot">leer</div>';
  const pile = top
    ? (under ? cardHTML(under, 'under') : '') + cardHTML(top, App.anim.pilePop ? 'pop' : '') + valBadge(top)
    : '<div class="emptyslot">leer</div>';
  // Meine gezogene Karte liegt groß in der Mitte, fremde schweben über der Reihe der Person
  const mineHeld = C.hold?.by === App.me && C.hold.c;
  let hold = '<div class="emptyslot">gezogen</div>';
  let holdCnt = '';
  if (mineHeld && C.hold?.c) {
    hold = cardHTML(C.hold.c, 'held') + valBadge(C.hold.c);
    const pw = C.hold.from === 'deck' ? cbPower(C.hold.c) : null;
    holdCnt = pw ? `Deine Karte · ${CB_POWER_SHORT[pw]}` : 'Deine Karte';
  } else if (C.power) {
    // Die Karte liegt schon auf der Ablage, hier steht nur, was sie gerade erlaubt
    hold = `<div class="emptyslot cbpow">${POWER_ICON[C.power.kind]}</div>`;
    if (C.power.by === App.me) holdCnt = POWER_LONG[C.power.kind];
  }
  let cap = `Runde ${num(v.round)} · bis ${num(v.rules.cb?.target ?? 100)} Punkte`;
  if (C.cabo && play) {
    const n = C.left.length;
    cap = `📣 ${W(v, C.cabo)}${vb(C.cabo, ' hast', ' hat')} Cabo gerufen · noch ${n} ${n === 1 ? 'Zug' : 'Züge'}`;
  } else if (play && dn <= 5) cap = dn ? `Nur noch ${dn} ${dn === 1 ? 'Karte' : 'Karten'} im Stapel` : 'Stapel leer';
  else if (v.phase === 'peek') cap = `Runde ${num(v.round)} · alle sehen sich zwei Karten an`;
  $('#center').innerHTML =
    `<span class="cap">${cap}</span>` +
    `<div class="deck cbdeck${deckAct ? ' can' : ''}" title="Stapel"${deckAct ? tap('cbdeck', 'Vom Stapel ziehen') : ''}>${deck}</div>` +
    `<div class="cbhold${mineHeld || C.power ? ' on' : ''}">${hold}${holdCnt ? `<span class="cnt">${holdCnt}</span>` : ''}</div>` +
    `<div class="pile cbpile${pileAct ? ' can' : ''}" title="Ablage"${pileAct ? tap(pileAct, pileAct === 'cbpile' ? 'Von der Ablage nehmen' : 'Ablegen') : ''}>${pile}</div>`;
}

/** Status über dem eigenen Platz: was ich tun soll oder worauf wir warten. */
function statusHTML(v: View, C: CbView): string {
  const role = cbRole(v);
  const n = App.cs.ids.length;
  const cur = turnId(v);
  let main = '';
  let sub = '';
  let quick = '';
  switch (role) {
    case 'look':
      main = '<em>Sieh dir zwei Karten an.</em>';
      sub =
        n === 1
          ? 'Noch eine. Sie sind nur ein paar Sekunden zu sehen, merk sie dir gut.'
          : 'Tippe zwei deiner Karten an. Sie sind nur ein paar Sekunden zu sehen, merk sie dir gut.';
      break;
    case 'looked': {
      main = 'Gut merken!';
      const rest = v.players.filter((p) => !p.ready && C.P[p.id]).map((p) => esc(p.name));
      sub = rest.length ? `Warte auf ${rest.join(', ')}.` : "Los geht's.";
      break;
    }
    case 'draw':
      main = C.cabo ? '<em>Dein letzter Zug!</em>' : '<em>Du bist dran.</em>';
      sub = C.cabo
        ? 'Zieh vom Stapel oder nimm die Ablage, dann ist abgerechnet.'
        : 'Zieh vom Stapel, nimm die oberste Ablage oder ruf Cabo, wenn du glaubst, du hast am wenigsten.';
      break;
    case 'hold': {
      const c = C.hold?.c;
      const fromPile = C.hold?.from === 'pile';
      main = c
        ? `<em>Du hast eine ${cbVal(c)} ${fromPile ? 'genommen' : 'gezogen'}.</em>`
        : '<em>Du hast gezogen.</em>';
      const pw = !fromPile && c ? cbPower(c) : null;
      if (n > 1) sub = `Du tauschst ${n} Karten auf einmal. Sind sie nicht alle gleich, gibt es eine Strafkarte.`;
      else if (fromPile) sub = 'Tausch sie gegen eine deiner Karten oder mehrere gleiche. Sie liegt danach offen.';
      else if (pw) sub = `Tausch sie gegen deine Karten oder leg sie ab und du darfst ${POWER_LONG[pw]}.`;
      else sub = 'Tausch sie gegen eine oder mehrere gleiche Karten oder leg sie ab.';
      break;
    }
    case 'ownpeek':
      main = '<em>Schau dir eine eigene Karte an.</em>';
      sub = 'Tippe eine deiner Karten an.';
      break;
    case 'spy':
      main = '<em>Spionieren!</em>';
      sub = 'Tippe eine Karte von jemand anderem an. Nur du siehst sie.';
      break;
    case 'blind':
      main = '<em>Blind tauschen.</em>';
      sub =
        n && App.cs.opp
          ? 'Alles gewählt. Tippe Blind tauschen.'
          : 'Wähle eine eigene und eine fremde Karte. Was du bekommst, siehst du nicht.';
      break;
    case 'wait': {
      main = `${W(v, cur)} ist dran.`;
      if (C.power?.by === cur) sub = `${esc(nameOf(v, cur))} darf ${POWER_LONG[C.power.kind]}.`;
      else if (C.hold?.by === cur)
        sub =
          C.hold.from === 'pile' && C.hold.c
            ? `${esc(nameOf(v, cur))} hat die ${cbVal(C.hold.c)} von der Ablage genommen.`
            : `${esc(nameOf(v, cur))} hat vom Stapel gezogen und überlegt.`;
      else if (C.cabo)
        sub = C.left.includes(App.me) ? 'Du bist danach noch einmal dran.' : 'Du hast keinen Zug mehr in dieser Runde.';
      if (cbCanSnap(v) && App.cs.snap) sub = 'Tippe die Karte, die zur Ablage passt. Daneben gibt es eine Strafkarte.';
      break;
    }
    case 'none':
      if (v.phase === 'end') main = 'Runde vorbei.';
      else if (v.phase === 'over') main = 'Partie vorbei.';
      else if (v.phase === 'play' && !cbMine(v)) {
        main = 'Du spielst ab der nächsten Runde mit.';
        if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
      }
      break;
  }
  if (role === 'draw' && cbCanSnap(v) && App.cs.snap)
    sub = 'Tippe die Karte, die zur Ablage passt. Daneben gibt es eine Strafkarte.';
  // Wer gerade aufhält und offline ist
  const waiting = cbWaiting(v);
  const off = v.players.find((p) => waiting.includes(p.id) && !p.online && !p.bot && p.id !== App.me);
  if ((v.phase === 'play' || v.phase === 'peek') && off) {
    sub =
      `${esc(off.name)} ist gerade offline.` +
      (App.role === 'host'
        ? ` <button class="btn ghost small" data-act="skip">Für ${esc(off.name)} spielen</button>`
        : ' Das Spiel wartet.');
  }
  const second = quick ? `<div class="quick">${quick}</div>` : sub ? `<div class="sub">${sub}</div>` : '';
  return `<div class="main">${main}</div>${second}`;
}

/**
 * Knöpfe am eigenen Platz. Sie stehen je Rolle immer an derselben Stelle und werden nur deaktiviert, damit nicht
 * plötzlich ein anderer Knopf unter dem Finger liegt.
 */
function actionsHTML(v: View, C: CbView): string {
  const role = cbRole(v);
  const n = App.cs.ids.length;
  const btn = (act: string, cls: string, label: string, ok: boolean) =>
    `<button class="btn ${cls}" data-act="${act}"${ok ? '' : ' disabled'}>${label}</button>`;
  const two = (long: string, short: string) => `<span class="blong">${long}</span><span class="bshort">${short}</span>`;
  const btns: string[] = [];
  switch (role) {
    case 'draw':
      btns.push(btn('cbdeck', 'primary', two('Vom Stapel', 'Ziehen'), C.deck > 0));
      btns.push(btn('cbpile', 'ghost', two('Ablage nehmen', 'Ablage'), C.pile.length > 0));
      btns.push(btn('cbcabo', 'wood cabo', '📣 Cabo!', !C.cabo));
      break;
    case 'hold': {
      const fromDeck = C.hold?.from === 'deck';
      const pw = fromDeck && C.hold?.c ? cbPower(C.hold.c) : null;
      btns.push(btn('cbswap', 'primary', n > 1 ? `${n} tauschen` : 'Tauschen', n > 0));
      btns.push(btn('cbdiscard', 'ghost', pw ? `Ablegen · ${CB_POWER_SHORT[pw]}` : 'Ablegen', fromDeck));
      break;
    }
    case 'ownpeek':
    case 'spy':
      btns.push(btn('cbskip', 'ghost', 'Auslassen', true));
      break;
    case 'blind':
      btns.push(btn('cbblind', 'primary', 'Blind tauschen', n === 1 && !!App.cs.opp));
      btns.push(btn('cbskip', 'ghost', 'Auslassen', true));
      break;
    default:
      break;
  }
  if (cbCanSnap(v))
    btns.push(btn('cbsnapmode', App.cs.snap ? 'primary' : 'ghost', App.cs.snap ? 'Doch nicht' : '⚡ Schnappen', true));
  // Ändert sich die Zeile, sind Tipps kurz gesperrt (src/ui/cabo/input.ts)
  const sig = `${role}|${btns.map((b) => /data-act="(\w+)"/.exec(b)?.[1]).join(',')}`;
  if (sig !== App.cbBtn.sig) App.cbBtn = { sig, at: Date.now() };
  return `<div class="actions">${btns.join('')}</div>`;
}

/** Eigener Platz: Kopf mit Punkten, die eigene Reihe und Knöpfe. */
function myPlaceHTML(v: View, C: CbView, me: Player, row: CbSlotView[]): string {
  const role = cbRole(v);
  const pickable =
    role === 'look' || role === 'hold' || role === 'ownpeek' || role === 'blind' || (App.cs.snap && cbCanSnap(v));
  const sel = new Set(App.cs.ids);
  const r = caboResult(v);
  const score =
    v.phase === 'end' && r && App.me in r.scores ? `<span class="tag">+${num(r.scores[App.me])}</span>` : '';
  const called = C.cabo === App.me && v.phase === 'play' ? '<span class="tag cabo">📣 Cabo!</span>' : '';
  let h =
    `<div class="mehead">${reignHTML(v, me.id)}<span class="nm">Du</span>${called}${score}` +
    `<span class="pill">${num(me.cbp)} ${num(me.cbp) === 1 ? 'Punkt' : 'Punkte'}</span></div>`;
  h +=
    `<div class="cbrow mine${row.length > 4 ? ' many' : ''}${App.cs.snap && cbCanSnap(v) ? ' snapping' : ''}">` +
    row.map((s) => slotHTML(App.me, s, { act: pickable ? 'cbm' : '', sel: sel.has(s.id) })).join('') +
    '</div>';
  return h + actionsHTML(v, C);
}

export function renderCb(v: View): void {
  const C = v.cb;
  if (!C) return;
  const me = pById(v, App.me);
  const row = cbMine(v);
  const waiting = v.phase === 'play' || v.phase === 'peek' ? cbWaiting(v) : [];
  $('#opps').innerHTML = seatOrder(v)
    .map((p) => opponentHTML(v, C, p, waiting))
    .join('');
  renderCbCenter(v);
  const stEl = $('#status');
  stEl.className = 'status';
  stEl.innerHTML = statusHTML(v, C);
  const meEl = $('#me');
  const myTurnNow = waiting.includes(App.me) && v.phase === 'play';
  meEl.className = `me shme cbme${myTurnNow ? ' turn' : ''}${cbRole(v) === 'look' ? ' looking' : ''}`;
  meEl.innerHTML =
    me && row ? myPlaceHTML(v, C, me, row) : '<div class="outmsg">Du spielst diese Runde nicht mit.</div>';
  layoutOpps(v);
  markClocks();
  markTosses();
}

export function caboResult(v: View): CaboResult | null {
  return v.result?.reason === 'cabo' ? v.result : null;
}

/** Was in der Zeile einer Person steht: Summe, Cabo-Ruf, Kamikaze, zurück auf 50. */
function rowNote(r: CaboResult, id: string): string {
  const bits: string[] = [];
  const sum = num(r.sums[id]);
  const sc = num(r.scores[id]);
  if (r.kami && cbKamikaze(r.hands[id] ?? [])) bits.push('💥 Kamikaze! 0 Punkte');
  else if (r.kami) bits.push(`Summe ${sum} · Kamikaze kostet 50`);
  else if (r.caller === id)
    bits.push(r.ok ? `Summe ${sum} · Cabo geschafft, 0 Punkte` : `Summe ${sum} · Cabo daneben, +10`);
  else bits.push(`Summe ${sum}`);
  bits.push(`+${sc}`);
  if (r.resets.includes(id)) bits.push('genau 100, zurück auf 50');
  return bits.join(' · ');
}

/** Spruch passend zum Ende der Runde oder der Partie, aus meiner Sicht. */
function overlayTaunt(v: View, r: CaboResult): { text: string; good: boolean } {
  const seed = `c${v.games}.${v.round}`;
  const names = r.names ?? {};
  const nm = (id: string) => nameOf(v, id, names[id]);
  if (v.phase === 'over') {
    if (!r.winner) return { text: '', good: false };
    if (r.winner === App.me) return { text: taunt('cbKingSelf', null, seed), good: true };
    // Hat der König seine Krone verteidigt, klingt der Spruch anders
    const again = v.log.some((e) => e.k === 'cbend' && e.p === r.winner && e.again);
    return { text: taunt(again ? 'cbKingStays' : 'cbKingOther', { name: nm(r.winner) }, seed), good: false };
  }
  if (r.kami === App.me) return { text: taunt('cbKamiSelf', null, seed), good: true };
  if (r.kami) return { text: taunt('cbKamiOther', { name: nm(r.kami) }, seed), good: false };
  if (r.resets.includes(App.me)) return { text: taunt('cbResetSelf', null, seed), good: true };
  if (r.caller === App.me) {
    return r.ok
      ? { text: taunt('cbCaboOkSelf', null, seed), good: true }
      : { text: taunt('cbCaboFailSelf', null, seed), good: false };
  }
  if (r.caller && r.ok === false) return { text: taunt('cbCaboFailOther', { name: nm(r.caller) }, seed), good: false };
  return { text: '', good: false };
}

/** Ergebnis der Runde oder der Partie: alle Karten offen, Summen, Punkte, Stand. */
export function renderCbOverlay(v: View): void {
  const ov = $('#overlay');
  const r = caboResult(v);
  if ((v.phase !== 'end' && v.phase !== 'over') || !r) {
    ov.innerHTML = '';
    return;
  }
  if (holdOverlay()) return;
  const me = pById(v, App.me);
  if (App.peek) {
    ov.innerHTML = peekHTML(v, me);
    return;
  }
  const names = r.names ?? {};
  const nm = (id: string) => esc(nameOf(v, id, names[id]));
  const over = v.phase === 'over';
  const target = num(v.rules.cb?.target ?? 100);
  let icon = '🃏';
  let title: string;
  let lead: string;
  if (over) {
    const w = r.winner;
    icon = w ? '👑' : '🤝';
    title = w ? `${nm(w)}${vb(w, ' bist', ' ist')} <span class="g">Cabo-König!</span>` : 'Unentschieden!';
    const high = Object.keys(r.totals).filter((id) => r.totals[id] > target);
    lead =
      (high.length
        ? `${high.map(nm).join(' und ')} ${high.length === 1 ? vb(high[0], 'bist', 'ist') : 'sind'} über ${target} Punkte gekommen.`
        : '') + (w ? '' : ' Vorne liegen mehrere gleichauf, diesmal gibt es keinen neuen König.');
  } else if (r.kami) {
    icon = '💥';
    title = 'Kamikaze!';
    lead = `${nm(r.kami)}${vb(r.kami, ' hast', ' hat')} zwei Damen und zwei schwarze Könige. Alle anderen bekommen 50.`;
  } else if (r.caller) {
    icon = r.ok ? '🎯' : '🤡';
    title = r.ok ? 'Cabo geschafft!' : 'Cabo daneben!';
    lead = r.ok
      ? `${nm(r.caller)}${vb(r.caller, ' hattest', ' hatte')} am wenigsten und ${vb(r.caller, 'bekommst', 'bekommt')} 0 Punkte.`
      : `${nm(r.caller)}${vb(r.caller, ' hast', ' hat')} Cabo gerufen, aber jemand hatte weniger. Das kostet 10 extra.`;
  } else {
    title = 'Stapel leer!';
    lead = 'Keine Karten mehr, die Runde ist vorbei.';
  }
  const rline = rematchLine(v);
  const tt = overlayTaunt(v, r);
  const order = Object.keys(r.totals).sort((a, b) => r.totals[a] - r.totals[b] || num(r.scores[a]) - num(r.scores[b]));
  const rows = order
    .map((id, i) => {
      const p = pById(v, id);
      const win = over && v.winner === id;
      const place = over ? num(p?.place) || i + 1 : i + 1;
      const hand = r.hands[id] ?? [];
      const hat = win ? '<span class="hat">👑</span>' : r.caller === id ? '<span class="hat">📣</span>' : '';
      const cls =
        win || (!over && r.caller === id && r.ok) ? ' win' : !over && r.caller === id && r.ok === false ? ' lose' : '';
      return (
        `<div class="row cbr${cls}" data-pid="${esc(id)}"${aimAttrs(p, true)}><div class="val cbpl">${place}.</div>` +
        `<div class="who"><b>${hat}${nm(id)}${rematchMark(v, id)}</b><span>${rowNote(r, id)}</span>` +
        `<div class="mini shleft">${hand.map((c) => cardHTML(c)).join('')}</div></div>` +
        `<div class="val cbtot" title="Punkte gesamt">${num(r.totals[id])}</div></div>`
      );
    })
    .join('');
  ov.innerHTML =
    `<div class="modal"><div class="paper sheet result cbres"><div class="trophy">${icon}</div>` +
    `<h2>${title}</h2><p class="lead">${lead}</p>` +
    (rline
      ? `<p class="taunt rv">${rline}</p>`
      : tt.text
        ? `<p class="taunt${tt.good ? ' good' : ''}">${esc(tt.text)}</p>`
        : '') +
    `<div class="rows">${rows}</div>${overlayFoot(v, me)}</div></div>`;
}

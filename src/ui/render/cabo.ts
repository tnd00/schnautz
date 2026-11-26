/*
 * Cabo-Tisch: Gegner mit ihrer Reihe aus verdeckten Karten und ihrem Punktestand, in der Mitte Stapel, gezogene
 * Karte und Ablage, unten die eigene Reihe mit Knöpfen. Was man ansieht, blitzt nur kurz auf (App.cbShow), danach
 * muss man es sich merken. Was ich gerade tun kann, steht in `cbRole`. Tipps verarbeitet src/ui/cabo/input.ts.
 */
import { cbPower, cbWaiting } from '../../game/cabo';
import { cbVal, rankOf, suitOf } from '../../game/cards';
import { CB_KAMI, CB_PENALTY, CB_RESET_AT, CB_RESET_TO, CB_REVEAL_MS } from '../../game/constants';
import type { CaboResult, Card, CbSlotView, CbView, Player, View } from '../../game/types';
import { App } from '../app';
import { cardHTML } from '../cards';
import { layoutOpps } from '../carousel';
import { markClocks } from '../clock';
import { $, esc, num } from '../dom';
import { nameOf, onlyBotsPlaying, pById, seatOrder, turnId, vb } from '../helpers';
import { taunt } from '../taunts';
import { markTosses } from '../toss';
import { aimAttrs, marksHTML, reignHTML } from './marks';
import { botsOnlyHTML, renderResult, type Sheet, type SheetRow } from './result';
import { OFFLINE_WAIT, offline, playFor, STATUS } from '../../content/texts/status';
import { CB_STATUS, cbHeld, cbLastSub, cbOtherDeck, cbOtherPile, cbOtherPower } from '../../content/texts/status-cb';
import { ceremonyOn } from '../ceremony';
import { endMain, renderStatus, turnMain, waitSub, type Status } from '../status';
import type { OldTable } from '../table/spec';

const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';

export type CbRole = 'look' | 'looked' | 'draw' | 'hold' | 'ownpeek' | 'spy' | 'blind' | 'wait' | 'none';

/** Was eine abgelegte Karte kann: Zeichen, Name für Knöpfe und Etiketten, Verb für Hinweise („du darfst …“). */
const POWER_ICON = { peek: '👁️', spy: '🔍', swap: '🔀' } as const;
const POWER_NAME = { peek: 'Ansehen', spy: 'Spionieren', swap: 'Blindtausch' } as const;
const POWER_LONG = {
  peek: 'eine eigene Karte ansehen',
  spy: 'spionieren',
  swap: 'blind tauschen',
} as const;

/** Unbestimmt und bestimmt: „eine Dame“, „die Dame“, „einen roten König“. Zahlen bleiben Zahlen. */
const CB_WORDS: Record<string, [string, string]> = {
  A: ['ein Ass', 'das Ass'],
  B: ['einen Buben', 'den Buben'],
  D: ['eine Dame', 'die Dame'],
};

/**
 * Eine Cabo-Karte im Satz, der Name vor dem Wert: „eine Dame“ und „, 12“. Bei Zahlenkarten ist der Name schon
 * der Wert, dort gibt es keinen Nachsatz.
 */
function cbCardWords(c: Card, def: boolean): { name: string; val: string } {
  const r = rankOf(c);
  const red = suitOf(c) === 'H' || suitOf(c) === 'D';
  const w: [string, string] | undefined =
    r === 'K'
      ? red
        ? ['einen roten König', 'den roten König']
        : ['einen schwarzen König', 'den schwarzen König']
      : CB_WORDS[r];
  if (!w) return { name: `${def ? 'die' : 'eine'} ${r}`, val: '' };
  return { name: w[def ? 1 : 0], val: `, ${cbVal(c)}` };
}

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

/**
 * Punkte, die gerade angezeigt werden. Bis zur Krönung steht noch der Stand vor der letzten Runde da, sonst verriete
 * der kleinste Wert den neuen Cabo-König schon vorher.
 */
export function cbShownPoints(v: View, p: Player): number {
  const r = caboResult(v);
  if (!App.zerHide || v.phase !== 'over' || !r || !(p.id in r.scores)) return num(p.cbp);
  const before = r.resets.includes(p.id) ? CB_RESET_AT : num(r.totals[p.id]);
  return Math.max(0, before - num(r.scores[p.id]));
}

/** Wie stark sich Karten überlappen, damit `n` Karten in den Platz für `room` Karten passen. */
const overlap = (n: number, room: number): number => (n <= room ? 0 : (room - 1) / (n - 1) - 1);

const valBadge = (c: Card): string => `<span class="cbv${cbVal(c) === 0 ? ' zero' : ''}">${cbVal(c)}</span>`;

interface SlotOpts {
  act?: string;
  sel?: boolean;
  /** Leuchtet als wählbar. Ohne Angabe jede Karte mit `act`, sonst bleibt sie antippbar und nennt ihren Grund */
  pick?: boolean;
}

/** Ein Platz: verdeckt, offen für alle, oder nur für mich gerade kurz zu sehen. */
function slotHTML(owner: string, s: CbSlotView, o: SlotOpts = {}): string {
  const seen = s.c ? null : cbSeen(owner, s.id);
  const c = s.c ?? seen;
  const pick = o.pick ?? !!o.act;
  const cls = ['cbslot', s.up && 'up', seen && 'seen', o.sel && 'sel', pick && 'pick'].filter(Boolean).join(' ');
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
    // Bis zur Krönung keine Plätze, auch Platz 2 und 3 verrieten den König
    if (App.zerHide) return '';
    if (v.winner === p.id) return '<span class="tag king" style="white-space:nowrap">👑 Cabo-König</span>';
    return p.place ? `<span class="tag">Platz ${num(p.place)}</span>` : '';
  }
  if (v.phase === 'end' && r && p.id in r.scores) return `<span class="tag">+${num(r.scores[p.id])}</span>`;
  if (v.phase === 'peek')
    return p.ready ? '<span class="tag done">bereit ✓</span>' : `<span class="tag turn">schaut${THINKING}</span>`;
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
    `<div class="cbrow${row && row.length > 4 ? ' many' : ''}" style="--ov:${overlap(row?.length ?? 0, 4.2).toFixed(3)}">${slots}${heldHTML(C, p.id)}</div>` +
    `<div class="ometa">${marksHTML(v, p)}<span class="nm">${esc(p.name)}</span><span class="cbp" title="Punkte">${cbShownPoints(v, p)}</span></div>` +
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
  const canPile = role === 'draw' && !!top && !!cbMine(v)?.length;
  const pileAct = canPile ? 'cbpile' : role === 'hold' && C.hold?.from === 'deck' ? 'cbdiscard' : '';
  // Stapel und Ablage bleiben während der Runde antippbar und nennen sonst ihren Grund, leuchten aber nur, wenn es geht
  const live = play && !!cbMine(v);
  const deckTap = live || deckAct;
  const pileTap = pileAct || (live ? (role === 'hold' ? 'cbdiscard' : 'cbpile') : '');
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
    // Am Handy bleibt nur das Zeichen der Fähigkeit, wie im Knopf „Ablegen 🔀“
    holdCnt = pw
      ? `<span class="cnl">Deine Karte · </span>${POWER_ICON[pw]}<span class="cnl"> ${POWER_NAME[pw]}</span>`
      : 'Deine Karte';
  } else if (C.power) {
    // Die Karte liegt schon auf der Ablage, hier steht nur, was sie gerade erlaubt
    hold = `<div class="emptyslot cbpow">${POWER_ICON[C.power.kind]}</div>`;
    if (C.power.by === App.me) holdCnt = POWER_NAME[C.power.kind];
  }
  let cap = `Runde ${num(v.round)} · bis ${num(v.rules.cb?.target ?? 100)} Punkte`;
  if (C.cabo && play) {
    const n = C.left.length;
    // Kurz halten, wer gerufen hat, steht schon an der Kachel
    cap = `📣 Cabo gerufen · noch ${n} ${n === 1 ? 'Zug' : 'Züge'}`;
  } else if (play && dn <= 5) cap = dn ? `Nur noch ${dn} ${dn === 1 ? 'Karte' : 'Karten'} im Stapel` : 'Stapel leer';
  else if (v.phase === 'peek') cap = `Runde ${num(v.round)} · alle sehen sich zwei Karten an`;
  $('#center').innerHTML =
    `<span class="cap">${cap}</span>` +
    `<div class="deck cbdeck${deckAct ? ' can' : ''}" title="Stapel"${deckTap ? tap('cbdeck', 'Vom Stapel ziehen') : ''}>${deck}</div>` +
    `<div class="cbhold${mineHeld || C.power ? ' on' : ''}">${hold}${holdCnt ? `<span class="cnt">${holdCnt}</span>` : ''}</div>` +
    `<div class="pile cbpile${pileAct ? ' can' : ''}" title="Ablage"${pileTap ? tap(pileTap, pileTap === 'cbpile' ? 'Von der Ablage nehmen' : 'Ablegen') : ''}>${pile}</div>`;
}

/** Name im Nebensatz, ohne KI-Zeichen (das trägt nur die Hauptzeile) */
const plainName = (v: View, id: string | null): string => esc(nameOf(v, id));

/**
 * Status über dem eigenen Platz als Daten: was ich tun soll oder worauf wir warten. Ohne DOM, damit Vitest jede
 * Phase prüfen kann. `renderStatus` (src/ui/status.ts) schreibt ihn.
 */
export function cbStatus(v: View): Status {
  const C = v.cb;
  if (!C) return { main: '', sub: '', tone: 'calm' };
  const role = cbRole(v);
  const n = App.cs.ids.length;
  const cur = turnId(v);
  const cards = !!cbMine(v)?.length;
  let st: Status = { main: '', sub: '', tone: 'calm' };
  let quick = '';
  switch (role) {
    case 'look':
      st = { main: `<em>${CB_STATUS.peek}</em>`, sub: n === 1 ? CB_STATUS.peekOne : CB_STATUS.peekSub, tone: 'turn' };
      break;
    case 'looked':
      st = { main: CB_STATUS.peek, sub: waitSub(v, cbWaiting(v)) || CB_STATUS.peekGo, tone: 'calm' };
      break;
    case 'draw': {
      const after = C.left.filter((id) => id !== App.me).length;
      st = C.cabo
        ? { main: `<em>${CB_STATUS.last}</em>`, sub: cbLastSub(after, cards), tone: 'knock' }
        : { main: `<em>${STATUS.myTurn}</em>`, sub: cards ? CB_STATUS.draw : CB_STATUS.drawNoCards, tone: 'turn' };
      break;
    }
    case 'hold': {
      const c = C.hold?.c;
      const fromPile = C.hold?.from === 'pile';
      const pw = !fromPile && c ? cbPower(c) : null;
      const sub =
        n > 1
          ? CB_STATUS.holdMany(n)
          : fromPile
            ? CB_STATUS.holdPile
            : pw
              ? CB_STATUS.holdPower(POWER_LONG[pw])
              : CB_STATUS.holdPlain;
      st = { main: `<em>${c ? cbHeld(cbCardWords(c, false).name, fromPile) : STATUS.myTurn}</em>`, sub, tone: 'turn' };
      break;
    }
    case 'ownpeek':
      st = { main: `<em>${CB_STATUS.ownpeek}</em>`, sub: CB_STATUS.ownpeekSub, tone: 'turn' };
      break;
    case 'spy':
      st = { main: `<em>${CB_STATUS.spy}</em>`, sub: CB_STATUS.spySub, tone: 'turn' };
      break;
    case 'blind':
      st = {
        main: `<em>${CB_STATUS.blind}</em>`,
        sub: n && App.cs.opp ? CB_STATUS.blindReady : CB_STATUS.blindSub,
        tone: 'turn',
      };
      break;
    case 'wait': {
      let sub = '';
      if (C.power?.by === cur) sub = cbOtherPower(plainName(v, cur), POWER_LONG[C.power.kind]);
      else if (C.hold?.by === cur) {
        const cw = C.hold.from === 'pile' && C.hold.c ? cbCardWords(C.hold.c, true) : null;
        sub = cw ? cbOtherPile(plainName(v, cur), cw.name, cw.val) : cbOtherDeck(plainName(v, cur));
      } else if (C.cabo) sub = C.left.includes(App.me) ? CB_STATUS.again : CB_STATUS.noMore;
      st = { main: turnMain(v, cur), sub, tone: C.cabo ? 'knock' : 'calm' };
      break;
    }
    case 'none':
      if (v.phase === 'end' || v.phase === 'over') {
        const revealing = v.phase === 'over' && (!!App.zerHide || ceremonyOn());
        st = { main: endMain(v, revealing), sub: revealing ? CB_STATUS.overSub : '', tone: 'over' };
      } else if (v.phase === 'play' || v.phase === 'peek') {
        // Erst ab der nächsten Runde dabei: zusehen, bei reinen KI-Runden abkürzen
        st = {
          main: v.phase === 'play' ? turnMain(v, cur) : CB_STATUS.peek,
          sub: CB_STATUS.nextRound,
          tone: 'calm',
        };
        if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
      }
      break;
  }
  if ((role === 'draw' || role === 'wait') && cbCanSnap(v) && App.cs.snap) st = { ...st, sub: CB_STATUS.snap };
  // Wer gerade aufhält und offline ist. Wer selbst noch ansehen muss, liest erst seinen eigenen Hinweis
  const waiting = cbWaiting(v);
  const off = v.players.find((p) => waiting.includes(p.id) && !p.online && !p.bot && p.id !== App.me);
  if ((v.phase === 'play' || v.phase === 'peek') && off && role !== 'look') {
    const nm = esc(off.name);
    if (App.role === 'host' && !quick) {
      st = { ...st, main: offline(`<b>${nm}</b>`) };
      quick = `<button class="btn ghost small" data-act="skip"><span class="qlbl">${playFor(nm)}</span></button>`;
    } else st = { ...st, sub: `${offline(nm)} ${OFFLINE_WAIT}` };
  }
  return quick ? { ...st, quick } : st;
}

/**
 * Knöpfe am eigenen Platz. Sie stehen je Rolle immer an derselben Stelle und werden nur deaktiviert, damit nicht
 * plötzlich ein anderer Knopf unter dem Finger liegt.
 */
function actionsHTML(v: View, C: CbView): string {
  const role = cbRole(v);
  const n = App.cs.ids.length;
  // Ausgegraut bleibt antippbar und nennt dann den Grund (cbWhyNot in src/ui/cabo/input.ts)
  const btn = (act: string, cls: string, label: string, ok: boolean) =>
    `<button class="btn ${cls}" data-act="${act}"${ok ? '' : ' aria-disabled="true"'}>${label}</button>`;
  const two = (long: string, short: string) => `<span class="blong">${long}</span><span class="bshort">${short}</span>`;
  const btns: string[] = [];
  switch (role) {
    case 'draw':
      btns.push(btn('cbdeck', 'primary', two('Vom Stapel', 'Ziehen'), C.deck > 0));
      btns.push(btn('cbpile', 'ghost', two('Ablage nehmen', 'Ablage'), C.pile.length > 0 && !!cbMine(v)?.length));
      btns.push(btn('cbcabo', 'wood cabo', '📣 Cabo!', !C.cabo));
      break;
    case 'hold': {
      const fromDeck = C.hold?.from === 'deck';
      const pw = fromDeck && C.hold?.c ? cbPower(C.hold.c) : null;
      btns.push(btn('cbswap', 'primary', n > 1 ? `${n} eintauschen` : 'Eintauschen', n > 0));
      // Am Handy reicht das Zeichen der Fähigkeit, sonst bricht „Eintauschen“ daneben um
      const discard = pw ? two(`Ablegen + ${POWER_NAME[pw]}`, `Ablegen ${POWER_ICON[pw]}`) : 'Ablegen';
      btns.push(btn('cbdiscard', 'ghost', discard, fromDeck));
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
    btns.push(
      btn(
        'cbsnapmode',
        `${App.cs.snap ? 'primary' : 'ghost'} snapb`,
        App.cs.snap ? two('Doch nicht', '✕') : two('⚡ Schnappen', '⚡'),
        true,
      ),
    );
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
  // Auch sonst antippbar, dann nennt die Karte ihren Grund (src/ui/cabo/input.ts)
  const tappable = pickable || ((v.phase === 'play' || v.phase === 'peek') && role !== 'looked');
  const sel = new Set(App.cs.ids);
  const r = caboResult(v);
  const score =
    v.phase === 'end' && r && App.me in r.scores ? `<span class="tag">+${num(r.scores[App.me])}</span>` : '';
  const called = C.cabo === App.me && v.phase === 'play' ? '<span class="tag cabo">📣 Cabo!</span>' : '';
  let h =
    `<div class="mehead">${reignHTML(v, me.id)}<span class="nm">Du</span>${called}${score}` +
    `<span class="pill">${cbShownPoints(v, me)} ${cbShownPoints(v, me) === 1 ? 'Punkt' : 'Punkte'}</span></div>`;
  h +=
    `<div class="cbrow mine${row.length > 4 ? ' many' : ''}${App.cs.snap && cbCanSnap(v) ? ' snapping' : ''}" style="--ov:${overlap(row.length, 6).toFixed(3)}">` +
    row.map((s) => slotHTML(App.me, s, { act: tappable ? 'cbm' : '', pick: pickable, sel: sel.has(s.id) })).join('') +
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
  renderStatus(v);
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

/**
 * Kernzahl jeder Zeile, kurz, damit lange Namen stehen bleiben. Der Stand steht rechts. Die Summe nur, wenn sie von
 * den Punkten abweicht (Rufer, Kamikaze, Strafe). Bei Kamikaze zählt die Summe der anderen nicht, ihre 50 erklärt
 * schon der Satz unter dem Titel. Am Partieende steht das Urteil der letzten Runde in der Zeile, denn der Kopf nennt
 * dann nur den König. Urteil und Rückfall auf 50 stecken in `.cbwhy`, damit sie am Handy unter den Namen rücken
 * (src/styles/cabo.css).
 */
function rowNote(r: CaboResult, id: string, over: boolean): string {
  const sum = num(r.sums[id]);
  const score = num(r.scores[id]);
  const reset = r.resets.includes(id) ? ` · auf ${CB_RESET_TO}` : '';
  if (over) {
    if (reset) return `<span class="cbwhy">genau 100 · auf ${CB_RESET_TO}</span>`;
    const why = r.kami === id ? 'Kamikaze' : r.caller === id && r.ok === false ? 'Cabo daneben' : '';
    return why ? `<span class="cbwhy">${why} · +${score}</span>` : `+${score}`;
  }
  const withSum = score !== sum && !(r.kami && r.kami !== id);
  const note = `${withSum ? `Summe ${sum} · ` : ''}+${score}${reset}`;
  // Wer auf 50 zurückfällt, bekommt am Handy ebenfalls eine zweite Zeile
  return reset ? `<span class="cbwhy">${note}</span>` : note;
}

/**
 * Kurzform der Kernzahl am Rundenende ohne Summe, wenn ein langer Name sonst nicht ganz passt (fitRows in
 * src/ui/render/result.ts). Warum die Punkte von der Summe abweichen, sagt der Satz unter dem Titel.
 */
function rowShort(r: CaboResult, id: string, over: boolean): string | undefined {
  const sum = num(r.sums[id]);
  const score = num(r.scores[id]);
  if (over || score === sum || (r.kami && r.kami !== id)) return undefined;
  const reset = r.resets.includes(id) ? ` · auf ${CB_RESET_TO}` : '';
  return reset ? `<span class="cbwhy">+${score}${reset}</span>` : `+${score}`;
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

/**
 * Ergebnisblatt als Daten. Am Rundenende ist die Schlüsselzeile, wer Cabo rief (oder Kamikaze hatte), mit Karten,
 * am Partieende der neue Cabo-König ohne Karten. Alle Zeilen nach Stand, rechts die Gesamtpunkte. Sonst `null`.
 */
export function cbSheet(v: View): Sheet | null {
  const r = caboResult(v);
  if ((v.phase !== 'end' && v.phase !== 'over') || !r) return null;
  const names = r.names ?? {};
  const nm = (id: string) => esc(nameOf(v, id, names[id]));
  const over = v.phase === 'over';
  let icon = '🃏';
  let title: string;
  let lead: string;
  if (over) {
    const w = r.winner;
    icon = w ? '👑' : '🤝';
    title = w
      ? `${nm(w)}${vb(w, ' bist', ' ist')} <span class="g" style="white-space:nowrap">Cabo-König!</span>`
      : 'Unentschieden!';
    // Wer über die Grenze kam, zeigen die Punkte rechts. Bei acht Leuten kostet der Satz sonst zwei Zeilen
    lead = w ? '' : 'Vorne liegen mehrere gleichauf, diesmal gibt es keinen neuen König.';
  } else if (r.kami) {
    icon = '💥';
    title = 'Kamikaze!';
    lead = `Alle anderen bekommen ${CB_KAMI} Punkte.`;
  } else if (r.caller) {
    icon = r.ok ? '🎯' : '🙈';
    title = r.ok ? 'Cabo geschafft!' : 'Cabo daneben!';
    // Kurz, bei acht Leuten und langen Namen zählt jede Zeile
    lead = r.ok
      ? `${nm(r.caller)}${vb(r.caller, ' hattest', ' hatte')} am wenigsten.`
      : `${nm(r.caller)} ${vb(r.caller, 'bekommst', 'bekommt')} ${CB_PENALTY} Strafpunkte obendrauf.`;
  } else {
    title = 'Stapel leer!';
    lead = 'Keine Karten mehr, die Runde ist vorbei.';
  }
  const key = over ? (r.winner ?? null) : (r.kami ?? r.caller ?? null);
  const order = Object.keys(r.totals).sort((a, b) => r.totals[a] - r.totals[b] || num(r.scores[a]) - num(r.scores[b]));
  const rows: SheetRow[] = order.map((id, i) => {
    const win = over && v.winner === id;
    const ok = !over && r.caller === id && r.ok;
    const fail = !over && r.caller === id && r.ok === false;
    return {
      id,
      place: over ? num(pById(v, id)?.place) || i + 1 : i + 1,
      name: nm(id),
      hat: win ? '👑' : r.kami === id ? '💥' : r.caller === id ? '📣' : undefined,
      core: rowNote(r, id, over),
      short: rowShort(r, id, over),
      val: String(num(r.totals[id])),
      // Am Rundenende zählen die Karten von Rufer oder Kamikaze, am Partieende nur noch die Punkte
      cards: over ? undefined : (r.hands[id] ?? []),
      tone: win || ok ? 'win' : fail ? 'lose' : undefined,
    };
  });
  const tt = overlayTaunt(v, r);
  return {
    icon,
    title,
    lead,
    key,
    taunt: tt.text ? tt : null,
    bets: '',
    rows,
    next: over ? 'game' : 'round',
    cls: 'cbsheet',
  };
}

/** Ergebnis der Runde oder der Partie über das gemeinsame Blatt. */
export function renderCbOverlay(v: View): void {
  renderResult(v, cbSheet(v));
}

export const cbSpec: OldTable = { badge: false, old: { draw: renderCb, overlay: renderCbOverlay } };

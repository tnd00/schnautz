/*
 * Schnautz am Tisch (Plan 2.8 Runde 4a): liefert nur Modelle für die Bausteine in src/ui/table, renderTable zeichnet.
 * Legacy sieht aus wie vorher. Die Leben stehen bis 4b in der Punkteleiste und im Zähler der Kachel, `value` bleibt
 * leer. Krone und KI stehen wie bisher im Feld vor dem Namen (marksHTML im Zähler, fit-schnautz.css stellt es vor).
 */
import { handValue, szWhyNot } from '../../game/schnautz';
import type { HandValue, LifeChange, Player, SchnautzResult, View } from '../../game/types';
import { activeList } from '../../game/state';
import { onlyBotsPlaying } from '../../game/games';
import { rj } from '../../game/reject';
import { App } from '../app';
import { cardHTML, fmtVal, livesHTML, SWIM_ICON, valHTML } from '../cards';
import { marksHTML } from './marks';
import { esc, listJoin, num } from '../dom';
import { dealerId, myTurn, nameOf, pById, roundBest, schnautzResult, turnId } from '../helpers';
import { botsOnlyHTML, type Sheet, type SheetRow } from './result';
import { taunt } from '../taunts';
import { ceremonyOn } from '../ceremony';
import { endMain, turnMain, whoHTML, type Status } from '../status';
import { OFFLINE_WAIT, offline, STATUS } from '../../content/texts/status';
import { SZ_SHEET, SZ_STATUS } from '../../content/texts/status-schnautz';
import { TABLE } from '../../content/texts/table';
import { renderTable } from '../table/index';
import { handHTML, whyText } from '../table/hand';
import type { NewTable } from '../table/spec';
import type { BarModel, CenterModel, HandCard, MeModel, MeState, SeatModel, SeatState, TagModel } from '../table/types';

/** Teile eines Vorlesesatzes, leere fallen weg */
const said = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join(', ');

const cl = (...xs: (string | false | null | undefined)[]): string => xs.filter(Boolean).join(' ');

const isLive = (v: View): boolean => v.phase === 'choose' || v.phase === 'play';

/** Wer gerade gefragt ist: beim Wählen der Geber, im Spiel wer dran ist */
const actor = (v: View): string | null => (v.phase === 'choose' ? dealerId(v) : v.phase === 'play' ? turnId(v) : null);

/** Aufgedeckte Runde am Rundenende und Partieende */
const revealOf = (v: View): SchnautzResult | null =>
  v.phase === 'end' || v.phase === 'over' ? schnautzResult(v) : null;

/** Am Rundenende: hat verloren oder lag vorn (alte Klassen rlose und rwin) */
function roundMark(v: View, r: SchnautzResult | null, id: string): 'win' | 'lose' | null {
  if (!r?.changes) return null;
  if (r.changes[id]) return 'lose';
  return roundBest(v).includes(id) && Object.keys(r.changes).length ? 'win' : null;
}

const livesSay = (p: Player): string => (p.out ? 'raus' : p.lives === 0 ? 'schwimmt' : `${num(p.lives)} Leben`);

const back = (deal: boolean, d: number): string =>
  cardHTML(null, { key: '', cls: deal ? 'deal' : '', style: `--d:${d}s` });

function szTag(v: View, p: Player): TagModel | null {
  if (p.out || !isLive(v)) return null;
  if (actor(v) === p.id)
    return { text: v.phase === 'play' ? TABLE.tag.turn : 'gibt', kind: 'turn', cls: 'turn', think: true };
  if (v.knocker === p.id) return { text: 'hat geklopft', kind: 'knock', cls: 'knock' };
  if (dealerId(v) === p.id) return { text: 'gibt', kind: 'role' };
  return null;
}

/** Gegnerkachel: drei Rücken oder am Ende die offene Hand, darunter Zeichen, Name und Leben */
function szSeat(v: View, p: Player): SeatModel {
  const r = revealOf(v);
  const hidden = v.hands[p.id];
  const shown = r?.hands[p.id];
  let cards = '';
  if (shown) cards = shown.map((c) => cardHTML(c, { key: '' })).join('');
  else if (typeof hidden === 'number') for (let i = 0; i < hidden; i++) cards += back(!!App.anim.deal, i * 0.08 + 0.05);
  const tag = szTag(v, p);
  const rm = roundMark(v, r, p.id);
  const st: SeatState[] = [];
  if (actor(v) === p.id) st.push('turn');
  if (p.out) st.push('out');
  if (!p.online) st.push('offline');
  if (rm) st.push(rm);
  return {
    id: p.id,
    name: p.name,
    // Eckaufkleber und Wert erst in 4b, bis dahin bleibt das Zeichenfeld vor dem Namen
    marks: '',
    value: '',
    count: marksHTML(v, p) + livesHTML(p, v.rules),
    tag,
    body: `<div class="ocards">${cards}</div>`,
    st,
    role: v.knocker === p.id ? 'knock' : dealerId(v) === p.id ? 'deal' : undefined,
    aim: v.players.some((q) => q.id === App.me),
    cls: rm ? [`r${rm}`] : [],
    say: said(p.bot && 'KI', livesSay(p), tag?.text),
  };
}

/** Stapel mit seiner Zahl und die Mitte: drei offene Karten, beim Wählen des Gebers das zweite Blatt verdeckt */
function szCenter(v: View): CenterModel {
  const playing = myTurn(v);
  const why = whyText(isLive(v) && !playing ? szWhyNot(v, App.me, 'swap') : null);
  const deal = !!App.anim.deal;
  const n = num(v.deck);
  const slot = (c: string) => `<div class="slot">${c}</div>`;
  const mid =
    v.phase === 'choose'
      ? [0, 1, 2].map((j) => slot(back(deal, 0.3 + j * 0.08))).join('')
      : (v.middle || [])
          .map((c, i) =>
            slot(
              cardHTML(c, {
                key: `mid:${i}`,
                act: 'mid',
                i,
                sel: App.sel.m === i,
                why,
                tab: playing ? 0 : -1,
                cls: cl(playing && 'pick', (deal || App.anim.dealMid) && 'deal'),
                style: `--d:${0.3 + i * 0.08}s`,
              }),
            ),
          )
          .join('');
  const b = cardHTML(null, { key: '' });
  return {
    cap: v.phase === 'choose' ? 'Zweites Blatt' : 'Mitte',
    label: `Tischmitte, ${n} Karten im Stapel`,
    stacks: [
      // Immer drei Rücken, die Zahl sitzt als Plakette am Stapel wie bei Shithead
      { k: 'deck', cls: 'deck', title: `${n} Karten im Stapel`, body: b + b + b, count: n },
      { k: 'middle', cls: 'middle', title: '', body: mid },
    ],
  };
}

/** Knöpfe: der Geber behält oder nimmt, wer dran ist, tauscht, schiebt oder klopft */
function szBar(v: View, both: boolean): BarModel {
  if (v.phase === 'choose' && dealerId(v) === App.me)
    return {
      btns: [
        { act: 'keep', label: 'Blatt behalten', intent: 'go', cls: 'primary', ok: true },
        { act: 'take', label: 'Zweites Blatt nehmen', intent: 'alt', cls: 'ghost', ok: true },
      ],
    };
  if (!myTurn(v)) return { btns: [] };
  // Ausgegraut, aber antippbar: Ein Tipp nennt den Grund am Tisch (showReject), statt stumm zu bleiben
  const whyKnock = szWhyNot(v, App.me, 'knock');
  const kt = whyText(whyKnock);
  return {
    btns: [
      {
        act: 'swap',
        label: 'Tauschen',
        intent: 'go',
        cls: 'primary',
        ok: both,
        pulse: both,
        why: both ? null : rj('any.pickCard'),
        title: both ? undefined : SZ_STATUS.tip,
      },
      {
        act: 'swapAll',
        label: `Alle drei → ${shortVal(handValue(v.middle, v.rules))}`,
        intent: 'alt',
        cls: 'ghost',
        ok: true,
        title: 'Alle drei Karten mit der Mitte tauschen',
      },
      { act: 'pass', label: 'Schieben', intent: 'alt', cls: 'ghost', ok: true },
      {
        act: 'knock',
        label: 'Klopfen',
        intent: 'call',
        cls: 'wood',
        ok: !whyKnock,
        why: whyKnock,
        title: kt ?? 'Alle anderen haben noch einen Zug',
      },
    ],
    extra: whyKnock?.e === 'sz.knockEarly' && kt ? `<div class="hint">${esc(kt)}</div>` : '',
  };
}

/** Eigener Platz: Leben, Etikett, Pille mit Handwert und Vorschau, die drei Karten und die Knöpfe */
function szMe(v: View): MeModel {
  const me = pById(v, App.me);
  const r = revealOf(v);
  const rm = roundMark(v, r, App.me);
  const base = { cls: rm ? [`r${rm}`] : [], st: (rm ? [rm] : []) as MeState[] };
  const lives = me ? livesHTML(me, v.rules) : '';
  if (!me || me.out)
    return {
      ...base,
      head: { marks: '', count: lives },
      rows: `<div class="outmsg">${SZ_STATUS.out}</div>`,
      bar: null,
      say: SZ_STATUS.out,
    };
  const own = v.hands[App.me];
  const mine = Array.isArray(own) ? own : null;
  const hand = r?.hands[App.me] ?? mine;
  const playing = myTurn(v);
  const sel = App.sel;
  const hv = handValue(hand ?? undefined, v.rules);
  // Sind Hand- und Tischkarte gewählt, zeigt die Pille den Wert nach dem Tausch. Der Knopf bleibt gleich breit
  const both = playing && !!mine && sel.h != null && sel.m != null;
  let preview = '';
  if (both && mine && sel.h != null && sel.m != null) {
    const nh = mine.slice();
    nh[sel.h] = v.middle[sel.m];
    preview = shortVal(handValue(nh, v.rules));
  }
  const live = isLive(v);
  const dealer = dealerId(v) === App.me;
  const tags = !live
    ? ''
    : v.knocker === App.me
      ? '<span class="tag knock">geklopft</span>'
      : dealer
        ? '<span class="tag">du gibst</span>'
        : '';
  const pill = hand
    ? `<span class="${cl('pill', hv.v >= 30.5 && 'hot', preview && 'pre')}">` +
      (preview ? `${shortVal(hv)} <span class="to">→ ${preview}</span>` : valHTML(hv)) +
      '</span>'
    : '';
  const why = live && !playing ? szWhyNot(v, App.me, 'swap') : null;
  const deal = App.anim.deal || App.anim.dealHand;
  const cards: HandCard[] = (hand ?? []).map((c, i) => ({
    c,
    i,
    fk: `hand:${i}`,
    act: 'hand',
    sel: sel.h === i,
    why,
    cls: cl(playing && 'pick', deal && 'deal'),
    delay: 0.1 + i * 0.1,
  }));
  const on = playing || (v.phase === 'choose' && dealer);
  return {
    head: { marks: '', count: lives, tags, pill },
    rows: handHTML({ kind: 'fan3', cls: 'hand', label: `Deine Hand, ${cards.length} Karten`, cards }),
    bar: szBar(v, both),
    st: on ? ['turn', ...base.st] : base.st,
    cls: base.cls,
    say: said(
      on && 'Du bist dran',
      livesSay(me),
      v.knocker === App.me && 'geklopft',
      hv.kind !== 'none' && `Handwert ${fmtVal(hv.v)}`,
    ),
  };
}

/** Zeichnet den ganzen Tisch neu, etwa nach einer Auswahl (events.ts) */
export function renderGame(v: View): void {
  renderTable(v);
}

/** Kurzer Handwert für Pille und Knopf: Zahl mit Farbe, besondere Hände nur als Zahl. So bleibt die Breite fest. */
function shortVal(hv: HandValue): string {
  if (hv.kind === 'normal') return valHTML(hv);
  if (hv.kind === 'none') return '';
  return fmtVal(hv.v);
}

/**
 * Status über dem eigenen Platz als Daten: wer gibt oder dran ist, Klopfen, Schieben, Offline. Ohne DOM, damit
 * Vitest jede Phase prüfen kann. Die Hauptzeile hat die festen Formen, alles Schnautz-Eigene steht in der Unterzeile.
 */
export function szStatus(v: View): Status {
  if (v.phase === 'end' || v.phase === 'over') return { main: endMain(v, ceremonyOn()), sub: '', tone: 'over' };
  if (v.phase !== 'choose' && v.phase !== 'play') return { main: '', sub: '', tone: 'calm' };
  const me = pById(v, App.me);
  const tId = turnId(v);
  const dId = dealerId(v);
  const knocker = v.knocker;
  let st: Status;
  let quick = '';
  if (v.phase === 'choose') {
    st =
      dId === App.me
        ? { main: `<em>${STATUS.myTurn}</em>`, sub: SZ_STATUS.chooseMine, tone: 'turn' }
        : { main: turnMain(v, dId), sub: SZ_STATUS.chooseOther, tone: 'calm' };
  } else {
    const active = activeList(v).length;
    const np = num(v.passes);
    const passed = !knocker && np > 0 ? `<span class="np">${SZ_STATUS.passed(np, active)}</span>` : '';
    if (myTurn(v)) {
      st = knocker
        ? { main: `<em>${STATUS.myTurn}</em>`, sub: SZ_STATUS.lastMine(whoHTML(v, knocker)), tone: 'knock' }
        : {
            main: `<em>${STATUS.myTurn}</em>`,
            // Auf sehr kurzen Handys entfällt der Tipp, sobald jemand geschoben hat (fit.css), dann zählt der Stand
            sub: `<span class="tip">${SZ_STATUS.tip}</span>${passed ? ` ${passed}` : ''}`,
            tone: 'turn',
          };
    } else {
      const mine = knocker === App.me;
      st = knocker
        ? {
            main: turnMain(v, tId),
            sub: SZ_STATUS.knocked(mine ? SZ_STATUS.you : whoHTML(v, knocker), mine, Math.max(1, num(v.afterKnock))),
            tone: 'knock',
          }
        : {
            main: turnMain(v, tId),
            sub: passed ? `${passed} <span class="np">${SZ_STATUS.passedAll}</span>` : '',
            tone: 'calm',
          };
    }
  }
  // Raus und nur noch KIs am Spielen: abkürzen statt zuschauen
  if (me?.out && onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);

  const actorId = v.phase === 'choose' ? dId : tId;
  const actor = actorId ? pById(v, actorId) : null;
  if (actor && actor.id !== App.me && !actor.online) {
    const nm = esc(actor.name);
    if (App.role === 'host' && !quick) {
      st = { ...st, main: offline(`<b>${nm}</b>`) };
      const label = v.phase === 'choose' ? SZ_STATUS.skipKeep(nm) : SZ_STATUS.skipPass(nm);
      quick = `<button class="btn ghost small" data-act="skip"><span class="qlbl">${label}</span></button>`;
    } else st = { ...st, sub: `${offline(nm)} ${OFFLINE_WAIT}` };
  }
  return quick ? { ...st, quick } : st;
}

/**
 * Folge für eine Zeile im Blatt: Leben weg, schwimmt, raus. Dazu die Kurzform für lange Namen am Handy, leer, wo das
 * Zeichen vor dem Namen es schon sagt.
 */
function lifeCore(c: LifeChange, mine: boolean): { hat: string; core: string; short: string } {
  const out = (t: string, cls = '') => (t ? `<span class="conseq${cls}">${t}</span>` : '');
  if (c.to === 'out') return { hat: '🫧', core: out(SZ_SHEET.outNow(mine)), short: out(SZ_SHEET.outShort) };
  if (c.to === 'swim') return { hat: '🛟', core: out(SZ_SHEET.swim(mine), ' swim'), short: '' };
  return { hat: '💔', core: out(SZ_SHEET.life(c.n)), short: out(SZ_SHEET.lifeShort(c.n)) };
}

/** Leben kurz wie in der Punkteleiste: ein Deckel und die Zahl, wer schwimmt, nur das Zeichen */
function livesShort(p: Pick<Player, 'out' | 'lives'>): string {
  if (p.out) return SZ_SHEET.outShort;
  if (p.lives === 0) return `<span class="swim" title="schwimmt">${SWIM_ICON}</span>`;
  const n = num(p.lives);
  return `<span class="lives lc" title="${n} Leben"><span class="coaster"></span>${n}</span>`;
}

/** Bis zu dieser Länge passt „Name gewinnt!“ auch bei 360 px in eine Zeile */
const TITLE_NAME_MAX = 10;

function sheetTitle(v: View, r: SchnautzResult): string {
  if (v.phase === 'over') {
    if (v.winner === App.me) return `Du <span class="r">${SZ_SHEET.won}</span>`;
    if (!v.winner) return SZ_SHEET.over;
    // Lange Namen brächen den Kopf am Handy auf zwei Zeilen um, der Name steht ohnehin in der Siegerzeile darunter
    const name = nameOf(v, v.winner);
    return name.length <= TITLE_NAME_MAX
      ? `${esc(name)} <span class="r">${SZ_SHEET.wins}</span>`
      : `<span class="r">${SZ_SHEET.decided}</span>`;
  }
  // Kurz, damit der Kopf auch mit langen Namen einzeilig bleibt, wer es war, sagt die Zeile darunter
  if (r.reason === 'schnautz') return `<span class="r">${SZ_SHEET.schnautz}</span>`;
  if (r.reason === 'feuer') return `<span class="r">${SZ_SHEET.feuer}</span>`;
  return SZ_SHEET.shown;
}

/**
 * Unterzeile des Kopfs nur, wenn jemand gegangen ist. Wie die Runde ausging, sagen Titel und Zeilen (👑 mit 31 oder
 * Feuer, „hat geklopft“), so bleibt bei acht Leuten am kurzen Handy Platz für alle Zeilen.
 */
function sheetLead(v: View, r: SchnautzResult): string {
  return r.reason === 'quit' ? SZ_SHEET.quit(esc(nameOf(v, r.by)), r.by === App.me) : '';
}

function sheetTaunt(v: View, r: SchnautzResult): Sheet['taunt'] {
  const myC = r.changes[App.me];
  const loserIds = Object.keys(r.changes);
  if (v.phase === 'over' && v.winner) {
    return v.winner === App.me
      ? { text: taunt('gameWinSelf', null, `o${v.games}`), good: true }
      : { text: taunt('gameLoseSelf', { name: nameOf(v, v.winner) }, `o${v.games}`), good: false };
  }
  const seed = `o${v.games}:${v.round}`;
  if (myC)
    return {
      text: taunt(myC.to === 'out' ? 'scOutSelf' : myC.to === 'swim' ? 'scSwimSelf' : 'scLoseSelf', null, seed),
      good: false,
    };
  if (loserIds.length && r.reason !== 'quit') {
    const c0 = r.changes[loserIds[0]];
    const key = c0.to === 'out' ? 'scOutOther' : c0.to === 'swim' ? 'scSwimOther' : 'scLoseOther';
    return { text: taunt(key, { name: nameOf(v, loserIds[0]) }, seed), good: true };
  }
  return null;
}

/**
 * Ergebnisblatt als Daten. Rundenende: wer Leben verliert (💔 🛟 🫧) als Schlüsselzeile mit Karten, ich zuerst,
 * dann alle nach Handwert, wer schon raus war, zuletzt. Partieende: Sieger als Schlüsselzeile, darunter, wer zuletzt
 * untergegangen ist, dann die übrigen nach der Runde, in der sie rausflogen. `null` außerhalb von Runden- und Partieende.
 */
export function szSheet(v: View): Sheet | null {
  const r = schnautzResult(v);
  if ((v.phase !== 'end' && v.phase !== 'over') || !r) return null;
  const over = v.phase === 'over';
  const best = roundBest(v);
  const losers = Object.keys(r.changes);
  const hv = (id: string) => handValue(r.hands[id], v.rules);
  const valOf = (id: string): string | undefined => {
    if (!r.hands[id]) return undefined;
    const h = hv(id);
    return h.kind === 'feuer' ? '33' : fmtVal(num(h.v));
  };
  const nm = (id: string) => esc(nameOf(v, id));
  let rows: SheetRow[];
  let key: string | null;
  let keyNote: string | undefined;
  if (!over) {
    const inRound = v.players.filter((p) => r.hands[p.id]).sort((a, b) => hv(b.id).v - hv(a.id).v);
    const before = v.players.filter((p) => !r.hands[p.id]);
    rows = [
      ...inRound.map((p): SheetRow => {
        const c = r.changes[p.id];
        const lc = c ? lifeCore(c, p.id === App.me) : null;
        const isBest = !c && best.includes(p.id) && losers.length > 0;
        return {
          id: p.id,
          place: null,
          name: nm(p.id),
          hat: lc?.hat ?? (isBest ? '👑' : undefined),
          core: lc?.core ?? (isBest ? `<span class="conseq good">${SZ_SHEET.best}</span>` : livesHTML(p, v.rules)),
          // Kurz: die 👑 sagt „beste Hand“ schon, die Leben stehen als Deckel mit Zahl
          short: lc?.short ?? (isBest ? '' : livesShort(p)),
          val: valOf(p.id),
          cards: r.hands[p.id],
          tone: c ? 'lose' : isBest ? 'win' : undefined,
        };
      }),
      ...before.map((p): SheetRow => ({
        id: p.id,
        place: null,
        name: nm(p.id),
        core: SZ_SHEET.outBefore,
        short: SZ_SHEET.outShort,
      })),
    ];
    key = losers.includes(App.me) ? App.me : (r.losers.find((id) => losers.includes(id)) ?? losers[0] ?? null);
    if (!losers.length && r.reason !== 'quit') keyNote = SZ_SHEET.tie;
  } else {
    const lastDown = losers.filter((id) => r.changes[id].to === 'out');
    const others = v.players
      .filter((p) => p.id !== v.winner)
      .sort((a, b) => num(b.outRound) - num(a.outRound) || hv(b.id).v - hv(a.id).v);
    const win = v.winner ? pById(v, v.winner) : null;
    rows = [
      ...(win
        ? [
            {
              id: win.id,
              place: 1,
              name: nm(win.id),
              hat: '👑',
              core: SZ_SHEET.winner(win.id === App.me),
              val: valOf(win.id),
              cards: r.hands[win.id],
              tone: 'win',
            } satisfies SheetRow,
          ]
        : []),
      ...others.map((p, i): SheetRow => {
        const last = lastDown.includes(p.id);
        return {
          id: p.id,
          place: i + (win ? 2 : 1),
          name: nm(p.id),
          hat: last ? '🫧' : undefined,
          core: p.outRound ? SZ_SHEET.outIn(num(p.outRound)) : SZ_SHEET.outBefore,
          // 🫧 und der Satz unter dem Sieger sagen schon, wann sie rausflogen
          short: last ? '' : p.outRound ? SZ_SHEET.outInShort(num(p.outRound)) : SZ_SHEET.outShort,
          val: valOf(p.id),
          tone: last ? 'lose' : undefined,
        };
      }),
    ];
    key = win?.id ?? null;
    if (lastDown.length) {
      const ids = [...lastDown.filter((id) => id === App.me), ...lastDown.filter((id) => id !== App.me)];
      keyNote = SZ_SHEET.lastDownNote(listJoin(ids.map(nm)), ids.length, ids.includes(App.me));
    }
  }
  // Die Schlüsselzeile trägt Karten, ihr Handwert steht mit in der Folge statt allein in der Kartenreihe
  rows = rows.map((row) => {
    // Wer geklopft hat, steht in der eigenen Zeile, statt einer eigenen Zeile unter dem Titel. Kurz bleibt
    // „geklopft“, das Zeichen davor sagt, wie es ausging. Nur zwei Leben weg (Klopfen doppelt) steht noch dabei
    const knocked = !over && r.reason === 'knock' && row.id === r.knocker;
    const core = knocked ? `${SZ_SHEET.knocked(row.id === App.me)} · ${row.core}` : row.core;
    const lost2 = r.changes[row.id]?.to === 'life' && r.changes[row.id].n > 1;
    const short = knocked ? `${SZ_SHEET.knockedShort}${lost2 && row.short ? ` · ${row.short}` : ''}` : row.short;
    return row.id === key && row.val != null
      ? { ...row, core: `${core} · ${SZ_SHEET.handVal(row.val)}`, short: undefined, val: undefined }
      : { ...row, core, short };
  });
  const myC = r.changes[App.me];
  const icon = over
    ? '🏆'
    : myC
      ? lifeCore(myC, true).hat
      : best.includes(App.me) && losers.length
        ? '👑'
        : !losers.length && r.reason !== 'quit'
          ? '🤝'
          : '🃏';
  return {
    icon,
    title: sheetTitle(v, r),
    lead: sheetLead(v, r),
    key,
    keyNote,
    taunt: sheetTaunt(v, r),
    bets: '',
    rows,
    next: over ? 'game' : 'round',
    // Am Rundenende zeigt an kleinen Tischen jede Zeile ihre Hand. Ab fünf Leuten kostet das am Handy zu viel Höhe
    rowCards: !over && rows.length <= 4,
  };
}

export const szSpec: NewTable = {
  badge: true,
  actor,
  seat: szSeat,
  center: szCenter,
  me: szMe,
  status: szStatus,
  sheet: szSheet,
  drag: null,
};

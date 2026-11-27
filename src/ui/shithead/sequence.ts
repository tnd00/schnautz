/*
 * Shithead: Spielzüge sichtbar nacheinander abspielen.
 *
 * Der Zustand springt sofort, deshalb rekonstruiert shPlan aus den neuen Log-Einträgen,
 * was mit dem Stapel passiert ist. runSeq zeigt das Schritt für Schritt (Karte landet,
 * Stapel brennt, blinde Karte dreht sich um, Stapel fliegt zur Hand). Solange eine Sequenz
 * läuft, warten neue Ansichten in SEQ.next.
 */
import type { Card, LogEntry, View } from '../../game/types';
import { flyG, type Rect } from '../animations';
import { App } from '../app';
import { $opt, esc, num, reduceMotion, type Timer } from '../dom';
import { type Announcement, boomFx, emit, shakeEl } from '../feedback';
import { burnCue, cueOf, type LevelCtx } from '../levels';
import { nameOf, vb } from '../helpers';
import { renderSh } from '../render/shithead';
import { dragLanded } from '../table/drag';
import { renderTable } from '../table/index';
import { sfx } from '../sound';
import { taunt } from '../taunts';
import { zerSlow } from '../ceremony';
import { decisivePlay, SEQ_CARD_GAP_MS, slowExtraMs, ZER_SLOW_FLIGHT_MS } from '../ceremony-plan';

type Entry<K extends LogEntry['k']> = Extract<LogEntry, { k: K }>;
type PlayEntry = Entry<'shplay'> | Entry<'shthrow'> | Entry<'shbomb'>;

export type Step =
  | { k: 'play'; e: PlayEntry; pile: Card[]; src: 'hand' | 'up' | 'down'; slow?: true }
  | { k: 'burn'; e: Entry<'shburn'>; from: Card[]; burned: number }
  | { k: 'pickup'; e: Entry<'shpickup'> | Entry<'shblindfail'>; from: Card[]; fail?: boolean }
  | { k: 'blind'; e: Entry<'shblindfail'>; pile: Card[] };

/** Was die Mitte während der Sequenz anzeigt (statt des neuen Zustands). */
export interface SeqOverride {
  pile: Card[];
  burned: number;
  /** Eigene Hand vor dem Aufnehmen, damit der Stapel sichtbar hineinfliegt. */
  myHand: Card[] | null;
}

export const SEQ = {
  busy: false,
  ov: null as SeqOverride | null,
  next: null as View | null,
  endAt: 0,
  t: null as Timer | null,
  /** Wird beim Verlassen des Tisches erhöht, alte Timer laufen dann ins Leere. */
  gen: 0,
  done: null as (() => void) | null,
};

const MAX_STEPS = 12;
const MAX_TOTAL_MS = 4800;

export const seqLeft = (): number => (SEQ.busy ? Math.max(0, SEQ.endAt - Date.now()) : 0);

/** Laufende Sequenz abbrechen (Tisch verlassen, neu verbinden). */
export function resetSeq(): void {
  if (SEQ.t) clearTimeout(SEQ.t);
  SEQ.t = null;
  SEQ.busy = false;
  SEQ.next = null;
  SEQ.ov = null;
  SEQ.done = null;
  SEQ.gen++;
}

export function burnAnn(v: View, e: Entry<'shburn'>): Announcement {
  const nm = nameOf(v, e.p, e.name);
  const mine = e.p === App.me;
  // `cut` heißt außer der Reihe: Jemand anderes war dran. Nur dann kommen die Sprüche übers Dazwischenfunken
  if (e.cut) {
    const t = mine ? taunt('bombSelf', null, e.n) : taunt('bombOther', { name: nm }, e.n);
    return { icon: '💣', tone: 'red', title: 'Bombe!', sub: `<span class="tt">${esc(t)}</span>`, ms: 2000 };
  }
  // Vier Gleiche heißen auch im eigenen Zug Bombe. Erst die Tatsache, dann der Spruch
  if (e.four) {
    const t = mine ? taunt('fourSelf', null, e.n) : taunt('fourOther', { name: nm }, e.n);
    return {
      icon: '💣',
      tone: 'red',
      title: 'Bombe!',
      sub: `${esc(nm)}${vb(e.p, ' machst', ' macht')} die vier voll.<span class="tt">${esc(t)}</span>`,
      ms: 2000,
    };
  }
  return {
    icon: '🔥',
    tone: 'red',
    title: 'Verbrannt!',
    sub: `${esc(nm)}${vb(e.p, ' verbrennst', ' verbrennt')} den Stapel.`,
    ms: 1300,
  };
}

/**
 * Plant die Schritte vom alten zum neuen Stapel. Passt das Ergebnis nicht exakt
 * zum neuen Zustand (etwa nach einem Neuverbinden), gibt es keine Sequenz.
 */
export function shPlan(prev: View, v: View, fresh: LogEntry[]): Step[] {
  if (v.game !== 'shithead' || prev.game !== 'shithead' || !prev.sh || !v.sh || prev.games !== v.games) return [];
  if (reduceMotion() || document.hidden) return [];
  let pile = prev.sh.pile.slice();
  let burned = num(prev.sh.burned);
  const steps: Step[] = [];
  for (const e of fresh) {
    if (e.k === 'shplay' || e.k === 'shthrow' || e.k === 'shbomb') {
      pile = pile.concat(e.cards);
      steps.push({ k: 'play', e, pile: pile.slice(), src: e.k === 'shthrow' ? 'hand' : e.src });
    } else if (e.k === 'shburn') {
      const from = pile.slice(-4);
      burned += pile.length;
      pile = [];
      steps.push({ k: 'burn', e, from, burned });
    } else if (e.k === 'shpickup') {
      steps.push({ k: 'pickup', e, from: pile.slice(-5) });
      pile = [];
    } else if (e.k === 'shblindfail') {
      pile = pile.concat([e.card]);
      steps.push({ k: 'blind', e, pile: pile.slice() });
      steps.push({ k: 'pickup', e, from: pile.slice(-5), fail: true });
      pile = [];
    }
  }
  if (!steps.length || steps.length > MAX_STEPS || totalMs(steps) > MAX_TOTAL_MS) return [];
  if (JSON.stringify(pile) !== JSON.stringify(v.sh.pile) || burned !== num(v.sh.burned)) return [];
  // Der Zug, der den Shithead festlegt, kommt in Zeitlupe. Er zählt nicht gegen die Obergrenze
  const d = decisivePlay(fresh);
  if (d) steps.forEach((s) => s.k === 'play' && s.e === d && (s.slow = true));
  planFresh = fresh;
  return steps;
}

/** Der ganze Schub zum zuletzt geplanten Ablauf, damit die Stufen in runStep dasselbe sehen wie effects(). */
let planFresh: readonly LogEntry[] = [];

export function stepMs(s: Step): number {
  switch (s.k) {
    case 'play':
      return (s.src === 'down' ? 1350 : s.e.k === 'shthrow' ? 650 : 760) + (s.slow ? slowExtraMs(s.e) : 0);
    case 'burn':
      return s.e.cut ? 1250 : 1000;
    case 'blind':
      return 2000;
    case 'pickup':
      return 850;
  }
}

export const totalMs = (steps: Step[]): number => steps.reduce((t, s) => t + stepMs(s), 0);

/**
 * Wie lange die Sequenz zu diesen Log-Einträgen etwa läuft. Die Zeitlupe der Zeremonie fehlt hier absichtlich,
 * sie kommt nur am Partieende vor, wo keine Uhr mehr läuft. Der Gastgeber startet die 4er-Sperre
 * erst danach, damit alle den leeren Stapel wirklich sehen.
 */
export function seqMsOf(entries: LogEntry[]): number {
  let n = 0;
  let ms = 0;
  for (const e of entries) {
    if (e.k === 'shplay' || e.k === 'shthrow' || e.k === 'shbomb') {
      n++;
      ms += e.k === 'shthrow' ? 650 : e.src === 'down' ? 1350 : 760;
    } else if (e.k === 'shburn') {
      n++;
      ms += e.cut ? 1250 : 1000;
    } else if (e.k === 'shpickup') {
      n++;
      ms += 850;
    } else if (e.k === 'shblindfail') {
      n += 2;
      ms += 2850;
    }
  }
  return n > MAX_STEPS || ms > MAX_TOTAL_MS ? 0 : ms;
}

export function runSeq(steps: Step[], v: View, done: () => void): void {
  let i = 0;
  const fresh = planFresh;
  const gen = SEQ.gen;
  const next = () => {
    if (gen !== SEQ.gen) return;
    if (i >= steps.length) {
      SEQ.t = null;
      done();
      return;
    }
    const s = steps[i++];
    try {
      runStep(s, v, fresh);
    } catch (er) {
      console.warn(er);
    }
    SEQ.t = setTimeout(next, stepMs(s));
  };
  next();
}

const pileEls = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('#center .pile .card'));
const rotOf = (el: Element): string => getComputedStyle(el).getPropertyValue('--rot').trim() || '0deg';

/** Nur die Mitte mit dem Zwischenstand aus SEQ.ov neu, Plätze und Status bleiben */
const paintCenter = (v: View): void => renderTable(v, { parts: ['center'] });

/** Woher kommen die Karten eines Spielers (Hand oder Tischkarten)? */
function shSrcEl(pid: string | undefined, src: 'hand' | 'up' | 'down'): HTMLElement | null {
  const root = pid === App.me ? $opt('#me') : $opt(`.opp[data-pid="${pid}"]`);
  if (!root) return $opt('#center .deck');
  if (src === 'hand') return $opt(pid === App.me ? '.shhand' : '.ohand', root) ?? root;
  return $opt('.tcards', root) ?? root;
}

/** Eigene Karten, die gerade per Ziehen abgelegt wurden: Sie gleiten von der Abwurfstelle ohne Bogen (flyG `from`). */
function glide(pid: string | undefined, src: 'hand' | 'up' | 'down', fr: Rect): { from?: Rect } {
  const k = pid === App.me ? dragLanded()?.key : null;
  return k?.g === 'shithead' && k.from === src ? { from: fr } : {};
}

/** Startpunkte der Flüge. Eigene Karten starten genau dort, wo man sie angeklickt hat. */
function srcRects(pid: string | undefined, src: 'hand' | 'up' | 'down', n: number): Rect[] {
  const pr = App.playRects;
  if (pid === App.me && pr && Date.now() - pr.t < 6000 && pr.src === src && pr.rects.length) {
    App.playRects = null;
    return Array.from({ length: n }, (_, k) => pr.rects[Math.min(k, pr.rects.length - 1)]);
  }
  const el = shSrcEl(pid, src);
  if (!el) return [];
  const r = el.getBoundingClientRect();
  const cw = el.querySelector<HTMLElement>('.card')?.offsetWidth ?? 40;
  const box = {
    left: r.left + r.width / 2 - cw / 2,
    top: r.top + r.height / 2 - cw * 0.7,
    width: cw,
    height: cw * 1.4,
  };
  return Array.from({ length: n }, () => box);
}

/** Wie setTimeout, aber wirkungslos, wenn der Tisch inzwischen verlassen wurde. */
function later(fn: () => void, ms: number): Timer {
  const g = SEQ.gen;
  return setTimeout(() => {
    if (g === SEQ.gen) fn();
  }, ms);
}

function runStep(s: Step, v: View, fresh: readonly LogEntry[]): void {
  const ov = SEQ.ov;
  if (!ov) return;
  const e = s.e;
  const mine = e.p === App.me;
  const nm = nameOf(v, e.p, e.name);
  // Stufe und Ton wie ohne Ablauf (src/ui/shithead/effects.ts), damit beide Wege gleich klingen und dasselbe sagen
  const lc: LevelCtx = { prev: v, v, fresh, me: App.me, seqd: false };
  switch (s.k) {
    case 'play': {
      ov.pile = s.pile;
      paintCenter(v);
      const cards = s.e.cards;
      const els = pileEls();
      const n = Math.min(cards.length, els.length);
      const rects = srcRects(e.p, s.src, n);
      const base = els.length - n;
      for (let k = 0; k < n; k++) {
        const to = els[base + k];
        const w = to.offsetWidth;
        const fr = rects[k];
        if (!fr) continue;
        flyG(fr, to.getBoundingClientRect(), cards[cards.length - n + k], {
          w,
          s0: (fr.width || w) / w,
          rot: rotOf(to),
          hideEl: to,
          delay: k * SEQ_CARD_GAP_MS,
          dur: s.src === 'down' ? 760 : 560,
          flip: s.src === 'down',
          spin: -8,
          ...glide(e.p, s.src, fr),
          // Zeitlupe für die entscheidende Karte: über der Abdunklung, Balken erst beim Umdrehen
          ...(s.slow
            ? {
                z: 49,
                slow: {
                  extra: ZER_SLOW_FLIGHT_MS,
                  onSlow:
                    k === 0
                      ? () => {
                          zerSlow(true, v.games);
                          sfx('slowmo');
                        }
                      : undefined,
                  onLand: k === n - 1 ? () => zerSlow(false) : undefined,
                },
              }
            : {}),
        });
      }
      if (s.slow) later(() => zerSlow(false), stepMs(s));
      if (!mine || s.src !== 'hand') sfx('card');
      if (s.e.k === 'shthrow')
        emit(cueOf(s.e, lc), { pid: e.p, text: 'wirft 4er rein', mine: 'wirfst 4er rein', delay: 0 });
      if (s.e.k === 'shbomb') {
        emit(cueOf(s.e, lc), { pid: e.p, text: 'wirft eine Bombe ein', mine: 'wirfst eine Bombe ein', delay: 0 });
      }
      if (s.src === 'down') {
        const pe = s.e;
        later(
          () => emit(cueOf(pe, lc), { pid: e.p, text: 'legt blind, passt!', mine: 'legst blind, passt!', delay: 0 }),
          760 + (s.slow ? ZER_SLOW_FLIGHT_MS : 0),
        );
      }
      break;
    }
    case 'burn': {
      pileEls().forEach((c, k) => {
        c.style.setProperty('--bd', `${k * 0.05}s`);
        c.classList.add('burning');
      });
      boomFx(s.e.four ? '💣' : '🔥', $opt('#center .pile'));
      // Stufe nach den Karten dieses Schritts: ov.burned ist der Stand davor (later() setzt ihn erst nach dem
      // Verbrennen auf s.burned). Ein großes Fertig im Schub (lc.fresh) macht das Verbrennen mittel
      const a = burnAnn(v, s.e);
      emit(burnCue(s.e, s.burned - ov.burned, lc), {
        pid: e.p,
        text: s.e.four ? 'macht die vier voll' : 'verbrennt den Stapel',
        mine: s.e.four ? 'machst die vier voll' : 'verbrennst den Stapel',
        icon: a.icon,
        tone: a.tone,
        title: a.title,
        sub: a.sub,
        ms: a.ms,
        sfx: s.e.four ? 'bomb' : 'burn',
      });
      later(() => {
        if (!SEQ.ov) return;
        SEQ.ov.pile = [];
        SEQ.ov.burned = s.burned;
        paintCenter(v);
        $opt('#center .burned')?.classList.add('hot');
      }, 700);
      break;
    }
    case 'blind': {
      ov.pile = s.pile;
      paintCenter(v);
      const bt = pileEls().pop();
      const br = srcRects(e.p, 'down', 1)[0];
      if (bt && br) {
        flyG(br, bt.getBoundingClientRect(), s.e.card, {
          w: bt.offsetWidth,
          s0: (br.width || bt.offsetWidth) / bt.offsetWidth,
          rot: rotOf(bt),
          hideEl: bt,
          dur: 760,
          flip: true,
          ...glide(e.p, 'down', br),
        });
      }
      later(() => {
        const p2 = $opt('#center .pile');
        if (p2) shakeEl(p2);
        emit(cueOf(s.e, lc), {
          pid: e.p,
          text: 'legt blind, passt nicht!',
          mine: 'legst blind, passt nicht!',
          sfx: 'nope',
          taunt: mine ? taunt('blindFailSelf', null, e.n) : taunt('blindFailOther', { name: nm }, e.n),
          delay: 0,
        });
      }, 820);
      break;
    }
    case 'pickup': {
      const pileEl = $opt('#center .pile');
      const pr = pileEl?.getBoundingClientRect();
      const pw = pileEls()[0]?.offsetWidth ?? 80;
      const hand = shSrcEl(e.p, 'hand');
      const hr = hand?.getBoundingClientRect();
      const hw = hand?.querySelector<HTMLElement>('.card')?.offsetWidth ?? 30;
      if (pr && hr) {
        const target = {
          left: hr.left + hr.width / 2 - hw / 2,
          top: hr.top + hr.height / 2 - hw * 0.7,
          width: hw,
          height: hw * 1.4,
        };
        s.from.forEach((c, k) =>
          flyG(pr, target, c, { w: pw, s1: hw / pw, delay: k * 70, dur: 560, spin: 10, fade: !mine }),
        );
      }
      ov.pile = [];
      paintCenter(v);
      if (mine && ov.myHand) {
        later(() => {
          if (!SEQ.ov) return;
          SEQ.ov.myHand = null;
          renderSh(v);
        }, 520);
      }
      const cnt = num(s.e.cnt);
      // Nach blind daneben hat „passt nicht“ schon gesprochen, die Zahl kommt dann klein und leise dazu
      const pickCue = s.fail ? { level: 'small' as const } : cueOf(e, lc);
      later(
        () =>
          emit(pickCue, {
            pid: e.p,
            text: `nimmt ${cnt} ${cnt === 1 ? 'Karte' : 'Karten'}`,
            mine: `nimmst ${cnt} ${cnt === 1 ? 'Karte' : 'Karten'}`,
            taunt: s.fail
              ? undefined
              : mine
                ? taunt('pickupSelf', { n: cnt }, e.n)
                : taunt('pickupOther', { name: nm, n: cnt }, e.n),
            delay: 0,
          }),
        200,
      );
      sfx('card');
      break;
    }
  }
}

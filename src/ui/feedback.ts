/*
 * Rückmeldungen: Toasts, große Meldungen, Sprechblasen und kleine Einblendungen am Tisch.
 * Was am Tisch passiert, läuft über `emit` mit einer Stufe aus `cueOf` (src/ui/levels.ts). Die Entscheidungen ohne
 * DOM stehen in src/ui/feedback-rules.ts (Stufe im Schub, Ton) und src/ui/band.ts (Lage im Band, wer weicht, wer
 * wartet). Hier wird gemessen und gesetzt.
 */
import { plain, resetSay, say, sayBatch, sentences } from './a11y/say';
import { App } from './app';
import { SAY_TEXT } from '../content/texts/a11y';
import { $, $opt, esc, type Timer } from './dom';
import { render } from './render/index';
import type { Cue } from './levels';
import type { Reject } from '../game/reject';
import type { LogEntry } from '../game/types';
import { ctxOfView, rejectText } from '../content/texts';
import { myMoveNow } from './helpers';
import { sfx, sfxCalm, type SoundName } from './sound';
import { dragCancel } from './table/drag';
import { type BatchState, type Box, levelInBatch, movedEnough, newBatch, toneOf } from './feedback-rules';
import {
  type BandGeo,
  type BandIn,
  bandGeo,
  coverWidth,
  cutsStatus,
  FIELD_BIG,
  FIELD_MIN,
  firstFit,
  panelText,
  parkedWaits,
  pillStack,
  slotOf,
  type Rect,
  type Span,
  STAGE_DROP,
  stageRoom,
  stageTop,
  waitsForBig,
  yieldToBig,
} from './band';

const ms = (x: number | undefined, d: number) => x || d;

/** Am PC mit Maus heißt es Klicken, sonst Antippen. Erst beim Aufruf gefragt, damit das Modul auch ohne Browser lädt. */
export function skipHint(): string {
  const mouse = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  return mouse ? 'Klicken zum Überspringen' : 'Antippen zum Überspringen';
}

export function toast(msg: string, duration?: number): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(
    () => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    },
    ms(duration, 2600),
  );
}

/** Sichtbares Rechteck oder null (ausgeblendete Elemente liefern ein Rechteck aus Nullen). */
function shown(sel: string): DOMRect | null {
  const r = $opt(sel)?.getBoundingClientRect();
  return r && r.height > 0 && r.width > 0 ? r : null;
}

/** Offenes Reaktionsfenster am Handy, Meldungen sollen es nicht verdecken. */
function emotesBox(): Span | null {
  if (!document.body.classList.contains('emoopen')) return null;
  const r = shown('#emotes');
  return r ? { top: r.top, bottom: r.bottom } : null;
}

const emotesTop = (): number => emotesBox()?.top ?? Infinity;

/** Sitzt jemand am Tisch, mit eigenem Platz? Sonst gibt es weder Spielfläche noch Band. */
const atTable = (): boolean => document.body.classList.contains('ingame') && !!$opt('#table') && !!shown('#me');

/**
 * Unterkante der Gegner für Band und kleine Meldungen. Gekippte Kacheln (Sticker) und ihr Wert darunter ragen aus
 * #opps, sie zählen mit, sonst landen Meldungen ein paar Pixel auf ihnen. Die Spielfläche (fieldBox) misst weiter
 * nur #opps, sonst rückten große Meldungen dort in die Statuszeile.
 */
function oppsBottom(): number | null {
  let bottom = shown('#opps')?.bottom ?? null;
  for (const el of document.querySelectorAll('#opps .opp, #opps .opp > .val')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) bottom = Math.max(bottom ?? 0, r.bottom);
  }
  return bottom;
}

/**
 * Freie Spielfläche zwischen Gegnern und eigenem Platz, ungeprüft auf ihre Höhe. Meldungen liegen nur dort, damit
 * sie weder die eigenen Karten noch die Gegner verdecken.
 */
export function fieldBox(): Box | null {
  if (!document.body.classList.contains('ingame')) return null;
  const table = $opt('#table');
  const opps = $opt('#opps');
  const me = $opt('#me');
  if (!table || !opps || !me) return null;
  const t = table.getBoundingClientRect();
  const top = Math.max(t.top, opps.getBoundingClientRect().bottom) + 6;
  let bottom = Math.min(t.bottom, me.getBoundingClientRect().top, emotesTop()) - 6;
  // Knöpfe in der Statuszeile (4er, Bombe, Vorspulen) bleiben frei, solange darüber genug Spielfläche bleibt
  const quick = shown('#status .quick');
  if (quick && quick.top - 6 < bottom && quick.top - 6 - top >= FIELD_MIN) bottom = quick.top - 6;
  return { left: t.left, top, width: t.width, height: Math.max(0, bottom - top) };
}

/** Die Spielfläche, wenn sie mindestens `min` hoch ist (Standard: dieselbe Schwelle wie für das Band), sonst null. */
function fieldRect(min = FIELD_MIN): Box | null {
  const f = fieldBox();
  return f && f.height >= min ? f : null;
}

/** Unterkante der Mitte samt Stapel, Ablage und Regelzeile, soweit sie über dem eigenen Platz liegt. */
function pileBottom(limit: number): number | null {
  let bottom: number | null = null;
  for (const el of document.querySelectorAll<HTMLElement>('#center, #center *')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom <= limit) bottom = Math.max(bottom ?? 0, r.bottom);
  }
  return bottom;
}

/**
 * Statuszeile: Unterkante der Hauptzeile und des ganzen Texts (Unterzeile, Knöpfe). Knöpfe statt der Unterzeile
 * (`.quick`: 4er, Bombe, Vorspulen) zählen zur Hauptzeile, keine kleine Meldung legt sich darüber.
 */
function statusLines(st: DOMRect): { top: number; main: number; text: number } | null {
  const line = shown('#status .main');
  if (!line) return null;
  const main = Math.max(line.bottom, shown('#status .quick')?.bottom ?? 0);
  let text = main;
  for (const el of document.querySelectorAll<HTMLElement>('#status > *')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) text = Math.max(text, r.bottom);
  }
  return { top: line.top, main, text: Math.min(text, st.bottom) };
}

/** Gemessene Kanten des Bands samt seiner Breite (so breit wie der eigene Platz). */
function bandIn(): (BandIn & { left: number; width: number }) | null {
  const v = App.view;
  if (!v || !atTable()) return null;
  const me = shown('#me');
  if (!me) return null;
  const table = shown('#table');
  const swap = v.phase === 'swap';
  const st = shown('#status');
  const head = shown('#me .swhead');
  // Erster Inhalt im eigenen Platz: Kopf mit Name oder die runden Knöpfe in den Ecken (am Handy)
  const firsts = ['#me .mehead', '#me .swhead', '#emofab', '#logfab']
    .map((q) => shown(q)?.top)
    .filter((x): x is number => x !== undefined);
  // So breit wie der eigene Platz, damit lange Titel nicht in vier Zeilen umbrechen. In der Tauschrunde reicht die
  // Bühne auf den Kopf am Platz, dort bleiben die runden Knöpfe in den Ecken (am Handy) frei
  const fl = swap ? shown('#emofab') : null;
  const fr = swap ? shown('#logfab') : null;
  const x0 = Math.max(Math.min(st?.left ?? Infinity, me.left), fl ? fl.right + 6 : -Infinity);
  const x1 = Math.min(Math.max(st?.right ?? -Infinity, me.right), fr ? fr.left - 6 : Infinity);
  return {
    opps: Math.max(table?.top ?? 0, oppsBottom() ?? 0),
    pile: swap || myMoveNow(v) ? pileBottom(me.top) : null,
    me: me.top,
    head: firsts.length ? Math.min(...firsts) : me.top,
    deep: swap && head ? head.bottom : me.top,
    emotes: emotesBox(),
    status: st ? statusLines(st) : null,
    quick: !!shown('#status .quick'),
    lines: [...document.querySelectorAll<HTMLElement>('#center .cnt')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0 && r.width > 0)
      .map((r) => ({ top: r.top, bottom: r.bottom })),
    left: x0,
    width: x1 - x0,
  };
}

/**
 * Das Band, wenn Meldungen gerade dort stehen: am eigenen Zug, in der Tauschrunde oder ohne genug Spielfläche
 * (src/ui/band.ts). Sonst null, dann gilt die Spielfläche.
 */
function bandNow(): { g: BandGeo; left: number; width: number } | null {
  const v = App.view;
  if (!v || !atTable()) return null;
  const f = fieldBox();
  if (slotOf({ swap: v.phase === 'swap', myMove: myMoveNow(v), field: f ? f.height : 0 }) !== 'band') return null;
  const b = bandIn();
  return b ? { g: bandGeo(b), left: b.left, width: b.width } : null;
}

/** Steht gerade eine große Meldung im Band? Dann warten Hinweise und Sprüche (waitsForBig). */
const bigInBand = (): boolean => !!$opt('#announce.band .ann:not(.out)');

/**
 * Lage einer Meldung nach dem Einblenden. Während der Pop-Animation ist das gemessene Rechteck verschoben und
 * verkleinert, deshalb aus der gesetzten Lage und der Höhe ohne Transform.
 */
function restBox(el: HTMLElement): { top: number; bottom: number } {
  const top = parseFloat(el.style.top) || el.getBoundingClientRect().top;
  return { top, bottom: top + el.offsetHeight };
}

/** Rechtecke des Texts in Haupt- und Unterzeile der Statuszeile (nicht der ganzen Zeile) für coverWidth */
function statusText(): DOMRect[] {
  return [...document.querySelectorAll<HTMLElement>('#status .main, #status .sub')]
    .map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    })
    .filter((r) => r.width > 0 && r.height > 0);
}

/** Knöpfe in der Statuszeile (4er, Bombe, Vorspulen): Die Bühne im Band deckt sie nie (stageRoom). */
function keepBox(): Span | null {
  const r = shown('#status .quick');
  return r ? { top: r.top, bottom: r.bottom } : null;
}

/** Bühne im Band: Sprüche und Hinweis mit Spruch. Alles andere (Hinweis, Grund) ist eine kleine Meldung. */
const onStage = (el: HTMLElement): boolean => el.classList.contains('tauntlbl');
/** Rang einer kleinen Meldung im Band (src/ui/band.ts, pillStack): Grund, Automatisches (urgent), Hinweis */
const rankOf = (el: HTMLElement): 0 | 1 | 2 =>
  el.classList.contains('nopelbl') ? 2 : el.dataset.urgent === '1' ? 1 : 0;

/** Kleine Meldungen, die gerade im Band stehen (älteste zuerst) */
const bandPills = (but?: HTMLElement): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('#fly .mid.band')].filter(
    (o) => o !== but && !onStage(o) && !o.classList.contains('out') && o.style.top !== '-999px',
  );

type Mode = 'cap' | 'center';
/** Wie lange eine Meldung steht und ob sie zum Schluss ausblendet (sonst blendet ihre Animation selbst aus) */
interface Life {
  ms: number;
  fade: boolean;
}

/**
 * Meldungen, die im Band warten: auf das Ende einer großen Meldung (`big`) oder, als verdrängtes Automatisches, bis
 * kein Grund und nichts anderes Automatisches mehr steht (`room`). Ihre Lebensdauer zählt erst ab dem Zeigen.
 */
const WAIT: { el: HTMLElement; mode: Mode; life: Life; at: number; kind: 'big' | 'room' }[] = [];
/** Länger wartet niemand, danach ist die Meldung überholt */
const WAIT_MAX = 6000;
/** Lebensdauer jeder gezeigten Meldung samt Uhr, damit eine verdrängte später mit voller Dauer wiederkommt */
const LIFE = new WeakMap<HTMLElement, { life: Life; t?: Timer }>();

/**
 * Wohin mit einer Meldung in der Spielfläche?
 * Kleine Hinweise (`cap`) sitzen genau auf dem Label "Stapel" (bei Schnautz "Mitte"): gleiche Unterkante, es wird
 * überdeckt. Sprüche (`center`) stehen mittig wie die großen Meldungen. Mehrere gleichzeitig reihen sich darunter.
 * Im Band gelten die Regeln aus src/ui/band.ts. `urgent` (Grund, Automatisches) wartet nie auf eine große Meldung.
 * Gibt `false` zurück, wenn kein Tisch zu sehen ist.
 */
function placeMessage(el: HTMLElement, mode: Mode, life: Life, urgent = false): boolean {
  if (!atTable()) return false;
  ensureResize();
  el.classList.add('mid');
  el.dataset.mode = mode;
  if (urgent) el.dataset.urgent = '1';
  if (waitsForBig({ band: !!bandNow(), bigLive: bigInBand(), urgent })) {
    WAIT.push({ el, mode, life, at: Date.now(), kind: 'big' });
    return true;
  }
  showMessage(el, mode, life);
  return true;
}

function showMessage(el: HTMLElement, mode: Mode, life: Life): void {
  el.style.top = '-999px';
  $('#fly').appendChild(el);
  const own = { life } as { life: Life; t?: Timer };
  LIFE.set(el, own);
  positionMessage(el, mode, true);
  // Schon beim Setzen verdrängt und geparkt: Die Uhr läuft erst, wenn sie wirklich zu sehen ist
  if (!el.isConnected) return;
  own.t = setTimeout(() => {
    if (!life.fade) {
      el.remove();
      flushWait();
      return;
    }
    el.classList.add('out');
    setTimeout(() => {
      el.remove();
      flushWait();
    }, 320);
  }, life.ms);
}

/** Kleine Meldung kurz ausblenden, dann weg (verdrängt im Band oder unter einer neuen großen Meldung) */
function fade(o: HTMLElement): void {
  o.classList.add('out');
  setTimeout(() => o.remove(), 320);
}

/** Grund und Automatisches, die gerade im Band stehen (verdrängtes Automatisches wartet darauf) */
const urgentLive = (): number => bandPills().filter((o) => rankOf(o) > 0).length;

/**
 * Verdrängtes Automatisches nicht verwerfen, sondern parken: Es kommt mit voller Dauer, sobald kein Grund und nichts
 * anderes Automatisches mehr im Band steht (CLAUDE.md: Was automatisch passiert, wird gemeldet).
 */
function park(el: HTMLElement): void {
  const own = LIFE.get(el);
  clearTimeout(own?.t);
  el.remove();
  el.dataset.parked ??= String(Date.now());
  WAIT.push({
    el,
    mode: el.dataset.mode === 'center' ? 'center' : 'cap',
    life: own?.life ?? { ms: 1800, fade: false },
    at: Number(el.dataset.parked),
    kind: 'room',
  });
}

/**
 * Wartende Meldungen zeigen, sobald die große Meldung im Band vorbei ist (oder das Band nicht mehr gilt), geparktes
 * Automatisches, sobald im Band Platz ist.
 */
function flushWait(): void {
  if (!WAIT.length) return;
  const band = !!bandNow();
  const big = bigInBand();
  const now = Date.now();
  for (const w of WAIT.splice(0)) {
    if (now - w.at > WAIT_MAX || !atTable()) continue;
    const waits =
      w.kind === 'room'
        ? parkedWaits({ band, urgentLive: band ? urgentLive() : 0 })
        : waitsForBig({ band, bigLive: big, urgent: false });
    if (waits) WAIT.push(w);
    else showMessage(w.el, w.mode, w.life);
  }
}

/**
 * Setzt eine Meldung aus placeMessage an ihren Platz (`fresh`: sie erscheint gerade). Auch nach dem Zeichnen über
 * realignFeedback.
 */
function positionMessage(el: HTMLElement, mode: Mode, fresh = false): void {
  const band = bandNow();
  el.classList.toggle('band', !!band);
  if (band) {
    el.style.left = `${Math.round(band.left + band.width / 2)}px`;
    el.style.setProperty('--bw', `${Math.round(band.width - 8)}px`);
    if (onStage(el)) {
      el.style.removeProperty('min-width');
      const pills = bandPills().map(restBox);
      let h = el.offsetHeight;
      let top = stageTop(band.g, h, stageRoom(band.g, pills, h, keepBox()), pills);
      // Deckt sie Zeilen der Statuszeile, dann mindestens so breit wie diese, sonst ragen links und rechts Reste hervor
      const wide = coverWidth(band.left + band.width / 2, statusText(), top, h);
      if (wide > el.offsetWidth) {
        el.style.minWidth = `${Math.round(Math.min(wide, band.width - 8))}px`;
        h = el.offsetHeight;
        top = stageTop(band.g, h, stageRoom(band.g, pills, h, keepBox()), pills);
      }
      el.style.top = `${Math.round(top)}px`;
      return;
    }
    // Lange Hinweise (Namen mit 16 Zeichen) etwas kleiner, wenn sie dadurch in eine Zeile passen
    el.classList.remove('slim');
    const line = parseFloat(getComputedStyle(el).lineHeight) || 15;
    if (el.clientHeight > line * 1.5) {
      el.classList.add('slim');
      if (el.clientHeight > line * 1.5) el.classList.remove('slim');
    }
    // Alle kleinen Meldungen im Band zusammen setzen: Ein neuer Grund rückt nach unten, die anderen weichen
    const all = [...bandPills(el), el];
    const stack = pillStack(
      band.g,
      all.map((o) => ({ h: o.offsetHeight, prio: rankOf(o) })),
    );
    all.forEach((o, i) => {
      const top = stack.tops[i];
      if (top !== null) o.style.top = `${top}px`;
    });
    for (const i of stack.evict) {
      const old = all[i];
      // Automatisches wartet und kommt später, Hinweise blenden aus
      if (rankOf(old) === 1) {
        park(old);
        continue;
      }
      fade(old);
    }
    // Die große Meldung im Band weicht der neuen kleinen und lässt dafür eher ihren Spruch weg. Bliebe nicht einmal
    // ihr ganzer Titel oder schnitte sie eine Zeile der Statuszeile halb an, schließt sie, wenn gerade ein Grund oder
    // Automatisches kommt (nie die Zeremonie)
    const ann = $opt('#announce.band');
    if (ann?.querySelector('.ann:not(.out)') && !placeStage(ann, band) && fresh && rankOf(el) > 0 && !ANN.cur?.cls)
      skipAnnouncement();
    return;
  }
  const area = fieldRect() ?? fieldRect(0);
  if (!area) return;
  el.style.removeProperty('--bw');
  el.style.removeProperty('min-width');
  el.style.left = `${Math.round(area.left + area.width / 2)}px`;
  const h = el.offsetHeight;
  const cap = shown('#center .cap');
  const opps = oppsBottom() ?? area.top;
  let top = mode === 'cap' && cap ? Math.max(opps, cap.bottom - h) : area.top + Math.max(0, (area.height - h) / 2);
  const taken = [...document.querySelectorAll<HTMLElement>('#fly .mid')]
    .filter((o) => o !== el && !o.classList.contains('out') && o.style.top !== '-999px')
    .map(restBox)
    .sort((p, q) => p.top - q.top);
  for (const o of taken) if (top < o.bottom + 4 && top + h > o.top - 4) top = o.bottom + 4;
  // Ist das Reaktionsfenster offen, rückt die Meldung darüber
  const limit = emotesTop() - 6;
  if (top + h > limit) top = Math.max(opps, limit - h);
  el.style.top = `${Math.round(top)}px`;
}

/** Inline-Maße einer festen Ebene, um die Lage vor und nach dem Zeichnen zu vergleichen. */
const boxOfStyle = (el: HTMLElement): Box => ({
  left: parseFloat(el.style.left) || 0,
  top: parseFloat(el.style.top) || 0,
  width: parseFloat(el.style.width) || 0,
  height: parseFloat(el.style.height) || 0,
});

/**
 * Passt eine große Meldung nicht ins Band, fallen ganze Teile weg (STAGE_DROP: erst der Spruch, dann die
 * Unterzeile, zuletzt die zweite Titelzeile), statt mitten in einer Zeile abgeschnitten zu werden. Gibt die Höhe
 * der gewählten Fassung zurück.
 */
function fitAnn(a: HTMLElement, avail: number): number {
  const drops = STAGE_DROP.filter(Boolean);
  a.classList.remove(...drops);
  const heights: number[] = [];
  for (const c of STAGE_DROP) {
    if (c) a.classList.add(c);
    heights.push(a.offsetHeight);
    if (heights[heights.length - 1] <= avail) break;
  }
  const i = firstFit(heights, avail);
  a.classList.remove(...STAGE_DROP.slice(i + 1).filter(Boolean));
  return heights[i];
}

/**
 * Große Meldung im Band: so breit wie der eigene Platz, Lage nach stageTop, nie über den Stapel hinaus. Gibt zurück,
 * ob sie sauber steht: ganzer Titel (nicht `d-t2`), passt in ihren Platz, liegt unter keiner kleinen Meldung und
 * schneidet keine Zeile der Statuszeile halb an (cutsStatus).
 */
function placeStage(el: HTMLElement, band: { g: BandGeo; left: number; width: number }): boolean {
  const { g } = band;
  const prev = boxOfStyle(el);
  Object.assign(el.style, {
    left: `${Math.round(band.left)}px`,
    width: `${Math.round(band.width)}px`,
    right: 'auto',
    bottom: 'auto',
    height: 'auto',
  });
  const anns = [...el.querySelectorAll<HTMLElement>('.ann:not(.out)')];
  const pills = bandPills().map(restBox);
  // Erst die volle Höhe, dann der Platz neben den kleinen Meldungen, dann was davon hineinpasst
  const lay = () => {
    let full = 0;
    for (const a of anns) {
      a.classList.remove(...STAGE_DROP.filter(Boolean));
      full = Math.max(full, a.offsetHeight);
    }
    const room = stageRoom(g, pills, full, keepBox());
    const avail = Math.max(0, room.bottom - room.top);
    let h = 0;
    for (const a of anns) h = Math.max(h, fitAnn(a, avail));
    return { room, avail, h, top: stageTop(g, h, room, pills) };
  };
  for (const a of anns) a.style.removeProperty('min-width');
  let lo = lay();
  // Deckt sie Zeilen der Statuszeile, dann mindestens so breit wie deren Text, sonst ragen seitlich Reste hervor.
  // Breiter wird sie dabei nie höher, ein zweiter Durchgang reicht
  const wide = coverWidth(band.left + band.width / 2, statusText(), lo.top, lo.h);
  if (anns.some((a) => a.offsetWidth < wide)) {
    for (const a of anns) a.style.minWidth = `${Math.round(Math.min(wide, band.width - 8))}px`;
    lo = lay();
  }
  const { room, avail, h, top } = lo;
  const whole =
    h <= avail + 1 &&
    !anns.some((a) => a.classList.contains('d-t2')) &&
    !pills.some((p) => p.top < top + h - 1 && p.bottom > top + 1) &&
    !cutsStatus(g, top, h, pills);
  const next = { left: band.left, top, width: band.width, height: Math.min(h, room.bottom - top) };
  // Nur verschieben, wenn sich die Lage spürbar ändert, sonst flackert es bei jedem Zeichnen
  // Die alte Lage bleibt aber nur, wenn sie keine Zeile der Statuszeile anschneidet und die neue Meldung darunter
  // ganz Platz hat. Die Höhe kommt immer von der neuen Meldung, sonst schneidet die alte Ebene sie unten ab
  const keep =
    prev.top && !movedEnough(prev, next) && !cutsStatus(g, prev.top, h, pills) && prev.top + h <= room.bottom + 0.5;
  const box = keep ? { ...prev, height: h } : next;
  Object.assign(el.style, {
    left: `${Math.round(box.left)}px`,
    top: `${Math.round(box.top)}px`,
    width: `${Math.round(box.width)}px`,
    height: `${Math.round(box.height)}px`,
  });
  return whole;
}

/**
 * Legt die Ebene der großen Meldungen genau über die Spielfläche. Ist es dort eng, wird die Meldung kompakter.
 * Bin ich am Zug oder in der Tauschrunde (oder ist die Spielfläche zu klein), steht sie im Band (placeStage).
 * Wechselt die Lage, während eine Meldung steht, blendet sie sich nicht noch einmal ein (Klasse `still`). Eine neue
 * große Meldung in der Spielfläche blendet kleine aus, die sie schneidet (fadeUnder).
 */
function placeInField(el: HTMLElement | null): void {
  if (!el) return;
  ensureResize();
  const was = el.classList.contains('band') ? 'band' : el.classList.contains('field') ? 'field' : '';
  // Gerade erst eingehängt (annNext), noch nie gesetzt
  const fresh = [...el.querySelectorAll<HTMLElement>('.ann:not(.out)')].some((a) => !a.dataset.shown);
  const top0 = el.style.top;
  const band = bandNow();
  if (band) {
    const same = was === 'band';
    el.classList.add('band');
    el.classList.remove('field', 'tight');
    if (!same) el.style.top = '';
    placeStage(el, band);
  } else {
    for (const a of el.querySelectorAll<HTMLElement>('.ann')) a.style.removeProperty('min-width');
    const f = fieldRect() ?? (atTable() ? fieldRect(0) : null);
    const put = (r: Box | null): void => {
      const cls = { field: !!r, band: false, tight: !!r && r.height < 220 };
      const same = Object.entries(cls).every(([k, on]) => el.classList.contains(k) === on);
      for (const [k, on] of Object.entries(cls)) el.classList.toggle(k, on);
      if (!r) {
        ['left', 'top', 'width', 'height', 'right', 'bottom'].forEach((k) => el.style.removeProperty(k));
      } else if (!same || !el.style.top || movedEnough(boxOfStyle(el), r)) {
        Object.assign(el.style, {
          left: `${Math.round(r.left)}px`,
          top: `${Math.round(r.top)}px`,
          width: `${Math.round(r.width)}px`,
          height: `${Math.round(r.height)}px`,
          right: 'auto',
          bottom: 'auto',
        });
      }
    };
    put(f);
    // Reicht eine große Meldung in die Statuszeile hinein (Schnautz am PC, kurze Handys), rückt die Fläche über die
    // Statuszeile, solange dort Platz für eine kompakte bleibt. Sonst schaute unter ihr eine halbe Hauptzeile hervor
    const line = shown('#status .main');
    const above = f && line ? line.top - 6 - f.top : 0;
    const y0 = parseFloat(el.style.top) || 0;
    const anns = [...el.querySelectorAll<HTMLElement>('.ann:not(.out)')];
    const low = !!line && anns.some((a) => y0 + a.offsetTop + a.offsetHeight > line.top - 2);
    if (f && low && above > 0 && above < f.height) {
      put({ ...f, height: above });
      // Unter FIELD_BIG nur, wenn die kompakte Fassung dort ganz hineinpasst (gemessen)
      if (above < FIELD_BIG && anns.some((a) => a.offsetHeight > above)) put(f);
    }
    // Eine neue große Meldung hat Vorrang: Kleine an der Stapelkante, die sie schneidet, blenden aus. Sonst stünde
    // etwa „… wirft eine Bombe ein“ auf ihrem Zeichen, sobald sie über die Statuszeile rückt. Das gilt auch, wenn sie
    // erst beim nächsten Zeichnen dorthin rückt
    if (fresh || el.style.top !== top0) fadeUnder(el);
  }
  const now = el.classList.contains('band') ? 'band' : el.classList.contains('field') ? 'field' : '';
  for (const a of el.querySelectorAll<HTMLElement>('.ann')) {
    if (a.dataset.shown && was !== now) a.classList.add('still');
    a.dataset.shown = '1';
  }
}

/**
 * Kleine Meldungen in der Spielfläche (`cap`), die eine große Meldung in der Ebene `layer` schneidet, blenden aus
 * (src/ui/band.ts, yieldToBig). Beide aus der gesetzten Lage ohne Transform, denn beide springen gerade erst auf. Was
 * über die Ebene hinausragt, schneidet sie ab und zählt nicht.
 */
function fadeUnder(layer: HTMLElement): void {
  const box = layer.getBoundingClientRect();
  const bigs: Rect[] = [...layer.querySelectorAll<HTMLElement>('.ann:not(.out)')].map((a) => ({
    left: Math.max(box.left, box.left + a.offsetLeft),
    top: Math.max(box.top, box.top + a.offsetTop),
    right: Math.min(box.right, box.left + a.offsetLeft + a.offsetWidth),
    bottom: Math.min(box.bottom, box.top + a.offsetTop + a.offsetHeight),
  }));
  const pills = [...document.querySelectorAll<HTMLElement>('#fly .mid:not(.band):not(.out)')].filter(
    (o) => o.dataset.mode === 'cap' && o.style.top !== '-999px',
  );
  // Kleine Meldungen stehen mittig auf ihrer gesetzten Lage (translateX(-50%))
  const rects = pills.map((o): Rect => {
    const x = parseFloat(o.style.left) || 0;
    return { left: x - o.offsetWidth / 2, right: x + o.offsetWidth / 2, ...restBox(o) };
  });
  for (const i of yieldToBig(bigs, rects)) fade(pills[i]);
}

/** Größenwechsel richtet laufende Meldungen neu aus. Erst beim ersten Gebrauch angemeldet, nicht beim Laden. */
let resizeOn = false;
let resizeRaf = 0;
function ensureResize(): void {
  if (resizeOn || typeof window === 'undefined') return;
  resizeOn = true;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(realignFeedback);
  });
}

/** Große Meldung in der Tischmitte. `title` und `sub` sind HTML und müssen bereits escaped sein. */
export interface Announcement {
  icon?: string;
  tone?: '' | 'gold' | 'red' | 'wood' | 'sea' | 'brown';
  title: string;
  sub?: string;
  ms?: number;
  /** Zusätzliche Klasse, etwa für die Zeremonie */
  cls?: string;
  /** Satz für den Vorleser, reiner Text. Er kommt erst, wenn die Meldung erscheint, nie früher als der Bildschirm */
  say?: string;
  /** Wenn die Meldung erscheint und wenn sie endet (übersprungen oder abgelaufen) */
  onShow?: () => void;
  onEnd?: (skipped: boolean) => void;
}

export const ANN = {
  q: [] as Announcement[],
  busy: false,
  curEnd: 0,
  el: null as HTMLElement | null,
  t: undefined as Timer | undefined,
  /** Die Meldung, die gerade steht */
  cur: null as Announcement | null,
};

/** Laufende Meldung beenden und ihren Abschluss genau einmal melden. */
function endCur(skipped: boolean): void {
  const o = ANN.cur;
  ANN.cur = null;
  o?.onEnd?.(skipped);
}

export function resetAnnouncements(): void {
  ANN.q = [];
  clearTimeout(ANN.t);
  ANN.busy = false;
  ANN.curEnd = 0;
  ANN.el = null;
  WAIT.length = 0;
  endCur(true);
  $('#announce').innerHTML = '';
  resetSay(0);
}

/** Wartende Meldungen einer Art verwerfen, die laufende davon schließen. */
export function dropAnnouncements(cls: string): void {
  ANN.q = ANN.q.filter((o) => o.cls !== cls);
  if (ANN.cur?.cls === cls) skipAnnouncement();
}

export function announce(o: Announcement): void {
  ANN.q.push(o);
  if (!ANN.busy) annNext();
}

/** Wie lange laufen die Meldungen noch (aktuelle plus Warteschlange)? */
export function annLeft(): number {
  return ANN.q.reduce((t, o) => t + ms(o.ms, 1700) + 260, Math.max(0, ANN.curEnd - Date.now()));
}

/** Ergebnisfenster erst zeigen, wenn alle Meldungen durch sind. */
export function holdForAnnouncements(extra = 250): void {
  App.holdUntil = Math.max(App.holdUntil, Date.now() + annLeft() + extra);
}

function annNext(): void {
  const o = ANN.q.shift();
  if (!o) {
    ANN.busy = false;
    ANN.curEnd = 0;
    ANN.el = null;
    // Was im Band auf das Ende gewartet hat, kommt jetzt
    flushWait();
    return;
  }
  ANN.busy = true;
  ANN.curEnd = Date.now() + ms(o.ms, 1700) + 240;
  const el = document.createElement('div');
  el.className = `ann ${o.tone ?? ''} ${o.cls ?? ''}`.trim();
  el.innerHTML =
    (o.icon ? `<div class="ann-ic">${o.icon}</div>` : '') +
    `<div class="ann-t">${o.title}</div>` +
    (o.sub ? `<div class="ann-s">${o.sub}</div>` : '');
  el.title = skipHint();
  el.addEventListener('click', skipAnnouncement);
  // Erst einhängen, dann setzen: Im Band hängt die Lage von der Höhe der Meldung ab
  $('#announce').appendChild(el);
  placeInField($('#announce'));
  ANN.el = el;
  ANN.cur = o;
  ANN.t = setTimeout(() => annClose(false), ms(o.ms, 1700));
  if (o.cls !== 'zer') sfxCalm('msg', 500);
  o.onShow?.();
  // Nach onShow: Die Zeremonie gibt dort erst den Verlierer frei (App.zerHide)
  if (o.say) say(o.say, 'big');
}

function annClose(skipped = false): void {
  const el = ANN.el;
  if (!el) return;
  ANN.el = null;
  endCur(skipped);
  el.classList.add('out');
  setTimeout(() => {
    el.remove();
    annNext();
  }, 240);
}

/** Laufende Meldung überspringen (Antippen, Klicken, Esc). */
export function skipAnnouncement(): void {
  clearTimeout(ANN.t);
  ANN.curEnd = Date.now();
  annClose(true);
  if (App.holdUntil > Date.now()) {
    App.holdUntil = Date.now() + annLeft() + 300;
    if (App.holdT) clearTimeout(App.holdT);
    App.holdT = setTimeout(render, App.holdUntil - Date.now() + 30);
  }
}

/** Hält das Ergebnisfenster zurück, solange noch Animationen oder Meldungen laufen. */
export function holdOverlay(): boolean {
  const left = App.holdUntil - Date.now();
  if (left <= 0) return false;
  $('#overlay').innerHTML = '';
  if (App.holdT) clearTimeout(App.holdT);
  App.holdT = setTimeout(() => {
    App.holdT = null;
    render();
  }, left + 30);
  return true;
}

/** Bereich eines Spielers am Tisch (eigener Platz oder Gegner). */
export const panelFor = (pid: string | null | undefined): HTMLElement | null =>
  pid === App.me ? $opt('#me') : $opt(`.opp[data-pid="${pid}"]`);

export function shakeEl(el: HTMLElement): void {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

export function shakePanel(pid: string | undefined): void {
  const el = panelFor(pid);
  if (el) shakeEl(el);
}

function addTemp(parent: HTMLElement, tag: string, cls: string, text: string, life: number): HTMLElement {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = text;
  parent.appendChild(el);
  setTimeout(() => el.remove(), life);
  return el;
}

/**
 * Sprechblase an einem Platz. Sie liegt in der festen Effekt-Ebene, damit der Tischrand sie nicht abschneidet
 * und das nächste Rendern sie nicht löscht. Gegner sitzen oben, ihre Blase hängt deshalb unter dem Platz.
 */
export function chatBubble(pid: string | undefined, text: string): void {
  const el = panelFor(pid);
  if (!el || !pid) return;
  for (const old of document.querySelectorAll<HTMLElement>('#fly .bubble')) if (old.dataset.pid === pid) old.remove();
  const r = el.getBoundingClientRect();
  const below = el.classList.contains('opp');
  const b = document.createElement('div');
  b.className = below ? 'bubble down' : 'bubble';
  b.dataset.pid = pid;
  b.textContent = text;
  $('#fly').appendChild(b);
  say(SAY_TEXT.chat(App.view?.players.find((p) => p.id === pid)?.name ?? '', text), 'info');
  // Seitlich im Bild halten, der Zipfel zeigt trotzdem auf den Platz
  const cx = r.left + r.width / 2;
  const half = b.offsetWidth / 2;
  const x = Math.min(Math.max(cx, 8 + half), innerWidth - 8 - half);
  // Reden mehrere gleichzeitig, rückt die neue Blase unter (oder über) die schon sichtbaren
  const w = b.offsetWidth;
  const h = b.offsetHeight;
  let top = below ? r.bottom + 8 : r.top - 8;
  let stacked = false;
  const others = [...document.querySelectorAll<HTMLElement>('#fly .bubble:not(.out)')].filter((o) => o !== b);
  for (let k = 0; k < others.length; k++) {
    let moved = false;
    for (const o of others) {
      const q = o.getBoundingClientRect();
      const y0 = below ? top : top - h;
      if (x - half < q.right + 4 && x - half + w > q.left - 4 && y0 < q.bottom + 4 && y0 + h > q.top - 4) {
        top = below ? q.bottom + 6 : q.top - 6;
        moved = stacked = true;
      }
    }
    if (!moved) break;
  }
  if (stacked) b.classList.add('stacked');
  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(top)}px`;
  b.style.setProperty('--ax', `${Math.round(cx - x)}px`);
  setTimeout(() => {
    b.classList.add('out');
    setTimeout(() => b.remove(), 300);
  }, 2800);
}

/** Name vor dem Satz wie am Tisch üblich: „Lena nimmt 5 Karten“, für einen selbst „Du nimmst 5 Karten“. */
function labelText(pid: string | undefined, text: string, mineText?: string): string {
  const me = !!pid && pid === App.me;
  const name = !pid ? '' : me ? 'Du' : (App.view?.players.find((p) => p.id === pid)?.name ?? '');
  return `${name} ${me && mineText ? mineText : text}`.trim();
}

/**
 * Kurzer Hinweis, wer gerade was getan hat ("Heinzi nimmt 5 Karten"). Er erscheint in der Spielfläche,
 * damit er keinen Gegner verdeckt, bin ich am Zug im Band unter der Statuszeile. Mehrere stehen untereinander.
 * `mineText` ist die Form für einen selbst ("Du nimmst 5 Karten"). Still, den Ton entscheidet `emit`.
 * `urgent` (Automatisches) wartet nicht auf eine große Meldung im Band und liegt über ihr.
 */
export function floatLabel(pid: string | undefined, text: string, mineText?: string, urgent = false): void {
  const f = document.createElement('div');
  f.className = 'fieldlbl';
  f.textContent = labelText(pid, text, mineText);
  if (placeMessage(f, 'cap', { ms: 1800, fade: false }, urgent)) return;
  // Ohne Spielfläche direkt am Platz, für einen selbst in der Du-Form
  const el = panelFor(pid);
  if (el) addTemp(el, 'span', 'floatlbl', panelText(!!pid && pid === App.me, text, mineText), 1600);
}

/**
 * Gründe früherer Ablehnungen ausblenden (src/ui/band.ts: ein Grund weicht sonst nie). Ein ganz frischer Grund bleibt,
 * er kann zu einem Tipp während des Ablaufs gehören, der gerade erst abgelehnt wurde.
 */
function dropReasons(): void {
  const now = Date.now();
  for (const o of document.querySelectorAll<HTMLElement>('#fly .nopelbl:not(.out)')) {
    if (now - Number(o.dataset.at ?? 0) < 500) continue;
    o.classList.add('out');
    setTimeout(() => {
      o.remove();
      // Geparktes Automatisches hat jetzt Platz
      flushWait();
    }, 320);
  }
}

/** Eine Meldung dieser Art ersetzt die vorige, auch eine, die noch wartet. */
function dropLabel(cls: string): void {
  document.querySelector(`#fly .${cls}`)?.remove();
  for (let i = WAIT.length - 1; i >= 0; i--) if (WAIT[i].el.classList.contains(cls)) WAIT.splice(i, 1);
}

/** Einblendung über einem Element, die nicht beim nächsten Rendern verschwindet. Still, den Ton entscheidet `emit`. */
export function fixedLabel(cls: string, text: string, anchor: Element | null, duration = 2400, dy = 10): void {
  if (!anchor || !text) return;
  dropLabel(cls);
  const f = document.createElement('div');
  f.className = cls;
  f.textContent = text;
  f.dataset.at = String(Date.now());
  // Sprüche und Hinweise stehen in der Spielfläche oder im Band wie die anderen Meldungen, nie über Gegnern.
  // Der Grund einer Ablehnung kommt sofort und liegt oben
  if (placeMessage(f, cls === 'tauntlbl' ? 'center' : 'cap', { ms: duration, fade: true }, cls === 'nopelbl')) return;
  const r = anchor.getBoundingClientRect();
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top - dy}px`;
  $('#fly').appendChild(f);
  setTimeout(() => {
    f.classList.add('out');
    setTimeout(() => f.remove(), 320);
  }, duration);
}

export const tauntLabel = (text: string, duration = 2800): void =>
  fixedLabel('tauntlbl', text, $opt('#center') ?? $opt('#me'), duration, 12);

/**
 * Hinweis und Spruch als eine Meldung (im Band): oben fett, wer was getan hat, darunter der Spruch. So kann keins von
 * beiden dem anderen weichen.
 */
function comboLabel(hint: string, taunt: string, duration = 2800): void {
  dropLabel('tauntlbl');
  const f = document.createElement('div');
  f.className = 'tauntlbl combo';
  const a = document.createElement('b');
  a.className = 'hint';
  a.textContent = hint;
  const b = document.createElement('span');
  b.className = 'tt';
  b.textContent = taunt;
  f.append(a, b);
  placeMessage(f, 'center', { ms: duration, fade: true });
}

export function boomFx(ch: string, el: Element | null): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'fxboom';
  f.textContent = ch;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height / 2}px`;
  $('#fly').appendChild(f);
  setTimeout(() => f.remove(), 1100);
}

/**
 * Eine Rückmeldung für `emit`. `text` ist der Satz für andere ohne Namen („nimmt 7 Karten“), der Name kommt davor.
 * Ohne `pid` steht `text` allein. Große Meldungen brauchen ihn auch, wird eine davon zu mittel, steht er klein da.
 */
export interface Msg {
  pid?: string;
  text: string;
  /** Form für einen selbst („nimmst 7 Karten“) */
  mine?: string;
  /** Nur groß */
  icon?: string;
  tone?: Announcement['tone'];
  /** Nur groß, HTML und bereits maskiert. Ohne Titel steht der Satz da */
  title?: string;
  /** Nur groß, HTML und bereits maskiert */
  sub?: string;
  ms?: number;
  /** Spruch dazu, wenn die Stufe einen vorsieht (`cue.taunt`). Groß steht er in der Meldung, sonst daneben */
  taunt?: string;
  /** Klang des Ereignisses. Er ersetzt bei klein und mittel den leisen Meldeton */
  sfx?: SoundName;
  /** Nur groß: Ergebnisfenster zurückhalten, bis die Meldungen durch sind (Zusatz in ms) */
  hold?: number;
  /** Kleine und mittlere Meldungen erscheinen nach dem Zeichnen (Standard 60 ms) */
  delay?: number;
  /** Klein und mittel als Toast statt am Tisch, etwa solange das Ergebnisblatt offen ist */
  toast?: boolean;
}

/** Merkt sich, ob in diesem Schub schon ein großer Moment lief und ob Kürzen erlaubt ist. */
let BATCH: BatchState = newBatch();

/**
 * Neuer Schub von Logeinträgen (effects und der Shithead-Ablauf rufen das vorne auf): Der große Moment ist wieder
 * frei. Steht ein Ende im Schub, wird nichts gekürzt (feedback-rules.ts).
 */
export function beginBatch(fresh: readonly LogEntry[] = []): void {
  BATCH = newBatch(fresh);
  sayBatch(fresh.reduce((mx, e) => Math.max(mx, e.n), 0));
}

/** Der Shithead-Ablauf hat sein Großes (Verbrennen, Bombe) schon gezeigt: Es zählt für den Zug mit. */
export function noteBig(): void {
  BATCH.big = true;
}

/**
 * Zeigt eine Rückmeldung in ihrer Stufe. Groß ist `announce`, mittel und klein sind Hinweise in der Spielfläche.
 * Ein zweites großes Ereignis im selben Schub, das kein Takt ist, wird mittel. Den Ton entscheidet die Stufe:
 * klein still (außer `cue.sound` oder eigener Klang), mittel mit Klang, groß mit Meldeton.
 */
export function emit(cue: Cue | null, m: Msg): void {
  if (!cue) return;
  // Etwas Eigenes ist passiert (ein Zug hat geklappt, die Uhr hat für mich gezogen): Der Grund einer früheren
  // Ablehnung ist erledigt und macht im Band Platz
  if (m.pid && m.pid === App.me) dropReasons();
  const level = levelInBatch(cue, BATCH);
  const tone = toneOf(cue, level, m.sfx);
  if (tone.sfx) sfx(tone.sfx);
  else if (tone.calm) sfxCalm('msg', 500, 0.7);
  const taunt = cue.taunt && m.taunt ? m.taunt : '';
  if (level === 'big') {
    const sub = (m.sub ?? '') + (taunt ? `<span class="tt">${esc(taunt)}</span>` : '');
    const title = m.title ?? esc(labelText(m.pid, m.text, m.mine));
    // Der Vorleser sagt Große zuerst und Eigenes, sonst nur der Bildschirm. Große erst, wenn sie erscheinen (annNext)
    announce({
      icon: m.icon,
      tone: m.tone,
      title,
      sub: sub || undefined,
      ms: m.ms,
      say: sentences(plain(title), plain(m.sub ?? '')),
    });
    if (m.hold !== undefined) holdForAnnouncements(m.hold);
    return;
  }
  if (m.pid && m.pid === App.me) say(labelText(m.pid, m.text, m.mine), 'mine');
  setTimeout(() => smallMsg(m, taunt, !!cue.sound), m.delay ?? 60);
}

/**
 * Mittel und klein: der Hinweis, im Band mit dem Spruch als eine Meldung, in der Spielfläche der Spruch mittig
 * daneben. Automatisches (`urgent`) wartet nicht auf eine große Meldung im Band.
 */
function smallMsg(m: Msg, taunt: string, urgent: boolean): void {
  if (m.toast) {
    toast(labelText(m.pid, m.text, m.mine));
    return;
  }
  if (taunt && bandNow()) {
    comboLabel(labelText(m.pid, m.text, m.mine), taunt);
    return;
  }
  floatLabel(m.pid, m.text, m.mine, urgent);
  if (taunt) tauntLabel(taunt);
}

/**
 * Laufende Ansagen und Hinweise nach dem Zeichnen neu an die Spielfläche setzen, so wie `markClocks` die Uhren
 * nachzieht. Läuft am Ende von `render()` und bei Größenwechsel. Verschoben wird nur, was sich um mehr als ein
 * paar Pixel bewegt hat oder zwischen Band und Spielfläche wechselt.
 */
export function realignFeedback(): void {
  const ann = $opt('#announce');
  if (ann?.firstElementChild) placeInField(ann);
  flushWait();
  const live = [...document.querySelectorAll<HTMLElement>('#fly .mid:not(.out)')].filter(
    (el) => el.dataset.mode === 'cap' || el.dataset.mode === 'center',
  );
  if (!live.length) return;
  const was = live.map((el) => ({ box: boxOfStyle(el), band: el.classList.contains('band') }));
  // Der Reihe nach neu setzen, älteste zuerst, damit die Stapel dieselbe Ordnung behalten
  for (const el of live) el.style.top = '-999px';
  // Die Bühne bleibt nur dort, wo sie keine Zeile der Statuszeile anschneidet (was kleine Meldungen decken, zählt mit)
  const band = bandNow();
  const cuts = (el: HTMLElement, top: number): boolean =>
    !!band && onStage(el) && cutsStatus(band.g, top, el.offsetHeight, bandPills(el).map(restBox));
  live.forEach((el, i) => {
    positionMessage(el, el.dataset.mode as 'cap' | 'center');
    const now = boxOfStyle(el);
    const old = was[i];
    if (old.band === el.classList.contains('band') && !movedEnough(old.box, now) && !cuts(el, old.box.top)) {
      el.style.left = `${old.box.left}px`;
      el.style.top = `${old.box.top}px`;
    }
  });
}

/** Zuletzt angetippte Karten oder Knöpfe je Aktion, damit eine Ablehnung das Richtige wackeln lässt. */
const TAP = { act: '', sel: [] as string[], at: 0 };

/** Merkt sich, was zur Aktion gehört (Selektoren, weil das nächste Zeichnen die Elemente ersetzt). */
export function noteTap(act: string, sel: readonly string[]): void {
  TAP.act = act;
  TAP.sel = [...sel];
  TAP.at = Date.now();
}

/** Aktionen am Tisch: Ablehnungen dazu erscheinen am Stapel, alles andere als Toast. */
const TABLE_ACT = /^(sh(?!bet)|dk|cb)[a-z]*$|^(swap|swapAll|pass|knock|keep|take|skip)$/;

/** Ablehnungen, die nie an den Tisch gehören: Plätze und Netz. */
const isSeatOrNet = (r: Reject): boolean => /^(seat|net)\./.test(r.e);

/** Was soll wackeln? Erst die gemerkten Karten, sonst der Knopf zur Aktion, sonst der eigene Platz. */
function rejectTargets(act: string | null): HTMLElement[] {
  if (act && TAP.act === act && Date.now() - TAP.at < 8000) {
    const els = TAP.sel.map((q) => $opt(q)).filter((x): x is HTMLElement => !!x);
    if (els.length) return els;
  }
  const btn = act ? $opt(`#me [data-act="${act}"], #status [data-act="${act}"], #center [data-act="${act}"]`) : null;
  if (btn) return [btn];
  const me = $opt('#me');
  return me ? [me] : [];
}

/**
 * Grund am Tisch: Lehnt der Gastgeber einen Zug ab, wackelt die angetippte Karte und der Grund steht klein am
 * Stapel. Lobby, Plätze, Netz und alles in Fenstern bleiben Toasts. `act` ist der Typ der abgelehnten Aktion.
 */
export function showReject(r: Reject, act?: string | null, fallback?: string): void {
  // Gehört die Ablehnung zum abgelegten Geist (Ziehen), fliegt er gleich zurück, statt 2,5 Sekunden zu warten
  dragCancel('reject', act);
  const text = rejectText(r, ctxOfView(App.view), fallback);
  if (!text) return;
  const v = App.view;
  const atTable =
    !!v &&
    v.phase !== 'lobby' &&
    document.body.classList.contains('ingame') &&
    !!act &&
    TABLE_ACT.test(act) &&
    !isSeatOrNet(r) &&
    !$opt('#overlay .modal') &&
    !$opt('#modal .paper') &&
    !!$opt('#center');
  if (!atTable) {
    toast(text);
    return;
  }
  for (const el of rejectTargets(act ?? null)) shakeEl(el);
  // Toasts liest der Vorleser schon über #toasts, der Grund am Stapel kommt hierüber
  say(text, 'mine');
  sfxCalm('nope', 400, 0.6);
  fixedLabel('nopelbl', text, $opt('#center .pile') ?? $opt('#center'), 2600, 14);
}

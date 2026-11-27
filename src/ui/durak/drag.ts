/*
 * Durak ziehen (ziehen.md 4.2), lädt mit dem Motor nach (src/ui/table/drag-motor.ts). Quelle ist eine Handkarte, bei
 * Auswahl alle gewählten. Ziele sind die Tischfläche, offene Angriffe und das Schiebefeld, die Regeln stehen rein in
 * src/game/drop/durak.ts. Das Schiebefeld gibt es nur während eines Ziehens, für das Weiterschieben geht: absolut in
 * .dktable rechts neben dem letzten Angriff, sonst über der Zeile .cnt, damit sich keine Höhe ändert.
 */
import { dkNextTarget } from '../../game/durak';
import type { DropKey } from '../../game/drop';
import { App } from '../app';
import { $opt, esc } from '../dom';
import { nameOf } from '../helpers';
import { dragLanded, type DragAdapter } from '../table/drag';
import { unlockAudio } from '../sound';
import { send } from './input';

const FIELD = 'dkxfer';
/**
 * Aussehen inline statt in durak.css, damit es mit dem Motor nachlädt. Seeblau wie Schieben, beide Looks über Tokens.
 * Maße in --u wie der Tisch am Handy (src/styles/fit.css), am PC gilt 6px (dort ist --u nicht gesetzt).
 */
const U = 'var(--u, 6px)';
const LOOK =
  'position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
  `padding:calc(${U} * 0.7);border:2px dashed var(--tb-sea);border-radius:calc(${U} * 1.7);text-align:center;` +
  'overflow-wrap:anywhere;background:color-mix(in srgb,var(--tb-sea) 14%,transparent);color:var(--tb-sea);' +
  `font:700 clamp(12px, calc(${U} * 2.2), 13px)/1.15 var(--ui);`;
/** Leiste über der Zeile .cnt, wenn rechts kein Platz ist, mindestens 24 px hoch (WCAG 2.5.8) */
const LOW = `left:0;right:0;bottom:calc(${U} * -5.3);height:max(24px, calc(${U} * 6.3));`;
/** Abstand zum letzten Angriff wie die Lücke zwischen den Paaren */
const GAP = `${U} * 1.7`;
const handCard = (i: number): HTMLElement | null => $opt<HTMLElement>(`#me .dkhand [data-drag="hand"][data-i="${i}"]`);

/** Schiebefeld anlegen oder das schon angelegte holen. Maße in Layout-Pixeln, damit fitDesktop nicht stört. */
function transferField(): HTMLElement | null {
  const box = $opt<HTMLElement>('#center .dktable');
  const v = App.view;
  if (!box || !v) return null;
  const old = box.querySelector<HTMLElement>(`.${FIELD}`);
  if (old) return old;
  const pairs = box.querySelectorAll<HTMLElement>('.dkpair');
  const last = pairs[pairs.length - 1];
  if (!last) return null;
  const el = document.createElement('div');
  el.className = FIELD;
  el.dataset.drop = 'transfer';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span>→ ${esc(nameOf(v, dkNextTarget(v, App.me)))}</span>`;
  const w = last.offsetWidth;
  const right = last.offsetLeft + w;
  el.style.cssText = `${LOOK}left:calc(${right}px + ${GAP});top:${last.offsetTop}px;width:${w}px;height:${last.offsetHeight}px;`;
  box.appendChild(el);
  // Passt es rechts nicht mehr in die Tischmitte, liegt es als Leiste über der Zeile darunter
  const room = $opt('#center')?.getBoundingClientRect().right ?? Infinity;
  if (el.getBoundingClientRect().right > room - 4) el.style.cssText = LOOK + LOW;
  return el;
}

export const adapter: DragAdapter = {
  source(el, v) {
    const hand = v.dk?.P[v.me];
    const i = Number(el.dataset.i);
    if (el.dataset.drag !== 'hand' || !Array.isArray(hand) || !hand[i]) return null;
    // Gewählte Karte nimmt alle gewählten mit, eine andere nur sich selbst, die Auswahl bleibt
    const idx = App.ds.idx.includes(i) ? App.ds.idx.filter((j) => hand[j]) : [i];
    const els = idx.flatMap((j) => handCard(j) ?? []);
    return els.length === idx.length ? { key: { g: 'durak', cards: idx.map((j) => hand[j]) }, els } : null;
  },
  zone(dst: DropKey) {
    switch (dst.z) {
      case 'table':
        return $opt<HTMLElement>('#center .dktable');
      case 'pair':
        return $opt<HTMLElement>(`#center .dkpair[data-i="${dst.i}"]`);
      case 'transfer':
        return transferField();
      default:
        return null;
    }
  },
  commit(_v, a) {
    // Derselbe Weg wie Tippen und Knöpfe, die Karten fliegen von der Abwurfstelle weiter
    const from = dragLanded()?.rects;
    unlockAudio();
    if (a.type === 'dkdefend') send(a, [a.i], [`#center .dkpair[data-i="${a.a}"]`], from);
    else if (a.type === 'dkattack' || a.type === 'dktransfer') send(a, a.idx, [], from);
  },
  end() {
    for (const el of document.querySelectorAll(`#table .${FIELD}`)) el.remove();
  },
};

/*
 * Shithead ziehen, Adapter für den Motor (src/ui/table/drag-motor.ts, lädt mit ihm nach). Quellen sind die eigenen
 * Hand-, offenen und verdeckten Tischkarten mit data-drag, eine gewählte Karte nimmt alle gewählten mit, eine
 * ungewählte mit dem Schalter „Gleiche Karten mitziehen“ alle gleichen Werts. Ziele sind der
 * Stapel und in der Tauschrunde die Karten der anderen Reihe. Abgeschickt wird wie beim Tippen in src/ui/events.ts.
 */
import type { DropKey } from '../../game/drop';
import { shSameAs } from '../../game/drop/shithead';
import type { Action, View } from '../../game/types';
import { doAct } from '../../net/dispatch';
import { App } from '../app';
import { noteTap } from '../feedback';
import { prefs } from '../prefs';
import { shMine } from '../render/shithead';
import { sfx } from '../sound';
import { dragLanded, type DragAdapter } from '../table/drag';

const ACT = { hand: 'shh', up: 'shu', down: 'shd' } as const;

const cardSel = (from: keyof typeof ACT, i: number): string => `#me [data-drag="${from}"][data-i="${i}"]`;

export const adapter: DragAdapter = {
  source(el: HTMLElement, v: View) {
    const from = el.dataset.drag;
    const i = Number(el.dataset.i);
    if (!el.closest('#me') || !Number.isInteger(i)) return null;
    if (from === 'down') return { key: { g: 'shithead', from, i }, els: [el] };
    if (from !== 'hand' && from !== 'up') return null;
    const arr = shMine(v)?.[from];
    if (!arr?.[i]) return null;
    // Gewählte Karte: alle gewählten (gleicher Wert), sonst nur sie, die Auswahl bleibt
    const ss = App.ss;
    const all = v.phase === 'play' && ss.src === from && ss.idx.includes(i) && ss.idx.every((k) => arr[k]);
    const idx = all ? ss.idx : v.phase === 'play' && prefs().dragSame ? shSameAs(arr, i) : [i];
    const els = idx.flatMap((k) => document.querySelector<HTMLElement>(cardSel(from, k)) ?? []);
    // Fehlt eine der gewählten im DOM, ist es kein Ziehen (wie bei den anderen Adaptern)
    return els.length === idx.length ? { key: { g: 'shithead', from, cards: idx.map((k) => arr[k]) }, els } : null;
  },

  zone(dst: DropKey) {
    if (dst.z === 'pile') return document.querySelector<HTMLElement>('#table [data-drop="pile"]');
    if (dst.z === 'up' || dst.z === 'hand')
      return document.querySelector<HTMLElement>(`#me [data-drop="${dst.z}"][data-i="${dst.i}"]`);
    return null;
  },

  commit(_v: View, a: Action) {
    sfx('card');
    if (a.type === 'shswap') {
      App.sw = { h: null, u: null };
      // Lehnt der Gastgeber ab, wackeln die beiden Karten wie beim Tippen
      noteTap(a.type, [`#me [data-act=shh][data-i="${a.h}"]`, `#me [data-act=shu][data-i="${a.u}"]`]);
    }
    if (a.type === 'shplay' || a.type === 'shblind') {
      const from = a.type === 'shblind' ? 'down' : a.from;
      const idx = a.type === 'shblind' ? [a.i] : a.idx;
      App.busy = true;
      // Die Flüge starten dort, wo der Finger die Karten losließ (srcRects in ./sequence.ts)
      const l = dragLanded();
      App.playRects = l ? { t: Date.now(), src: from, rects: l.rects } : null;
      noteTap(
        a.type,
        idx.map((k) => `#me [data-act="${ACT[from]}"][data-i="${k}"]`),
      );
      App.ss = { src: null, idx: [] };
    }
    doAct(a);
  },
};

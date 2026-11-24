/*
 * Durak bedienen: Karten antippen, Angriff wählen, Knöpfe. Angreifer wählen gleiche Werte und tippen Angreifen
 * oder Nachlegen. Wer verteidigt, tippt eine Karte und dann den Angriff, den sie schlagen soll. Ist nur ein
 * Angriff offen und schlägt die Karte ihn, reicht ein Tipp. Weiterschieben bleibt dann immer ein bewusster Knopf.
 */
import { rankOf } from '../../game/cards';
import { dkTransferError } from '../../game/durak';
import type { Action, View } from '../../game/types';
import { doAct } from '../../net/dispatch';
import { App } from '../app';
import { render } from '../render/index';
import { dkCanPass, dkMine, dkRole, dkSelected, dkTargets } from '../render/durak';
import { sfx, unlockAudio } from '../sound';

/** Merkt sich, wo die eigenen Karten lagen, damit sie von dort auf den Tisch fliegen. */
function grabRects(idx: number[]): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>('#me .dkhand .card'));
  const rects = idx.map((i) => els[i]?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
  if (rects.length) App.playRects = { t: Date.now(), src: 'hand', rects };
}

function send(a: Action, idx: number[]): void {
  grabRects(idx);
  App.ds = { idx: [], pair: null };
  sfx('card');
  doAct(a);
}

function redraw(): void {
  App.anim = {};
  render();
}

function defend(v: View, pair: number, i: number): void {
  send({ type: 'dkdefend', a: pair, i }, [i]);
  void v;
}

/** Handkarte angetippt. */
export function dkTapHand(i: number): void {
  const v = App.view;
  const hand = v ? dkMine(v) : null;
  if (!v || !hand || !hand[i]) return;
  unlockAudio();
  const role = dkRole(v);
  const cur = App.ds.idx;
  if (role === 'lead' || role === 'throw') {
    // Gleiche Werte lassen sich zusammen wählen, ein anderer Wert startet neu
    if (cur.includes(i)) App.ds.idx = cur.filter((x) => x !== i);
    else if (cur.length && rankOf(hand[cur[0]]) === rankOf(hand[i])) App.ds.idx = [...cur, i];
    else App.ds.idx = [i];
    redraw();
    return;
  }
  if (role !== 'defend') return;
  const c = hand[i];
  const targets = dkTargets(v, c);
  // Schon ein Angriff gewählt, den diese Karte schlägt: sofort schlagen
  if (App.ds.pair != null && targets.includes(App.ds.pair)) {
    defend(v, App.ds.pair, i);
    return;
  }
  // Nur ein Angriff offen und eindeutig: ein Tipp reicht, außer Weiterschieben wäre auch möglich
  const open = v.dk?.table.filter((p) => !p.d).length ?? 0;
  const canTransfer = !dkTransferError(v, App.me, [c]);
  if (open === 1 && targets.length === 1 && !canTransfer) {
    defend(v, targets[0], i);
    return;
  }
  // Sonst auswählen. Gleiche Werte zum Weiterschieben lassen sich sammeln
  if (cur.includes(i)) App.ds.idx = cur.filter((x) => x !== i);
  else if (canTransfer && cur.length && rankOf(hand[cur[0]]) === rankOf(c)) App.ds.idx = [...cur, i];
  else App.ds.idx = [i];
  App.ds.pair = null;
  redraw();
}

/** Angriff auf dem Tisch angetippt (nur wer verteidigt). */
export function dkTapTable(pair: number): void {
  const v = App.view;
  if (!v || dkRole(v) !== 'defend') return;
  unlockAudio();
  const sel = dkSelected(v);
  if (sel.idx.length === 1 && dkTargets(v, sel.cards[0]).includes(pair)) {
    defend(v, pair, sel.idx[0]);
    return;
  }
  App.ds.pair = App.ds.pair === pair ? null : pair;
  App.ds.idx = [];
  redraw();
}

/** Knöpfe am eigenen Platz. */
export function dkButton(kind: string): void {
  const v = App.view;
  if (!v) return;
  const sel = dkSelected(v);
  switch (kind) {
    case 'dkgo':
      if (sel.idx.length) send({ type: 'dkattack', idx: sel.idx }, sel.idx);
      return;
    case 'dkbeat': {
      if (sel.idx.length !== 1) return;
      const t = dkTargets(v, sel.cards[0]);
      const pair = App.ds.pair != null && t.includes(App.ds.pair) ? App.ds.pair : t.length === 1 ? t[0] : null;
      if (pair != null) defend(v, pair, sel.idx[0]);
      return;
    }
    case 'dktransfer':
      if (sel.idx.length) send({ type: 'dktransfer', idx: sel.idx }, sel.idx);
      return;
    case 'dktake':
      App.ds = { idx: [], pair: null };
      doAct({ type: 'dktake' });
      return;
    case 'dkpass':
      if (!dkCanPass(v)) return;
      App.ds = { idx: [], pair: null };
      doAct({ type: 'dkpass' });
      return;
  }
}

/** Nach einer neuen Ansicht: Auswahl verwerfen, wenn sich am Tisch etwas getan hat. */
export function dkSyncSelection(prev: View | null, v: View): void {
  if (v.game !== 'durak' || !prev || prev.last?.n !== v.last?.n || prev.dk?.bout !== v.dk?.bout) {
    App.ds = { idx: [], pair: null };
  }
}

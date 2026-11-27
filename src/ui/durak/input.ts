/*
 * Durak bedienen: Karten antippen, Angriff wählen, Knöpfe. Angreifer wählen gleiche Werte und tippen Angreifen
 * oder Nachlegen. Wer verteidigt, tippt eine Karte und dann den Angriff, den sie schlagen soll. Ist nur ein
 * Angriff offen und schlägt die Karte ihn, reicht ein Tipp. Weiterschieben bleibt dann immer ein bewusster Knopf.
 * Gesendet werden die gemeinten Karten mit, damit beim Gast nie eine andere Karte gespielt wird, falls sich die
 * Hand verschoben hat. Bis die neue Ansicht da ist, ist die Bedienung gesperrt (App.busy).
 */
import { rankOf } from '../../game/cards';
import { dkTransferError, dkWhyNot } from '../../game/durak';
import type { Action, Card, View } from '../../game/types';
import { doAct } from '../../net/dispatch';
import { App } from '../app';
import { noteTap, showReject } from '../feedback';
import { render } from '../render/index';
import { dkBeatPair, dkBtnState, dkMine, dkRole, dkSelected, dkTargets, type DkBtn } from '../render/durak';
import { sfx, unlockAudio } from '../sound';
import { barGuard } from '../table/bar';
import { grabRects } from '../table/hand';

function redraw(): void {
  App.anim = {};
  render();
}

const handSel = (i: number): string => `#me [data-act="dkh"][data-i="${i}"]`;

/**
 * Senden: Auswahl weg, Bedienung sperren, bis die Antwort da ist. Vorher merken, was zur Aktion gehört, damit bei
 * einer Ablehnung die gemeinten Karten wackeln (showReject). `extra` sind weitere Selektoren, etwa der Angriff.
 */
function send(a: Action, idx: number[] = [], extra: string[] = []): void {
  // Merkt sich, wo die eigenen Karten lagen, damit sie von dort auf den Tisch fliegen
  const els = idx.flatMap((i) => document.querySelector<HTMLElement>(handSel(i)) ?? []);
  if (els.length) grabRects(els, 'hand');
  const sel = [...idx.map(handSel), ...extra];
  if (sel.length) noteTap(a.type, sel);
  App.ds = { idx: [], pair: null };
  App.busy = true;
  if (a.type !== 'dkpass' && a.type !== 'dktake') sfx('card');
  doAct(a);
  // Beim Gast dauert die Antwort, die Auswahl soll trotzdem sofort verschwinden
  if (App.busy) redraw();
}

function defend(v: View, pair: number, i: number): void {
  const hand = dkMine(v) ?? [];
  const ac = v.dk?.table[pair]?.a;
  const c: Card | undefined = hand[i];
  send(
    { type: 'dkdefend', a: pair, i, ...(ac ? { ac } : {}), ...(c ? { c } : {}) },
    [i],
    [`#center .dkpair[data-i="${pair}"]`],
  );
}

/** Handkarte angetippt. */
export function dkTapHand(i: number): void {
  const v = App.view;
  const hand = v ? dkMine(v) : null;
  if (!v || !hand || !hand[i] || App.busy) return;
  unlockAudio();
  // Ausgegraute Karte: nicht auswählen, sondern sagen warum (dieselben Codes wie beim Host)
  const why = dkWhyNot(v, App.me, hand[i]);
  if (why) {
    noteTap('dkh', [handSel(i)]);
    showReject(why, 'dkh');
    return;
  }
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
  const more = cur.length ? [...cur, i].map((x) => hand[x]) : [];
  if (cur.includes(i)) App.ds.idx = cur.filter((x) => x !== i);
  else if (canTransfer && cur.length && rankOf(hand[cur[0]]) === rankOf(c) && !dkTransferError(v, App.me, more))
    App.ds.idx = [...cur, i];
  else App.ds.idx = [i];
  App.ds.pair = null;
  redraw();
}

/** Angriff auf dem Tisch angetippt (nur wer verteidigt). */
export function dkTapTable(pair: number): void {
  const v = App.view;
  if (!v || dkRole(v) !== 'defend' || App.busy) return;
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

/**
 * Knöpfe am eigenen Platz. Ein gesperrter Knopf (aria-disabled) nennt seinen Grund aus der Spiellogik (dkBtnState),
 * ohne einen Zug als Probe zu schicken. Ohne passenden Code bleibt der Tipp still.
 */
export function dkButton(kind: DkBtn): void {
  const v = App.view;
  // Hat sich die Knopfzeile gerade geändert, galt der Tipp vermutlich dem Knopf, der vorher dort stand
  if (!v || App.busy || barGuard(kind)) return;
  unlockAudio();
  const s = dkBtnState(v, kind);
  if (!s.ok) {
    if (s.why) {
      noteTap(kind, [`#me [data-act="${kind}"]`]);
      showReject(s.why, kind);
    }
    return;
  }
  const sel = dkSelected(v);
  switch (kind) {
    case 'dkgo':
      send({ type: 'dkattack', idx: sel.idx, cards: sel.cards }, sel.idx);
      return;
    case 'dkbeat': {
      const pair = dkBeatPair(v);
      if (pair != null) defend(v, pair, sel.idx[0]);
      return;
    }
    case 'dktransfer':
      send({ type: 'dktransfer', idx: sel.idx, cards: sel.cards }, sel.idx);
      return;
    case 'dktake':
      send({ type: 'dktake' });
      return;
    case 'dkpass':
      send({ type: 'dkpass' });
      return;
  }
}

/**
 * Nach einer neuen Ansicht: Die Auswahl bleibt, solange die eigene Hand und der Angriff gleich sind. Legt jemand
 * anderes nach, ändern sich weder Hand noch Tischplätze. Ein gewählter Angriff, der inzwischen geschlagen ist,
 * gilt nicht mehr.
 */
export function dkSyncSelection(prev: View | null, v: View): void {
  const same =
    v.game === 'durak' &&
    !!prev &&
    prev.dk?.bout === v.dk?.bout &&
    JSON.stringify(prev.dk?.P[App.me]) === JSON.stringify(v.dk?.P[App.me]);
  // Gepasst (auch durch die Uhr oder den Gastgeber): Nachlegen geht nicht, eine alte Auswahl bliebe sonst hängen
  if (!same || (v.dk?.table.length && v.dk.done.includes(App.me))) {
    App.ds = { idx: [], pair: null };
    return;
  }
  if (App.ds.pair != null && (!v.dk?.table[App.ds.pair] || v.dk.table[App.ds.pair].d)) App.ds.pair = null;
}

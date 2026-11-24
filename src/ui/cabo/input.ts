/*
 * Cabo bedienen: Zu Beginn zwei eigene Karten antippen, dann blitzen sie kurz auf. Am Zug Stapel oder Ablage
 * antippen (oder die Knöpfe), mit der gezogenen Karte eigene Karten wählen und tauschen oder ablegen. Fähigkeiten
 * gehen über Tipps auf eigene oder fremde Karten. Bis die neue Ansicht da ist, ist die Bedienung gesperrt (App.busy).
 * Einblendungen kommen vom Host in `v.cb.reveal` und sind nach CB_REVEAL_MS wieder verdeckt.
 */
import { CB_REVEAL_MS } from '../../game/constants';
import type { Action, View } from '../../game/types';
import { doAct } from '../../net/dispatch';
import { App } from '../app';
import type { Timer } from '../dom';
import { render } from '../render/index';
import { cbCanSnap, cbMine, cbRole } from '../render/cabo';
import { tauntLabel } from '../feedback';
import { sfx, unlockAudio } from '../sound';
import { taunt } from '../taunts';

/** Ein Tipp so kurz nach einem Wechsel der Knopfzeile galt wohl dem alten Knopf */
const BTN_GUARD_MS = 400;

const CBT = { t: null as Timer | null };

/** Was ich in dieser Runde schon gesehen habe (Besitzer und Platz), für den Spruch beim zweiten Hinsehen */
const SEEN = { key: '', cards: new Map<string, string>() };

function redraw(): void {
  App.anim = {};
  render();
}

const clearSel = (): void => {
  App.cs = { ids: [], opp: null, snap: false };
};

function send(a: Action): void {
  clearSel();
  App.busy = true;
  if (a.type === 'cbdraw' || a.type === 'cbswap' || a.type === 'cbdiscard' || a.type === 'cbsnap') sfx('card');
  doAct(a);
  // Beim Gast dauert die Antwort, die Auswahl soll trotzdem sofort verschwinden
  if (App.busy) redraw();
}

/** Eigene Karte angetippt. */
export function cbTapMine(id: number): void {
  const v = App.view;
  const row = v ? cbMine(v) : null;
  if (!v || !row || App.busy || !row.some((s) => s.id === id)) return;
  unlockAudio();
  if (App.cs.snap && cbCanSnap(v)) {
    send({ type: 'cbsnap', id });
    return;
  }
  const cur = App.cs.ids;
  switch (cbRole(v)) {
    case 'look': {
      const want = Math.min(2, row.length);
      App.cs.ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-want);
      if (App.cs.ids.length === want) {
        send({ type: 'cblook', ids: App.cs.ids });
        return;
      }
      break;
    }
    case 'hold':
      App.cs.ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      break;
    case 'ownpeek':
      send({ type: 'cbpeek', id });
      return;
    case 'blind':
      App.cs.ids = cur.includes(id) ? [] : [id];
      break;
    default:
      return;
  }
  redraw();
}

/** Fremde Karte angetippt (nur beim Spionieren und Blindtausch). */
export function cbTapOpp(owner: string, id: number): void {
  const v = App.view;
  if (!v || App.busy || owner === App.me || !v.cb?.P[owner]?.some((s) => s.id === id)) return;
  unlockAudio();
  const role = cbRole(v);
  if (role === 'spy') {
    send({ type: 'cbspy', to: owner, id });
    return;
  }
  if (role !== 'blind') return;
  const o = App.cs.opp;
  App.cs.opp = o && o.to === owner && o.id === id ? null : { to: owner, id };
  redraw();
}

/** Knöpfe am eigenen Platz und Tipps auf Stapel oder Ablage. */
export function cbButton(kind: string, fromButton = true): void {
  const v = App.view;
  if (!v || App.busy) return;
  // Hat sich die Knopfzeile gerade geändert, galt der Tipp vermutlich dem Knopf, der vorher dort stand
  if (fromButton && Date.now() - App.cbBtn.at < BTN_GUARD_MS) return;
  const C = v.cb;
  if (!C) return;
  unlockAudio();
  const role = cbRole(v);
  switch (kind) {
    case 'cbdeck':
      if (role === 'draw' && C.deck > 0) send({ type: 'cbdraw', from: 'deck' });
      return;
    case 'cbpile':
      if (role === 'draw' && C.pile.length) send({ type: 'cbdraw', from: 'pile' });
      return;
    case 'cbcabo':
      if (role === 'draw' && !C.cabo) send({ type: 'cbcabo' });
      return;
    case 'cbswap':
      if (role === 'hold' && App.cs.ids.length) send({ type: 'cbswap', ids: App.cs.ids });
      return;
    case 'cbdiscard':
      if (role === 'hold' && C.hold?.from === 'deck') send({ type: 'cbdiscard' });
      return;
    case 'cbskip':
      if (role === 'ownpeek' || role === 'spy' || role === 'blind') send({ type: 'cbskip' });
      return;
    case 'cbblind': {
      const o = App.cs.opp;
      if (role === 'blind' && App.cs.ids.length === 1 && o)
        send({ type: 'cbblind', id: App.cs.ids[0], to: o.to, oid: o.id });
      return;
    }
    case 'cbsnapmode':
      if (!cbCanSnap(v)) return;
      App.cs = { ids: [], opp: null, snap: !App.cs.snap };
      redraw();
      return;
  }
}

/**
 * Nach einer neuen Ansicht: Die Auswahl bleibt nur, solange derselbe Zug läuft und meine Reihe gleich ist.
 * Schnappen bleibt an, solange es noch geht.
 */
export function cbSyncSelection(prev: View | null, v: View): void {
  const P = prev?.cb;
  const C = v.cb;
  const rowSig = (x: View['cb']) => JSON.stringify(x?.P[App.me]?.map((s) => s.id) ?? null);
  const same =
    v.game === 'cabo' &&
    !!P &&
    !!C &&
    prev?.phase === v.phase &&
    prev.round === v.round &&
    P.t === C.t &&
    !!P.hold === !!C.hold &&
    P.power?.kind === C.power?.kind &&
    rowSig(P) === rowSig(C);
  const snap = App.cs.snap && cbCanSnap(v);
  if (!same) App.cs = { ids: [], opp: null, snap };
  else App.cs.snap = snap;
}

/**
 * Neue Einblendung vom Host: kurz zeigen, danach wieder verdecken. Nach dem Laden oder Neuverbinden wird nichts
 * nachgezeigt, sonst könnte man sich Karten durch Neuladen noch einmal ansehen.
 */
export function cbSyncReveal(prev: View | null, v: View): void {
  const r = v.cb?.reveal;
  if (v.game !== 'cabo' || !r) return;
  // Jede Partie zählt ihre Einblendungen von vorn
  if (App.cbShow.g !== v.games) App.cbShow = { rid: 0, g: v.games, until: 0, items: [] };
  if (r.id <= App.cbShow.rid) return;
  if (!prev || prev.game !== 'cabo') {
    App.cbShow = { rid: r.id, g: v.games, until: 0, items: [] };
    return;
  }
  App.cbShow = { rid: r.id, g: v.games, until: Date.now() + CB_REVEAL_MS, items: r.items.map((x) => ({ ...x })) };
  // Schaut man sich dieselbe Karte noch einmal an, hat man sie wohl vergessen
  const round = `${v.games}.${v.round}`;
  if (SEEN.key !== round) SEEN.cards.clear();
  SEEN.key = round;
  const one = r.items.length === 1 ? r.items[0] : null;
  if (one && one.owner === App.me && SEEN.cards.get(`${one.owner}:${one.slot}`) === one.c)
    setTimeout(() => tauntLabel(taunt('cbForgotSelf', null, r.id)), 500);
  r.items.forEach((x) => SEEN.cards.set(`${x.owner}:${x.slot}`, x.c));
  if (CBT.t) clearTimeout(CBT.t);
  CBT.t = setTimeout(() => {
    CBT.t = null;
    if (App.view?.game === 'cabo') redraw();
  }, CB_REVEAL_MS + 30);
}

/** Neuer Tisch oder Verlassen: nichts mehr zeigen. */
export function resetCaboUI(): void {
  if (CBT.t) clearTimeout(CBT.t);
  CBT.t = null;
  App.cbShow = { rid: 0, g: -1, until: 0, items: [] };
  SEEN.cards.clear();
  SEEN.key = '';
  clearSel();
}

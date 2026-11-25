/*
 * Cabo bedienen: Zu Beginn zwei eigene Karten antippen, dann blitzen sie kurz auf. Am Zug Stapel oder Ablage
 * antippen (oder die Knöpfe), mit der gezogenen Karte eigene Karten wählen und tauschen oder ablegen. Fähigkeiten
 * gehen über Tipps auf eigene oder fremde Karten. Bis die neue Ansicht da ist, ist die Bedienung gesperrt (App.busy).
 * Einblendungen kommen vom Gastgeber in `v.cb.reveal` und sind nach CB_REVEAL_MS wieder verdeckt.
 */
import { cbWhyNot } from '../../game/cabo';
import { CB_REVEAL_MS } from '../../game/constants';
import type { Action, LogEntry, View } from '../../game/types';
import { doAct } from '../../net/dispatch';
import { App } from '../app';
import { CAR, carouselRelease } from '../carousel';
import type { Timer } from '../dom';
import { render } from '../render/index';
import { cbCanSnap, cbMine, cbRole } from '../render/cabo';
import { noteTap, showReject, tauntLabel } from '../feedback';
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

/** Selektoren der Karten, Stapel oder Knöpfe zu einer Aktion, damit eine Ablehnung das Richtige wackeln lässt. */
function tapSel(a: Action): string[] {
  const mine = (id: number) => `#me .cbslot[data-sid="${Number(id)}"]`;
  const opp = (to: string, id: number) => `#opps .opp[data-pid="${CSS.escape(to)}"] .cbslot[data-sid="${Number(id)}"]`;
  switch (a.type) {
    case 'cblook':
    case 'cbswap':
      return a.ids.map(mine);
    case 'cbpeek':
    case 'cbsnap':
      return [mine(a.id)];
    case 'cbspy':
      return [opp(a.to, a.id)];
    case 'cbblind':
      return [mine(a.id), ...(a.to ? [opp(a.to, a.oid)] : [])];
    case 'cbdraw':
      return [a.from === 'pile' ? '#center .cbpile' : '#center .cbdeck', `#me [data-act="cb${a.from}"]`];
    case 'cbdiscard':
      return ['#me [data-act="cbdiscard"]', '#center .cbpile'];
    case 'cbcabo':
      return ['#me [data-act="cbcabo"]'];
    default:
      return [];
  }
}

function send(a: Action): void {
  clearSel();
  App.busy = true;
  if (a.type === 'cbdraw' || a.type === 'cbswap' || a.type === 'cbdiscard' || a.type === 'cbsnap') sfx('card');
  noteTap(a.type, tapSel(a));
  if (App.role === 'host') {
    // Der Gastgeber lehnt sofort ab: erst neu zeichnen (Auswahl weg), damit die Ablehnung am neuen Element wackelt
    redraw();
    doAct(a);
    return;
  }
  const v0 = App.view;
  doAct(a);
  // Beim Gast dauert die Antwort, die Auswahl soll trotzdem sofort verschwinden
  if (App.view === v0) redraw();
}

/**
 * Geht der Zug? Sonst bleibt alles stehen, die Karte oder der Knopf wackelt und der Grund steht am Tisch, mit
 * denselben Codes, die der Gastgeber schicken würde (cbWhyNot).
 */
function trySend(v: View, a: Action): void {
  const no = cbWhyNot(v, App.me, a);
  if (!no) {
    send(a);
    return;
  }
  noteTap(a.type, tapSel(a));
  showReject(no, a.type);
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
    // Nicht wählbar: Die Karte nennt ihren Grund
    case 'draw':
    case 'wait':
      trySend(v, { type: 'cbswap', ids: [id] });
      return;
    case 'spy':
      trySend(v, { type: 'cbspy', to: App.me, id });
      return;
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
  // Ausgegraute Knöpfe, Stapel und Ablage nennen ihren Grund statt still nichts zu tun
  switch (kind) {
    case 'cbdeck':
      trySend(v, { type: 'cbdraw', from: 'deck' });
      return;
    case 'cbpile':
      trySend(v, { type: 'cbdraw', from: 'pile' });
      return;
    case 'cbcabo':
      trySend(v, { type: 'cbcabo' });
      return;
    case 'cbswap':
      trySend(v, { type: 'cbswap', ids: App.cs.ids.slice() });
      return;
    case 'cbdiscard':
      trySend(v, { type: 'cbdiscard' });
      return;
    case 'cbskip':
      if (role === 'ownpeek' || role === 'spy' || role === 'blind') send({ type: 'cbskip' });
      return;
    case 'cbblind': {
      const o = App.cs.opp;
      trySend(v, { type: 'cbblind', id: App.cs.ids[0] ?? -1, to: o?.to ?? '', oid: o?.id ?? -1 });
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
  if (!same) {
    App.cs = { ids: [], opp: null, snap };
    return;
  }
  App.cs.snap = snap;
  // Inzwischen weggeschnappte Karten sind nicht mehr gewählt, eigene wie fremde
  const mine = new Set((C?.P[App.me] ?? []).map((s) => s.id));
  App.cs.ids = App.cs.ids.filter((id) => mine.has(id));
  const o = App.cs.opp;
  if (o && !C?.P[o.to]?.some((s) => s.id === o.id)) App.cs.opp = null;
}

/** Plätze, die nach Logeintrag `from` eine andere Karte bekommen haben oder verschwunden sind. */
function changedSlots(fresh: readonly LogEntry[], from: number): Set<string> {
  const out = new Set<string>();
  fresh.forEach((e) => {
    if (e.n <= from) return;
    const add = (owner: string | undefined, id: number | undefined) => owner && id != null && out.add(`${owner}:${id}`);
    if (e.k === 'cbswap' && e.ok) (e.ids ?? []).forEach((id) => add(e.p, id));
    else if (e.k === 'cbblind') {
      add(e.p, e.id);
      add(e.to, e.oid);
    } else if (e.k === 'cbsnap' && e.ok) add(e.p, e.id);
  });
  return out;
}

/**
 * Neue Einblendung vom Gastgeber: kurz zeigen, danach wieder verdecken. Nach dem Laden oder Neuverbinden wird nichts
 * nachgezeigt, sonst könnte man sich Karten durch Neuladen noch einmal ansehen.
 */
export function cbSyncReveal(prev: View | null, v: View, fresh: readonly LogEntry[] = []): void {
  if (v.game !== 'cabo') return;
  // Jede Partie zählt ihre Einblendungen von vorn, und in einer neuen Runde gehören die Platz-IDs anderen Karten
  const S = App.cbShow;
  if (S.g !== v.games) App.cbShow = { rid: 0, g: v.games, round: v.round, until: 0, items: [] };
  else if (S.round !== v.round) App.cbShow = { ...S, round: v.round, until: 0, items: [] };
  const r = v.cb?.reveal;
  if (!r || r.id <= App.cbShow.rid) {
    dropChanged(fresh, 0);
    return;
  }
  if (!prev || prev.game !== 'cabo') {
    App.cbShow = { ...App.cbShow, rid: r.id, until: 0, items: [] };
    return;
  }
  App.cbShow = {
    rid: r.id,
    g: v.games,
    round: v.round,
    until: Date.now() + CB_REVEAL_MS,
    items: r.items.map((x) => ({ ...x })),
  };
  // Was jemand gleich nach dem Ansehen tauscht oder wegschnappt, ist nicht mehr die gezeigte Karte
  const own = fresh.filter((e) => e.p === App.me && (e.k === 'cblook' || e.k === 'cbpeek' || e.k === 'cbspy'));
  dropChanged(fresh, own.length ? own[own.length - 1].n : 0);
  // Eine fremde Karte soll nicht gleich aus dem Karussell gleiten, weil schon die nächste Person dran ist
  if (App.cbShow.items.some((x) => x.owner !== App.me)) CAR.hold = App.cbShow.until;
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
    if (CAR.hold === App.cbShow.until) carouselRelease();
    if (App.view?.game === 'cabo') redraw();
  }, CB_REVEAL_MS + 30);
}

/** Einblendung auf Plätzen beenden, die seitdem eine andere Karte haben. */
function dropChanged(fresh: readonly LogEntry[], from: number): void {
  const S = App.cbShow;
  if (!S.items.length || !fresh.length) return;
  const gone = changedSlots(fresh, from);
  if (gone.size) S.items = S.items.filter((x) => !gone.has(`${x.owner}:${x.slot}`));
}

/** Neuer Tisch oder Verlassen: nichts mehr zeigen. */
export function resetCaboUI(): void {
  if (CBT.t) clearTimeout(CBT.t);
  CBT.t = null;
  App.cbShow = { rid: 0, g: -1, round: 0, until: 0, items: [] };
  SEEN.cards.clear();
  SEEN.key = '';
  clearSel();
}

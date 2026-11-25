/*
 * Lage der Meldungen am Tisch ohne DOM, damit Vitest sie prüfen kann. `src/ui/feedback.ts` misst den Bildschirm und
 * setzt die Ergebnisse um.
 *
 * Am eigenen Zug, in der Tauschrunde und ohne genug Spielfläche stehen Meldungen im Band zwischen Stapel und eigenem
 * Platz. Am Handy sind das rund 60 px, um die vier Dinge konkurrieren: große Meldung, Hinweis mit Spruch, Grund
 * einer Ablehnung und Automatisches. Die Regeln dafür:
 * - Die Bühne (große Meldung, Hinweis mit Spruch als eine Meldung) steht unter dem Text der Statuszeile, wenn sie
 *   dort Platz hat, sonst oben im Band über der Statuszeile, sonst über der Unterzeile, notfalls über der ganzen
 *   Statuszeile. Eine Zeile der Statuszeile deckt sie ganz oder gar nicht (stageTop). Passt sie auch so nicht, fallen
 *   ganze Teile weg (erst der Spruch, dann die Unterzeile), abgeschnitten wird nichts.
 * - Kleine Meldungen (Grund, Hinweis, Automatisches) hängen unten am eigenen Platz, der Grund zuunterst, sonst
 *   stehen neuere über älteren. Sie bleiben unter dem Text der Statuszeile, notfalls auf dem Rand des eigenen
 *   Platzes. Reicht der Platz nicht, weichen erst die ältesten Hinweise. Automatisches darf die Unterzeile decken,
 *   nie die Hauptzeile, sonst weicht auch es und kommt, sobald kein Grund und nichts Automatisches mehr steht.
 * - Grund und Automatisches liegen über der großen Meldung, die Bühne weicht ihnen aus. Hinweise und Sprüche
 *   warten, bis die große Meldung vorbei ist.
 * - Nie über den Gegnern. Am eigenen Zug bleibt der Stapel frei, außer das Reaktionsfenster oder Knöpfe in der
 *   Statuszeile (4er, Bombe, Vorspulen, „Für … spielen“) lassen sonst keinen Platz. Diese Knöpfe deckt keine Meldung,
 *   denn der 4er-Knopf steht nur 2 Sekunden (stageRoom).
 */

/** Senkrechter Abschnitt in px (Bildschirmkoordinaten) */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * Mindesthöhe der freien Spielfläche für Meldungen in der Mitte. Darunter gilt das Band. Spielfläche und Band
 * fragen dieselbe Schwelle, sonst bliebe eine Lücke, in der Meldungen über den Gegnern landen.
 */
export const FIELD_MIN = 90;

/**
 * So hoch muss die Spielfläche über der Statuszeile mindestens sein, damit eine große Meldung dort kompakt hineinpasst.
 * Reicht sie in der ganzen Spielfläche in die Statuszeile hinein, rückt sie dann darüber (src/ui/feedback.ts,
 * placeInField), sonst bleibt alles, wie es ist.
 */
export const FIELD_BIG = 140;

/** So viel Band muss unter dem Stapel bleiben, sonst darf es am eigenen Zug über den Stapel (Reaktionsfenster offen) */
export const BAND_MIN = 40;

/** Abstand zu Gegnern, Stapel und Reaktionsfenster */
const GAP = 4;
/** So weit dürfen kleine Meldungen höchstens auf den Rand des eigenen Platzes */
const DIP = 8;
/** Abstand zum ersten Inhalt im eigenen Platz (Kopf, runde Knöpfe) */
const HEAD_GAP = 3;
/** Unterlängen der Unterzeile: so viel darf eine kleine Meldung den Statustext berühren */
const DESC = 4;

/** Wo eine Meldung steht: in der Spielfläche oder im Band zwischen Stapel und eigenem Platz. */
export type Slot = 'band' | 'field';

/** Am eigenen Zug, in der Tauschrunde oder mit zu wenig Spielfläche (`field` ist ihre Höhe in px) im Band. */
export const slotOf = (o: { swap: boolean; myMove: boolean; field: number }): Slot =>
  o.swap || o.myMove || o.field < FIELD_MIN ? 'band' : 'field';

/** Gemessene Kanten für das Band, alles in px von oben. */
export interface BandIn {
  /** Unterkante der Gegner (oder Oberkante des Tischs) */
  opps: number;
  /** Unterkante der Mitte samt Stapel und Regelzeile, nur wenn sie frei bleiben soll (eigener Zug), sonst null */
  pile: number | null;
  /** Oberkante des eigenen Platzes: Hier hängen die kleinen Meldungen */
  me: number;
  /** Oberkante des ersten Inhalts im eigenen Platz (Kopf mit Name, runde Knöpfe in den Ecken). Standard `me` */
  head?: number;
  /** So tief darf die Bühne reichen, in der Tauschrunde bis zur Unterkante des Kopfs am Platz. Standard `me` */
  deep?: number;
  /** Offenes Reaktionsfenster */
  emotes?: Span | null;
  /**
   * Statuszeile: Oberkante (`top`) und Unterkante der Hauptzeile, Unterkante des ganzen Texts. Ohne Statuszeile
   * (Tauschrunde) null
   */
  status?: { top?: number; main: number; text: number } | null;
  /**
   * Textzeilen am Stapel (Regelzeile, Zähler). Muss eine kleine Meldung über den Stapel (Reaktionsfenster offen), deckt
   * sie eine davon ganz oder gar nicht
   */
  lines?: readonly Span[];
}

export interface BandGeo {
  /** Bühne: große Meldungen und Hinweis mit Spruch */
  zone: Span;
  /** Kleine Meldungen, ohne die Statuszeile zu decken (kann leer sein) */
  lane: Span;
  /** Reicht die Bahn nicht, dürfen kleine Meldungen bis hierher auf den Rand des eigenen Platzes, nie auf seinen Kopf */
  dip: number;
  /** Höher als bis hierher reicht keine kleine Meldung: Die Hauptzeile der Statuszeile bleibt immer frei */
  guard: number;
  /** Unterkante des Statustexts (ohne Statuszeile wie `guard`) */
  text: number;
  /**
   * Unterkante für kleine Meldungen über der Statuszeile. Nur wenn unter der Hauptzeile kein Platz bleibt, etwa weil
   * das Reaktionsfenster direkt darunter liegt. Ohne Statuszeile null
   */
  over: number | null;
  /** Oberkante des Bands, wenn der Stapel nachgibt (unter den Gegnern oder dem Reaktionsfenster darüber) */
  open: number;
  /**
   * Statuszeile im Band von der Oberkante der Hauptzeile bis zur Unterkante des Texts. Null ohne Statuszeile oder
   * wenn ihre Oberkante nicht gemessen ist
   */
  st: Span | null;
  /** Ein offenes Reaktionsfenster begrenzt das Band nach unten: Dann darf der Stapel auch kleinen Meldungen weichen */
  shut: boolean;
  /** Textzeilen am Stapel (BandIn.lines) */
  lines: readonly Span[];
}

/**
 * Das Band: von knapp unter Gegnern (am eigenen Zug unter dem Stapel) bis zum eigenen Platz. Ein offenes
 * Reaktionsfenster unter den Gegnern begrenzt es nach unten, eines über den Gegnern (Tauschrunde) nach oben. Bleibt
 * unter dem Stapel zu wenig Platz, gibt der Stapel nach. Gegner und eigene Karten nie.
 */
export function bandGeo(b: BandIn): BandGeo {
  let top = b.opps + GAP;
  let me = b.me - 1;
  let deep = Math.max(b.deep ?? b.me, b.me) - 1;
  const em = b.emotes;
  if (em) {
    if (em.top > b.opps) {
      me = Math.min(me, em.top - GAP);
      deep = Math.min(deep, em.top - GAP);
    } else top = Math.max(top, em.bottom + GAP);
  }
  const open = top;
  if (b.pile !== null && deep - (b.pile + GAP) >= BAND_MIN) top = Math.max(top, b.pile + GAP);
  // Eine Statuszeile über dem Band oder ganz unter dem Reaktionsfenster schützt nichts. Beginnt die Hauptzeile im Band,
  // schützt sie auch, wenn sie unten ans Fenster stößt (Durak 360x640: Hauptzeile 322 bis 341, Fenster ab 340)
  const st = b.status && b.status.main > top && (b.status.top ?? b.status.main) < me ? b.status : null;
  const guard = st ? st.main + 2 : top;
  const free = st ? Math.max(st.text + 2, guard) : top;
  // Auf den Rand des eigenen Platzes höchstens bis kurz vor seinen ersten Inhalt, nicht unter ein Reaktionsfenster
  const dip = me < b.me - 1 ? me : Math.max(me, Math.min((b.head ?? b.me) - HEAD_GAP, b.me + DIP));
  // Begrenzt ein offenes Reaktionsfenster das Band, darf der Stapel kleinen Meldungen über der Statuszeile weichen
  const shut = me < b.me - 1;
  const over = st?.top !== undefined && st.top - 2 > (shut ? open : top) ? st.top - 2 : null;
  const text = st ? st.text : top;
  const block = st?.top !== undefined ? { top: st.top, bottom: st.text } : null;
  return {
    zone: { top, bottom: deep },
    lane: { top: free, bottom: me },
    dip,
    guard,
    text,
    over,
    open,
    st: block,
    shut,
    // Was das Reaktionsfenster verdeckt, zählt nicht zur Zeile
    lines: (b.lines ?? [])
      .map((l) => (em && em.top > b.opps ? { top: l.top, bottom: Math.min(l.bottom, em.top) } : l))
      .filter((l) => l.bottom - l.top > 2),
  };
}

/** So viel Bühne muss über den kleinen Meldungen bleiben, sonst liegen diese über ihr (eine Titelzeile) */
export const STAGE_MIN = 30;

/**
 * Platz der Bühne neben den kleinen Meldungen im Band, damit ein Grund keine Zeile der großen Meldung verdeckt: die
 * oberste Lücke, in die eine Meldung der Höhe `h` passt, sonst die größte (die große lässt dann eher ihren Spruch
 * weg). Ist auch die zu klein für eine Titelzeile, gilt das ganze Band und die kleinen liegen oben.
 * `keep` sind Knöpfe in der Statuszeile (4er, Bombe, Vorspulen), die nie bedeckt werden. Passt die Meldung nicht ganz
 * neben sie, gibt der Stapel nach wie beim offenen Reaktionsfenster: Die Bühne steht dann über Stapel und Knöpfen.
 */
export function stageRoom(g: BandGeo, pills: readonly Span[], h: number, keep: Span | null = null): Span {
  const hit = (r: Span, k: Span) => r.top < k.bottom && r.bottom > k.top;
  if (!keep || !hit(g.zone, keep)) return roomIn(g.zone, pills, h);
  const room = roomIn(g.zone, [...pills, keep], h);
  const size = (x: Span) => x.bottom - x.top;
  if (!hit(room, keep) && size(room) >= h) return room;
  const up = roomIn({ top: g.open, bottom: Math.min(g.zone.bottom, keep.top - 2) }, pills, h);
  return hit(room, keep) || size(up) > size(room) ? up : room;
}

function roomIn(zone: Span, pills: readonly Span[], h: number): Span {
  const all: Span = { ...zone };
  const cuts = pills.filter((p) => p.bottom > all.top && p.top < all.bottom).sort((p, q) => p.top - q.top);
  if (!cuts.length) return all;
  const gaps: Span[] = [];
  let cur = all.top;
  for (const p of cuts) {
    if (p.top - 2 > cur) gaps.push({ top: cur, bottom: p.top - 2 });
    cur = Math.max(cur, p.bottom + 2);
  }
  if (all.bottom > cur) gaps.push({ top: cur, bottom: all.bottom });
  const size = (x: Span) => x.bottom - x.top;
  const fit = gaps.find((x) => size(x) >= h);
  if (fit) return fit;
  const most = gaps.reduce<Span | null>((m, x) => (!m || size(x) > size(m) ? x : m), null);
  // Halbe Pixel aus der Messung zählen nicht
  return most && size(most) > STAGE_MIN - 1 ? most : all;
}

/**
 * So viel darf eine Meldung von einer Zeile der Statuszeile decken oder offen lassen, ohne sie anzuschneiden. Einen
 * Pixel strenger als tests/design/band.mjs (3 px), damit Rundungen der Messung nicht kippen
 */
const CUT = 2;

/** Zeilen der Statuszeile im Band: Hauptzeile (samt Knöpfen statt der Unterzeile), darunter die Unterzeile */
function statusRows(g: BandGeo): Span[] {
  if (!g.st) return [];
  const main = { top: g.st.top, bottom: g.guard - 2 };
  return g.text > main.bottom + 1 ? [main, { top: main.bottom, bottom: g.text }] : [main];
}

/**
 * Was `spans` zusammen von `l` decken, als zusammenhängende Stücke. Lücken bis CUT px zwischen ihnen zählen als
 * gedeckt (Abstand zur Nachbarin, den ihr Rand überdeckt).
 */
function coverOf(l: Span, spans: readonly Span[]): Span[] {
  const parts = spans
    .map((x) => ({ top: Math.max(x.top, l.top), bottom: Math.min(x.bottom, l.bottom) }))
    .filter((x) => x.bottom > x.top)
    .sort((a, b) => a.top - b.top);
  const out: Span[] = [];
  for (const p of parts) {
    const cur = out[out.length - 1];
    if (cur && p.top <= cur.bottom + CUT) cur.bottom = Math.max(cur.bottom, p.bottom);
    else out.push({ ...p });
  }
  return out;
}

/**
 * Schneidet eine Meldung von `top` mit Höhe `h` eine Zeile der Statuszeile halb an? Eine Zeile ganz decken oder ganz
 * freilassen ist erlaubt (je Kante CUT px Spiel), dazwischen nicht, sonst ragt eine halbe Zeile unter ihr hervor. Von
 * der Unterzeile darf beim Decken oben und unten so viel frei bleiben wie ihre Unterlängen (DESC), wie bei den kleinen
 * Meldungen. Kleine Meldungen (`pills`) liegen obenauf: Was sie vom Rest der Zeile decken, zählt mit. Eine Lücke
 * zwischen ihnen mitten in der Zeile zählt immer als Anschnitt, dort schaute die Mitte der Schrift hervor.
 */
export function cutsStatus(g: BandGeo, top: number, h: number, pills: readonly Span[] = []): boolean {
  return statusRows(g).some((l, i) => {
    const y = Math.min(top + h, l.bottom) - Math.max(top, l.top);
    if (y <= CUT) return false;
    const parts = coverOf(l, [{ top, bottom: top + h }, ...pills]);
    const covered = parts.reduce((n, x) => n + x.bottom - x.top, 0);
    return parts.length > 1 || covered < l.bottom - l.top - (i === 0 ? CUT : DESC);
  });
}

/**
 * Oberkante einer Meldung auf der Bühne mit Höhe `h` in `room`. Nie schneidet sie eine Zeile der Statuszeile halb an
 * (cutsStatus, was die kleinen Meldungen `pills` decken, zählt mit). In dieser Reihenfolge:
 * 1. unter dem ganzen Text der Statuszeile,
 * 2. oben im Platz über der Statuszeile,
 * 3. direkt unter der Hauptzeile, sie deckt dann nur die Unterzeile (wie Automatisches, die Hauptzeile bleibt lesbar),
 * 4. über der ganzen Statuszeile,
 * 5. nur über der Hauptzeile.
 * Geht nichts davon (kleine Meldungen lassen zu wenig Platz), lieber direkt unter der Hauptzeile, sonst oben. Eine
 * große Meldung schließt dann, wenn ein Grund oder Automatisches kommt (src/ui/feedback.ts, placeStage).
 */
export function stageTop(g: BandGeo, h: number, room: Span = g.zone, pills: readonly Span[] = []): number {
  const fits = (t: number) => t >= room.top - 0.5 && t + h <= room.bottom + 0.5;
  if (fits(g.lane.top)) return g.lane.top;
  const top = room.top;
  const rows = statusRows(g);
  if (!rows.length || top + h <= rows[0].top + CUT) return top;
  if (fits(g.guard) && !cutsStatus(g, g.guard, h, pills)) return g.guard;
  // Sonst alle Lagen im Platz ohne halbe Zeile, nach dem, was sie decken: nur die Unterzeile (möglichst nah unter der
  // Hauptzeile), alles, nur die Hauptzeile. Gedeckte Zeilen dann mit möglichst viel Rand an beiden Kanten
  const over = (t: number, l: Span) => Math.min(t + h, l.bottom) - Math.max(t, l.top);
  let best: { t: number; r: number; m: number } | null = null;
  // Schrittweise von oben und von unten, damit auch die Lage bündig über einer kleinen Meldung dabei ist (Messungen
  // liefern halbe Pixel, die Lücke zu ihr darf nicht über CUT wachsen)
  const ts: number[] = [];
  for (let t = top; t + h <= room.bottom + 0.5; t++) ts.push(t);
  for (let t = room.bottom - h; t >= top - 0.5; t--) ts.push(t);
  for (const t of ts) {
    if (cutsStatus(g, t, h, pills)) continue;
    const hit = rows.filter((l) => over(t, l) > CUT);
    const r = !hit.includes(rows[0]) ? 1 : hit.length > 1 ? 2 : 3;
    const m = r > 1 ? Math.min(...hit.map((l) => Math.min(l.top - t, t + h - l.bottom))) : -Math.abs(t - g.guard);
    if (!best || r < best.r || (r === best.r && m > best.m)) best = { t, r, m };
  }
  // Nichts geht ohne halbe Zeile: lieber die Unterzeile als die Hauptzeile
  return best?.t ?? (fits(g.guard) ? g.guard : top);
}

/** Rand links und rechts, wenn die Bühne Text der Statuszeile deckt (runde Ecken) */
const COVER_PAD = 16;

/**
 * Wie breit muss die Bühne mit der Mitte `cx` von `top` mit Höhe `h` mindestens sein, damit von den Zeilen der
 * Statuszeile, die sie deckt (`lines`, Rechtecke ihres Texts), links und rechts nichts hervorragt? 0, wenn sie keine
 * deckt. Hinweis mit Spruch ist sonst nur so breit wie sein Text.
 */
export function coverWidth(
  cx: number,
  lines: readonly { left: number; right: number; top: number; bottom: number }[],
  top: number,
  h: number,
): number {
  let w = 0;
  for (const l of lines)
    if (l.right > l.left && Math.min(top + h, l.bottom) - Math.max(top, l.top) > CUT)
      w = Math.max(w, 2 * Math.max(cx - l.left, l.right - cx));
  return w ? Math.ceil(w) + COVER_PAD : 0;
}

/**
 * Welche Fassung einer großen Meldung passt? `heights` sind die gemessenen Höhen der Fassungen in der Reihenfolge
 * von `STAGE_DROP` (voll, ohne Spruch, ohne Unterzeile, Titel einzeilig). Die erste, die passt, sonst die letzte.
 */
export function firstFit(heights: readonly number[], avail: number): number {
  const i = heights.findIndex((h) => h <= avail);
  return i < 0 ? Math.max(0, heights.length - 1) : i;
}

/** Was nacheinander wegfällt, wenn eine große Meldung nicht ins Band passt (Klassen an `.ann`). */
export const STAGE_DROP = ['', 'd-tt', 'd-sub', 'd-t2'] as const;

/**
 * Eine kleine Meldung im Band, in der Reihenfolge ihres Erscheinens: Höhe und Rang. 2 ist ein Grund (er steht
 * unten, direkt unter der Statuszeile), 1 Automatisches, 0 ein Hinweis.
 */
export interface Pill {
  h: number;
  prio: 0 | 1 | 2;
}

/**
 * Lage aller kleinen Meldungen im Band (Oberkanten, Indizes wie `pills`). Sie stapeln sich vom eigenen Platz nach
 * oben, Gründe zuunterst, sonst die älteren unten. Reicht der Platz unter der Statuszeile nicht, weichen zuerst die
 * ältesten Hinweise (`evict`). Automatisches darf dann die Unterzeile decken, über die Hauptzeile reicht nichts:
 * Dafür weicht notfalls auch Automatisches. Eine einzelne Meldung bleibt immer, notfalls direkt unter der Hauptzeile.
 * Reicht sie von dort auf den Inhalt des eigenen Platzes oder ins Reaktionsfenster, steht sie über der Statuszeile.
 */
export function pillStack(g: BandGeo, pills: readonly Pill[]): { tops: (number | null)[]; evict: number[] } {
  const gone = new Set<number>();
  // Mit Statuszeile dürfen nur die Unterlängen der Unterzeile berührt werden
  const clear = g.text < g.lane.top ? g.text - DESC : g.lane.top;
  /** Oberkanten, wenn der Stapel bei `bottom` endet */
  const from = (order: readonly number[], bottom: number): number[] => {
    const t: number[] = [];
    let cur = bottom;
    for (const i of order) {
      t[i] = cur - pills[i].h;
      cur = t[i] - 2;
    }
    return t;
  };
  const layout = () => {
    const order = pills
      .map((_, i) => i)
      .filter((i) => !gone.has(i))
      .sort((a, b) => Number(pills[b].prio === 2) - Number(pills[a].prio === 2) || a - b);
    let tops = from(order, g.lane.bottom);
    // Reicht die Bahn nicht, rückt der Stapel um das Fehlende auf den Rand des eigenen Platzes (höchstens bis `dip`),
    // wenn er dann unter dem Text bleibt. Die Unterlängen der Unterzeile zu berühren reicht dafür nicht
    const high = Math.min(...order.map((i) => tops[i]));
    if (order.length && high < clear) {
      const low = from(order, Math.min(g.dip, g.lane.bottom + (clear - high)));
      if (order.every((i) => low[i] >= clear)) tops = low;
    }
    return { order, tops };
  };
  let { order, tops } = layout();
  const yieldUntil = (limit: number, prio: Pill['prio']) => {
    while (order.length > 1 && order.some((i) => tops[i] < limit)) {
      const i = order.find((k) => pills[k].prio === prio);
      if (i === undefined) return;
      gone.add(i);
      ({ order, tops } = layout());
    }
  };
  yieldUntil(clear, 0);
  yieldUntil(g.guard, 1);
  // Deckt eine Meldung mehr als die Unterlängen der Unterzeile, dann die ganze Unterzeile statt einer halben
  const snap = (top: number, h: number): number =>
    g.text - top > DESC && g.guard + h >= g.text ? g.guard : Math.max(g.guard, top);
  let out = pills.map((p, i) => (gone.has(i) ? null : snap(tops[i], p.h)));
  // Reichte das nur auf den Inhalt des eigenen Platzes oder ins Reaktionsfenster, steht der Stapel über der Statuszeile,
  // wenn er dort ganz Platz hat. Begrenzt das Reaktionsfenster das Band, darf er dafür über den Stapel (wie die Bühne)
  const floor = Math.max(g.dip, g.lane.bottom) + 1;
  const ceil = g.shut ? g.open : g.zone.top;
  if (g.over !== null && out.some((t, i) => t !== null && t + pills[i].h > floor)) {
    const alt = from(order, g.over);
    if (order.every((i) => alt[i] >= ceil)) out = pills.map((_, i) => (gone.has(i) ? null : alt[i]));
  }
  out = coverLine(g, pills, order, out, ceil);
  return {
    tops: out.map((t) => (t === null ? null : Math.round(t))),
    evict: [...gone].sort((p, q) => p - q),
  };
}

/**
 * Liegen kleine Meldungen über dem Stapel (er hat nachgegeben), schneiden sie eine Textzeile dort (Regelzeile) nicht
 * halb an: Die unterste Meldung rückt so, dass sie die Zeile ganz deckt. Nach oben beliebig, nach unten nur bis an das
 * Reaktionsfenster, nie auf die Statuszeile. Ist die Zeile höher als die Meldung, bleibt alles, wie es ist.
 */
function coverLine(
  g: BandGeo,
  pills: readonly Pill[],
  order: readonly number[],
  out: (number | null)[],
  ceil: number,
): (number | null)[] {
  const low = order[0];
  const lt = low === undefined ? null : out[low];
  if (lt === null || lt === undefined) return out;
  const lh = pills[low].h;
  const cut = g.lines.find(
    (l) => Math.min(lt + lh, l.bottom) - Math.max(lt, l.top) > 1 && (lt > l.top || lt + lh < l.bottom),
  );
  // Halbe Pixel aus der Messung zählen nicht
  if (!cut || lh < cut.bottom - cut.top - 2) return out;
  // Hängt der Stapel unten am Reaktionsfenster, darf er bis an das Fenster selbst (sonst GAP Abstand)
  const hard = g.shut && lt + lh >= g.lane.bottom - 0.5 ? g.lane.bottom + GAP : lt + lh;
  const top = Math.min(cut.top, hard - lh);
  if (top + lh < cut.bottom - 2) return out;
  const d = top - lt;
  const moved = out.map((t) => (t === null ? null : t + d));
  return moved.every((t) => t === null || t >= ceil) ? moved : out;
}

/**
 * Wartet eine Meldung, bis die große vorbei ist? Nur im Band, wo beide um denselben Platz kämpfen. Grund und
 * Automatisches (`urgent`) kommen sofort und liegen oben.
 */
export const waitsForBig = (o: { band: boolean; bigLive: boolean; urgent: boolean }): boolean =>
  o.band && o.bigLive && !o.urgent;

/**
 * Wartet verdrängtes Automatisches noch? Es kommt erst, wenn im Band kein Grund und nichts anderes Automatisches mehr
 * steht (`urgentLive`), sonst tauschten zwei bei jedem Zeichnen die Plätze. Ohne Band sofort, die Spielfläche hat Platz.
 */
export const parkedWaits = (o: { band: boolean; urgentLive: number }): boolean => o.band && o.urgentLive > 0;

/**
 * Sitzmeldungen (Kommen, Gehen, Übernahme) bei offenem Ergebnisblatt als Toast wie in der Lobby, sonst stünden sie
 * unter dem Blatt. Das Blatt gehört zu den Phasen `end` und `over`, auch solange es noch zurückgehalten wird.
 */
export const seatVia = (o: { phase: string; sheet: boolean }): 'toast' | 'table' =>
  o.sheet || o.phase === 'end' || o.phase === 'over' ? 'toast' : 'table';

/**
 * Rückfall ohne Spielfläche: das Etikett direkt am Platz. Andere ohne Namen (er steht am Platz), für einen selbst in
 * der Du-Form („Du verbrennst den Stapel“).
 */
export const panelText = (self: boolean, text: string, mine?: string): string => (self && mine ? `Du ${mine}` : text);

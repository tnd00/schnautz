/*
 * Cabo-KI: entscheidet nur aus ihrer Ansicht. Ihr Wissen kommt vom Host (nur KIs bekommen es), vergessen tut sie
 * selbst: Je mehr eigene Züge seit dem Ansehen vergangen sind, desto eher ist eine Karte weg, und was weg ist, kommt
 * nicht wieder. Manche Karten merkt sie sich von Anfang an falsch (3 daneben). Das ist gewollt, sonst wäre sie gegen
 * Menschen unschlagbar. Alles hängt nur an KI, Platz und Zeitpunkt des Ansehens, darum entscheidet sie stabil.
 */
import { cbVal } from '../game/cards';
import type { Action, CbSlotView, CbView, Rng, View } from '../game/types';
import { BOT_CFG, type BotLevel, botRand } from './config';

/** Schätzwert für eine Karte, die man nicht kennt (Mittel aller Werte 0 bis 13 mit doppelter 13 und 0) */
const UNKNOWN = 6.5;

/** Stabiler Zufall aus einem Text, damit dieselbe Frage im selben Zug dieselbe Antwort gibt. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Endmischung (murmur3), sonst ändert ein anderes letztes Zeichen das Ergebnis kaum
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** So leicht vergisst die KI: je eigenem Zug seit dem Ansehen etwas mehr, höchstens `max`. */
const FORGET: Readonly<Record<BotLevel, { per: number; max: number; wrong: number }>> = {
  weak: { per: 0.18, max: 0.7, wrong: 0.12 },
  normal: { per: 0.1, max: 0.55, wrong: 0.07 },
  strong: { per: 0.03, max: 0.2, wrong: 0.02 },
};

/**
 * Was glaubt die KI über diesen Platz? Offene Karten kennt jeder. Sonst ihr Wissen, wenn sie es nicht vergessen
 * hat, manchmal leicht daneben. null heißt: keine Ahnung.
 */
export function botCbRecall(v: View, owner: string, s: CbSlotView, lvl: BotLevel = 'normal'): number | null {
  if (s.c && (s.up || v.phase !== 'play')) return cbVal(s.c);
  const C = v.cb;
  const k = C?.know?.[s.id];
  if (!C || !k) return null;
  const f = FORGET[lvl];
  // Alter in eigenen Zügen, am großen Tisch vergeht zwischen zwei eigenen Zügen sonst zu viel
  const age = Math.max(0, C.t - k.t) / Math.max(1, v.players.length);
  const key = `${v.me}|${owner}|${s.id}|${k.t}`;
  // Die Schwelle steigt mit dem Alter, ein vergessener Platz bleibt vergessen, bis sie ihn wieder sieht
  if (hash01(key) < Math.min(f.max, f.per * age)) return null;
  // Falsch gemerkt, aber nie direkt nach dem Ansehen, und mal zu hoch, mal zu tief
  if (age >= 1 && hash01(`${key}|w`) < f.wrong)
    return Math.max(0, Math.min(13, cbVal(k.c) + (hash01(`${key}|d`) < 0.5 ? -3 : 3)));
  return cbVal(k.c);
}

const est = (x: number | null): number => (x == null ? UNKNOWN : x);

interface Mine {
  s: CbSlotView;
  v: number | null;
}

function mine(v: View, lvl: BotLevel): Mine[] {
  return (v.cb?.P[v.me] ?? []).map((s) => ({ s, v: botCbRecall(v, v.me, s, lvl) }));
}

/** Geschätzte Summe der eigenen Karten. */
export function botCbGuess(v: View, lvl: BotLevel = 'normal'): number {
  return mine(v, lvl).reduce((sum, m) => sum + est(m.v), 0);
}

/** Schlechtester eigener Platz: bekannt hoch oder unbekannt. */
function worst(ms: Mine[]): Mine | null {
  let w: Mine | null = null;
  ms.forEach((m) => {
    if (!w || est(m.v) > est(w.v)) w = m;
  });
  return w;
}

export function botCabo(v: View, rng?: Rng, lvl: BotLevel = 'normal'): Action | null {
  const C: CbView | null | undefined = v.cb;
  if (!C || !C.P[v.me]) return null;
  const me = v.players.find((p) => p.id === v.me);
  const row = C.P[v.me];
  if (v.phase === 'peek') {
    if (me?.ready) return null;
    return { type: 'cblook', ids: row.slice(0, 2).map((s) => s.id) };
  }
  if (v.phase !== 'play') return null;
  const ms = mine(v, lvl);
  const cfg = BOT_CFG[lvl];
  const top = C.pile[C.pile.length - 1];
  // Schnappen: Eine Karte, die sie für gleich hält, fliegt drauf, auch wenn sie sich irrt
  const busy = C.hold?.by === v.me || C.power?.by === v.me;
  if (v.rules.cb?.snap && top && !busy) {
    const hit = ms.find((m) => m.v != null && m.v === cbVal(top));
    if (hit && hash01(`${v.me}|snap|${C.t}|${hit.s.id}`) < 0.7) return { type: 'cbsnap', id: hit.s.id };
  }
  if (v.players[v.turn]?.id !== v.me) return null;
  // Fähigkeit nach dem Ablegen
  if (C.power) {
    if (C.power.kind === 'peek') {
      const unk = ms.find((m) => m.v == null && !m.s.up);
      return unk ? { type: 'cbpeek', id: unk.s.id } : { type: 'cbskip' };
    }
    // Im Kreis ab dem eigenen Platz, damit nicht immer dieselbe Person (meist der Host) dran ist
    const n = v.players.length;
    const mi = v.players.findIndex((p) => p.id === v.me);
    const others = v.players
      .map((_, k) => v.players[(mi + 1 + k) % n])
      .filter((p) => p.id !== v.me && C.P[p.id]?.length);
    if (C.power.kind === 'spy') {
      // Wer Cabo gerufen hat, ist am spannendsten, sonst irgendeine unbekannte Karte
      const cands = others.flatMap((p) =>
        C.P[p.id].filter((x) => !x.up && botCbRecall(v, p.id, x, lvl) == null).map((x) => ({ to: p.id, id: x.id })),
      );
      const caller = cands.filter((x) => x.to === C.cabo);
      const pool = caller.length ? caller : cands;
      if (!pool.length) return { type: 'cbskip' };
      const pick = pool[Math.floor(hash01(`${v.me}|spy|${C.t}`) * pool.length)];
      return { type: 'cbspy', to: pick.to, id: pick.id };
    }
    // Blind tauschen: eigene hohe Karte gegen eine bekannte niedrige, sonst manchmal ins Blaue
    const w = worst(ms);
    if (!w || est(w.v) < 8) return { type: 'cbskip' };
    let best: { to: string; id: number; val: number } | null = null;
    others.forEach((p) =>
      C.P[p.id].forEach((s) => {
        const x = botCbRecall(v, p.id, s, lvl);
        if (x != null && x < est(w.v) - 3 && (!best || x < best.val)) best = { to: p.id, id: s.id, val: x };
      }),
    );
    const b = best as { to: string; id: number; val: number } | null;
    if (b) return { type: 'cbblind', id: w.s.id, to: b.to, oid: b.id };
    if (w.v != null && w.v >= 10 && botRand(rng) < 0.35 && others.length) {
      const p = others[Math.floor(botRand(rng) * others.length)];
      const s = C.P[p.id][Math.floor(botRand(rng) * C.P[p.id].length)];
      return { type: 'cbblind', id: w.s.id, to: p.id, oid: s.id };
    }
    return { type: 'cbskip' };
  }
  // Gezogene Karte: tauschen, wenn sie besser ist, mehrere gleiche auf einmal loswerden, sonst ablegen
  if (C.hold?.c) {
    const hv = cbVal(C.hold.c);
    const groups = new Map<number, Mine[]>();
    ms.forEach((m) => {
      if (m.v != null) groups.set(m.v, [...(groups.get(m.v) ?? []), m]);
    });
    const multi = [...groups.entries()]
      .filter(([val, g]) => g.length >= 2 && val * g.length > hv + 4)
      .sort((a, b) => b[0] * b[1].length - a[0] * a[1].length)[0];
    if (multi) return { type: 'cbswap', ids: multi[1].map((m) => m.s.id) };
    const w = worst(ms);
    const better = !!w && hv < est(w.v) - 1;
    // Ab und zu verschätzt sie sich wie ein Mensch
    const oops = botRand(rng) < cfg.mistake * 0.25;
    if (w && (better !== oops || C.hold.from === 'pile')) return { type: 'cbswap', ids: [w.s.id] };
    // Eine Karte mit Fähigkeit lohnt sich fast immer abzulegen
    return { type: 'cbdiscard' };
  }
  // Am Anfang des Zugs: Cabo rufen, von der Ablage nehmen oder ziehen
  const guess = botCbGuess(v, lvl);
  const known = ms.filter((m) => m.v != null).length;
  const n = v.players.length;
  const tooEarly = C.t < n * 2;
  const brave = 4 + (cfg.mistake > 0.3 ? 4 : 0) + Math.floor(hash01(`${v.me}|cabo|${v.round}`) * 4);
  const sure = known >= ms.length - 1 && guess <= brave;
  // Gegen Ende der Runde ist ein mutiger Ruf besser als der leere Stapel, der kommt sowieso bald
  const late = C.deck <= n * 1.5 && known >= ms.length - 2 && guess <= brave + 4;
  if (!C.cabo && !tooEarly && (sure || late)) return { type: 'cbcabo' };
  const w = worst(ms);
  if (top && w && cbVal(top) <= 3 && est(w.v) >= cbVal(top) + 4) return { type: 'cbdraw', from: 'pile' };
  // Hat eine Strafkarte den Stapel geleert, bleibt nur die Ablage
  if (!C.deck) return top ? { type: 'cbdraw', from: 'pile' } : C.cabo ? null : { type: 'cbcabo' };
  return { type: 'cbdraw', from: 'deck' };
}

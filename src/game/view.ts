import { DEFAULT_RULES } from './constants';
import type { CbView, DkView, ShView, State, View } from './types';

const VIEW_LOG_LIMIT = 90;

/**
 * So groß darf eine Ansicht als JSON höchstens werden (UTF-8-Bytes). PeerJS verweigert im JSON-Kanal
 * Nachrichten ab 16 300 Bytes, der Rest ist Luft für die Hülle der Nachricht.
 */
export const VIEW_MAX_BYTES = 15_000;

const utf8 = new TextEncoder();
const bytesOf = (x: unknown): number => utf8.encode(JSON.stringify(x)).byteLength;

/**
 * Kürzt den Verlauf von vorn, bis die Ansicht in eine Nachricht passt. Lange Chatnachrichten mit
 * Emojis würden sie sonst bei vollem Tisch sprengen und die Gäste verlören die Verbindung.
 */
export function fitView(v: View, max = VIEW_MAX_BYTES): View {
  let over = bytesOf(v) - max;
  if (over <= 0) return v;
  let cut = 0;
  // Jeder Eintrag kostet sein JSON plus ein Komma
  while (over > 0 && cut < v.log.length) over -= bytesOf(v.log[cut++]) + 1;
  v.log = v.log.slice(cut);
  return v;
}

/**
 * Ansicht für einen Platz am Tisch: fremde Handkarten und alle verdeckten Karten werden zu Anzahlen.
 * Nur das darf an Gäste und an die KI gehen, damit niemand schummeln kann.
 */
export function viewFor(st: State, pid: string): View {
  const copy = structuredClone(st);
  const hands: View['hands'] = {};
  Object.entries(copy.hands).forEach(([id, h]) => {
    hands[id] = id === pid ? h : h.length;
  });
  let sh: ShView | null = null;
  if (copy.sh) {
    const S = copy.sh;
    const reveal = st.phase === 'over';
    const P: ShView['P'] = {};
    Object.entries(S.P).forEach(([id, p]) => {
      P[id] = reveal ? p : { up: p.up, down: p.down.length, hand: id === pid ? p.hand : p.hand.length };
    });
    sh = { ...S, deck: S.deck.length, burned: S.burned.length, P };
  }
  let dk: DkView | null = null;
  if (copy.dk) {
    const D = copy.dk;
    // Am Ende liegen alle Hände offen, vorher sieht jeder nur die eigene
    const reveal = st.phase === 'over';
    const P: DkView['P'] = {};
    Object.entries(D.P).forEach(([id, h]) => {
      P[id] = reveal || id === pid ? h : h.length;
    });
    dk = { ...D, deck: D.deck.length, P };
  }
  let cb: CbView | null = null;
  if (copy.cb) {
    const C = copy.cb;
    // Nach der Runde liegt alles offen, vorher nur offene Plätze. Wissen und Einblendung gehören nur einem selbst
    const reveal = st.phase === 'end' || st.phase === 'over';
    const P: CbView['P'] = {};
    Object.entries(C.P).forEach(([id, row]) => {
      P[id] = row.map((s) => (reveal || s.up ? { ...s } : { id: s.id }));
    });
    const hold =
      C.hold && (C.hold.by === pid || C.hold.from === 'pile') ? C.hold : C.hold && { by: C.hold.by, from: C.hold.from };
    const bot = !!st.players.find((p) => p.id === pid)?.bot;
    const { know, reveal: shows, ...rest } = C;
    cb = {
      ...rest,
      deck: C.deck.length,
      P,
      hold,
      ...(bot ? { know: know[pid] ?? {} } : {}),
      // Nur kurz: Danach muss man es sich merken, auch nach Neuladen steht es nicht mehr in der Ansicht
      ...(shows[pid] && C.t <= shows[pid].t + 1 ? { reveal: shows[pid] } : {}),
    };
  }
  return {
    ...copy,
    game: copy.game || 'schnautz',
    rules: {
      ...copy.rules,
      sh: copy.rules.sh ?? { ...DEFAULT_RULES.sh },
      dk: copy.rules.dk ?? { ...DEFAULT_RULES.dk },
      cb: copy.rules.cb ?? { ...DEFAULT_RULES.cb },
    },
    deck: st.deck.length,
    discard: st.discard.length,
    spare: st.spare ? st.spare.length : 0,
    hands,
    sh,
    dk,
    cb,
    log: copy.log.slice(-VIEW_LOG_LIMIT),
    me: pid,
  };
}

import { DEFAULT_RULES } from './constants';
import type { ShView, State, View } from './types';

const VIEW_LOG_LIMIT = 90;

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
  return {
    ...copy,
    game: copy.game || 'schnautz',
    rules: { ...copy.rules, sh: copy.rules.sh ?? { ...DEFAULT_RULES.sh } },
    deck: st.deck.length,
    discard: st.discard.length,
    spare: st.spare ? st.spare.length : 0,
    hands,
    sh,
    log: copy.log.slice(-VIEW_LOG_LIMIT),
    me: pid,
  };
}

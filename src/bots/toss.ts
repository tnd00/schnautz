/* Wirft die KI zurück? Entscheidet nur auf Basis ihrer eigenen Ansicht. */
import type { LogEntry, TossItem, View } from '../game/types';

type TossEntry = Extract<LogEntry, { k: 'toss' }>;

/** Antwort auf einen Treffer: Tomate, Ei und Haufen kommen oft zurück, eine Krone selten. Nie gegen andere KIs. */
export function botTossReply(v: View, e: TossEntry, roll: number): { item: TossItem; to: string } | null {
  if (e.to !== v.me || !e.p || e.p === v.me) return null;
  const me = v.players.find((p) => p.id === v.me);
  const from = v.players.find((p) => p.id === e.p);
  if (!me || me.left || !from || from.bot) return null;
  if (e.item === 'crown') return roll < 0.15 ? { item: 'crown', to: e.p } : null;
  return roll < 0.4 ? { item: e.item, to: e.p } : null;
}

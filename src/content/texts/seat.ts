/*
 * Kommen, Gehen, Zurück, Übernahme und fremde Zeit um als kurze Meldung am Tisch (src/ui/effects.ts).
 * Reiner Text ohne HTML, die Meldung setzt ihn als textContent. In der Lobby gibt es kein „samt Karten“.
 */

/** Zweiter Fall für „Platz von X“: Uschis Platz, Klaus' Platz, Max' Platz. */
export function genitive(name: string): string {
  const n = name.trim();
  if (!n) return n;
  return /(s|ß|x|z|ce)$/i.test(n) ? `${n}'` : `${n}s`;
}

export const SEAT = {
  /** Andere am Tisch und in der Lobby */
  takeover: (name: string, from: string) => `${name} setzt sich an ${genitive(from)} Platz.`,
  /** Wer selbst übernimmt, sieht es einmal nach der ersten Ansicht */
  takeoverSelf: (from: string) => `Du übernimmst ${genitive(from)} Platz samt Karten.`,
  tobot: (name: string) => `${name} ist gegangen, die KI spielt weiter.`,
  back: (name: string) => `${name} ist zurück.`,
  backSelf: 'Du bist zurück an deinem Platz.',
  join: (name: string) => `${name} sitzt jetzt mit am Tisch.`,
  /** Fremde Zeit um, klein mit leisem Ton */
  timeout: (name: string) => `⏰ Zeit um, die KI spielt einmal für ${name}.`,
  /** Eigene Zeit um bei Durak, wenn die KI nur gepasst hat */
  timeoutPassSelf: '⏰ Zeit um, die KI hat für dich gepasst.',
  /** Eigene Zeit um als große Meldung */
  timeoutTitle: 'Zeit um!',
  timeoutSub: 'Die KI hat einmal für dich gespielt.',
  timeoutPeekSub: 'Die KI hat dir zwei Karten gezeigt.',
} as const;

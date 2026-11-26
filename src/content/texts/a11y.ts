/*
 * Sätze für den Vorleser (src/ui/a11y/say.ts). Reiner Text ohne HTML, der Vorleser schreibt nur textContent. Die
 * Texte des Bogens „Bedienung“ stehen in prefs.ts, damit sie nur mit dem Bogen nachladen.
 */

export const SAY_TEXT = {
  /** Die eigene Uhr, einmal pro Zug */
  clock5: 'Noch 5 Sekunden.',
  /** Chat anderer, vorgelesen wie eine Sprechblase */
  chat: (name: string, text: string) => `${name} schreibt, ${text}`,
} as const;

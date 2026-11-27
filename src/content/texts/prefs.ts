/* Bogen „Bedienung“ (src/ui/render/prefs.ts). Nur dort importieren, sonst landet er im Einstiegsstück. */

export const PREFS_TEXT = {
  title: 'Bedienung',
  lead: 'Gilt nur auf diesem Gerät.',
  calm: 'Ruhig',
  calmSub: 'Weniger Bewegung am Tisch, jeder Text bleibt',
  calmOpts: [
    ['auto', 'Wie das Gerät'],
    ['on', 'An'],
    ['off', 'Aus'],
  ],
  drag: 'Karten ziehen',
  dragSub: 'Karten mit dem Finger auf den Stapel schieben, Tippen geht immer',
  zones: 'Trefferflächen anzeigen',
  zonesSub: 'Zeigt beim Ziehen, wo Loslassen zählt',
  haptic: 'Vibration',
  hapticSub: 'Kurz brummen, wenn dir etwas passiert',
  volume: 'Lautstärke',
  volumeText: (pct: number) => `${pct} Prozent`,
  turnTone: 'Zug-Ton',
  turnToneSub: 'Klingelt, wenn du dran bist',
  turnToneOpts: [
    ['always', 'Immer'],
    ['away', 'Wenn ich wegschaue'],
    ['off', 'Nie'],
  ],
} as const;

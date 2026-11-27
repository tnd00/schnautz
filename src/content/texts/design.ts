/* Bogen „Design“ (src/ui/render/design.ts). Nur dort importieren, sonst landet er im Einstiegsstück. */

export const DESIGN_TEXT = {
  title: 'Design',
  lead: 'Gilt am Tisch und nur auf diesem Gerät.',
  look: 'Design',
  looks: [
    ['sticker', 'Sticker', 'Bunt und frech. So sieht der Tisch jetzt aus.'],
    ['dark', 'Sticker dunkel', 'Genauso frech, nur für die Runde nach Mitternacht.'],
    ['legacy', 'Legacy', 'Grüner Filz und Messing. Für alle, die früher alles besser fanden.'],
  ],
  deck: 'Kartendeck',
  decks: [
    ['vinyl', 'Vinyl', 'Dicke Zeichen, lesbar auch aus der Sofaecke.'],
    ['classic', 'Klassisch', 'Das gute alte Blatt mit Bildkarten.'],
  ],
  legacyFail: 'Legacy will gerade nicht laden. Der Tisch bleibt Sticker, probier es gleich nochmal.',
  darkFail: 'Sticker dunkel will gerade nicht laden. Der Tisch bleibt, wie er ist, probier es gleich nochmal.',
} as const;

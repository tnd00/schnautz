/* Updates für die Seite unter ⋯. Neueste Version zuerst, Texte für Spielerinnen und Spieler, nicht für Entwickler. */

export interface Release {
  v: string;
  /** ISO-Datum der Veröffentlichung */
  date: string;
  title: string;
  groups: { h: string; items: string[] }[];
}

export const CHANGELOG: readonly Release[] = [
  {
    v: '2.1.1',
    date: '2026-11-23',
    title: 'Luft im Verlauf',
    groups: [
      {
        h: 'Behoben',
        items: [
          'Viele lange Chatnachrichten an einem vollen Tisch konnten alle Gäste aus der Verbindung werfen. Wird es eng, zeigt der Verlauf jetzt einfach weniger alte Einträge.',
        ],
      },
    ],
  },
  {
    v: '2.1',
    date: '2026-11-23',
    title: 'Platz für alle',
    groups: [
      {
        h: 'Neu',
        items: [
          'Mehr Leute am Tisch, Schnautz mit bis zu acht und Shithead mit bis zu zehn.',
          'Shithead spielt ab sechs Leuten mit zwei Decks, auf Wunsch schon ab fünf.',
          'Bei vielen Gegnern stehen drei in der Mitte, die anderen schauen am Rand hervor. Wer dran ist, rückt in die Mitte. Wischen geht jederzeit, beim Loslassen springt es zurück.',
          'Zeitlimit pro Zug, voreingestellt sind 20 Sekunden, in der Tauschrunde doppelt so viel. Läuft die Zeit ab, zieht die KI einmal für dich. Je knapper es wird, desto schneller pulsiert dein Platz.',
          'Der Host legt in der Lobby fest, wie viele mitspielen. Freie Plätze lassen sich auf Wunsch mit KI füllen.',
          'Wer an den Tisch kommt, übernimmt einen KI-Platz. Das geht auch mitten in der Partie, samt Karten.',
          'Wer mitten in der Partie geht, wird zur KI und spielt unter dem eigenen Namen weiter. Wer zurückkommt, bekommt den Platz wieder.',
          'Bestenliste für jedes Spiel hinter dem Pokal oben, mit Medaillen für die ersten drei.',
          'Regeln direkt oben am Tisch, mit allen Sonderkarten auf einen Blick.',
          'Handkarten haben ein eigenes Zeichen aus drei gefächerten Karten.',
          'Zwei neue Reaktionen, 👏 und 🙈.',
          'Diese Seite mit allen Updates unter ⋯.',
        ],
      },
      {
        h: 'Shithead',
        items: [
          'Bei jedem neuen Stapel dürfen alle ihre 4er reinwerfen, auch wer gerade dran ist. Die Reihenfolge bleibt.',
          'Wer die vierte 4 reinwirft, macht eine Bombe und ist dran.',
          '8 aussetzen ist von Anfang an eingeschaltet.',
          'Vier Gleiche heißen jetzt überall Bombe.',
          'Gegner ohne Tischkarten zeigen ihre Handkarten groß, damit alle sehen, wie knapp es ist.',
          'Deine Tischkarten liegen über der Hand und rücken groß in den Fokus, sobald die Hand leer ist.',
          'In der Tauschrunde stehen die Gegner als große Kacheln oben, deine Karten sitzen unten wie im Spiel. Alle KIs tauschen gleichzeitig.',
        ],
      },
      {
        h: 'Schnautz',
        items: ['Wer die letzte Runde verloren hat, fängt an.'],
      },
      {
        h: 'Besser',
        items: [
          'Am Handy passen Startseite, Tisch und Lobby ohne Scrollen auf einen Bildschirm. Tisch eröffnen und Beitreten liegen hinter dem Knopf Spielen.',
          'Reaktionen und Chat liegen hinter runden Knöpfen am eigenen Platz.',
          'Ist der Chat offen, sagt er Bescheid, sobald du dran bist.',
          'Regeln, Bestenliste und Ergebnis sehen aus wie der Tisch.',
          'Wer dran ist, leuchtet direkt im Feld.',
          'KI-Mitspieler tragen ihr KI-Zeichen auch am Tisch.',
          'Meldungen und kurze Hinweise erscheinen mittig über der Spielfläche und verdecken weder Gegner noch deine Karten.',
        ],
      },
      {
        h: 'Behoben',
        items: [
          'Sprechblasen waren am Handy abgeschnitten oder ganz unsichtbar.',
          'Der Hinweis unter dem Stapel lag über den Karten.',
          'In der Tauschrunde flogen beim Antippen alle Karten noch einmal herein.',
          'Eine ausgewählte Tischkarte wurde auch bei den Gegnern markiert.',
        ],
      },
    ],
  },
  {
    v: '2.0',
    date: '2026-11-23',
    title: 'Neues Fundament',
    groups: [
      {
        h: 'Besser',
        items: [
          'Komplett neu aufgebaut, dadurch schneller und stabiler.',
          'Die Schriften kommen von dieser Seite selbst, nicht mehr von Google.',
          'Jede Änderung wird automatisch getestet, bevor sie online geht.',
        ],
      },
    ],
  },
  {
    v: '1.3',
    date: '2026-11-23',
    title: 'Shithead mit Biss',
    groups: [
      {
        h: 'Neu',
        items: [
          'Wer eine 4 hat, fängt an. Die anderen haben kurz Zeit, ihre 4er hinterherzuwerfen.',
          'Wer die fehlenden Karten zu vier Gleichen hat, darf sie jederzeit als Bombe einwerfen, auch außer der Reihe.',
          'Aufnehmen, Verbrennen und Bomben laufen sichtbar am Tisch ab.',
          'Übersicht der Sonderkarten neben dem Tisch.',
          'Reaktionen per Emoji und freche Sprüche zum Ergebnis.',
        ],
      },
    ],
  },
  {
    v: '1.2',
    date: '2026-11-23',
    title: 'KI am Tisch',
    groups: [
      {
        h: 'Neu',
        items: [
          'KI-Mitspieler für freie Plätze, die selbst spielen und ab und zu im Chat sticheln.',
          'Karten fliegen sichtbar über den Tisch.',
          'Punkteleiste oben mit Leben und Siegen.',
        ],
      },
    ],
  },
  {
    v: '1.1',
    date: '2026-11-23',
    title: 'Shithead',
    groups: [
      {
        h: 'Neu',
        items: [
          'Shithead als zweites Spiel, wählbar in der Lobby.',
          'Tauschrunde vor dem Start, offene und verdeckte Tischkarten, blind spielen am Ende.',
          'Sonderkarten 2, 3, 7, 8 und 10, einzeln an- und abschaltbar.',
        ],
      },
    ],
  },
  {
    v: '1.0',
    date: '2026-11-23',
    title: 'Schnautz online',
    groups: [
      {
        h: 'Neu',
        items: [
          'Schnautz im Browser für zwei bis vier Leute. Tisch eröffnen, Link schicken, losspielen.',
          'Bierdeckel als Leben, schwimmen nach dem letzten, Feuer mit drei Assen.',
          'Geber bekommt auf Wunsch ein zweites Blatt, klopfen beendet die Runde.',
          'Chat am Tisch, Töne und Wiedereinstieg nach einem Verbindungsabbruch.',
        ],
      },
    ],
  },
];

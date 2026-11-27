# Schnautz Online

Schnautz (Schwimmen, 31), Shithead, Durak und Cabo im Browser, alle vier mit bis zu acht Leuten. Einer eröffnet einen Tisch und schickt den Link, die anderen sitzen sofort mit am Tisch. Freie Plätze lassen sich mit KI-Mitspielern füllen, wer später kommt, übernimmt einen KI-Platz.

Live unter <https://tnd00.github.io/schnautz/>.

## So funktioniert es

Es gibt keinen eigenen Server. Die Browser verbinden sich direkt über WebRTC ([PeerJS](https://peerjs.com/)), der öffentliche PeerJS-Server vermittelt nur den ersten Kontakt. Der Browser, der den Tisch eröffnet, ist der Host: Er hält den vollständigen Spielzustand, prüft jeden Zug und schickt jedem Gast nur die Ansicht, die dieser sehen darf. Fremde Handkarten verlassen den Host also nie.

Lädt jemand die Seite neu, kann er mit einem Klick an denselben Platz zurück. Auch der Host kann seinen Tisch nach einem Neuladen fortsetzen, weil der Zustand im Browser gespeichert wird.

## Loslegen

Voraussetzung ist Node.js 22.12 oder neuer (empfohlen 24, siehe `.nvmrc`).

```bash
npm install
npm run dev
```

Danach läuft die Seite unter <http://localhost:5173>. Zum Ausprobieren reichen zwei Browserfenster: In einem den Tisch eröffnen, im anderen den Einladungslink öffnen.

In VS Code schlägt das Projekt beim ersten Öffnen die passenden Erweiterungen vor (ESLint, Prettier, Vitest, Playwright). Beim Speichern wird automatisch formatiert.

## Befehle

| Befehl               | Was passiert                                                    |
| -------------------- | --------------------------------------------------------------- |
| `npm run dev`        | Entwicklungsserver mit sofortigem Neuladen                      |
| `npm run build`      | Typen prüfen und die fertige Seite nach `dist/` bauen           |
| `npm run preview`    | Den Build aus `dist/` lokal ansehen                             |
| `npm test`           | Unit-Tests der Spiellogik (Vitest)                              |
| `npm run test:watch` | Unit-Tests bei jeder Änderung neu ausführen                     |
| `npm run test:e2e`   | Browser-Tests mit echten Partien über WebRTC (Playwright)       |
| `npm run test:fit`   | Nur der Layout-Wächter (`tests/e2e/fit.spec.ts`), vier Worker   |
| `npm run size`       | Baut nach `dist-size` und prüft die Größengrenze                |
| `npm run sim`        | Kalibriert die KI mit vielen ganzen Partien zwischen den Stufen |
| `npm run lint`       | ESLint, mit `lint:fix` werden einfache Probleme direkt behoben  |
| `npm run format`     | Alles mit Prettier formatieren                                  |
| `npm run check`      | Typen, Lint, Format und Unit-Tests auf einmal (wie in der CI)   |

Für die Browser-Tests einmal `npx playwright install chromium` ausführen. Sie starten selbst einen lokalen PeerServer und brauchen deshalb kein Internet. Ports und Build-Ordner lassen sich mit `PW_PORT`, `PEER_PORT` und `PW_DIST` umstellen, etwa wenn Port 9000 belegt ist. Mess-Skripte für das Layout liegen in `tests/design` (Aufrufe in der README dort). `PW_LOOK`, `PW_DECK` und `PW_THEME` legen Design, Kartendeck und Thema für einen Lauf fest, etwa `PW_LOOK=legacy npm run test:fit`. Ohne sie gilt Sticker mit Vinyl und `fit.spec.ts` misst Tisch und Ergebnisblatt in beiden Looks.

### Dev-Menü

Zum Testen am Tisch gibt es ein verstecktes Menü, auch auf der veröffentlichten Seite. Unter ⋯ → Updates fünfmal schnell auf die Versionszeile ganz unten tippen, danach steht „Dev-Menü“ im Menü ⋯. Der Host kann dort Partien im Zeitraffer bis kurz vor das Ende spulen (etwa für die Shithead-Zeremonie), die KI werfen lassen sowie Effekte und Klänge bei allen abspielen. Dazu kommen ein Protokoll mit Fehlern und Verbindungsereignissen, der rohe Verlauf und Infos zu Version, Verbindung, Gerät und Ton. Gäste sehen Infos und Logs, Effekte laufen bei ihnen nur selbst.

## Design und Kartendeck

Im Menü ⋯ unter „Design“ wählt jede Person für ihr Gerät zwischen dem Sticker-Look (Standard) und dem Legacy-Design, dem Filztisch bis 2.7. Das Kartendeck wählt man getrennt davon, Vinyl (Standard) oder Klassisch. Die Wahl geht nie ins Netz, am selben Tisch kann also jede Person einen anderen Look haben. Sticker und beide Decks stehen im Haupt-CSS, Legacy und das dunkle Thema laden erst nach, wenn jemand sie wählt (`src/ui/look.ts`).

## Aufbau

```
src/
  main.ts          Einstieg mit Schriften, Styles, Ereignissen und Startbildschirm
  game/            Spielregeln ohne Browser: Zustand, Züge, Ansichten pro Person
  bots/            Entscheidungen der KI-Mitspieler
  dev/             Verstecktes Dev-Menü, wird erst beim Öffnen geladen
  net/             Verbindung über PeerJS (Host, Gast, Nachrichten) und Taktung der KI am Tisch
  ui/              Oberfläche: Zeichnen, Animationen, Eingaben, Töne
    render/        Ein Modul pro Bildschirmbereich
    shithead/      Abläufe, 4er-Zeitfenster und Handkarten bei Shithead
  styles/          CSS, nach Bereichen aufgeteilt (Reihenfolge in index.css)
  content/         Namen und Sprüche der KI sowie Texte der Meldungen
tests/
  unit/            Spiellogik, darunter ein Fuzz-Test über 3000 Shithead-Partien
  e2e/             Zwei Browser spielen mit Playwright gegeneinander
  sim/             KI-Kalibrierung
public/            Dateien, die unverändert mitkommen (Favicon)
```

`game` kennt weder Browser noch Netzwerk. Die Ordner `bots`, `ui` und `net` bauen darauf auf. Deshalb lässt sich die komplette Spiellogik in Node testen und die KI spielt mit genau denselben Regeln wie Menschen.

## Veröffentlichen

Jeder Push auf `main` baut die Seite über GitHub Actions und veröffentlicht sie auf GitHub Pages (`.github/workflows/deploy.yml`). Vorher laufen Typprüfung, Lint, Formatprüfung und Unit-Tests, ein fehlerhafter Stand geht also nicht live. Die Browser-Tests laufen getrennt in der CI (`.github/workflows/ci.yml`) und halten die Veröffentlichung nicht auf.

In den Repository-Einstellungen muss unter Pages als Quelle „GitHub Actions“ ausgewählt sein.

## Spielregeln

Die Regeln aller Spiele öffnen auf der Startseite die Spiel-Sticker, ab der Lobby das Buch-Symbol oben rechts. Bei Shithead lässt sich in der Lobby einstellen, welche Sonderkarten gelten, bei Durak das Weiterschieben und bei Cabo Zielpunkte und Schnappen. Durak folgt den Regeln von [Pagat](https://pagat.com/beating/podkidnoy_durak.html) (Podkidnoy) mit 36 Karten bis sechs und 52 Karten ab sieben Leuten. Cabo folgt der zweiten Ausgabe von 2019, umgerechnet auf normale Karten: Ass 1, Bube 11, Dame 12, schwarzer König 13, roter König 0.

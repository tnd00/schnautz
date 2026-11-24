# Schnautz Online

Schnautz (Schwimmen, 31), Shithead und Durak im Browser, Schnautz und Durak mit bis zu acht, Shithead mit bis zu zehn Leuten. Einer eröffnet einen Tisch und schickt den Link, die anderen sitzen sofort mit am Tisch. Freie Plätze lassen sich mit KI-Mitspielern füllen, wer später kommt, übernimmt einen KI-Platz.

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
| `npm run sim`        | Kalibriert die KI mit vielen ganzen Partien zwischen den Stufen |
| `npm run lint`       | ESLint, mit `lint:fix` werden einfache Probleme direkt behoben  |
| `npm run format`     | Alles mit Prettier formatieren                                  |
| `npm run check`      | Typen, Lint, Format und Unit-Tests auf einmal (wie in der CI)   |

Für die Browser-Tests einmal `npx playwright install chromium` ausführen. Sie starten selbst einen lokalen PeerServer und brauchen deshalb kein Internet.

### Dev-Menü

Zum Testen am Tisch gibt es ein verstecktes Menü, auch auf der veröffentlichten Seite. Unter ⋯ → Updates fünfmal schnell auf die Versionszeile ganz unten tippen, danach steht „Dev-Menü“ im Menü ⋯. Der Host kann dort Partien im Zeitraffer bis kurz vor das Ende spulen (etwa für die Shithead-Zeremonie), die KI werfen lassen sowie Effekte und Klänge bei allen abspielen. Dazu kommen ein Protokoll mit Fehlern und Verbindungsereignissen, der rohe Verlauf und Infos zu Version, Verbindung, Gerät und Ton. Gäste sehen Infos und Logs, Effekte laufen bei ihnen nur selbst.

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

Die Regeln aller Spiele stehen in der App hinter dem Buch-Symbol oben rechts. Bei Shithead lässt sich in der Lobby einstellen, welche Sonderkarten gelten, bei Durak das Weiterschieben. Durak folgt den Regeln von [Pagat](https://pagat.com/beating/podkidnoy_durak.html) (Podkidnoy) mit 36 Karten bis sechs und 52 Karten ab sieben Leuten.

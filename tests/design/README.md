# Mess-Skripte für das Layout

Diese Skripte messen mit Playwright, ob am Bildschirm etwas scrollt oder abgeschnitten wird. Sie laufen ohne Testrunner gegen einen Dev-Server und einen lokalen PeerServer und schreiben ein Urteil pro Messung, dazu JSON und auf Wunsch Aufnahmen. Gedacht sind sie für die Bauzeit, der feste Wächter in der Testsuite ist `tests/e2e/fit.spec.ts`.

## Umgebung

Mit `--serve` starten die Skripte Dev-Server und PeerServer selbst und beenden sie am Ende wieder. Ohne `--serve` müssen beide schon laufen.

```sh
npx vite --port 5191 --strictPort --host 127.0.0.1 &
PEER_PORT=9191 node tests/e2e/peer-server.js &
node tests/design/sweep.mjs --port=5191 --peer=9191 --games=shithead --sizes=phone
```

Jede Einstellung geht als Argument oder als Umgebungsvariable, das Argument gewinnt.

| Argument    | Umgebung    | Bedeutung                                                |
| ----------- | ----------- | -------------------------------------------------------- |
| `--port=N`  | `PORT`      | Port des Dev-Servers, Standard 5173                      |
| `--peer=N`  | `PEER_PORT` | Port des PeerServers, Standard 9000                      |
| `--app=URL` | `APP`       | ganze Adresse der Seite statt `http://127.0.0.1:<port>/` |
| `--out=DIR` | `OUT`       | Ausgabeordner, Standard `schnautz-design` im Temp-Ordner |
| `--serve`   | `SERVE=1`   | Server selbst starten und beenden                        |
| `--shots`   |             | Aufnahmen nach `<out>/shots`                             |
| `--reduce`  | `REDUCE=1`  | „Bewegung reduzieren“ einschalten                        |
| `--headed`  | `HEADED=1`  | Browser sichtbar                                         |
|             | `PW_CHROME` | eigenes Chrome statt des Chromiums von Playwright        |

Die Ausgabe gehört nicht ins Repo. Liegt der Ordner doch darin, warnt das Skript.

## Skripte

| Skript          | Zweck                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `lib.mjs`       | gemeinsame Bausteine wie Kontext pro Größe, Tisch aufmachen, Plätze füllen, Zeitraffer, `measure` und `verdict` |
| `sweep.mjs`     | alles zusammen, also Spiele mal Rollen mal Zustände mal Größen                                                  |
| `lobby.mjs`     | Lobby am Handy mit beiden Reitern und am PC, frisch geladen oder per Größenwechsel                              |
| `result.mjs`    | Ergebnisblätter bei Partieende und Rundenende                                                                   |
| `szpreview.mjs` | Schnautz am PC, ob die Vorschau im Knopf „Tauschen“ die Reaktionsleiste wegschiebt                              |

## Aufrufe

```sh
# Alle vier Spiele als Gastgeber und Gast, Plan-Größen, mit Aufnahmen (rund 15 Minuten)
node tests/design/sweep.mjs --serve --roles=host,guest --shots --out=/tmp/schnautz-sweep

# Härtefall acht Plätze und Namen mit 16 Zeichen, nur Handy
node tests/design/sweep.mjs --serve --seats=8 --long --sizes=phone

# Nur Zustände Lobby, eigener Zug und offenes Fenster bei Durak
node tests/design/sweep.mjs --serve --games=durak --states=lobby,turn,modal

# Lobby mit „Bewegung reduzieren“, frisch geladen
node tests/design/lobby.mjs --serve --reduce --fresh --sizes=phone

# Ergebnisblätter zu acht mit langen Namen
node tests/design/result.mjs --serve --states=over,round --long

# Schnautz am PC mit vier und acht Plätzen
node tests/design/szpreview.mjs --serve --seats=4,8
```

Die Zustände von `sweep.mjs` heißen `lobby`, `swap` (Shithead-Tauschrunde), `turn` (eigener Zug), `modal` (Regeln offen), `round` (Rundenende bei Schnautz und Cabo) und `over` (Partieende). Größen gehen als `all`, `phone`, `phoneAll`, `desktop` oder als Liste wie `390x844,1280x720`. Handy und PC laufen in getrennten Kontexten, innerhalb einer Gruppe wechselt die Größe per `setViewportSize`.

Jedes Skript endet mit Code 1, wenn es einen Befund gibt. Höchstens zwei Skripte gleichzeitig laufen lassen, sonst kommen Zeitgrenzen beim Tisch aufmachen.

Der Dev-Server lädt die Seite neu, sobald sich eine Quelldatei ändert. Wer während einer Messung am Code arbeitet, bekommt einzelne Ausreißer wie eine fehlende Startleiste. Für verlässliche Zahlen während der Messung nichts unter `src` speichern.

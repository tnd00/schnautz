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
| `band.mjs`      | Meldungen am Tisch mit echten Effektwegen und allen Sprüchen des Topfs: Band am eigenen Zug, Grund, Fenster     |

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

# Ergebnisblätter mit Bereitmelden und Härtefällen, je Größe ein Lauf (Schnautz und Cabo starten nach 10 Sekunden neu)
node tests/design/result.mjs --serve --states=over,round --roles=host,guest --long --hard --ready --sizes=360x640

# Schnautz am PC mit vier und acht Plätzen
node tests/design/szpreview.mjs --serve --seats=4,8

# Meldungen am Tisch (src/ui/band.ts) als Gastgeber und Gast, nur Durak und Shithead am Handy
node tests/design/band.mjs --serve --games=durak,shithead --sizes=360x640,375x548 --shots
```

`result.mjs` kennt dazu diese Schalter. `--long` gibt allen Plätzen Namen mit 16 Zeichen, auch dem Gastgeber („Tahna-Kristoffer“). `--hard` stellt Härtefälle nach, die der Zufall selten trifft (Shithead und Durak mit 12 Restkarten und drei Tipps, Cabo daneben mit 6 Karten beim Rufer). `--ready` meldet den Gastgeber bereit und misst ihn mit Wartetext (`host-ready`), dazu zwei nachgestellte Lagen: fünf Leute fehlen noch (`host-crowd`) und der Gast ist bereit, der Gastgeber nicht (`guest-fake`). `--guest-ready` meldet stattdessen nur den Gast echt bereit (`guest-ready`), beides zusammen geht nicht, sonst beginnt die nächste Runde. Als Befund gelten gekürzte Namen in den Zeilen (Feld `cutNames`), ein gekürzter Wartetext und eine Knopfreihe, die umbricht. Gekürzt heißt dabei mit Bruchteilen gemessen wie `overflows` in `src/ui/render/result.ts`, denn `scrollWidth` ist gerundet. Ein Befund ist auch, wenn die Zahl der sichtbaren ⏳ nicht zu denen passt, auf die gewartet wird. Je Messung nennt die Ausgabe, wie viele Zeilen die Kurzform der Kernzahl zeigen, einen kleineren Namen haben oder die Kernzahl unter dem Namen (`kurz`, `klein`, `darunter`, siehe `fitRows`), dazu Zeilen ohne sichtbare Kernzahl (`leer`) und die Höhe aller Zeilen (`h`), um sie vor und nach dem Bereitmelden zu vergleichen. Auch ein Wartetext, der erst mit einer späteren Zahl des Countdowns kippen würde, ist ein Befund.

`band.mjs` prüft je Spiel, Rolle und Größe: die Shithead-Tauschrunde, Hinweis und Spruch zusammen am eigenen Zug (jeder Spruch des Topfs mit „Lena“ und einem Namen mit 16 Zeichen), große Meldungen vollständig und nie über Stapel, Regelzeile, Gegnern, eigenem Platz oder Knöpfen der Statuszeile (stehen dort 4er- oder Bombe-Knöpfe, darf der Stapel weichen, das zählt als „ok, Stapel weicht den Knöpfen“), Grund und Automatisches über einer großen Meldung ohne die Hauptzeile der Statuszeile zu decken (bleibt daneben nicht einmal ihr ganzer Titel, schließt die große Meldung, das zählt als „ok, große geschlossen“, weicht Automatisches dem Grund, muss es danach erscheinen, das zählt als „ok, gewichen und nachgeholt“), den Grund beim Spionieren in Cabo, kleine Meldungen höchstens 8 px auf dem Rand des eigenen Platzes, kein neues Einblenden beim Zugwechsel (je Größe am Ende des eigenen Zugs, bei Durak endet er durch Passen oder Aufnehmen), Meldungen bei offenem Reaktionsfenster am eigenen Zug und nicht am Zug (müssen sie über den Stapel, decken sie seine Regelzeile ganz oder gar nicht), als Gastgeber den Knopf „Für … spielen“, den keine Meldung deckt (`playfor`, dafür sind alle KIs kurz offline), sowie Sitzmeldungen bei offenem Ergebnisblatt am Rundenende und am Partieende in jeder Größe. Schneidet die Bühne (große Meldung, Hinweis mit Spruch) die Hauptzeile der Statuszeile an oder mindestens ein Drittel der Unterzeile, ist das ein Befund (was kleine Meldungen daneben vom Rest der Zeile decken, zählt mit, eine Lücke mitten in der Zeile nicht), auch bei einer großen Meldung, die neben Grund und Automatischem stehen bleibt. Ein kleinerer Anschnitt der Unterzeile steht als Vermerk in der Zusammenfassung. Zeilen mit „info, …“ hatten nichts zu prüfen, etwa wenn die große Meldung nach dem Zugwechsel im Band bleibt. In `band.json` stehen je Messung die Kanten der Umgebung (`geo`). Mit `--checks=swap,pair,big,reason,spy,emoturn,still,emo,playfor,seat` lässt sich das eingrenzen. Es lädt die Module über `/src` und läuft deshalb gegen den Dev-Server. Gegen einen Build geht es nur, wenn der Build dieselben Module als `window.__probe` mitbringt (`feedback`, `helpers`, `taunts`, `seat`, `effects`, `tauntUi`, `fx` je Spiel).

Die Zustände von `sweep.mjs` heißen `lobby`, `swap` (Shithead-Tauschrunde), `turn` (eigener Zug), `modal` (Regeln offen), `round` (Rundenende bei Schnautz und Cabo) und `over` (Partieende). Größen gehen als `all`, `phone`, `phoneAll`, `desktop` oder als Liste wie `390x844,1280x720`. Handy und PC laufen in getrennten Kontexten, innerhalb einer Gruppe wechselt die Größe per `setViewportSize`.

Jedes Skript endet mit Code 1, wenn es einen Befund gibt. Höchstens zwei Skripte gleichzeitig laufen lassen, sonst kommen Zeitgrenzen beim Tisch aufmachen.

Der Dev-Server lädt die Seite neu, sobald sich eine Quelldatei ändert. Wer während einer Messung am Code arbeitet, bekommt einzelne Ausreißer wie eine fehlende Startleiste. Für verlässliche Zahlen während der Messung nichts unter `src` speichern.

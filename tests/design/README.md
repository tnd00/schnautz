# Mess-Skripte für das Layout

Diese Skripte messen mit Playwright, ob am Bildschirm etwas scrollt oder abgeschnitten wird. Sie laufen ohne Testrunner gegen einen Dev-Server und einen lokalen PeerServer und schreiben ein Urteil pro Messung, dazu JSON und auf Wunsch Aufnahmen. Gedacht sind sie für die Bauzeit, der feste Wächter in der Testsuite ist `tests/e2e/fit.spec.ts`. `measure` meldet außerdem Eckaufkleber und Etiketten der Gegnerkacheln, die ein Vorfahr oben oder unten abschneidet oder die übereinander liegen (wie `fitFindings`), und Knöpfe am Tisch mit weniger als 44 px Tippfläche. Dazu kommen Überschneidungen am Tisch aus `tests/e2e/overlap.ts` (dieselbe Prüfung steckt in `fitFindings`): Kurzhinweise und große Meldungen untereinander und gegen Uhr, Pillen, Gegnerkacheln und Statuszeile, die Uhr gegen Pillen, fremde Kacheln, Statuszeile und eigene Handkarten, eigene Handkarten gegen Knöpfe der Knopfleiste sowie an jeder Gegnerkachel Eckaufkleber, Etikett, KI-Zeichen, Name und Pille untereinander. Ein Befund nennt beide Elemente und die Schnittfläche (`Überlappung A / B 59x11 px`), bei Uhr, Handkarten gegen Knöpfe und Pille gegen KI-Zeichen oder Name zählt auch ein Abstand unter 4 px (unter 2 px) als `Abstand A / B 0 px`. Unsichtbares, Durchsichtiges und alles außerhalb des Bildes zählt nicht.

## Umgebung

Mit `--serve` starten die Skripte Dev-Server und PeerServer selbst und beenden sie am Ende wieder. Ohne `--serve` müssen beide schon laufen.

```sh
npx vite --port 5191 --strictPort --host 127.0.0.1 &
PEER_PORT=9191 node tests/e2e/peer-server.js &
node tests/design/sweep.mjs --port=5191 --peer=9191 --games=shithead --sizes=phone
```

Jede Einstellung geht als Argument oder als Umgebungsvariable, das Argument gewinnt.

| Argument    | Umgebung    | Bedeutung                                                          |
| ----------- | ----------- | ------------------------------------------------------------------ |
| `--port=N`  | `PORT`      | Port des Dev-Servers, Standard 5173                                |
| `--peer=N`  | `PEER_PORT` | Port des PeerServers, Standard 9000                                |
| `--app=URL` | `APP`       | ganze Adresse der Seite statt `http://127.0.0.1:<port>/`           |
| `--out=DIR` | `OUT`       | Ausgabeordner, Standard `schnautz-design` im Temp-Ordner           |
| `--serve`   | `SERVE=1`   | Server selbst starten und beenden                                  |
| `--shots`   |             | Aufnahmen nach `<out>/shots`                                       |
| `--reduce`  | `REDUCE=1`  | „Bewegung reduzieren“ einschalten                                  |
| `--headed`  | `HEADED=1`  | Browser sichtbar                                                   |
| `--look=L`  | `LOOK`      | `schnautz:design` vor dem Laden setzen, Liste wie `sticker,legacy` |
| `--deck=D`  | `DECK`      | `schnautz:deck` vor dem Laden setzen, `vinyl` oder `classic`       |
| `--theme=T` | `THEME`     | `schnautz:theme` vor dem Laden setzen, Liste wie `light,dark`      |
|             | `PW_CHROME` | eigenes Chrome statt des Chromiums von Playwright                  |

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
| `look.mjs`      | Stil-Fingerabdruck: berechnete Stile der Tischbausteine je Spiel und Zustand gegen `legacy-ref.json`            |

## Aufrufe

```sh
# Alle vier Spiele als Gastgeber und Gast, Plan-Größen, mit Aufnahmen (rund 15 Minuten)
node tests/design/sweep.mjs --serve --roles=host,guest --shots --out=/tmp/schnautz-sweep

# Härtefall acht Plätze und Namen mit 16 Zeichen, nur Handy
node tests/design/sweep.mjs --serve --seats=8 --long --sizes=phone

# Krone und Verlierer-Zeichen an KI-Plätzen (wie die Fixture sh-reign-4), vier Plätze
node tests/design/sweep.mjs --serve --games=shithead --seats=4 --reign --sizes=390x844,360x640

# Dazu eine KI offline (Zeichen am Namen), acht Plätze mit langen Namen am kurzen Handy
node tests/design/sweep.mjs --serve --seats=8 --long --reign --offline --states=turn --sizes=375x548,360x640

# Nur Zustände Lobby, eigener Zug und offenes Fenster bei Durak
node tests/design/sweep.mjs --serve --games=durak --states=lobby,turn,modal

# Überschneidungen am eigenen Zug mit Uhr und Kurzhinweis, Durak in der Verteidigung
node tests/design/sweep.mjs --serve --games=shithead,durak,schnautz --states=swap,turn --defend --sizes=375x548,390x844

# Lobby mit „Bewegung reduzieren“, frisch geladen
node tests/design/lobby.mjs --serve --reduce --fresh --sizes=phone

# Ergebnisblätter zu acht mit langen Namen
node tests/design/result.mjs --serve --states=over,round --long

# Ergebnisblätter mit Bereitmelden und Härtefällen, je Größe ein Lauf (Schnautz und Cabo starten nach 10 Sekunden neu)
node tests/design/result.mjs --serve --states=over,round --roles=host,guest --long --hard --ready --sizes=360x640

# Schnautz am PC mit vier und acht Plätzen
node tests/design/szpreview.mjs --serve --seats=4,8

# Menü ⋯ am Tisch offen, je Look und Thema eine eigene Ausgabe (sweep-legacy-light.json, sweep-legacy-dark.json)
node tests/design/sweep.mjs --serve --states=turn,menu --sizes=375x548,360x640 --look=legacy --theme=light,dark

# Stil-Fingerabdruck gegen tests/design/legacy-ref.json vergleichen (rund 5 Minuten), --update nimmt ihn neu auf
node tests/design/look.mjs --serve
node tests/design/look.mjs --serve --update

# Meldungen am Tisch (src/ui/band.ts) als Gastgeber und Gast, nur Durak und Shithead am Handy
node tests/design/band.mjs --serve --games=durak,shithead --sizes=360x640,375x548 --shots

# Kleine Meldung an der Stapelkante, dann eine große, nicht am eigenen Zug (Bombe außer der Reihe, 4er und vier voll)
node tests/design/band.mjs --serve --games=shithead --checks=under --sizes=390x844,360x640 --shots
```

`result.mjs` kennt dazu diese Schalter. `--long` gibt allen Plätzen Namen mit 16 Zeichen, auch dem Gastgeber („Tahna-Kristoffer“). `--hard` stellt Härtefälle nach, die der Zufall selten trifft (Shithead und Durak mit 12 Restkarten und drei Tipps, Cabo daneben mit 6 Karten beim Rufer). `--ready` meldet den Gastgeber bereit und misst ihn mit Wartetext (`host-ready`), dazu zwei nachgestellte Lagen: fünf Leute fehlen noch (`host-crowd`) und der Gast ist bereit, der Gastgeber nicht (`guest-fake`). `--guest-ready` meldet stattdessen nur den Gast echt bereit (`guest-ready`), beides zusammen geht nicht, sonst beginnt die nächste Runde. Als Befund gelten gekürzte Namen in den Zeilen (Feld `cutNames`), ein gekürzter Wartetext und eine Knopfreihe, die umbricht. Gekürzt heißt dabei mit Bruchteilen gemessen wie `overflows` in `src/ui/render/result.ts`, denn `scrollWidth` ist gerundet. Ein Befund ist auch, wenn die Zahl der sichtbaren ⏳ nicht zu denen passt, auf die gewartet wird. Je Messung nennt die Ausgabe, wie viele Zeilen die Kurzform der Kernzahl zeigen, einen kleineren Namen haben oder die Kernzahl unter dem Namen (`kurz`, `klein`, `darunter`, siehe `fitRows`), dazu Zeilen ohne sichtbare Kernzahl (`leer`) und die Höhe aller Zeilen (`h`), um sie vor und nach dem Bereitmelden zu vergleichen. Auch ein Wartetext, der erst mit einer späteren Zahl des Countdowns kippen würde, ist ein Befund.

`band.mjs` prüft je Spiel, Rolle und Größe: die Shithead-Tauschrunde, Hinweis und Spruch zusammen am eigenen Zug (jeder Spruch des Topfs mit „Lena“ und einem Namen mit 16 Zeichen), große Meldungen vollständig und nie über Stapel, Regelzeile, Gegnern, eigenem Platz oder Knöpfen der Statuszeile (stehen dort 4er- oder Bombe-Knöpfe, darf der Stapel weichen, das zählt als „ok, Stapel weicht den Knöpfen“), Grund und Automatisches über einer großen Meldung ohne die Hauptzeile der Statuszeile zu decken (bleibt daneben nicht einmal ihr ganzer Titel, schließt die große Meldung, das zählt als „ok, große geschlossen“, weicht Automatisches dem Grund, muss es danach erscheinen, das zählt als „ok, gewichen und nachgeholt“), den Grund beim Spionieren in Cabo, kleine Meldungen höchstens 8 px auf dem Rand des eigenen Platzes, kein neues Einblenden beim Zugwechsel (je Größe am Ende des eigenen Zugs, bei Durak endet er durch Passen oder Aufnehmen), Meldungen bei offenem Reaktionsfenster am eigenen Zug und nicht am Zug (müssen sie über den Stapel, decken sie seine Regelzeile ganz oder gar nicht), als Gastgeber den Knopf „Für … spielen“, den keine Meldung deckt (`playfor`, dafür sind alle KIs kurz offline), nicht am Zug eine große Meldung, während schon eine kleine an der Stapelkante steht (`under`: bei Shithead eine Bombe außer der Reihe mit dem längsten Spruch des Topfs und „wirft 4er rein“, danach macht jemand die vier voll, sonst ein Hinweis und die große Meldung des Spiels), die kleine darf die große nicht schneiden und blendet dann aus („ok, kleine ausgeblendet“), sowie Sitzmeldungen bei offenem Ergebnisblatt am Rundenende und am Partieende in jeder Größe. Schneidet die Bühne (große Meldung, Hinweis mit Spruch) die Hauptzeile der Statuszeile an oder mindestens ein Drittel der Unterzeile, ist das ein Befund (was kleine Meldungen daneben vom Rest der Zeile decken, zählt mit, eine Lücke mitten in der Zeile nicht), auch bei einer großen Meldung, die neben Grund und Automatischem stehen bleibt. Ein kleinerer Anschnitt der Unterzeile steht als Vermerk in der Zusammenfassung. Zeilen mit „info, …“ hatten nichts zu prüfen, etwa wenn die große Meldung nach dem Zugwechsel im Band bleibt. In `band.json` stehen je Messung die Kanten der Umgebung (`geo`). Mit `--checks=swap,pair,big,reason,spy,emoturn,still,under,emo,playfor,seat` lässt sich das eingrenzen. Es lädt die Module über `/src` und läuft deshalb gegen den Dev-Server. Gegen einen Build geht es nur, wenn der Build dieselben Module als `window.__probe` mitbringt (`feedback`, `helpers`, `taunts`, `seat`, `effects`, `tauntUi`, `fx` je Spiel). Ein Lauf misst einen Look, gewählt über `--look` und `--theme` wie in `lib.mjs`, ohne Angabe gilt der Standard der Seite.

Die Zustände von `sweep.mjs` heißen `lobby`, `swap` (Shithead-Tauschrunde), `turn` (eigener Zug), `menu` (Menü ⋯ am Tisch offen, Befund ist ein Bogen, der in sich scrollt oder einen Eintrag abschneidet), `modal` (Regeln offen), `round` (Rundenende bei Schnautz und Cabo) und `over` (Partieende). Am Tisch läuft das Zeitlimit (`--clock=60`, `--clock=0` schaltet es aus) und vor jeder Messung in `swap` und `turn` tippt das Skript eine ausgegraute Karte oder einen ausgegrauten Knopf an, damit ein Kurzhinweis steht. Bis zum eigenen Zug spielen die KIs flott. `--defend` misst bei Durak als eigenen Zug nur die Verteidigung gegen eine offene Angriffskarte, bis dahin zieht die KI-Logik für den Gastgeber. Größen gehen als `all`, `phone`, `phoneAll`, `desktop` oder als Liste wie `390x844,1280x720`. Handy und PC laufen in getrennten Kontexten, innerhalb einer Gruppe wechselt die Größe per `setViewportSize`.

`look.mjs` hält je Spiel, Zustand und Größe (Standard `390x844,1280x860`, vier Plätze) für eine feste Liste von Rollen (Zuordnung Rolle zu Selektor oben im Skript, etwa Gegnerkachel, Statuszeile, Stapel, Ergebniszeile) den berechneten Stil des ersten sichtbaren Treffers fest: Farben, Verläufe, Ränder, Rundungen, Schatten, Schriftart, Schnitt, Gewicht, Größe und Deckkraft. Die Zustände heißen wie beim Sweep, dazu kommen `msg` (Meldung, Toast und Hinweis über die Module des Dev-Servers) und `wait` (ein Gegner am Zug). Ohne `--update` vergleicht es gegen `--ref` (Standard `tests/design/legacy-ref.json`), Farben als Zahlen mit Toleranz. Jede Abweichung ist ein Befund. Fehlende Rollen sind nur Vermerke. `--look`, `--deck` und `--theme` nehmen hier je einen Wert, ohne Angabe gilt `--look=legacy --deck=classic` wie in der Referenz. Damit zwei Läufe gleich ausfallen, ist `Math.random` fest, die KIs halten am eigenen Zug an und Animationen sind während der Messung aus. Die Referenz erneuert nur, wer es mit `--update` tut und im Commit in einem Satz sagt, warum.

Jedes Skript endet mit Code 1, wenn es einen Befund gibt. Höchstens zwei Skripte gleichzeitig laufen lassen, sonst kommen Zeitgrenzen beim Tisch aufmachen.

Der Dev-Server lädt die Seite neu, sobald sich eine Quelldatei ändert. Wer während einer Messung am Code arbeitet, bekommt einzelne Ausreißer wie eine fehlende Startleiste. Für verlässliche Zahlen während der Messung nichts unter `src` speichern.

## Feste Spielstände und Bildvergleich

`fixtures.mjs` spielt am Dev-Server echte Tische bis zu einem Zustand und legt ab, was der Gastgeber in `localStorage['schnautz:host']` speichern würde. Die KIs stehen dabei (`BOTS.hold`), gezogen wird sofort im Gastgeber wie beim Zeitraffer. Die Stände liegen in `fixtures/<kürzel>-<zustand>-<plätze>.json`, je Spiel Lobby, eigener Zug, Warten, Gast am Zug, Rundenende (Cabo, Schnautz), Partieende, Tauschrunde (Shithead) und der Härtefall acht Plätze mit Namen aus 16 Zeichen. Neu erzeugen nur, wenn sich das Format des Spielstands ändert, danach braucht der Bildvergleich neue Vorlagen. `sh-reign-4` ist von Hand aus `sh-turn-4` abgeleitet: Uschi trägt die Krone, Gitti ist amtierender Shithead (zweimal), damit Eckaufkleber und KI-Zeichen am selben Platz im Bild sind. Wer `sh-turn-4` neu erzeugt, leitet ihn wieder ab.

```sh
node tests/design/fixtures.mjs --serve --port=5311 --peer=9311
node tests/design/fixtures.mjs --serve --port=5311 --peer=9311 --only=sh-turn-4,dk-over-4
```

`tests/visual/table.visual.ts` lädt jeden Stand bei 390x844, 360x640, 375x548 und 1280x720, tippt „Fortsetzen“ (beim Gast „Zurück an den Tisch“), hält die Uhr der Seite an (`page.clock`, festes Datum) und vergleicht die ganze Seite per `toHaveScreenshot`. Am eigenen Zug mit vier Plätzen kommt das offene Menü dazu. Die Vorlagen liegen außerhalb des Repos unter `/Users/tnd/schnautz-2-8/visual-ref/<look>-<thema>/` und gelten nur auf derselben Maschine mit dem Chromium von Playwright.

```sh
# Vorlagen aufnehmen (auf dem Stand, gegen den später verglichen wird)
PW_FAST=1 npx playwright test -c playwright.visual.config.ts --update-snapshots
# Vergleichen, erlaubt sind 0,05 % abweichende Pixel
PW_FAST=1 npx playwright test -c playwright.visual.config.ts
# Probe auf Stabilität, jedes Pixel muss gleich sein
PW_VISUAL_STRICT=1 PW_FAST=1 npx playwright test -c playwright.visual.config.ts
```

| Umgebung           | Bedeutung                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `PW_LOOK`          | setzt `schnautz:design` vor dem Laden, Standard `sticker`, steht im Pfad                            |
| `PW_DECK`          | setzt `schnautz:deck`, Standard `classic` unter Legacy und `vinyl` unter Sticker (wie die Vorlagen) |
| `PW_THEME`         | setzt `schnautz:theme` und `data-theme` an `<html>`, Standard `light`                               |
| `PW_VISUAL_REF`    | Ordner der Vorlagen                                                                                 |
| `PW_PORT`          | Port der Vorschau, Standard 5312                                                                    |
| `PEER_PORT`        | Port des PeerServers, Standard 9312                                                                 |
| `PW_DIST`          | Build-Ordner, Standard `/Users/tnd/schnautz-2-8/bild/dist`                                          |
| `PW_FAST`          | baut ohne Typprüfung                                                                                |
| `PW_VISUAL_STRICT` | keine einzige Abweichung erlaubt                                                                    |
| `PW_WORKERS`       | Zahl der Worker, Standard 4                                                                         |

Ein Lauf dauert rund zwei Minuten (108 Tests, 124 Bilder). Schlägt ein Vergleich fehl, liegen Vorlage, Aufnahme und Differenzbild unter `/Users/tnd/schnautz-2-8/bild/results`.

## CSS-Vergleich

`cssdiff.mjs` wacht beim Umbau der Stile auf Tokens darüber, dass sich im Ergebnis nichts ändert, auch an Stellen, die der Bildvergleich nicht zeigt (Band, Meldungen, Toasts, Emoji-Menü, Chat, Grund am Tisch). Es liest `src/styles/index.css` samt aller `@import` in Reihenfolge einmal aus git (`--base`, Standard `cfb5e08`) und einmal aus dem Arbeitsbaum, ganz ohne Vite und TypeScript. Beide Fassungen laden als je ein `<style>` pro Datei in Chromium (`PW_CHROME` gilt), das Skript läuft über das CSSOM samt `@media`, `@supports`, `@container`, `@keyframes` und `@font-face`. Jede Regel landet auf einer Probe im Shadow-Root, damit keine andere Regel sie trifft, und wird über die Langformen aus `getComputedStyle` verglichen, einmal ohne Spielklasse und einmal je Spiel unter `body.ingame.g-<spiel>` mit `#table[data-game]`. Farben zählen als gleich bis 1 je Kanal und 0,01 Alpha, auch in Schatten, Verläufen und Rändern, `color-mix()` und `rgba()` mit gleichem Ergebnis sind also gleich.

```sh
node tests/design/cssdiff.mjs                         # Arbeitsbaum gegen cfb5e08, rund 7 Sekunden
node tests/design/cssdiff.mjs --only=fit.css,table/fit-shithead.css
node tests/design/cssdiff.mjs --base=HEAD --out=/tmp/cssdiff
node tests/design/cssdiff.mjs --selftest              # rund 35 Sekunden
```

Befunde mit Exit 1 sind `geändert` (Datei, Selektor, Langform, alt und neu aufgelöst, betroffene Kontexte), `fehlt`, `neu`, `unaufgelöst` (eine Variable ohne Ersatzwert ist im neuen Stand nicht definiert), `reihenfolge` (zwei Regeln mit gleicher Spezifität, gleichem Pseudo-Element und gemeinsamer Langform stehen im ganzen Strom jetzt umgekehrt), `Verlauf-Raum` (ein Verlauf rechnet jetzt in einem anderen Farbraum, etwa weil ein Stopp aus `color-mix()` ohne „in srgb“ Chrome auf Oklab umschalten lässt), `Kontext` (eine Regel löst nur unter einer Regel anders auf, die unterhalb von `:root` Variablen setzt, etwa ein Token auf `:root` statt `var(--display)` unter `.paper.sheet`) sowie `import-fehlt`, `import-reihenfolge` und `datei-fehlt` für `index.css`. Nur Hinweise sind `verschoben` (gleiche Regel in anderer Datei, etwa beim Aufteilen von `fit.css`), `import-neu` und `neu-erwartet` (neue Regeln in `a11y.css`). Ein Block unter `@media (prefers-reduced-motion: reduce)` und dieselben Regeln mit `:where(html.calm)` davor (für `html` und `:root` als `html:where(.calm)` und `:root:where(.calm)`, bei kombinierter Abfrage bleibt der Rest der Abfrage stehen) gelten als gleich. Regeln werden über Kontext, Selektor und Stelle zugeordnet. `--only` beschränkt Ausgabe und Exit-Code auf Dateien. Auf der Konsole stehen höchstens 40 Zeilen, alles Weitere in `<out>/cssdiff.json` (Standard `/Users/tnd/schnautz-2-8/r2/cssdiff`).

Der Selbsttest vergleicht die Basis mit sich selbst und mit veränderten Kopien in einem Temp-Ordner. Ohne Befund müssen bleiben ein Literal durch ein Token mit gleichem Wert, ein Verlaufsstopp aus `color-mix()` mit „in srgb“, ein Token, dessen Variable nirgends unterhalb von `:root` gesetzt wird, `rgba()` gegen gleiches `color-mix()`, eine Kurzform gegen ihre Langformen, alle Blöcke `prefers-reduced-motion` auf `:where(html.calm)` und drei Blöcke in eine eigene Datei direkt hinter `fit.css` (nur `verschoben`). Gefunden werden müssen ein Farbkanal um 2 daneben, ein Schatten mit anderer Deckkraft, ein Token ohne Definition, derselbe Verlaufsstopp ohne „in srgb“, `var(--tb-display)` mit `--tb-display: var(--display)` auf `:root` an einer Stelle, die vorher `var(--display)` las, Ruhig ohne `:where` und eine Grundregel hinter ihrer Media-Überschreibung.

Das Skript misst nur Legacy hell bei 390x844. Den Farbraum eines Verlaufs bestimmt es aus der Angabe „in <raum>“, sonst aus den Stopps (alle klassisch heißt sRGB, sonst Oklab), und zwar an der Regel, die den Verlauf zeichnet, nicht an der Variable. Weil Chrome beim Serialisieren der Regel ein „in srgb“ fallen lässt, wird es vor dem Laden zu „in xyz-d50“ und zählt beim Vergleich wieder als sRGB. Für `Kontext` sammelt es alle Regeln, die unterhalb von `:root` eine Variable setzen (unter `@media` nur, wenn die Abfrage bei 390x844 gilt), und löst jede Regel, die `var(--tb-*)` oder eine dieser Variablen liest, zusätzlich unter einem Wirt auf, der die Variablen der Kontextregel inline trägt, ohne Spielklasse. Ob die Regel je unter diesem Kontext steht, weiß es nicht, ein Token, das dort anders auflöst, ist deshalb immer ein Befund. Jede Regel landet auf einer frischen Probe, damit `transition` keinen Startwert der vorigen Regel liefert. Variablen, die erst an einem Baustein selbst entstehen (etwa `--tw` an einer Gegnerkachel), löst die Probe nicht auf, dort vergleicht das Skript den Text der Deklaration. Ob zwei Regeln je dasselbe Element treffen, weiß es nicht, eine Umkehr bei gleicher Spezifität ist deshalb immer ein Befund. Wird eine Regel geteilt oder werden Selektorlisten neu gemischt, steht das als `fehlt` und `neu` da.

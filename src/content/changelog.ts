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
    v: '2.8',
    date: '2026-11-26',
    title: 'Neuer Tisch',
    groups: [
      {
        h: 'Neu',
        items: [
          'Im Menü ⋯ gibt es „Bedienung“. Dort stellst du Ruhig (weniger Bewegung), die Lautstärke, den Ton bei deinem Zug und am Android-Handy die Vibration ein.',
          'Gibt es eine neue Version, lädt die Seite von selbst neu, sobald gerade nichts passiert. Danach sitzt du wieder an deinem Platz. So spielen alle am Tisch immer mit derselben Version.',
        ],
      },
      {
        h: 'Besser',
        items: [
          'Am Handy stehen Regeln und Bestenliste am Tisch nur noch oben in der Kopfzeile, das Menü ist dadurch kürzer.',
          'Der Ton, wenn du dran bist, kommt nur noch, wenn du gerade woanders hinschaust. In „Bedienung“ kannst du ihn immer oder nie spielen lassen.',
          'Mit der Tastatur wandern die Pfeiltasten durch deine Karten, Escape hebt die Auswahl auf und Umschalt mit Enter spielt aus.',
          'Wer mit Vorleser spielt, hört, wann er dran ist, was ihn betrifft und warum ein Zug gerade nicht geht.',
          'Kleine Schrift am Tisch ist größer, etwa an den Plätzen und am Stapel. Bei Shithead lassen sich die Knöpfe leichter treffen.',
          'Bei Shithead steht die Zahl der Handkarten unten an jedem Platz, Krone und 💩 kleben auf der Ecke. So bleibt mehr Platz für den Namen.',
          'Bei Shithead sagen gesperrte Knöpfe beim Antippen, warum es gerade nicht geht. Ein Tipp kurz nach einem Wechsel der Knöpfe trifft nicht aus Versehen den falschen. Mit der Tastatur erreichst du jede Karte und jeden Knopf.',
          'Am PC zu acht überlappen die Plätze oben nicht mehr, auch nicht auf kleinen Bildschirmen.',
          'Bei Durak sagen gesperrte Knöpfe beim Antippen, warum es gerade nicht geht.',
          'Die Punkteleiste oben ist weg. Punkte und Leben stehen bei Cabo und Schnautz unten an jedem Platz, Krone und Verlierer-Zeichen kleben in allen vier Spielen auf der Ecke. Siege zählt weiter die Bestenliste.',
          'Bei Durak trägt der Trumpf in deiner Hand einen Stern, die Farbe allein reicht nicht mehr.',
          'Bei Schnautz steht die Runde in der Tischmitte. Am Rundenende zeigt eine Plakette am Platz, wer ein Leben verliert, wer schwimmt und wer raus ist.',
          'Am Handy liegt das Menü für Reaktionen, Klänge und Würfe genau über deinem Platz. Ein Tipp auf einen Gegner öffnet eine Reihe zum Werfen.',
          'Bei Cabo bricht „Eintauschen“ nicht mehr in zwei Zeilen um.',
          'Am Handy zeigt ein 📴 vor dem Namen, wer offline ist.',
          'Bei Schnautz trägt die beste Hand einer Runde 🏅, die Krone bleibt für Sieger.',
        ],
      },
    ],
  },
  {
    v: '2.7',
    date: '2026-11-26',
    title: 'Klare Worte',
    groups: [
      {
        h: 'Neu',
        items: [
          'Spielen nur noch KIs, spult der Gastgeber die Partie mit „⏩ Vorspulen“ zügig zu Ende. Zeremonie, Tipps und Bestenliste laufen wie immer.',
          'Freie Plätze bleiben in der Lobby frei, bis die Partie startet. Erst dann setzt sich die KI dazu. Der Startknopf sagt, wie viele KIs mitspielen. Wer mag, holt eine KI schon vorher an den Tisch.',
          'Kommst du per Einladungslink an deinen Tisch zurück, landest du mit deinem Namen wieder auf deinem Platz. Einen zweiten Platz „Lena 2“ gibt es nicht mehr.',
          'Nach dem Neuladen geht es am Tisch ohne Tippen zurück an deinen Platz.',
          'Dein Tisch läuft immer nur in einem Tab. Öffnest du ihn ein zweites Mal, fragt die Seite „Hierher holen?“ und der alte Tab gibt ab.',
          'In der Lobby nimmt der Gastgeber auch Leute vom Platz, die gerade offline sind.',
          'Geht ein Zug nicht, wackelt die angetippte Karte und der Grund steht direkt am Tisch statt in einer Meldung am Rand. Ausgegraute Karten lassen sich in allen vier Spielen antippen und sagen, warum sie gerade nicht gehen, bei Schnautz und Cabo auch die Knöpfe. Das gilt auch für Gäste.',
          'Die Statuszeile sieht in allen vier Spielen gleich aus. Sie sagt immer, wer dran ist und was jetzt zu tun ist. Ihre Höhe bleibt gleich, damit Stapel und Karten nicht springen.',
          'Das Ergebnisblatt ist in allen vier Spielen gleich aufgebaut. Oben steht mit Karten, um wen es geht, also der Shithead, der Durak, wer Cabo gerufen hat oder bei Schnautz ein Leben verliert. Darunter folgen deine eigene Zeile und alle anderen. Zu acht passt es am Handy ohne Scrollen und auch lange Namen stehen ganz da.',
          'Kommen, Gehen, Zurückkommen und Übernahmen erscheinen auch am Tisch, etwa „Lena setzt sich an Uschis Platz.“ Läuft bei anderen die Zeit ab, steht kurz „⏰ Zeit um, die KI spielt einmal für Lena.“ da.',
        ],
      },
      {
        h: 'Besser',
        items: [
          'Bei Durak legt erst wieder nach, wer gepasst hat, wenn durch Schlagen ein neuer Wert auf den Tisch kommt oder aufgenommen wird. Der Knopf heißt jetzt „Passen“ und abgewehrte Karten gehen auf den Bito-Stapel.',
          'Überall gelten dieselben Wörter. In der Shithead-Tauschrunde meldest du dich „Bereit“, bei Cabo heißen die Fähigkeiten Ansehen, Spionieren und Blindtausch. Fertig ist, wer alle Karten los ist. „Zeit um!“ klingt in jedem Spiel gleich.',
          'Der Verlauf nennt wieder die richtigen Namen. „Jemand hat 31“ und „Du ist gegangen“ sind Geschichte. Übernimmt jemand einen KI-Platz, steht dort nicht mehr „Du (KI)“. In der Lobby ist dabei auch nicht mehr von Karten die Rede.',
          'Eine Bombe im 4er-Fenster heißt nur noch außer der Reihe, wenn wirklich jemand anderes dran war.',
          'Tipp-Sprüche bei Durak sticheln jetzt mit dem Durak statt mit dem Shithead.',
          'Wer in der Shithead-Tauschrunde einen KI-Platz übernimmt, darf selbst tauschen.',
          'Ein falscher Tischcode meldet sich nach wenigen Sekunden statt nach fast einer Minute.',
          '„Neue Partie“ und „Zur Lobby“ fragen mitten in der Partie nach. Im Verlauf steht dann, wer abgebrochen hat.',
          'Die Rückfrage beim Verlassen sagt ehrlich, dass die KI für dich weiterspielt und du später an deinen Platz zurück kannst.',
          'Bei Schnautz zeigt die Pille mit deinem Handwert, was ein Tausch bringt. Am PC rutscht die Reaktionsleiste beim Auswählen nicht mehr aus dem Bild.',
          'Schnautz zu acht passt auch auf sehr kurze Handys. Mit „Bewegung reduzieren“ rückt die Lobby nach dem Drehen wieder richtig zusammen.',
          'Bei Schnautz stehen 💔, 🛟 und 🫧 für ein verlorenes Leben, fürs Schwimmen und fürs Untergehen. Ein danebengegangener Cabo-Ruf zeigt 🙈.',
          'Regeln, Legende und Einstellungen nehmen ihre Zahlen direkt aus dem Spiel und erklären alles gleich.',
          'Am PC heißt es über Meldungen „Klicken zum Überspringen“.',
          'Viele Absagen nennen jetzt den echten Grund statt „Das geht gerade nicht.“, etwa „Erst wird getauscht.“, „Die Partie ist vorbei.“ oder „Nur der Gastgeber kann das.“',
          'Pro Zug gibt es höchstens eine große Meldung. Wird jemand fertig oder holt Platz 1, gehört sie dem Fertig, auch wenn im selben Zug eine Bombe fällt oder der Stapel brennt. Kleine Hinweise kommen ohne eigenen Meldeton, die Klänge der Karten bleiben.',
          'Am eigenen Zug stehen Meldungen als schmales Band über der Statuszeile und verdecken weder Stapel noch deine Karten. Wer dran ist, bleibt immer lesbar. Nach jedem Zug und beim Drehen rücken sie an die richtige Stelle.',
          'Bei Shithead melden sich Verbrennen, Bombe, 4er, Aufnehmen und blind gelegte Karten im normalen Ablauf genauso wie beim Überspringen. Unter zehn verbrannten Karten gibt es einen kurzen Hinweis statt einer großen Ansage. Den Hinweis zum Reinwerfen bekommt nur, wer eine 4 hat.',
          'Bei Durak ist Bito nur nach einem vollen Angriff mit sechs Karten eine große Meldung, sonst ein kurzer Hinweis. Weiterschieben auf dich bleibt groß. Wer sechs Karten oder mehr aufnimmt, bekommt Klang und Spruch.',
          'Bei Schnautz bleiben Tauschen und Klopfen antippbar, auch wenn sie ausgegraut sind. Klopfst du zu früh, klopft es nicht mehr hörbar vor der Absage. Nach dem Klopfen leuchtet die Statuszeile wieder warm.',
          'Bei Schnautz zeigt das Ergebnis an kleinen Tischen wieder alle Hände. Am Ende der Partie steht oben, wer gewonnen hat.',
          'Bei Cabo heißt der Knopf am Handy kurz „Ablegen 🔀“, damit „Eintauschen“ daneben nicht umbricht. Im Ergebnis sind die Punkte kürzer und lange Namen bleiben lesbar.',
          'Wer sich am Ergebnisblatt bereit gemeldet hat, sieht den Wartetext direkt bei den Knöpfen und ein ⏳ bei allen, auf die noch gewartet wird. Der Knopf zählt sauber als „Nächste Runde (9 s)“ herunter. Die Knöpfe heißen überall „Zur Lobby“, „Tisch ansehen“, „Neue Partie“ und „⚔️ Revanche“.',
          'Die Tippzeile im Ergebnis ist kürzer und nennt bei mehreren richtigen Tipps nur die Zahl.',
          'Warten mehr als drei Leute, nennt die Statuszeile zwei Namen und zählt den Rest, etwa „Warte auf Lena, Tom und 5 weitere.“ So bleibt auch das Feld „Bereit!“ in der Shithead-Tauschrunde kurz.',
          'Bei Cabo wackelt beim Spionieren nur die angetippte eigene Karte und am Tisch steht, warum es nicht geht. Im Ergebnis bleibt die Punktzahl auch mit vielen Strafkarten in einer Zeile.',
          'Bei Cabo und Schnautz enden lange Namen in der Punkteleiste oben sauber mit Punkten, ab fünf Leuten blenden sie weich aus, statt mitten im Buchstaben abzubrechen.',
          'Bei Shithead blendet der kleine Hinweis zu einer Bombe oder einem 4er aus, sobald eine große Meldung kommt.',
          'Regeln und Updates laden erst, wenn du sie öffnest. Dadurch startet die Seite schneller.',
        ],
      },
    ],
  },
  {
    v: '2.6',
    date: '2026-11-24',
    title: 'Neuer Look',
    groups: [
      {
        h: 'Neu',
        items: [
          'Alles rund um den Tisch sieht neu aus. Startseite, Einladung, Lobby, Menü und Fenster sind jetzt ein Stickeralbum auf Violett, jedes Spiel hat seine eigene Farbe.',
          '„Gegen die KI spielen“ auf der Startseite öffnet deinen eigenen Tisch, drei KIs sitzen schon da. Spiel und Einstellungen wählst du trotzdem selbst.',
          'Ein Einladungslink begrüßt dich mit „Du bist eingeladen“. Warst du schon an dem Tisch, bekommst du deinen alten Platz angeboten. Klappt der Beitritt nicht, kannst du gleich einen anderen Code eingeben.',
          'Die Spiel-Sticker auf der Startseite sagen, wie das Spiel sonst noch heißt, etwa Schwimmen oder 31. Ein Tipp darauf zeigt die Regeln.',
          'Startet die Partie, zieht sich der Spiel-Sticker ab und gibt den Tisch frei.',
          'Die Lobby sagt kurz Bescheid, wer dazukommt oder wieder geht.',
        ],
      },
      {
        h: 'Besser',
        items: [
          'Der Reiter Spiel und Regeln zeigt allen die vier Spiele als große Karten mit Regeln. Der Gastgeber stellt jedes Spiel dort ein, Gäste sehen auf einen Blick, was vom Standard abweicht. Ausreden gibt es hinterher also keine.',
          'Am Handy führt „Weiter zum Spiel“ den Gastgeber vom Reiter Tisch zu Spiel und Regeln, dort steht auch der Startknopf.',
          'Weicht bei einem Spiel etwas vom Standard ab, trägt sein Knopf Einstellungen einen Punkt. Im Fenster setzt ein Knopf neben dem Kreuz alles auf Standard zurück.',
          'Der Punkt oben öffnet jetzt ein Fenster mit Tischcode, Link zum Teilen und Stand der Verbindung. Am PC steht der Code am Tisch gleich daneben.',
          'Regeln, Bestenliste und Updates öffnen als Bogen mit festem Kopf, nur der Inhalt scrollt. Mit Tastatur und Screenreader findest du dich besser zurecht.',
          'Die Regeln zeigen auch am Tisch alle vier Spiele, mit Sprungmarken direkt zum richtigen.',
          'Die Bestenliste zeigt jedes Spiel, das an diesem Tisch gespielt wurde.',
          'Im Menü ⋯ am Tisch gibt es jetzt auch Einladen, Regeln und Bestenliste. Ton und Soundboard sind Schalter, das Menü bleibt beim Umschalten offen.',
          'Der Hinweis auf eine neue Version sitzt unter der Kopfzeile und verdeckt nichts mehr.',
          'Shithead geht jetzt wie die anderen Spiele mit 2 bis 8 Leuten.',
          'Bei Schnautz zählen jetzt Leben statt Bierdeckel. Verlieren tut genauso weh.',
          'Startseite und Lobby passen am Handy ohne Scrollen auf einen Bildschirm.',
          'Die Startseite kommt ohne Knöpfe oben aus. Die Regeln öffnest du über die Spiel-Sticker, Ton und Updates findest du ab der Lobby im Menü ⋯.',
          'Die 31 am Logo gibt es nur noch am Schnautz-Tisch, den Tonknopf oben nur noch am Tisch.',
        ],
      },
    ],
  },
  {
    v: '2.5',
    date: '2026-11-24',
    title: 'Cabo',
    groups: [
      {
        h: 'Neu',
        items: [
          'Neues Spiel: Cabo für 2 bis 8 Leute, ab sieben mit zwei Decks. Wer am Ende die wenigsten Punkte hat, gewinnt.',
          'Vier verdeckte Karten, zu Beginn siehst du dir zwei davon an. Sie blitzen nur kurz auf, danach musst du sie dir merken. Die KIs vergessen auch mal etwas.',
          'Ziehen, tauschen oder ablegen: 7 und 8 zeigen dir eine eigene Karte, mit 9 und 10 spionierst du bei anderen, mit Bube und Dame tauschst du blind. Mehrere gleiche Karten wirfst du auf einmal ab, aber wehe, sie passen nicht.',
          'Ruf Cabo, wenn du glaubst, du hast am wenigsten. Liegst du falsch, gibt es 10 Strafpunkte obendrauf. Dazu Kamikaze und die Rettung von genau 100 auf 50.',
          'In der Lobby stellst du die Zielpunkte ein (100 oder 50) und ob man außer der Reihe schnappen darf.',
          'Wer gewinnt, wird Cabo-König: Krönung mit goldenem Spotlicht, fallender Krone und Fanfare. Die Krone bleibt, bis jemand anderes gewinnt.',
        ],
      },
      {
        h: 'Besser',
        items: [
          'Durak: Bei der Zeremonie fällt jetzt wirklich die Narrenkappe auf den Platz.',
          'Ist eine Revanche offen, steht zu Beginn der nächsten Partie auch bei Durak der Hinweis zum Duell.',
        ],
      },
    ],
  },
  {
    v: '2.4',
    date: '2026-11-24',
    title: 'Durak',
    groups: [
      {
        h: 'Neu',
        items: [
          'Neues Spiel: Durak für 2 bis 8 Leute. Bis sechs mit 36 Karten, ab sieben mit dem ganzen Deck.',
          'Alle außer dem Verteidiger dürfen passende Werte nachlegen, höchstens sechs Karten pro Angriff. Wer nicht schlagen kann, nimmt auf und bekommt gern noch etwas obendrauf.',
          'Weiterschieben lässt sich in der Lobby einschalten: Mit dem gleichen Wert gibst du den Angriff an den Nächsten weiter.',
          'Wer zuletzt Karten hat, ist der Durak und bekommt eine Zeremonie mit Spotlicht, Narrenkappe und Konfetti. In der nächsten Partie wird er zuerst angegriffen.',
          'Wer fertig ist, tippt, wer Durak wird. Revanche, Würfe, Soundboard und freche KIs gibt es auch bei Durak.',
        ],
      },
      {
        h: 'Besser',
        items: [
          'Ein Gast mit veralteter Seite kann kein Spiel öffnen, das seine Version noch nicht kennt. Dann kommt ein Hinweis zum Neuladen.',
          'Krone und Verlierer-Zeichen gelten jetzt pro Spiel und bleiben, wenn zwischendurch ein anderes Spiel läuft.',
        ],
      },
    ],
  },
  {
    v: '2.3',
    date: '2026-11-24',
    title: 'Partieende mit Pauke',
    groups: [
      {
        h: 'Neu',
        items: [
          'Der Shithead bekommt eine Zeremonie: Die letzte Karte fliegt in Zeitlupe, dann wird der Tisch dunkel, ein brauner Ring zoomt als Spotlicht auf den Platz, ein Kackhaufen plumpst spritzend darauf, die traurige Posaune spielt und braunes Konfetti fällt. Antippen überspringt sie.',
          'Revanche: Wer verloren hat, fordert im Ergebnisfenster den Sieger heraus. Am Ende der nächsten Partie steht fest, wer das Duell gewinnt. Die KIs fordern auch mal selbst.',
          'Wer bei Shithead fertig ist, tippt, wer Shithead wird. Früh tippen bringt mehr Punkte, die Punkte stehen in der Bestenliste.',
          'Trifft dich selbst ein Wurf, klatscht er groß auf deinen Platz, spritzt und färbt kurz den Bildschirmrand.',
        ],
      },
      {
        h: 'Besser',
        items: [
          'Shithead: Hat jemand keine Tischkarten mehr, steht an seinen Karten „auf der Hand“. So sehen Handkarten nicht mehr aus wie verdeckte Tischkarten, die man nur einzeln aufdecken darf.',
          'Bis zur Enthüllung verraten Platz und Zähler nicht, wer Shithead geworden ist.',
          'Wer am Gerät weniger Bewegung eingestellt hat, sieht kein Konfetti. Die Zeremonie läuft dann ruhig ohne Zeitlupe.',
          'Am Handy steht im Ergebnisfenster kein kleines Tomatenzeichen mehr über den Punkten.',
          'Unter Updates steht ganz unten die genaue Version.',
        ],
      },
      {
        h: 'Behoben',
        items: [
          'Am iPhone klingen die Töne jetzt auch, wenn der Lautlos-Schalter an ist. Ausschalten geht über den Ton-Knopf im Spiel.',
          'Am Handy passen die Namen der Sounds im Ergebnisfenster ganz hinein.',
        ],
      },
    ],
  },
  {
    v: '2.2',
    date: '2026-11-23',
    title: 'Werfen und Tröten',
    groups: [
      {
        h: 'Neu',
        items: [
          'Das Reaktionsfenster hat drei Reiter: Reaktionen, Sounds und Werfen.',
          'Tomaten, Eier und Kackhaufen lassen sich auf andere am Tisch werfen, dazu Herzen und Hasen für die Netten. Alles landet direkt auf den Karten. Mit der Krone krönst du jemanden für ein paar Sekunden.',
          'Ein Tipp auf eine Gegnerkachel oder eine Zeile im Ergebnisfenster öffnet die Wurfleiste direkt für diese Person.',
          'Soundboard mit Tröte, Trommelwirbel, Uuuh, Applaus, Wah wah und Grillen. Alle am Tisch hören es, auch wer schon fertig oder raus ist.',
          'Würfe und Soundboard klingen nach echten Aufnahmen statt nach Computer.',
          'Im Ergebnisfenster gehen alle Reaktionen, Sounds und Würfe.',
          'Drei Reaktionen, Sounds oder Würfe gehen schnell hintereinander. Wer weiter spammt, wartet immer etwas länger, höchstens fünf Sekunden.',
          'Wer die Sounds nicht hören will, schaltet das Soundboard unter ⋯ ab. Die Symbole fliegen trotzdem.',
          'Die KIs werfen ab und zu zurück, krönen Sieger und tröten selten mit.',
          'Nach einem Wurf schließt sich die Auswahl, auf wen er geht, von selbst.',
          'Am Ende einer Partie führt „Zur Lobby“ zurück, etwa um ein anderes Spiel zu wählen.',
          'Bist du raus und spielen nur noch KIs, kann der Host gleich zur Lobby oder eine neue Partie starten.',
          'Schnautz: Nach 10 Sekunden startet die nächste Runde von selbst, am Ende der Partie nicht.',
          'Ein Tipp auf „verbunden“ zeigt Details zur Verbindung und wer gerade da ist.',
          'Ein Tipp auf den Raumcode oben öffnet die Einladung mit Code und Link zum Kopieren oder Teilen.',
          'Gibt es eine neue Version, erscheint oben ein Hinweis. Nach dem Neuladen geht es von selbst zurück an den Tisch. Spielt jemand noch mit altem Stand, sagt der Tisch Bescheid.',
        ],
      },
      {
        h: 'Zeitlimit',
        items: [
          'Dein Platz ist immer gelb umrandet. Bist du dran, leuchtet der Rand wie bei den anderen und pulsiert schneller, je knapper die Zeit wird.',
          'In den letzten fünf Sekunden tickt es.',
          'Läuft deine Zeit ab und die KI zieht für dich, siehst und hörst du das.',
        ],
      },
      {
        h: 'Besser',
        items: [
          'Mehr Töne: wenn du dran bist, bei Reaktionen, beim Austeilen und bei Meldungen.',
          'Wer dran ist, wird nur noch am Rand gelb, nicht mehr in der ganzen Fläche.',
          'Schnautz: Die Zahl der Karten im Stapel steht am Stapel und macht die Tischmitte nicht mehr größer.',
          'Schnautz am Handy: Die Leiste oben zeigt alle mit ihren Leben als Zahl und passt immer in eine Zeile.',
          'Am Handy steht „schwimmt“ nur an deinem Platz ausgeschrieben, sonst reicht das Zeichen.',
          'Bei „Tisch ansehen“ nach einer Runde stehen unten Ergebnis und nächste Runde, am Ende der Partie für den Host auch „Zur Lobby“.',
          'Am PC ist mehr Luft zwischen Gegnern, Tischmitte und deinem Platz.',
          'Der Einladungscode steht überall in klarer Schrift.',
          'Chat, Reaktionen und die laufende Uhr unterbrechen keine Animation und keine Kartenauswahl mehr.',
          'Am Handy geht der Ton zuverlässiger an, ein Tipp auf den Tisch reicht.',
          'Wackelnde Gegner springen im Karussell nicht mehr an den Rand.',
        ],
      },
      {
        h: 'Behoben',
        items: ['Meldungen aus dem Spiel legen sich nicht mehr über Regeln, Bestenliste, Verbindung oder Einladung.'],
      },
    ],
  },
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

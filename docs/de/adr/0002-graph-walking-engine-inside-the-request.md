# ADR-0002: Eigener BPMN-Interpreter, der den Graphen innerhalb des Requests durchläuft

[ADR-Übersicht](README.md) · [English](../../en/adr/0002-graph-walking-engine-inside-the-request.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb, mit bekannten Grenzen |
| Geltungsbereich | Prozess-Engine |
| Verwandt | [ADR-0003](0003-pin-running-instances-to-their-version.md), [ADR-0006](0006-durable-clustered-timers.md), [ADR-0008](0008-providers-as-the-single-integration-abstraction.md) |

## Kontext

Die Plattform muss BPMN 2.0 ausführen: User Tasks, Service Tasks, Script Tasks, Send Tasks, Receive Tasks und
Business Rule Tasks; exklusive, inklusive und parallele Gateways; Timer-, Nachrichten-, Signal- und
Fehlerereignisse; Call Activities und Lanes. Sie läuft auf .NET Framework und IIS, on-premises, und die Masken
müssen persischsprachig sein und von rechts nach links laufen.

Darüber hinaus gibt es eine harte Produktanforderung. Nachdem ein Benutzer auf „Genehmigen“ geklickt hat, muss die
nächste Seite bereits zeigen, wohin der Fall gegangen ist und wer ihn jetzt bearbeitet. Benutzer beurteilen das
gesamte System nach diesem Moment.

## Entscheidungstreiber

- Ein einziger Technologie-Stack, den ein .NET-Team und die IT des Kunden betreiben können.
- Keine zusätzliche Infrastruktur beim Kunden: kein Message Broker, keine zweite Laufzeitumgebung.
- Unmittelbares, synchrones Feedback nach einer Benutzeraktion.
- Volle Kontrolle über die Funktionen, die unsere Kunden brauchen: Timer nach persischem Kalender, Routing anhand
  des Organigramms, Vertretung, Formularregeln auf Feldebene je Schritt.

## Betrachtete Optionen

1. Eine etablierte Java-Engine (Camunda 7 oder Flowable) einbetten und über REST integrieren.
2. Windows Workflow Foundation verwenden. Das ist kein BPMN und wird nicht mehr weiterentwickelt.
3. Eine Engine schreiben, die BPMN **asynchron** über eine Job-Queue ausführt (Async Continuations).
4. Eine Engine schreiben, die den Graphen **synchron innerhalb des Requests des Befehls durchläuft** und an
   Wartezuständen anhält.

## Entscheidung

Option 4. Die Engine ist ein Interpreter:

- Beim Veröffentlichen wird das BPMN-XML geparst und je Version in relationale Zeilen zerlegt (ADR-0003).
- Zur Laufzeit lädt jeder Befehl (Start, Work Item abschließen, Nachricht, Signal, Timer) die Position der Instanz
  und läuft durch automatische Elemente vorwärts, bis jeder aktive Pfad einen Wartezustand oder ein Ende erreicht.
- Wartezustände werden als Work Items, Timer-Jobs oder wartende empfangende Ereignisse persistiert. Zwischen
  Requests wird nichts im Speicher gehalten.
- Parallele Zweige werden nacheinander im selben Request durchlaufen. Joins zählen Ankünfte; inklusive Joins
  vergleichen die Ankünfte mit der Anzahl der Routen, die der Split akzeptiert hat.
- Jeder Schritt wird sofort committet. Ein Fehler stoppt den Durchlauf beim zuletzt committeten Schritt und wird in
  das Fehlerprotokoll der Engine geschrieben. Administratoren können die Instanz erneut ausführen, verschieben,
  zurücksetzen oder verwerfen.

## Konsequenzen

### Vorteile

- Einfach zu betreiben: eine Webanwendung und eine Datenbank, sonst nichts zu installieren, zu überwachen oder zu
  sichern.
- Unmittelbares Feedback: Der Benutzer sieht das Ergebnis der gesamten automatischen Kette.
- Leicht zu debuggen und zu erklären. Ein Request bedeutet eine Log-Spur, und der Testmodus kann Breakpoints und
  „Schritt überspringen“ innerhalb derselben Schleife anbieten.
- Wir konnten genau die Routing-, Kalender- und Vertretungsfunktionen bauen, die unser Markt braucht.

### Nachteile

- **Latenzen addieren sich.** Eine Kette von Service Tasks, die langsame externe Systeme aufrufen, macht den Klick
  des Benutzers langsam. Ein hängendes externes System blockiert einen IIS-Worker-Thread.
- **Keine Transaktion um den Durchlauf.** Ein Fehler mittendrin hinterlässt die Instanz teilweise
  fortgeschritten. Das ist sicher, weil jeder Schritt persistiert ist, aber die Wiederherstellung erfolgt manuell.
- **Nebenläufigkeit an Joins.** Zwei Abschlüsse, die gleichzeitig denselben parallelen oder inklusiven Join
  erreichen, werden nicht durch eine Sperre serialisiert. Doppeltes Absenden durch einen Benutzer fängt die Prüfung
  „noch offen?“ ab, aber zwei verschiedene Benutzer, die im selben Moment parallele Geschwisterzweige abschließen,
  sind eine reale, wenn auch seltene Race Condition.
- **Die Engine hängt vom Kontext des Web-Requests ab.** Timer steigen daher als technischer Benutzer über die
  HTTP-API wieder in sie ein (ADR-0006), statt sie direkt aufzurufen.
- **Keine Parallelität innerhalb eines Befehls.** Parallele Gateways drücken Unabhängigkeit aus, nicht
  Geschwindigkeit.

## Rückblickend

Der synchrone Durchlauf war für das Produkt und den Markt richtig. Er ist auch der Grund, warum die Plattform
einfach genug war, um von der IT der Kunden betrieben zu werden. Ändern würde ich das Innere der Schleife:

1. **Serialisierung pro Instanz.** Zu Beginn jedes Befehls eine Anwendungssperre (oder eine optimistische
   Versionsprüfung) auf die Instanz setzen, damit an Joins keine Race Conditions entstehen können.
2. **Explizite asynchrone Grenzen.** Prozessdesigner einen Service Task als „asynchron“ markieren lassen. Die Engine
   committet dann in derselben Transaktion eine Job-Zeile und kehrt zurück, und ein Job-Executor setzt später fort.
   Das ist das Transactional-Outbox-Pattern; Camunda nennt es „Async Continuation“. Langsame Integrationen
   blockieren dann keine Benutzer mehr.
3. **Eine Transaktion pro Schritt**, dazu Idempotenzschlüssel für jeden API-Befehl, damit Wiederholungen immer
   sicher sind.
4. **Keine Abhängigkeit vom HTTP-Kontext.** Die Engine wird zu einem einfachen Dienst, den die Webschicht, der
   Job-Executor und Tests gleichermaßen aufrufen können.

Wenn der Stack es zuließe, würde ich auch ernsthaft Camunda 8 oder Flowable als Ausführungskern in Betracht ziehen
und unseren Mehrwert dort belassen, wo er wirklich liegt: Formulare, Routing-Regeln, Unterstützung des persischen
Kalenders, Monitoring und die Low-Code-Designer.

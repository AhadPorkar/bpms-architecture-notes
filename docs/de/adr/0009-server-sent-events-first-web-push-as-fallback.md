# ADR-0009: Server-Sent Events zuerst, Web Push als Fallback

[ADR-Übersicht](README.md) · [English](../../en/adr/0009-server-sent-events-first-web-push-as-fallback.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb; ersetzt das frühere, auf SignalR basierende Design |
| Geltungsbereich | Benachrichtigungen, Posteingang, Web-Oberfläche |
| Verwandt | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0010](0010-denormalized-inbox-read-model.md) |

## Kontext

Wenn die Engine ein Work Item zuweist, soll der Empfänger es sofort erfahren: durch ein Badge im geöffneten Tab oder
durch eine Systembenachrichtigung, wenn der Browser im Hintergrund ist. Frühere Versionen nutzten dafür ASP.NET
SignalR.

Bei den Kunden vor Ort führte das immer wieder zu Problemen:

- Reverse Proxies und WAFs, bei denen WebSockets deaktiviert oder fehlerhaft konfiguriert waren;
- Fallback-Transporte, die sich hinter jedem Proxy anders verhielten;
- eine Backplane, die nötig wurde, sobald es mehr als einen Knoten gab;
- eine Clientbibliothek auf jeder Seite.

## Entscheidungstreiber

- Funktioniert über jeden Reverse Proxy, der einfaches HTTPS durchlässt.
- Erreicht Benutzer, deren Tab im Hintergrund oder geschlossen ist.
- Keine neue Infrastruktur bei den Kunden vor Ort.
- Kontrollierte Degradierung, wenn ein Kanal ausfällt.

## Betrachtete Optionen

1. SignalR beibehalten und eine SQL-Server-Backplane ergänzen.
2. Polling des Posteingangs alle N Sekunden.
3. **Server-Sent Events** für geöffnete Tabs plus **Web Push (VAPID)** für alle anderen.

## Entscheidung

Option 3.

- **SSE-Kanal.** Jeder fokussierte Tab hält eine langlebige `text/event-stream`-Antwort offen. Der Endpunkt läuft ohne
  Session-State, damit er die übrigen Requests des Benutzers nicht blockiert, und hat ein langes Ausführungs-Timeout.
  Eine In-Memory-Verbindungsregistrierung pro Knoten ordnet Benutzer ihren offenen Streams zu.
- **Web Push.** Browser abonnieren mit dem öffentlichen VAPID-Schlüssel der Plattform. Das Schlüsselpaar wird beim
  ersten Start erzeugt und in der Datenbank gespeichert.
- **Dispatcher.** Für jede Benachrichtigung wird zuerst SSE versucht. Benutzer, die so erreicht werden, sind erledigt.
  Die übrigen erhalten Web Push. Benachrichtigungen an eine ganze Rolle werden mit begrenzter Parallelität versendet.
- **Circuit Breaker für Push.** Nach wiederholten Fehlern des Push-Dienstes wird Push für eine Abkühlphase pausiert,
  statt Fehler anzuhäufen.
- E-Mail und SMS bleiben separate Kanäle, die pro Benachrichtigungsprozedur gewählt werden.

## Konsequenzen

### Vorteile

- Einfaches HTTP funktioniert über jeden Proxy, dem wir begegnet sind. Bei den Kunden vor Ort ist keine
  WebSocket-Konfiguration nötig.
- Keine Clientbibliothek: `EventSource` und die Push API sind in die Browser eingebaut.
- Tabs im Hintergrund und geschlossene Browser erhalten trotzdem Benachrichtigungen.
- Der Wegfall von SignalR beseitigte eine Abhängigkeit und eine ganze Klasse von Support-Tickets.

### Nachteile

- **SSE-Verbindungen bestehen pro Knoten, und es gibt keine Backplane.** Ein Benutzer, der mit Knoten A verbunden ist,
  ist von Knoten B aus nicht über SSE erreichbar. Web Push schließt diese Lücke, allerdings um den Preis einer
  Systembenachrichtigung, wo ein Badge genügt hätte.
- **Langlebige Antworten belegen IIS-Request-Slots.** Limits für gleichzeitige Requests und Proxy-Timeouts müssen
  darauf ausgelegt sein, und der Lasttest muss inaktive SSE-Verbindungen einschließen (siehe
  [Lasttests](../04-load-testing.md)).
- **VAPID-Schlüssel sind Geheimnisse.** Werden sie rotiert, werden alle Abonnements ungültig.
- Die Push-Zustellung hängt von den Push-Diensten der Browserhersteller ab. Diese Dienste müssen aus dem Netzwerk des
  Kunden erreichbar sein.

## Rückblickend

Die Entscheidung hat sich bewährt. Bei mehr als zwei Knoten würde ich eine leichtgewichtige Pub/Sub-Backplane ergänzen
(Redis oder SQL Server Service Broker, falls keine neue Infrastruktur erlaubt ist), damit jeder Knoten jeden offenen
Stream erreichen kann. Außerdem würde ich die Zustellung Ende-zu-Ende messen, vom Anlegen des Work Items bis zur
angezeigten Benachrichtigung, und zwar als Produktmetrik.

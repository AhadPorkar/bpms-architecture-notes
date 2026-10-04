# ADR-0006: Dauerhafte, clusterfähige Timer mit Jalali-Zeitplänen

[ADR-Übersicht](README.md) · [English](../../en/adr/0006-durable-clustered-timers.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb; ersetzt eine frühere Bibliothek für Hintergrundjobs (Hangfire) |
| Geltungsbereich | Prozess-Engine, Berichts-Alerts, Wartungsjobs |
| Verwandt | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0003](0003-pin-running-instances-to-their-version.md) |

## Kontext

BPMN-Timer finden sich überall in den Prozessen unserer Kunden:

- Timer-Startereignisse („jeden Monat die Inventurprüfung starten“);
- Timer-Zwischenereignisse („drei Arbeitstage warten“);
- angeheftete Timer-Ereignisse („wenn innerhalb von 48 Stunden niemand handelt, eskalieren“).

Auch Berichts-Alerts und Wartungsaufgaben benötigen Zeitpläne. Timer müssen Neustarts und Deployments überstehen, und
sie müssen genau einmal auslösen, wenn die Anwendung auf mehr als einem Knoten läuft.

Viele Zeitpläne lassen sich am natürlichsten im **persischen Sonnenkalender (Jalali-Kalender)** ausdrücken: „am 1. jedes
persischen Monats“, „am Ende des Esfand“. Standard-Cron kennt nur den gregorianischen Kalender, und Jalali-Monate fallen
nicht mit gregorianischen Monaten zusammen.

## Entscheidungstreiber

- Dauerhaft über Neustarts hinweg: Kein Timer geht verloren, keiner löst doppelt aus.
- Sicher auf einem Cluster von IIS-Knoten, ohne zusätzliche Infrastruktur.
- Jalali-Zeitpläne als vollwertige Funktion.
- Der Betrieb kann sehen, was geplant ist und was fehlgeschlagen ist.

## Betrachtete Optionen

1. Die bestehende Bibliothek für Hintergrundjobs beibehalten.
2. Ein Windows-Dienst, der eine Timer-Tabelle per Polling abfragt.
3. **Quartz.NET mit seinem SQL-Server-Job-Store im Clustermodus**, gehostet innerhalb der Webanwendung.
4. Ein tabellengesteuerter Job-Executor als Teil der Engine (Polling mit Zeilensperren).

## Entscheidung

Option 3.

- Quartz.NET läuft auf jedem Knoten im Prozess und nutzt seinen ADO.NET-Job-Store im selben SQL Server, und zwar im
  **Clustermodus**. Die Cluster-Sperre stellt sicher, dass jeder Trigger auf genau einem Knoten auslöst. Fällt ein
  Knoten aus, übernehmen die anderen seine Trigger.
- **Unsere eigene Timer-Warteschlangentabelle ist die fachlich führende Quelle.** Sie hält fest, zu welcher Instanz,
  welchem Schritt und welchem Element ein Timer gehört, welchen Zeitplan und Kalendertyp er hat und ob er abgeschlossen
  ist. Quartz ist der Zustellmechanismus. Beim Start **gleicht** die Anwendung beide **ab**: Warteschlangeneinträge ohne
  Trigger werden neu angelegt. Verpasste einmalige Timer innerhalb eines Toleranzfensters werden verspätet ausgelöst;
  ältere werden nicht automatisch nachgeholt.
- Ein generischer, dauerhafter Jobtyp bedient alle Prozess-Timer. Der Job steigt **über die Prozess-API** wieder in
  die Engine ein, und zwar über eigene Timer-Endpunkte und als technischer Benutzer. Die Engine benötigt einen
  Request-Kontext (ADR-0002), und auf diese Weise wird jede Timer-Ausführung wie jeder andere Befehl authentifiziert
  und protokolliert.
- **Jalali-Zeitpläne** werden zu einem weiter gefassten gregorianischen Cron-Ausdruck aufgefächert, der garantiert jedes
  Jalali-Vorkommen einschließt. Löst der Job aus, prüft er das Jalali-Datum und überspringt die Ausführung, wenn der
  heutige Tag nicht im Zeitplan liegt.
- Fehlgeschlagene Ausführungen werden nach einer konfigurierbaren Verzögerung wiederholt. Timer-Fehler landen in einem
  eigenen Fehlerprotokoll, das in den Monitoring-Ansichten der Prozesse erscheint.

## Konsequenzen

### Vorteile

- Kein zusätzlicher Dienst muss installiert werden. Timer überstehen Neustarts und werden bei einem Ausfall von anderen
  Knoten übernommen.
- Für den Prozessdesigner funktionieren Jalali-Zeitpläne wie jeder andere Cron-Zeitplan.
- Timergesteuerte Arbeit erscheint in denselben Logs und demselben Audit-Trail wie menschliche Arbeit.

### Nachteile

- **Doppelte Buchführung.** Die Warteschlangentabelle und die eigenen Tabellen des Schedulers können auseinanderlaufen,
  und der Abgleichscode wird kritisch. Abgebrochene Timer müssen gelöscht und nicht nur pausiert werden, sonst füllen
  sich die Scheduler-Tabellen langsam.
- **Der HTTP-Loopback** bringt einen zusätzlichen Fehlermodus mit sich (TLS, Proxy und DNS innerhalb des Servers) sowie
  ein technisches Konto, dessen Zugangsdaten wie jedes andere Geheimnis rotiert werden müssen. Ein HTTP-Status, der keinen
  Erfolg meldet, muss für Wiederholungen als Fehler zählen.
- **Lokale Serverzeit.** Zeitpläne werden in der Zeitzone des Servers ausgewertet. Für Kunden in einem einzigen Land
  ist das in Ordnung, für alles andere falsch.

## Rückblickend

Sobald die Engine ohne HTTP-Kontext aufgerufen werden kann (siehe ADR-0002), würde ich für Prozess-Timer auf den
zweiten Scheduler verzichten. Timer werden zu Zeilen in der engineeigenen Jobtabelle, und ein kleiner Executor auf
jedem Knoten beansprucht fällige Zeilen mit `UPDLOCK, READPAST`. Das Auslösen eines Timers und das Fortschalten der
Instanz geschehen dann in einer einzigen Transaktion: eine Buchführung, kein Loopback.

Jeden Zeitplan würde ich als UTC plus Kalenderregel plus IANA-Zeitzone speichern und verpasste Timer an eine
Warteschlange für den Betrieb senden statt in eine Logzeile. Für Zeitpläne außerhalb von Prozessen, etwa Berichts-Alerts
und Bereinigungen, bleibt Quartz eine gute Wahl.

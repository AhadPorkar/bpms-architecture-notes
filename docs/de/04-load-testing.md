# 4. Lasttests: Validierung für 5.000 gleichzeitige Benutzer

[Startseite](../../README.de.md) · [Überblick](01-overview.md) · [C4-Modell](02-c4-model.md) · [Prozess-Engine](03-process-engine.md) · [ADRs](adr/README.md) · **Lasttests** · [Sicherheitslehren](05-security-lessons.md) · [Rückblick](06-retrospective.md) · [Glossar](glossary.md) · [English](../en/04-load-testing.md)

Die Plattform wurde für bis zu **5.000 gleichzeitige Benutzer in einem Spike-Test** validiert, gemessen an den unten
aufgeführten Abnahmekriterien. Diese Seite beschreibt die Methode: wie man aus „5.000 Benutzern“ einen aussagekräftigen
Test macht, wie man ihn durchführt und worauf man achten muss. Unser Testplan setzte JMeter und k6 ein. Die k6-Skripte
in [`load-testing/`](../../load-testing/) wurden für dieses Repository von Grund auf neu geschrieben und laufen gegen
eine Mock-API, sodass sich jedes Profil auf einem Laptop ausprobieren lässt.

## 1. Was nachgewiesen werden musste

| Kriterium | Zielwert |
| --- | --- |
| Antwortzeit | 95 % der Requests unter 2 s |
| Durchsatz | mindestens 500 Geschäftstransaktionen pro Sekunde |
| Fehler unter Last | unter 1 % |
| Ressourcennutzung bei normaler Spitzenlast | CPU unter 70 %, Arbeitsspeicher unter 75 % |
| Lastspitze (Spike) | von der Grundlast auf 5.000 gleichzeitige Benutzer in einer Minute, Last halten und danach wieder die Ausgangslatenz erreichen |
| Dauerbelastung | 48–72 Stunden bei normaler Last ohne Anstieg von Latenz, Speicherverbrauch oder Fehlerrate |

Referenzszenarien aus dem Testplan: ein umfangreicher Prozess (mehr als 20 Knoten mit mehreren externen Aufrufen), ein
BI-Dashboard mit 10 Diagrammen, 2.000 Personen, die sich im selben Moment anmelden, sowie massenhaftes Anlegen, Lesen,
Ändern und Löschen von Formulardaten.

## 2. „Gleichzeitige Benutzer“ sind ein Modell, keine Zahl

Fünftausend Personen mit geöffnetem Browser senden nicht 5.000 Requests auf einmal. Sie lesen, tippen und denken nach.
Das Gesetz von Little (Little's Law) setzt die Größen zueinander in Beziehung:

```text
N = X × (R + Z)

N  gleichzeitige Benutzer      5.000
R  Antwortzeit pro Aktion      ≈ 1 s
Z  Denkzeit zwischen Aktionen  ≈ 9 s
X  Durchsatz                   = N / (R + Z) = 5.000 / 10 = 500 Aktionen pro Sekunde
```

Deshalb sind „5.000 gleichzeitige Benutzer“ und „500 Transaktionen pro Sekunde“ dieselbe Aussage aus zwei
Blickwinkeln – allerdings nur, wenn die Denkzeit realistisch ist:

| Denkzeit Z | Benötigter Durchsatz für 5.000 Benutzer |
| --- | --- |
| 4 s | etwa 1.000 pro Sekunde |
| 9 s | etwa 500 pro Sekunde |
| 19 s | etwa 250 pro Sekunde |

**Z messen, nicht schätzen.** Wir haben den Wert aus den Abständen zwischen den Requests einer Session in den
Access-Logs und aus den Schrittdauern im Prozessmonitoring ermittelt. Ein Test ohne Denkzeit mit 5.000 virtuellen
Benutzern simuliert eine weit größere Benutzerpopulation als die tatsächlich vorhandene. Ein Test mit 60 s Denkzeit
beweist sehr wenig.

## 3. Lastmodell

Der Mix ergibt sich aus dem, was Benutzer in einem BPM-System tatsächlich tun. Die meisten Klicks entfallen auf
das Lesen des Posteingangs, weniger auf das Abschließen von Aufgaben und noch weniger auf das Starten neuer Fälle:

| Nutzerpfad | Anteil | Requests | Was belastet wird |
| --- | --- | --- | --- |
| Posteingang durchblättern | 45 % | 1–2 | Lesemodell des Posteingangs, Berechtigungsfilter, Paging |
| Aufgabe abschließen | 25 % | 3 | Graphdurchlauf der Engine, Speichern des Formulars, Projektion des Posteingangs, Benachrichtigungen |
| Prozess starten | 15 % | 2 | Anlegen der Instanz, Auflösung der ersten Lane |
| Dashboard ansehen | 10 % | 1 | Monitoring-Abfragen (die aufwendigsten Lesezugriffe) |
| Anhang hochladen | 5 % | 1 | Größenlimits für Requests, Dateiablage, Virenscan oder Validierung |

Jeder virtuelle Benutzer meldet sich einmal an, hält seine Session wie ein Browser-Tab, erneuert sein Token vor dem
Ablauf und wartet zwischen den Aktionen zufällig 5–13 s (im Mittel 9 s). Gemessen werden sowohl
Geschäftstransaktionen als auch einzelne Requests: Der Benutzer wartet auf „Aufgabe abschließen“, nicht auf einen
einzelnen HTTP-Aufruf.

## 4. Testdaten sind wichtiger als die Benutzerzahl

- **Volumen.** Die Datenbank vor dem ersten Lauf auf produktionsnahe Größe befüllen: Jahre abgeschlossener Fälle,
  Millionen von Work Items und Zeilen in der Variablenhistorie. Abfragepläne, die auf einer leeren Datenbank
  funktionieren, brechen bei großem Datenvolumen ein. Der Posteingang und die Monitoring-Abfragen zeigen das als Erste.
- **Benutzer.** Mindestens so viele Testkonten wie virtuelle Benutzer, verteilt auf mehrere Organisationen, Stellen
  und Rollengruppen. Gemeinsam genutzte Konten verdecken Konflikte zwischen Sessions und kollidieren mit Richtlinien,
  die nur eine Session pro Benutzer erlauben.
- **Realistische Posteingänge.** Einige Benutzer mit 5 offenen Einträgen, andere mit 500.
- **Externe Systeme.** Per Service-Virtualisierung (WireMock oder ein kleiner Mock) mit realistischer Latenz
  nachbilden. Synchrone Service Tasks kosten dann so viel wie in der Produktion ([ADR-0002](adr/0002-graph-walking-engine-inside-the-request.md)).
- **Keine personenbezogenen Daten aus der Produktion.** Ausschließlich synthetische oder ordnungsgemäß anonymisierte
  Daten.

## 5. Umgebung

- **Produktionsnahe Topologie:** derselbe Reverse Proxy und dieselbe WAF, dieselbe Anzahl an Anwendungsknoten mit
  Sticky Sessions, dieselbe SQL-Server-Edition und Speicherklasse.
- **Lastgeneratoren außerhalb der DMZ**, damit Proxy und TLS-Terminierung Teil des Tests sind.
- **Dimensionierung der Lastgeneratoren.** In einem Probelauf dieser Skripte auf einer Maschine mit 2 vCPU / 7 GB
  erreichte k6 im vollständigen Spike-Profil (5.000 virtuelle Benutzer) gegen den Mock einen Spitzenwert von etwa
  3,3 GB residentem Speicher, also rund 0,65 MB pro virtuellem Benutzer. Die CPU-Auslastung der Lastgeneratoren unter
  70 % halten und die Last bei Bedarf mit [`run-distributed.sh`](../../load-testing/scripts/run-distributed.sh) auf
  mehrere Maschinen verteilen. Die Uhren aller Maschinen synchronisieren (NTP).

## 6. Lastprofile

| Profil | Verlauf | Beantwortete Frage |
| --- | --- | --- |
| `smoke` | 2 Benutzer, 30 s | Funktioniert das Skript in dieser Umgebung? (läuft in der CI) |
| `load` | 0 → 2.000 Benutzer in 10 min, 30 min halten | Werden die Zielwerte bei der erwarteten täglichen Spitzenlast erreicht? |
| `stress` | +1.000 Benutzer alle 10 min bis 7.000 | Wo liegt der Bruchpunkt, und wie versagt das System? |
| `spike` | 200 → 5.000 Benutzer in 1 min, 10 min halten, zurück auf 200, 5 min beobachten | Übersteht das System eine plötzliche Welle, und erholt es sich danach? |
| `soak` | 1.500 Benutzer für 48 h | Lecks, Wachstum von Logs und Tabellen, Drift der Ausführungspläne, geplante Jobs unter Last |
| `login-storm` | 2.000 Anmeldungen im selben Moment | Arbeitsbeginn: Authentifizierung und Erzeugung von Sessions |
| `throughput` | Ankunftsrate bis 500 Transaktionen/s, 20 min halten | Hält das System die Zielrate unabhängig von der Denkzeit? |

**Geschlossene und offene Modelle.** `load`, `stress`, `spike` und `soak` sind geschlossene Modelle: eine feste Anzahl
von Benutzern, von denen jeder vor der nächsten Aktion auf eine Antwort wartet. Das entspricht der Anforderung, die in
gleichzeitigen Benutzern formuliert ist. `throughput` ist ein offenes Modell: Transaktionen treffen mit fester Rate
ein, unabhängig davon, ob das System mithält. Offene Modelle vermeiden *Coordinated Omission*, bei der ein langsames
System in einem geschlossenen Test unbemerkt seine eigene Last reduziert. Beide Modelle ausführen.

## 7. Was gemessen wird

**Clientseitig (k6):** p50, p95 und p99 je Geschäftstransaktion und je Request-Name; Fehlerrate nach Statuscode;
Durchsatz; Checks.

**Serverseitig, zu denselben Zeitstempeln:**

| Schicht | Signale |
| --- | --- |
| IIS / HTTP.sys | Requests in der Warteschlange, aktuelle Requests, abgewiesene Requests, Anzahl der Verbindungen |
| ASP.NET / CLR | Wartezeit der Requests, Threads und Warteschlangenlänge des Threadpools, % Zeit in GC, Ausnahmen pro Sekunde |
| Windows | CPU pro Prozess, verfügbarer Arbeitsspeicher, Länge der Datenträgerwarteschlange, Netzwerkdurchsatz |
| SQL Server | Batch Requests/s, Wartezeiten nach Typ, Blockierungsketten, Top-Abfragen nach CPU und Dauer, Wartezeiten beim Log-Flush, tempdb, Anzahl der Verbindungen |
| Anwendung | Datenbankzeit pro Request aus dem plattformeigenen Timing-Log, verknüpft über die Request-ID |

Die Plattform verfügt über eine nur für Administratoren zugängliche Diagnoseseite, die Blockierungsketten, lang
laufende Abfragen, offene Transaktionen sowie den Zustand von Connection-Pool und Threadpool anzeigt. Während eines
Tests ist sie der schnellste Weg, um zu sehen, *warum* sich die Zahlen bewegen.

## 8. Ablauf der Testdurchführung

1. Build und Konfiguration einfrieren. Beides im Testprotokoll festhalten.
2. Vor jedem Lauf den Snapshot der befüllten Datenbank wiederherstellen, damit die Läufe vergleichbar sind.
3. 5 Minuten bei Grundlast aufwärmen (Caches, JIT, Connection-Pools).
4. Das Profil ausführen. Messfenster im eingeschwungenen Zustand von mindestens 10 Minuten.
5. Jeden relevanten Lauf dreimal wiederholen. Den mittleren Lauf (Median) berichten, nicht den besten.
6. Zwischen zwei Läufen jeweils nur eine Sache ändern.
7. Abbruchkriterien: Fehler über 5 % für 2 Minuten, Datenbank-CPU über 95 % für 5 Minuten oder ein beliebiger Alarm
   zur Datenintegrität.

## 9. Auswertung

- **Perzentile, niemals Mittelwerte.** Mittelwerte verbergen die Benutzer, die 10 s warten.
- **Den Knickpunkt finden.** p95 über der Last auftragen. Wo die Latenz nach oben abknickt, die erste gesättigte
  Ressource ermitteln, und zwar je Schicht anhand von Auslastung, Sättigung und Fehlern (USE-Methode).
- **Erholung nach dem Spike prüfen.** Die Latenz kehrt innerhalb von Minuten auf das Ausgangsniveau zurück,
  Warteschlangen laufen leer, und keine Thread- oder Verbindungsanzahl bleibt erhöht.
- **Datenintegrität prüfen – das ist BPM-spezifisch.** Nach einem Lauf prüfen, dass sich jede gestartete Instanz in
  einem konsistenten Zustand befindet: Jeder aktive Pfad hat genau ein offenes Work Item, kein Join hängt fest oder
  wurde doppelt ausgelöst, und kein Timer ist verwaist. Lasttests sind die besten Nebenläufigkeitstests, die man je
  gegen eine Engine fahren wird. Genau so sollte man sie auch nutzen.

## 10. Die üblichen Verdächtigen in einem Stack aus IIS, .NET Framework und SQL Server

Was zuerst zu prüfen ist, wenn der Knickpunkt zu früh kommt:

- **Hochlauf des Threadpools.** Das .NET Framework fügt oberhalb seines Minimums nur langsam Worker-Threads hinzu. Bei
  einem Spike stauen sich Requests in der Warteschlange, obwohl die CPU untätig ist. Die Mindestzahl an Worker- und
  IO-Threads gezielt erhöhen.
- **Grenzen der Request-Warteschlangen** in IIS, ASP.NET und HTTP.sys. Mit den Standardwerten führt ein Spike zu
  HTTP-503-Antworten.
- **Sperren des Session-State.** Ein In-Process-Session-State serialisiert gleichzeitige Requests desselben Benutzers.
  Den Session-State an Endpunkten deaktivieren, die ihn nicht benötigen, etwa SSE, Datenendpunkte und Datei-Downloads.
- **Erschöpfter Connection-Pool.** „Max pool size reached“ bei einem Spike. Verbindungen kurz halten und den Pool nach
  der Zahl gleichzeitiger Requests dimensionieren, nicht nach der Zahl der Benutzer.
- **Logging auf dem Hot Path (stark frequentierter Pfad).** Synchrones Audit- und Abfrage-Logging kann die Zahl der
  Schreibzugriffe auf die Datenbank verdoppeln. Das Logging bündeln, aus dem Request-Thread auslagern oder Lesezugriffe
  unter Last nur stichprobenartig protokollieren.
- **Parameter Sniffing** bei Monitoring-Abfragen. Ein für eine kleine Organisation erstellter Ausführungsplan wird für
  eine große wiederverwendet.
- **Leser blockieren Schreiber.** `READ_COMMITTED_SNAPSHOT` auf Datenbankebene ist Hints pro Abfrage vorzuziehen.
- **Passwort-Hashing ist absichtlich CPU-gebunden.** Ein Login-Sturm ist ein CPU-Test. Entsprechend dimensionieren;
  niemals die Hash-Kosten senken, um einen Test zu bestehen.
- **Langlebige SSE-Verbindungen** belegen Request-Slots. Inaktive SSE-Verbindungen in die Testpopulation aufnehmen.
- **Der Browser ist Teil des Systems.** Ein Dashboard, das beim Laden 20 identische Requests absetzt, ist ein
  Serverproblem. Unser Monitoring-Dashboard wurde durch Deduplizierung laufender Requests und Caching auf dem Client
  schneller, ganz ohne Änderung am Server.

## 11. Bericht

Jeder relevante Lauf ergibt einen einseitigen Bericht mit stets gleicher Struktur: Ziel, Build, Umgebung,
Datenvolumen, Profil, Ergebnisse gemessen an den Kriterien, gefundener Engpass, vorgenommene Änderung und offene
Risiken. Vorlage: [`load-testing/report-template.md`](../../load-testing/report-template.md).

## 12. Selbst ausprobieren

```bash
# 1. Mock-API starten (Node.js 18 oder neuer, keine Abhängigkeiten)
node load-testing/mock-api/server.js

# 2. Smoke-Test
k6 run -e PROFILE=smoke -e THINK_MIN_S=0.2 -e THINK_MAX_S=0.5 load-testing/k6/main.js

# 3. Spike als Probelauf mit 2 % der Last und 5 % der Dauer
k6 run -e PROFILE=spike -e SCALE=0.02 -e DURATION_FACTOR=0.05 load-testing/k6/main.js

# 4. Reales System, verteilt auf 4 Lastgeneratoren (auf jedem ausführen, INDEX 0..3)
./load-testing/scripts/run-distributed.sh 0 4 spike https://bpms-test.example.internal
```

Weitere Optionen finden sich in [`load-testing/README.md`](../../load-testing/README.md).

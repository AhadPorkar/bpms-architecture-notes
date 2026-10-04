# ADR-0008: Provider als einzige Integrationsabstraktion

[ADR-Übersicht](README.md) · [English](../../en/adr/0008-providers-as-the-single-integration-abstraction.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Formulare, Prozess-Engine, Berichte, Benachrichtigungen, öffentliche API |
| Verwandt | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0007](0007-dynamic-forms-as-physical-tables.md) |

## Kontext

Low-Code-Anwender benötigen ständig Daten aus anderen Systemen:

- eine Dropdown-Liste, die aus der Personaldatenbank befüllt wird;
- ein Feld, das automatisch aus dem Webservice eines Registers befüllt wird;
- ein Service Task, der in das Finanzsystem schreibt;
- ein Bericht auf Basis der Daten des Archivsystems.

Die Kunden betreiben SQL Server, Oracle, PostgreSQL und MySQL sowie REST- und SOAP-Services, meist hinter einem
Enterprise Service Bus. Angebunden werden diese von Analysten, nicht von Entwicklern. Zugangsdaten und interne Endpunkte
dürfen für Personen, die einen Konnektor nur *verwenden*, niemals sichtbar sein.

## Entscheidungstreiber

- Eine Verbindung einmal definieren und in Formularen, Prozessen, Berichten und Alerts wiederverwenden.
- Kein Code pro Integration.
- Geheimnisse bleiben vor Designern und Endbenutzern verborgen.
- Eine zentrale Stelle für Sicherheitskontrollen und Protokollierung.

## Betrachtete Optionen

1. Integrationscode pro Kunde, geschrieben von Entwicklern.
2. Getrennte Konnektorkonzepte pro Modul (Formular-Lookups, Serviceaufrufe aus Prozessen, Datenquellen für Berichte).
3. **Eine einzige Abstraktion, der Provider**, die von jedem Modul genutzt wird.

## Entscheidung

Option 3. Ein **Provider** ist eine benannte, parametrisierte Datenquelle mit einem deklarierten Ausgabeschema.

- **Typen:** SQL-Abfrage, Stored Procedure oder Funktion (auf SQL Server, Oracle, PostgreSQL oder MySQL); REST;
  SOAP/WSDL; sowie Systementitäten, die die Plattform selbst bereitstellt.
- **Verbindungen** (Verbindungszeichenfolgen für Datenbanken, Service-Endpunkte mit Proxy und Zugangsdaten) werden
  getrennt von den Providern definiert, einer Organisation zugeordnet und den Personen, die einen Provider verwenden,
  nie angezeigt.
- **Fünf Quellen für einen Parameterwert:**

  | Quelle | Herkunft des Werts | Für den Konsumenten sichtbar |
  | --- | --- | --- |
  | Normal | Der Aufrufer, mit optionalem Standardwert | Ja |
  | Konstant | Die Provider-Definition | Nein |
  | Systemisch | Die Laufzeit: aktueller Benutzer, Rolle, Organisation | Nein |
  | Systemeinstellung | Ein Schlüssel in den Einstellungen der Plattform | Nein |
  | Anwendungskonfiguration | Ein Schlüssel in der Anwendungskonfiguration | Nein |

  Nur „normale“ Parameter sind für die Person, die das Formular gestaltet, oder für den API-Aufrufer sichtbar. Ein
  Formular kann daher nie die Benutzer-ID einer anderen Person übergeben, und ein Designer sieht nie einen API-Schlüssel.
- **REST-Besonderheiten:** JSON-, XML-, Datei- oder Textantworten; ein Stammpfad zu den Feldern in verschachtelten
  Antworten; XML wird zu JSON normalisiert; Paging; eine Testkonsole mit Beispielwerten.
- **Schutzmechanismen:** Von Designern geschriebenes SQL wird geparst und gegen eine konfigurierbare Denylist von
  Datenbankobjekten geprüft. Ausgehende Aufrufe können auf eine Allowlist von Hosts beschränkt werden. Jede Ausführung
  kann mit ihren Parametern protokolliert werden.
- **Konsumenten:** Formularfelder und -schaltflächen, Formular-Datenquellen, Service-, Send- und Receive-Tasks in
  Prozessen, Nachrichtenereignisse, Berichtsdatenquellen, benutzerdefinierte Posteingänge, Benachrichtigungsprozeduren,
  Berichts-Alerts sowie die HTTP-Endpunkte des „Service Bus“, die einen Provider oder einen Prozess für andere Systeme
  bereitstellen.

## Konsequenzen

### Vorteile

- Ein Konnektor bedient jedes Modul. Wird eine Verbindung korrigiert, ist sie überall korrigiert.
- Integrationsarbeit wanderte von den Entwicklern zu den Analysten, und genau darum geht es bei einer Low-Code-Plattform.
- Verborgene Parameterquellen haben eine ganze Klasse von Fehlern nach dem Muster „dem Client vertrauen“ bereits durch
  das Design ausgeschlossen.
- Sicherheitsreviews haben eine einzige Stelle, die sie prüfen müssen.

### Nachteile

- **Von Natur aus synchron.** Provider werden innerhalb des Requests des Benutzers aufgerufen, ohne Retry, Backoff oder
  Circuit Breaker. Ein langsames externes System wird zu einem langsamen Formular.
- **Designer schreiben SQL gegen Produktivsysteme.** Der Schutz durch den Parser hilft, aber das erfordert Governance:
  Wer darf Provider anlegen, gegen welche Verbindungen, von wem geprüft?
- **Zur Laufzeit generierte SOAP-Clients** sind teuer in der Erstellung und müssen zwischengespeichert werden.

## Rückblickend

Die Abstraktion ist das Beste an der Plattform, und ich würde sie wieder so bauen. Ergänzen würde ich sie um:

1. **Resilienz-Policies pro Verbindung:** Timeout, Retry mit Jitter, Circuit Breaker, Bulkhead.
2. **Asynchrone Nutzung aus Prozessen** über eine Outbox, damit ein Service Task nicht den Request eines Benutzers
   blockiert (ADR-0002).
3. **Geheimnisse in einem Vault** (oder zumindest eine per DPAPI oder Zertifikat geschützte Konfiguration), referenziert
   über ihren Namen.
4. **Import von OpenAPI und WSDL**, der das Ausgabeschema und ein typisiertes Testformular automatisch erzeugt.
5. **Rate Limits und Metriken pro Verbindung**, damit ein einzelner lastintensiver Bericht nicht die API eines Partners
   erschöpfen kann.

# 1. Systemüberblick

[Startseite](../../README.de.md) · **Überblick** · [C4-Modell](02-c4-model.md) · [Prozess-Engine](03-process-engine.md) · [ADRs](adr/README.md) · [Lasttests](04-load-testing.md) · [Sicherheitslehren](05-security-lessons.md) · [Rückblick](06-retrospective.md) · [Glossar](glossary.md) · [English](../en/01-overview.md)

## Was das System ist

GraphBPMS ist eine Enterprise-Low-Code-Plattform für das Geschäftsprozessmanagement. Organisationen modellieren damit
einen Prozess in BPMN 2.0, verknüpfen seine Schritte mit Formularen, führen ihn aus und überwachen seine Leistung – ohne
Code zu schreiben. Um die Prozess-Engine herum gruppieren sich rund dreißig Funktionsmodule: ein Formular-Designer, ein
Berichtsdesigner, Dashboards, eine DMN-Entscheidungs-Engine, Datenkonnektoren, Benachrichtigungen, eine
Dokumentenablage, ein öffentliches Self-Service-Portal, eine offlinefähige mobile App und GIS.

Der typische Kunde ist eine große Organisation des öffentlichen Sektors oder der Infrastruktur mit mehreren
Unterorganisationen. Er betreibt die Plattform auf eigenen Servern und benötigt jede Bildschirmmaske auf Persisch, von
rechts nach links, mit dem persischen Sonnenkalender (Jalali-Kalender).

Ich habe das Plattform-Engineering-Team geleitet, das den Kern entwickelt: Backend, Frontend, UX/UI, Delivery und die
Infrastruktur, auf der das Produkt läuft. Die Notizen in diesem Repository sind meine eigene Beschreibung der
Architektur und der Überlegungen dahinter.

## Wer es nutzt

| Akteur | Was sie tun |
| --- | --- |
| Mitarbeitende | Stellen Anträge, arbeiten den Posteingang ab, genehmigen oder lehnen ab, hängen Dokumente an. |
| Führungskraft | Liest Dashboards und Ansichten der Prozessüberwachung (BAM), gibt bei Abwesenheit Arbeit an eine Vertretung ab. |
| Prozessdesigner | Modelliert Prozesse, Formulare, Entscheidungstabellen, Berichte und Datenkonnektoren. Meist ein Analyst, kein Entwickler. |
| Administrator | Verwaltet Organisationen, Benutzer, Rollen, Berechtigungen und Systemeinstellungen. |
| Außendienstmitarbeitende | Erfassen Daten offline auf einem Android-Gerät, mit GPS, Fotos und QR-Codes. |
| Externe Benutzer | Füllen öffentliche Formulare im Self-Service-Portal ohne Benutzerkonto aus. |
| Externes System | Startet Prozesse, sendet Nachrichten an wartende Instanzen und liest Daten über die API. |

## Qualitätsziele

Geordnet nach der Priorität, mit der wir sie gegeneinander abgewogen haben.

| # | Qualitätsziel | Bedeutung in der Praxis |
| --- | --- | --- |
| 1 | Sicherheit, die einer externen Evaluierung standhält | Jede Hauptversion besteht eine nationale Sicherheitsevaluierung von IT-Produkten (AFTA, Stufe 1). Vor jedem Go-live steht ein Scan mit OWASP ZAP. Autorisierung wird auf dem Server durchgesetzt, nie nur in der Oberfläche. |
| 2 | Isolation zwischen Organisationen | Eine Installation beherbergt viele Organisationen. Ein Benutzer sieht nur die Daten der Organisation, in der er gerade arbeitet. |
| 3 | Änderbar durch Nicht-Entwickler | Analysten ändern Prozesse, Formulare und Regeln ohne Release. Die Veröffentlichung einer neuen Prozessversion beschädigt nie laufende Fälle. |
| 4 | Vorhersagbare Performance unter Spitzenlast | Abnahmeziele: 95 % der Requests unter 2 s, mindestens 500 Transaktionen pro Sekunde, im Spike-Test mit bis zu 5.000 gleichzeitigen Benutzern geprüft. |
| 5 | Auditierbarkeit | Jeder Schritt jedes Falls lässt sich rekonstruieren: wer was wann getan hat, mit welchen Daten und auf welcher Version des Prozesses. |
| 6 | Betreibbar im eigenen Rechenzentrum (On-Premises) | Die Kunden-IT installiert, sichert und aktualisiert die Plattform ohne Internetzugang und ohne unsere Ingenieure vor Ort. |

## Randbedingungen

- **Ausschließlich On-Premises.** Die Produktionsumgebung steht im Rechenzentrum des Kunden, hinter dessen DMZ und
  Reverse Proxy. Unser Team hat keinen ständigen Zugriff auf Produktionsdaten.
- **Microsoft-Stack.** Windows Server, IIS und SQL Server sind das, was die IT-Abteilungen der Kunden lizenzieren und
  zu betreiben wissen. Die Anwendung basiert auf ASP.NET MVC unter .NET Framework 4.8.
- **Lokalisierung ist nicht optional.** Jalali-Datumsangaben in jedem Formular, jedem Bericht, jedem Timer und jedem
  Cron-Ausdruck; Layout von rechts nach links; mehrsprachige Beschriftungen.
- **Sicherheitsevaluierung pro Version.** Ein Zertifikat gilt für genau eine Produktversion, daher ist Sicherheitsarbeit
  Teil des Release-Prozesses und kein Projekt.
- **Kommerzielle Komponenten.** Der Berichtsdesigner, funktionsreiche Grids und Diagramme sind lizenzierte
  Drittanbieterkomponenten, die im selben Prozess wie die Anwendung laufen.
- **Offline-Arbeit im Außendienst.** Außendienstmitarbeitende haben oft kein Netz, daher muss die mobile App offline
  funktionieren und später synchronisieren.

## Lösungsstrategie

| Aspekt | Ansatz | Details |
| --- | --- | --- |
| Datenzugriff | Benannte, parametrisierte Stored Procedures für nahezu jede Datenbankoperation, aufgerufen über einen schlanken Dapper-Wrapper. | [ADR-0001](adr/0001-stored-procedures-as-the-data-access-contract.md) |
| Prozessausführung | Ein selbst entwickelter BPMN-Interpreter, der den Graphen innerhalb des Requests durchläuft, bis jeder Pfad einen Wartezustand erreicht. | [ADR-0002](adr/0002-graph-walking-engine-inside-the-request.md) |
| Prozessänderungen | Unveränderliche Versionen. Laufende Instanzen bleiben auf der Version, mit der sie gestartet wurden. | [ADR-0003](adr/0003-pin-running-instances-to-their-version.md) |
| Mandantenfähigkeit | Eine gemeinsame Datenbank. Die Organisation ist ein Geltungsbereich, der in den Claims des Benutzers mitgeführt und an jede Abfrage übergeben wird. | [ADR-0004](adr/0004-multi-organization-tenancy-in-one-database.md) |
| Autorisierung | Rollenbasierte Zugriffskontrolle vom Modul bis hinunter zum einzelnen Datensatz, Verbot hat Vorrang, in vier Schichten durchgesetzt. | [ADR-0005](adr/0005-rbac-down-to-record-level.md) |
| Timer | Dauerhafter, clusterfähiger Scheduler in derselben Datenbank, mit Jalali-fähigen Zeitplänen. | [ADR-0006](adr/0006-durable-clustered-timers.md) |
| Formulare | Jedes Formular besitzt eine echte, typisierte Tabelle, die aus seiner Definition generiert wird. | [ADR-0007](adr/0007-dynamic-forms-as-physical-tables.md) |
| Integration | Eine einzige „Provider“-Abstraktion für SQL-, REST- und SOAP-Quellen, die von Formularen, Prozessen und Berichten wiederverwendet wird. | [ADR-0008](adr/0008-providers-as-the-single-integration-abstraction.md) |
| Echtzeit | Server-Sent Events zuerst, Web Push als Fallback. | [ADR-0009](adr/0009-server-sent-events-first-web-push-as-fallback.md) |
| Lesender Hot Path (stark frequentierter Pfad) | Eine denormalisierte Posteingangstabelle, die von der Engine gepflegt wird. | [ADR-0010](adr/0010-denormalized-inbox-read-model.md) |
| Gefahrloses Experimentieren | Eine Test-Sandbox innerhalb der produktiven Engine. | [ADR-0011](adr/0011-test-sandbox-inside-the-production-engine.md) |

## Die Plattform auf einen Blick

| Kennzahl | Wert |
| --- | --- |
| Funktionsmodule | 30 |
| Kerntabellen der Datenbank | 168 (davon 46 für die Prozess-Engine), plus eine generierte Tabelle pro Formular |
| Fremdschlüssel | 222 |
| Stored Procedures | etwa 1.000 (etwa 400 für Prozess-Engine und Posteingang) |
| MVC-Controller | etwa 80, mit etwa 1.100 Action-Methoden |
| Anwendungscode | etwa eine Viertelmillion Zeilen C# |
| Performance-Abnahme | p95 < 2 s, ≥ 500 TPS, < 1 % Fehler, Spike-Test mit bis zu 5.000 gleichzeitigen Benutzern |

Die Zahlen stammen aus der technischen Dokumentation des Produkts. Die Performance-Werte sind Abnahmeziele einer
Referenzinstallation und hängen von Hardware und Datenvolumen ab.

## Modullandkarte

| Gruppe | Module |
| --- | --- |
| Fachlicher Kern | Prozess-Engine (BPMN 2.0), Formular-Designer, Berichtsdesigner, datengesteuerte Berichts-Alerts, Dashboards, Entscheidungstabellen (DMN), Außendienstaufgaben |
| Daten und Integration | Daten-Provider und Verbindungen, Stammdaten und Wertelisten, Dokumente und Archiv |
| Benutzer und Sicherheit | Benutzer und Organisationen, Zugriffsstufen, Authentifizierung |
| Kommunikation | Mehrkanal-Benachrichtigungen, Browser-Push |
| Außendienst und Standort | Karten und Geofences, Versionen und Geräte der mobilen App |
| Inhalte | Öffentliches Portal, Intranet-News, Abstimmungen, Fragebögen, Tags |
| Konfiguration | Menüs und Module, dynamische Seiten, Theming, Sprachen, Systemeinstellungen |
| Infrastruktur | Scheduler und Hintergrundjobs, Logging und Monitoring, Lizenzierung und Datenbankversionierung |

## Technologie-Stack

| Bereich | Technologie |
| --- | --- |
| Server | ASP.NET MVC 5, C#, Razor, OWIN, .NET Framework 4.8 auf IIS 10 (Windows Server 2019/2022) |
| Datenbank | SQL Server 2019/2022, Dapper, etwa 20 Tabellentypen (Table-Valued Types) für Massenoperationen |
| Dependency Injection | Autofac |
| Zeitsteuerung | Quartz.NET mit clusterfähigem Job-Store in SQL Server |
| Identität | Cookie-Authentifizierung, OpenID Connect, LDAP / Active Directory, JWT für die mobile App |
| Prozesslogik | Selbst entwickelte Engine für BPMN 2.0, DMN-Entscheidungs-Engine, Script Tasks in JavaScript (Jint) und in C# (Roslyn) |
| Berichte und Oberfläche | Stimulsoft Reports, DevExpress, ActiveQueryBuilder, jQuery, Knockout, Bootstrap |
| Echtzeit | Server-Sent Events, Web Push (VAPID) |
| Karten | Leaflet, Esri Leaflet, WMS, ArcGIS REST |
| Mobil | Gebrandete Android-App, auf dem Server gebaut, dazu eine offlinefähige PWA auf Basis von IndexedDB |
| Qualität | SonarQube, Selenium, JMeter, k6, OWASP ZAP |

## Was diese Notizen nicht sind

Sie enthalten weder Quellcode noch Datenbankschema, Konfiguration oder Screenshots des Produkts und auch keine
Kundennamen oder Kundendaten. Die Diagramme sind vereinfacht, und die Namen interner Klassen und Prozeduren sind durch
beschreibende Begriffe ersetzt. Der Code in [`load-testing/`](../../load-testing/) wurde für dieses Repository von Grund
auf neu geschrieben und läuft gegen eine Mock-API.

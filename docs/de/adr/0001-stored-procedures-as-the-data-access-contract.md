# ADR-0001: Stored Procedures als Vertrag für den Datenzugriff

[ADR-Übersicht](README.md) · [English](../../en/adr/0001-stored-procedures-as-the-data-access-contract.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Alle Module; die Container Webanwendung und Datenbank |
| Verwandt | [ADR-0007](0007-dynamic-forms-as-physical-tables.md), [ADR-0010](0010-denormalized-inbox-read-model.md) |

## Kontext

Die Plattform läuft ausschließlich auf SQL Server, in Rechenzentren der Kunden, auf die wir keinen Zugriff haben.
Drei Personengruppen arbeiten mit derselben Datenbank:

- das Plattformteam, das das Produkt entwickelt;
- Einführungsteams, die für jeden Kunden Prozesse modellieren und T-SQL für kundenspezifische Berichte und
  Konnektoren schreiben;
- die DBAs der Kunden, die den Server sichern, optimieren und auditieren.

Die wichtigsten Abfragen sind mengenbasiert und komplex: Posteingang, Prozessmonitoring (BAM),
Berechtigungsauflösung und Reporting. Sie verknüpfen viele Tabellen und müssen auf realen Datenmengen optimiert
werden. Die Sicherheitsevaluierung, die jede Version durchläuft, testet systematisch auf Injection, und die Prüfer
fragen, wie Injection konstruktiv verhindert wird.

## Entscheidungstreiber

- Injection muss konstruktiv ausgeschlossen sein, nicht erst durch Code-Reviews.
- Stark frequentierte Abfragen müssen von Leuten optimiert werden können, die in Ausführungsplänen denken, manchmal
  auf dem Server eines Kunden und ohne vollständiges Release.
- Die DBAs der Kunden brauchen eine klare, prüfbare Schnittstelle zwischen der Anwendung und ihrer Datenbank.
- Ein kleines Team muss das über rund 30 Module hinweg durchhalten.

## Betrachtete Optionen

1. Ein vollwertiges ORM (Entity Framework 6) mit per LINQ generiertem SQL.
2. Ein Micro-ORM (Dapper) mit parametrisierten SQL-Strings im Anwendungscode.
3. Ein Micro-ORM, das **genau eine benannte Stored Procedure pro Datenbankoperation** aufruft, ohne SQL-Text im
   Anwendungscode.
4. Eine Mischung: ein ORM für einfaches CRUD und Stored Procedures für Hot Paths (stark frequentierte Pfade).

## Entscheidung

Option 3. Datenbankoperationen sind benannte, parametrisierte Stored Procedures. Die Anwendung greift über
einen einzigen schlanken Wrapper um Dapper auf die Datenbank zu. Der Wrapper erledigt vier Dinge: Er bildet
Prozedurnamen und Parameter ab, unterstützt Tabellenwertparameter und mehrere Ergebnismengen, protokolliert den
Aufruf mit seiner Dauer und tut sonst nichts.

Damit gehen folgende Regeln einher:

- Controller rufen die Datenzugriffsschicht nicht direkt auf, und Anwendungsservices bauen keine SQL-Strings
  zusammen.
- Generiertes SQL ist auf wenige dafür vorgesehene Codestellen beschränkt: Bezeichner wie Sortierspalten innerhalb
  von Prozeduren sowie die Komponenten, die Formulartabellen (ADR-0007), generische Filter und den
  Konfigurationsabgleich erzeugen. Werte sind Parameter.
- Massenoperationen verwenden Tabellenwertparameter (rund 20 benutzerdefinierte Tabellentypen) statt langer
  Parameterlisten oder kommagetrennter Strings.
- Validierung und Ereigniserfassung liegen in der Anwendung. Trigger beschränken sich auf eine Handvoll, die
  Änderungszeitstempel pflegen, und es gibt keine CHECK-Constraints. Die referenzielle Integrität wird über
  Fremdschlüssel durchgesetzt (222 Stück).
- Datenbankänderungen werden als idempotente Skripte ausgeliefert (`CREATE OR ALTER`, abgesichertes
  `ALTER TABLE`). Eine Versionstabelle protokolliert jedes Upgrade und ein explizites Kennzeichen „Update
  freigegeben“.
- Die meisten Prozeduren werden auf Kundenservern obfuskiert bereitgestellt, um geistiges Eigentum zu schützen. Als
  Sicherheitsmaßnahme haben wir das nie gezählt.

## Konsequenzen

### Vorteile

- Die Angriffsfläche für Injection ist klein und leicht zu auditieren. Den Prüfern lässt sich der einzige Weg vom
  Controller zur Datenbank zeigen.
- Hot Paths werden dort optimiert, wo das Wissen sitzt. Eine langsame Posteingangsabfrage konnten wir noch am selben
  Tag auf dem Server eines Kunden beheben und dieselbe Korrektur mit dem nächsten Release ausliefern.
- Das Berechtigungsmodell der Datenbank kann eng gefasst sein: Das Anwendungskonto muss Prozeduren ausführen dürfen
  und kaum etwas anderes (außer DDL für Formulartabellen, siehe ADR-0007).
- Die Einführungsteams verwenden dieselben Prozeduren in Berichten und Konnektoren wieder, es gibt also ein
  gemeinsames Vokabular.

### Nachteile

- Rund 1.000 Prozeduren müssen versioniert, geprüft, ausgerollt und mit der Anwendung synchron gehalten werden.
  Versionsabweichungen zwischen dem Code und der Datenbank eines Kunden sind ein reales Fehlerszenario, deshalb
  prüft das Release-Tooling die Datenbankversion gegen die Anwendungsversion.
- Geschäftsregeln wandern in T-SQL ab. Manche Logik existiert sowohl in C# als auch in SQL, und nur
  Integrationstests decken Unterschiede auf.
- Regeln erodieren ohne Tooling. Im Lauf der Jahre schleichen sich Ausnahmen von „kein SQL außerhalb von Prozeduren“
  und „Werte sind Parameter“ ein, und nur automatisierte Prüfungen (Analyzer, grep-Regeln in der CI) finden sie
  zuverlässig.
- Unit-Tests sind schwieriger. Die meisten Prozeduren sind durch End-to-End-Tests abgedeckt, nicht durch schnelle
  Tests.
- Starke Bindung an SQL Server (Lock-in). Andere Datenbanken (Oracle, PostgreSQL, MySQL) werden nur als *externe*
  Datenquellen unterstützt.
- Die Protokollierung jedes Aufrufs im Wrapper verdoppelt unter Last die Zahl der Schreibvorgänge, sofern sie nicht
  optimiert wird. Audit-Logging braucht ein eigenes Budget.
- Obfuskierte Prozeduren verlangsamen Diffs und Debugging beim Kunden vor Ort.

## Rückblickend

Für die mengenbasierten, performancekritischen Pfade würde ich Stored Procedures beibehalten: Posteingang,
Berechtigungsauflösung, Monitoring und Reporting. Für einfaches CRUD würde ich parametrisiertes SQL direkt neben dem
Code verwenden, der es nutzt, über Dapper oder EF Core, damit ein Feature und sein Datenzugriff in einem Pull
Request liegen.

Außerdem würde ich die gesamte Datenbank als maßgebliche Quelle (Source of Truth) unter Versionskontrolle stellen,
mit einem Migrationswerkzeug (DbUp oder Flyway), das die CI auf einen echten SQL Server in einem Container anwendet.
Prozeduren mit Logik bekämen tSQLt-Tests. Und auf die Obfuskierung würde ich verzichten: Sie kostet Zeit und
schützt wenig.

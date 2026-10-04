# ADR-0011: Eine Test-Sandbox innerhalb der produktiven Engine

[ADR-Übersicht](README.md) · [English](../../en/adr/0011-test-sandbox-inside-the-production-engine.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Prozessdesigner, Prozess-Engine, Posteingang, Monitoring |
| Verwandt | [ADR-0003](0003-pin-running-instances-to-their-version.md), [ADR-0004](0004-multi-organization-tenancy-in-one-database.md) |

## Kontext

Designer müssen einen Prozess ausführen können, bevor sie ihn veröffentlichen: die Schritte durchklicken, Routing und
Bedingungen prüfen, die echten Konnektoren aufrufen. Viele On-Premises-Kunden haben keine Staging-Umgebung mit
produktionsnaher Konfiguration. Wo es eine gibt, ist sie veraltet, und ihre Konnektoren zeigen ins Leere.

Die Designer wollten deshalb **in der Produktion** testen, mit den produktiven Benutzern, Rollen, Organigrammen und
Datenquellen, ohne dass echte Benutzer etwas davon sehen.

## Entscheidungstreiber

- Realistische Tests: dasselbe Organigramm, dieselben Rollen und Konnektoren wie im echten Betrieb.
- Keinerlei Sichtbarkeit für echte Benutzer: nichts in ihren Posteingängen, keine Benachrichtigungen, nichts im
  Monitoring.
- Hilfen zur Fehlersuche: schrittweise ausführen, Schritte überspringen, Variablen inspizieren.
- Keine zweite Installation, die gepflegt werden muss.

## Betrachtete Optionen

1. Eine separate Staging-Installation vorschreiben.
2. Ein Simulationsmodus, der nichts persistiert.
3. **Eine markierte Sandbox innerhalb der produktiven Engine.**

## Entscheidung

Option 3.

- Jedes Diagramm im Test erhält eine aus seinem Inhalt abgeleitete **Testumgebungs-ID**. Das Diagramm wird als Version
  gespeichert, die mit dieser ID markiert ist, getrennt von der aktiven Version.
- **Jede Laufzeitzeile, die in der Sandbox entsteht, trägt die Markierung:** Instanzen, Work Items, Elemente und
  Variablenhistorie. Auch Kindprozesse, die durch Call Activities gestartet werden, werden markiert.
- **Die Abfragen hinter dem, was echte Benutzer sehen, schließen markierte Zeilen aus:** Posteingänge, Prozesslisten
  und Monitoring.
- Im Testmodus werden Benachrichtigungen unterdrückt und Lane-Prüfungen gelockert, sodass ein einzelner Designer für
  jede Lane handeln kann. Haltepunkte, „Fortsetzen“ und „Schritt überspringen“ stehen zur Verfügung.

## Konsequenzen

### Vorteile

- Designer testen gegen die Realität, ohne zweite Installation, und Analysten finden Routing-Fehler, bevor Benutzer
  darauf stoßen.
- Die Debugging-Funktionen leben in derselben Engine wie die Produktion, daher sagt der Test die Wahrheit über das
  Produktivverhalten.

### Nachteile

- **Dieselbe Schwäche wie bei der Mandantenfähigkeit (ADR-0004).** Die Isolation hängt davon ab, dass jede Abfrage an
  den Filter denkt. Broadcast-artige Funktionen sind der schwierigste Fall, weil sie Instanzgrenzen per Design
  überschreiten.
- **Testversionen liegen in der produktiven Prozessgruppe.** Versionsaktivierung, Abfragen nach der „neuesten Version“
  und Bereinigung müssen sie explizit ignorieren.
- **Echte Konnektoren bedeuten echte Seiteneffekte.** Ein Service Task, der in das Finanzsystem schreibt, schreibt auch
  im Testmodus. Designer benötigen pro Verbindung ein „Test-Double“ oder einen Nur-Lese-Modus.
- Testdaten sammeln sich in der Produktivdatenbank an und benötigen einen Bereinigungsjob.

## Rückblickend

Testen in der Produktion ist wirklich nützlich, und ich würde es beibehalten. Die Umgebung würde ich zu einer
**vollwertigen Dimension** machen, die wie der Mandant zentral durchgesetzt wird: als Teil des impliziten Kontexts,
angewendet durch Row-Level-Security-Richtlinien und als Teil des Schlüssels jeder Abfrage, deren Ergebnis ein Benutzer
sieht. Außerdem würde ich pro Verbindung einen Schalter mit drei Modi ergänzen, „Live“, „Nur lesen“ und „Mock“, damit
ein Designer die Seiteneffekte eines Testlaufs explizit wählen kann.

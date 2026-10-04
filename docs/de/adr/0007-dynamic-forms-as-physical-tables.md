# ADR-0007: Jedes dynamische Formular besitzt eine physische Tabelle

[ADR-Übersicht](README.md) · [English](../../en/adr/0007-dynamic-forms-as-physical-tables.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Formular-Designer, Formular-Laufzeit, Berichte, Provider, Synchronisation zwischen Installationen |
| Verwandt | [ADR-0001](0001-stored-procedures-as-the-data-access-contract.md), [ADR-0005](0005-rbac-down-to-record-level.md), [ADR-0008](0008-providers-as-the-single-integration-abstraction.md) |

## Kontext

Mit dem Formular-Designer entwerfen Analysten Erfassungsformulare ohne Code: beliebig viele Felder, Unterformulare,
berechnete Felder, Nachschlagefelder, Karten, Unterschriften und Anhänge. Dasselbe Formular wird im Web, in der mobilen
App, innerhalb von Prozessschritten und in Berichten verwendet.

Formulardaten bleiben nicht innerhalb der Plattform. Kunden fragen sie mit dem Berichtsdesigner und mit BI-Werkzeugen
ab, stellen sie anderen Systemen über schreibgeschützte Sichten und Konnektoren bereit und erwarten, dass ihre DBAs sie
wie jede andere Tabelle indizieren.

## Entscheidungstreiber

- Formulardaten müssen für Berichte, BI-Werkzeuge und die DBAs der Kunden mit einfachem SQL abfragbar sein.
- Typisierte Spalten, Indizes und Fremdschlüssel.
- Designer ändern Formulare nach dem Go-live, während bereits Daten existieren.
- Keine neue Datenbanktechnologie bei den Kunden vor Ort.

## Betrachtete Optionen

1. Entity–Attribute–Value: eine Zeile pro Feldwert.
2. Ein JSON-Dokument pro Datensatz in einer generischen Tabelle, mit den JSON-Funktionen von SQL Server.
3. **Eine physische Tabelle pro Formular**, erzeugt und geändert anhand der Formulardefinition.
4. Eine separate Dokumentendatenbank.

## Entscheidung

Option 3.

- Die Formulardefinition (XML) ist die Quelle. Beim Speichern eines Formulars wird die neue Definition per **Diff** mit
  der vorherigen verglichen und daraus DDL erzeugt: Tabelle anlegen, Spalten hinzufügen, ändern oder löschen,
  Standardwerte hinzufügen, Fremdschlüssel zu verknüpften Formularen hinzufügen, berechnete Spalten hinzufügen. Die DDL
  läuft zusammen mit der Aktualisierung der Definition in einer Transaktion.
- Jede Formulartabelle hat Standard-Metadatenspalten: Ersteller und letzter Bearbeiter (Benutzer, Rolle, Organisation)
  sowie die zugehörigen Zeitstempel. Regeln auf Zeilenebene wie „nur von meiner Rolle angelegte Zeilen“ (ADR-0005) und
  die Mandantenfilterung (ADR-0004) bauen darauf auf.
- Unterformulare werden zu verknüpften Tabellen mit Fremdschlüsseln. Fragebogenfelder erhalten eine Kindtabelle. Ist
  die Datenversionierung eingeschaltet, hält eine Audit-Tabelle pro Formular jede Änderung fest.
- **Von Designern vergebene Namen werden validiert**, und zwar anhand von Namensregeln (keine führenden Ziffern,
  keine reservierten Spaltennamen), bevor DDL erzeugt wird. Die Formulardaten selbst werden immer mit Parametern
  geschrieben.
- **Daten werden nie stillschweigend verworfen.** Eine abgelöste Kindtabelle wird umbenannt, nicht gelöscht. Der
  Formular-Designer blockiert Strukturänderungen an einem Formular, das bereits digital signierte Datensätze enthält.
- Ein Formular kann auch „ohne Tabelle“ definiert werden, für reine Berechnungs- oder Anzeigeformulare.

## Konsequenzen

### Vorteile

- Berichte, BI-Werkzeuge und Kundensysteme lesen Formulardaten mit gewöhnlichem SQL, typisiert und indizierbar.
- Die Performance ist vorhersagbar. Ein Formular mit einer Million Zeilen verhält sich wie jede andere Tabelle und lässt
  sich auf dieselbe Weise optimieren.
- DBAs sehen in ihren Monitoring-Werkzeugen echte Tabellen mit echten Namen.

### Nachteile

- **DDL zur Laufzeit erfordert DDL-Rechte.** Das Anwendungskonto darf Tabellen ändern; das sind mehr Rechte, als der
  Rest der Anwendung benötigt. Das ist ein bewusster, dokumentierter Kompromiss, und er erfordert kompensierende
  Kontrollen: Namensvalidierung, Allowlists und die Behandlung von Designern als privilegierte Benutzer.
- **Schemaänderungen an großen Tabellen setzen Sperren.** Den Spaltentyp eines stark genutzten Formulars mittags zu
  ändern, ist keine gute Idee, und das muss man den Designern beibringen.
- **Die Anzahl der Tabellen wächst** mit jedem Formular. Um Formulare zwischen Installationen zu übertragen, braucht es
  ein eigenes Export-/Importmodul, das Definitionen und Abhängigkeiten gemeinsam transportiert.
- Berechnete Spalten werden von Designern definiert, daher ist der DDL-Pfad Teil der Designer-Berechtigung. Designer
  müssen als privilegierte Benutzer behandelt werden, mit der Prüfung und dem Audit, die das mit sich bringt (siehe
  die [Sicherheitslehren](../05-security-lessons.md)).

## Rückblickend

Bei einer Neuentwicklung würde ich Datensätze in einer **JSON-Spalte** speichern (PostgreSQL `jsonb` oder den JSON-Typ
von SQL Server) und **generierte, indizierte Spalten** nur für die Felder hinzufügen, nach denen Berichte filtern oder
sortieren. So bleibt der SQL-Zugriff für das Reporting erhalten, ohne DDL zur Laufzeit bei jeder Änderung.

Sind physische Tabellen zwingend erforderlich, würde ich DDL über einen separaten „Schema-Service“ mit minimalen Rechten
und eigenem Konto ausführen, mit Verfahren für Online-Schemaänderungen und einem Freigabeschritt für destruktive
Änderungen.

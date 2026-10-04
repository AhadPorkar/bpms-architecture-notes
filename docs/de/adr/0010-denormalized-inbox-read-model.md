# ADR-0010: Ein denormalisiertes Lesemodell für den Posteingang

[ADR-Übersicht](README.md) · [English](../../en/adr/0010-denormalized-inbox-read-model.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Prozess-Engine, Posteingang, mobile App |
| Verwandt | [ADR-0001](0001-stored-procedures-as-the-data-access-contract.md), [ADR-0005](0005-rbac-down-to-record-level.md), [ADR-0009](0009-server-sent-events-first-web-push-as-fallback.md) |

## Kontext

Der Posteingang ist die am häufigsten aufgerufene Seite des Systems. Jeder Benutzer öffnet ihn nach der Anmeldung und
erneut nach jeder erledigten Aufgabe, und auch die mobile App liest ihn.

Einen Posteingang aus den normalisierten Engine-Tabellen zu berechnen, erfordert viele Joins: Work Items, Instanzen,
Versionen, Prozessgruppen, Lanes, Vertretungsregeln, Rollen, Organisationen, Formulartitel, Lesestatus und das
Testumgebungs-Flag. Hinzu kommen die benutzerspezifischen Berechtigungsfilter aus ADR-0005. Diese Abfrage ist teuer, ihr
Ausführungsplan reagiert empfindlich auf Parameter und Datenverteilung, und sie läuft genau dann am häufigsten, wenn die
Last ihren Höhepunkt erreicht: während der morgendlichen Anmeldewelle.

## Entscheidungstreiber

- Vorhersagbare Latenz des Posteingangs zur Spitzenlast, unabhängig davon, wie viele abgeschlossene Fälle in der
  Datenbank liegen.
- Einfache Ausführungspläne, die ein DBA nachvollziehen und indizieren kann.
- Keine neue Infrastruktur wie ein Cache-Server oder eine Suchmaschine.
- Der Posteingang darf nie einen Eintrag anzeigen, den die Engine nicht als offen betrachtet.

## Betrachtete Optionen

1. Die normalisierte Abfrage optimieren (Indizes, Hints, Plan Guides).
2. Posteingänge pro Benutzer im Arbeitsspeicher zwischenspeichern.
3. **Eine denormalisierte Posteingangstabelle pflegen**, die die Engine zusammen mit dem Work Item schreibt.
4. Eine indizierte Sicht.

## Entscheidung

Option 3: ein Lesemodell im Stil von CQRS ohne separaten Datenspeicher.

- Eine Zeile pro offenem Work Item und Empfänger. Sie enthält alles, was der Posteingang anzeigt: Titel, Prozess und
  Formular, Absender, Organisation, Zeitstempel, Gesehen-Status, Priorität, das Flag „angehalten“ und das
  Testumgebungs-Flag.
- Die Engine schreibt diese Projektion **in derselben lokalen Transaktion** wie das Work Item, das sie spiegelt. Wird
  ein Work Item abgeschlossen, an eine Vertretung übergeben oder angehalten, wird die Projektion auf dieselbe Weise
  aktualisiert.
- Abfragen des Posteingangs lesen ausschließlich die Projektion, mit abdeckenden Indizes für die häufigen Filter:
  Empfänger, Rolle, Organisation, Prozessgruppe und Datum.
- Monitoring- und Listenansichten, die leicht veraltete Daten tolerieren, lesen, ohne die schreibenden Vorgänge der
  Engine zu blockieren. Entscheidungen wie „Ist dieser Eintrag noch offen?“ lesen immer committete Daten aus den
  Quelltabellen.

## Konsequenzen

### Vorteile

- Die Latenz des Posteingangs bleibt konstant, während die Zahl abgeschlossener Fälle wächst. Paging ist günstig.
- Die Abfrage ist auf dem Server eines Kunden leicht zu verstehen, zu indizieren und zu optimieren.
- Die mobile App und benutzerdefinierte Posteingänge verwenden dieselbe Projektion.

### Nachteile

- **Schreibverstärkung.** Jede Änderung an einem Work Item wird zweimal geschrieben.
- **Abweichungen sind möglich.** Jeder Codepfad, der Work Items ändert, ohne den Schreibpfad der Engine zu durchlaufen,
  lässt die Projektion falsche Angaben machen. Das passiert zum Beispiel bei administrativen Massenkorrekturen. Dafür
  gibt es Reparaturskripte, und sie sind ein Warnsignal.
- **Flags werden gespiegelt**, etwa „angehalten“. Jedes neue Flag in der Quelle muss bewusst nachgezogen werden.

## Rückblickend

Ich würde das Lesemodell beibehalten und ändern, wie es befüllt und gelesen wird:

1. **Befüllung über Domänenereignisse.** Die Engine schreibt Ereignisse wie „Work Item angelegt/abgeschlossen/an
   Vertretung übergeben“ in derselben Transaktion in eine Outbox. Ein Projektor aktualisiert den Posteingang. Ein
   Rebuild-Befehl kann die Projektion dann jederzeit aus der Quelle neu erzeugen, und die Reparaturskripte verschwinden.
2. **`READ_COMMITTED_SNAPSHOT` auf Datenbankebene einschalten**, statt Dirty-Read-Hints pro Abfrage zu verwenden. Leser
   blockieren Schreiber nicht mehr, und niemand liest nicht committete Daten.
3. **Den Datenstand sichtbar machen**, etwa „vor 2 s aktualisiert“, falls die Projektion jemals asynchron befüllt wird.

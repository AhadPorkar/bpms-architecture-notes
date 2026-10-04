# ADR-0005: Rollenbasierte Zugriffskontrolle bis auf Datensatzebene

[ADR-Übersicht](README.md) · [English](../../en/adr/0005-rbac-down-to-record-level.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Autorisierung über alle Module hinweg |
| Verwandt | [ADR-0004](0004-multi-organization-tenancy-in-one-database.md), [ADR-0010](0010-denormalized-inbox-read-model.md) |

## Kontext

Kunden aus dem öffentlichen Sektor benötigen eine sehr feine Steuerung:

- wer welchen Prozess starten und wer welchen Bericht sehen darf;
- wer welches Dashboard bearbeiten und wer es weiter teilen darf;
- welche Felder eines Formulars in welchem Schritt sichtbar oder bearbeitbar sind;
- welche Formulardatensätze jede Person sehen darf.

Die Sicherheitsevaluierung prüft, dass die Autorisierung bei jedem Aufruf auf dem Server durchgesetzt wird und nicht nur
durch das Ausblenden von Schaltflächen. Berechtigungen müssen außerdem mit dem Organisationsbezug (ADR-0004) und mit
Vertretungen zusammenspielen.

## Entscheidungstreiber

- Serverseitige Durchsetzung an jedem Endpunkt, von einem externen Prüfer testbar.
- Granularität von einem ganzen Modul bis hinunter zu einem einzelnen Datensatz und einem einzelnen Feld.
- Teilen, das Fachanwender selbst verwalten können: einen Bericht oder ein Dashboard an eine Person, eine Rolle oder
  eine Organisation weitergeben.
- Vertretbare Kosten auf Hot Paths (stark frequentierten Pfaden): Menüs, Listen und Posteingang.

## Betrachtete Optionen

1. Grobe RBAC (Rolle → Seite) plus Eigentümerprüfungen im Code.
2. Ein hierarchischer Berechtigungskatalog mit Berechtigungseinträgen bis auf Datensatzebene, Verbot vor Erlaubnis.
3. Attributbasierte Zugriffskontrolle mit einer Richtliniensprache.
4. Beziehungsbasierte Zugriffskontrolle (Tupel im Stil von Zanzibar).

## Entscheidung

Option 2 mit den folgenden Elementen.

**Katalog.** Modul → Seite → Operation. Einige Operationen sind als „pro Datensatz“ gekennzeichnet (Anzeigen,
Bearbeiten, Löschen, Teilen, Zugriff verwalten, Kopieren …). Dynamische Formulare und dynamische Seiten tragen sich bei
ihrer Erstellung selbst in den Katalog ein.

**Berechtigungseinträge.** Ein Berechtigungseintrag ist das Tupel (Subjekt, Katalogeintrag, optionale Datensatz-ID,
Erlaubnis oder Verbot, Organisation). Ein Subjekt ist ein Benutzer oder eine Rolle. Rollen gibt es in zwei Arten:

- **Stellen**, von denen ein Benutzer jeweils genau eine aktiv hat und die einen Posteingang besitzen;
- **Rollengruppen**, die immer zusätzlich zur aktiven Stelle gelten.

**Auswertung.** Gesammelt werden die Berechtigungseinträge des Benutzers, der aktiven Stelle und aller Rollengruppen in
der aktuellen Organisation. Jedes passende Verbot hat Vorrang. Andernfalls gewährt jede passende Erlaubnis den Zugriff.
Andernfalls wird der Zugriff verweigert. Plattform- und Organisationsadministratoren werden über explizite
Administratorregeln behandelt statt über Berechtigungseinträge.

**Durchsetzung auf vier Ebenen:**

| Ebene | Mechanismus |
| --- | --- |
| Controller | Authentifizierung an jedem Controller. Sensible Controller deklarieren zusätzlich einen Access Manager: eine Zuordnung von Aktion zu Regel, in der eine Aktion ohne Eintrag verweigert wird. |
| Aktion | Ein Berechtigungsattribut benennt Modul, Seite und Operation und optional, welcher Parameter die Datensatz-ID enthält. |
| View | Menüs und Schaltflächen werden aus den aufgelösten Berechtigungen des Benutzers aufgebaut. Das dient nur dem Komfort und ist nie die eigentliche Kontrolle. |
| Daten | Listenprozeduren verknüpfen die Tabelle der Berechtigungseinträge per Join, sodass ein Benutzer immer nur Zeilen erhält, die er sehen darf. Formulardatensätze lassen sich zusätzlich pro Operation auf „von mir angelegte Zeilen“ oder „von meiner Rolle angelegte Zeilen“ beschränken. |

**Berechtigungseinträge auf Datensatzebene** werden beim Anlegen eines Datensatzes geschrieben: als Snapshot der Rechte
des Erstellers auf Seitenebene. Explizites Teilen fügt Berechtigungseinträge für Benutzer, Rollen oder ganze
Organisationen hinzu, mit einer gewählten Menge von Operationen (Anzeigen, Kopieren, Bearbeiten, Teilen). Ein Dashboard
kann außerdem für eine Gruppe verpflichtend gemacht werden.

**Feldebene.** Jeder User Task trägt Einstellungen pro Feld: sichtbar, aktiviert, schreibgeschützt, Pflichtfeld,
Standardwert. Beim Speichern ignoriert der Server ausgeblendete und schreibgeschützte Felder, unabhängig davon, was der
Browser sendet.

**Caching.** Aufgelöste Berechtigungen und Menüs werden pro Benutzer zwischengespeichert und über Tags (Benutzer, Rolle,
Rollengruppe) verworfen, sobald sich ein Berechtigungseintrag ändert.

## Konsequenzen

### Vorteile

- Fachanwender verwalten das Teilen selbst, sodass Administratoren kein Engpass sind.
- Geschützte Endpunkte beantworten einen direkten Aufruf mit 401 oder 403, nicht bloß mit einer ausgeblendeten
  Schaltfläche.
- „Verbot hat Vorrang“ macht Ausnahmen leicht formulierbar: alle in der Rolle außer dieser Person.
- Wo der Access Manager eingesetzt wird, wird „vergessen, eine neue Aktion zu schützen“ sofort sichtbar, weil nicht
  zugeordnete Aktionen fehlschlagen.

### Nachteile

- **Die Tabelle der Berechtigungseinträge wird zu einer der größten Tabellen** (Datensätze × Subjekte × Operationen).
  Listenabfragen bezahlen für den Join, daher sind Indizes auf den Berechtigungseinträgen ebenso wichtig wie Indizes auf
  den Daten.
- **Die Snapshot-Semantik überrascht.** Ändern sich die Seitenrechte einer Rolle, ändert das nichts an
  Berechtigungseinträgen, die für bestehende Datensätze bereits geschrieben wurden.
- **Zwei Auswertungspfade sind ein Risiko.** Die Live-Prüfung bei jedem Request und die zwischengespeicherte Liste, aus
  der die Oberfläche aufgebaut wird, wurden getrennt implementiert. Damit ihre Vorrangregeln identisch bleiben, braucht
  es Tests, keine guten Vorsätze.
- **Das mentale Modell ist für Administratoren schwer.** Ohne eine Ansicht „Effektive Berechtigungen: Warum kann sie
  das sehen?“ lassen sich Support-Tickets nur langsam beantworten.

## Rückblickend

Das Modell war für die Domäne richtig. Ändern würde ich die Implementierung:

1. **Ein einziger Policy Decision Point**, eine einzige Bibliothek, die von Request-Filtern, Listenabfragen und der
   Oberfläche genutzt wird. Dahinter eine tabellengesteuerte Testsuite: Subjekt, Ressource, Operation, erwartetes
   Ergebnis.
2. **Global standardmäßig verweigern.** Einen Autorisierungsfilter für jeden Controller registrieren. Anonymer Zugriff
   ist eine explizite Ausnahme, die im Code-Review sichtbar ist.
3. **Ein „Explain“-Endpunkt**, der zeigt, welcher Berechtigungseintrag eine Operation erlaubt oder verboten hat. Er
   macht sich durch eingesparte Supportzeit bezahlt.
4. **Beziehungsbasiertes Teilen** (OpenFGA oder eine Tabelle im Stil von Zanzibar) für die Funktionen zum Weiterleiten
   und Teilen. Teilen ist ein Beziehungsproblem, und dieses Modell skaliert besser, als Berechtigungseinträge pro
   Datensatz zu kopieren.

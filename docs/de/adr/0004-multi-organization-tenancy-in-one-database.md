# ADR-0004: Mandantenfähigkeit mit mehreren Organisationen in einer gemeinsamen Datenbank

[ADR-Übersicht](README.md) · [English](../../en/adr/0004-multi-organization-tenancy-in-one-database.md)

| | |
| --- | --- |
| Status | Angenommen, im Produktivbetrieb |
| Geltungsbereich | Alle Module; Identität, Autorisierung und jede mandantenbezogene Abfrage |
| Verwandt | [ADR-0005](0005-rbac-down-to-record-level.md), [ADR-0011](0011-test-sandbox-inside-the-production-engine.md) |

## Kontext

Ein typischer Kunde ist eine Unternehmensgruppe: eine Mutterorganisation mit Tochtergesellschaften oder ein Ministerium
mit Provinzbehörden. Gewünscht ist **eine einzige Installation**, die sie alle bedient:

- dieselben Prozessdefinitionen für alle, bei getrennt gehaltenen Daten;
- Personen, die für mehr als eine Einheit arbeiten, oft in jeweils einer anderen Rolle;
- organisationsübergreifende Prozesse, etwa ein Antrag, der in einer Tochtergesellschaft gestellt und in der Zentrale
  genehmigt wird;
- ein Backup, ein Upgrade und eine Lizenz.

Jeder Kunde betreibt seine eigene Installation auf eigenen Servern. „Mandant“ bezeichnet hier eine Organisation
*innerhalb* eines Kunden, nicht einen eigenständigen Kunden eines Cloud-Dienstes.

## Entscheidungstreiber

- Eine Isolation, die so gut ist, dass jede Organisation nur ihre eigenen Daten sieht und dies einer
  Sicherheitsevaluierung standhält.
- Organisationsübergreifende Prozesse und gemeinsam genutzte Definitionen müssen selbstverständlich sein, keine
  Sonderfälle.
- Eine Person muss die Organisation wechseln können, ohne sich abzumelden.
- Der Betrieb bleibt so einfach wie bei einer einzigen Datenbank.

## Betrachtete Optionen

1. Eine Datenbank pro Organisation.
2. Ein Schema pro Organisation in einer Datenbank.
3. Ein gemeinsames Schema mit einer Organisationsspalte in jeder mandantenbezogenen Tabelle.
4. Ein gemeinsames Schema, in dem **die Zugehörigkeit zu einer Organisation Teil der Rollenzuweisung ist**: Benutzer
   und Rollen sind global, und die Organisation ist ein Geltungsbereich für Zuweisungen, Berechtigungen und
   Laufzeitdaten.

## Entscheidung

Option 4.

- **Mitgliedschaft.** Benutzer und Rollen werden einmal definiert. Eine Rollenzuweisung ist das Tripel (Benutzer,
  Rolle, Organisation), mit Kennzeichen für „Standard“ und „Administrator dieser Organisation“.
- **Aktive Organisation.** Bei der Anmeldung wählt der Benutzer eine seiner Organisationen. Sie wird zusammen mit der
  aktiven Rolle als Claim im Authentifizierungs-Cookie gespeichert. Ein Wechsel prüft die Mitgliedschaft erneut, stellt
  dann das Cookie neu aus und leert die zwischengespeicherten Berechtigungen des Benutzers.
- **Expliziter Parameter.** Jede Stored Procedure, die Mandantendaten berührt, erhält die Organisations-ID als
  Parameter, entnommen aus dem Claim. Einen impliziten Kontext in der Datenbank gibt es nicht.
- **Zwei Wege, auf denen eine Zeile zu einer Organisation gehört:**
  - *Laufzeitdaten* tragen eine Organisationsspalte: Instanzen, Work Items, Formulardatensätze, Vertretungsregeln,
    Lane-Regeln, Verbindungszeichenfolgen, Kartenebenen und so weiter.
  - *Definitionen* (Prozesse, Berichte, Dashboards) werden gemeinsam genutzt und für eine Organisation über
    organisationsbezogene Berechtigungszeilen sichtbar (ADR-0005). Ein Prozess kann daher viele Organisationen bedienen.
- **Eine Zentralorganisation** übernimmt die plattformweite Administration. Funktionen für mehrere Organisationen
  werden automatisch aktiviert, sobald eine zweite Organisation angelegt wird; Installationen mit nur einer
  Organisation bekommen sie nie zu sehen.
- **Organisationsspezifische Anpassungen** sind bewusst begrenzt: Theme-CSS, externe Verbindungen,
  Benachrichtigungsgruppen und mobile Apps im eigenen Branding.

## Konsequenzen

### Vorteile

- Eine einzige Installation bedient eine ganze Unternehmensgruppe, und Upgrades erfolgen nur einmal.
- Organisationsübergreifende Prozesse sind gewöhnliche Prozesse. Eine Lane-Regel kann auf eine Rolle in einer anderen
  Organisation verweisen.
- Personen mit mehreren Funktionen haben ein Konto und wechseln den Kontext mit einem Klick.
- Gemeinsame Definitionen ersparen es, einen Prozess zwanzigmal zu kopieren und anschließend zwanzig Kopien zu pflegen.

### Nachteile

- **Isolation ist eine Frage der Disziplin, keine Garantie.** Jede Abfrage muss nach Organisation filtern. Ein
  einziges vergessenes Prädikat bedeutet ein mandantenübergreifendes Datenleck, und das Code-Review ist die wichtigste
  Verteidigung.
- **Konventionen sind fehleranfällig.** Ein NULL, das „die Zentralorganisation“ bedeutet, ist in SQL bequem, aber
  leicht falsch zu lesen. Jeder Standardwert muss so gewählt werden, dass im Zweifel gesperrt wird („fail closed“).
- **Zwei Zugehörigkeitsmodelle** (Spalte gegenüber Berechtigungszeilen) führen dazu, dass die Frage „Welcher
  Organisation gehört das?“ je nach Tabelle zwei Antworten hat.
- **Störende Nachbarn („Noisy Neighbours“).** Ein aufwendiger Bericht einer Organisation kann alle anderen ausbremsen.
  In einer einzigen Datenbank gibt es keine Ressourcenlimits pro Mandant.

## Rückblickend

Die gemeinsame Datenbank und das Mitgliedschaftsmodell würde ich beibehalten. Beide passen zum Markt. Die Durchsetzung
würde ich von Konvention auf Mechanismus umstellen:

1. **Impliziter Mandantenkontext in der Datenbank.** `SESSION_CONTEXT` einmal pro Verbindung aus dem authentifizierten
   Claim setzen und mit Richtlinien der SQL-Server-**Row-Level Security** auf jeder mandantenbezogenen Tabelle
   durchsetzen. Der Anwendungsfilter wird zur ersten Verteidigungslinie, RLS zum Sicherheitsnetz.
2. **Im Zweifel sperren („fail closed“).** Ist keine Organisation gesetzt, nichts zurückgeben und unübersehbar
   protokollieren.
3. **Eine Organisationsspalte mit NOT NULL** in jeder mandantenbezogenen Tabelle, an führender Stelle in den Indizes.
   Keine Konvention „NULL bedeutet Zentralorganisation“.
4. **Mandantentests in der CI.** Zwei Organisationen mit Testdaten anlegen und jeden Listen-Endpunkt als Benutzer jeder
   der beiden aufrufen. Sicherstellen, dass keine Zeile der jeweils anderen erscheint. So fällt das vergessene Prädikat
   auf, bevor ein Prüfer es findet.
5. **Die Mandanten-ID in jeder Logzeile**, damit sich Vorfälle schnell eingrenzen lassen.

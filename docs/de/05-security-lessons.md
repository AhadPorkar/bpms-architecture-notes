# 5. Lehren aus einer nationalen Sicherheitsevaluierung

[Startseite](../../README.de.md) · [Überblick](01-overview.md) · [C4-Modell](02-c4-model.md) · [Prozess-Engine](03-process-engine.md) · [ADRs](adr/README.md) · [Lasttests](04-load-testing.md) · **Sicherheitslehren** · [Rückblick](06-retrospective.md) · [Glossar](glossary.md) · [English](../en/05-security-lessons.md)

GraphBPMS Version 2 hat die nationale Sicherheitsevaluierung für Softwareprodukte des Iran (AFTA), Stufe 1,
bestanden, durchgeführt von einem akkreditierten Prüflabor. Begleitend zu dieser Evaluierung führen wir bei jedem
Nightly Build eine statische Analyse mit SonarQube und vor jedem Go-live einen Scan mit OWASP ZAP durch. Jeder Kunde
erhält außerdem ein Dokument mit der Sicherheitsrichtlinie für seine eigene Installation.

Diese Seite fasst zusammen, was ich bei der Vorbereitung einer großen Low-Code-Plattform auf eine solche Prüfung
gelernt habe. Sie beschreibt Lehren und Standardvorgaben, nicht die Befunde einer bestimmten Bewertung und nicht den
Zustand einer bestimmten Installation.

## Lehren zum Vorgehen

### 1. Die Evaluierung zum Release-Gate machen, nicht zum Projekt

Ein Zertifikat gilt für eine Produktversion. Wenn Sicherheitsarbeit erst dann stattfindet, wenn die nächste
Evaluierung ansteht, wird jede Evaluierung zur Krise. Was funktioniert hat:

- statische Analyse im Nightly Build;
- ein dynamischer Scan (OWASP ZAP) vor jedem Go-live;
- „null kritische Schwachstellen pro Release“ als Qualitätsmetrik, neben Antwortzeit und Fehlerschlupf.

### 2. Dokumentation ist die halbe Evaluierung

Prüfende lesen Architektur-, Topologie-, Sicherheitsrichtlinien- und Testdokumente, bevor sie das System anfassen,
und sie fragen: „Zeigen Sie mir, wo das durchgesetzt wird.“ Diese Dokumente gemeinsam mit dem Code versionieren. Ein
einziger, unspektakulärer Request-Pfad (Controller, dann Service, dann Stored Procedure, siehe [ADR-0001](adr/0001-stored-procedures-as-the-data-access-contract.md))
macht die Antworten kurz und überzeugend.

### 3. Fehlerklassen beheben, nicht Einzelfälle

Wird ein ungeschützter Endpunkt oder ein per String-Verkettung gebildeter SQL-Bezeichner gefunden, gibt es meist
weitere. Für jeden Befund:

1. die gesamte Codebasis nach dem Muster durchsuchen;
2. alle Vorkommen beheben;
3. einen Test, eine Analyzer-Regel oder eine CI-Prüfung ergänzen, damit das Muster nicht zurückkehren kann.

Unser Refactoring der Freitextparameter vom Typ „where clause“ zu typisierten Parametern mit Spalten-Allowlists begann
als einzelner Befund und wurde zur Regel.

## Technische Lehren

### 4. Autorisierung muss auf Framework-Ebene nach dem Default-Deny-Prinzip arbeiten

Das wertvollste Muster in unserer Codebasis ist der *Access Manager* pro Controller: eine Zuordnung von Aktion zu
Regel, in der eine Aktion ohne Eintrag verweigert wird ([ADR-0005](adr/0005-rbac-down-to-record-level.md)). Die Lehre
daraus: Autorisierung so verankern, dass man sie nicht vergessen kann:

- einen globalen Autorisierungsfilter registrieren;
- anonymen Zugriff zu einer expliziten, überprüfbaren Ausnahme machen;
- aus dem Code ein Inventar aller Endpunkte mit ihrem Schutz generieren und es bei jedem Release per Diff vergleichen.

### 5. Das Objekt autorisieren, nicht nur die Aktion

„Darf dieser Benutzer Berichte bearbeiten?“ reicht nicht. „Darf dieser Benutzer *diesen* Bericht in *dieser*
Organisation bearbeiten?“ – das ist die eigentliche Frage. Jeder Endpunkt, der eine ID entgegennimmt, prüft den
Berechtigungseintrag auf Datensatzebene und den Mandanten. Und ein GET ändert niemals den Zustand: Der Anti-Forgery-Schutz überspringt GET-Requests in der Regel, daher ist ein
zustandsändernder GET eine offene Tür.

### 6. Kontext wie Mandant und Umgebung muss im Zweifel sperren („fail closed“)

Fehlt im Kontext die Organisation oder das Flag für die Testumgebung, lautet die sichere Antwort „nichts“, niemals ein
Standardwert. Von der Datenbank erzwungene Row-Level Security ist das Sicherheitsnetz für den Filter, den irgendwann
jemand vergessen wird ([ADR-0004](adr/0004-multi-organization-tenancy-in-one-database.md), [ADR-0011](adr/0011-test-sandbox-inside-the-production-engine.md)).

### 7. Injection: Werte sind Parameter, Bezeichner kommen aus Allowlists

- Werte sind immer Parameter, auch innerhalb von Stored Procedures, die dynamisches SQL erzeugen.
- Bezeichner (Sortierspalten, generierte Tabellennamen) werden gegen eine Allowlist geprüft und mit `QUOTENAME`
  maskiert.
- Parameter, die SQL-Fragmente transportieren („where clause“, „order by“), durch typisierte Parameter ersetzen.
- Das mit absichtlich bösartigen Eingaben in Integrationstests prüfen, nicht nur mit einem Scanner.

### 8. Low-Code-Funktionen sind Funktionen zur Codeausführung

Script Tasks, Formeln für berechnete Felder, benutzerdefinierte Seiten mit HTML und JavaScript sowie von Designern
geschriebenes SQL in Datenkonnektoren sind allesamt Wege, Code auf dem Server oder in den Browsern anderer Benutzer
auszuführen. Designer als privilegierte Benutzer mit eigenem Bedrohungsmodell behandeln:

- wer Skripte, Seiten und Konnektoren erstellen darf und wer sie prüft;
- Sandboxing: nach Möglichkeit außerhalb des Prozesses, mit Limits für Laufzeit, Speicher und Anweisungen und
  standardmäßig ohne Datei- oder Netzwerkzugriff;
- eine wirksame Content Security Policy für benutzerdefinierte Seiten;
- ein Audit-Trail für jede Änderung an ausführbaren Inhalten.

### 9. Ausgehende Konnektoren brauchen SSRF-Schutz

Ein Konnektor, der „jede URL, die der Designer eintippt“ aufruft, ist ein Werkzeug für Server-Side Request Forgery.

- Zielhosts per Allowlist freigeben, standardmäßig verweigern.
- Loopback-, Link-Local- und Metadaten-Adressen blockieren.
- Die endgültige URL nach dem Ersetzen der Platzhalter und nach Redirects validieren.
- Verborgene Parameterquellen (Benutzer-ID, Organisation, API-Schlüssel; siehe
  [ADR-0008](adr/0008-providers-as-the-single-integration-abstraction.md)) dem Zugriff des Aufrufers entziehen.

### 10. Header und Transport an einer Stelle

Das sind die am leichtesten vermeidbaren Befunde, und Prüfende kontrollieren jeden einzelnen davon:

- TLS 1.2 oder neuer am Proxy;
- HSTS;
- eine echte Content Security Policy;
- `frame-ancestors`;
- `X-Content-Type-Options`;
- `Referrer-Policy`;
- CORS als Allowlist, niemals als Wildcard;
- keine Versionsbanner.

Diese Header an **einer** Stelle definieren, entweder im Reverse Proxy oder in einer Middleware, nicht teils in der
Konfiguration und teils im Code. Anschließend eine automatisierte Prüfung ergänzen, die die Response-Header einer
ausgerollten Installation ausliest.

### 11. Hygiene bei der Authentifizierung

- **Jeden** Authentifizierungsendpunkt mit Rate Limiting versehen, einschließlich der Token-Endpunkte für mobile Apps
  und des Passwort-Resets, nicht nur das Web-Anmeldeformular.
- Kontosperren mit Zeitfenster und Back-off umsetzen und die Sperre auswerten, *bevor* eine Session ausgestellt wird.
- Multi-Faktor-Authentifizierung anbieten.
- Passwörter mit aktuellen Parametern hashen (PBKDF2-HMAC-SHA256 mit der Iterationszahl, die OWASP heute empfiehlt,
  oder Argon2id) und bei der Anmeldung neu hashen, wenn sich die Parameter ändern.
- Sessions bei einer Passwortänderung widerrufen (Security Stamp) und Tokens kurzlebig halten. Den Mandanten im Token
  mitführen.

### 12. Kryptografie: die unspektakulären, authentifizierten Standardverfahren verwenden

- Keine Schlüssel im Quellcode oder in Klartext-Konfiguration. Schlüssel pro Installation bei der Einrichtung erzeugen.
- Ein zufälliger IV pro Nachricht.
- Authentifizierte Verschlüsselung (AES-GCM oder Encrypt-then-MAC) für alles, was den Server verlässt, etwa
  Exportpakete und Tokens.
- Opake Zufallskennungen oder signierte Tokens in URLs.
- Ein einziger Krypto-Helper, einmal geprüft, überall verwendet.

### 13. Ein vertrauenswürdiger Weg, die IP-Adresse des Clients zu ermitteln

Rate Limiting, IP-Sperren, Audit-Logs und IP-Beschränkungen pro Formular müssen alle denselben Resolver verwenden.
Dieser Resolver vertraut Forwarding-Headern nur von bekannten Proxys, wertet die Weiterleitungskette von rechts aus und
speichert Adressen in einer IPv6-fähigen Spalte.

### 14. Uploads: Allowlists und Inhaltsprüfungen

Dateiendungen per Allowlist zulassen, Magic Bytes prüfen, die Größe je Anwendungsfall begrenzen, außerhalb des
Web-Roots speichern, mit `Content-Disposition: attachment` ausliefern und dort scannen, wo der Kunde einen Scanner hat.

### 15. Fehler verraten dem Benutzer nichts und dem Log alles

Benutzer sehen eine allgemeine Meldung mit einer Korrelations-ID und dem passenden HTTP-Statuscode. Die Details landen
im Log. In Release-Builds muss die Debug-Ausgabe abgeschaltet sein, und die CI sollte die Konfigurationstransformation
prüfen, statt ihr zu vertrauen.

### 16. Audit-Logs müssen vertrauenswürdig sein

- Nur anfügend (append-only), idealerweise mit einer Hash-Kette, damit Manipulationen erkennbar sind.
- Aufbewahrung per Richtlinie geregelt, nicht über den Löschknopf eines Administrators.
- Geheimnisse und personenbezogene Daten in protokollierten Parametern maskiert.
- Ein Volumenbudget, weil „jede Abfrage loggen“ die Schreibzugriffe auf die Datenbank unter Last verdoppelt ([Lasttests](04-load-testing.md)).

### 17. Administrationswerkzeuge sind die Kronjuwelen

Diagnoseseiten, Export- und Importmodule, Job-Konsolen und Lizenzwerkzeuge sind die mächtigsten Endpunkte in jeder
Plattform. Sie brauchen die stärkste Authentifizierung, Netzwerkbeschränkungen (nur über VPN
oder Jump Server) und einen eigenen Audit-Trail.

### 18. Nirgends Standard-Zugangsdaten

Technische Konten, Datenbank-Logins und Zugangsdaten für die Kommunikation zwischen Diensten werden bei der
Installation mit eindeutigen Geheimnissen angelegt. Ein Standardwert,
den „jeder nach der Installation ändert“, ist früher oder später ein Standardwert, den jemand nicht geändert hat.

## Checkliste vor dem Go-live

- [ ] Statische Analyse ohne kritische und hohe Befunde
- [ ] OWASP-ZAP-Scan der ausgerollten Installation, Befunde bewertet
- [ ] Endpunktinventar per Diff mit dem letzten Release verglichen; jeder neue Endpunkt hat eine Zugriffsregel
- [ ] Tests zur Mandantenisolation bestanden (zwei Organisationen, jeder Listen-Endpunkt)
- [ ] Sicherheits-Header auf der ausgerollten Installation verifiziert, CORS-Allowlist gesetzt
- [ ] TLS-Konfiguration am Proxy geprüft; HTTP leitet auf HTTPS um
- [ ] Alle Standard- und technischen Zugangsdaten für diese Installation eindeutig
- [ ] Host-Allowlist für Konnektoren und Denylist für SQL-Objekte konfiguriert
- [ ] Script Tasks: aktivierte Sprachen und Limits überprüft
- [ ] Admin-Werkzeuge nur aus dem Administrationsnetz erreichbar
- [ ] Debug deaktiviert, benutzerdefinierte Fehlerseiten aktiv, Versionsbanner entfernt
- [ ] Backups verschlüsselt, Wiederherstellung getestet
- [ ] Aufbewahrung und Maskierung der Audit-Logs konfiguriert
- [ ] Incident-Ansprechpersonen und Schweregrad-Matrix mit dem Kunden abgestimmt

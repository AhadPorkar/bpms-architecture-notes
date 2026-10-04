# 2. C4-Modell

[Startseite](../../README.de.md) · [Überblick](01-overview.md) · **C4-Modell** · [Prozess-Engine](03-process-engine.md) · [ADRs](adr/README.md) · [Lasttests](04-load-testing.md) · [Sicherheitslehren](05-security-lessons.md) · [Rückblick](06-retrospective.md) · [Glossar](glossary.md) · [English](../en/02-c4-model.md)

Die Diagramme folgen dem [C4-Modell](https://c4model.com): Systemkontext, Container, Komponenten, dazu eine
Verteilungssicht (Deployment) und eine dynamische Sicht. Sie sind in Mermaid gezeichnet, damit GitHub sie direkt im
Text darstellt. Dasselbe Modell wird als Code in
[`diagrams/structurizr/workspace.dsl`](../../diagrams/structurizr/workspace.dsl) gepflegt – für alle, die Structurizr
bevorzugen.

Farblegende: Dunkelblau = Person, Blau = das System oder seine Container, Hellblau = Komponenten, Grau = extern.

## Ebene 1: Systemkontext

```mermaid
flowchart TB
    employee["<b>Mitarbeitende / Führungskräfte</b><br/>[Person]<br/>Bearbeiten den Posteingang, genehmigen,<br/>lesen Dashboards"]
    designer["<b>Prozessdesigner</b><br/>[Person]<br/>Modellieren Prozesse, Formulare,<br/>Regeln, Berichte, Konnektoren"]
    admin["<b>Administratoren</b><br/>[Person]<br/>Organisationen, Benutzer,<br/>Rollen, Berechtigungen"]
    field["<b>Außendienstmitarbeitende</b><br/>[Person]<br/>Erfassen Daten offline"]
    citizen["<b>Externe Benutzer</b><br/>[Person]<br/>Füllen öffentliche Formulare aus"]

    bpms["<b>GraphBPMS</b><br/>[Softwaresystem]<br/>Low-Code-BPM-Plattform: BPMN-/DMN-Engine,<br/>Formulare, Berichte, Dashboards, Mobil, GIS"]

    idp["<b>Identity Provider</b><br/>[Externes System]<br/>OpenID Connect SSO,<br/>LDAP / Active Directory"]
    ent["<b>Unternehmenssysteme</b><br/>[Externes System]<br/>Datenbanken und REST-/SOAP-Dienste,<br/>oft hinter dem ESB des Kunden"]
    msg["<b>Messaging</b><br/>[Externes System]<br/>SMTP, SMS-Gateway,<br/>Browser-Push-Dienste"]
    gis["<b>Kartendienste</b><br/>[Externes System]<br/>WMS, Kacheln, ArcGIS REST"]

    employee -- "Nutzen<br/>[HTTPS]" --> bpms
    designer -- "Modellieren in<br/>[HTTPS]" --> bpms
    admin -- "Administrieren<br/>[HTTPS]" --> bpms
    field -- "Synchronisieren Außendienstdaten<br/>[HTTPS, Offline-first]" --> bpms
    citizen -- "Reichen Formulare ein<br/>[HTTPS, anonym]" --> bpms

    bpms -- "Authentifiziert Benutzer<br/>[OIDC, LDAP]" --> idp
    bpms -- "Liest und schreibt Daten,<br/>ruft Dienste auf<br/>[SQL, REST, SOAP]" --> ent
    ent -- "Starten Prozesse,<br/>senden Nachrichten<br/>[REST/JSON]" --> bpms
    bpms -- "Sendet Benachrichtigungen<br/>[SMTP, HTTPS]" --> msg
    bpms -- "Lädt Kartenebenen<br/>[HTTPS]" --> gis

    classDef person fill:#08427b,stroke:#073b6f,color:#ffffff
    classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class employee,designer,admin,field,citizen person
    class bpms system
    class idp,ent,msg,gis external
```

**Lesehilfe.** Die Plattform ist die Drehscheibe zwischen Menschen und den bestehenden Systemen des Kunden. Sie ruft
diese Systeme auf und wird von ihnen aufgerufen. Die zweite Richtung ist wichtig: Andere Systeme starten Prozesse und
senden Nachrichten an wartende Instanzen, sodass die Engine auch als Integrationsendpunkt dient.

## Ebene 2: Container

```mermaid
flowchart TB
    users["<b>Benutzer</b><br/>[Person]<br/>Mitarbeitende, Prozessdesigner,<br/>Administratoren"]
    field["<b>Außendienstmitarbeitende</b><br/>[Person]"]
    citizen["<b>Externe Benutzer</b><br/>[Person]"]

    subgraph boundary ["GraphBPMS [Softwaresystem]"]
        direction TB
        ui["<b>Weboberfläche</b><br/>[Container: Razor, jQuery, Knockout]<br/>Posteingang, Designer, Dashboards,<br/>öffentliches Portal; RTL, Jalali"]
        mobile["<b>Mobile App und PWA</b><br/>[Container: Android, IndexedDB]<br/>Offline-Formulare und Außendienstaufgaben,<br/>gebrandete App, auf dem Server gebaut"]
        app["<b>Webanwendung</b><br/>[Container: ASP.NET MVC 5, .NET 4.8, IIS]<br/>Prozess-Engine, Formular- und Berichtslaufzeit,<br/>Autorisierung, API, Scheduler, SSE"]
        db[("<b>Datenbank</b><br/>[Container: SQL Server]<br/>Kernschema, generierte Formulartabellen,<br/>Scheduler-Tabellen, Audit und Logs")]
        files[("<b>Dateiablage</b><br/>[Container: Dateifreigabe, FTP oder S3-kompatibel]<br/>Anhänge, Archiv, Vorschaubilder")]
    end

    idp["<b>Identity Provider</b><br/>[Externes System]"]
    ent["<b>Unternehmenssysteme</b><br/>[Externes System]"]
    msg["<b>Messaging- und Push-Dienste</b><br/>[Externes System]"]
    gis["<b>Kartendienste</b><br/>[Externes System]"]

    users -- "Nutzen<br/>[HTTPS]" --> ui
    citizen -- "Nutzen öffentliche Formulare<br/>[HTTPS]" --> ui
    field -- "Nutzen" --> mobile
    ui -- "Ruft auf<br/>[HTTPS, JSON, SSE]" --> app
    mobile -- "Synchronisiert<br/>[HTTPS, JWT]" --> app
    app -- "Ruft Stored Procedures auf<br/>[TDS, verschlüsselt]" --> db
    app -- "Liest und schreibt Dateien<br/>[SMB, FTP oder S3]" --> files
    app -- "Authentifiziert<br/>[OIDC, LDAP]" --> idp
    app -- "Provider, Service Tasks<br/>[SQL, REST, SOAP]" --> ent
    ent -- "Prozess-API<br/>[REST/JSON]" --> app
    app -- "E-Mail, SMS, Web Push<br/>[SMTP, HTTPS]" --> msg
    ui -- "Kartenkacheln und -ebenen<br/>[HTTPS]" --> gis

    classDef person fill:#08427b,stroke:#073b6f,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class users,field,citizen person
    class ui,mobile,app,db,files container
    class idp,ent,msg,gis external
    style boundary fill:none,stroke:#1168bd,stroke-dasharray:5 5
```

**Lesehilfe.** Die Plattform ist bewusst ein modularer Monolith. Alles mit Geschäftslogik liegt in einer einzigen
auslieferbaren Webanwendung, und die Datenbank ist der Integrationspunkt zwischen ihren Modulen. Für
On-Premises-Kunden, deren IT eine einzige IIS-Site und einen SQL Server betreibt, war das die richtige Entscheidung, und
es beschränkt Upgrades auf ein einziges Paket. Der Preis: Die Webanwendung beherbergt auch Dinge, die normalerweise
eigene Prozesse wären, etwa den Scheduler und langlebige SSE-Verbindungen. Siehe [den Rückblick](06-retrospective.md).

## Ebene 3: Komponenten der Webanwendung

```mermaid
flowchart TB
    client["<b>Weboberfläche, mobile App, externe Systeme</b>"]

    subgraph app ["Webanwendung [Container]"]
        direction TB
        pipeline["<b>Request-Pipeline</b><br/>[Komponente: OWIN, MVC-Filter]<br/>Cookie- und JWT-Authentifizierung, Anti-Forgery,<br/>Rate Limiting, Bereinigung von Eingaben"]
        controllers["<b>Controller</b><br/>[Komponente: etwa 80 MVC-Controller]<br/>UI-Endpunkte, Prozess-API, Service-Bus-Endpunkte,<br/>öffentliche Formulare, mobile Synchronisation, SSE"]
        authz["<b>Autorisierung</b><br/>[Komponente]<br/>Berechtigungsprüfungen vom Modul<br/>bis zum Datensatz, pro Benutzer gecacht"]
        engine["<b>Prozess-Engine</b><br/>[Komponente]<br/>BPMN-Interpreter, Lanes, Timer,<br/>Nachrichten, Signale, Sandbox"]
        forms["<b>Formularlaufzeit</b><br/>[Komponente]<br/>Formulardefinitionen, generierte Tabellen,<br/>Feldregeln, Signatur von Datensätzen"]
        reports["<b>Berichte und Dashboards</b><br/>[Komponente]<br/>Berichtsdesigner, BI-Widgets,<br/>datengesteuerte Alerts, BAM"]
        providers["<b>Provider-Laufzeit</b><br/>[Komponente]<br/>SQL-, REST- und SOAP-Konnektoren<br/>mit geschützten Parametern"]
        identity["<b>Identität und Organisationen</b><br/>[Komponente]<br/>Benutzer, Rollen, Organigramm,<br/>aktive Organisation"]
        notify["<b>Benachrichtigungs-Dispatcher</b><br/>[Komponente]<br/>In-App, SSE, Web Push,<br/>E-Mail, SMS"]
        scheduler["<b>Scheduler</b><br/>[Komponente: Quartz.NET, clusterfähig]<br/>Prozess-Timer, Berichts-Alerts,<br/>Housekeeping"]
        dataaccess["<b>Datenzugriff</b><br/>[Komponente: schlanker Dapper-Wrapper]<br/>Aufrufe von Stored Procedures,<br/>Logging von Abfragen und Laufzeiten"]
    end

    db[("<b>Datenbank</b><br/>[SQL Server]")]
    ext["<b>Unternehmenssysteme</b><br/>[Extern]"]

    client --> pipeline --> controllers
    controllers --> authz
    controllers --> engine
    controllers --> forms
    controllers --> reports
    controllers --> identity
    engine --> forms
    engine --> providers
    engine --> notify
    reports --> providers
    forms --> providers
    scheduler -- "Löst Timer über<br/>die Prozess-API aus" --> controllers
    providers --> ext
    authz --> dataaccess
    engine --> dataaccess
    forms --> dataaccess
    reports --> dataaccess
    identity --> dataaccess
    dataaccess -- "Stored Procedures" --> db
    scheduler -- "Job-Store" --> db

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class pipeline,controllers,authz,engine,forms,reports,providers,identity,notify,scheduler,dataaccess component
    class client,db,ext external
    style app fill:none,stroke:#438dd5,stroke-dasharray:5 5
```

Requests folgen demselben Weg: Controller, dann ein Anwendungsservice, dann der Datenzugriffs-Wrapper, dann eine
Stored Procedure pro Operation ([ADR-0001](adr/0001-stored-procedures-as-the-data-access-contract.md)). Die wenigen
Codestellen, die SQL generieren müssen (Formulartabellen, generische Filter, Konfigurationsabgleich und Diagnose), tun
dies in dafür vorgesehenen Komponenten.

## Ebene 3: Komponenten der Prozess-Engine

```mermaid
flowchart TB
    api["<b>Prozessbefehle</b><br/>Starten, Work Item abschließen,<br/>Nachricht, Signal, Timer"]

    subgraph engine ["Prozess-Engine [Komponentengruppe]"]
        direction TB
        defs["<b>Definitionsverwaltung</b><br/>Parst BPMN-XML, validiert,<br/>speichert unveränderliche Versionen"]
        walker["<b>Flow-Walker</b><br/>Treibt eine Instanz voran, bis jeder<br/>Pfad einen Wartezustand erreicht"]
        handlers["<b>Element-Handler</b><br/>Tasks, Gateways, Ereignisse,<br/>Sequenzflüsse"]
        lanes["<b>Lane-Auflösung</b><br/>Wer das Work Item erhält:<br/>Rolle, Benutzer, Organigramm, Variable"]
        cond["<b>Bedingungsauswertung</b><br/>Gateway- und Flussbedingungen"]
        scripts["<b>Skript-Runner</b><br/>JavaScript und C#,<br/>mit Zeit- und Anweisungslimits"]
        dmn["<b>Entscheidungsaufruf</b><br/>DMN-Tabellen für<br/>Business Rule Tasks"]
        timers["<b>Timer-Dienst</b><br/>Plant Timer-Jobs ein<br/>und bricht sie ab"]
        corr["<b>Nachrichten- und Signal-Dispatcher</b><br/>Setzt wartende Instanzen fort,<br/>startet Prozesse per Signal"]
        sandbox["<b>Testumgebung</b><br/>Führt Entwürfe isoliert<br/>innerhalb der Produktion aus"]
        projections["<b>Posteingangsprojektion und Audit</b><br/>Work Items, Variablenhistorie,<br/>Gateway-Log, Fehlerlog"]
    end

    api --> walker
    defs --> walker
    walker --> handlers
    handlers --> lanes
    handlers --> cond
    handlers --> scripts
    handlers --> dmn
    handlers --> timers
    handlers --> corr
    walker --> projections
    sandbox --> walker

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class api external
    class defs,walker,handlers,lanes,cond,scripts,dmn,timers,corr,sandbox,projections component
    style engine fill:none,stroke:#438dd5,stroke-dasharray:5 5
```

Die Engine ist ausführlich in [Prozess-Engine](03-process-engine.md) beschrieben.

## Verteilung (Deployment)

```mermaid
flowchart TB
    subgraph z1 ["Zone 1: Benutzer und externe Systeme"]
        browser["Browser"]
        phone["Android-App / PWA"]
        esb["ESB / API-Gateway des Kunden"]
    end
    subgraph z2 ["Zone 2: DMZ"]
        rp["<b>Reverse Proxy und Load Balancer</b><br/>WAF, TLS-Terminierung,<br/>Sticky Sessions, WebSocket-/SSE-fähig"]
    end
    subgraph z3 ["Zone 3: Vertrauenswürdige Zone, Anwendungsschicht"]
        web1["<b>App-Knoten 1</b><br/>IIS + Webanwendung<br/>+ Scheduler (clusterfähig)"]
        web2["<b>App-Knoten n</b><br/>IIS + Webanwendung<br/>+ Scheduler (clusterfähig)"]
    end
    subgraph z4 ["Zone 4: Vertrauenswürdige Zone, Datenschicht"]
        sql[("<b>SQL Server (primär)</b>")]
        sql2[("<b>SQL Server (sekundär)</b><br/>AlwaysOn, optional;<br/>Reporting nur lesend")]
        fs[("<b>Dateiserver</b><br/>RAID 10")]
    end
    ops["Administratoren<br/>über VPN und Jump-Server"]

    browser -- "HTTPS 443, TLS 1.2+" --> rp
    phone -- "HTTPS 443" --> rp
    esb -- "HTTPS 443" --> rp
    rp -- "HTTPS, Quelle per Allowlist freigegeben" --> web1
    rp -- "HTTPS, Quelle per Allowlist freigegeben" --> web2
    web1 -- "TDS 1433, verschlüsselt" --> sql
    web2 -- "TDS 1433, verschlüsselt" --> sql
    web1 -- "SMB 445" --> fs
    web2 -- "SMB 445" --> fs
    sql -. "synchrones Replikat" .-> sql2
    ops -. "RDP" .-> web1
    ops -. "RDP" .-> sql

    classDef node fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class rp,web1,web2,sql,sql2,fs node
    class browser,phone,esb,ops external
```

Jede Zone kommuniziert nur mit ihrer direkten Nachbarzone. Datenbank und Dateiserver sind für Benutzer und externe
Systeme nie erreichbar. Zwei Details prägen das Betriebshandbuch:

- **Sticky Sessions sind erforderlich**, weil der Sitzungszustand im Prozess gehalten wird. Der Scheduler dagegen kann
  gefahrlos auf jedem Knoten laufen: Der clusterfähige Job-Store garantiert, dass ein Timer auf genau einem Knoten
  auslöst.
- **Der Proxy muss langlebige Responses unterstützen** (SSE) und die Client-IP in einem Header weiterreichen, dem die
  Anwendung nur vertraut, wenn er von der Adresse des Proxys selbst kommt.

Mindestdimensionierung der Produktion für die Referenzinstallation: App-Knoten mit 4–8 Kernen und 8–16 GB RAM; die
Datenbank mit 8–16 Kernen, 32–64 GB RAM und NVMe-Speicher; der Dateiserver mit mindestens 2 TB. Die endgültige
Dimensionierung ergibt sich immer aus einem Lasttest mit den eigenen Daten des Kunden ([Lasttests](04-load-testing.md)).

## Dynamische Sicht: ein Work Item abschließen

Was geschieht, wenn Mitarbeitende im Posteingang bei einer Aufgabe auf „Genehmigen“ klicken.

```mermaid
sequenceDiagram
    autonumber
    actor U as Mitarbeitende
    participant UI as Weboberfläche
    participant P as Request-Pipeline
    participant E as Prozess-Engine
    participant F as Formularlaufzeit
    participant X as Provider-Laufzeit
    participant DB as Datenbank
    participant N as Benachrichtigungs-Dispatcher

    U->>UI: Genehmigen (Formulardaten, Kommentar)
    UI->>P: POST Work Item abschließen (Anti-Forgery-Header)
    P->>P: Authentifizieren, Berechtigung und Organisation prüfen
    P->>E: Complete(workItemId, action, data)
    E->>DB: Ist das Work Item noch offen?
    E->>F: Formulardaten validieren und speichern (versteckte und schreibgeschützte Felder werden ignoriert)
    F->>DB: Insert oder Update in der Tabelle des Formulars
    E->>DB: Aktion erfassen, gleichrangige Work Items schließen, Variablenhistorie schreiben
    loop Bis jeder aktive Pfad einen Wartezustand erreicht hat
        E->>E: Gateway-Bedingungen auswerten
        opt Service Task
            E->>X: Provider aufrufen
            X-->>E: Ausgabe auf Variablen abgebildet
        end
        E->>DB: Nächste Work Items anlegen und Posteingangsprojektion aktualisieren
    end
    E->>N: Neue Bearbeiter benachrichtigen
    N-->>U: SSE an offene Tabs, Web Push an alle übrigen
    E-->>UI: Ergebnis (nächster Schritt, neuer Titel)
```

Alles in der Schleife läuft innerhalb des HTTP-Requests der Person, die geklickt hat. Das ist der prägende
Zielkonflikt der Engine: einfach zu betreiben und zu debuggen, mit sofortigem Feedback – aber lange automatische Ketten
und langsame externe Dienste machen genau diesen Klick langsam. [ADR-0002](adr/0002-graph-walking-engine-inside-the-request.md)
erörtert das.

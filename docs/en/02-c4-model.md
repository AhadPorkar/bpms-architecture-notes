# 2. C4 model

[Home](../../README.md) · [Overview](01-overview.md) · **C4 model** · [Process engine](03-process-engine.md) · [ADRs](adr/README.md) · [Load testing](04-load-testing.md) · [Security lessons](05-security-lessons.md) · [Retrospective](06-retrospective.md) · [Glossary](glossary.md) · [Deutsch](../de/02-c4-model.md)

The diagrams follow the [C4 model](https://c4model.com): context, containers, components, plus a deployment view and one
dynamic view. They are drawn in Mermaid so that GitHub renders them inline. The same model is kept as code in
[`diagrams/structurizr/workspace.dsl`](../../diagrams/structurizr/workspace.dsl) for anyone who prefers Structurizr.

Colour key: dark blue = person, blue = the system or its containers, light blue = components, grey = external.

## Level 1: System context

```mermaid
flowchart TB
    employee["<b>Employee / Manager</b><br/>[Person]<br/>Works the inbox, approves,<br/>reads dashboards"]
    designer["<b>Process designer</b><br/>[Person]<br/>Models processes, forms,<br/>rules, reports, connectors"]
    admin["<b>Administrator</b><br/>[Person]<br/>Organizations, users,<br/>roles, permissions"]
    field["<b>Field worker</b><br/>[Person]<br/>Collects data offline"]
    citizen["<b>External user</b><br/>[Person]<br/>Fills in public forms"]

    bpms["<b>GraphBPMS</b><br/>[Software system]<br/>Low-code BPM platform: BPMN/DMN engine,<br/>forms, reports, dashboards, mobile, GIS"]

    idp["<b>Identity provider</b><br/>[External system]<br/>OpenID Connect SSO,<br/>LDAP / Active Directory"]
    ent["<b>Enterprise systems</b><br/>[External system]<br/>Databases and REST/SOAP services,<br/>often behind the customer's ESB"]
    msg["<b>Messaging</b><br/>[External system]<br/>SMTP, SMS gateway,<br/>browser push services"]
    gis["<b>Map services</b><br/>[External system]<br/>WMS, tiles, ArcGIS REST"]

    employee -- "Uses<br/>[HTTPS]" --> bpms
    designer -- "Designs in<br/>[HTTPS]" --> bpms
    admin -- "Administers<br/>[HTTPS]" --> bpms
    field -- "Syncs field data<br/>[HTTPS, offline-first]" --> bpms
    citizen -- "Submits forms<br/>[HTTPS, anonymous]" --> bpms

    bpms -- "Authenticates users<br/>[OIDC, LDAP]" --> idp
    bpms -- "Reads and writes data,<br/>calls services<br/>[SQL, REST, SOAP]" --> ent
    ent -- "Starts processes,<br/>sends messages<br/>[REST/JSON]" --> bpms
    bpms -- "Sends notifications<br/>[SMTP, HTTPS]" --> msg
    bpms -- "Loads map layers<br/>[HTTPS]" --> gis

    classDef person fill:#08427b,stroke:#073b6f,color:#ffffff
    classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class employee,designer,admin,field,citizen person
    class bpms system
    class idp,ent,msg,gis external
```

**Reading it.** The platform is the hub between people and the customer's existing systems. It calls those systems
and is called by them. The second direction matters: other systems start processes and send messages to waiting
instances, so the engine also acts as an integration endpoint.

## Level 2: Containers

```mermaid
flowchart TB
    users["<b>Users</b><br/>[Person]<br/>Employees, designers,<br/>administrators"]
    field["<b>Field worker</b><br/>[Person]"]
    citizen["<b>External user</b><br/>[Person]"]

    subgraph boundary ["GraphBPMS [Software system]"]
        direction TB
        ui["<b>Web UI</b><br/>[Container: Razor, jQuery, Knockout]<br/>Inbox, designers, dashboards,<br/>public portal; RTL, Jalali"]
        mobile["<b>Mobile app and PWA</b><br/>[Container: Android, IndexedDB]<br/>Offline forms and field tasks,<br/>branded app built on the server"]
        app["<b>Web application</b><br/>[Container: ASP.NET MVC 5, .NET 4.8, IIS]<br/>Process engine, form and report runtime,<br/>authorization, API, scheduler, SSE"]
        db[("<b>Database</b><br/>[Container: SQL Server]<br/>Core schema, generated form tables,<br/>scheduler tables, audit and logs")]
        files[("<b>File storage</b><br/>[Container: file share, FTP or S3-compatible]<br/>Attachments, archive, thumbnails")]
    end

    idp["<b>Identity provider</b><br/>[External system]"]
    ent["<b>Enterprise systems</b><br/>[External system]"]
    msg["<b>Messaging and push services</b><br/>[External system]"]
    gis["<b>Map services</b><br/>[External system]"]

    users -- "Uses<br/>[HTTPS]" --> ui
    citizen -- "Uses public forms<br/>[HTTPS]" --> ui
    field -- "Uses" --> mobile
    ui -- "Calls<br/>[HTTPS, JSON, SSE]" --> app
    mobile -- "Syncs<br/>[HTTPS, JWT]" --> app
    app -- "Calls stored procedures<br/>[TDS, encrypted]" --> db
    app -- "Reads and writes files<br/>[SMB, FTP or S3]" --> files
    app -- "Authenticates<br/>[OIDC, LDAP]" --> idp
    app -- "Providers, service tasks<br/>[SQL, REST, SOAP]" --> ent
    ent -- "Process API<br/>[REST/JSON]" --> app
    app -- "Email, SMS, Web Push<br/>[SMTP, HTTPS]" --> msg
    ui -- "Map tiles and layers<br/>[HTTPS]" --> gis

    classDef person fill:#08427b,stroke:#073b6f,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class users,field,citizen person
    class ui,mobile,app,db,files container
    class idp,ent,msg,gis external
    style boundary fill:none,stroke:#1168bd,stroke-dasharray:5 5
```

**Reading it.** The platform is deliberately a modular monolith. Everything with business logic lives in one
deployable web application, and the database is the integration point between its modules. That was the right
call for on-premises customers whose IT runs one IIS site and one SQL Server, and it keeps upgrades to a single
package. The price is that the web application also hosts things that would normally be separate processes, such as
the scheduler and long-lived SSE connections. See [the retrospective](06-retrospective.md).

## Level 3: Components of the web application

```mermaid
flowchart TB
    client["<b>Web UI, mobile app, external systems</b>"]

    subgraph app ["Web application [Container]"]
        direction TB
        pipeline["<b>Request pipeline</b><br/>[Component: OWIN, MVC filters]<br/>Cookie and JWT authentication, anti-forgery,<br/>rate limiting, input sanitizing"]
        controllers["<b>Controllers</b><br/>[Component: about 80 MVC controllers]<br/>UI endpoints, process API, service-bus endpoints,<br/>public forms, mobile sync, SSE"]
        authz["<b>Authorization</b><br/>[Component]<br/>Permission checks from module<br/>down to record, cached per user"]
        engine["<b>Process engine</b><br/>[Component]<br/>BPMN interpreter, lanes, timers,<br/>messages, signals, sandbox"]
        forms["<b>Form runtime</b><br/>[Component]<br/>Form definitions, generated tables,<br/>field rules, record signing"]
        reports["<b>Reports and dashboards</b><br/>[Component]<br/>Report designer, BI widgets,<br/>data-driven alerts, BAM"]
        providers["<b>Provider runtime</b><br/>[Component]<br/>SQL, REST and SOAP connectors<br/>with guarded parameters"]
        identity["<b>Identity and organizations</b><br/>[Component]<br/>Users, roles, org chart,<br/>active organization"]
        notify["<b>Notification dispatcher</b><br/>[Component]<br/>In-app, SSE, Web Push,<br/>email, SMS"]
        scheduler["<b>Scheduler</b><br/>[Component: Quartz.NET, clustered]<br/>Process timers, report<br/>alerts, housekeeping"]
        dataaccess["<b>Data access</b><br/>[Component: thin Dapper wrapper]<br/>Stored-procedure calls,<br/>query and duration logging"]
    end

    db[("<b>Database</b><br/>[SQL Server]")]
    ext["<b>Enterprise systems</b><br/>[External]"]

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
    scheduler -- "Fires timers via<br/>the process API" --> controllers
    providers --> ext
    authz --> dataaccess
    engine --> dataaccess
    forms --> dataaccess
    reports --> dataaccess
    identity --> dataaccess
    dataaccess -- "Stored procedures" --> db
    scheduler -- "Job store" --> db

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class pipeline,controllers,authz,engine,forms,reports,providers,identity,notify,scheduler,dataaccess component
    class client,db,ext external
    style app fill:none,stroke:#438dd5,stroke-dasharray:5 5
```

Requests follow the same path: controller, then an application service, then the data-access wrapper, then one
stored procedure per operation ([ADR-0001](adr/0001-stored-procedures-as-the-data-access-contract.md)). The few
places that must generate SQL (form tables, generic filters, configuration sync and diagnostics) do it in dedicated
components.

## Level 3: Components of the process engine

```mermaid
flowchart TB
    api["<b>Process commands</b><br/>Start, complete work item,<br/>message, signal, timer"]

    subgraph engine ["Process engine [Component group]"]
        direction TB
        defs["<b>Definition manager</b><br/>Parses BPMN XML, validates,<br/>stores immutable versions"]
        walker["<b>Flow walker</b><br/>Advances an instance until every<br/>path reaches a wait state"]
        handlers["<b>Element handlers</b><br/>Tasks, gateways, events,<br/>sequence flows"]
        lanes["<b>Lane resolver</b><br/>Who receives the work item:<br/>role, user, org chart, variable"]
        cond["<b>Condition evaluator</b><br/>Gateway and flow conditions"]
        scripts["<b>Script runners</b><br/>JavaScript and C#,<br/>with time and statement limits"]
        dmn["<b>Decision invoker</b><br/>DMN tables for<br/>business rule tasks"]
        timers["<b>Timer service</b><br/>Schedules and cancels<br/>timer jobs"]
        corr["<b>Message and signal dispatcher</b><br/>Resumes waiting instances,<br/>starts signal-started processes"]
        sandbox["<b>Test environment</b><br/>Runs drafts in isolation<br/>inside production"]
        projections["<b>Inbox projection and audit</b><br/>Work items, variable history,<br/>gateway log, error log"]
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

The engine is described in detail in [Process engine](03-process-engine.md).

## Deployment

```mermaid
flowchart TB
    subgraph z1 ["Zone 1: Users and external systems"]
        browser["Browser"]
        phone["Android app / PWA"]
        esb["Customer ESB / API gateway"]
    end
    subgraph z2 ["Zone 2: DMZ"]
        rp["<b>Reverse proxy and load balancer</b><br/>WAF, TLS termination,<br/>sticky sessions, WebSocket/SSE aware"]
    end
    subgraph z3 ["Zone 3: Trusted zone, application tier"]
        web1["<b>App node 1</b><br/>IIS + web application<br/>+ scheduler (clustered)"]
        web2["<b>App node n</b><br/>IIS + web application<br/>+ scheduler (clustered)"]
    end
    subgraph z4 ["Zone 4: Trusted zone, data tier"]
        sql[("<b>SQL Server primary</b>")]
        sql2[("<b>SQL Server secondary</b><br/>AlwaysOn, optional;<br/>read-only reporting")]
        fs[("<b>File server</b><br/>RAID 10")]
    end
    ops["Administrators<br/>via VPN and jump server"]

    browser -- "HTTPS 443, TLS 1.2+" --> rp
    phone -- "HTTPS 443" --> rp
    esb -- "HTTPS 443" --> rp
    rp -- "HTTPS, allow-listed source" --> web1
    rp -- "HTTPS, allow-listed source" --> web2
    web1 -- "TDS 1433, encrypted" --> sql
    web2 -- "TDS 1433, encrypted" --> sql
    web1 -- "SMB 445" --> fs
    web2 -- "SMB 445" --> fs
    sql -. "synchronous replica" .-> sql2
    ops -. "RDP" .-> web1
    ops -. "RDP" .-> sql

    classDef node fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
    class rp,web1,web2,sql,sql2,fs node
    class browser,phone,esb,ops external
```

Each zone talks only to its direct neighbour. The database and the file server are never reachable from users or
external systems. Two details shape the operations guide:

- **Sticky sessions are required** because session state is kept in process. The scheduler, on the other hand, is
  safe on every node: the clustered job store guarantees that a timer fires on exactly one node.
- **The proxy must support long-lived responses** (SSE) and must pass the client IP in a header that the application
  trusts only from the proxy's own address.

Minimum production sizing for the reference deployment: app nodes with 4–8 cores and 8–16 GB RAM; the database with
8–16 cores, 32–64 GB RAM and NVMe storage; the file server with at least 2 TB. Final sizing always comes out of a
load test on the customer's own data ([Load testing](04-load-testing.md)).

## Dynamic view: completing a work item

What happens when an employee presses "Approve" on a task in the inbox.

```mermaid
sequenceDiagram
    autonumber
    actor U as Employee
    participant UI as Web UI
    participant P as Request pipeline
    participant E as Process engine
    participant F as Form runtime
    participant X as Provider runtime
    participant DB as Database
    participant N as Notification dispatcher

    U->>UI: Approve (form data, comment)
    UI->>P: POST complete work item (anti-forgery header)
    P->>P: Authenticate, check permission and organization
    P->>E: Complete(workItemId, action, data)
    E->>DB: Is the work item still pending?
    E->>F: Validate and save form data (hidden and read-only fields ignored)
    F->>DB: Insert or update the form's table
    E->>DB: Record action, close sibling work items, write variable history
    loop Until every active path reaches a wait state
        E->>E: Evaluate gateway conditions
        opt Service task
            E->>X: Call provider
            X-->>E: Output mapped to variables
        end
        E->>DB: Create next work items and update the inbox projection
    end
    E->>N: Notify the new assignees
    N-->>U: SSE to open tabs, Web Push to the rest
    E-->>UI: Result (next step, new title)
```

Everything in the loop runs inside the HTTP request of the person who clicked. This is the defining trade-off of the
engine: simple to operate and to debug, with immediate feedback, but long automatic chains and slow external
services make that click slow. [ADR-0002](adr/0002-graph-walking-engine-inside-the-request.md) discusses it.

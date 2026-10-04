# 1. System overview

[Home](../../README.md) · **Overview** · [C4 model](02-c4-model.md) · [Process engine](03-process-engine.md) · [ADRs](adr/README.md) · [Load testing](04-load-testing.md) · [Security lessons](05-security-lessons.md) · [Retrospective](06-retrospective.md) · [Glossary](glossary.md) · [Deutsch](../de/01-overview.md)

## What the system is

GraphBPMS is an enterprise low-code platform for business process management. Organizations use it to model a
process in BPMN 2.0, attach forms to its steps, run it, and watch how it performs, without writing code. Around the
process engine sit about thirty functional modules: a form builder, a report designer, dashboards, a DMN decision
engine, data connectors, notifications, document storage, a public self-service portal, an offline mobile app and
GIS.

The typical customer is a large public-sector or infrastructure organization with several sub-organizations. It
runs the platform on its own servers and needs every screen in Persian, right-to-left, with the Persian (Jalali)
calendar.

I led the platform engineering team that builds the core: back end, front end, UX/UI, delivery and the
infrastructure the product runs on. The notes in this repository are my own description of the architecture and of
the reasoning behind it.

## Who uses it

| Actor | What they do |
| --- | --- |
| Employee | Starts requests, works through the inbox, approves or rejects, attaches documents. |
| Manager | Reads dashboards and process-monitoring (BAM) views, delegates work while absent. |
| Process designer | Models processes, forms, decision tables, reports and data connectors. Usually an analyst, not a developer. |
| Administrator | Manages organizations, users, roles, permissions and system settings. |
| Field worker | Collects data offline on an Android device, with GPS, photos and QR codes. |
| External user | Fills in public forms on the self-service portal without an account. |
| External system | Starts processes, sends messages to waiting instances and reads data through the API. |

## Quality goals

Ranked in the order we traded them off against each other.

| # | Quality goal | What it means in practice |
| --- | --- | --- |
| 1 | Security that survives an external evaluation | Each major version passes a national product security evaluation (AFTA, Level 1). Every go-live is preceded by an OWASP ZAP scan. Authorization is enforced on the server, never only in the UI. |
| 2 | Isolation between organizations | One installation hosts many organizations. A user sees only the data of the organization they are working in. |
| 3 | Changeable by non-developers | Analysts change processes, forms and rules without a release. Publishing a new process version never breaks running cases. |
| 4 | Predictable performance at peak | Acceptance targets: 95 % of requests under 2 s, at least 500 transactions per second, spike-tested up to 5,000 concurrent users. |
| 5 | Auditability | Every step of every case can be reconstructed: who did what, when, with which data and on which version of the process. |
| 6 | Operable on-premises | Customer IT installs, backs up and upgrades the platform without internet access and without our engineers on site. |

## Constraints

- **On-premises only.** The production environment lives in the customer's data center, behind their DMZ and
  reverse proxy. Our team has no standing access to production data.
- **Microsoft stack.** Windows Server, IIS and SQL Server are what customer IT departments license and know how to
  run. The application is ASP.NET MVC on .NET Framework 4.8.
- **Localization is not optional.** Jalali dates in every form, report, timer and cron expression; right-to-left
  layout; multilingual labels.
- **Security evaluation per version.** A certificate covers one product version, so security work is part of the
  release process, not a project.
- **Commercial components.** The report designer, rich grids and charts are licensed third-party components that
  run in process.
- **Offline field work.** Field workers often have no network, so the mobile app must work offline and sync later.

## Solution strategy

| Concern | Approach | Details |
| --- | --- | --- |
| Data access | Named, parameterized stored procedures for nearly every database operation, called through a thin Dapper wrapper. | [ADR-0001](adr/0001-stored-procedures-as-the-data-access-contract.md) |
| Process execution | An in-house BPMN interpreter that walks the graph inside the request until every path reaches a wait state. | [ADR-0002](adr/0002-graph-walking-engine-inside-the-request.md) |
| Process change | Immutable versions. Running instances stay on the version they started on. | [ADR-0003](adr/0003-pin-running-instances-to-their-version.md) |
| Tenancy | One shared database. The organization is a scope carried in the user's claims and passed to every query. | [ADR-0004](adr/0004-multi-organization-tenancy-in-one-database.md) |
| Authorization | Role-based access control from module down to single records, deny wins, enforced at four layers. | [ADR-0005](adr/0005-rbac-down-to-record-level.md) |
| Timers | Durable, clustered scheduler in the same database, with Jalali-aware schedules. | [ADR-0006](adr/0006-durable-clustered-timers.md) |
| Forms | Each form owns a real, typed table generated from its definition. | [ADR-0007](adr/0007-dynamic-forms-as-physical-tables.md) |
| Integration | One "provider" abstraction for SQL, REST and SOAP sources, reused by forms, processes and reports. | [ADR-0008](adr/0008-providers-as-the-single-integration-abstraction.md) |
| Real-time | Server-Sent Events first, Web Push as fallback. | [ADR-0009](adr/0009-server-sent-events-first-web-push-as-fallback.md) |
| Hot read path | A denormalized inbox table maintained by the engine. | [ADR-0010](adr/0010-denormalized-inbox-read-model.md) |
| Safe experimentation | A test sandbox inside the production engine. | [ADR-0011](adr/0011-test-sandbox-inside-the-production-engine.md) |

## The platform at a glance

| Measure | Value |
| --- | --- |
| Functional modules | 30 |
| Core database tables | 168 (46 of them for the process engine), plus one generated table per form |
| Foreign keys | 222 |
| Stored procedures | about 1,000 (about 400 for the process engine and inbox) |
| MVC controllers | about 80, with about 1,100 actions |
| Application code | about a quarter of a million lines of C# |
| Performance acceptance | p95 < 2 s, ≥ 500 TPS, < 1 % errors, spike test up to 5,000 concurrent users |

The figures come from the product's technical documentation. Performance figures are acceptance targets of a
reference deployment and depend on hardware and data volume.

## Module map

| Group | Modules |
| --- | --- |
| Business core | Process engine (BPMN 2.0), form builder, report designer, data-driven report alerts, dashboards, decision tables (DMN), field tasks |
| Data and integration | Data providers and connections, master data and lookups, documents and archive |
| Users and security | Users and organizations, access levels, authentication |
| Communication | Multichannel notifications, browser push |
| Field and location | Maps and geofences, mobile app versions and devices |
| Content | Public portal, intranet news, polls, questionnaires, tags |
| Configuration | Menus and modules, dynamic pages, theming, languages, system settings |
| Infrastructure | Scheduler and background jobs, logging and monitoring, licensing and database versioning |

## Technology stack

| Area | Technology |
| --- | --- |
| Server | ASP.NET MVC 5, C#, Razor, OWIN, .NET Framework 4.8 on IIS 10 (Windows Server 2019/2022) |
| Database | SQL Server 2019/2022, Dapper, about 20 table-valued types for bulk operations |
| Dependency injection | Autofac |
| Scheduling | Quartz.NET with a clustered SQL Server job store |
| Identity | Cookie authentication, OpenID Connect, LDAP / Active Directory, JWT for the mobile app |
| Process logic | In-house BPMN 2.0 engine, DMN decision engine, JavaScript script tasks (Jint) and C# script tasks (Roslyn) |
| Reporting and UI | Stimulsoft Reports, DevExpress, ActiveQueryBuilder, jQuery, Knockout, Bootstrap |
| Real-time | Server-Sent Events, Web Push (VAPID) |
| Maps | Leaflet, Esri Leaflet, WMS, ArcGIS REST |
| Mobile | Branded Android app built on the server, plus an offline PWA backed by IndexedDB |
| Quality | SonarQube, Selenium, JMeter, k6, OWASP ZAP |

## What these notes are not

They contain no source code, database schema, configuration or screenshots of the product, and no customer
names or customer data. Diagrams are simplified, and names of internal classes and procedures are replaced by
descriptive terms. Code in [`load-testing/`](../../load-testing/) was written from scratch for this repository and
runs against a mock API.

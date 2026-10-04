# ADR-0001: Stored procedures as the data-access contract

[ADR index](README.md) · [Deutsch](../../de/adr/0001-stored-procedures-as-the-data-access-contract.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | All modules; the web application and the database containers |
| Related | [ADR-0007](0007-dynamic-forms-as-physical-tables.md), [ADR-0010](0010-denormalized-inbox-read-model.md) |

## Context

The platform runs on SQL Server only, in customer data centers we cannot reach. Three groups of people work with the
same database:

- the platform team, which builds the product;
- deployment teams, which model processes for each customer and write T-SQL for customer-specific reports and
  connectors;
- customer DBAs, who back up, tune and audit the server.

The most important queries are set-based and complex: the inbox, process monitoring (BAM), permission resolution
and reporting. They join many tables and must be tuned on real data volumes. The security evaluation each version
goes through tests injection systematically, and evaluators ask how injection is prevented by construction.

## Decision drivers

- Injection must be impossible by construction, not by code review.
- Hot queries must be tunable by people who think in execution plans, sometimes on a customer's server and without
  a full release.
- Customer DBAs need a clear, reviewable interface between the application and their database.
- A small team must keep this up across about 30 modules.

## Considered options

1. A full ORM (Entity Framework 6) with LINQ-generated SQL.
2. A micro-ORM (Dapper) with parameterized SQL strings in the application code.
3. A micro-ORM calling **one named stored procedure per database operation**, with no SQL text in application code.
4. A mix: an ORM for simple CRUD and stored procedures for hot paths.

## Decision

Option 3. Database operations are named, parameterized stored procedures. The application reaches the database
through one thin wrapper around Dapper. The wrapper does four things: it maps the procedure name and parameters,
supports table-valued parameters and multiple result sets, logs the call with its duration, and does nothing else.

Rules that come with it:

- Controllers do not call the data layer directly, and application services do not build SQL strings.
- Generated SQL is confined to a few dedicated places: identifiers such as sort columns inside procedures, and the
  components that build form tables (ADR-0007), generic filters and configuration sync. Values are parameters.
- Bulk operations use table-valued parameters (about 20 user-defined table types) rather than long lists of
  parameters or comma-separated strings.
- Validation and event recording live in the application. Triggers are limited to a handful that maintain
  modification timestamps, and there are no CHECK constraints. Referential integrity is enforced with foreign keys
  (222 of them).
- Database changes ship as idempotent scripts (`CREATE OR ALTER`, guarded `ALTER TABLE`). A version table records
  every upgrade and an explicit "update approved" flag.
- Most procedures are deployed obfuscated on customer servers to protect intellectual property. We never counted
  this as a security control.

## Consequences

### Positive

- Injection surface is small and easy to audit. Evaluators can be shown the single path from controller to database.
- Hot paths get tuned where the knowledge is. We could fix a slow inbox query on a customer's server the same day,
  and ship the same fix in the next release.
- The database permission model can be narrow: the application account needs to execute procedures and very little
  else (except for form-table DDL, see ADR-0007).
- Deployment teams reuse the same procedures in reports and connectors, so there is one vocabulary.

### Negative

- About 1,000 procedures must be versioned, reviewed, deployed and kept in step with the application. Version skew
  between the code and a customer's database is a real failure mode, so release tooling checks the database version
  against the application version.
- Business rules drift into T-SQL. Some logic exists both in C# and in SQL, and only integration tests catch
  differences.
- Rules erode without tooling. Over the years, exceptions to "no SQL outside procedures" and "values are parameters"
  creep in, and only automated checks (analyzers, grep rules in CI) find them reliably.
- Unit testing is harder. Most procedures are covered by end-to-end tests, not by fast tests.
- Strong lock-in to SQL Server. Other databases (Oracle, PostgreSQL, MySQL) are supported only as *external* data
  sources.
- Logging every call in the wrapper doubles the number of writes under load unless it is tuned. Audit logging needs
  its own budget.
- Obfuscated procedures make diffing and debugging on customer sites slower.

## In hindsight

I would keep stored procedures for the set-based, performance-critical paths: inbox, permission resolution,
monitoring and reporting. For straightforward CRUD I would use parameterized SQL next to the code that uses it,
through Dapper or EF Core, so that a feature and its data access live in one pull request.

I would also put the whole database under source control as the source of truth, with a migration tool (DbUp or
Flyway) applied by CI to a real SQL Server in a container. Procedures with logic would get tSQLt tests. And I would
drop obfuscation: it costs time and protects little.

# ADR-0008: Providers as the single integration abstraction

[ADR index](README.md) · [Deutsch](../../de/adr/0008-providers-as-the-single-integration-abstraction.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | Forms, process engine, reports, notifications, public API |
| Related | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0007](0007-dynamic-forms-as-physical-tables.md) |

## Context

Low-code users constantly need data from somewhere else:

- a dropdown filled from the HR database;
- a field auto-filled from a registry web service;
- a service task that writes to the finance system;
- a report built on the archive system's data.

Customers run SQL Server, Oracle, PostgreSQL and MySQL, plus REST and SOAP services, usually behind an enterprise
service bus. The people who wire these up are analysts, not developers. Credentials and internal endpoints must
never be visible to the people who only *use* a connector.

## Decision drivers

- Define a connection once and reuse it in forms, processes, reports and alerts.
- No code per integration.
- Secrets hidden from designers and end users.
- One place to apply security controls and logging.

## Considered options

1. Integration code per customer, written by developers.
2. Separate connector concepts per module (form lookups, process service calls, report data sources).
3. **One abstraction, the provider**, consumed by every module.

## Decision

Option 3. A **provider** is a named, parameterized data source with a declared output schema.

- **Types:** SQL query, stored procedure or function (on SQL Server, Oracle, PostgreSQL or MySQL); REST; SOAP/WSDL;
  and system entities exposed by the platform itself.
- **Connections** (database connection strings, service endpoints with proxy and credentials) are defined
  separately from providers, scoped to an organization and never shown to the people who use a provider.
- **Five sources for a parameter value:**

  | Source | Value comes from | Visible to the consumer |
  | --- | --- | --- |
  | Normal | The caller, with an optional default | Yes |
  | Constant | The provider definition | No |
  | Systemic | The runtime: current user, role, organization | No |
  | System setting | A key in the platform's settings | No |
  | Application config | A key in the application configuration | No |

  Only "normal" parameters are visible to the form designer or the API caller. A form therefore can never pass
  someone else's user id, and a designer never sees an API key.
- **REST specifics:** JSON, XML, file or text responses; a root path to the fields inside nested responses; XML
  normalized to JSON; paging; a test console with sample values.
- **Guards:** SQL written by designers is parsed and checked against a configurable deny-list of database objects.
  Outbound calls can be limited to an allow-list of hosts. Every execution can be logged with its parameters.
- **Consumers:** form fields and buttons, form data sources, process service, send and receive tasks, message
  events, report data sources, custom inboxes, notification procedures, report alerts, and the HTTP "service bus"
  endpoints that expose a provider or a process to other systems.

## Consequences

### Positive

- One connector serves every module. Fixing a connection fixes it everywhere.
- Integration work moved from developers to analysts, which is the point of a low-code platform.
- Hidden parameter sources solved a whole class of "trust the client" bugs by design.
- Security reviews have one place to look.

### Negative

- **Synchronous by nature.** Providers are called inside the user's request, with no retry, back-off or circuit
  breaker. A slow external system becomes a slow form.
- **Designers write SQL against production systems.** The parser guard helps, but this needs governance: who may
  create providers, against which connections, reviewed by whom.
- **Runtime-generated SOAP clients** are expensive to build and must be cached.

## In hindsight

The abstraction is the best thing in the platform, and I would build it again. Around it I would add:

1. **Resilience policies per connection:** timeout, retry with jitter, circuit breaker, bulkhead.
2. **Asynchronous use from processes** through an outbox, so that a service task does not hold a user's request
   (ADR-0002).
3. **Secrets in a vault** (or at least DPAPI- or certificate-protected configuration), referenced by name.
4. **OpenAPI and WSDL import** that generates the output schema and a typed test form automatically.
5. **Per-connection rate limits and metrics**, so that one noisy report cannot exhaust a partner's API.

# ADR-0011: A test sandbox inside the production engine

[ADR index](README.md) · [Deutsch](../../de/adr/0011-test-sandbox-inside-the-production-engine.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | Process designer, process engine, inbox, monitoring |
| Related | [ADR-0003](0003-pin-running-instances-to-their-version.md), [ADR-0004](0004-multi-organization-tenancy-in-one-database.md) |

## Context

Designers need to run a process before publishing it: click through the steps, check routing and conditions, call
the real connectors. Many on-premises customers have no staging environment with production-like configuration. When
one exists, it is out of date and its connectors point nowhere.

Designers therefore wanted to test **in production**, with production users, roles, organization charts and data
sources, without real users seeing anything.

## Decision drivers

- Realistic tests: the same org chart, roles and connectors as the real run.
- Zero visibility for real users: nothing in their inboxes, no notifications, nothing in monitoring.
- Debugging aids: step through, skip steps, inspect variables.
- No second installation to maintain.

## Considered options

1. Require a separate staging installation.
2. A simulation mode that does not persist anything.
3. **A tagged sandbox inside the production engine.**

## Decision

Option 3.

- Each diagram under test gets a **test-environment id** derived from its content. The diagram is stored as a
  version tagged with that id, separate from the active version.
- **Every runtime row produced in the sandbox carries the tag:** instances, work items, elements and variable history.
  Child processes started by call activities are tagged too.
- **The queries behind what real users see exclude tagged rows:** inboxes, process lists and monitoring.
- In test mode, notifications are suppressed and lane checks are relaxed, so that one designer can act for every
  lane. Breakpoints, "continue" and "skip step" are available.

## Consequences

### Positive

- Designers test against reality without a second installation, and analysts find routing mistakes before users do.
- Debugging features live in the same engine as production, so the test tells the truth about production behaviour.

### Negative

- **The same weakness as tenancy (ADR-0004).** Isolation depends on every query remembering the filter.
  Broadcast-style features are the hardest case, because they cross instance boundaries by design.
- **Test versions live in the production group.** Version activation, "latest version" lookups and cleanup must
  ignore them explicitly.
- **Real connectors mean real side effects.** A service task that writes to the finance system writes in test mode
  too. Designers need a per-connection "test double" or a read-only mode.
- Test data accumulates in the production database and needs a cleanup job.

## In hindsight

Testing in production is genuinely useful, and I would keep it. I would make the environment a **first-class
dimension**, enforced centrally like the tenant: part of the ambient context, applied by row-level security
policies, and part of the key of every query that a user sees. I would also add a per-connection switch with three
modes, "live", "read-only" and "mock", so that a designer can choose the side effects of a test run explicitly.

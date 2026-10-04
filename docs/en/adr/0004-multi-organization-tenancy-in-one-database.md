# ADR-0004: Multi-organization tenancy in one shared database

[ADR index](README.md) · [Deutsch](../../de/adr/0004-multi-organization-tenancy-in-one-database.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | All modules; identity, authorization and every tenant-scoped query |
| Related | [ADR-0005](0005-rbac-down-to-record-level.md), [ADR-0011](0011-test-sandbox-inside-the-production-engine.md) |

## Context

A typical customer is a group: a parent organization with subsidiaries, or a ministry with provincial offices. They
want **one installation** that serves all of them:

- the same process definitions for everyone, with data kept apart;
- people who work for more than one unit, often in a different role in each;
- processes that cross organizations, such as a request raised in a subsidiary and approved at headquarters;
- one backup, one upgrade and one license.

Each customer runs its own installation on its own servers. "Tenant" here means an organization *inside* a
customer, not a separate customer of a cloud service.

## Decision drivers

- Isolation good enough that each organization sees only its own data, and that this holds up in a security
  evaluation.
- Cross-organization processes and shared definitions must be natural, not special cases.
- A person must be able to switch organizations without logging out.
- Operations stay as simple as one database.

## Considered options

1. A database per organization.
2. A schema per organization in one database.
3. One shared schema with an organization column on every tenant-scoped table.
4. One shared schema where **organization membership is part of the role assignment**: users and roles are global,
   and the organization is a scope on assignments, permissions and runtime data.

## Decision

Option 4.

- **Membership.** Users and roles are defined once. A role assignment is the triple (user, role, organization), with
  flags for "default" and "administrator of this organization".
- **Active organization.** At login the user picks one of their organizations. It is stored as a claim in the
  authentication cookie, together with the active role. Switching re-checks membership and then re-issues the
  cookie and clears the user's cached permissions.
- **Explicit parameter.** Every stored procedure that touches tenant data receives the organization id as a
  parameter, taken from the claim. There is no ambient context in the database.
- **Two ways a row belongs to an organization:**
  - *Runtime data* carries an organization column: instances, work items, form records, delegation rules, lane
    rules, connection strings, map layers and so on.
  - *Definitions* (processes, reports, dashboards) are shared and become visible to an organization through
    organization-scoped permission rows (ADR-0005). One process can therefore serve many organizations.
- **One central organization** holds platform-wide administration. Multi-organization features switch on
  automatically when a second organization is created; single-organization installations never see them.
- **Per-organization customization** is limited on purpose: theme CSS, external connections, notification groups,
  and branded mobile apps.

## Consequences

### Positive

- One deployment serves a whole group, and upgrades happen once.
- Cross-organization processes are ordinary processes. A lane rule can point to a role in another organization.
- People with several jobs have one account and switch context in one click.
- Shared definitions avoid copying a process twenty times and then maintaining twenty copies.

### Negative

- **Isolation is a discipline, not a guarantee.** Every query must filter by organization. One forgotten predicate
  is a cross-tenant leak, and code review is the main defence.
- **Conventions are error-prone.** A NULL that means "the central organization" is convenient in SQL but easy to
  misread. Every default has to be chosen so that it fails closed.
- **Two belonging models** (column versus permission rows) mean that "which organization owns this?" has two
  answers depending on the table.
- **Noisy neighbours.** One organization's heavy report can slow down everyone else. There are no per-tenant
  resource limits in a single database.

## In hindsight

I would keep the shared database and the membership model. Both fit the market. I would move enforcement from
convention to mechanism:

1. **Ambient tenant context in the database.** Set `SESSION_CONTEXT` once per connection from the authenticated
   claim, and enforce it with SQL Server **Row-Level Security** policies on every tenant-scoped table. The
   application filter becomes the first line and RLS the safety net.
2. **Fail closed.** If no organization is set, return nothing and log loudly.
3. **A non-nullable organization column** on every tenant-scoped table, leading in the indexes. No NULL-means-central
   convention.
4. **Tenant tests in CI.** Seed two organizations and run every list endpoint as a user of each. Assert that no row
   of the other appears. This catches the forgotten predicate before an evaluator does.
5. **The tenant id in every log line**, so that incidents can be scoped quickly.

# ADR-0005: Role-based access control down to record level

[ADR index](README.md) · [Deutsch](../../de/adr/0005-rbac-down-to-record-level.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | Authorization across all modules |
| Related | [ADR-0004](0004-multi-organization-tenancy-in-one-database.md), [ADR-0010](0010-denormalized-inbox-read-model.md) |

## Context

Public-sector customers need very fine control:

- who may start which process and who may see which report;
- who may edit which dashboard, and who may share it further;
- which fields of a form are visible or editable at which step;
- which form records each person may see.

The security evaluation checks that authorization is enforced on the server for every call, not only by hiding
buttons. Permissions also have to work with the organization scope (ADR-0004) and with delegation.

## Decision drivers

- Server-side enforcement on every endpoint, testable by an external evaluator.
- Granularity from a whole module down to one record and one field.
- Sharing that business users can manage themselves: forward a report or a dashboard to a person, a role or an
  organization.
- Acceptable cost on hot paths: menus, lists and the inbox.

## Considered options

1. Coarse RBAC (role → page) plus ownership checks in code.
2. A hierarchical permission catalog with grants down to record level, deny over allow.
3. Attribute-based access control with a policy language.
4. Relationship-based access control (Zanzibar-style tuples).

## Decision

Option 2, with these elements.

**Catalog.** Module → page → operation. Some operations are flagged "per record" (view, edit, delete, share,
manage access, copy…). Dynamic forms and dynamic pages register themselves in the catalog when they are created.

**Grants.** A grant is (subject, catalog entry, optional record id, allow or deny, organization). A subject is a user
or a role. Roles come in two kinds:

- **positions**, of which a user has exactly one active at a time and which own an inbox;
- **role groups**, which always apply in addition to the active position.

**Evaluation.** Collect the grants of the user, the active position and all role groups in the current organization.
Any matching deny wins. Otherwise any matching allow grants. Otherwise access is denied. Platform and organization
administrators are handled by explicit administrator rules rather than by grants.

**Enforcement at four layers:**

| Layer | Mechanism |
| --- | --- |
| Controller | Authentication on every controller. Sensitive controllers also declare an access manager: a map from action to rule, in which an action with no entry is denied. |
| Action | A permission attribute names module, page and operation, and optionally which parameter carries the record id. |
| View | Menus and buttons are built from the user's resolved permissions. This is a convenience only and never the control. |
| Data | List procedures join the grant table, so that a user only ever receives rows they may see. Form records can also be restricted to "rows I created" or "rows my role created" per operation. |

**Record grants** are written when a record is created: a snapshot of the creator's page-level rights. Explicit
sharing adds grants for users, roles or whole organizations, with a chosen set of operations (view, copy, edit,
share). A dashboard can also be made mandatory for a group.

**Field level.** Each user task carries per-field settings: visible, enabled, read-only, required, default value. On
save the server ignores hidden and read-only fields, whatever the browser sends.

**Caching.** Resolved permissions and menus are cached per user and evicted by tags (user, role, role group) when a
grant changes.

## Consequences

### Positive

- Business users manage sharing themselves, so administrators are not a bottleneck.
- Protected endpoints answer a direct call with 401 or 403, not just with a hidden button.
- "Deny wins" makes exceptions easy to express: everyone in the role except this person.
- Where the access manager is used, "forgot to protect a new action" becomes visible immediately, because unmapped
  actions fail.

### Negative

- **The grant table becomes one of the largest tables** (records × subjects × operations). List queries pay for the
  join, so indexes on grants are as important as indexes on data.
- **Snapshot semantics surprise people.** Changing a role's page rights does not change grants already written for
  existing records.
- **Two evaluation paths are a risk.** The live check on each request and the cached list that builds the UI were
  implemented separately. Keeping their precedence rules identical takes tests, not good intentions.
- **The mental model is heavy for administrators.** Without an "effective permissions: why can she see this?"
  view, support tickets are slow to answer.

## In hindsight

The model was right for the domain. I would change how it is implemented:

1. **One policy decision point**, a single library used by request filters, list queries and the UI. Behind it, a
   table-driven test suite: subject, resource, operation, expected result.
2. **Default deny globally.** Register an authorization filter for every controller. Anonymous access is an explicit
   exception that is visible in code review.
3. **An "explain" endpoint** that shows which grant allowed or denied an operation. It pays for itself in support
   time.
4. **Relationship-based sharing** (OpenFGA or a Zanzibar-style table) for the forward-and-share features. Sharing is
   a relationship problem, and that model scales better than copying grants per record.

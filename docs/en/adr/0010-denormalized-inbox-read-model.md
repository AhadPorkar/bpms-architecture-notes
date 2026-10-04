# ADR-0010: A denormalized inbox read model

[ADR index](README.md) · [Deutsch](../../de/adr/0010-denormalized-inbox-read-model.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | Process engine, inbox, mobile app |
| Related | [ADR-0001](0001-stored-procedures-as-the-data-access-contract.md), [ADR-0005](0005-rbac-down-to-record-level.md), [ADR-0009](0009-server-sent-events-first-web-push-as-fallback.md) |

## Context

The inbox is the most frequently requested page in the system. Every user opens it after logging in and again after
each completed task, and the mobile app reads it too.

Computing an inbox from the normalized engine tables needs many joins: work items, instances, versions, process
groups, lanes, delegation rules, roles, organizations, form titles, read state and the test-environment flag. On top
of that come the per-user permission filters of ADR-0005. That query is expensive, its plan is sensitive to
parameters and data distribution, and it runs most often exactly when load peaks: during the morning login wave.

## Decision drivers

- Predictable inbox latency at peak, independent of how many finished cases are in the database.
- Simple query plans that a DBA can reason about and index.
- No new infrastructure such as a cache server or a search engine.
- The inbox must never show an item the engine does not consider pending.

## Considered options

1. Optimize the normalized query (indexes, hints, plan guides).
2. Cache inboxes in memory per user.
3. **Maintain a denormalized inbox table**, written by the engine together with the work item.
4. An indexed view.

## Decision

Option 3: a CQRS-style read model without a separate store.

- One row per pending work item and recipient. It carries everything the inbox shows: title, process and form,
  sender, organization, timestamps, seen state, priority, the suspended flag and the test-environment flag.
- The engine writes this projection **in the same local transaction** as the work item it mirrors. Closing,
  delegating or suspending updates it in the same way.
- Inbox queries read only the projection, with covering indexes for the common filters: recipient, role,
  organization, process group and date.
- Monitoring and list views that tolerate slightly stale data read without blocking the engine's writers. Decisions,
  such as "is this item still pending?", always read committed data from the source tables.

## Consequences

### Positive

- Inbox latency stays flat as the number of finished cases grows. Paging is cheap.
- The query is easy to understand, index and tune on a customer's server.
- The mobile app and custom inboxes reuse the same projection.

### Negative

- **Write amplification.** Every work-item change writes twice.
- **Drift is possible.** Any code path that changes work items without going through the engine's write path makes
  the projection lie. That happens with bulk administrative fixes, for example. Repair scripts exist for this, and
  they are a smell.
- **Flags are mirrored**, such as "suspended". Every new flag on the source must be propagated deliberately.

## In hindsight

I would keep the read model and change how it is fed and read:

1. **Feed it from domain events.** The engine writes "work item created/closed/delegated" events to an outbox in the
   same transaction. A projector updates the inbox. A rebuild command can then regenerate the projection from the
   source at any time, and repair scripts disappear.
2. **Turn on `READ_COMMITTED_SNAPSHOT`** at the database level instead of using per-query dirty-read hints. Readers
   no longer block writers, and nobody reads uncommitted data.
3. **Expose staleness**, for example "updated 2 s ago", if the projection is ever fed asynchronously.

# ADR-0003: Pin running instances to the version they started on

[ADR index](README.md) · [Deutsch](../../de/adr/0003-pin-running-instances-to-their-version.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | Process engine, process designer, monitoring |
| Related | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0011](0011-test-sandbox-inside-the-production-engine.md) |

## Context

Our customers change their processes often: a new approval level, a different department, a rule from a new
regulation. Instances live for days or months. A change can remove, rename or rewire elements that running
instances are sitting on right now.

Analysts publish changes themselves, during working hours, without a release window. The audit trail must show
each case against the exact diagram it followed, because that is what auditors and courts ask for.

## Decision drivers

- Publishing must never break a running case.
- History must be reproducible: "show me the path this case took, on the diagram it took it on".
- Analysts must be able to roll back a bad change in seconds.
- The rule must be simple enough to explain to non-developers.

## Considered options

1. **Edit in place.** One definition per process; running instances follow the edited graph.
2. **Migrate on publish.** Every running instance moves to the new version, with an element-mapping plan, as Camunda
   does with migration plans.
3. **Pin to version.** Versions are immutable; new instances use the active version, running instances finish on
   theirs.
4. Pin by default, with optional migration for simple cases.

## Decision

Option 3.

- A **process group** is the stable identity: name, menu entry, icon and permissions.
- Each publish creates a new, **immutable version** in the group. The full XML is stored, together with a
  relational projection of its elements, routes, lanes and settings.
- **Exactly one version per group is active.** It is the only one used for new starts. Publishing deactivates the
  others in the same transaction.
- An **instance stores the id of its version**. Every runtime lookup filters by that id. Inactive versions keep
  running their existing instances until the last one ends.
- **Rollback** is re-activating the previous version.
- **Suspend** is a separate switch per version. It removes that version's work from the inbox, for example while a
  data problem is investigated, without touching the data.
- **Call activities** resolve the called process at call time, to the *active* version of the target group. The
  start event is matched by its BPMN id, so a sub-process can evolve on its own.
- **Start timers** belong to a version. Publishing pauses the old version's start timers. The new version's
  schedule is armed explicitly from the process list, so a published diagram never starts cases by surprise.
- **Drafts** are stored apart from versions, per user, role and browser, so unfinished edits never reach production.

## Consequences

### Positive

- Publishing is a non-event for running work. Analysts publish during the day.
- The audit trail renders each case against its own diagram, with the path taken highlighted.
- Rollback is instant and needs no data change.
- The rule is easy to explain: "a case finishes the way it started".

### Negative

- **Fixes do not reach running cases.** A wrong condition stays wrong for every instance already on that version.
  We had to build administrative tools to move an instance to another step, revert it or discard it.
- **Many versions live side by side.** Monitoring has to be version-aware, and support staff must check which
  version a complaint is about.
- **Storage grows** with every publish, because each version keeps its XML and its projection.
- **Settings live twice**, in the XML and in the relational projection. Editing an element's settings must update
  both. When they drift, repair routines realign them.
- **Call activities can surprise people.** A parent on version 3 may call a child that has moved to version 7 since
  the parent started. That is intended, but it has to be documented.

## In hindsight

Pinning is the right default, and I would keep it. Three things I would add or change:

1. **Optional migration for simple changes.** Where an element-to-element mapping exists (renamed task, added
   optional step), offer it with a dry run that lists the affected instances.
2. **One source of truth.** Either the XML or the relational rows. Derive the other, never edit both.
3. **Version visibility everywhere:** in the inbox, on the case page and in BAM filters, so that "which version?" is
   never a support question.

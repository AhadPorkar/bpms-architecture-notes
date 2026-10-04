# ADR-0007: Each dynamic form owns a physical table

[ADR index](README.md) · [Deutsch](../../de/adr/0007-dynamic-forms-as-physical-tables.md)

| | |
| --- | --- |
| Status | Accepted, in production |
| Scope | Form builder, form runtime, reports, providers, sync between installations |
| Related | [ADR-0001](0001-stored-procedures-as-the-data-access-contract.md), [ADR-0005](0005-rbac-down-to-record-level.md), [ADR-0008](0008-providers-as-the-single-integration-abstraction.md) |

## Context

The form builder lets analysts design data-entry forms without code: unlimited fields, sub-forms, calculated fields,
lookups, maps, signatures and attachments. The same form is used on the web, on mobile, inside process steps and in
reports.

Form data does not stay inside the platform. Customers query it with the report designer and with BI tools, expose it
to other systems through read-only views and connectors, and expect their DBAs to index it like any other table.

## Decision drivers

- Form data must be queryable with plain SQL by reports, BI tools and customer DBAs.
- Typed columns, indexes and foreign keys.
- Designers change forms after go-live, while data already exists.
- No new database technology on customer sites.

## Considered options

1. Entity–attribute–value: one row per field value.
2. One JSON document per record in a generic table, with SQL Server's JSON functions.
3. **A physical table per form**, generated and altered from the form definition.
4. A separate document database.

## Decision

Option 3.

- The form definition (XML) is the source. Saving a form **diffs** the new definition against the previous one and
  generates DDL: create the table, add, alter or drop columns, add defaults, add foreign keys to related forms, add
  computed columns. The DDL runs in a transaction together with the definition update.
- Every form table has standard metadata columns: creator and last modifier (user, role, organization) and their
  timestamps. Row-level rules such as "only rows my role created" (ADR-0005) and tenant filtering (ADR-0004) build on
  them.
- Sub-forms become related tables with foreign keys. Questionnaire fields get a child table. When data versioning is
  switched on, an audit table per form keeps every change.
- **Designer-supplied names are validated** against naming rules (no leading digits, no reserved column names)
  before any DDL is generated. Form data itself is always written with parameters.
- **Data is never dropped silently.** A superseded child table is renamed, not deleted. The form designer blocks
  structural changes to a form that already contains digitally signed records.
- A form can also be defined "without a table", for calculation-only or display-only forms.

## Consequences

### Positive

- Reports, BI tools and customer systems read form data with ordinary SQL, typed and indexable.
- Performance is predictable. A form with a million rows behaves like any other table and can be tuned the same way.
- DBAs see real tables with real names in their monitoring tools.

### Negative

- **Runtime DDL needs DDL rights.** The application account may alter tables, which is more privilege than the rest
  of the application needs. That is a deliberate, documented trade-off, and it needs compensating controls: name
  validation, allow-lists, and designers treated as privileged users.
- **Schema changes on large tables take locks.** Changing a column type on a busy form at noon is a bad idea, and
  designers have to be taught that.
- **Table count grows** with every form. Moving forms between installations needs a dedicated export/import module
  that carries definitions and dependencies together.
- Calculated columns are defined by designers, so the DDL path is part of the designer's privilege. Designers must
  be treated as privileged users, with the review and audit that implies (see the
  [security lessons](../05-security-lessons.md)).

## In hindsight

For a new build I would store records in a **JSON column** (PostgreSQL `jsonb`, or SQL Server's JSON type) and add
**generated, indexed columns** only for fields that reports filter or sort on. That keeps SQL access for reporting
without runtime DDL on every change.

If physical tables are required, I would run DDL through a separate, least-privileged "schema service" with its own
account, with online schema-change practices and an approval step for destructive changes.

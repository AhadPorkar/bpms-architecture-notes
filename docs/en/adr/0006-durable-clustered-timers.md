# ADR-0006: Durable, clustered timers with Jalali-aware schedules

[ADR index](README.md) · [Deutsch](../../de/adr/0006-durable-clustered-timers.md)

| | |
| --- | --- |
| Status | Accepted, in production; replaces an earlier background-job library (Hangfire) |
| Scope | Process engine, report alerts, housekeeping jobs |
| Related | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0003](0003-pin-running-instances-to-their-version.md) |

## Context

BPMN timers are everywhere in our customers' processes:

- start timers ("every month, start the inventory check");
- intermediate timers ("wait three working days");
- boundary timers ("if nobody acts within 48 hours, escalate").

Report alerts and housekeeping need schedules too. Timers must survive restarts and deployments, and they must fire
exactly once when the application runs on more than one node.

Many schedules are naturally expressed in the **Persian (Jalali) calendar**: "on the 1st of every Persian month", "at
the end of Esfand". Standard cron only understands the Gregorian calendar, and Jalali months do not line up with
Gregorian ones.

## Decision drivers

- Durable across restarts, with no timer lost and none fired twice.
- Safe on a cluster of IIS nodes with no extra infrastructure.
- Jalali schedules as a first-class feature.
- Operators can see what is scheduled and what failed.

## Considered options

1. Keep the existing background-job library.
2. A Windows service that polls a timer table.
3. **Quartz.NET with its SQL Server job store in clustered mode**, hosted inside the web application.
4. A table-driven job executor written into the engine (poll with row locks).

## Decision

Option 3.

- Quartz.NET runs in process on every node and uses its ADO.NET job store in the same SQL Server, in **clustered
  mode**. The cluster lock ensures that each trigger fires on exactly one node. A node that dies hands its triggers
  over to the others.
- **Our own timer-queue table is the business source of truth.** It records which instance, step and element a
  timer belongs to, its schedule, its calendar type and whether it has finished. Quartz is the delivery mechanism.
  On startup the application **reconciles** the two: queue entries without a trigger are re-created. Missed one-shot
  timers within a grace window are fired late; older ones are not replayed automatically.
- One generic, durable job type serves all process timers. The job re-enters the engine **through the process API**,
  on dedicated timer endpoints, as a technical user. The engine needs a request context (ADR-0002), and this way every
  timer run is authenticated and logged like any other command.
- **Jalali schedules** are expanded into a broader Gregorian cron expression that is guaranteed to include every
  Jalali occurrence. When the job fires, it checks the Jalali date and skips the run if today is not in the
  schedule.
- Failed runs are retried after a configurable delay. Timer errors go to a dedicated error log that appears in the
  process monitoring screens.

## Consequences

### Positive

- No additional service to install. Timers survive restarts and fail over between nodes.
- Jalali schedules work like any other cron schedule for the designer.
- Timer-driven work shows up in the same logs and the same audit trail as human work.

### Negative

- **Two sets of books.** The queue table and the scheduler's own tables can drift, and the reconciliation code
  becomes critical. Cancelled timers must be deleted, not just paused, or the scheduler tables slowly fill up.
- **The HTTP loopback** adds a failure mode (TLS, proxy and DNS inside the server) and a technical account whose
  credentials must be rotated like any other secret. A non-success HTTP status has to count as a failure for
  retries.
- **Server local time.** Schedules are evaluated in the server's time zone. That is fine for one-country customers
  and wrong for anything else.

## In hindsight

Once the engine can be called without an HTTP context (see ADR-0002), I would drop the second scheduler for process
timers. Timers become rows in the engine's own job table, and a small executor on each node claims due rows with
`UPDLOCK, READPAST`. Firing a timer and advancing the instance then happen in one transaction: one set of books, no
loopback.

I would store every schedule as UTC plus a calendar rule plus an IANA time zone, and send missed timers to an operator
queue instead of a log line. Quartz stays a good choice for non-process schedules such as report alerts and cleanup.

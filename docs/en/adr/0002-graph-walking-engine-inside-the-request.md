# ADR-0002: An in-house BPMN interpreter that walks the graph inside the request

[ADR index](README.md) · [Deutsch](../../de/adr/0002-graph-walking-engine-inside-the-request.md)

| | |
| --- | --- |
| Status | Accepted, in production, with known limits |
| Scope | Process engine |
| Related | [ADR-0003](0003-pin-running-instances-to-their-version.md), [ADR-0006](0006-durable-clustered-timers.md), [ADR-0008](0008-providers-as-the-single-integration-abstraction.md) |

## Context

The platform needs to execute BPMN 2.0: user, service, script, send, receive and business rule tasks; exclusive,
inclusive and parallel gateways; timer, message, signal and error events; call activities and lanes. It runs on
.NET Framework and IIS, on-premises, and the screens must be Persian and right-to-left.

There is a strong product requirement on top of this. After a user presses "Approve", the next screen must already
show where the case went and who has it now. Users judge the whole system by that moment.

## Decision drivers

- One technology stack that a .NET team and customer IT can operate.
- No additional infrastructure on customer sites: no message broker, no second runtime.
- Immediate, synchronous feedback after a user action.
- Full control over the features our customers need: Persian calendar timers, organization-chart routing,
  delegation, field-level form rules per step.

## Considered options

1. Embed an established Java engine (Camunda 7 or Flowable) and integrate over REST.
2. Use Windows Workflow Foundation. It is not BPMN, and it is no longer developed.
3. Write an engine that executes BPMN **asynchronously** through a job queue (async continuations).
4. Write an engine that **walks the graph synchronously inside the command's request**, stopping at wait states.

## Decision

Option 4. The engine is an interpreter:

- At publish time, the BPMN XML is parsed and exploded into relational rows per version (ADR-0003).
- At runtime, each command (start, complete work item, message, signal, timer) loads the instance's position and
  walks forward through automatic elements until every active path reaches a wait state or an end.
- Wait states are persisted as work items, timer jobs or waiting catch events. Nothing is held in memory between
  requests.
- Parallel branches are walked one after another inside the same request. Joins count arrivals; inclusive joins
  compare arrivals with the number of routes the split accepted.
- Each step is committed as it happens. A failure stops the walk at the last committed step and is written to the
  engine error log. Administrators can retry, move, revert or discard the instance.

## Consequences

### Positive

- Simple to operate: one web application and one database, nothing else to install, monitor or back up.
- Immediate feedback: the user sees the result of the whole automatic chain.
- Easy to debug and to explain. One request means one log trail, and test mode can offer breakpoints and "skip step"
  inside the same loop.
- We could build exactly the routing, calendar and delegation features our market needs.

### Negative

- **Latency is additive.** A chain of service tasks that call slow external systems makes the user's click slow. An
  external system that hangs holds an IIS worker thread.
- **No transaction around the walk.** A failure in the middle leaves the instance partly advanced. This is safe
  because every step is persisted, but recovery is manual.
- **Concurrency at joins.** Two completions racing to the same parallel or inclusive join are not serialized by a
  lock. Duplicate submits from one user are caught by a "still pending?" check, but two different users finishing
  sibling branches at the same moment are a real, if rare, race.
- **The engine depends on the web request context.** Timers therefore re-enter it through the HTTP API as a
  technical user (ADR-0006) instead of calling it directly.
- **No parallelism inside a command.** Parallel gateways express independence, not speed.

## In hindsight

The synchronous walk was right for the product and the market. It is also why the platform was simple enough for
customer IT to run. What I would change is the inside of the loop:

1. **Per-instance serialization.** Take an application lock (or an optimistic version check) on the instance at the
   start of every command, so that joins cannot race.
2. **Explicit asynchronous boundaries.** Let designers mark a service task "asynchronous". The engine then commits a
   job row in the same transaction and returns, and a job executor continues later. That is the transactional
   outbox pattern, and Camunda calls it "async continuation". Slow integrations then stop blocking users.
3. **A transaction per step**, plus idempotency keys on every API command, so that retries are always safe.
4. **No dependency on the HTTP context.** The engine becomes a plain service that the web layer, the job executor
   and tests can all call.

If the stack allowed it, I would also seriously consider Camunda 8 or Flowable as the execution core, and keep our
value where it really is: forms, routing rules, Persian calendar support, monitoring and the low-code designers.

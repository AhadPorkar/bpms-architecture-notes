# 4. Load testing: validating 5,000 concurrent users

[Home](../../README.md) · [Overview](01-overview.md) · [C4 model](02-c4-model.md) · [Process engine](03-process-engine.md) · [ADRs](adr/README.md) · **Load testing** · [Security lessons](05-security-lessons.md) · [Retrospective](06-retrospective.md) · [Glossary](glossary.md) · [Deutsch](../de/04-load-testing.md)

The platform was validated for up to **5,000 concurrent users in a spike test**, against the acceptance criteria
below. This page describes the method: how to turn "5,000 users" into a test that means something, how to run it, and
what to look at. Our test plan used JMeter and k6. The k6 scripts in [`load-testing/`](../../load-testing/) were
rewritten from scratch for this repository and run against a mock API, so you can try every profile on a laptop.

## 1. What had to be proven

| Criterion | Target |
| --- | --- |
| Response time | 95 % of requests under 2 s |
| Throughput | at least 500 business transactions per second |
| Errors under load | below 1 % |
| Resource use at normal peak | CPU below 70 %, memory below 75 % |
| Spike | from baseline to 5,000 concurrent users in one minute, hold, and return to baseline latency afterwards |
| Endurance | 48–72 hours at normal load with no growth in latency, memory or error rate |

Reference scenarios from the test plan: a heavy process (more than 20 nodes with several external calls), a BI
dashboard with 10 charts, 2,000 people logging in at the same moment, and bulk create, read, update and delete on
form data.

## 2. "Concurrent users" is a model, not a number

Five thousand people with an open browser do not send 5,000 requests at once. They read, type and think. Little's
law links the numbers:

```text
N = X × (R + Z)

N  concurrent users            5,000
R  response time per action    ≈ 1 s
Z  think time between actions  ≈ 9 s
X  throughput                  = N / (R + Z) = 5,000 / 10 = 500 actions per second
```

That is why "5,000 concurrent users" and "500 transactions per second" are the same claim seen from two sides, but
only if the think time is realistic:

| Think time Z | Throughput needed for 5,000 users |
| --- | --- |
| 4 s | about 1,000 per second |
| 9 s | about 500 per second |
| 19 s | about 250 per second |

**Measure Z, do not guess it.** We took it from the gaps between requests in one session in the access logs and from
step durations in process monitoring. A test with zero think time and 5,000 virtual users simulates a far larger
population than the one you have. A test with 60 s think time proves very little.

## 3. Workload model

The mix comes from what users actually do in a BPM system. Most clicks read the inbox, fewer complete tasks, fewer
still start new cases:

| Journey | Share | Requests | What it stresses |
| --- | --- | --- | --- |
| Browse inbox | 45 % | 1–2 | Inbox read model, permission filters, paging |
| Complete a task | 25 % | 3 | Engine walk, form save, inbox projection, notifications |
| Start a process | 15 % | 2 | Instance creation, first lane resolution |
| View a dashboard | 10 % | 1 | Monitoring queries (the heaviest reads) |
| Upload an attachment | 5 % | 1 | Request size limits, file storage, antivirus or validation |

Every virtual user logs in once, keeps its session like a browser tab, renews its token before expiry, and waits a
random 5–13 s (mean 9 s) between actions. Business transactions are measured as well as single requests: the user
waits for "complete a task", not for one HTTP call.

## 4. Test data matters more than the user count

- **Volume.** Seed the database to production-like size before the first run: years of finished cases, millions of
  work items and rows of variable history. Query plans that are fine on an empty database fall apart at volume. The
  inbox and the monitoring queries are the first to show it.
- **Users.** At least as many test accounts as virtual users, spread over several organizations, positions and role
  groups. Shared accounts hide session contention and break single-session policies.
- **Realistic inboxes.** Some users with 5 pending items, some with 500.
- **External systems.** Stub them with service virtualization (WireMock or a small mock) that has realistic latency.
  Synchronous service tasks then cost what they cost in production ([ADR-0002](adr/0002-graph-walking-engine-inside-the-request.md)).
- **No production personal data.** Synthetic or properly anonymized data only.

## 5. Environment

- **Production-like topology:** the same reverse proxy and WAF, the same number of application nodes with sticky
  sessions, the same SQL Server edition and storage class.
- **Generators outside the DMZ**, so that the proxy and TLS termination are part of the test.
- **Generator sizing.** In a rehearsal of these scripts on a 2 vCPU / 7 GB machine, the full spike profile (5,000
  virtual users) against the mock peaked at about 3.3 GB of resident memory for k6, roughly 0.65 MB per virtual user.
  Keep generator CPU below 70 % and split the load across machines with
  [`run-distributed.sh`](../../load-testing/scripts/run-distributed.sh) when needed. Synchronize clocks (NTP) on
  every machine.

## 6. Load profiles

| Profile | Shape | Question it answers |
| --- | --- | --- |
| `smoke` | 2 users, 30 s | Does the script work against this environment? (runs in CI) |
| `load` | 0 → 2,000 users in 10 min, hold 30 min | Are the targets met at the expected daily peak? |
| `stress` | +1,000 users every 10 min up to 7,000 | Where is the breaking point, and how does the system fail? |
| `spike` | 200 → 5,000 users in 1 min, hold 10 min, back to 200, observe 5 min | Does it survive a sudden wave, and does it recover? |
| `soak` | 1,500 users for 48 h | Leaks, log and table growth, plan drift, scheduled jobs under load |
| `login-storm` | 2,000 logins at the same moment | Start of the working day: authentication and session creation |
| `throughput` | Arrival rate up to 500 transactions/s, hold 20 min | Can the system sustain the target rate, independent of think time? |

**Closed and open models.** `load`, `stress`, `spike` and `soak` are closed models: a fixed number of users, each
waiting for a response before the next action. That matches the requirement, which is stated in concurrent users.
`throughput` is an open model: transactions arrive at a fixed rate whether or not the system keeps up. Open models
avoid *coordinated omission*, where a slow system quietly reduces its own load in a closed test. Run both.

## 7. What to measure

**Client side (k6):** p50, p95 and p99 per business transaction and per request name; error rate by status code;
throughput; checks.

**Server side, at the same timestamps:**

| Layer | Signals |
| --- | --- |
| IIS / HTTP.sys | Requests queued, current requests, rejected requests, connection count |
| ASP.NET / CLR | Request wait time, thread-pool threads and queue length, % time in GC, exceptions per second |
| Windows | CPU per process, available memory, disk queue length, network throughput |
| SQL Server | Batch requests/s, waits by type, blocking chains, top queries by CPU and duration, log flush waits, tempdb, connection count |
| Application | Per-request database time from the platform's own timing log, keyed by request id |

The platform has an administrator-only diagnostics page that lists blocking chains, long-running queries, open
transactions, connection-pool and thread-pool state. During a test it is the quickest way to see *why* the numbers
are moving.

## 8. Execution protocol

1. Freeze the build and the configuration. Record both in the run log.
2. Restore the seeded database snapshot before every run, so that runs are comparable.
3. Warm up for 5 minutes at baseline load (caches, JIT, connection pools).
4. Run the profile. Steady-state windows of at least 10 minutes.
5. Repeat each significant run three times. Report the median run, not the best one.
6. Change one thing at a time between runs.
7. Abort criteria: errors above 5 % for 2 minutes, database CPU above 95 % for 5 minutes, or any data-integrity alarm.

## 9. Analysis

- **Percentiles, never averages.** Averages hide the users who wait 10 s.
- **Find the knee.** Plot p95 against load. Where latency bends upwards, find the first resource to saturate, using
  utilization, saturation and errors (the USE method) per layer.
- **Check recovery after the spike.** Latency returns to baseline within minutes, queues drain, no thread or
  connection count stays elevated.
- **Check data integrity, which is specific to BPM.** After a run, verify that every started instance is in a
  consistent state: each active path has exactly one pending work item, no join is stuck or fired twice, and no timer
  is orphaned. Load tests are the best concurrency tests you will ever run on an engine. Use them that way.

## 10. The usual suspects on an IIS, .NET Framework and SQL Server stack

What to check first when the knee comes too early:

- **Thread-pool ramp-up.** The .NET Framework adds worker threads slowly beyond its minimum. Under a spike, requests
  queue although CPU is idle. Raise the minimum worker and IO threads deliberately.
- **Request queue limits** in IIS, ASP.NET and HTTP.sys. Defaults turn a spike into HTTP 503s.
- **Session-state locking.** In-process session serializes concurrent requests of the same user. Disable session
  state on endpoints that do not need it, such as SSE, data endpoints and file downloads.
- **Connection-pool exhaustion.** "Max pool size reached" under a spike. Keep connections short and size the pool
  for the number of concurrent requests, not the number of users.
- **Logging on the hot path.** Synchronous audit and query logging can double the number of database writes. Batch it,
  move it off the request thread, or sample read logging under load.
- **Parameter sniffing** on monitoring queries. A plan built for a small organization is reused for a large one.
- **Readers blocking writers.** Prefer `READ_COMMITTED_SNAPSHOT` at the database level over per-query hints.
- **Password hashing is CPU-bound by design.** A login storm is a CPU test. Size for it; never lower the hash cost
  to pass a test.
- **Long-lived SSE connections** occupy request slots. Include idle SSE connections in the test population.
- **The browser is part of the system.** A dashboard that fires 20 identical requests at load time is a server
  problem. Our monitoring dashboard got faster from de-duplicating in-flight requests and caching on the client,
  without any change on the server.

## 11. Report

Every significant run produces a one-page report with the same structure: goal, build, environment, data volume,
profile, results against the criteria, the bottleneck found, the change made, and open risks. Template:
[`load-testing/report-template.md`](../../load-testing/report-template.md).

## 12. Run it yourself

```bash
# 1. Start the mock API (Node.js 18 or newer, no dependencies)
node load-testing/mock-api/server.js

# 2. Smoke test
k6 run -e PROFILE=smoke -e THINK_MIN_S=0.2 -e THINK_MAX_S=0.5 load-testing/k6/main.js

# 3. Rehearse the spike at 2 % scale and 5 % duration
k6 run -e PROFILE=spike -e SCALE=0.02 -e DURATION_FACTOR=0.05 load-testing/k6/main.js

# 4. Real system, split over 4 generators (run on each, INDEX 0..3)
./load-testing/scripts/run-distributed.sh 0 4 spike https://bpms-test.example.internal
```

More options are in [`load-testing/README.md`](../../load-testing/README.md).

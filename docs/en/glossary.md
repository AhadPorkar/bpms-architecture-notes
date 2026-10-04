# Glossary

[Home](../../README.md) · [Overview](01-overview.md) · [C4 model](02-c4-model.md) · [Process engine](03-process-engine.md) · [ADRs](adr/README.md) · [Load testing](04-load-testing.md) · [Security lessons](05-security-lessons.md) · [Retrospective](06-retrospective.md) · **Glossary** · [Deutsch](../de/glossary.md)

| Term | Meaning in these notes |
| --- | --- |
| Action | A decision button on a user task (approve, reject, return…), bound to an outgoing sequence flow. |
| ADR | Architecture decision record: a short document that captures one decision, its context and its consequences. |
| AFTA | Iran's national scheme for evaluating the security of IT products. GraphBPMS version 2 holds a Level 1 evaluation. |
| BAM | Business activity monitoring: performance indicators, bottlenecks and delays of running processes. |
| BPMN 2.0 | The standard notation for business processes that the designer and the engine implement. |
| C4 model | A way of describing software architecture at four levels: context, containers, components and code. |
| Call activity | A step that starts another process as a child instance and waits for it. |
| Central organization | The organization that holds platform-wide administration in a multi-organization installation. |
| Copy | A work item sent for information only. It needs no action. |
| Delegation | Handing one's inbox to another user or role for a process group and a date range. |
| DMN | Decision Model and Notation: the standard for decision tables, used by business rule tasks. |
| Inbox | The list of pending work items of a user, for their active position and organization. |
| Instance | One execution of a process version. |
| Jalali calendar | The Persian solar calendar, used in every form, report and timer schedule of the platform. |
| Lane | A BPMN lane. Its rules decide who receives the work items of the steps inside it. |
| Organization | The unit of tenancy inside one installation. Users can belong to several organizations. |
| Position | A role that owns an inbox. A user has exactly one active position at a time. |
| Process group | The stable identity of a process across all its versions. |
| Process version | One published, immutable diagram of a process group. |
| Provider | A named, parameterized connector to a SQL source, a REST service or a SOAP service, reused across modules. |
| Public form | A form that people outside the organization can submit without an account. |
| Record grant | A permission row that allows or denies operations on one specific record. |
| Role group | A role that always applies in addition to the active position. |
| Service bus | In this platform: HTTP endpoints that expose a provider or a process to other systems. |
| SSE | Server-Sent Events: a one-way, long-lived HTTP response used for real-time notifications. |
| Test environment | A sandbox inside production in which a draft process runs, invisible to real users. |
| Wait state | An element where the engine stops and persists: user task, receive task, catching event, timer, call activity. |
| Work item | One step of an instance for one recipient. |

# ADR-0009: Server-Sent Events first, Web Push as fallback

[ADR index](README.md) · [Deutsch](../../de/adr/0009-server-sent-events-first-web-push-as-fallback.md)

| | |
| --- | --- |
| Status | Accepted, in production; replaces the earlier SignalR-based design |
| Scope | Notifications, inbox, web UI |
| Related | [ADR-0002](0002-graph-walking-engine-inside-the-request.md), [ADR-0010](0010-denormalized-inbox-read-model.md) |

## Context

When the engine assigns a work item, the recipient should know right away: a badge in the open tab, or a system
notification when the browser is in the background. Earlier versions used ASP.NET SignalR for this.

On customer sites that caused recurring trouble:

- reverse proxies and WAFs where WebSockets were disabled or badly configured;
- fallback transports that behaved differently behind each proxy;
- a backplane needed as soon as there was more than one node;
- a client library on every page.

## Decision drivers

- Work through any reverse proxy that passes plain HTTPS.
- Reach users whose tab is in the background or closed.
- No new infrastructure on customer sites.
- Degrade gracefully when one channel fails.

## Considered options

1. Keep SignalR and add a SQL Server backplane.
2. Polling the inbox every N seconds.
3. **Server-Sent Events** for open tabs plus **Web Push (VAPID)** for everyone else.

## Decision

Option 3.

- **SSE channel.** Each focused tab holds one long-lived `text/event-stream` response. The endpoint runs without
  session state, so that it does not block the user's other requests, and has a long execution timeout. An
  in-memory connection registry per node maps users to open streams.
- **Web Push.** Browsers subscribe with the platform's VAPID public key. The key pair is generated on first start and
  stored in the database.
- **Dispatcher.** For each notification, try SSE first. Users reached that way are done. The rest get Web Push.
  Notifications to a whole role are sent with bounded parallelism.
- **Circuit breaker on push.** After repeated failures from the push service, push is paused for a cool-down period
  instead of piling up errors.
- Email and SMS stay separate channels, chosen per notification procedure.

## Consequences

### Positive

- Plain HTTP works through every proxy we met. No WebSocket configuration is needed on customer sites.
- No client library: `EventSource` and the Push API are built into browsers.
- Background tabs and closed browsers still receive notifications.
- Removing SignalR removed a dependency and a class of support tickets.

### Negative

- **SSE connections are per node, and there is no backplane.** A user connected to node A is not reachable over SSE
  from node B. Web Push covers that gap, but at the cost of a system notification where a badge would have been
  enough.
- **Long-lived responses use IIS request slots.** Concurrency limits and proxy timeouts must be sized for them, and
  the load test has to include idle SSE connections (see [Load testing](../04-load-testing.md)).
- **VAPID keys are secrets.** Rotating them invalidates every subscription.
- Push delivery depends on the browser vendors' push services. Those services must be reachable from the customer's
  network.

## In hindsight

The choice holds up. With more than two nodes I would add a lightweight pub/sub backplane (Redis, or SQL Server
Service Broker if no new infrastructure is allowed), so that any node can reach any open stream. I would also
measure delivery end to end, from work item created to notification shown, as a product metric.

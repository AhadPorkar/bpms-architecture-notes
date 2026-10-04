# 5. Lessons from a national security evaluation

[Home](../../README.md) · [Overview](01-overview.md) · [C4 model](02-c4-model.md) · [Process engine](03-process-engine.md) · [ADRs](adr/README.md) · [Load testing](04-load-testing.md) · **Security lessons** · [Retrospective](06-retrospective.md) · [Glossary](glossary.md) · [Deutsch](../de/05-security-lessons.md)

GraphBPMS version 2 passed Iran's national product security evaluation (AFTA), Level 1, carried out by an accredited
test lab. Around that evaluation we run SonarQube static analysis on every nightly build and an OWASP ZAP scan before
every go-live. Each customer also receives a security-policy document for its own deployment.

This page collects what I learned from preparing a large low-code platform for that kind of scrutiny. It describes
lessons and defaults, not the findings of any particular assessment and not the state of any particular installation.

## Process lessons

### 1. Make the evaluation a release gate, not a project

A certificate covers one product version. If security work happens only when the next evaluation is near, every
evaluation is a crisis. What worked:

- static analysis in the nightly build;
- a dynamic scan (OWASP ZAP) before each go-live;
- "zero critical vulnerabilities per release" as a quality metric, next to response time and defect leakage.

### 2. Documentation is half of the evaluation

Evaluators read architecture, topology, security-policy and test documents before they touch the system, and they
ask "show me where this is enforced". Keep those documents versioned with the code. A single, boring request path
(controller, then service, then stored procedure, see [ADR-0001](adr/0001-stored-procedures-as-the-data-access-contract.md))
makes the answers short and convincing.

### 3. Fix classes of bugs, not instances

When one unprotected endpoint or one concatenated SQL identifier is found, there are usually more. For every finding:

1. search the whole code base for the pattern;
2. fix all occurrences;
3. add a test, an analyzer rule or a CI check so that the pattern cannot come back.

Our refactoring of free-text "where clause" parameters into typed parameters with column allow-lists started as one
finding and became a rule.

## Technical lessons

### 4. Authorization must be default-deny at the framework level

The most valuable pattern in our code base is the per-controller *access manager*: a map from action to rule, in
which an action without an entry is denied ([ADR-0005](adr/0005-rbac-down-to-record-level.md)). The lesson is to make
it impossible to forget:

- register a global authorization filter;
- make anonymous access an explicit, reviewable exception;
- generate an inventory of all endpoints with their protection from the code, and diff it in every release.

### 5. Authorize the object, not only the action

"May this user edit reports?" is not enough. "May this user edit *this* report, in *this* organization?" is the
question. Every endpoint that takes an id checks the record grant and the tenant. And a GET never changes state: anti-forgery protection usually skips GET requests, so a state-changing GET is
an open door.

### 6. Context such as tenant and environment must fail closed

If the organization or the test-environment flag is missing from the context, the safe answer is "nothing", never a
default. Database-enforced row-level security is the safety net for the filter someone will eventually forget
([ADR-0004](adr/0004-multi-organization-tenancy-in-one-database.md), [ADR-0011](adr/0011-test-sandbox-inside-the-production-engine.md)).

### 7. Injection: values are parameters, identifiers come from allow-lists

- Values are always parameters, including inside stored procedures that build dynamic SQL.
- Identifiers (sort columns, generated table names) are checked against an allow-list and quoted with `QUOTENAME`.
- Replace parameters that carry SQL fragments ("where clause", "order by") with typed parameters.
- Test this with deliberately hostile input in integration tests, not only in a scanner.

### 8. Low-code features are code-execution features

Script tasks, calculated-field formulas, custom pages with HTML and JavaScript, and designer-written SQL in data
connectors are all ways to run code on the server or in other users' browsers. Treat designers as privileged users
with their own threat model:

- who may author scripts, pages and connectors, and who reviews them;
- sandboxing: out of process if possible, with time, memory and statement limits, and no file or network access by
  default;
- a meaningful Content Security Policy for custom pages;
- an audit trail of every change to executable content.

### 9. Outbound connectors need SSRF protection

A connector that calls "any URL the designer types" is a server-side request forgery tool.

- Allow-list target hosts, deny by default.
- Block loopback, link-local and metadata addresses.
- Validate the final URL after placeholder substitution and after redirects.
- Keep hidden parameter sources (user id, organization, API keys; see
  [ADR-0008](adr/0008-providers-as-the-single-integration-abstraction.md)) out of the caller's reach.

### 10. Headers and transport in one place

These are the cheapest findings to avoid, and evaluators check every one of them:

- TLS 1.2 or newer at the proxy;
- HSTS;
- a real Content Security Policy;
- `frame-ancestors`;
- `X-Content-Type-Options`;
- `Referrer-Policy`;
- CORS as an allow-list, never a wildcard;
- no version banners.

Define them in **one** place, either the reverse proxy or one middleware, not partly in configuration and partly in
code. Then add an automated check that reads the response headers of a deployed instance.

### 11. Authentication hygiene

- Rate-limit **every** authentication endpoint, including mobile token endpoints and password reset, not only the web
  login form.
- Lock out with a time window and back-off, and evaluate the lockout *before* a session is issued.
- Offer multi-factor authentication.
- Hash passwords with current parameters (PBKDF2-HMAC-SHA256 with the iteration count OWASP recommends today, or
  Argon2id), and re-hash on login when parameters change.
- Revoke sessions on password change (a security stamp) and keep tokens short-lived. Carry the tenant inside the
  token.

### 12. Cryptography: use the boring, authenticated defaults

- No keys in source code or in clear-text configuration. Generate them per installation at setup time.
- A random IV per message.
- Authenticated encryption (AES-GCM, or encrypt-then-MAC) for everything that leaves the server, such as export
  packages and tokens.
- Opaque random identifiers or signed tokens in URLs.
- One crypto helper, reviewed once, used everywhere.

### 13. One trusted way to know the client's IP

Rate limiting, IP blocking, audit logs and per-form IP restrictions must all use the same resolver. That resolver
trusts forwarding headers only from known proxies, walks the forwarding chain from the right, and stores addresses
in an IPv6-capable column.

### 14. Uploads: allow-lists and content checks

Allow-list extensions, check magic bytes, limit size per use case, store outside the web root, serve with
`Content-Disposition: attachment`, and scan where the customer has a scanner.

### 15. Errors tell the user nothing and the log everything

Users see a generic message with a correlation id and the right HTTP status code. The details go to the log. Release
builds must have debug output switched off, and CI should check the configuration transform rather than trust it.

### 16. Audit logs must be trustworthy

- Append-only, ideally with a hash chain so that tampering is detectable.
- Retention handled by policy, not by an administrator's delete button.
- Secrets and personal data masked in logged parameters.
- A volume budget, because "log every query" doubles database writes under load ([Load testing](04-load-testing.md)).

### 17. Administration tools are the crown jewels

Diagnostics pages, export and import modules, job consoles and license tools are the most powerful endpoints in
any platform. They need the strongest authentication, network restrictions (VPN or jump
server only) and their own audit trail.

### 18. No default credentials anywhere

Technical accounts, database logins and service-to-service credentials are created at installation time with
unique secrets. A default that "everyone changes after install" is, sooner or
later, a default that someone did not change.

## Pre-go-live checklist

- [ ] Static analysis clean of critical and high findings
- [ ] OWASP ZAP scan of the deployed instance, findings triaged
- [ ] Endpoint inventory diffed against the last release; every new endpoint has an access rule
- [ ] Tenant-isolation tests passed (two organizations, every list endpoint)
- [ ] Security headers verified on the deployed instance, CORS allow-list set
- [ ] TLS configuration checked at the proxy; HTTP redirects to HTTPS
- [ ] All default and technical credentials unique to this installation
- [ ] Connector host allow-list and SQL object deny-list configured
- [ ] Script tasks: enabled languages and limits reviewed
- [ ] Admin tools reachable only from the administration network
- [ ] Debug off, custom errors on, version banners removed
- [ ] Backups encrypted, restore tested
- [ ] Audit-log retention and masking configured
- [ ] Incident contacts and severity matrix agreed with the customer

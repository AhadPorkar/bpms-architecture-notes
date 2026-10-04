# Changelog

All notable changes to these notes. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-10-03

### Added

- System overview: purpose, quality goals, constraints, solution strategy, stack (English and German).
- C4 model: system context, containers, components of the web application and of the process engine, deployment,
  and a dynamic view; Mermaid in the documents and Structurizr DSL in `diagrams/`.
- Process engine description: versions, instances, the walk loop, gateways, lanes, timers, messages, signals,
  sub-processes, sandbox and audit trail.
- Eleven architecture decision records, from stored procedures to the test sandbox, each with a "hindsight" section.
- Load-testing method for 5,000 concurrent users, with k6 scripts, seven profiles, a mock API, a distributed runner
  and a report template.
- Eighteen security lessons and a pre-go-live checklist.
- Retrospective with a migration path without a rewrite.
- CI: Markdown lint, offline link check, Mermaid rendering, Structurizr validation, k6 runs against the mock API.

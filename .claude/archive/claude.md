# Project: Kombats

Before any architectural audit or implementation involving Players / Matchmaking / Battle:

1. First read `/docs/architecture/kombats-monorepo-integration-spec.md`
2. Treat it as the canonical integration target
3. If code conflicts with the spec, report the conflict instead of silently choosing one side

Also read these project rules:
- `/.claude/rules/task-modes.md`
- `/.claude/rules/scope-boundaries.md`
- `/.claude/rules/output-format.md`
- `/.claude/rules/event-rules.md`
- `/.claude/rules/mvp-rules.md`

---

## System Overview

Kombats is a game backend organized as a monorepo.

Primary backend services currently in active integration scope:
- Players
- Matchmaking
- Battle

Planned but currently out of scope for implementation unless explicitly requested:
- BFF
- Frontend

The codebase is organized as a monorepo, but services must remain logically isolated.

---

## Architectural Principles

- Treat each service as its own bounded context.
- Do not couple services through internal code.
- Do not use direct cross-service database access.
- Do not use shared storage as an integration mechanism.
- Cross-service communication must happen through explicit contracts only.

Allowed integration styles:
- integration events / messaging
- explicit HTTP/gRPC APIs if already part of the service design

Disallowed integration styles:
- direct reads from another service database
- direct writes into another service storage
- referencing another service's internal domain/application code

---

## Service Boundaries

### Players
Owns:
- player-facing identity mapping
- character existence and onboarding state
- character name
- character stats
- XP / level / free stat points
- long-lived progression state

### Matchmaking
Owns:
- queueing
- active match state
- matchmaking projections / combat profile snapshots
- matchmaking-specific decision logic
- active player-to-battle association discovery

### Battle
Owns:
- battle execution
- battle state
- battle turn resolution
- timeout / AFK battle resolution
- battle result production
- battle reconnect snapshot for active battles

When implementing a change, keep logic inside the owning service unless the behavior is explicitly cross-service integration.

---

## Monorepo Rules

This repository is a monorepo, but it must not behave like a hidden modular monolith.

Rules:
- Do not introduce direct project references from one service to another service's internal layers.
- Shared code must stay minimal and explicit.
- Prefer service-local implementation unless code is truly cross-cutting.

Allowed shared code:
- contracts
- messaging abstractions
- shared primitives / shared kernel if already established
- technical cross-cutting infrastructure

Do not place service-specific business logic into shared projects.

---

## CQRS / Layering Rules

Follow existing CQRS and layering conventions.

Use existing abstractions where present, such as:
- ICommand / ICommand<T>
- IQuery<T>
- ICommandHandler
- IQueryHandler

### Application Layer
- orchestration only
- no infrastructure concerns
- handlers should follow existing conventions
- default to `internal sealed` unless there is a clear reason not to

### Domain Layer
- domain behavior and invariants belong here
- no infrastructure code
- no transport concerns

### Infrastructure Layer
- persistence
- messaging wiring
- auth wiring
- external integrations

### API / Integration Layer
- thin transport adapters only
- no business logic in controllers, consumers, hubs, or endpoints

---

## Event and Messaging Rules

Use integration events for asynchronous cross-service communication.

Rules:
- integration events must represent committed state
- publish events only after successful persistence
- prefer snapshot-style events over many granular cross-service events when appropriate
- include versioning/revision data when the contract already supports it
- consumers must be thin integration adapters
- do not place domain logic in consumers

Consumer responsibilities:
- receive message
- validate basic transport-level input if needed
- map into application command/query
- invoke existing application flow

Consumer must not:
- implement domain policy
- duplicate domain logic
- contain unrelated cross-service orchestration

---

## Persistence Rules

- use existing persistence patterns in the service
- do not introduce large new abstraction layers without a strong reason
- do not invent generic repositories if the codebase does not use them
- prefer minimal, localized changes

Reliability:
- if outbox/inbox patterns already exist, reuse them
- if they do not exist, do not introduce a large reliability subsystem unless the task explicitly requires it

---

## MVP Rules

MVP means minimal but production-sane.

Rules:
- prefer minimal correct solutions
- avoid throwaway design
- avoid speculative abstractions
- avoid premature optimization
- do not add complexity for future scale unless the current change truly needs it
- preserve service boundaries even in MVP

---

## Coding Standards

- use file-scoped namespaces
- use clear and consistent naming
- follow existing project conventions before introducing new patterns
- keep changes small, localized, and readable

Naming conventions:
- Command: `{Action}Command`
- Command handler: `{Action}CommandHandler`
- Query: `{Action}Query`
- Query handler: `{Action}QueryHandler`
- Integration event: `{Name}IntegrationEvent`

Do not rename existing concepts unless necessary for correctness.

---

## Cross-Service Rule Priority

For any task involving more than one service, use this priority:

1. `/.claude/claude.md`
2. `/docs/architecture/kombats-monorepo-integration-spec.md`
3. `/.claude/rules/*`
4. service-local `.claude/*`

If local service guidance conflicts with the root integration spec, report the conflict instead of silently following the local document.

---

## Agent Behavior

When given a task:

1. Analyze the current code first.
2. Identify:
   - what already exists
   - what is missing
   - what is inconsistent or clearly incorrect
3. Reuse existing good patterns.
4. Propose the smallest change that is architecturally correct.
5. Refactor only when needed and keep it localized.
6. Preserve service boundaries.

Do not:
- start coding before understanding the current implementation
- blindly follow clearly bad existing code
- overengineer
- broaden scope without necessity
- introduce unrelated refactors
- add tests unless explicitly requested
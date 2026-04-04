# CLAUDE.md

## Project: Kombats

Kombats is a .NET backend monorepo with multiple services. Treat it as a monorepo with **logical microservice boundaries**, not as a hidden modular monolith.

Primary backend services in scope:

* `Kombats.Players`
* `Kombats.Matchmaking`
* `Kombats.Battle`

Out of scope unless explicitly requested:

* `Kombats.BFF`
* frontend/UI work
* unrelated platform/infrastructure rewrites

---

## Core Working Rule

For every task:

1. First inspect the current implementation.
2. Reuse existing good patterns when they are actually good.
3. Do not treat the existing codebase as an unquestioned quality reference.
4. Prefer the **smallest correct change** that preserves service boundaries and behavior.
5. Do not broaden scope unless the task explicitly allows it.

Do not start by inventing a new architecture.
Do not blindly preserve bad code just because it already exists.

---

## Architecture Principles

### Service boundaries are real

Treat each service as its own bounded context.

* Do not couple services through internal code.
* Do not use direct cross-service database access.
* Do not move business ownership between services unless explicitly requested.
* Cross-service communication must happen through explicit contracts only.

Allowed integration styles:

* messaging / integration events
* explicit HTTP/gRPC APIs if already part of the design

Disallowed integration styles:

* direct reads from another service database
* direct writes into another service storage
* referencing another service's internal application/domain code

---

## Service Ownership

### Players owns

* player identity mapping
* player creation / onboarding state
* character existence and ready state
* character name
* progression state
* XP / level / free stat points
* long-lived player state

### Matchmaking owns

* queueing
* active match state
* matchmaking projections / combat profile snapshots
* matchmaking-specific decision logic
* active player-to-battle association discovery

### Battle owns

* battle execution
* battle state
* turn resolution
* timeout / AFK resolution
* battle result production
* reconnect / resume snapshot for active battles

Keep logic inside the owning service unless the task is explicitly about cross-service integration.

---

## Monorepo Rules

This repository is a monorepo, but it must not behave like a shared-code blob.

Rules:

* Do not introduce direct project references from one service to another service's internal layers.
* Shared code must stay minimal and explicit.
* Prefer service-local implementation unless code is truly cross-cutting.

Allowed shared code:

* contracts
* messaging abstractions
* shared primitives
* technical cross-cutting infrastructure

Do not move service-specific business logic into shared projects.

---

## Layering / CQRS Rules

Follow existing service architecture and CQRS conventions where they are already established.

Typical intent by layer:

### API / transport layer

* thin endpoints/controllers/consumers/hubs
* transport mapping only
* no domain policy
* no heavy orchestration

### Application layer

* orchestration / use-case coordination
* no transport concerns
* no infrastructure leakage unless there is already an accepted project pattern and changing it is out of scope

### Domain layer

* domain behavior and invariants
* no infrastructure code
* no transport concerns

### Infrastructure layer

* persistence
* messaging wiring
* auth wiring
* external integrations
* technical composition details

Prefer:

* thin `Program.cs`
* thin controllers/endpoints/consumers
* focused handlers/services
* explicit naming
* predictable folder structure
* small, local changes

Avoid:

* god classes
* helper dumping grounds
* mixing orchestration and business rules into transport layer
* speculative abstraction layers
* "clean architecture cosplay"

---

## Integration and Event Rules

Use integration events for asynchronous cross-service communication.

Rules:

* publish only after committed persistence
* integration events represent committed state
* prefer snapshot-style events over many granular events where appropriate
* include revision/version data if the contract already supports it
* consumers should be thin integration adapters

Consumers must not:

* implement domain policy
* duplicate domain logic
* perform unrelated orchestration

Default event preference for this project:

* snapshot integration events
* publish after `SaveChanges`
* include `Revision` when the contract supports it
* do not explode flows into many tiny events unless clearly needed

---

## Persistence and Database Rules

Use the existing persistence style of the target service unless the task is explicitly about persistence refactoring.

Rules:

* do not introduce generic repositories without a strong reason
* prefer minimal, localized EF Core changes
* keep runtime and design-time DbContext configuration aligned
* keep database schema configuration explicit and consistent
* use one shared PostgreSQL database only if that is already the project direction, but preserve per-service schema ownership

Current preferred database direction:

* single PostgreSQL database: `kombats`
* per-service schemas such as `players`, `matchmaking`, `battle`

Migration rules:

* prefer clean, consistent migrations
* if migrations are intentionally being reset or normalized, treat that as an explicit infra task, not a casual side effect
* do not require manual `dotnet ef database update` unless the user explicitly asks for CLI-based migration work
* if the project is configured to apply migrations on startup, preserve that behavior

Naming rules:

* prefer consistent PostgreSQL-friendly naming
* if the service is already standardized on `snake_case`, preserve and extend that consistently
* do not introduce per-service ad hoc naming hacks if a shared infrastructure fix is more correct

MassTransit persistence:

* if inbox/outbox is already used, configure it consistently with service schema ownership
* do not disable reliability features just to bypass missing-table or migration issues

---

## Refactoring Rules

Internal structural refactoring is allowed when it clearly improves maintainability.

Allowed:

* extracting logic from `Program.cs`
* extracting logic from endpoints/controllers/consumers/hubs
* splitting large classes or large methods
* moving responsibilities to a more appropriate layer
* improving folder and namespace organization
* removing clearly dead code
* improving naming and consistency

Not allowed unless explicitly requested:

* changing business behavior
* changing public API contracts
* changing event contracts or integration semantics
* moving ownership between services
* broad speculative rewrites
* adding complexity without clear payoff

Rule of thumb:
Prefer the cleanest change that preserves behavior and reduces structural mess.

---

## MVP Rule

MVP in this project means:

* minimal but production-sane
* not throwaway
* not overengineered

So:

* prefer simple correct solutions
* avoid premature optimization
* avoid enterprise ceremony without benefit
* preserve service boundaries even in MVP

Do not justify poor structure with:

* "it already works"
* "it is fine for MVP"

---

## Quality Bar

Target code should look like it belongs to a strong mid-to-senior backend team.

Expectations:

* maintainable
* readable
* local reasoning over hidden magic
* explicit naming
* low accidental complexity
* low duplication where duplication is actually harmful
* no silent boundary violations

When reviewing or changing code, distinguish:

* real architectural issue
* technical debt
* style preference

Do not present style preference as a correctness problem.

---

## Task Handling Rules

### For small implementation tasks

* make the smallest correct change
* keep edits localized
* avoid unrelated cleanup
* do not rewrite surrounding code unless necessary

### For bug fixing

* identify the actual root cause first
* fix the cause, not just the visible symptom, when scope allows
* avoid runtime hacks that hide configuration/schema/integration mistakes

### For refactoring tasks

* preserve behavior and contracts
* improve structure, not theory
* do not turn every refactor into a framework redesign

### For cross-service tasks

* keep ownership clear
* allow cross-service consistency work only when the task explicitly needs it
* do not use one service's internal structure as a forced template for another

### For infrastructure tasks

* consistency across services is allowed when the task is explicitly infrastructure-related
* prefer shared infra solutions over repeated local hacks
* keep infrastructure changes separate from business logic changes

---

## Output Expectations

Unless the user asks for a different format, responses about code changes should be practical and concise.

Good default structure:

1. root cause / main issue
2. what should change
3. what should not change
4. risks / caveats

For implementation summaries, prefer:

* what changed
* why it changed
* what was intentionally left alone
* remaining risks or follow-ups

Do not produce bloated theory dumps when the task is straightforward.

---

## Decision Rule

When in doubt, choose the option that:

1. preserves behavior
2. respects service boundaries
3. improves maintainability
4. avoids unnecessary complexity
5. keeps the scope proportional to the task

If a change is cleaner but risky and not clearly justified, do not force it.

---

## Explicit Anti-Patterns

Do not:

* treat the monorepo like a shared mutable code pool
* copy logic between services just because it is convenient
* use another service's DB as a query shortcut
* hide missing infrastructure configuration with runtime hacks
* add abstractions without concrete payoff
* perform opportunistic large rewrites during small tasks
* assume existing code is good merely because it compiles

---

## Practical Default

For most project tasks, act like a disciplined senior backend engineer working in an evolving but real production codebase:

* pragmatic
* architecture-aware
* scope-controlled
* skeptical of both bad legacy and unnecessary rewrites
* biased toward clean, local, durable fixes

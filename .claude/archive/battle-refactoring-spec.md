# Kombats.Battle Refactoring Execution Spec

## Purpose

This document defines the approved refactoring scope for `Kombats.Battle`.

The service is already integrated and working.
The purpose of this refactoring is to bring the service to a clean, maintainable, production-grade standard expected from a strong engineering team, while preserving behavior and contracts.

This is an **execution spec**, not a discovery document.
Its purpose is to constrain implementation and prevent uncontrolled redesign.

---

## Core Rule

Refactoring is allowed only when it improves:

* maintainability
* separation of concerns
* structural clarity
* naming and organization
* dependency correctness
* code hygiene

Refactoring must **not** change:

* business behavior
* combat resolution semantics
* determinism
* API contracts
* event/message contracts
* realtime DTO shapes
* Redis schema and key patterns
* Lua concurrency behavior
* database schema

---

## Approved Refactoring Mode

Allowed:

* internal structural redesign within the service
* responsibility movement between correct internal layers
* file/folder/namespace cleanup
* extraction of orchestration logic from transport/composition code
* removal of confirmed dead code
* cleanup of dependency direction problems
* simplification of dumping-ground folders

Not allowed:

* architecture rewrite
* new framework patterns without strong justification
* speculative abstractions
* interface creation purely for symmetry
* contract redesign
* message/realtime schema changes
* domain redesign beyond explicitly approved scope

---

## Quality Target

`Kombats.Battle` should become a pilot service with:

* thin `Program.cs`
* thin hub/transport layer
* application-owned orchestration
* domain-focused logic isolated from infrastructure concerns
* infrastructure implementing ports cleanly
* folder structure matching responsibility
* no misleading folders
* no dumping-ground abstractions folder
* no confirmed dead code left active
* minimal namespace confusion
* pragmatic structure without overengineering

`Kombats.Battle` is a pilot/reference implementation, not a universal template for all services.

---

## Accepted Findings

The following findings are accepted as valid and may be used for implementation.

### Structural / Composition

* `Program.cs` is too large and contains excessive registration/configuration logic
* startup validation/configuration should be extracted from `Program.cs`
* Api should not directly know infrastructure package details when avoidable

### Transport / Application Boundary

* `BattleHub.JoinBattle` contains application-level orchestration and mapping responsibility
* hub-level end-reason inference and snapshot construction should move out of the hub
* transport/integration contract shapes should not leak into Application service method signatures

### Application Layer

* `BattleTurnAppService.ResolveTurnAsync` is too large and mixes orchestration, dispatch, publishing, and notifications
* `Application/Abstractions` is overgrown and mixes interfaces with data/result types
* `IBattleStateStore` currently depends on a use-case-local type (`PlayerActionCommand`) in an unhealthy direction

### Infrastructure / Organization

* `Infrastructure/Profiles` is misleading and should be renamed/restructured
* duplicate / stale combat-balance-related structures exist
* dead code exists around old combat balance provider path
* phantom or stale project references exist and should be removed if confirmed unused

### Dead Code / Legacy

* confirmed dead members may be removed only after explicit verification in code
* legacy deserialization logic may only be removed after confirming old Redis data is no longer relevant

---

## Refactoring Scope by Batch

## Batch 1 — Composition Root and File Hygiene

Status: approved

Goals:

* make `Program.cs` thin
* extract registrations/configuration
* move small misplaced types into separate files
* fix obvious naming/folder hygiene with low risk

Approved work:

* extract DI registration from `Program.cs`
* extract infrastructure registration from `Program.cs`
* extract startup/options validation from `Program.cs`
* keep middleware pipeline in `Program.cs`, but make it minimal
* move `BattleInitializationResult` into its own file
* move `CreateBattleRequest` / `CreateBattleResponse` into a separate file
* rename or restructure `Infrastructure/Profiles` into a clearer location (`Configuration` or `Rules`, depending on final local fit)

Guardrails:

* do not change service startup behavior
* do not change middleware ordering
* do not change registration semantics
* do not introduce new patterns/frameworks

---

## Batch 2 — Layer Boundary Cleanup

Status: approved

Goals:

* remove transport/integration leakage into Application
* make hub thinner
* correct internal dependency direction problems
* improve port boundary shapes where risk is acceptable

Approved work:

* move `BattleHub.JoinBattle` orchestration/mapping responsibility into Application or a correctly owned mapper/service path
* keep hub focused on auth/transport concerns and delegation
* remove `Application -> Contracts` dependency caused by `BattleParticipantSnapshot` usage in application service signatures
* move contract-to-application mapping into consumer layer
* remove phantom `Application -> Realtime.Contracts` project reference if unused
* fix `IBattleStateStore` dependency on `PlayerActionCommand` from `UseCases/Turns`
* move `PlayerActionCommand` to a more appropriate Application-level location if needed
* split `Application/Abstractions` into clearer organization such as `Ports/` and `Model/` (folder-level only, same project)
* cleanup `IBattleRealtimeNotifier` signature only if implementation remains behaviorally identical

Guardrails:

* do not change hub route
* do not change realtime DTO shapes
* do not change consumer behavior
* do not add interfaces to app services only for symmetry
* do not widen scope into architecture redesign

Notes:

* notifier signature cleanup is allowed, but treat it as medium-risk internal refactoring, not trivial cleanup

---

## Batch 3 — Dead Code and Stale Dependency Cleanup

Status: approved with verification-first rule

Goals:

* remove confirmed dead code
* remove stale project/package references
* eliminate duplicate or obsolete configuration path elements

Approved work:

* remove dead `ICombatBalanceProvider`
* remove dead `CombatBalanceProvider`
* remove dead root `CombatBalanceOptions` if only subtypes are still in use
* consolidate duplicate combat-balance mapping logic into one active path
* remove confirmed dead `TurnDeadlinePolicy`
* remove confirmed dead `StoreActionAsync`
* remove confirmed dead `GetActiveBattlesAsync`
* remove phantom project references
* clean obvious csproj noise if safe

Guardrails:

* every deletion must be verified against real usages first
* do not remove legacy Redis compatibility logic unless old data path is explicitly ruled out
* do not merge unrelated cleanup into the same commit/batch

---

## Batch 4 — ResolveTurnAsync Structural Refactor

Status: approved, high risk

Goals:

* reduce god-method complexity
* preserve exact orchestration semantics
* keep concurrency-sensitive flow intact

Approved work:

* split `BattleTurnAppService.ResolveTurnAsync` into focused private methods or tightly scoped collaborators
* keep `ResolveTurnAsync` as top-level orchestrator
* extract dispatch/publish/notify phases only if exact ordering is preserved
* preserve CAS flow, event publishing semantics, and notification order

Guardrails:

* no behavior change
* no order-of-operations change
* no concurrency model change
* no Lua/script changes in the same batch
* do not introduce a generic domain event dispatcher or heavy pipeline pattern
* keep resulting design simple

Verification expectations:

* must compare before/after flow carefully
* should be tested with full battle lifecycle smoke verification at minimum

---

## Batch 5 — Optional Domain Model Cleanup

Status: deferred / optional

Goals:

* improve domain consistency only if clearly justified and safe

Potential work:

* remove redundant post-construction mutation in `BattleDomainState`
* revisit `PlayerState.CurrentHp` setter visibility / mutation path
* normalize state mutation pattern only if determinism and mapping paths remain intact

Decision:

* this batch is **not mandatory** for current refactoring wave
* do not execute automatically after earlier batches
* only do this if earlier refactors are complete and the remaining design problem is still worth the risk

Guardrails:

* do not force “full immutability” for aesthetics
* do not redesign the domain model for purity
* determinism and mapping stability are higher priority than elegance

---

## Explicit Exclusions for Now

Do not do these as part of the current refactoring wave unless separately approved:

* rename `Combats` → `Kombats` across shared/realtime namespaces without dependency verification
* move or rename migration namespaces/folders unless EF tooling behavior is validated
* change Redis JSON schema
* change Redis key naming or ZSET conventions
* rewrite Lua scripts except for truly isolated dead assignments after verification
* introduce MediatR, pipeline behaviors, generic repositories, strategy explosion, or new architectural layers
* create separate abstraction projects
* change cross-service ownership boundaries

---

## Folder / Namespace Direction

The desired direction is:

### Api

Owns:

* composition root
* middleware
* controllers/dev endpoints
* worker hosting registration

Should not own:

* business orchestration
* domain/realtime mapping logic
* infrastructure-specific package details beyond minimal bootstrapping

### Application

Owns:

* use-case orchestration
* ports
* application-owned models/results
* application mapping
* protocol/use-case validation

Should not own:

* integration wire shapes
* framework transport concerns
* infrastructure details

### Domain

Owns:

* combat rules
* deterministic resolution logic
* domain state/value objects/events

Should not own:

* framework references
* infrastructure concerns
* transport DTOs

### Infrastructure

Owns:

* Redis
* EF/Postgres
* messaging consumers/publishers
* realtime delivery
* infrastructure mapping
* config binding/providers

Should not own:

* core business decisions

---

## Archive and Historical Guidance Rule

Implementation must follow `.claude/active/*` only.

Files under `.claude/archive/` and archived prompt/spec locations are historical context only.

Rules:

* do not use archived guidance as active instruction
* do not revive old integration-phase constraints unless still explicitly relevant
* if archive conflicts with active refactoring docs, active docs win

---

## Execution Rules for Claude

When implementing:

* work batch by batch
* do not pull future-batch changes into the current batch
* do not “improve extra things” outside approved scope
* if a refactor candidate turns out riskier than expected, stop at the approved boundary
* prefer smaller, reviewable changes
* keep naming and structure consistent
* preserve behavior first, cleanliness second

---

## Success Criteria

The refactoring wave is successful if:

* service behavior remains unchanged
* battle lifecycle still works end-to-end
* structure becomes cleaner and easier to reason about
* layer boundaries are more correct
* active dead code and stale dependencies are reduced
* transport, application, domain, and infrastructure responsibilities are more clearly separated
* no enterprise overengineering is introduced

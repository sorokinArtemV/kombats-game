# Kombats.Matchmaking Refactoring Execution Spec

## Status

Planned

## Target

`Kombats.Matchmaking`

## Context

We already completed a disciplined staged refactoring workflow for `Kombats.Battle`.

`Kombats.Matchmaking` must follow the same process discipline:

1. audit first
2. constrained execution spec second
3. implementation in isolated batches
4. separate review after each batch
5. preserve behavior and contracts throughout

This document is the execution constraint for the refactoring phase.

It is **not** a redesign document.
It is **not** permission for broad cleanup.
It is **not** permission to "improve architecture" outside the explicit scope below.

---

## Primary Goal

Bring `Kombats.Matchmaking` to a cleaner, more maintainable, production-grade structural standard while:

- preserving business behavior
- preserving HTTP/API contracts
- preserving messaging and integration semantics
- preserving runtime behavior
- avoiding overengineering
- avoiding speculative rewrites

This refactoring is intended to improve:

- structural clarity
- layer boundaries
- file organization
- dependency hygiene
- discoverability
- maintainability

---

## Refactoring Philosophy

Use pragmatic strong-team engineering standards.

Do **not** assume the current structure is correct just because it works.

Do **not** treat the existing codebase as the quality reference.

At the same time:

- do not chase theoretical purity
- do not introduce architecture astronautics
- do not widen scope
- do not invent new patterns unless clearly required by the approved scope
- do not replace working mechanisms with alternative frameworks/patterns during this refactor

Internal structural redesign is allowed **only** where explicitly justified in this spec.

---

## Approved Refactoring Scope

The approved refactoring scope is limited to the following categories.

### 1. Dead code removal

Allowed:

- remove unused `IMatchStore`
- remove unused `RedisMatchStore`
- remove dead associated model types if truly only used by that dead path
- remove obviously unused phantom dependencies
- remove residual unused usings
- remove other dead code only if it is clearly proven unused by the current codebase

### 2. File organization cleanup

Allowed:

- extract colocated secondary types into dedicated files where this improves discoverability
- separate service types from DTOs, result models, exceptions, and enums
- move inline API DTOs out of controller files
- move result enums next to the result models that own them
- extract outbox payload mapping types from oversized service files when done without behavior change

### 3. Layer boundary cleanup

Allowed:

- make API-layer workers thinner where they currently perform infrastructure-heavy work directly
- move infrastructure dispatch logic out of API worker implementations into infrastructure-owned services
- reduce direct API-layer construction of infrastructure concretes
- prefer DI-resolved abstractions/services over manual construction inside workers

### 4. Dependency hygiene cleanup

Allowed:

- remove phantom package references
- fix missing options binding that should already exist logically
- improve ownership of infrastructure-heavy operational logic without changing public behavior

### 5. Worker responsibility cleanup

Allowed:

- make workers act as orchestration/scheduling shells
- delegate raw persistence, dispatch, retry, lease, or infrastructure operations to dedicated services
- keep worker behavior the same while improving responsibility placement

---

## Explicit Non-Goals

The following are **not** in scope.

### Messaging / outbox redesign

Do **not**:

- replace the custom outbox with MassTransit built-in outbox
- redesign message routing semantics
- redesign queue names or endpoint addressing
- change retry/failure semantics unless strictly necessary to preserve current behavior during extraction

### Redis / queue behavior redesign

Do **not**:

- rewrite Redis Lua scripts
- change Redis key formats
- change queue semantics
- change cancellation semantics
- change matching behavior
- change atomic operations

### Transactional flow redesign

Do **not**:

- change the transaction boundary around match creation and outbox write
- reorder persistence and outbox write behavior
- alter commit/rollback semantics

### Schema / persistence redesign

Do **not**:

- change database schema
- change migrations
- change entity shape unless absolutely required for a no-behavior-change extraction
- redesign repositories

### Consumer redesign

Do **not**:

- rewrite consumers that are already thin and correctly delegated
- move consumers out of infrastructure
- alter contract handling behavior

### Domain redesign

Do **not**:

- introduce artificial domain behavior into `Match`
- force richer domain modeling without a concrete need
- refactor anemic domain model just for style reasons

### Cross-service redesign

Do **not**:

- modify `Kombats.Battle.Contracts`
- modify `Kombats.Players.Contracts`
- alter cross-service integration contracts
- widen scope into adjacent services

---

## Guardrails

These guardrails are mandatory.

### Guardrail 1 — Behavior preservation

All approved refactoring must preserve:

- matchmaking behavior
- queue join/leave behavior
- queue status behavior
- active match checks
- outbox creation and dispatch semantics
- timeout behavior
- distributed lease behavior
- logging intent and operational visibility

### Guardrail 2 — No contract changes

Do not change:

- controller routes
- request/response contract shapes
- message contract shapes
- integration event semantics

### Guardrail 3 — No speculative fixes

If something is only *suspected* to be wrong but not sufficiently proven, do not “fix” it by redesign.

### Guardrail 4 — Safe-first ordering

Execute refactoring from safest/high-confidence items toward medium-risk items.

### Guardrail 5 — No cleanup sprawl

Do not opportunistically refactor unrelated code while touching a file.

### Guardrail 6 — Thin extraction, not redesign

When extracting worker or dispatch logic, preserve the existing algorithm and semantics.
The goal is responsibility relocation, not behavioral invention.

---

## Risk Classification

### Safe scope

Safe items include:

- removing proven dead code
- removing phantom dependency references
- adding missing options binding
- extracting DTOs/result models/enums/exceptions into dedicated files
- extracting secondary payload types into dedicated files
- removing unused usings
- small namespace/file placement corrections that do not alter behavior

### Medium-risk scope

Medium-risk items include:

- extracting outbox dispatch logic out of `OutboxDispatcherWorker`
- extracting lease/locking logic usage out of `MatchmakingWorker`
- introducing new infrastructure service abstractions for current worker behavior
- removing `SetMatchedAsync` only if confirmed as truly unused and non-semantic

### High-risk scope

Not approved in this refactor:

- replacing outbox strategy
- changing Redis queue behavior
- changing Lua scripts
- changing transactional ordering
- changing status semantics
- changing multi-instance coordination semantics
- changing match state flow

---

## Confirmed Refactoring Targets

The following targets are approved for execution.

### Target A — Dead code cleanup

Approved:

- remove `IMatchStore`
- remove `RedisMatchStore`
- remove their dead associated types if no longer used
- remove phantom `MassTransit.Abstractions` dependency from Application if truly unused

Conditional:

- remove `SetMatchedAsync` only if implementation usage is fully verified absent and no semantic dependency exists in current runtime design

### Target B — File and type extraction cleanup

Approved:

- extract types from `QueueService.cs` into dedicated files where appropriate
- extract request/response DTOs from `QueueController.cs`
- move `MatchCreatedResultType` next to `MatchCreatedResult`
- extract outbox payload-related secondary types from `MatchmakingService.cs` into dedicated files if done without behavior change

### Target C — Configuration correctness cleanup

Approved:

- add missing binding/configuration for `MatchmakingRedisOptions`

This is a correctness/config hygiene fix and should be treated as safe.

### Target D — OutboxDispatcherWorker responsibility extraction

Approved direction:

- `OutboxDispatcherWorker` should become a thin hosted worker
- raw EF querying, entity mutation, payload deserialization, dispatching, retry/failure handling should move into infrastructure-owned service(s)

Mandatory constraints:

- preserve dispatch flow exactly
- preserve retry/failure semantics
- preserve message addressing behavior
- preserve current status transitions and persistence timing
- do not redesign outbox mechanism

### Target E — MatchmakingWorker infrastructure-construction cleanup

Approved direction:

- reduce direct concrete infrastructure construction inside `MatchmakingWorker`
- move lease/lock-heavy behavior behind DI-resolved service(s) or equivalent narrow abstraction
- remove hardcoded duplication where configuration should be sourced consistently

Mandatory constraints:

- preserve lease acquisition/renew/release semantics
- preserve multi-instance safety behavior
- preserve current loop behavior and cancellation semantics

---

## Execution Order

Refactoring must be done in isolated batches.

### Batch 1 — Safe cleanup and organization

Scope:

- dead code removal that is clearly proven
- phantom dependency cleanup
- options binding fix
- extract DTOs/result models/enums/exceptions into dedicated files
- remove unused usings
- improve file placement without behavior change

This batch must avoid worker logic changes.

### Batch 2 — Application/internal file organization refinement

Scope:

- extract secondary payload/mapping-related types from oversized application files
- improve organization of use-case-adjacent types
- keep all logic behavior identical
- no worker redesign yet

This batch must still remain behavior-neutral.

### Batch 3 — Outbox dispatcher boundary cleanup

Scope:

- extract infrastructure-heavy dispatch logic from `OutboxDispatcherWorker`
- leave worker as thin scheduling/orchestration shell
- place dispatch logic in infrastructure-owned service(s)

This is the first medium-risk batch.

### Batch 4 — Matchmaking worker boundary cleanup

Scope:

- eliminate direct problematic infrastructure construction in `MatchmakingWorker`
- move lock/lease-heavy operational behavior behind DI-managed service(s) or equivalent controlled extraction
- remove hardcoded configuration duplication if part of that path

This is medium-risk and must remain narrowly scoped.

### Batch 5 — Final cleanup / leftovers only if justified

Optional batch.

Use only if needed for:

- very small leftover consistency fixes
- small namespace/file placement alignment
- cleanup strictly required by prior batches

No opportunistic expansion.

---

## Implementation Rules for Claude

When implementing any batch, follow these rules.

### Rule 1

Do not widen batch scope.

Only implement the items explicitly assigned to that batch.

### Rule 2

Do not mix safe cleanup with medium-risk worker refactoring unless the batch explicitly allows it.

### Rule 3

Do not silently redesign logic while “extracting”.

Extraction means moving responsibility ownership, not changing semantics.

### Rule 4

If a target turns out to be less certain than expected, stop and report it rather than improvising a redesign.

### Rule 5

Preserve existing contracts, logs, and operational behavior unless the batch explicitly states otherwise.

### Rule 6

Prefer small, reviewable commits/patches over large sweeping rewrites.

---

## Review Expectations Per Batch

Every batch must be reviewed separately.

Each review should validate:

- scope compliance
- no contract changes
- no behavior drift
- no hidden widening of refactor
- improved ownership and maintainability
- no accidental dependency inversion introduced during cleanup

Special attention:

- Batch 1 review: ensure cleanup is truly dead/safe
- Batch 3 review: ensure outbox semantics are unchanged
- Batch 4 review: ensure lease/distributed coordination semantics are unchanged

---

## Decisions Already Made

These decisions are locked unless new hard evidence appears.

### Decision 1

Keep the custom outbox.
Only reorganize where the logic lives if needed.

### Decision 2

Do not touch Redis scripts, Redis key structure, or queue semantics.

### Decision 3

Do not redesign consumers.

### Decision 4

Do not redesign the domain model.

### Decision 5

Do not use this refactor as a pretext for architectural experimentation.

---

## Done Criteria

The refactoring is complete only when:

- approved scope items are implemented
- workers no longer contain the approved structural violations
- dead code in approved scope is removed
- file/type organization is materially improved
- dependency hygiene issues in approved scope are fixed
- behavior/contracts/integration semantics remain unchanged
- all batches were reviewed independently

---

## Final Instruction

Treat this spec as the source of truth for implementation scope.

If the codebase suggests additional improvements outside this spec, do **not** implement them automatically.

Raise them separately for review instead of expanding the refactor.
# Ticket Decomposition Strategy

How to split the implementation plan into reviewable, shippable tickets. This document governs ticket creation for an in-place architectural reboot — not a greenfield build.

---

## Ticket Types

Every ticket must declare its type. The type determines what the ticket is allowed to do and what its definition of done includes.

### Foundation ticket

Establishes target-architecture infrastructure inside the current repository.

Examples:
- "Create `Directory.Packages.props` and update all `.csproj` files to use central package management"
- "Create `Kombats.Abstractions` project with `Result<T>` and handler interfaces"
- "Create unified `Kombats.sln` and retire per-service solution files"

**Definition of done:** The foundation element exists, compiles, and does not break existing builds.

### Replacement ticket

Builds new target-architecture code that supersedes legacy code for a specific concern.

Examples:
- "Create `Kombats.Players.Bootstrap` project and move composition from Api"
- "Rewrite Players Api layer with Minimal API endpoints replacing Controllers"
- "Rewrite Matchmaking Infrastructure consumers with outbox/inbox and idempotency"

**Definition of done:** New code is implemented, tested, and correct. The ticket must state whether legacy code is removed in this ticket or in a paired removal ticket. If the replacement is self-contained (e.g., a new Bootstrap project that replaces the old composition root), removal of the old code is part of this ticket.

### Migration/cutover ticket

Handles the transition point where traffic, references, or operational behavior moves from old code to new code.

Examples:
- "Cut over Players service executable from Api to Bootstrap"
- "Migrate Matchmaking schema to target migrations (align with new DbContext)"
- "Update docker-compose to run services from Bootstrap projects"

**Definition of done:** The cutover is complete. Old entry points are deactivated or removed. The system works from the new code path. Rollback plan is documented if the cutover is non-trivial.

### Legacy-removal ticket

Deletes superseded legacy code after replacement is verified.

Examples:
- "Delete legacy Players Controllers and `Kombats.Shared` references"
- "Remove per-service `.sln` files and `Kombats.slnx`"
- "Delete `DependencyInjection.cs` from all Infrastructure projects"

**Definition of done:** Legacy code is deleted. Solution still builds. All tests pass. No orphan references.

**Important:** Legacy-removal tickets are not optional follow-up work. They are required as part of the replacement stream's completion. A replacement stream is not done until its removal tickets are closed.

### Integration verification ticket

Verifies that replaced services work together correctly.

Examples:
- "Verify Players → Matchmaking event flow: `PlayerCombatProfileChanged` consumed and projected"
- "Verify end-to-end gameplay loop across all three replaced services"
- "Verify contract serialization/deserialization across all service boundaries"

**Definition of done:** The integration behavior is verified with tests. Any issues found are filed as separate tickets.

---

## Ticket Size Rules

A ticket is correctly sized when:

- It can be implemented and reviewed in a single working session.
- It touches one layer of one service, or one cross-cutting concern.
- The diff is reviewable without losing context. Target: under 500 lines of production code changed. Test code does not count toward this limit.
- It has a clear, testable exit condition.

A ticket is too large when:

- It spans multiple layers (domain + infrastructure + API) unless the scope within each layer is trivial.
- It introduces a new domain concept AND its persistence AND its API surface in one shot.
- It both replaces and removes legacy code when the replacement itself is substantial.
- The reviewer needs to understand multiple independent changes to evaluate correctness.
- It mixes structural/scaffolding work with behavioral/logic work.

A ticket is too small when:

- It creates a file or type that cannot be tested or used without a follow-up ticket.
- It introduces an interface with no implementation.
- It requires another ticket to land before it has any observable effect.

---

## What Belongs in One Ticket

### Foundation tickets
- One shared library or abstraction setup (e.g., "Set up `Kombats.Messaging` with MassTransit 8.3.0 outbox/inbox configuration")
- One contract definition or alignment batch (e.g., "Align all Players contract types with Version fields")
- One repo-infrastructure change (e.g., "`Directory.Packages.props` + `Directory.Build.props` + `global.json`")

### Replacement tickets (domain)
- One aggregate or entity with its invariants and unit tests
- One state machine with all transitions and unit tests
- One domain service or pure function with unit tests (e.g., BattleEngine, CombatMath)

### Replacement tickets (application)
- One command handler with its port interfaces and unit tests
- One query handler with unit tests
- One background worker/job with unit tests

### Replacement tickets (infrastructure)
- One `DbContext` setup with schema configuration, entity mappings, and initial migration
- One repository implementation with integration tests
- One Redis operation set (e.g., "Matchmaking queue Redis operations with Lua scripts") with integration tests
- One consumer with idempotency test and behavior test

### Replacement tickets (API)
- One endpoint group (e.g., "Character management endpoints") with auth and validation tests
- Auth configuration for one service
- Health check configuration for one service

### Migration/cutover tickets
- One service cutover (e.g., "Switch Players executable from Api to Bootstrap")
- One schema migration alignment (e.g., "Align Matchmaking EF migrations with new DbContext")

### Legacy-removal tickets
- One service's legacy code removal (e.g., "Delete all legacy Players Controllers, `Kombats.Shared` refs, old `Program.cs`")
- One cross-cutting legacy artifact removal (e.g., "Delete per-service `.sln` files")

### Integration verification tickets
- One cross-service event flow verified end-to-end

---

## Splitting Rules for Replacement Work

### Do not mix replacement and removal in large tickets

If the replacement itself is substantial (new Bootstrap project, new Api layer with multiple endpoints), put the replacement in one ticket and the removal in a paired ticket. This keeps diffs reviewable and makes rollback easier.

If the replacement is small (e.g., moving a single configuration block from Infrastructure `DependencyInjection.cs` to Bootstrap), replacement and removal can be in the same ticket.

### Do not mix old and new patterns in one ticket

A ticket must not both extend legacy code and write new target-architecture code. If a temporary adapter is needed to bridge old and new during migration, the adapter belongs in a dedicated migration ticket, not mixed into a replacement ticket.

### Do not create tickets that both preserve and replace the same behavior

If a ticket's scope is "rewrite the Players Api endpoints," it must not also contain patches to the existing Controllers. Either you are replacing (write Minimal APIs, delete Controllers) or you are patching (fix a bug in existing Controllers). Not both.

### Temporary adapters and shims

If old and new code must coexist temporarily and an adapter is needed:
- The adapter ticket is a migration/cutover ticket.
- The adapter must be clearly marked as temporary (code comment, ticket description).
- A removal ticket for the adapter must be created at the same time.
- Adapters must not embed business logic — they are purely structural bridges.

### Require removal as part of completion

Every replacement ticket must either:
1. Include the removal of the superseded legacy code in the same ticket (if the replacement is self-contained), OR
2. Have a linked legacy-removal ticket that is part of the same phase.

A replacement stream is not complete until all removal tickets in that stream are closed.

---

## How to Split Foundation vs Replacement vs Integration Work

### Foundation first
Foundation tickets produce target-architecture infrastructure. They land before any replacement ticket that depends on them. Examples:
- Central package management
- Unified solution file
- `Kombats.Abstractions` project
- Shared messaging library alignment
- Auth configuration helper

### Replacement work is layer-by-layer, domain outward
Within a service replacement, tickets follow dependency order:
1. Bootstrap project creation (composition root shell)
2. Domain layer (no dependencies, can land first)
3. Application layer (depends on domain)
4. Infrastructure layer (depends on application ports and domain)
5. API layer (depends on application and infrastructure DI)
6. Cutover (switch executable, retire legacy entry point)
7. Legacy removal (delete superseded code)

Do not create a ticket that requires both domain modeling and infrastructure persistence in one shot. The domain ticket lands first; the persistence ticket follows.

### Integration and removal work comes after replacement work
Integration verification tickets depend on the involved services' replacement being complete. Legacy-removal tickets depend on the replacement being verified. Do not mix these with service replacement work.

---

## Acceptance Criteria Format

Every ticket must have acceptance criteria written as verifiable statements:

```
## Acceptance Criteria

- [ ] [Observable behavior or state]: [specific condition]
- [ ] Tests: [which tests exist and pass]
- [ ] No [specific anti-pattern or violation]
- [ ] Legacy: [what legacy code was removed or what removal ticket was created]
```

Example (replacement ticket):

```
## Acceptance Criteria

- [ ] Kombats.Players.Bootstrap exists as composition root with Microsoft.NET.Sdk.Web
- [ ] Kombats.Players.Api SDK changed to Microsoft.NET.Sdk (no longer executable)
- [ ] All DI registration moved from Infrastructure/DependencyInjection.cs to Bootstrap/Program.cs
- [ ] Legacy DependencyInjection.cs deleted
- [ ] Legacy Program.cs in Api deleted
- [ ] Tests: Players service starts from Bootstrap and responds to health check
- [ ] No composition logic remains in Infrastructure project
```

Example (legacy-removal ticket):

```
## Acceptance Criteria

- [ ] All Controller classes deleted from Kombats.Matchmaking.Api
- [ ] Controllers/ directory deleted
- [ ] No MVC-related using statements remain in Matchmaking projects
- [ ] Solution builds successfully
- [ ] All tests pass
```

---

## Testing Requirement per Ticket

Every ticket that introduces or modifies behavior must include its required tests in the same ticket. Tests are not follow-up work.

| Ticket type | Required tests |
|---|---|
| Domain replacement | Unit tests for all state transitions, invariants, edge cases |
| Application replacement | Unit tests with stubbed/faked ports |
| Infrastructure replacement (persistence) | Integration tests with real Postgres (Testcontainers) |
| Infrastructure replacement (Redis) | Integration tests with real Redis (Testcontainers) |
| Infrastructure replacement (consumers) | Behavior test + idempotency test |
| API replacement | Auth enforcement, input validation, response shape tests |
| Integration verification | Cross-service event flow verification |
| Foundation | Build verification, compilation tests as appropriate |
| Legacy removal | Verify solution builds and all existing tests pass |
| Migration/cutover | Verify service starts and responds correctly from new entry point |

A ticket without its required tests is not complete.

---

## Reviewer Expectations per Ticket

The reviewer must verify:

1. **Ticket type discipline:** Is this ticket doing what its type says? A replacement ticket must not also be patching legacy code. A removal ticket must not also be introducing new behavior.
2. **Boundary compliance:** Does the code respect layer boundaries and service isolation? No domain logic in infrastructure. No infrastructure in application. No cross-service references outside contracts.
3. **Guardrail compliance:** Does the code follow the implementation guardrails? Outbox for all event publication. No forbidden patterns. Correct dependency direction. No extension of legacy patterns.
4. **Test coverage:** Do the required tests exist and test meaningful behavior? Not just happy path — edge cases, error cases, concurrency cases where relevant.
5. **Contract stability:** If contracts changed, are changes additive-only? Is the Version field updated?
6. **Scope discipline:** Does the ticket do what it says and nothing more? No scope creep. No drive-by refactors. No "while I was here" additions.
7. **Legacy posture:** If new code coexists with old code after this ticket, is that coexistence documented and time-bounded? Is a removal ticket linked?

---

## When a Ticket Must Be Split

Split a ticket when any of these apply:

| Signal | Split into |
|---|---|
| Ticket touches domain + infrastructure + API | Separate tickets per layer |
| Ticket introduces a new entity and its consumer | Entity/persistence ticket + consumer ticket |
| Ticket mixes scaffolding (project setup, DI registration) with behavior | Scaffolding ticket + behavior ticket |
| Ticket requires changes in two services | One ticket per service + integration ticket |
| Ticket both replaces and removes substantial legacy code | Replacement ticket + removal ticket |
| Ticket requires a temporary adapter between old and new | Adapter ticket + removal ticket for the adapter |
| Review feedback reveals the diff is too large to evaluate | Split along natural seams (by handler, by entity, by operation) |
| Ticket has acceptance criteria that could independently pass or fail | Each independent criterion may warrant its own ticket |

When in doubt, split. Two small tickets are always better than one sprawling ticket.

---

## Ticket Ordering Heuristic

Within a phase, order tickets by:

1. **Foundation before replacement.** Central package management before service replacement. Shared libraries before service infrastructure.
2. **Unlocks other work first.** A domain entity ticket unlocks its repository, handler, and endpoint tickets.
3. **Higher risk first.** Deterministic RNG, outbox atomicity, and Redis CAS scripts are high-risk. Implement and test them early.
4. **Correctness-critical before convenience.** Auth enforcement before OpenAPI docs. Outbox before health checks.
5. **Replacement before removal.** Build the new thing, verify it, then remove the old thing.
6. **Removal before next phase.** Clean up one service before starting integration verification.

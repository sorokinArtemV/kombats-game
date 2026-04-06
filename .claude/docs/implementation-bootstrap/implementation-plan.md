# Implementation Plan

Phase-based execution plan for performing an architectural reboot of the Kombats repository **in place**. The existing repository is the implementation host. No new repository is created.

New code is introduced into the current repository following the target architecture. Legacy code and replacement code coexist temporarily during each service's migration window. Coexistence is explicit, bounded, and documented. After replacement is verified, superseded legacy code is removed. Legacy removal is part of the definition of done — not optional cleanup.

This plan defines the order of work and dependencies between phases. It does not define individual tickets.

---

## Phase 0: Foundation Alignment

**Goal:** Align the existing repository's build infrastructure and shared foundations with the target architecture. The legacy codebase continues to function during this phase. No service behavior changes.

This phase operates on the repository as it exists today. It adds missing structural pieces and corrects configuration, but does not replace service code.

**Deliverables:**

### Build infrastructure
- `global.json` — pin SDK 10.0.100 with `latestPatch` roll-forward. Does not exist yet; create it.
- `Directory.Packages.props` — central package management with all approved versions from the technology baseline. Does not exist yet; create it. Existing `.csproj` files must be updated to remove inline version attributes. If a service is about to be fully replaced in Phase 2–4, its `.csproj` version cleanup can be deferred to that phase.
- `Directory.Build.props` — shared project properties (`net10.0`, nullable, implicit usings, latest lang version). Does not exist yet; create it.
- `.editorconfig` — update or create as needed.

### Solution unification
- `Kombats.sln` — unified solution file that includes all existing and new projects. Replaces per-service `.sln` files and `Kombats.slnx`. Both legacy and new projects must be included so the full repo builds from one solution. Legacy solution files are removed after the unified solution is verified.

### Infrastructure
- `docker-compose.yml` updated to target architecture requirements (PostgreSQL 16, RabbitMQ 3.13, Redis 7, Keycloak 26). The existing `docker-compose.yaml` is replaced or renamed.
- `docker-compose.override.yml` for dev-time overrides.

### Shared project alignment
- Rename `Kombats.Infrastructure.Messaging` to `Kombats.Messaging` (under `src/Kombats.Common/`). Align project contents with target configuration (outbox/inbox, topology, retry, entity naming). Update all project references across the repo.
- Create `Kombats.Abstractions` project under `src/Kombats.Common/`. Initially empty or minimal — populated as service replacement work defines concrete needs.

### Contract review
- Review all existing contract projects: add `Version` fields where missing, remove non-contract types if present, verify compliance with contract rules.

### Test foundation
- Create `tests/` directory structure if it does not exist.
- Set up initial test project infrastructure (xUnit, FluentAssertions, NSubstitute, Testcontainers references in `Directory.Packages.props`).

**Coexistence notes:**
- Introducing `Directory.Packages.props` requires touching all existing `.csproj` files. This is mechanical. For services about to be fully replaced, the version-attribute cleanup can happen as part of the replacement instead.
- The unified `Kombats.sln` must include both legacy and new projects so the full repo builds from one solution.
- The `Kombats.Infrastructure.Messaging` → `Kombats.Messaging` rename requires updating all existing project references. This is a repo-wide mechanical change.

**Exit criteria:** `dotnet build` succeeds for the entire unified solution. `docker compose up` starts all infrastructure. `Kombats.Messaging` and `Kombats.Abstractions` compile. Legacy services still run. No behavior changes.

---

## Phase 1: Shared Infrastructure

**Goal:** Shared infrastructure that all replacement services depend on is built, tested, and ready for use. This phase extends and corrects existing shared code — it does not build from scratch where correct implementations already exist.

**Deliverables:**

### 1a: Shared Messaging Library (`Kombats.Messaging`)
- MassTransit 8.3.0 configuration with RabbitMQ transport
- EF Core transactional outbox configuration
- Inbox idempotency configuration
- Entity name formatting and topology conventions
- Consumer registration patterns
- Retry (5 attempts, 200ms–5000ms exponential) and redelivery (30s, 120s, 600s) configuration
- Consume logging filters
- Health check contribution (RabbitMQ)

The project was renamed from `Kombats.Infrastructure.Messaging` in Phase 0. If it already provides some of these capabilities correctly, verify and align rather than rewrite. Extend what is correct; replace what diverges from the target.

### 1b: Common Abstractions (`Kombats.Abstractions`)
- `Result<T>` / `Error` types if shared across services
- Base command/query handler interfaces if shared
- Only what is concretely needed by multiple services — do not speculate

### 1c: Shared Auth Configuration
- JWT Bearer configuration helper (Keycloak authority, audience, claim mapping)
- IdentityId extraction from JWT claims
- Reusable across all three services

### 1d: Contract Alignment
- Review and update all existing contract projects
- Ensure `PlayerCombatProfileChanged` carries Version field
- Ensure `CreateBattle` + `BattleParticipantSnapshot` are correct
- Ensure `BattleCreated`, `BattleCompleted` (with nullable winner/loser, TurnCount, DurationMs, RulesetVersion) are correct
- Ensure `MatchCreated`, `MatchCompleted` are correct
- Ensure `Kombats.Battle.Realtime.Contracts` (SignalR event names and client-facing types) are correct
- Add missing contracts, align existing contracts with the architecture

**Exit criteria:** Shared libraries compile and are tested. Contract projects compile with zero dependencies. A test demonstrates MassTransit configuration with outbox/inbox using the shared library. Legacy services are not broken.

---

## Phase 2: Players Replacement Stream

**Goal:** Replace the Players service implementation with target-architecture-compliant code inside the existing repository. The legacy Players code is removed after the replacement is verified.

**Sequence within phase:**

### 2a: Bootstrap + Domain Layer
- Create `Kombats.Players.Bootstrap` project (composition root, `Microsoft.NET.Sdk.Web`) alongside the existing `Kombats.Players.Api`.
- Evaluate the existing Domain layer. If it is structurally correct (right dependencies, clean business logic), clean it up in place. If it has structural problems (wrong dependencies, mixed concerns), replace its contents with target-compliant code.
- Change existing `Kombats.Players.Api` SDK to `Microsoft.NET.Sdk` (transport-only) — this happens when Bootstrap takes over as the composition root.
- Domain unit tests for all state transitions, allocation rules, progression math.

### 2b: Application Layer
- Rewrite Application layer contents to target architecture:
  - EnsureCharacter command (create or return existing)
  - SetName command
  - AllocateStats command (with concurrency)
  - GetCharacter query
  - Post-battle progression handler (XP award, win/loss, draw handling with 0 XP)
  - Combat profile publication trigger (outbox)
- Remove any legacy application patterns (MediatR usage, wrong dependency direction)
- Application unit tests for all handlers

### 2c: Infrastructure Layer
- Rewrite Infrastructure layer contents:
  - `PlayersDbContext` with `players` schema, snake_case, outbox/inbox tables
  - Character repository
  - EF Core entity configurations and migrations
  - `BattleCompletedConsumer` (awards XP, updates win/loss, publishes `PlayerCombatProfileChanged` via outbox)
- Remove `DependencyInjection.cs` / `ServiceCollectionExtensions` — composition moves to Bootstrap
- Remove references to `Kombats.Shared` — use `Kombats.Common` projects instead
- Infrastructure integration tests (real Postgres via Testcontainers, outbox atomicity, consumer idempotency)

### 2d: API Layer + Cutover
- Replace Controller endpoints with Minimal API endpoints in the Api project:
  - Endpoints: ensure character, set name, allocate stats, get character
  - JWT Bearer auth (Keycloak)
  - FluentValidation for input
  - OpenAPI + Scalar
  - Health checks (PostgreSQL, RabbitMQ)
- API tests (auth enforcement, validation, response contracts)
- **Cutover:** Bootstrap project becomes the service executable. All traffic routes through the new composition root.
- **Legacy removal:** Delete legacy `Program.cs` in Api, Controllers, legacy middleware, legacy `DependencyInjection.cs`. Delete `Kombats.Shared` if Players was the last consumer.

**Exit criteria:** Players service runs from Bootstrap, authenticates requests, performs full character lifecycle, publishes events via outbox, consumes `BattleCompleted`, all mandatory tests pass. No legacy Players code remains.

---

## Phase 3: Matchmaking Replacement Stream

**Goal:** Replace the Matchmaking service implementation with target-architecture-compliant code inside the existing repository. The legacy Matchmaking code is removed after the replacement is verified.

### 3a: Bootstrap + Domain Layer
- Create `Kombats.Matchmaking.Bootstrap` project alongside the existing Api.
- Evaluate and replace/clean Domain layer:
  - Match entity with full state machine (Queued → BattleCreateRequested → BattleCreated → Completed/TimedOut/Cancelled)
  - CAS guard correctness on all transitions
  - Timeout rules per state
- Change `Kombats.Matchmaking.Api` SDK to `Microsoft.NET.Sdk` when Bootstrap takes over.
- Domain unit tests for all state transitions.

### 3b: Application Layer
- Queue join (IsReady enforcement from projection, active match check)
- Queue leave
- Pairing logic (FIFO pop, level-based filtering, profile miss handling — return to queue head)
- Match creation orchestration (create match + send `CreateBattle` via outbox)
- Timeout workers: `BattleCreateRequestedTimeoutWorker` (60s), `BattleCreatedTimeoutWorker` (10min)
- Queue status queries
- Application unit tests

### 3c: Infrastructure Layer
- `MatchmakingDbContext` with `matchmaking` schema, outbox/inbox tables
- Match repository, player combat profile projection repository
- Redis queue operations (SADD+RPUSH atomic join, SREM+LREM leave, Lua pair-pop)
- Redis player status cache (set/get/clear with 30min TTL)
- Redis distributed lease (SET NX PX) for single-leader pairing tick
- `PlayerCombatProfileChangedConsumer` (upsert projection, revision-based newer-wins)
- `BattleCreatedConsumer` (CAS: BattleCreateRequested → BattleCreated)
- `BattleCompletedConsumer` (CAS: BattleCreated → Completed, conditional status clear)
- Remove legacy composition code from Infrastructure
- EF Core migrations
- Infrastructure integration tests (real Postgres, real Redis, Lua scripts, outbox, consumers)

### 3d: API Layer + Cutover
- Replace Controllers with Minimal API endpoints: join queue, leave queue, queue status, match status
- JWT Bearer auth, OpenAPI + Scalar, health checks (PostgreSQL, Redis, RabbitMQ)
- API tests
- **Cutover:** Bootstrap project becomes the service executable.
- **Legacy removal:** Delete legacy Controllers, `Program.cs` in Api, `DependencyInjection.cs`, legacy middleware.

**Exit criteria:** Matchmaking service runs from Bootstrap, manages queue lifecycle, pairs players, creates matches, sends `CreateBattle`, handles battle lifecycle events, all mandatory tests pass. No legacy Matchmaking code remains.

---

## Phase 4: Battle Replacement Stream

**Goal:** Replace the Battle service implementation with target-architecture-compliant code inside the existing repository. The legacy Battle code is removed after the replacement is verified.

### 4a: Bootstrap + Domain Layer
- Create `Kombats.Battle.Bootstrap` project alongside the existing Api.
- Evaluate the existing Domain layer carefully. The Battle Domain layer may be the most reusable part of the legacy code. Replace only what violates the target architecture.
  - BattleEngine (pure function: state in, result out)
  - CombatMath (damage formulas, HP from Vitality/Stamina mapping, dodge, crit)
  - Deterministic RNG (Xoshiro256** with splitmix64 seeding, per-battle seed, per-turn/per-direction streams)
  - Turn resolution logic
  - NoAction degradation
  - Inactivity termination (10 consecutive idle turns → both lose)
  - Ruleset abstraction (fist-only for v1, extensible)
- Change `Kombats.Battle.Api` SDK to `Microsoft.NET.Sdk` when Bootstrap takes over.
- Domain unit tests: full determinism suite, combat math, ruleset tests.

### 4b: Application Layer
- CreateBattle handler (Postgres record + Redis state init + turn 1 open + publish `BattleCreated`)
- SubmitAction handler (Redis SETNX first-write-wins, detect both submitted)
- ResolveTurn handler (CAS TurnOpen→Resolving, engine call, commit result, notify clients, detect terminal)
- CompleteBattle handler (write Postgres record, publish `BattleCompleted` via outbox, cleanup Redis)
- Deadline enforcement handler (turn timeout → NoAction degradation → resolve)
- Application unit tests

### 4c: Infrastructure Layer
- `BattleDbContext` with `battle` schema, outbox/inbox tables
- Battle record repository (completed battles)
- Redis battle state operations (Lua-scripted CAS transitions, SETNX for creation and actions)
- Redis deadline tracking
- Redis lock management
- `CreateBattleConsumer` (from Matchmaking command)
- `IBattleRealtimeNotifier` port + `SignalRBattleRealtimeNotifier` adapter
- Remove legacy composition code from Infrastructure
- EF Core migrations
- Infrastructure integration tests (real Postgres, real Redis, Lua scripts, CAS semantics, outbox)

### 4d: API Layer + Cutover
- SignalR `BattleHub` (thin adapter, JWT auth, no domain logic)
- Minimal API endpoints for battle status/history if needed
- JWT Bearer auth, OpenAPI + Scalar, health checks (PostgreSQL, Redis, RabbitMQ)
- API tests (SignalR hub auth, endpoint contracts)
- **Cutover:** Bootstrap project becomes the service executable.
- **Legacy removal:** Delete legacy Controllers, `DevSignalRAuthMiddleware`, legacy `Program.cs` in Api, `DependencyInjection.cs`.

**Exit criteria:** Battle service runs from Bootstrap, creates battles from commands, executes deterministic combat, communicates via SignalR, publishes completion events via outbox, all mandatory tests pass including full determinism suite. No legacy Battle code remains.

---

## Phase 5: Cross-Service Integration

**Goal:** The three replaced services work together as a system inside the same repository.

**Deliverables:**
- Verify end-to-end event flow: Players → Matchmaking → Battle → Matchmaking + Players
- Verify contract compatibility: all events serialize/deserialize correctly across service boundaries
- Verify outbox dispatch delivers events to the correct consumers
- Verify `CreateBattle` command (MassTransit `Send` within outbox) works end-to-end
- Contract serialization/deserialization tests for all integration events
- Fix any integration-level issues discovered

**Exit criteria:** Full gameplay loop works with all three services running: player onboards → queues → matches → battles → completes → receives XP → can re-queue.

---

## Phase 6: Legacy Cleanup and Verification

**Goal:** All legacy code is removed from the repository. All mandatory test coverage exists and passes. Release gates are met.

This phase catches any remaining legacy artifacts that were missed during individual service replacement phases and performs the full release verification.

**Deliverables:**

### Legacy removal
- All legacy Controllers deleted across all services
- All legacy composition code (`DependencyInjection.cs`, legacy `Program.cs` in Api) deleted
- `Kombats.Shared` project deleted from all locations (root, Players)
- Per-service `.sln` files deleted
- `Kombats.slnx` deleted
- Root-level `Kombats.Players/` and `Kombats.Shared/` deleted
- Legacy `infra/`, `scripts/`, `sql/`, `tools/` evaluated — operational items retained, obsolete items deleted
- No dead code, no orphan files, no legacy references remaining in the solution

### Test verification (release gates)
- Gate 1: All mandatory domain, application, infrastructure, and API tests pass
- Gate 2: Battle determinism suite passes
- Gate 3: Outbox atomicity verified per service
- Gate 4: Consumer idempotency verified per consumer
- Gate 5: Auth enforced on all endpoints and hubs
- Gate 6: Contract compatibility verified (solution builds, no serialization failures)
- Gate 7: Migrations forward-apply to empty database per service
- Gate 8: No test infrastructure in production assemblies

**Exit criteria:** All 8 release gates pass. CI pipeline green. No legacy code in the repository.

---

## Phase 7: Production-Readiness Hardening

**Goal:** Address production-specific concerns that are not required for functional completeness but are required before deployment.

**Deliverables:**
- Redis Sentinel configuration for production
- Health check endpoints (`/health/live`, `/health/ready`) with dependency probes on all services
- OpenTelemetry standardization across all services
- Serilog production sink configuration
- CI/CD migration runner (separate from application startup)
- Dockerfiles verified for production builds
- Connection pool limits per service on PostgreSQL
- Recovery mechanisms: stuck-in-Resolving watchdog, orphan sweep, timeout workers verified under failure conditions
- End-to-end topology smoke tests
- Performance baseline for critical paths (pairing throughput, turn resolution latency)

**Exit criteria:** System is deployable to a production-like environment with monitoring, health checks, and recovery mechanisms operational.

---

## Phase Dependencies

```
Phase 0 (Foundation alignment in current repo)
    │
    v
Phase 1 (Shared infrastructure)
    │
    ├──────────────┬──────────────┐
    v              v              v
Phase 2        Phase 3        Phase 4
(Players)    (Matchmaking)    (Battle)
    │              │              │
    └──────────────┴──────────────┘
                   │
                   v
            Phase 5 (Integration)
                   │
                   v
            Phase 6 (Legacy cleanup + verification)
                   │
                   v
            Phase 7 (Hardening)
```

Phases 2, 3, and 4 can run in parallel after Phase 1 completes. However, Phase 3 (Matchmaking) consumers depend on contract definitions from Phase 1, and Phase 5 requires all three services to be functional.

### Coexistence Windows

Each service replacement stream (Phases 2–4) has a bounded coexistence period where old and new code exist in the same repository:

- **Start of coexistence:** Bootstrap project created alongside existing Api.
- **During coexistence:** Legacy code continues to run. New code is built, tested, and verified alongside it. No mixed-pattern files — a single file must not contain both legacy and target patterns.
- **Cutover point:** Bootstrap takes over as the service executable. Traffic routes through the new composition root. Explicitly identified per service.
- **End of coexistence:** Legacy code for that service is deleted. Removal is mandatory, not optional.

Coexistence must not extend beyond the service's replacement phase. If Phase 2 is complete, there must be no legacy Players code remaining.

Phase 6 is the final sweep — it catches any remaining legacy artifacts that were missed during individual service replacement phases and performs the full release verification.

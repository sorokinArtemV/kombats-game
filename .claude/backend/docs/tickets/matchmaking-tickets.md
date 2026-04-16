# Matchmaking Service Tickets

Phase 3 tickets. Matchmaking has more complexity than Players: Redis queue/state, distributed lease, multiple consumers, timeout workers, and a Controller that must be replaced with Minimal APIs.

Current state: Matchmaking uses Controllers (must be replaced), has Redis operations, MassTransit consumers, background workers, and a domain layer. No Bootstrap project. No target test coverage.

---

## Domain Layer

---

# M-01: Replace Matchmaking Domain Layer

## Goal

Replace the Matchmaking domain layer with target-architecture-compliant Match entity, state machine, and domain rules. Also create the Matchmaking test project infrastructure.

## Scope

- Create Matchmaking test projects (following conventions from F-05):
  - `tests/Kombats.Matchmaking/Kombats.Matchmaking.Domain.Tests/`
  - `tests/Kombats.Matchmaking/Kombats.Matchmaking.Application.Tests/`
  - `tests/Kombats.Matchmaking/Kombats.Matchmaking.Infrastructure.Tests/`
  - `tests/Kombats.Matchmaking/Kombats.Matchmaking.Api.Tests/`
- Add all to `Kombats.sln`.
- Match entity with full state machine: `Queued → BattleCreateRequested → BattleCreated → Completed` (plus `TimedOut`, `Cancelled` terminal states).
- CAS guard correctness on all state transitions (revision/version-based optimistic concurrency).
- Timeout rules: `BattleCreateRequested` → 60s timeout, `BattleCreated` → 10min timeout.
- Match creation invariants: two distinct players, both with valid combat profiles.
- Domain unit tests for all transitions (valid and invalid).

## Out of Scope

- Queue logic (application layer).
- Persistence (infrastructure layer).
- Redis operations.

## Dependencies

F-05 (test infrastructure baseline — for conventions and package versions), F-08 (Kombats.Abstractions).

## Deliverables

- `Match` entity with state machine in `Kombats.Matchmaking.Domain`.
- `MatchState` enum with all states.
- Domain unit tests in `Kombats.Matchmaking.Domain.Tests`.

## Acceptance Criteria

- [ ] Match entity has complete state machine with all transitions
- [ ] Every valid transition tested and works
- [ ] Every invalid transition tested and rejected
- [ ] CAS guard (revision field) prevents stale updates
- [ ] Timeout rules encoded in domain (60s for BattleCreateRequested, 10min for BattleCreated)
- [ ] Match creation requires two distinct players with combat profiles
- [ ] All four Matchmaking test projects created and added to `Kombats.sln`
- [ ] Domain project has zero infrastructure NuGet references
- [ ] All domain unit tests pass

## Required Tests

- Unit test: each valid state transition (Queued→BattleCreateRequested, BattleCreateRequested→BattleCreated, BattleCreated→Completed, etc.).
- Unit test: each invalid transition rejected (e.g., Queued→Completed directly).
- Unit test: CAS guard rejects stale revision.
- Unit test: timeout thresholds per state.
- Unit test: match creation with same player twice rejected.

## Legacy Impact

Replaces existing domain layer. Old `Match` and `MatchState` superseded.

---

## Application Layer

---

# M-02: Matchmaking Application — Queue and Pairing Handlers

## Goal

Implement queue management and pairing logic in the application layer.

## Scope

- `JoinQueueCommand` + handler: validate player IsReady (from projection), check no active match, add to queue.
- `LeaveQueueCommand` + handler: remove from queue, clean up status.
- `PairPlayersCommand` + handler (called by pairing worker): FIFO pop, level-based filtering, profile miss handling (return to queue head), create Match + send `CreateBattle` command via outbox.
- `GetQueueStatusQuery` + handler: return current queue status for player.
- `GetMatchStatusQuery` + handler: return match state for player.
- Port interfaces: `IMatchQueueStore`, `IPlayerMatchStatusStore`, `IMatchRepository`, `IPlayerCombatProfileRepository`, `IOutboxWriter`.

## Out of Scope

- Redis implementation of queue/status stores (M-06, M-07).
- Timeout workers (M-03).
- Consumers (M-08, M-09, M-10).

## Dependencies

M-01 (domain), F-08 (Abstractions).

## Deliverables

- Command/query handlers in `Kombats.Matchmaking.Application`.
- Port interfaces.
- Application unit tests in `Kombats.Matchmaking.Application.Tests`.

## Acceptance Criteria

- [ ] JoinQueue validates player readiness and no active match
- [ ] LeaveQueue removes player from queue and clears status
- [ ] PairPlayers: FIFO pop, level filter, profile miss → return to head, creates match + sends CreateBattle
- [ ] GetQueueStatus returns player's queue position or not-in-queue
- [ ] GetMatchStatus returns current match state
- [ ] All handlers use port interfaces
- [ ] Application has no infrastructure references
- [ ] All unit tests pass with faked ports

## Required Tests

- JoinQueue: ready player joins, not-ready rejected, player already in match rejected, player already in queue rejected.
- LeaveQueue: player removed, player not in queue → no-op.
- PairPlayers: two players paired, level mismatch skipped, missing profile → return to queue head.
- GetQueueStatus: in queue, not in queue.
- GetMatchStatus: active match found, no match.

## Legacy Impact

Replaces existing `QueueService` and `MatchmakingService`. Superseded code removed in M-14.

---

# M-03: Matchmaking Application — Timeout Workers

## Goal

Implement timeout detection workers as application-layer background services.

## Scope

- `BattleCreateRequestedTimeoutWorker`: detect matches in `BattleCreateRequested` state older than 60s → transition to `TimedOut`, clean up.
- `BattleCreatedTimeoutWorker`: detect matches in `BattleCreated` state older than 10min → transition to `TimedOut`, clean up.
- Workers are application-level background services (registered in Bootstrap as hosted services).
- Use port interfaces for match queries and state transitions.

## Out of Scope

- Redis lease for pairing (M-07).
- Infrastructure persistence.

## Dependencies

M-01 (domain — timeout rules), M-02 (port interfaces).

## Deliverables

- Two timeout worker classes.
- Application unit tests.

## Acceptance Criteria

- [ ] BattleCreateRequestedTimeoutWorker detects and times out stale matches (60s)
- [ ] BattleCreatedTimeoutWorker detects and times out stale matches (10min)
- [ ] Workers use CAS state transitions (not raw update)
- [ ] Workers clean up player queue/match status on timeout
- [ ] Unit tests with faked ports verify timeout detection and transition

## Required Tests

- Unit test: match in BattleCreateRequested for >60s → timed out.
- Unit test: match in BattleCreateRequested for <60s → not timed out.
- Unit test: match in BattleCreated for >10min → timed out.
- Unit test: match in BattleCreated for <10min → not timed out.
- Unit test: CAS failure on stale match → worker retries or skips.

## Legacy Impact

Replaces existing `MatchTimeoutWorker`. May also replace `MatchmakingWorker` timeout logic.

---

## Infrastructure Layer — Persistence

---

# M-04: Replace Matchmaking DbContext and Persistence

## Goal

Align `MatchmakingDbContext` with target architecture.

## Scope

- `MatchmakingDbContext` with `matchmaking` schema, snake_case naming.
- Outbox/inbox table mappings for MassTransit.
- Match entity configuration with concurrency token (revision field).
- PlayerCombatProfile projection entity configuration.
- `EnableRetryOnFailure()`.
- No `Database.MigrateAsync()` on startup.
- EF Core migration.

## Out of Scope

- Repository implementations (M-05).
- Redis operations (M-06, M-07).

## Dependencies

M-01 (domain entities), F-07 (Kombats.Messaging for outbox support).

## Deliverables

- Aligned `MatchmakingDbContext`.
- Entity configurations.
- EF Core migration.
- Integration tests.

## Acceptance Criteria

- [ ] `MatchmakingDbContext` uses `matchmaking` schema
- [ ] Snake_case naming convention applied
- [ ] Outbox/inbox tables mapped
- [ ] Match entity config with revision-based concurrency token
- [ ] PlayerCombatProfile projection entity config
- [ ] `EnableRetryOnFailure()` on connection
- [ ] No `Database.MigrateAsync()` on startup
- [ ] Migration applies cleanly to empty database

## Required Tests

- Integration test (Testcontainers PostgreSQL): migration applies, Match round-trip.
- Integration test: PlayerCombatProfile round-trip.
- Integration test: snake_case column names verified.
- Integration test: outbox/inbox tables exist.

## Legacy Impact

Replaces existing `MatchmakingDbContext`. Old migrations may need reconciliation.

---

# M-05: Matchmaking Repository Implementations

## Goal

Implement Match and PlayerCombatProfile repositories.

## Scope

- `MatchRepository`: Create, GetById, GetByPlayerInState, Update (with CAS/concurrency).
- `PlayerCombatProfileRepository`: Upsert (revision-based newer-wins), GetByIdentityId, GetByIds.
- Uses `MatchmakingDbContext` directly.

## Out of Scope

- Redis operations.
- DbContext changes.

## Dependencies

M-02 (port interfaces), M-04 (DbContext).

## Deliverables

- Repository implementations in `Kombats.Matchmaking.Infrastructure`.
- Integration tests.

## Acceptance Criteria

- [ ] `MatchRepository` CRUD with concurrency check
- [ ] `PlayerCombatProfileRepository` upsert with revision-based newer-wins
- [ ] No generic repository wrapper
- [ ] Integration tests pass with real PostgreSQL

## Required Tests

- Integration test: Match create → get → update → verify state transition with concurrency.
- Integration test: Match concurrent update → concurrency exception.
- Integration test: PlayerCombatProfile upsert newer revision → updated. Older revision → rejected.
- Integration test: GetByPlayerInState filters correctly.

## Legacy Impact

Replaces existing repository implementations.

---

## Infrastructure Layer — Redis

---

# M-06: Matchmaking Redis Queue Operations

## Goal

Implement Redis queue operations for matchmaking: join, leave, pair-pop, and player status cache.

## Scope

- `RedisMatchQueueStore` implementing `IMatchQueueStore`:
  - Atomic join: `SADD` (member set) + `RPUSH` (FIFO queue).
  - Leave: `SREM` + `LREM`.
  - Lua pair-pop script: atomically pop two players from queue, verify both still in member set.
- `RedisPlayerMatchStatusStore` implementing `IPlayerMatchStatusStore`:
  - Set player status with 30min TTL.
  - Get player status.
  - Clear player status.
- All Redis operations target DB 1.

## Out of Scope

- Distributed lease (M-07).
- PostgreSQL persistence.

## Dependencies

M-02 (port interfaces), F-01 (StackExchange.Redis version in packages).

## Deliverables

- `RedisMatchQueueStore` with Lua scripts.
- `RedisPlayerMatchStatusStore` with TTL management.
- Integration tests.

## Acceptance Criteria

- [ ] Atomic join: player added to both set and queue
- [ ] Leave: player removed from both set and queue
- [ ] Lua pair-pop: atomically pops two, verifies membership, returns both or neither
- [ ] Player status: set with 30min TTL, get returns current, clear removes
- [ ] All operations target Redis DB 1
- [ ] Integration tests pass with real Redis

## Required Tests

- Integration test (Testcontainers Redis): join → verify in set and queue.
- Integration test: leave → verify removed from both.
- Integration test: pair-pop with ≥2 players → returns pair, removes from queue.
- Integration test: pair-pop with <2 players → returns nothing.
- Integration test: pair-pop with one player who left set → skip, not paired.
- Integration test: player status set → get → verify TTL → clear → get returns null.

## Legacy Impact

Replaces existing `RedisMatchQueueStore` and `RedisPlayerMatchStatusStore`.

---

# M-07: Matchmaking Redis Distributed Lease

## Goal

Implement Redis distributed lease for single-leader pairing tick.

## Scope

- `RedisLeaseLock`: `SET NX PX` (SETNX with expiry) for acquiring distributed lease.
- Lease renewal.
- Lease release.
- Single-leader guarantee: only one Matchmaking instance runs pairing at a time.
- Redis DB 1.

## Out of Scope

- Pairing logic (M-02).
- Queue operations (M-06).

## Dependencies

F-01 (package versions).

## Deliverables

- `RedisLeaseLock` or `MatchmakingLeaseService` implementation.
- Integration tests.

## Acceptance Criteria

- [ ] Lease acquired via `SET NX PX`
- [ ] Only one holder at a time
- [ ] Lease has configurable TTL
- [ ] Lease can be renewed by holder
- [ ] Lease can be released by holder
- [ ] Non-holder cannot release lease
- [ ] Integration tests pass with real Redis

## Required Tests

- Integration test (Testcontainers Redis): acquire lease → verify held.
- Integration test: second acquire attempt → fails.
- Integration test: lease expires → new acquire succeeds.
- Integration test: renew by holder → TTL extended.
- Integration test: release → new acquire succeeds.

## Legacy Impact

Replaces existing `RedisLeaseLock` / `MatchmakingLeaseService`.

---

## Infrastructure Layer — Consumers

---

# M-08: Matchmaking PlayerCombatProfileChanged Consumer

## Goal

Implement the consumer for `PlayerCombatProfileChanged` events from Players.

## Scope

- Consumer receives `PlayerCombatProfileChanged` from `Kombats.Players.Contracts`.
- Upserts player combat profile projection with revision-based newer-wins logic.
- Consumer is thin: deserialize → call handler → return.
- Inbox for idempotency.

## Out of Scope

- Queue operations.
- Match state changes.

## Dependencies

M-04 (DbContext), M-05 (profile repository), F-07 (Kombats.Messaging), F-09 (Players.Contracts).

## Deliverables

- `PlayerCombatProfileChangedConsumer`.
- Consumer tests.

## Acceptance Criteria

- [ ] Consumer upserts player combat profile projection
- [ ] Revision-based: newer revision wins, older revision is no-op
- [ ] Consumer is thin
- [ ] Inbox configured
- [ ] Tests pass

## Required Tests

- Behavior test: profile changed → projection updated.
- Behavior test: older revision → no update.
- Idempotency test: same message twice → no duplicate, no error.

## Legacy Impact

Replaces existing `PlayerCombatProfileChangedConsumer`.

---

# M-09: Matchmaking BattleCreated Consumer

## Goal

Implement the consumer for `BattleCreated` events from Battle.

## Scope

- Consumer receives `BattleCreated` from `Kombats.Battle.Contracts`.
- CAS state transition: `BattleCreateRequested → BattleCreated` on the Match entity.
- Stores BattleId on Match.
- Consumer is thin.
- Inbox for idempotency.

## Out of Scope

- Match creation.
- Queue operations.

## Dependencies

M-04 (DbContext), M-05 (match repository), F-07 (Kombats.Messaging), F-09 (Battle.Contracts).

## Deliverables

- `BattleCreatedConsumer`.
- Consumer tests.

## Acceptance Criteria

- [ ] Consumer transitions match from BattleCreateRequested → BattleCreated via CAS
- [ ] BattleId stored on Match
- [ ] CAS failure (wrong state) → logged, not crashed
- [ ] Consumer is thin
- [ ] Inbox configured
- [ ] Tests pass

## Required Tests

- Behavior test: BattleCreated → match state updated, BattleId stored.
- Behavior test: match already in BattleCreated or Completed → no-op.
- Idempotency test: same message twice → second is no-op.

## Legacy Impact

Replaces existing `BattleCreatedConsumer`.

---

# M-10: Matchmaking BattleCompleted Consumer

## Goal

Implement the consumer for `BattleCompleted` events from Battle.

## Scope

- Consumer receives `BattleCompleted` from `Kombats.Battle.Contracts`.
- CAS state transition: `BattleCreated → Completed` on the Match entity.
- Clear player match status in Redis (conditional: only if still pointing to this match).
- Consumer is thin.
- Inbox for idempotency.

## Out of Scope

- XP awards (handled by Players service).
- Queue operations.

## Dependencies

M-04 (DbContext), M-05 (match repository), M-06 (player status store), F-07 (Kombats.Messaging), F-09 (Battle.Contracts).

## Deliverables

- `BattleCompletedConsumer`.
- Consumer tests.

## Acceptance Criteria

- [ ] Consumer transitions match from BattleCreated → Completed via CAS
- [ ] Player match status cleared in Redis
- [ ] CAS failure (wrong state) → logged, not crashed
- [ ] Handles nullable WinnerIdentityId (draw case)
- [ ] Consumer is thin
- [ ] Inbox configured
- [ ] Tests pass

## Required Tests

- Behavior test: BattleCompleted with winner → match completed, status cleared.
- Behavior test: BattleCompleted with draw → match completed, status cleared.
- Behavior test: match already Completed → no-op.
- Idempotency test: same message twice → second is no-op.

## Legacy Impact

Replaces existing `BattleCompletedConsumer`.

---

## API and Bootstrap Layer

---

# M-11: Create Matchmaking Bootstrap Project

## Goal

Create `Kombats.Matchmaking.Bootstrap` as the composition root.

## Scope

- Create `Kombats.Matchmaking.Bootstrap` project with `Microsoft.NET.Sdk.Web`.
- `Program.cs` with full DI composition: DbContext, repositories, Redis stores, handlers, workers, MassTransit (via Kombats.Messaging), auth (JWT/Keycloak), health checks, OpenAPI/Scalar.
- Register all three consumers.
- Register timeout workers and pairing worker as hosted services.
- Register outbox dispatcher worker.
- Change `Kombats.Matchmaking.Api` SDK to `Microsoft.NET.Sdk`.
- `appsettings.json` and `appsettings.Development.json`.

## Out of Scope

- Endpoint implementation (M-12).

## Dependencies

All M-01 through M-10. F-07, F-08, F-11.

## Deliverables

- `Kombats.Matchmaking.Bootstrap` project.
- `Program.cs` with all composition.
- Configuration files.
- Api SDK changed.

## Acceptance Criteria

- [ ] `Kombats.Matchmaking.Bootstrap` project exists with `Microsoft.NET.Sdk.Web`
- [ ] `Kombats.Matchmaking.Api` SDK is `Microsoft.NET.Sdk`
- [ ] All DI registration in Bootstrap `Program.cs`
- [ ] No `DependencyInjection.cs` in Infrastructure
- [ ] MassTransit via Kombats.Messaging with all consumers registered
- [ ] Timeout workers registered as hosted services
- [ ] Pairing worker with lease registered
- [ ] JWT auth configured
- [ ] Health checks: PostgreSQL, Redis, RabbitMQ
- [ ] OpenAPI + Scalar configured
- [ ] Service starts from Bootstrap

## Required Tests

Smoke test: service starts, health check returns 200.

## Legacy Impact

Cutover required. Bootstrap replaces Api as the service executable.

---

# M-12: Replace Matchmaking API with Minimal Endpoints

## Goal

Replace the existing `QueueController` with Minimal API endpoints.

## Scope

- `POST /api/queue/join` — join matchmaking queue.
- `POST /api/queue/leave` — leave matchmaking queue.
- `GET /api/queue/status` — get queue status for current player.
- `GET /api/match/status` — get current match status for player.
- All endpoints `[Authorize]`.
- FluentValidation where applicable.
- OpenAPI metadata.
- Endpoint registration in Api project, called from Bootstrap.

## Out of Scope

- Bootstrap composition (M-11).
- Handler logic (M-02).

## Dependencies

M-02 (handlers), M-11 (Bootstrap).

## Deliverables

- Minimal API endpoints in `Kombats.Matchmaking.Api`.
- FluentValidation validators.
- API tests in `Kombats.Matchmaking.Api.Tests`.

## Acceptance Criteria

- [ ] All endpoints are thin Minimal APIs
- [ ] All endpoints have `[Authorize]`
- [ ] FluentValidation on inputs
- [ ] OpenAPI metadata
- [ ] No Controller classes
- [ ] API tests pass

## Required Tests

- Auth enforcement: valid JWT → 200, no JWT → 401, invalid JWT → 401.
- Join queue: valid request accepted, player not ready → rejected.
- Leave queue: valid request accepted.
- Queue status: returns correct response shape.
- Match status: returns correct response shape.

## Legacy Impact

Replaces `QueueController`. Controller deleted in M-13 or in this ticket if self-contained.

---

# M-13: Matchmaking Pairing Worker (Hosted Service)

## Goal

Implement the background pairing worker that runs as a hosted service, using the distributed lease.

## Scope

- `MatchmakingPairingWorker` as `BackgroundService`.
- Acquires distributed lease (M-07) before running pairing tick.
- On each tick: calls `PairPlayersCommand` handler.
- Configurable tick interval.
- Graceful shutdown.

## Out of Scope

- Pairing logic (M-02).
- Lease implementation (M-07).

## Dependencies

M-02 (pairing handler), M-07 (lease).

## Deliverables

- `MatchmakingPairingWorker` hosted service.
- Registered in Bootstrap.

## Acceptance Criteria

- [ ] Worker acquires lease before pairing
- [ ] Worker runs pairing tick on interval
- [ ] Worker gracefully handles lease loss
- [ ] Worker gracefully shuts down

## Required Tests

Unit test with faked lease and handler: worker acquires lease → calls handler, lease not acquired → skips.

## Legacy Impact

Replaces existing `MatchmakingWorker`.

---

# M-14: Matchmaking Legacy Removal and Cleanup

## Goal

Remove all superseded legacy code from the Matchmaking service.

## Scope

- Delete `QueueController` and `Controllers/` directory.
- Delete old `Program.cs` composition code in Api.
- Delete `DependencyInjection.cs` / `ServiceCollectionExtensions` in Infrastructure.
- Remove references to `Kombats.Shared` if any.
- Delete legacy middleware, DTOs, or patterns.
- Move Dockerfile from Api to Bootstrap.
- Delete any legacy worker implementations that were replaced.

## Out of Scope

- Changing new code behavior.

## Dependencies

M-11 (Bootstrap operational), M-12 (endpoints working). All Matchmaking replacement tickets verified.

## Deliverables

- No legacy Matchmaking code remaining.
- Solution builds. All tests pass.

## Acceptance Criteria

- [ ] No Controller classes in Matchmaking
- [ ] No legacy `Program.cs` composition in Api
- [ ] No `DependencyInjection.cs` in Infrastructure
- [ ] No `Kombats.Shared` references
- [ ] Dockerfile in Bootstrap
- [ ] Solution builds
- [ ] All Matchmaking tests pass

## Required Tests

Build verification. All existing tests pass.

## Legacy Impact

Legacy removal. Completes the Matchmaking replacement stream.

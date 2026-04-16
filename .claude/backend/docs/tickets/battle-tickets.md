# Battle Service Tickets

Phase 4 tickets. Battle is the most complex service: deterministic combat engine, RNG, Redis CAS state management, SignalR realtime, and strict correctness requirements.

Current state: Battle has a domain layer with BattleEngine, CombatMath, deterministic RNG, and state types. It uses Controllers (DevBattlesController — dev only), a SignalR hub, Redis state management, and MassTransit consumers. No Bootstrap project. No target test coverage.

The Battle domain may be the most reusable legacy code. Evaluate carefully before replacing.

---

## Domain Layer

---

# B-01: Evaluate and Align Battle Domain — Core Types

## Goal

Evaluate existing Battle domain types against the target architecture. Clean up or replace as needed. This ticket covers state types, enums, and value objects — not the engine or RNG. Also create the Battle test project infrastructure.

## Scope

- Create Battle test projects (following conventions from F-05):
  - `tests/Kombats.Battle/Kombats.Battle.Domain.Tests/`
  - `tests/Kombats.Battle/Kombats.Battle.Application.Tests/`
  - `tests/Kombats.Battle/Kombats.Battle.Infrastructure.Tests/`
  - `tests/Kombats.Battle/Kombats.Battle.Api.Tests/`
- Add all to `Kombats.sln`.
- Review and align: `BattleDomainState`, `PlayerState`, `PlayerStats`, `BattlePhase`, `PlayerAction`, `AttackOutcome`, `AttackResolution`, `TurnResolutionLog`, `EndBattleReason`, `BattleResolutionResult`.
- Ensure all types are pure domain — no infrastructure dependencies.
- Ensure `BattlePhase` enum covers the phases used by the existing engine.
- Ensure state types support deterministic serialization/deserialization for Redis persistence.
- Domain project references nothing (or only `Microsoft.Extensions.Logging.Abstractions`).

## Out of Scope

- BattleEngine logic (B-02).
- CombatMath formulas (B-03).
- Deterministic RNG (B-04).
- Ruleset (B-05).

## Dependencies

F-05 (test infrastructure baseline — for conventions and package versions), F-08 (Abstractions if needed).

## Deliverables

- Clean domain types in `Kombats.Battle.Domain`.
- Unit tests for type construction and invariants.

## Acceptance Criteria

- [ ] All domain state types are pure — no infrastructure references
- [ ] `BattleDomainState` captures complete battle state for any phase
- [ ] `PlayerState` includes HP, position, action queue, stats
- [ ] All enums have correct values
- [ ] Types support deterministic serialization
- [ ] All four Battle test projects created and added to `Kombats.sln`
- [ ] Domain project has zero infrastructure NuGet references
- [ ] Unit tests pass

## Required Tests

- Unit tests: type construction with valid/invalid inputs.
- Unit tests: BattleDomainState phase transitions.
- Unit tests: PlayerState HP boundaries (cannot go below 0).

## Legacy Impact

Evaluation-based. Clean existing types if structurally sound. Replace only what violates target.

---

# B-02: Evaluate and Align Battle Engine

## Goal

Evaluate and align the BattleEngine — the pure function that takes state + actions → produces resolution result.

## Scope

- `BattleEngine` or `IBattleEngine`: pure function, no side effects.
- Input: current `BattleDomainState` + player actions.
- Output: `BattleResolutionResult` (new state, resolution log, terminal detection).
- Turn resolution: both players' actions resolved, damage applied, HP updated.
- NoAction degradation: player who doesn't submit action takes penalty.
- Inactivity termination: 10 consecutive idle turns → both lose.
- Terminal detection: HP ≤ 0 → winner declared.
- Engine must be deterministic given same inputs + RNG state.

## Out of Scope

- CombatMath formulas (B-03).
- RNG implementation (B-04).
- Ruleset configuration (B-05).
- Infrastructure.

## Dependencies

B-01 (domain types), B-03 (CombatMath — may be developed in parallel), B-04 (RNG).

## Deliverables

- `BattleEngine` implementation in `Kombats.Battle.Domain`.
- Engine unit tests.

## Acceptance Criteria

- [ ] Engine is a pure function: same state + actions + RNG → same result
- [ ] Turn resolution handles both players' actions
- [ ] NoAction degradation applied when player doesn't submit
- [ ] Inactivity termination after 10 consecutive idle turns
- [ ] Terminal state detected (HP ≤ 0, inactivity)
- [ ] Engine does not access infrastructure
- [ ] Unit tests pass

## Required Tests

Full determinism test suite (AD-11):
- Same seed + actions + participants → same outcome.
- Same battle resolved twice → identical results per turn.
- A→B and B→A resolution order → same outcome (independent RNG streams).
- Resolution after simulated crash → same result (recovery safety).
- Multi-turn fixed sequence → same terminal state.
- NoAction degradation → deterministic fallback.
- 10 idle turns → deterministic terminal state.

## Legacy Impact

Evaluate existing `BattleEngine`. If structurally sound and deterministic, clean in place. If not, replace.

---

# B-03: Evaluate and Align CombatMath

## Goal

Evaluate and align CombatMath — the static calculation functions for combat resolution.

## Scope

- Evaluate existing `CombatMath` against the existing domain code. The existing implementation defines the formulas — this ticket verifies, tests, and aligns them, not redesigns them.
- Damage calculation from stats.
- HP derivation from Vitality/Stamina.
- Dodge and critical hit probability derivation from stats.
- `DerivedCombatStats`: computed combat-relevant values from base stats.
- Any other combat calculation functions present in the existing domain.
- All calculations must be deterministic (no non-deterministic floating point, no randomness outside RNG).

## Out of Scope

- Engine logic (B-02).
- RNG (B-04).
- Redesigning combat formulas — the existing formulas are authoritative unless they violate determinism or architecture.

## Dependencies

B-01 (domain types).

## Deliverables

- Verified and aligned `CombatMath` in `Kombats.Battle.Domain`.
- `DerivedCombatStats` computation.
- Unit tests for every formula covering edge cases.

## Acceptance Criteria

- [ ] All combat calculation functions produce correct values per the existing implementation
- [ ] Stat-to-combat-value derivations tested across stat ranges
- [ ] Edge cases tested: zero stats, max stats, equal stats
- [ ] All calculations deterministic
- [ ] No infrastructure dependencies
- [ ] Unit tests pass

## Required Tests

- Unit test: damage calculation at various stat values.
- Unit test: HP derivation at various Vitality values.
- Unit test: dodge/crit probability at various stat values.
- Unit test: edge cases — zero stats, maximum stats.
- Unit test: DerivedCombatStats computation from base stats.

## Legacy Impact

Evaluate existing `CombatMath`. Clean or replace as needed.

---

# B-04: Evaluate and Align Deterministic RNG

## Goal

Evaluate and align the existing deterministic RNG system. The architecture requires deterministic, seedable, per-battle RNG with independent per-turn/per-direction streams. The existing implementation (which uses Xoshiro256** with splitmix64 seeding) is authoritative for the algorithm choice — this ticket verifies correctness and tests it, not redesigns it.

## Scope

- Evaluate existing `DeterministicRandomProvider` / `DeterministicTurnRng` for correctness.
- Verify: per-battle seeding produces deterministic sequences.
- Verify: per-turn, per-direction RNG streams are independent (player A's stream does not affect player B's).
- Verify: seed generation via `ISeedGenerator` port.
- Document RNG consumption order if not already documented.
- Clean up if needed — no algorithm changes unless the existing implementation is broken.

## Out of Scope

- Engine logic using RNG (B-02).
- CombatMath (B-03).
- Changing the RNG algorithm unless the existing one is provably broken.

## Dependencies

B-01 (domain types).

## Deliverables

- Verified deterministic RNG implementation in `Kombats.Battle.Domain`.
- Seed generation port interface.
- RNG unit tests.
- Documented RNG consumption order.

## Acceptance Criteria

- [ ] Same seed → same sequence every time (core determinism)
- [ ] Per-turn streams are independent (changing one turn doesn't affect subsequent turns' RNG)
- [ ] Per-direction streams are independent (player A's RNG doesn't affect player B's)
- [ ] Seed generation port interface defined
- [ ] RNG consumption order documented
- [ ] No infrastructure dependencies
- [ ] Unit tests pass

## Required Tests

- Unit test: same seed → same sequence (100+ values).
- Unit test: different seeds → different sequences.
- Unit test: per-turn stream independence.
- Unit test: per-direction stream independence.
- Unit test: seeding produces expected initial state from known seed.

## Legacy Impact

Evaluate existing RNG. This is correctness-critical — verify thoroughly before reuse.

---

# B-05: Evaluate and Align Ruleset Abstraction

## Goal

Evaluate and align the Ruleset abstraction for configurable combat rules.

## Scope

- Evaluate the existing `Ruleset` type. Verify it captures the combat parameters the engine needs (whatever parameters CombatMath and BattleEngine currently consume).
- `IRulesetProvider` port for loading rulesets.
- Verify or define the default (fist-only, v1) ruleset using values from the existing implementation.
- Do not invent new configurable parameters. The ruleset should expose what the engine already uses.

## Out of Scope

- Engine logic (B-02).
- Multiple ruleset implementations beyond the current default.
- Adding new combat parameters not present in the existing code.

## Dependencies

B-01 (domain types).

## Deliverables

- Verified `Ruleset` type.
- `IRulesetProvider` port interface.
- Default v1 ruleset definition.
- Unit tests.

## Acceptance Criteria

- [ ] Ruleset type captures the combat parameters consumed by the existing engine and CombatMath
- [ ] Default v1 ruleset defined with values matching existing behavior
- [ ] IRulesetProvider port defined for loading rulesets
- [ ] Ruleset is immutable once loaded
- [ ] Unit tests verify default ruleset values

## Required Tests

- Unit test: default ruleset has expected parameter values (derived from existing code).
- Unit test: ruleset is immutable.

## Legacy Impact

Evaluate existing `Ruleset`. Clean or replace.

---

## Application Layer

---

# B-06: Battle Application — CreateBattle and CompleteBattle Handlers

## Goal

Implement the handlers for battle lifecycle boundaries: creation and completion.

## Scope

- `CreateBattleCommand` + handler: create Postgres battle record, init Redis battle state, open turn 1, publish `BattleCreated` via outbox.
- `CompleteBattleCommand` + handler: write completed battle record to Postgres, publish `BattleCompleted` via outbox, cleanup Redis state.
- Port interfaces: `IBattleRecordRepository`, `IBattleStateStore`, `IBattleRealtimeNotifier`, `IBattleEventPublisher`.

## Out of Scope

- Turn submission/resolution (B-07).
- Deadline enforcement (B-08).
- Consumer implementation.

## Dependencies

B-01 (domain types), B-05 (ruleset), F-08 (Abstractions).

## Deliverables

- CreateBattle and CompleteBattle handlers.
- Port interfaces.
- Application unit tests.

## Acceptance Criteria

- [ ] CreateBattle: creates Postgres record + Redis state + opens turn 1 + publishes BattleCreated
- [ ] CompleteBattle: writes Postgres record + publishes BattleCompleted via outbox + cleans Redis
- [ ] BattleCompleted includes nullable winner/loser, TurnCount, DurationMs, RulesetVersion
- [ ] All handlers use port interfaces
- [ ] Unit tests pass with faked ports

## Required Tests

- CreateBattle: battle record created, Redis state initialized, turn 1 opened, BattleCreated published.
- CompleteBattle: Postgres written, BattleCompleted published with correct fields, Redis cleaned.
- CompleteBattle: draw case — null winner/loser.

## Legacy Impact

Replaces existing `BattleLifecycleAppService`.

---

# B-07: Battle Application — SubmitAction and ResolveTurn Handlers

## Goal

Implement action submission and turn resolution handlers.

## Scope

- `SubmitActionCommand` + handler: validate action, Redis SETNX first-write-wins, detect both players submitted → trigger resolution.
- `ResolveTurnCommand` + handler: CAS TurnOpen→Resolving, call BattleEngine, commit result to Redis, notify clients via realtime port, detect terminal state → trigger CompleteBattle.
- Action validation and normalization.

## Out of Scope

- BattleEngine implementation (B-02).
- Redis implementation (B-11).
- Deadline enforcement (B-08).

## Dependencies

B-02 (engine), B-06 (port interfaces).

## Deliverables

- SubmitAction and ResolveTurn handlers.
- Application unit tests.

## Acceptance Criteria

- [ ] SubmitAction validates action type and parameters
- [ ] SubmitAction uses SETNX semantics (first write wins)
- [ ] SubmitAction detects both players submitted → triggers resolution
- [ ] ResolveTurn uses CAS (TurnOpen→Resolving)
- [ ] ResolveTurn calls engine with current state + actions
- [ ] ResolveTurn commits result, notifies clients
- [ ] ResolveTurn detects terminal → triggers CompleteBattle
- [ ] Unit tests pass

## Required Tests

- SubmitAction: first player submits → stored. Second player submits → stored + resolution triggered.
- SubmitAction: same player submits twice → second rejected.
- SubmitAction: invalid action type → rejected.
- ResolveTurn: successful resolution → new state committed, clients notified.
- ResolveTurn: terminal state detected → CompleteBattle triggered.
- ResolveTurn: CAS failure (already resolving) → no-op.

## Legacy Impact

Replaces existing `BattleTurnAppService` and `ActionIntakeService`.

---

# B-08: Battle Application — Deadline Enforcement Handler

## Goal

Implement turn deadline enforcement as a background process.

## Scope

- `DeadlineEnforcementWorker`: monitors turn deadlines in Redis.
- When turn deadline expires: substitute NoAction for non-submitting player(s), trigger resolution.
- Configurable deadline duration from Ruleset.

## Out of Scope

- Resolution logic (B-07).
- Redis implementation.

## Dependencies

B-07 (resolution handler), B-05 (ruleset for deadline config).

## Deliverables

- `DeadlineEnforcementWorker` or equivalent handler.
- Application unit tests.

## Acceptance Criteria

- [ ] Deadline expiry triggers NoAction substitution
- [ ] Resolution triggered after NoAction applied
- [ ] Both players missing → both get NoAction
- [ ] One player missing → only that player gets NoAction
- [ ] Unit tests with faked ports

## Required Tests

- Unit test: deadline expired, one player submitted → NoAction for other, resolve triggered.
- Unit test: deadline expired, neither submitted → NoAction for both.
- Unit test: deadline not expired → no action taken.

## Legacy Impact

Replaces or aligns with existing deadline enforcement logic.

---

## Infrastructure Layer — Persistence

---

# B-09: Replace Battle DbContext and Persistence

## Goal

Align `BattleDbContext` with target architecture.

## Scope

- `BattleDbContext` with `battle` schema, snake_case naming.
- Outbox/inbox table mappings.
- Completed battle record entity configuration.
- `EnableRetryOnFailure()`.
- No `Database.MigrateAsync()` on startup.
- EF Core migration.

## Out of Scope

- Redis state operations (B-11).
- Repository implementation (B-10).

## Dependencies

B-01 (domain types), F-07 (Kombats.Messaging for outbox).

## Deliverables

- Aligned `BattleDbContext`.
- Entity configurations.
- Migration.
- Integration tests.

## Acceptance Criteria

- [ ] `BattleDbContext` uses `battle` schema
- [ ] Snake_case naming applied
- [ ] Outbox/inbox tables mapped
- [ ] Completed battle record entity config correct
- [ ] `EnableRetryOnFailure()` on connection
- [ ] No `Database.MigrateAsync()` on startup
- [ ] Migration applies cleanly

## Required Tests

- Integration test (Testcontainers PostgreSQL): migration applies, battle record round-trip.
- Integration test: snake_case column names.
- Integration test: outbox/inbox tables exist.

## Legacy Impact

Replaces existing `BattleDbContext`. Old migrations may need reconciliation.

---

# B-10: Battle Record Repository Implementation

## Goal

Implement the repository for completed battle records (Postgres).

## Scope

- `BattleRecordRepository` implementing `IBattleRecordRepository`.
- Operations: Create (save completed battle), GetById, GetByPlayerId (history).
- Uses `BattleDbContext` directly.

## Out of Scope

- Redis state (B-11).
- DbContext changes (B-09).

## Dependencies

B-06 (port interface), B-09 (DbContext).

## Deliverables

- `BattleRecordRepository` implementation.
- Integration tests.

## Acceptance Criteria

- [ ] Repository implements port interface
- [ ] Create persists completed battle record
- [ ] GetById retrieves by battle ID
- [ ] GetByPlayerId retrieves history
- [ ] No generic repository wrapper
- [ ] Integration tests pass

## Required Tests

- Integration test: create battle record → get by ID → verify all fields.
- Integration test: get by player ID → returns player's battles.

## Legacy Impact

Replaces existing battle persistence code.

---

## Infrastructure Layer — Redis

---

# B-11: Battle Redis State Operations

## Goal

Implement Redis battle state operations: creation, retrieval, CAS transitions, action storage, cleanup.

## Scope

- `RedisBattleStateStore` implementing `IBattleStateStore`:
  - `SETNX` battle state creation (ensures uniqueness).
  - Get current battle state.
  - CAS state transitions (Lua-scripted: read version → update → write only if version matches).
  - Action storage: `SETNX` per player per turn (first-write-wins).
  - Detect both actions submitted.
  - Cleanup: delete all keys for a battle.
- All operations use Redis DB 0.
- All CAS operations use Lua scripts for atomicity.

## Out of Scope

- Deadline tracking (B-12).
- Postgres persistence.

## Dependencies

B-06 (port interfaces), F-01 (Redis package version).

## Deliverables

- `RedisBattleStateStore` with Lua scripts.
- Integration tests.

## Acceptance Criteria

- [ ] Battle state created via SETNX (no overwrite)
- [ ] Get state returns deserialized battle state
- [ ] CAS transitions: update only if version matches, reject stale
- [ ] Action SETNX: first write wins, second rejected
- [ ] Both-submitted detection works
- [ ] Cleanup removes all battle keys
- [ ] All operations on Redis DB 0
- [ ] Lua scripts used for all CAS operations
- [ ] Integration tests pass with real Redis

## Required Tests

- Integration test (Testcontainers Redis): create state → get → verify.
- Integration test: CAS update with correct version → success.
- Integration test: CAS update with wrong version → failure.
- Integration test: action SETNX first player → stored. Second player → stored. Same player again → rejected.
- Integration test: both-submitted detection.
- Integration test: cleanup → all keys removed.

## Legacy Impact

Replaces existing Redis state operations.

---

# B-12: Battle Redis Deadline Tracking

## Goal

Implement Redis deadline tracking for turn timeouts.

## Scope

- Set turn deadline with TTL in Redis.
- Check if deadline expired.
- Clear deadline on turn resolution.
- Support deadline enforcement worker polling.

## Out of Scope

- Deadline enforcement logic (B-08).
- Battle state operations (B-11).

## Dependencies

B-06 (port interfaces).

## Deliverables

- Deadline tracking Redis operations.
- Integration tests.

## Acceptance Criteria

- [ ] Turn deadline set with configurable TTL
- [ ] Expired deadline detectable
- [ ] Deadline cleared on resolution
- [ ] Integration tests pass with real Redis

## Required Tests

- Integration test: set deadline → check not expired → wait/TTL → check expired.
- Integration test: clear deadline → check returns no deadline.

## Legacy Impact

Replaces or aligns existing deadline tracking.

---

## Infrastructure Layer — Consumers and Realtime

---

# B-13: Battle CreateBattle Consumer

## Goal

Implement the consumer for `CreateBattle` commands from Matchmaking.

## Scope

- Consumer receives `CreateBattle` command from `Kombats.Matchmaking` (via MassTransit `Send`).
- Calls `CreateBattleCommand` handler.
- Consumer is thin.
- Inbox for idempotency.

## Out of Scope

- Handler logic (B-06).
- Other consumers.

## Dependencies

B-06 (handler), B-09 (DbContext with outbox/inbox), F-07 (Kombats.Messaging), F-09 (Battle.Contracts).

## Deliverables

- `CreateBattleConsumer`.
- Consumer tests.

## Acceptance Criteria

- [ ] Consumer calls CreateBattle handler
- [ ] Consumer is thin
- [ ] Inbox configured
- [ ] Handles duplicate CreateBattle commands (same BattleId)
- [ ] Tests pass

## Required Tests

- Behavior test: CreateBattle command → battle created, BattleCreated published.
- Idempotency test: same command twice → second is no-op.
- Edge case: invalid participant data → logged, not crashed.

## Legacy Impact

Replaces existing `CreateBattleConsumer`.

---

# B-14: Battle SignalR Realtime Notifier

## Goal

Implement the `IBattleRealtimeNotifier` port adapter using SignalR.

## Scope

- `SignalRBattleRealtimeNotifier` implementing `IBattleRealtimeNotifier`.
- Sends events to connected clients via `BattleHub`:
  - `BattleReady`, `BattleStateUpdated`, `TurnOpened`, `TurnResolved`, `PlayerDamaged`, `BattleEnded`.
- Uses event names from `Kombats.Battle.Realtime.Contracts`.
- No domain logic in the notifier — pure translation from domain events to SignalR messages.

## Out of Scope

- `BattleHub` implementation (B-15).
- Client connection management.

## Dependencies

B-06 (port interface), B-01 (domain types), F-09 (Realtime.Contracts).

## Deliverables

- `SignalRBattleRealtimeNotifier` adapter.
- Unit tests (mock SignalR hub context).

## Acceptance Criteria

- [ ] Notifier translates domain events to SignalR messages
- [ ] Uses correct event names from Realtime.Contracts
- [ ] No domain logic in notifier
- [ ] All realtime event types covered
- [ ] Unit tests verify correct SignalR calls

## Required Tests

- Unit test: each event type → correct SignalR method called with correct payload shape.

## Legacy Impact

Replaces or aligns existing SignalR notification code.

---

# B-15: Battle SignalR Hub and API Endpoints

## Goal

Implement the BattleHub (SignalR) and any Minimal API endpoints for Battle.

## Scope

- `BattleHub` (SignalR): thin adapter, JWT auth required, client methods for submitting actions, requesting snapshots.
- Hub is thin: receive client message → call handler → return.
- No `DevSignalRAuthMiddleware` — JWT auth only.
- Minimal API endpoints (if needed): battle status, battle history.
- All endpoints `[Authorize]`.
- Endpoint registration in Api project.

## Out of Scope

- Bootstrap composition (B-16).
- Handler logic.

## Dependencies

B-07 (action handler), B-14 (notifier).

## Deliverables

- `BattleHub` in Api project.
- Minimal API endpoints (if applicable).
- API tests.

## Acceptance Criteria

- [ ] BattleHub requires JWT authentication
- [ ] No `DevSignalRAuthMiddleware`
- [ ] Hub is thin — no domain logic
- [ ] Client can submit actions via hub
- [ ] Client receives realtime events
- [ ] Any REST endpoints are Minimal APIs with `[Authorize]`
- [ ] API tests pass

## Required Tests

- SignalR hub auth: valid JWT → connection accepted, no JWT → rejected.
- Auth enforcement on REST endpoints: valid JWT → 200, no JWT → 401.
- Hub method test: submit action → handler called.

## Legacy Impact

Replaces existing `DevBattlesController` and aligns `BattleHub`. `DevSignalRAuthMiddleware` removed.

---

## Bootstrap and Cutover

---

# B-16: Create Battle Bootstrap Project

## Goal

Create `Kombats.Battle.Bootstrap` as the composition root.

## Scope

- Create `Kombats.Battle.Bootstrap` project with `Microsoft.NET.Sdk.Web`.
- `Program.cs` with full DI composition: DbContext, repositories, Redis stores, handlers, workers, MassTransit (via Kombats.Messaging), SignalR, auth, health checks, OpenAPI/Scalar.
- Register `CreateBattleConsumer`.
- Register deadline enforcement worker.
- Change `Kombats.Battle.Api` SDK to `Microsoft.NET.Sdk`.
- `appsettings.json` and `appsettings.Development.json`.

## Out of Scope

- Endpoint/hub implementations (B-15).

## Dependencies

All B-01 through B-15. F-07, F-08, F-11.

## Deliverables

- `Kombats.Battle.Bootstrap` project.
- `Program.cs` with all composition.
- Configuration files.
- Api SDK changed.

## Acceptance Criteria

- [ ] `Kombats.Battle.Bootstrap` project exists with `Microsoft.NET.Sdk.Web`
- [ ] `Kombats.Battle.Api` SDK is `Microsoft.NET.Sdk`
- [ ] All DI registration in Bootstrap
- [ ] No `DependencyInjection.cs` in Infrastructure
- [ ] MassTransit via Kombats.Messaging
- [ ] SignalR configured with JWT auth
- [ ] Health checks: PostgreSQL, Redis, RabbitMQ
- [ ] Deadline enforcement worker registered
- [ ] Service starts from Bootstrap

## Required Tests

Smoke test: service starts, health check returns 200, SignalR hub accessible.

## Legacy Impact

Cutover required. Bootstrap replaces Api as service executable.

---

# B-17: Battle Legacy Removal and Cleanup

## Goal

Remove all superseded legacy code from the Battle service.

## Scope

- Delete `DevBattlesController`.
- Delete `DevSignalRAuthMiddleware`.
- Delete old `Program.cs` composition code in Api.
- Delete `DependencyInjection.cs` / configuration helpers in Infrastructure.
- Remove legacy middleware.
- Move Dockerfile from Api to Bootstrap.
- Delete orphan files.

## Out of Scope

- Changing new code behavior.

## Dependencies

B-16 (Bootstrap operational), B-15 (hub/endpoints working). All Battle replacement tickets verified.

## Deliverables

- No legacy Battle code remaining.
- Solution builds. All tests pass.

## Acceptance Criteria

- [ ] No Controller classes in Battle
- [ ] No `DevSignalRAuthMiddleware`
- [ ] No legacy `Program.cs` composition in Api
- [ ] No `DependencyInjection.cs` in Infrastructure
- [ ] Dockerfile in Bootstrap
- [ ] Solution builds
- [ ] All Battle tests pass (including full determinism suite)

## Required Tests

Build verification. All tests pass.

## Legacy Impact

Legacy removal. Completes the Battle replacement stream.

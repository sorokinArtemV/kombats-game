# Kombats Test Strategy

## 1. Purpose and Scope

This document defines the normative testing standard for the Kombats backend. It specifies what must be tested, at what layer, and to what standard before implementation work is considered complete. It is a delivery-readiness document, not a framework tutorial.

The scope covers the three in-scope services — Players, Matchmaking, and Battle — and the shared messaging library (`Kombats.Messaging`). It does not cover BFF, frontend, or infrastructure provisioning.

This strategy is grounded in the architecture package:
- `kombats-system-architecture.md` — system structure, service responsibilities, integration model, identified risks
- `kombats-architecture-decisions.md` — AD-01 through AD-13
- `kombats-technology-and-package-baseline.md` — approved stack, constraints, open questions

The test strategy assumes the next implementation phase follows the architecture package. Tests validate the target architecture, not the current codebase shape.

---

## 2. Testing Principles

**Tests are delivery gates, not afterthoughts.** A feature or task is not complete until its required tests pass. Test coverage is not aspirational — it is part of the definition of done.

**Test the behavior, not the structure.** Tests validate what the system does, not how files are organized. A refactor that preserves behavior must not break tests. A behavior change must break at least one test.

**Real infrastructure over mocks for integration tests.** Domain and application unit tests use no infrastructure. Infrastructure and integration tests use real PostgreSQL, Redis, and MassTransit test harness. Mocking infrastructure in integration tests is explicitly disallowed — it masks the exact class of bugs that matter in this system (outbox behavior, CAS transitions, Lua script correctness, consumer idempotency).

**Deterministic combat is a correctness property, not a nice-to-have.** Battle engine tests are mandatory and must prove determinism under replay, recovery, and concurrent resolution scenarios. This is derived from AD-11.

**Each service is tested within its own boundary.** Cross-service behavior is validated through contract tests and, optionally, end-to-end topology tests. No test should require multiple services to be running simultaneously except explicit topology tests.

**Test naming and location follow the project structure.** Tests live in dedicated test projects adjacent to the code they test. No test code in production assemblies.

**Testing rigor must follow architectural risk.** The highest-priority tests are those that protect:
- deterministic combat correctness;
- event publication and consumption correctness;
- Redis state-transition correctness;
- player lockout and recovery safety.

Lower-risk areas should still be tested, but they must not displace coverage of correctness-critical flows.

### Classification of Test Obligations

This strategy uses three levels of obligation:

- **Mandatory for initial implementation completion** — required before a service or feature is considered implemented.
- **Mandatory before production readiness** — not required for the first implementation slice, but required before production deployment.
- **Recommended / Deferred** — valuable but not required yet.

Unless a section states otherwise, "mandatory" means mandatory for initial implementation completion.
Where a test area is required only before production readiness, that is stated explicitly.

---

## 3. Test Layers and Their Responsibilities

### 3.1 Domain Unit Tests

**Scope:** Domain entities, value objects, aggregates, state machines, domain services, and pure functions.

**Mandatory for initial implementation completion:**
- Players: Character aggregate (onboarding state machine, stat allocation rules, level-up, XP award, IsReady derivation, win/loss tracking, concurrency token behavior)
- Matchmaking: Match entity (state machine transitions, CAS guard correctness, timeout rules, all terminal and non-terminal states)
- Battle: BattleEngine (combat resolution, damage calculation, dodge/crit, HP changes, turn resolution, terminal state detection, NoAction degradation, inactivity termination after 10 consecutive idle turns, draw semantics)

**Requirements:**
- Zero infrastructure dependencies. Domain test projects must not reference EF Core, Redis, MassTransit, or ASP.NET Core.
- Tests must exercise every valid state transition and every invalid transition that should be rejected.
- For Battle, domain tests overlap with Section 4 (determinism) — both apply.

### 3.2 Application Unit Tests

**Scope:** Use-case handlers, orchestration logic, command/query handlers, application services.

**Mandatory for initial implementation completion:**
- Players: Stat allocation handler (points validation, concurrency), post-battle progression handler (XP award, win/loss, draw handling with null winner/loser), combat profile publication trigger
- Matchmaking: Queue join (IsReady enforcement, active match check), pairing logic (FIFO pop, level-based filtering, profile miss handling — return to queue head), match creation orchestration, timeout workers
- Battle: CreateBattle handler (state initialization, Redis setup, turn 1 open), turn resolution handler (action intake, validation, resolution trigger, terminal state handling), deadline enforcement handler

**Requirements:**
- Infrastructure ports are stubbed or faked (repository interfaces, messaging abstractions, Redis abstractions).
- Application tests verify orchestration correctness: the right calls happen in the right order with the right data.
- Application tests do not verify database queries, message serialization, or Redis Lua scripts — those belong to infrastructure tests.

### 3.3 Infrastructure Integration Tests

**Scope:** Repositories, DbContext configuration, Redis operations, messaging wiring, outbox/inbox behavior.

Infrastructure integration tests are mandatory for the infrastructure that carries correctness-critical behavior.

**Mandatory for initial implementation completion:**
- all EF Core persistence mappings that back domain/application correctness;
- all Redis state transitions, CAS semantics, Lua scripts, and lease logic in Matchmaking and Battle;
- all outbox/inbox and consumer idempotency behavior.

**Mandatory before production readiness:**
- broader repository/query-path coverage;
- additional operational infrastructure verification beyond correctness-critical flows.

**Requirements:**
- Use real PostgreSQL and Redis instances (Testcontainers or shared docker-compose).
- Do not mock `DbContext`, `IDatabase`, or `IPublishEndpoint` in infrastructure tests.

### 3.4 API Tests

**Scope:** HTTP endpoint behavior, auth enforcement, input validation, response shape.

API tests are mandatory for:
- authentication and authorization enforcement;
- input validation on write endpoints;
- externally significant response contracts.

**Mandatory for initial implementation completion:**
- All services: JWT validation rejects unauthenticated requests, IdentityId extraction works, `[Authorize]` is enforced on every endpoint
- Players: Endpoint request/response contracts, FluentValidation behavior on invalid input
- Matchmaking: Queue endpoints, match status endpoints
- Battle: SignalR hub connection auth (JWT, not dev bypass)

**Requirements:**
- Use `WebApplicationFactory<T>` or equivalent for in-process HTTP testing.
- Auth tests must verify both the positive case (valid JWT accepted) and the negative case (missing/invalid JWT rejected with 401).

**Production-readiness note:** Full endpoint-by-endpoint API coverage is a production-readiness goal, not a requirement for the first implementation slice.

---

## 4. Battle Determinism and Combat Correctness Tests

This section is the highest-priority testing concern unique to Kombats. It is derived from AD-11 and D-10.

### 4.1 Mandatory Determinism Tests

Every test in this category must prove that identical inputs produce identical outputs, regardless of timing, retry, or execution context.

**Required test cases:**

| Test | What It Proves |
|---|---|
| Same seed + same actions + same participants → same outcome | Core determinism property |
| Same battle resolved twice → identical HP, damage, dodge, crit results per turn | Retry safety |
| A→B and B→A resolution order does not affect outcome | Independent RNG stream per attack direction (AD-11) |
| Turn resolution after simulated crash recovery produces same result | Recovery safety |
| Multi-turn battle with fixed action sequence → same terminal state and turn count | Full-sequence determinism |
| NoAction degradation produces deterministic fallback result | Degraded path determinism |
| Draw via 10 consecutive idle turns → deterministic terminal state | Inactivity termination determinism |

**Requirements:**
- Tests must use known seeds, known participant stats, and known action sequences.
- Tests must run the engine function directly (no Redis, no SignalR, no MassTransit).
- Tests must assert on combat-relevant outputs: HP changes, damage dealt, dodge/crit results, terminal state, winner/loser. They must NOT assert on wall-clock timestamps or other observational metadata.
- Any future change to RNG derivation, consumption order, combat arithmetic, or turn sequencing must break at least one determinism test. If it doesn't, the test suite has a gap.

### 4.2 Combat Math Tests

**Mandatory for initial implementation completion:**
- Damage formula produces expected output for known stat combinations
- HP calculation from Vitality (mapped to Stamina internally) is correct
- Dodge probability is within expected bounds for known Agility/Intuition values
- Critical hit probability is within expected bounds
- Edge cases: zero stats, maximum stats, minimum-level characters, maximum-level characters

### 4.3 Ruleset Tests

**Mandatory for initial implementation completion:**
- Default ruleset (fist-only combat) produces valid results
- Ruleset version is carried through battle lifecycle

**Mandatory before production readiness when weapon-based combat is introduced:**
- a second ruleset must have its own determinism and correctness test suite

### Classification

All tests in Section 4 are **mandatory for initial implementation completion**. There are no optional determinism tests. If the battle engine changes, these tests must be updated to reflect the new expected behavior — they must never be deleted or skipped.

---

## 5. Messaging, Outbox, Inbox, and Idempotency Tests

### 5.1 Outbox Tests

The MassTransit EF Core transactional outbox is the standard publication mechanism for all services (AD-01). Outbox correctness is a critical system property — event loss is the highest-severity production risk (RISK-S1).

**Mandatory for initial implementation completion per service:**

| Test | What It Proves |
|---|---|
| Domain write + event publish within a single transaction → event appears in outbox table | Atomicity |
| Transaction rollback → no event in outbox | Rollback safety |
| Outbox dispatcher delivers event to broker after commit | Delivery path correctness |
| Duplicate outbox dispatch → consumer receives once (inbox dedup) | End-to-end idempotent delivery |

**Matchmaking-specific mandatory test:**
- `CreateBattle` command sent via `ISendEndpoint.Send()` within outbox transaction → command delivered to Battle's queue. This validates the AD-01 prerequisite (MassTransit `Send` within outbox).

**Requirements:**
- Tests use real PostgreSQL (outbox tables are EF Core managed) and either MassTransit test harness or real RabbitMQ, depending on the testing decision adopted later.
- Do not mock the outbox. The entire point is to verify that the framework outbox behaves correctly with the service's DbContext and transaction boundaries.

### 5.2 Inbox / Consumer Idempotency Tests

**Mandatory for initial implementation completion per consumer:**

| Consumer | Service | Required Test |
|---|---|---|
| `PlayerCombatProfileChangedConsumer` | Matchmaking | Duplicate message → projection upserted once, no error |
| `BattleCreatedConsumer` | Matchmaking | Duplicate message → CAS transition happens once, second is no-op |
| `BattleCompletedConsumer` | Matchmaking | Duplicate message → match transitions once, status cleared once |
| `BattleCompletedConsumer` | Players | Duplicate message → XP awarded once, win/loss updated once |
| `CreateBattleConsumer` | Battle | Duplicate command → battle created once (SETNX on Redis guards this) |

**Requirements:**
- Each consumer test sends the same message twice with the same `MessageId`.
- The second delivery must be a no-op (no duplicate side effects, no exceptions).
- Tests use MassTransit test harness with inbox enabled, or equivalent real transport validation if that path is chosen.

### 5.3 Consumer Behavior Tests

Beyond idempotency, each consumer must be tested for its core behavior.

**Mandatory for initial implementation completion:**
- **Matchmaking `PlayerCombatProfileChangedConsumer`:** upserts projection correctly, handles first-time insert and subsequent update, tolerates out-of-order delivery (Revision-based, newer wins)
- **Matchmaking `BattleCreatedConsumer`:** CAS from BattleCreateRequested → BattleCreated, rejects if match is in wrong state
- **Matchmaking `BattleCompletedConsumer`:** CAS from BattleCreated → Completed, clears player Redis status only on CAS success (RISK-S8 fix), handles draw (null winner/loser)
- **Players `BattleCompletedConsumer`:** awards XP, updates win/loss, handles draw (0 XP, loss-equivalent for both — D-9), publishes `PlayerCombatProfileChanged` via outbox
- **Battle `CreateBattleConsumer`:** creates Postgres record, initializes Redis state (SETNX), opens turn 1, publishes `BattleCreated`

### 5.4 Retry and Redelivery Tests

**Recommended initially. Mandatory before production readiness if retry/redelivery behavior is relied on as an operational safety net.**

Examples:
- Consumer throws transient exception → MassTransit retries (5 attempts, exponential backoff)
- All retries exhausted → message goes to error queue
- Redelivery after delay succeeds if transient condition clears

These tests validate MassTransit's configuration rather than core domain logic. They are valuable, but they are not required to declare the first implementation slice functionally complete.

---

## 6. Persistence, Migration, and Data Integrity Tests

### 6.1 EF Core Mapping Tests

Each service must verify that its EF Core model maps correctly to its PostgreSQL schema.

**Mandatory for initial implementation completion per service:**
- Round-trip test: create entity → save → reload → assert all fields match
- Snake_case naming convention is applied (table and column names)
- Schema isolation: DbContext writes to the correct schema (`players`, `matchmaking`, `battle`)
- Concurrency token (revision/row version) causes `DbUpdateConcurrencyException` on stale write where concurrency is part of behavior
- Nullable reference types are correctly mapped where they are part of domain correctness

**Service-specific:**
- Players: Character aggregate round-trip, stat allocation with concurrency, onboarding state persistence
- Matchmaking: Match entity round-trip, all state machine states persisted correctly, player combat profile projection round-trip
- Battle: Battle record round-trip (completed battle with all fields), outbox/inbox table existence

### 6.2 Migration Tests

Per AD-13, migrations run in CI/CD, not on startup.

**Mandatory for initial implementation completion:**
- All pending migrations apply cleanly to an empty database (forward migration)
- Each service's migrations target only its own schema

**Mandatory before production readiness:**
- Migrations are re-run safe against an already-migrated database
- rollback/down-migration expectations are explicitly validated if rollback is part of deployment policy

### 6.3 Data Integrity Constraints

**Mandatory for initial implementation completion:**
- Unique constraints are enforced (e.g., one character per identity in Players)
- Foreign key constraints prevent orphaned records where applicable
- NOT NULL constraints match domain invariants

---

## 7. Redis, Concurrency, Lease, and Recovery Tests

### 7.1 Battle Redis State Tests

Battle uses Redis as the authoritative store for active battle state with Lua-scripted CAS transitions.

**Mandatory for initial implementation completion:**

| Test | What It Proves |
|---|---|
| Battle state initialization (SETNX) → state exists in Redis | Creation correctness |
| Duplicate SETNX → second call fails, first state preserved | Idempotent creation |
| CAS: TurnOpen → Resolving succeeds with correct precondition | State machine correctness |
| CAS: TurnOpen → Resolving fails if state is not TurnOpen | Guard correctness |
| Action submission (SETNX per player per turn) → first write wins | First-write-wins semantics |
| Duplicate action submission → second is rejected | Action idempotency |
| Both actions submitted → state ready for resolution | Turn completion detection |
| Terminal state written → Redis state reflects battle end | Terminal correctness |

**Requirements:**
- Tests run against real Redis (not an in-memory fake).
- Lua scripts must be tested as they are deployed — no simplified stand-ins.

### 7.2 Matchmaking Redis Tests

**Mandatory for initial implementation completion:**

| Test | What It Proves |
|---|---|
| Queue join (SADD + RPUSH atomic) → player in set and list | Atomic queue entry |
| Queue leave (SREM + LREM) → player removed from both | Clean queue exit |
| Pair pop (Lua script) → two players removed atomically | Atomic pairing |
| Pair pop skips canceled players | Cancellation handling |
| Player status set/get/clear | Status cache correctness |
| Player status TTL expiry → status gone after 30 min | TTL behavior |
| Distributed lease (SET NX PX) → only one worker holds lease | Single-leader guarantee |
| Lease expires → another worker can acquire | Lease recovery |

### 7.3 Recovery and Orphan Tests

Recovery tests are split by delivery phase.

**Mandatory for initial implementation completion:**
- Battle stuck-in-Resolving detection and re-resolution with identical outcome
- Matchmaking duplicate/timeout safety for battle state transitions where user lockout is possible

**Mandatory before production readiness:**
- Battle orphan sweep scenarios
- Redis-loss recovery paths
- full timeout-worker coverage for long-lived stuck-state cleanup

**Representative cases:**
- Battle: Stuck-in-Resolving detection and re-resolution (RISK-S2). A battle in Resolving state past timeout threshold is re-resolved with identical outcome.
- Battle: Orphan sweep — non-terminal Postgres battle with no Redis state → force-end and publish BattleCompleted (RISK-S4 recovery path).
- Matchmaking: BattleCreateRequested timeout (60s) → match freed, players unblocked.
- Matchmaking: BattleCreated timeout (10 min) → match terminated, players freed.

---

## 8. API, Authentication, and Contract Tests

### 8.1 Authentication Tests

Per AD-03, all HTTP-facing services must validate Keycloak JWT.

**Mandatory for initial implementation completion per service:**

| Test | What It Proves |
|---|---|
| Request with valid JWT → accepted | Auth accepts valid tokens |
| Request with no token → 401 | Auth rejects anonymous |
| Request with expired token → 401 | Token expiry enforced |
| Request with wrong audience → 401 | Audience validation works |
| IdentityId extracted correctly from JWT claims | Claim mapping correctness |

**Battle-specific mandatory tests:**
- SignalR hub connection with valid JWT → connected
- SignalR hub connection without JWT → rejected
- `DevSignalRAuthMiddleware` is not registered in release configuration

### 8.2 Input Validation Tests

**Mandatory for initial implementation completion:**
- Players: Stat allocation rejects invalid point distributions, character name rejects empty/overlength input
- Matchmaking: Queue join rejects if player not ready (enforced via projection), queue join rejects if player has active match

### 8.3 Contract Tests

Contract tests verify that the shape of published events and consumed events remains compatible across services. This is the Kombats substitute for a schema registry (AD-06).

**Mandatory for initial implementation completion:**

| Contract | Test |
|---|---|
| `PlayerCombatProfileChanged` | Serializes and deserializes correctly with all fields including `Version` |
| `CreateBattle` + `BattleParticipantSnapshot` | Serializes/deserializes, `Vitality` field present (not `Stamina` — AD-02) |
| `BattleCreated` | Serializes/deserializes with all fields |
| `BattleCompleted` | Serializes/deserializes including nullable `WinnerIdentityId`/`LoserIdentityId` (draw case), new fields (`TurnCount`, `DurationMs`, `RulesetVersion`) |

**Requirements:**
- Contract tests must catch additive field additions that break deserialization in consumers.
- Compile-time schema safety via project references must be enforced by building the solution in CI. This is not a runtime contract test, but it is part of the release gate.

---

## 9. End-to-End and Runtime Topology Tests

### 9.1 Local Topology Smoke Tests

These tests verify that the full local runtime topology functions as a system. They are not unit tests or integration tests — they exercise the real services with real infrastructure.

**Recommended initially. Mandatory before first production deployment.**

**Representative scenarios:**

| Scenario | What It Proves |
|---|---|
| Player onboarding → ready → queue join → match → battle → completion → XP award | Full gameplay loop |
| Two players complete a battle → both can re-queue | Post-battle cleanup correctness |
| Player with stale profile joins queue → rejected or retried | Projection consistency |

**Requirements:**
- All three services running against real PostgreSQL, Redis, RabbitMQ, and Keycloak (or a JWT stub issuer).
- These tests are slow and environment-dependent. They must not block fast feedback loops.
- They may run as a separate CI stage or as a manual pre-release validation step.

### 9.2 Classification

End-to-end topology tests are deferred for the initial implementation phase.
They are not required to declare a service implementation-complete.
They become mandatory before the first production deployment or any environment intended to validate full gameplay flow across all three services.

---

## 10. Required Test Projects and Naming Conventions

### Naming Convention

```text
Kombats.<Service>.<Layer>.Tests
```

### Target Test Project Set

This is the target project set for the architecture package.
Projects may be introduced incrementally by service and layer, but required coverage for implemented scope must exist.

| Test Project | Contents | Classification |
|---|---|---|
| `Kombats.Players.Domain.Tests` | Character aggregate, state machine, stat rules, IsReady derivation | Mandatory for initial implementation completion |
| `Kombats.Players.Application.Tests` | Handlers, orchestration, progression logic | Mandatory for initial implementation completion |
| `Kombats.Players.Infrastructure.Tests` | EF Core mappings, repositories, consumer tests, outbox | Mandatory for initial implementation completion |
| `Kombats.Players.Api.Tests` | HTTP endpoints, auth, validation | Mandatory for initial implementation completion |
| `Kombats.Matchmaking.Domain.Tests` | Match state machine, timeout rules | Mandatory for initial implementation completion |
| `Kombats.Matchmaking.Application.Tests` | Pairing logic, queue orchestration, timeout workers | Mandatory for initial implementation completion |
| `Kombats.Matchmaking.Infrastructure.Tests` | EF Core, Redis operations, Lua scripts, consumers, outbox, lease | Mandatory for initial implementation completion |
| `Kombats.Matchmaking.Api.Tests` | HTTP endpoints, auth | Mandatory for initial implementation completion |
| `Kombats.Battle.Domain.Tests` | BattleEngine, CombatMath, determinism suite, ruleset tests | Mandatory for initial implementation completion |
| `Kombats.Battle.Application.Tests` | CreateBattle, turn resolution, deadline enforcement | Mandatory for initial implementation completion |
| `Kombats.Battle.Infrastructure.Tests` | EF Core, Redis CAS/Lua scripts, consumers, outbox | Mandatory for initial implementation completion |
| `Kombats.Battle.Api.Tests` | SignalR hub auth, HTTP endpoints | Mandatory for initial implementation completion |
| `Kombats.Messaging.Tests` | Shared messaging library configuration, topology, naming conventions | Recommended initially; mandatory before production readiness if the shared library remains a central runtime dependency |

### Project Location

Test projects live under a `tests/` directory at the repository root, mirroring the `src/` structure:

```text
tests/
├── Kombats.Players/
│   ├── Kombats.Players.Domain.Tests/
│   ├── Kombats.Players.Application.Tests/
│   ├── Kombats.Players.Infrastructure.Tests/
│   └── Kombats.Players.Api.Tests/
├── Kombats.Matchmaking/
│   ├── Kombats.Matchmaking.Domain.Tests/
│   ├── Kombats.Matchmaking.Application.Tests/
│   ├── Kombats.Matchmaking.Infrastructure.Tests/
│   └── Kombats.Matchmaking.Api.Tests/
├── Kombats.Battle/
│   ├── Kombats.Battle.Domain.Tests/
│   ├── Kombats.Battle.Application.Tests/
│   ├── Kombats.Battle.Infrastructure.Tests/
│   └── Kombats.Battle.Api.Tests/
└── Kombats.Common/
    └── Kombats.Messaging.Tests/
```

### InternalsVisibleTo

Production projects that need internal types tested must declare `[InternalsVisibleTo("Kombats.<Service>.<Layer>.Tests")]`. Battle.Domain already declares this for `Kombats.Battle.Application.Tests`. Each service should follow the same pattern for its domain and application layers where internal testing access is justified.

---

## 11. Minimum Release Gates

The following conditions must be met before any service is considered release-ready.

### Gate 1: All Mandatory Tests Pass

All mandatory test coverage required for the implemented scope must exist and pass.
Test projects should exist for each implemented mandatory layer, but the gate is about required coverage, not about mechanically creating every possible test project in advance.
Zero test failures.

### Gate 2: Battle Determinism Suite Passes

The full determinism test suite (Section 4) must pass. This is called out separately because a determinism regression is a correctness failure, not a quality issue.

### Gate 3: Outbox Atomicity Verified

At least one outbox atomicity test per service: domain write + event in outbox within one transaction, and rollback produces no event. This directly validates the AD-01 fix for RISK-S1.

### Gate 4: Consumer Idempotency Verified

Every consumer listed in Section 5.2 has a duplicate-message test that proves the second delivery is a no-op.

### Gate 5: Auth Enforced

Every HTTP endpoint and SignalR hub rejects unauthenticated requests. No dev bypasses in the release configuration.

### Gate 6: Contract Compatibility

The solution builds. All contract project references resolve. No serialization/deserialization failures in contract tests. This is the compile-time schema safety net (AD-06).

### Gate 7: Migration Forward-Apply

All migrations apply cleanly to an empty database. No migration targets the wrong schema.

### Gate 8: No Test Infrastructure in Production Assemblies

No test code, test helpers, or test framework references in any production `.csproj`.

### Production-Readiness Addendum

Before the first production deployment, the following additional items become mandatory:
- end-to-end topology smoke tests;
- recovery/orphan-path coverage marked as production-readiness mandatory in Section 7.3;
- any deferred messaging/runtime tests that are relied upon operationally in production.

---

## 12. Deferred or Optional Test Areas

The following are explicitly deferred. They are valuable but not required for the initial implementation phase.

### Deferred: End-to-End Topology Tests (Section 9)

Full gameplay loop tests across all three services. Deferred until individual service correctness is established. Becomes mandatory before first production deployment.

### Deferred: Durable Replay Verification Tests

AD-11 establishes deterministic combat but explicitly states that durable replay is not a current system capability. Replay verification tests (recompute a completed battle from persisted action history and compare outcomes) are deferred until persistent turn-action history is implemented.

### Deferred: Performance and Load Tests

No performance testing standard is defined for the initial phase. Relevant future areas:
- Matchmaking pairing throughput under load
- Battle turn resolution latency
- Redis Lua script performance under concurrent access
- Consumer throughput under message backlog

### Deferred: Retry/Redelivery Configuration Runtime Tests

MassTransit retry and redelivery runtime verification can be deferred initially if the configuration is already validated and the main correctness-critical messaging tests are present.

### Deferred: Chaos and Failure Injection Tests

Redis failure during active battle, RabbitMQ unavailability during outbox dispatch, PostgreSQL connection failure during transaction. These are operational resilience tests, not core correctness tests. Deferred until production-readiness hardening.

### Optional: Snapshot Staleness Tests

Verify that a player's combat profile snapshot used in battle reflects the projection state at match creation time, not a later update. This is an eventually-consistent-system property and is hard to test deterministically. Optional.

---

## 13. Testing Decisions — Resolved

### OD-1: Test Framework Selection — RESOLVED

| Component | Decision |
|---|---|
| Test runner / framework | **xUnit** |
| Assertion library | **FluentAssertions** |
| Mocking library | **NSubstitute** |
| Container management | **Testcontainers for .NET** |

xUnit is the dominant modern .NET test framework with the best tooling support. FluentAssertions provides expressive, readable assertions. NSubstitute is lightweight and well-suited to stubbing application-layer ports. Testcontainers provides real infrastructure per test class with full isolation.

Corresponds to OQ-1 in the technology baseline (also resolved there).

### OD-2: MassTransit Test Harness vs. Real RabbitMQ — RESOLVED

**Decision:** Mixed strategy.

- **MassTransit test harness** (`MassTransit.Testing` 8.3.0) for consumer behavior tests and idempotency tests. Fast, high-fidelity for consumer logic.
- **Real RabbitMQ via Testcontainers** for outbox dispatch tests and end-to-end messaging tests where transport-level behavior matters.

This avoids the false confidence of testing only in-memory while keeping the fast feedback loop for consumer-level tests.

### OD-3: Test Database Lifecycle — RESOLVED

**Decision:** Testcontainers for PostgreSQL. Fresh container per test class (or per test collection where lifecycle allows). Migrations applied before tests execute. No shared docker-compose for test databases. EF Core in-memory provider remains explicitly rejected.

### OD-4: Shared Test Infrastructure Library — RESOLVED

**Decision:** Yes, but only after real duplication appears. Do not pre-build `Kombats.Testing.Common` speculatively. Extract shared fixtures (PostgreSQL container, Redis container, MassTransit harness setup, JWT token builder) after the first two test suites demonstrate concrete duplication.

---

## 14. Recommended Placement in Architecture Package

This document belongs in:

```text
.claude/docs/architecture/kombats-test-strategy.md
```

It is a peer of the existing architecture package documents:
- `kombats-system-architecture.md` — what the system is
- `kombats-architecture-decisions.md` — why the system is shaped this way
- `kombats-technology-and-package-baseline.md` — what the system is built with

This document fills a distinct role: it defines how the system proves it works. It is referenced by implementation work and CI configuration, not by architectural reasoning.

The four documents together form the complete architecture package:

1. **System architecture** — structure, responsibilities, integration model
2. **Architecture decisions** — rationale for key choices
3. **Technology and package baseline** — approved stack, versions, constraints
4. **Test strategy** — required testing standard, release gates, delivery readiness criteria

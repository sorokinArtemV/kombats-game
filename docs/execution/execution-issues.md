# Execution Issues

## Batch 0A

### EI-001: Version normalizations via central package management
**Severity:** Low
**Status:** Resolved by design

Central package management forces a single version per package. The following pre-existing version drifts were resolved to baseline target versions:

| Package | Old Version (project) | New Version | Risk |
|---|---|---|---|
| `Serilog.AspNetCore` | 8.0.3 (Matchmaking.Api) | 10.0.0 | Low — major version bump, but baseline-approved |
| `Microsoft.Extensions.Logging.Abstractions` | 9.0.0 (Matchmaking.App) | 10.0.3 | Very low — abstractions package |
| `Microsoft.Extensions.Logging.Abstractions` | 10.0.0 (Battle.App) | 10.0.3 | Negligible — patch bump |
| `Microsoft.AspNetCore.OpenApi` | 10.0.1 (Matchmaking.Api) | 10.0.3 | Negligible — patch bump |
| `MassTransit.RabbitMQ` | 8.5.8 (Kombats.Shared) | 8.3.0 | Low — downgrade, but 8.3.0 is the pinned baseline. Shared is legacy and scheduled for removal |

All version normalizations verified via successful build. No runtime verification performed (infrastructure not started).

### EI-002: PropertyGroup properties remain duplicated in csproj files
**Severity:** Info (not a defect)
**Status:** Deferred — cosmetic

`Directory.Build.props` now provides `TargetFramework`, `LangVersion`, `Nullable`, `ImplicitUsings`. These are still present in individual `.csproj` files (redundant but harmless). The F-01 ticket scope explicitly covered removing `PackageReference Version` attributes only. Removing redundant PropertyGroup entries can be done as part of per-service replacement tickets.

### EI-004: Kombats.slnx overwritten during Kombats.sln creation
**Severity:** Low
**Status:** Resolved

`.NET 10 SDK `dotnet new sln` defaults to `.slnx` format. The first `--force` invocation overwrote `Kombats.slnx` content. Restored from git. Second invocation used `--format sln` to create the classic `.sln` file. Both coexist until F-10.

### EI-005: IQueryHandler method name alignment
**Severity:** Info
**Status:** Resolved by design

Legacy `IQueryHandler.Handle` (in `Kombats.Shared.Types`) was inconsistent with `ICommandHandler.HandleAsync`. The new `Kombats.Abstractions.IQueryHandler` uses `HandleAsync` for consistency. Legacy code is unaffected — migration happens per-service.

### EI-003: Test framework package versions are unvalidated
**Severity:** Info
**Status:** Resolved in F-05

Test framework packages validated during F-05. All packages restore and build correctly except `MassTransit.Testing` — see EI-006.

## Batch 0C

### EI-006: MassTransit.Testing package does not exist in 8.3.0
**Severity:** Low
**Status:** Resolved

`MassTransit.Testing` is declared in `Directory.Packages.props` but does not exist as a separate NuGet package for MassTransit 8.3.0. In MassTransit v8+, testing utilities are included in the main `MassTransit` package. The `Kombats.Messaging.Tests` project references `MassTransit` directly instead. The `MassTransit.Testing` entry in `Directory.Packages.props` is harmless (unreferenced) and can be cleaned up in a future batch.

### EI-007: MSB3277 assembly version conflict warnings in test projects
**Severity:** Info
**Status:** Expected — resolves during service replacement

`Kombats.Players.Infrastructure.Tests` and `Kombats.Players.Api.Tests` emit MSB3277 warnings about `Microsoft.EntityFrameworkCore.Relational` version conflicts (10.0.1 vs 10.0.3). This is caused by `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.0 shipping with `EFCore.Relational` 10.0.1 while central management declares 10.0.3. The transitive reference from the legacy Infrastructure project pulls in the older version. This resolves naturally when the service is replaced with target-architecture code. No action needed now.

## Batch 0D

### EI-008: Testcontainers RabbitMQ default credentials are rabbitmq:rabbitmq, not guest:guest
**Severity:** Info
**Status:** Resolved

The `Testcontainers.RabbitMq` `RabbitMqBuilder` creates containers with default credentials `rabbitmq:rabbitmq`, not the standard RabbitMQ default of `guest:guest`. Integration tests must parse credentials from `container.GetConnectionString()` rather than hardcoding `guest:guest`. The outbox integration test was updated to parse the AMQP URI for correct credentials.

### EI-009: MessagingOptions.RabbitMq.Port added for non-standard port support
**Severity:** Info
**Status:** Resolved by design

`RabbitMqOptions` previously had no `Port` property — the RabbitMQ default port 5672 was implicitly used. Added `Port` property with default `5672` and switched `cfg.Host()` to the `(host, port, virtualHost, configure)` overload. This is needed for Testcontainers (which map to random ports) and production environments with non-standard port configuration. Existing services using the default port are unaffected — the default value matches the previous implicit behavior.

### EI-010: UseBusOutbox() was missing from outbox configuration
**Severity:** High
**Status:** Resolved

The pre-existing `Kombats.Messaging` library configured `AddEntityFrameworkOutbox<TDbContext>` and `UseEntityFrameworkOutbox<TDbContext>` on endpoint configurators, but did NOT call `UseBusOutbox()`. Without `UseBusOutbox()`, the `IPublishEndpoint` and `ISendEndpointProvider` injected via DI publish directly to RabbitMQ, bypassing the transactional outbox. Only messages published from within a consumer context would use the outbox. This violated AD-01 (all event publication must go through the outbox). Added `o.UseBusOutbox()` inside the `AddEntityFrameworkOutbox<TDbContext>` configuration. All three services benefit from this fix when they adopt `Kombats.Messaging`.

## Batch 0F

### EI-011: Players startup fails on empty migration history with existing tables
**Severity:** Low
**Status:** Resolved — Players Bootstrap (P-06) removed `Database.MigrateAsync()` per AD-13

Players service crashed on startup when `players.__ef_migrations_history` table existed but was empty while the `players.characters` table already existed. Eliminated when Players moved to Bootstrap architecture — `Database.MigrateAsync()` removed from startup per AD-13.

## Phase 3 — Matchmaking Replacement Stream

### EI-012: Missing Matchmaking Infrastructure integration tests
**Severity:** High
**Status:** Open — non-blocking follow-up required before Phase 5

Phase 3 delivered Domain tests (55) and Application tests (17) but did **not** create `Kombats.Matchmaking.Infrastructure.Tests`. Per the test strategy, the following are mandatory:
- MatchRepository round-trip and CAS operations with real PostgreSQL (Testcontainers)
- MatchmakingDbContext schema verification (snake_case, `matchmaking` schema, outbox tables)
- Redis queue Lua script integration tests (join, leave, pop-pair atomicity, canceled-player cleanup)
- Redis lease (SETNX/PX) behavior under contention
- Redis player status store (set/get/clear with TTL)
- Consumer idempotency tests: BattleCreatedConsumer, BattleCompletedConsumer, PlayerCombatProfileChangedConsumer — each with duplicate-message no-op verification
- Outbox atomicity test: match insert + CreateBattle event in one transaction, rollback = no event

The "unchanged, correct" claims for Redis operations (M-D: M-06, M-07) and consumers (M-F: M-08, M-09, M-10) are plausible from code review but **unverified by automated tests**. This is an accepted deviation — infrastructure was carried forward from legacy, not rewritten — but the test gap must be closed before Phase 5 integration verification.

### EI-013: Missing Matchmaking API tests
**Severity:** Medium
**Status:** Open — non-blocking follow-up required before Phase 5

No `Kombats.Matchmaking.Api.Tests` project was created. Per the test strategy, these are mandatory:
- Auth enforcement: valid JWT accepted, missing/invalid/expired JWT → 401
- Input validation: FluentValidation rules tested
- Response contract: correct shape for join, leave, status endpoints

The endpoints themselves are thin and structurally correct (verified by code review), but the automated test gate is not met.

### EI-014: Profile-miss during pair-pop drops players from queue
**Severity:** Medium
**Status:** Open — accepted deviation, follow-up required

The implementation plan specifies: "profile miss handling — return to queue head." The `ExecuteMatchmakingTickHandler` (line 53-60) pops two players from the Redis queue, then checks for combat profiles. If a profile is missing, it logs an error and returns `MatchmakingTickResult(false)` — but the players are **not returned to the queue**. They are silently lost.

The comment on line 58 says "Return players to indicate no match" but refers to the return value, not returning players to the queue. This is a behavioral gap: under normal operation, all queued players should have profiles (the join handler validates this), but if a profile projection is stale or missing, the player is permanently dequeued.

Acceptable for now because profile miss is an edge case (join validates profile existence), but should be addressed before production.

### EI-015: Single timeout worker covers only BattleCreateRequested state
**Severity:** Low
**Status:** Open — accepted deviation

The implementation plan specifies two timeout concerns:
- `BattleCreateRequestedTimeoutWorker` (60s) — matches waiting for Battle service to acknowledge
- `BattleCreatedTimeoutWorker` (10min) — battles created but never completed

The implementation has a single `MatchTimeoutWorker` that only times out `BattleCreateRequested` matches (MatchRepository line 93: `WHERE State == BattleCreateRequested`). Matches stuck in `BattleCreated` state are not timed out by any worker.

In practice, the Battle service is responsible for completing battles (including inactivity termination), so `BattleCreated` timeout is a safety net, not a primary mechanism. Acceptable for Phase 3 scope. Should be added before production hardening (Phase 7).

### EI-016: Level-based filtering not implemented in pairing
**Severity:** Low
**Status:** Open — accepted deviation

The implementation plan specifies "level-based filtering" for queue pairing. The actual implementation uses strict FIFO pairing via the Lua `TryPopPairScript` — it pops the first two valid (non-canceled) players regardless of level. No level proximity check is performed.

This is acceptable for v1 where the player base is small and FIFO provides fairness. Level-based filtering can be added as an enhancement without architectural changes (modify the Lua script or add a filtering layer in the application handler).

### EI-017: Batch merging in M-D and M-G/M-H
**Severity:** Info
**Status:** Resolved — no material risk

Batches were merged during execution:
- **M-D** combined M-04 (repository), M-06 (Redis queue), M-07 (Redis lease) — justified because M-06 and M-07 were verified as "unchanged, correct" from legacy code, requiring no new implementation
- **M-G + M-H** combined M-11 (Bootstrap), M-13 (workers), M-12 (API) — justified because API layer was thin and Bootstrap/workers are tightly coupled

The merging did not hide risk: each batch's scope was clearly documented in the execution log. The main risk (untested Redis operations and consumers) is captured separately in EI-012.

### EI-018: Execution-issues.md not maintained during Phase 3
**Severity:** Info
**Status:** Resolved — retroactively populated in this gate check

Phase 3 execution did not record any issues in `execution-issues.md` during implementation. All Matchmaking-phase findings have been retroactively reconstructed and recorded (EI-012 through EI-017) as part of the Phase 3 gate check.

## Phase 4: Battle Replacement Stream

### EI-019: Battle Domain largely reusable — evaluate-only for most batches
**Severity:** Info
**Status:** Resolved by design

The Battle domain, application, and infrastructure code was already substantially aligned with the target architecture. Batches B-A through B-C (domain core, CombatMath, engine), B-E through B-I (application handlers, consumers, notifier), and B-J (SignalR notifier) required no code changes — only evaluation and test addition. This is expected: the Battle service was the most recently implemented service and was built with the target architecture in mind.

### EI-020: Api project was composition root (legacy pattern)
**Severity:** Medium
**Status:** Resolved in B-L/B-M

The Battle Api project (`Kombats.Battle.Api`) was `Microsoft.NET.Sdk.Web` and served as the composition root with `Program.cs`, DI registration, controllers, workers, and dev middleware. This violated the target architecture where Bootstrap is the sole composition root and Api is a thin transport layer.

Resolved by:
- Creating `Kombats.Battle.Bootstrap` as the new composition root (B-L)
- Deleting all legacy code from Api (B-M)
- Changing Api to `Microsoft.NET.Sdk` (B-M)
- Moving RulesetsOptionsValidator from Api to Infrastructure (B-M)

### EI-021: RulesetsOptionsValidator was internal in Api, needed by Bootstrap
**Severity:** Low
**Status:** Resolved in B-M

`RulesetsOptionsValidator` was `internal static class` in `Kombats.Battle.Api.Configuration`, referencing `Kombats.Battle.Infrastructure.Rules.BattleRulesetsOptions`. Since it references Infrastructure types and Bootstrap needs it, it was moved to `Kombats.Battle.Infrastructure.Configuration` namespace during B-M cleanup.

### EI-022: TurnDeadlineWorker recreated in Bootstrap (not moved)
**Severity:** Info
**Status:** Resolved by design

The TurnDeadlineWorker was recreated fresh in `Kombats.Battle.Bootstrap.Workers` rather than moved from `Kombats.Battle.Api.Workers`. The Bootstrap version is a simplified, equivalent implementation. The original in Api was deleted in B-M. This avoids partial file moves and keeps the implementation clean.

### EI-023: Missing Battle Infrastructure integration tests
**Severity:** High
**Status:** Open, non-blocking before Phase 5

Phase 4 delivered domain (113 tests) and application (15 tests) tests but NOT infrastructure integration tests. Required before production:
- BattleDbContext round-trip tests with real Postgres (Testcontainers)
- RedisBattleStateStore Lua script tests with real Redis
- Consumer idempotency tests (CreateBattleConsumer, BattleCompletedProjectionConsumer)
- Outbox atomicity verification

Similar to EI-012 for Matchmaking. These should be added in Phase 5 (Integration Verification) or a dedicated testing phase.

### EI-024: Missing Battle API tests
**Severity:** Medium
**Status:** Open, non-blocking before Phase 5

No `Kombats.Battle.Api.Tests` project created. Required: SignalR hub auth enforcement, health endpoint response. Similar to EI-013 for Matchmaking.

### EI-025: appsettings TurnSeconds value mismatch between legacy and new config
**Severity:** Low
**Status:** Resolved

Legacy Api appsettings had `TurnSeconds: 30000` (likely milliseconds) while target Bootstrap uses `TurnSeconds: 30` (seconds). The domain Ruleset.TurnSeconds is used as seconds throughout the application. The Bootstrap value of 30 is correct; the legacy value of 30000 was likely a configuration error in the old code.

## Phase 5: Integration Verification

### EI-026: Infrastructure integration tests require Docker (Testcontainers)
**Severity:** Info
**Status:** Accepted by design

The new infrastructure test projects (Matchmaking.Infrastructure.Tests, Battle.Infrastructure.Tests) and integration flow tests (I-01, I-02, I-03) use Testcontainers for real PostgreSQL. These tests compile and are structurally correct but require Docker to run. This is the intended testing strategy (real infrastructure, no mocks) per the test strategy document.

### EI-027: Redis integration tests not included in Phase 5 infrastructure test closure
**Severity:** Medium
**Status:** Open — deferred to Phase 7

The Matchmaking Redis operations (queue join/leave/pop-pair Lua scripts, lease lock, player status store) and Battle Redis operations (battle state store, Lua scripts for CAS transitions) are not covered by the new infrastructure test projects. These require Testcontainers.Redis and dedicated Lua script verification. The operations were carried forward from legacy code and verified via code review in Phase 3/4 (EI-012 note). Full Redis integration testing is deferred to Phase 7 (Production-Readiness Hardening) where it can be done alongside other operational verification.

### EI-028: Consumer idempotency relies on inbox for Matchmaking/Battle consumers
**Severity:** Info
**Status:** Accepted by design

Matchmaking consumers (BattleCreatedConsumer, BattleCompletedConsumer) achieve idempotency through CAS state transitions (ExecuteUpdateAsync with state guard). The MassTransit inbox provides a second safety layer. Phase 5 tests verify the CAS-based idempotency directly (duplicate event → no state change). The inbox-level idempotency is structurally guaranteed by the MassTransit configuration in Kombats.Messaging and was verified in the outbox integration test (Phase 1).

### EI-029: BattleLifecycleAppService is concrete class — not directly mockable for full consumer tests
**Severity:** Low
**Status:** Accepted — alternative test approach used

The I-02 (Matchmaking→Battle) flow test could not mock BattleLifecycleAppService as it is a concrete class without virtual methods. The test was restructured to verify the persistence layer and contract mapping directly rather than running the full consumer with mocked lifecycle service. The lifecycle service itself is tested in Battle.Application.Tests with stubbed ports. The consumer → persistence → event publication chain is verified by the persistence tests plus contract alignment tests.

### EI-030: Match.Create produces Queued state — tests must call MarkBattleCreateRequested
**Severity:** Info
**Status:** Resolved

Match.Create() creates matches in Queued state, but the repository CAS operations require BattleCreateRequested or BattleCreated states. Integration tests that verify CAS transitions must call match.MarkBattleCreateRequested() after creation. This was initially missed in test drafts and corrected during implementation.

## Phase 6: Legacy Cleanup and Release

### EI-031: Keycloak realm-export.json volume mount references non-existent file
**Severity:** Low
**Status:** Open — pre-existing, not introduced by Phase 6

`docker-compose.yml` line 73 mounts `./infra/keycloak/realm-export.json` but the `infra/keycloak/` directory does not exist. This is a pre-existing configuration issue — Keycloak will start but without realm import. Not blocking for Phase 6 — should be addressed in Phase 7 (Production-Readiness Hardening) when Keycloak configuration is finalized.

### EI-033: Matchmaking migration snapshot contained orphaned OutboxMessageEntity
**Severity:** High
**Status:** Resolved in C-B

The `MatchmakingDbContextModelSnapshot.cs` contained a `Kombats.Matchmaking.Infrastructure.Entities.OutboxMessageEntity` entity (table `matchmaking_outbox_messages`) that was a custom outbox implementation from legacy code. The entity class was deleted during Phase 3 migration but the snapshot was not updated. This caused EF Core's `PendingModelChangesWarning` to throw during `MigrateAsync()`, failing all 10 Matchmaking infrastructure and integration tests.

Fix: Generated migration `RemoveLegacyCustomOutboxTable` that drops the orphaned table. The standard MassTransit outbox (`outbox_message` table) remains and is the correct implementation per AD-01.

### EI-034: I-04 E2E test allocated more points than available
**Severity:** Medium
**Status:** Resolved in C-B

`I04_EndToEndGameplayLoopTests.FullGameplayLoop` called `AllocatePoints(3, 2, 1, 0)` (total 6 points) but `Character.CreateDraft` only provides 3 unspent points. Pre-existing test bug introduced in Phase 5. Fix: adjusted allocations to sum to 3 and updated corresponding profile event stat values.

### EI-035: Intermittent Docker/Testcontainers test failures under parallel execution
**Severity:** Info
**Status:** Accepted by design (pre-existing, see EI-026)

When all 13 test projects run simultaneously via `dotnet test Kombats.sln`, Docker resource contention can cause Testcontainers-based tests to fail at initialization (1ms failures). The same tests pass when run individually or in smaller batches. This is a known Testcontainers characteristic, not a code defect. Documented in EI-026.

### EI-032: Legacy Kombats.Infrastructure.Messaging AssemblyInfo in Kombats.Messaging obj/
**Severity:** Info
**Status:** Resolved

`src/Kombats.Common/Kombats.Messaging/obj/Debug/net10.0/Kombats.Infrastructure.Messaging.AssemblyInfo.cs` was an auto-generated build artifact containing the old assembly name. This is a build cache artifact in `obj/` (gitignored) and will be regenerated on next clean build. No action required.

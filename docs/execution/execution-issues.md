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

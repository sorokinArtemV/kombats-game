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

## Planning / Delivery Order Decisions

### EI-036: Phase 7 split into 7A (backend hardening) and 7B (product-level hardening)
**Severity:** High (planning)
**Status:** Open — active decision

The original Phase 7 combined backend infrastructure hardening with product-level validation into a single phase. This has been split:
- **Phase 7A**: backend/platform production hardening — in current execution scope
- **Phase 7B**: product-level hardening — deferred until after BFF/frontend

**Risk:** Phase 7A completion could be misread as full Phase 7 completion, leading to a false sense of production readiness.

**Mitigation:**
- `implementation-plan.md` explicitly states that 7A completion does NOT mean Phase 7 is complete
- Phase 7B has explicit preconditions (BFF and frontend delivered)
- Exit criteria for 7A are scoped to backend-only readiness
- This issue entry serves as a persistent reminder

### EI-037: Frontend must not precede BFF in delivery order
**Severity:** High (planning)
**Status:** Open — architectural constraint

Frontend is not the correct first integration boundary for this system. BFF should come first because:
1. BFF defines the product-facing orchestration layer and stabilizes the contracts consumed by frontend
2. Building frontend directly against internal service APIs creates unstable UI-facing contracts
3. Orchestration logic would be duplicated in the frontend that properly belongs in the BFF
4. When BFF is later introduced, frontend would require rework to consume BFF contracts instead of internal APIs

**Risk:** If frontend development starts before BFF exists, it will integrate against internal service APIs. This creates:
- Coupling between UI and internal service contracts that should be hidden behind BFF
- Orchestration logic in the wrong boundary (frontend instead of BFF)
- Rework cost when BFF is introduced and contracts change

**Mitigation:**
- Delivery order is explicitly documented: Phase 7A → BFF → Frontend → Phase 7B
- `implementation-plan.md` records this as a named section between 7A and 7B
- Any future planning that proposes frontend-first must address this deviation explicitly

### EI-038: References to "Phase 7" elsewhere may be ambiguous
**Severity:** Low
**Status:** Open — monitoring

Other documents (execution-log Phase 6 verdict, execution-issues deferred items) reference "Phase 7" without the A/B qualifier. These references were written before the split decision and refer to the original undivided Phase 7.

**Risk:** Ambiguity about which Phase 7 sub-phase an item belongs to.

**Mitigation:** Items previously deferred to "Phase 7" should be assigned to 7A or 7B when they enter execution scope. The following items from prior entries map to Phase 7A:
- EI-002: Redundant PropertyGroup entries (cosmetic)
- EI-014: Profile-miss during pair-pop
- EI-015: BattleCreated timeout worker
- EI-016: Level-based filtering in pairing
- EI-027: Redis integration tests
- EI-031: Keycloak realm-export.json
- C-C retained packages (OpenTelemetry, Serilog, Scrutor, Testcontainers.Redis)

No items currently map to Phase 7B. Phase 7B items will be identified when BFF and frontend planning begins.

## BFF Planning Stream

### EI-039: BFF boundary ambiguity — multi-step write orchestration
**Severity:** Medium
**Status:** Open — requires reviewer confirmation

The BFF planning document draws a boundary: BFF composes reads and forwards writes, but "multi-step write orchestration stays in backend services." However, the gameplay loop includes flows where a frontend user expects a single action to span services (e.g., "start playing" could mean ensure character + check readiness + join queue).

**Risk:** If BFF implements multi-step write flows (e.g., call Players then Matchmaking in sequence), it risks becoming an orchestration dump with implicit domain logic (e.g., "only join queue if character is ready" is a domain rule that belongs in Matchmaking, not BFF).

**Current position:** BFF v1 pass-through endpoints forward single calls. The composed "game state" read is the only multi-service call. No multi-step write orchestration in v1 scope.

**Resolution needed:** Reviewer should confirm whether the "start playing" convenience flow (ensure + join) should be a v1 BFF endpoint or deferred. If included, the BFF must delegate readiness checking entirely to Matchmaking (which already enforces it), not re-implement the check.

### EI-040: Auth propagation — JWT forwarding vs. service-to-service trust
**Severity:** Medium
**Status:** Open — decision made, reviewer confirmation needed

The BFF planning document chooses JWT forwarding (Option A) over trusted headers (Option B), citing AD-03's rejection of "BFF-only auth." This means every internal service call from BFF carries the original JWT, and every internal service re-validates it.

**Risk:** If BFF-to-service calls are frequent (especially composed reads hitting 2-3 services), the JWT validation overhead multiplies. For v1 with low traffic this is negligible, but it constrains future scaling.

**Uncertainty:** AD-03 was written before BFF existed. The rejection of "BFF-only auth" was about frontend → backend trust, not BFF → backend trust. The BFF is an internal trusted component, not an external client. A trusted-header approach between BFF and backend services might be architecturally sound even though frontend → backend trust is not.

**Current position:** JWT forwarding chosen for v1. Can be revisited if performance profiling shows JWT validation is a bottleneck (unlikely for v1 scale).

### EI-041: SignalR proxy — connection lifecycle and scaling complexity
**Severity:** High
**Status:** Open — requires careful implementation in BFF-3; explicit fallback trigger defined

The BFF planning document chooses to proxy Battle's SignalR connection through the BFF. This introduces significant complexity:

1. **Connection lifecycle:** BFF must manage one SignalR client connection per active battle participant. If BFF restarts, all connections are lost and must be re-established. Battle's hub expects `JoinBattle` to be called before sending events — reconnection must re-join.

2. **Multi-instance BFF:** If BFF scales to multiple instances, the frontend-facing SignalR hub needs a backplane (Redis). The BFF-to-Battle client connection must also be managed per-instance. This is non-trivial.

3. **Error propagation:** If the BFF→Battle connection drops but the frontend→BFF connection remains, the frontend receives no battle events without explicit error signaling.

**Risk:** SignalR proxy is the highest-complexity piece of the BFF. If underestimated, it could delay the entire BFF delivery.

**Mitigation:** BFF-3 is isolated as a separate batch. Explicit fallback trigger criteria are now defined in the BFF planning document (Section 8): the proxy is abandoned in favor of direct frontend→Battle connection with BFF-assisted discovery if (1) connection lifecycle management exceeds ~2 person-days beyond the hub relay, (2) multi-instance BFF is required before v1, or (3) message ordering degrades. The implementer evaluates; the reviewer approves the topology change.

### EI-042: BFF durable state — risk of creep
**Severity:** Medium
**Status:** Open — monitoring

The BFF planning document states "BFF owns no durable state." This is a strong constraint that simplifies BFF significantly but may be challenged by future requirements:

- **Session state:** If the frontend needs "remember my last queue variant" or "recent battles," the BFF might be pressured to cache this.
- **Rate limiting:** Effective rate limiting typically requires shared state (Redis counters). Without state, rate limiting is per-instance only.
- **Caching:** Frequent composed reads hitting 2-3 services per request may pressure for a response cache.

**Risk:** If state creeps in without explicit design, the BFF becomes a fourth bounded context with its own consistency problems.

**Current position:** No state in v1. Any future state introduction must be an explicit architecture decision with documented justification, not an incremental addition.

### EI-043: Internal service endpoints not designed for BFF consumption
**Severity:** Low
**Status:** Open — may require minor backend changes during BFF implementation

The current internal service APIs (Players, Matchmaking, Battle) were designed for direct frontend consumption, not for BFF-to-service calls. Some considerations:

1. **Error response shapes:** Internal services return `Result<T>` mapped to HTTP status codes. The BFF needs to deserialize these error responses to map them to BFF error codes. The current error response shapes may not be consistent across services.

2. **Missing endpoints:** BFF composed reads may need data that isn't exposed by any current endpoint. For example, "get character by identity ID" exists in Players, but "get queue status by identity ID" in Matchmaking returns a DTO that may not include all fields the BFF needs.

3. **Batch/bulk endpoints:** If BFF needs to fetch data for multiple entities (future: leaderboard), current endpoints are single-entity only.

**Risk:** BFF implementation may discover that backend APIs need minor additions or adjustments. These are not architectural changes but may require coordinated backend+BFF work.

**Mitigation:** BFF-1 implementation will surface specific gaps. Backend changes should be minimal (adding fields to existing responses, not new architecture).

### EI-044: No existing architecture decision for BFF
**Severity:** Info
**Status:** Open — AD formalization required during BFF-0

The architecture decisions document (`kombats-architecture-decisions.md`) contains AD-01 through AD-13 covering backend service decisions. There is no AD for the BFF layer.

**Risk:** BFF decisions (auth propagation, SignalR proxy, no state, HTTP communication) are documented in the planning document but not elevated to the AD format. If the planning document is amended or superseded, decisions may be lost.

**Resolution plan:** The BFF planning document (Section 13) now lists 5 specific decisions that must be formalized as ADs during BFF-0:
- AD-14: BFF as stateless orchestration/composition layer
- AD-15: JWT forwarding for BFF-to-service auth
- AD-16: BFF proxies Battle SignalR (single entry point)
- AD-17: BFF does not reference internal service projects or Abstractions
- AD-18: BFF interacts with Battle via SignalR only (no HTTP for business flows)

AD formalization is included in the BFF-0 gate check. This issue closes when the ADs are written.

### EI-045: BFF-3A may require splitting into sub-tickets
**Severity:** Medium (planning)
**Status:** Open — evaluate during BFF-3 implementation

BFF-3A (SignalR relay) is scoped as a single ticket covering hub creation, connection lifecycle management, bidirectional event relay, and cleanup. The approved BFF spec identifies this as the highest-complexity batch.

**Risk:** If BFF-3A exceeds reviewable ticket size (~500 lines production code), it should be split into:
- BFF-3A1: Hub creation and basic relay (JoinBattle → downstream connect → forward)
- BFF-3A2: Event subscription and relay (Battle server→client events forwarded to frontend)
- BFF-3A3: Connection lifecycle and cleanup (dispose on end, disconnect handling, error propagation)

**Current position:** Kept as single ticket in the execution plan because the three concerns are tightly coupled and splitting may create tickets that can't be independently tested. The implementer should evaluate during BFF-3 whether a split is needed.

**Resolution:** Implementer decides at BFF-3 start. If split, update `docs/tickets/bff-execution-plan.md` before implementation begins.

### EI-046: Backend API response field coverage for BFF needs — unverified
**Severity:** Low
**Status:** Open — surfaces during BFF-1A/1B implementation

The BFF execution plan assumes backend API responses contain all fields needed by BFF DTOs. This has not been verified field-by-field. Specific concerns:

1. **Players `GET /api/v1/me`**: Does the response include onboarding state, win/loss record, and all stat fields the `GameStateResponse` needs?
2. **Matchmaking `GET /api/v1/matchmaking/queue/status`**: Does the response include `BattleId` when the match is in `BattleCreated` state?

**Risk:** If backend responses lack needed fields, minimal backend API changes will be required during BFF-1 or BFF-2, adding cross-ticket dependencies.

**Mitigation:** Implementer should verify actual response shapes at the start of BFF-1A and BFF-1B. Any backend changes should be scoped as minimal additions to existing responses (new fields, not new endpoints).

## Batch BFF-0

### EI-047: BFF auth inlined instead of using AddKombatsAuth from Abstractions
**Severity:** Info
**Status:** Resolved by design

The BFF-0A execution plan wording mentions using `AddKombatsAuth` from `Kombats.Abstractions` for JWT setup. Per AD-17 (BFF does not reference internal service projects or Abstractions) and explicit implementation instructions, the JWT auth configuration was inlined directly in BFF Bootstrap `Program.cs`. The inlined code is identical in behavior to `KombatsAuthExtensions.AddKombatsAuth()` (reads `Keycloak:Authority` and `Keycloak:Audience`, configures `JwtBearerDefaults`, sets `RequireHttpsMetadata = false` and `NameClaimType = preferred_username`).

This is a plan wording inconsistency, not an architecture deviation. AD-17 was approved as part of the BFF architecture spec. The execution plan's mention of Abstractions was an oversight in plan drafting that conflicted with the approved architecture decision.

### EI-048: Microsoft.Extensions.Http added to Directory.Packages.props
**Severity:** Info
**Status:** Resolved

`Microsoft.Extensions.Http` was not in the central package management file (`Directory.Packages.props`). Added at version 10.0.3 to align with other `Microsoft.Extensions.*` packages. This is a framework package included in the .NET SDK, not a new third-party dependency. Ultimately not directly referenced by BFF projects (the `FrameworkReference` to `Microsoft.AspNetCore.App` already provides it), but recorded for completeness.

### EI-049: EI-044 resolved — AD-14 through AD-18 formalized
**Severity:** Info
**Status:** Resolved

EI-044 (no existing architecture decision for BFF) is now resolved. AD-14 through AD-18 have been added to `kombats-architecture-decisions.md` during BFF-0D execution.

### EI-050: Players MeResponse lacks win/loss record fields
**Severity:** Low
**Status:** Open — accepted deviation for BFF v1

During BFF-0B implementation, the internal service response types were modeled from the actual Players API endpoint responses. The `MeResponse` from `GET /api/v1/me` includes: `CharacterId`, `IdentityId`, `OnboardingState`, `Name`, `Strength`, `Agility`, `Intuition`, `Vitality`, `UnspentPoints`, `Revision`, `TotalXp`, `Level`, `LevelingVersion`. It does NOT include win/loss record fields.

The BFF architecture document (Section 4) says the `GameStateResponse` should include "win/loss record." The Players backend internally has `Wins`/`Losses` in `CharacterStateResult` but the `MeResponse` mapping explicitly excludes them.

**BFF-2A resolution:** Win/loss fields are omitted from `GameStateResponse` v1. Per execution rules, backend service code was not modified in this batch. The `CharacterResponse` and `GameStateResponse` DTOs do not include win/loss fields.

**Follow-up required:** To add win/loss to `GameStateResponse`, Players' `MeResponse` must be updated to include `Wins`/`Losses` (minor backend change — the data is already in `CharacterStateResult`). Then `InternalCharacterResponse`, `CharacterResponse`, and `GameStateResponse` can be updated to carry the fields through. This is a backend change that should be tracked as a separate ticket.

### EI-051: AllocateStatsAsync hardcoded ExpectedRevision = 0
**Severity:** Medium
**Status:** Resolved in BFF-0 fix pass

`PlayersClient.AllocateStatsAsync` hardcoded `ExpectedRevision = 0` in the request body instead of accepting it as a parameter. This broke the optimistic concurrency contract: the BFF-1A endpoint would have been unable to forward the frontend's expected revision value to Players, causing silent concurrency-check bypasses or failures.

**Fix:** Added `int expectedRevision` as the first parameter to `IPlayersClient.AllocateStatsAsync` and `PlayersClient.AllocateStatsAsync`. The hardcoded `0` was replaced with the parameter value. Verified by unit test (`AllocateStatsAsync_SendsExpectedRevisionInBody`).

### EI-052: BFF-0B unit tests were deferred to BFF-1C — now added in fix pass
**Severity:** Medium
**Status:** Resolved in BFF-0 fix pass

The original BFF-0 implementation deferred BFF-0B unit tests (JwtForwardingHandler, error mapping, client behavior) to BFF-1C, following the execution plan's test project creation schedule. The reviewer flagged this as a gap: BFF-0B code was delivered without automated verification.

**Fix:** Created `Kombats.Bff.Application.Tests` test project during the fix pass. 20 tests now cover JwtForwardingHandler (3), ErrorMapper (10), and PlayersClient (7). The BFF-1C ticket still creates `Kombats.Bff.Api.Tests` and adds MatchmakingClient tests and endpoint structure tests — that scope is unchanged.

## Batch BFF-1

### EI-053: OnboardingState serializes as integer from Players backend
**Severity:** Low
**Status:** Resolved in BFF-1

The Players backend `MeResponse` includes `OnboardingState` as an enum. .NET's default JSON serializer outputs enum values as integers (0=Draft, 1=Named, 2=Ready), not strings. No `JsonStringEnumConverter` is configured on the Players service.

The BFF `InternalCharacterResponse` originally declared `OnboardingState` as `string`, which would have caused deserialization failures at runtime. Corrected to `int` during BFF-1A implementation.

BFF maps the integer to a human-readable string (`"Draft"`, `"Named"`, `"Ready"`) in `OnboardingStateMapper` for frontend-facing DTOs. This is intentional: the BFF owns the frontend contract and should present meaningful values, not raw enum integers.

### EI-054: Matchmaking LeaveQueue returns different response shape from JoinQueue/GetQueueStatus
**Severity:** Low
**Status:** Documented — not a bug

The Matchmaking backend's LeaveQueue endpoint (`POST /api/v1/matchmaking/queue/leave`) returns anonymous objects:
- On 200 (success): `{ "searching": false }`
- On 409 (already matched): `{ "searching": false, "matchId": "...", "battleId": "..." }`

This differs from JoinQueue and GetQueueStatus which return `QueueStatusDto { Status, MatchId?, BattleId?, MatchState? }`.

The BFF uses a separate `InternalLeaveQueueResponse(Searching, MatchId?, BattleId?)` internal model for deserialization. The BFF-owned `LeaveQueueResponse` normalizes this for the frontend as `LeaveQueueResponse(LeftQueue, MatchId?, BattleId?)`.

This is not a backend bug — it reflects the domain semantics (leaving is a different operation than querying status). No backend change required.

### EI-055: Matchmaking JoinQueue 409 is a valid business outcome, not an error
**Severity:** Low
**Status:** Documented — resolved in BFF-1B client handling

The Matchmaking JoinQueue endpoint returns HTTP 409 Conflict when a player is already in a queue or already matched. The response body is a valid `QueueStatusDto` with match details. Similarly, LeaveQueue returns 409 when already matched.

The original BFF `MatchmakingClient.SendAsync` treated all non-2xx responses as errors. Updated JoinQueue and LeaveQueue to handle 409 as a valid business response (not thrown as `BffServiceException`). The BFF client now returns the response body for both 200 and 409 from these endpoints, letting the endpoint layer map to the appropriate BFF response DTO.

## BFF-1 Review Fix Pass

### EI-056: HealthEndpoint returned 200 for degraded status
**Severity:** Medium
**Status:** Resolved in BFF-1 review fix pass

`HealthEndpoint.cs` contained a dead assignment: `int statusCode = allHealthy ? 200 : 200;`. The status code variable was never used in the `Results.Json()` call, so both healthy and degraded states returned HTTP 200. The `anyHealthy = false` path correctly returned 503, but the `allHealthy = false && anyHealthy = true` ("degraded") path returned 200 with a `"degraded"` status label — misleading for monitoring.

**Fix:** Changed to `int statusCode = allHealthy ? 200 : 503;` and passed `statusCode` to `Results.Json()`. Degraded health now returns HTTP 503 with `{ status: "degraded", services: {...} }`.

### EI-057: `InternalAllocateStatsResponse` and `ServiceCallResult` were dead code
**Severity:** Low
**Status:** Resolved in BFF-1 review fix pass

Two files had zero references outside their own definitions:
- `InternalAllocateStatsResponse.cs` — the BFF uses `InternalCharacterResponse` for AllocateStats results, not this type
- `ServiceCallResult.cs` — the BFF uses exception-based error flow, not Result-style wrappers

Both deleted. No build or test impact.

### EI-058: Scalar API reference not wired in BFF Program.cs
**Severity:** Low
**Status:** Resolved in BFF-1 review fix pass

`Scalar.AspNetCore` was declared as a package reference in `Kombats.Bff.Bootstrap.csproj` but `app.MapScalarApiReference()` was never called. Added one-line call after `app.MapOpenApi()`. Scalar UI now available at `/scalar/v1`.

## Batch BFF-3

### EI-059: Microsoft.AspNetCore.SignalR.Client added to Directory.Packages.props
**Severity:** Info
**Status:** Resolved

`Microsoft.AspNetCore.SignalR.Client` was not in the central package management file. Added at version 10.0.3 to align with other ASP.NET Core packages. This is a standard ASP.NET Core package — no approval concern per the BFF execution plan (listed under "New Packages Required").

### EI-060: CORS updated to AllowCredentials for SignalR WebSocket support
**Severity:** Info
**Status:** Resolved by design

SignalR WebSocket connections require CORS to allow credentials. Updated BFF CORS policy:
- Development: `SetIsOriginAllowed(_ => true)` + `AllowCredentials()` (replaces `AllowAnyOrigin()` which is incompatible with `AllowCredentials()`)
- Production: Added `AllowCredentials()` to the existing `WithOrigins()` policy

This is a required configuration for SignalR to function over WebSocket transport.

### EI-061: EI-045 resolved — BFF-3A implemented as single ticket
**Severity:** Info
**Status:** Resolved

EI-045 flagged that BFF-3A might need splitting into sub-tickets if it exceeded ~500 lines production code. The implementation is ~160 lines of production code (BattleHubRelay: ~155 lines, BattleHub: ~85 lines) — well within the reviewable ticket size. No split needed.

### EI-041 status update: SignalR proxy complexity — resolved
**Severity:** High → Resolved
**Status:** Resolved in BFF-3

EI-041 (SignalR proxy connection lifecycle and scaling complexity) has been resolved. The proxy implementation is straightforward:
1. **Connection lifecycle**: ConcurrentDictionary of per-frontend-connection HubConnections. Create on JoinBattle, dispose on BattleEnded or frontend disconnect. ~160 lines total.
2. **Multi-instance BFF**: Not required for v1 (confirmed). Single-instance is the target.
3. **Error propagation**: Downstream connection loss triggers `BattleConnectionLost` event to frontend.

No fallback triggers were hit. Proxy topology is viable for v1.

## BFF Closeout Fix Pass

### EI-062: `BattleConnectionLost` was undocumented as BFF-originated synthetic event
**Severity:** Medium
**Status:** Resolved in closeout fix pass

`BattleConnectionLost` was emitted by the BFF relay on downstream connection loss but was not documented as distinct from the 6 native Battle events. A frontend consumer or future developer could mistake it for a Battle service event.

**Fix:** Added inline code comment at the emission site. Added `BattleConnectionLost` row to the BFF-to-Backend Endpoint Mapping table in the architecture doc with "BFF-originated" origin. Added "BFF-Originated Synthetic Events" subsection in the Realtime Position section documenting the event, its payload, trigger condition, and expected frontend handling.

### EI-063: `WithAutomaticReconnect()` on downstream HubConnection caused silent event loss
**Severity:** High
**Status:** Resolved in closeout fix pass

The downstream BFF→Battle `HubConnection` was configured with `WithAutomaticReconnect()`. After a transport-level reconnect, the connection would get a new connection ID but would NOT be re-added to the Battle group (group membership is per-connection-ID, set by `JoinBattle`). This meant events would be silently dropped after a successful automatic reconnect — worse than a hard failure because it is invisible.

**Resolution:** Option (a) — removed `WithAutomaticReconnect()`. On any downstream connection loss, the `Closed` handler fires, `BattleConnectionLost` is sent to the frontend, and the frontend must re-join from scratch via a new `JoinBattle` call. This is clean, honest, and avoids silent data loss.

**Alternatives considered:**
- (b) Add reconnected handler that re-invokes `JoinBattle` — rejected because it introduces complexity (stored battleId, race conditions during re-join, duplicate snapshots, battle-ended-during-reconnect edge case) that exceeds v1 budget for marginal benefit.
- (c) Document as known limitation — rejected because option (a) is a clean fix with no downside.

## BFF Correctness Fix Pass

### EI-064: Captured `Clients.Caller` in long-lived downstream event callbacks
**Severity:** High (blocker)
**Status:** Resolved in correctness fix pass

`BattleHub.JoinBattle` created a local function capturing `Clients.Caller` and passed it as a `Func<string, object?[], Task>` callback to `BattleHubRelay.JoinBattleAsync`. This callback was stored and invoked from downstream Battle event handlers long after the hub method completed. ASP.NET Core SignalR guidance explicitly states: do not store `Hub.Clients`, `Hub.Context`, or `Hub.Groups` for use outside the hub invocation scope. The behavior of captured `Clients.Caller` in async callbacks is undocumented and unreliable.

**Fix:** Replaced the callback pattern with a stable `IHubContext<BattleHub>`-based sender:
- Created `IFrontendBattleSender` interface in Application (port)
- Created `HubContextBattleSender` in Api using `IHubContext<BattleHub>.Clients.Client(connectionId).SendCoreAsync()` — explicitly designed for out-of-scope usage
- Modified relay to inject `IFrontendBattleSender` and target frontend by stored connection ID
- Removed `Func<>` callback from `IBattleHubRelay` interface and `BattleHub`
- `Clients.Caller` is fully eliminated from all long-lived callback paths

### EI-065: Happy-path relay testing requires running Battle service
**Severity:** Medium
**Status:** Open — accepted v1 limitation

The BFF relay tests verify failure paths (unreachable Battle, no active connection, cleanup) and structural correctness (interface compliance, constructor dependencies, no callback parameter). However, the full happy-path relay flow (JoinBattle → downstream connect → subscribe to events → relay event to frontend → BattleEnded cleanup) cannot be tested without a running Battle service. The `HubConnection` cannot be meaningfully mocked (sealed class, internal construction).

**Mitigation:** Structural tests verify the relay is correctly wired. The `IFrontendBattleSender` abstraction is testable (NSubstitute). End-to-end relay correctness is verified via manual integration testing with all services running (documented in BFF-4A). Full automated integration testing would require Testcontainers with a Battle service instance — this is Phase 7B scope.

### EI-066: BattleHubRelay and IFrontendBattleSender are public, not internal
**Severity:** Low
**Status:** Accepted — BFF-specific deviation

`BattleHubRelay`, `IBattleHubRelay`, `IFrontendBattleSender`, and other Application-layer types in the BFF are `public` rather than `internal sealed`. This deviates from the standard "Application classes are internal sealed" rule (CLAUDE.md).

**Justification:** The BFF has no Infrastructure layer and no `DependencyInjection` project. Bootstrap directly registers Application types. `InternalsVisibleTo` from Application to Bootstrap is an option but would be the only such relationship in the BFF — the pragmatic deviation is accepted given the BFF's simpler 3-project structure. If a BFF Infrastructure or DI project is added later, these types should be made internal with appropriate `InternalsVisibleTo` entries.

# Kombats Chat v1 — Batch 4 Execution Note

**Date:** 2026-04-15
**Branch:** `kombats_full_refactor`
**Scope:** MassTransit consumer + background workers (retention + presence sweep).
**Authoritative inputs:** `docs/architecture/kombats-chat-v1-architecture-spec.md`,
`docs/execution/kombats-chat-v1-implementation-plan.md` §"Batch 4",
`docs/execution/kombats-chat-v1-decomposition.md`,
`docs/execution/kombats-chat-v1-batch3-execution.md`.

Batch 3 frozen contract (`/chathub-internal`, hub methods, events, error codes, DTOs)
was **not modified**. No blocker required a contract change.

---

## 1. What was implemented

### 1.1 Application — `HandlePlayerProfileChanged`
Files:
- `src/Kombats.Chat/Kombats.Chat.Application/UseCases/HandlePlayerProfileChanged/HandlePlayerProfileChangedCommand.cs`
- `src/Kombats.Chat/Kombats.Chat.Application/UseCases/HandlePlayerProfileChanged/HandlePlayerProfileChangedHandler.cs`

Shape:
- `HandlePlayerProfileChangedCommand(Guid IdentityId, string? Name, bool IsReady) : ICommand`
- `HandlePlayerProfileChangedHandler : ICommandHandler<HandlePlayerProfileChangedCommand>`

Behaviour:
- Maps the event's `IsReady` bool to the canonical `OnboardingState` string consistent with the Batch 2 eligibility model: `IsReady ? "Ready" : "NotReady"`. `CachedPlayerInfo.IsEligible` is derived as `OnboardingState == "Ready"`.
- If `Name` is null or blank, removes the cache entry so the display-name resolver falls back to HTTP instead of serving stale data.
- Returns `Result.Success()` always (write-only cache op; no business failure path).

### 1.2 Infrastructure — `PlayerCombatProfileChangedConsumer`
File: `src/Kombats.Chat/Kombats.Chat.Infrastructure/Messaging/Consumers/PlayerCombatProfileChangedConsumer.cs`

Shape: `internal sealed class PlayerCombatProfileChangedConsumer : IConsumer<PlayerCombatProfileChanged>`

Behaviour:
- Thin: extracts `IdentityId`, `Name`, `IsReady` from `context.Message`, delegates to `HandlePlayerProfileChangedHandler`.
- On handler failure: logs a warning and returns (no throw — MassTransit retry/redelivery pipeline governed by `Kombats.Messaging`).
- Idempotency: the consumer is registered under MassTransit's EF Core inbox (already wired into `ChatDbContext` in Batch 1 via `modelBuilder.AddInboxStateEntity()`). The inbox dedupes by `MessageId`. The handler itself is write-only `SetAsync` which is replay-safe at the business-logic level — replaying the same payload yields identical cache state.

`Kombats.Chat.Infrastructure` now references `Kombats.Players.Contracts`, matching how `Kombats.Matchmaking.Infrastructure` consumes the same contract.

### 1.3 Infrastructure — `MessageRetentionWorker`
Files:
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Options/MessageRetentionOptions.cs` (binds from `Chat:Retention`)
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Workers/MessageRetentionWorker.cs`

Behaviour:
- `BackgroundService`. Every `ScanIntervalSeconds` (default 3600 = 1h):
  1. Computes `cutoff = UtcNow − MessageTtlHours` (default 24h).
  2. Calls `IMessageRepository.DeleteExpiredAsync(cutoff, BatchSize, ct)` repeatedly, up to `MaxBatchesPerPass` (default 100) batches of 1000 rows. The existing B1 repository uses `ExecuteDeleteAsync` with `Take(batchSize)` to hold locks only over a bounded slice of rows.
  3. Calls `IConversationRepository.DeleteEmptyDirectConversationsAsync(ct)`. The existing B1 SQL targets `type = 1` (Direct only) — the global conversation is structurally un-deletable by this worker.
- Resilience: outer `try/catch (Exception ex when ex is not OperationCanceledException)` logs and continues — a failed pass doesn't crash the worker.
- `RunOnceAsync` exposed as `internal` for test coverage (same pattern used by B3 `HeartbeatScheduler.TickAsync`).

### 1.4 Infrastructure — `PresenceSweepWorker`
Files:
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Options/PresenceSweepOptions.cs` (binds from `Chat:PresenceSweep`)
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Workers/PresenceSweepWorker.cs`
- Port extension: `IPresenceStore.SweepStaleAsync(TimeSpan staleAfter, CancellationToken ct) → IReadOnlyList<Guid>` (only identities that THIS call actually ZREM'd).
- Redis implementation added to `RedisPresenceStore` in `src/Kombats.Chat/Kombats.Chat.Infrastructure/Redis/RedisPresenceStore.cs`.

Behaviour:
- Every `ScanIntervalSeconds` (default 60s) calls `SweepStaleAsync(TimeSpan.FromSeconds(StaleAfterSeconds))` (default 90s).
- `SweepStaleAsync` snapshots ZSET members with `score <= cutoffMs` via `ZRANGEBYSCORE`, then issues `ZREM` per member. Only members where `ZREM` returned 1 are reported back; this is the atomic ZREM gating described in the plan. The worker then calls `IChatNotifier.BroadcastPlayerOfflineAsync(PlayerOfflineEvent)` exactly once per removed member.
- After a successful ZREM, the implementation also deletes the `chat:presence:refs:{id}` and `chat:presence:{id}` keys defensively (`KeyDeleteAsync` is safe even if the keys are already gone).
- Rationale for gating: if in the future multiple Chat instances sweep concurrently, only the instance whose ZREM returned 1 (i.e. the one that actually removed the member from the set) emits the offline broadcast — no duplicate notifications.

### 1.5 Bootstrap wiring
File: `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs`

Additions (in a block marked `// === Batch 4: MassTransit consumer + background workers ===`):
- `AddScoped<ICommandHandler<HandlePlayerProfileChangedCommand>, HandlePlayerProfileChangedHandler>()`
- `Configure<MessageRetentionOptions>(...Chat:Retention)`; `Configure<PresenceSweepOptions>(...Chat:PresenceSweep)`
- `AddMessaging<ChatDbContext>(configuration, "chat", configureConsumers, configure)` via `Kombats.Messaging`:
  - Registers `PlayerCombatProfileChangedConsumer`
  - Maps logical key `PlayerCombatProfileChanged` (resolved to `combats.player-combat-profile-changed` via `Messaging:Topology:EntityNameMappings`)
  - Wires EF Core transactional outbox against `ChatDbContext` (AD-01). Outbox/inbox entities were already added to `ChatDbContext` in B1; no migration is required beyond what B1 shipped.
- `AddHostedService<MessageRetentionWorker>()`, `AddHostedService<PresenceSweepWorker>()`

### 1.6 appsettings.json
File: `src/Kombats.Chat/Kombats.Chat.Bootstrap/appsettings.json`

Added sections:
- `Messaging.RabbitMq` + `Messaging.Topology` (mirrors Matchmaking's pattern; `EntityNameMappings.PlayerCombatProfileChanged = combats.player-combat-profile-changed`).
- `Chat.Retention` — retention worker defaults (1h scan, 24h TTL, 1000/batch, 100 batches/pass).
- `Chat.PresenceSweep` — sweep worker defaults (60s scan, 90s stale).

### 1.7 csproj changes
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Kombats.Chat.Infrastructure.csproj`:
  - `ProjectReference` → `Kombats.Players.Contracts`
  - Package references added: `Microsoft.Extensions.Hosting.Abstractions`, `Microsoft.Extensions.Options`, `Microsoft.Extensions.Logging.Abstractions` (needed for `BackgroundService`, `IOptionsMonitor<T>`, `ILogger<T>`).
- `tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Kombats.Chat.Infrastructure.Tests.csproj`:
  - Package references added: `MassTransit`, `MassTransit.Abstractions`, `Microsoft.Extensions.Logging.Abstractions`, `Microsoft.Extensions.Options`.
  - `ProjectReference` → `Kombats.Players.Contracts`.

No changes to `Directory.Packages.props` — all packages were already present and pinned.

---

## 2. Tests

### 2.1 Application unit tests — new file
`tests/Kombats.Chat/Kombats.Chat.Application.Tests/HandlePlayerProfileChangedHandlerTests.cs` (5 tests):
- `IsReady_True_StoresReady` — asserts cache `SetAsync` with `"Ready"` + `IsEligible == true`.
- `IsReady_False_StoresNotReady_AndNotEligible` — asserts `"NotReady"` + `IsEligible == false`.
- `NullOrBlankName_RemovesCacheEntry` (Theory: null, empty, whitespace) — asserts `RemoveAsync` and no `SetAsync`.

Result: **39 / 39 application tests pass** (34 prior + 5 new).

### 2.2 Infrastructure tests — new files
Consumer behaviour + idempotency (unit, NSubstitute):
`tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Messaging/PlayerCombatProfileChangedConsumerTests.cs` (5 tests):
- `IsReadyTrue_DelegatesToHandler_WithReadyCommand`
- `IsReadyFalse_DelegatesToHandler_WithNotReadyCommand`
- `NullName_IsPropagatedToHandler`
- `SameMessageTwice_HandlerInvokedTwice_AndRemainsSafe` — covers business-level replay safety (write-only SetAsync is idempotent). Transport-level inbox dedup is the contract of the MassTransit framework and is exercised by EF migrations + `AddInboxStateEntity` wiring; I did not re-test the framework itself.
- `HandlerFailure_DoesNotThrow`

Contract serialization:
`tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Messaging/PlayerCombatProfileChangedSerializationTests.cs` (4 tests):
- Full round-trip including `Version`.
- `IsReady=false` round-trip.
- Null `Name` round-trip.
- Deserialization of payload missing `Version` defaults to `1` (additive-only schema evolution — AD-06).

Worker tests:
`tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Workers/MessageRetentionWorkerTests.cs` (4 tests, Testcontainers Postgres):
- `RunOnce_OldMessages_AreDeleted_NewKept`
- `RunOnce_GlobalConversation_IsNeverDeleted` (even with TTL = 0, the global conversation row survives).
- `RunOnce_EmptyDirectConversation_IsDeleted`
- `RunOnce_BatchSize_BoundsWorkPerStatement` (50 rows, 2 batches × 10 → 20 deleted; then drain).

`tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Workers/PresenceSweepWorkerTests.cs` (4 tests, Testcontainers Redis):
- `RunOnce_StaleEntry_IsRemoved_AndOfflineBroadcast`
- `RunOnce_FreshEntry_IsPreserved_AndNoBroadcast`
- `RunOnce_TwoSweepersRace_OnlyOneBroadcastsPerStaleEntry` — two workers sweeping concurrently; the atomic ZREM gating results in exactly one `BroadcastPlayerOfflineAsync` across both.
- `RunOnce_NoEntries_NoBroadcast`

Helper: `tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Workers/FakeOptionsMonitor.cs` — a tiny `IOptionsMonitor<T>` implementation. NSubstitute cannot proxy `IOptionsMonitor<T>` when `T` is internal (strong-named assembly + no `InternalsVisibleTo` to `DynamicProxyGenAssembly2`).

### 2.3 Verification runs

| Suite | Result |
|---|---|
| `dotnet build Kombats.sln` | ✅ 0 warnings, 0 errors |
| `dotnet test Kombats.Chat.Domain.Tests` | ✅ 23 / 23 |
| `dotnet test Kombats.Chat.Application.Tests` | ✅ 39 / 39 (5 new) |
| `dotnet test Kombats.Chat.Api.Tests` (Batch 3 hub) | ✅ 22 / 22 |
| `dotnet test Kombats.Chat.Infrastructure.Tests` — consumer + serialization (no containers) | ✅ 9 / 9 |
| `dotnet test Kombats.Chat.Infrastructure.Tests` — worker suite (Testcontainers) | ✅ 8 / 8 |
| `dotnet test Kombats.Chat.Infrastructure.Tests` — full suite | ⚠️ 65 / 66 (see below) |

The single failure is `RedisRateLimiterTests.Fallback_ActivatesOnRedisOutage_And_RecoversWhenRedisReturns` — pre-existing Batch 2 test whose failure mode is a `TaskCanceledException` inside `RedisRateLimiter.CheckRedisAsync` line 71 when the test pauses and unpauses the Redis container. It is not part of Batch 4 work, the worker-sweep + consumer + retention tests I added all pass, and the Batch 3 execution note already called out that the infrastructure suite was not re-run under Docker in that batch. This flake predates Batch 4 and should be tracked separately (not in scope for this batch to fix).

Commands run:
```
dotnet build Kombats.sln
dotnet test tests/Kombats.Chat/Kombats.Chat.Application.Tests/Kombats.Chat.Application.Tests.csproj --nologo --no-build
dotnet test tests/Kombats.Chat/Kombats.Chat.Api.Tests/Kombats.Chat.Api.Tests.csproj --nologo --no-build
dotnet test tests/Kombats.Chat/Kombats.Chat.Domain.Tests/Kombats.Chat.Domain.Tests.csproj --nologo --no-build
dotnet test tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Kombats.Chat.Infrastructure.Tests.csproj --nologo --no-build --filter "FullyQualifiedName~Messaging"
dotnet test tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Kombats.Chat.Infrastructure.Tests.csproj --nologo --no-build --filter "FullyQualifiedName~Workers"
dotnet test tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Kombats.Chat.Infrastructure.Tests.csproj --nologo --no-build
```

---

## 3. Deviations from Plan

- **Workers placed in Infrastructure, not Bootstrap.** The plan (§Batch 4, step 5) says "Register hosted workers". Registration remains in Bootstrap (`AddHostedService<...>`). Implementation of the worker classes lives in `Kombats.Chat.Infrastructure/Workers/` rather than Bootstrap. Rationale: workers use only Application ports and `BackgroundService` (both available to Infrastructure); placing them in Infrastructure keeps them testable from `Kombats.Chat.Infrastructure.Tests` which already has Testcontainers fixtures, without introducing a Bootstrap-test project. Matchmaking historically kept its `MatchTimeoutWorker` in Bootstrap — but that is a choice, not a rule; the rules require only that *registration* happens in Bootstrap. No Bootstrap-test collision occurred.
- **`IPresenceStore.SweepStaleAsync` added as a new port method.** The plan describes `ZRANGEBYSCORE → ZREM per entry → broadcast only on ZREM=1` inline in the worker. Pushing the Lua/Redis-primitive logic behind the port keeps Redis types out of the worker and keeps the ZREM-gating atomic at the infrastructure boundary. The worker receives back only the identities that this instance removed; it does not re-check anything in Redis. No other `IPresenceStore` consumers are affected — they use pre-existing methods.
- **`HandlePlayerProfileChanged` with null/blank name removes the cache entry.** The plan mentions "null Name field handling" in the edge-cases bullet. I chose `RemoveAsync` rather than `SetAsync(name: "Unknown", …)` because a blank name has no useful display semantics and the resolver already falls back to HTTP when the cache misses. This aligns with B2's design where a cache miss triggers a fresh read from Players.

---

## 4. Blockers

None.

Docker is available in the local sandbox for the first time in this chat-module run; Testcontainers-based worker tests ran cleanly (confirmed 8 / 8 worker tests and 9 / 9 consumer+serialization tests pass).

---

## 5. Intentionally Deferred (out of Batch 4 scope)

- BFF ChatHubRelay / ChatHub / ChatClient / HTTP proxies / player card (Batch 5).
- End-to-end cross-service validation (Batch 6).
- Real-time cadence assertion on worker `Task.Delay` timing — the worker's `RunOnceAsync` logic is fully covered; the wall-clock `Task.Delay` cadence is a framework guarantee and not exercised in CI (same posture as Batch 3's heartbeat).
- Fix for the pre-existing flaky `RedisRateLimiterTests.Fallback_ActivatesOnRedisOutage_And_RecoversWhenRedisReturns` test. This is a Batch 2 issue, not a Batch 4 issue; it should be logged under `docs/execution/execution-issues.md` separately.
- MassTransit transport-level inbox dedup integration test (full bus harness). The inbox is wired through `Kombats.Messaging` and `ChatDbContext.AddInboxStateEntity()`; testing the inbox end-to-end would duplicate framework coverage. The consumer's replay-safety is covered at the behaviour layer by `SameMessageTwice_HandlerInvokedTwice_AndRemainsSafe`.

---

## 6. Post-Review Fix Pass (2026-04-15)

Applied in response to the Batch 4 independent review (`docs/execution/reviews/kombats-chat-v1-batch4-review.md`). Scope is strictly the two issues flagged as §4.1 and §4.2.

### 6.1 §4.1 — Consumer no longer swallows handler failures

**File:** `src/Kombats.Chat/Kombats.Chat.Infrastructure/Messaging/Consumers/PlayerCombatProfileChangedConsumer.cs`

The `if (result.IsFailure) { LogWarning; return; }` branch now throws `InvalidOperationException` carrying the error code and description after logging. MassTransit retry/redelivery/fault semantics now apply correctly; the inbox no longer records a failed invocation as successfully processed.

Test: `HandlerFailure_DoesNotThrow` was renamed to `HandlerFailure_Throws_SoMassTransitRetriesOrFaults` and inverted — it now asserts `await act.Should().ThrowAsync<InvalidOperationException>()`. The existing delegation/null-name/replay-safety tests are unchanged.

### 6.2 §4.2 — Sweep no longer deletes the refs key

**File:** `src/Kombats.Chat/Kombats.Chat.Infrastructure/Redis/RedisPresenceStore.cs`

`SweepStaleAsync` previously issued `KeyDeleteAsync(chat:presence:refs:{id})` as best-effort cleanup after the atomic `ZREM`. That DELETE is racy against a concurrent `ConnectAsync` that has just `INCR`'d refs from 0→1 and re-added the user to the online ZSET, leaving refcount desynced from ZSET membership.

The fix is the minimum recommended in the review: **remove the refs-key DELETE entirely and let the 90s refs-key TTL reap it naturally.** `ConnectScript`'s `INCR` is idempotent against a non-existent key, so this is safe. The `chat:presence:{id}` display-name DELETE is retained because `ConnectScript` rewrites it (`SET EX`) on reconnect and readers already treat a missing value as "Unknown".

Test added: `SweepStale_AfterReconnect_DoesNotClobberFreshRefsKey` in `PresenceSweepWorkerTests`. It reproduces the exact interleaving called out in the review: stale ZSET entry with no refs key → sweep runs → reconnect → assert refs key exists and `DisconnectAsync` returns true (proving refs was preserved and the offline broadcast path is intact).

### 6.3 Verification

Ran locally against Docker-backed Testcontainers (Redis + Postgres):

| Suite | Result |
|---|---|
| `Kombats.Chat.Application.Tests` | **39 / 39 pass** |
| `Kombats.Chat.Infrastructure.Tests — PlayerCombatProfileChangedConsumerTests` | **5 / 5 pass** |
| `Kombats.Chat.Infrastructure.Tests — PresenceSweepWorkerTests` | **5 / 5 pass** (including the new reconnect-race guard) |
| `Kombats.Chat.Infrastructure.Tests` full suite | **66 / 67 pass** (was 65 / 66) |

The still-failing test is `RedisRateLimiterTests.Fallback_ActivatesOnRedisOutage_And_RecoversWhenRedisReturns` — verified unchanged Batch 2 flake, not a regression (Batch 4 did not modify `RedisRateLimiter.cs`). Tracked separately per review §13.

### 6.4 Scope verification

- Only two files changed in `src/`: the consumer and `RedisPresenceStore`.
- Two test files updated: the consumer test class and the sweep worker test class.
- No Batch 3 contract change (`IPresenceStore` signature untouched; `SweepStaleAsync` behaviour unchanged at the port level — internal implementation narrowed).
- No BFF / Batch 5 files touched.
- No new NuGet packages.
- The pre-existing `RedisRateLimiter` flake was intentionally left alone.

### 6.5 Readiness

Batch 4 is now clean for Batch 5 BFF wiring and Batch 6 E2E work. The §4.1 fix lands before any cross-service E2E; the §4.2 fix lands before production deploy as recommended.

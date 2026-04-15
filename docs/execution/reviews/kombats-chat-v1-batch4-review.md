# Kombats Chat v1 — Batch 4 Independent Review

**Date:** 2026-04-15
**Reviewer posture:** Independent, strict.
**Inputs reviewed:** repository code, `kombats-chat-v1-batch4-execution.md`, `kombats-chat-v1-batch4-self-review.md`, plan §Batch 4, decomposition, Batch 3 execution note, frozen Batch 3 contract.

---

## 1. Review verdict

**Approved with required fixes before Batch 5.**

The Batch 4 deliverables are present, scoped correctly, and do not touch the frozen Batch 3 contract. Tests are credible. The single failing test in `Kombats.Chat.Infrastructure.Tests` (`RedisRateLimiterTests.Fallback_ActivatesOnRedisOutage_And_RecoversWhenRedisReturns`) is verifiably in pre-existing Batch 2 code that Batch 4 did not modify (the only diff in `Infrastructure/Redis/` is the new `SweepStaleAsync` method on `RedisPresenceStore`). It is not a Batch 4 regression.

However, two non-trivial behaviour issues should be addressed before Batch 5 begins, because Batch 5 (BFF relay) will surface offline broadcast and consumer-failure semantics to the frontend. Both fixes are tiny.

---

## 2. What is solid

- **Application use case** (`HandlePlayerProfileChangedHandler`) is genuinely thin. `IsReady → "Ready"/"NotReady"` mapping is consistent with Batch 2's eligibility model (`CachedPlayerInfo.IsEligible == OnboardingState == "Ready"`). Tests cover both branches plus the null/blank-name removal path.
- **Consumer** is correctly thin (`PlayerCombatProfileChangedConsumer`): extracts three fields, delegates, logs. No domain logic. Registered explicitly in Bootstrap (no silent assembly scan), matching Matchmaking's pattern.
- **`MessageRetentionWorker`** correctly bounds work via `BatchSize` × `MaxBatchesPerPass`, and global conversation is structurally protected because `DeleteEmptyDirectConversationsAsync` only touches `type = 1` (Direct). Tests prove this with `MessageTtlHours = 0`.
- **`PresenceSweepWorker`** moves the Redis primitives behind `IPresenceStore.SweepStaleAsync` — keeps Redis types out of the worker. The two-sweeper race test is real: it actually runs two workers concurrently and asserts exactly one broadcast.
- **Bootstrap wiring** (`Program.cs:174-200`) is contained inside a clearly-marked Batch 4 block. Options are bound, consumers registered via `AddMessaging<ChatDbContext>`, hosted services added. No Batch 3 wiring touched.
- **Frozen Batch 3 contract** (`/chathub-internal`, hub methods, error codes, DTOs) is genuinely untouched.
- **No new NuGet packages** beyond the central baseline. Only pre-pinned references added to two `.csproj` files, and a `Players.Contracts` project reference.

---

## 3. Critical issues (none)

No correctness defects that block the codebase from being usable. The two items below are real but are correctness/observability concerns that should be resolved before Batch 5 hits the wire — not "the build is broken".

---

## 4. Important issues — should be fixed before Batch 5

### 4.1 Consumer swallows handler failures — MassTransit will treat this as success

`PlayerCombatProfileChangedConsumer.Consume` (lines 31–37) logs a warning on `result.IsFailure` and **returns**. MassTransit then marks the message as successfully consumed; no retry, no redelivery, no fault. The self-review acknowledges this as deliberate.

The reasoning ("cache is self-healing on next HTTP fetch") is partially valid — but:

- For `IsReady = false → NotReady` events, a swallowed failure leaves a stale `Ready` in cache, and the cache is **not** re-fetched until the existing entry expires. Eligibility decisions (`EligibilityChecker`) will then be wrong for the duration of cache TTL.
- Inbox dedup is gated by successful consume. If the consumer always returns success, the inbox records the message as processed and a manual replay won't help.
- Batch 5's BFF relay is the visible surface for these eligibility decisions.

**Fix:** change `return;` after `LogWarning` to `throw new InvalidOperationException(...)` (or just rethrow what the handler reported). One line. The plan's "Idempotency test" gate already covers replay; failure-retry is the standard MassTransit contract.

### 4.2 `SweepStaleAsync` deletes the refs key as best-effort cleanup — race with reconnect

`RedisPresenceStore.SweepStaleAsync` (lines 204–205) issues `KeyDeleteAsync` on `chat:presence:refs:{id}` and `chat:presence:{id}` after a successful `ZREM`. These DELETEs are **not** atomic with the ZREM; in the window between them, a `ConnectAsync` from the same identity (e.g. websocket reconnect) can:

1. Run the `ConnectScript`, which `INCR`s `refs` from 0 → 1, ZADDs the user back as online, broadcasts `PlayerOnline`.
2. The sweeper's `KeyDeleteAsync(refsKey)` then runs and clobbers the freshly-incremented refcount back to nothing.
3. Result: the user appears online in the ZSET, but their refs key is gone. The next `DisconnectAsync` will hit the "refs already gone" branch in `DisconnectScript` (lines 40–47) and silently DEL the user from online without broadcasting `PlayerOffline` — and depending on order with other connections, either the user is stuck "online" forever or quietly disappears.

The window is small but real on a busy single-instance deploy — and the whole point of this code is to handle the "the connection died but Redis didn't know" case. Sweep+reconnect is exactly the scenario.

**Fix options (pick one):**

- Move the cleanup into the same Lua script as the ZREM, gated on the ZSET still being absent for the member, OR
- After the sweeper's ZREM, only DEL `presence:{id}` (display-name JSON). Leave `refs:{id}` alone — its 90s TTL will reap it naturally, and ConnectScript's `INCR` is idempotent against a non-existent key.

Either fix is small. The plan's wording ("Also cleans up presence record and refcount key if they still exist") allows leaving the refs key alone — natural TTL is sufficient.

---

## 5. Non-blocking observations

- `SweepStaleAsync` issues N round-trips per stale member. Acceptable for v1 single-instance scale (self-review §4 already flags this).
- Worker `Task.Delay` cadence is not asserted in CI. Same posture as Batch 3's heartbeat — not a regression.
- `MessageRetentionWorker.RunOnceAsync` test uses `EnsureMigrated()` which calls `ctx.Database.MigrateAsync()` — fine in tests but underscores AD-13's no-startup-migrate rule for production code (Bootstrap correctly does not migrate on startup).
- Options binding from configuration is not exercised by a test — only by build-time compilation. Self-review honestly flags this. Acceptable for hardening posture; not novel for this repo.
- No transport-level inbox dedup integration test. Acceptable — that's MassTransit framework coverage. Business-level replay safety is tested.

---

## 6. Scope-fidelity review

Stayed inside Batch 4 scope. No BFF, no ChatHub relay, no player card endpoint, no E2E.

One justified deviation: workers placed in `Infrastructure/Workers/` (not Bootstrap). Registration (`AddHostedService<>`) lives in Bootstrap — which is what the architecture rule requires (composition in Bootstrap). The class-location choice is acceptable and gives Testcontainers test access without a Bootstrap test project. Matchmaking's contrary choice is precedent, not rule.

One acceptable port extension: `IPresenceStore.SweepStaleAsync` is added. Not a Batch 3 contract change — it's an internal application port. The rest of `IPresenceStore` is untouched.

---

## 7. Consumer and worker review

- **Consumer** mapping covers `IdentityId`, `Name`, `IsReady`. Other fields on `PlayerCombatProfileChanged` (`Strength`, `Agility`, etc.) are intentionally ignored — Chat doesn't need them. Correct per AD-CHAT-03.
- **Idempotency** at the business level is correct (write-only `SetAsync` + `RemoveAsync` are deterministic). Transport-level inbox is wired through `AddMessaging<ChatDbContext>` + `ChatDbContext.AddInboxStateEntity()` from B1.
- **Retention worker:** `IMessageRepository.DeleteExpiredAsync(cutoff, batchSize, ct)` returns row counts; loop terminates correctly when `deleted < BatchSize`. The `MaxBatchesPerPass` cap prevents runaway. Global conversation protection is structural in SQL.
- **Sweep worker:** `IServiceScopeFactory` scoping is correct (`IPresenceStore` is `Scoped`). `IChatNotifier` is singleton — also fine within the scope.

---

## 8. Presence-sweep review

Detailed correctness:

- ✅ ZRANGEBYSCORE → ZREM-per-member is the right approach (StackExchange.Redis can't return removed members from `ZRemoveRangeByScore`).
- ✅ ZREM return-value gating means only the sweeper that actually removed the entry broadcasts. Race test proves this.
- ✅ Worker re-resolves `IPresenceStore` per pass via `IServiceScopeFactory` — correct DI pattern.
- ⚠️ See §4.2 — defensive `KeyDeleteAsync(refsKey)` after ZREM is racy with concurrent reconnect. **Fix before Batch 5.**
- ⚠️ The race test (`RunOnce_TwoSweepersRace_OnlyOneBroadcastsPerStaleEntry`) builds two workers but they call `SweepStaleAsync` against **the same Redis DB**; this is good. However, `notifierA`/`notifierB` are separate `IChatNotifier` substitutes. The test correctly asserts the **sum** is 1. No false positive risk.

---

## 9. Test and verification review

- **Application tests (5 new, 39 total):** strong. Cover both Ready/NotReady branches, eligibility derivation, blank-name removal.
- **Consumer tests (5):** cover delegation + null name + handler-failure-doesn't-throw + replay safety. The "replay safety" test is honestly scoped — it proves business-level safety, not transport-level inbox.
- **Serialization tests (4):** cover full round-trip including `Version`, null `Name`, missing `Version` defaulting to 1 (AD-06 additive evolution). Good.
- **Retention worker tests (4):** real Postgres via Testcontainers. Cover age cutoff, global protection, empty direct cleanup, and batch+drain semantics.
- **Presence sweep tests (4):** real Redis. Cover stale-removed, fresh-preserved, two-sweeper race, no-entries no-op. Race test is the strongest piece of proof here.

**Weak proof / not tested:**
- The §4.2 reconnect race during sweep. No test exercises `ConnectAsync` interleaved with `SweepStaleAsync`.
- The §4.1 retry-on-failure semantic. The `HandlerFailure_DoesNotThrow` test confirms the current (questionable) behaviour but does not assert it's the right behaviour.
- Options binding from `appsettings.json`.

---

## 10. Execution-note honesty review

The execution note and self-review are honest.

- The 65/66 test result is called out explicitly, not buried.
- The deviation list in §3 of the execution note is accurate (workers in Infrastructure, new port method, remove-on-blank-name).
- Self-review §"Hidden gaps" item 1 explicitly flags the consumer-swallows-failure semantic and offers the one-line fix. Item 4 flags the N-round-trip cost. The reviewer didn't have to dig these out.
- The flaky Batch 2 test is correctly attributed (verified: `git diff` of `Infrastructure/Redis/` shows only `RedisPresenceStore.cs` changed in Batch 4 — `RedisRateLimiter.cs` is untouched).

No overstated completion claims.

---

## 11. Failing infrastructure test analysis

`RedisRateLimiterTests.Fallback_ActivatesOnRedisOutage_And_RecoversWhenRedisReturns` is **not a Batch 4 blocker**:

- The test is in Batch 2 code (`tests/.../Redis/RedisRateLimiterTests.cs:109`).
- The implementation under test (`RedisRateLimiter.CheckRedisAsync`) was not modified in Batch 4 — the only Redis file changed was `RedisPresenceStore.cs`, and the change is purely additive (new `SweepStaleAsync` method).
- The failure mode (`TaskCanceledException` during container pause/unpause) is a fixture-timing flake, not a logic regression.
- Batch 3 didn't run the infra suite under Docker, which is why it surfaces now.

It should be logged as a separate execution issue and is not in scope for Batch 4 to fix. Proceed to Batch 5 without fixing it.

---

## 12. Readiness for Batch 5

Batch 5 (BFF relay) does not depend on the consumer or workers running — it depends on Batch 3's frozen contract, which is intact. Batch 5 work can begin in parallel with the §4.1 and §4.2 fixes.

However, **the §4.1 (consumer-failure swallow) fix should land before any cross-service E2E (Batch 6) work begins** because eligibility correctness depends on it. The §4.2 (refs-key race) fix should land before production deploy, but it does not block Batch 5 development.

---

## 13. Required fixes before proceeding

**Required before Batch 6 (recommended before Batch 5 BFF wiring):**

1. **§4.1** — `PlayerCombatProfileChangedConsumer.Consume`: replace the `return;` after `LogWarning` with a `throw` so MassTransit retries failed handler invocations. ~1 line, no other changes.

**Required before production deploy (can land mid-Batch-5):**

2. **§4.2** — `RedisPresenceStore.SweepStaleAsync`: remove the `KeyDeleteAsync(refsKey)` line (let TTL reap it) OR move both DELs into a Lua script gated on the member's continued absence from the online ZSET. Add a test that exercises sweep + concurrent reconnect.

**Tracked separately (not blocking):**

3. Open execution issue (EI-xxx) for `RedisRateLimiterTests.Fallback_Activates...` flake under Docker. Batch 2 ownership.

---

**Final answers:**

- **Is Batch 4 actually complete?** Functionally yes; behaviourally it has two real issues (4.1, 4.2) that should be tightened. Scope and tests are honest.
- **Can work proceed to Batch 5?** Yes. Batch 5 has no hard dependency on these fixes; they should land before E2E.
- **Is the failing infrastructure test a real blocker?** No — verified pre-existing Batch 2 flake; Batch 4 did not touch `RedisRateLimiter`.

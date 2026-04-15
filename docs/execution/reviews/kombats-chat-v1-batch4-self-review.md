# Kombats Chat v1 — Batch 4 Self-Review

**Date:** 2026-04-15
**Scope reviewed:** Batch 4 (consumer + retention worker + presence sweep worker + wiring + tests).
**Review posture:** Strict — same bar as an independent reviewer.

---

## Scope fidelity

| Plan item (§Batch 4) | Status | Evidence |
|---|---|---|
| Application use case `HandlePlayerProfileChanged` with IsReady → onboardingState mapping | ✅ | `HandlePlayerProfileChangedHandler.cs` lines 16–28. `CachedPlayerInfo.IsEligible` still `OnboardingState == "Ready"` — B2 eligibility unchanged. |
| `PlayerCombatProfileChangedConsumer` thin, delegates to handler | ✅ | `PlayerCombatProfileChangedConsumer.cs`; 3 fields/1 behaviour, no domain logic. |
| Inbox/idempotency | ✅ (transport) + ✅ (business) | `ChatDbContext.AddInboxStateEntity()` already present from B1. `AddMessaging<ChatDbContext>` wires the inbox automatically. Handler is write-only SetAsync, so business-layer replay is safe. |
| Consumer registration via assembly scan OR explicit | ✅ explicit | `bus.AddConsumer<PlayerCombatProfileChangedConsumer>()` — matches Matchmaking's explicit registration. No silent scanning. |
| Contract serialization test with Version | ✅ | `PlayerCombatProfileChangedSerializationTests.RoundTrip_PreservesAllFields_IncludingVersion`. |
| `MessageRetentionWorker` — hourly, batched 1000, empty direct conv cleanup, never global | ✅ | Options defaults match plan. Global is structurally never deleted (`DeleteEmptyDirectConversationsAsync` SQL targets `type = 1` only). |
| `PresenceSweepWorker` — 60s, 90s stale, ZREM gating, refcount+presence cleanup | ✅ | Implemented at the port layer (`IPresenceStore.SweepStaleAsync`). Worker receives only members whose ZREM returned 1. |
| Bootstrap wiring: AddMessaging + AddHostedService×2 + options | ✅ | `Program.cs` Batch 4 section. |
| No new NuGet packages beyond baseline | ✅ | Only pre-pinned packages referenced. No `Directory.Packages.props` change. |
| Frozen Batch 3 contract unchanged | ✅ | Hub, events, DTOs, error codes untouched. |
| No Batch 5 (BFF) work | ✅ | No changes under `src/Kombats.Bff/` or `tests/Kombats.Bff/`. |
| No Batch 6 (E2E) work | ✅ | No cross-service E2E tests added. |

## Hidden gaps identified during self-review

1. **Consumer does not throw on handler failure.** The consumer logs a warning and returns. This is deliberate — the failure mode for this path is a downstream Redis hiccup, and we want MassTransit's retry/redelivery pipeline (configured in `Kombats.Messaging`) to handle transient errors via normal consumer failure propagation. However, since I swallow the failure and return, MassTransit considers the message delivered and will NOT retry. **This is correct for cache staleness** (cache entries are self-healing: next HTTP-sourced resolve repopulates) but is a real semantic: a permanently-failing cache write will not retry. Noted here explicitly so the reviewer does not have to guess intent. If retry semantics are desired later, the fix is a single-line `throw new InvalidOperationException(...)` rather than `return`. I did not make that change because the plan does not require it and cache-write failures are not a correctness risk.

2. **Transport-level inbox dedup not tested end-to-end.** I tested that the consumer is replay-safe (calling `Consume` twice with the same message is a no-op at the business layer). I did NOT spin up a MassTransit TestHarness to prove the EF Core inbox dedupes by `MessageId`. Rationale: this is a framework guarantee of `AddMessaging<ChatDbContext>` + `AddInboxStateEntity()` which both exist and are wired. Verifying the framework itself would duplicate MassTransit's own tests. I regard this as appropriately scoped given the strict "no gold plating" hardening rule.

3. **Worker cadence (`Task.Delay`) is not asserted in CI.** Same posture as Batch 3's heartbeat: the `RunOnceAsync` logic is fully covered; the .NET runtime's `Task.Delay` cadence is a framework guarantee, not project code. Flagged as a deferred reliability/perf test.

4. **`SweepStaleAsync` issues N round-trips for N stale members.** For each stale member we ZREM, then delete refs, then delete presence. On a 10k-presence cluster with a large wave of staleness, that's up to 30k RTTs. This is acceptable at current single-instance scale (the plan calls out v1 as "single-instance Chat") and can be upgraded to a Lua script or pipelined batch later. Not a Batch 4 concern.

5. **`RunOnceAsync` is `internal` — test coverage is the only caller.** Same pattern Batch 3 used for `HeartbeatScheduler.TickAsync`. The `ExecuteAsync` loop drives `RunOnceAsync` at runtime.

6. **A pre-existing Batch 2 Redis rate-limiter test is flaky.** `RedisRateLimiterTests.Fallback_ActivatesOnRedisOutage_And_RecoversWhenRedisReturns` fails under Docker due to a `TaskCanceledException` in `RedisRateLimiter.CheckRedisAsync` during the container-pause phase. The failure is unrelated to Batch 4 code — the stack trace shows only Batch 2 Redis logic. This was not re-run in Batch 3 (Docker wasn't available), which is why it went unnoticed then. I have not fixed it because:
   - It is out of Batch 4 scope.
   - Touching `RedisRateLimiter` to fix a transient-failure test would violate the hardening discipline of fixing only one issue at a time.
   - It should be logged into `docs/execution/execution-issues.md` separately as an EI-xxx.

## Test coverage weaknesses (honest assessment)

- No test asserts that the `Chat:Retention` or `Chat:PresenceSweep` options are actually bound from configuration (I hand-instantiate the options in tests). Wiring is verified only by the solution build + Bootstrap exercising `.Configure<T>(section)`. This mirrors Matchmaking's approach — no existing worker in the repo has a configuration-binding test.
- No test of the `configureConsumers`/`configure` callbacks wiring inside Bootstrap. The Bootstrap composition is compilation-checked; assembling a full test host with a real RabbitMQ would be a Phase 7 smoke test, not a Batch 4 unit test.
- No test drives a real `PlayerCombatProfileChanged` through RabbitMQ end-to-end. This is intentionally deferred to Batch 6 per the plan.

## Honesty check on execution note

- Deviations are called out in §3 (workers in Infrastructure; new port method; remove-on-blank-name).
- The flaky pre-existing Batch 2 test is called out explicitly rather than hidden inside a `65/66` count.
- Deferred items are listed in §5 with specific reasons.
- I did not claim framework-level guarantees as "tested in Batch 4" — I explicitly call out the MassTransit inbox as framework-provided and not re-tested.

## Readiness for independent review

**Ready.** Batch 3 contract is unchanged. No BFF / Batch 5 files touched. All Batch 4 scope items delivered with the planned tests. The one pre-existing infra-test flake (`RedisRateLimiter` outage-recovery) is documented and not caused by Batch 4.

Suggested reviewer focus:
- Correctness of the `IsReady → onboardingState` mapping against Batch 2's eligibility model (line 25 in `HandlePlayerProfileChangedHandler.cs`).
- Whether the `NullOrBlankName → RemoveAsync` choice is acceptable, or whether the reviewer prefers `SetAsync` with a fallback name.
- Whether the decision to place workers in `Kombats.Chat.Infrastructure/Workers/` vs. Bootstrap is acceptable.
- Whether the consumer's swallow-failure-and-log-on-handler-failure is acceptable, or whether it should rethrow to trigger MassTransit retry.
- Whether the `Fallback_Activates` test flakiness is worth a follow-up EI.

---

## Addendum — Post-Review Fixes (2026-04-15)

Both issues flagged by the independent review are now addressed:

- **§4.1 (consumer swallows failure):** `PlayerCombatProfileChangedConsumer` now throws `InvalidOperationException` on `result.IsFailure` instead of returning silently. The `HandlerFailure_*` test was inverted to assert throwing. MassTransit retry/redelivery/fault semantics are intact.

- **§4.2 (sweep vs reconnect race):** `RedisPresenceStore.SweepStaleAsync` no longer calls `KeyDeleteAsync` on the `chat:presence:refs:{id}` key — the 90s TTL reaps it naturally and `ConnectScript`'s `INCR` is safe against a non-existent key. The `chat:presence:{id}` (display-name JSON) DELETE is retained. A new `PresenceSweepWorkerTests.SweepStale_AfterReconnect_DoesNotClobberFreshRefsKey` test exercises the exact interleaving.

Test results after fix: Application 39/39, Infrastructure 66/67 (the remaining failure is the pre-existing Batch 2 `RedisRateLimiter` fallback flake, unchanged).

Self-review §"Hidden gaps" items 1 and (partially) 2 are now resolved.

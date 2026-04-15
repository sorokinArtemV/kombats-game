# Kombats Chat v1 — Batch 1 + Batch 2 Independent Review

**Date:** 2026-04-15
**Reviewer:** Independent execution reviewer
**Scope:** Batch 1 (domain + Postgres + read endpoints) and Batch 2 (Redis presence/rate-limit/cache + resolvers + presence endpoint)
**Inputs:** Repository code under `src/Kombats.Chat/` and `tests/Kombats.Chat/`; execution note `kombats-chat-v1-batch1-batch2-execution.md`; self-review; implementation plan; architecture spec.

---

## 1. Review verdict

**Approved with required fixes before Batch 3.**

The code is structurally clean, scope-faithful, and the post-implementation alignment pass (2026‑04‑14) corrected both of the material deviations — read-path side effects in `GetDirectMessages` and placeholder DM display names in `GetConversations`. The canonical `OnboardingState` contract is coherent end-to-end.

However, the plan gates for B1 and B2 explicitly require passing Postgres and Redis integration tests, and ~47 Testcontainer-backed tests have **never been executed** — only compiled. Batch 3 wires the hub directly on top of the Lua presence scripts and the Postgres DM resolution path, both of which are the highest-risk elements in B1/B2. Gate closure must not be skipped.

---

## 2. What is solid

- **Domain model.** `Conversation` enforces sorted-pair invariant at the factory (`CompareTo < 0 ? (a,b) : (b,a)`), has a forward-only `UpdateLastMessageAt`, and exposes the well-known global GUID as `Conversation.GlobalConversationId`. `Message.Sanitize` trims, collapses whitespace, and strips control characters; validation (1–500 chars after sanitization) happens at creation. Content is immutable.
- **Persistence shape.** `ChatDbContext` uses `chat` schema, `UseSnakeCaseNamingConvention`, and registers MassTransit outbox + inbox entities. Unique partial index on `(participant_a, participant_b) WHERE type = 1` is correct. `(conversation_id, sent_at DESC)` index supports the keyset-pagination query literally. DM resolution uses `INSERT ... ON CONFLICT DO NOTHING` + `SELECT` — the race-safe pattern the plan requires.
- **Global seeding.** Seeded via `HasData` in `ConversationConfiguration` with a fixed `CreatedAt`, so migrations are deterministic.
- **Read-path purity (after alignment).** `GetDirectMessages` now calls `GetDirectByParticipantsAsync` (read-only) and returns an empty result when no DM exists. The old `GetOrCreateDirectAsync` call is gone from the read handler and remains available for B3 send flows.
- **Conversation listing (after alignment).** `GetConversationsHandler` now takes `IDisplayNameResolver` and resolves DM display names through the cache → HTTP → "Unknown" chain. No placeholder IDs remain.
- **Eligibility contract.** `CachedPlayerInfo(string Name, string OnboardingState)` with a derived `IsEligible => OnboardingState == "Ready"` (case-insensitive). `DisplayNameResolver` stores the raw `OnboardingState`; `EligibilityChecker` reads the derived property. Single canonical signal, no mixed `IsReady`/`OnboardingState` semantics inside Chat.
- **Lua script correctness (by inspection).** Connect, heartbeat (with `EXISTS` guard — review item I5), and disconnect (GET-then-DECR, no negative refcount) match the architecture spec's intent.
- **Bootstrap wiring is batch-scoped.** No MassTransit bus, no SignalR, no consumers, no workers, no BFF coupling. The file explicitly comments that messaging/SignalR/workers are deferred.
- **Tests exist at every layer.** Domain (23), Application (16), API (8), Infrastructure (~47 Postgres + Redis + resolver service tests) with real `WebApplicationFactory<Program>` and Testcontainers fixtures.
- **Execution note is structurally honest.** Deviations documented. Docker limitation stated. Alignment pass recorded with verification honesty section.

---

## 3. Critical issues

### C1. Plan gates G1 and G2 are not actually closed — only compiled
The B1 gate ("All persistence integration tests pass (real Postgres). DM resolution handles concurrent creation. Migration applies cleanly.") and the B2 gate ("Every Lua script edge case ... covered by a passing test. Rate-limiter fallback activates and deactivates correctly.") require *executed* tests. The execution note states plainly: *"Docker not available ... Tests are correctly written and compile, but execution requires Docker."* The self-review nonetheless lists those gates as ✅.

Consequences if B3 starts without running them:
- A Lua typo, a `@nowMs` type coercion issue, or a `LuaScript.Prepare` parameter-binding surprise would be inherited by the hub in B3 and mis-attributed to hub code.
- The `INSERT ... ON CONFLICT` path for DM creation is never executed; concurrent-DM behavior is unproven. B3 send flows depend on it.
- Migration apply on an empty DB is unverified; first CI run could fail.

**Required:** run the infra test suites (Postgres + Redis Testcontainers, API WAF, resolver service tests) in a Docker-capable environment (local or CI) and record results before opening B3.

### C2. Rate-limiter fallback recovery transition is not tested
Spec/plan require "Redis unavailable → in-memory fallback works correctly" and "Fallback recovery: Redis comes back → distributed limiter resumes." The code does log transitions, but the only fallback tests exercise the happy path. The self-review acknowledges this. Not catastrophic, but this is a correctness-under-failure claim that is currently unverified. Should be added either at the tail of B2 or very early in B3.

---

## 4. Important but non-blocking issues

### I1. Disconnect script reports "last" when refs key has already expired
`local refs = tonumber(redis.call('GET', @refsKey)) or 0; if refs <= 1 then ... return 1`. If the refs key TTL has already lapsed (crash/GC/slow disconnect), `GET` is nil → 0 → enters the branch → returns 1. Callers interpret 1 as "broadcast `PlayerOffline`." After TTL expiry the user is already effectively offline and was not in the ZSET, so a spurious second offline broadcast is possible in B3. Consider `if refs == 0 then return 0 end` before the `<= 1` branch. Not a B1/B2 blocker; flag it for B3 integration.

### I2. `GetOnlinePlayersAsync` N+1 against Redis
Implementation does one `SortedSetRangeByRankWithScoresAsync` then a `StringGetAsync` per member. For `limit=100` that is 101 round-trips per presence HTTP call. `MGET` or a Lua batch would collapse this. Performance only, not correctness.

### I3. `GetConversations` resolves display names sequentially
For a user with N DMs whose names are not in the 7-day cache, the handler performs N HTTP calls to Players serially. Cache hit makes this cheap in steady state, but a cold cache produces latency spikes. Consider `Task.WhenAll` over the resolver. Non-blocking.

### I4. `EligibilityChecker`/`DisplayNameResolver` marked `internal sealed`
Tests for these live in `Infrastructure.Tests` because `Application.Tests` lacks `InternalsVisibleTo`. This is a reasonable pragmatic choice (documented in the execution note), but their logic is conceptually Application-layer orchestration. Consider moving the port-shaped logic behind a public adapter, or adding `InternalsVisibleTo` for the application test project. Not blocking.

### I5. Outbox/Inbox wiring exists with no MassTransit bus registration
Not a defect — the migration needs those tables before B3/B4 wires the bus. Worth an explicit comment in `ChatDbContext` so future readers don't expect the bus to be live already.

### I6. `docs/execution/execution-log.md` / `execution-issues.md` cross-check
Per `CLAUDE.md` execution-tracking discipline, these should reflect B1/B2 state and any open issues (C1/C2 above belong in `execution-issues.md`). Review did not audit those docs in depth; verify before starting B3.

---

## 5. Scope-fidelity review

| Forbidden in B1/B2 | Present? |
|---|---|
| SignalR hub / `ChatHub` | No |
| Connect/Disconnect/Heartbeat use cases | No |
| `SendGlobalMessage` / `SendDirectMessage` / `JoinGlobalChat` | No |
| `MessageFilter` / `UserRestriction` ports | No |
| MassTransit consumer (`PlayerCombatProfileChanged`) | No |
| `MessageRetentionWorker` / `PresenceSweepWorker` | No |
| BFF chat surface | No |
| New NuGet packages beyond baseline | No (spot-checked — StackExchange.Redis, EF Core, Npgsql already pinned) |

Only expected B1+B2 artifacts present. The outbox/inbox tables in the migration are forward-compatible scaffolding, not B3+ behavior.

---

## 6. Batch 1 review

- **Domain** — correct; tests (23) cover sorted-pair, factories, content validation, sanitization, enum values, global constant.
- **Ports** — `IConversationRepository` includes both the read-only `GetDirectByParticipantsAsync` (added in alignment pass) and the write-capable `GetOrCreateDirectAsync` (deferred to B3). Good separation.
- **`GetConversationsHandler`** — returns `ConversationDto(Id, Type, OtherPlayer?, LastMessageAt)` where `OtherPlayer` is null for Global. Shape is acceptable for B1/B2; matches what the plan implies.
- **`GetDirectMessagesHandler`** — validated: reads only, empty result if no DM exists, uses `SortParticipants` for deterministic lookup. No side effects.
- **`GetConversationMessagesHandler`** — validates existence + participant access; keyset pagination; limit clamped to [1, 50].
- **Persistence** — `ChatDbContext` schema and naming are correct. Configurations match spec. `SnakeCaseHistoryRepository` aligns with the repo pattern.
- **Migration** — single `InitialCreate` with conversations, messages, outbox_state, outbox_message, inbox_state all in `chat`. Global seed row present. Apply behavior not yet executed (see C1).
- **API** — three read endpoints, all `[Authorize]`, identity from `User.GetIdentityId()`. Mapped under `/api/internal/...`.
- **Tests** — application unit tests use NSubstitute; Postgres integration tests use `Database.MigrateAsync` (acceptable inside the Testcontainer fixture, not in production startup). Not yet executed.

No blockers inside B1 once C1 is closed.

---

## 7. Batch 2 review

- **Presence store** — three Lua scripts, `LuaScript.Prepare()`, Redis DB 2, TTL 90s, keys `chat:presence:online` (ZSET), `chat:presence:{id}` (string JSON), `chat:presence:refs:{id}` (int). Semantics match spec. Caveat I1 (disconnect after TTL) noted.
- **Rate limiter** — fixed-window `INCR`/`EXPIRE`, per-surface keys, `ConcurrentDictionary` fallback with logged transitions. Fallback-recovery path untested (C2).
- **Player info cache** — `chat:playerinfo:{id}` storing `Name` + `OnboardingState` with 7-day TTL, renewed on hit. JSON errors handled gracefully.
- **Display name resolver** — cache → HTTP `/api/v1/players/{id}/profile` → `"Unknown"`. HTTP success populates cache with `OnboardingState`. Failures not cached.
- **Eligibility checker** — cache → HTTP → reject. Uses derived `IsEligible` (case-insensitive `== "Ready"`). HTTP failure rejects (fail-closed, matches spec Section 16).
- **Online players endpoint** — `GET /api/internal/presence/online?limit=100&offset=0`, `[Authorize]`. Handler clamps limit to [1, 100].
- **Tests** — Redis Testcontainer fixture with collection fixture; Lua edge cases present in test names (multi-tab, no-negative-refcount, heartbeat-after-TTL, presence TTL renewal, online pagination). Not yet executed (C1).

No blockers inside B2 once C1 and C2 are addressed.

---

## 8. Eligibility-contract review

The canonical contract is now consistent end-to-end:

1. **Players public profile** exposes `OnboardingState` (string enum) — confirmed present in the B0 profile endpoint per the execution note.
2. **Cache DTO** (`CachedPlayerInfo`) stores `(Name, OnboardingState)` with derived `IsEligible => OnboardingState == "Ready"`.
3. **`RedisPlayerInfoCache`** JSON payload stores `OnboardingState` directly.
4. **`DisplayNameResolver`** reads `OnboardingState` from HTTP and caches it unchanged.
5. **`EligibilityChecker`** derives readiness via `cached.IsEligible`.

No mixed `IsReady`/`OnboardingState` usage inside Chat. The only surviving `IsReady` boolean lives on the `PlayerCombatProfileChanged` integration event (publisher's domain language, per AD-02); the consumer (B4) will map that boolean to `"Ready"` / `"NotReady"` before caching, which is documented in the execution note.

This is a clean foundation for B3's authoritative eligibility enforcement.

---

## 9. Test and gate review

| Test suite | Count | Runs in CI without Docker | Actually executed? |
|---|---|---|---|
| `Kombats.Chat.Domain.Tests` | 23 | Yes | ✅ Passed |
| `Kombats.Chat.Application.Tests` | 16 | Yes | ✅ Passed |
| `Kombats.Chat.Api.Tests` | 8 | Yes (WAF, no DB/Redis required for these paths) | ✅ Passed |
| `Kombats.Chat.Infrastructure.Tests` (Postgres, Redis, resolver HTTP fakes) | ~47 | No — Testcontainers | ❌ Not executed |

Honest position: **G1 and G2 are closed against code review and compilation, not against execution.** The execution note's own "Verification honesty" section says so. Batch 3 must not treat those gates as green until the suites run in a Docker-capable environment. Treating "tests compile" as "tests pass" is the specific trap the plan gates were written to prevent.

Additional test gap: rate-limiter Redis→fallback→Redis recovery is not exercised (C2).

---

## 10. Execution-note honesty review

Strong points:
- Deviations table explicitly marks the two significant issues as "Resolved in alignment pass" rather than hand-waving them.
- The "Post-Implementation Alignment Pass" section is dated and describes exactly what was changed and why.
- A dedicated "Verification honesty" paragraph declares infra tests are unexecuted and names the gates affected.
- Deferrals to B3/B4/B5 are enumerated.

Weak points:
- The note's top-level Batch 1/2 "Verification" blocks mark infra tests as ⚠️ but the self-review then restates the same gates as ✅ without carrying the caveat forward. The caveat is honest; the summary rollup is slightly optimistic.
- No mention of the rate-limiter fallback-recovery test gap.
- Not clear whether `docs/execution/execution-log.md` and `execution-issues.md` have been updated to match; this review did not audit them.

Overall: the execution note is more honest than most; the self-review summary should inherit its caveats, not soften them.

---

## 11. Readiness for Batch 3

**Can B3 start without reworking B1/B2 foundations?** Yes *in structure*, but not yet *in verification*.

- Structurally, B3 can consume `IConversationRepository.GetOrCreateDirectAsync`, `IMessageRepository.SaveAsync`, `IPresenceStore.Connect/Disconnect/Heartbeat`, `IRateLimiter`, `IEligibilityChecker`, and `IDisplayNameResolver` exactly as the plan envisions. Nothing in B1/B2 is the wrong shape for B3.
- Verification-wise, B3 will integrate directly on top of untested Lua scripts and an untested concurrent-DM-creation path. If either fails under real infra, B3 will inherit and mis-attribute the failure.

Start B3 only after C1 (and ideally C2) are cleared.

---

## 12. Required fixes before proceeding

Must-do before B3 opens:

1. **Run the infrastructure test suites against real Postgres and Redis** (`Kombats.Chat.Infrastructure.Tests`). Record pass counts in the execution note. This closes G1 and G2 as actually-green.
2. **Record any failures as execution issues** in `docs/execution/execution-issues.md` and fix within B1/B2 scope before starting B3.

Should-do (strongly recommended, can be early B3):

3. **Add a rate-limiter Redis→fallback→Redis recovery test** (C2).
4. **Tighten the disconnect Lua script** to return 0 (not 1) when `refs` is nil/0, so stale-TTL disconnects don't trigger spurious `PlayerOffline` broadcasts in B3 (I1).
5. **Update the self-review rollup** so gate rows reflect the honesty caveats already present in the execution note.

Nice-to-have (defer if not trivial):

6. Batch the `GetOnlinePlayersAsync` Redis reads (I2).
7. Parallelize `GetConversationsHandler` display-name resolution (I3).
8. Decide on `InternalsVisibleTo` vs. visibility change for resolver/eligibility tests (I4).

Once items 1–2 are done and green, Batch 3 can proceed.

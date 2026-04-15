# Kombats Chat v1 — System Audit

**Auditor role:** Independent cross-cutting reviewer
**Date:** 2026-04-15
**Scope:** `Kombats.Chat.*`, `Kombats.Bff.*` (chat-related surfaces), Chat↔Players messaging integration, runtime/config/health/observability posture.
**Basis:** Direct reading of source, tests, and execution artefacts at HEAD of `kombats_full_refactor` plus the uncommitted Batch 6 pre-merge fix (readiness health checks).

---

## 1. Audit Verdict

**Architecturally sound with required follow-up fixes.**

The Chat v1 slice is one of the cleanest modules in the repository. Layering is intact, the composition root is disciplined, messaging uses the outbox/inbox consistently with AD-01, and the BFF→Chat relay is the right shape for the problem. The follow-ups are real but narrow: an empty placeholder Contracts project, missing explicit version fields on the frozen hub contract, a mid-session JWT refresh gap in the relay, a best-effort (non-shared) rate-limiter fallback, and the already-tracked Phase 7A items (BFF health aggregation, OTLP endpoint, Redis Sentinel, performance baselines). None of these block merge; each has a defensible story and most are explicitly carried forward in `execution-issues.md` (EI-067…EI-072).

No forbidden patterns were found: no controllers, no MediatR, no cross-schema access, no synchronous service-to-service call, no `Database.MigrateAsync()` on startup, no `DependencyInjection.cs` in Infrastructure, no `Kombats.Shared` references, no `Combats.*` namespace regressions, no dev auth bypass.

---

## 2. What Is Strong

- **Composition discipline.** `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs` is the sole composition root. Api/Application/Infrastructure projects contain no DI wiring. Clean Architecture dependency direction is actually followed, not just declared.
- **Messaging correctness.** `ChatDbContext.OnModelCreating` registers both `AddInboxStateEntity()` and `AddOutboxStateEntity()` + `AddOutboxMessageEntity()`. `PlayerCombatProfileChangedConsumer` is a thin wrapper that delegates to an Application handler. MassTransit is pinned at 8.3.0 through central package management. Chat deliberately publishes nothing — a read-through/realtime service has no reason to emit events, and the code honours that.
- **Redis modelling.** Presence/refcount/rate-limit logic is done in well-documented Lua (`RedisPresenceStore.cs` ConnectScript/DisconnectScript/HeartbeatScript). Chat is isolated to Redis DB 2 — no accidental coupling with Battle (DB 0) or Matchmaking (DB 1). TTLs are explicit; the refcount key is deliberately left to expire rather than being actively deleted during sweep, which is the right decision for multi-tab safety and is documented inline.
- **BFF relay design.** `ChatHubRelay` treats every downstream invocation with a bounded timeout (15s, EQ-5 option b), distinguishes intentional close from unintentional drop via `ChatConnection.IntentionalClose`, forwards the frozen Batch 3 event names verbatim with no remapping, and surfaces a single deterministic `ChatConnectionLost` frontend event for all failure shapes. This is the correct shape for this problem.
- **Auth isolation in BFF.** Per AD-17, BFF deliberately inlines Keycloak bearer setup instead of referencing `Kombats.Abstractions.Auth`. The duplication is intentional and documented in-code. No dev bypass middleware in release builds.
- **Test coverage shape.** Layered correctly: Domain unit tests, Application handler tests with stubbed ports, Infrastructure integration tests with real Postgres + Redis via Testcontainers, Api tests via `WebApplicationFactory`, and BFF relay behaviour tests against a real in-process Kestrel SignalR hub. No EF in-memory provider. No mocked `DbContext`/`IDatabase`/`IPublishEndpoint` in integration tests.
- **Hardened readiness (Batch 6 pre-merge fix).** `/health/ready` now probes Postgres, Redis, and RabbitMQ — every hard runtime dependency of delivered functionality. `/health/live` is a distinct process-liveness-only endpoint. `HealthReadinessRegistrationTests` verifies the wiring.
- **No scope creep in the slice.** There is no speculative abstraction layer, no moderation framework, no notification substrate — only the v1 surface the product asked for.

---

## 3. Critical Issues

**None.** No blocker was found. Everything below is follow-up, not "must-fix-before-merge".

---

## 4. Important But Non-Blocking Issues

1. **`Kombats.Chat.Contracts` is an empty project.** The `.csproj` has no source files. It is a placeholder that was never filled because Chat emits no integration events. Either (a) delete the project and drop it from the solution, or (b) move the Batch 3 frozen hub DTOs into it and reference it from both BFF and Chat to eliminate the duplicated shape in `Kombats.Bff.Application.Models.Internal.InternalChatModels` and `Kombats.Bff.Api.Models.Responses.ChatResponses`. Leaving an empty project is mildly misleading — it implies a cross-service contract surface that does not exist.

2. **No `Version` field on the frozen hub contract.** The Batch 3 freeze is enforced only by documentation and tests; there is no schema-level marker. For a Minimal API + SignalR internal surface owned by a single team this is tolerable, but any additive change to event payloads is silently accepted by the relay (`connection.On<object>(...)`). A `Version: int` on the server-sent events would make drift observable at the BFF boundary instead of in production.

3. **Mid-session JWT expiry in `ChatHubRelay`.** The access token is captured at connect time (`ChatHubRelay.cs:~90`) and reused by the `AccessTokenProvider`. SignalR will call the provider on internal reconnects, but the captured closure cannot refresh. When the frontend JWT expires, the downstream auth fails and the frontend receives `ChatConnectionLost`. For a typical ~1h token TTL this is survivable, but the relay should eventually accept a token-refresh callback. The code already contains a TODO-style comment acknowledging the gap; lift it into `execution-issues.md` as a tracked Phase 7B/8 item.

4. **Rate-limiter in-memory fallback is per-instance.** `RedisRateLimiter` falls back to in-memory buckets when Redis is unavailable. That is the right liveness trade-off, but the fallback is not shared across BFF/Chat instances, so under Redis outage a horizontally scaled Chat deployment effectively multiplies the rate limit by the instance count. Document this as intentional and surface a metric/log so operators notice when Chat is running in degraded limiter mode.

5. **BFF `/health` does not aggregate Chat.** Tracked as EI-067. `Kombats.Bff.Api.Endpoints.Health.HealthEndpoint` probes Players/Matchmaking/Battle but omits Chat. Chat outage shows up as per-request 502s instead of being visible at the aggregate. Fix in Phase 7A.

6. **OTLP exporter is conditional and empty by default.** Tracked as EI-068. Chat wires `AddOtlpExporter` only if `OpenTelemetry:OtlpEndpoint` is configured. Good for tests, bad for operational defaults once a collector is chosen. Phase 7A.

7. **Redis Sentinel not configured (AD-08).** Tracked as EI-069. Affects Chat, Matchmaking, Battle. Phase 7A.

8. **No cross-service topology smoke / chaos harness.** Tracked as EI-070. The test suite covers layers very well; it does not validate the full BFF↔Chat↔Players wiring end to end. Phase 7B.

9. **Direct message conversation creation has no explicit optimistic-concurrency handling.** `GetOrCreateDirectAsync` issues a find-or-insert. Two near-simultaneous first-DMs between the same pair can race and one INSERT will violate the unique constraint, bubbling as a 500. Real-world collision probability is negligible, but the handler should catch the unique-constraint violation and re-read the canonical row.

10. **`Kombats.Chat.Contracts` vs. BFF DTO duplication.** Even if the Contracts project is kept empty, the duplicated DTO shape between `Kombats.Chat.Api.Responses.*` and `Kombats.Bff.Application.Models.Internal.InternalChatModels` is a drift hazard. This is per-architecture (§11: "no shared DTO package"), so the mitigation is test-level: ensure the BFF client tests pin the exact JSON shape.

---

## 5. Project / Layering Review

**Project inventory matches the target structure exactly:**

```
src/Kombats.Chat/
  Kombats.Chat.Bootstrap   (Microsoft.NET.Sdk.Web, sole composition root)
  Kombats.Chat.Api         (Microsoft.NET.Sdk — endpoints + InternalChatHub + middleware)
  Kombats.Chat.Application (handlers, ports, notifications)
  Kombats.Chat.Domain      (Conversation, Message — pure C#)
  Kombats.Chat.Infrastructure (EF, Redis, MassTransit consumer, hosted workers)
  Kombats.Chat.Contracts   (empty — placeholder)

src/Kombats.Bff/
  Kombats.Bff.Bootstrap, Kombats.Bff.Api, Kombats.Bff.Application
```

**Dependency direction:** Verified by inspection. Domain references nothing but `Microsoft.Extensions.Logging.Abstractions` equivalents. Application references Domain + `Kombats.Abstractions`. Infrastructure references Application + Domain + `Kombats.Messaging` + `Kombats.Players.Contracts` (for the inbound message contract only) + EF/Npgsql/StackExchange.Redis/MassTransit. Bootstrap references Api + Application + Infrastructure + Domain.

**SDK usage:** Only `Kombats.Chat.Bootstrap` uses `Microsoft.NET.Sdk.Web`. Api is a plain library — the target "Api is not a composition root" rule holds.

**Layering violations searched for, not found:**
- No EF / Redis / MassTransit / SignalR types in Application or Domain.
- No `DependencyInjection.cs` in Infrastructure.
- No domain logic in endpoints (`src/Kombats.Chat/Kombats.Chat.Api/Endpoints/*`), in `InternalChatHub`, or in consumers. Each is an extract-request → call-handler → return shell.
- `Program.cs` is the only place that touches `WebApplication`, `IHealthChecksBuilder`, `IConnectionMultiplexer`, or `AddMessaging`.
- No MVC, no controllers, no `[ApiController]`.
- No MediatR — handlers registered directly in `Program.cs` against `ICommandHandler<>` / `IQueryHandler<,>` from `Kombats.Abstractions`.
- No `Database.MigrateAsync()` on startup (Program.cs has an explicit comment citing AD-13).

**Namespace check:** All production code uses `Kombats.*`. No `Combats.*` regressions in Chat or BFF Chat code.

**Legacy references:** No `Kombats.Shared` references from Chat or BFF Chat code.

---

## 6. BFF / Chat Integration Review

**Flow:**
1. Frontend → BFF `ChatHub` at `/chathub` (public, bearer JWT).
2. BFF `ChatHub` holds per-frontend-connection state; on `OnConnectedAsync` it asks `IChatHubRelay` to open a downstream HubConnection to Chat's `/chathub-internal`.
3. `ChatHubRelay.ConnectAsync` captures the frontend's access token, opens a `HubConnection` with SignalR, propagates `traceparent`/`tracestate` as headers, and registers blind forwarders for the frozen Batch 3 events (`GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`).
4. Frontend invocations (`JoinGlobalChat`, `LeaveGlobalChat`, `SendGlobalMessage`, `SendDirectMessage`) are relayed 1:1 via `InvokeCoreAsync` with a 15s timeout.

**Assessment:**
- The relay stays in the orchestration lane. It does not decode or interpret payloads — it forwards blobs. That is correct: the BFF is not a second business layer.
- Timeout + teardown + `ChatConnectionLost` is a single, predictable failure model for the frontend. This is materially better than leaking heterogeneous SignalR exceptions upward.
- Intentional-vs-unintentional close is tracked per connection so planned teardowns do not emit spurious `ChatConnectionLost`.
- Read-path HTTP endpoints (`GetConversationsEndpoint`, `GetConversationMessagesEndpoint`, `GetDirectMessagesEndpoint`, `GetOnlinePlayersEndpoint`) in `Kombats.Bff.Api.Endpoints.Chat` are thin HTTP proxies that call `IChatClient` and map DTOs. No caching, no fan-out — correct for v1.
- The player-card endpoint (`Kombats.Bff.Api.Endpoints.PlayerCard.GetPlayerCardEndpoint`) fetches via `IPlayersClient` with timeout + retry (GET-only) + circuit breaker configured in `Kombats.Bff.Bootstrap.Program.cs`. No cache, which is fine for v1 and cited in the architecture package.
- BFF → service HTTP is synchronous and explicitly permitted by the architecture (AD-09 prohibits synchronous **service-to-service** calls; the BFF is the product-facing orchestrator). Nothing about this violates AD-09.

**Weaknesses that should be tracked:**
- Token refresh mid-session (see §4.3).
- JSON shape drift protection is test-based, not schema-based (see §4.2 and §4.10).
- No backpressure on the relay — a pathological send-rate from a single client can only be controlled by the server-side rate limiter in Chat. Given the rate limiter exists, this is fine.

---

## 7. Contracts and Messaging Review

**Contracts:**
- `Kombats.Chat.Contracts` is empty — no integration events are published from Chat. This is consistent with the design (Chat is read-through + realtime). Either delete the project or repurpose it to host the frozen internal hub/HTTP DTOs.
- The frozen Batch 3 contract (hub method names, event names, DTO shapes) is encoded implicitly in BFF code (`ChatHubRelay.RelayedEventNames`, `InternalChatModels`) and Chat code (`InternalChatHub`, `ChatResponses`). No `Version` field on events. Contract stability is test-enforced, not schema-enforced.
- Inbound contract: `Kombats.Players.Contracts.PlayerCombatProfileChanged`. Consumed via MassTransit with `Map<PlayerCombatProfileChanged>("PlayerCombatProfileChanged")` topology in `AddMessaging`. Correct.

**Messaging:**
- Outbox + inbox both enabled on `ChatDbContext` (`AddOutboxMessageEntity`, `AddOutboxStateEntity`, `AddInboxStateEntity`).
- `PlayerCombatProfileChangedConsumer` is thin; the handler (`HandlePlayerProfileChangedHandler`) does the work. Inbox ensures at-most-once effective semantics; handler is additionally idempotent (cache SET over identity key).
- No `Publish()` / `Send()` anywhere in Chat outside outbox scope — in fact, Chat does not publish at all.
- `AddMessaging<ChatDbContext>(...)` is the single entry point and is the shared `Kombats.Messaging` configuration. No per-service divergence.
- MassTransit pinned at 8.3.0 via central package management.

**Gaps:**
- Consumer idempotency test was not observed for `PlayerCombatProfileChangedConsumer` specifically at the consumer integration level (handler-level determinism is tested). The inbox covers correctness; an explicit "same message twice → single effect" test would harden the contract.

---

## 8. Runtime and Observability Review

- **Config:** Options bound via `IOptions<T>` with explicit `SectionName` constants (`MessageRetentionOptions`, `PresenceSweepOptions`, `ServicesOptions`). No `IValidateOptions` guards — invalid config is detected only at use-site. Acceptable for v1; tighten during Phase 7A if misconfiguration becomes a support cost.
- **Serilog:** Read from configuration; request logging middleware enabled. No secrets in logs observed.
- **OpenTelemetry:** `AddAspNetCoreInstrumentation`, `AddHttpClientInstrumentation`, `AddSource("Npgsql")`, optional OTLP exporter when `OpenTelemetry:OtlpEndpoint` is present. `traceparent`/`tracestate` is manually propagated into the downstream SignalR handshake headers by the BFF relay — this is the right mechanism; SignalR does not propagate W3C context automatically.
- **Health checks:** `/health/live` predicate returns none (true liveness, no dependency probing). `/health/ready` aggregates Postgres + Redis + RabbitMQ (Batch 6 pre-merge fix). Both `AllowAnonymous`. Matches the convention used by the other services.
- **CORS:** Dev is wide-open; non-Development fails fast if `Cors:AllowedOrigins` is empty. Correct fail-closed posture.
- **HTTPS redirection:** Enabled.
- **Docker compose:** Not re-audited here; the Chat service is expected to plug into the shared `kombats` Postgres DB and the shared Redis/Rabbit topology from the root compose file. Sentinel setup is explicitly deferred to Phase 7A (EI-069).

---

## 9. Test Architecture Review

**Structure:**
```
tests/Kombats.Chat/
  Kombats.Chat.Domain.Tests          — pure unit
  Kombats.Chat.Application.Tests     — 10 handler test classes, stubbed ports
  Kombats.Chat.Infrastructure.Tests  — Testcontainers Postgres + Redis
  Kombats.Chat.Api.Tests             — WebApplicationFactory<Program>, InternalChatHubTests, endpoint tests, HealthReadinessRegistrationTests
tests/Kombats.Bff/
  Kombats.Bff.Api.Tests              — endpoint structure + HTTP tests, hub tests
  Kombats.Bff.Application.Tests      — ChatHubRelay tests (unit + behaviour against real Kestrel SignalR), ChatClient/PlayersClient tests
```

**Strengths:**
- Layering matches the test strategy document. Infra tests use real Postgres and Redis.
- Hub auth negatives (unauthenticated connection rejected) are covered in `InternalChatHubTests`.
- Relay behaviour tests run against a real in-process SignalR server — not a mock. This catches serialization and reconnection issues that in-memory tests miss.
- `HealthReadinessRegistrationTests` verifies that Postgres + Redis + Rabbit are wired into the readiness aggregate.

**Blind spots:**
- No explicit consumer-level idempotency test for `PlayerCombatProfileChangedConsumer` (see §7 gap).
- No live-outage readiness test (e.g. stop Redis Testcontainer, assert 503). Tracked as EI-072.
- No cross-service topology test (no BFF↔Chat↔Players E2E). Tracked as EI-070. Acceptable trade-off for v1.
- No performance baselines (EI-071). Acceptable; Phase 7B.
- No assertion that the frozen Batch 3 event name set is exactly `{GlobalMessageReceived, DirectMessageReceived, PlayerOnline, PlayerOffline, ChatError}` — a single pin-test in BFF would make drift loud.

---

## 10. Maintainability and Extensibility Assessment

The code is readable, well-named, and composed of small pieces with clear seams. Handlers are per-use-case, ports are explicit, and the relay is factored so that a future token-refresh story or a future contract-version story would land at obvious points without redesign.

**Future directions preserved:**
- **More channels (party, guild, whisper rooms):** `Conversation` is already a typed aggregate; adding a new `ConversationType` and a new hub method is additive. The relay would register additional event names in `RelayedEventNames`.
- **Richer player card:** The BFF endpoint already isolates the mapping from the Players client to the frontend shape. Extensions land in `PlayerCardResponse` + `ChatMapper` without touching Chat.
- **Notifications / unread counters:** Natural fit as a read-model projection + a new Redis key namespace. No existing abstraction would resist this.
- **Moderation:** `IMessageFilter` + `IUserRestriction` are already ports; richer moderation substitutes the implementation.
- **Horizontal scale:** Presence is already a shared Redis ZSET designed for multi-instance. SignalR backplane (Redis) is a drop-in addition at Bootstrap.
- **Versioned contracts:** Adding a `Version: int` to server-sent events is additive and only requires the relay to accept the extra field (it already uses `object` deserialization).

**Friction points for future work:**
- The rate-limiter fallback being per-instance will start to bite if Chat is scaled horizontally while Redis is degraded; worth documenting the operational expectation.
- The empty `Kombats.Chat.Contracts` project will either need to be deleted or repurposed before a second consumer (beyond BFF) of Chat's internal surface exists.

Overall, the slice is maintainable and the design does not paint the team into a corner.

---

## 11. Required Fixes / Recommended Follow-Up

**Before merge to main:** none.

**Short-term (within the current hardening window):**
- Either delete `Kombats.Chat.Contracts` from the solution or move the frozen hub DTOs into it. Do not leave an empty project file asserting a cross-service contract that does not exist.
- Add a pin-test in BFF asserting `ChatHubRelay.RelayedEventNames` contents exactly. Cheap, catches drift early.
- Add a single `PlayerCombatProfileChangedConsumer` idempotency test at the MassTransit level (duplicate MessageId → single handler effect), covering the inbox contract explicitly for Chat.
- Catch unique-constraint violation in `GetOrCreateDirectAsync` and re-read, instead of surfacing as 500.

**Phase 7A (already tracked):**
- EI-067: Include Chat in BFF aggregate health.
- EI-068: Wire an OTLP exporter by default for all services.
- EI-069: Redis Sentinel (AD-08).
- EI-072: Live-outage readiness integration test.

**Phase 7B / later (already tracked or recommended):**
- EI-070: Cross-service docker-compose smoke and chaos harness.
- EI-071: p50/p95 baselines for `SendGlobalMessage`, `SendDirectMessage`, conversation history, online-players.
- Accept a token-refresh callback in `ChatHubRelay.ConnectAsync` so long-lived sessions survive JWT rotation without a forced reconnect.
- Introduce `Version: int` on frozen hub events (additive, compatible) and assert it in relay/contract tests.

---

## 12. Direct Answers to Audit Questions

**Is the Chat slice architecturally sound in the current system?**
Yes. Layering, composition, messaging (outbox/inbox), persistence, Redis modelling, and the BFF relay all hold up. The module complies with the hardening-mode constraints and architecture decisions, and does not extend forbidden patterns.

**Are there any serious boundary/integration/code-quality problems?**
No serious ones. The issues identified are follow-ups: an empty Contracts project, no explicit contract version field, a mid-session JWT refresh gap, per-instance rate-limiter fallback during Redis outage, and the already-tracked Phase 7A observability/health items.

**Is the implementation maintainable enough to keep and extend?**
Yes. The code is production-grade, not demo-grade. Future channels, richer player card, notifications, moderation, horizontal scale, and versioned contracts all have clean extension points without redesign.

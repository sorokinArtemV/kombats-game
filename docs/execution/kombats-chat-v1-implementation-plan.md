# Kombats Chat v1 — Implementation Plan

**Status:** Ready for approval
**Date:** 2026-04-14
**Inputs:**
- `docs/architecture/kombats-chat-v1-architecture-spec.md` (approved)
- `docs/architecture/reviews/kombats-chat-v1-architecture-review-round2.md` (approved, no blockers)
- `docs/execution/kombats-chat-v1-decomposition.md` (approved)

**Purpose:** Turn the approved decomposition into an execution-ready plan. After approval of this document, the next step is implementation — not another planning round.

---

## 1. Implementation Objective

Deliver Kombats Chat v1 as described in the approved architecture spec. The result is:

- A new `Kombats.Chat` service (Bootstrap/Api/Application/Domain/Infrastructure/Contracts)
- BFF chat surface (ChatHub, ChatHubRelay, ChatClient, HTTP proxies, player card endpoint)
- One new Players endpoint (`GET /api/v1/players/{identityId}/profile`)
- Full test coverage per the approved test strategy

The implementation follows the approved batch structure (Batches 0-6) with the parallelization and dependency graph defined in the decomposition.

---

## 2. Locked Inputs and Decisions

These are settled. Implementation must not reopen them.

| ID | Decision | Source |
|---|---|---|
| A1 | Chat is a standalone service following per-service project template | AD-CHAT-01 |
| A2 | BFF is the sole client-facing boundary | AD-CHAT-02 |
| A3 | Players is sole source of truth for profiles; Chat caches display names and readiness only | AD-CHAT-03 |
| A4 | `IdentityId` is canonical cross-service identifier; client-facing name is `playerId` | AD-CHAT-04 |
| A5 | v1 topology: per-user BFF relay, single-instance Chat, single-instance BFF | AD-CHAT-05 |
| A6 | PostgreSQL `chat` schema + Redis DB 2 | AD-CHAT-06 |
| A7 | MassTransit 8.3.0, transactional outbox, `Kombats.Messaging` | System constraint |
| A8 | 24-hour message retention | AD-CHAT-07 |
| A9 | Global conversation: hardcoded constant `00000000-0000-0000-0000-000000000001` | OQ-1 option a |
| A10 | No new NuGet packages beyond approved baseline | System constraint |
| A11 | `PlayerCombatProfileChanged` contract already exists | Pre-existing |
| EQ-3 | DTOs duplicated in Chat Api and BFF Application (no shared DTO project) | Decomposition |
| EQ-4 | BFF skips Layer 1 eligibility check; Chat Layer 2 is authoritative | Decomposition |
| I1 | Rate-limit algorithm is fixed-window counter (relabel from "sliding window") | Review round 2 |
| I2 | Internal hub parameter: use `recipientPlayerId` (align with event payloads) | Review round 2 |
| I4 | `lastMessageAt`: denormalized column updated on each message insert | Spec Section 8 |

---

## 3. Overall Execution Strategy

### Why this order

The plan follows a bottom-up, dependency-driven order:

1. **Foundation first (Batch 0):** Project skeleton + Players endpoint must exist before any Chat-domain work. Every batch depends on B0.
2. **Data layers in parallel (Batches 1 and 2):** Postgres persistence and Redis infrastructure have zero mutual dependencies. Parallel execution shortens the critical path.
3. **Hub as integration point (Batch 3):** The internal hub wires together persistence (B1) and Redis (B2). It is the critical-path bottleneck and gets focused attention.
4. **Background + BFF in parallel (Batches 4 and 5):** Consumer/workers (B4) and BFF surface (B5) both depend on B3 but not on each other. Parallel execution shortens the tail.
5. **E2E validation last (Batch 6):** Full system must be assembled before end-to-end testing.

### Where parallel work is allowed

| Parallel pair | Condition |
|---|---|
| B1 (Postgres) and B2 (Redis) | Both can start as soon as B0 completes |
| B4 (consumer/workers) and B5 (BFF) | Both can start as soon as B3 completes. B5 additionally requires internal hub contract to be frozen (see Section 5). |
| Within B5: ChatHub + HTTP endpoints | Can be built in parallel after BFF bootstrap wiring is in place |

### Where work must be sequential

| Sequence | Reason |
|---|---|
| B0 → B1, B2 | Skeleton must exist |
| B1, B2 → B3 | Hub requires both persistence and Redis |
| B3 → B4, B5 | Consumer/BFF require assembled Chat service and stable contracts |
| B5 → B6 | E2E tests require full system |

### How the plan minimizes integration churn

- Contract surfaces are frozen at explicit stabilization points (Section 5) before consumers build against them.
- DTOs are duplicated, not shared — changes in Chat internal DTOs require explicit propagation to BFF, which forces a conscious compatibility check.
- The internal hub method signatures are defined as the first task in B3, before any BFF relay work begins.
- The Players profile endpoint ships in B0, so both the display-name resolver (B2) and the player card endpoint (B5) can build against a stable, tested response shape.

---

## 4. Phase and Batch Implementation Plan

### Phase 1: Foundation

#### Batch 0 — Project Skeleton + Players Profile Endpoint

**Goal:** Chat service exists in the solution, builds, and starts as an empty host. Players profile endpoint is available. Test infrastructure is scaffolded.

**Prerequisites:** None.

**Implementation tasks (in order):**

1. **Verify and align existing Chat project structure:**
   - The Chat project skeleton already exists in the repository: six projects under `src/Kombats.Chat/` (Bootstrap, Api, Application, Domain, Infrastructure, Contracts) and four test projects under `tests/Kombats.Chat/`. Do not create from scratch — verify and align.
   - Verify SDKs: Bootstrap = `Microsoft.NET.Sdk.Web`, all others = `Microsoft.NET.Sdk`
   - Verify all six projects are in `Kombats.sln`
   - Verify project references per dependency graph (Bootstrap → Api → Application → Domain; Infrastructure → Application + Domain; Bootstrap → Infrastructure)
   - Verify `InternalsVisibleTo`: Application → Infrastructure, Bootstrap; Infrastructure → Bootstrap
   - Verify package references via central package management (no inline versions): EF Core, Npgsql, StackExchange.Redis, MassTransit 8.3.0, FluentValidation, Microsoft.AspNetCore.OpenApi
   - Verify references to `Kombats.Messaging`, `Kombats.Abstractions`, `Kombats.Players.Contracts`
   - Verify `Program.cs` in Bootstrap has a minimal host setup
   - Fix any gaps found during verification
   - Verify: `dotnet build` succeeds for the full solution

2. **Verify Chat Contracts project:**
   - `Kombats.Chat.Contracts` — already exists, verify it is empty with zero NuGet deps and `Microsoft.NET.Sdk`

3. **Verify and align test project structure:**
   - Four test projects already exist under `tests/Kombats.Chat/`: Domain.Tests, Application.Tests, Infrastructure.Tests, Api.Tests
   - Verify all four are in `Kombats.sln`
   - Set up shared Testcontainers fixtures in Infrastructure.Tests for PostgreSQL and Redis (if not already present)
   - Set up `WebApplicationFactory<Program>` bootstrap in Api.Tests (if not already present)
   - Verify: `dotnet test` runs (no tests yet, but projects compile)

4. **Implement Players profile endpoint:**
   - Application: `GetPlayerProfileQuery(Guid IdentityId)`, `GetPlayerProfileQueryHandler`, `GetPlayerProfileQueryResponse` (PlayerId, DisplayName, IsReady, Level, Strength, Agility, Intuition, Vitality, Wins, Losses)
   - **`IsReady` field:** Maps from `CharacterStateResult.State == OnboardingState.Ready`. This field is required by Chat's Layer 2 eligibility enforcement (see Batch 3) and by the display-name resolver's HTTP fallback path.
   - Handler loads `Character` by `IdentityId`, leverages existing `CharacterStateResult.FromCharacter()`, maps to response. Returns not-found if character doesn't exist.
   - Api: `GET /api/v1/players/{identityId}/profile`, `[Authorize]`, any authenticated user can query any player
   - Bootstrap: handler registration + endpoint mapping (verify auto-scan covers it)
   - Tests: Players profile endpoint tests — 200 with valid player (verify `IsReady` matches onboarding state), 404 for unknown, auth enforcement

5. **Docker-compose verification:**
   - A Chat service entry already exists in `docker-compose.yml`. Verify it has the correct configuration:
   - Connection strings: Postgres (same instance, `chat` schema), Redis (DB 2), RabbitMQ, Keycloak
   - Dependency ordering: postgres, redis, rabbitmq, keycloak → chat
   - Fix any gaps in the existing entry

**Batch outputs:**
- Chat solution structure verified and aligned, `dotnet build` passes
- Chat Bootstrap starts as empty host
- `GET /api/v1/players/{identityId}/profile` is live and tested (including `IsReady` field)
- Docker-compose runs Chat alongside existing services
- Test projects compile, Testcontainers fixtures ready

**What is NOT in Batch 0:** No ChatDbContext, no entity configurations, no EF Core migrations, no domain entities, no Redis connections, no hub.

**Gate:** `dotnet build` succeeds. `dotnet test` succeeds. Players profile endpoint returns correct data including `IsReady`. Docker-compose starts Chat alongside existing services. Review: project structure matches appendix in architecture spec.

---

### Phase 2: Core Data Layers (Parallel)

#### Batch 1 — Domain Model + PostgreSQL Persistence

**Goal:** Chat can persist and retrieve conversations and messages. Full domain model, database schema, repositories, and read-path HTTP endpoints.

**Prerequisites:** Batch 0 (project skeleton exists).

**Parallelizable with:** Batch 2 (zero shared code between Postgres and Redis work).

**Implementation tasks (in order):**

1. **Domain model:**
   - `ConversationType` enum: `Global = 0, Direct = 1`
   - `Conversation` entity:
     - Properties: `Id` (Guid), `Type` (ConversationType), `CreatedAt` (DateTimeOffset), `LastMessageAt` (DateTimeOffset?), `ParticipantAIdentityId` (Guid?), `ParticipantBIdentityId` (Guid?)
     - Factory: `CreateGlobal(Guid wellKnownId)` — sets Type=Global, no participants
     - Factory: `CreateDirect(Guid participantA, Guid participantB)` — sorted-pair invariant (smaller GUID in A), sets Type=Direct
     - Method: `UpdateLastMessageAt(DateTimeOffset sentAt)` — updates denormalized field
     - Constant: `public static readonly Guid GlobalConversationId = new("00000000-0000-0000-0000-000000000001");`
   - `Message` entity:
     - Properties: `Id` (Guid v7), `ConversationId` (Guid), `SenderIdentityId` (Guid), `SenderDisplayName` (string), `Content` (string), `SentAt` (DateTimeOffset)
     - Factory method with validation: content length 1-500, trim, collapse whitespace, strip control chars
   - Domain tests:
     - Conversation sorted-pair invariant (smaller GUID always first, regardless of input order)
     - Conversation factory methods (global produces correct type, direct produces sorted pair)
     - Message content validation: too long rejected, empty rejected, whitespace-only rejected after sanitization, control chars stripped, whitespace collapsed
     - Message factory populates all fields
     - Well-known global conversation ID is the expected constant
     - ConversationType enum values

2. **Application ports (persistence-related only):**
   - `IMessageRepository`: `SaveAsync(Message)`, `GetByConversationAsync(conversationId, before?, limit)`, `DeleteExpiredAsync(olderThan)`, `CountByConversationAsync(conversationId)`
   - `IConversationRepository`: `GetByIdAsync(id)`, `GetOrCreateDirectAsync(participantA, participantB)`, `GetGlobalAsync()`, `ListByParticipantAsync(identityId)`, `UpdateLastMessageAsync(id, sentAt)`, `DeleteEmptyDirectConversationsAsync()`

3. **Application use cases (read-path only):**
   - `GetConversationMessages` — takes conversationId + pagination params, validates caller is a participant (or conversation is Global), delegates to repository
   - `GetConversations` — returns caller's conversations (Global + Direct where caller is participant), ordered by lastMessageAt desc
   - `GetDirectMessages` — takes otherIdentityId, resolves conversation by participant pair, delegates to `GetConversationMessages`. Empty result if no conversation exists.
   - Application unit tests for all three handlers with stubbed repositories

4. **Infrastructure: PostgreSQL persistence:**
   - `ChatDbContext`:
     - `chat` schema via `modelBuilder.HasDefaultSchema("chat")`
     - Snake_case naming via `UseSnakeCaseNamingConvention()`
     - Outbox/inbox table mappings via `Kombats.Messaging`
     - `DbSet<Conversation>`, `DbSet<Message>`
   - Entity configurations:
     - `ConversationConfiguration`: PK `Id`, unique index on `(ParticipantAIdentityId, ParticipantBIdentityId)` filtered to `Type = Direct`, index on `(Type)`
     - `MessageConfiguration`: PK `Id`, index on `(ConversationId, SentAt DESC)` for cursor pagination
   - `MessageRepository` implementing `IMessageRepository` — cursor pagination uses keyset (`WHERE sent_at < @before ORDER BY sent_at DESC LIMIT @limit`)
   - `ConversationRepository` implementing `IConversationRepository` — DM resolution uses `INSERT ... ON CONFLICT (participant_a_identity_id, participant_b_identity_id) DO NOTHING` followed by `SELECT`
   - Initial EF Core migration:
     - Creates conversations, messages, outbox/inbox tables in `chat` schema
     - Command: `dotnet ef migrations add InitialCreate --startup-project src/Kombats.Chat/Kombats.Chat.Bootstrap --project src/Kombats.Chat/Kombats.Chat.Infrastructure`
   - Global conversation seeding via `HasData()` in entity configuration
   - Infrastructure integration tests (real PostgreSQL via Testcontainers):
     - Message round-trip: create → save → reload → assert all fields
     - Conversation round-trip: create → save → reload
     - DM resolution: first call creates, second call returns existing
     - Concurrent DM creation: two simultaneous creates for same pair → one conversation
     - Cursor pagination: correct ordering, correct limit, correct `hasMore`
     - `LastMessageAt` update on message insert
     - Retention delete: old messages removed, new messages kept
     - Conversation cleanup: empty direct conversations deleted, global never deleted
     - Schema isolation: all tables in `chat` schema
     - Snake_case naming verified

5. **API layer (HTTP read endpoints):**
   - `GET /api/internal/conversations` — list user's conversations, extract identity from JWT
   - `GET /api/internal/conversations/{id}/messages?before={sentAt}&limit=50` — paginated history
   - `GET /api/internal/direct/{otherIdentityId}/messages?before={sentAt}&limit=50` — DM history by other player
   - All `[Authorize]`
   - Response DTOs in Api project matching spec Section 12

6. **Bootstrap wiring (minimal — enough for HTTP endpoints):**
   - EF Core + Npgsql registration with `chat` schema, `EnableRetryOnFailure()`
   - Auth: Keycloak JWT (same config pattern as other services)
   - Endpoint mapping for HTTP read endpoints
   - No SignalR, no Redis, no MassTransit yet

**Batch outputs:**
- Domain entities with tested invariants
- `chat` schema in Postgres with all tables (conversations, messages, outbox/inbox)
- Working Postgres persistence with cursor pagination
- DM conversation resolution (sorted-pair, ON CONFLICT)
- Global conversation seeded
- Internal HTTP endpoints returning data from Postgres
- All domain unit tests pass
- All persistence integration tests pass

**Gate:** All domain tests pass. All persistence integration tests pass (real Postgres). HTTP endpoints return correct data. DM resolution handles concurrent creation. Migration applies cleanly to empty database.

---

#### Batch 2 — Redis Layer (Presence, Rate Limiting, Name Cache)

**Goal:** All Redis-backed infrastructure works: presence lifecycle via Lua scripts, rate limiting with in-memory fallback, player info cache (name + readiness) with full resolver and eligibility checker chains.

**Prerequisites:** Batch 0 (Players profile endpoint for resolver HTTP fallback).

**Parallelizable with:** Batch 1 (zero dependencies between Postgres and Redis work).

**Must NOT be parallelized internally:** Build and test Lua scripts before integrating into any higher-level code. The Lua scripts are the highest-risk component.

**Implementation tasks (in order):**

1. **Application ports (Redis-related):**
   - `IPresenceStore`: `ConnectAsync(identityId, displayName)` returns bool (first connection), `DisconnectAsync(identityId)` returns bool (last connection), `HeartbeatAsync(identityId)`, `GetOnlinePlayersAsync(limit, offset)`, `GetOnlineCountAsync()`, `IsOnlineAsync(identityId)`
   - `IRateLimiter`: `CheckAndIncrementAsync(identityId, surface)` returns `(bool allowed, int? retryAfterMs)`
   - `IPlayerInfoCache`: `GetAsync(identityId)` returns `CachedPlayerInfo?` (record with `Name` and `IsReady`), `SetAsync(identityId, name, isReady)`, `RemoveAsync(identityId)`
   - `IDisplayNameResolver`: `ResolveAsync(identityId)` returns string (name, or "Unknown" sentinel)
   - `IEligibilityChecker`: `CheckEligibilityAsync(identityId)` returns `(bool eligible, string? displayName)`. Chain: `IPlayerInfoCache` → Players HTTP → reject if unverifiable. See Batch 3 for enforcement logic.

2. **Redis presence store (`RedisPresenceStore`):**
   - Implement three Lua scripts exactly as specified in architecture spec Section 7:
     - `presence_connect`: INCR refcount, conditionally add to ZSET + set presence record. Return 1 for first connection, 0 otherwise.
     - `presence_heartbeat`: Renew TTLs, update ZSET score. Add EXISTS guard on refcount key (review item I5) — no-op if refcount key is gone.
     - `presence_disconnect`: GET-then-conditional-DECR pattern. Return 1 for last connection, 0 otherwise. Prevents negative refcount.
   - Load Lua scripts via `ScriptEvaluateAsync` with `LuaScript.Prepare()` for server-side caching
   - Keys: `chat:presence:{id}`, `chat:presence:online`, `chat:presence:refs:{id}`
   - TTL: 90 seconds on presence record and refcount, renewed by heartbeat
   - Online player queries: `ZRANGEBYSCORE` with pagination on the online ZSET
   - Integration tests (real Redis via Testcontainers) — **highest priority tests in the entire plan:**
     - Connect: first connection returns 1 (broadcast), second returns 0 (no broadcast), refcount = 2
     - Disconnect: last connection returns 1 (broadcast), non-last returns 0, refcount decrements correctly
     - Disconnect after TTL expiry: no negative refcount, cleanup correct
     - Heartbeat: TTLs renewed, ZSET score updated
     - Heartbeat after TTL expiry: no-op (I5 guard), no phantom user in ZSET
     - Multi-tab: connect twice, disconnect once → still online; disconnect second → offline
     - Crash simulation: let TTLs expire, verify ZSET entry becomes stale (score old)
     - Tab opens during crash cleanup: INCR from 0 → 1, user goes online immediately

3. **Redis rate limiter (`RedisRateLimiter`):**
   - Fixed-window counter: `INCR` key, if counter == 1 then `EXPIRE` with window TTL
   - Keys: `chat:ratelimit:{id}:global` (5 in 10s), `chat:ratelimit:{id}:dm` (10 in 30s), `chat:ratelimit:{id}:presence` (1 in 5s)
   - Returns: allowed/denied + `retryAfterMs` = remaining TTL when denied
   - In-memory fallback (`ConcurrentDictionary<identityId, (count, windowStart)>`) when Redis operations throw
   - Fallback activates automatically, deactivates when Redis recovers
   - Log warning on first fallback activation
   - Integration tests:
     - Under limit → allowed
     - At limit → denied with correct retryAfterMs
     - Window expires → allowed again
     - Redis unavailable → in-memory fallback works correctly
     - Fallback recovery: Redis comes back → distributed limiter resumes

4. **Redis player info cache (`RedisPlayerInfoCache`):**
   - Replaces the previous `IDisplayNameCache` concept. Stores both display name and readiness, which Chat needs for eligibility enforcement and message stamping.
   - Key: `chat:player:{id}`, TTL 7 days
   - Value: JSON `{ "name": "<displayName>", "isReady": true|false }`
   - Set: write name + isReady with 7-day TTL
   - Get: read and deserialize, renew TTL on hit. Returns `CachedPlayerInfo` record or null on miss.
   - Remove: delete key (used when a player's state changes to not-ready, if needed)
   - Integration tests:
     - Set (name + isReady=true) → get → correct values
     - Set (name + isReady=false) → get → correct values (isReady is false)
     - TTL renewed on read
     - Expired key → cache miss (returns null)

5. **Display-name resolver (`DisplayNameResolver`):**
   - Implements `IDisplayNameResolver`
   - Chain: `IPlayerInfoCache.GetAsync()` → HTTP `GET /api/v1/players/{identityId}/profile` → `"Unknown"` sentinel
   - On cache hit: return `cachedInfo.Name` (regardless of `IsReady` — the resolver only resolves names; eligibility is checked separately by `IEligibilityChecker`)
   - On HTTP success: populate cache via `IPlayerInfoCache.SetAsync(identityId, name, isReady)`, return name
   - On HTTP failure (timeout, 404, 5xx): return `"Unknown"`, do not cache sentinel
   - Typed HTTP client for Players profile endpoint with aggressive timeout (3 seconds)
   - Application unit tests (stubbed cache + HTTP):
     - Cache hit → returns cached name, no HTTP call
     - Cache miss + HTTP success → returns name, populates cache with name AND isReady
     - Cache miss + HTTP failure → returns "Unknown"
     - Cache miss + HTTP timeout → returns "Unknown"

6. **Eligibility checker (`EligibilityChecker`):**
   - Implements `IEligibilityChecker`
   - Chain: `IPlayerInfoCache.GetAsync()` → HTTP `GET /api/v1/players/{identityId}/profile` → reject
   - On cache hit with `isReady == true`: return `(eligible: true, displayName: name)`
   - On cache hit with `isReady == false`: return `(eligible: false, displayName: null)`
   - On cache miss + HTTP success: populate cache, check `isReady` from response, return accordingly
   - On cache miss + HTTP failure/timeout: return `(eligible: false, displayName: null)` — unverified users are rejected (per spec Section 16: "Chat does not allow unverified users to send messages")
   - Application unit tests (stubbed cache + HTTP):
     - Cache hit with isReady=true → eligible
     - Cache hit with isReady=false → not eligible
     - Cache miss + HTTP returns isReady=true → eligible, cache populated
     - Cache miss + HTTP returns isReady=false → not eligible, cache populated
     - Cache miss + HTTP failure → not eligible

7. **Application use case: `GetOnlinePlayers`:**
   - Paginated query against `IPresenceStore`
   - Application unit test with stubbed presence store

8. **API: Presence HTTP endpoint:**
   - `GET /api/internal/presence/online?limit=100&offset=0`, `[Authorize]`
   - Response DTO matching spec Section 12

**Batch outputs:**
- Presence Lua scripts tested with real Redis (all multi-tab scenarios pass)
- Rate limiter with fallback tested
- Player info cache stores name + isReady, tested
- Display-name resolver chain tested (cache → HTTP → "Unknown")
- Eligibility checker chain tested (cache → HTTP → reject)
- Online players query via HTTP endpoint
- All Redis integration tests pass
- All application unit tests pass

**Gate:** Every Lua script edge case from the multi-tab table (spec Section 15) is covered by a passing test. Rate-limiter fallback activates and deactivates correctly. Display-name resolver fallback chain handles all three stages. Eligibility checker correctly differentiates ready vs not-ready players (cache hit path and HTTP fallback path). Review required: Lua script code review by a second person/agent before proceeding to Batch 3.

---

### Phase 3: Hub Integration

#### Batch 3 — Internal SignalR Hub + Send Flows

**Goal:** Chat's internal hub is fully functional. Downstream clients can connect, join global chat, send messages, send DMs, receive realtime events. All use cases complete.

**Prerequisites:** Batch 1 (persistence) AND Batch 2 (Redis layer). Both must be complete.

**Not parallelizable:** This batch is the integration point. It wires B1 and B2 together. Must be done by a single implementer with full context.

**Implementation tasks (in order):**

1. **Stabilize internal hub contract (FIRST TASK — before any code):**
   - Document the exact hub method signatures, return types, and event payload types as they will be implemented:
     - `JoinGlobalChat() → JoinGlobalChatResult`
     - `LeaveGlobalChat() → void`
     - `SendGlobalMessage(string content) → void`
     - `SendDirectMessage(Guid recipientPlayerId, string content) → SendDirectMessageResult`
   - Document the exact server-to-client event names and payload shapes:
     - `GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`
   - Document the exact internal HTTP endpoint paths and response shapes (already partially defined in B1, but finalize here)
   - This contract document (or set of interfaces) is the artifact that Batch 5 (BFF) builds against. It must not change after this point without explicit coordination.
   - **Output artifact:** Update the API DTOs in Chat.Api to be the canonical reference. These become the contract surface.

2. **Remaining application ports:**
   - `IMessageFilter`: interface with `FilterAsync(string content)` returning `(bool valid, string? sanitizedContent, string? errorCode)`
   - `IUserRestriction`: interface with `CanSendAsync(Guid identityId)` returning bool
   - v1 implementations: `MessageFilter` (length check 1-500, sanitization), `UserRestriction` (always returns true)

3. **Remaining application use cases:**
   - `ConnectUser`:
     - Calls `IPresenceStore.ConnectAsync(identityId, displayName)`
     - If first connection (returns true): broadcast `PlayerOnline` to global chat group via `IHubContext`
     - Does NOT add to any SignalR group — presence is connection-based
   - `DisconnectUser`:
     - Calls `IPresenceStore.DisconnectAsync(identityId)`
     - If last connection (returns true): broadcast `PlayerOffline` to global chat group
     - Cancel per-connection heartbeat timer
   - `JoinGlobalChat`:
     - **Enforce eligibility** (`OnboardingState == Ready`) — Chat Layer 2 authoritative check
     - Eligibility check via `IEligibilityChecker.CheckEligibilityAsync(identityId)`: checks player info cache for `isReady == true` → if cache miss, calls Players HTTP profile endpoint and checks `isReady` from response → if Players unavailable and cache empty, reject. Returns `(eligible: false)` for any player whose `isReady` is explicitly false, not just for missing players.
     - Reject with `ChatError(code: "not_eligible")` if not eligible
     - Add connection to global chat SignalR group
     - Query recent messages (first page, newest first)
     - Query online players (capped 100 + total count)
     - Return `JoinGlobalChatResult`
     - Does NOT touch presence — already established on connect
   - `LeaveGlobalChat`:
     - Remove connection from global chat SignalR group
     - Does NOT remove presence
   - `SendGlobalMessage`:
     - Enforce eligibility
     - Check rate limit (global surface)
     - Run `IMessageFilter`
     - Resolve display name via `IDisplayNameResolver`
     - Create `Message` entity
     - Save message via `IMessageRepository`
     - Update `LastMessageAt` on global conversation
     - Broadcast `GlobalMessageReceived` to global chat group
   - `SendDirectMessage`:
     - Enforce eligibility
     - Check rate limit (DM surface)
     - Run `IMessageFilter`
     - Resolve display name via `IDisplayNameResolver`
     - Resolve/create conversation via `IConversationRepository.GetOrCreateDirectAsync()`
     - Create `Message` entity
     - Save message via `IMessageRepository`
     - Update `LastMessageAt` on conversation
     - Send `DirectMessageReceived` to recipient's connection(s)
     - Return `SendDirectMessageResult` with `conversationId`, `messageId`, `sentAt`
   - Application unit tests for ALL handlers (stubbed ports):
     - `SendGlobalMessage`: enforces eligibility, calls rate limiter, resolves name, creates message, persists, updates conversation, broadcasts
     - `SendDirectMessage`: enforces eligibility, calls rate limiter, resolves name, resolves/creates conversation, creates message, persists, delivers
     - `ConnectUser`: calls presence store, broadcasts only on first connection
     - `DisconnectUser`: calls presence store, broadcasts only on last connection
     - `JoinGlobalChat`: enforces eligibility (rejects ineligible), adds to group, queries messages and online players, does NOT touch presence
     - **Negative eligibility: player has a cached display name but `isReady == false` → rejected with `ChatError(code: "not_eligible")`** (verifies that eligibility is based on readiness, not just name existence)
     - Rate-limited send → returns error with retryAfterMs
     - Invalid content → returns correct error code

4. **Internal SignalR Hub (`ChatHub` in Api project):**
   - Hub class at path `/chathub-internal`, `[Authorize]`
   - `OnConnectedAsync`:
     - Extract identity from JWT (`sub` / `ClaimTypes.NameIdentifier`)
     - Call `ConnectUser` handler
     - Start per-connection heartbeat timer: 30-second interval, executes `IPresenceStore.HeartbeatAsync(identityId)` on each tick
     - This is an application-level timer (not SignalR keepalive) — presence heartbeat requires executing the Lua script (EQ-2)
   - `OnDisconnectedAsync`:
     - Call `DisconnectUser` handler
     - Cancel/dispose heartbeat timer
   - Hub methods: `JoinGlobalChat`, `LeaveGlobalChat`, `SendGlobalMessage`, `SendDirectMessage` — each extracts identity from context and delegates to the corresponding handler
   - Error handling: catch application errors, send `ChatError` event with structured codes
   - Hub/API tests:
     - Auth enforcement: valid JWT → connect, no JWT → reject
     - `JoinGlobalChat` returns correct structure
     - `JoinGlobalChat` with player who has name but `isReady == false` → `ChatError(code: "not_eligible")`
     - `SendGlobalMessage` with valid content → broadcast received by other connections in group
     - `SendGlobalMessage` with invalid content → `ChatError`
     - Rate-limited send → `ChatError` with `rate_limited` code and `retryAfterMs`
     - `SendDirectMessage` → resolved `conversationId` returned, recipient receives event

5. **Bootstrap wiring (complete):**
   - EF Core + Npgsql (already from B1)
   - Redis connection (DB 2) registration
   - MassTransit via `Kombats.Messaging` (bus config, outbox, inbox — but consumer registration deferred to B4)
   - Handler registration: Scrutor scan or explicit DI for all `ICommandHandler<>`, `IQueryHandler<>`
   - Port implementations: register `RedisPresenceStore`, `RedisRateLimiter`, `RedisPlayerInfoCache`, `DisplayNameResolver`, `EligibilityChecker`, `MessageFilter`, `UserRestriction`, `MessageRepository`, `ConversationRepository`
   - Auth: Keycloak JWT configuration
   - SignalR hub mapping: `app.MapHub<ChatHub>("/chathub-internal")`
   - Minimal API endpoint mapping
   - Health checks: Postgres, Redis, RabbitMQ
   - OpenAPI + Scalar
   - `appsettings.json` / `appsettings.Development.json`:
     - `ConnectionStrings:Postgres`, `ConnectionStrings:Redis`, `RabbitMq`, `Keycloak`
     - `Chat:Retention:MessageTtlHours` (default 24)
     - `Chat:RateLimits` (global: 5/10s, dm: 10/30s, presence: 1/5s)

**Batch outputs:**
- Fully functional internal Chat hub
- Presence lifecycle on connect/disconnect
- Per-connection heartbeat timer
- `JoinGlobalChat` with eligibility enforcement, returns messages + online players
- `SendGlobalMessage` and `SendDirectMessage` with full pipeline (validate → rate-check → filter → resolve name → persist → broadcast/deliver)
- Rate limiting enforced
- Auth enforced on all connections and endpoints
- Health checks operational
- All application unit tests pass
- Hub integration tests pass

**Gate:** A SignalR test client can connect to `/chathub-internal` with a valid JWT, call `JoinGlobalChat`, send a global message, and see the broadcast. A second client receives the message. A DM between two clients works end-to-end through the hub. Rate limiting rejects excessive sends. Ineligible users are rejected on `JoinGlobalChat` — **including a player who has a display name but `isReady == false`** (this is the critical negative case that verifies eligibility is based on readiness, not name existence). Presence broadcast fires on first connect and last disconnect. Internal hub contract is frozen — no changes without explicit coordination with Batch 5.

---

### Phase 4: Background + BFF (Parallel)

#### Batch 4 — MassTransit Consumer + Background Workers

**Goal:** Chat receives `PlayerCombatProfileChanged` events and populates the name cache. Retention and presence sweep workers run on schedule.

**Prerequisites:** Batch 3 (fully assembled Chat service).

**Parallelizable with:** Batch 5 (BFF work). No dependencies between them.

**Implementation tasks (in order):**

1. **Application use case: `HandlePlayerProfileChanged`:**
   - Receives `IdentityId` + `Name` + `IsReady` from event
   - Calls `IPlayerInfoCache.SetAsync(identityId, name, isReady)` — stores both display name and readiness
   - If `IsReady` transitions to `false` (rare — e.g., data correction), the cache entry is updated with `isReady: false`, which causes subsequent eligibility checks to reject the player
   - Application unit tests:
     - Event with `IsReady=true` → cache updated with name and isReady=true
     - Event with `IsReady=false` → cache updated with name and isReady=false

2. **MassTransit consumer:**
   - `PlayerCombatProfileChangedConsumer` in Infrastructure/Messaging/Consumers
   - Thin consumer: extract `IdentityId` + `Name` + `IsReady`, call `HandlePlayerProfileChanged` handler
   - Inbox for idempotency (tables already created in B1 migration)
   - Consumer registration in Bootstrap via `Kombats.Messaging` assembly scan
   - Tests:
     - Behavior test: event with `IsReady=true` processed → player info cache updated with name and isReady=true
     - Behavior test: event with `IsReady=false` processed → player info cache updated with isReady=false
     - Idempotency test: same message twice (same MessageId) → second is no-op
     - Edge cases: null Name field handling
   - Contract serialization test: `PlayerCombatProfileChanged` round-trip with all fields including `Version` and `IsReady`

3. **MessageRetentionWorker (hosted service):**
   - Runs every hour (configurable)
   - `DELETE FROM chat.messages WHERE sent_at < now() - interval '{ttl} hours'` — **batched deletes** (1000 rows per batch to avoid long-held locks, per review Q1)
   - After message cleanup: delete direct conversations with no remaining messages
   - Never delete global conversation
   - Tests:
     - Old messages deleted, new messages kept
     - Empty direct conversations deleted after cleanup
     - Global conversation never deleted
     - Batch size respected (verify with large data sets)

4. **PresenceSweepWorker (hosted service):**
   - Runs every 60 seconds
   - Scans ZSET `chat:presence:online` for entries with score older than 90 seconds
   - For each stale entry: `ZREM` — only broadcast `PlayerOffline` if `ZREM` returns 1 (avoids duplicate broadcasts in future multi-instance scenario, per review Q2)
   - Also cleans up presence record and refcount key if they still exist
   - Tests:
     - Stale entries removed, `PlayerOffline` broadcast
     - Non-stale entries preserved
     - `ZREM` return value gating works (only one broadcast per stale entry)

5. **Bootstrap wiring updates:**
   - Register hosted workers: `builder.Services.AddHostedService<MessageRetentionWorker>()`, `builder.Services.AddHostedService<PresenceSweepWorker>()`
   - MassTransit consumer registration (if not already covered by assembly scan)

**Batch outputs:**
- Player info cache (name + isReady) populated from integration events
- Old messages cleaned up hourly (batched)
- Stale presence entries swept every 60s
- Consumer idempotency verified
- Contract serialization verified

**Gate:** Consumer processes a `PlayerCombatProfileChanged` event and the name + isReady appear in the Redis cache. Event with `IsReady=false` produces a cache entry with `isReady: false`. Second delivery of same message is a no-op. Retention worker deletes old messages without deleting new ones. Sweep worker removes stale ZSET entries and broadcasts `PlayerOffline`.

---

#### Batch 5 — BFF Chat Integration

**Goal:** Frontend can connect to BFF ChatHub and use all chat features through the relay.

**Prerequisites:** Batch 3 (functional internal Chat hub with frozen contract). Batch 0 (Players profile endpoint for player card).

**Parallelizable with:** Batch 4 (consumer/workers).

**Implementation tasks (in order):**

1. **ChatHubRelay:**
   - `IChatHubRelay` interface in BFF Application (or wherever BFF port interfaces live)
   - `ChatHubRelay` class following `BattleHubRelay` pattern:
     - `ConcurrentDictionary<string, ChatConnection>` tracking downstream connections by frontend connectionId
     - `ChatConnection` wrapper around `HubConnection` with connection state and metadata
     - `ConnectAsync(frontendConnectionId, accessToken)`: creates downstream `HubConnection` to Chat `/chathub-internal` with JWT forwarding (same `JwtForwardingHandler` pattern as Battle)
     - `DisconnectAsync(frontendConnectionId)`: disposes downstream connection, removes from dictionary
     - Blind relay of server-to-client events: subscribe to `GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError` on downstream connection; forward to frontend connection via `IHubContext`
     - Hub invocation timeout: 15 seconds per-invocation `CancellationTokenSource` on each `InvokeAsync` call (EQ-5 option b)
     - On downstream drop: send `ChatConnectionLost` to frontend with `reason: "connection_lost"`, cleanup dictionary
     - On invocation timeout: tear down downstream connection, send `ChatConnectionLost` with `reason: "downstream_timeout"`, cleanup dictionary
     - `IAsyncDisposable` for graceful shutdown: dispose all downstream connections
   - Leak detection: log warning if dictionary size grows unexpectedly or if cleanup fails

2. **ChatHub (client-facing):**
   - SignalR hub at `/chathub`, `[Authorize]`
   - `OnConnectedAsync`: create downstream relay connection (unconditional — no eligibility gate, per EQ-4)
   - `OnDisconnectedAsync`: dispose downstream relay connection
   - Client-to-server methods (all forward to relay):
     - `JoinGlobalChat` → relay invokes downstream `JoinGlobalChat`, returns `JoinGlobalChatResult`
     - `LeaveGlobalChat` → relay invokes downstream `LeaveGlobalChat`
     - `SendGlobalMessage(string content)` → relay invokes downstream `SendGlobalMessage`
     - `SendDirectMessage(Guid recipientPlayerId, string content)` → relay invokes downstream `SendDirectMessage`, returns `SendDirectMessageResult`
   - Server-to-client events: relayed from downstream (same names/payloads, no remapping)

3. **ChatClient (typed HTTP client):**
   - `IChatClient` interface + `ChatClient` implementation
   - Methods:
     - `GetConversationsAsync()` → calls `GET /api/internal/conversations`
     - `GetMessagesAsync(conversationId, before?, limit)` → calls `GET /api/internal/conversations/{id}/messages`
     - `GetDirectMessagesAsync(otherIdentityId, before?, limit)` → calls `GET /api/internal/direct/{otherIdentityId}/messages`
     - `GetOnlinePlayersAsync(limit, offset)` → calls `GET /api/internal/presence/online`
   - JWT forwarding via `JwtForwardingHandler` (same pattern as existing BFF HTTP clients)
   - Response DTOs in BFF Application (duplicated from Chat Api DTOs, per EQ-3)

4. **BFF HTTP proxy endpoints:**
   - `GET /api/v1/chat/conversations` → `ChatClient.GetConversationsAsync()`
   - `GET /api/v1/chat/conversations/{conversationId}/messages?before={sentAt}&limit=50` → `ChatClient.GetMessagesAsync()`
   - `GET /api/v1/chat/direct/{otherPlayerId}/messages?before={sentAt}&limit=50` → `ChatClient.GetDirectMessagesAsync()`
   - `GET /api/v1/chat/presence/online?limit=100&offset=0` → `ChatClient.GetOnlinePlayersAsync()`
   - All `[Authorize]`, map responses to client-facing DTOs

5. **Player card endpoint:**
   - `GET /api/v1/players/{playerId}/card` — BFF calls Players `GET /api/v1/players/{identityId}/profile`, maps to `PlayerCardResponse`
   - Returns 404 if player not found
   - No caching (fetched live on demand, per spec)

6. **BFF bootstrap wiring:**
   - Register `ChatHubRelay` as singleton, `ChatClient` as transient/scoped
   - Map `/chathub` hub
   - Map chat HTTP proxy endpoints
   - Map player card endpoint
   - Add Chat service URL to `ServicesOptions` / appsettings (e.g., `Services:ChatUrl`)
   - Configure `HttpClient` for Chat with `JwtForwardingHandler`
   - WebSocket auth: access token from query string parameter (same pattern as `BattleHub`)

7. **Tests:**
   - BFF ChatHub auth enforcement: valid JWT → connect, no JWT → reject
   - Relay forwarding: client call → downstream call verified → response relayed back
   - Downstream drop → `ChatConnectionLost` sent to frontend
   - Hung connection → timeout → `ChatConnectionLost`
   - BFF HTTP endpoints: proxy to Chat, correct response mapping, auth enforcement
   - Player card endpoint: valid player → 200 with correct fields, unknown player → 404, auth enforcement

**Batch outputs:**
- `/chathub` client-facing hub is functional
- Chat HTTP endpoints available through BFF
- Player card endpoint available
- Full relay lifecycle (connect, forward, disconnect, error handling, hung-connection detection)
- All BFF tests pass

**Gate:** A frontend SignalR client can connect to BFF `/chathub`, call `JoinGlobalChat`, send a global message, and receive the broadcast. DMs work through the relay. HTTP endpoints return data. Player card endpoint returns correct profile. Disconnect cleanup removes the downstream connection. Invocation timeout fires and sends `ChatConnectionLost`.

---

### Phase 5: Validation

#### Batch 6 — End-to-End Validation + Hardening

**Goal:** Full system works end-to-end. Edge cases covered. Production readiness verified.

**Prerequisites:** Batch 5 (full system assembled). Batch 4 (consumer and workers running).

**Implementation tasks:**

1. **End-to-end smoke tests:**
   - Full flow: BFF connect → `JoinGlobalChat` → `SendGlobalMessage` → second client receives broadcast → history endpoint returns message → disconnect
   - DM flow: send DM → conversation created → recipient receives → conversation listed → history available via both `conversations/{id}/messages` and `direct/{otherPlayerId}/messages`
   - Presence flow: connect → `PlayerOnline` broadcast → disconnect → `PlayerOffline` broadcast → sweep verifies cleanup
   - Reconnect flow: disconnect → reconnect → `JoinGlobalChat` returns current state → catch-up via `?after={lastSeenTimestamp}` returns missed messages
   - Multi-tab simulation: two connections same user → one disconnects → user still online → second disconnects → `PlayerOffline`

2. **Degradation path tests:**
   - Redis-down: messaging continues (Postgres works), rate-limit fallback activates, presence returns empty, name-cache misses fall through to Players HTTP
   - Postgres-down: sends fail with correct error, presence continues
   - Players-down: display-name falls back to "Unknown", player card returns 503

3. **Auth enforcement sweep:**
   - Every endpoint (internal HTTP, BFF HTTP, BFF ChatHub, internal ChatHub) rejects unauthenticated requests
   - Expired JWT rejected
   - Wrong audience rejected

4. **Resolve review items:**
   - I1: Verify documentation says "fixed-window counter" not "sliding window" (documentation fix)
   - I2: Verify hub parameter is `recipientPlayerId` not `recipientIdentityId`
   - I4: Verify `lastMessageAt` is updated correctly on message insert
   - I5: Verify heartbeat Lua script has EXISTS guard

5. **Configuration review:**
   - `appsettings.json` / `appsettings.Development.json` for Chat Bootstrap: all sections present and correct
   - `docker-compose.yml`: Chat service entry correct, dependencies in order
   - Health checks: `/health/live` and `/health/ready` operational
   - Structured logging: log points at key transitions (connect, disconnect, send, rate-limit, error, fallback activation)

6. **Observability:**
   - Structured logging review: ensure all key events are logged with correlation IDs
   - Health checks: Postgres, Redis, RabbitMQ all report correctly
   - Warning logs on: rate-limit fallback activation, display-name HTTP fallback, Players unavailable, Redis unavailable

**Batch outputs:**
- System validated end-to-end
- All degradation paths verified
- Auth enforced everywhere
- Review items resolved
- Configuration correct
- Ready for release

**Gate:** All E2E tests pass. Degradation tests pass. Auth sweep passes. Health checks operational. No review items outstanding. Structured logging adequate. Docker-compose starts all services and chat works end-to-end.

---

## 5. Contract Stabilization Points

These are the moments where shared contract surfaces must be frozen before downstream work can proceed.

| Contract Surface | Must Be Frozen | Before | Owner | Consumers |
|---|---|---|---|---|
| Players profile endpoint response shape (`GetPlayerProfileQueryResponse` — includes `IsReady`) | End of Batch 0 | B2 start (DisplayNameResolver, EligibilityChecker), B5 start (player card endpoint) | Chat implementer (defines what fields are needed) | Chat Infrastructure (resolver + eligibility HTTP fallback), BFF (player card endpoint) |
| Chat internal hub method signatures (names, parameters, return types) | Start of Batch 3 (first task) | B5 start (BFF relay builds against these) | Chat implementer | BFF implementer (ChatHubRelay, ChatHub) |
| Chat internal hub server-to-client event names and payloads | Start of Batch 3 (first task) | B5 start (BFF relay subscribes to these) | Chat implementer | BFF implementer (ChatHubRelay event forwarding) |
| Chat internal HTTP endpoint paths and response DTOs | End of Batch 1 (paths defined), finalized start of Batch 3 | B5 start (BFF ChatClient builds against these) | Chat implementer | BFF implementer (ChatClient) |
| `PlayerCombatProfileChanged` contract | Already frozen | N/A — pre-existing | Players | Chat consumer (B4) |

**Stabilization process:**

1. The owning implementer defines the contract surface as concrete code (interfaces, DTOs, hub method signatures).
2. The contract is reviewed and agreed upon before consumers start building against it.
3. After stabilization, changes require explicit coordination — the consumer must be updated in the same batch or the change is blocked.

---

## 6. Review and Gate Plan

| Gate | After | Review Checks | Exit Criteria |
|---|---|---|---|
| **G0: Foundation** | Batch 0 | Project structure matches spec appendix. Players endpoint works. Docker-compose starts. | `dotnet build` passes. `dotnet test` passes. Players profile endpoint returns correct data. |
| **G1: Domain + Persistence** | Batch 1 | Domain invariants tested. Persistence round-trips work. DM resolution handles races. Migration applies cleanly. | All domain unit tests pass. All Postgres integration tests pass. |
| **G2: Redis Layer** | Batch 2 | Lua scripts handle every edge case from multi-tab table. Rate-limit fallback works. Resolver chain is correct. **Mandatory code review of Lua scripts.** | All Redis integration tests pass. Lua script code reviewed by second person/agent. |
| **G3: Hub Integration** | Batch 3 | Hub orchestrates all use cases correctly. Eligibility enforced — **including negative case: named player with `isReady=false` is rejected.** Rate limiting enforced. Auth enforced. **Internal contract surface is frozen.** | Hub integration tests pass. Application unit tests pass for all handlers (including negative eligibility). Contract surface documented and agreed. |
| **G4: Background** | Batch 4 | Consumer idempotent. Retention batched. Sweep uses ZREM gating. | Consumer tests pass (behavior + idempotency). Worker tests pass. |
| **G5: BFF Integration** | Batch 5 | Relay lifecycle correct. Hub forwarding works. HTTP proxying works. Player card works. | BFF tests pass. Frontend client can use all features through BFF. |
| **G6: E2E Validation** | Batch 6 | All E2E flows work. Degradation verified. Auth sweep clean. Config correct. | All E2E tests pass. System ready for release. |

**Review rhythm:**

- Gates G0 and G1/G2 are lightweight — verify test results and inspect critical code (Lua scripts at G2).
- Gate G3 is the most important review point. The internal contract must be finalized and the hub must work correctly before the BFF builds against it. Block B5 until G3 passes.
- Gates G4 and G5 can be reviewed in parallel.
- Gate G6 is the release gate.

---

## 7. Testing Execution Plan

### Tests by Batch

| Batch | Test Type | Tests | Infrastructure Required | Must Pass Before |
|---|---|---|---|---|
| B0 | Players API test | Profile endpoint 200/404/auth | WebApplicationFactory | B1, B2 start |
| B1 | Domain unit tests | Conversation/Message invariants, factories, validation | None | B3 start |
| B1 | Application unit tests | GetConversationMessages, GetConversations, GetDirectMessages | None (stubbed ports) | B3 start |
| B1 | Postgres integration tests | Round-trip, DM resolution, pagination, retention, schema, naming | Testcontainers PostgreSQL | B3 start |
| B2 | Redis integration tests | Lua scripts (all edge cases), rate limiter, name cache | Testcontainers Redis | B3 start |
| B2 | Application unit tests | DisplayNameResolver fallback chain, GetOnlinePlayers | None (stubbed ports) | B3 start |
| B3 | Application unit tests | All send/connect/disconnect/join handlers | None (stubbed ports) | B5 start |
| B3 | Hub integration tests | Auth, send, receive, rate-limit, error handling | WebApplicationFactory + Testcontainers | B5 start |
| B4 | Consumer tests | Behavior, idempotency, edge cases | Testcontainers (Postgres+RabbitMQ for outbox/inbox) | B6 start |
| B4 | Contract tests | `PlayerCombatProfileChanged` serialization round-trip | None | B6 start |
| B4 | Worker tests | Retention batching, sweep ZREM gating | Testcontainers (Postgres+Redis) | B6 start |
| B5 | BFF tests | Hub auth, relay forwarding, HTTP proxy, player card | WebApplicationFactory | B6 start |
| B6 | E2E tests | Full flows, degradation, auth sweep | Full infrastructure (all services running) | Release |

### What cannot be deferred

- Domain unit tests: must be in B1, not later
- Lua script integration tests: must be in B2, not later (highest-risk component)
- Consumer idempotency test: must be in B4, not later
- Auth enforcement: tested in every batch where endpoints/hubs are added

### What can be deferred to B6

- Multi-service degradation tests (Redis-down, Postgres-down, Players-down)
- Multi-tab E2E simulation
- Reconnect E2E flow
- Configuration review

---

## 8. Risk-Control Plan

### R1: Redis Lua Script Correctness (HIGH)

**Risk:** Bugs in presence refcount management create ghost online users or premature offline broadcasts.

**Where addressed:** Batch 2 — dedicated batch for all Redis work.

**How validated:**
- Every edge case from the multi-tab table (spec Section 15) has a dedicated test
- Heartbeat-after-TTL-expiry scenario tested (review item I5)
- Tests run against real Redis via Testcontainers
- Mandatory code review of Lua scripts at gate G2

**Must be true before B3:** All Lua script tests pass. Code review complete. No unresolved questions about script behavior.

### R2: Relay Lifecycle Leaks (MEDIUM)

**Risk:** Long-lived downstream connections in ChatHubRelay leak or leave stale tracking dictionary entries.

**Where addressed:** Batch 5 — ChatHubRelay implementation.

**How validated:**
- Disconnect path tests: frontend disconnect → downstream disposed + dictionary entry removed
- Downstream drop tests: connection lost → frontend notified + dictionary entry removed
- Hung-connection tests: timeout → downstream torn down + dictionary entry removed
- Graceful shutdown test: `IAsyncDisposable` disposes all connections
- Leak detection logging: warning if dictionary contains entries for connections that are no longer active

**Must be true before B6:** All disconnect/cleanup paths tested. No dictionary leaks in test scenarios.

### R3: Contract Drift Between Chat and BFF (MEDIUM)

**Risk:** Internal hub method signatures or HTTP response DTOs drift, breaking BFF integration.

**Where addressed:** Contract stabilization at start of B3 (Section 5).

**How validated:**
- Internal contract frozen before B5 starts
- BFF DTOs are duplicated (per EQ-3) — any change requires conscious propagation
- B6 E2E tests exercise the full path through BFF → Chat → BFF, catching any drift
- Contract serialization tests in B6 verify both sides agree on response shapes

**Must be true before B5:** Internal hub contract documented and frozen. Internal HTTP response DTOs finalized.

### R4: Eligibility Enforcement Gaps (MEDIUM)

**Risk:** Ineligible users access chat features. Specifically: a player who has a display name but `OnboardingState != Ready` must be rejected — eligibility is determined by `isReady`, not by name existence.

**Where addressed:**
- Batch 0: Players profile endpoint includes `IsReady` in response
- Batch 2: `IPlayerInfoCache` stores `(name, isReady)` — not just name. `IEligibilityChecker` checks `isReady` explicitly.
- Batch 3: Chat Layer 2 authoritative enforcement on `JoinGlobalChat`, `SendGlobalMessage`, `SendDirectMessage` uses `IEligibilityChecker`
- Batch 4: Consumer extracts `IsReady` from `PlayerCombatProfileChanged` and stores it in the player info cache

**How validated:**
- Application unit tests: each handler that enforces eligibility has a test case for an ineligible user → rejection
- **Critical negative test: player with cached display name but `isReady == false` → rejected with `ChatError(code: "not_eligible")`** — this verifies that eligibility is based on readiness, not name existence
- Hub integration test: ineligible user calls `JoinGlobalChat` → `ChatError(code: "not_eligible")`
- BFF does NOT enforce eligibility (per EQ-4) — Chat is the sole gate

**Must be true before B5:** Eligibility enforcement tests pass for all relevant handlers, including the named-but-not-ready negative case.

### R5: Display-Name Resolver Fallback Chain (LOW-MEDIUM)

**Risk:** Fallback chain stalls or returns incorrect values, causing message sends to hang or show wrong names.

**Where addressed:** Batch 2 — `DisplayNameResolver` implementation.

**How validated:**
- Application unit tests: cache hit, cache miss + HTTP success, cache miss + HTTP failure, cache miss + HTTP timeout → all return correct values
- HTTP client has aggressive timeout (3 seconds)
- No retry loop — single attempt per stage
- "Unknown" sentinel is permanently stamped (not retroactively updated)

**Must be true before B3:** All fallback stages tested. Timeout behavior verified.

### R6: Rate-Limit Fallback Behavior (LOW)

**Risk:** In-memory fallback doesn't activate or is too permissive.

**Where addressed:** Batch 2 — `RedisRateLimiter` with fallback.

**How validated:**
- Integration test: Redis unavailable → in-memory fallback activates → rate limiting still works
- Integration test: Redis recovers → distributed limiter resumes
- Warning logged on fallback activation

**Must be true before B3:** Fallback activation and deactivation tested.

---

## 9. Ownership and Collaboration Model

### Recommended Split: Single Primary Owner + Late BFF Assist

**Primary implementer (Batches 0-4, 6):** Handles the Chat service end-to-end. This person must understand the full architecture — domain model, Lua scripts, hub lifecycle, rate limiting, presence, consumers, workers. Splitting the Chat service between implementers would create integration overhead that exceeds the parallelization benefit.

**BFF implementer (Batch 5, partial B6):** Joins after B3's gate passes and the internal contract is frozen. Builds the BFF surface: ChatHubRelay, ChatHub, ChatClient, HTTP proxy endpoints, player card endpoint, BFF wiring. Can be a second person/agent or the same primary implementer.

### What must stay with a single owner

| Scope | Why |
|---|---|
| Chat domain model (B1) | Single coherent design |
| All Lua scripts (B2) | Presence lifecycle must be internally consistent |
| Internal hub orchestration (B3) | Integration point — must understand all use cases |
| Internal contract surface | Single decision-maker for the surface consumed by BFF |

### What can be handed off

| Scope | Condition |
|---|---|
| BFF relay + hub + HTTP proxy (B5) | After internal contract is frozen at G3 |
| Players profile endpoint (B0) | Independent, can be done by anyone |
| E2E test writing (B6) | After B5 is complete |

### Contract ownership (single owner, no parallel changes)

| Surface | Owner |
|---|---|
| Chat internal hub signatures | Primary implementer |
| Chat internal HTTP endpoints | Primary implementer |
| Chat internal HTTP response DTOs | Primary implementer |
| BFF client-facing hub signatures | BFF implementer (constrained to relay internal contracts — no field remapping) |
| BFF client-facing HTTP endpoints | BFF implementer |
| Players profile response shape | Primary implementer (defines fields needed) |
| `PlayerCombatProfileChanged` | Pre-existing, Players owns |

### How to avoid parallel contract churn

- The primary implementer freezes the internal contract surface as the **first task** in Batch 3.
- The BFF implementer does not start Batch 5 until Gate G3 passes (contract frozen + hub functional).
- If a B4 bug requires changing the hub contract surface, the BFF implementer is notified and B5 work on the affected surface pauses until the change is propagated.
- DTOs are duplicated (not shared), so a change in Chat requires a manual update in BFF. This is intentional — it forces a conscious compatibility check.

---

## 10. Definition of Done by Batch

### Batch 0 — Done When:

- [ ] Six Chat projects verified in `src/Kombats.Chat/` with correct SDKs and references (existing skeleton aligned)
- [ ] All six projects in `Kombats.sln`
- [ ] `InternalsVisibleTo` configured (Application → Infrastructure, Bootstrap; Infrastructure → Bootstrap)
- [ ] Package references use central package management (no inline versions)
- [ ] Chat Contracts project exists (empty, zero deps)
- [ ] Four test projects verified in `tests/Kombats.Chat/` and in solution
- [ ] Testcontainers fixtures set up for PostgreSQL and Redis
- [ ] `WebApplicationFactory<Program>` bootstrap set up in Api.Tests
- [ ] `dotnet build` succeeds for full solution
- [ ] `dotnet test` succeeds (Players profile tests pass)
- [ ] `GET /api/v1/players/{identityId}/profile` returns correct data for existing player, **including `IsReady` field**
- [ ] Players profile endpoint returns 404 for unknown player
- [ ] Players profile endpoint rejects unauthenticated requests
- [ ] Chat Bootstrap starts as empty host (no services)
- [ ] Docker-compose Chat entry verified and starts alongside existing services

### Batch 1 — Done When:

- [ ] `Conversation` entity enforces sorted-pair invariant (proven by test)
- [ ] `Message` entity rejects content outside 1-500 chars (proven by test)
- [ ] `Message` entity sanitizes content: trim, collapse whitespace, strip control chars (proven by test)
- [ ] Well-known global conversation ID is `00000000-0000-0000-0000-000000000001`
- [ ] `ChatDbContext` uses `chat` schema with snake_case naming
- [ ] EF Core migration applies cleanly to empty database, creating all tables in `chat` schema
- [ ] Global conversation seeded via `HasData()`
- [ ] Message round-trip works: create → save → reload → all fields match
- [ ] DM resolution: first call creates conversation, second returns existing (same pair either order)
- [ ] Concurrent DM creation: two simultaneous creates → one conversation
- [ ] Cursor pagination: correct ordering (newest first), correct limit, correct `hasMore`
- [ ] `LastMessageAt` updated correctly on message insert
- [ ] Retention delete removes old messages, keeps new ones
- [ ] Empty direct conversation cleanup works, global conversation never deleted
- [ ] Internal HTTP endpoints serve data from Postgres with auth enforcement

### Batch 2 — Done When:

- [ ] `presence_connect` Lua: first connection returns 1, subsequent return 0, refcount increments
- [ ] `presence_disconnect` Lua: last connection returns 1, non-last returns 0, no negative refcount
- [ ] `presence_disconnect` Lua: disconnect after TTL expiry → cleanup correct, no negative refcount
- [ ] `presence_heartbeat` Lua: TTLs renewed, ZSET score updated
- [ ] `presence_heartbeat` Lua: heartbeat after TTL expiry → no-op (I5 EXISTS guard)
- [ ] Multi-tab: connect twice → disconnect once → still online → disconnect second → offline
- [ ] Crash: TTLs expire → ZSET entry becomes stale (old score)
- [ ] Rate limiter: under limit → allowed, at limit → denied with retryAfterMs, window expires → allowed
- [ ] Rate limiter: Redis unavailable → in-memory fallback activates, rate limiting still works
- [ ] Rate limiter: Redis recovers → distributed limiter resumes
- [ ] Player info cache: set (name + isReady) → get → correct values, TTL renewed on read, expired → miss
- [ ] Player info cache: isReady=false stored and returned correctly (not treated as eligible)
- [ ] DisplayNameResolver: cache hit → name, cache miss + HTTP success → name + cache populated (with isReady), cache miss + HTTP failure → "Unknown"
- [ ] EligibilityChecker: cache hit with isReady=true → eligible, cache hit with isReady=false → not eligible, cache miss + HTTP success → checks isReady from response, cache miss + HTTP failure → not eligible
- [ ] `GET /api/internal/presence/online` returns online players with auth enforcement
- [ ] Lua script code review completed by second person/agent

### Batch 3 — Done When:

- [ ] Internal hub contract surface documented and frozen (method signatures, return types, event names/payloads)
- [ ] `ConnectUser` broadcasts `PlayerOnline` on first connection only
- [ ] `DisconnectUser` broadcasts `PlayerOffline` on last connection only
- [ ] Per-connection heartbeat timer fires every 30 seconds
- [ ] `JoinGlobalChat` rejects ineligible users with `ChatError(code: "not_eligible")`
- [ ] `JoinGlobalChat` rejects a player who has a cached display name but `isReady == false` (negative eligibility case)
- [ ] `JoinGlobalChat` returns recent messages + online players (capped 100) + total online count
- [ ] `JoinGlobalChat` does NOT touch presence (already established on connect)
- [ ] `SendGlobalMessage` pipeline: eligibility → rate-check → filter → resolve name → persist → broadcast
- [ ] `SendDirectMessage` pipeline: eligibility → rate-check → filter → resolve name → resolve/create conversation → persist → deliver
- [ ] Rate-limited send returns `ChatError(code: "rate_limited", retryAfterMs: N)`
- [ ] Invalid content returns correct error code (`message_too_long`, `message_empty`)
- [ ] Auth enforced: no JWT → rejected
- [ ] Health checks: Postgres, Redis, RabbitMQ all report status
- [ ] A SignalR test client can complete the full connect → join → send → receive flow

### Batch 4 — Done When:

- [ ] `PlayerCombatProfileChangedConsumer` processes event → name and isReady appear in Redis player info cache
- [ ] Consumer with `IsReady=false` event → cache entry has `isReady: false`
- [ ] Consumer idempotency: same MessageId twice → second is no-op
- [ ] `PlayerCombatProfileChanged` serialization round-trip succeeds (including `IsReady` field)
- [ ] `MessageRetentionWorker` deletes old messages in batches, keeps new messages
- [ ] Retention worker deletes empty direct conversations, never deletes global
- [ ] `PresenceSweepWorker` removes stale ZSET entries with score > 90s old
- [ ] Sweep broadcasts `PlayerOffline` only when `ZREM` returns 1

### Batch 5 — Done When:

- [ ] BFF `/chathub` accepts authenticated WebSocket connections
- [ ] BFF `/chathub` rejects unauthenticated connections
- [ ] `OnConnectedAsync` creates downstream relay connection to Chat `/chathub-internal`
- [ ] `OnDisconnectedAsync` disposes downstream connection and removes from tracking dictionary
- [ ] `JoinGlobalChat` forwarded → result returned to frontend
- [ ] `SendGlobalMessage` forwarded → broadcast relayed to other frontend connections
- [ ] `SendDirectMessage` forwarded → result returned + recipient receives via relay
- [ ] Downstream drop → `ChatConnectionLost` sent to frontend + dictionary cleaned
- [ ] Invocation timeout (15s) → downstream torn down + `ChatConnectionLost` + dictionary cleaned
- [ ] BFF HTTP endpoints proxy to Chat with auth enforcement
- [ ] `GET /api/v1/players/{playerId}/card` returns correct profile, 404 for unknown
- [ ] No stale entries in relay tracking dictionary after disconnect scenarios

### Batch 6 — Done When:

- [ ] E2E: full connect → join → send → receive → history flow works through BFF
- [ ] E2E: DM send → receive → conversation listed → history available
- [ ] E2E: presence connect → online → disconnect → offline
- [ ] E2E: reconnect → catch-up history returns missed messages
- [ ] E2E: multi-tab → one disconnects → still online → second disconnects → offline
- [ ] Degradation: Redis down → messaging continues, rate-limit fallback active, presence empty
- [ ] Degradation: Postgres down → sends fail with correct error
- [ ] Degradation: Players down → display-name "Unknown", player card 503
- [ ] Auth sweep: every endpoint/hub rejects unauthenticated requests
- [ ] Review items I1, I2, I4, I5 resolved and verified
- [ ] Health checks operational
- [ ] Structured logging covers key transitions
- [ ] Docker-compose starts all services, chat works end-to-end

---

## 11. Immediate Next Action

After this plan is approved:

1. **Start Batch 0.** The primary implementer verifies and aligns the existing Chat project skeleton, test project structure, and implements the Players profile endpoint. The skeleton already exists — the focus is verification, gap-filling, and the Players endpoint. This is the critical unblocking step — nothing else can start until B0 is complete.

2. **First artifact to produce:** Verified Chat project structure with correct SDKs, references, and `InternalsVisibleTo`. Verify `dotnet build` before anything else.

3. **Second artifact:** Players profile endpoint (query, handler, endpoint, tests) — **must include `IsReady` in response**. This unblocks both B2 (eligibility checker + display-name resolver HTTP fallback) and B5 (player card endpoint).

4. **Third artifact:** Docker-compose Chat service entry verified with correct connection strings.

5. **After B0 gate passes:** Start B1 and B2 in parallel (or interleaved if single implementer).

6. **Who starts:** The primary implementer. A BFF implementer is not needed until after Gate G3 (Batch 3 complete, internal contract frozen).

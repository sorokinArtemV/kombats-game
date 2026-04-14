# Kombats Chat v1 — Batch 1 + Batch 2 Execution

**Executed:** 2026-04-14
**Branch:** kombats_full_refactor

---

## Batch 1: Domain Model + Postgres Persistence + Read Endpoints

### Implemented

#### 1. Domain Model (`Kombats.Chat.Domain`)
- `ConversationType` enum: `Global = 0`, `Direct = 1`
- `Conversation` entity with:
  - `Id`, `Type`, `CreatedAt`, `LastMessageAt`, `ParticipantAIdentityId`, `ParticipantBIdentityId`
  - `CreateGlobal(Guid wellKnownId)` factory
  - `CreateDirect(Guid a, Guid b)` with sorted-pair invariant (smaller GUID always in A)
  - `UpdateLastMessageAt(DateTimeOffset)` with forward-only guard
  - `IsParticipant(Guid)` — returns true for global, checks participants for DM
  - `SortParticipants(Guid, Guid)` static helper
  - Global conversation constant: `00000000-0000-0000-0000-000000000001`
- `Message` entity with:
  - `Id` (v7 GUID), `ConversationId`, `SenderIdentityId`, `SenderDisplayName`, `Content`, `SentAt`
  - `Create()` factory with content validation/sanitization
  - `Sanitize()` — trim, collapse whitespace, strip control chars
  - Content validation: 1–500 chars after sanitization

#### 2. Application Ports and Read-Path Use Cases (`Kombats.Chat.Application`)
- `IConversationRepository` — GetById, GetGlobal, GetOrCreateDirect, ListByParticipant, UpdateLastMessageAt, DeleteEmptyDirect
- `IMessageRepository` — Save, GetByConversation, DeleteExpired
- `GetConversationMessagesHandler` — validates participant access, keyset pagination with `hasMore`
- `GetConversationsHandler` — lists global + DM conversations, ordered by LastMessageAt desc
- `GetDirectMessagesHandler` — deterministic participant-pair resolution, same pagination

#### 3. PostgreSQL Persistence (`Kombats.Chat.Infrastructure`)
- `ChatDbContext` — `chat` schema, `DbSet<Conversation>`, `DbSet<Message>`, MassTransit outbox/inbox
- `SnakeCaseHistoryRepository` — matches repo pattern
- Entity configurations:
  - Conversation: unique index on `(participant_a_identity_id, participant_b_identity_id)` filtered to `type = 1`
  - Message: descending index on `(conversation_id, sent_at)`
  - FK from messages → conversations with cascade delete
- `ConversationRepository` — `INSERT ... ON CONFLICT DO NOTHING` + `SELECT` for atomic DM resolution
- `MessageRepository` — keyset pagination via `WHERE sent_at < @before ORDER BY sent_at DESC LIMIT @limit`
- Global conversation seeded via `HasData()` in ConversationConfiguration

#### 4. Initial EF Core Migration
- Migration: `20260414120615_InitialCreate`
- Tables: `conversations`, `messages`, `inbox_state`, `outbox_message`, `outbox_state`
- All in `chat` schema
- Snake_case column naming verified
- Global conversation seed data included

#### 5. Internal HTTP Read Endpoints (`Kombats.Chat.Api`)
- `GET /api/internal/conversations` — `[Authorize]`, returns conversations for authenticated user
- `GET /api/internal/conversations/{id}/messages` — `[Authorize]`, paginated message history
- `GET /api/internal/direct/{otherIdentityId}/messages` — `[Authorize]`, DM history by other player
- `ResultExtensions` (Match, ToProblem) added for error mapping
- Identity extracted via `User.GetIdentityId()` from Abstractions

#### 6. Bootstrap Wiring
- `ChatDbContext` registration with Npgsql, snake_case naming, SnakeCaseHistoryRepository
- Handler registrations: GetConversationMessages, GetConversations, GetDirectMessages
- Repository registrations: ConversationRepository, MessageRepository

#### 7. Tests
- **Domain**: 23 tests — sorted-pair invariant, factory methods, content validation, sanitization, enum values, global constant
- **Application**: 12 tests — handler behavior for all three use cases, access validation, pagination hasMore, limit clamping
- **Infrastructure**: 14 tests (require Docker) — migration, schema isolation, snake_case naming, conversation/message round-trip, DM resolution, concurrent DM creation, cursor pagination, LastMessageAt, message retention
- **API**: 6 tests — auth enforcement, correct responses, 404 for nonexistent, 400 for same-user DM

### Batch 1 Verification
- **Build**: ✅ Succeeds, 0 warnings, 0 errors
- **Domain tests**: ✅ 23/23 passed
- **Application tests**: ✅ 12/12 passed
- **API tests**: ✅ 6/6 passed
- **Infrastructure tests**: ⚠️ Build passes. Tests require Docker (Testcontainers) which is not available in this environment.
- **Migration**: ✅ Created successfully

---

## Batch 2: Redis Presence + Rate Limiter + Player Info Cache + Resolvers

### Implemented

#### 1. Application Ports (`Kombats.Chat.Application/Ports/`)
- `IPresenceStore` — Connect, Disconnect, Heartbeat, GetOnlinePlayers, GetOnlineCount, IsOnline
- `IRateLimiter` — CheckAndIncrement(identityId, surface) → (allowed, retryAfterMs?)
- `IPlayerInfoCache` — Get, Set, Remove; stores `CachedPlayerInfo(Name, IsReady)` where `IsReady` is derived from `OnboardingState == Ready` (HTTP path) or taken directly from the event contract (consumer path)
- `IDisplayNameResolver` — Resolve(identityId) → string
- `IEligibilityChecker` — CheckEligibility(identityId) → (eligible, displayName?)
- `GetOnlinePlayersQuery/Handler/Response` use case

#### 2. Redis Presence Store (`RedisPresenceStore`)
- Three Lua scripts via `LuaScript.Prepare()`:
  - `presence_connect`: INCR refs, EXPIRE 90s; if refs==1 → ZADD online + SET presence JSON → return 1; else return 0
  - `presence_heartbeat`: EXISTS refs guard (I5), EXPIRE refs + presence, ZADD online with updated score
  - `presence_disconnect`: GET refs; if ≤1 → DEL refs + ZREM online + DEL presence → return 1; else DECR → return 0
- Online set key: `chat:presence:online` (ZSET, score = lastHeartbeat unix ms)
- Presence key: `chat:presence:{id}` (JSON with name + connectedAtUnixMs, TTL 90s)
- Refs key: `chat:presence:refs:{id}` (INT, TTL 90s)
- GetOnlinePlayers via `SortedSetRangeByRankWithScoresAsync` (descending)
- Redis DB 2 for Chat

#### 3. Redis Rate Limiter (`RedisRateLimiter`)
- Fixed-window counter: INCR key, EXPIRE on first request in window
- Surface-specific limits: global (5/10s), dm (10/30s), presence (1/5s)
- Returns `retryAfterMs` from key TTL when limit exceeded
- In-memory fallback via `ConcurrentDictionary` when Redis unavailable
- Auto-recovery: logs fallback activation/recovery transitions

#### 4. Redis Player Info Cache (`RedisPlayerInfoCache`)
- Key pattern: `chat:playerinfo:{identityId}` (JSON with Name + IsReady, where IsReady is derived from `OnboardingState`)
- TTL: 7 days, renewed on cache hit
- Get, Set, Remove operations
- Graceful JSON deserialization error handling

#### 5. DisplayNameResolver (`Infrastructure/Services/`)
- Chain: cache → Players HTTP → "Unknown"
- On HTTP success: reads `OnboardingState` from Players profile response, derives `isReady = OnboardingState == Ready`, populates cache with name + derived isReady
- On failure: returns "Unknown", does NOT cache sentinel value
- 3-second HTTP timeout via `CancellationTokenSource`

#### 6. EligibilityChecker (`Infrastructure/Services/`)
- Chain: cache → Players HTTP → reject
- Cache hit with `isReady=true` (derived from `OnboardingState == Ready`) → eligible (returns displayName)
- Cache hit with `isReady=false` (derived from `OnboardingState != Ready`) → not eligible
- Cache miss + HTTP success → derives readiness from `OnboardingState` in response, populates cache, checks readiness
- Cache miss + HTTP failure → reject (not eligible)
- 3-second HTTP timeout

#### 7. Presence HTTP Endpoint
- `GET /api/internal/presence/online?limit=100&offset=0` — `[Authorize]`
- Returns `OnlinePlayersResponse(Players, TotalOnline)`

#### 8. Bootstrap Wiring (Batch 2 additions)
- `IConnectionMultiplexer` singleton (Redis, DB 2)
- Scoped: RedisPresenceStore, RedisRateLimiter, RedisPlayerInfoCache
- Named HTTP client "Players" for Players service
- Scoped: DisplayNameResolver, EligibilityChecker
- Handler: GetOnlinePlayersHandler
- Redis connection string and Players base URL in appsettings.json

#### 9. Tests
- **Redis Presence Store**: 12 tests — connect first/second, disconnect last/not-last, multi-tab lifecycle, no-negative-refcount, heartbeat TTL renewal, heartbeat no-op without refs, online players list, count, pagination, online check
- **Redis Rate Limiter**: 7 tests — under limit, at limit, different surfaces independent, different users independent, unknown surface, presence limit
- **Redis Player Info Cache**: 5 tests — set/get round-trip, not found, remove, isReady (derived from OnboardingState) storage, TTL renewal on hit
- **DisplayNameResolver**: 3 tests — cache hit, HTTP failure fallback, HTTP success with cache population
- **EligibilityChecker**: 6 tests — cache hit ready, cache hit not-ready, HTTP ready, HTTP not-ready, HTTP failure, cache population
- **GetOnlinePlayers handler**: 3 tests — returns data, clamps limit, empty result
- **Presence endpoint**: 2 tests — auth success, auth enforcement

### Batch 2 Verification
- **Build**: ✅ Succeeds, 0 warnings, 0 errors
- **Application tests**: ✅ 15/15 passed (12 B1 + 3 B2)
- **API tests**: ✅ 8/8 passed (6 B1 + 2 B2)
- **Infrastructure tests**: ⚠️ Build passes. Redis integration tests (24) and service tests (9) require Docker (Testcontainers).
- **Domain tests**: ✅ 23/23 passed (unchanged from B1)

---

## Deviations from Plan

| # | What | Why | Impact |
|---|------|-----|--------|
| 1 | ~~`GetConversations` DM display names use identity ID as placeholder~~ | **Resolved** in alignment pass — `IDisplayNameResolver` now wired into `GetConversationsHandler` | Display names fully resolved |
| 2 | ~~`GetDirectMessages` creates conversation via `GetOrCreateDirect` on read path~~ | **Resolved** in alignment pass — read path now uses `GetDirectByParticipantsAsync` (read-only, no write) | No side effects on read |
| 3 | Player info cache key: `chat:playerinfo:{id}` instead of `chat:name:{id}` | Stores both name and derived isReady, not just name; clearer key name for compound data | Aligns with intent — key pattern not consumer-visible |
| 4 | DisplayNameResolver/EligibilityChecker tests in Infrastructure.Tests instead of Application.Tests | These are `internal sealed` Infrastructure classes; Application.Tests lacks InternalsVisibleTo for Infrastructure | Tests are in the correct project for access |

**Note:** The Players profile endpoint returning `OnboardingState` (not `IsReady`) is the intentional contract established in Batch 0 (see carry-forward fix in batch0 execution). Chat derives readiness as `OnboardingState == Ready`. The `PlayerCombatProfileChanged` event contract carries `bool IsReady` (pre-derived by Players domain) — the consumer will map this to the cache's representation in Batch 4.

## Blockers

- **Docker not available**: Testcontainers-based tests (Postgres integration, Redis integration) cannot run in this environment. Tests are correctly written and compile, but execution requires Docker. Should be verified in CI or a Docker-capable environment.

## Intentionally Deferred to Batch 3+

- SignalR hub (`/chathub-internal`) and connect/join/send/disconnect flows → B3
- MassTransit consumer for `PlayerCombatProfileChanged` → B4
- `MessageRetentionWorker` and `PresenceSweepWorker` → B4
- `IMessageFilter` and `IUserRestriction` ports → B3
- BFF chat integration → B5

---

## Post-Implementation Alignment Pass (2026-04-14)

### Canonical contract: `OnboardingState`
The Players public profile exposes `OnboardingState` (enum). Chat does not require or use a lossy `IsReady` boolean from Players. Readiness is derived exclusively as `OnboardingState == "Ready"`.

### Changes applied

**1. Cache stores `OnboardingState` (string), not `IsReady` (bool)**
- `CachedPlayerInfo` record: `(string Name, string OnboardingState)` with derived `bool IsEligible` property
- `RedisPlayerInfoCache` DTO: stores/reads `OnboardingState` string in Redis JSON
- `EligibilityChecker`: uses `cached.IsEligible` (which derives from `OnboardingState == "Ready"`)
- `DisplayNameResolver`: populates cache with `OnboardingState` from HTTP response directly
- No mixed semantics remain — `OnboardingState` is the single canonical signal throughout

**2. `GetDirectMessages` no longer creates conversations on read**
- Added `IConversationRepository.GetDirectByParticipantsAsync()` — read-only lookup by sorted participant pair
- `GetDirectMessagesHandler` uses this instead of `GetOrCreateDirectAsync`
- If no conversation exists, returns empty result immediately (no DB write)
- `GetOrCreateDirectAsync` remains available for Batch 3 send flows

**3. DM display names now resolved via `IDisplayNameResolver`**
- `GetConversationsHandler` now takes `IDisplayNameResolver` as a dependency
- For each DM conversation, resolves the other player's display name via the resolver chain (cache → Players HTTP → "Unknown")
- Placeholder behavior removed — display names are fully resolved within B1+B2 scope

### Verification
- **Build**: 0 warnings, 0 errors
- **Domain tests**: 23/23 passed
- **Application tests**: 16/16 passed (was 15 — added test for no-conversation read path)
- **API tests**: 8/8 passed
- **Infrastructure tests**: Build passes. Docker-dependent tests not executed (unchanged constraint).

### Verification honesty
Infrastructure integration tests (Postgres + Redis, 47 tests) are compiled and structurally correct but have not been executed. Batch 1/2 gates that depend on integration test execution (DM resolution race handling, Lua script edge cases, migration apply, cache TTL renewal) are **not verified by execution** — only by compilation and code review. These must be run in a Docker-capable environment before the gates can be considered fully closed.

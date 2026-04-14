# Kombats Chat v1 — Task Decomposition and Execution Batching

**Status:** Ready for review
**Date:** 2026-04-14
**Source:** `docs/architecture/kombats-chat-v1-architecture-spec.md` (approved for decomposition)
**Review:** `docs/architecture/reviews/kombats-chat-v1-architecture-review-round2.md`

---

## 1. Decomposition Objective

Turn the approved chat v1 architecture into concrete, sequenced work items that can be implemented, reviewed, and delivered in ordered batches. The output is a bridge between architecture and implementation planning — specific enough that implementation plans can be derived directly from each batch.

---

## 2. Assumptions Carried Forward from the Approved Architecture

These are not open for renegotiation. They are the ground the decomposition builds on.

| # | Assumption |
|---|---|
| A1 | `Kombats.Chat` is a standalone service following the per-service project template (Bootstrap/Api/Application/Domain/Infrastructure/Contracts) |
| A2 | BFF is the sole client-facing boundary. Chat exposes no public surfaces. |
| A3 | Players is the sole source of truth for player profile data. Chat caches display names only. |
| A4 | `IdentityId` (Keycloak `sub`) is the canonical cross-service identifier. Client-facing field name is `playerId`. |
| A5 | v1 topology: per-user BFF relay (Option A), single-instance Chat, single-instance BFF |
| A6 | PostgreSQL `chat` schema for messages/conversations. Redis DB 2 for presence/rate-limits/name-cache. |
| A7 | MassTransit 8.3.0, transactional outbox, `Kombats.Messaging` for bus configuration |
| A8 | 24-hour message retention with periodic cleanup worker |
| A9 | Global chat: single room, deterministic well-known conversation ID (hardcoded constant, OQ-1 option a) |
| A10 | No new NuGet packages required beyond what is already approved in the baseline |
| A11 | `PlayerCombatProfileChanged` contract already exists and includes `Name`, `IdentityId`, `IsReady` |

---

## 3. Implementation Streams

The work splits into five streams. These are not symmetrical — Chat is the bulk of the work.

| Stream | Scope | Relative Size |
|---|---|---|
| **S1: Chat Service** | New service: domain, application, infrastructure, API, bootstrap, workers | Large |
| **S2: BFF Chat Surface** | ChatHub, ChatHubRelay, ChatClient, HTTP proxy endpoints, player card endpoint | Medium |
| **S3: Players Profile Endpoint** | One new read endpoint + query handler | Small |
| **S4: Contracts & Integration Glue** | Chat contracts (empty v1), Players consumer in Chat, docker-compose, config | Small |

Testing is a cross-cutting concern embedded in each batch, not a separate stream. See Section 8 for the full testing decomposition by level.

---

## 4. Detailed Task Groups by Stream

### S1: Chat Service

#### S1.1 — Project Skeleton and Solution Integration
- Create six projects: `Kombats.Chat.Bootstrap`, `Kombats.Chat.Api`, `Kombats.Chat.Application`, `Kombats.Chat.Domain`, `Kombats.Chat.Infrastructure`, `Kombats.Chat.Contracts`
- Set SDKs: Bootstrap = `Microsoft.NET.Sdk.Web`, all others = `Microsoft.NET.Sdk`
- Add all six projects to `Kombats.sln`
- Add project references (Bootstrap → Api → Application → Domain; Infrastructure → Application + Domain)
- Add `InternalsVisibleTo` in Application (→ Infrastructure, → Bootstrap) and Infrastructure (→ Bootstrap)
- Add package references (no versions — central package management): EF Core, Npgsql, StackExchange.Redis, MassTransit 8.3.0, FluentValidation, Microsoft.AspNetCore.OpenApi
- Reference `Kombats.Messaging`, `Kombats.Abstractions`, `Kombats.Players.Contracts`
- Empty `Program.cs` in Bootstrap that starts the host (no services yet)
- Verify `dotnet build` succeeds for the full solution

#### S1.2 — Domain Model
- `ConversationType` enum: `Global = 0, Direct = 1`
- `Conversation` entity: `Id`, `Type`, `CreatedAt`, `LastMessageAt`, `ParticipantAIdentityId`, `ParticipantBIdentityId`
  - Factory methods: `CreateGlobal(wellKnownId)`, `CreateDirect(participantA, participantB)` with sorted-pair invariant
  - `UpdateLastMessageAt(sentAt)` method
  - Well-known global conversation constant: `00000000-0000-0000-0000-000000000001`
- `Message` entity: `Id` (Guid v7), `ConversationId`, `SenderIdentityId`, `SenderDisplayName`, `Content`, `SentAt`
  - Factory method with validation: content length 1-500, sanitization (trim, collapse whitespace, strip control chars)
- Domain unit tests for entity invariants, factory methods, sorted-pair, content validation

#### S1.3 — Application Layer (Ports and Use Cases)
- **Ports:**
  - `IMessageRepository` — save message, query by conversation with cursor pagination, delete expired, count by conversation
  - `IConversationRepository` — get by id, get or create direct (sorted-pair + ON CONFLICT), get global, list by participant, update last message
  - `IPresenceStore` — connect, disconnect, heartbeat, get online players (paginated), get online count, is online
  - `IRateLimiter` — check and increment (returns allowed/denied + retry-after)
  - `IDisplayNameCache` — get, set, renew TTL
  - `IDisplayNameResolver` — resolve (cache → HTTP → "Unknown" sentinel)
  - `IMessageFilter` — filter message content (v1: length check, sanitization)
  - `IUserRestriction` — check send permission (v1: no-op, always allows)
- **Use cases (command/query handlers):**
  - `ConnectUser` — called from `OnConnectedAsync`. Executes `presence_connect` Lua script, broadcasts `PlayerOnline` if first connection. Presence is connection-based, not room-based: a user is "online" as soon as they connect to the internal hub, regardless of whether they join global chat.
  - `DisconnectUser` — called from `OnDisconnectedAsync`. Executes `presence_disconnect` Lua script, broadcasts `PlayerOffline` if last connection. Cancels the per-connection heartbeat timer.
  - `JoinGlobalChat` — **enforce eligibility (`OnboardingState == Ready`) as Chat Layer 2 authoritative check** (resolved EQ-4), add connection to global chat SignalR group (for broadcast targeting), return recent messages + online players (capped 100). Rejects ineligible users with `ChatError(code: "not_eligible")`. Does NOT register presence — presence was already established on connect.
  - `LeaveGlobalChat` — remove connection from global chat SignalR group. Does NOT remove presence — user remains online as long as the hub connection is open.
  - `SendGlobalMessage` — validate, **enforce eligibility (`OnboardingState == Ready`)**, rate-check, resolve display name, create message, persist, update conversation, broadcast. Rejects ineligible users with `ChatError(code: "not_eligible")`.
  - `SendDirectMessage` — validate, **enforce eligibility (`OnboardingState == Ready`)**, rate-check, resolve display name, resolve/create conversation, create message, persist, update conversation, deliver to recipient. Rejects ineligible users with `ChatError(code: "not_eligible")`.
  - `GetConversationMessages` — pagination query by conversation with access check
  - `GetConversations` — list user's active conversations
  - `GetDirectMessages` — resolve conversation by participant pair, delegate to `GetConversationMessages`
  - `GetOnlinePlayers` — paginated presence query
  - `HandlePlayerProfileChanged` — update display-name cache from integration event

#### S1.4 — Infrastructure: PostgreSQL Persistence
- `ChatDbContext` with `chat` schema, snake_case naming, outbox/inbox tables
- Entity configurations: `ConversationConfiguration`, `MessageConfiguration`
  - Indexes: `(conversation_id, sent_at DESC)` on messages, `(participant_a_identity_id, participant_b_identity_id)` unique on direct conversations, `(type)` on conversations
- `MessageRepository` implementing `IMessageRepository`
- `ConversationRepository` implementing `IConversationRepository`
  - DM resolution: `INSERT ... ON CONFLICT DO NOTHING` + `SELECT` pattern
- Initial EF Core migration
- Global conversation seeding (insert if not exists on startup or migration)

#### S1.5 — Infrastructure: Redis (Presence, Rate Limiting, Name Cache)
- `RedisPresenceStore` implementing `IPresenceStore`
  - Lua scripts: `presence_connect`, `presence_heartbeat`, `presence_disconnect`
  - Online player ZSET queries with pagination
  - Keys: `chat:presence:{id}`, `chat:presence:online`, `chat:presence:refs:{id}`
- `RedisRateLimiter` implementing `IRateLimiter`
  - Fixed-window counter: `INCR` + `EXPIRE`
  - Keys: `chat:ratelimit:{id}:global` (10s TTL), `chat:ratelimit:{id}:dm` (30s TTL), `chat:ratelimit:{id}:presence` (5s TTL)
  - In-memory fallback (`ConcurrentDictionary`) when Redis unavailable (AD-CHAT-08)
- `RedisDisplayNameCache` implementing `IDisplayNameCache`
  - Key: `chat:name:{id}`, TTL 7 days, renewed on read and on event
- `DisplayNameResolver` implementing `IDisplayNameResolver`
  - Chain: Redis cache → Players HTTP (`GET /api/v1/players/{id}/profile`) → "Unknown" sentinel
  - Typed HTTP client for Players profile endpoint

#### S1.6 — Infrastructure: MassTransit Consumer
- `PlayerCombatProfileChangedConsumer` — thin consumer, extracts `IdentityId` + `Name`, calls `HandlePlayerProfileChanged` handler
- Inbox for idempotency
- Consumer registration in Bootstrap

#### S1.7 — API Layer (Internal Hub + HTTP Endpoints)
- **Internal SignalR Hub** (`/chathub-internal`):
  - `OnConnectedAsync` — extract identity from JWT, call `ConnectUser` handler (registers presence, may broadcast `PlayerOnline`), start per-connection heartbeat timer (30s interval, executes `presence_heartbeat` Lua script). **This is the sole presence-registration point.**
  - `OnDisconnectedAsync` — call `DisconnectUser` handler (removes presence, may broadcast `PlayerOffline`), cancel heartbeat timer. **This is the sole presence-removal point.**
  - `JoinGlobalChat` — call handler (adds connection to global chat group, returns bootstrap data). Does not touch presence.
  - `LeaveGlobalChat` — call handler (removes connection from global chat group). Does not touch presence.
  - `SendGlobalMessage(content)` — call handler, broadcast `GlobalMessageReceived` to group
  - `SendDirectMessage(recipientPlayerId, content)` — call handler, send `DirectMessageReceived` to recipient connections
  - Error handling: send `ChatError` events with structured codes
- **Internal HTTP Endpoints** (Minimal API):
  - `GET /api/internal/conversations` — list user's conversations
  - `GET /api/internal/conversations/{id}/messages` — paginated history
  - `GET /api/internal/direct/{otherIdentityId}/messages` — DM history by other player
  - `GET /api/internal/presence/online` — paginated online list
  - All require `[Authorize]`, extract identity from JWT

#### S1.8 — Bootstrap Composition Root
- `Program.cs`: full DI wiring
  - EF Core + Npgsql with `chat` schema, retry on failure
  - Redis connection (DB 2)
  - MassTransit via `Kombats.Messaging` (bus, outbox, inbox, consumer registration)
  - Handler registration (Scrutor scan or explicit)
  - Auth: Keycloak JWT (same config pattern as other services)
  - SignalR hub mapping (`/chathub-internal`)
  - Minimal API endpoint mapping
  - Health checks (Postgres, Redis, RabbitMQ)
  - OpenAPI + Scalar
- `appsettings.json` / `appsettings.Development.json`
  - `ConnectionStrings:Postgres`, `ConnectionStrings:Redis`, `RabbitMq`, `Keycloak`
  - `Chat:Retention:MessageTtlHours` (default 24)
  - `Chat:RateLimits` (global: 5/10s, dm: 10/30s, presence: 1/5s)
- Hosted workers registration (retention, sweep)

#### S1.9 — Background Workers
- `MessageRetentionWorker` (hosted service)
  - Runs every hour
  - `DELETE FROM chat.messages WHERE sent_at < now() - interval '{ttl} hours'`
  - Batched deletes for safety (per review I1 / Q1)
  - Delete empty direct conversations after message cleanup
  - Never deletes global conversation
- `PresenceSweepWorker` (hosted service)
  - Runs every 60 seconds
  - Scans ZSET for entries with score older than 90s
  - Removes stale entries, broadcasts `PlayerOffline` for each
  - Uses `ZREM` return value to avoid duplicate broadcasts (multi-instance safety per review Q2)

#### S1.10 — Docker-Compose and Infrastructure Config
- Add Chat service to `docker-compose.yml`
  - Postgres connection (same instance, `chat` schema)
  - Redis connection (DB 2)
  - RabbitMQ connection
  - Keycloak dependency
- Ensure Redis DB 2 is allocated and not conflicting

### S2: BFF Chat Surface

#### S2.1 — ChatHubRelay
- `ChatHubRelay` class following `BattleHubRelay` pattern
  - `ConcurrentDictionary<string, ChatConnection>` tracking downstream connections by frontend connectionId
  - `ConnectAsync(frontendConnectionId, accessToken)` — creates downstream `HubConnection` to Chat `/chathub-internal` with JWT forwarding
  - `DisconnectAsync(frontendConnectionId)` — disposes downstream connection
  - Blind relay of server-to-client events: `GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`
  - Hub invocation timeout (configurable, default 15s) for hung-connection detection
  - On downstream drop: send `ChatConnectionLost` to frontend, cleanup tracking
  - `IAsyncDisposable` for graceful shutdown
- `IChatHubRelay` interface in Application

#### S2.2 — ChatHub (Client-Facing)
- SignalR hub at `/chathub`, `[Authorize]`
- Client-to-server methods:
  - `JoinGlobalChat` — forward to relay, return result. No BFF-side eligibility check (see resolved EQ-4: BFF is stateless, Chat Layer 2 is the authoritative enforcement point).
  - `LeaveGlobalChat` — forward to relay
  - `SendGlobalMessage(content)` — forward to relay
  - `SendDirectMessage(recipientPlayerId, content)` — forward to relay, return result
- `OnConnectedAsync` — create downstream relay connection (unconditional — no eligibility gate)
- `OnDisconnectedAsync` — dispose downstream relay connection
- Server-to-client events relayed from downstream (same names/payloads, no remapping)

#### S2.3 — ChatClient (Typed HTTP Client)
- `ChatClient` calling Chat internal HTTP endpoints with JWT forwarding (`JwtForwardingHandler`)
- Methods: `GetConversationsAsync`, `GetMessagesAsync`, `GetDirectMessagesAsync`, `GetOnlinePlayersAsync`

#### S2.4 — BFF HTTP Proxy Endpoints
- `GET /api/v1/chat/conversations` → `ChatClient.GetConversationsAsync`
- `GET /api/v1/chat/conversations/{conversationId}/messages` → `ChatClient.GetMessagesAsync`
- `GET /api/v1/chat/direct/{otherPlayerId}/messages` → `ChatClient.GetDirectMessagesAsync`
- `GET /api/v1/chat/presence/online` → `ChatClient.GetOnlinePlayersAsync`
- All `[Authorize]`, map responses to client-facing DTOs

#### S2.5 — Player Card Endpoint (BFF Composition)
- `GET /api/v1/players/{playerId}/card` — BFF calls Players `GET /api/v1/players/{identityId}/profile`, maps to `PlayerCardResponse`
- Returns 404 if player not found
- No caching (per spec — fetched live on demand)

#### S2.6 — BFF Bootstrap Wiring
- Register `ChatHubRelay`, `ChatClient` in DI
- Map `/chathub` hub
- Map chat HTTP endpoints
- Map player card endpoint
- Add Chat service URL to `ServicesOptions` / appsettings
- Configure `HttpClient` for Chat with `JwtForwardingHandler`

### S3: Players Profile Endpoint

#### S3.1 — Application: GetPlayerProfile Query
- `GetPlayerProfileQuery(Guid IdentityId)`
- `GetPlayerProfileQueryHandler` — loads `Character` by `IdentityId`, maps to response
- `GetPlayerProfileQueryResponse` — `PlayerId`, `DisplayName`, `Level`, `Strength`, `Agility`, `Intuition`, `Vitality`, `Wins`, `Losses`
- Leverages existing `CharacterStateResult.FromCharacter()` (already includes wins/losses)
- Returns not-found if character doesn't exist

#### S3.2 — API: Profile Endpoint
- `GET /api/v1/players/{identityId}/profile`, `[Authorize]`
- Any authenticated user can query any player's public profile (OQ-2 option a)
- Maps `GetPlayerProfileQueryResponse` to HTTP response
- 200 with profile data, 404 if not found

#### S3.3 — Bootstrap Wiring
- Handler registration (if not already auto-scanned)
- Endpoint mapping

### S4: Contracts & Integration Glue

#### S4.1 — Chat Contracts Project
- `Kombats.Chat.Contracts` — empty for v1 (Chat publishes nothing)
- Project exists in solution for forward compatibility

#### S4.2 — MassTransit Topology
- Chat subscribes to `PlayerCombatProfileChanged` (from Players)
- Consumer registered via `Kombats.Messaging` assembly scan in Chat Bootstrap
- Note: outbox/inbox table creation is owned by Batch 1 (S1.4 initial EF Core migration). No separate migration here.

#### S4.3 — Docker-Compose Updates
- Chat service entry with all connection strings
- Dependency ordering: postgres, redis, rabbitmq, keycloak → chat

---

## 5. Batch Plan

### Batch 0: Foundation
**Goal:** Chat service exists in the solution, builds, and starts as an empty host. Players profile endpoint is available. No Chat domain code, no persistence, no functional behavior.

**Included work:**
- S1.1 — Project skeleton and solution integration (all six projects, SDKs, references, `InternalsVisibleTo`, empty `Program.cs`)
- S3.1 — GetPlayerProfile query handler
- S3.2 — Profile endpoint
- S3.3 — Players bootstrap wiring
- S4.1 — Empty Contracts project
- S1.10 (partial) — Docker-compose Chat service entry (connection strings, dependency ordering)

**Why together:** The skeleton must exist before any other Chat work. The Players profile endpoint is independent and small — including it here unblocks the display-name resolver's HTTP fallback (Batch 2) and the BFF player card endpoint (Batch 5).

**Test infrastructure included in Batch 0:**
- Create test projects: `Kombats.Chat.Domain.Tests`, `Kombats.Chat.Application.Tests`, `Kombats.Chat.Infrastructure.Tests`, `Kombats.Chat.Api.Tests`
- Add test projects to `Kombats.sln`
- Set up shared Testcontainers fixtures for PostgreSQL and Redis (reusable across Chat infrastructure tests)
- Set up `WebApplicationFactory<Program>` bootstrap in `Kombats.Chat.Api.Tests` (or `Infrastructure.Tests` as appropriate)
- Add Players test coverage for the new profile endpoint (`Kombats.Players.Api.Tests` or existing test project)
- Verify `dotnet test` runs (no tests yet beyond Players profile, but projects compile)

**What is NOT in Batch 0:** No `ChatDbContext`, no entity configurations, no EF Core migrations, no domain entities. Those belong entirely to Batch 1. Batch 0 is strictly project scaffolding, test infrastructure scaffolding, and the Players endpoint.

**Prerequisites:** None. This is the foundation.

**Outputs:**
- Chat service in `Kombats.sln`, all six projects, `dotnet build` succeeds
- Chat Bootstrap starts as an empty host (no services registered yet)
- `GET /api/v1/players/{identityId}/profile` is live
- Docker-compose runs Chat alongside existing services

---

### Batch 1: Domain + Persistence Core
**Goal:** Chat can persist and retrieve conversations and messages. Full domain model, database schema, repositories, and read-path HTTP endpoints. No realtime, no Redis, no consumers.

**Included work:**
- S1.2 — Domain model (Conversation, Message entities, ConversationType enum, all invariants, factory methods)
- S1.4 — Full PostgreSQL persistence: `ChatDbContext` with `chat` schema and snake_case naming, entity configurations with all indexes, `MessageRepository`, `ConversationRepository` (including DM resolution with ON CONFLICT), initial EF Core migration creating conversations + messages + outbox/inbox tables, global conversation seeding via `HasData()`
- S1.3 (partial) — Ports: `IMessageRepository`, `IConversationRepository`
- S1.3 (partial) — Use cases: `GetConversationMessages`, `GetConversations`, `GetDirectMessages`
- S1.7 (partial) — Internal HTTP endpoints: conversations list, message history, DM history by player
- S1.8 (partial) — Minimal Bootstrap wiring: EF Core + Npgsql registration, auth, endpoint mapping (enough to serve the HTTP endpoints)

**Why together:** Domain entities + DbContext + migration + repositories + read-path use cases + HTTP endpoints form a vertically testable slice. You can exercise the full path from HTTP request to Postgres round-trip and back. Keeping all persistence work in one batch avoids split ownership of the schema and migration.

**Prerequisites:** Batch 0 (project skeleton must exist)

**Outputs:**
- Domain entities with tested invariants
- `chat` schema exists in Postgres with all tables (conversations, messages, outbox/inbox)
- Working Postgres persistence with cursor pagination
- DM conversation resolution (sorted-pair, ON CONFLICT)
- Global conversation seeded
- Internal HTTP endpoints returning data

---

### Batch 2: Redis Layer (Presence, Rate Limiting, Name Cache)
**Goal:** All Redis-backed infrastructure works: presence lifecycle, rate limiting, display-name cache.

**Included work:**
- S1.5 — All Redis infrastructure: `RedisPresenceStore` (with Lua scripts), `RedisRateLimiter` (with in-memory fallback), `RedisDisplayNameCache`
- S1.3 (partial) — Ports: `IPresenceStore`, `IRateLimiter`, `IDisplayNameCache`, `IDisplayNameResolver`
- S1.5 (partial) — `DisplayNameResolver` (cache → HTTP → sentinel chain)
- S1.3 (partial) — Use case: `GetOnlinePlayers`
- S1.7 (partial) — Internal HTTP endpoint: `GET /api/internal/presence/online`

**Why together:** All three Redis concerns share the same DB, the same connection, and the same testing infrastructure (real Redis via Testcontainers). The Lua scripts for presence are the most complex piece — isolating them in their own batch ensures they get focused implementation and testing before the hub depends on them. The display-name resolver needs the Players profile endpoint from Batch 0.

**Prerequisites:** Batch 0 (Players profile endpoint for resolver HTTP fallback)

**Parallelizable with:** Batch 1 (no dependency between Postgres work and Redis work)

**Outputs:**
- Presence connect/heartbeat/disconnect Lua scripts tested with real Redis
- Rate limiter with fallback tested
- Display-name cache with full resolver chain tested
- Online players query via HTTP

---

### Batch 3: Internal SignalR Hub + Send Flows
**Goal:** Chat's internal hub is functional. Clients (BFF relay) can connect, join global, send messages, send DMs, and receive realtime events.

**Included work:**
- S1.3 (complete) — Remaining use cases: `ConnectUser`, `DisconnectUser`, `JoinGlobalChat`, `LeaveGlobalChat`, `SendGlobalMessage`, `SendDirectMessage`, moderation ports (`IMessageFilter`, `IUserRestriction`)
- S1.7 (complete) — Internal SignalR hub with all methods, presence lifecycle in `OnConnectedAsync`/`OnDisconnectedAsync`, per-connection heartbeat timer, error handling
- S1.8 — Bootstrap `Program.cs` full wiring (all DI, auth, SignalR, endpoints, health checks)

**Why together:** The hub orchestrates all the pieces built in Batches 1 and 2. Send flows require persistence (Batch 1) + rate limiting + display-name resolution (Batch 2). Connect/disconnect require the presence store (Batch 2). Join flow queries both presence (online players) and message history (Batch 1). This is the integration point for the Chat service.

**Prerequisites:** Batch 1 (persistence), Batch 2 (Redis layer)

**Outputs:**
- Fully functional internal Chat hub
- Presence registered on `OnConnectedAsync`, removed on `OnDisconnectedAsync` (connection-based, not room-based)
- Per-connection heartbeat timer running
- `JoinGlobalChat` enforces eligibility (`OnboardingState == Ready`), returns messages + online players (does not register presence)
- `SendGlobalMessage` persists and broadcasts
- `SendDirectMessage` resolves conversation, persists, delivers
- Rate limiting enforced
- Auth enforced on all connections
- Health check endpoints operational

---

### Batch 4: MassTransit Consumer + Background Workers
**Goal:** Chat receives `PlayerCombatProfileChanged` events and populates the name cache. Retention and presence sweep workers run.

**Included work:**
- S1.6 — `PlayerCombatProfileChangedConsumer` + handler
- S4.2 — MassTransit topology (consumer registration — outbox/inbox tables already created in Batch 1 migration)
- S1.9 — `MessageRetentionWorker`, `PresenceSweepWorker`
- S1.3 (partial) — `HandlePlayerProfileChanged` use case

**Why together:** The consumer and workers are all background processes that don't affect the core request path. They share the same dependency: the Chat service must be fully assembled (Batch 3). The consumer populates the name cache that Batch 2 set up. The workers clean up data that Batches 1 and 2 created.

**Prerequisites:** Batch 3 (fully assembled Chat service)

**Outputs:**
- Display-name cache populated from integration events
- Old messages cleaned up hourly
- Stale presence entries swept every 60s
- Consumer idempotency verified

---

### Batch 5: BFF Chat Integration
**Goal:** Frontend can connect to BFF ChatHub and use all chat features. Full relay path working.

**Included work:**
- S2.1 — ChatHubRelay (full relay with lifecycle, cleanup, timeout detection)
- S2.2 — ChatHub (client-facing, `[Authorize]`, relay forwarding)
- S2.3 — ChatClient (typed HTTP client)
- S2.4 — BFF HTTP proxy endpoints
- S2.5 — Player card endpoint
- S2.6 — BFF bootstrap wiring

**Why together:** The entire BFF chat surface is one cohesive unit. The hub depends on the relay, which depends on the client config. The HTTP endpoints depend on the ChatClient. None of this is independently useful — it must ship together.

**Prerequisites:** Batch 3 (functional internal Chat hub), Batch 0 (Players profile endpoint for player card)

**Outputs:**
- `/chathub` client-facing hub is functional
- Chat HTTP endpoints available through BFF
- Player card endpoint available
- Full relay lifecycle (connect, forward, disconnect, error handling, hung-connection detection)
- No BFF-side eligibility check — Chat Layer 2 is authoritative (resolved EQ-4)

---

### Batch 6: End-to-End Validation + Hardening
**Goal:** Full system works end-to-end. Edge cases covered. Production readiness checks pass.

**Included work:**
- End-to-end smoke tests: connect → join → send → receive → history → disconnect
- DM flow: send DM → conversation created → recipient receives → history available
- Presence flow: connect → PlayerOnline → disconnect → PlayerOffline → sweep
- Reconnect flow: disconnect → reconnect → catch-up history
- Multi-tab simulation: two connections same user → one disconnects → still online
- Redis-down degradation: rate-limit fallback, presence degradation, name-cache miss
- Postgres-down behavior: sends fail with correct error
- Auth enforcement across all surfaces
- Configuration review (appsettings, docker-compose, health checks)
- Observability: structured logging review, any missing log points
- All review items resolved (I1 relabel, I2 parameter naming, I4 lastMessageAt)

**Prerequisites:** Batch 5 (full system assembled)

**Outputs:**
- System validated end-to-end
- Edge cases covered
- Degradation paths verified
- Ready for release

---

## 6. Dependency Graph

```
Batch 0: Foundation
  ├─ No prerequisites
  │
  ├──→ Batch 1: Domain + Persistence (depends on B0 skeleton + migration)
  │
  ├──→ Batch 2: Redis Layer (depends on B0 Players profile endpoint)
  │         │
  │         │  ┌── Both B1 and B2 must complete ──┐
  │         │  │                                   │
  │         └──┴──→ Batch 3: Internal Hub         ─┤
  │                    │                            │
  │                    └──→ Batch 4: Consumer +     │
  │                         Workers                 │
  │                         │                       │
  │                    ┌────┘    ┌──── B3 ──────────┘
  │                    │         │
  │                    └────┬────┘
  │                         │
  │                         └──→ Batch 5: BFF Chat Integration
  │                                  │
  │                                  └──→ Batch 6: E2E Validation
  ```

### Hard vs. Soft Dependencies

| From | To | Type | Reason |
|---|---|---|---|
| B1 → B0 | Hard | Schema and project skeleton must exist |
| B2 → B0 | Hard | Players profile endpoint needed for DisplayNameResolver HTTP fallback |
| B3 → B1 | Hard | Hub send flows require message/conversation persistence |
| B3 → B2 | Hard | Hub send flows require rate limiting and display-name resolution |
| B4 → B3 | Soft | Consumer and workers can technically be built earlier, but testing requires the full hub context. Pushing to after B3 simplifies integration. |
| B5 → B3 | Hard | BFF relay connects to the internal hub — hub must be functional |
| B5 → B0 | Soft | Player card endpoint uses Players profile from B0 — but this is a separate BFF endpoint, not blocking ChatHub |
| B6 → B5 | Hard | E2E tests require the full assembled system |

### Cross-Service Dependencies

| Dependency | Services | Batch | Blocker? |
|---|---|---|---|
| `PlayerCombatProfileChanged` contract | Players → Chat | B4 | No — contract already exists |
| Players profile HTTP endpoint | Players → Chat (resolver), BFF → Players (card) | B0 | Yes — must be implemented first |
| Chat internal hub URL | Chat → BFF | B5 | Config only — URL must be known |
| Chat internal HTTP URLs | Chat → BFF | B5 | Config only |

---

## 7. Parallelization Analysis

### Truly Parallelizable

| Stream A | Stream B | Why safe |
|---|---|---|
| Batch 1 (Postgres persistence) | Batch 2 (Redis layer) | Zero shared code. Different data stores. Independent ports. Can be built and tested completely independently. |
| S3 (Players profile endpoint) | S1.1 (Chat skeleton) | Different services, no shared interfaces |
| Domain tests (S1.2) | Persistence tests (S1.4) | Domain tests are pure; persistence tests need Testcontainers but no domain dependency |

### Parallelizable After Stabilization

| Stream A | Stream B | Stabilize first | Why |
|---|---|---|---|
| S1.7 (Internal hub) | S2.1 (ChatHubRelay) | Hub method signatures | The relay blindly forwards. If hub signatures change, relay must update. Stabilize the hub method signatures (names, parameters, return types) before building the relay. |
| S1.7 (HTTP endpoints) | S2.3 (ChatClient) | Endpoint paths + response shapes | ChatClient calls internal HTTP. If paths or DTOs change, client must update. |
| S2.2 (ChatHub client-facing) | S2.4 (BFF HTTP endpoints) | Neither blocks the other, but both need S2.6 (bootstrap wiring) | Can be built in parallel if DI wiring is done first or mocked. |

### Should NOT Be Parallelized

| Items | Why |
|---|---|
| S1.5 (Redis Lua scripts) and S1.7 (Hub presence integration) | The Lua scripts are the riskiest piece. If the presence lifecycle has bugs, the hub will mask them. Build and thoroughly test the Lua scripts FIRST, then integrate into the hub. |
| S1.3 (SendGlobalMessage handler) and S1.7 (Hub SendGlobalMessage method) | The handler is where the business logic lives. The hub method is a thin wrapper. Build the handler, unit test it with stubbed ports, then wire it into the hub. |
| S4.2 (MassTransit consumer) and S1.5 (Display name cache) | The consumer writes to the cache. Building both at the same time creates ambiguity about whether a bug is in the consumer or the cache. Build the cache first, test it, then add the consumer. |

---

## 8. Testing Decomposition

### Level 1: Domain Unit Tests (Batch 1)
- Conversation sorted-pair invariant (smaller GUID always first)
- Conversation factory methods (global, direct)
- Message content validation: length limits, sanitization rules
- Message factory with all required fields
- Well-known global conversation ID constant
- ConversationType enum values

### Level 2: Application Unit Tests (Batch 1, 2, 3)
- `SendGlobalMessage` handler: **enforces eligibility**, calls rate limiter, resolves name, creates message, persists, updates conversation
- `SendDirectMessage` handler: **enforces eligibility**, calls rate limiter, resolves name, resolves/creates conversation, creates message, persists
- `ConnectUser` handler: calls `IPresenceStore.Connect`, broadcasts `PlayerOnline` only when first connection
- `DisconnectUser` handler: calls `IPresenceStore.Disconnect`, broadcasts `PlayerOffline` only when last connection
- `JoinGlobalChat` handler: **enforces eligibility (rejects ineligible users)**, adds to group, queries recent messages, queries online players (does NOT touch presence)
- `GetConversationMessages` handler: access check (participant validation), delegates to repository
- `GetConversations` handler: returns user's conversations with correct DTO shape
- `HandlePlayerProfileChanged` handler: updates cache with name
- `DisplayNameResolver`: cache hit → returns name; cache miss → HTTP success → returns and caches; HTTP fail → "Unknown"
- All handlers tested with stubbed/faked ports — zero infrastructure

### Level 3: Infrastructure Integration Tests — PostgreSQL (Batch 1)
- Message round-trip: create → save → reload → assert all fields
- Conversation round-trip: create → save → reload
- DM resolution: first call creates, second call returns existing (ON CONFLICT)
- Cursor pagination: correct ordering, correct limit, correct `hasMore`
- `LastMessageAt` update: insert message → conversation.LastMessageAt matches
- Retention delete: old messages removed, new messages kept
- Conversation cleanup: empty direct conversations deleted, global never deleted
- Schema isolation: all tables in `chat` schema
- Snake_case naming verified
- Concurrent DM creation: two simultaneous creates for same pair → one conversation

### Level 4: Infrastructure Integration Tests — Redis (Batch 2)
- **Presence Lua scripts (highest priority):**
  - Connect: first connection returns 1, second returns 0, refcount increments
  - Disconnect: last connection returns 1, non-last returns 0, refcount decrements
  - Disconnect after TTL expiry: no negative refcount, cleanup correct
  - Heartbeat: TTLs renewed, ZSET score updated
  - Multi-tab: connect twice, disconnect once → still online; disconnect second → offline
  - Crash simulation: let TTLs expire, verify ZSET entry stale
- **Presence sweep:**
  - Stale entries removed from ZSET
  - Non-stale entries preserved
  - `ZREM` return value used correctly
- **Rate limiter:**
  - Under limit → allowed
  - At limit → denied with retry-after
  - Window expires → allowed again
  - Redis unavailable → in-memory fallback works
- **Display-name cache:**
  - Set → get → correct value
  - TTL renewed on read
  - Expired key → cache miss
- All tests use real Redis via Testcontainers

### Level 5: Consumer Tests (Batch 4)
- `PlayerCombatProfileChangedConsumer` behavior: updates display-name cache
- Idempotency: same message twice → second is no-op (same cache value, no error)
- Edge cases: null name, missing fields

### Level 6: API/Hub Tests (Batch 3, 5)
- **Chat internal hub:**
  - Auth enforcement: valid JWT → connect, no JWT → reject
  - `JoinGlobalChat` returns correct structure
  - `SendGlobalMessage` with valid content → broadcast received
  - `SendGlobalMessage` with invalid content → `ChatError`
  - Rate-limited send → `ChatError` with `rate_limited` code and `retryAfterMs`
  - `SendDirectMessage` → resolved `conversationId` returned
- **Chat internal HTTP endpoints:**
  - Auth enforcement on all endpoints
  - Correct pagination behavior
  - 404/empty for nonexistent conversations
  - Access check: can't read other user's DM conversations
- **BFF ChatHub:**
  - Auth enforcement: valid JWT → connect, no JWT → reject
  - Relay forwarding: client call → downstream call → response relayed
  - Downstream drop → `ChatConnectionLost` sent to frontend
  - Hung connection → timeout → `ChatConnectionLost`
- **BFF HTTP endpoints:**
  - Proxy to Chat, correct response mapping
  - Auth enforcement
- **Player card endpoint:**
  - Valid player → 200 with correct fields
  - Unknown player → 404
  - Auth enforcement

### Level 7: Cross-Service Contract Tests (Batch 4)
- `PlayerCombatProfileChanged` serialization/deserialization round-trip
- All consumed fields present and correctly typed
- Version field present

### Level 8: End-to-End Smoke Tests (Batch 6)
- Full flow: BFF connect → JoinGlobalChat → SendGlobalMessage → receive broadcast → history matches
- DM flow: send DM → recipient receives → conversation listed → history available
- Presence flow: connect → online → disconnect → offline
- Reconnect: disconnect → reconnect → catch-up returns missed messages
- Multi-tab: two connections → one closes → user still online
- Degradation: Redis down → messaging continues → presence degraded → rate limit falls back

---

## 9. Implementation Risks

### R1: Presence Lua Script Correctness — HIGH
**Risk:** The three Lua scripts (connect, heartbeat, disconnect) are the most complex atomic operations in the system. A bug in refcount management creates ghost online users or premature offline broadcasts.
**Mitigation:** Dedicated batch (B2) for Redis work. Exhaustive integration tests with real Redis. Test every edge case from the multi-tab table in Section 15 of the spec. Do not integrate into the hub until all Lua tests pass.

### R2: Relay Lifecycle in BFF — MEDIUM
**Risk:** The ChatHubRelay manages long-lived downstream connections (unlike BattleHubRelay's short-lived ones). Connection leak, stale tracking dictionary entries, or missed cleanup on disconnect could accumulate over time.
**Mitigation:** Follow `BattleHubRelay` patterns exactly for structure, but add explicit leak detection logging. Test disconnect paths thoroughly. Implement `IAsyncDisposable` correctly for shutdown.

### R3: Contract Drift Between Chat Internal API and BFF — MEDIUM
**Risk:** Chat internal hub method signatures and HTTP response DTOs must match what the BFF relay and ChatClient expect. If they drift during parallel development, integration fails.
**Mitigation:** Stabilize the internal contracts (hub method names, parameters, return types, HTTP paths, response DTOs) as the first artifact of Batch 3 before the BFF builds against them. Consider shared DTO types in a lightweight internal contract — or just copy and test.

### R4: Display-Name Resolver Fallback Chain — LOW-MEDIUM
**Risk:** The three-stage fallback (Redis → HTTP → "Unknown") involves async I/O to two external systems. Timeout handling, retry behavior, and degradation must be correct or message sends stall.
**Mitigation:** Test each fallback stage independently. Set aggressive HTTP timeout for the Players call (2-3 seconds). Log warnings on fallback activation. The fallback is a one-shot attempt, not a retry loop — keep it simple.

### R5: DM Resolution Race Condition — LOW
**Risk:** Two users simultaneously send the first DM to each other. Both attempt `INSERT ... ON CONFLICT DO NOTHING`, one succeeds. The second's `DO NOTHING` means the INSERT returns no row — the subsequent SELECT must find the existing conversation.
**Mitigation:** The `INSERT ... ON CONFLICT DO NOTHING` + `SELECT` pattern is standard and correct for PostgreSQL. Test the concurrent creation case explicitly.

### R6: Redis DB 2 Allocation Conflict — LOW
**Risk:** Redis DB 2 is designated for Chat but might not be configured in existing Redis infrastructure.
**Mitigation:** Verify in docker-compose and appsettings. DB 2 is simply a number — no allocation needed beyond configuration.

### R7: Player Profile Endpoint Timing — LOW
**Risk:** The display-name resolver's HTTP fallback calls the Players profile endpoint. If Chat ships before Players profile endpoint is ready, the fallback chain is broken.
**Mitigation:** Players profile endpoint is in Batch 0 — it ships first. This is a hard dependency and is sequenced correctly.

### R8: Rate-Limit In-Memory Fallback Activation — LOW
**Risk:** The in-memory fallback must activate cleanly when Redis operations throw. If the fallback logic has a bug, either all sends fail (fallback doesn't activate) or rate limiting is completely bypassed (fallback is too permissive).
**Mitigation:** Test Redis-unavailable scenario explicitly. The fallback is a simple `ConcurrentDictionary` — low complexity, but must be tested.

---

## 10. Recommended Execution Order

### Phase 1: Foundations (Batch 0)
Start here. No chat functionality — just the skeleton, migrations, and the Players profile endpoint.

**Rationale:** Everything depends on the project skeleton. The Players profile endpoint is quick, independent, and unblocks two downstream consumers (display-name resolver, player card endpoint).

### Phase 2: Core Data + Redis (Batches 1 and 2 in parallel)
Build the domain model and Postgres persistence (Batch 1) in parallel with the Redis infrastructure (Batch 2).

**Rationale:** These two workstreams are completely independent. Parallelizing them shortens the critical path by approximately one batch duration. Each can be reviewed independently.

**Contract-first:** Before starting Batch 2's `DisplayNameResolver`, finalize the Players profile endpoint response shape (done in Batch 0).

### Phase 3: Hub Integration (Batch 3)
Build the internal SignalR hub and complete all use cases. This is the integration point — it wires Batches 1 and 2 together.

**Rationale:** Must wait for both Batches 1 and 2. This is the critical path bottleneck. Give it focused attention.

**What to stabilize first:** Before writing hub code, define the exact hub method signatures, return types, and event payloads as a contract document (or interface). This unlocks the BFF relay (Batch 5) to start building against stable contracts even before the hub is complete.

### Phase 4: Background + BFF (Batches 4 and 5 in parallel)
Build the MassTransit consumer and workers (Batch 4) in parallel with the BFF chat integration (Batch 5).

**Rationale:** Batch 4 (consumer, workers) is independent of Batch 5 (BFF). Both depend on Batch 3 (hub assembled). Parallelizing them saves time.

**Key risk:** The BFF relay builds against the internal hub's contract. If the hub surface changes during Batch 4 (unlikely but possible if a bug is found), the BFF relay must update. Mitigate by having Batch 3 stabilize its contract surface before Batch 5 starts building against it.

### Phase 5: Validation (Batch 6)
End-to-end validation and hardening. Run after everything is assembled.

### Summary Timeline

```
Week 1:   B0 ─────────────────────────────
Week 2:   B1 (Postgres) ─────  ║  B2 (Redis) ─────
Week 3:   B3 (Hub) ────────────────────────
Week 4:   B4 (Consumer) ─────  ║  B5 (BFF) ───────
Week 5:   B6 (E2E Validation) ────────────
```

(Weeks are illustrative, not estimates.)

---

## 11. Suggested Ownership Model

### Option A: Two Parallel Implementers

| Owner | Streams | Batches |
|---|---|---|
| **Implementer 1 (Chat-focused)** | S1 (Chat service), S3 (Players endpoint), S4 (contracts/glue) | B0, B1, B2, B3, B4 |
| **Implementer 2 (BFF-focused)** | S2 (BFF chat surface) | B5 |

- Implementer 1 does the bulk of the work (Batches 0-4)
- Implementer 2 joins after Batch 3 stabilizes the internal hub contract and builds the BFF surface (Batch 5)
- Both contribute to Batch 6 (E2E validation)
- Implementer 2 can work on other tasks during Batches 0-3

### Option B: Single Implementer (Sequential)

One person does everything sequentially: B0 → B1∥B2 → B3 → B4 → B5 → B6. Still benefits from B1∥B2 parallelization if they can interleave work.

### Coordination Points (Either Option)

| What | Who must coordinate | When |
|---|---|---|
| Internal hub method signatures | Chat implementer defines, BFF implementer consumes | Before Batch 5 starts |
| Internal HTTP endpoint paths + DTOs | Chat implementer defines, BFF implementer consumes | Before Batch 5 starts |
| Players profile endpoint response shape | Players/Chat implementer defines, BFF/Chat consumers | During Batch 0 |
| Review: Lua scripts | Both implementers should review presence Lua scripts | During Batch 2 |
| Review: relay lifecycle | Both implementers should review ChatHubRelay | During Batch 5 |

### Contract Ownership

| Contract Surface | Single Owner |
|---|---|
| Chat internal hub signatures | Chat implementer |
| Chat internal HTTP endpoints | Chat implementer |
| BFF client-facing hub signatures | BFF implementer (but constrained to relay internal contracts) |
| BFF client-facing HTTP endpoints | BFF implementer |
| Players profile response | Chat implementer (consumers determine the contract) |
| `PlayerCombatProfileChanged` | Already exists — Players owns |

---

## 12. Open Execution Questions

### EQ-1: Global conversation bootstrap mechanism
The spec recommends a hardcoded constant GUID (OQ-1 option a). Implementation question: should the global conversation row be inserted via EF Core migration seed data, or on first `JoinGlobalChat` call? Migration seed is more predictable. On-demand is more resilient. Recommendation: migration seed via `HasData()` in the entity configuration.

### EQ-2: Heartbeat implementation in the SignalR hub
The spec says "Chat sends a ping every 30 seconds on each connection." Implementation question: is this a custom application-level ping via a hub method, or does it rely on SignalR's built-in `KeepAliveInterval`? SignalR's built-in ping doesn't execute application code. The presence heartbeat requires executing the Lua script — so this must be an application-level timer per connection that calls the heartbeat Lua script, not just a SignalR keepalive.

### EQ-3: Shared DTOs between Chat internal API and BFF ChatClient — RESOLVED

**Decision:** Option (b) — DTOs duplicated in Chat Api and BFF Application.

**Rationale:** The BFF relay is mostly blind (SignalR events are forwarded without deserialization). Only the HTTP ChatClient needs typed DTOs, and only for 4 endpoints. Duplication is manageable at this scale and avoids adding a new shared project or expanding the role of `Kombats.Chat.Contracts` beyond integration events.

**Concrete behavior:** Chat defines its internal HTTP response DTOs in its Api project. BFF defines matching request/response DTOs in its own Application layer for the `ChatClient`. Contract serialization tests in Batch 6 verify the two sides agree.

### EQ-4: BFF eligibility check data source — RESOLVED

**Decision:** The BFF skips the Layer 1 eligibility check when state is unknown and relies on Chat (Layer 2) as the authoritative enforcement point.

**Rationale:** The BFF is stateless — `GameStateComposer` fetches character data per-request via `PlayersClient.GetCharacterAsync` and does not cache it. There is no existing in-memory player-state cache in the BFF, and introducing one (a `ConcurrentDictionary` with TTL eviction) adds state management complexity to a deliberately stateless service for minimal benefit. The spec explicitly says Layer 1 is "a fast-path optimization, not a security gate" and that when state is not known, the BFF "skips the local check and allows the downstream connection to proceed."

**Concrete behavior:**
- BFF `ChatHub.OnConnectedAsync`: creates the downstream relay connection unconditionally (no eligibility check at connection time — connection is just transport).
- BFF `ChatHub.JoinGlobalChat` / `SendDirectMessage`: no local eligibility check. Forwards to Chat immediately.
- Chat service (Layer 2): performs the authoritative eligibility check on `JoinGlobalChat` and `SendDirectMessage` using its display-name cache and Players HTTP fallback. Rejects ineligible users with `ChatError(code: "not_eligible")`.

**Why this is safe:** Chat's Layer 2 enforcement is always active regardless of BFF behavior. The cost is that an ineligible user's BFF relay connection is created before Chat rejects them on the first hub method call — one wasted downstream WebSocket setup. At v1 scale this is negligible. If the BFF later gains per-user state (e.g., for session tracking), Layer 1 can be added as an optimization without changing the Chat-side enforcement.

### EQ-5: Hub invocation timeout configuration
The spec says 15 seconds default for hung-connection detection. Where is this configured? Options:
- (a) `HubConnection.ServerTimeout` on the downstream connection
- (b) `CancellationTokenSource` with timeout on each individual `InvokeAsync` call
- (c) Both

Recommendation: (b) — per-invocation timeout gives more control and matches the spec's description of "when the BFF forwards a client command."

### EQ-6: Review items from architecture review
The round-2 review identified non-blocking items that should be resolved during implementation:
- **I1:** Relabel rate-limit algorithm as "fixed-window counter" (documentation fix, already correct in spec Section 16)
- **I2:** Align internal hub parameter naming (`recipientPlayerId` vs `recipientIdentityId`) — resolve during hub implementation
- **I3:** Cap `onlinePlayers` in `JoinGlobalChatResult` at 100 — already resolved in spec revision
- **I4:** `lastMessageAt` maintenance — resolved in spec: denormalized column updated on insert
- **I5:** Heartbeat script guard for TTL-expired user — implement EXISTS check in Lua script (low risk, per review)

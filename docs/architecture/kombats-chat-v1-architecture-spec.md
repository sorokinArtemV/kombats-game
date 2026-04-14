# Kombats Chat v1 — Architecture Specification

**Status:** Draft — post-review correction pass, ready for task decomposition
**Date:** 2026-04-14 (revised 2026-04-14)
**Scope:** First version of the Kombats chat system
**Supersedes:** `docs/chat/chat.md` (initial proposal)
**Revision note:** Post-review correction pass applying findings from `docs/architecture/reviews/kombats-chat-v1-architecture-review.md`. Changes: atomic Lua presence lifecycle (C1), unambiguous rate-limit algorithm (I2), BFF eligibility when state unknown (I5), display-name cache TTL (I3), explicit v1 deployment constraints (Q4), SignalR group/Redis separation (failure modes), hung-connection detection, reconnect dedup contract, DM presence scope.

---

## 1. Purpose and Scope

This specification defines the backend architecture for the first version of the Kombats chat system. It is intended for review and approval before task decomposition and implementation.

### What v1 delivers (Chat capability)

- Global chat: a single room visible to all eligible online players
- Direct messages: 1:1 private conversations between two players
- Online presence: who is currently connected to chat
- Recent message history: cursor-paginated, 24-hour rolling retention

### Companion capability required by the chat client experience

- **Public player profile / player card:** display name, level, stats, wins, losses. This is **not part of the Chat domain**. It is a separate capability owned by Players and composed by the BFF. It is documented here because the chat UI depends on it (player cards in chat, sender identity in messages), but Chat does not own, persist, or model player profile data beyond the minimal display-name cache needed for message stamping.

### What v1 does not deliver

Party/guild chat, unread counters, typing indicators, block/mute enforcement, push notifications, message edit/delete, media attachments, message search, advanced moderation workflows, avatar/image in player cards.

These are explicitly deferred. The architecture must not prevent them but must not accommodate them prematurely.

---

## 2. Architectural Decisions

### AD-CHAT-01: Chat is a new standalone microservice

Chat is implemented as `Kombats.Chat`, a new service following the established per-service project structure (Bootstrap/Api/Application/Domain/Infrastructure/Contracts).

**Rationale:**
- The BFF is a stateless relay/composition layer with zero persistence and zero domain logic. Adding chat domain logic and persistence would violate its established role.
- Players owns character identity and combat profiles. Chat conversations, messages, and presence are not player identity concerns.
- Battle and Matchmaking are scoped to their domains with no business coupling to chat.
- The existing infrastructure (PostgreSQL schema-per-service, Redis DB-per-service, `Kombats.Messaging` library, established project template) directly supports a new service without new operational patterns.

### AD-CHAT-02: BFF remains the sole client-facing boundary

The frontend connects only to the BFF. The Chat service exposes no public-facing surfaces. All client traffic is proxied through BFF endpoints and hubs.

**Rationale:** Consistent with the established architecture. The BFF already proxies Battle realtime traffic. A single frontend boundary simplifies auth, CORS, TLS termination, and operational monitoring.

### AD-CHAT-03: Players remains the sole source of truth for player profile data

Chat does not own or project full player profiles. Chat maintains only a minimal display-name cache for message stamping. Player card data is always fetched live from Players through the BFF.

### AD-CHAT-04: IdentityId is the canonical cross-service player identifier

See [Section 3: Identifier Model](#3-identifier-model) for the full analysis and decision.

### AD-CHAT-05: v1 realtime topology uses the BFF relay pattern with per-user downstream connections

This is a **v1-scoped trade-off**, not a long-term architectural prescription. It is chosen because it fits current Kombats patterns and avoids new infrastructure work for v1. It has known scaling costs and is a likely migration point if chat concurrency grows materially. See [Section 6: Realtime Topology Decision](#6-realtime-topology-decision) for the full analysis, alternatives considered, and scaling boundaries.

### AD-CHAT-06: Message persistence in PostgreSQL, ephemeral state in Redis

Messages and conversations are stored in PostgreSQL (`chat` schema). Presence, rate-limit counters, and the display-name cache are stored in Redis (DB 2). See [Section 13: Storage Model](#13-storage-model).

### AD-CHAT-07: 24-hour message retention for v1

Messages older than 24 hours are deleted by a periodic background worker. This is a configurable value, not a hard architectural constraint. See [Section 8](#8-conversation-and-message-model) for details.

### AD-CHAT-08: Coarse local fallback for rate limiting when Redis is unavailable

When Redis is unavailable, the Chat service falls back to a coarse in-memory per-instance rate limiter rather than either disabling throttling or rejecting all sends. See [Section 15](#15-failure-and-degradation-behavior) for the full policy.

### AD-CHAT-09: Defense-in-depth eligibility enforcement

Chat eligibility (`OnboardingState == Ready`) is enforced at both the BFF (early rejection) and the Chat service (authoritative check). See [Section 16](#16-security-authorization-and-abuse-baseline) for the enforcement model.

---

## 3. Identifier Model

### Analysis of the existing codebase

The codebase uses two player-related identifiers:

| Identifier | Source | Scope |
|---|---|---|
| `IdentityId` | Keycloak JWT `sub` claim (Guid) | Cross-service canonical identifier. Used in all integration contracts (`PlayerCombatProfileChanged`, `BattleCompleted`, `CreateBattle`), all realtime contracts (`PlayerAId`/`PlayerBId` in `BattleSnapshotRealtime`), Matchmaking queue operations, and Battle access validation. |
| `CharacterId` | Players-generated Guid | Players-internal primary key. Carried alongside `IdentityId` in some contracts (`BattleParticipantSnapshot`, `PlayerCombatProfileChanged`) but not used as the routing/lookup identifier by consumers. Matchmaking stores it in its projection but keys lookups by `IdentityId`. |

The relationship is 1:1: one `IdentityId` maps to exactly one `Character` via `Character.CreateDraft(identityId)`.

### Decision

**`IdentityId` is the canonical player identifier for chat.** This is not a new decision — it is the existing cross-service convention. Every service already resolves players by `IdentityId`.

### Client-facing field naming

In client-facing DTOs (BFF responses, SignalR event payloads), the field is named **`playerId`** — a game-domain name, not an auth-system name. The underlying value is the Keycloak `sub` Guid.

This follows the existing precedent: Battle realtime contracts already use `PlayerAId`/`PlayerBId`/`WinnerPlayerId` for the same identity ID values.

### Where each identifier is used

| Context | Identifier | Field name |
|---|---|---|
| Client-facing DTOs (BFF HTTP responses, SignalR payloads) | Identity ID value | `playerId` |
| Chat domain and infrastructure (internal) | Identity ID value | `senderIdentityId`, `participantIdentityId` |
| Integration contracts consumed by Chat (`PlayerCombatProfileChanged`) | Identity ID value | `IdentityId` (publisher's naming) |
| Redis keys (presence, rate-limit, name cache) | Identity ID value | Embedded in key pattern |
| JWT claim extraction (Chat service auth) | `sub` / `ClaimTypes.NameIdentifier` | N/A (runtime extraction) |

### What Chat does NOT use

`CharacterId` is not used by Chat. Chat has no need to reference the Players-internal entity ID. All player lookups, presence keys, and message attribution use `IdentityId`.

### Player card endpoint

The BFF player card endpoint accepts a `playerId` path parameter (which is the identity ID value). The BFF translates this to a Players API call using the same value, since Players' new profile endpoint also accepts `identityId`.

---

## 4. Service Boundaries and Ownership

### Kombats.Chat (new)

**Owns:**
- Conversations: creation, lookup, lifecycle
- Messages: persistence, retrieval, retention cleanup
- Presence: connected-to-chat session tracking, online-player queries
- Rate limiting: per-user message rate enforcement
- Moderation hooks: `IMessageFilter` and `IUserRestriction` application ports (v1 implementations: length/rate checks only)
- Display-name cache: minimal `(identityId -> name)` projection from Players events, used solely for message stamping

**Does not own:**
- Canonical player identity, stats, wins/losses, profiles
- Authentication (delegates to Keycloak JWT, same as all services)
- Battle state, matchmaking state
- Presence outside chat context (no platform-wide "user is logged in" concept)

**Publishes (MassTransit):** Nothing in v1. No downstream consumers exist.
**Consumes (MassTransit):** `PlayerCombatProfileChanged` from Players (for display-name cache).

### Kombats.Bff (expanded surface, unchanged role)

**Owns (chat-related additions):**
- `ChatHub` (new): frontend-facing SignalR hub for chat
- `ChatHubRelay` (new): downstream relay to Chat service, following the `BattleHubRelay` pattern
- `ChatClient` (new): typed HTTP client for Chat internal APIs
- JWT forwarding to Chat (same `JwtForwardingHandler` pattern)

**Owns (general, pre-existing role):**
- Single client-facing HTTP + SignalR boundary
- Player card / profile composition: calls Players for profile data, returns to frontend. This is a general BFF composition responsibility, not a Chat-specific feature.

**Does not own:**
- Chat domain logic, message persistence, presence tracking, rate limiting
- Canonical player profile data (Players owns this)

### Kombats.Players (one new endpoint, otherwise unchanged)

**Owns:**
- `Character` entity: name, stats, wins, losses, XP, level, onboarding state
- `PlayerCombatProfileChanged` event publication
- Source of truth for all player profile fields

**New responsibility:**
- Public player profile query endpoint: `GET /api/v1/players/{identityId}/profile`. Returns display name, level, stats, wins, losses. The data already exists on the `Character` entity — this is a new read path, not new data.

**Does not own:**
- Chat, presence, moderation

### Kombats.Battle (unchanged)

No chat responsibilities. No changes.

### Kombats.Matchmaking (unchanged)

No chat responsibilities. No changes.

---

## 5. First-Version Feature Scope

### Global chat
- Single global room. All players with `OnboardingState == Ready` can join.
- Messages broadcast to all connected participants.
- No sub-rooms, channels, or sharding in v1.
- Global conversation has a well-known deterministic ID (see [Section 8](#8-conversation-and-message-model)).

### Direct messages
- 1:1 private conversations between two players.
- Either participant can initiate by sending a message to a `playerId`.
- Conversation is created on first message if it does not exist.
- Both participants receive realtime delivery when connected.
- See [Section 9](#9-direct-message-resolution-model) for conversation resolution.

### Presence
- Chat-scoped: "online" means connected to the ChatHub.
- Online player list available to all connected users.
- Presence changes broadcast to global chat participants.
- See [Section 7](#7-presence-model) for full model.

### Message history
- 24-hour rolling retention.
- Cursor-paginated retrieval (keyset pagination by `sentAt`).
- Available for both global and direct conversations.
- Client fetches on connect and on reconnect (since last-seen timestamp).

### Public player profile / player card (companion — not Chat-owned)
- Owned by Players, composed by BFF, consumed by chat UI.
- Fields: display name, level, strength, agility, intuition, vitality, wins, losses.
- BFF fetches live from Players on demand. Chat has no role beyond display-name cache for message stamping.
- See [Section 10](#10-public-player-profile-model-companion-capability) for details.

---

## 6. Realtime Topology Decision

### Options evaluated

#### Option A: Per-user relay (BattleHubRelay pattern)

Frontend connects to BFF `ChatHub`. BFF creates one downstream SignalR `HubConnection` to Chat's internal hub per connected user. All commands (send message, join global) and events (receive message, presence change) flow through this dedicated connection. Chat service uses SignalR groups to broadcast to all downstream connections in a room.

#### Option B: HTTP commands + internal event fan-out

Frontend connects to BFF `ChatHub`. BFF sends commands to Chat via HTTP (send message, join global). Chat persists and processes commands, then publishes events via an internal channel (Redis pub/sub, MassTransit, or a single shared service-to-service SignalR connection). BFF receives events and broadcasts to its local SignalR groups.

### Decision: Option A — per-user relay (v1 trade-off)

This is a **deliberate v1 trade-off**, not a universal recommendation. The relay pattern is chosen for pragmatic reasons specific to the current state of the Kombats codebase and expected v1 scale. It has known scaling costs that make it a likely migration point if chat grows beyond hundreds of concurrent users per instance.

### Rationale

**Option A fits v1 better for these concrete reasons:**

1. **Proven pattern.** The `BattleHubRelay` is 420 lines of working code with established lifecycle management, error handling, cleanup, and `IHubContext`-based frontend targeting. The Chat relay is structurally the same — different events, same wiring. Option B requires building a new internal pub/sub pattern that does not exist anywhere in the BFF today.

2. **Natural presence lifecycle.** Each downstream connection maps to exactly one user session. Connect = online, disconnect = offline. Presence tracking falls out of connection lifecycle. With Option B, presence must be managed separately via heartbeats and polling — additional state to coordinate.

3. **Simpler auth propagation.** The relay forwards the user's JWT on the downstream connection (same as `BattleHubRelay` line 60). Chat service validates each connection independently. With Option B, the BFF would need to inject user identity into HTTP headers and trust the BFF's auth assertion — a different trust model.

4. **Bidirectional per-user channel.** Chat events (DMs) are user-targeted, not just broadcast. The relay naturally delivers user-specific events to the right frontend connection. With Option B, the BFF would need to demultiplex a shared event stream and route to specific connections — additional fan-out logic.

### Why Option B is worse for v1

- **New infrastructure dependency in BFF.** Option B requires either Redis pub/sub or MassTransit in the BFF. The BFF currently has zero messaging infrastructure — it is pure HTTP + SignalR. Adding Redis or MassTransit is a meaningful operational expansion for v1.
- **More complex event routing.** With a shared channel, the BFF must determine which local users care about each event and fan out accordingly. The relay pattern eliminates this — Chat service handles group routing, and each relay connection only receives events for its user.
- **Two communication paths instead of one.** HTTP for commands + pub/sub for events means two failure modes, two monitoring paths, two retry strategies. The relay is a single bidirectional channel.

### Known scaling costs and migration trigger

The relay creates O(N) downstream SignalR connections where N = total connected chat users across all BFF instances. Each connection is a WebSocket that is idle most of the time (receiving broadcasts, occasional sends).

**This is the primary architectural weakness of Option A.** Unlike Battle relay (connections are short-lived, scoped to a single battle), chat relay connections are long-lived (entire user session). Every connected chat user holds one downstream WebSocket open for the duration of their session. This is fundamentally more expensive than Option B at scale.

**Practical limit:** A single Chat service instance can handle ~10,000–50,000 concurrent WebSocket connections depending on hardware. At v1 scale (hundreds of users) this is not a concern.

**Migration trigger:** If the system grows beyond ~10,000 concurrent chat users per Chat instance, or if BFF horizontal scaling makes the downstream connection fan-out operationally expensive, migrate to Option B (shared pub/sub). This migration is internal to BFF/Chat and does not change client-facing contracts — the `ChatHub` client-facing surface is stable regardless of the internal topology.

**This decision should not be read as the long-term chat topology.** It is explicitly chosen for v1 pragmatism. A production system with significant chat load would likely use Option B or a dedicated messaging broker for event fan-out.

### Connection lifecycle

| Event | BFF behavior | Chat behavior |
|---|---|---|
| Frontend connects to `/chathub` | Creates downstream `HubConnection` to Chat `/chathub-internal` with user's JWT | Validates JWT, registers connection, records presence |
| Frontend calls `JoinGlobalChat` | Forwards to downstream `JoinGlobalChat` | Adds connection to global chat group, returns recent message page |
| Frontend calls `SendGlobalMessage` | Forwards to downstream | Validates, rate-checks, persists, broadcasts to global group |
| Frontend calls `SendDirectMessage` | Forwards to downstream | Validates, rate-checks, resolves/creates conversation, persists, sends to recipient's connection(s) |
| Frontend disconnects | Disposes downstream connection, removes from tracking dictionary | Detects disconnect, removes presence, broadcasts `PlayerOffline` |
| Downstream connection drops | Sends `ChatConnectionLost` event to frontend, removes from tracking | Detects disconnect, removes presence |
| Downstream connection hangs (open but unresponsive) | Detected via hub invocation timeout (see below). BFF tears down the downstream connection, sends `ChatConnectionLost` to frontend, removes from tracking. | N/A (connection torn down by BFF) |
| Chat service unavailable on connect | Returns error to frontend `JoinGlobalChat` | N/A |

### Hung-connection detection

A downstream relay connection can become unresponsive without the TCP connection dropping (e.g., Chat process is frozen, network partition allows keepalives but not data). The BFF detects this via **hub invocation timeout**:

- When the BFF forwards a client command (e.g., `SendGlobalMessage`) to the downstream hub, it uses a configurable invocation timeout (default: 15 seconds).
- If the downstream hub does not respond within the timeout, the BFF treats the connection as hung.
- The BFF tears down the downstream `HubConnection`, removes it from the tracking dictionary, and sends `ChatConnectionLost` to the frontend with `reason: "downstream_timeout"`.
- The frontend handles this identically to a dropped connection — it attempts reconnect after a delay.

This reuses the same error path as a dropped connection. No separate monitoring or heartbeat protocol is needed beyond the invocation timeout on forwarded calls.

---

## 7. Presence Model

### Definition

"Online" means the player has an active downstream connection from the BFF to Chat's internal hub. This is **chat-specific presence**, not a platform-wide "user is logged in" state.

### Source of truth

Chat service Redis (DB 2). Presence is stored in Redis, not PostgreSQL, because it is ephemeral, high-frequency, and must be shared across multiple Chat instances.

### Data structures

**Per-user presence record:**
```
Key:    chat:presence:{identityId}
Value:  JSON { "name": "<displayName>", "connectedAtUnixMs": <long> }
TTL:    90 seconds (renewed on heartbeat)
```

**Online player set (for "who's online" queries):**
```
Key:    chat:presence:online
Type:   ZSET
Score:  last-heartbeat unix milliseconds
Member: identityId (string)
```

**Multi-tab/multi-device reference count:**
```
Key:    chat:presence:refs:{identityId}
Type:   INT (via INCR/DECR)
TTL:    90 seconds (renewed on any heartbeat from any connection)
```

### Lifecycle — atomic Lua scripts required

The connect and disconnect sequences each touch multiple Redis keys (refcount, ZSET, presence record, TTLs). These **must** be executed as atomic Lua scripts to prevent divergence between refcount and ZSET state on crash, and to prevent negative refcount on disconnect-after-TTL-expiry.

**1. Connect (Lua script `presence_connect`):**

Inputs: `identityId`, `displayName`, `nowUnixMs`

```
-- Atomic connect: INCR refcount, conditionally add to ZSET + set presence record
local refs = redis.call('INCR', KEYS[1])           -- chat:presence:refs:{id}
redis.call('EXPIRE', KEYS[1], 90)
if refs == 1 then
  redis.call('ZADD', KEYS[2], ARGV[1], ARGV[2])    -- chat:presence:online, score=nowMs, member=id
  redis.call('SET', KEYS[3], ARGV[3], 'EX', 90)    -- chat:presence:{id}, value=JSON, TTL=90s
  return 1  -- first connection: caller broadcasts PlayerOnline
end
return 0    -- additional connection: no broadcast needed
```

If the script returns 1, the Chat service broadcasts `PlayerOnline` to the global chat group after the script completes. If it returns 0, no broadcast.

**2. Heartbeat (Lua script `presence_heartbeat`):**

Inputs: `identityId`, `nowUnixMs`

```
-- Atomic heartbeat: renew TTLs, update ZSET score
redis.call('EXPIRE', KEYS[1], 90)                   -- chat:presence:refs:{id}
redis.call('EXPIRE', KEYS[2], 90)                   -- chat:presence:{id}
redis.call('ZADD', KEYS[3], ARGV[1], ARGV[2])       -- chat:presence:online, score=nowMs, member=id
return 1
```

Chat sends a ping every 30 seconds on each connection. On response, execute the heartbeat script.

**3. Graceful disconnect (Lua script `presence_disconnect`):**

Inputs: `identityId`

```
-- Atomic disconnect: clamp-to-zero DECR, conditionally remove from ZSET + delete presence
local refs = tonumber(redis.call('GET', KEYS[1])) or 0
if refs <= 1 then
  redis.call('DEL', KEYS[1])                         -- chat:presence:refs:{id}
  redis.call('ZREM', KEYS[2], ARGV[1])               -- chat:presence:online
  redis.call('DEL', KEYS[3])                          -- chat:presence:{id}
  return 1  -- last connection: caller broadcasts PlayerOffline
end
redis.call('DECR', KEYS[1])
return 0    -- other connections remain: no broadcast
```

If the script returns 1, the Chat service broadcasts `PlayerOffline` to the global chat group. The `GET`-then-conditional-DECR pattern prevents the refcount from going negative (e.g., if a disconnect fires after the refcount key has already expired via TTL).

**4. Ungraceful disconnect / crash:** The 90-second TTL on the presence key and refcount key acts as a safety net. A periodic sweep (every 60 seconds) scans the ZSET for entries with scores older than 90 seconds and removes them, broadcasting `PlayerOffline` for each removed entry.

### Staleness tolerance

Up to 90 seconds. A player can appear online for at most 90 seconds after their last connection is lost ungracefully. This is acceptable for game chat and is the standard behavior in similar systems.

### Multi-instance behavior

Redis is the shared state. Multiple Chat instances read and write the same keys. The Lua scripts execute atomically on the Redis server — no cross-key race conditions are possible regardless of how many Chat instances are connected. No sticky sessions are required.

### Multi-tab / multi-device

The reference count ensures a player appears online as long as at least one connection exists. Opening a second tab increments the refcount. Closing one tab decrements it. The player goes offline only when all tabs/devices disconnect.

**Edge case:** If all connections drop ungracefully (e.g., network loss), the refcount key TTL (90s) ensures eventual cleanup. The periodic sweep catches any ZSET entries whose refcount key has expired.

### Presence broadcast scope

v1 broadcasts `PlayerOnline`/`PlayerOffline` to the global chat SignalR group only. Users not in global chat do not receive presence updates. This limits fan-out to the active audience.

**DM presence limitation (v1):** A user viewing a DM conversation does not receive realtime presence updates for their conversation partner unless they are also in the global chat group. The HTTP presence endpoint (`GET /api/v1/chat/presence/online`) can be used for one-shot checks, but there is no targeted "is player X online?" query in v1. DM presence freshness is not guaranteed in realtime. This is an accepted v1 limitation. A targeted `GET /api/v1/chat/presence/{playerId}` endpoint or subscription-based per-user presence can be added later if DM UX requires it.

---

## 8. Conversation and Message Model

### Conversation

```
Conversation:
  Id:           Guid
  Type:         ConversationType enum { Global = 0, Direct = 1 }
  CreatedAt:    DateTimeOffset
  LastMessageAt: DateTimeOffset | null

  # Direct conversations only:
  ParticipantAIdentityId:  Guid
  ParticipantBIdentityId:  Guid

  # Constraint: for Direct, participants are stored in sorted order
  #   (smaller Guid first) to ensure deterministic lookup.
```

`LastMessageAt` is a **denormalized field updated on each message insert** (set to the new message's `SentAt`). This avoids a join/subquery when listing conversations ordered by recent activity.

**Global conversation:** A singleton with a well-known deterministic ID. Generated from a fixed namespace UUID v5 or hardcoded as a constant (e.g., `00000000-0000-0000-0000-000000000001`). Created on first service startup if absent.

**Direct conversation:** Created lazily on first message between two participants. See [Section 9](#9-direct-message-resolution-model).

### Message

```
Message:
  Id:                   Guid (server-generated, v7 for time-ordered IDs)
  ConversationId:       Guid (FK to Conversation)
  SenderIdentityId:     Guid
  SenderDisplayName:    string (denormalized at write time from cache)
  Content:              string (max 500 chars, sanitized)
  SentAt:               DateTimeOffset (server timestamp)
```

**`SenderDisplayName` denormalization:** The display name is stamped on the message at write time. This is a convenience snapshot — it means historical messages show the name the sender had at send time. If the name changes, old messages retain the old name. This is intentional and standard for chat systems.

### Persistence

PostgreSQL, `chat` schema.

**Tables:**
- `conversations` — conversation metadata, indexed on `(type)` and `(participant_a_identity_id, participant_b_identity_id)` for Direct conversations
- `messages` — message content, indexed on `(conversation_id, sent_at DESC)` for efficient cursor pagination
- MassTransit outbox/inbox tables (standard `Kombats.Messaging` pattern)

### Retention

24-hour rolling window. A background worker (`MessageRetentionWorker`) runs every hour, executing:
```sql
DELETE FROM chat.messages WHERE sent_at < now() - interval '24 hours';
```

This is a configurable value (`Chat:Retention:MessageTtlHours`), not a hard architectural constraint. Extending retention later requires only a config change and potentially an index adjustment.

**Conversation cleanup:** Direct conversations with no remaining messages (all expired) are eligible for deletion by the same worker. The global conversation is never deleted.

### History retrieval

Cursor-based keyset pagination using `sentAt` as the cursor:
- `GET /api/internal/conversations/{id}/messages?before={sentAtUtc}&limit=50`
- Default limit: 50, max limit: 100
- Returns messages in descending order (newest first)
- Client scrolls backward by passing the `sentAt` of the oldest message in the current page

### Reconnect / missed-message recovery

On reconnect, the client includes the timestamp of the last message it received. The BFF passes this to Chat's history endpoint (`?after={lastSeenUtc}&limit=200`) to fetch missed messages. The 24-hour retention window caps the maximum catch-up window.

**Deduplication contract:** The `?after={lastSeenUtc}` parameter uses a **strict greater-than** comparison (`sent_at > @after`), not greater-than-or-equal. This means the server guarantees no overlap between messages already received and catch-up messages, provided the client passes the exact `sentAt` of its last received message. Client-side dedup by `messageId` is **not required** for correctness, though it is harmless if implemented defensively.

For brief disconnects (seconds), SignalR's built-in automatic reconnect (`withAutomaticReconnect` on the client) handles most cases — the connection resumes without explicit message recovery.

---

## 9. Direct-Message Resolution Model

### Problem

The client UX opens a DM "with player X", not "with conversation Y". The spec must define how the client resolves from a player identity to a conversation.

### Decision: Client addresses DMs by `playerId`, Chat resolves internally

The client never needs to know or manage `conversationId` to send a DM. The flow is:

1. Client calls `SendDirectMessage(recipientPlayerId, content)` on the ChatHub.
2. Chat service receives the sender's identity (from JWT) and the recipient's identity.
3. Chat deterministically resolves the conversation:
   - Normalize participant order: `(min(senderIdentityId, recipientIdentityId), max(...))`.
   - Look up by `(ParticipantAIdentityId, ParticipantBIdentityId)` — unique constraint guarantees at most one conversation per pair.
   - If found, use it. If not, create it atomically (INSERT with ON CONFLICT DO NOTHING + SELECT).
4. Message is persisted against the resolved conversation.
5. Realtime delivery includes the `conversationId` in the payload so the client can group messages by conversation.

### Conversation listing

The BFF exposes `GET /api/v1/chat/conversations` which returns the user's active conversations. **v1 does not paginate this endpoint.** With 24-hour message retention and automatic deletion of empty conversations, the practical conversation count per user is bounded by the number of distinct DM partners within 24 hours — unlikely to exceed low tens. If retention is extended in the future, pagination must be added.

```
[
  {
    "conversationId": "...",
    "type": "Global",
    "lastMessageAt": "2026-04-14T10:30:00Z"
  },
  {
    "conversationId": "...",
    "type": "Direct",
    "otherPlayer": {
      "playerId": "...",
      "displayName": "PlayerName"
    },
    "lastMessageAt": "2026-04-14T10:25:00Z"
  }
]
```

### History retrieval by player

For convenience, the BFF also supports fetching DM history by the other player's ID:

`GET /api/v1/chat/direct/{otherPlayerId}/messages?before={sentAt}&limit=50`

The BFF translates this to a Chat internal call that resolves the conversation by participant pair. If no conversation exists, returns an empty result (not an error).

### Summary

| Client action | What the client provides | What Chat resolves |
|---|---|---|
| Send a DM | `recipientPlayerId` + `content` | Deterministic conversation lookup/creation by sorted participant pair |
| Open DM conversation | `otherPlayerId` | Conversation lookup by participant pair, returns messages |
| List conversations | Nothing (implicit from JWT) | All conversations where user is a participant, ordered by last activity |
| Fetch conversation history | `conversationId` (received from listing or realtime events) | Direct lookup by ID |

`conversationId` is **both internal and client-facing** — it appears in realtime event payloads and conversation listings. But the client never needs to construct or guess it. The client can always start from a `playerId`.

---

## 10. Public Player Profile Model (Companion Capability)

> **Ownership note:** This section documents a capability that is **not part of the Chat service**. It is a companion capability owned by Players and composed by BFF, documented here because the chat client experience depends on it. Chat's only interaction with player profile data is the display-name cache described in [Section 14](#14-caching-and-projection-model).

### Fields exposed

| Field | Type | Source entity field | Notes |
|---|---|---|---|
| `playerId` | Guid | `Character.IdentityId` | Canonical public identifier |
| `displayName` | string | `Character.Name` | Null if not yet named (shouldn't reach chat — gate is `Ready`) |
| `level` | int | `Character.Level` | Derived from XP via leveling policy |
| `strength` | int | `Character.Strength` | |
| `agility` | int | `Character.Agility` | |
| `intuition` | int | `Character.Intuition` | |
| `vitality` | int | `Character.Vitality` | |
| `wins` | int | `Character.Wins` | Currently in domain but not exposed in `MeResponse` |
| `losses` | int | `Character.Losses` | Currently in domain but not exposed in `MeResponse` |

### Ownership

**Players** is the sole source of truth. The `Character` entity already contains all fields. `CharacterStateResult` (application layer) already includes wins/losses internally — the current `MeResponse` DTO simply omits them.

### Delivery to client

**BFF composes the player card** by calling a new Players endpoint:

```
GET /api/v1/players/{identityId}/profile
→ 200: { playerId, displayName, level, strength, agility, intuition, vitality, wins, losses }
→ 404: player not found
```

The BFF exposes this to the frontend as:

```
GET /api/v1/players/{playerId}/card
```

The BFF does not cache this response. Player card data is fetched live on demand. The data changes infrequently (only on stat allocation, battle completion) and the fetch is a simple DB read — caching adds staleness risk without meaningful performance gain at v1 scale.

### What Chat stores

Chat stores only `(identityId -> displayName)` in Redis for message stamping. Chat does **not** store stats, wins, losses, level, or any other profile field. This is a minimal denormalization, not a profile projection.

---

## 11. Client-Facing BFF Contracts

### HTTP Endpoints

All endpoints require `[Authorize]` (Keycloak JWT).

| Method | Path | Description | Response |
|---|---|---|---|
| GET | `/api/v1/chat/conversations` | List user's active conversations | `ConversationListResponse` |
| GET | `/api/v1/chat/conversations/{conversationId}/messages?before={sentAt}&limit=50` | Paginated message history by conversation | `MessageListResponse` |
| GET | `/api/v1/chat/direct/{otherPlayerId}/messages?before={sentAt}&limit=50` | Paginated DM history by other player | `MessageListResponse` |
| GET | `/api/v1/chat/presence/online?limit=100&offset=0` | Online players list | `OnlinePlayersResponse` |

**Companion endpoint (not Chat-owned — general BFF composition):**

| Method | Path | Description | Response |
|---|---|---|---|
| GET | `/api/v1/players/{playerId}/card` | Player card (BFF composes from Players service) | `PlayerCardResponse` |

### Response DTOs

**ConversationListResponse:**
```
{
  "conversations": [
    {
      "conversationId": Guid,
      "type": "Global" | "Direct",
      "otherPlayer": { "playerId": Guid, "displayName": string } | null,
      "lastMessageAt": DateTimeOffset | null
    }
  ]
}
```

**MessageListResponse:**
```
{
  "messages": [
    {
      "messageId": Guid,
      "conversationId": Guid,
      "sender": { "playerId": Guid, "displayName": string },
      "content": string,
      "sentAt": DateTimeOffset
    }
  ],
  "hasMore": bool
}
```

**OnlinePlayersResponse:**
```
{
  "players": [
    { "playerId": Guid, "displayName": string }
  ],
  "totalOnline": int
}
```

**PlayerCardResponse** (companion — BFF composition from Players, not Chat-owned):
```
{
  "playerId": Guid,
  "displayName": string,
  "level": int,
  "strength": int,
  "agility": int,
  "intuition": int,
  "vitality": int,
  "wins": int,
  "losses": int
}
```

### SignalR Hub — `/chathub`

**Client-to-server methods:**

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `JoinGlobalChat` | — | `JoinGlobalChatResult` | Subscribe to global chat + presence. Returns recent message page + online player snapshot (capped at 100; use HTTP endpoint for full paginated list). |
| `LeaveGlobalChat` | — | void | Unsubscribe from global chat + presence broadcasts. |
| `SendGlobalMessage` | `content: string` | void | Send message to global chat. |
| `SendDirectMessage` | `recipientPlayerId: Guid, content: string` | `SendDirectMessageResult` | Send DM. Returns the resolved `conversationId`. |

**`JoinGlobalChatResult`:**
```
{
  "conversationId": Guid,
  "recentMessages": [ MessagePayload... ],
  "onlinePlayers": [ { "playerId": Guid, "displayName": string }... ],
  "totalOnline": int
}
```

`onlinePlayers` returns at most **100 entries** (first 100 from the ZSET). `totalOnline` returns the full count. For the complete paginated list, clients use `GET /api/v1/chat/presence/online`. At v1 scale (hundreds of users) 100 is likely the full set; the cap prevents unbounded payloads if online population grows.

**`SendDirectMessageResult`:**
```
{
  "conversationId": Guid,
  "messageId": Guid,
  "sentAt": DateTimeOffset
}
```

**Server-to-client events:**

| Event | Payload | Delivery scope |
|---|---|---|
| `GlobalMessageReceived` | `{ messageId: Guid, sender: { playerId: Guid, displayName: string }, content: string, sentAt: DateTimeOffset }` | Global chat group |
| `DirectMessageReceived` | `{ messageId: Guid, conversationId: Guid, sender: { playerId: Guid, displayName: string }, content: string, sentAt: DateTimeOffset }` | Recipient's connection(s) only |
| `PlayerOnline` | `{ playerId: Guid, displayName: string }` | Global chat group |
| `PlayerOffline` | `{ playerId: Guid }` | Global chat group |
| `ChatError` | `{ code: string, message: string, retryAfterMs: int? }` | Caller only |
| `ChatConnectionLost` | `{ reason: string }` | Caller only (on downstream failure) |

**Error codes for `ChatError`:**

| Code | Meaning |
|---|---|
| `rate_limited` | Message rate exceeded. `retryAfterMs` indicates cooldown. |
| `message_too_long` | Content exceeds 500 characters. |
| `message_empty` | Content is empty after sanitization. |
| `recipient_not_found` | DM recipient does not exist or is not `Ready`. |
| `not_eligible` | Sender's onboarding is not `Ready`. |

---

## 12. Internal Chat Service Contracts

### Internal SignalR Hub — `/chathub-internal`

Not exposed to frontend. Only the BFF connects to this hub.

**Methods (same signatures as the client-facing hub — BFF performs a blind relay):**

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `JoinGlobalChat` | — | `JoinGlobalChatResult` | Register connection in global group, record presence, return bootstrap data (online players capped at 100) |
| `LeaveGlobalChat` | — | void | Remove from global group |
| `SendGlobalMessage` | `content: string` | void | Validate, rate-check, persist, broadcast |
| `SendDirectMessage` | `recipientPlayerId: Guid, content: string` | `SendDirectMessageResult` | Validate, rate-check, resolve conversation, persist, deliver |

User identity is extracted from the JWT on the connection (same `sub` claim extraction as other services).

**Server-to-client events (sent to downstream BFF connections):**

Same event names, payloads, and field names as the client-facing events. The BFF performs a blind relay without field remapping. Both the internal and client-facing contracts use `playerId` (which is the identity ID value) — consistent with Battle's precedent where `PlayerAId` in realtime contracts IS the identity ID.

### Internal HTTP Endpoints

Called by BFF only. Authenticated via forwarded JWT.

| Method | Path | Description |
|---|---|---|
| GET | `/api/internal/conversations` | List conversations for authenticated user |
| GET | `/api/internal/conversations/{id}/messages?before={sentAt}&limit=50` | Paginated history |
| GET | `/api/internal/direct/{otherIdentityId}/messages?before={sentAt}&limit=50` | DM history by other player |
| GET | `/api/internal/presence/online?limit=100&offset=0` | Online players |

Response shapes match the BFF client-facing DTOs (with `playerId` naming).

### Integration Events Consumed

| Event | Publisher | Fields consumed | Purpose |
|---|---|---|---|
| `PlayerCombatProfileChanged` | Players | `IdentityId`, `Name`, `IsReady` | Update display-name cache. `IsReady` used for eligibility check if cache is the first data point for a player. |

### Integration Events Published

None in v1. Chat has no downstream consumers.

---

## 13. Storage Model

### PostgreSQL — `chat` schema

| Table | Purpose | Key indexes |
|---|---|---|
| `conversations` | Conversation metadata | PK: `id`. Unique: `(participant_a_identity_id, participant_b_identity_id)` where `type = Direct`. Index: `(type)`. |
| `messages` | Message content | PK: `id`. Index: `(conversation_id, sent_at DESC)` for cursor pagination. |
| `outbox_state`, `outbox_message`, `inbox_state` | MassTransit transactional outbox/inbox | Standard MassTransit schema |

Snake_case naming via `EFCore.NamingConventions` (consistent with all services).

### Redis — DB 2

| Key pattern | Type | Purpose | TTL |
|---|---|---|---|
| `chat:presence:{identityId}` | String (JSON) | Per-user presence record | 90s (heartbeat-renewed) |
| `chat:presence:online` | ZSET | Online player set, score = last heartbeat ms | Members removed on disconnect or sweep |
| `chat:presence:refs:{identityId}` | INT | Multi-tab connection refcount | 90s (heartbeat-renewed) |
| `chat:name:{identityId}` | String | Cached display name | 7 days (renewed on event receipt and on cache hit during message send) |
| `chat:ratelimit:{identityId}:global` | String (counter) | Global chat rate-limit window | 10s |
| `chat:ratelimit:{identityId}:dm` | String (counter) | DM rate-limit window | 30s |

### Redis DB allocation (system-wide)

| DB | Service | Purpose |
|---|---|---|
| 0 | Battle | Battle state, actions, deadlines, locks |
| 1 | Matchmaking | Queue, player status, lease locks |
| 2 | Chat (new) | Presence, display-name cache, rate-limit counters |

---

## 14. Caching and Projection Model

### Display-name cache

**What:** A mapping from `identityId` to `displayName` in Redis.
**Why:** To stamp `SenderDisplayName` on messages without a synchronous call to Players on every send.
**Source:** `PlayerCombatProfileChanged` integration event, field `Name`.
**Storage:** `chat:name:{identityId}` in Redis DB 2. TTL: 7 days, renewed on event receipt and on cache hit during message send. This ensures active players' names stay cached indefinitely while inactive players' keys are automatically cleaned up.

### Cache-miss behavior

When a player sends a message and their display name is not in the cache:

1. **Check Redis.** If found, use it.
2. **If not found:** Use a synchronous HTTP fallback to Players: `GET /api/v1/players/{identityId}/profile`. Extract the display name. Populate the cache. Stamp the message.
3. **If Players is also unavailable:** Stamp the message with a sentinel value: the string `"Unknown"`. The message is still delivered. The display name will appear as `"Unknown"` in history for that message. This is a permanent snapshot — the message is not retroactively updated.

**Rationale for the fallback chain:**
- Silent cache-miss with fallback to Players covers cold-start, cache eviction, and delayed events.
- The `"Unknown"` sentinel covers total Players outage — chat remains functional even when Players is down, at the cost of degraded display names.
- This is not a retry or queue — it is a one-shot attempt with a graceful fallback.

### When the cache is stale

Display names change at most once during a player's lifecycle (during onboarding, `Draft -> Named`). Once set, names are currently immutable in the Players domain. Staleness is therefore not a practical concern for v1.

If name changes become possible in the future, the event-driven update ensures eventual consistency within normal MassTransit delivery latency (seconds).

### When the projection event is delayed or lost

- **Delayed:** The synchronous fallback covers the gap. The first message from the player triggers a Players lookup, which also populates the cache.
- **Lost:** The `PlayerCombatProfileChanged` event is published via transactional outbox (AD-01), which provides at-least-once delivery. Total event loss is not expected under normal operation. If it occurs, the synchronous fallback covers it on first message send.

---

## 15. Failure and Degradation Behavior

### Redis unavailable

**Rate-limiting degradation policy: coarse local fallback (AD-CHAT-08)**

When Redis is unavailable, distributed rate limiting cannot function. Rather than either disabling throttling entirely (too permissive — allows abuse during outages) or rejecting all sends (too harsh — Redis outage should not kill chat), the Chat service falls back to a **coarse in-memory per-instance rate limiter**.

- The fallback is a simple `ConcurrentDictionary<identityId, (count, windowStart)>` in the Chat service process.
- It enforces the same rate limits as the Redis-based limiter (5 in 10s global, 10 in 30s DM) but is per-instance, not distributed.
- This means a user connected to multiple Chat instances (if horizontally scaled) could exceed the intended rate by a factor of N (number of Chat instances). At v1 scale with a single Chat instance, this is equivalent to the distributed limiter.
- The fallback activates automatically when Redis operations fail and deactivates when Redis becomes available again. No manual intervention.
- A warning is logged on first fallback activation per service restart.

**Why not fail-closed (reject sends when Redis is down):** Redis is used for presence, rate limits, and display-name cache — all non-critical concerns. A Redis outage should not disable chat messaging entirely. The coarse fallback provides meaningful abuse protection without coupling chat availability to Redis availability.

| Concern | Behavior |
|---|---|
| Presence | Cannot record or query presence. `JoinGlobalChat` returns an empty online list. Presence events are not broadcast. Chat messaging continues — presence is a non-blocking enhancement. |
| Rate limiting | Falls back to coarse in-memory per-instance rate limiter. Weaker than distributed, but not unthrottled. See policy above. |
| Display-name cache | Cache miss on every message. Falls through to synchronous Players lookup. If Players is also down, stamps `"Unknown"`. |
| Overall | Chat remains functional with degraded presence and coarse-grained rate limiting. No data loss — messages still go to PostgreSQL. |

### Chat PostgreSQL unavailable

| Concern | Behavior |
|---|---|
| Send message | Fails. The send operation returns a `ChatError` with code `service_unavailable`. Messages cannot be persisted without the database. |
| History retrieval | Fails. Returns HTTP 503. |
| Conversation listing | Fails. Returns HTTP 503. |
| Realtime events | Not delivered (messages cannot be persisted, so they cannot be broadcast). |
| Presence | Continues to function (Redis-based). Online player list and presence events work normally. |
| Overall | Chat messaging is down. Presence continues. The BFF does not crash — it returns errors to the frontend. |

### Players service unavailable

| Concern | Behavior |
|---|---|
| Player card fetch | BFF returns HTTP 503 for the player card endpoint. Follows the `GameStateComposer` partial-degradation pattern. |
| Display-name cache miss during send | Falls back to `"Unknown"` sentinel for the sender's display name. Message is still delivered. |
| Chat functionality overall | Unaffected. Chat does not depend on Players at runtime for core messaging. The only runtime dependency is the display-name fallback, which degrades gracefully. |

### Display-name cache unavailable (Redis down, no cached name)

Covered above under "Redis unavailable" — falls through to Players HTTP lookup, then to `"Unknown"` sentinel.

### Chat service temporarily unavailable from BFF

| Concern | Behavior |
|---|---|
| New ChatHub connection | BFF cannot establish downstream connection. `JoinGlobalChat` fails with `ChatConnectionLost` error. |
| Active connection during Chat restart | Downstream connection drops. BFF sends `ChatConnectionLost` to frontend. Frontend should attempt reconnect after a delay. |
| HTTP endpoints (history, conversations, presence) | BFF `ChatClient` returns errors. BFF returns HTTP 503 to frontend. |
| Reconnect | Frontend reconnects to BFF `/chathub`. BFF creates a new downstream connection to Chat. Client requests `JoinGlobalChat` again, which returns the current state. Client can fetch missed messages via the history endpoint using the last-seen timestamp. |

### Reconnect after missed realtime events

1. Frontend SignalR client uses `withAutomaticReconnect` for brief blips (seconds).
2. On successful reconnect, client calls `JoinGlobalChat` to re-subscribe and receive the latest message page.
3. If the gap is longer (minutes), client fetches history with `?after={lastSeenTimestamp}` to catch up.
4. If the gap exceeds 24 hours, the earliest available messages are the oldest retained. No backfill beyond retention.

### Multi-tab disconnect edge cases

| Scenario | Behavior |
|---|---|
| Tab 1 closes, Tab 2 remains | Refcount decrements to 1. Player stays online. No `PlayerOffline` broadcast. |
| Both tabs close gracefully | Refcount reaches 0. `PlayerOffline` broadcast. Presence removed. |
| Tab 1 crashes, Tab 2 remains | Tab 1's connection eventually times out (90s). Refcount decremented by disconnect handler. Tab 2's heartbeats keep presence alive. Player stays online. |
| All tabs crash simultaneously | No graceful disconnect. Refcount key expires after 90s (TTL). Periodic sweep removes ZSET entry. `PlayerOffline` is broadcast by the sweep, not by a disconnect event. Delay: up to 90s + 60s sweep interval = 150s worst case. |
| Tab opens during crash cleanup | New tab INCR refcount from expired/0 → 1. Player goes online again immediately. No stale ghost. |

---

## 16. Security, Authorization, and Abuse Baseline

### Authentication

- All BFF chat endpoints and the ChatHub require `[Authorize]` (Keycloak JWT).
- Chat service validates JWT independently on each downstream connection (same authority/audience config).
- Token extraction: `sub` / `ClaimTypes.NameIdentifier` from JWT, consistent with all services.
- WebSocket auth: access token from query string parameter (same pattern as `BattleHub` in BFF `Program.cs`).

### Authorization — Eligibility enforcement model

Chat eligibility (`OnboardingState == Ready`) is enforced at **two layers** as defense-in-depth:

**Layer 1 — BFF (early rejection, best-effort):**
The BFF checks whether the player's onboarding is complete before creating a downstream Chat connection, **when the state is already locally known**.

- **State known (common case):** The BFF typically has the player's state from the `GetGameState` flow (`PlayersClient.GetCharacterAsync`), which the frontend calls on startup. If the player is not `Ready`, the BFF rejects the `JoinGlobalChat` / `SendDirectMessage` call with a `ChatError` (`code: "not_eligible"`) without creating a downstream connection.
- **State not known (edge case — client connects without prior `GetGameState`, or BFF restarted):** The BFF does **not** synchronously call Players to check readiness. It skips the local check and allows the downstream connection to proceed. Chat service (Layer 2) is the authoritative enforcement point and will reject ineligible users.

This means Layer 1 is a **fast-path optimization**, not a security gate. It prevents unnecessary downstream traffic when the BFF already has the answer, but it does not introduce a synchronous Players dependency on the ChatHub connection path.

**Layer 2 — Chat service (authoritative enforcement):**
The Chat service performs its own eligibility check on `JoinGlobalChat` and `SendDirectMessage`. Chat checks the display-name cache: a player present in the cache with a non-null name is considered eligible (the cache is populated from `PlayerCombatProfileChanged` events, which include `IsReady`). If the cache has no entry for the player, Chat calls Players via HTTP (`GET /api/v1/players/{identityId}/profile`) to verify eligibility. If Players is unavailable and the cache is empty, the connection is rejected — Chat does not allow unverified users to send messages.

**Why both layers:**
- BFF-only would trust the BFF and leave Chat open to bypass if the BFF check has a bug or if a future internal caller skips it.
- Chat-only would allow unnecessary downstream connections and slower rejection.
- Defense-in-depth provides fast UX (BFF rejects immediately) and authoritative safety (Chat enforces regardless of caller).

**Other authorization rules:**
- **DM authorization:** Any `Ready` player can DM any other `Ready` player. No friend/follow prerequisite in v1.
- **Conversation access:** History retrieval is restricted to conversation participants. Chat service validates the requesting user is a participant before returning messages.

### Message constraints

| Constraint | Value |
|---|---|
| Max length | 500 characters |
| Min length | 1 character (after sanitization) |
| Content type | Plain text, UTF-8 |
| Sanitization | Trim leading/trailing whitespace, collapse runs of whitespace to single space, strip control characters |

### Rate limiting

Each surface uses a **single fixed-window counter** in Redis. One algorithm, one counter per surface per user. No dual constraints.

**Algorithm:** Fixed-window counter via `INCR` + `EXPIRE`. On each request, `INCR chat:ratelimit:{identityId}:{surface}`. If the key was just created, set `EXPIRE` to the window duration. If the counter exceeds the limit, reject with `retryAfterMs` = remaining TTL on the key. The window resets when the key expires.

| Surface | Limit | Window | Redis key TTL | Enforcement |
|---|---|---|---|---|
| Global chat | 5 messages | 10 seconds | 10s | If count > 5 within the window, reject. Steady-state effective rate: ~1 msg/2s. |
| Direct messages | 10 messages | 30 seconds | 30s | If count > 10 within the window, reject. |
| Presence queries (HTTP) | 1 request | 5 seconds | 5s | If count > 1 within the window, reject. |

**Clarification:** "1 message / 2 seconds" in earlier text was a human-readable description of the steady-state throughput of the 5-in-10s window. It is **not** a separate constraint. There is exactly one counter and one check per surface.

Violations return `ChatError` event with `code: "rate_limited"` and `retryAfterMs` set to the remaining TTL of the rate-limit key (milliseconds until the window resets). Messages are rejected, not silently dropped.

Rate-limit state is keyed by `identityId`, not by `connectionId`. This means limits persist across reconnects and multi-tab connections.

### Moderation hooks

Application-layer ports for future extension:

- **`IMessageFilter`:** Inspects message content before persistence. v1 implementation: length check, whitespace normalization. Future: profanity filter, link detection, spam classifier.
- **`IUserRestriction`:** Checks whether a user is allowed to send. v1 implementation: no-op (always allows). Future: mute/ban enforcement.

Both ports are called in the send-message handler before persistence. Adding a new filter or restriction is a single new implementation with no architectural change.

### Reconnect abuse

Rate limits are per-identity, not per-connection. Reconnecting does not reset rate-limit counters. The Redis keys are keyed on `identityId` and have independent TTLs.

---

## 17. v1 Deployment Constraints

These are explicit constraints for v1, not accidental omissions. They scope the implementation and affect task decomposition.

| Constraint | Status | Implication |
|---|---|---|
| **Single Chat instance** | Required for v1 | SignalR groups are in-memory only. No Redis backplane needed. All connected users are on the same instance. |
| **Single BFF instance** | Required for v1 | BFF SignalR groups are in-memory only. Same constraint as Chat. This also applies to the existing `BattleHub` — it is not a Chat-specific limitation. |
| **No SignalR Redis backplane** | Intentionally out of scope for v1 | Multi-instance SignalR requires `Microsoft.AspNetCore.SignalR.StackExchangeRedis`. Deferred to when horizontal scaling is needed. |
| **Redis used only for data, not SignalR transport** | Explicit for v1 | Redis stores presence, rate-limit counters, and display-name cache. SignalR group membership and broadcast are handled entirely by in-memory SignalR groups. Redis unavailability does **not** affect SignalR message broadcast — it only affects presence queries and rate limiting. |

**Why this matters for failure behavior:** When Redis is down, SignalR broadcast continues to work normally (messages are still delivered to connected users). Only presence tracking and distributed rate limiting degrade. This is why the Redis-down degradation in Section 15 can honestly say "chat messaging continues."

**Migration path:** When Chat or BFF need horizontal scaling, add the Redis backplane for SignalR (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`). This is an operational change in Bootstrap configuration, not an architectural rewrite.

---

## 18. Risks and Trade-offs

### Accepted: BFF relay adds one network hop

Every message traverses Frontend -> BFF -> Chat -> BFF -> Recipients. The added latency (~5-10ms per hop) is imperceptible for chat. The trade-off is consistency with the established BFF-as-sole-boundary architecture. Direct client-to-Chat connections would halve the hop count but require exposing Chat publicly, duplicating auth/CORS/TLS config, and breaking the operational model.

### Accepted: Presence is eventually consistent (up to 90s stale)

Players may appear online for up to 90 seconds after all connections are lost ungracefully. Tighter consistency would require synchronous cross-instance coordination. 90-second eventual consistency is standard for game chat and acceptable.

### Accepted: Display-name on messages is a write-time snapshot

If a player's name changes (currently impossible after initial set, but potentially in the future), old messages retain the old name. This is standard for chat systems and avoids a costly retroactive update. If exact consistency is needed later, messages can include `senderIdentityId` for lookup-based resolution on display.

### Accepted: 24-hour retention means history loss

Players returning after 24+ hours see no prior messages. Acceptable for v1 ephemeral chat. The retention window is a configuration value, not an architectural constraint.

### Accepted: Single Redis instance for three services

Redis DB isolation (0/1/2) is logical, not physical. A Redis outage affects all three services. This is the existing architectural position (AD-08). Redis Sentinel (Phase 7A) mitigates for production. Chat's Redis concerns (presence, rate limits) are non-critical — degradation is graceful, not catastrophic.

### Risk: Global chat broadcast scaling

A single global room means every message fans out to all connected users. At >1,000 concurrent users with high message rates, this could saturate the Chat service's SignalR broadcast capacity. **Mitigation:** Rate limiting (5 msgs / 10s / user) bounds per-user inbound throughput. However, aggregate inbound is bounded by `(concurrent_users / 2) msgs/sec` at max rate — with 500 users, that is 250 msgs/sec broadcast to 500 connections. At v1 scale (hundreds of users) this is safe. If outbound fan-out becomes an issue, the architecture supports sharding global chat into regional rooms or adding a Redis backplane for multi-instance SignalR. Both are operational changes, not architectural rewrites. **Monitoring trigger:** alert when sustained global-chat broadcast rate exceeds 100 msgs/sec.

### Accepted v1 trade-off: Relay connection count at scale

O(N) downstream WebSocket connections per BFF instance to Chat, where N = connected chat users on that BFF instance. Unlike Battle relay (short-lived, battle-scoped connections), chat relay connections are long-lived (session-scoped). This is the most significant scaling limitation of the v1 topology.

**Failure mode is a cliff, not a gradient:** When the Chat instance's WebSocket connection limit is reached, new users simply cannot connect — there is no graceful degradation between "works" and "doesn't work." At v1 scale (hundreds of users) this is far from the limit. At >10,000 concurrent users, migrate to Option B (shared pub/sub). The migration is internal to BFF/Chat and does not change client contracts, but it is a non-trivial internal change (adding messaging infra to BFF, replacing relay lifecycle with subscription model, making presence heartbeat-based). See [Section 6](#6-realtime-topology-decision) for the full trade-off analysis.

---

## 19. Deferred / Future Extensions

| Extension | Architectural readiness | When to revisit |
|---|---|---|
| Party/guild chat | `ConversationType` enum already supports extension. New type + group membership model needed. | When party/guild gameplay features exist. |
| Block/mute lists | `IUserRestriction` port exists. Add a `UserRestriction` entity and check in the port implementation. | When abuse reports require it. |
| Unread counters | Requires per-user per-conversation read cursor. Not needed with 24h ephemeral retention. | When retention extends significantly. |
| Typing indicators | Ephemeral signaling through the hub — no persistence needed. Can be added as a new hub event. | Low priority; product decision. |
| Push notifications | Requires notification infrastructure outside chat. Chat can publish `ChatMessageSent` event for a notification service to consume. | When mobile/offline notifications are needed. |
| Message edit/delete | Adds complexity to the realtime protocol (edit/delete events, tombstones). Low value for ephemeral chat. | When retention extends and messages have lasting significance. |
| Profanity filter | `IMessageFilter` port is ready. Plug in a filter implementation. | Can be added at any time. |
| Longer retention / search | Change config value. Add full-text index on `messages.content` if search is needed. | Product decision. |
| Redis backplane for SignalR | Needed when Chat scales to multiple instances. Standard ASP.NET Core SignalR Redis backplane package. | When Chat horizontally scales. |
| Richer player cards | Not a Chat concern. Add fields to Players profile endpoint and BFF `PlayerCardResponse`. | When avatar or match history features exist. |

---

## 20. Open Questions / Decisions That Still Need Confirmation

### OQ-1: Global conversation bootstrap

Should the well-known global conversation be:
- (a) A hardcoded constant GUID (e.g., `00000000-0000-0000-0000-000000000001`), or
- (b) Created by a startup migration/seeder with a deterministic ID (e.g., UUID v5 from a fixed namespace)?

Both work. Option (a) is simpler. Option (b) is cleaner if we later add multiple global rooms.

**Recommendation:** Option (a) for v1.

### OQ-2: Players profile endpoint authentication model

The new Players profile endpoint (`GET /api/v1/players/{identityId}/profile`) — should it:
- (a) Require authentication (any valid JWT can query any player's public profile), or
- (b) Be unauthenticated (public access)?

Given all other endpoints require auth and the BFF forwards JWT, option (a) is consistent and simpler. The "public" in "public profile" refers to what data is visible, not whether auth is required.

**Recommendation:** Option (a) — authenticated, any valid user can query any player.

### OQ-3: Presence broadcast for DM-only users

If a user connects to ChatHub but never calls `JoinGlobalChat` (only uses DMs), should they:
- (a) Still appear in the online player list and receive presence broadcasts, or
- (b) Only appear online to their DM partners (not in the global online list)?

Option (a) is simpler — presence is connection-based, not room-based. Option (b) adds complexity for marginal privacy benefit.

**Recommendation:** Option (a) for v1. Presence is connection-scoped, not room-scoped.

### OQ-4: Open DM model and harassment risk

v1 allows any `Ready` player to DM any other `Ready` player with no opt-out. In PvP games, post-match harassment via DM is a known pattern. The `IUserRestriction` port exists as the designated mitigation point, but v1 ships with no restriction implementation. This is a product decision, not an architecture gap — but it should be acknowledged as an early post-v1 priority if abuse occurs.

**Note:** Multi-instance BFF/Chat SignalR is addressed in Section 17 (v1 Deployment Constraints) — single-instance for both is an explicit v1 constraint.

---

## Appendix: Project Structure

```
src/Kombats.Chat/
├── Kombats.Chat.Bootstrap/          # Microsoft.NET.Sdk.Web — composition root
│   ├── Program.cs                   # DI, middleware, endpoint mapping, hub mapping
│   └── appsettings.json
├── Kombats.Chat.Api/                # Microsoft.NET.Sdk — transport layer
│   ├── Hubs/
│   │   └── ChatHub.cs               # Internal SignalR hub (/chathub-internal)
│   └── Endpoints/                   # Minimal API internal HTTP endpoints
├── Kombats.Chat.Application/        # Microsoft.NET.Sdk — handlers, ports
│   ├── Ports/
│   │   ├── IMessageRepository.cs
│   │   ├── IConversationRepository.cs
│   │   ├── IPresenceStore.cs
│   │   ├── IRateLimiter.cs
│   │   ├── IMessageFilter.cs
│   │   ├── IUserRestriction.cs
│   │   ├── IDisplayNameCache.cs
│   │   └── IDisplayNameResolver.cs   # Resolves display name (cache -> HTTP -> sentinel)
│   └── UseCases/
│       ├── SendGlobalMessage/
│       ├── SendDirectMessage/
│       ├── GetConversationMessages/
│       ├── GetConversations/
│       ├── JoinGlobalChat/
│       └── HandlePlayerProfileChanged/
├── Kombats.Chat.Domain/             # Microsoft.NET.Sdk — entities, rules
│   ├── Entities/
│   │   ├── Conversation.cs
│   │   └── Message.cs
│   └── Enums/
│       └── ConversationType.cs
├── Kombats.Chat.Infrastructure/     # Microsoft.NET.Sdk — implementations
│   ├── Data/
│   │   ├── ChatDbContext.cs
│   │   └── Configurations/
│   ├── Redis/
│   │   ├── RedisPresenceStore.cs
│   │   ├── RedisRateLimiter.cs
│   │   └── RedisDisplayNameCache.cs
│   ├── Persistence/
│   │   ├── MessageRepository.cs
│   │   └── ConversationRepository.cs
│   ├── Messaging/
│   │   └── Consumers/
│   │       └── PlayerCombatProfileChangedConsumer.cs
│   └── Workers/
│       ├── MessageRetentionWorker.cs
│       └── PresenceSweepWorker.cs
└── Kombats.Chat.Contracts/          # Microsoft.NET.Sdk — zero deps
    └── (empty for v1 — no published events)
```

**Test projects:**
```
tests/Kombats.Chat/
├── Kombats.Chat.Domain.Tests/
├── Kombats.Chat.Application.Tests/
├── Kombats.Chat.Infrastructure.Tests/
└── Kombats.Chat.Api.Tests/
```

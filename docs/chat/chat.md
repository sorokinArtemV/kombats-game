Chat Module Architecture Proposal — Kombats v1

1. Recommended Service Placement

Decision: New standalone microservice — Kombats.Chat

The hypothesis is correct. Chat should be a new dedicated service. Here's why, grounded in this codebase:

Why not embed in BFF:
The BFF (Kombats.Bff) is a stateless relay and composition layer. It owns zero persistence, zero domain logic. Its Application layer contains only HTTP clients, the battle
relay, and the narration pipeline. Adding chat domain logic, persistence, presence tracking, and moderation to BFF would violate the established pattern where BFF aggregates
but never owns data. The BFF's GameStateComposer pattern (parallel calls, partial degradation) shows the intended role: orchestrate, don't own.

Why not embed in Players:
Players owns character identity, stats, progression, and combat profiles. Chat conversations, messages, and presence are not player identity concerns. Players publishes
PlayerCombatProfileChanged as a full snapshot — it's designed as a source of truth that others consume, not as a service that grows to host every player-adjacent feature.
The clean separation of Character entity (name, stats, wins, losses, XP) from chat concerns should be preserved.

Why not embed in Battle or Matchmaking:
These are scoped to their domains (combat execution, queue/pairing). Chat has no business coupling to either.

Why a standalone service works with this codebase:
- The project structure template is well-established: Bootstrap/Api/Application/Domain/Infrastructure/Contracts
- Kombats.Messaging provides plug-and-play MassTransit configuration with outbox/inbox
- Redis is already deployed (DB 0 = Battle, DB 1 = Matchmaking) — Chat can use DB 2
- PostgreSQL is shared with schema isolation (players, matchmaking, battle — Chat gets chat)
- The BFF relay pattern (BattleHubRelay) provides an exact blueprint for how to proxy realtime traffic from a backend service through the BFF

Project structure:
src/Kombats.Chat/
├── Kombats.Chat.Bootstrap/        # Composition root (Microsoft.NET.Sdk.Web)
├── Kombats.Chat.Api/              # Minimal API endpoints + SignalR hub
├── Kombats.Chat.Application/      # Handlers, ports, presence logic, moderation
├── Kombats.Chat.Domain/           # Message, Conversation entities, rate-limit rules
├── Kombats.Chat.Infrastructure/   # DbContext, Redis ops, consumers
└── Kombats.Chat.Contracts/        # Integration events (zero deps)

  ---
2. Responsibility Boundaries by Service

Kombats.Chat (new)

Owns:
- Conversations (global + direct)
- Messages (storage, retrieval, retention)
- Presence (connected-to-chat session state)
- Rate limiting and anti-spam enforcement
- Moderation hooks (message filtering, future block/mute)
- Cached player display names (projection from Players events)

Does not own:
- Canonical player identity, stats, or profile data
- Battle state or matchmaking state
- Authentication (delegates to Keycloak JWT)

Kombats.Bff (unchanged role, expanded surface)

Owns:
- Single frontend-facing boundary (HTTP + SignalR)
- Chat relay (same pattern as BattleHubRelay)
- Composition of player profile data for player cards
- JWT forwarding to all downstream services

Does not own:
- Chat messages, conversations, or presence logic
- Chat moderation rules

Kombats.Players (unchanged role, one new endpoint)

Owns:
- Character entity: name, stats, wins, losses, XP, level, onboarding state
- PlayerCombatProfileChanged event publication
- Source of truth for all player profile fields

New responsibility:
- A public player profile endpoint (GET /api/v1/players/{identityId}/profile) returning display name, level, stats, wins, losses. This is needed by BFF to compose player
  cards. Currently MeResponse omits wins/losses and only serves the authenticated user — a separate public profile query is needed.

Does not own:
- Chat data, presence, or moderation

Kombats.Matchmaking (unchanged)

No chat responsibilities. No changes needed.

Kombats.Battle (unchanged)

No chat responsibilities. No changes needed.

  ---
3. First-Version Scope

In scope for v1:
- Global chat (single room, all eligible players)
- Direct/private messages (1:1 between two players)
- Online presence (who is connected to chat)
- Recent message history retrieval (last 24h)
- Player card data (name, level, stats, wins, losses) via BFF composition
- Rate limiting and basic anti-spam
- Reconnect with missed-message recovery

Explicitly deferred:
- Party/guild chat
- Unread counters
- Block/mute lists (hooks only, no full implementation)
- Push notifications
- Message editing/deletion
- Rich media in messages
- Longer retention or search
- Avatar/image in player cards

  ---
4. Presence Model

What "online" means

"Online" means the player has an active SignalR connection to the BFF's ChatHub, and the BFF has an active downstream connection to Chat's internal hub. This is
chat-specific presence, not a platform-wide "user is logged in" concept.

Where the truth lives

Chat service Redis (DB 2) is the source of truth for presence.

Key: chat:presence:{identityId}
Value: JSON { "name": "PlayerName", "connectedAt": <unix_ms>, "instanceId": "<chat-instance-id>" }
TTL: 90 seconds (heartbeat-renewed)

A sorted set for efficient "who's online" queries:
Key: chat:presence:online
Type: ZSET
Score: last-heartbeat unix_ms
Member: identityId

Staleness tolerance

Presence can be stale by up to 90 seconds (one missed heartbeat cycle). This is acceptable for chat — players appearing online for ~90s after disconnect is normal for games.

How it works

1. When BFF establishes a downstream Chat hub connection for a user, Chat records presence in Redis with a 90s TTL
2. Chat service sends heartbeat pings every 30s on the SignalR connection; each ping renews the TTL
3. On disconnect (graceful or timeout), Chat removes the presence key and publishes a PresenceChanged event to connected clients
4. A periodic sweep (every 60s) cleans the ZSET of entries with scores older than 90s — handles crash scenarios where disconnect events are lost

Multi-instance synchronization

Redis is the shared state. Multiple Chat service instances and multiple BFF instances all converge on the same Redis keys. The ZSET scan for "online players" is consistent
across instances. No sticky sessions required.

Multi-tab / multi-device

Use a reference-counting approach:
Key: chat:presence:refcount:{identityId}
Type: INT (INCR on connect, DECR on disconnect)
TTL: 90 seconds (renewed on any heartbeat)
The player is "online" as long as refcount > 0. The ZSET entry is added on first connect (refcount goes 0→1) and removed on last disconnect (refcount goes 1→0). This handles
multiple tabs cleanly without overcomplicating the model.

Presence broadcast

Global presence changes are broadcast to connected clients via the ChatHub SignalR connection: PlayerOnline(identityId, name) / PlayerOffline(identityId). For v1, only
broadcast to global chat participants — no need to fan out to all users.

  ---
5. Message Model

v1 should support both global and direct messages immediately

A generic conversation model with types is the right design even for v1 — it avoids a rewrite when party/guild chat arrives later.

Domain model

ConversationType: Global, Direct (future: Party, Guild)

Conversation:
- Id (Guid)
- Type (ConversationType)
- CreatedAt (DateTimeOffset)

    # For Direct conversations:
    - ParticipantA (Guid, identityId)
    - ParticipantB (Guid, identityId)

    # Global has a well-known singleton conversation ID

Message:
- Id (Guid)
- ConversationId (Guid)
- SenderIdentityId (Guid)
- SenderDisplayName (string, denormalized at write time)
- Content (string, max 500 chars)
- SentAt (DateTimeOffset)

Persistence

PostgreSQL (chat schema) for messages. Redis is wrong for message history because:
- Messages need indexed queries (by conversation + time range)
- PostgreSQL is already deployed and every service uses it
- 24h retention with a scheduled cleanup job is trivial with a DELETE WHERE sent_at < now() - interval '24 hours'

Tables:
- conversations — conversation metadata
- messages — message content with FK to conversation, indexed on (conversation_id, sent_at DESC)
- MassTransit outbox/inbox tables (standard pattern)

Retention

24 hours is reasonable for v1. A background worker (MessageRetentionWorker) runs hourly, deletes messages older than 24h. This is consistent with the existing worker
patterns (Battle has TurnDeadlineWorker, Matchmaking has MatchmakingLeaseService).

History retrieval

BFF exposes GET /api/v1/chat/conversations/{conversationId}/messages?before={timestamp}&limit=50. Chat service implements a cursor-based query. On initial connect, client
fetches the most recent page. Scrolling up fetches older pages.

Reconnect / missed-message recovery

On reconnect, the client sends its last-seen message timestamp. The BFF relay requests messages since that timestamp from Chat. This avoids needing a persistent per-client
offset or a message queue per user. The 24h retention window is the maximum catch-up window — if a user was offline for more than 24h, they simply see the most recent
available messages.

For realtime delivery during brief disconnects (seconds), SignalR's automatic reconnect with withAutomaticReconnect on the client side handles most cases. The "fetch since
timestamp" pattern covers longer gaps.

  ---
6. Public Player Profile Model

Fields safe to expose

┌──────────────┬─────────────────────┬─────────────────────────────────────────────┐
│    Field     │       Source        │                    Notes                    │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Display name │ Character.Name      │ Already public in contracts                 │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Level        │ Character.Level     │ Derived from XP                             │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Strength     │ Character.Strength  │ Core stat                                   │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Agility      │ Character.Agility   │ Core stat                                   │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Intuition    │ Character.Intuition │ Core stat                                   │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Vitality     │ Character.Vitality  │ Core stat                                   │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Wins         │ Character.Wins      │ Currently in domain but not exposed via API │
├──────────────┼─────────────────────┼─────────────────────────────────────────────┤
│ Losses       │ Character.Losses    │ Currently in domain but not exposed via API │
└──────────────┴─────────────────────┴─────────────────────────────────────────────┘

Which service owns these fields

Players is the source of truth. All fields exist on the Character entity in Kombats.Players.Domain. CharacterStateResult already includes wins/losses internally — it's just
not mapped to the MeResponse DTO.

How the data reaches the client

BFF composes the player card by calling a new Players endpoint:
GET /api/v1/players/{identityId}/profile → PublicPlayerProfileResponse

This follows the existing BFF pattern — PlayersClient already calls Players endpoints with JWT forwarding. BFF adds a new PlayersClient.GetPlayerProfileAsync(identityId)
method, and the ChatHub can call it when the client requests a player card.

Avoiding source-of-truth duplication

Chat does not store a full profile projection. Chat only caches (identityId → displayName) in Redis for message rendering, updated via PlayerCombatProfileChanged events. The
full profile is always fetched live from Players through BFF. This keeps the profile data authoritative in one place.

Chat's display name cache

Key: chat:player:name:{identityId}
Value: "PlayerName"
TTL: none (updated on PlayerCombatProfileChanged, removed if needed)
This is solely for stamping SenderDisplayName on messages without a synchronous call to Players. It's a denormalized convenience, not a source of truth.

  ---
7. Internal Contracts / Events

Events Chat should consume

┌────────────────────────────┬───────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│           Event            │ Publisher │                                                      Why Chat needs it                                                       │
├────────────────────────────┼───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ PlayerCombatProfileChanged │ Players   │ Update display name cache. The Name field on this event is the trigger. Chat only cares about IdentityId, Name, and IsReady. │
└────────────────────────────┴───────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

That's it for v1. Chat does not need BattleCompleted, BattleCreated, or matchmaking events. Chat has no business coupling to battles or matchmaking.

Events Chat should NOT consume

- BattleCompleted — irrelevant to chat. Players already handles win/loss recording.
- CreateBattle / BattleCreated — matchmaking/battle concern only.
- Any matchmaking status events — not Chat's domain.

Events Chat should publish (v1)

None via MassTransit for v1. Chat's outputs are all realtime (SignalR to connected clients). There's no downstream service that needs to react to "a message was sent" or "a
user came online."

If future features (notifications, activity feeds) need it, Chat can publish ChatMessageSent or PlayerPresenceChanged events later. But v1 has no consumers for them, so
publishing would be waste.

New contract needed from Players

Players should add a new endpoint (not a new integration event) for public profile retrieval. The data already exists — Character has all fields. This is a query, not an
event. BFF calls it synchronously (HTTP) like all other Players queries.

  ---
8. API and Realtime Surfaces

BFF HTTP Endpoints (new)

┌────────┬───────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────┐
│ Method │                           Path                            │                     Description                     │
├────────┼───────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ GET    │ /api/v1/chat/conversations                                │ List user's conversations (global + active directs) │
├────────┼───────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ GET    │ /api/v1/chat/conversations/{id}/messages?before=&limit=50 │ Paginated message history                           │
├────────┼───────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ GET    │ /api/v1/chat/presence/online?limit=100                    │ Online players list                                 │
├────────┼───────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
│ GET    │ /api/v1/players/{identityId}/card                         │ Player card (BFF composes from Players)             │
└────────┴───────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────┘

BFF SignalR Hub — ChatHub (new, mapped at /chathub)

Client → Server methods:

┌───────────────────┬────────────────────────────────────────────┬──────────────────────────────────────────────┐
│      Method       │                 Parameters                 │                 Description                  │
├───────────────────┼────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ JoinGlobalChat    │ —                                          │ Subscribe to global chat messages + presence │
├───────────────────┼────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ LeaveGlobalChat   │ —                                          │ Unsubscribe                                  │
├───────────────────┼────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ SendGlobalMessage │ content: string                            │ Send message to global chat                  │
├───────────────────┼────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ SendDirectMessage │ recipientIdentityId: Guid, content: string │ Send DM                                      │
├───────────────────┼────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ GetOnlinePlayers  │ —                                          │ Request current online list                  │
└───────────────────┴────────────────────────────────────────────┴──────────────────────────────────────────────┘

Server → Client events:

┌───────────────────────┬──────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
│         Event         │                               Payload                                │               Description                │
├───────────────────────┼──────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ GlobalMessageReceived │ { senderId, senderName, content, sentAt, messageId }                 │ New global message                       │
├───────────────────────┼──────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ DirectMessageReceived │ { senderId, senderName, content, sentAt, messageId, conversationId } │ New DM                                   │
├───────────────────────┼──────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ PlayerOnline          │ { identityId, name }                                                 │ Player connected                         │
├───────────────────────┼──────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ PlayerOffline         │ { identityId }                                                       │ Player disconnected                      │
├───────────────────────┼──────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ ChatError             │ { code, message }                                                    │ Rate limit hit, validation failure, etc. │
└───────────────────────┴──────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────┘

BFF Chat Relay — ChatHubRelay (new, same pattern as BattleHubRelay)

The BFF creates a downstream HubConnection to Chat's internal hub when a user connects to /chathub. This follows the exact pattern in BattleHubRelay.cs:

1. Frontend connects to BFF /chathub
2. BFF creates downstream HubConnection to Chat service /chathub-internal
3. BFF subscribes to downstream events, relays to frontend via IHubContext<ChatHub>
4. Frontend RPC calls are forwarded downstream
5. Connection state tracked in ConcurrentDictionary<string, ChatConnection>
6. Cleanup on disconnect

Chat Service Internal Surfaces

Internal SignalR Hub (/chathub-internal, not exposed to frontend):
- Same method signatures as BFF hub, but this is the actual implementation
- Handles presence registration/deregistration on connect/disconnect
- Enforces rate limits and moderation rules
- Persists messages and broadcasts to relevant connections
- Manages group membership (global chat group, per-conversation groups for DMs)

Internal HTTP endpoints (called by BFF only):

┌────────┬───────────────────────────────────────────┬─────────────────────────────┐
│ Method │                   Path                    │         Description         │
├────────┼───────────────────────────────────────────┼─────────────────────────────┤
│ GET    │ /api/internal/conversations               │ List conversations for user │
├────────┼───────────────────────────────────────────┼─────────────────────────────┤
│ GET    │ /api/internal/conversations/{id}/messages │ Paginated history           │
├────────┼───────────────────────────────────────────┼─────────────────────────────┤
│ GET    │ /api/internal/presence/online             │ Online players list         │
└────────┴───────────────────────────────────────────┴─────────────────────────────┘

These follow the same pattern as Battle's internal endpoint (/api/internal/battles/{battleId}/history) already called by BattleClient.

  ---
9. Storage Recommendations

┌───────────────────────────────┬─────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│            Concern            │         Storage         │                                                     Why                                                      │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Messages                      │ PostgreSQL, chat schema │ Indexed queries by conversation+time, consistent with all other services, 24h retention via scheduled DELETE │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Conversations                 │ PostgreSQL, chat schema │ Relational data, FK to messages, rarely changes                                                              │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Player display name cache     │ Redis DB 2              │ Hot-path lookup for message stamping, updated via events                                                     │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Presence (per-user state)     │ Redis DB 2              │ TTL-based lifecycle, multi-instance shared state, heartbeat renewal                                          │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Presence (online set)         │ Redis DB 2, ZSET        │ Efficient range queries for "who's online", score = last heartbeat                                           │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Presence refcount (multi-tab) │ Redis DB 2              │ INCR/DECR atomic ops, TTL safety net                                                                         │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Rate-limit counters           │ Redis DB 2              │ Sliding window counters with TTL, e.g. chat:ratelimit:{identityId}:{window}                                  │
├───────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ MassTransit outbox/inbox      │ PostgreSQL, chat schema │ Standard pattern, same as all other services                                                                 │
└───────────────────────────────┴─────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Redis DB allocation summary:
- DB 0: Battle (existing)
- DB 1: Matchmaking (existing)
- DB 2: Chat (new)

  ---
10. Abuse / Moderation Baseline

Message constraints

- Max length: 500 characters
- Min length: 1 character (no empty messages)
- Content: UTF-8 text only, no HTML, no markdown rendering server-side
- Sanitization: Strip leading/trailing whitespace, collapse internal whitespace runs

Rate limiting (Redis sliding window)

- Global chat: 1 message per 2 seconds per user, burst max 5 in 10 seconds
- Direct messages: 1 message per second per user, burst max 10 in 30 seconds
- Presence queries: 1 request per 5 seconds per user
- Rate limit violations return ChatError event with cooldown duration, not silent drops

Auth / Authorization

- All chat surfaces require valid Keycloak JWT (same as all existing endpoints)
- Only players with OnboardingState == Ready can access chat (character must be named and have allocated stats)
- BFF forwards JWT to Chat service (same JwtForwardingHandler pattern)
- Chat service validates JWT independently (same Keycloak authority/audience config)

Reconnect behavior

- BFF relay auto-cleans downstream connection on frontend disconnect (same as BattleHubRelay pattern)
- Frontend reconnects with withAutomaticReconnect — on reconnect, refetch recent messages by timestamp
- Presence TTL (90s) handles ungraceful disconnects — no leaked "online" ghosts
- Rate-limit state persists across reconnects (keyed by identityId, not connectionId)

Moderation hooks (structure only, not full implementation)

- IMessageFilter port in Application layer — v1 implementation: length check, rate check, whitespace normalization
- Future implementations plug in: profanity filter, spam ML classifier, link detection
- IUserRestriction port — v1: no-op (always allows). Future: mute list, ban list, shadow-ban
- All moderation decisions are logged (identityId, action, reason, timestamp) for future review tooling

  ---
11. Risks and Trade-offs

BFF relay adds latency

Every message goes Frontend → BFF → Chat → BFF → Recipients. This adds one extra hop compared to direct client-to-Chat connections. Trade-off accepted because: the
BFF-as-sole-boundary pattern is established and consistent across the system; Battle realtime already works this way; operational simplicity of a single frontend endpoint
outweighs the ~5-10ms added latency, which is imperceptible for chat.

Display name denormalization can drift

If PlayerCombatProfileChanged is delayed or lost, Chat's name cache shows a stale name. Mitigation: Names change extremely rarely (once during onboarding in current
implementation). The cache is a convenience, not critical. BFF always fetches live data from Players for player cards.

Presence is eventually consistent

A player can appear online for up to 90s after disconnecting. Acceptable for a game chat — this is standard for every game chat system. Tighter consistency would require
synchronous cross-instance coordination, which is not worth the complexity.

24h retention means history loss

Players returning after a day see no history. Acceptable for v1. Games like this typically have ephemeral chat. Retention can be extended later by changing a single config
value and potentially adding archival storage.

Single Redis instance for three services

Redis DB isolation (0/1/2) is logical, not physical. A Redis outage affects Battle, Matchmaking, and Chat simultaneously. This is the existing architecture decision (AD-08).
Redis Sentinel (Phase 7A) mitigates this for production. Chat's Redis usage (presence + rate limits + name cache) is not on the critical game path — if Redis is down, chat
degrades but battles and matchmaking degrade independently for their own reasons.

Global chat scaling

A single global chat room with all online players will have high message throughput if the player base grows. v1 is fine — a single SignalR group with Redis backplane (if
needed for multi-instance) handles thousands of concurrent users. If scaling becomes an issue, global chat can be sharded into regional rooms or capped at N visible recent
messages. This is a future concern, not a v1 blocker.

  ---
12. Recommended First-Version Architecture (Summary Diagram)

┌──────────┐
│ Frontend  │
└────┬──────┘
│ WSS /chathub          HTTPS /api/v1/chat/*
│ WSS /battlehub        HTTPS /api/v1/players/{id}/card
▼
┌──────────────────────────────────────────┐
│              Kombats.Bff                 │
│                                          │
│  ChatHub ──► ChatHubRelay ──────────┐    │
│  BattleHub ► BattleHubRelay ─────┐  │    │
│  HTTP endpoints (composition)    │  │    │
│  PlayersClient ──────────────────┼──┼─┐  │
│  ChatClient (new) ───────────────┼──┘ │  │
│  MatchmakingClient               │    │  │
│  BattleClient                    │    │  │
└──────────────────────────────────┼────┼──┘
│    │
┌────────────────────┘    │
▼                         ▼
┌──────────────────┐      ┌─────────────────────┐
│  Kombats.Battle  │      │  Kombats.Players    │
│  Redis DB 0      │      │  PostgreSQL:players  │
│  PostgreSQL:     │      │  GET /api/v1/        │
│    battle        │      │    players/{id}/     │
│  /battlehub      │      │    profile (NEW)     │
└──────────────────┘      └──────────┬──────────┘
│
PlayerCombatProfileChanged
(MassTransit / RabbitMQ)
│
┌──────────────────────┘
▼
┌──────────────────────┐      ┌──────────────────┐
│    Kombats.Chat      │      │ Kombats.         │
│    (NEW SERVICE)     │      │ Matchmaking      │
│                      │      │ Redis DB 1       │
│  PostgreSQL:chat     │      │ PostgreSQL:      │
│  Redis DB 2          │      │   matchmaking    │
│  /chathub-internal   │      └──────────────────┘
│  /api/internal/*     │
└──────────────────────┘

Data flows:
1. Client connects to BFF /chathub → BFF creates downstream connection to Chat /chathub-internal
2. Messages flow: Client → BFF relay → Chat (persist + broadcast) → BFF relay → Recipients
3. Presence: Chat manages in Redis DB 2, broadcasts changes via SignalR
4. Player cards: Client requests via BFF → BFF calls Players HTTP → returns composed response
5. Display names: Chat consumes PlayerCombatProfileChanged via RabbitMQ, caches name in Redis
6. History: Client requests via BFF HTTP → BFF calls Chat internal HTTP → returns paginated messages

  ---
13. What to Defer Until Later

┌─────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────┐
│                 Feature                 │                               Why defer                               │                   When to revisit                    │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Party/guild chat                        │ No party/guild system exists yet                                      │ When party/guild features are designed               │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Block/mute lists                        │ Application ports are in place; implementation is straightforward     │ When abuse reports become a concern                  │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Unread counters                         │ Requires persistent per-user read cursors; unnecessary for ephemeral  │ When retention extends beyond 24h                    │
│                                         │ chat                                                                  │                                                      │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Push notifications                      │ No push infrastructure exists                                         │ When mobile client or offline notification needs     │
│                                         │                                                                       │ arise                                                │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Message edit/delete                     │ Adds complexity to realtime sync; low value for ephemeral chat        │ When retention extends and messages have lasting     │
│                                         │                                                                       │ impact                                               │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Profanity filter                        │ IMessageFilter port is ready; just needs an implementation            │ Can be added at any time without architecture        │
│                                         │                                                                       │ changes                                              │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Redis backplane for SignalR             │ Single instance handles v1 load; only needed for horizontal scaling   │ When Chat scales beyond a single instance            │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Longer retention / search               │ Change retention config + add full-text index                         │ When product requirements demand it                  │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Rich player cards (avatar, match        │ Profile endpoint is extensible; add fields to                         │ When avatar system or match history UI is designed   │
│ history)                                │ PublicPlayerProfileResponse                                           │                                                      │
├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┤
│ Chat commands (e.g., /whisper, /invite) │ Message parsing pipeline can be added to IMessageFilter chain         │ When product defines the command set                 │
└─────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────┘

  ---
Key Validation Against Codebase

The hypothesis is confirmed with minor corrections:

1. Chat as standalone service — confirmed. The codebase structure, messaging library, and service isolation patterns all support it cleanly.
2. BFF as sole frontend boundary — confirmed. The BattleHubRelay pattern is the exact blueprint for ChatHubRelay. No reason to deviate.
3. Players as profile source of truth — confirmed. The Character entity already has all needed fields. One new query endpoint is the only change needed in Players.
4. Correction: Presence is chat-scoped, not platform-wide — confirmed by codebase analysis. There is zero presence infrastructure anywhere in the system. Chat should own
   presence as a chat concern, not attempt to build a generic presence platform.
5. Correction: Chat does NOT need MassTransit for outbound events in v1 — the hypothesis implied integration events for presence. In practice, all Chat outputs are realtime
   (SignalR). No downstream service consumes chat events. Outbox is still needed for PlayerCombatProfileChanged consumption (inbox side), but Chat publishes nothing via
   MassTransit in v1.
6. Correction: Short-lived persistence is PostgreSQL, not Redis — the hypothesis suggested 24h retention might mean Redis. Analysis of the codebase shows PostgreSQL is the
   right choice: every service uses it for persistent data, the message query patterns (conversation + time range) are relational, and the retention cleanup is trivial SQL.
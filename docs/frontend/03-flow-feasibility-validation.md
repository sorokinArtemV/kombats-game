# Kombats Frontend Flow Feasibility Validation

## Changelog (2026-04-16 re-validation)

**What changed:**
- Added chat feasibility validation (new Section 12) -- chat is fully supported
- Added player card feasibility validation (new Section 13) -- fully supported
- Corrected battle zone values throughout (5-zone ring, not 6-zone body-part)
- Corrected zone parsing as case-insensitive
- Updated executive summary to reflect chat and player card as confirmed capabilities
- Updated backend changes required: G3 (win/loss) partially resolved, new asymmetry noted
- Updated final verdict: backend is sufficient for full MVP including chat and social features
- Updated frontend-only implementation notes with chat connection management
- Updated decision tables

**Old assumptions invalidated:**
- "Win/loss record not exposed in BFF API responses" -- now exposed in PlayerCardResponse (other players), still not in own GameStateResponse
- "Chat not validated / out of scope" -- chat is fully implemented and validated
- "No player profile viewing" -- player card endpoint exists and is fully functional
- "6 zones: Head, Torso, LeftArm, etc." -- corrected to 5 zones: Head, Chest, Belly, Waist, Legs
- "Zone parsing is case-sensitive" -- corrected to case-insensitive

---

## 1. Purpose

This document validates every significant frontend requirement from `02-client-product-and-architecture-requirements.md` against the actual Kombats backend codebase and BFF integration layer. The goal is to determine, requirement by requirement, whether the desired frontend behavior is supported by the current backend before frontend architecture begins.

This is not a restatement of requirements. It is an evidence-based assessment of what the current code actually supports, where it diverges from requirements, and what must be resolved.

---

## 2. Inputs reviewed

| Input | Status |
|-------|--------|
| `docs/frontend/01-backend-revision-for-frontend.md` | Read in full |
| `docs/frontend/02-client-product-and-architecture-requirements.md` | Read in full |
| `src/Kombats.Bff/Kombats.Bff.Api` | All endpoints, hubs (BattleHub, ChatHub), middleware, DTOs inspected |
| `src/Kombats.Bff/Kombats.Bff.Application` | Service clients (Players, Matchmaking, Battle, Chat), relay (BattleHubRelay, ChatHubRelay), narration pipeline, game state composer inspected |
| `src/Kombats.Bff/Kombats.Bff.Bootstrap` | Program.cs auth config, DI, SignalR setup for both hubs inspected |
| `src/Kombats.Chat/Kombats.Chat.Domain` | Message, Conversation entities inspected |
| `src/Kombats.Chat/Kombats.Chat.Application` | All use case handlers, eligibility, rate limiting, error codes inspected |
| `src/Kombats.Chat/Kombats.Chat.Infrastructure` | Redis presence store, rate limiter, repositories, workers inspected |
| `src/Kombats.Chat/Kombats.Chat.Api` | InternalChatHub, HTTP endpoints inspected |
| `src/Kombats.Battle/Kombats.Battle.Domain` | BattleZone enum (5 zones), BattleZoneHelper (adjacency), BattleEngine, Ruleset inspected |
| `src/Kombats.Battle/Kombats.Battle.Application` | ActionIntakeService, BattleTurnAppService, BattleLifecycleAppService inspected |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure` | BattleHub, SignalRBattleRealtimeNotifier, recovery workers inspected |
| `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts` | All realtime DTOs inspected |
| `src/Kombats.Matchmaking` | Queue handlers, Redis stores, pairing worker, timeout worker inspected |
| `src/Kombats.Players/Kombats.Players.Api` | Me endpoints, GetPlayerProfileEndpoint inspected |
| `src/Kombats.Players/Kombats.Players.Application` | All handlers including BattleCompleted consumer, GetPlayerProfileHandler inspected |
| `src/Kombats.Players/Kombats.Players.Domain` | Character entity, OnboardingState, LevelingPolicyV1 inspected |

---

## 3. Validation method

Each requirement was traced from the BFF endpoint or SignalR hub method through to the downstream service implementation. Classification uses:

- **Confirmed by code**: Behavior directly observable in source code with file path and line reference.
- **Inferred from flow**: Behavior follows logically from confirmed code paths but is not explicitly tested.
- **Depends on Keycloak configuration**: Behavior controlled by external identity provider settings, not Kombats code.
- **Partially supported**: Some aspects work, others have gaps or caveats.
- **Unsupported / backend gap**: Current code does not support this behavior.

---

## 4. Executive summary

The core game loop (authenticate -> onboard -> lobby -> queue -> battle -> result -> lobby) plus chat and social features are **fully supported** by the current backend and BFF layer. The backend is sufficient for full MVP frontend implementation.

**Key findings since previous validation:**

1. **Chat is fully supported.** A complete `Kombats.Chat` microservice exists with global chat, direct messaging, presence tracking, rate limiting, message history, and BFF relay via `/chathub`. This was previously out of scope and unimplemented.

2. **Player profile viewing is fully supported.** `GET /api/v1/players/{playerId}/card` returns display name, level, stats, wins, and losses for any player. This was previously listed as a gap.

3. **Win/loss is partially resolved.** Wins and losses are available in the player card response but still absent from the own-profile game state response. The workaround (call card endpoint with own ID) is functional but inelegant.

4. **Battle zone corrections remain necessary.** The combat model uses 5 zones in a ring topology (`Head`, `Chest`, `Belly`, `Waist`, `Legs`) with block adjacency constraints. Zone parsing is case-insensitive. These corrections have now been applied to the requirements document.

**Remaining backend gaps (none are MVP-blocking):**
- Own-profile win/loss not in `GameStateResponse` (workaround exists)
- No battle history list endpoint
- No ranked leaderboard
- Queue auto-leave on browser close is best-effort only
- No unread message tracking for chat

---

## 5. Requirement-by-requirement validation

### REQ-S1: Startup state resolution
**Classification: Supported as-is**

`GET /api/v1/game/state` returns `GameStateResponse` with `Character`, `QueueStatus`, `IsCharacterCreated`, and `DegradedServices`. Confirmed in `GetGameStateEndpoint.cs` and `GameStateComposer.cs`. The response contains all fields needed for startup routing.

### REQ-S2: Active battle reconnection
**Classification: Supported as-is**

When `QueueStatus.Status == "Matched"` with a `BattleId`, the frontend connects to `/battlehub` and calls `JoinBattle(battleId)`. The returned `BattleSnapshotRealtime` includes `Phase` (enum: `ArenaOpen=0`, `TurnOpen=1`, `Resolving=2`, `Ended=3`). Confirmed in `BattleHub.cs` (BFF) and `BattleSnapshotRealtime.cs`. The snapshot includes all state needed for any phase, including `EndedReason` for ended battles.

### REQ-S3: Matchmaking recovery
**Classification: Supported as-is**

`QueueStatus.Status == "Searching"` is returned when the player's Redis status is in Searching state. Confirmed in `GetQueueStatusHandler.cs`. Frontend resumes polling.

### REQ-S4: Onboarding recovery
**Classification: Supported as-is**

`Character.OnboardingState` is returned as `"Draft"`, `"Named"`, or `"Ready"` (mapped from int in `OnboardingStateMapper.cs`). Each state maps to a specific onboarding step.

### REQ-S5: Degraded service handling
**Classification: Supported as-is**

`GameStateComposer.cs` catches `ServiceUnavailableException` independently for Players and Matchmaking. If one service is down, the other's data is still returned. `DegradedServices` is a string array with service names. If both are down, returns 503.

### REQ-S6: Authentication failure recovery
**Classification: Supported with frontend-only implementation**

401 responses are returned by all BFF endpoints when JWT is invalid/expired. The BFF does not handle token refresh. Frontend must implement token lifecycle and redirect to login on 401.

### REQ-S7: Token lifecycle
**Classification: Supported with frontend-only implementation**

BFF uses stateless JWT validation via Keycloak. Token refresh is entirely a frontend responsibility using Keycloak's OIDC refresh token flow. HTTP uses `Authorization: Bearer` header; SignalR uses `?access_token=` query parameter for both `/battlehub` and `/chathub`.

### REQ-S8: Register and Login as client entry points
**Classification: Supported as-is (depends on Keycloak configuration)**

See Section 6 below for detailed analysis.

### REQ-O1: Onboarding is a hard gate
**Classification: Supported as-is**

The BFF does not enforce onboarding completion server-side for endpoint access (a player in Draft state can call queue endpoints). However, the Matchmaking service requires `IsReady` combat profile to join queue (`JoinQueueHandler.cs`), and the Chat service checks eligibility and rejects non-Ready players with `not_eligible`. The frontend must enforce the hard gate for navigation.

### REQ-O2: Onboarding steps
**Classification: Supported as-is**

- **Step 1 (Name selection):** `POST /api/v1/character/name` with `{ Name: string }`. Name validation: 3-16 characters (confirmed in `Character.SetNameOnce()`). Server enforces uniqueness. Returns 409 on duplicate. Name is one-time-set.
- **Step 2 (Stat allocation):** `POST /api/v1/character/stats` with `{ ExpectedRevision, Strength, Agility, Intuition, Vitality }`. Starting stats: 3/3/3/3 with 3 unspent points. Allocation is additive.

**Note:** BFF validation allows name up to 50 characters, but domain enforces 3-16. Frontend should validate 3-16 to match domain.

### REQ-O3: Onboarding step recovery
**Classification: Supported as-is**

`OnboardingState` persists in Postgres. Recovery after browser close confirmed by `GET /api/v1/game/state` returning current `OnboardingState`.

### REQ-O4: Character identity is server-derived
**Classification: Supported as-is**

`POST /api/v1/game/onboard` is idempotent. Creates character using JWT `sub` claim as `IdentityId`. Confirmed in `EnsureCharacterExistsHandler.cs`.

### REQ-L1: Lobby screen
**Classification: Supported as-is**

`GET /api/v1/game/state` returns all MUST fields: Name, stats, level. Chat connection via `/chathub` provides global chat feed and online players list via `JoinGlobalChat()`. Win/loss available via player card endpoint workaround.

### REQ-L2: Stat allocation from lobby
**Classification: Supported as-is**

`POST /api/v1/character/stats` works for both onboarding and post-onboarding allocation. `UnspentPoints > 0` after level-ups is non-blocking.

### REQ-L3: Enter matchmaking
**Classification: Supported as-is**

`POST /api/v1/queue/join` returns `QueueStatusResponse`. 409 when already matched includes match details.

### REQ-L4: Matchmaking searching state
**Classification: Supported as-is**

Poll-based via `GET /api/v1/queue/status`. No push notification. `POST /api/v1/queue/leave` for cancellation. Confirmed: no SignalR hub for matchmaking.

### REQ-L5: Matchmaking state transitions
**Classification: Supported as-is**

All documented status transitions confirmed. The `Matched` without `BattleId` state is unlikely in practice (BattleId is pre-generated at match creation time) but implementing defensively is harmless.

### REQ-L6: Cancel matchmaking
**Classification: Supported as-is**

`POST /api/v1/queue/leave` returns `LeaveQueueResponse` with `LeftQueue: bool`, `MatchId?`, `BattleId?`.

### REQ-L7: Automatic battle transition
**Classification: Supported with frontend-only implementation**

The transition is entirely frontend-driven: detect `Matched` + `BattleId` -> connect SignalR -> `JoinBattle`.

### REQ-B1: Battle connection
**Classification: Supported as-is**

SignalR connection to `/battlehub` with JWT. `JoinBattle(battleId)` returns `BattleSnapshotRealtime`.

### REQ-B2: Server-authoritative state model
**Classification: Supported as-is**

All combat resolution is server-side. `BattleStateUpdated` is authoritative sync point.

### REQ-B3: Turn input and submission
**Classification: Supported as-is (corrected in this revision)**

The zone model is confirmed as 5 zones in a ring topology: `Head`, `Chest`, `Belly`, `Waist`, `Legs`. Block adjacency constraint confirmed in `BattleZoneHelper.IsValidBlockPattern()`. Zone parsing is case-insensitive (`Enum.TryParse` with `ignoreCase: true` in `ActionIntakeService.cs`). `actionPayload` is a JSON string parameter.

### REQ-B4: Client-side action validation
**Classification: Supported with frontend-only implementation**

The client must validate:
- All three zones selected
- Zone values are valid: `Head`, `Chest`, `Belly`, `Waist`, `Legs`
- Block zones are an adjacent pair in the ring topology (5 valid patterns)
- Submission before deadline

### REQ-B5: Turn submission is fire-and-forget
**Classification: Supported as-is**

`SubmitTurnAction` returns void. No confirmation.

### REQ-B6: Event processing
**Classification: Supported as-is**

All events confirmed: `BattleReady`, `TurnOpened`, `TurnResolved`, `PlayerDamaged`, `BattleStateUpdated`, `BattleEnded`, `BattleFeedUpdated`, `BattleConnectionLost`.

### REQ-B7: Event ordering
**Classification: Supported as-is**

Confirmed ordering: PlayerDamaged -> TurnResolved -> TurnOpened/BattleEnded -> BattleStateUpdated -> BattleFeedUpdated (best-effort).

### REQ-B8: Battle end handling
**Classification: Supported as-is**

`BattleEndReasonRealtime` enum confirmed. `WinnerPlayerId` is nullable for draws. `NoActionLimit` is 10.

### REQ-B9: Battle reconnection
**Classification: Supported as-is**

`JoinBattle` returns current snapshot on reconnect. No event replay. Phase: Ended handled.

### REQ-B10: Mid-battle browser close
**Classification: Supported as-is**

Battle continues. Startup recovery reconnects.

### REQ-B11: Narration feed
**Classification: Supported as-is**

`BattleFeedUpdated` events with `Kind`, `Severity`, `Tone`, `Text`. Generated by BFF's `NarrationPipeline`.

### REQ-B12: Combat resolution details
**Classification: Supported as-is**

`TurnResolutionLogRealtime` with `AtoB` and `BtoA` entries. Attack outcomes match requirements.

### REQ-CH-1: Chat connection
**Classification: Supported as-is**

SignalR connection to `/chathub` with JWT. BFF opens downstream to Chat's `/chathub-internal`. `JoinGlobalChat()` returns initial state (last 50 messages, first 100 online players, total count). Confirmed in `ChatHub.cs` (BFF) and `ChatHubRelay.cs`.

### REQ-CH-2: Chat eligibility gate
**Classification: Supported as-is**

Chat service checks eligibility via Players service (with Redis caching in `RedisPlayerInfoCache`). Non-Ready players are rejected with `not_eligible` error code. Confirmed in `EligibilityChecker.cs`.

### REQ-CH-3: Global chat
**Classification: Supported as-is**

`SendGlobalMessage(content)` sends to global room. `GlobalMessageReceived` events broadcast to all in global group. Message validation: 1-500 chars after sanitization (control chars stripped, trimmed, whitespace collapsed). Confirmed in `SendGlobalMessageHandler.cs` and `MessageFilter.cs`.

### REQ-CH-4: Direct messaging
**Classification: Supported as-is**

`SendDirectMessage(recipientPlayerId, content)` creates conversation atomically if needed (INSERT...ON CONFLICT). `DirectMessageReceived` sent to recipient's identity group (multi-tab aware). Conversations listed via `GET /api/v1/chat/conversations`. History via `GET /api/v1/chat/conversations/{id}/messages` and `GET /api/v1/chat/direct/{otherPlayerId}/messages`. Confirmed in `SendDirectMessageHandler.cs` and `ConversationRepository.GetOrCreateDirectAsync()`.

### REQ-CH-5: Online players list
**Classification: Supported as-is**

Online players available via `JoinGlobalChat()` response and `GET /api/v1/chat/presence/online`. `PlayerOnline`/`PlayerOffline` events update in real time. Multi-tab support via refcount (first connection broadcasts online, last broadcasts offline). Confirmed in `RedisPresenceStore.cs` (Lua scripts for atomic operations).

### REQ-CH-6: Rate limit handling
**Classification: Supported as-is**

`ChatError` with code `rate_limited` includes `RetryAfterMs` hint. Global: 5/10s. DM: 10/30s. Confirmed in `RedisRateLimiter.cs`. Redis-based with in-memory fallback on outage.

### REQ-CH-7: Chat error handling
**Classification: Supported as-is**

All error codes confirmed in `ChatErrorCodes.cs`: `rate_limited`, `message_too_long`, `message_empty`, `recipient_not_found`, `not_eligible`, `service_unavailable`. Errors delivered as `ChatError` events with `Code`, `Message`, `RetryAfterMs`.

### REQ-CH-8: Chat reconnection
**Classification: Supported as-is**

On reconnect, call `JoinGlobalChat()` again. Returns last 50 messages for gap recovery. Presence re-registered. BFF relay tracks `IntentionalClose` flag to distinguish clean vs. unclean disconnects.

### REQ-CH-9: Chat connection lost event
**Classification: Supported as-is**

BFF sends `ChatConnectionLost` when downstream connection drops or times out (15-second invocation timeout). Confirmed in `ChatHubRelay.cs`.

### REQ-CH-10: Message history browsing
**Classification: Supported as-is**

Cursor-based pagination via `before` parameter (ISO-8601 timestamp). Default limit 50. Messages returned newest-first. Index on `(conversation_id, sent_at DESC)` confirmed in migration.

### REQ-CH-11: Message deduplication
**Classification: Supported as-is**

Messages have UUID v7 IDs (monotonically increasing). Usable for deduplication. Confirmed in `Message.Create()` using `Guid.CreateVersion7()`.

### REQ-CH-12: Chat during battle
**Classification: Product decision -- both options technically feasible**

Both `/chathub` and `/battlehub` are independent connections. Maintaining both simultaneously is supported. Disconnecting chat during battle and reconnecting after is also supported. No backend constraint prevents either approach.

### REQ-PC-1: View another player's profile
**Classification: Supported as-is**

`GET /api/v1/players/{playerId}/card` returns `PlayerCardResponse` with `PlayerId`, `DisplayName`, `Level`, stats (4 fields), `Wins`, `Losses`. Any authenticated user can view any player. Confirmed in `GetPlayerCardEndpoint.cs` and `GetPlayerProfileEndpoint.cs`.

### REQ-PC-2: Player card response handling
**Classification: Supported as-is**

200 with card data, 404 for not found, 401 for unauthorized. Confirmed in endpoint code.

### REQ-PC-3: Player card does not block navigation
**Classification: Supported with frontend-only implementation**

The player card is a simple HTTP GET. No persistent connection or state change. Frontend can display as overlay/panel.

### REQ-P1: Result screen
**Classification: Supported as-is**

`BattleEnded` event provides outcome. `GET /api/v1/battles/{battleId}/feed` provides full narration.

### REQ-P2: Post-battle state refresh
**Classification: Supported partially / with caveats**

XP is awarded asynchronously. Winner gets 10 XP, loser gets 5 XP. Delay is non-deterministic. Frontend retry-after-delay strategy is the only option.

### REQ-P3: Post-battle feed endpoint
**Classification: Supported as-is**

`GET /api/v1/battles/{battleId}/feed` returns deterministic narration feed. `Key` field supports deduplication.

### REQ-P4: Re-entering the game loop
**Classification: Supported as-is**

No cooldown. Match status clears when battle completes.

### REQ-NF1-NF8: Non-functional requirements
**Classification: Supported with frontend-only implementation**

All non-functional requirements are frontend concerns. The backend provides: `traceId` in errors, `DeadlineUtc` for timers, `DegradedServices` for degradation, `Revision` for concurrency, `RetryAfterMs` for rate limits.

### REQ-R1-R5: Reskin-oriented architecture
**Classification: Supported with frontend-only implementation**

No backend constraints prevent reskin-oriented architecture.

---

## 6. Authentication and registration feasibility

### Current backend state

- BFF uses Keycloak JWT Bearer authentication. Authority and audience configured in `Program.cs`.
- No registration endpoint exists in BFF or Players service.
- Character creation is lazy via `POST /api/v1/game/onboard`.
- All endpoints require `[Authorize]` except `/health`.
- SignalR token extraction configured for both `/battlehub` and `/chathub`.

### Registration flow feasibility

**Login redirect:** Fully feasible. Standard OIDC flow.

**Registration redirect:** Feasible if Keycloak realm has self-registration enabled.

**Post-registration behavior:** Depends on Keycloak realm configuration (email verification, etc.). Client can implement both paths.

### Verdict

Registration and login redirects are fully feasible as a frontend-only implementation. No Kombats backend changes needed.

---

## 7. Startup and recovery feasibility

### GET /api/v1/game/state -- confirmed complete

Response structure confirmed:

```
GameStateResponse:
  Character: CharacterResponse | null
  QueueStatus: QueueStatusResponse | null
  IsCharacterCreated: bool
  DegradedServices: string[] | null
```

### Recovery routing -- confirmed complete

| Condition | Detection | Action |
|---|---|---|
| Active battle | `QueueStatus.Status == "Matched"` + `BattleId != null` | Reconnect to battle via SignalR |
| Active matchmaking | `QueueStatus.Status == "Searching"` | Resume matchmaking polling |
| Incomplete onboarding | `Character.OnboardingState != "Ready"` | Force onboarding step |
| No special state | All above are false | Show lobby, connect to chat |

### Verdict

Startup and recovery are **fully supported as-is**. No backend changes needed.

---

## 8. Onboarding feasibility

### Hard gate enforcement

**Server-side:** Matchmaking validates `IsReady` combat profile. Chat checks eligibility. Non-Ready players blocked from gameplay and chat at service level.

**Frontend-side:** Must enforce navigation lock when `OnboardingState != "Ready"`.

### Verdict

Onboarding is **fully supported as-is**.

---

## 9. Lobby and matchmaking feasibility

### Lobby display

All required fields available:
- Character data from `GET /api/v1/game/state`: Name, Level, TotalXp, stats, UnspentPoints
- Chat feed and online players from `/chathub` `JoinGlobalChat()`
- Win/loss from `GET /api/v1/players/{ownId}/card` (workaround; see Section 15)

### Queue operations

All confirmed: join, leave, status poll. 409 handling. Timeout handling. No push notifications (poll-only).

### Verdict

Lobby and matchmaking are **fully supported as-is**.

---

## 10. Battle and reconnect feasibility

### Turn submission -- corrected zone model

The actual zones are: `Head`, `Chest`, `Belly`, `Waist`, `Legs` (5 zones, ring topology).

Valid block pairs (adjacent in ring):
- Head <-> Chest
- Chest <-> Belly
- Belly <-> Waist
- Waist <-> Legs
- Legs <-> Head

Zone parsing is case-insensitive. The frontend should present 5 valid block patterns.

### All other battle features

All confirmed: connection, events, ordering, reconnection, mid-battle close, narration. NoActionLimit is 10.

### Verdict

Battle flow is **fully supported as-is**.

---

## 11. Post-battle feasibility

### XP timing

XP awarded asynchronously. Typical sub-second delay but not guaranteed. Frontend should use retry-after-delay on lobby refresh.

### Post-battle feed

Available immediately after battle ends. Deterministic and idempotent.

### Verdict

Post-battle flow is **supported with the caveat** that XP display is best-effort.

---

## 12. Chat feasibility

### Chat service architecture

The `Kombats.Chat` microservice is a fully implemented service with 6 projects following the standard architecture (Domain, Application, Infrastructure, Api, Bootstrap, Contracts). It uses:
- PostgreSQL (`chat` schema) for message and conversation persistence
- Redis (DB 2) for presence tracking, rate limiting, and player info caching
- MassTransit for integration events (PlayerCombatProfileChanged consumer)

### BFF integration

BFF provides a thin relay via `ChatHub` at `/chathub`. The relay manages per-frontend-connection downstream connections to Chat's `/chathub-internal`. All events are forwarded without transformation (blind relay, unlike battle which adds narration).

HTTP endpoints in BFF proxy to Chat's internal HTTP endpoints for conversation/message history and presence.

### Global chat validation

- `JoinGlobalChat()` returns last 50 messages + first 100 online players + total count. Confirmed.
- `SendGlobalMessage(content)` validates eligibility, rate limits, message content, then persists and broadcasts. Confirmed.
- `GlobalMessageReceived` events broadcast to all in `"global"` group. Confirmed.
- Message sanitization (strip control chars, trim, collapse whitespace) before persistence. Confirmed.
- Rate limit: 5 per 10 seconds. Confirmed in `SendGlobalMessageHandler.cs`.

### Direct messaging validation

- `SendDirectMessage(recipientPlayerId, content)` checks both sender and recipient eligibility. Confirmed.
- Conversation created atomically via INSERT...ON CONFLICT with sorted-pair invariant. Confirmed.
- `DirectMessageReceived` sent to recipient's `"identity:{id}"` group (all tabs). Confirmed.
- Rate limit: 10 per 30 seconds. Confirmed.
- History available via HTTP endpoints with cursor pagination. Confirmed.

### Presence validation

- Redis sorted set `chat:presence:online` scored by heartbeat timestamp. Confirmed.
- Multi-tab refcount via Lua scripts (atomic increment/decrement). Confirmed.
- `PlayerOnline` on first connection, `PlayerOffline` on last disconnection. Confirmed.
- 30-second heartbeat, 90-second TTL. Confirmed.
- Presence sweep worker removes stale entries. Confirmed.

### Rate limiting validation

- Redis-based with in-memory fallback on outage. Confirmed.
- Three surfaces: global (5/10s), dm (10/30s), presence (1/5s). Confirmed.
- Returns `RetryAfterMs` on rejection. Confirmed.

### Reconnection validation

- BFF relay has 15-second invocation timeout. Confirmed.
- `ChatConnectionLost` event on timeout or downstream drop. Confirmed.
- `JoinGlobalChat()` on reconnect provides last 50 messages for gap recovery. Confirmed.
- Presence re-registered on new connection. Confirmed.

### What chat does NOT support

- Unread message counts (no server-side tracking)
- Message editing or deletion
- Typing indicators
- User blocking/muting (interface exists, v1 is no-op)
- Message search
- File/image attachments

### Verdict

Chat is **fully supported as-is**. All chat requirements (REQ-CH-1 through REQ-CH-12) are feasible with the current backend. No backend changes needed for chat MVP.

---

## 13. Player card feasibility

### Endpoint validation

`GET /api/v1/players/{playerId}/card` confirmed in `GetPlayerCardEndpoint.cs`. BFF calls Players service `GET /api/v1/players/{identityId}/profile`, maps via `ChatMapper.MapCard()`.

### Response validation

`PlayerCardResponse` includes: PlayerId, DisplayName, Level, Strength, Agility, Intuition, Vitality, Wins, Losses. Confirmed.

### Access validation

Any authenticated user can view any player's card. No role-based restrictions beyond JWT auth. Confirmed: endpoint uses `.RequireAuthorization()` with no policy.

### Own-profile asymmetry

`CharacterResponse` (in `GameStateResponse`) does NOT include Wins/Losses. `PlayerCardResponse` DOES. This means:
- Viewing another player: wins/losses available
- Viewing own profile via game state: wins/losses NOT available
- Workaround: call card endpoint with own identity ID

The workaround is functional. The identity ID is available from the JWT `sub` claim.

### Verdict

Player card is **fully supported as-is**. The own-profile win/loss asymmetry is a minor inconvenience, not a blocker.

---

## 14. Queue-disconnect behavior validation

### Current backend reality

No server-side mechanism to detect client disconnection during matchmaking. Queue entries have fixed 30-minute TTL. No heartbeat for queued players.

### Frontend options

Best-effort: `navigator.sendBeacon()` on `pagehide` (~80% reliable). Fallback: 30-minute TTL expiration. Recovery mechanisms handle worst case (matched while absent -> DoubleForfeit -> cleanup).

### Verdict

**Best-effort frontend behavior only.** Not guaranteed. Not MVP-blocking.

---

## 15. Backend changes required

| # | Change | Severity | Requirement | Status |
|---|---|---|---|---|
| BC-1 | **Expose Wins/Losses in `CharacterResponse` / `GameStateResponse`** | Low | DES-3, REQ-L1 (SHOULD) | `Wins`/`Losses` exist in domain and are exposed in `PlayerCardResponse`, but not in `MeResponse` or `CharacterResponse`. Workaround: call card endpoint with own ID. Ideal fix: add fields to both DTOs. |
| BC-2 | **Queue heartbeat/timeout mechanism** (optional) | Low | DES-1 | Would reduce ghost-queued player window. Not MVP-blocking. |

No other backend changes are required for the full MVP including chat.

---

## 16. Frontend-only implementation notes

| Area | What the frontend must implement | Backend dependency |
|---|---|---|
| OIDC auth flow | Token acquisition, storage, refresh, and injection | Keycloak (external) |
| Onboarding hard gate | Navigation lock for non-Ready states | Reads `OnboardingState` from game state |
| Matchmaking polling loop | 1-2s interval poll of `GET /api/v1/queue/status` | None |
| Auto-transition to battle | Detect `Matched` + `BattleId` -> connect SignalR | None |
| Block zone adjacency validation | Present only valid adjacent pairs (5 patterns) | Uses `BattleZone` ring topology |
| Turn timer with buffer | Display deadline minus ~1-2 seconds | Reads `DeadlineUtc` from server |
| Fire-and-forget turn submission UI | Show "submitted" indicator locally | No server confirmation exists |
| Battle SignalR reconnection | Exponential backoff, `JoinBattle` on reconnect | None |
| Chat SignalR connection management | Connect on lobby entry, `JoinGlobalChat()`, handle events | None |
| Chat reconnection with gap recovery | Exponential backoff, `JoinGlobalChat()` on reconnect (last 50 messages) | None |
| Chat message deduplication | Track MessageId to prevent duplicates from events + history fetch | None |
| Chat rate limit UI | Show countdown from `RetryAfterMs`, disable send button | None |
| Online players list management | Initialize from `JoinGlobalChat()`, update via `PlayerOnline`/`PlayerOffline` events | None |
| DM conversation management | Open conversations, fetch history, send messages, handle incoming | None |
| Unread tracking (client-side) | Track last-read position per conversation locally | No server-side support |
| Player card display | Fetch and display on demand | None |
| Own win/loss (workaround) | Call card endpoint with own identity ID from JWT `sub` | None |
| Post-battle XP refresh with retry | Poll game state with short delay after battle end | None |
| Queue leave on browser close | `navigator.sendBeacon()` best-effort | None |
| Token refresh before expiry | Proactive OIDC refresh token flow | Keycloak (external) |

---

## 17. Ambiguities and unresolved points

### V-1: Keycloak realm configuration for registration
**Status: Outside Kombats code validation.** Client can implement both paths. Keycloak realm must have `registrationAllowed: true`.

### V-2: Turn deadline grace period
**Status: Resolved.** 1-second grace buffer confirmed. Frontend should apply local buffer of 1-2 seconds.

### V-3: Stat allocation semantics
**Status: Resolved.** Additive allocation confirmed.

### V-4: Name permanence
**Status: Resolved.** One-time-set confirmed.

### V-5: `OnboardingState: "Unknown"` handling
**Status: Resolved.** Cannot occur in practice. Treat as error condition.

### V-6: Concurrent session handling
**Status: Acceptable risk.** Stat allocation: 409 on conflict. Battle: both tabs receive events. Chat: both tabs receive messages, presence counts correctly via refcount.

### V-7: Post-battle XP timing
**Status: Resolved as non-deterministic.** Typical sub-second. Use retry-after-delay.

### V-8: SignalR reconnection after battle ended during disconnect
**Status: Resolved.** `JoinBattle` returns snapshot with `Phase: Ended`. No event replay.

### V-9: Chat during battle
**Status: Product decision.** Both options technically feasible. No backend constraint.

### V-10: Chat message retention window
**Status: Configurable.** `MessageRetentionOptions.MessageTtlHours` controls retention. Frontend should handle finite history gracefully.

### V-11: BFF name validation mismatch
**Status: Minor.** BFF validates max 50 chars; domain validates 3-16. Frontend should validate 3-16. Not blocking.

---

## 18. Final feasibility verdict

The backend is **sufficient for full MVP frontend implementation** including chat and social features. No backend changes are required for the primary flow. All requirements (startup, onboarding, lobby, matchmaking, battle, chat, player card, post-battle) are feasible with the current backend.

### Decision table

#### 1. Safe to design now

| Area | Rationale |
|---|---|
| Authentication and registration flow | Standard OIDC, no backend dependency |
| Startup state resolution and routing | `GET /api/v1/game/state` provides all needed data |
| Onboarding flow (name + stats) | Fully supported, all edge cases handled |
| Lobby screen layout | All required fields available |
| Matchmaking polling UX | Poll-based, well-defined status transitions |
| Battle connection and reconnection | SignalR hub fully functional |
| Battle turn submission UI | 5-zone ring model with adjacency constraints -- corrected and confirmed |
| Battle event processing and state sync | All events and DTOs confirmed |
| Result screen and post-battle flow | BattleEnded event + feed endpoint confirmed |
| Narration feed display | Feed structure and metadata fully defined |
| Global chat | Hub, events, history, rate limits all confirmed |
| Direct messaging | Hub methods, conversation model, history all confirmed |
| Online players list | Presence tracking, events, pagination all confirmed |
| Player card / profile view | Endpoint, response, access model all confirmed |
| Error handling and degraded states | Error format, DegradedServices, ChatError all confirmed |
| Reskin-oriented architecture separation | No backend constraints prevent this |
| Token lifecycle management | Standard OIDC, frontend-only |

#### 2. Safe to design with caveats

| Area | Caveat |
|---|---|
| Own-profile win/loss display | Not in `GameStateResponse`. Use card endpoint with own ID as workaround. Accommodate as optional field. |
| Post-battle XP/level display | XP is async; design for delayed availability with retry. |
| Queue leave on browser close | Best-effort only (`sendBeacon`). Design UX for returning to active search. |
| Chat gap recovery | Limited to last 50 messages on `JoinGlobalChat()`. Long disconnects may have gaps. |
| Chat unread tracking | Client-side only. No cross-device sync. |

#### 3. Must be resolved before implementation

| Item | What must happen | Who |
|---|---|---|
| **Confirm Keycloak self-registration is enabled** | Verify realm config has `registrationAllowed: true` and determine post-registration behavior. | DevOps / platform team |
| **Decide chat during battle** | Maintain or disconnect `/chathub` during battle. Affects UI complexity and DM notifications. | Product decision |
| **Decide own-profile win/loss approach** | Accept card endpoint workaround or request backend change to add fields to `GameStateResponse`. | Product + backend |

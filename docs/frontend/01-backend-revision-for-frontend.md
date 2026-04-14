# Kombats Backend Revision for Frontend

## 1. Purpose and scope

This document analyzes the Kombats backend from the perspective of a future React web client. It covers the effective integration contract, communication model, state expectations, and gaps that must be resolved before frontend architecture or implementation begins.

**Scope:** All client-facing surfaces exposed through the BFF (`src/Kombats.Bff`), traced into downstream services (Players, Matchmaking, Battle) where the BFF proxies or relays behavior that shapes the frontend contract.

**Not in scope:** Internal service-to-service messaging details irrelevant to the client, infrastructure deployment concerns, database schema internals, domain model details that don't surface to the client.

**Key assumption:** The backend is functionally complete for MVP. Registration/identity creation is missing and noted as a known gap but does not block the rest of this revision.

---

## 2. Revision method and inspected modules

### Modules inspected

| Module | Role | Key files read |
|--------|------|----------------|
| `src/Kombats.Bff/Kombats.Bff.Bootstrap` | BFF composition root, auth config, resilience, SignalR setup | `Program.cs` |
| `src/Kombats.Bff/Kombats.Bff.Api` | HTTP endpoints, BattleHub, validation filters, error middleware | All endpoint files, `BattleHub.cs`, `ExceptionHandlingMiddleware.cs` |
| `src/Kombats.Bff/Kombats.Bff.Application` | Service clients, relay, narration pipeline, error mapping, game state composition | All client interfaces/implementations, `BattleHubRelay.cs`, narration pipeline |
| `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts` | Realtime DTOs pushed to client via SignalR | All contract records |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure` | Battle SignalR hub, notifier | `BattleHub.cs`, `SignalRBattleRealtimeNotifier.cs` |
| `src/Kombats.Battle/Kombats.Battle.Application` | Turn submission, battle lifecycle, recovery | `BattleTurnAppService.cs`, `ActionIntakeService.cs`, `BattleLifecycleAppService.cs` |
| `src/Kombats.Matchmaking/Kombats.Matchmaking.Api` | Queue endpoints, status DTO | All endpoint files |
| `src/Kombats.Matchmaking/Kombats.Matchmaking.Application` | Queue handlers, status query, timeout | All handler files |
| `src/Kombats.Players/Kombats.Players.Api` | Character endpoints, identity extraction | All endpoint files |
| `src/Kombats.Players/Kombats.Players.Application` | Character lifecycle handlers | All handler files |
| `src/Kombats.Players/Kombats.Players.Domain` | Character entity, onboarding states, leveling | `Character.cs`, `OnboardingState.cs`, `LevelingPolicyV1.cs` |

### Method

- Read all endpoint definitions, hub methods, relay logic, narration pipeline, service clients, and downstream handlers
- Traced each client-facing action from BFF through to the service that performs it
- Identified all DTOs that reach the client (HTTP responses and SignalR events)
- Mapped state machines and lifecycle transitions visible to the client
- Identified error paths and recovery behavior

---

## 3. BFF as the frontend integration boundary

### Confirmed: BFF is the single integration boundary

The frontend talks exclusively to BFF. All HTTP calls and SignalR connections go through BFF endpoints. There are no direct connections from the client to Players, Matchmaking, or Battle services.

**Confirmed by code:**
- BFF registers typed HttpClients (`PlayersClient`, `MatchmakingClient`, `BattleClient`) that forward JWT and trace context to downstream services
- BFF's `BattleHub` at `/battlehub` proxies all SignalR traffic to Battle's own `/battlehub` via `BattleHubRelay`
- All downstream service URLs are internal configuration; the client never sees them

### How BFF integrates with downstream services

| BFF surface | Downstream service | Integration pattern |
|-------------|-------------------|---------------------|
| `POST /api/v1/game/onboard` | Players (`POST /api/v1/me/ensure`) | HTTP proxy with JWT forwarding |
| `GET /api/v1/game/state` | Players (`GET /api/v1/me`) + Matchmaking (`GET /api/v1/matchmaking/queue/status`) | Parallel HTTP calls, composed response |
| `POST /api/v1/queue/join` | Matchmaking (`POST /api/v1/matchmaking/queue/join`) | HTTP proxy |
| `POST /api/v1/queue/leave` | Matchmaking (`POST /api/v1/matchmaking/queue/leave`) | HTTP proxy |
| `GET /api/v1/queue/status` | Matchmaking (`GET /api/v1/matchmaking/queue/status`) | HTTP proxy |
| `POST /api/v1/character/name` | Players (`POST /api/v1/character/name`) | HTTP proxy |
| `POST /api/v1/character/stats` | Players (`POST /api/v1/players/me/stats/allocate`) | HTTP proxy |
| `GET /api/v1/battles/{id}/feed` | Battle (`GET /api/internal/battles/{id}/history`) | HTTP fetch + BFF-side narration generation |
| `/battlehub` (SignalR) | Battle (`/battlehub` SignalR) | Per-connection relay with event transformation |

### BFF value-add beyond proxying

The BFF is not just a passthrough. It adds meaningful logic in two areas:

1. **Game state composition** (`GameStateComposer`): Calls Players and Matchmaking in parallel, tolerates individual service failures, returns a degraded-but-usable response. The frontend receives a single composed object instead of making two calls.

2. **Battle narration pipeline**: The BFF receives raw combat resolution events from Battle and generates human-readable narrative text (attack descriptions, commentary, dramatic moments). This runs both live (during SignalR relay) and on-demand (via the battle feed HTTP endpoint). The narration is deterministic given the same inputs.

### No leaks or ambiguities in the boundary

There are no cases where the frontend would need to bypass BFF. All client-relevant operations route through BFF endpoints. The downstream internal endpoints (e.g., Battle's `/api/internal/battles/{id}/history`) are not exposed to the client.

---

## 4. Authentication and client identity model

### Auth flow as seen by the frontend

**Identity provider:** Keycloak (OIDC/JWT)

**What the frontend must do:**
1. Authenticate against Keycloak to obtain a JWT access token
2. Include the token as `Authorization: Bearer <token>` header on all HTTP requests
3. For SignalR: pass the token as `access_token` query parameter when connecting to `/battlehub`

**Confirmed by code** (`Kombats.Bff.Bootstrap/Program.cs`):
- JwtBearer authentication configured with Keycloak authority and audience
- `NameClaimType = "preferred_username"`
- SignalR token extraction from query string for WebSocket transport (`OnMessageReceived` event handler checks for `/battlehub` path)

### Identity propagation

- BFF extracts the JWT from incoming requests and forwards it verbatim to downstream services via `JwtForwardingHandler`
- Each downstream service independently validates the JWT and extracts the user's `sub` claim as the identity ID
- The frontend never provides a user ID explicitly; identity is always derived from the JWT

### What the frontend should assume

- **All endpoints require authentication** except `GET /health`
- **Session bootstrap:** The frontend should call `POST /api/v1/game/onboard` after authentication to ensure a character exists, then `GET /api/v1/game/state` to load initial state
- **Token refresh:** The frontend is responsible for token refresh before expiry; the backend does not handle refresh flows
- **No cookie-based auth:** The backend uses stateless JWT; there are no session cookies

### Missing: User registration

**Confirmed gap:** There is no registration endpoint in BFF or Players. The Players service assumes the user already has a Keycloak identity (JWT with `sub` claim). Character creation is lazy (via `POST /api/v1/game/onboard`), but the Keycloak account must already exist.

**Frontend consequence:** The frontend cannot implement a registration flow against the current backend. This must be handled externally (Keycloak admin API, self-registration flow in Keycloak, or a future registration endpoint). The frontend should treat registration as an out-of-band prerequisite and plan to redirect to Keycloak's login/registration page.

---

## 5. Matchmaking capabilities from frontend perspective

### Available operations

| Action | Endpoint | What it does |
|--------|----------|-------------|
| Enter queue | `POST /api/v1/queue/join` | Puts player in matchmaking queue; returns `Searching` status |
| Leave queue | `POST /api/v1/queue/leave` | Removes player from queue; returns whether the player successfully left |
| Check status | `GET /api/v1/queue/status` | Returns current queue/match state |

### Status values the frontend must represent

The `QueueStatusResponse` returned by BFF contains:

```
{
  Status: "Idle" | "Searching" | "Matched" | "NotQueued",
  MatchId?: Guid,
  BattleId?: Guid,
  MatchState?: "Queued" | "BattleCreateRequested" | "BattleCreated" | "Completed" | "TimedOut"
}
```

**Frontend state machine for matchmaking:**

```
Idle → (join queue) → Searching → (match found) → Matched → (battle ready) → [transition to battle]
  ↑         |                                          |
  |    (leave queue)                              (battle ends)
  |         |                                          |
  +←--------+←----------------------------------------+
```

### How the frontend learns a match was found

**This is poll-based, not push.** There is no SignalR channel or WebSocket for matchmaking status. The frontend must poll `GET /api/v1/queue/status` at an interval to detect the transition from `Searching` to `Matched`.

**Confirmed by code:** Matchmaking service has no SignalR hub. BFF does not add any push mechanism for matchmaking. The only realtime channel is the battle hub.

**Frontend consequence:** The frontend needs a polling loop while in `Searching` state. Recommended interval: 1-2 seconds (the pairing worker runs every 100ms, so matches are found quickly). The frontend should stop polling once status changes to `Matched` or the user cancels.

### Edge cases the frontend must handle

1. **Already matched (409 on join):** If the player already has an active match, `POST /api/v1/queue/join` returns 409 with the match details. The BFF maps this to a `QueueStatusResponse` with `Status: "Matched"`. The frontend should treat this as "you already have a match" and navigate accordingly.

2. **Already matched (409 on leave):** If the player tries to leave queue but was already matched, `POST /api/v1/queue/leave` returns with `LeftQueue: false` and includes `MatchId`/`BattleId`. The frontend should not treat this as an error.

3. **Queue timeout:** Player status in Redis expires after 30 minutes. If the user sits in `Searching` state for 30 minutes without a match, the next status poll will return `Idle`/`NotQueued`. The frontend should detect this transition and inform the user.

4. **Match creation timeout:** If a match was found but the battle service doesn't create the battle within 60 seconds, the match is timed out server-side. The status will transition to `TimedOut`. The frontend should detect this and allow re-queueing.

5. **Battle creation pending:** After `Matched`, the `MatchState` field progresses through `Queued` → `BattleCreateRequested` → `BattleCreated`. The frontend may want to show "Preparing battle..." during this transition. The `BattleId` is available once `MatchState` reaches `BattleCreateRequested` or later.

### What triggers battle entry

Once the frontend sees `Status: "Matched"` with a `BattleId`, it can connect to the battle hub at `/battlehub` and call `JoinBattle(battleId)`. The BattleId is the bridge between matchmaking and battle.

---

## 6. Battle capabilities from frontend perspective

### Battle entry

1. Frontend connects to `/battlehub` via SignalR (with JWT as `access_token` query parameter)
2. Frontend calls `JoinBattle(battleId)` → receives a `BattleSnapshotRealtime` with full initial state
3. The snapshot includes: both players' IDs and names, current phase, turn index, HP values, max HP, deadline, ruleset (turn duration, no-action limit), and end state if already ended

**Confirmed by code:** `BattleHub.JoinBattle` in BFF creates a downstream SignalR connection to Battle's hub, forwards the JWT, joins the battle, and returns the snapshot. The BFF also generates a `BattleFeedUpdated` event with the battle start narration.

### Battle state delivery model: push-based with initial pull

The battle is **primarily push-based** via SignalR:
- Initial state is pulled via `JoinBattle` (returns snapshot)
- All subsequent state changes are pushed via SignalR events
- There is no polling mechanism for battle state

**The frontend should treat pushed events as the authoritative state source** during an active battle.

### Turn submission

The client submits an action by calling `SubmitTurnAction(battleId, turnIndex, actionPayload)` on the hub.

**Action payload format (JSON string):**
```json
{
  "attackZone": "Head" | "Torso" | "LeftArm" | "RightArm" | "LeftLeg" | "RightLeg",
  "blockZonePrimary": "Head" | "Torso" | "LeftArm" | "RightArm" | "LeftLeg" | "RightLeg",
  "blockZoneSecondary": "Head" | "Torso" | "LeftArm" | "RightArm" | "LeftLeg" | "RightLeg"
}
```

**Critical frontend constraint:** The `actionPayload` parameter is a **string**, not a structured object. The frontend must JSON-serialize the action object into a string before passing it to the hub method.

**Server-side validation (silent):** Invalid payloads are accepted but treated as `NoAction` — the player effectively does nothing that turn. The server does not return an error for invalid submissions. This means:
- Empty/missing payload → NoAction
- Malformed JSON → NoAction
- Invalid zone values → NoAction
- Wrong turn index → NoAction (protocol violation)
- Submission after deadline → NoAction (late, with 1-second grace buffer)

**Frontend consequence:** The frontend must validate actions locally before submission to give the user feedback, since the server silently degrades invalid actions to no-ops.

### SignalR events the frontend receives during battle

Events are pushed in a defined sequence. The BFF relays most events from Battle's hub and adds narration events.

| Event | When | Payload summary | Frontend action |
|-------|------|----------------|-----------------|
| `BattleReady` | Battle starts (turn 1 opens) | Player IDs, names | Show battle has started |
| `TurnOpened` | Each new turn begins | Turn index, deadline UTC | Start turn timer, enable action input |
| `TurnResolved` | Turn resolution complete | Both players' actions, detailed combat log | Display turn results |
| `PlayerDamaged` | Each damage instance | Player ID, damage amount, remaining HP, turn index | Update HP bars |
| `BattleStateUpdated` | After each turn resolution | Full state snapshot (HP, phase, turn, etc.) | Sync authoritative state |
| `BattleEnded` | Battle reaches terminal state | Reason, winner ID, timestamp | Show result screen |
| `BattleFeedUpdated` | After narration generation | Array of `BattleFeedEntry` with narrative text | Display combat narrative |
| `BattleConnectionLost` | BFF loses connection to Battle service | (no payload) | Show connection error, attempt reconnect |

### Event ordering within a turn

When a turn resolves and continues to the next turn, events arrive in this order:
1. `PlayerDamaged` (one per damage instance — can be 0, 1, or 2 events)
2. `TurnResolved` (action details and combat log)
3. `TurnOpened` (next turn)
4. `BattleStateUpdated` (full state snapshot)
5. `BattleFeedUpdated` (narration, best-effort, may be slightly delayed)

**Frontend consequence:** The frontend can use `PlayerDamaged` for immediate HP animation, `TurnResolved` for showing combat details, and `BattleStateUpdated` as the authoritative sync point. `BattleFeedUpdated` may arrive slightly after other events since narration generation is non-blocking.

### Battle end reasons

The `BattleEndedRealtime.Reason` enum:
- `Normal` — one player's HP reached 0
- `DoubleForfeit` — both players accumulated too many consecutive no-actions (inactivity)
- `Timeout` — battle exceeded time limit
- `Cancelled` — administrative cancellation
- `AdminForced` — forced end by admin
- `SystemError` — server error during battle
- `Unknown` — fallback

**Frontend consequence:** The frontend should handle at minimum `Normal` (show winner/loser), `DoubleForfeit` (show draw/mutual inactivity), and `SystemError` (apologize and return to lobby). Other reasons can be grouped as "battle ended unexpectedly."

### Battle phases

```
ArenaOpen → TurnOpen → Resolving → TurnOpen → ... → Ended
```

- `ArenaOpen`: Initial setup phase; the frontend may see this briefly on join
- `TurnOpen`: Active turn; the player can submit actions; deadline is ticking
- `Resolving`: Server is processing the turn; no actions accepted; brief
- `Ended`: Terminal; no further actions possible

### Combat resolution details available to the frontend

`TurnResolvedRealtime` includes a `TurnResolutionLogRealtime` with per-direction attack details:
- Attacker/defender IDs
- Attack zone chosen
- Defender's block zones (primary and secondary)
- Whether the attack was blocked, dodged, or landed
- Whether it was a critical hit (and what kind)
- Damage dealt

**Attack outcomes:** `NoAction`, `Dodged`, `Blocked`, `Hit`, `CriticalHit`, `CriticalBypassBlock`, `CriticalHybridBlocked`

This is sufficient for the frontend to render detailed combat animations/descriptions without needing the narration system.

### Post-battle: battle feed endpoint

`GET /api/v1/battles/{battleId}/feed` returns the complete narration feed for a finished battle. This is deterministic — calling it multiple times returns the same result. Useful for:
- Battle replay/history screen
- If the client missed events during the battle
- Post-battle summary

Returns 404 if battle not found, 403 if the requester is not a participant.

### Narration feed structure

Each `BattleFeedEntry` contains:
```
{
  Key: "{battleId}:{turnIndex}:{sequence}",
  BattleId: Guid,
  TurnIndex: int,
  Sequence: int,
  Kind: "AttackHit" | "AttackDodge" | "AttackBlock" | "AttackNoAction" | "AttackCrit" | "BattleStart" | "BattleEndVictory" | "BattleEndDraw" | "BattleEndForfeit" | "DefeatKnockout" | "CommentaryFirstBlood" | "CommentaryBigHit" | "CommentaryNearDeath" | "CommentaryMutualMiss" | "CommentaryStalemate" | "CommentaryKnockout" | "CommentaryDraw",
  Severity: "Normal" | "Important" | "Critical",
  Tone: "Neutral" | "Aggressive" | "Defensive" | "Dramatic" | "System" | "Flavor",
  Text: string (human-readable narrative)
}
```

**Frontend consequence:** The `Kind`, `Severity`, and `Tone` fields enable the frontend to style, animate, or emphasize narrative entries differently. The `Text` is ready to display. Entries are ordered by `TurnIndex` then `Sequence`.

---

## 7. Realtime communication model

### Topology

```
[React Client] ←→ [BFF /battlehub (SignalR)] ←→ [Battle /battlehub (SignalR)]
```

- The frontend connects only to BFF's `/battlehub`
- BFF maintains a separate downstream SignalR connection per client to Battle's hub
- Events flow: Battle → BFF relay → frontend
- Actions flow: frontend → BFF hub → BFF relay → Battle hub

**Confirmed by code:** `BattleHubRelay` manages a `ConcurrentDictionary` of downstream `HubConnection` instances keyed by frontend connection ID. Each downstream connection registers typed event handlers that relay events back to the frontend via `IFrontendBattleSender` (which uses `IHubContext<BattleHub>`).

### Transport

- SignalR with JSON protocol
- Enums serialized as strings (`JsonStringEnumConverter`)
- WebSocket transport preferred; SignalR will negotiate fallback if needed

### Authentication for SignalR

- JWT passed as `?access_token=<token>` query parameter on the connection URL
- BFF extracts this token and uses it for both authentication and downstream forwarding
- The downstream Battle hub connection also uses this token for authorization

### Connection lifecycle

1. Frontend establishes SignalR connection to `/battlehub`
2. Frontend calls `JoinBattle(battleId)` — this creates the downstream connection and joins the battle group
3. Events flow for the duration of the battle
4. On battle end: BFF automatically cleans up the downstream connection
5. On frontend disconnect: `OnDisconnectedAsync` triggers `BattleHubRelay.DisconnectAsync` to clean up

### What happens on connection loss

**BFF → Battle connection lost:**
- The relay's `Closed` handler fires
- BFF sends `BattleConnectionLost` event to the frontend
- The downstream connection is removed from the relay

**Frontend → BFF connection lost:**
- SignalR's built-in reconnection applies (if configured on the client)
- On reconnect, the frontend must call `JoinBattle(battleId)` again to re-establish the downstream connection and get current state
- The server does not hold state for disconnected frontends; the battle continues server-side regardless

### Events not related to battle (no realtime for matchmaking)

There is **no SignalR channel for matchmaking**. Matchmaking status is poll-only via `GET /api/v1/queue/status`. The `/battlehub` connection is only relevant once a battle exists.

**Frontend consequence:** The frontend needs two different communication strategies:
- **Matchmaking:** HTTP polling loop (1-2s interval recommended)
- **Battle:** SignalR push with the connection opened when entering battle and closed when leaving

---

## 8. Player-facing capabilities

### Character lifecycle (onboarding)

The frontend must guide the player through a three-step onboarding:

```
[No character] → POST /api/v1/game/onboard → Draft
       Draft  → POST /api/v1/character/name → Named
       Named  → POST /api/v1/character/stats → Ready
```

The `OnboardingState` is returned as a string in BFF responses: `"Draft"`, `"Named"`, `"Ready"`, `"Unknown"`.

**What each screen/step needs:**

1. **Onboarding / first visit:** Call `POST /api/v1/game/onboard`. If the character already exists, the endpoint is idempotent and returns the existing character.

2. **Name selection:** Call `POST /api/v1/character/name` with `{ Name: string }`. Validation: 3-16 characters. Server enforces global uniqueness (case-insensitive). Frontend should show name-taken errors from the 409 response.

3. **Stat allocation:** Call `POST /api/v1/character/stats` with `{ ExpectedRevision, Strength, Agility, Intuition, Vitality }`. The `ExpectedRevision` must match the character's current revision (optimistic concurrency). Initial stats are 3/3/3/3 with 3 unspent points. Frontend must track the revision from the last response and send it with each allocation request.

### Character data available to the frontend

Via `GET /api/v1/game/state` or individual endpoints:

| Field | Source | Notes |
|-------|--------|-------|
| `CharacterId` | BFF composition | Internal ID |
| `OnboardingState` | BFF mapping | "Draft" / "Named" / "Ready" |
| `Name` | Players | null if Draft |
| `Strength`, `Agility`, `Intuition`, `Vitality` | Players | Base stats (start at 3 each) |
| `UnspentPoints` | Players | Available allocation points |
| `Revision` | Players | Required for stat allocation optimistic concurrency |
| `TotalXp` | Players | Cumulative experience |
| `Level` | Players | Derived from XP via leveling formula |

### What is NOT available to the frontend today

- **Win/loss record:** `Wins` and `Losses` exist in the domain model and `CharacterStateResult` but are **not exposed** in `MeResponse` or `CharacterResponse`. The BFF does not surface these. **(Inferred gap — likely intentional omission or oversight.)**
- **Battle history list:** There is no endpoint to list past battles for a player. The battle feed endpoint requires a specific `battleId`.
- **Leaderboard / other players' profiles:** No endpoints exist to view other players' characters or rankings.
- **Character avatar / appearance:** No concept in the current model.

### Game state composition

`GET /api/v1/game/state` returns a composite response:

```
{
  Character: { ... } | null,
  QueueStatus: { Status, MatchId, BattleId, MatchState } | null,
  IsCharacterCreated: boolean,
  DegradedServices: ["players"] | ["matchmaking"] | null
}
```

**Frontend consequence:** This is the primary "load screen" endpoint. The frontend should call it on app load to determine:
- Whether the player has a character and what state it's in
- Whether the player is currently in queue or has an active match
- Whether any backend services are degraded

If `DegradedServices` is non-null, the frontend should show a degraded UI (e.g., "Matchmaking temporarily unavailable") rather than failing entirely.

---

## 9. Error handling, reconnection, and recovery expectations

### HTTP error format

All BFF errors follow a consistent structure:

```json
{
  "error": {
    "code": "error_code_string",
    "message": "Human-readable message",
    "details": {
      "traceId": "..."
    }
  }
}
```

**Error codes the frontend should handle:**

| Code | HTTP Status | Meaning | Frontend action |
|------|-------------|---------|----------------|
| `service_unavailable` | 503 | Downstream service unreachable | Show retry / degraded state |
| `character_not_found` | 404 | Character doesn't exist | Redirect to onboarding |
| `character_not_ready` | — | Character exists but not Ready | Redirect to appropriate onboarding step |
| `already_in_queue` | 409 | Player already has active match | Show match status instead |
| `not_in_queue` | — | Tried to leave queue while not queued | No-op / ignore |
| `invalid_request` | 400 | Validation failure | Show field-level errors |
| `unauthorized` | 401 | Missing or invalid JWT | Redirect to login |
| `internal_error` | 500 | Unhandled server error | Show generic error with trace ID |

### Validation errors (400)

For endpoints with FluentValidation, the 400 response includes grouped errors:

```json
{
  "errors": {
    "Name": ["Name must be between 3 and 16 characters"],
    "Strength": ["Strength must be greater than or equal to 0"]
  }
}
```

### Battle hub errors

Hub method errors surface as `HubException` on the client. These are unstructured string messages (no error codes). The frontend should catch these and display a generic error.

### Reconnection strategy

**SignalR (battle):**
1. Configure SignalR client with automatic reconnection (exponential backoff)
2. On reconnect, call `JoinBattle(battleId)` to re-establish the relay and get current state
3. The returned snapshot contains the current phase, HP values, turn index — use it to resync the UI
4. If the battle ended during disconnection, the snapshot will show `Phase: Ended` with the result

**HTTP (matchmaking polling):**
- If a poll fails, retry after a short delay
- If multiple polls fail, show a connectivity warning
- Resume polling when connectivity is restored

**App-level recovery (page refresh / reopen):**
1. Call `GET /api/v1/game/state` to determine current state
2. If `QueueStatus.Status == "Matched"` with a `BattleId`, reconnect to battle
3. If `QueueStatus.Status == "Searching"`, resume polling
4. If no active queue/match, show lobby

### What happens during disconnection

**Matchmaking:**
- Queue entry persists server-side for up to 30 minutes (Redis TTL)
- If a match is found during disconnection, it proceeds — the match and battle are created
- On reconnect, `GET /api/v1/queue/status` will show the matched state
- If the queue TTL expires, the player is silently removed; next status check returns `Idle`

**Battle:**
- Battle continues on the server regardless of client connection
- Turns that pass without action from a disconnected player are resolved as `NoAction`
- After enough consecutive mutual no-actions, the battle ends with `DoubleForfeit`
- If only one player disconnects, the connected player can still win by attacking while the disconnected player takes no actions
- On reconnect, `JoinBattle` returns full current state; the client can resume

### Server-side recovery (transparent to client)

The Battle service has recovery workers that handle:
- **Stuck-in-Resolving:** Retries resolution if a turn got stuck
- **Orphaned battles:** Force-ends battles where state was lost
- **Stale matches:** Timeouts for matches where battle creation or completion never happened

These are transparent to the client but mean that edge cases (server crashes during resolution) will eventually resolve rather than leaving the client stuck.

---

## 10. Effective frontend contract summary

### Screens/flows directly supported by current backend

| Screen/Flow | Backend support | Status |
|-------------|----------------|--------|
| Login/authentication | Keycloak JWT | Supported (external to backend) |
| Registration | None | **Not supported** — requires Keycloak config or new endpoint |
| Character creation (onboarding) | `POST /api/v1/game/onboard` | Fully supported |
| Name selection | `POST /api/v1/character/name` | Fully supported |
| Stat allocation | `POST /api/v1/character/stats` | Fully supported |
| Lobby / home screen | `GET /api/v1/game/state` | Supported (character + queue status) |
| Join matchmaking | `POST /api/v1/queue/join` | Fully supported |
| Matchmaking waiting screen | `GET /api/v1/queue/status` (poll) | Supported (poll-based) |
| Cancel matchmaking | `POST /api/v1/queue/leave` | Fully supported |
| Battle screen (live) | `/battlehub` SignalR | Fully supported |
| Battle result screen | `BattleEnded` event + `GET /api/v1/battles/{id}/feed` | Fully supported |
| Battle replay/history (specific battle) | `GET /api/v1/battles/{id}/feed` | Supported |
| Battle history list | None | **Not supported** — no endpoint to list past battles |
| Profile / stats view | `GET /api/v1/game/state` | Partially — win/loss not exposed |
| Leaderboard | None | **Not supported** |
| Settings / account management | None | **Not supported** |

### User actions supported

| User action | How it works |
|-------------|-------------|
| Log in | External Keycloak flow → JWT |
| Create character | `POST /api/v1/game/onboard` (idempotent) |
| Choose name | `POST /api/v1/character/name` (one-time, Draft→Named) |
| Allocate stats | `POST /api/v1/character/stats` (repeatable when points available) |
| Enter matchmaking | `POST /api/v1/queue/join` |
| Cancel matchmaking | `POST /api/v1/queue/leave` |
| Join battle | SignalR `JoinBattle(battleId)` |
| Submit turn action | SignalR `SubmitTurnAction(battleId, turnIndex, actionPayload)` |
| Do nothing (let turn expire) | No action needed; server resolves as NoAction |
| View battle feed after match | `GET /api/v1/battles/{id}/feed` |
| Re-allocate stats (after level-up) | `POST /api/v1/character/stats` with new points |

### State the frontend must model

1. **Auth state:** logged in / logged out / token expired
2. **Onboarding state:** no character / Draft / Named / Ready
3. **Lobby state:** idle / searching / matched / battle-in-progress
4. **Battle state:** connecting / arena-open / turn-open (with deadline) / resolving / ended
5. **Turn state:** awaiting input / submitted / resolved
6. **HP state:** player HP and opponent HP (updated via push events)
7. **Narration state:** ordered feed entries accumulating during battle

### Assumptions the frontend may safely make

- The server is authoritative for all game state; the frontend never resolves combat
- Battle events arrive in a reliable order within a turn (damage → resolution → next turn → state update)
- `BattleStateUpdated` is the authoritative sync point after each turn
- Character revision increments monotonically; the latest revision is always the most current
- `JoinBattle` always returns the current battle state, even mid-battle or after battle end
- Queue status transitions are monotonic: Idle → Searching → Matched; going backwards only happens via explicit cancellation or timeout
- Narration text is ready to display without client-side processing

### Assumptions the frontend should NOT make

- **Do not assume real-time matchmaking notifications.** Match found is poll-based only.
- **Do not assume the server will error on invalid turn actions.** Invalid actions are silently treated as no-action.
- **Do not assume stable SignalR connection.** The connection can drop; the frontend must handle reconnection and state resync.
- **Do not assume battle events arrive atomically.** Individual events within a turn arrive sequentially; the frontend may briefly show intermediate states.
- **Do not assume `BattleFeedUpdated` arrives before the user needs to act on the next turn.** Narration is generated best-effort and may lag behind mechanical events.
- **Do not assume the `actionPayload` format is validated client-side sufficiently.** The server accepts any string; only valid JSON with valid zone names counts as a real action.
- **Do not cache battle state across sessions.** Always resync via `JoinBattle` or `GET /api/v1/game/state` after any interruption.

---

## 11. Frontend-relevant risks, gaps, and ambiguities

### Confirmed gaps

| # | Gap | Impact | Severity |
|---|-----|--------|----------|
| G1 | **No registration flow.** Keycloak account creation is not supported by the backend. | Frontend cannot onboard new users without external registration mechanism. | High (MVP blocker if self-registration required) |
| G2 | **No battle history list endpoint.** Frontend can view a specific battle's feed but cannot list past battles. | No match history screen possible. | Medium |
| G3 | **Win/loss record not exposed.** `Wins`/`Losses` exist in domain but not in API responses. | No profile stats display possible. | Low-Medium |
| G4 | **No matchmaking push notifications.** Poll-based only. | Slightly higher latency for match-found notification; mobile battery concern if polling interval too aggressive. | Low (acceptable for MVP) |
| G5 | **No player search or leaderboard.** | No social features possible. | Low (not MVP) |

### Ambiguities requiring clarification

| # | Ambiguity | Why it matters | Where to look |
|---|-----------|---------------|---------------|
| A1 | **Turn deadline interpretation.** `DeadlineUtc` is provided, but is there a grace period the frontend should account for? The server allows 1-second buffer for late submissions. | If the frontend cuts off input exactly at deadline, the user might have 1 extra second available. If it doesn't, submissions near the deadline might be silently rejected as late. | `ActionIntakeService.cs` — 1-second deadline buffer |
| A2 | **Name change after initial set.** `SetNameOnce` method name and `NameAlreadySet` error suggest names are permanent. Is this intentional for MVP? | Frontend must decide whether to show "choose wisely" messaging. | `Character.SetNameOnce()` — confirmed one-time |
| A3 | **Stat reallocation model.** Stats can only be added, never removed or reset. `AllocatePoints` adds to existing stats. | The frontend stat allocation UI must be "spend points" not "distribute points." There's no respec. | `Character.AllocatePoints()` — additive only |
| A4 | **BFF `OnboardingState` mapping.** BFF maps integer states to strings: 0→"Draft", 1→"Named", 2→"Ready", else→"Unknown". Is "Unknown" a valid state the frontend should handle? | Edge case UI handling. | `OnboardingStateMapper.ToDisplayString()` |
| A5 | **Concurrent stat allocation conflict.** If two browser tabs allocate stats simultaneously, one will get a revision mismatch (409). How should the frontend handle this? | UX for optimistic concurrency conflict. | `AllocateStatPointsHandler` — revision check |
| A6 | **Battle rejoin after it ended.** If the client reconnects after the battle ended, `JoinBattle` returns a snapshot with `Phase: Ended`. Does the client receive the `BattleEnded` event, or only the snapshot? | Determines whether the frontend should check snapshot phase immediately after join. | `BattleHubRelay.JoinBattleAsync` — returns snapshot only; no replay of missed events |

### Implicit assumptions hidden in code

| # | Assumption | Risk if frontend gets it wrong |
|---|-----------|-------------------------------|
| I1 | `actionPayload` is a JSON **string** parameter, not a structured object. The hub method signature is `SubmitTurnAction(Guid battleId, int turnIndex, string actionPayload)`. | If the frontend passes a JS object instead of `JSON.stringify(object)`, the server will receive `[object Object]` or similar, which will be treated as NoAction. |
| I2 | Zone names are exact enum strings: `"Head"`, `"Torso"`, `"LeftArm"`, `"RightArm"`, `"LeftLeg"`, `"RightLeg"`. Case-sensitive. | Mismatched casing or naming → NoAction. |
| I3 | `ExpectedRevision` for stat allocation must match the character's current `Revision` exactly. After each successful allocation, the returned `Revision` is the new expected value. | Stale revision → 409 Conflict. Frontend must track revision from every response. |
| I4 | The `/battlehub` SignalR URL expects the JWT as `?access_token=<token>` query parameter, not as an Authorization header. This is a SignalR convention but easy to misconfigure. | Connection will be rejected (401) if token not provided correctly. |
| I5 | `BattleFeedUpdated` events during live battle use the same `BattleFeedEntry` structure as the HTTP feed endpoint. The `Key` field (`{battleId}:{turnIndex}:{sequence}`) can be used for deduplication if the client replays the feed. | Without deduplication, a client that receives live events and then fetches the full feed would show duplicate entries. |

---

## 12. Questions that should be answered before frontend architecture

### Product/UX decisions needed

1. **Registration flow:** Will users self-register via Keycloak's built-in registration page, or does the product require a custom registration form? This affects whether the frontend needs a registration screen or just a redirect.

2. **Matchmaking polling UX:** Is 1-2 second polling acceptable, or should the product push for a server-sent event / SignalR channel for matchmaking notifications? (Backend change required for push.)

3. **Name permanence:** Names are one-time-set in the current backend. Is this the intended product behavior? If not, a backend change is needed.

4. **Stat respec:** Stats are additive-only (no reset). Is this intended? If a respec feature is desired, the backend needs a new endpoint.

5. **Win/loss display:** Should the frontend show battle record? If yes, the BFF response needs to include `Wins`/`Losses` from the domain model.

6. **Battle history:** Should the frontend show a list of past battles? If yes, a new endpoint is needed.

7. **Turn deadline display:** Should the frontend show the exact server deadline, or apply a local buffer (e.g., show 1 second less to avoid edge-case late submissions)?

8. **Battle result screen content:** After a battle ends, what should the frontend show? The narration feed is available. Should it also show stat changes, XP gained, level-up? (XP/level changes happen asynchronously via messaging — the frontend won't know the new XP immediately after the battle ends.)

### Technical decisions needed

9. **SignalR reconnection policy:** What backoff strategy? How many retries before showing "connection lost"? Should the frontend attempt to auto-rejoin the battle on reconnect?

10. **State management approach for battle:** The battle produces many sequential events. Should the frontend use a reducer/state machine pattern, or update individual state slices per event?

11. **Narration feed integration:** Should narration entries be displayed inline with combat results (chat-style log) or as a separate panel? The `Kind`, `Severity`, and `Tone` fields support rich styling but the approach affects component architecture.

12. **Optimistic UI for turn submission:** Should the frontend show a "submitted" state immediately on action selection, or wait for server acknowledgment? (Note: `SubmitTurnAction` is fire-and-forget with no response; the next signal is `TurnResolved` when both players have submitted or the deadline passes.)

13. **Post-battle XP sync:** After `BattleEnded`, how soon should the frontend refresh character data? The XP update happens asynchronously (via `BattleCompleted` event consumed by Players service). A small delay is expected. The frontend may need to poll `GET /api/v1/game/state` after a short delay to get updated XP/level.

---

## 13. Recommended next step

### Immediate actions (before frontend architecture)

1. **Resolve product questions (Section 12, items 1-8).** These directly affect screen inventory, navigation flow, and feature scope. Without answers, frontend architecture will be based on assumptions that may need revision.

2. **Validate against the React mockup.** Compare the screens in the existing Figma Make mockup against the capabilities documented in this revision. Identify:
   - Screens that are fully backed by the current API
   - Screens that require missing endpoints (battle history, leaderboard)
   - Screens that assume behaviors the backend doesn't support (e.g., stat respec, name change)
   - Any interaction patterns in the mockup that conflict with the backend contract (e.g., assuming push-based matchmaking)

3. **Decide on registration strategy.** This is the only MVP-blocking gap. Either configure Keycloak self-registration, use Keycloak's hosted registration page, or plan a custom registration endpoint.

### After product alignment

4. **Produce a frontend client specification** based on this revision + product decisions. This spec should define:
   - Screen inventory with API mappings
   - State machine for the complete user journey
   - Transport layer requirements (HTTP client, SignalR client, polling strategies)
   - Error handling catalog
   - Reconnection behavior specification

5. **Then proceed to frontend architecture** (component structure, state management, routing, transport layer design) with the client spec as input.

### Backend changes to consider requesting

| Change | Priority | Reason |
|--------|----------|--------|
| Expose `Wins`/`Losses` in BFF character response | Low | Enables profile stats display |
| Add battle history list endpoint | Medium | Enables match history screen |
| Add matchmaking push notification (optional) | Low | Improves UX, not MVP-critical |
| Clarify/document turn deadline grace period | Low | Prevents frontend timing bugs |

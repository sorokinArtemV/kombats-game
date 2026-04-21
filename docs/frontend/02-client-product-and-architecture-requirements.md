# Kombats Frontend Client Product and Architecture Requirements

## Changelog (2026-04-16 re-validation)

**What changed:**
- Chat is no longer out of scope. Added full chat requirements section (Section 9: REQ-CH-1 through REQ-CH-12)
- Added player card / other-player profile requirements (Section 10: REQ-PC-1 through REQ-PC-3)
- Updated core player flow (Section 4) to include chat connection on lobby entry
- Corrected battle zone values from 6-zone to 5-zone ring model in REQ-B3 and REQ-B4
- Corrected zone parsing as case-insensitive in REQ-B3
- Added block zone adjacency constraint in REQ-B3 and REQ-B4
- Updated DES-3 (win/loss): partially resolved via player card endpoint
- Updated lobby requirements (REQ-L1) to include chat panel and online players
- Updated state modeling (Section 12) with chat and presence states
- Updated inputs table with Chat service references
- Renumbered later sections to accommodate new content

**Old assumptions invalidated:**
- "The client does NOT need to provide chat or social features" -- chat is now fully implemented and in scope
- "Out of scope: chat, social features" -- removed from out-of-scope list
- Battle zones were listed as 6 body-part zones -- corrected to 5-zone ring topology
- Zone parsing was stated as case-sensitive -- corrected to case-insensitive

---

## 1. Purpose

This document defines the product requirements and architecture-level constraints for the first production-capable version of the Kombats frontend client.

It serves as the source of truth for:
- frontend feasibility validation
- frontend client specification
- frontend architecture design
- implementation planning

This document converts the backend integration contract (documented in `01-backend-revision-for-frontend.md`) into actionable frontend requirements. It does not propose implementation details, library choices, or folder structure.

**Scope:** The complete core game flow from authentication through battle and post-battle, plus chat (global and direct messaging) and player profile viewing. This is not a throwaway prototype. It is the first version intended for production use, structured for long-term maintainability.

**Out of scope:** Localization/i18n, ranked leaderboards, battle history list, settings/account management, spectator mode.

### Requirement classification

This document uses four classification levels. When reading requirements, assume **hard requirement** unless otherwise marked.

| Level | Meaning | Keyword signals |
|-------|---------|-----------------|
| **Hard requirement** | Non-negotiable for first version. Driven by backend contract, game integrity, or core product flow. | MUST, MUST NOT |
| **Product preference** | Desired behavior that reflects product intent. May be adjusted during architecture/implementation if trade-offs require it. | SHOULD, preferred, expected |
| **Backend-constrained** | Behavior dictated by the current backend contract. Not a product choice; changing it requires a backend change. | Noted inline as "backend-constrained" |
| **Validation point** | Open question that must be resolved before or during feasibility. | See Sections 15 and 16 |

---

## 2. Inputs and source of truth

| Input | Location | Role |
|-------|----------|------|
| Backend revision for frontend | `docs/frontend/01-backend-revision-for-frontend.md` | Authoritative backend integration contract |
| BFF source code | `src/Kombats.Bff` | Ground truth for all client-facing endpoints and SignalR hubs |
| Players service domain | `src/Kombats.Players/Kombats.Players.Domain` | Character entity, onboarding states, leveling policy |
| Battle realtime contracts | `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts` | SignalR event payload definitions |
| Battle domain | `src/Kombats.Battle/Kombats.Battle.Domain` | BattleZone enum, combat model |
| Chat service | `src/Kombats.Chat` | Chat domain, application, infrastructure, API |
| Figma mockup prototype | `design/` | Visual direction reference (not architectural authority) |
| Architecture docs | `.claude/docs/architecture/` | Backend architecture decisions |

The backend revision document is the primary input. The codebase is referenced for clarification. The Figma mockup is a visual concept reference; it does not define client architecture or product behavior, but may inform visual direction.

---

## 3. Product goal

Deliver a frontend client that supports the complete core game loop with social features:

**Register/Login -> Onboard -> Lobby (with chat) -> Queue -> Battle -> Result -> Lobby**

The client must:
- feel like a real product, not a developer tool
- handle all expected edge cases (disconnection, reconnection, state recovery)
- be structured so that a complete visual reskin is possible without rewriting gameplay logic, state management, or backend integration
- be maintainable and extensible for future feature additions

The client does NOT need to:
- implement custom registration or login forms (auth pages are hosted by Keycloak; the client redirects to them)
- display battle history lists or ranked leaderboards
- implement spectator mode

---

## 4. Core player flow

The following is the canonical player journey. Each step is a hard requirement unless marked otherwise.

```
1. Player opens the app
2. App checks auth state
   |-- Not authenticated -> show unauthenticated landing with Register and Login entry points
   |   |-- Register -> redirect to Keycloak registration page
   |   |   |-- Preferred: after registration, user returns authenticated -> proceed to step 3
   |   |   +-- Fallback: if realm config requires separate login after registration -> redirect to login
   |   +-- Login -> redirect to Keycloak login page -> return authenticated -> proceed to step 3
   +-- Authenticated -> proceed
3. App calls GET /api/v1/game/state to load current state
4. App evaluates recovery conditions (in priority order):
   a. Active battle exists (QueueStatus has BattleId + Matched status)
      -> reconnect to battle immediately
   b. Player is in matchmaking queue (QueueStatus.Status == Searching)
      -> resume matchmaking screen with polling
   c. Onboarding incomplete (OnboardingState != Ready)
      -> force onboarding at the correct step
   d. No special state
      -> show lobby
5. Onboarding (first-time only, hard gate):
   a. Draft state -> name selection screen
   b. Named state -> initial stat allocation screen
   c. Ready state -> proceed to lobby
6. Lobby:
   - Display character info (name, stats, level, XP)
   - Display unspent stat points indicator (if any)
   - Provide "Enter Queue" action
   - Provide stat allocation access (if unspent points > 0)
   - Connect to /chathub and join global chat
   - Display online players list
   - Display global chat feed
   - Provide access to direct messaging
7. Matchmaking:
   - Poll GET /api/v1/queue/status at 1-2 second intervals
   - Show searching state with cancel option
   - On match found (Status: Matched with BattleId):
      -> automatically transition to battle
8. Battle:
   - Connect to /battlehub via SignalR
   - Call JoinBattle(battleId) for initial state
   - Render server-authoritative state
   - Accept turn input and submit via SubmitTurnAction
   - Process push events for state updates
   - On BattleEnded -> transition to result screen
9. Result:
   - Display battle outcome (win/loss/draw)
   - Display battle narration feed
   - Provide "Finish Battle" action -> return to lobby
10. Post-battle lobby:
    - Refresh character state (XP, level, unspent points may have changed)
    - If level-up occurred, show notification
    - Player can re-enter queue
    - Reconnect to chat if disconnected during battle
```

---

## 5. Startup and recovery requirements

### REQ-S1: Startup state resolution

On every app launch or page refresh, the client MUST:
1. Verify authentication (valid, non-expired JWT)
2. Call `GET /api/v1/game/state`
3. Route the player to the correct screen based on the response

This is the single entry point for all recovery. The client must not assume any prior state survives a page refresh.

### REQ-S2: Active battle reconnection

If `GET /api/v1/game/state` returns a `QueueStatus` with `Status: "Matched"` and a `BattleId`, the client MUST immediately connect to the battle hub and call `JoinBattle(battleId)`.

The returned `BattleSnapshotRealtime` determines the battle's current phase:
- `Ended` -> show result screen
- `TurnOpen` -> show battle screen at current turn
- `ArenaOpen` / `Resolving` -> show battle screen in appropriate waiting state

The client MUST NOT show the lobby or allow navigation away from the battle until the battle is in `Ended` phase and the player has acknowledged the result.

### REQ-S3: Matchmaking recovery

If `GET /api/v1/game/state` returns `QueueStatus.Status: "Searching"`, the client MUST resume the matchmaking screen and restart polling.

### REQ-S4: Onboarding recovery

If `GET /api/v1/game/state` returns a character with `OnboardingState` other than `"Ready"`, the client MUST force the player into the correct onboarding step. No other navigation is permitted until onboarding completes.

### REQ-S5: Degraded service handling

If `GET /api/v1/game/state` returns a non-null `DegradedServices` array, the client MUST:
- Still display available information
- Clearly indicate which capabilities are unavailable
- Not crash or show a blank screen

### REQ-S6: Authentication failure recovery

If any API call returns 401, the client MUST:
- Clear local auth state
- Return the player to the unauthenticated landing (Register / Login)
- After re-authentication, repeat startup state resolution (REQ-S1)

### REQ-S7: Token lifecycle

The client is responsible for:
- Storing the JWT access token securely
- Refreshing the token before expiry using the Keycloak refresh token flow
- Providing the token on all HTTP requests (`Authorization: Bearer`) and SignalR connections (`?access_token=`)

### REQ-S8: Register and Login as client entry points

The client MUST expose both Register and Login as user-facing entry points for unauthenticated users. Both redirect to Keycloak-hosted pages; the client does not implement custom auth forms.

- **Login:** Redirects to the Keycloak login page. After successful login, the user returns to the client authenticated.
- **Register:** Redirects to the Keycloak registration page. After successful registration, the user preferably returns to the client already authenticated. If the Keycloak realm configuration does not support immediate authenticated return (e.g., requires email verification or a separate login step), the client falls back to redirecting the user to login.

Registration and login are part of the client's user journey, even though the auth pages themselves are hosted externally.

---

## 6. Onboarding requirements

### REQ-O1: Onboarding is a hard gate

A player whose `OnboardingState` is not `"Ready"` MUST NOT be able to:
- View the lobby
- Enter matchmaking
- Use chat
- Access any game feature

The client MUST force the onboarding flow and prevent any navigation away from it.

### REQ-O2: Onboarding steps

Onboarding consists of two sequential steps:

**Step 1: Name selection** (Draft -> Named)
- Input: character name (3-16 characters)
- API: `POST /api/v1/character/name` with `{ Name: string }`
- Success: character transitions to `Named` state
- Error cases:
  - Name too short/long -> show validation error
  - Name already taken -> show "name is taken" error (409 from server)
- The name is permanent. The client SHOULD communicate this clearly before submission.

**Step 2: Initial stat allocation** (Named -> Ready)
- API: `POST /api/v1/character/stats` with `{ ExpectedRevision, Strength, Agility, Intuition, Vitality }`
- Starting stats: 3/3/3/3 with 3 unspent points
- Allocation is additive: the values sent are the points to ADD, not the target totals
- `ExpectedRevision` must match the character's current revision (optimistic concurrency)
- At least one point must be allocated to proceed
- Success: character transitions to `Ready` state

### REQ-O3: Onboarding step recovery

If the player closes the browser mid-onboarding, reopening the app MUST return them to the exact unfinished step:
- `OnboardingState: "Draft"` -> name selection
- `OnboardingState: "Named"` -> stat allocation

### REQ-O4: Character identity is server-derived

The client MUST NOT ask the player to provide a user ID. Identity is always derived from the JWT. The `POST /api/v1/game/onboard` call is idempotent and creates or returns the existing character for the authenticated user.

---

## 7. Lobby and matchmaking requirements

### REQ-L1: Lobby screen

The lobby MUST display:
- Character name
- Action to enter matchmaking queue
- Global chat feed (via `/chathub` connection)
- Online players list

The lobby SHOULD display:
- Character level and current XP
- Current stats (Strength, Agility, Intuition, Vitality)
- Unspent stat points count and/or visual indicator when unspent points are available
- Player's own win/loss record (available via `GET /api/v1/players/{ownId}/card` as a workaround; see DES-3)

### REQ-L2: Stat allocation from lobby

If the character has unspent points (`UnspentPoints > 0`), the lobby MUST provide access to a stat allocation interface. This uses the same `POST /api/v1/character/stats` endpoint as onboarding.

Unspent points from level-ups MUST NOT block any gameplay action. The player can queue, battle, and play normally with unspent points. This is a soft reminder, not a gate.

### REQ-L3: Enter matchmaking

Preconditions for entering the queue:
- `OnboardingState` is `"Ready"` (hard requirement)
- No active battle (hard requirement)

API: `POST /api/v1/queue/join`

Possible responses:
- Success -> transition to matchmaking/searching state
- 409 (already matched) -> the response contains match details; transition to battle preparation

### REQ-L4: Matchmaking searching state

While searching:
- The client MUST poll `GET /api/v1/queue/status` periodically (1-2 second intervals preferred)
- The client MUST show a searching indicator
- The client MUST provide a cancel action (`POST /api/v1/queue/leave`)
- Polling is HTTP-based; there is no push notification for matchmaking (backend-constrained)

### REQ-L5: Matchmaking state transitions

The client must handle these status transitions:

| Status | Action |
|--------|--------|
| `Searching` | Continue polling, show searching state |
| `Matched` with `BattleId` | Stop polling, transition to battle |
| `Matched` without `BattleId` | Show "preparing battle" state, continue polling until `BattleId` appears |
| `Idle` / `NotQueued` (was previously Searching) | Match search expired (30-minute TTL); inform player, return to lobby |
| `TimedOut` (MatchState) | Battle creation failed; inform player, allow re-queue |

### REQ-L6: Cancel matchmaking

`POST /api/v1/queue/leave` may return:
- `LeftQueue: true` -> return to lobby
- `LeftQueue: false` with match details -> a match was found before cancellation; transition to battle

### REQ-L7: Automatic battle transition

The transition from matchmaking to battle MUST be automatic. When the client detects `Status: "Matched"` with a valid `BattleId`, it MUST immediately begin the battle connection flow without requiring additional user action.

---

## 8. Battle requirements

### REQ-B1: Battle connection

1. Open a SignalR connection to `/battlehub` with JWT as `?access_token=<token>` query parameter
2. Call `JoinBattle(battleId)` to receive `BattleSnapshotRealtime`
3. Use the snapshot to initialize battle UI state

### REQ-B2: Server-authoritative state model

The server is the sole authority on battle state. The client MUST:
- Never locally compute combat outcomes
- Treat `BattleStateUpdated` as the authoritative sync point after each turn
- Not cache battle state across sessions; always resync via `JoinBattle` after any interruption

### REQ-B3: Turn input and submission

During `TurnOpen` phase:
- Display a countdown timer based on `DeadlineUtc`
- Allow the player to select one attack zone and two block zones (primary + secondary)
- Submit via `SubmitTurnAction(battleId, turnIndex, actionPayload)`

**Zone model (backend-constrained):** There are **5 zones in a ring topology**: `Head`, `Chest`, `Belly`, `Waist`, `Legs`. The ring wraps (`Legs` is adjacent to `Head`).

**Block zone adjacency constraint (backend-constrained):** The two block zones must be an adjacent pair in the ring. Valid pairs:
- Head <-> Chest
- Chest <-> Belly
- Belly <-> Waist
- Waist <-> Legs
- Legs <-> Head

The frontend MUST present block zone selection as **adjacent pair selection** (5 valid patterns), not arbitrary two-zone selection. Non-adjacent block pairs are silently treated as `NoAction` by the server.

Backend-constrained implementation constraints:
- `actionPayload` MUST be a JSON **string**, not a structured object. The client must `JSON.stringify()` the action object before passing it to the hub method.
- Zone values are enum strings: `"Head"`, `"Chest"`, `"Belly"`, `"Waist"`, `"Legs"`. Zone parsing is case-insensitive on the server, but the frontend should use canonical casing for consistency.
- Invalid or late submissions are silently treated as `NoAction` by the server; the client receives no error (backend-constrained; the server does not return validation errors for turn actions)

### REQ-B4: Client-side action validation

Because the server silently degrades invalid actions to no-ops, the client MUST validate actions locally before submission:
- All three zones (attack, blockPrimary, blockSecondary) must be selected
- Zone values must be valid: `Head`, `Chest`, `Belly`, `Waist`, `Legs`
- **Block zones must be an adjacent pair in the ring topology**
- Submission must occur before the deadline

The client SHOULD apply a small local buffer (e.g., subtract 1-2 seconds from the displayed deadline) to reduce edge-case late submissions. The server has a 1-second grace buffer (backend-constrained), but the client should not rely on it.

### REQ-B5: Turn submission is fire-and-forget

`SubmitTurnAction` has no return value (backend-constrained). The client receives no confirmation of submission. The next signal the client receives is `TurnResolved` (when both players have submitted or the deadline passes).

The client SHOULD:
- Show a local "submitted" indicator immediately after calling `SubmitTurnAction`
- Disable further input for the current turn after submission
- Treat the absence of an error as implicit acceptance

### REQ-B6: Event processing

The client MUST handle the following SignalR events during battle:

| Event | Required handling |
|-------|-------------------|
| `BattleReady` | Initialize battle display |
| `TurnOpened` | Start turn timer, enable input |
| `TurnResolved` | Display turn results (actions taken, combat outcomes) |
| `PlayerDamaged` | Update HP display (can be used for immediate animation before full resolution) |
| `BattleStateUpdated` | Authoritative state sync; reconcile all displayed state |
| `BattleEnded` | Transition to result screen |
| `BattleFeedUpdated` | Append narration entries to battle log |
| `BattleConnectionLost` | Show connection error, attempt reconnection |

### REQ-B7: Event ordering

Within a turn resolution, events arrive in this order:
1. `PlayerDamaged` (0-2 instances)
2. `TurnResolved`
3. `TurnOpened` (next turn) OR `BattleEnded`
4. `BattleStateUpdated`
5. `BattleFeedUpdated` (may arrive slightly delayed)

The client MUST handle intermediate states where only some events have arrived. It MUST NOT wait for `BattleFeedUpdated` before allowing the player to act on the next turn.

### REQ-B8: Battle end handling

The client must handle these end reasons:

| Reason | Display |
|--------|---------|
| `Normal` | Show winner/loser |
| `DoubleForfeit` | Show draw due to mutual inactivity |
| `Timeout` | Show draw/timeout |
| `SystemError` | Show error message, return to lobby |
| Other (`Cancelled`, `AdminForced`, `Unknown`) | Show generic "battle ended" message |

### REQ-B9: Battle reconnection

If the SignalR connection drops during battle:
1. The client MUST attempt automatic reconnection with exponential backoff
2. On reconnect, the client MUST call `JoinBattle(battleId)` again to get current state
3. The returned snapshot replaces all local state
4. If the battle ended during disconnection, the snapshot will show `Phase: Ended`; transition to result screen

The battle continues server-side regardless of client connection. Turns where the player is disconnected resolve as `NoAction`.

### REQ-B10: Mid-battle browser close

If the player closes the browser during an active battle:
- The battle continues server-side
- Reopening the app triggers startup state resolution (REQ-S1)
- `GET /api/v1/game/state` will show the active battle
- The client reconnects the player into the battle (REQ-S2)

The player MUST be returned to the battle, not the lobby.

### REQ-B11: Narration feed

During battle, `BattleFeedUpdated` events deliver narration entries with:
- `Kind` (attack result type, commentary type, battle event type)
- `Severity` (Normal, Important, Critical)
- `Tone` (Neutral, Aggressive, Defensive, Dramatic, System, Flavor)
- `Text` (human-readable, ready to display)

The client SHOULD display narration entries as part of the battle experience. The `Kind`, `Severity`, and `Tone` fields SHOULD be used to differentiate visual presentation (e.g., highlighting critical hits, de-emphasizing system messages). The exact placement and formatting of narration is a presentation concern, not a hard requirement.

### REQ-B12: Combat resolution details

`TurnResolved` includes per-direction attack details:
- Attack zone, block zones
- Outcome: `NoAction`, `Dodged`, `Blocked`, `Hit`, `CriticalHit`, `CriticalBypassBlock`, `CriticalHybridBlocked`
- Damage dealt

The client MUST display the outcome of each direction clearly. This data is sufficient for rendering combat results without relying on the narration system.

---

## 9. Chat requirements

### REQ-CH-1: Chat connection

On entering the lobby (after onboarding is complete), the client MUST:
1. Open a SignalR connection to `/chathub` with JWT as `?access_token=<token>` query parameter
2. Call `JoinGlobalChat()` to enter the global chat room
3. Use the response to populate initial state: last 50 messages, first 100 online players, total online count

### REQ-CH-2: Chat eligibility gate

Only players with `OnboardingState == "Ready"` can use chat (backend-constrained). The client MUST NOT attempt to connect to `/chathub` or call chat methods until onboarding is complete. Sending a message while not eligible returns a `ChatError` with code `not_eligible`.

### REQ-CH-3: Global chat

The client MUST:
- Display the global chat message feed
- Allow sending messages via `SendGlobalMessage(content)`
- Process `GlobalMessageReceived` events to append new messages in real time
- Validate message content locally: 1-500 characters, non-empty (backend-constrained limits)

The client SHOULD:
- Show sender display name and timestamp for each message
- Auto-scroll to new messages (with scroll-lock behavior when user has scrolled up)

### REQ-CH-4: Direct messaging

The client MUST:
- Allow initiating a DM with another player via `SendDirectMessage(recipientPlayerId, content)`
- Process `DirectMessageReceived` events to append incoming DMs
- Provide access to DM conversations (list via `GET /api/v1/chat/conversations`, messages via HTTP history endpoints)

The client SHOULD:
- Show a notification or visual indicator when a new DM arrives
- Allow navigating from the online players list to a DM conversation

Note: Conversations are created atomically on first DM. The frontend does not need a "create conversation" step.

### REQ-CH-5: Online players list

The client MUST:
- Display a list of currently online players (from `JoinGlobalChat()` response and `GET /api/v1/chat/presence/online`)
- Process `PlayerOnline` and `PlayerOffline` events to update the list in real time

The client SHOULD:
- Allow clicking on an online player to view their player card (REQ-PC-1)
- Allow clicking on an online player to start a DM conversation

### REQ-CH-6: Rate limit handling

When the server returns a `ChatError` with code `rate_limited`:
- The client MUST show a "slow down" message to the user
- The client SHOULD display a countdown based on the `RetryAfterMs` field
- The client SHOULD disable the send button until the rate limit window expires

Rate limits (backend-constrained):
- Global chat: 5 messages per 10 seconds
- Direct messages: 10 messages per 30 seconds

### REQ-CH-7: Chat error handling

The client MUST handle `ChatError` events:

| Code | Display |
|------|---------|
| `rate_limited` | "Slow down" with retry timer |
| `message_too_long` | "Message too long (max 500 characters)" |
| `message_empty` | "Message cannot be empty" |
| `recipient_not_found` | "Player not found" |
| `not_eligible` | "Complete onboarding to use chat" |
| `service_unavailable` | "Chat temporarily unavailable" |

### REQ-CH-8: Chat reconnection

If the `/chathub` connection drops:
1. The client MUST attempt automatic reconnection with exponential backoff
2. On reconnect, the client MUST call `JoinGlobalChat()` again to restore state
3. The response includes the last 50 messages for gap recovery
4. Presence is re-registered on the new connection

The client MUST show a visual indicator when the chat connection is lost and when it is restored.

### REQ-CH-9: Chat connection lost event

When the client receives a `ChatConnectionLost` event (BFF lost connection to Chat service):
- The client MUST show a connection error indicator
- The client MUST attempt to reconnect

### REQ-CH-10: Message history browsing

The client SHOULD support scrolling back through older messages:
- Global chat: `GET /api/v1/chat/conversations/{conversationId}/messages?before={timestamp}&limit=50`
- DMs: `GET /api/v1/chat/direct/{otherPlayerId}/messages?before={timestamp}&limit=50`

Pagination is cursor-based using the `before` parameter (ISO-8601 timestamp). Messages are returned newest-first.

### REQ-CH-11: Message deduplication

Chat messages have unique UUID v7 IDs. The client SHOULD use `MessageId` to deduplicate messages received via both live events and history fetches.

### REQ-CH-12: Chat during battle

**Product decision needed.** The chat connection lifecycle during battle is a product decision:
- **Option A:** Maintain `/chathub` connection during battle. Allows DM notifications during battle but adds complexity.
- **Option B:** Disconnect `/chathub` on battle entry, reconnect on lobby return. Simpler but no chat during battle.

The client MUST reconnect to `/chathub` when returning to the lobby after battle, regardless of which option is chosen.

---

## 10. Player card requirements

### REQ-PC-1: View another player's profile

The client MUST provide a way to view another player's public profile via `GET /api/v1/players/{playerId}/card`.

The player card displays:
- Display name
- Level
- Stats (Strength, Agility, Intuition, Vitality)
- Win/loss record

Access points for viewing a player card:
- From the online players list (click on a player)
- From a DM conversation (view the other participant's card)
- From battle (view opponent's card during or after battle -- product preference)

### REQ-PC-2: Player card response handling

- 200: Display the card
- 404: Show "Player not found"
- 401: Redirect to login (standard auth failure handling)

### REQ-PC-3: Player card does not block navigation

Viewing a player card MUST NOT block other actions. The card SHOULD be displayed as an overlay, panel, or inline element that can be dismissed. It MUST NOT navigate the user away from their current screen.

---

## 11. Post-battle requirements

### REQ-P1: Result screen

After `BattleEnded`, the client MUST show a result screen. Required content:
- Battle outcome (victory / defeat / draw)
- An action that returns the player to the lobby (e.g., "Finish Battle")

The result screen SHOULD also include:
- Battle narration feed (available via `BattleFeedUpdated` events received during battle, or fetchable via `GET /api/v1/battles/{battleId}/feed`)

The result screen MUST remain visible until the player explicitly dismisses it.

### REQ-P2: Post-battle state refresh

When the player returns to the lobby after battle:
- The client MUST call `GET /api/v1/game/state` to get updated character data
- XP and level changes happen asynchronously on the backend (via messaging); there may be a brief delay
- If the first fetch shows no XP change, the client SHOULD retry after a short delay (2-5 seconds) to pick up the async update
- If a level-up occurred and new unspent stat points are available, the client SHOULD display a notification

### REQ-P3: Post-battle feed endpoint

`GET /api/v1/battles/{battleId}/feed` returns the complete narration feed for a finished battle. This is deterministic and idempotent. The client MAY use this for:
- Displaying the full feed on the result screen if live events were missed
- Deduplicating with live events using the `Key` field (`{battleId}:{turnIndex}:{sequence}`)

### REQ-P4: Re-entering the game loop

After dismissing the result screen, the player returns to the lobby (REQ-L1) and can immediately re-enter matchmaking. There is no cooldown or mandatory delay.

---

## 12. Hard gates vs non-blocking conditions

### Hard gates (block progression)

| Condition | Gate behavior |
|-----------|--------------|
| Not authenticated | Cannot access any game feature; show Register / Login entry points |
| `OnboardingState: Draft` | Must complete name selection before anything else |
| `OnboardingState: Named` | Must complete initial stat allocation before anything else |
| Active battle exists | Must reconnect to battle; cannot access lobby or queue |
| Battle not yet dismissed | Must dismiss result screen before returning to lobby |

### Non-blocking conditions (inform but do not restrict)

| Condition | Frontend behavior |
|-----------|-------------------|
| Unspent stat points (after initial onboarding) | Show indicator/badge; do not prevent queueing or any other action |
| Degraded backend services | Show degraded UI; do not prevent navigation to available features |
| XP/level not yet updated after battle | Show current known state; retry refresh |
| Chat connection lost | Show indicator; do not prevent gameplay actions |

---

## 13. Non-functional frontend requirements

### REQ-NF1: Responsiveness

The client MUST be usable on desktop browsers. Minimum supported viewport is expected to be around 1024x768 (product preference; exact breakpoint to be confirmed during architecture). Tablet and mobile support is not required for the first version but the layout approach should not actively prevent future responsive adaptation.

### REQ-NF2: Performance

- Turn input must feel immediate; no perceptible delay between user action and local UI response
- Battle event processing must not cause visible lag or frame drops
- Matchmaking polling must not degrade UI performance
- Chat message rendering must handle high message volume without lag
- The client should not hold stale state in memory across sessions

### REQ-NF3: Error visibility

- All server errors with a `traceId` SHOULD display the trace ID to the user for support purposes
- Network errors MUST be shown clearly, not silently swallowed
- The client MUST distinguish between "server error" (retry may help) and "client error" (user must fix input)

### REQ-NF4: Connection state visibility

The client MUST clearly indicate:
- When the SignalR connection to the battle hub is lost
- When the SignalR connection to the chat hub is lost
- When reconnection is in progress
- When the connection is restored

### REQ-NF5: Timer accuracy

Turn deadline timers MUST:
- Be based on `DeadlineUtc` from the server, not local calculation
- Account for clock skew between client and server (if detectable)
- Apply a small local safety buffer to prevent edge-case late submissions

### REQ-NF6: State consistency

- The client MUST NOT display stale state from a previous session after a page refresh
- After reconnection, all displayed state MUST be replaced with the server-provided snapshot
- The `Revision` field on character data MUST be tracked and used for optimistic concurrency on stat allocation

### REQ-NF7: Graceful degradation

If the BFF reports degraded services via `DegradedServices`:
- Available features should remain functional
- Unavailable features should be clearly marked, not hidden or silently broken

If the chat service is unavailable:
- Gameplay features (queue, battle) MUST remain functional
- Chat panel SHOULD show "Chat temporarily unavailable"

### REQ-NF8: Authentication transport

- HTTP requests: `Authorization: Bearer <token>` header
- SignalR connections (both `/battlehub` and `/chathub`): `?access_token=<token>` query parameter
- Token refresh must be handled proactively before expiry
- No cookie-based auth; the backend uses stateless JWT

---

## 14. Reskin-oriented architecture requirements

### REQ-R1: Separation of concerns

The frontend architecture MUST maintain clear separation between:
1. **Game flow and state logic** -- app routing, screen transitions, hard gates, recovery logic, state machines
2. **Backend integration** -- HTTP clients, SignalR connection management, polling, reconnection, token management
3. **Presentation** -- visual components, styling, layout, animation, theming

These three concerns MUST be independently modifiable. A change to visual styling MUST NOT require changes to game flow logic or backend integration code.

### REQ-R2: Visual reskin as a first-class concern

A future full visual reskin is expected. The first version MUST be structured so that:
- All presentation components can be replaced without rewriting game flow, state management, or transport logic
- No business logic (turn submission, state machine transitions, reconnection) is embedded in visual components
- Screen transitions and routing are driven by state, not by visual component lifecycle

### REQ-R3: No visual coupling in game logic

Game flow logic (onboarding gates, matchmaking state machine, battle state machine, chat state, post-battle flow) MUST NOT:
- Import or depend on specific visual component implementations
- Assume a particular layout structure
- Contain inline styles, CSS references, or animation logic
- Be co-located with visual components in a way that makes separation impractical

### REQ-R4: Theme and style isolation

The current visual style MUST be applied through a styling layer that can be wholly replaced. Visual constants (colors, spacing, typography, iconography) MUST be defined in a theming layer, not scattered across component implementations.

### REQ-R5: Mockup is reference, not architecture

The existing Figma mockup prototype (`design/`) represents a general visual direction. It is not the architectural blueprint for the frontend, the source of truth for component structure, or a codebase to extend wholesale.

The production client MAY reuse visual ideas, styling approaches, or individual presentational components from the mockup where they fit, provided that:
- the production architecture requirements (REQ-R1 through REQ-R4) are not compromised
- mockup code is adapted to the production component structure, not the other way around
- no game flow logic, state management, or backend integration patterns are inherited from the mockup

---

## 15. Desired-but-not-yet-validated behaviors

These behaviors are product preferences that MUST be validated against backend capabilities during the feasibility phase.

### DES-1: Queue auto-leave on browser close

**Desired behavior:** If the player closes the browser while still searching in the matchmaking queue, the system should remove them from the queue so they don't return to an active search or, worse, get matched while absent.

**Current backend reality:** The matchmaking queue entry persists in Redis with a 30-minute TTL. There is no server-side mechanism triggered by client disconnection to remove the queue entry. The client has no persistent connection to the matchmaking system (poll-based only), so the server cannot detect client departure.

**Best available approach:** `navigator.sendBeacon()` on `pagehide` event, calling `POST /api/v1/queue/leave`. This is best-effort (~80% reliability). The 30-minute TTL is the fallback. Recovery mechanisms handle the worst case (matched while absent -> DoubleForfeit -> cleanup).

### DES-2: Immediate XP display after battle

**Desired behavior:** The result screen shows XP gained and any level-up immediately after battle ends.

**Current backend reality:** XP is awarded asynchronously via `BattleCompleted` integration event consumed by Players service. There is a non-deterministic delay between `BattleEnded` (received by client) and the XP actually being applied to the character.

**Best available approach:** Show battle outcome on result screen. Show XP/level changes after lobby refresh, with a retry if first fetch shows no change.

### DES-3: Win/loss record display in own profile

**Desired behavior:** The lobby shows the player's own win/loss record.

**Current backend reality:** `Wins` and `Losses` are available in the `PlayerCardResponse` (via `GET /api/v1/players/{playerId}/card`) but are NOT included in the `CharacterResponse` used by `GET /api/v1/game/state`.

**Workaround:** The frontend can call the player card endpoint with the current user's own identity ID to fetch wins/losses. This requires knowing the user's identity ID (available from JWT `sub` claim).

**Ideal fix:** Backend adds wins/losses to `CharacterResponse` / `GameStateResponse` so a separate call is unnecessary.

---

## 16. Open validation points for the next phase

These items MUST be resolved during the feasibility validation phase before frontend architecture begins.

### V-1: Keycloak realm configuration for registration

**Decision:** Registration uses Keycloak's hosted registration page via redirect from the client (see REQ-S8). No custom registration endpoint or form is needed.
**Remaining validation:** Confirm that the Keycloak realm has self-registration enabled and determine whether authenticated return after registration is immediate or requires a separate login step.
**Blocking:** No. The client can implement both paths (immediate return and login fallback) without knowing the realm config upfront.

### V-2: Turn deadline grace period handling

**Question:** Should the client-side timer display the exact `DeadlineUtc` or apply a buffer?
**Backend fact:** The server allows a 1-second grace buffer for late submissions (`ActionIntakeService.cs`).
**Blocking:** No. Can default to applying a local buffer and adjust later.

### V-3: Stat allocation semantics on the frontend

**Confirmed behavior:** The `POST /api/v1/character/stats` payload contains ADDITIVE point values (points to add), not target totals. The frontend stat allocation UI must be a "spend X points" interface.
**Blocking:** No. This is confirmed, not ambiguous.

### V-4: Name permanence communication

**Confirmed behavior:** Names are set once and cannot be changed (`SetNameOnce`).
**Blocking:** No. Can proceed with "permanent name" assumption.

### V-5: `OnboardingState: "Unknown"` handling

**Confirmed behavior:** Maps unrecognized states to `"Unknown"`. Should not occur in practice.
**Blocking:** No. Treat as error condition.

### V-6: Concurrent session handling

**Acceptable risk:** Two tabs: stat allocation gets 409 on revision mismatch. Two SignalR connections to same battle: both receive events. Two chat connections: both receive messages, presence counts correctly (refcount-based). No single-session enforcement needed for MVP.
**Blocking:** No.

### V-7: Post-battle XP timing

**Confirmed:** Non-deterministic, typically sub-second. Frontend should use retry-after-delay on lobby refresh.
**Blocking:** No.

### V-8: SignalR reconnection after battle ended during disconnect

**Confirmed behavior:** `JoinBattle` returns snapshot with `Phase: Ended`. No event replay. Frontend must check phase immediately.
**Blocking:** No.

### V-9: Chat during battle

**Decision needed:** Should the `/chathub` connection be maintained during battle? This affects whether DM notifications appear during battle and whether the chat panel is visible on the battle screen.
**Blocking:** No. Either approach works. Default to disconnecting during battle if undecided.

### V-10: Chat message retention window

**Question:** How long are messages kept before the retention worker deletes them?
**Impact:** Determines practical limit on "scroll back" in history.
**Blocking:** No. Configurable server-side; frontend should handle finite history gracefully.

---

## 17. Recommended next step

**Immediately next:** Feasibility validation.

Using this document and the backend revision as inputs, validate:
1. That every requirement listed here can be met with the current BFF contract
2. That the open validation points (V-1 through V-10) are resolved or have acceptable defaults
3. That the desired-but-not-validated behaviors (DES-1 through DES-3) have a clear path (implement, defer, or accept limitation)
4. That the core flow (register/login through post-battle with chat) works end-to-end without backend changes
5. That the Keycloak realm supports self-registration and determine post-registration redirect behavior

**After feasibility:** Frontend client specification, then frontend architecture, then implementation planning. Each phase uses this document as its upstream input.

# Kombats Frontend Client Product and Architecture Requirements

## 1. Purpose

This document defines the product requirements and architecture-level constraints for the first production-capable version of the Kombats frontend client.

It serves as the source of truth for:
- frontend feasibility validation
- frontend client specification
- frontend architecture design
- implementation planning

This document converts the backend integration contract (documented in `01-backend-revision-for-frontend.md`) into actionable frontend requirements. It does not propose implementation details, library choices, or folder structure.

**Scope:** The complete core game flow from authentication through battle and post-battle. This is not a throwaway prototype. It is the first version intended for production use, structured for long-term maintainability.

**Out of scope:** Localization/i18n, leaderboards, social features, battle history list, settings/account management, chat, spectator mode.

### Requirement classification

This document uses four classification levels. When reading requirements, assume **hard requirement** unless otherwise marked.

| Level | Meaning | Keyword signals |
|-------|---------|-----------------|
| **Hard requirement** | Non-negotiable for first version. Driven by backend contract, game integrity, or core product flow. | MUST, MUST NOT |
| **Product preference** | Desired behavior that reflects product intent. May be adjusted during architecture/implementation if trade-offs require it. | SHOULD, preferred, expected |
| **Backend-constrained** | Behavior dictated by the current backend contract. Not a product choice; changing it requires a backend change. | Noted inline as "backend-constrained" |
| **Validation point** | Open question that must be resolved before or during feasibility. | See Sections 13 and 14 |

---

## 2. Inputs and source of truth

| Input | Location | Role |
|-------|----------|------|
| Backend revision for frontend | `docs/frontend/01-backend-revision-for-frontend.md` | Authoritative backend integration contract |
| BFF source code | `src/Kombats.Bff` | Ground truth for all client-facing endpoints and SignalR hubs |
| Players service domain | `src/Kombats.Players/Kombats.Players.Domain` | Character entity, onboarding states, leveling policy |
| Battle realtime contracts | `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts` | SignalR event payload definitions |
| Figma mockup prototype | `design/` | Visual direction reference (not architectural authority) |
| Architecture docs | `.claude/docs/architecture/` | Backend architecture decisions |

The backend revision document is the primary input. The codebase is referenced for clarification. The Figma mockup is a visual concept reference; it does not define client architecture or product behavior, but may inform visual direction.

---

## 3. Product goal

Deliver a frontend client that supports the complete core game loop:

**Register/Login -> Onboard -> Lobby -> Queue -> Battle -> Result -> Lobby**

The client must:
- feel like a real product, not a developer tool
- handle all expected edge cases (disconnection, reconnection, state recovery)
- be structured so that a complete visual reskin is possible without rewriting gameplay logic, state management, or backend integration
- be maintainable and extensible for future feature additions

The client does NOT need to:
- implement custom registration or login forms (auth pages are hosted by Keycloak; the client redirects to them)
- display battle history lists or leaderboards
- provide chat or social features
- implement spectator mode

---

## 4. Core player flow

The following is the canonical player journey. Each step is a hard requirement unless marked otherwise.

```
1. Player opens the app
2. App checks auth state
   ├── Not authenticated -> show unauthenticated landing with Register and Login entry points
   │   ├── Register -> redirect to Keycloak registration page
   │   │   ├── Preferred: after registration, user returns authenticated -> proceed to step 3
   │   │   └── Fallback: if realm config requires separate login after registration -> redirect to login
   │   └── Login -> redirect to Keycloak login page -> return authenticated -> proceed to step 3
   └── Authenticated -> proceed
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

The lobby SHOULD display:
- Character level and current XP
- Current stats (Strength, Agility, Intuition, Vitality)
- Unspent stat points count and/or visual indicator when unspent points are available

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

Backend-constrained implementation constraints:
- `actionPayload` MUST be a JSON **string**, not a structured object. The client must `JSON.stringify()` the action object before passing it to the hub method.
- Zone values are exact, case-sensitive enum strings: `"Head"`, `"Torso"`, `"LeftArm"`, `"RightArm"`, `"LeftLeg"`, `"RightLeg"`
- Invalid or late submissions are silently treated as `NoAction` by the server; the client receives no error (backend-constrained; the server does not return validation errors for turn actions)

### REQ-B4: Client-side action validation

Because the server silently degrades invalid actions to no-ops, the client MUST validate actions locally before submission:
- All three zones (attack, blockPrimary, blockSecondary) must be selected
- Zone values must match the exact enum strings
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

## 9. Post-battle requirements

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

## 10. Hard gates vs non-blocking conditions

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

---

## 11. Non-functional frontend requirements

### REQ-NF1: Responsiveness

The client MUST be usable on desktop browsers. Minimum supported viewport is expected to be around 1024x768 (product preference; exact breakpoint to be confirmed during architecture). Tablet and mobile support is not required for the first version but the layout approach should not actively prevent future responsive adaptation.

### REQ-NF2: Performance

- Turn input must feel immediate; no perceptible delay between user action and local UI response
- Battle event processing must not cause visible lag or frame drops
- Matchmaking polling must not degrade UI performance
- The client should not hold stale state in memory across sessions

### REQ-NF3: Error visibility

- All server errors with a `traceId` SHOULD display the trace ID to the user for support purposes
- Network errors MUST be shown clearly, not silently swallowed
- The client MUST distinguish between "server error" (retry may help) and "client error" (user must fix input)

### REQ-NF4: Connection state visibility

The client MUST clearly indicate:
- When the SignalR connection to the battle hub is lost
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

### REQ-NF8: Authentication transport

- HTTP requests: `Authorization: Bearer <token>` header
- SignalR connections: `?access_token=<token>` query parameter
- Token refresh must be handled proactively before expiry
- No cookie-based auth; the backend uses stateless JWT

---

## 12. Reskin-oriented architecture requirements

### REQ-R1: Separation of concerns

The frontend architecture MUST maintain clear separation between:
1. **Game flow and state logic** — app routing, screen transitions, hard gates, recovery logic, state machines
2. **Backend integration** — HTTP clients, SignalR connection management, polling, reconnection, token management
3. **Presentation** — visual components, styling, layout, animation, theming

These three concerns MUST be independently modifiable. A change to visual styling MUST NOT require changes to game flow logic or backend integration code.

### REQ-R2: Visual reskin as a first-class concern

A future full visual reskin is expected. The first version MUST be structured so that:
- All presentation components can be replaced without rewriting game flow, state management, or transport logic
- No business logic (turn submission, state machine transitions, reconnection) is embedded in visual components
- Screen transitions and routing are driven by state, not by visual component lifecycle

### REQ-R3: No visual coupling in game logic

Game flow logic (onboarding gates, matchmaking state machine, battle state machine, post-battle flow) MUST NOT:
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

## 13. Desired-but-not-yet-validated behaviors

These behaviors are product preferences that MUST be validated against backend capabilities during the feasibility phase.

### DES-1: Queue auto-leave on browser close

**Desired behavior:** If the player closes the browser while still searching in the matchmaking queue, the system should remove them from the queue so they don't return to an active search or, worse, get matched while absent.

**Current backend reality (unvalidated):** The matchmaking queue entry persists in Redis with a 30-minute TTL. There is no server-side mechanism triggered by client disconnection to remove the queue entry. The client has no persistent connection to the matchmaking system (poll-based only), so the server cannot detect client departure.

**Validation needed:** Determine whether this behavior can be achieved via:
- Browser `beforeunload` event calling `POST /api/v1/queue/leave` (unreliable)
- A backend enhancement to support client heartbeat/timeout for queue entries
- Accepting the 30-minute TTL as the de facto auto-leave mechanism

### DES-2: Immediate XP display after battle

**Desired behavior:** The result screen shows XP gained and any level-up immediately after battle ends.

**Current backend reality:** XP is awarded asynchronously via `BattleCompleted` integration event consumed by Players service. There is a non-deterministic delay between `BattleEnded` (received by client) and the XP actually being applied to the character.

**Validation needed:** Determine the typical delay and whether the client can reliably display XP changes on the result screen, or whether it must defer to the lobby refresh.

### DES-3: Win/loss record display

**Desired behavior:** The lobby shows the player's win/loss record.

**Current backend reality:** `Wins` and `Losses` exist on the domain entity but are NOT exposed in the BFF's `GameStateResponse` or `CharacterResponse`.

**Validation needed:** Requires a BFF change to expose these fields. This is a backend gap (G3 in the backend revision).

---

## 14. Open validation points for the next phase

These items MUST be resolved during the feasibility validation phase before frontend architecture begins.

### V-1: Keycloak realm configuration for registration

**Decision:** Registration uses Keycloak's hosted registration page via redirect from the client (see REQ-S8). No custom registration endpoint or form is needed.  
**Remaining validation:** Confirm that the Keycloak realm has self-registration enabled and determine whether authenticated return after registration is immediate or requires a separate login step. This affects the client's post-registration redirect behavior.  
**Blocking:** No. The client can implement both paths (immediate return and login fallback) without knowing the realm config upfront.

### V-2: Turn deadline grace period handling

**Question:** Should the client-side timer display the exact `DeadlineUtc` or apply a buffer?  
**Backend fact:** The server allows a 1-second grace buffer for late submissions (`ActionIntakeService.cs`).  
**Impact:** If the client cuts off input at the exact deadline, the player loses 1 second of available submission time. If it displays a shorter deadline, the UX feels more rushed.  
**Blocking:** No. Can default to applying a local buffer and adjust later.

### V-3: Stat allocation semantics on the frontend

**Question:** The `POST /api/v1/character/stats` payload contains ADDITIVE point values (points to add), not target totals. Confirmed from `Character.AllocatePoints()`.  
**Impact:** The frontend stat allocation UI must be a "spend X points" interface, not a "set total to Y" interface. No respec exists.  
**Blocking:** No. This is confirmed behavior, not ambiguous. Listed here to ensure the UI design accounts for it.

### V-4: Name permanence communication

**Question:** Names are set once and cannot be changed (`SetNameOnce`). Is this the intended long-term product behavior?  
**Impact:** The frontend must warn the player that the name choice is permanent.  
**Blocking:** No. Can proceed with "permanent name" assumption and add rename later if needed.

### V-5: `OnboardingState: "Unknown"` handling

**Question:** The BFF maps unrecognized onboarding states to `"Unknown"`. Can this occur in practice?  
**Impact:** If it can, the client needs an error/recovery path for this state. If it cannot, it can be treated as an unreachable case.  
**Blocking:** No. Can default to treating `"Unknown"` as an error condition requiring re-login.

### V-6: Concurrent session handling

**Question:** What happens if the player has two browser tabs open?  
**Concerns:**
- Stat allocation with optimistic concurrency (409 conflict)
- Two SignalR connections to the same battle
- Two polling loops for matchmaking  
**Impact:** Determines whether the client should attempt single-session enforcement or handle conflicts gracefully.  
**Blocking:** No. Can defer to "handle 409 gracefully" and not enforce single session initially.

### V-7: Post-battle XP timing

**Question:** What is the typical delay between `BattleEnded` and XP being available on the character?  
**Impact:** Determines whether the result screen can show XP/level changes or must defer to lobby.  
**Blocking:** No. Can default to refreshing on lobby entry.

### V-8: SignalR reconnection after battle ended during disconnect

**Question:** When the client reconnects after a battle ended, `JoinBattle` returns a snapshot with `Phase: Ended` but does NOT replay missed events (confirmed in backend revision A6).  
**Impact:** The client must check the snapshot phase immediately after `JoinBattle` and route to the result screen. It cannot rely on receiving a `BattleEnded` event.  
**Blocking:** No. This is confirmed behavior. The client must handle it.

---

## 15. Recommended next step

**Immediately next:** Feasibility validation.

Using this document and the backend revision as inputs, validate:
1. That every requirement listed here can be met with the current BFF contract
2. That the open validation points (V-1 through V-8) are resolved or have acceptable defaults
3. That the desired-but-not-validated behaviors (DES-1 through DES-3) have a clear path (implement, defer, or accept limitation)
4. That the core flow (register/login through post-battle) works end-to-end without backend changes
5. That the Keycloak realm supports self-registration and determine post-registration redirect behavior

**After feasibility:** Frontend client specification, then frontend architecture, then implementation planning. Each phase uses this document as its upstream input.

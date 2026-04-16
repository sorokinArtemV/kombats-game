# Kombats Frontend Implementation Plan

## Changelog

**2026-04-16 -- Initial version**
**2026-04-16 -- Corrective pass:** Fixed critical path notation for Phase 1 parallelism, added mid-Phase 4 review checkpoint, clarified onboard call placement in Phase 2/3 boundary, repositioned `sendBeacon` queue leave as non-blocking best-effort.

---

## 1. Executive summary

### What is being built

A production React + Vite SPA that implements the complete Kombats game loop: authenticate via Keycloak -> onboard (name + stats) -> lobby with global chat, DM, and online players -> matchmaking queue -> real-time 1v1 turn-based battle via SignalR -> post-battle result with narration -> return to lobby. The client communicates exclusively with the BFF layer over HTTP and two independent SignalR hubs (`/battlehub`, `/chathub`).

### Implementation philosophy

**Incremental vertical slices.** Each phase delivers a working, testable slice of the application. No phase produces only infrastructure or only UI -- every phase connects transport, state, and presentation for its feature. Earlier phases are simpler but set the patterns that later phases follow. Battle is the most complex phase and depends on everything before it being solid.

**State-driven routing.** The app routes are projections of server-authoritative state. Guards and recovery flows derive from Zustand stores populated by `GET /api/v1/game/state`. This pattern is established in Phase 2 (auth + startup) and extended in every subsequent phase.

**Transport isolation.** Components never call `fetch` or interact with SignalR directly. The transport layer is built in Phase 1, hardened in Phase 2, and consumed uniformly by all feature modules. This enables testing features without network access and reskinning without touching integration code.

### Critical path

```
Phase 0 (scaffold) -> Phase 1 (auth + transport) -> Phase 2 (startup + routing) -> Phase 3 (onboarding)
  -> Phase 4 (lobby shell + chat) -> Phase 5 (matchmaking) -> Phase 6 (battle transport + state)
  -> Phase 7 (battle UI) -> Phase 8 (post-battle) -> Phase 9 (hardening)
```

Auth and transport (Phase 1) block everything. Battle transport and state machine (Phase 6) is the highest-risk phase. Chat (Phase 4) is on the critical path because the chat hub connection is session-scoped and must coexist with battle.

---

## 2. Preconditions and assumptions

### Already decided (source of truth references)

| Decision | Source |
|----------|--------|
| React 19 + Vite SPA, not Next.js | `04-frontend-client-architecture.md` DEC-1 |
| Zustand for client/real-time state, TanStack Query for server state | `04` Section 3.3, 3.4 |
| `oidc-client-ts` + `react-oidc-context` for Keycloak auth | `04` Section 3.6, `05` full spec |
| `@microsoft/signalr` for both hubs | `04` Section 3.5 |
| Tailwind CSS 4 + CSS variables for theming | `04` Section 3.7 |
| React Router 7 for routing | `04` Section 3.2 |
| In-memory token storage only (DEC-6) | `04` DEC-6, `05` Section 8.2 |
| Chat maintained during battle (DEC-2) | `04` DEC-2 |
| Turn deadline display buffer of 1.5s (DEC-4) | `04` DEC-4 |
| Own win/loss via card endpoint workaround (DEC-3) | `04` DEC-3 |
| Post-battle XP retry after 3s (DEC-5) | `04` DEC-5 |
| 5-zone ring topology with adjacent block pairs | `01` Section 6, `04` Section 10 |
| Full dependency list | `04` Section 3.8 |
| Module structure and file layout | `04` Section 6.1 |
| Battle state machine specification | `04` Section 8 |
| Chat state specification | `04` Section 9 |

### What must exist before implementation starts

| Prerequisite | Status | Impact if missing |
|-------------|--------|-------------------|
| Docker infrastructure running (Postgres, RabbitMQ, Redis, Keycloak) | Available via `docker-compose.yml` | Cannot test any auth or API integration |
| Keycloak `kombats-realm.json` with `kombats-web` client imported | Configured in `infra/keycloak/kombats-realm.json` | Cannot authenticate; all phases blocked |
| BFF service running locally | Available; `Kombats.Bff.Bootstrap` | Cannot test any API integration |
| Players, Matchmaking, Battle, Chat services running locally | Available | Cannot test full flow; individual phases can stub against BFF's degraded responses |
| At least one Keycloak test user account | Created via Keycloak admin or self-registration | Cannot test authenticated flows |

### Assumptions

- The BFF contract is stable. No breaking changes to endpoints, SignalR events, or response shapes during frontend implementation.
- The `kombats-web` Keycloak client is correctly configured per `05-keycloak-web-client-integration.md`. Registration returns the user authenticated immediately (`verifyEmail: false`).
- All backend services are functional for the features covered by `03-flow-feasibility-validation.md`.
- Implementation is agent-driven with human review after each phase.

---

## 3. Delivery strategy

### Recommended implementation order

| Phase | Name | Dependencies |
|-------|------|-------------|
| 0 | Project scaffold | None |
| 1 | Auth + transport foundation | Phase 0 |
| 2 | Startup state resolution + route guards | Phase 1 |
| 3 | Onboarding | Phase 2 |
| 4 | Lobby shell + chat + presence | Phase 3 |
| 5 | Matchmaking | Phase 4 |
| 6 | Battle transport + state machine | Phase 5 |
| 7 | Battle UI | Phase 6 |
| 8 | Post-battle / result flow | Phase 7 |
| 9 | Hardening / error handling / reconnection / polish | Phase 8 |

### Why this order is correct

1. **Auth first** because every endpoint requires a JWT and every SignalR connection requires `?access_token=`. Nothing can be tested without auth working.

2. **Startup resolution second** because it establishes the state-driven routing pattern (guards, `GameStateLoader`, recovery) that every subsequent phase extends. Getting this wrong early creates cascading problems.

3. **Onboarding third** because it is the simplest feature after auth, exercises the HTTP transport layer, and produces a `Ready` character state required for all subsequent features.

4. **Lobby + chat fourth** because the chat hub connection is session-scoped (DEC-2) and must be established before battle. Building chat at the lobby stage validates the second SignalR connection management pattern. The lobby shell is the persistent layout for matchmaking.

5. **Matchmaking fifth** because it is the bridge between lobby and battle. It introduces the polling transport pattern. It is simple and validates the status state machine before battle complexity.

6. **Battle transport + state machine sixth** because battle is the most complex feature and the highest risk. Separating transport/state from UI allows validation that events are correctly processed before building the visual layer.

7. **Battle UI seventh** because it is pure presentation over the battle state machine. By this point, the state machine is tested and the event flow is verified. The UI phase focuses on zone selector, HP bars, turn timer, narration feed.

8. **Post-battle eighth** because it depends on both battle end detection and lobby refresh. It is straightforward: result screen + feed fetch + XP refresh.

9. **Hardening last** because it addresses cross-cutting concerns (reconnection edge cases, error states, degraded services, `sendBeacon` on close) that are only meaningfully testable after all features exist.

### What must be built first vs later

**Must be first:** Auth module, HTTP client with token injection, SignalR connection managers, Zustand store pattern, TanStack Query setup, route guard hierarchy, design token system.

**Can be deferred:** Battle animations/polish, chat history infinite scroll, player card overlay transitions, toast notification system fine-tuning, `sendBeacon` queue leave on close.

---

## 4. Phased implementation plan

---

### Phase 0: Project scaffold

**Goal:** A running Vite + React project with the full dependency set, folder structure, and build tooling. Nothing functional -- just the shell.

**Scope:**
- Initialize Vite project with React 19 + TypeScript
- Install all dependencies from `04` Section 3.8
- Create the folder structure from `04` Section 6.1 (empty files/directories)
- Configure Tailwind CSS 4 with the design token CSS file (`theme/tokens.css`)
- Configure path aliases (`@/modules/*`, `@/transport/*`, `@/ui/*`, `@/types/*`)
- Add `tsconfig.json` with strict mode
- Add ESLint + Prettier configuration
- Create placeholder `App.tsx` with Vite dev server running
- Add environment variable configuration (`VITE_KEYCLOAK_AUTHORITY`, `VITE_KEYCLOAK_CLIENT_ID`, `VITE_BFF_BASE_URL`)
- Create `.env.development` with local dev values

**Key outputs:**
- `npm run dev` starts the dev server and renders a placeholder page
- Folder structure matches the architecture spec
- All dependencies resolve
- Tailwind classes work with design token variables

**Dependencies:** None.

**Validation / exit criteria:**
- Dev server starts without errors
- A component using Tailwind utility classes renders correctly
- TypeScript strict mode compiles without errors
- Environment variables are accessible via `import.meta.env`

**Risks:**
- Tailwind 4 configuration syntax differs from v3. Minor -- resolve during setup.
- React 19 compatibility with some Radix primitives. Verify during install.

---

### Phase 1: Auth + transport foundation

**Goal:** A working authentication flow (login, register, callback, token refresh) and the complete transport layer (HTTP client, both SignalR managers, polling service). After this phase, the app can authenticate against Keycloak, make authorized API calls, and establish SignalR connections.

**Scope:**

*Auth module:*
- `oidc-client-ts` UserManager configuration per `05` Section 11
- Auth Zustand store (`accessToken`, `userIdentityId`, `displayName`, `authStatus`)
- `AuthProvider.tsx` wrapping `react-oidc-context`
- `AuthCallback.tsx` for `/auth/callback` route
- Login redirect (standard `signinRedirect`)
- Register redirect (`signinRedirect` with `extraQueryParams: { kc_action: "register" }`)
- Silent token renewal setup (`automaticSilentRenew: true`, refresh_token strategy)
- Token storage in `InMemoryWebStorage` (DEC-6)
- User identity extraction from JWT (`sub`, `preferred_username`)
- Logout flow with state cleanup

*HTTP client:*
- `transport/http/client.ts` -- fetch wrapper with `Authorization: Bearer` injection
- 401 interceptor (clear auth, redirect to landing)
- Error response parsing into typed `ApiError`
- Typed endpoint modules: `game.ts`, `character.ts`, `queue.ts`, `battle.ts`, `chat.ts`, `players.ts`
- TanStack Query provider setup (`QueryClient` with default options)

*SignalR managers:*
- `transport/signalr/battle-hub.ts` -- `BattleHubManager` with `accessTokenFactory`, reconnect policy `[0, 1000, 2000, 5000, 10000, 30000]`, typed event registration stubs, connect/disconnect/joinBattle/submitTurnAction methods
- `transport/signalr/chat-hub.ts` -- `ChatHubManager` with same auth + reconnect config, typed event registration stubs, connect/disconnect/joinGlobalChat/sendGlobalMessage/sendDirectMessage/leaveGlobalChat methods
- `transport/signalr/connection-state.ts` -- shared connection state types

*Polling service:*
- `transport/polling/matchmaking-poller.ts` -- start/stop with configurable interval, calls `api.queue.getStatus()`

*Shared types:*
- `types/api.ts` -- API response/request types matching BFF contract
- `types/battle.ts` -- battle enums (`BattlePhase`, `BattleZone`, `BattleEndReason`, attack outcomes), event payload types
- `types/chat.ts` -- chat message, conversation, presence, error types
- `types/player.ts` -- character, player card, onboarding state types

**Key outputs:**
- Login -> Keycloak -> callback -> authenticated state (visible in dev tools / console)
- Register -> Keycloak registration -> callback -> authenticated state
- `api.game.getState()` returns data with valid token
- `BattleHubManager.connect()` establishes a SignalR connection to `/battlehub`
- `ChatHubManager.connect()` establishes a SignalR connection to `/chathub`
- Silent token renewal fires before expiry

**Dependencies:** Phase 0. Keycloak running with `kombats-web` client. BFF running.

**Validation / exit criteria:**
- Manual login/register cycle through Keycloak works
- Authenticated HTTP call to `GET /api/v1/game/state` succeeds
- SignalR connection to `/battlehub` negotiates successfully (even if no battle exists)
- SignalR connection to `/chathub` negotiates successfully
- Token refresh fires (can force by shortening access token lifespan in Keycloak temporarily)
- 401 on expired token redirects to unauthenticated landing
- Logout clears state and redirects

**Risks:**
- CORS between Vite dev server and Keycloak/BFF. Vite proxy or proper CORS headers on BFF required.
- `oidc-client-ts` version compatibility with `react-oidc-context`. Pin versions from `04` Section 3.8.
- `InMemoryWebStorage` means page refresh loses auth. Expected behavior (DEC-6) -- silent renewal recovers.

---

### Phase 2: Startup state resolution + route guards

**Goal:** The app resolves the correct screen on every load/refresh based on server state. Route guards enforce hard gates. The state-driven routing pattern is fully operational.

**Scope:**

*Game state loading:*
- `GameStateLoader` layout component: fetches `GET /api/v1/game/state`, blocks rendering until resolved
- Player Zustand store: populated from `GameStateResponse` (character data, queue status, degraded services)
- Loading screen shown during state fetch
- **Auto-onboard hook:** If game state returns no character (`character` is null), automatically calls `POST /api/v1/game/onboard` to create the character (idempotent). This is implemented as a `useAutoOnboard()` hook called from `GameStateLoader` or as inline logic within the loader. The onboard call runs once, refetches game state after success, and produces a `Draft` character that the `OnboardingGuard` then routes to `/onboarding/name`.

*Route definitions:*
- Full route tree from `04` Section 4.2
- Unauthenticated routes: `/` (landing), `/auth/callback`
- Authenticated routes: `/onboarding/name`, `/onboarding/stats`, `/lobby`, `/matchmaking`, `/battle/:battleId`, `/battle/:battleId/result`

*Route guards:*
- `AuthGuard` -- redirects to `/` if not authenticated
- `OnboardingGuard` -- forces `/onboarding/name` or `/onboarding/stats` based on `OnboardingState`
- `BattleGuard` -- forces `/battle/:battleId` if active battle detected in queue status

*Shell components (layout only, no feature content):*
- `UnauthenticatedShell` -- landing page with Login and Register buttons
- `OnboardingShell` -- minimal layout for onboarding steps
- `AuthenticatedShell` -- placeholder lobby layout (header + main + sidebar structure)
- `BattleShell` -- placeholder full-screen layout

*Recovery flows:*
- Page refresh -> `GameStateLoader` -> correct route
- Active battle detected -> forced navigation to `/battle/:battleId`
- Searching status detected -> forced navigation to `/matchmaking`
- Incomplete onboarding -> forced to correct onboarding step

**Key outputs:**
- Fresh load as unauthenticated user -> landing page with Login/Register
- Login -> `GameStateLoader` -> correct screen based on character state
- Page refresh at any point -> same recovery behavior
- Navigation guard prevents skipping onboarding steps
- Navigation guard prevents leaving an active battle

**Dependencies:** Phase 1 (auth, HTTP client, player types).

**Validation / exit criteria:**
- Unauthenticated user sees landing with Login/Register
- New user (no character) -> redirect to onboarding after login
- User with `Draft` character -> forced to name selection
- User with `Named` character -> forced to stat allocation
- User with `Ready` character -> lobby
- User with active battle -> forced to battle route (battle UI is placeholder at this stage)
- User with `Searching` queue status -> forced to matchmaking route (placeholder)
- Page refresh at any route -> correct recovery
- Manual URL navigation to a guarded route -> redirected appropriately
- `DegradedServices` response handled (non-null array doesn't crash; degraded UI indicator shown)

**Risks:**
- Race condition between `GameStateLoader` fetch and guard evaluation. The loader must block rendering until the fetch completes. Use TanStack Query's `isPending` state to show loading.
- Deep-link to `/battle/:battleId` without a valid battle -> guard should redirect to lobby, not crash.

---

### Phase 3: Onboarding

**Goal:** A new user can complete the full onboarding flow: name selection -> stat allocation -> Ready state -> redirect to lobby.

**Scope:**

*Name selection screen (`/onboarding/name`):*
- Text input for character name
- Client-side validation: 3-16 characters
- "Name is permanent" messaging (REQ-O2)
- Submit via `POST /api/v1/character/name`
- Error handling: 409 (name taken), 400 (validation), 500 (server error)
- On success: update player store, guard redirects to `/onboarding/stats`

*Stat allocation screen (`/onboarding/stats`):*
- Display starting stats (3/3/3/3) and 3 unspent points
- Additive point spending UI: increment buttons per stat, with point counter
- Client-side validation: at least 1 point allocated, total does not exceed available
- Track `ExpectedRevision` from player store
- Submit via `POST /api/v1/character/stats`
- Error handling: 409 (revision mismatch -- reload and retry), 400, 500
- On success: update player store, guard redirects to `/lobby`

*Onboarding store:*
- Local UI state for the allocation form (pending additions per stat)
- Not persisted -- derived from server state on every load

*Shared UI components (first batch):*
- `Button` (primary, secondary, disabled states)
- `TextInput` (with error state)
- `Spinner` (loading indicator)
- Basic `Card` component

**Key outputs:**
- New user creates character, sets name, allocates stats
- After onboarding, user lands in lobby (placeholder)
- Name uniqueness error shown inline
- Revision mismatch handled gracefully
- Page refresh mid-onboarding -> returns to correct step

**Dependencies:** Phase 2 (guards, player store, shells).

**Validation / exit criteria:**
- Full onboarding from Draft -> Named -> Ready in a single session
- Name too short / too long -> inline error
- Duplicate name -> "name is taken" error from server displayed
- Stats allocated correctly (server accepts, `OnboardingState` becomes `Ready`)
- Page refresh on name screen (Draft state) -> returns to name screen
- Page refresh on stats screen (Named state) -> returns to stats screen
- After Ready, navigation to `/onboarding/*` redirects to lobby

**Risks:**
- The BFF validates max 50 chars, domain validates 3-16. Frontend validates 3-16 directly. If BFF validation changes, no impact.
- Optimistic concurrency on stats: if two tabs are open, one will get 409. Handle by refetching state and retrying.

---

### Phase 4: Lobby shell + chat + presence + player card

**Goal:** The lobby screen is functional with character info display, global chat, online players list, direct messaging, and player card viewing. The `/chathub` SignalR connection is established as session-scoped.

**Scope:**

*Lobby screen:*
- Character summary display (name, level, XP, stats)
- Unspent points indicator (badge/count when `UnspentPoints > 0`)
- Stat allocation access from lobby (reuse onboarding stat form, adapted for lobby context)
- "Enter Queue" button (functional in Phase 5; wired to store action here)
- Win/loss display via player card endpoint workaround (DEC-3): fetch `GET /api/v1/players/{ownIdentityId}/card` on lobby load

*Chat module (full implementation):*
- Chat Zustand store per `04` Section 9 specification
- `useChatConnection()` hook at `AuthenticatedShell` level -- connects on mount, disconnects on unmount
- On connect: `JoinGlobalChat()` -> populate global messages, online players, global conversation ID

*Global chat panel:*
- Message feed display (sender name, content, timestamp)
- Auto-scroll to new messages with scroll-lock when user scrolls up
- Message input with 500-char limit validation
- Send via `SendGlobalMessage(content)`
- `GlobalMessageReceived` events appended in real time
- Rate limit handling: `ChatError` with `rate_limited` -> disable send, show countdown from `RetryAfterMs`

*Online players list:*
- List populated from `JoinGlobalChat()` response
- Real-time updates via `PlayerOnline` / `PlayerOffline` events
- Click on player -> view player card
- Click on player -> start DM

*Direct messaging:*
- DM panel (slide-in sheet or sidebar sub-panel)
- Send via `SendDirectMessage(recipientPlayerId, content)`
- `DirectMessageReceived` events update conversation in real time
- Conversation list via `GET /api/v1/chat/conversations`
- Message history via `GET /api/v1/chat/direct/{otherPlayerId}/messages` (cursor-based pagination)
- Toast notification on incoming DM (via `sonner`)
- Message deduplication by `MessageId`

*Player card:*
- Overlay/sheet component triggered from online players list or DM conversation
- Fetch `GET /api/v1/players/{playerId}/card`
- Display: name, level, stats, wins, losses
- TanStack Query with `staleTime` for caching
- 404 handling: "Player not found"
- Non-blocking: card overlay does not prevent other navigation

*Chat error handling:*
- All `ChatError` codes handled per `04` Section 6.2 (chat module responsibilities)
- `ChatConnectionLost` event -> show connection error indicator, attempt reconnect
- Reconnection -> `JoinGlobalChat()` again for state recovery

*Additional shared UI:*
- `Badge` (unspent points indicator)
- `Sheet` (slide-in panel for player cards, DM conversations)
- `Toast` (via sonner, for DM notifications)
- `ConnectionIndicator` (chat connection state)
- `Avatar` (player display in lists)
- `Tooltip`

**Key outputs:**
- Lobby displays character info with live chat
- Global chat messages flow in real time
- Online players list updates in real time
- DMs can be sent and received
- Player cards viewable from online list and DM
- Chat reconnects automatically on connection drop
- Own win/loss record displayed via card workaround

**Dependencies:** Phase 3 (functional onboarding produces `Ready` state). Chat hub manager from Phase 1.

**Mid-phase review checkpoint (after lobby shell + global chat):**

Before starting DM, player card, and chat error handling work, validate:
- Lobby renders character summary (name, level, XP, stats, wins/losses)
- Global chat sends and receives messages in real time between two clients
- Chat connection indicator shows correct state
- Online players list populates and updates on login/logout
- Session-scoped chat connection survives navigation (verified with route changes)

This checkpoint validates the session-scoped chat pattern and the chat store before investing in DM, player cards, and error handling. Corresponds to completing tasks P4.1 through P4.5 in the task breakdown.

**Validation / exit criteria (full phase):**
- Global chat: send message -> appears in all connected clients
- DM: send to another player -> they receive it in real time
- Online players list: log in with second account -> first account sees them appear
- Player card: click player name -> card displays correct data
- Rate limit: send 6 messages rapidly -> rate limit error with countdown
- Chat reconnect: kill Chat service briefly -> `ChatConnectionLost` shown -> restart service -> chat recovers
- `JoinGlobalChat()` on reconnect returns last 50 messages (verify gap recovery)
- Chat history scroll-back loads older messages via HTTP
- Page refresh -> chat reconnects, lobby state restored
- Unspent points badge visible when points > 0

**Risks:**
- Chat message volume at scale: cap global messages at ~500 in memory per `04` Section 9. Monitor memory.
- Two simultaneous SignalR connections (chat now, battle later): validate that both can coexist without interference.
- DM notification during DM panel being open: ensure deduplication prevents double display.

---

### Phase 5: Matchmaking

**Goal:** A player can enter the matchmaking queue, see a searching state with cancel option, and automatically transition to battle when a match is found.

**Scope:**

*Matchmaking module:*
- Matchmaking Zustand store: `status` (`idle` | `searching` | `matched` | `battleTransition`), `matchId`, `battleId`, `matchState`
- `useMatchmakingPolling()` hook: starts polling on `searching` status, stops on status change or unmount
- Polling interval: 2 seconds
- Polling resilience: single failure -> silent retry; 3+ consecutive failures -> show warning

*Queue operations:*
- "Enter Queue" button on lobby -> `POST /api/v1/queue/join`
- 409 handling (already matched) -> extract match details, transition to battle
- "Cancel" button on searching screen -> `POST /api/v1/queue/leave`
- Cancel response handling: `LeftQueue: false` with match details -> transition to battle

*Searching screen (`/matchmaking`):*
- Searching indicator (animated)
- Cancel button
- Elapsed time display
- Status text based on `MatchState` progression

*State transitions:*
- `Searching` -> continue polling
- `Matched` with `BattleId` -> stop polling, navigate to `/battle/:battleId`
- `Matched` without `BattleId` -> show "Preparing battle...", continue polling
- `Idle`/`NotQueued` (was Searching) -> inform player (queue TTL expired), return to lobby
- `TimedOut` -> inform player (battle creation failed), allow re-queue

*Automatic battle transition (REQ-L7):*
- When `Matched` + `BattleId` detected -> immediate navigation to battle route

*Best-effort queue leave on browser close (DES-1) -- NON-BLOCKING:*
- `navigator.sendBeacon()` on `pagehide` event calling `POST /api/v1/queue/leave`
- **Note:** `sendBeacon` cannot set custom `Authorization` headers. This feature only works if BFF supports unauthenticated leave or a query-param auth approach. If neither is available, skip this and rely on the 30-minute queue TTL. This is best-effort (DES-1) and is NOT required for Phase 5 completion. Deferred to Phase 9 (hardening) if BFF changes are needed.

**Key outputs:**
- Enter queue -> searching state with animation and cancel
- Match found -> automatic transition to battle route (battle UI is placeholder until Phase 7)
- Cancel works correctly including the race where match was found before cancel
- Queue timeout (30 min) handled gracefully
- Page refresh during search -> recovery via `GameStateLoader` -> resume searching

**Dependencies:** Phase 4 (lobby as the launch point for matchmaking). Battle hub manager from Phase 1 (connection established in Phase 6).

**Validation / exit criteria:**
- Join queue -> status transitions through `Searching` (verify via polling)
- With two test accounts: both join queue -> match found -> both transition to battle route
- Cancel during search -> return to lobby, queue status clears
- Cancel when already matched -> transition to battle (not back to lobby)
- Page refresh during search -> resume searching screen
- Polling continues correctly across multiple polls
- 3+ failed polls -> connectivity warning shown

**Risks:**
- Poll interval timing: too fast wastes resources, too slow feels unresponsive. 2 seconds is the sweet spot per backend guidance.
- Race between cancel request and match found: the API handles this (returns `LeftQueue: false` with match info), but the frontend must process it correctly.

---

### Phase 6: Battle transport + state machine

**Goal:** The battle state machine is fully operational. The app can connect to `/battlehub`, join a battle, process all SignalR events, and maintain correct state through the full battle lifecycle. No battle-specific UI yet -- this phase validates the state layer.

**Scope:**

*Battle Zustand store:*
- Full state machine per `04` Section 8
- States: `Idle`, `Connecting`, `WaitingForJoin`, `ArenaOpen`, `TurnOpen`, `Submitted`, `Resolving`, `Ended`, `ConnectionLost`, `Error`
- All transitions defined and enforced
- Turn-local state: `turnIndex`, `deadline`, `selectedAttackZone`, `selectedBlockPair`, `isSubmitted`
- HP state: `playerHp`, `opponentHp`, `playerMaxHp`, `opponentMaxHp`
- Player identity: `playerId`, `playerName`, `opponentId`, `opponentName`
- End state: `endReason`, `winnerId`, `isVictory`, `isDraw`
- Narration feed: `feedEntries[]` with deduplication by `Key`

*Battle hub integration:*
- `useBattleConnection(battleId)` hook: connects hub, calls `JoinBattle`, processes snapshot, registers event handlers, disconnects on cleanup
- Event handlers wired to store actions per `04` Section 4.8.1:
  - `BattleReady` -> `handleBattleReady`
  - `TurnOpened` -> `handleTurnOpened` (update turn index, deadline, reset turn-local state)
  - `PlayerDamaged` -> `handlePlayerDamaged` (update HP)
  - `TurnResolved` -> `handleTurnResolved` (store resolution details)
  - `BattleStateUpdated` -> `handleStateUpdated` (authoritative sync -- overwrite HP, phase, turn)
  - `BattleEnded` -> `handleBattleEnded` (transition to Ended, store result)
  - `BattleFeedUpdated` -> `handleFeedUpdated` (append narration entries, dedup by Key)
  - `BattleConnectionLost` -> `handleConnectionLost`

*Turn action submission:*
- `battleStore.submitAction(attackZone, blockPair)`: validates inputs, constructs JSON string payload, calls `SubmitTurnAction(battleId, turnIndex, payload)`
- Transitions to `Submitted` state locally

*Zone model utilities:*
- `BattleZone` enum: `Head`, `Chest`, `Belly`, `Waist`, `Legs`
- Adjacent pair definitions (5 valid patterns)
- `isValidBlockPair(primary, secondary)` validation function

*Reconnection:*
- On reconnect: `JoinBattle(battleId)` -> snapshot replaces all state
- On battle ended during disconnect: snapshot phase is `Ended` -> transition to `Ended` state

*Opponent DM suppression integration:*
- On battle start: `chatStore.setSuppressedOpponent(opponentId)`
- On battle end: `chatStore.clearSuppressedOpponent()`

*Minimal battle screen (state debug view):*
- Display current phase, turn index, HP values, deadline, connection state
- Simple text-based action submission (select zones from dropdowns, submit button)
- Display raw event log for debugging
- This is NOT the final battle UI -- it validates state machine correctness

**Key outputs:**
- Connect to battle, see snapshot applied to state
- Events process correctly through full turn cycle
- Turn submission works (action accepted by server)
- State machine transitions are correct
- Reconnection restores state from snapshot
- Feed entries accumulate with deduplication
- Opponent DM suppression activates during battle

**Dependencies:** Phase 5 (matchmaking delivers a `BattleId` to connect to). Phase 4 (chat store for DM suppression).

**Validation / exit criteria:**
- Two clients matched -> both connect to battle -> see initial snapshot
- Turn submitted by both -> `TurnResolved` received by both -> state updates correctly
- HP values update via `PlayerDamaged` and reconcile via `BattleStateUpdated`
- Full battle played to completion (one player reaches 0 HP) -> `BattleEnded` received, state transitions to `Ended`
- `DoubleForfeit` scenario (both do nothing for 10 turns) -> battle ends correctly
- Disconnect mid-battle -> reconnect -> `JoinBattle` returns current snapshot -> state reconciled
- Page refresh mid-battle -> startup recovery -> reconnect to battle
- Narration feed entries arrive and are stored (no duplicates)
- Opponent DM suppression: DM from opponent during battle stored but no notification shown

**Risks:**
- **Highest risk phase.** Event ordering and state machine transitions must be exactly right. Any bug here means incorrect game state.
- Race between `TurnResolved` and `TurnOpened` in rapid succession. The reducer pattern must process events sequentially.
- `actionPayload` must be `JSON.stringify(object)`, not the object itself. Getting this wrong means silent `NoAction` with no server error.
- `BattleFeedUpdated` may arrive after `TurnOpened` for the next turn. The UI must not block on narration.

---

### Phase 7: Battle UI

**Goal:** The full battle user interface: zone selector, HP bars, turn timer, combat resolution display, narration feed, and battle end overlay. Replaces the debug view from Phase 6.

**Scope:**

*Battle screen (`/battle/:battleId`):*
- Full-screen layout (BattleShell) with no lobby chrome
- Structured as: HUD (top) + combat area (center) + narration feed (side/bottom)

*Battle HUD (`BattleHud.tsx`):*
- Player HP bar (animated, color transitions at thresholds per design tokens: green > yellow > red)
- Opponent HP bar (same)
- Turn counter
- Phase indicator (TurnOpen, Resolving, Waiting)
- Connection status indicator

*Turn timer:*
- Countdown based on `DeadlineUtc - 1.5 seconds` (DEC-4)
- Visual urgency as time runs low (color change, animation)
- Disabled state after submission

*Zone selector (`ZoneSelector.tsx`):*
- Attack zone: select 1 of 5 zones (visual representation of the ring topology)
- Block pair: select 1 of 5 valid adjacent pairs (NOT arbitrary two-zone selection)
- Visual ring/body representation showing zones
- Selected state highlighting
- Disabled after submission or outside TurnOpen phase
- Submit button: validates selection, calls `battleStore.submitAction()`
- "Submitted" indicator after submission (optimistic local state, REQ-B5)

*Turn result display (`TurnResultDisplay.tsx`):*
- Shows both players' actions from `TurnResolved`
- Attack zone chosen, block zones chosen
- Outcome per direction: Hit, Blocked, Dodged, CriticalHit, NoAction, etc.
- Damage dealt
- Animated transitions between turns

*Narration feed (`NarrationFeed.tsx`):*
- Scrollable log of `BattleFeedEntry` items
- Styled by `Kind`, `Severity`, `Tone` (Critical entries highlighted, System entries subdued, etc.)
- Auto-scroll to newest entry
- Entries arrive via `BattleFeedUpdated` events

*Battle end overlay (`BattleEndOverlay.tsx`):*
- Victory / Defeat / Draw display based on `endReason` and `winnerId`
- Per REQ-B8: `Normal` -> winner/loser, `DoubleForfeit` -> mutual inactivity, `SystemError` -> error message, others -> generic
- "View Results" or "Continue" action -> navigates to `/battle/:battleId/result`

*Animations (via Framer Motion):*
- HP bar changes (smooth transition)
- Damage flash on HP bar
- Zone selector hover/select states
- Turn transition
- Battle end entrance

**Key outputs:**
- Complete battle experience from first turn to battle end
- Zone selection feels intuitive (ring topology visible)
- Combat results are clear and readable
- Narration adds flavor without blocking gameplay
- Turn timer creates appropriate urgency
- Battle end is dramatic and clear

**Dependencies:** Phase 6 (battle state machine provides all data).

**Validation / exit criteria:**
- Full battle played through the UI feels correct and responsive
- Zone selector only allows valid adjacent block pairs
- Turn timer counts down accurately (within ~1 second of server deadline minus buffer)
- HP bars animate smoothly on damage
- Turn results display both directions of combat clearly
- Narration entries styled differently by Severity/Tone
- Battle end overlay shows correct outcome for Normal, DoubleForfeit, SystemError
- "Submitted" indicator appears immediately after action submission (before server response)
- UI disabled during Resolving phase (no double submit possible)
- Connection lost indicator visible when battle hub disconnects
- Reconnection restores UI state from snapshot

**Risks:**
- Zone selector UX: the ring topology with adjacent pairs must be intuitive. May require iteration on the visual representation.
- Animation performance during rapid event processing. Framer Motion is generally fast, but test with rapid turn resolution.
- Narration lag: `BattleFeedUpdated` may arrive after the next `TurnOpened`. The UI must allow the player to act on the next turn without waiting for narration.

---

### Phase 8: Post-battle / result flow

**Goal:** After battle ends, the player sees a result screen with the battle feed, then returns to the lobby with updated character state (XP, level, potentially new unspent points).

**Scope:**

*Battle result screen (`/battle/:battleId/result`):*
- Battle outcome display (victory / defeat / draw with appropriate messaging)
- Full narration feed (either from accumulated `BattleFeedUpdated` events or fetched via `GET /api/v1/battles/{battleId}/feed`)
- Feed deduplication by `Key` field if both sources used
- "Return to Lobby" / "Finish Battle" button
- Result screen stays until player explicitly dismisses (REQ-P1)

*Post-battle state refresh (DEC-5):*
- On lobby return: immediately fetch `GET /api/v1/game/state`
- If XP/level unchanged from pre-battle: retry once after 3 seconds
- If level-up occurred (`UnspentPoints` increased): show level-up notification toast
- Update player store with new character data

*Feed endpoint integration:*
- `GET /api/v1/battles/{battleId}/feed` via TanStack Query
- Fallback for missed live events
- Merge with live events using `Key` deduplication

*State cleanup:*
- Battle store reset to `Idle` on result dismissal
- Battle hub disconnected
- Chat DM suppression cleared (opponent DM suppression lifted)
- Chat reconnection if needed (chat should still be connected per DEC-2, but verify)

*Lobby re-entry:*
- Navigate to `/lobby`
- Character summary refreshed with new XP/level
- Chat still connected (session-scoped)
- "Enter Queue" available immediately (no cooldown, REQ-P4)

**Key outputs:**
- Result screen with battle outcome and full narration feed
- Level-up notification if applicable
- Clean return to lobby with updated state
- Immediate re-queueing possible

**Dependencies:** Phase 7 (battle UI produces `Ended` state and navigates to result).

**Validation / exit criteria:**
- After battle ends, result screen shows correct outcome (win/loss/draw)
- Narration feed on result screen includes all entries from the battle
- "Return to Lobby" returns to lobby with character summary
- Post-battle XP update reflected (may require the 3-second retry)
- Level-up toast appears when applicable
- After result dismissal, player can immediately re-enter queue
- Full game loop: lobby -> queue -> battle -> result -> lobby -> queue -> battle works end-to-end
- Chat connection persists through battle and back to lobby without manual reconnection
- Former opponent's DMs become visible again after battle ends

**Risks:**
- XP update timing: if the async processing takes longer than 3 seconds, the player won't see the update until the next lobby load. Acceptable per DEC-5.
- Feed endpoint returning 403/404: if the battle is still processing or the ID is wrong. Handle gracefully with "Feed unavailable" message.

---

### Phase 9: Hardening / error handling / reconnection / polish

**Goal:** Address cross-cutting concerns, edge cases, error handling polish, and reconnection reliability. Make the app production-ready.

**Scope:**

*Error handling polish:*
- Review all HTTP error paths: 400 (field errors inline), 401 (global redirect), 409 (context-specific), 503 (degraded state), 500 (generic toast with trace ID)
- Review all SignalR error paths: hub exceptions (generic error display), connection drops (reconnection flow)
- Chat error handling completeness: all `ChatError` codes tested and displayed correctly
- `DegradedServices` handling: lobby shows which capabilities are unavailable when BFF reports degraded services
- Error boundary at app root for unhandled React errors
- `traceId` display in error toasts for support

*Reconnection hardening:*
- Battle hub: verify reconnection + `JoinBattle` resync under various failure scenarios (server restart, network blip, long disconnection)
- Chat hub: verify reconnection + `JoinGlobalChat` resync (message gap recovery, presence re-registration)
- Matchmaking polling: verify resume after network recovery
- Verify two simultaneous reconnections (battle + chat) don't interfere
- Edge case: token expiry during active battle + disconnection -> auth error flow

*State consistency:*
- Verify no stale state persists after page refresh (all stores reset, all state re-derived from server)
- Verify `Revision` tracking for stat allocation (optimistic concurrency conflict resolution)
- Verify chat message deduplication under rapid reconnection (duplicate `JoinGlobalChat` calls)
- Verify battle state machine cannot reach impossible states (review all transition guards)

*Browser lifecycle:*
- `sendBeacon` for queue leave on `pagehide` (best-effort, DES-1)
- Tab visibility changes: pause/resume non-critical polling or animations when tab is hidden
- Handle `beforeunload` for active battle warning

*Performance review:*
- Chat message list with many messages (500+ cap working correctly, no memory leak)
- Battle event processing under rapid turns (no UI lag)
- TanStack Query cache cleanup (stale player cards, old game state queries)

*UI polish:*
- Loading states for all async operations (not just spinners -- skeleton states where appropriate)
- Transition animations between screens (route transitions via Framer Motion)
- Empty states (no online players, no DM conversations, no unspent points)
- Keyboard accessibility for zone selector
- Focus management on screen transitions
- Toast notification stacking and dismissal behavior

*Logout flow:*
- Clean disconnection of all SignalR connections before Keycloak redirect
- All stores cleared
- TanStack Query cache cleared
- No stale state on re-login

**Key outputs:**
- All error scenarios produce clear, actionable user feedback
- Reconnection works reliably under realistic failure conditions
- No memory leaks in long sessions
- Polish details make the app feel production-ready
- Full game loop works reliably through disconnection and recovery

**Dependencies:** All prior phases. This phase is the final quality pass.

**Validation / exit criteria:**
- Full game loop played 5+ times without issues
- Simulated disconnection during battle -> reconnect -> continue battle -> correct outcome
- Simulated disconnection during chat -> reconnect -> messages recovered
- Page refresh at every possible state -> correct recovery
- Logout and re-login -> clean state, no stale data
- Error scenarios tested: 401, 400, 409, 503, 500, SignalR connection failures
- Chat rate limiting tested: countdown displays correctly, send re-enables after cooldown
- Degraded service handling: BFF returns `DegradedServices` -> UI shows appropriate indicators
- `sendBeacon` fires on tab close during search (verify via server logs)
- Performance: no visible lag during battle, no memory growth during long chat sessions

**Risks:**
- Reconnection edge cases are numerous. Focus on the highest-impact scenarios: mid-battle reconnection, chat reconnection with message gap, auth expiry during battle.
- Browser lifecycle events (`pagehide`, `beforeunload`) behave differently across browsers. Test in Chrome, Firefox, Safari at minimum.

---

## 5. Critical path analysis

### What blocks the rest

```
Phase 0 (scaffold)     -> blocks everything
Phase 1 (auth)         -> blocks everything after it; THE critical gate
Phase 2 (routing)      -> blocks all feature phases
Phase 6 (battle state) -> blocks battle UI and post-battle
```

Auth (Phase 1) is the single most important phase. If auth doesn't work, nothing else can be tested against the real backend. The Keycloak configuration must be verified as part of Phase 1.

### What can be parallelized safely

With proper coordination:

- **Within Phase 4:** Global chat, DM, online players list, and player card can be built in parallel as independent components once the chat store and hub manager are established.
- **Phase 7 (battle UI) sub-components:** Zone selector, HP bars, narration feed, and turn result display are independent components that can be built in parallel once the battle store provides data.
- **Phase 9 (hardening):** Error handling, reconnection testing, and UI polish are mostly independent work streams.

**Cannot be parallelized:**

- Phase 1 and Phase 2 are strictly sequential (auth before routing).
- Phase 6 must complete before Phase 7 (state machine before UI).
- Phase 5 must complete before Phase 6 (need a matchmaking flow to produce a battle).

### Highest-risk phase

**Phase 6 (battle transport + state machine)** is the highest-risk phase because:

1. The state machine has the most states and transitions of any module
2. Event ordering is critical -- getting it wrong produces incorrect game state with no server-side error
3. The `actionPayload` must be a JSON string, not an object -- a subtle bug that produces silent `NoAction`
4. Reconnection must resync from snapshot, replacing all local state
5. `BattleFeedUpdated` events are asynchronous relative to mechanical events and must not block gameplay

Mitigation: Phase 6 includes a debug view specifically to validate state machine correctness before building the real UI in Phase 7.

---

## 6. Testing and validation strategy by phase

| Phase | Validation approach | What matters |
|-------|-------------------|-------------|
| **0: Scaffold** | `npm run dev` starts, TypeScript compiles, Tailwind renders | Build tooling works |
| **1: Auth** | Manual login/register cycle, authenticated API call, SignalR negotiation, token refresh | Auth works end-to-end against real Keycloak |
| **2: Routing** | Navigate to every route as different user states (no char, Draft, Named, Ready, searching, matched) | Guards redirect correctly for every state |
| **3: Onboarding** | Complete onboarding flow, test validation errors (name taken, too short, stat overflow) | Server accepts inputs, state transitions correctly |
| **4: Chat** | Two clients in global chat, DMs between them, player cards, rate limit trigger, reconnection | Real-time messaging works, presence updates, reconnection recovers |
| **5: Matchmaking** | Two clients queue -> match -> transition, cancel, timeout simulation | Polling detects match, transitions are automatic, cancel handles race |
| **6: Battle state** | Two clients battle through full lifecycle, verify state machine via debug view, reconnection test | Event processing is correct, state machine transitions are valid, reconnection resyncs |
| **7: Battle UI** | Play full battles using the real UI, verify zone selector constraints, timer accuracy, animations | UX is correct and responsive, zone constraints enforced visually |
| **8: Post-battle** | Complete loop: battle -> result -> lobby -> re-queue, verify XP update | End-to-end loop works, state cleanup is complete |
| **9: Hardening** | Failure injection (kill services, drop connections, expire tokens), long session testing | App recovers gracefully from all failure modes |

### Practical validation focus

- **Phases 1-3:** Validate against real Keycloak and BFF. These are integration-heavy; mocking is counterproductive.
- **Phase 4:** Two browser windows (or tabs) with different accounts. Real-time messaging requires real connections.
- **Phases 5-8:** Two browser windows required for matchmaking and battle. The full loop cannot be tested solo.
- **Phase 9:** Deliberately break things. Kill Docker containers, simulate network interruptions (`chrome://flags/#enable-network-service-in-process` or devtools throttling).

### Unit testing candidates

- Battle state machine transitions (Phase 6): pure function, testable without SignalR
- Zone model validation (`isValidBlockPair`): pure function
- Action payload construction: pure function
- Chat message deduplication logic: pure function
- HTTP error parsing: pure function
- Turn deadline buffer calculation: pure function

These are the areas where unit tests add the most value. UI component tests (snapshot tests, render tests) are lower priority for the initial implementation.

---

## 7. Recommended implementation milestones

These are points where the app is meaningfully reviewable or demoable.

### Milestone 1: "Authenticated shell" (end of Phase 2)
- App authenticates via Keycloak
- Correct screen shown for any user state
- Route guards working
- **Demoable:** Show login/register flow and routing for different states

### Milestone 2: "Playable character" (end of Phase 3)
- New user can create a character through onboarding
- Character data visible in lobby placeholder
- **Demoable:** Full onboarding flow from registration to lobby

### Milestone 3: "Social lobby" (end of Phase 4)
- Lobby with live chat, online players, DMs, player cards
- **Demoable:** Two users chatting in the lobby, viewing each other's cards, sending DMs

### Milestone 4: "Matchable" (end of Phase 5)
- Queue -> match -> transition to battle (debug view)
- **Demoable:** Two users queue, get matched, see battle state

### Milestone 5: "Full battle" (end of Phase 7)
- Complete battle UI with zone selection, HP bars, timer, narration
- **Demoable:** Two users play a full battle through the UI

### Milestone 6: "Complete loop" (end of Phase 8)
- Battle -> result -> lobby -> re-queue -> battle
- **Demoable:** Full game loop repeated multiple times

### Milestone 7: "Production ready" (end of Phase 9)
- All error handling, reconnection, polish complete
- **Demoable:** App handles failure scenarios gracefully

---

## 8. Known risks and open follow-ups

### Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Keycloak CORS with Vite dev server** | Blocks Phase 1 entirely | Configure Vite proxy or BFF CORS headers. Test early. |
| **Battle event ordering under rapid turns** | Incorrect game state | Reducer pattern in battle store processes events sequentially. Debug view in Phase 6 validates before UI. |
| **Two simultaneous SignalR connections (battle + chat)** | Resource contention, connection interference | Connections are independent managers. Test coexistence in Phase 6. |
| **`actionPayload` as JSON string (not object)** | Silent NoAction, hard to debug | Payload construction is a single utility function with a unit test. Validated in Phase 6 debug view. |
| **Token expiry during active battle** | Battle connection breaks on reconnect | Token lifespan is 1 hour; battles are minutes. Edge case handled in Phase 9. |
| **Chat message memory growth** | Performance degradation in long sessions | 500-message cap on global chat. Monitor in Phase 9. |

### Open follow-ups (non-blocking for implementation)

| Item | Source | Status |
|------|--------|--------|
| **DEC-7: Keycloak realm registration behavior** | `04` Section 7 | Frontend implements both paths. Verify against real realm on first Phase 1 test. |
| **Own win/loss in `GameStateResponse`** | DEC-3, DES-3 | Using card endpoint workaround. Backend change deferred. |
| **Battle history list endpoint** | `01` Section 12 (G2) | Not available. No battle history screen in this plan. |
| **Chat message retention window** | V-10 | Configurable server-side. Frontend handles finite history. |
| **`sendBeacon` reliability** | DES-1 | Best-effort (~80% reliable). 30-min TTL is the fallback. |

---

## 9. What to do immediately after this document

1. **Review this plan** for completeness and phase sequencing. Confirm the order makes sense for the available infrastructure.

2. **Create the task decomposition** (`07-frontend-task-decomposition.md`). Break each phase into discrete, implementable tickets. Each ticket should be small enough for a single implementation + review cycle.

3. **Verify infrastructure prerequisites.** Run `docker-compose up`, confirm Keycloak imports `kombats-realm.json` with `kombats-web` client, confirm BFF starts and responds to `GET /health`.

4. **Start Phase 0.** The scaffold phase has no external dependencies and can begin immediately.

# Kombats Frontend Task Breakdown

## Changelog

**2026-04-16 -- Initial version**
**2026-04-16 -- Corrective pass:** Fixed critical path notation to reflect Phase 1 parallelism, repositioned P5.3 as non-blocking/skippable, added mid-Phase 4 review checkpoint, clarified onboard call placement in P3.3.

---

## 1. Execution strategy summary

### Approach

Each phase from `06-frontend-implementation-plan.md` is decomposed into discrete tasks. Tasks are sized so that an implementation agent can execute one task, produce reviewable output, and move on. A reviewer validates each task against the explicit outputs before the next task starts (within a phase) or before the next phase begins (across phases).

### Task sizing principles

- A task produces 1-5 files or modifies a bounded set of files
- A task has a single clear goal, not "build the chat module"
- Tasks that produce shared infrastructure (stores, transport, types) are separated from tasks that produce UI
- Tasks that can be validated independently are preferred over tasks that require the full phase to be complete

### Naming convention

Tasks are numbered `P{phase}.{sequence}`. Dependencies reference these IDs.

### Clarification on chat during battle

Per binding decision DEC-2 and the clarification provided with this task:

- `/chathub` connection is session-scoped (established at `AuthenticatedShell` level)
- The connection remains active during battle -- it is NOT disconnected
- Global chat events continue flowing during battle
- DM messages from the current battle opponent are persisted server-side but suppressed in the UI (no notification, hidden conversation) during the active battle
- After `BattleEnded`, opponent DM suppression is lifted; conversation becomes visible with all messages intact
- This is implemented via `suppressedOpponentId` in the chat store

---

## 2. Phase-by-phase task breakdown

---

### Phase 0: Project Scaffold

---

#### P0.1: Initialize Vite + React project

**Goal:** A running Vite dev server with React 19 and TypeScript.

**Scope:**
- `npm create vite` with React + TypeScript template
- Upgrade to React 19 if template ships React 18
- Configure `tsconfig.json`: strict mode, path aliases (`@/*` -> `src/*`)
- Configure `vite.config.ts`: path alias resolution, dev server port
- Verify `npm run dev` starts and renders

**Outputs:**
- `package.json` with React 19, Vite
- `tsconfig.json` with strict, paths
- `vite.config.ts` with resolve aliases
- `src/main.tsx`, `src/App.tsx` (placeholder)

**Dependencies:** None.

**Validation:** `npm run dev` starts, browser shows placeholder, TypeScript compiles with zero errors.

---

#### P0.2: Install all dependencies

**Goal:** Every package from `04` Section 3.8 is installed and resolvable.

**Scope:**
- Production deps: `react-router@7`, `zustand@5`, `@tanstack/react-query@5`, `@microsoft/signalr@8`, `oidc-client-ts`, `react-oidc-context`, `tailwindcss@4`, `@radix-ui/*` (dialog, tooltip, scroll-area, tabs), `clsx`, `tailwind-merge`, `lucide-react`, `motion`, `sonner`, `date-fns`
- Dev deps: ESLint, Prettier, `@types/*`
- Pin versions where architecture specifies them

**Outputs:**
- `package.json` updated with all deps
- `package-lock.json` regenerated
- ESLint + Prettier configs (`.eslintrc.cjs` or `eslint.config.js`, `.prettierrc`)

**Dependencies:** P0.1

**Validation:** `npm install` succeeds, `npm run dev` still works, `npx tsc --noEmit` passes.

---

#### P0.3: Create folder structure and design tokens

**Goal:** The full `src/` directory structure from `04` Section 6.1 exists. Tailwind is configured with design tokens.

**Scope:**
- Create all directories: `src/app/shells/`, `src/modules/{auth,player,onboarding,matchmaking,battle,chat}/`, `src/transport/{http/endpoints,signalr,polling}/`, `src/ui/{components,theme}/`, `src/types/`
- Create `src/ui/theme/tokens.css` with the CSS variable set from `04` Section 5.3 (colors, spacing, typography, HP bar colors, zone colors)
- Create `src/ui/theme/fonts.css` (import statements for Inter, Orbitron, JetBrains Mono)
- Configure Tailwind 4: `@theme` block referencing CSS variables
- Import tokens in the app entry point

**Outputs:**
- All directories from `04` Section 6.1 (can contain empty `.gitkeep` or placeholder `index.ts`)
- `src/ui/theme/tokens.css`
- `src/ui/theme/fonts.css`
- Tailwind configured and functional

**Dependencies:** P0.2

**Validation:** A test component using `bg-[var(--color-bg-primary)]` or Tailwind-mapped token classes renders with the correct color. Folder structure matches architecture spec.

---

#### P0.4: Environment configuration

**Goal:** Environment variables for Keycloak and BFF are configured and accessible.

**Scope:**
- Create `.env.development` with `VITE_KEYCLOAK_AUTHORITY`, `VITE_KEYCLOAK_CLIENT_ID`, `VITE_BFF_BASE_URL`
- Create `src/config.ts` that reads `import.meta.env.VITE_*` and exports a typed config object
- Add `.env.development` values: `http://localhost:8080/realms/kombats`, `kombats-web`, `http://localhost:5200`
- Add `.env` to `.gitignore` (keep `.env.development` tracked or add `.env.example`)

**Outputs:**
- `.env.development`
- `src/config.ts`
- Updated `.gitignore`

**Dependencies:** P0.1

**Validation:** `import.meta.env.VITE_BFF_BASE_URL` returns `http://localhost:5200` in dev.

---

### Phase 1: Auth + Transport Foundation

---

#### P1.1: Shared type definitions

**Goal:** All TypeScript types matching the BFF contract are defined and usable across modules.

**Scope:**
- `src/types/api.ts`: `ApiError`, `GameStateResponse`, `CharacterResponse`, `QueueStatusResponse`, `OnboardingState` enum, request types (`SetNameRequest`, `AllocateStatsRequest`)
- `src/types/player.ts`: `PlayerCardResponse`
- `src/types/battle.ts`: `BattleZone` enum, `BattlePhase` enum, `BattleEndReason` enum, `AttackOutcome` enum, `BattleSnapshotRealtime`, `TurnOpenedRealtime`, `PlayerDamagedRealtime`, `TurnResolvedRealtime`, `BattleStateUpdatedRealtime`, `BattleEndedRealtime`, `BattleFeedEntry`, `BattleFeedKind`, `BattleFeedSeverity`, `BattleFeedTone`
- `src/types/chat.ts`: `ChatMessage`, `ChatConversation`, `OnlinePlayer`, `ChatError`, `JoinGlobalChatResponse`, `SendDirectMessageResponse`, `ChatErrorCode` enum
- `src/types/common.ts`: shared utility types

**Outputs:**
- `src/types/api.ts`
- `src/types/player.ts`
- `src/types/battle.ts`
- `src/types/chat.ts`
- `src/types/common.ts`

**Dependencies:** P0.3

**Validation:** TypeScript compiles. Types match BFF DTOs documented in `01-backend-revision-for-frontend.md`.

**Notes:** These types are derived from the backend contract. Reference `01` Sections 4-8 and `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts` for exact field names and shapes.

---

#### P1.2: HTTP client and endpoint modules

**Goal:** A typed HTTP client that injects auth tokens, handles errors, and provides per-endpoint methods.

**Scope:**
- `src/transport/http/client.ts`: `fetch` wrapper with `Authorization: Bearer` injection (reads token from auth store -- store created in P1.3), 401 interceptor (clears auth, navigates to `/`), error parsing into `ApiError`, base URL from config
- `src/transport/http/endpoints/game.ts`: `getState()`, `onboard()`
- `src/transport/http/endpoints/character.ts`: `setName(request)`, `allocateStats(request)`
- `src/transport/http/endpoints/queue.ts`: `join()`, `leave()`, `getStatus()`
- `src/transport/http/endpoints/battle.ts`: `getFeed(battleId)`
- `src/transport/http/endpoints/chat.ts`: `getConversations()`, `getMessages(conversationId, before?)`, `getDirectMessages(otherPlayerId, before?)`, `getOnlinePlayers(limit?, offset?)`
- `src/transport/http/endpoints/players.ts`: `getCard(playerId)`

**Outputs:**
- `src/transport/http/client.ts`
- 6 endpoint files under `src/transport/http/endpoints/`

**Dependencies:** P1.1 (types), P0.4 (config)

**Validation:** Endpoint functions are typed and compile. HTTP client can be tested manually once auth store (P1.3) exists.

**Notes:** The HTTP client reads the token from `authStore.getState().accessToken`. At this point the auth store is a forward dependency -- the client code references it but won't work until P1.3 is done. This is acceptable; both P1.2 and P1.3 are in the same phase and validated together.

---

#### P1.3: Auth module (store, provider, callbacks)

**Goal:** Working Keycloak OIDC authentication: login, register, callback, token storage, silent renewal, logout.

**Scope:**
- `src/modules/auth/store.ts`: Zustand store with `accessToken`, `userIdentityId`, `displayName`, `authStatus` (`loading` | `authenticated` | `unauthenticated`), actions: `setUser()`, `clearAuth()`, `getAccessToken()`
- `src/modules/auth/AuthProvider.tsx`: `react-oidc-context` `AuthProvider` wrapping `oidc-client-ts` `UserManager` with config from `05` Section 11 (authority, client_id, redirect_uri, response_type, scope, `InMemoryWebStorage` for user store, `sessionStorage` for PKCE state, `automaticSilentRenew: true`, `accessTokenExpiringNotificationTimeInSeconds: 60`)
- `src/modules/auth/AuthCallback.tsx`: Handles `/auth/callback` route. Processes OIDC callback, extracts tokens, updates auth store, navigates to `/`
- `src/modules/auth/hooks.ts`: `useAuth()` (returns auth state + login/register/logout actions), `useRequireAuth()` (redirects if not authenticated)
- Wire `AuthProvider` into `App.tsx`
- Login action: `userManager.signinRedirect()`
- Register action: `userManager.signinRedirect({ extraQueryParams: { kc_action: "register" } })`
- Logout action: disconnect connections, clear stores, `userManager.signoutRedirect()`
- Identity extraction: `sub` claim -> `userIdentityId`, `preferred_username` -> `displayName`
- Silent renewal: `userLoaded` event updates auth store with new token

**Outputs:**
- `src/modules/auth/store.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/AuthCallback.tsx`
- `src/modules/auth/hooks.ts`
- Updated `src/app/App.tsx`

**Dependencies:** P0.4 (config), P1.1 (types)

**Validation:** Login redirects to Keycloak, callback processes code exchange, auth store has token, `api.game.getState()` succeeds with token. Register redirects to Keycloak registration page. Logout clears state and redirects to Keycloak end_session. Silent renewal fires (verify by shortening access token lifespan in Keycloak to 2 minutes). Page refresh -> silent renewal recovers session.

**Risk:** CORS between Vite and Keycloak token endpoint. May need Vite proxy config (`vite.config.ts` proxy for `/realms`).

---

#### P1.4: TanStack Query provider setup

**Goal:** TanStack Query is configured and available throughout the app.

**Scope:**
- Create `QueryClient` with default options (stale time, retry config)
- Wrap `App.tsx` with `QueryClientProvider`
- Export query key factories for each endpoint domain (game, player, chat, battle)

**Outputs:**
- `src/app/query-client.ts` (or inline in `App.tsx`)
- Updated `src/app/App.tsx` with `QueryClientProvider`

**Dependencies:** P0.2 (TanStack Query installed)

**Validation:** A test query hook works (verified when game state fetch is wired in P2.1).

---

#### P1.5: SignalR battle hub manager

**Goal:** A typed `BattleHubManager` that can connect to `/battlehub`, expose hub methods, and route events.

**Scope:**
- `src/transport/signalr/connection-state.ts`: `ConnectionState` type (`disconnected` | `connecting` | `connected` | `reconnecting`)
- `src/transport/signalr/battle-hub.ts`:
  - Creates `HubConnection` with `withUrl(bffBaseUrl + "/battlehub", { accessTokenFactory })`, `withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 30000])`, JSON protocol
  - Methods: `connect()`, `disconnect()`, `joinBattle(battleId): Promise<BattleSnapshotRealtime>`, `submitTurnAction(battleId, turnIndex, payload): Promise<void>`
  - Event registration: typed `.on()` bindings for all battle events (`BattleReady`, `TurnOpened`, `PlayerDamaged`, `TurnResolved`, `BattleStateUpdated`, `BattleEnded`, `BattleFeedUpdated`, `BattleConnectionLost`)
  - Event callbacks are injectable (set by the battle store in Phase 6)
  - Connection state tracking (exposed as observable)
  - Reconnection lifecycle: `onreconnecting`, `onreconnected`, `onclose` handlers

**Outputs:**
- `src/transport/signalr/connection-state.ts`
- `src/transport/signalr/battle-hub.ts`

**Dependencies:** P1.1 (battle types), P1.3 (auth store for `accessTokenFactory`), P0.4 (config for BFF URL)

**Validation:** `BattleHubManager.connect()` negotiates a connection to `/battlehub` (even without a battle to join -- connection establishes, then can be disconnected). Connection state transitions correctly.

---

#### P1.6: SignalR chat hub manager

**Goal:** A typed `ChatHubManager` that can connect to `/chathub`, expose hub methods, and route events.

**Scope:**
- `src/transport/signalr/chat-hub.ts`:
  - Creates `HubConnection` with `withUrl(bffBaseUrl + "/chathub", { accessTokenFactory })`, same reconnect policy
  - Methods: `connect()`, `disconnect()`, `joinGlobalChat(): Promise<JoinGlobalChatResponse>`, `leaveGlobalChat(): Promise<void>`, `sendGlobalMessage(content): Promise<void>`, `sendDirectMessage(recipientPlayerId, content): Promise<SendDirectMessageResponse>`
  - Event registration: typed `.on()` for `GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`, `ChatConnectionLost`
  - Event callbacks injectable (set by chat store in Phase 4)
  - Connection state tracking

**Outputs:**
- `src/transport/signalr/chat-hub.ts`

**Dependencies:** P1.1 (chat types), P1.3 (auth store), P0.4 (config)

**Validation:** `ChatHubManager.connect()` negotiates a connection to `/chathub`. `joinGlobalChat()` returns a response with messages and online players.

---

#### P1.7: Matchmaking polling service

**Goal:** A polling service that calls queue status at a configurable interval.

**Scope:**
- `src/transport/polling/matchmaking-poller.ts`:
  - `start(intervalMs, callback)`: starts `setInterval` calling `api.queue.getStatus()`, passes result to callback
  - `stop()`: clears interval
  - Tracks consecutive failure count for resilience reporting
  - Exposes `isRunning` state

**Outputs:**
- `src/transport/polling/matchmaking-poller.ts`

**Dependencies:** P1.2 (HTTP client / queue endpoint)

**Validation:** Poller starts, calls endpoint on interval, stops cleanly. Compile-time verification; functional test when matchmaking store exists (P5.1).

---

### Phase 2: Startup State Resolution + Route Guards

---

#### P2.1: Player store and game state loading

**Goal:** The player Zustand store is populated from `GET /api/v1/game/state` on app load.

**Scope:**
- `src/modules/player/store.ts`: Zustand store with `character` (CharacterResponse | null), `queueStatus` (QueueStatusResponse | null), `isCharacterCreated` (boolean), `degradedServices` (string[] | null), `isLoaded` (boolean). Actions: `setGameState(response)`, `updateCharacter(character)`, `clearState()`
- `src/modules/player/hooks.ts`: `useGameState()` TanStack Query hook that fetches `GET /api/v1/game/state` and populates the player store. `useCharacter()` selector. `useQueueStatus()` selector.
- `GameStateLoader` component: calls `useGameState()`, shows loading spinner while pending, renders `<Outlet />` when loaded

**Note on auto-onboard:** `GameStateLoader` does NOT call `POST /api/v1/game/onboard`. That responsibility belongs to P3.3. At this phase, if game state returns no character, the `OnboardingGuard` (P2.3) routes the user to `/onboarding/name`. The actual onboard call is wired in Phase 3 via a `useAutoOnboard()` hook.

**Outputs:**
- `src/modules/player/store.ts`
- `src/modules/player/hooks.ts`
- `src/app/GameStateLoader.tsx` (or in `src/app/shells/`)

**Dependencies:** P1.2 (game endpoint), P1.3 (auth for token), P1.4 (TanStack Query)

**Validation:** After login, `GameStateLoader` fetches game state, player store is populated, loading screen shown during fetch.

---

#### P2.2: Route tree and shell layouts

**Goal:** All routes defined. Shell layouts render placeholder content for each flow.

**Scope:**
- `src/app/router.tsx`: Full route tree:
  - `/` -> `UnauthenticatedShell` (landing)
  - `/auth/callback` -> `AuthCallback`
  - Authenticated layout:
    - `OnboardingGuard` wrapping:
      - `/onboarding/name` -> placeholder
      - `/onboarding/stats` -> placeholder
    - `BattleGuard` wrapping:
      - `/battle/:battleId` -> placeholder
      - `/battle/:battleId/result` -> placeholder
    - `AuthenticatedShell` wrapping:
      - `/lobby` -> placeholder
      - `/matchmaking` -> placeholder
- `src/app/shells/UnauthenticatedShell.tsx`: Landing page with "Login" and "Register" buttons wired to auth hooks
- `src/app/shells/OnboardingShell.tsx`: Minimal centered layout
- `src/app/shells/AuthenticatedShell.tsx`: Header + main + sidebar skeleton
- `src/app/shells/BattleShell.tsx`: Full-screen layout

**Outputs:**
- `src/app/router.tsx`
- 4 shell components in `src/app/shells/`

**Dependencies:** P1.3 (auth hooks for login/register actions), P2.1 (player store for guard data)

**Validation:** Unauthenticated user sees landing. Login/Register buttons work. After auth, a placeholder authenticated layout appears.

---

#### P2.3: Route guards (AuthGuard, OnboardingGuard, BattleGuard)

**Goal:** Hard gates enforce correct routing based on auth and game state.

**Scope:**
- `AuthGuard`: Reads auth store. If `unauthenticated`, redirect to `/`. If `loading`, show spinner. If `authenticated`, render children and trigger `GameStateLoader`.
- `OnboardingGuard`: Reads player store `character.onboardingState`. If `Draft` -> redirect to `/onboarding/name`. If `Named` -> redirect to `/onboarding/stats`. If `Ready` -> render children. If no character -> redirect to `/onboarding/name` (will trigger onboard call in Phase 3).
- `BattleGuard`: Reads player store `queueStatus`. If `Status == "Matched"` and `battleId` exists -> redirect to `/battle/:battleId`. If `Status == "Searching"` -> redirect to `/matchmaking`. Otherwise render children.
- Wire guards into route tree per `04` Section 4.2 hierarchy

**Outputs:**
- `src/app/guards/AuthGuard.tsx`
- `src/app/guards/OnboardingGuard.tsx`
- `src/app/guards/BattleGuard.tsx`
- Updated `src/app/router.tsx`

**Dependencies:** P2.1 (player store), P2.2 (route tree), P1.3 (auth store)

**Validation:**
- New user (no character) -> `/onboarding/name`
- User with `Draft` -> `/onboarding/name`
- User with `Named` -> `/onboarding/stats`
- User with `Ready` + no queue -> `/lobby`
- User with `Searching` -> `/matchmaking`
- User with `Matched` + `BattleId` -> `/battle/:id`
- Page refresh at any state -> correct redirect
- Manual URL entry to guarded route -> redirected

---

### Phase 3: Onboarding

---

#### P3.1: Base UI primitives (Button, TextInput, Spinner, Card)

**Goal:** First batch of shared UI components used by onboarding screens.

**Scope:**
- `src/ui/components/Button.tsx`: Primary, secondary, danger variants. Disabled state. Loading state with spinner. Uses design tokens for colors.
- `src/ui/components/TextInput.tsx`: Label, placeholder, error message display. Character count indicator.
- `src/ui/components/Spinner.tsx`: Animated loading indicator.
- `src/ui/components/Card.tsx`: Container with background, border, padding from design tokens.

**Outputs:**
- 4 files in `src/ui/components/`

**Dependencies:** P0.3 (design tokens)

**Validation:** Components render correctly with Tailwind classes. Variants work. Can be reviewed visually in isolation (Storybook optional; direct render in a test page is fine).

---

#### P3.2: Name selection screen

**Goal:** Player can set their character name (Draft -> Named transition).

**Scope:**
- `src/modules/onboarding/screens/NameSelectionScreen.tsx`:
  - Text input for name
  - Client-side validation: 3-16 characters, non-empty
  - "This name is permanent" warning text
  - Submit button (disabled until valid)
  - Call `POST /api/v1/character/name` via TanStack Query mutation
  - Error handling: 409 -> "Name already taken", 400 -> field errors, 500 -> generic
  - On success: update player store character, `OnboardingGuard` redirects to `/onboarding/stats`
- `src/modules/onboarding/components/NameInput.tsx`: Reusable name input with validation display

**Outputs:**
- `src/modules/onboarding/screens/NameSelectionScreen.tsx`
- `src/modules/onboarding/components/NameInput.tsx`
- Updated `router.tsx` to render this screen at `/onboarding/name`

**Dependencies:** P3.1 (Button, TextInput), P2.3 (OnboardingGuard), P1.2 (character endpoint)

**Validation:** Enter valid name -> server accepts -> state transitions to Named -> redirected to stats screen. Name too short -> inline error. Duplicate name -> "already taken" error from 409.

---

#### P3.3: Stat allocation screen and onboard call

**Goal:** Player completes initial stat allocation (Named -> Ready) and the `POST /api/v1/game/onboard` call is wired for character creation.

**Scope:**
- Create a `useAutoOnboard()` hook (in `src/modules/onboarding/hooks.ts` or `src/modules/player/hooks.ts`) that calls `POST /api/v1/game/onboard` when the player store has no character (`character` is null after game state load). The call is idempotent. On success, refetch game state to populate the store with the newly created `Draft` character. Wire this hook into `GameStateLoader` (modifying the P2.1 output) so it fires automatically after game state loads with no character. The `OnboardingGuard` then routes the `Draft` character to `/onboarding/name`.
- `src/modules/onboarding/screens/InitialStatsScreen.tsx`:
  - Display current stats (3/3/3/3) and 3 unspent points
  - Increment/decrement buttons per stat (Strength, Agility, Intuition, Vitality)
  - Points remaining counter
  - Cannot go below base stat value (3 for each during onboarding)
  - Submit button: sends ADDITIVE values (points to add, not totals)
  - Tracks `ExpectedRevision` from player store
  - Call `POST /api/v1/character/stats`
  - Error handling: 409 (revision mismatch) -> refetch game state and retry, 400, 500
  - On success: update player store, guard redirects to `/lobby`
- `src/modules/onboarding/components/StatPointAllocator.tsx`: Reusable stat allocation widget (used again in lobby for post-level-up allocation)

**Outputs:**
- `src/modules/onboarding/screens/InitialStatsScreen.tsx`
- `src/modules/onboarding/components/StatPointAllocator.tsx`
- `useAutoOnboard()` hook (in `src/modules/onboarding/hooks.ts` or `src/modules/player/hooks.ts`)
- Updated `src/app/GameStateLoader.tsx` (add `useAutoOnboard()` call)
- Updated `router.tsx`

**Dependencies:** P3.2 (name screen done first so the flow is testable sequentially), P1.2 (game.onboard, character.allocateStats endpoints)

**Validation:** Full flow: new user -> onboard call creates character -> name screen -> stats screen -> allocate -> Ready state -> lobby. Revision mismatch -> handled. Page refresh at stats screen (Named state) -> returns to stats screen.

---

### Phase 4: Lobby Shell + Chat + Presence + Player Card

Phase 4 is split into 8 sub-tasks with a **mid-phase review checkpoint**.

**Execution order:** P4.1 (lobby shell) and P4.2 (chat store) can be parallel. Then P4.3 (chat connection hook). Then P4.4 (global chat) and P4.5 (online players) can be parallel.

**Mid-Phase 4 review checkpoint (after P4.1 + P4.2 + P4.3 + P4.4 + P4.5):**
Before starting DM, player card, and error handling, validate:
- Lobby renders character summary with correct data
- Global chat sends and receives messages in real time between two clients
- Chat connection indicator shows correct state
- Online players list populates and updates on login/logout
- Session-scoped chat connection survives navigation between authenticated routes

This checkpoint validates the session-scoped chat pattern before investing in the remaining sub-tasks.

**After checkpoint:** P4.6 (DM) and P4.7 (player card) can be parallel. P4.8 (error/reconnection) comes last.

---

#### P4.1: Lobby shell and character summary

**Goal:** The lobby screen displays character information with the correct layout structure.

**Scope:**
- Flesh out `AuthenticatedShell.tsx`: header with character name/level, main content area, sidebar area
- `src/modules/player/components/CharacterSummary.tsx`: Displays name, level, XP, stats (Str/Agi/Int/Vit), unspent points badge
- `src/modules/player/screens/LobbyScreen.tsx`: Composes character summary, queue button placeholder, and sidebar placeholders
- Own win/loss fetch (DEC-3 workaround): `usePlayerCard(ownIdentityId)` via TanStack Query to `GET /api/v1/players/{id}/card`, merge wins/losses into display
- `src/ui/components/Badge.tsx`: For unspent points indicator
- `src/ui/components/ProgressBar.tsx`: For XP bar

**Outputs:**
- Updated `src/app/shells/AuthenticatedShell.tsx`
- `src/modules/player/components/CharacterSummary.tsx`
- `src/modules/player/screens/LobbyScreen.tsx`
- `src/ui/components/Badge.tsx`
- `src/ui/components/ProgressBar.tsx`
- Updated `router.tsx` wiring

**Dependencies:** P3.3 (Ready state reached so lobby is accessible), P1.2 (players endpoint for card)

**Validation:** Lobby shows character name, level, XP, all 4 stats, wins/losses. Unspent points badge appears when `UnspentPoints > 0`.

---

#### P4.2: Chat Zustand store

**Goal:** The chat store matches the specification in `04` Section 9. Ready to be populated by hub events.

**Scope:**
- `src/modules/chat/store.ts`:
  - Shape: `connectionState`, `globalConversationId`, `globalMessages[]`, `directConversations` Map, `onlinePlayers` Map, `onlineCount`, `rateLimitState`, `suppressedOpponentId`, `lastError`
  - Actions: `setConnectionState()`, `setGlobalState(conversationId, messages, players, count)`, `addGlobalMessage(msg)`, `addDirectMessage(msg)`, `addOnlinePlayer(player)`, `removeOnlinePlayer(playerId)`, `handleChatError(error)`, `handleConnectionLost()`, `setSuppressedOpponent(id)`, `clearSuppressedOpponent()`, `clearStore()`
  - Message deduplication by `messageId` in all add methods
  - Global messages capped at 500 (trim oldest on overflow)
  - `addDirectMessage` checks `suppressedOpponentId`: if sender matches, stores message but returns a flag indicating suppressed (no toast)

**Outputs:**
- `src/modules/chat/store.ts`

**Dependencies:** P1.1 (chat types)

**Validation:** Store actions correctly add/deduplicate messages, manage presence map, handle rate limit state. Unit-testable.

---

#### P4.3: Chat connection hook

**Goal:** The `/chathub` connection is established at the `AuthenticatedShell` level and persists across lobby and battle.

**Scope:**
- `src/modules/chat/hooks.ts`:
  - `useChatConnection()`: On mount, calls `ChatHubManager.connect()`, then `joinGlobalChat()`. Registers all event callbacks to update `chatStore`. On unmount, calls `disconnect()`.
  - `useOnlinePlayers()`: Selector from chat store
  - `useGlobalMessages()`: Selector from chat store
  - `useChatConnectionState()`: Selector for connection state
- Wire event callbacks in the hub manager: `GlobalMessageReceived` -> `chatStore.addGlobalMessage`, `DirectMessageReceived` -> `chatStore.addDirectMessage`, `PlayerOnline` -> `chatStore.addOnlinePlayer`, `PlayerOffline` -> `chatStore.removeOnlinePlayer`, `ChatError` -> `chatStore.handleChatError`, `ChatConnectionLost` -> `chatStore.handleConnectionLost`
- On reconnect (hub `onreconnected`): call `joinGlobalChat()` again to resync state
- Call `useChatConnection()` in `AuthenticatedShell.tsx` (NOT in lobby specifically -- this ensures persistence across battle)

**Outputs:**
- `src/modules/chat/hooks.ts`
- Updated `src/app/shells/AuthenticatedShell.tsx`

**Dependencies:** P1.6 (ChatHubManager), P4.2 (chat store)

**Validation:** After login + game state load, chat hub connects. `JoinGlobalChat()` populates store with messages and online players. Hub connection survives navigation between lobby and other authenticated routes.

---

#### P4.4: Global chat panel

**Goal:** Global chat is visible in the lobby sidebar with real-time messaging.

**Scope:**
- `src/modules/chat/components/ChatPanel.tsx`:
  - Scrollable message feed reading from `chatStore.globalMessages`
  - Each message: sender name, content, timestamp (formatted via `date-fns`)
  - Auto-scroll to bottom on new message
  - Scroll-lock: if user has scrolled up, don't auto-scroll; show "new messages" indicator
  - Message input at bottom
- `src/modules/chat/components/MessageInput.tsx`:
  - Text input with 500-char limit
  - Character counter
  - Send button (disabled when empty, rate-limited, or over limit)
  - On send: calls `ChatHubManager.sendGlobalMessage(content)`
  - Rate limit state from `chatStore.rateLimitState.global`: if blocked, show countdown, disable send
- `src/ui/components/ConnectionIndicator.tsx`: Shows chat connection state (connected/reconnecting/disconnected)
- Integrate `ChatPanel` and `ConnectionIndicator` into lobby sidebar

**Outputs:**
- `src/modules/chat/components/ChatPanel.tsx`
- `src/modules/chat/components/MessageInput.tsx`
- `src/ui/components/ConnectionIndicator.tsx`
- Updated `LobbyScreen.tsx` or `AuthenticatedShell.tsx` sidebar

**Dependencies:** P4.3 (chat connection populates store)

**Validation:** Send a message -> appears in own feed. Open second browser/tab with another user -> messages appear in real time. Rate limit: send 6 messages in 10 seconds -> rate limited error shown with countdown.

---

#### P4.5: Online players list and presence

**Goal:** Online players list displays in the lobby, updated in real time.

**Scope:**
- `src/modules/chat/components/OnlinePlayersList.tsx`:
  - Reads `chatStore.onlinePlayers` and `chatStore.onlineCount`
  - Renders player list with display names
  - Click on player -> two actions: "View Profile" (opens player card), "Send Message" (opens DM)
  - Online count display
- `src/ui/components/Avatar.tsx`: Player avatar placeholder (initials or icon)
- Integrate into lobby sidebar (below or beside chat panel)

**Outputs:**
- `src/modules/chat/components/OnlinePlayersList.tsx`
- `src/ui/components/Avatar.tsx`
- Updated lobby sidebar

**Dependencies:** P4.3 (chat connection populates online players)

**Validation:** Log in with two accounts -> both appear in each other's online list. Log out one -> `PlayerOffline` event removes them from the list.

---

#### P4.6: Direct messaging

**Goal:** Players can send and receive DMs, view conversation list and history.

**Scope:**
- `src/modules/chat/components/ConversationList.tsx`:
  - Lists DM conversations from `chatStore.directConversations` ordered by `lastMessageAt`
  - Each entry: other player name, last message preview, timestamp
  - Click -> opens DM panel for that conversation
  - Fetch conversation list via `GET /api/v1/chat/conversations` (TanStack Query, on demand when DM panel opens)
  - Respects `suppressedOpponentId`: conversations where `otherPlayerId === suppressedOpponentId` are hidden
- `src/modules/chat/components/DirectMessagePanel.tsx`:
  - Message feed for a specific DM conversation
  - Scroll-back loads older messages via `GET /api/v1/chat/direct/{otherPlayerId}/messages?before={timestamp}` (cursor pagination)
  - Message input reuses `MessageInput.tsx` (with DM rate limit state)
  - Send via `ChatHubManager.sendDirectMessage(recipientId, content)`
  - `DirectMessageReceived` events append in real time (dedup by messageId)
- `src/ui/components/Sheet.tsx`: Slide-in panel (using Radix Sheet/Dialog) for DM view
- Toast notification for incoming DMs (via `sonner`): only if sender is NOT `suppressedOpponentId`
- `src/ui/components/Toast.tsx`: Wrapper around `sonner` Toaster

**Outputs:**
- `src/modules/chat/components/ConversationList.tsx`
- `src/modules/chat/components/DirectMessagePanel.tsx`
- `src/ui/components/Sheet.tsx`
- `src/ui/components/Toast.tsx`
- Updated lobby layout with DM access

**Dependencies:** P4.3 (chat connection), P4.2 (store with DM handling), P4.4 (MessageInput reuse)

**Validation:** Click player in online list -> "Send Message" -> DM panel opens -> type and send -> recipient receives in real time. Conversation appears in conversation list. Scroll back loads older messages. Toast appears for incoming DM (but NOT from suppressed opponent -- tested properly in Phase 6).

---

#### P4.7: Player card

**Goal:** Any player's public profile can be viewed as a non-blocking overlay.

**Scope:**
- `src/modules/player/components/PlayerCard.tsx`:
  - Fetches `GET /api/v1/players/{playerId}/card` via TanStack Query (`staleTime: 60000` for caching)
  - Displays: display name, level, stats (4 fields), wins, losses
  - Loading state while fetching
  - 404 -> "Player not found"
  - Displayed in a `Sheet` overlay (non-blocking)
- `src/modules/player/hooks.ts`: Add `usePlayerCard(playerId)` hook
- Integration points: "View Profile" from online players list (P4.5), from DM conversation header

**Outputs:**
- `src/modules/player/components/PlayerCard.tsx`
- Updated `src/modules/player/hooks.ts`

**Dependencies:** P1.2 (players endpoint), P4.5 (integration point from online players list)

**Validation:** Click player name -> card overlay shows with correct data. Dismiss overlay -> returns to previous view. Second click on same player -> cached response (fast).

---

#### P4.8: Chat error and reconnection handling

**Goal:** All chat error codes are handled. Chat reconnection restores state.

**Scope:**
- `src/modules/chat/components/ChatConnectionStatus.tsx`: Displays connection state. Shows "Chat unavailable" when disconnected. Shows "Reconnecting..." during reconnect.
- Verify all `ChatError` codes produce correct UI:
  - `rate_limited` -> countdown display (already in P4.4)
  - `message_too_long` -> inline error
  - `message_empty` -> inline error
  - `recipient_not_found` -> toast error
  - `not_eligible` -> "Complete onboarding to use chat"
  - `service_unavailable` -> "Chat temporarily unavailable"
- Reconnection behavior: on reconnect, `JoinGlobalChat()` is called (in P4.3). Verify that the last 50 messages repopulate the store and deduplication works.
- `ChatConnectionLost` event handling: show indicator, begin reconnect attempt

**Outputs:**
- `src/modules/chat/components/ChatConnectionStatus.tsx`
- Error handling integrated into `ChatPanel`, `MessageInput`, `DirectMessagePanel`

**Dependencies:** P4.3 (connection hook), P4.4 (global chat), P4.6 (DM)

**Validation:** Kill Chat docker container -> `ChatConnectionLost` shown -> restart -> chat reconnects -> messages recovered. Send message while disconnected -> appropriate error. All error codes produce readable messages.

---

### Phase 5: Matchmaking

---

#### P5.1: Matchmaking store and polling hook

**Goal:** Matchmaking state machine and polling lifecycle are operational.

**Scope:**
- `src/modules/matchmaking/store.ts`: Zustand store with `status` (`idle` | `searching` | `matched` | `battleTransition`), `matchId`, `battleId`, `matchState`, `searchStartedAt`, `consecutiveFailures`. Actions: `setSearching()`, `updateFromPoll(response)`, `setIdle()`, `setBattleTransition(battleId)`
- `src/modules/matchmaking/hooks.ts`:
  - `useMatchmaking()`: returns store state + join/leave actions
  - `useMatchmakingPolling()`: starts poller when `status === 'searching'`, stops when status changes. Calls `matchmakingPoller.start(2000, callback)`. Callback calls `store.updateFromPoll()`. Handles transitions: `Matched` + `BattleId` -> `store.setBattleTransition()` + navigate to `/battle/:battleId`. `Idle`/`NotQueued` -> `store.setIdle()`. `TimedOut` -> show toast, set idle.
- Queue join: `POST /api/v1/queue/join` -> on success, `store.setSearching()`. On 409 (already matched) -> extract match details, navigate to battle.
- Queue leave: `POST /api/v1/queue/leave` -> if `LeftQueue: true`, `store.setIdle()`. If `LeftQueue: false` with match details -> navigate to battle.

**Outputs:**
- `src/modules/matchmaking/store.ts`
- `src/modules/matchmaking/hooks.ts`

**Dependencies:** P1.2 (queue endpoints), P1.7 (matchmaking poller), P2.1 (player store for queue status recovery)

**Validation:** Call join -> store transitions to `searching`. Poller starts. Cancel -> store transitions to `idle`. Poller stops. Match found (tested with two accounts) -> store transitions, navigation triggered.

---

#### P5.2: Matchmaking UI (lobby button + searching screen)

**Goal:** The lobby has a "Find Battle" button and the searching screen shows status with cancel.

**Scope:**
- `src/modules/matchmaking/components/QueueButton.tsx`: "Find Battle" button on lobby. Disabled if already searching or matched. Calls matchmaking join action.
- `src/modules/matchmaking/screens/SearchingScreen.tsx`:
  - Animated searching indicator
  - Elapsed time since search started
  - "Cancel" button -> calls queue leave
  - Status text: "Searching for opponent...", "Preparing battle..." (when `Matched` without `BattleId`)
  - Connectivity warning if 3+ consecutive poll failures
- `src/modules/matchmaking/components/SearchingIndicator.tsx`: Animated visual (spinner, pulsing, etc.)
- Wire into router: `/matchmaking` -> `SearchingScreen`
- Update `LobbyScreen.tsx` to include `QueueButton`

**Outputs:**
- `src/modules/matchmaking/components/QueueButton.tsx`
- `src/modules/matchmaking/screens/SearchingScreen.tsx`
- `src/modules/matchmaking/components/SearchingIndicator.tsx`
- Updated `LobbyScreen.tsx`
- Updated `router.tsx`

**Dependencies:** P5.1 (matchmaking store/hooks), P4.1 (lobby screen)

**Validation:** Click "Find Battle" -> navigate to searching screen -> cancel returns to lobby. With two accounts: both join -> match found -> both auto-navigate to `/battle/:battleId` (placeholder). Page refresh during search -> BattleGuard routes back to searching (if still searching) or to battle (if matched).

---

#### P5.3: sendBeacon queue leave on browser close — NON-BLOCKING / SKIPPABLE

**Status:** This task is **not required for Phase 5 completion.** It is best-effort (DES-1). Skip if BFF does not support unauthenticated leave. The 30-minute queue TTL is the fallback.

**Goal:** Best-effort queue leave when the browser tab closes during search.

**Scope:**
- Add `pagehide` event listener (active only when `matchmakingStore.status === 'searching'`)
- On `pagehide`: `navigator.sendBeacon(bffBaseUrl + "/api/v1/queue/leave", ...)`
- Register/unregister listener based on searching state

**Outputs:**
- Logic in `useMatchmakingPolling()` hook or a separate `useQueueLeaveOnClose()` hook

**Dependencies:** P5.1

**Validation:** Start searching -> close tab -> verify via backend logs or re-login that queue entry was removed (or eventually expires via TTL). This is best-effort.

**Known limitation:** `sendBeacon` cannot set custom `Authorization` headers. The `POST /api/v1/queue/leave` endpoint requires auth. **If BFF does not support unauthenticated leave or a query-param token approach, skip this task entirely and defer to Phase 9 (P9.3) where it is revisited as part of browser lifecycle hardening.** The 30-minute queue TTL handles the case where `sendBeacon` is not viable.

---

### Phase 6: Battle Transport + State Machine

Phase 6 is the highest-risk phase. It is split into 7 sub-tasks executed sequentially. The store (P6.1) and zone utilities (P6.2) can be parallel. Everything else is sequential.

---

#### P6.1: Battle Zustand store and state machine

**Goal:** The battle state machine from `04` Section 8 is implemented as a Zustand store with all states, transitions, and data fields.

**Scope:**
- `src/modules/battle/store.ts`:
  - Phase enum: `Idle`, `Connecting`, `WaitingForJoin`, `ArenaOpen`, `TurnOpen`, `Submitted`, `Resolving`, `Ended`, `ConnectionLost`, `Error`
  - State fields: `battleId`, `phase`, `turnIndex`, `deadline`, `selectedAttackZone`, `selectedBlockPair`, `isSubmitted`, `playerHp`, `opponentHp`, `playerMaxHp`, `opponentMaxHp`, `playerId`, `playerName`, `opponentId`, `opponentName`, `endReason`, `winnerId`, `isVictory`, `isDraw`, `feedEntries[]`, `lastResolution`, `errorMessage`
  - Actions (event handlers):
    - `startBattle(battleId)` -> Connecting
    - `handleConnected()` -> WaitingForJoin
    - `handleSnapshot(snapshot)` -> ArenaOpen/TurnOpen/Resolving/Ended based on snapshot phase
    - `handleBattleReady(data)` -> (update player names)
    - `handleTurnOpened(data)` -> TurnOpen, reset turn-local state, set deadline
    - `handlePlayerDamaged(data)` -> update HP (identify player vs opponent by ID)
    - `handleTurnResolved(data)` -> Resolving, store resolution details
    - `handleStateUpdated(data)` -> authoritative sync (overwrite HP, phase, turn)
    - `handleBattleEnded(data)` -> Ended, store result
    - `handleFeedUpdated(entries)` -> append entries, dedup by Key
    - `handleConnectionLost()` -> ConnectionLost (unless Idle or Ended)
    - `handleReconnected()` -> WaitingForJoin
    - `handleError(msg)` -> Error
    - `selectAttackZone(zone)` -> update selectedAttackZone
    - `selectBlockPair(pair)` -> update selectedBlockPair
    - `submitAction()` -> Submitted (local transition)
    - `reset()` -> Idle (clear all state)
  - Transition guards: validate that transitions are legal (e.g., can't go from Idle to Resolving directly)

**Outputs:**
- `src/modules/battle/store.ts`

**Dependencies:** P1.1 (battle types)

**Validation:** Unit-testable: sequence of handler calls produces correct state transitions. Specifically test: full turn cycle (TurnOpen -> submit -> Resolving -> TurnOpen), battle end, snapshot resync from any phase. **HIGH RISK** -- this must be reviewed carefully.

---

#### P6.2: Zone model utilities

**Goal:** Battle zone enum, adjacency definitions, and validation are implemented and testable.

**Scope:**
- Add to `src/types/battle.ts` or create `src/modules/battle/zones.ts`:
  - `BATTLE_ZONES` array: `['Head', 'Chest', 'Belly', 'Waist', 'Legs']` (ring order)
  - `VALID_BLOCK_PAIRS`: `[['Head','Chest'], ['Chest','Belly'], ['Belly','Waist'], ['Waist','Legs'], ['Legs','Head']]`
  - `isValidBlockPair(primary, secondary): boolean`
  - `buildActionPayload(attackZone, blockPrimary, blockSecondary): string` -- returns `JSON.stringify(...)` (the JSON **string**, not the object)

**Outputs:**
- `src/modules/battle/zones.ts`

**Dependencies:** P1.1 (BattleZone type)

**Validation:** Unit test: all 5 valid pairs return true. Non-adjacent pairs (e.g., Head+Belly) return false. `buildActionPayload` returns a JSON string (typeof === 'string', parseable as JSON with correct field names `attackZone`, `blockZonePrimary`, `blockZoneSecondary`). **HIGH RISK** -- getting `JSON.stringify` wrong means silent NoAction.

---

#### P6.3: Battle hub integration hook

**Goal:** The `useBattleConnection` hook manages the battle hub lifecycle: connect, join, wire events to store, disconnect.

**Scope:**
- `src/modules/battle/hooks.ts`:
  - `useBattleConnection(battleId)`:
    - On mount: `battleStore.startBattle(battleId)` -> `BattleHubManager.connect()` -> on connected: `BattleHubManager.joinBattle(battleId)` -> snapshot -> `battleStore.handleSnapshot(snapshot)`
    - Register all event callbacks to corresponding store handlers
    - On reconnect: call `joinBattle(battleId)` again -> snapshot replaces state
    - On unmount: `BattleHubManager.disconnect()`, `battleStore.reset()`
  - `useBattle()`: Selector hook for battle store state
  - `useBattleActions()`: Selector for action-related state and submit function
- Submit flow: `useBattleActions().submit()` -> validates via `zones.ts`, builds payload, calls `BattleHubManager.submitTurnAction(battleId, turnIndex, payload)`, calls `battleStore.submitAction()`

**Outputs:**
- `src/modules/battle/hooks.ts`

**Dependencies:** P6.1 (battle store), P6.2 (zone utilities), P1.5 (BattleHubManager)

**Validation:** Connected to a real battle (via matchmaking): `JoinBattle` returns snapshot, store populated. Events flow during turns. Submit action -> server accepts (no silent NoAction -- verify by checking TurnResolved shows the submitted action, not NoAction).

---

#### P6.4: Opponent DM suppression

**Goal:** When a battle starts, the chat store suppresses the opponent's DM notifications. When the battle ends, suppression is lifted.

**Scope:**
- In `useBattleConnection` (or a separate `useBattleChatSuppression` hook):
  - After `handleSnapshot`: extract opponent ID -> `chatStore.setSuppressedOpponent(opponentId)`
  - On `handleBattleEnded` or `reset()`: `chatStore.clearSuppressedOpponent()`
- Verify that `chatStore.addDirectMessage` checks `suppressedOpponentId` and suppresses toast for matching sender
- Verify that `ConversationList` filters conversations with `otherPlayerId === suppressedOpponentId`

**Outputs:**
- Updated `src/modules/battle/hooks.ts` (suppression calls)
- Verified integration with `src/modules/chat/store.ts` and `src/modules/chat/components/ConversationList.tsx`

**Dependencies:** P6.3 (battle hook provides opponent ID), P4.2 (chat store has suppression logic), P4.6 (ConversationList has filtering)

**Validation:** Start battle -> opponent sends DM -> message is persisted in chat store but no toast appears and conversation is hidden in DM list. Battle ends -> conversation becomes visible with the message intact.

---

#### P6.5: Battle reconnection and resync

**Goal:** Battle hub reconnection restores full state from server snapshot.

**Scope:**
- In `BattleHubManager`: verify `onreconnected` callback triggers `joinBattle(battleId)` -> snapshot -> `battleStore.handleSnapshot()`
- In battle store: `handleSnapshot` must completely replace all mechanical state (HP, phase, turn, deadline) regardless of current local state
- `handleConnectionLost()` transitions to `ConnectionLost` from any active phase (not from `Idle` or `Ended`)
- `handleReconnected()` transitions from `ConnectionLost` to `WaitingForJoin`
- Handle edge case: battle ended during disconnect -> snapshot phase is `Ended` -> transition to `Ended`

**Outputs:**
- Verified reconnection logic in `battle-hub.ts` and `battle/store.ts`
- May require minor updates to both files

**Dependencies:** P6.3 (battle hook), P6.1 (store)

**Validation:** Mid-battle, disconnect network (devtools offline mode) -> `ConnectionLost` state shown -> reconnect -> `JoinBattle` -> state restored -> battle continues. Disconnect -> battle ends server-side -> reconnect -> snapshot shows `Ended` -> result screen. **HIGH RISK**.

---

#### P6.6: Debug battle view

**Goal:** A temporary battle screen that displays raw state machine data for validation before building the real UI.

**Scope:**
- `src/modules/battle/screens/BattleScreen.tsx` (temporary implementation, replaced in Phase 7):
  - Displays: current phase, turn index, deadline countdown, player HP / opponent HP, connection state
  - Raw event log (last N events as JSON)
  - Simple zone selection: 3 dropdowns (attack zone, block primary, block secondary) with submit button
  - Narration feed entries as raw text list
  - Battle end: show reason, winner, victory/defeat/draw
  - "Continue to Result" button when ended
- Wire into router at `/battle/:battleId`

**Outputs:**
- `src/modules/battle/screens/BattleScreen.tsx` (debug version)
- Updated `router.tsx`

**Dependencies:** P6.3 (battle hooks), P6.1 (store), P6.2 (zones)

**Validation:** Two accounts: match -> enter battle -> both see initial state -> submit actions via dropdowns -> turn resolves -> HP updates -> play to completion -> battle ends. This is the integration test for the entire Phase 6 state machine. Run multiple full battles. Verify no state machine bugs.

---

### Phase 7: Battle UI

Phase 7 replaces the debug view with production UI. Sub-tasks are parallelizable once the store (Phase 6) is stable.

---

#### P7.1: Battle screen layout and HUD

**Goal:** The battle screen has its production layout with HP bars, turn counter, and phase indicator.

**Scope:**
- Replace `BattleScreen.tsx` debug view with production layout
- `src/modules/battle/components/BattleHud.tsx`:
  - Player HP bar: animated width based on `playerHp / playerMaxHp`, color transitions (green > yellow > red at 50% and 25% thresholds)
  - Opponent HP bar: same
  - HP numbers displayed
  - Turn counter (`Turn {turnIndex}`)
  - Phase indicator text (Turn Open / Resolving / Waiting / Ended)
  - Connection state indicator (small icon/text when disconnected/reconnecting)
- `src/ui/components/Timer.tsx`: Countdown timer component (reused for turn timer)
- Layout: HUD at top, combat area center, narration side/bottom

**Outputs:**
- `src/modules/battle/components/BattleHud.tsx`
- `src/ui/components/Timer.tsx`
- Updated `src/modules/battle/screens/BattleScreen.tsx` (production layout)

**Dependencies:** P6.6 (stable battle state to display)

**Validation:** HP bars render correctly, animate on damage. Color transitions at thresholds. Turn counter increments. Phase indicator matches store phase.

---

#### P7.2: Turn timer

**Goal:** A countdown timer that shows remaining time for the current turn, applying the 1.5-second buffer (DEC-4).

**Scope:**
- Use `Timer.tsx` from P7.1
- Read `deadline` from battle store
- Compute display deadline: `deadline - 1500ms`
- Update every 100ms for smooth countdown
- Visual urgency: color changes at 10s and 5s remaining
- Stops counting when `isSubmitted === true` (show "Submitted" text)
- Stops counting when phase is not `TurnOpen`

**Outputs:**
- Turn timer integrated into `BattleHud.tsx` or `BattleScreen.tsx`

**Dependencies:** P7.1 (HUD layout)

**Validation:** Timer counts down matching server deadline minus buffer. At 0, player can no longer submit (UI-side -- server handles this, but UI should reflect it). Timer stops after submission.

---

#### P7.3: Zone selector

**Goal:** Visual zone selection UI for attack zone and adjacent block pair. This is the core battle interaction.

**Scope:**
- `src/modules/battle/components/ZoneSelector.tsx`:
  - Attack zone selector: 5 clickable zone regions (visual ring representation or labeled buttons)
  - Block pair selector: 5 options presented as adjacent pairs (e.g., "Head + Chest", "Chest + Belly", etc.), NOT individual zone checkboxes
  - Selected state highlighting for both selections
  - Submit button: enabled only when both attack and block are selected
  - On submit: calls `useBattleActions().submit()` -> validates -> sends to server -> `Submitted` state
  - Disabled states: after submission, outside TurnOpen phase, during ConnectionLost
  - "Action Submitted" indicator shown after submission
  - Visual: consider a ring/body diagram or a clean button grid. The ring topology must be visually apparent.

**Outputs:**
- `src/modules/battle/components/ZoneSelector.tsx`

**Dependencies:** P6.2 (zone model), P6.3 (battle hooks for submit)

**Validation:** Only valid adjacent pairs selectable for block. Attack any zone. Submit -> "Submitted" shown, inputs disabled. Verify server accepts action (turn resolves with the chosen zones, NOT NoAction). **HIGH RISK** for UX -- may need iteration.

---

#### P7.4: Turn result display

**Goal:** After `TurnResolved`, display both players' actions and outcomes.

**Scope:**
- `src/modules/battle/components/TurnResultDisplay.tsx`:
  - Reads `lastResolution` from battle store (set by `handleTurnResolved`)
  - Shows two directions (player attacking opponent, opponent attacking player):
    - Attack zone chosen
    - Defender's block zones
    - Outcome: Hit, Blocked, Dodged, CriticalHit, CriticalBypassBlock, CriticalHybridBlocked, NoAction
    - Damage dealt (if any)
  - Color-coded outcomes (hit = red, blocked = blue, dodged = yellow, crit = orange/gold, no action = gray)
  - Brief animation on appearance (slide in or fade)

**Outputs:**
- `src/modules/battle/components/TurnResultDisplay.tsx`

**Dependencies:** P6.1 (store provides resolution data), P7.1 (battle screen layout)

**Validation:** After turn resolves, both attack directions visible with correct outcomes. NoAction shown when a player didn't submit. Crit distinguished from regular hit.

---

#### P7.5: Narration feed

**Goal:** Battle narration entries display as a scrollable log, styled by kind, severity, and tone.

**Scope:**
- `src/modules/battle/components/NarrationFeed.tsx`:
  - Reads `feedEntries` from battle store
  - Scrollable list, newest at bottom
  - Auto-scroll to latest entry
  - Styling by `Severity`: Normal (default), Important (bold/larger), Critical (highlighted background)
  - Styling by `Tone`: Aggressive (red tint), Defensive (blue tint), Dramatic (gold/italic), System (gray/mono), Flavor (italic), Neutral (default)
  - `Kind` used for icons or prefixes (attack icon for hits, shield for blocks, etc.)
  - Text is ready to display (no client-side processing)

**Outputs:**
- `src/modules/battle/components/NarrationFeed.tsx`

**Dependencies:** P6.1 (store provides feed entries)

**Validation:** Narration entries appear during battle. Styling varies by severity/tone. Critical entries are visually prominent. Auto-scroll works. Feed does not block gameplay input for the next turn.

---

#### P7.6: Battle end overlay

**Goal:** When the battle ends, a prominent overlay shows the outcome.

**Scope:**
- `src/modules/battle/components/BattleEndOverlay.tsx`:
  - Reads end state from battle store: `endReason`, `winnerId`, `isVictory`, `isDraw`
  - Display per `endReason`:
    - `Normal` -> "Victory!" or "Defeat!" with opponent name
    - `DoubleForfeit` -> "Draw -- Mutual Inactivity"
    - `Timeout` -> "Draw -- Time Expired"
    - `SystemError` -> "Battle ended due to a system error. Returning to lobby."
    - Others (`Cancelled`, `AdminForced`, `Unknown`) -> "Battle ended unexpectedly"
  - Entrance animation (fade + scale via Framer Motion)
  - "View Results" button -> navigates to `/battle/:battleId/result`
- `src/ui/components/Dialog.tsx`: Modal/overlay primitive (Radix Dialog)

**Outputs:**
- `src/modules/battle/components/BattleEndOverlay.tsx`
- `src/ui/components/Dialog.tsx`

**Dependencies:** P6.1 (store provides end state), P7.1 (battle screen layout)

**Validation:** Battle ends normally -> Victory/Defeat shown. DoubleForfeit (both idle 10 turns) -> draw shown. "View Results" navigates to result screen.

---

### Phase 8: Post-Battle / Result Flow

---

#### P8.1: Battle result screen

**Goal:** The result screen shows battle outcome and full narration feed.

**Scope:**
- `src/modules/battle/screens/BattleResultScreen.tsx`:
  - Battle outcome banner (reuse messaging from BattleEndOverlay)
  - Full narration feed (from `battleStore.feedEntries` or fetched via `GET /api/v1/battles/{battleId}/feed`)
  - Feed fetch via TanStack Query: if live entries exist, merge with HTTP feed using `Key` deduplication; if no live entries (page refresh to result screen), fetch from HTTP only
  - "Return to Lobby" button -> navigates to `/lobby`
  - Result screen stays until player clicks "Return to Lobby" (REQ-P1)
- Wire into router at `/battle/:battleId/result`

**Outputs:**
- `src/modules/battle/screens/BattleResultScreen.tsx`
- Updated `router.tsx`

**Dependencies:** P7.6 (battle end navigates here), P1.2 (battle.getFeed endpoint), P7.5 (NarrationFeed component reuse)

**Validation:** After battle -> result screen shows outcome + full narration feed. "Return to Lobby" returns to lobby. Page refresh on result screen -> feed fetched from HTTP endpoint.

---

#### P8.2: Post-battle state refresh and cleanup

**Goal:** Returning to lobby after battle refreshes character state, shows level-up notification, and cleans up battle state.

**Scope:**
- On "Return to Lobby" click:
  1. `battleStore.reset()` -> Idle
  2. `BattleHubManager.disconnect()`
  3. `chatStore.clearSuppressedOpponent()` (opponent DM suppression lifted)
  4. Navigate to `/lobby`
- On lobby mount (or in `GameStateLoader` / a lobby hook):
  - Fetch `GET /api/v1/game/state`
  - Compare XP/level with pre-battle values (stored in player store)
  - If unchanged, retry once after 3 seconds (DEC-5)
  - If level-up detected (level increased or `UnspentPoints` increased): show level-up toast notification
  - Update player store with new character data

**Outputs:**
- Post-battle cleanup logic (in battle hooks or a dedicated `usePostBattleCleanup` hook)
- Level-up detection and notification logic (in player module hooks)
- Updated lobby mount behavior

**Dependencies:** P8.1 (result screen has "Return to Lobby"), P4.1 (lobby loads character data)

**Validation:** Full loop: lobby -> queue -> battle -> result -> lobby -> verify XP/level updated. Level-up toast appears when applicable. Unspent points badge shows if new points from level-up. Chat DM suppression cleared: opponent's DM conversation visible again. Immediately re-enter queue -> works without issues.

---

#### P8.3: Stat allocation from lobby (post-level-up)

**Goal:** Players can allocate unspent stat points from the lobby after leveling up.

**Scope:**
- `src/modules/player/screens/StatAllocationScreen.tsx` (or integrate into lobby):
  - Reuse `StatPointAllocator` component from onboarding (P3.3)
  - Adapted for lobby context: shows current total stats (not just base), available unspent points
  - Allocations are additive (same as onboarding)
  - `ExpectedRevision` tracking
  - Submit via `POST /api/v1/character/stats`
  - On success: update player store, close allocation UI
- Access from lobby: button or link when `UnspentPoints > 0`

**Outputs:**
- `src/modules/player/screens/StatAllocationScreen.tsx`
- Updated `LobbyScreen.tsx` with allocation access

**Dependencies:** P4.1 (lobby), P3.3 (StatPointAllocator component)

**Validation:** After level-up with unspent points -> badge visible -> open allocation -> spend points -> server accepts -> stats updated.

---

### Phase 9: Hardening / Error Handling / Reconnection / Polish

Phase 9 tasks are largely independent and can be worked in any order.

---

#### P9.1: HTTP error handling polish

**Goal:** All HTTP error scenarios produce clear, user-friendly feedback.

**Scope:**
- Review all mutation error paths:
  - 400 with field errors -> inline display (name screen, stat allocation)
  - 401 -> global redirect to landing (verify it works from any screen)
  - 409 -> context-specific (name taken, revision mismatch, already matched)
  - 503 -> toast with "Service temporarily unavailable"
  - 500 -> generic toast with `traceId` for support
- Add error boundary at app root for unhandled React errors
- `traceId` extraction and display in error toasts
- Verify `DegradedServices` in `GameStateResponse` produces visible degraded UI indicators in lobby

**Outputs:**
- App-level error boundary component
- Updated error display in all mutations
- Degraded service indicators in lobby

**Dependencies:** All prior phases (error paths exist to test)

**Validation:** Trigger each error code -> verify display. Kill a backend service -> verify degraded indicator. Unhandled error -> error boundary catches it.

---

#### P9.2: SignalR reconnection hardening

**Goal:** Both SignalR connections recover reliably from all failure modes.

**Scope:**
- Battle hub reconnection scenarios:
  - Server restart mid-battle -> connection drops -> reconnect -> `JoinBattle` resync
  - Network blip (brief offline) -> reconnect -> resync
  - Long disconnection (battle may have ended) -> reconnect -> snapshot shows Ended
  - Reconnect after all retries exhausted -> show "Connection lost" with manual retry button
- Chat hub reconnection scenarios:
  - Server restart -> reconnect -> `JoinGlobalChat` resync -> messages recovered
  - Verify presence re-registers (player appears online again after reconnect)
- Both hubs reconnecting simultaneously (during battle, both connections exist)
- Token expiry during active connection -> next reconnect attempt fails with 401 -> auth error flow

**Outputs:**
- Any bug fixes found during testing
- Manual retry button for exhausted reconnection attempts (if not already present)

**Dependencies:** All prior phases

**Validation:** Simulate each failure scenario. Verify state is correct after recovery. Verify two simultaneous reconnections don't interfere.

---

#### P9.3: Browser lifecycle and tab behavior

**Goal:** The app behaves correctly on tab close, tab switch, and visibility changes.

**Scope:**
- `sendBeacon` queue leave (already in P5.3, verify it works)
- `beforeunload` warning during active battle: "You have an active battle. Leaving will forfeit turns."
- Tab visibility change (`visibilitychange` event):
  - Hidden: pause matchmaking polling interval (reduce load)
  - Visible: resume polling, trigger a game state refresh if stale
- SignalR connections continue in background (browser manages WebSocket keep-alive)

**Outputs:**
- `beforeunload` handler for active battle
- `visibilitychange` handling for polling

**Dependencies:** P5.1 (matchmaking polling), P6.3 (battle connection)

**Validation:** Close tab during battle -> warning shown. Switch away during matchmaking -> polling pauses. Switch back -> polling resumes.

---

#### P9.4: Performance review

**Goal:** No memory leaks or UI lag in long sessions.

**Scope:**
- Chat message list: verify 500-message cap trims correctly. Load test with rapid messages.
- Battle event processing: verify no frame drops during rapid turn resolution
- TanStack Query cache: verify stale queries are garbage collected. Check player card cache doesn't grow unbounded.
- React DevTools profiler: identify unnecessary re-renders in battle and chat
- SignalR memory: verify disconnected hub connections are fully cleaned up

**Outputs:**
- Performance fixes for any issues found
- Memory leak fixes if identified

**Dependencies:** All features built

**Validation:** Play 10+ battles in a single session. Chat actively for extended period. No visible lag. Memory usage in devtools doesn't grow unbounded.

---

#### P9.5: Logout cleanup

**Goal:** Logout produces a completely clean state with no leakage.

**Scope:**
- Before Keycloak logout redirect:
  1. `ChatHubManager.disconnect()` (clean disconnect -> presence decremented)
  2. `BattleHubManager.disconnect()` (if active)
  3. `matchmakingPoller.stop()` (if active)
  4. Clear all Zustand stores (auth, player, battle, matchmaking, chat)
  5. `queryClient.clear()` (TanStack Query cache)
- After re-login: verify completely fresh state. No data from previous session leaks.

**Outputs:**
- Logout cleanup in auth module logout action

**Dependencies:** P1.3 (auth module), all stores

**Validation:** Log in as User A -> use features -> log out -> log in as User B -> no data from User A visible anywhere.

---

#### P9.6: UI polish and accessibility

**Goal:** Loading states, empty states, transitions, and keyboard accessibility are polished.

**Scope:**
- Loading states: all async operations show loading (not just spinner -- skeleton states for chat, player card)
- Empty states: "No players online", "No conversations yet", "No unspent points"
- Route transitions: fade or slide animations between screens (Framer Motion `AnimatePresence`)
- Keyboard accessibility: zone selector navigable via keyboard (arrow keys or tab), Enter to submit
- Focus management: focus moves to first input on screen transitions (onboarding name input, zone selector on TurnOpen)
- Toast stacking: verify multiple simultaneous toasts display correctly (DM notification + level-up + error)

**Outputs:**
- Polish updates across multiple components

**Dependencies:** All features built

**Validation:** Use app with keyboard only -> all core flows accessible. Loading states visible during slow connections (devtools throttling). Empty states display when applicable.

---

## 3. Blocking tasks and critical path

### Critical path (sequential gates with parallelism noted)

```
P0.1 -> P0.2 -> [P0.3 + P0.4]
  -> P1.1 -> [P1.2 + P1.3 + P1.4] -> [P1.5 + P1.6 + P1.7]
  -> P2.1 -> P2.2 -> P2.3
  -> P3.2 -> P3.3
  -> P4.1 + P4.2 -> P4.3 -> P4.4 + P4.5 (mid-phase checkpoint)
    -> P4.6 + P4.7 -> P4.8
  -> P5.1 -> P5.2
  -> P6.1 -> P6.3 -> P6.6
  -> P7.1 -> P7.3 -> P7.6
  -> P8.1 -> P8.2
```

Tasks in `[brackets]` or joined with `+` are parallelizable within that step. Each `->` is a blocking gate.

### Blocking tasks

| Task | What it blocks |
|------|---------------|
| P0.1 (init project) | Everything |
| P1.1 (types) | All transport and store tasks |
| P1.3 (auth module) | All authenticated features |
| P2.1 (player store + game state loading) | All features needing game state |
| P2.3 (route guards) | All feature screens (they need guards to be reachable) |
| P4.2 (chat store) | All chat UI tasks |
| P4.3 (chat connection hook) | All chat functionality |
| P5.1 (matchmaking store) | Matchmaking UI, battle (needs match to start battle) |
| P6.1 (battle store) | All battle functionality |
| P6.3 (battle hub integration) | Battle debug view, battle UI, post-battle |

---

## 4. Parallelization opportunities

### Within Phase 0
- P0.3 and P0.4 can run in parallel (both depend only on P0.1/P0.2)

### Within Phase 1
- P1.1 (types) can start immediately after P0.3
- P1.2 (HTTP client) and P1.3 (auth module) depend on P1.1 but can be developed in parallel (HTTP client forward-references auth store)
- P1.5 (battle hub) and P1.6 (chat hub) are independent and can be parallel after P1.3
- P1.4 (TanStack Query setup) is independent and can be parallel with P1.2/P1.3
- P1.7 (poller) can be parallel with P1.5/P1.6

### Within Phase 4
- P4.1 (lobby shell) and P4.2 (chat store) can be parallel
- After P4.3 (chat connection hook): P4.4 (global chat) and P4.5 (online players) can be parallel
- **Mid-phase checkpoint after P4.1-P4.5** (see Phase 4 header)
- After checkpoint: P4.6 (DM) and P4.7 (player card) can be parallel
- P4.8 (error/reconnect) comes after P4.4 + P4.6

### Within Phase 6
- P6.1 (store) and P6.2 (zones) can be parallel
- P6.4 (DM suppression) can run after P6.3 but parallel with P6.5
- P6.5 (reconnection) and P6.6 (debug view) can be parallel after P6.3

### Within Phase 7 (after P7.1)
- P7.2 (timer), P7.3 (zone selector), P7.4 (turn result), P7.5 (narration) are independent and can all be parallel
- P7.6 (battle end overlay) can be parallel with P7.3-P7.5

### Within Phase 8
- P8.1 (result screen) blocks P8.2 (cleanup). P8.3 (stat allocation from lobby) is independent.

### Phase 9
- All P9.x tasks are independent and parallelizable.

---

## 5. Highest-risk tasks

| Task | Risk | Why | Mitigation |
|------|------|-----|-----------|
| **P6.1** | State machine correctness | Most complex state in the app. Wrong transitions = wrong game state. | Review transition table exhaustively. Unit test each transition. |
| **P6.2** | `buildActionPayload` must return JSON string | If it returns an object instead of `JSON.stringify(object)`, server silently treats as NoAction. Zero server-side error. | Unit test `typeof result === 'string'`. Parse back to verify structure. |
| **P6.3** | Event handler wiring | Missing or mis-wired event handler means the app doesn't respond to server events. | Debug view (P6.6) makes all events visible. Manual full-battle test required. |
| **P6.5** | Reconnection resync | Snapshot must replace all local state. Partial replacement = inconsistent state. | Test by disconnecting at multiple points in the battle lifecycle. |
| **P1.3** | Auth against real Keycloak | CORS, redirect URIs, audience mapper, PKCE -- any misconfiguration blocks all progress. | Test early. Verify Keycloak config matches `05` Section 12 checklist. |
| **P7.3** | Zone selector UX | Ring topology with adjacent pairs must be intuitive for first-time players. May need iteration. | Start with simple button grid; iterate if UX testing shows confusion. |
| **P4.3** | Session-scoped chat connection | Must survive navigation between lobby and battle without dropping. | Mount at `AuthenticatedShell` level. Verify with actual lobby -> battle -> lobby navigation. |

---

## 6. Recommended first execution batch

Start with the following tasks in order. These produce a working authenticated shell (Milestone 1) and are the foundation for everything else.

### Batch 1: Scaffold (Phase 0)
Execute sequentially: P0.1 -> P0.2 -> P0.3 + P0.4 (parallel)

**Review checkpoint:** Dev server runs, folder structure correct, Tailwind works, env vars accessible.

### Batch 2: Auth + Transport (Phase 1)
Execute: P1.1 -> P1.3 + P1.2 + P1.4 (parallel after P1.1) -> P1.5 + P1.6 + P1.7 (parallel after P1.3)

**Review checkpoint:** Login/register cycle works. Authenticated API call succeeds. Both SignalR connections negotiate. Token refresh fires.

### Batch 3: Routing (Phase 2)
Execute sequentially: P2.1 -> P2.2 -> P2.3

**Review checkpoint:** Every user state routes correctly. Guards enforce all hard gates. Page refresh recovers.

After Batch 3, Milestone 1 ("Authenticated shell") is reached. Every subsequent phase builds features on this foundation.

# Frontend Execution Log

---

## Batch 1 — Phase 0: Project Scaffold

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

### P0.1: Initialize Vite + React project

**Status:** Done

Created `src/Kombats.Client/` via `create-vite` with `react-ts` template.

- React 19 shipped by template (no upgrade needed)
- `tsconfig.app.json`: `strict: true`, path alias `@/* → src/*`
- `vite.config.ts`: path alias resolution, dev server port 3000, `@tailwindcss/vite` plugin
- `src/vite-env.d.ts`: typed `ImportMetaEnv` for `VITE_KEYCLOAK_AUTHORITY`, `VITE_KEYCLOAK_CLIENT_ID`, `VITE_BFF_BASE_URL`
- Template boilerplate removed: `App.css`, `assets/*`, `public/vite.svg`, `public/icons.svg`, `README.md`

Key files:
- `src/Kombats.Client/package.json`
- `src/Kombats.Client/tsconfig.app.json`
- `src/Kombats.Client/vite.config.ts`
- `src/Kombats.Client/src/vite-env.d.ts`

Validation: `npm run dev` starts on port 3000, `npx tsc --noEmit` passes with zero errors.

### P0.2: Install all dependencies

**Status:** Done

All packages from `04-frontend-client-architecture.md` Section 3.8 installed.

Production deps: `react-router@7`, `zustand@5`, `@tanstack/react-query@5`, `@microsoft/signalr@8`, `oidc-client-ts`, `react-oidc-context`, `tailwindcss@4`, `@tailwindcss/vite@4`, `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-scroll-area`, `@radix-ui/react-tabs`, `clsx`, `tailwind-merge`, `lucide-react`, `motion`, `sonner`, `date-fns`.

Dev deps: `prettier`, `eslint-config-prettier`, `eslint-plugin-prettier`, `vitest`, `@types/node`. ESLint + Prettier configs created (`.prettierrc`).

Key files:
- `src/Kombats.Client/package.json`
- `src/Kombats.Client/.prettierrc`

Validation: `npm install` succeeded, `npm run dev` still works, `npx tsc --noEmit` passes.

### P0.3: Create folder structure and design tokens

**Status:** Done

Full `src/` directory structure from `04` Section 6.1 created with `.gitkeep` placeholders in empty directories.

Directories created:
- `src/app/shells/`, `src/app/guards/`
- `src/modules/{auth,player,onboarding,matchmaking,battle,chat}/` with `screens/` and `components/` subdirs
- `src/transport/{http/endpoints,signalr,polling}/`
- `src/ui/{components,theme}/`
- `src/types/`

Design tokens:
- `src/ui/theme/tokens.css`: full CSS variable set (surface colors, text colors, accent, HP bar colors, zone colors, status colors, spacing, typography, border radii, animation durations)
- `src/ui/theme/fonts.css`: placeholder (fonts loaded via `<link>` in `index.html`)
- `src/index.css`: Tailwind 4 entry point with `@theme` block mapping all CSS variables to Tailwind utilities

Key files:
- `src/Kombats.Client/src/ui/theme/tokens.css`
- `src/Kombats.Client/src/index.css`

Validation: Tailwind classes referencing design tokens (`bg-bg-primary`, `text-accent`, `font-display`) render correctly.

### P0.4: Environment configuration

**Status:** Done

- `.env.development`: `VITE_KEYCLOAK_AUTHORITY=http://localhost:8080/realms/kombats`, `VITE_KEYCLOAK_CLIENT_ID=kombats-web`, `VITE_BFF_BASE_URL=http://localhost:5200`
- `src/config.ts`: typed `AppConfig` object with `requireEnv()` validation that throws on missing vars
- Root `.gitignore` already covered `.env` and `node_modules/`

Key files:
- `src/Kombats.Client/.env.development`
- `src/Kombats.Client/src/config.ts`

Validation: `import.meta.env.VITE_BFF_BASE_URL` returns `http://localhost:5200` in dev.

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

---

## Batch 1 — Phase 0 Cleanup Patch

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified non-blocking cleanup items applied after initial scaffold review.

### Fix 1: CSS @import order warning

Moved Google Fonts loading from CSS `@import url(...)` statements in `fonts.css` to `<link>` tags in `index.html`. This eliminates the `@import must precede all other statements` warning that occurs when CSS `@import` follows Tailwind's generated output.

- `index.html`: added `<link>` tags with `preconnect` hints for Google Fonts (Inter, Orbitron, JetBrains Mono); updated `<title>` to "Kombats"
- `src/ui/theme/fonts.css`: replaced `@import url(...)` with comment; file retained as architecture slot
- `src/index.css`: removed `@import './ui/theme/fonts.css'` line

### Fix 2: Wire eslint-config-prettier

`eslint-config-prettier` was installed but not applied in the ESLint config.

- `eslint.config.js`: imported `eslint-config-prettier` and appended as last entry in `extends` to disable conflicting formatting rules

### Fix 3: Harden env hygiene

- `.env.production`: created with placeholder values (`__KEYCLOAK_AUTHORITY__`, `__BFF_BASE_URL__`) for deployment-time substitution
- `.gitignore`: added `.env*.local` pattern for local override files

### Fix 4: Move App.tsx to src/app/

Moved root `App.tsx` into `src/app/App.tsx` to match the architecture's `app/` directory convention.

- `src/App.tsx`: deleted
- `src/app/App.tsx`: created (identical content)
- `src/main.tsx`: import path updated to `'./app/App'`

### Files modified (8 files, 1 deleted)

| File | Change |
|---|---|
| `index.html` | Added font `<link>` tags, updated title |
| `src/ui/theme/fonts.css` | Replaced `@import url()` with comment |
| `src/index.css` | Removed fonts.css import |
| `eslint.config.js` | Added `eslint-config-prettier` |
| `.gitignore` | Added `.env*.local` |
| `.env.production` | Created |
| `src/app/App.tsx` | Created (moved from `src/App.tsx`) |
| `src/main.tsx` | Updated import path |

Deleted: `src/App.tsx`

Validation: `npx tsc --noEmit` passes, `npx eslint .` passes, `npm run dev` starts on port 3000.

---

## Batch 2 — Phase 1: Auth + Transport Foundation

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

### P1.1: Shared type definitions

**Status:** Done

Created all TypeScript type definitions matching the backend contract (BFF DTOs, battle realtime events, chat events, player card). Types derived from actual C# records in `src/Kombats.Bff/`, `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts/`, and `src/Kombats.Chat/`.

Key files:
- `src/types/common.ts` — `Uuid`, `DateTimeOffset` type aliases
- `src/types/api.ts` — `GameStateResponse`, `CharacterResponse`, `QueueStatusResponse`, `LeaveQueueResponse`, `OnboardResponse`, `AllocateStatsRequest/Response`, `SetCharacterNameRequest`, `ApiError`, `OnboardingState`/`QueueStatus`/`MatchState` enums
- `src/types/player.ts` — `PlayerCardResponse`
- `src/types/battle.ts` — `BattleSnapshotRealtime`, `TurnOpenedRealtime`, `PlayerDamagedRealtime`, `TurnResolvedRealtime`, `AttackResolutionRealtime`, `TurnResolutionLogRealtime`, `BattleStateUpdatedRealtime`, `BattleEndedRealtime`, `BattleReadyRealtime`, `BattleFeedEntry`, `BattleFeedUpdate`, `BattleFeedResponse`, `BattleRulesetRealtime`; enums: `BattleZone`, `BattlePhaseRealtime`, `BattleEndReasonRealtime`, `AttackOutcomeRealtime`, `FeedEntryKind`, `FeedEntrySeverity`, `FeedEntryTone`
- `src/types/chat.ts` — `ChatMessageResponse`, `ChatSender`, `ChatConversationResponse`, `ConversationListResponse`, `MessageListResponse`, `OnlinePlayerResponse`, `OnlinePlayersResponse`, `JoinGlobalChatResponse`, `SendDirectMessageResponse`, `GlobalMessageEvent`, `DirectMessageEvent`, `PlayerOnlineEvent`, `PlayerOfflineEvent`, `ChatErrorEvent`, `ChatErrorCode`

Validation: `npx tsc --noEmit` passes.

### P1.2: HTTP client and endpoint modules

**Status:** Done

Implemented the typed HTTP transport layer.

- `src/transport/http/client.ts` — `fetch` wrapper with `Authorization: Bearer` injection from auth store, error normalization into `ApiError`, 401 interception (clears auth state), 204 handling. Exposes `httpClient.get/post/put/delete`.
- `src/transport/http/endpoints/game.ts` — `getState()`, `onboard()`
- `src/transport/http/endpoints/character.ts` — `setName()`, `allocateStats()`
- `src/transport/http/endpoints/queue.ts` — `join()`, `leave()`, `getStatus()`
- `src/transport/http/endpoints/battle.ts` — `getFeed(battleId)`
- `src/transport/http/endpoints/chat.ts` — `getConversations()`, `getMessages()`, `getDirectMessages()`, `getOnlinePlayers()`
- `src/transport/http/endpoints/players.ts` — `getCard(playerId)`

Key design decisions:
- Token read is at call-time via `useAuthStore.getState()`, not captured at setup
- No retry logic in client — TanStack Query handles retry
- Error shape matches BFF's `{ error: { code, message, details } }` format

### P1.3: Auth module

**Status:** Done

Implemented Keycloak OIDC auth per `05-keycloak-web-client-integration.md` Section 11.

- `src/modules/auth/user-manager.ts` — `oidc-client-ts` `UserManager` singleton with: Authorization Code + PKCE, `InMemoryWebStorage` for token storage (DEC-6), `sessionStorage` for PKCE state, `automaticSilentRenew: true`, 60s expiry notification
- `src/modules/auth/store.ts` — Zustand store with `accessToken`, `userIdentityId`, `displayName`, `authStatus` (loading/authenticated/unauthenticated), actions: `setUser()`, `updateToken()`, `clearAuth()`
- `src/modules/auth/AuthProvider.tsx` — Wraps `react-oidc-context`'s `AuthProvider` + `AuthSync` component that syncs OIDC state to Zustand store. Listens for `userLoaded` (token renewal) and `silentRenewError` events.
- `src/modules/auth/AuthCallback.tsx` — Handles `/auth/callback` route. Waits for OIDC processing, redirects to `/` on success or error.
- `src/modules/auth/hooks.ts` — `useAuth()` hook exposing `login()` (standard `signinRedirect`), `register()` (`signinRedirect` with `kc_action=register`), `logout()` (clears state + `signoutRedirect`), `authStatus`, `isAuthenticated`, `isLoading`, `userIdentityId`, `displayName`

### P1.4: TanStack Query setup

**Status:** Done

- `src/app/query-client.ts` — `QueryClient` with default options (3 retries for queries, no retry for mutations, `staleTime: 0`, `refetchOnWindowFocus: true`). Query key factories: `gameKeys`, `playerKeys`, `chatKeys`, `battleKeys`.
- `src/app/App.tsx` — Wrapped with `<AuthProvider>` and `<QueryClientProvider>`

### P1.5: Battle SignalR manager

**Status:** Done

- `src/transport/signalr/connection-state.ts` — `ConnectionState` type
- `src/transport/signalr/battle-hub.ts` — `BattleHubManager` class: `connect()`, `disconnect()`, `joinBattle(battleId)`, `submitTurnAction(battleId, turnIndex, payload)`. Uses `accessTokenFactory` reading from auth store at call-time. Reconnect policy: `[0, 1000, 2000, 5000, 10000, 30000]`. Typed event registration for all battle events (`BattleReady`, `TurnOpened`, `PlayerDamaged`, `TurnResolved`, `BattleStateUpdated`, `BattleEnded`, `BattleFeedUpdated`, `BattleConnectionLost`). Connection lifecycle tracking (`onreconnecting`, `onreconnected`, `onclose`). Injectable event handlers via `setEventHandlers()`.

### P1.6: Chat SignalR manager

**Status:** Done

- `src/transport/signalr/chat-hub.ts` — `ChatHubManager` class: `connect()`, `disconnect()`, `joinGlobalChat()`, `leaveGlobalChat()`, `sendGlobalMessage(content)`, `sendDirectMessage(recipientPlayerId, content)`. Same auth + reconnect pattern as battle hub. Typed event registration for all chat events (`GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`, `ChatConnectionLost`). Connection lifecycle tracking. Injectable event handlers.

### P1.7: Matchmaking polling service

**Status:** Done

- `src/transport/polling/matchmaking-poller.ts` — `MatchmakingPoller` class: `start(intervalMs, onResult, onError)`, `stop()`. Fires immediately on start then on interval. Tracks `consecutiveFailures` for resilience reporting. Exposes `isRunning` state. Calls `queueApi.getStatus()`.

### Files created (22 new, 1 modified)

New files:
- `src/types/common.ts`
- `src/types/api.ts`
- `src/types/player.ts`
- `src/types/battle.ts`
- `src/types/chat.ts`
- `src/modules/auth/store.ts`
- `src/modules/auth/user-manager.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/AuthCallback.tsx`
- `src/modules/auth/hooks.ts`
- `src/transport/http/client.ts`
- `src/transport/http/endpoints/game.ts`
- `src/transport/http/endpoints/character.ts`
- `src/transport/http/endpoints/queue.ts`
- `src/transport/http/endpoints/battle.ts`
- `src/transport/http/endpoints/chat.ts`
- `src/transport/http/endpoints/players.ts`
- `src/transport/signalr/connection-state.ts`
- `src/transport/signalr/battle-hub.ts`
- `src/transport/signalr/chat-hub.ts`
- `src/transport/polling/matchmaking-poller.ts`
- `src/app/query-client.ts`

Modified:
- `src/app/App.tsx` — wrapped with AuthProvider + QueryClientProvider

Removed `.gitkeep` from: `src/modules/auth/`, `src/transport/http/endpoints/`, `src/transport/signalr/`, `src/transport/polling/`, `src/types/`

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint .`: passes (zero errors)
- `npm run dev`: starts on port 3000
- Auth flow wired: `AuthProvider` + `AuthSync` + `AuthCallback` in place
- HTTP client reads token from auth store at call-time
- Both SignalR managers configured with `accessTokenFactory` + reconnect policy
- TanStack Query wired with `QueryClientProvider` + query key factories
- Matchmaking poller implemented with start/stop lifecycle

---

## Batch 2 — Phase 1 Cleanup Patch

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified fixes applied before Phase 2.

### Fix 1: Transport → modules boundary violation (required)

`transport/http/client.ts`, `transport/signalr/battle-hub.ts`, and `transport/signalr/chat-hub.ts` all imported `@/modules/auth/store` directly, violating the architecture rule that `transport/` must not import from `modules/`.

**Resolution:**
- HTTP client now exposes `configureHttpClient({ getAccessToken, onAuthFailure })` — dependency injection instead of direct import.
- `BattleHubManager` and `ChatHubManager` accept `accessTokenFactory: () => string` as a constructor argument instead of importing the auth store.
- Module-level singleton exports (`battleHubManager`, `chatHubManager`) removed from transport files — they are no longer instantiated in the transport layer.
- Created `src/app/transport-init.ts` in the `app/` layer, which wires auth store into all three transport dependencies and exports the hub manager singletons. This file is imported by `App.tsx` to ensure wiring runs at startup.
- Token access remains dynamic (read at call-time via closure over `useAuthStore.getState()`), not captured at construction.

Boundary verification: `grep -r '@/modules/' src/transport/` returns zero matches.

### Fix 2: Deduplicate OnboardResponse

`OnboardResponse` was a full interface duplicating `CharacterResponse` field-for-field.

- `src/types/api.ts`: replaced with `export type OnboardResponse = CharacterResponse;`

### Fix 3: Unconditional Content-Type header

`Content-Type: application/json` was set on every request including GET and DELETE (which have no body).

- `src/transport/http/client.ts`: `Content-Type` header now only set when `init.body` is present.

### Fix 4: Trailing slash in BFF base URL

URL construction could produce double slashes if `VITE_BFF_BASE_URL` ends with `/`.

- `src/config.ts`: base URL is now normalized with `.replace(/\/+$/, '')` at config read time.

### Files modified (6)

| File | Change |
|---|---|
| `src/transport/http/client.ts` | Replaced auth store import with `configureHttpClient()` injection; Content-Type conditional |
| `src/transport/signalr/battle-hub.ts` | Replaced auth store import with constructor-injected `accessTokenFactory`; removed singleton export |
| `src/transport/signalr/chat-hub.ts` | Same as battle-hub |
| `src/types/api.ts` | `OnboardResponse` → type alias for `CharacterResponse` |
| `src/config.ts` | Trailing slash normalization on `bff.baseUrl` |
| `src/app/App.tsx` | Added `import './transport-init'` |

New file:
| `src/app/transport-init.ts` | Wires auth store into HTTP client + creates hub manager singletons |

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint .`: passes (zero errors)
- `npm run dev`: starts on port 3000
- `grep -r '@/modules/' src/transport/`: zero matches — boundary clean

---

## Batch 3 — Phase 2: Startup State Resolution + Route Guards

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

### P2.1: Player store and game state loading

**Status:** Done

- `src/modules/player/store.ts` — Zustand store with `character`, `queueStatus`, `isCharacterCreated`, `degradedServices`, `isLoaded`. Actions: `setGameState()`, `updateCharacter()`, `clearState()`.
- `src/modules/player/hooks.ts` — `useGameState()` TanStack Query hook that fetches `GET /api/v1/game/state` and populates the player store via `useEffect` on data. `useCharacter()` and `useQueueStatus()` selectors.
- `src/app/GameStateLoader.tsx` — Layout route component that calls `useGameState()`, shows loading text while pending, error state on failure, renders `<Outlet />` when loaded.

Auto-onboard is NOT wired here per the task breakdown (deferred to P3.3).

### P2.2: Route tree and shell layouts

**Status:** Done

- `src/app/router.tsx` — Full route tree using `createBrowserRouter`:
  - `/` → `UnauthenticatedShell`
  - `/auth/callback` → `AuthCallback`
  - Authenticated subtree: `AuthGuard` → `GameStateLoader` → `OnboardingGuard` → (onboarding routes via `OnboardingShell` + post-onboarding routes via `BattleGuard`)
  - Under `BattleGuard`: battle routes via `BattleShell`, lobby/matchmaking via `AuthenticatedShell`
- `src/app/route-placeholders.tsx` — Placeholder components for routes not yet implemented (onboarding name/stats, lobby, matchmaking, battle, battle result). Separated from `router.tsx` to satisfy react-refresh single-export rule.
- `src/app/shells/UnauthenticatedShell.tsx` — Landing with Login + Register buttons wired to `useAuth()`.
- `src/app/shells/OnboardingShell.tsx` — Centered card layout with `<Outlet />`.
- `src/app/shells/AuthenticatedShell.tsx` — Header + main + sidebar skeleton with `<Outlet />`.
- `src/app/shells/BattleShell.tsx` — Full-screen layout with `<Outlet />`.

### P2.3: Route guards

**Status:** Done

- `src/app/guards/AuthGuard.tsx` — Reads `authStatus` from auth store. Loading → spinner. Unauthenticated → redirect to `/`. Authenticated → `<Outlet />`.
- `src/app/guards/OnboardingGuard.tsx` — Reads `character` from player store. No character → allows onboarding routes, redirects others to `/onboarding/name`. `Draft` → force `/onboarding/name`. `Named` → force `/onboarding/stats`. `Ready` → blocks onboarding routes (redirects to `/lobby`), allows post-onboarding flow.
- `src/app/guards/BattleGuard.tsx` — Reads `queueStatus` from player store. `Matched` + `battleId` → force `/battle/:battleId`. `Searching` → force `/matchmaking`. No active queue → blocks battle/matchmaking routes (redirects to `/lobby`), allows lobby flow.

Guard hierarchy matches `04` Section 4.2: `AuthGuard > GameStateLoader > OnboardingGuard > BattleGuard > AuthenticatedShell`.

### App.tsx updated

`App.tsx` now renders `<RouterProvider router={router} />` inside the existing `AuthProvider` + `QueryClientProvider` wrapper.

### Files created (12 new, 1 modified)

New files:
- `src/modules/player/store.ts`
- `src/modules/player/hooks.ts`
- `src/app/GameStateLoader.tsx`
- `src/app/router.tsx`
- `src/app/route-placeholders.tsx`
- `src/app/shells/UnauthenticatedShell.tsx`
- `src/app/shells/OnboardingShell.tsx`
- `src/app/shells/AuthenticatedShell.tsx`
- `src/app/shells/BattleShell.tsx`
- `src/app/guards/AuthGuard.tsx`
- `src/app/guards/OnboardingGuard.tsx`
- `src/app/guards/BattleGuard.tsx`

Modified:
- `src/app/App.tsx` — replaced placeholder content with `RouterProvider`

Removed `.gitkeep` from: `src/app/shells/`, `src/app/guards/`, `src/modules/player/screens/`, `src/modules/player/components/`

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint .`: passes (zero errors)
- `npm run dev`: starts on port 3000
- Route structure: all approved routes defined
- Guard hierarchy: `AuthGuard > GameStateLoader > OnboardingGuard > BattleGuard` — matches `04` Section 4.2
- Shell layouts: structural placeholders in place for all four shells
- Game state loading: `GameStateLoader` blocks rendering until `GET /api/v1/game/state` resolves
- Routing logic covers: unauthenticated → landing, no character/Draft → onboarding/name, Named → onboarding/stats, Ready + no queue → lobby, Searching → matchmaking, Matched + battleId → battle

---

## Batch 3 — Phase 2 Cleanup Patch

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified fixes applied before Phase 3.

### Fix 1: Post-login redirect flow (blocking)

`AuthCallback` redirected to `/` on success, which rendered `UnauthenticatedShell` instead of entering the authenticated pipeline.

- `src/modules/auth/AuthCallback.tsx`: success redirect changed from `window.location.replace('/')` to `window.location.replace('/lobby')`. Guards and `GameStateLoader` determine the correct final destination. Error/unauthenticated case still redirects to `/`.

### Fix 2: Tighten OnboardingGuard for null character

When `character` was null, the guard allowed any `/onboarding/*` route. Now only `/onboarding/name` is permitted; `/onboarding/stats` with null character redirects to `/onboarding/name`.

- `src/app/guards/OnboardingGuard.tsx`: changed `location.pathname.startsWith('/onboarding')` to `location.pathname === '/onboarding/name'` in the null-character branch.

### Fix 3: Retry button on GameStateLoader error screen

The error state was a dead-end with no recovery path.

- `src/app/GameStateLoader.tsx`: added a "Retry" button calling `refetch()` from the TanStack Query result.

### Fix 4: Remove useGameState retry override

`useGameState` had `retry: 2` overriding the global default of `3` with no justification.

- `src/modules/player/hooks.ts`: removed the local `retry: 2` override. Now uses the QueryClient default (3 retries).

### Files modified (4)

| File | Change |
|---|---|
| `src/modules/auth/AuthCallback.tsx` | Success redirect → `/lobby` |
| `src/app/guards/OnboardingGuard.tsx` | Null character: only allow `/onboarding/name` |
| `src/app/GameStateLoader.tsx` | Added retry button on error state |
| `src/modules/player/hooks.ts` | Removed local retry override |

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint .`: passes (zero errors)
- `npm run dev`: starts on port 3000
- Post-login flow: AuthCallback → `/lobby` → AuthGuard passes → GameStateLoader fetches → guards route to correct screen

---

## Batch 4 — Phase 3: Onboarding

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

### P3.1: Base UI primitives

**Status:** Done

Created four shared UI components in `src/ui/components/`:

- `Button.tsx` — Variants: primary, secondary, danger. Loading state with spinner. Disabled state. Uses design token colors.
- `TextInput.tsx` — Label, placeholder, error message, character count indicator. Error state border coloring.
- `Spinner.tsx` — Animated CSS spinner with sm/md/lg sizes. Uses accent color token.
- `Card.tsx` — Container with background, border, padding from design tokens. Forwards className.

All components: stateless, token-driven, accept className for composition, named exports only.

### P3.2: Name selection screen

**Status:** Done

- `src/modules/onboarding/components/NameInput.tsx` — Reusable name input with character count, wraps TextInput. Exports `NAME_MIN`/`NAME_MAX` constants.
- `src/modules/onboarding/screens/NameSelectionScreen.tsx` — Name input, client-side validation (3–16 chars), permanent-name warning, submit via `POST /api/v1/character/name` (TanStack Query mutation). Error handling: 409 → "name already taken", 400 → field error display, generic fallback. On success: optimistic store update (`onboardingState: 'Named'`) + game state invalidation → OnboardingGuard routes to `/onboarding/stats`.

Router updated: `/onboarding/name` now renders `NameSelectionScreen` instead of placeholder.

### P3.3: Stat allocation screen and auto-onboard

**Status:** Done

Auto-onboard:
- `src/modules/onboarding/hooks.ts` — `useAutoOnboard()` hook. When game state is loaded but `isCharacterCreated` is false, calls `POST /api/v1/game/onboard` (idempotent). On success, invalidates game state query → GameStateLoader re-fetches → player store gets Draft character → OnboardingGuard routes to `/onboarding/name`.
- `src/app/GameStateLoader.tsx` — Updated to call `useAutoOnboard()`. Shows "Creating character..." while onboard mutation is pending.

Stat allocation:
- `src/modules/onboarding/components/StatPointAllocator.tsx` — Reusable stat row with increment/decrement buttons, base value + added points display. Disabled states for max/min bounds.
- `src/modules/onboarding/screens/InitialStatsScreen.tsx` — Shows base stats from character, additive point allocation across 4 stats, remaining points counter. Submit via `POST /api/v1/character/stats` with `expectedRevision`. Error handling: 409 → refetch game state + reset points ("try again" message), 400/500 → message display. On success: optimistic store update (`onboardingState: 'Ready'`) + game state invalidation → OnboardingGuard passes → BattleGuard passes → lobby.

Router updated: `/onboarding/stats` now renders `InitialStatsScreen` instead of placeholder. Onboarding placeholders removed from `route-placeholders.tsx`.

### Files created (8 new, 3 modified)

New files:
- `src/ui/components/Button.tsx`
- `src/ui/components/TextInput.tsx`
- `src/ui/components/Spinner.tsx`
- `src/ui/components/Card.tsx`
- `src/modules/onboarding/components/NameInput.tsx`
- `src/modules/onboarding/components/StatPointAllocator.tsx`
- `src/modules/onboarding/screens/NameSelectionScreen.tsx`
- `src/modules/onboarding/screens/InitialStatsScreen.tsx`
- `src/modules/onboarding/hooks.ts`

Modified:
- `src/app/GameStateLoader.tsx` — Added `useAutoOnboard()` call + pending state
- `src/app/router.tsx` — Replaced onboarding placeholders with real screens
- `src/app/route-placeholders.tsx` — Removed onboarding placeholders

Removed `.gitkeep` from: `src/modules/onboarding/screens/`, `src/modules/onboarding/components/`, `src/ui/components/`

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint .`: passes (zero errors)
- `npm run dev`: starts on port 3000
- Auto-onboard: when game state has no character, `useAutoOnboard` fires `POST /api/v1/game/onboard`, game state re-fetches, Draft character appears
- Name screen: validates 3–16 chars client-side, submits to server, handles 409/400/500, optimistically updates store on success
- Stats screen: additive allocation of unspent points, validates total, uses expectedRevision, handles 409 with refetch+reset, transitions to Ready on success
- Guard flow: no character → auto-onboard → Draft → `/onboarding/name` → Named → `/onboarding/stats` → Ready → `/lobby`
- Page refresh at any onboarding step: GameStateLoader re-fetches → guards route to correct step

---

## Batch 4 — Phase 3 Cleanup Patch

**Date:** 2026-04-16
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified fixes applied before Phase 4.

### Fix 1: Auto-onboard failure dead-end (blocking)

If `POST /api/v1/game/onboard` failed, `attemptedRef` prevented retry and `GameStateLoader` had no error handling for the onboard mutation. The user was stuck with no character and no recovery path.

- `src/modules/onboarding/hooks.ts`: `useAutoOnboard` now exposes `retry()` which resets the mutation state and clears `attemptedRef`, allowing a clean re-attempt. Returns `{ isPending, isError, error, retry }`.
- `src/app/GameStateLoader.tsx`: added explicit `onboard.isError` handling after the pending check. Shows "Failed to create character" with error message and a "Retry" button that calls `onboard.retry()`.

### Fix 2: Tighten useAutoOnboard effect dependencies

The effect depended on the entire mutation object (unstable reference), causing unnecessary effect runs.

- `src/modules/onboarding/hooks.ts`: destructured `mutate`, `isPending`, `isError`, `error`, `reset` from `useMutation`. Effect depends only on `[isLoaded, isCharacterCreated, isPending, mutate]` — all stable references.

### Fix 3: Runtime guard for ApiError.details field reading

`NameSelectionScreen` consumed `err.error.details` as `Record<string, string[]>` via `.flat()`, but the shared `ApiError.details` type is `Record<string, unknown>`. If the server returned non-array values, `.flat()` would silently produce wrong output.

- `src/modules/onboarding/screens/NameSelectionScreen.tsx`: replaced `.flat()` with an explicit loop that checks `Array.isArray(value)` and `typeof item === 'string'` before collecting messages. The shared `ApiError` type is kept broad (correct for all error types); the consumer handles the runtime shape.

### Files modified (3)

| File | Change |
|---|---|
| `src/modules/onboarding/hooks.ts` | Tighter deps + retry support |
| `src/app/GameStateLoader.tsx` | Onboard error state + retry button |
| `src/modules/onboarding/screens/NameSelectionScreen.tsx` | Runtime guard for details field |

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint .`: passes (zero errors)
- `npm run dev`: starts on port 3000
- Auto-onboard failure: error shown with retry button; retry resets state and re-attempts cleanly

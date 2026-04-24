# Kombats Production Frontend — Architecture Reference

This document is for an engineer about to **swap the visual layer** on the production frontend at `src/Kombats.Client/`. It describes only what you need to know to safely change UI without breaking logic, state, or backend communication.

All paths below are relative to `src/Kombats.Client/src/`.

> Convention used in this doc: `@/foo/bar` is the Vite alias for `src/Kombats.Client/src/foo/bar` (configured in `vite.config.ts`/`tsconfig.app.json`).

---

## 1. Architecture Overview

### 1.1 Stack at a glance (`package.json`)

| Concern | Lib | Notes |
|---|---|---|
| Framework | React 19 + TypeScript | Strict mode in `main.tsx` |
| Build | Vite | `vite.config.ts` |
| Routing | React Router 7 | Data router via `createBrowserRouter` |
| Client state | Zustand 5 | One store per module |
| Server state | TanStack Query 5 | Caching for HTTP reads |
| Realtime | `@microsoft/signalr` 8 | Two hubs: battle + chat |
| Auth | `oidc-client-ts` 3 + `react-oidc-context` 3 | Keycloak OIDC |
| Styling | Tailwind 4 + CSS variable tokens | No CSS modules, no CSS-in-JS |
| Accessibility primitives | Radix UI: dialog, dropdown-menu, scroll-area, tabs, tooltip | Used only when needed |
| Class composition | `clsx`, `tailwind-merge` | |
| Icons | `lucide-react` | |
| Animation | `motion` (Framer Motion) | Imported but used sparingly |
| Toasts | `sonner` | Imported (no global mount yet) |
| Date formatting | `date-fns` | Used by chat timestamps |
| Tests | Vitest | `*.test.ts` co-located |

There is **no UI kit** (no MUI, no Chakra). Visual primitives live in `ui/components/`.

### 1.2 Top-level structure

```
src/
  app/         App shell, routing, guards, query client, transport init
  modules/     Feature verticals: auth, player, onboarding, matchmaking, battle, chat
  transport/   HTTP, SignalR, polling — the only place that touches the network
  ui/          Stateless visual primitives + theme tokens
  types/       Shared TypeScript: api, battle, chat, player, common
  config.ts    Runtime config from VITE_* env vars
  index.css    Tailwind + tokens import + body styles
  main.tsx     Entry point
```

### 1.3 Bootstrap order (`main.tsx` → `app/App.tsx`)

`main.tsx` short-circuits when `location.pathname === '/silent-renew'` (silent SSO renewal iframe) and calls `userManager.signinSilentCallback()` — full app does NOT mount inside that iframe.

Otherwise it renders `<App />` inside React `StrictMode`. `app/App.tsx` wraps:

```tsx
<ErrorBoundary fallback={<AppCrashScreen />}>
  <AuthProvider>                          {/* OIDC + Zustand sync */}
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </AuthProvider>
</ErrorBoundary>
```

`./transport-init` is imported as a side-effect module by `App.tsx` — it wires the HTTP client's `getAccessToken` / `onAuthFailure` from the auth store and constructs the `BattleHubManager` / `ChatHubManager` singletons (`app/transport-init.ts`).

### 1.4 Routing (`app/router.tsx`)

`react-router` v7 data router (`createBrowserRouter`). Tree of nested layouts:

```
/                    → UnauthenticatedShell (guest landing)
/auth/callback       → AuthCallback        (OIDC redirect target)
*                    → NotFoundScreen      (top-level catch-all)

— authenticated subtree (wrapped by guards):
AuthGuard
  GameStateLoader                          (fetches GET /game/state, runs useAutoOnboard)
    OnboardingGuard
      /onboarding/name  → OnboardingShell + NameSelectionScreen
      /onboarding/stats → OnboardingShell + InitialStatsScreen
      SessionShell                         (mounts chat hub + persistent header/dock)
        BattleGuard
          /battle/:battleId        → BattleShell + BattleScreen
          /battle/:battleId/result → BattleShell + BattleResultScreen
          /lobby                   → LobbyShell + LobbyScreen
          /matchmaking             → LobbyShell + SearchingScreen
```

Per-group `errorElement={<AppCrashScreen />}` is attached to the OnboardingShell and BattleShell groups; lobby crashes bubble to the top-level `ErrorBoundary` in `App.tsx`.

#### Guards

All guards delegate to **pure decision helpers** in `app/guards/guard-decisions.ts` (so the routing decisions can be unit-tested without DOM/router). Each guard component just reads from a store and renders `<Navigate>`, `<Outlet>`, or a loading splash.

| Guard | File | Reads from | Decision logic |
|---|---|---|---|
| `AuthGuard` | `app/guards/AuthGuard.tsx` | `useAuthStore.authStatus` | `loading` → `<SplashScreen />`, `unauthenticated` → `<Navigate to="/" />`, else `<Outlet />` |
| `GameStateLoader` | `app/GameStateLoader.tsx` | `useGameState()` (TanStack Query) + `useAutoOnboard()` | Splash on pending; error UI on failure with Retry; auto-creates a Draft character if none exists |
| `OnboardingGuard` | `app/guards/OnboardingGuard.tsx` | `usePlayerStore.character` + `useLocation` | Routes Draft → `/onboarding/name`, Named → `/onboarding/stats`, Ready+ → blocks `/onboarding/*` and falls through |
| `BattleGuard` | `app/guards/BattleGuard.tsx` | `usePlayerStore.queueStatus` + `useBattleStore.{phase,battleId}` + path | Sends users to `/battle/:id` when matched, `/matchmaking` while searching, blocks `/battle/*` and `/matchmaking` when no queue. Special case: keeps users on `/battle/:id/result` after a battle ends, even if queueStatus is gone |

#### Shells (page chrome layers)

| Shell | File | Role |
|---|---|---|
| `UnauthenticatedShell` | `app/shells/UnauthenticatedShell.tsx` | Landing screen — also waits on bootstrap silent restore; calls `useAuth().login`/`register` for the two CTAs; surfaces `bootstrap_timeout` error with Retry |
| `OnboardingShell` | `app/shells/OnboardingShell.tsx` | Bare top bar + centered max-w-lg card with Outlet inside |
| `SessionShell` | `app/shells/SessionShell.tsx` | Mounts `useChatConnection()` + `useNetworkRecovery()`. Renders `AppHeader` on top, Outlet in central region, `BottomDock` (chat + players) at bottom. Hides bottom dock when route ends with `/result` |
| `LobbyShell` | `app/shells/LobbyShell.tsx` | Just a padded flex column for `/lobby` and `/matchmaking` Outlets |
| `BattleShell` | `app/shells/BattleShell.tsx` | Mounts `useBattleConnection(battleId)` for the `/battle/:battleId/*` subtree; mounts `BattleUnloadGuard` (a `beforeunload` warning during active turns) |

### 1.5 Other app-level files

| File | Purpose |
|---|---|
| `app/query-client.ts` | TanStack Query `QueryClient` + retry policy (no retry for 4xx, 3 retries for 5xx/network) + query key factories (`gameKeys`, `playerKeys`, `chatKeys`, `battleKeys`) |
| `app/transport-init.ts` | Wires `httpClient` and constructs `battleHubManager` / `chatHubManager` singletons; injects token factory that throws if no token (so SignalR negotiate cannot be unauthenticated) |
| `app/session-cleanup.ts` | `clearSessionState()` — disconnects hubs, cancels/wipes query cache, resets every Zustand store; called from `useAuth.logout()` |
| `app/crash-recovery.ts` | `selectRecoveryTarget(battleId, phase)` — picks "Return to battle"/"Return to lobby" target for `AppCrashScreen` |
| `app/useNetworkRecovery.ts` | Listens to `online`/`offline` browser events and re-`connect()`s any hub stuck in `failed` state |
| `app/logger.ts` | Tiny `console.{warn,error,info}` wrapper |
| `app/AppHeader.tsx` | Logged-in top header: KOMBATS wordmark, NavLinks (placeholders), profile dropdown with Sign out |
| `app/BottomDock.tsx` | Persistent bottom region: Room Chat panel + Players column + side Sheets for DMs and ConversationList; opens `PlayerCard` modal |
| `app/AppCrashScreen.tsx` | Top-level error boundary fallback; goes through hard `window.location.assign` to recover |
| `app/NotFoundScreen.tsx` | Branded 404 |

---

## 2. State Management

### 2.1 The model

Two coexisting state systems, **no React contexts of our own** (only `react-oidc-context` and `QueryClientProvider`):

- **Zustand stores** (one per module) own client/realtime state and anything routing guards must read synchronously.
- **TanStack Query** owns server-state (HTTP reads) — caching, deduplication, retry, background refetch.
- A few stores are also written from inside TanStack Query `queryFn`s — the canonical example is `usePlayerStore.setGameState(data)` being called from `useGameState()`. This is by design because guards need synchronous reads of `character` / `queueStatus`.

**Mutations** (POSTs/PUTs) go through `useMutation` (TanStack Query) and either invalidate `gameKeys.state()` or directly write to the player store on success.

### 2.2 Store catalog

Every store is created with bare `create<T>()((set, get) => …)` — no middleware (no persist, no devtools).

#### `useAuthStore` — `modules/auth/store.ts`

```ts
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type AuthError  = 'bootstrap_timeout';

interface AuthState {
  accessToken: string | null;        // in-memory only, never persisted (DEC-6)
  userIdentityId: string | null;     // OIDC sub
  displayName: string | null;
  authStatus: AuthStatus;
  authError: AuthError | null;

  setUser(token, identityId, displayName);
  updateToken(token);
  clearAuth();
  setAuthError(error);
}
```
Driven entirely by `AuthProvider.tsx` (see §4). Read by `AuthGuard`, `AppHeader`, `BattleScreen`, `BattleResultScreen`, `useAuth()` hook, transport init's `getAccessToken`.

#### `usePlayerStore` — `modules/player/store.ts`

Holds character + queue state — both populated from `GET /api/v1/game/state`.

```ts
interface PlayerState {
  character: CharacterResponse | null;
  queueStatus: QueueStatusResponse | null;     // authoritative queue source of truth
  isCharacterCreated: boolean;
  degradedServices: string[] | null;
  isLoaded: boolean;

  // Post-battle handoff (single atomic write set by `returnFromBattle`)
  postBattleRefreshNeeded: boolean;
  pendingLevelUpLevel: number | null;
  dismissedBattleId: string | null;             // suppresses stale Matched.<id> refetch

  setGameState(response);
  setQueueStatus(queueStatus);
  updateCharacter(character);
  setPostBattleRefreshNeeded(needed);
  setPendingLevelUpLevel(level);
  setDismissedBattleId(battleId);
  returnFromBattle(battleId);                   // atomic post-battle handoff
  clearState();
}
```
Read by: `OnboardingGuard`, `BattleGuard`, `useMatchmaking`, `useMatchmakingPolling`, `LobbyScreen`, `CharacterPortraitCard`, `usePostBattleRefresh`, `BattleScreen`, `BattleResultScreen`, `AppHeader`.

#### `useBattleStore` — `modules/battle/store.ts`

The most complex store; drives the battle state machine.

```ts
type BattlePhase =
  | 'Idle' | 'Connecting' | 'WaitingForJoin'
  | 'ArenaOpen' | 'TurnOpen' | 'Submitted' | 'Resolving'
  | 'Ended' | 'ConnectionLost' | 'Error';

interface BattleState {
  phase: BattlePhase;
  battleId, playerAId, playerBId, playerAName, playerBName, ruleset;
  turnIndex, deadlineUtc;
  selectedAttackZone, selectedBlockPair, isSubmitting;
  playerAHp, playerBHp, playerAMaxHp, playerBMaxHp;
  endReason, winnerPlayerId;
  lastResolution;
  feedEntries: BattleFeedEntry[];               // capped at MAX_FEED_ENTRIES = 500
  connectionState: ConnectionState;
  lastError: string | null;

  // SignalR event handlers — wired by useBattleConnection
  setConnectionState, startBattle, handleConnected, handleSnapshot,
  handleBattleReady, handleTurnOpened, handlePlayerDamaged, handleTurnResolved,
  handleStateUpdated, handleBattleEnded, handleFeedUpdated,
  handleConnectionLost, handleReconnected, handleError;

  // UI actions
  selectAttackZone, selectBlockPair, setSubmitting, clearSelections, reset;
}
```

Important nuance: when a `BattleStateUpdated` event arrives with phase=`TurnOpen` while we're locally `Submitted`, `serverPhaseToLocal` keeps us on `Submitted` — server doesn't know we already submitted (avoids "your turn" flash mid-submit).

Read by: `BattleGuard`, `BattleScreen`, `BattleResultScreen`, `BattleShell`, `ZoneSelector`, `TurnTimer`, `NarrationFeed`, `TurnResultPanel`, `BattleEndOverlay`, `FighterCard`, `AppCrashScreen`.

#### `useChatStore` — `modules/chat/store.ts`

```ts
interface ChatState {
  connectionState: ConnectionState;
  globalConversationId: Uuid | null;
  globalMessages: ChatMessageResponse[];           // cap MAX_GLOBAL_MESSAGES = 500
  directConversations: Map<Uuid, DirectConversation>;
  onlinePlayers: Map<Uuid, OnlinePlayerResponse>;
  onlineCount: number;
  rateLimitState: { isLimited, retryAfterMs, limitedAt };
  suppressedOpponentId: Uuid | null;               // mutes DMs from current battle opp
  lastError: ChatErrorEvent | null;

  setConnectionState, setGlobalSession, addGlobalMessage,
  addOnlinePlayer, removeOnlinePlayer, addDirectMessage,
  setSuppressedOpponent, clearSuppressedOpponent,
  handleChatError, handleConnectionLost, clearRateLimit, clearStore;
}
```
Per-conversation DM buffer also capped (`MAX_DIRECT_MESSAGES_PER_CONVERSATION = 500`). Direct messages from `suppressedOpponentId` (set by `useBattleConnection` while battle is live) are dropped, not displayed.

Read by `ChatPanel`, `OnlinePlayersList`, `ConversationList`, `DirectMessagePanel`, `ChatErrorDisplay`, `BottomDock`.

#### `useMatchmakingStore` — `modules/matchmaking/store.ts`

UI-local concerns only. The authoritative queue state lives in `usePlayerStore.queueStatus` — there used to be a duplicate that caused redirect loops; do **not** add a second mirror here.

```ts
interface MatchmakingState {
  searchStartedAt: number | null;          // for the elapsed timer in SearchingScreen
  consecutiveFailures: number;             // shows "Connection issues" hint
  battleTransitioning: boolean;            // bridge between leaveQueue() returning and queue write

  startSearch, setIdle, setBattleTransitioning, incrementFailures, resetFailures;
}
```

#### Onboarding — no store

Onboarding has no Zustand store. It uses local component state + the player store + TanStack Query mutations.

### 2.3 Cross-store coordination

There IS cross-store reading (deliberate):

- `useBattleConnection` reads `useAuthStore.userIdentityId` (to derive opponent) and writes to `useChatStore.setSuppressedOpponent` (to mute DMs from opponent during the battle, and clear on `BattleEnded`).
- `usePostBattleRefresh` reads from query cache + writes `pendingLevelUpLevel` to the player store.
- `useMatchmaking` reads from `usePlayerStore.queueStatus` and writes UI flags to its own store + queue snapshots back to the player store.
- `useAuth.logout()` calls `clearSessionState()` which resets every store.

When swapping the visual layer **do not** introduce additional cross-module store writes; it's the architectural sin most likely to recreate F-A3 (the redirect-loop bug).

---

## 3. Backend Communication

All network code lives in `transport/`. **Never** call `fetch` or `new HubConnection` from a screen/component.

### 3.1 HTTP — `transport/http/`

`client.ts` exports `httpClient.{get,post,put,delete}<T>` plus `configureHttpClient({ getAccessToken, onAuthFailure })` (called once from `app/transport-init.ts`).

Behavior:
- Prepends `config.bff.baseUrl` (`VITE_BFF_BASE_URL`).
- Adds `Authorization: Bearer <token>` if `getAccessToken()` returns one.
- Sets `Content-Type: application/json` whenever a body is provided.
- On `401`: calls `onAuthFailure()` (which clears the auth store — the AuthGuard then bounces to `/`).
- On any non-2xx: throws an `ApiError` shape: `{ error: { code, message, details? }, status }` (parsed from JSON if possible, falls back to status text).
- `204 No Content`: returns `undefined`.
- **No retry, no caching** — TanStack Query handles those.

Endpoint groups (all in `transport/http/endpoints/`):

| File | Functions | BFF paths |
|---|---|---|
| `game.ts` | `getState()`, `onboard()` | `GET /api/v1/game/state`, `POST /api/v1/game/onboard` |
| `character.ts` | `setName(req)`, `allocateStats(req)` | `POST /api/v1/character/name`, `POST /api/v1/character/stats` |
| `queue.ts` | `join()`, `leave()`, `getStatus()` | `POST /api/v1/queue/join`, `POST /api/v1/queue/leave`, `GET /api/v1/queue/status` |
| `battle.ts` | `getFeed(battleId)` | `GET /api/v1/battles/:id/feed` |
| `chat.ts` | `getConversations()`, `getMessages(id, before?)`, `getDirectMessages(otherId, before?)`, `getOnlinePlayers(limit?, offset?)` | `GET /api/v1/chat/...` |
| `players.ts` | `getCard(playerId)` | `GET /api/v1/players/:id/card` |

### 3.2 SignalR — `transport/signalr/`

Two hub manager classes — singletons live in `app/transport-init.ts`. Both share the same lifecycle pattern: `connect()` and `disconnect()` are serialized through a `pending` promise queue (StrictMode-safe; React 19's mount → cleanup → mount cycle would otherwise abort negotiate).

Reconnect schedule (both hubs): `[0, 1000, 2000, 5000, 10000, 30000]` ms. After exhaustion, `connectionState` transitions to terminal `failed`. `useNetworkRecovery` re-`connect()`s any `failed` hub on a browser `online` event.

#### `BattleHubManager` — `transport/signalr/battle-hub.ts`

URL: `${baseUrl}/battlehub`, token from injected factory (throws if no token).

**Outbound invokes:**

| Method | Args | Returns |
|---|---|---|
| `joinBattle(battleId)` | string | `BattleSnapshotRealtime` |
| `submitTurnAction(battleId, turnIndex, payload)` | strings | void |

`joinBattle` retries up to 8 times against the transient `Battle <id> not found` HubException (matchmaking↔battle race) — total ~8s budget.

`submitTurnAction`'s `payload` MUST be a `JSON.stringify`'d string (not an object). It is built by `buildActionPayload(attackZone, blockPair)` in `modules/battle/zones.ts`:
```ts
JSON.stringify({ attackZone, blockZonePrimary, blockZoneSecondary })
```

**Inbound events (registered in `setEventHandlers`):**

| Event | Payload type | Default handler effect |
|---|---|---|
| `BattleReady` | `BattleReadyRealtime` | `useBattleStore.handleBattleReady` → phase=`ArenaOpen` |
| `TurnOpened` | `TurnOpenedRealtime` | `handleTurnOpened` → phase=`TurnOpen`, clears selections |
| `PlayerDamaged` | `PlayerDamagedRealtime` | `handlePlayerDamaged` → updates HP for matching player |
| `TurnResolved` | `TurnResolvedRealtime` | `handleTurnResolved` → phase=`Resolving`, stores lastResolution |
| `BattleStateUpdated` | `BattleStateUpdatedRealtime` | `handleStateUpdated` → reconciles full state (server is source of truth) |
| `BattleEnded` | `BattleEndedRealtime` | `handleBattleEnded` → phase=`Ended`, sets endReason/winner |
| `BattleFeedUpdated` | `BattleFeedUpdate` | `handleFeedUpdated` → dedupes by `entry.key`, appends, trims to 500 |
| `BattleConnectionLost` | — | `handleConnectionLost` |
| `onConnectionStateChanged` | `ConnectionState` | Drives phase transitions and rejoins on reconnect |

Wired by `useBattleConnection(battleId)` in `modules/battle/hooks.ts`. On reconnect this hook re-invokes `joinBattle(battleId)` and re-applies the snapshot.

#### `ChatHubManager` — `transport/signalr/chat-hub.ts`

URL: `${baseUrl}/chathub`. Same connect/disconnect serialization and reconnect schedule.

**Outbound invokes:**

| Method | Args | Returns |
|---|---|---|
| `joinGlobalChat()` | — | `JoinGlobalChatResponse` |
| `leaveGlobalChat()` | — | void |
| `sendGlobalMessage(content)` | string | void |
| `sendDirectMessage(recipientId, content)` | strings | `SendDirectMessageResponse` |

**Inbound events:**

| Event | Effect |
|---|---|
| `GlobalMessageReceived` | `addGlobalMessage` |
| `DirectMessageReceived` | `addDirectMessage` (drops if sender is `suppressedOpponentId`) |
| `PlayerOnline` / `PlayerOffline` | `addOnlinePlayer` / `removeOnlinePlayer` |
| `ChatError` | `handleChatError` (rate_limited sets `rateLimitState`) |
| `ChatConnectionLost` | `handleConnectionLost` |
| `onConnectionStateChanged` | On `connected`: re-join global chat if a `globalConversationId` was already known |

Wired by `useChatConnection()` in `modules/chat/hooks.ts`, mounted at `SessionShell` level so the connection survives lobby ↔ battle navigation. There's also `reconnectChat()` exported for the manual-reconnect button in `ChatErrorDisplay`.

### 3.3 Polling — `transport/polling/matchmaking-poller.ts`

Singleton class instance with `start(intervalMs, onResult, onError)` / `stop()`. Generation counter prevents stale callbacks after `stop()`. Used only by `useMatchmakingPolling()` at 2-second intervals while the queue UI is active.

### 3.4 Error handling patterns

- **HTTP errors** throw `ApiError`. Use `isApiError(err)` from `types/api.ts` (centralized type guard).
- TanStack Query retry policy (`shouldRetryQuery` in `app/query-client.ts`): no retry on 4xx (auth/conflict/permission); up to 3 retries with default backoff on 5xx/network.
- Mutations: `retry: false` globally — call sites handle errors explicitly via `onError` or by reading `mutation.error`.
- 401 also fires `onAuthFailure()` → clears auth store → AuthGuard bounces to `/`.
- Hub `connectionState === 'failed'`: `useNetworkRecovery` re-connects on `online` event; battle hub `failed` during a live battle transitions battle store to `phase: 'Error'` (via `useBattleConnection`) so the UI can show a "Leave battle" escape (`BattleScreen.LeaveBattleEscape`).
- `ErrorBoundary` (`ui/components/ErrorBoundary.tsx`) wraps the app and the inner battle action panel; falls back to `AppCrashScreen` (top-level) which uses hard `window.location.assign` to recover.

---

## 4. Auth Flow (Keycloak via OIDC)

### 4.1 UserManager (`modules/auth/user-manager.ts`)

```ts
new UserManager({
  authority: VITE_KEYCLOAK_AUTHORITY,
  client_id: VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: `${origin}/auth/callback`,
  silent_redirect_uri: `${origin}/silent-renew`,
  post_logout_redirect_uri: `${origin}/`,    // trailing slash required by Keycloak wildcard
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  accessTokenExpiringNotificationTimeInSeconds: 60,
  silentRequestTimeoutInSeconds: 10,
  userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
});
```

Key constraint (DEC-6): **tokens live in memory only, never `localStorage`**. The user store is backed by `InMemoryWebStorage`. Page refresh = no local user → silent SSO restore via Keycloak's HTTP-only SSO cookie.

`/silent-renew` is short-circuited in `main.tsx` so the iframe does not re-mount the full app.

### 4.2 AuthProvider (`modules/auth/AuthProvider.tsx`)

Wraps `react-oidc-context`'s `AuthProvider` with our `<AuthSync>` glue.

Sub-flow:

1. **Bootstrap** — on app load, attempt one silent restore (`auth.signinSilent()`). 12s external timeout (`BOOTSTRAP_TIMEOUT_MS`) guarantees finalizer runs even if `signinSilent` hangs. On timeout, sets `authError: 'bootstrap_timeout'` so `UnauthenticatedShell` shows a Retry banner. Singleton gate via `bootstrap-retry.ts` so StrictMode's double-effect does not re-bootstrap.
2. **Sync** — when oidc reports a non-expired user, mirror it into `useAuthStore.setUser`. Otherwise (after bootstrap) call `clearAuth()`.
3. **Token renewal** — `userManager.events.addUserLoaded` updates `useAuthStore.updateToken(newAccessToken)` whenever oidc refreshes. **The token is updated in-place; in-flight battles are not affected.** SignalR's `accessTokenFactory` reads the latest token at reconnect time.
4. **Silent renew failure** — clears auth.

### 4.3 useAuth hook (`modules/auth/hooks.ts`)

```ts
const { authStatus, userIdentityId, displayName, isAuthenticated, isLoading,
        login, register, logout } = useAuth();
```

- `login()` → `oidcAuth.signinRedirect()`
- `register()` → `signinRedirect({ extraQueryParams: { kc_action: 'register', prompt: 'create' } })` (Keycloak version-tolerant — both params work depending on Keycloak version, the other is ignored)
- `logout()` runs an explicitly ordered sequence:
  1. Capture `id_token_hint` from current oidc user (needed to skip Keycloak's logout-confirmation page).
  2. `oidcAuth.removeUser()` (so AuthSync doesn't re-authenticate before we clear the store).
  3. `clearSessionState()` — disconnect hubs, clear queries, reset every store.
  4. `oidcAuth.signoutRedirect({ id_token_hint })`. On failure, hard `window.location.assign('/')`.

### 4.4 AuthCallback (`modules/auth/AuthCallback.tsx`)

Mounted at `/auth/callback`. Renders a SplashScreen and waits for `react-oidc-context` to finish processing; then `navigate('/lobby')` on success or `/` on failure.

### 4.5 What happens to a battle on token expiry?

`automaticSilentRenew: true` + 60s expiring notification means oidc-client-ts hits the silent-renew iframe ~60s before token expiry. `userLoaded` updates `useAuthStore.updateToken()`. The next time SignalR reconnects (or first invoke after token rotation), `accessTokenFactory()` returns the fresh token — **already-open hub connections are not torn down on token rotation**.

If the silent renew fails, `addSilentRenewError` clears auth. `AuthGuard` then bounces to `/`. A live battle's hub will eventually receive a 401 / get killed and surface as `phase: 'Error'`.

---

## 5. Screen-by-Screen Component Map

### 5.1 Login / Guest landing — `app/shells/UnauthenticatedShell.tsx`

| | |
|---|---|
| **Path** | `/` |
| **File** | `app/shells/UnauthenticatedShell.tsx` |
| **Children** | `SplashScreen` (during bootstrap) — otherwise inline header + main with login/register CTAs |
| **Stores** | `useAuthStore` (authStatus, authError) |
| **Hooks** | `useAuth()` |
| **API/WS** | None directly; `useAuth().login`/`register` triggers Keycloak redirect |
| **Special** | While `authStatus==='loading'` shows splash. If silent restore succeeds, `<Navigate to="/lobby" />`. The `bootstrap_timeout` error surfaces a banner with Retry that calls `retryBootstrap()` |
| **Styling** | Tailwind classes only |

### 5.2 OIDC callback — `modules/auth/AuthCallback.tsx`

| | |
|---|---|
| **Path** | `/auth/callback` |
| **File** | `modules/auth/AuthCallback.tsx` |
| **Children** | `SplashScreen` |
| **Stores** | None (uses `react-oidc-context`'s `useAuth` directly) |
| **API/WS** | None (oidc handles code exchange) |
| **Behavior** | Navigates to `/lobby` on success, `/` on failure. Pure transition screen |

### 5.3 Onboarding — Name selection

| | |
|---|---|
| **Path** | `/onboarding/name` |
| **File** | `modules/onboarding/screens/NameSelectionScreen.tsx` |
| **Wrapped by** | `OnboardingShell` (centered max-w-lg card) |
| **Children** | `NameInput` (`modules/onboarding/components/NameInput.tsx`), `Button` (`ui/components/Button.tsx`) |
| **Stores** | `usePlayerStore` (character, updateCharacter) |
| **TanStack Query** | `useMutation(characterApi.setName)` — invalidates `gameKeys.state()` on success |
| **API/WS** | `POST /api/v1/character/name` |
| **Special** | Validates name client-side (`NAME_MIN=3`, `NAME_MAX=16`). Optimistically writes `updateCharacter({ ...character, name, onboardingState: 'Named' })` before invalidation. Surfaces 409 (duplicate name) and 400 (validation details) explicitly |

### 5.4 Onboarding — Stat allocation

| | |
|---|---|
| **Path** | `/onboarding/stats` |
| **File** | `modules/onboarding/screens/InitialStatsScreen.tsx` |
| **Wrapped by** | `OnboardingShell` |
| **Children** | `StatPointAllocator` (`ui/components/StatPointAllocator.tsx`), `Button` |
| **Stores** | `usePlayerStore` (character, updateCharacter) |
| **Hooks** | `useAllocateStats()` (`modules/player/useAllocateStats.ts`) — handles increment/decrement/submit with `expectedRevision` for optimistic concurrency |
| **API/WS** | `POST /api/v1/character/stats` |
| **Special** | On success, sets `onboardingState: 'Ready'` so `OnboardingGuard` redirects out to `/lobby`. Uses `STAT_KEYS` and `STAT_LABELS` from `useAllocateStats.ts` |

### 5.5 Lobby — `modules/player/screens/LobbyScreen.tsx`

| | |
|---|---|
| **Path** | `/lobby` |
| **File** | `modules/player/screens/LobbyScreen.tsx` |
| **Wrapped by** | `LobbyShell` inside `SessionShell` (header + chat dock chrome) |
| **Children** | `CharacterPortraitCard`, `LevelUpBanner`, `StatAllocationPanel`, `QueueButton` (`modules/matchmaking/components/QueueButton.tsx`), inline `ReadyForCombatPanel`, inline `SecondaryActions` (placeholder buttons) |
| **Stores** | `usePlayerStore` (character) |
| **Hooks** | `usePostBattleRefresh()` — runs once per post-battle return; refetches `gameKeys.state()`, retries after 3s if XP/level still stale (DEC-5), surfaces level-up banner |
| **API/WS** | Indirect (via the hooks above; no direct calls) |
| **Special** | Conditionally renders `<StatAllocationPanel />` if `character.unspentPoints > 0` (post-level-up flow); otherwise the `ReadyForCombatPanel` with `<QueueButton />` |

### 5.6 Matchmaking / Searching — `modules/matchmaking/screens/SearchingScreen.tsx`

| | |
|---|---|
| **Path** | `/matchmaking` |
| **File** | `modules/matchmaking/screens/SearchingScreen.tsx` |
| **Wrapped by** | `LobbyShell` inside `SessionShell` |
| **Children** | `SearchingIndicator` (spinner), `Button`, `CharacterPortraitCard` |
| **Stores** | `useMatchmakingStore` (via `useMatchmaking`), `usePlayerStore` (via `useMatchmakingPolling`) |
| **Hooks** | `useMatchmaking()` (status / leaveQueue), `useMatchmakingPolling()` (starts 2s `matchmakingPoller`) |
| **API/WS** | `POST /api/v1/queue/leave` (cancel), `GET /api/v1/queue/status` (poll 2s) |
| **Special** | Status text reads from derived `QueueUiStatus` (`'idle'` / `'searching'` / `'matched'` / `'battleTransition'`). `cancel` button disabled while transitioning. After 3+ consecutive poll failures, shows "Connection issues — retrying…" warning. When poller observes `Matched + battleId`, sets `battleTransitioning: true` and writes queue to player store; `BattleGuard` then routes to `/battle/:id` |

### 5.7 Battle — `modules/battle/screens/BattleScreen.tsx`

| | |
|---|---|
| **Path** | `/battle/:battleId` |
| **File** | `modules/battle/screens/BattleScreen.tsx` |
| **Wrapped by** | `BattleShell` (mounts `useBattleConnection(battleId)` + `BattleUnloadGuard`) inside `SessionShell` |
| **Children** | `FighterCard` × 2 (self + opponent), `TurnInfoBar` (inline), `ZoneSelector`, `WaitingPanel` (inline), `TurnResultPanel`, `NarrationFeed`, `BattleEndOverlay`, `Spinner`, `ConnectionIndicator`, `ErrorBoundary` (around `ActionPanelSlot`), `Banner` (inline), `LeaveBattleEscape` (inline), `ConnectionLostBanner` (inline) |
| **Stores** | `useBattleStore` (phase, lastError, player IDs/names, HPs), `useAuthStore` (userIdentityId), `usePlayerStore` (returnFromBattle for the leave-battle escape) |
| **Hooks** | `useBattlePhase`, `useBattleHp`, `useBattleTurn`, `useBattleConnectionState` (selectors); `useQuery(playerKeys.card(playerId), playersApi.getCard)` for both fighter cards (60s staleTime) |
| **API/WS** | `GET /api/v1/players/:id/card` × 2; SignalR via the `useBattleConnection` ancestor |
| **Special** | `ActionPanelSlot` switches between `<ZoneSelector />` (TurnOpen), `<WaitingPanel kind="submitted" />` (Submitted), `<WaitingPanel kind="resolving" />` (Resolving), `<TurnResultPanel />` (otherwise). `BattleEndOverlay` is rendered always but self-shows when phase=`Ended`. `Error` phase shows a banner + `LeaveBattleEscape` button (calls `returnFromBattle(battleId)` + `useBattleStore.reset()` + `navigate('/lobby')`) |

### 5.8 Battle Result — `modules/battle/screens/BattleResultScreen.tsx`

| | |
|---|---|
| **Path** | `/battle/:battleId/result` |
| **File** | `modules/battle/screens/BattleResultScreen.tsx` |
| **Wrapped by** | `BattleShell` inside `SessionShell`. `SessionShell` hides the bottom dock when path ends in `/result` |
| **Children** | `Spinner`, `NarrationFeed` (with `entries={...}` prop, not from store) |
| **Stores** | `useBattleStore` (phase, battleId, playerAId, names, endReason/winner), `useAuthStore` (userIdentityId), `usePlayerStore` (returnFromBattle) |
| **Hooks** | `useBattlePhase`, `useBattleResult`, `useResultBattleFeed(battleId)` (combines feedEntries from store with `GET /api/v1/battles/:id/feed` HTTP backfill) |
| **API/WS** | `GET /api/v1/battles/:battleId/feed` |
| **Special** | If `storeBattleId !== battleId` (mismatch / fresh load) → `<Navigate to="/lobby" />`. Renders only when phase=`Ended`; otherwise spinner. Outcome derivation: `deriveOutcome(endReason, winnerPlayerId, myId)` → `OUTCOME_TONE[outcome]` for color schemes (containerBg / border / iconBg / iconShadow / accentClass / primaryButton / secondaryButton — `modules/battle/outcome-tone.ts`). Both Return/Play Again CTAs call `returnFromBattle(battleId)` + `navigate('/lobby')` |

### 5.9 Loading / Splash — `ui/components/SplashScreen.tsx`

| | |
|---|---|
| **Used by** | `AuthGuard` (loading), `UnauthenticatedShell` (during bootstrap), `GameStateLoader` (pending), `AuthCallback` |
| **Children** | `Spinner` |
| **Stores/API** | None |
| **Styling** | Tailwind: `flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-primary`, KOMBATS wordmark in `font-display` |

### 5.10 404 — `app/NotFoundScreen.tsx`

| | |
|---|---|
| **Path** | `*` (top-level catch-all) |
| **File** | `app/NotFoundScreen.tsx` |
| **Children** | `<Link to="/">Return Home</Link>` |
| **Stores/API** | None |
| **Styling** | Tailwind only; KOMBATS wordmark + "Signal Lost · 404" + body copy + Return Home CTA |

### 5.11 Crash recovery — `app/AppCrashScreen.tsx`

| | |
|---|---|
| **Used by** | Top-level `ErrorBoundary` in `App.tsx` and per-shell `errorElement` in router |
| **Stores** | Snapshot-reads `useBattleStore.getState()` (battleId, phase) — no subscription |
| **Behavior** | Picks recovery target via `selectRecoveryTarget` (`app/crash-recovery.ts`); recovers via `window.location.assign(href)` (hard nav so all in-memory state and hubs reinitialize cleanly) |

---

## 6. Shared / Common Components

### 6.1 `ui/components/` — visual primitives (all stateless, no store deps)

| Component | File | Props (key fields) | Used by |
|---|---|---|---|
| `Button` | `Button.tsx` | `variant: 'primary' \| 'secondary' \| 'danger'`, `loading?: boolean`, plus standard `<button>` HTML attrs | Onboarding screens, SearchingScreen |
| `TextInput` | `TextInput.tsx` | `label?`, `error?`, `charCount?: { current, max }`, plus standard `<input>` HTML attrs | `NameInput` |
| `Spinner` | `Spinner.tsx` | `size: 'sm' \| 'md' \| 'lg'`, `className?` | Buttons, Splash, Battle, Searching |
| `SplashScreen` | `SplashScreen.tsx` | none | All loading gates |
| `ProgressBar` | `ProgressBar.tsx` | `value`, `max`, `label?`, `showText?`, `colorClass?` | `HpRow` (in CharacterPortraitCard) |
| `Badge` | `Badge.tsx` | `variant: 'default' \| 'accent' \| 'success' \| 'warning' \| 'error'` | `FighterCard`, `CharacterPortraitCard` |
| `Card` | `Card.tsx` | (not yet wired into any screen — generic surface) | — |
| `Avatar` | `Avatar.tsx` | (image + size) | (placeholder; not in critical paths) |
| `ConnectionIndicator` | `ConnectionIndicator.tsx` | `state: ConnectionState`, `className?` | `ChatPanel`, `BattleScreen.TurnInfoBar` |
| `ErrorBoundary` | `ErrorBoundary.tsx` | `children`, `fallback: ReactNode \| (props) => ReactNode`, `onError?` | `App`, `BattleScreen` |
| `Sheet` | `Sheet.tsx` | `open`, `onClose`, `title?`, `children` — wraps `@radix-ui/react-dialog` as a right-side sheet | `BottomDock` (DM panel + ConversationList) |
| `StatPointAllocator` | `StatPointAllocator.tsx` | `label`, `baseValue`, `addedPoints`, `onIncrement`, `onDecrement`, `canIncrement`, `canDecrement`, `disabled?` | `InitialStatsScreen`, `StatAllocationPanel` |

### 6.2 Module-internal shared visuals

These live inside their owning module but are imported by other modules' screens:

| Component | File | Imported by |
|---|---|---|
| `CharacterPortraitCard` | `modules/player/components/CharacterPortraitCard.tsx` | `LobbyScreen`, `SearchingScreen` |
| `StatList`, `Divider`, `RatingChip`, `HpRow`, `PortraitGlyph` | (re-exported from same file) | `FighterCard` (battle) |
| `LevelUpBanner` | `modules/player/components/LevelUpBanner.tsx` | `LobbyScreen` |
| `StatAllocationPanel` | `modules/player/components/StatAllocationPanel.tsx` | `LobbyScreen` |
| `PlayerCard` | `modules/player/components/PlayerCard.tsx` | `BottomDock` (modal profile view) |
| `QueueButton` | `modules/matchmaking/components/QueueButton.tsx` | `LobbyScreen` |
| `SearchingIndicator` | `modules/matchmaking/components/SearchingIndicator.tsx` | `SearchingScreen` |
| `NameInput` | `modules/onboarding/components/NameInput.tsx` | `NameSelectionScreen` |
| `FighterCard` | `modules/battle/components/FighterCard.tsx` | `BattleScreen` |
| `ZoneSelector` | `modules/battle/components/ZoneSelector.tsx` | `BattleScreen` |
| `TurnTimer` | `modules/battle/components/TurnTimer.tsx` | `BattleScreen` |
| `TurnResultPanel` | `modules/battle/components/TurnResultPanel.tsx` | `BattleScreen` |
| `NarrationFeed` | `modules/battle/components/NarrationFeed.tsx` | `BattleScreen`, `BattleResultScreen` |
| `BattleEndOverlay` | `modules/battle/components/BattleEndOverlay.tsx` | `BattleScreen` |
| `ChatPanel` | `modules/chat/components/ChatPanel.tsx` | `BottomDock` |
| `OnlinePlayersList` | `modules/chat/components/OnlinePlayersList.tsx` | `BottomDock` |
| `DirectMessagePanel` | `modules/chat/components/DirectMessagePanel.tsx` | `BottomDock` |
| `ConversationList` | `modules/chat/components/ConversationList.tsx` | `BottomDock` |
| `ChatErrorDisplay` | `modules/chat/components/ChatErrorDisplay.tsx` | `BottomDock` |
| `MessageInput` | `modules/chat/components/MessageInput.tsx` | `ChatPanel`, `DirectMessagePanel` |

### 6.3 App-level chrome

| Component | File | Used by |
|---|---|---|
| `AppHeader` | `app/AppHeader.tsx` | `SessionShell` |
| `BottomDock` | `app/BottomDock.tsx` | `SessionShell` |
| `OnboardingShell` header (inline) | `app/shells/OnboardingShell.tsx` | wraps onboarding screens |
| `UnauthenticatedShell` header (inline) | `app/shells/UnauthenticatedShell.tsx` | landing |

---

## 7. Conventions & Patterns

### 7.1 File naming

- Component files: `PascalCase.tsx`. Components themselves use `PascalCase`.
- Hooks/utilities: `camelCase.ts` (e.g. `hooks.ts`, `store.ts`, `query-client.ts`, `crash-recovery.ts`).
- Tests co-located as `{name}.test.ts` / `{name}.test.tsx`.
- Endpoints grouped per BFF domain inside `transport/http/endpoints/`.

### 7.2 Component patterns

- **Functional components only.** No class components except `ErrorBoundary` (React requires).
- **Plain function declarations** — no `React.FC`. Props typed explicitly via inline interfaces or top-of-file types.
- **Named exports only** — no default exports anywhere.
- **No HOCs, no render props.** Composition is via children + hooks.
- Local component state via `useState`/`useReducer` is fine when it's UI-ephemeral; anything global goes in a Zustand store.
- Selectors: components subscribe to specific store fields via `useStore((s) => s.field)` — avoid grabbing the full state object.

### 7.3 Styling

- **Tailwind 4 with CSS-variable tokens** via `@theme` mapping in `index.css`. Token CSS lives in `ui/theme/tokens.css` (and `fonts.css`).
- All tokens follow the shape `--color-{role}` / `--space-*` / `--radius-*` / `--font-*` / `--shadow-*` / `--duration-*`.
- Tailwind utilities reference the mapped tokens directly: `bg-bg-primary`, `text-text-muted`, `border-border`, `rounded-md`, `font-display`, `bg-attack/10`, etc.
- `clsx` for conditional classes. `tailwind-merge` is installed but rarely used (most components don't compose Tailwind utilities at runtime).
- **Inline `style={{}}`** is used only for runtime computed values (`width: ${pct}%` in ProgressBar) — there are no static inline styles.
- **No CSS modules, no CSS-in-JS** anywhere in the production codebase.
- The `font-display` tailwind class currently maps to `Orbitron` (`tokens.css`); this is the visual that the new design will likely change.

### 7.4 TypeScript

- `strict: true` (per `tsconfig.app.json`).
- Module resolution alias `@/*` → `src/*` (used everywhere).
- `any` is rare and only inside the http client error parsing (`body?.error`) where the shape is genuinely unknown.
- `unknown` for caught errors, narrowed via `isApiError` or `instanceof Error`.

### 7.5 Imports

- All imports use the `@/` alias for cross-module references; relative paths are reserved for sibling modules within the same folder.
- Module-internal imports use `./` / `../` only.
- Type-only imports use `import type` consistently.

### 7.6 ESLint / Prettier

- ESLint 9 flat config (`eslint.config.js`) with `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.
- Prettier (`.prettierrc`) — `pnpm lint` runs ESLint with prettier integration.

---

## 8. Dependencies (UI/state-relevant)

| Package | Version (pinned) | Why it matters for migration |
|---|---|---|
| `react`, `react-dom` | ^19.2.4 | React 19. StrictMode is on; transport managers are hardened against the double-mount cycle |
| `react-router` | ^7.14.1 | Data router (`createBrowserRouter`) — guards via `<Navigate>` + `<Outlet>`, no `useNavigate` inside guards |
| `zustand` | ^5.0.12 | One store per module, no middleware |
| `@tanstack/react-query` | ^5.99.0 | Server-state cache, query keys in `app/query-client.ts` |
| `@microsoft/signalr` | ^8.0.17 | Two hubs; managers in `transport/signalr/` |
| `oidc-client-ts` | ^3.5.0 | Direct UserManager access (silent renew callback in `main.tsx`) |
| `react-oidc-context` | ^3.3.1 | React glue for oidc; wrapped by our `AuthProvider` in `modules/auth/` |
| `tailwindcss` + `@tailwindcss/vite` | ^4.2.2 | Tailwind 4 (`@import 'tailwindcss'` + `@theme` block in `index.css`) |
| `@radix-ui/react-dialog` | ^1.1.15 | `Sheet` + DropdownMenu modals |
| `@radix-ui/react-dropdown-menu` | ^2.1.16 | `AppHeader` profile menu |
| `@radix-ui/react-scroll-area` | ^1.2.10 | (installed; used for scrollable lists) |
| `@radix-ui/react-tabs` | ^1.1.13 | (installed) |
| `@radix-ui/react-tooltip` | ^1.2.8 | (installed) |
| `clsx` | ^2.1.1 | Class composition |
| `tailwind-merge` | ^3.5.0 | Class de-conflict (rarely used) |
| `lucide-react` | ^1.8.0 | Icons (battle screen + chat) |
| `motion` (Framer Motion) | ^12.38.0 | Available; used sparingly in current screens |
| `sonner` | ^2.0.7 | Installed; no global toaster mounted yet — safe to add to `App.tsx` |
| `date-fns` | ^4.1.0 | `formatTimestamp` in `modules/chat/format.ts` |

### What is NOT in the dependency tree

- No MUI, Chakra, Mantine, Ant Design, shadcn/ui, or other component library.
- No CSS-in-JS (styled-components, emotion).
- No CSS modules (Vite would need a `.module.css` filename — none exist).
- No state libs other than Zustand (no Redux, MobX, Jotai, Recoil).
- No router other than React Router 7.

---

## 9. Migration Safety Notes

These are the things most likely to break if a visual swap is done carelessly:

1. **Battle action payload shape.** `submitTurnAction(battleId, turnIndex, payload)` requires the **string** built by `buildActionPayload(zone, pair)` in `modules/battle/zones.ts`. Don't pass the object directly. Don't change the field names — they map to BFF DTOs.
2. **Block pair adjacency.** `isValidBlockPair` enforces the ring (Head→Chest→Belly→Waist→Legs→Head). UI must use `VALID_BLOCK_PAIRS` to enumerate options.
3. **No `localStorage` for auth tokens** (DEC-6). The userStore is `InMemoryWebStorage`. Don't add persistence to `useAuthStore`.
4. **Guards rely on synchronous store reads.** `OnboardingGuard` reads `usePlayerStore.character` and `BattleGuard` reads `usePlayerStore.queueStatus` + `useBattleStore.{phase,battleId}`. Don't migrate any of these to TanStack-Query-only — guards do not `await`.
5. **One source of truth for queue.** `usePlayerStore.queueStatus` is authoritative. `useMatchmakingStore` only stores UI-derived flags. Adding a second mirror caused a redirect-loop in the past (F-A3).
6. **Post-battle handoff is atomic.** Both `BattleResultScreen` and `BattleScreen.LeaveBattleEscape` call `returnFromBattle(battleId)` — this single `set()` writes `dismissedBattleId + queueStatus=null + postBattleRefreshNeeded=true`. Splitting it would re-create the lobby↔battle flicker.
7. **Hub managers are singletons.** They're constructed once in `app/transport-init.ts`. Don't create new instances inside React components — the `pending` queue serializes lifecycle and prevents StrictMode races.
8. **`buildActionPayload` returns a string.** Tests verify `typeof === 'string'`. SignalR hub on the backend rejects object payloads.
9. **Battle hub lifecycle is tied to the route.** `BattleShell` mounts `useBattleConnection(battleId)`. Moving that hook elsewhere will either drop messages (mounted too late) or keep the connection alive after leaving (mounted too high). Keep it inside the `/battle/:battleId/*` subtree.
10. **Chat hub lifecycle is session-wide.** `useChatConnection()` is in `SessionShell` (above `BattleGuard`). It must NOT remount on lobby↔battle navigation, or the global chat session resets.
11. **`/silent-renew` short-circuits in `main.tsx`.** Don't wrap that path with the router or it will mount `<App />` inside the iframe and break callback parsing.
12. **Token rotation does not re-mount.** The `accessTokenFactory` reads the latest token from the store at SignalR reconnect time. Battle/chat in-memory state survives token rotation.

---

## 10. Quick Reference — "Where do I…?"

| Task | Go to |
|---|---|
| Add a new HTTP endpoint | `transport/http/endpoints/{domain}.ts` (call from a `useQuery`/`useMutation` in a module hook) |
| Handle a new SignalR event | Add to `BattleHubEvents` / `ChatHubEvents` type, register in the manager's `registerEvents`, wire callback in the corresponding `use*Connection` hook, add an action on the store |
| Add a new screen | Create in `modules/{module}/screens/`, register in `app/router.tsx` under the right guard |
| Add a new visual primitive | `ui/components/{Name}.tsx` — keep it stateless; no store / transport imports |
| Add a feature component | `modules/{module}/components/{Name}.tsx` — may use module's store + UI primitives |
| Add a global protected page | Plug into the appropriate guard branch in `app/router.tsx` |
| Change a token / theme color | Edit `ui/theme/tokens.css`, `index.css` (the `@theme` mapping picks it up automatically) |
| Add a new Zustand store | Don't, unless it's a new feature module. Each module already owns its store |
| Send a chat message | `chatHubManager.sendGlobalMessage(text)` or `.sendDirectMessage(recipientId, text)` |
| Get fresh game state | `queryClient.invalidateQueries({ queryKey: gameKeys.state() })` (the `useGameState` query writes back to `usePlayerStore`) |
| Force log out | `useAuth().logout()` — runs the full ordered teardown |

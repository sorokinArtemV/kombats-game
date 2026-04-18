# Kombats Frontend — Audit & Remediation Plan

Date: 2026-04-18
Branch: `frontend-client`
Auditor: Claude (Opus 4.7)
Scope: `src/Kombats.Client/` — React 19 SPA, ~7,920 LOC across `app/`, `modules/`, `transport/`, `ui/`, `types/`.

This document is the handoff plan for bringing the frontend from a working-but-fragile state to a credible production MVP. It is written for a follow-up implementation agent. It is deliberately opinionated.

---

## 1. Executive Summary

### Overall assessment

The frontend is **not a throwaway prototype**. The architecture is intentional, the layer separation is defensible, and the hard problems (OIDC bootstrap in StrictMode, SignalR reconnect lifecycle, battle state reconciliation, eventual-consistency windows between matchmaking and battle) have received real engineering attention. The test posture on pure logic (battle store, zones, feed merge, timer view, query retry, player progress) is better than most apps at this stage.

It is **not yet credible as a production MVP** for six reasons, in order of impact:

1. **Diagnostic console noise shipped as code.** 34 `console.log`/`console.warn` calls remain, 9 of them tagged `[KOMBATS-AUTH-DIAG v3/v4]`. Token lengths, stack traces, and internal state transitions are logged on every render of guards and auth sync. This is debug scaffolding that must not reach users. It also clutters the DevTools console so hard that real issues become invisible.
2. **A single local error boundary.** Only `BattleScreen`'s `ActionPanelSlot` is wrapped (`BattleScreen.tsx:79-91`). Any render error anywhere else — lobby, result screen, chat, onboarding — blanks the entire SPA with no recovery path. For an app that renders user-generated content (chat) and complex state-machine-driven UIs (battle), this is a real production-quality gap.
3. **Two sources of truth for queue status.** `usePlayerStore.queueStatus` and `useMatchmakingStore.status` both track the same concept with different vocabularies and must be kept in sync by hooks. The synchronization code works today but is brittle and has already required multiple fixes.
4. **Backend eventual-consistency workarounds leak across the frontend.** `dismissedBattleId`, `postBattleRefreshNeeded`, `suppressQueue` branch in `setGameState`, the DEC-5 "refetch-wait-3s-refetch-again" in `usePostBattleRefresh`, and the `JOIN_BATTLE_RETRY_DELAYS_MS` regex-matched retry in `battle-hub.ts` are all client-side compensations for backend timing. Individually each is defensible; collectively they tangle the lobby/battle boundary.
5. **Duplicated stat-allocation surface.** `InitialStatsScreen` (onboarding) and `StatAllocationPanel` (lobby) are ~85% the same file with divergent error handling. A single `useAllocateStats` hook + one presentation component would remove 100+ lines and the divergence risk.
6. **OIDC bootstrap complexity.** The module-level `bootstrapPromise` singleton (`AuthProvider.tsx:22`) and the external `BOOTSTRAP_TIMEOUT_MS` race exist specifically to work around React 19 StrictMode's double-mount behavior tripping up `oidc-client-ts` / `react-oidc-context`. The comments are careful, the tests don't cover it, and the failure mode — user stuck on "Restoring session…" — is hard to recover from.

### Biggest risks to shipping MVP

- **User-visible console spam / information leak** (P0): diagnostic logging is currently part of every page load.
- **One uncaught render error destroys the session** (P0): no top-level or route-level error boundaries.
- **Matchmaking ↔ battle handoff remains the most bug-dense seam** (P1): recent commits confirm "fix chat / fix crit bugs / fix battle crash" cycles in this area.
- **Chat memory growth during long sessions** (P2): `globalMessages` is capped to 500, but `directConversations` is a `Map` that never evicts stale conversations.
- **Auth failure recovery is non-obvious** (P2): a hung bootstrap leaves the user on a "Restoring session…" screen with no retry button.

### What must land before calling this a production-worthy MVP

1. Strip or gate every `console.*` diagnostic. Introduce a trivial `logger` with env-gated output.
2. Add a root `<ErrorBoundary>` at `App.tsx` and a battle-route-scoped boundary that offers a "Return to lobby" escape hatch.
3. Collapse the two queue-status sources into one (`usePlayerStore.queueStatus` is authoritative; `useMatchmakingStore` holds only the UI-local search-start timestamp + poll-failure counter).
4. De-duplicate stat allocation into a single hook + component.
5. Replace `BattleHubManager` / `ChatHubManager` duplication with a small shared base class or helper.
6. Add an explicit "bootstrap failed, retry" path on `UnauthenticatedShell`.

Everything else listed below is either P2/P3 cleanup or acceptable MVP compromise.

---

## 2. Current Architecture Overview

### Layers

```
src/
├── main.tsx                    # Entry; /silent-renew short-circuit; mounts <App>
├── config.ts                   # Env-backed config (fail-fast on missing)
├── app/                        # Shell, routing, guards, query client
│   ├── App.tsx                 # AuthProvider → QueryClientProvider → RouterProvider
│   ├── router.tsx              # createBrowserRouter with nested guards/shells
│   ├── query-client.ts         # TanStack Query + key factories + retry policy
│   ├── transport-init.ts       # Wires auth→HTTP client + creates hub singletons
│   ├── session-cleanup.ts      # Logout teardown (stores + queries + hubs)
│   ├── GameStateLoader.tsx     # Loads game state + runs auto-onboard; gate
│   ├── AppHeader.tsx / BottomDock.tsx
│   ├── guards/                 # AuthGuard, OnboardingGuard, BattleGuard
│   └── shells/                 # SessionShell, BattleShell, LobbyShell, OnboardingShell, UnauthenticatedShell
├── modules/                    # Feature verticals (state + screens + hooks)
│   ├── auth/                   # OIDC bridge + Zustand mirror
│   ├── player/                 # Character + game state + post-battle XP refresh
│   ├── onboarding/             # Name + stats; uses player store
│   ├── matchmaking/            # Queue store + polling hook
│   ├── battle/                 # State machine, zones, screens, narration
│   └── chat/                   # Global + direct + presence
├── transport/                  # Pure network layer, no React
│   ├── http/                   # client.ts + endpoints/*
│   ├── signalr/                # battle-hub.ts, chat-hub.ts, connection-state.ts
│   └── polling/                # matchmaking-poller.ts
├── ui/                         # Stateless primitives + tokens
│   ├── components/             # Button, TextInput, Sheet, ProgressBar, Spinner, ...
│   └── theme/                  # tokens.css, fonts.css
└── types/                      # api.ts, battle.ts, chat.ts, player.ts, common.ts
```

### Route tree (as implemented in `app/router.tsx`)

```
/                                          UnauthenticatedShell
/auth/callback                             AuthCallback
AuthGuard
└── GameStateLoader                        fetches /game/state + auto-onboard
    └── OnboardingGuard                    redirects based on character state
        ├── OnboardingShell (Draft/Named)
        │   ├── /onboarding/name
        │   └── /onboarding/stats
        └── SessionShell (Ready+)          owns ChatHub + header + bottom dock
            └── BattleGuard                redirects based on queueStatus + battle phase
                ├── BattleShell            owns BattleHub + beforeunload guard
                │   ├── /battle/:battleId
                │   └── /battle/:battleId/result
                └── LobbyShell
                    ├── /lobby
                    └── /matchmaking
```

### State layers

| Concern | Owner | Notes |
|---|---|---|
| OIDC tokens | `useAuthStore` (in-memory) | DEC-6: never localStorage. Mirrored from `react-oidc-context`. |
| Game state / character | `usePlayerStore` + TanStack Query (`gameKeys.state()`) | **Dual-write** from `useGameState.queryFn`. Zustand needed for synchronous guard reads. |
| Queue status | `usePlayerStore.queueStatus` + `useMatchmakingStore.status` | **Two sources of truth.** Keep in sync via hooks. |
| Battle state | `useBattleStore` | Phase machine + snapshot + selections + feed. Reset on shell unmount. |
| Chat messages / presence | `useChatStore` + TanStack Query (conversation list, DM history) | Mixed source — live via SignalR → store, history via HTTP → Query. |
| Player cards | TanStack Query (`playerKeys.card(id)`) | 30–60s staleTime. |
| Post-battle feed | TanStack Query (`battleKeys.feed(id)`) + live store merge | `useResultBattleFeed` composes via `mergeFeeds`. |

### Key integration points

- **BFF base URL** — single origin, set via `VITE_BFF_BASE_URL`.
- **SignalR hubs** — `/battlehub`, `/chathub` off the BFF.
- **Keycloak** — separate origin, OIDC authorization-code + iframe silent renew.
- **/silent-renew** — dedicated path short-circuited in `main.tsx`; renders nothing.

---

## 3. Findings by Area

Severity key:
- **P0** — must fix before calling this production MVP (correctness, security, crash, leak).
- **P1** — strong production/maintainability issue; fix soon.
- **P2** — important cleanup / consistency issue.
- **P3** — polish; nice-to-have.

### 3.1 Architecture

**F-A1 — Layer boundaries are respected. (Positive.)**
Severity: n/a (observation).
Transport has no React imports; `ui/` has no store imports; modules consume transport only through hooks; routes are driven by store state. Dependency direction matches `.claude/rules/architecture-boundaries.md`. This is the strongest part of the codebase and should be preserved.

**F-A2 — Hybrid ownership of game state: Zustand + TanStack Query.**
Severity: **P1** (risky pattern, but documented).
Evidence: `modules/player/hooks.ts:24–25` — `usePlayerStore.getState().setGameState(data)` is called inside the Query `queryFn`. `modules/player/store.ts:64-85` — `setGameState` has branching logic (`dismissedBattleId` suppression) that TanStack Query has no visibility into.
Why it matters: queryFn side-effects are considered an anti-pattern in TanStack Query — they make `useGameState.refetch()` observable to Zustand in a way that cache invalidation calls don't always match (e.g., `queryClient.setQueryData` would bypass this). Today the only write path is through the queryFn, so it works; the moment anyone calls `queryClient.setQueryData(gameKeys.state(), …)` the stores diverge.
Recommendation: keep the pattern (guards need synchronous reads), but move the mirror into a single subscription — e.g., `queryClient.getQueryCache().subscribe(...)` wiring in `app/` that reflects any cache update into the store. Remove the side-effect from the queryFn.

**F-A3 — Two sources of truth for queue status.**
Severity: **P0**.
Evidence: `modules/matchmaking/store.ts:1-110` defines `status: 'idle' | 'searching' | 'matched' | 'battleTransition'`; `modules/player/store.ts:8-11` holds `queueStatus: QueueStatusResponse`. They are kept consistent by two effects in `modules/matchmaking/hooks.ts:32-39` and `:124-134`. `modules/matchmaking/hooks.ts:47-53` writes to *both* stores after `queueApi.join()`. `leaveQueue` writes to both again at `:78-92`.
Why it matters: every corner case must now be handled in two places with different vocabulary (`Searching` vs `searching`, `Matched` vs `matched|battleTransition`). Recent commits (`fix crit bugs`, `fix chat`) show real production bugs where the two diverge. The authoritative state already exists in `queueStatus`; everything else is UI-local.
Recommendation: collapse. `useMatchmakingStore` becomes ≤3 fields — `searchStartedAt`, `consecutiveFailures`, and a boolean `battleTransitioning`. All `status` reads project from `usePlayerStore.queueStatus`. Delete `hydrateFromServer`, `updateFromPoll`'s Matched/Idle branches, and the sync effect.

**F-A4 — Backend eventual-consistency compensation is spread across multiple files.**
Severity: **P1**.
Evidence:
- `store.ts:30-43` — `dismissedBattleId` comment runs 14 lines explaining why we suppress a server-returned `queueStatus` after the player dismissed a result.
- `store.ts:64-85` — `setGameState`'s `suppressQueue` branch.
- `modules/player/post-battle-refresh.ts:1-87` — DEC-5 "refetch, wait 3s if unchanged, refetch again" sequence.
- `transport/signalr/battle-hub.ts:27-36` — `JOIN_BATTLE_RETRY_DELAYS_MS` + regex-matched `"Battle {id} not found"` error with 7 retry attempts.
- `modules/battle/screens/BattleResultScreen.tsx:112-122` — triple write: `setDismissedBattleId`, `setQueueStatus(null)`, `setPostBattleRefreshNeeded(true)`.
Why it matters: the frontend is currently "covering" for the backend's `BattleCompleted` projection lag. Each compensation is individually plausible, but together they obscure the real flow. If backend timing changes (e.g., the projection gets faster or slower), these workarounds can deadlock with each other.
Recommendation (MVP-level): centralize in `modules/player/post-battle-refresh.ts`. Move `dismissedBattleId` and its suppression into that hook so it is visible in one place. Leave the hub-layer retry as-is but name the constants less ambiguously and extract the regex to a single comment block. Track backend-side fixes in `docs/execution/frontend-execution-issues.md` so the compensation can eventually be removed.

**F-A5 — `useBattle()` monolithic selector.**
Severity: **P2** (self-documented and has focused alternatives).
Evidence: `modules/battle/hooks.ts:178-221` subscribes to 17 individual store fields. The comment on `:176` admits this is suitable only for debug surfaces, and says Phase 7 should prefer focused selectors. No current production caller uses `useBattle()`.
Recommendation: delete it. Nothing uses it; keep the focused selectors. If a future debug screen needs one, reintroduce it at that time.

**F-A6 — `setEventHandlers` pattern on hub managers replaces all handlers.**
Severity: **P2**.
Evidence: `BattleHubManager.setEventHandlers` and `ChatHubManager.setEventHandlers` store a single `events` object. Only one subscriber per hub at a time; a second `setEventHandlers` call silently overwrites the first.
Why it matters: today the architecture guarantees one subscriber per hub (BattleShell mounts once, SessionShell mounts once), so this is fine. But it's a sharp edge — any future composition (e.g., a presence widget that wants `onPlayerOnline`) would silently kill the chat module's handler.
Recommendation: switch to `onX(handler) => unsubscribe` per-event subscriptions as described in `.claude/rules/state-and-transport.md`. Low-effort refactor; matches the rule already in the project.

**F-A7 — Battle hub and chat hub managers are ~80% identical.**
Severity: **P2**.
Evidence: `transport/signalr/battle-hub.ts:54-207` and `transport/signalr/chat-hub.ts:31-183`. Identical code paths: `pending` queue, `connect`/`disconnect` serialization, `reconnectAttemptSeen` / `intentionalDisconnect` lifecycle, `setConnectionState`, RECONNECT_DELAYS, `assertConnected`. The only differences are event names and outbound invoke methods.
Recommendation: extract a `BaseHubManager<TEvents>` abstract class. The duplication is load-bearing (was patched twice for StrictMode issues), so any future fix needs to be applied in both places — guaranteed drift.

---

### 3.2 State management

**F-S1 — `useBattleStore.feedEntries` grows unboundedly.**
Severity: **P1**.
Evidence: `modules/battle/store.ts:259-266`. `handleFeedUpdated` appends new entries, deduped by key, but never trims. A long battle (50+ turns × ~3 narration entries each) accumulates several hundred entries; reconnect backfill can re-apply the full feed.
Recommendation: cap at some sensible bound (e.g., 500) with a comment tying it to the chat store's cap. Match the existing pattern in `modules/chat/store.ts:10-14`.

**F-S2 — `lastResolution` is not cleared on `handleBattleEnded`.**
Severity: **P2**.
Evidence: `modules/battle/store.ts:252-257`. The result panel shows `lastResolution` as a fallback render (`BattleScreen.tsx:112-120` → `TurnResultPanel`), so after `Ended` the user can briefly see the last turn result behind the end overlay. Cosmetic, not crashy.
Recommendation: set `lastResolution: null` inside `handleBattleEnded`, or short-circuit the fallback to a dedicated `EndedPanel`.

**F-S3 — `useAuthStore()` consumed without selector in several places.**
Severity: **P2** (perf, not correctness).
Evidence: `modules/auth/AuthProvider.tsx:37-38` — `const { setUser, updateToken, clearAuth } = useAuthStore();` subscribes to the entire store. Any auth field change re-renders `AuthSync`. Same pattern in `modules/auth/hooks.ts:8`.
Why it matters: on every `updateToken` (token rotation), every child of AuthSync is asked to re-render. Today that's only the app tree; it does work but is more re-renders than necessary. Zustand actions are stable references, so you only need the methods — `useAuthStore.getState().setUser(...)` is free of subscriptions.
Recommendation: use `useAuthStore((s) => s.setUser)` for actions or access via `useAuthStore.getState()` inside handlers. Same pattern in `useAuth()`.

**F-S4 — `directConversations` Map never evicts.**
Severity: **P2**.
Evidence: `modules/chat/store.ts:33` and `:141-153`. Opening many DMs over a long session grows the Map indefinitely. Each conversation caps at 500 messages, so the bound is `conversationsOpened × 500`, but there's no cleanup even on navigation or `clearSuppressedOpponent`.
Recommendation (MVP): no action required until we have data — 500 messages × ~20 conversations is still only ~10k objects. Track as P3 unless profiling shows a problem.

**F-S5 — `matchmakingStore.consecutiveFailures` is shown as a single threshold.**
Severity: **P3**.
Evidence: `SearchingScreen.tsx:69-71` — "Connection issues — retrying…" appears after 3 consecutive poll failures. No subsequent escalation or final fallback; if the queue endpoint is down indefinitely the user sees this banner forever and the Cancel button won't work (because leave also fails).
Recommendation: when `consecutiveFailures ≥ 10`, stop polling and show an actionable error with a retry button.

**F-S6 — Battle store's `serverPhaseToLocal` silently swallows unknown phases.**
Severity: **P3**.
Evidence: `modules/battle/store.ts:137-153`. If the backend ever adds a new phase, the frontend ignores it and keeps the existing one. Probably fine for MVP but worth a `console.warn` when `process.env.NODE_ENV !== 'production'`.

---

### 3.3 Auth / session

**F-AU1 — Module-level `bootstrapPromise` singleton is a StrictMode workaround.**
Severity: **P2** (load-bearing, well-documented).
Evidence: `modules/auth/AuthProvider.tsx:22` + 20-line comment explaining why a component-level ref doesn't work.
Why it matters: shared mutable state at module scope is fine when it's one known workaround; the risk is that future maintainers extend the pattern thoughtlessly. The comment helps.
Recommendation: keep for MVP. Add a unit test (JSDOM + react-testing-library `render` cycle) that proves the bootstrap resolves exactly once across a mount-unmount-mount cycle, so a future refactor can verify behavior.

**F-AU2 — `syncedRef` is set but never read.**
Severity: **P3**.
Evidence: `modules/auth/AuthProvider.tsx:39` + `:164` + `:176`. `syncedRef.current = true` happens twice but nothing branches on it.
Recommendation: delete.

**F-AU3 — Diagnostic logging in auth paths leaks token length + stack traces.**
Severity: **P0**.
Evidence: `modules/auth/store.ts:42-50` (`clearAuth` logs `new Error('clearAuth stack').stack`), `modules/auth/AuthProvider.tsx:57-210` (12 DIAG calls), `modules/auth/AuthCallback.tsx:13-50` (5 DIAG calls), `app/guards/AuthGuard.tsx:11-30`, `app/guards/OnboardingGuard.tsx:12-58`, `app/transport-init.ts:14-22`, `modules/player/hooks.ts:14-38`, `src/main.tsx:8-10`.
Why it matters: this is an active v3/v4 diagnostic build marker. It was useful for debugging an auth-loop bug; it should not ship. Users will see token length strings, internal state, and a `new Error().stack` on every logout.
Recommendation: introduce a `log` utility gated by `import.meta.env.DEV` and replace all DIAG calls. Or simpler for MVP: delete.

**F-AU4 — No recovery UI when bootstrap times out.**
Severity: **P1**.
Evidence: `modules/auth/AuthProvider.tsx:120-128` hard-times-out after 12s. When the race is won by the timeout, `authStatus` goes to `'unauthenticated'` and the user is shown the `UnauthenticatedShell` login/register buttons. That's actually a reasonable fallback — but if the timeout fired because Keycloak is unreachable, clicking Login will just spin again. There's no retry-or-contact-support path.
Recommendation: when the external safety timeout fires, set an `authError: 'bootstrap_timeout'` on the store and surface a small banner on `UnauthenticatedShell` offering a "retry restore" button.

**F-AU5 — `logout()` order: cleanup → signoutRedirect.**
Severity: **P3** (correct).
Evidence: `modules/auth/hooks.ts:18-25`. This is the right order: disconnect hubs before the token is revoked, so the server doesn't see client abandonment during the window when the token may have already been invalidated by Keycloak.

**F-AU6 — `accessTokenFactory` returns empty string when no token.**
Severity: **P2**.
Evidence: `app/transport-init.ts:10-12`. If called during a narrow window where the store has cleared but the hub hasn't disconnected, SignalR will attempt with an empty bearer and the server will 401.
Recommendation: throw inside the factory; let SignalR's retry-with-backoff drive the behavior. This also avoids a "connected with bad token" false success.

---

### 3.4 Routing / navigation

**F-R1 — Nested guard tree is coherent and state-driven.**
Severity: n/a (positive).
Evidence: `app/router.tsx:19-88`. Routes are projections of store state; `<Navigate>` is used inside guards instead of `navigate()` in feature components. Matches `.claude/rules/architecture-boundaries.md`.

**F-R2 — `BattleGuard` has overlapping invariants that drifted once already.**
Severity: **P1**.
Evidence: `app/guards/BattleGuard.tsx:11-51`. The "hard gate" logic distinguishes four cases:
  1. Active queue + Matched + battleId → redirect to `/battle/:id`, unless battle ended and we're dismissing.
  2. Searching / Matched without battleId → redirect to `/matchmaking`.
  3. No queue status + on `/battle/:id/result` for the most recent ended battle → allow through.
  4. No queue status + on any battle/matchmaking path → redirect to `/lobby`.
The `battleEnded` + `onResultForEndedBattle` checks both read from two stores. This is the guard that had the result-screen-redirect-loop bug.
Recommendation: add a focused unit test (mount the guard with mocked store values, assert the `<Navigate to>`) covering each branch. Current tests don't touch guards. This is the highest-value test gap.

**F-R3 — `AppHeader` dropdown positioned absolutely against viewport.**
Severity: **P2** (UX, may misrender at narrow widths).
Evidence: `app/AppHeader.tsx:52-70`. The menu uses `className="absolute right-4 top-12"`, but its closest positioned ancestor isn't guaranteed. The header itself doesn't have `relative`; neither does the `<div ref={menuRef}>` wrapping it. Today `<body>` is the containing block, so on desktop it coincidentally aligns; on narrow mobile viewports the menu will float oddly.
Recommendation: wrap the trigger in `<div className="relative">` (already has `menuRef`, add `relative`). Or use a Radix DropdownMenu primitive to get proper anchoring for free.

**F-R4 — `BattleResultScreen` uses `Navigate to="/lobby"` when `storeBattleId !== battleId`.**
Severity: **P3** (correct).
Evidence: `BattleResultScreen.tsx:93-95`. Handles deep-link to a stale result URL. Good guard.

**F-R5 — Result-screen handoff pokes three store fields before `navigate('/lobby')`.**
Severity: **P2** (tightly coupled to F-A4).
Evidence: `BattleResultScreen.tsx:112-122`. `setDismissedBattleId`, `setQueueStatus(null)`, `setPostBattleRefreshNeeded(true)` must be called in that order; any omission re-triggers the battle redirect loop.
Recommendation: collapse into a single `playerStore.returnFromBattle(battleId)` action that does all three atomically. Prevents the trio from drifting.

---

### 3.5 Data fetching / transport

**F-T1 — HTTP client lacks request cancellation.**
Severity: **P1**.
Evidence: `transport/http/client.ts:55-90`. `request()` has no `signal` parameter; TanStack Query's `cancelQueries()` (used in `session-cleanup.ts:33`) cannot actually abort an in-flight fetch. The promise settles; the result is silently dropped by React.
Why it matters: on logout, pending requests will complete *after* the token was invalidated and the auth store cleared, triggering `onAuthFailure()` → another `clearAuth()` call (idempotent but noisy). More importantly, if the user navigates away from the lobby mid-fetch, the response still runs through the queryFn's side-effect path into Zustand.
Recommendation: accept an `AbortSignal` in `httpClient.get/post/put/delete` and thread TanStack Query's signal through.

**F-T2 — `configureHttpClient` uses module-level mutable singletons.**
Severity: **P2**.
Evidence: `transport/http/client.ts:10-19`. `_getAccessToken` / `_onAuthFailure` are let bindings assigned at app init. This is a crude DI and prevents the HTTP client from being used in tests without a reset.
Recommendation (low-effort): leave for now. It's contained. If tests need it, add a `resetHttpClient()` for test setup.

**F-T3 — SignalR managers use regex error-matching.**
Severity: **P2**.
Evidence: `transport/signalr/battle-hub.ts:32-36`. The pattern scans translated English text from the server's HubException. A server-side log/message change breaks the retry behavior.
Recommendation: ask backend to emit a machine-readable error code (e.g., `BattleNotReady` exception with a stable `Data["Code"]`). Until then, the regex is a necessary evil; add a test case that asserts the regex against the current server message verbatim so it's visible when either side changes.

**F-T4 — `parseErrorResponse` assumes a specific BFF error shape.**
Severity: **P3**.
Evidence: `transport/http/client.ts:25-49`. Looks for `body.error.code` / `body.error.message` / `body.error.details`. Any endpoint that returns a different shape (e.g., ASP.NET ModelState errors during dev) falls through to `statusText`. Fine for MVP; flag if backend validation shape ever drifts.

**F-T5 — Matchmaking polling is an eager interval with no jitter.**
Severity: **P3**.
Evidence: `transport/polling/matchmaking-poller.ts:40`. 2s interval on the nose; `N` clients hitting matchmaking in a thundering herd. Fine for launch with small N; add jitter if the queue service ever struggles.

**F-T6 — No retry on mutations (by design).**
Severity: n/a (correct). `app/query-client.ts:34-36`. Mutations are not retried automatically, which is the right default.

**F-T7 — `JoinBattle` retry budget is inside the transport layer.**
Severity: **P3**.
Evidence: `battle-hub.ts:27` — 7 retries × ~0.25–2s delays. Transport should be dumb pipes; retry/backoff for business events (battle not yet ready) belongs in the hook. But this specific retry exists because the error surfaces at SignalR invoke time and has no idiomatic React-layer home.
Recommendation: leave as-is for MVP. Document in a header comment why it deviates from "transport = dumb pipes."

---

### 3.6 Component design / UI

**F-U1 — Nested interactive elements in `OnlinePlayersList`.**
Severity: **P0** (a11y + browser warning).
Evidence: `modules/chat/components/OnlinePlayersList.tsx:37-77`. The outer `<button>` wraps a `role="button" tabIndex={0} <span>`. A button-in-a-button is invalid HTML — React DOM emits a console warning, screen readers are confused, and nested click handlers require `stopPropagation` (which the code does, but fragilely).
Recommendation: change the outer element to a row `<div>` with click/keyboard handlers, or split into two siblings (name-clickable area + DM-button) side by side.

**F-U2 — `BattleScreen` is the only screen with an error boundary.**
Severity: **P0** (duplicate of F-EH1, listed here for UI-component context).
Evidence: `BattleScreen.tsx:79-91`. Wraps `ActionPanelSlot` only. `FighterCard`, `NarrationFeed`, `TurnInfoBar`, `BattleEndOverlay` can still crash the app.

**F-U3 — `TurnResultPanel` defensive rendering is partial.**
Severity: **P2**.
Evidence: `modules/battle/components/TurnResultPanel.tsx:44-68`. It guards against `!lastResolution`, `!lastResolution.log`, and partial `atoB/btoA`. But it does not handle a future server change that adds a third direction or a missing `attackZone` (`:119` renders `attack.attackZone ?? '—'` — fine), or `blockZones.filter((z): z is string => z !== null)` which assumes they're strings.
Today the types guarantee this. Flag for awareness.

**F-U4 — `AppHeader.profileLabel` silently falls back to 'Profile'.**
Severity: **P3**.
Evidence: `app/AppHeader.tsx:11`. If `character?.name` and `displayName` are both nullish, we render "Profile" — which would mean auth glitched. Acceptable; add a subtle tooltip "Identity loading…" if we want to be nicer.

**F-U5 — `BattleResultScreen` has hardcoded `shadow-[0_0_40px_rgba(76,175,80,0.4)]` etc.**
Severity: **P2**.
Evidence: `BattleResultScreen.tsx:22-68`. Arbitrary Tailwind-JIT values with raw RGBA break the theme token contract (`.claude/rules/ui-and-theming.md`: "All colors referenced via CSS variables"). Reskinning requires editing this file.
Recommendation: extend tokens.css with `--shadow-success`, `--shadow-error`, `--shadow-info`, `--shadow-warning`; reference via `shadow-[var(--shadow-success)]` or a Tailwind 4 `@theme` mapping.

**F-U6 — `BattleResultScreen` duplicates `BattleEndOverlay`'s presentation.**
Severity: **P2**.
Evidence: Both use `deriveOutcome(...)` and render tone + title + subtitle. The overlay is a toast-like teaser; the result screen is the full summary. But the tone classes (`tone-accent` etc.) are separately defined in both files.
Recommendation: extract `outcomeToneTokens(outcome)` shared helper.

**F-U7 — `ZoneSelector` list-style block pairs are usable but not the design.**
Severity: **P3**.
Evidence: `modules/battle/components/ZoneSelector.tsx:57-83`. Functional; matches the MVP composition from the architecture doc but doesn't yet match any polished visual design. Flag only if the next milestone requires fidelity to the design-system reference.

**F-U8 — `Sheet` lacks focus-trap for mobile sheet-from-right.**
Severity: **P3**. Radix Dialog handles focus, but the "sheet" layout semantics suggest a drawer; fine for MVP.

---

### 3.7 Error handling / resilience

**F-EH1 — No top-level error boundary.**
Severity: **P0**.
Evidence: `app/App.tsx:8-16`. The tree is `<AuthProvider><QueryClientProvider><RouterProvider/></QueryClientProvider></AuthProvider>`. A thrown render error anywhere unwinds the whole SPA to a blank screen with only a React default error logged to console.
Recommendation: wrap `<RouterProvider>` in `<ErrorBoundary fallback={<AppCrashScreen/>}>`. Add a `route-level` error-element per route via React Router's `errorElement`.

**F-EH2 — TanStack Query errors are not displayed for mutations outside the specific screens.**
Severity: **P2**.
Evidence: mutations across `modules/onboarding/**`, `modules/player/components/StatAllocationPanel.tsx`, `modules/matchmaking/components/QueueButton.tsx` each handle their own `mutation.isError`. No global toaster. `sonner` is in `package.json` but unused.
Recommendation: add a minimal toast layer via `sonner` (dependency already in tree) for transient failures that aren't worth a screen-level error banner. Use it for chat errors that aren't already surfaced.

**F-EH3 — Chat reconnect retry is manual on `failed` only.**
Severity: **P2**.
Evidence: `modules/chat/hooks.ts:136-149`, `modules/chat/components/ChatErrorDisplay.tsx:14-48`. When SignalR's built-in reconnect gives up (exhausts the 6-step delay list), the user must click "Reconnect". Reasonable UX; but no auto-retry-on-network-change — if the user comes back from offline, they must notice the banner. Acceptable MVP compromise.

**F-EH4 — Battle hub `ConnectionLost` → `handleError` only after `failed` state.**
Severity: **P2**.
Evidence: `modules/battle/hooks.ts:99-108`. While `reconnecting`, user sees "reconnecting…" banner. After `failed`, `handleError` fires with "Connection to the battle was lost and could not be restored." There's no "return to lobby" escape — the user is stuck staring at the error.
Recommendation: when `phase === 'Error'` during a battle, show a banner + "Leave battle" button that navigates to `/lobby` and resets the battle store. Currently only the result-screen flow can clear this state.

**F-EH5 — Unhandled promise rejection from `battleHubManager.disconnect().catch(() => {})`.**
Severity: **P3**.
Evidence: `modules/battle/hooks.ts:132-135`. Silently swallowed. Normal. Flag only if we want to log on dev.

**F-EH6 — `usePostBattleRefresh` retry loop cannot be interrupted.**
Severity: **P3**.
Evidence: `modules/player/post-battle-refresh.ts:54-86`. If the user joins queue again within the 3s wait, the retry still fires. Harmless but wasted request.

---

### 3.8 Type safety / contracts

**F-TY1 — `Uuid` is a plain string alias.**
Severity: **P2**.
Evidence: `types/common.ts:2`. `type Uuid = string`. Nothing prevents passing `battleId` where `playerId` is expected.
Recommendation: use branded types — `type Uuid = string & { __brand: 'Uuid' }` is too heavy; a lightweight `type BattleId = string & { __brand: 'BattleId' }` per entity catches real bugs. For MVP, accept the compromise.

**F-TY2 — `AttackResolutionRealtime.attackZone` is `string | null` instead of `BattleZone | null`.**
Severity: **P2**.
Evidence: `types/battle.ts:113-124`. Same for `defenderBlockPrimary` / `defenderBlockSecondary`. The backend emits these as `BattleZone` enum names, but the TS type is the wider `string` — so `TurnResultPanel` can't type-check zone-dependent rendering.
Recommendation: tighten to `BattleZone | null` once a backend sample confirms the emitted values.

**F-TY3 — `QueueStatusResponse` is not a discriminated union.**
Severity: **P2**.
Evidence: `types/api.ts:57-62`. `status` ∈ `{'Idle','Searching','Matched','NotQueued'}`, with `matchId|battleId|matchState` nullable. This encodes the shape but not the invariants (`Matched` → `battleId` is non-null-ish), forcing every consumer to re-check.
Recommendation: express as a discriminated union: `type QueueStatusResponse = {status:'Idle'}|{status:'Searching',matchId:string}|{status:'Matched',matchId:string,battleId:string|null,matchState:MatchState}` — even with `battleId:string|null` this narrows the type locally in consumers.

**F-TY4 — `as ApiError` casts are used in onError handlers.**
Severity: **P2**.
Evidence: grep: 12 `as (ApiError|string)` occurrences across 10 files. TanStack Query's `error` is typed `Error` by default; every consumer casts manually.
Recommendation: extend `QueryClient` with `declare module '@tanstack/react-query'` error type to `ApiError | Error`, or use a typed `useMutation<TData, ApiError>(...)`.

**F-TY5 — `types/api.ts` `ApiError.error.details?: Record<string, unknown>`.**
Severity: **P3**. Fine; the one consumer (`NameSelectionScreen.tsx:57-67`) defensively iterates Object.values and filters for string arrays.

---

### 3.9 Production-readiness

**F-P1 — Diagnostic console.log left in production builds.**
Severity: **P0** (duplicate of F-AU3, listed here for prod-readiness context).
Evidence: 34 console calls across 9 files; 24 of those are tagged `[KOMBATS-AUTH-DIAG v3/v4]`.

**F-P2 — No logging abstraction.**
Severity: **P1**.
Evidence: every log call directly uses `console.log` (with `eslint-disable-next-line no-console` to silence lint, which is itself evidence that the project knows this is wrong). No central place to attach correlation IDs, no way to ship logs to an observability provider later.
Recommendation: add `app/logger.ts` with `debug/info/warn/error`. Debug/info no-ops in prod; warn/error keep going. Replace all direct `console.*` in one sweep.

**F-P3 — No Sentry / error telemetry hook.**
Severity: **P2** (acceptable MVP compromise).
Evidence: none. `ErrorBoundary.onError` is wired up only in `BattleScreen`.
Recommendation: leave for MVP. When the top-level `ErrorBoundary` lands (P0 F-EH1), give its `onError` a no-op adapter that can later be swapped for Sentry's `captureException`.

**F-P4 — `queryClient` defaults: `staleTime: 0` + `refetchOnWindowFocus: true`.**
Severity: **P2**.
Evidence: `app/query-client.ts:27-37`. Every window focus refetches every query. Fine for chat (short cache) + game state (guards depend on freshness); expensive for player cards (30-60s staleTime override) but correct. Worth making `refetchOnWindowFocus: false` globally and opting-in per-query.

**F-P5 — `BeforeUnloadEvent` warning doesn't check if submission is in-flight.**
Severity: **P3**.
Evidence: `app/shells/BattleShell.tsx:31-57`. Prompts on any active phase; reasonable simple behavior.

**F-P6 — `.env.development` contains localhost URLs (normal).**
Severity: n/a. `.env.production` not inspected; verify it does not contain real Keycloak secrets (client_id is fine; these are public clients).

**F-P7 — `package.json` pins `typescript: "~6.0.2"`.**
Severity: **P3** (compatibility).
Evidence: `src/Kombats.Client/package.json:49`. TypeScript 6.0 is recent; check IDE + tooling compatibility (eslint `typescript-eslint` ^8.58.0 supports it).

**F-P8 — Orbitron / Inter / JetBrains Mono fonts referenced in tokens.**
Severity: **P3**. `ui/theme/fonts.css` is not inspected here; verify there are either `@font-face` declarations or a `<link>` in `index.html`, or font rendering will silently fall back.

**F-P9 — Battle feed growth on reconnect.**
Severity: **P3**. On reconnect, `BattleStateUpdated` will re-seed state, but `handleFeedUpdated` dedupes by key so re-delivered entries won't double. Verified by reading the merge logic; flag only if the server changes keying.

**F-P10 — Sonner / framer-motion / Radix Tabs in `package.json` but unused.**
Severity: **P3**. `sonner` (toasts), `motion` (animations), `@radix-ui/react-tabs`/`react-tooltip`/`react-scroll-area` are all in dependencies but unused in the codebase.
Recommendation: keep Radix deps (cheap); remove `sonner`/`motion` if no concrete roadmap (or use them — see F-EH2).

---

### 3.10 Code quality / maintainability

**F-Q1 — Duplicated stat allocation flow.**
Severity: **P1**.
Evidence: `modules/onboarding/screens/InitialStatsScreen.tsx:21-141` and `modules/player/components/StatAllocationPanel.tsx:37-176`. Two files, ~85% identical: same `added` reducer, same mutation, same 409 handling, same rendering. Divergences: onboarding sets `onboardingState: 'Ready'` on success; lobby clears `pendingLevelUpLevel`.
Recommendation: extract `useAllocateStats({ onSuccess })` hook + `<StatAllocationForm>` presentational component. Both screens become ~20 lines.

**F-Q2 — Hardcoded zone dot mapping duplicated.**
Severity: **P3**.
Evidence: `modules/battle/components/ZoneSelector.tsx:7-13` defines `zoneDot`. No other consumer today; flag only if zone colors expand.

**F-Q3 — `BattleResultScreen.TONE` and `BattleEndOverlay.outcomeAccentClass` don't share source.**
Severity: **P2** (duplicate of F-U6).

**F-Q4 — `isApiError` is defined in 3 places.**
Severity: **P2**.
Evidence: `app/query-client.ts:4-11`, `modules/matchmaking/components/QueueButton.tsx:52-60`, `modules/matchmaking/hooks.ts:166-173`. Identical shape check.
Recommendation: export from `types/api.ts`.

**F-Q5 — `formatTimestamp` is redefined in 3 chat components.**
Severity: **P3**.
Evidence: `ChatPanel.tsx:61-67`, `DirectMessagePanel.tsx:192-198`, `ConversationList.tsx:85-91`. One uses `'HH:mm'`, two use `'MMM d, HH:mm'`.
Recommendation: extract `modules/chat/format.ts`.

**F-Q6 — `AppHeader` menu click-away logic is ad-hoc.**
Severity: **P3**.
Evidence: `app/AppHeader.tsx:13-27`. Works, but dismissing on any `mousedown` inside the menu item's stop would also close it — today it doesn't, because the `<button>` onClick calls `setMenuOpen(false)` before the global handler. Consider Radix DropdownMenu for correctness.

**F-Q7 — `NarrationFeed` `tailSignal` uses string concat.**
Severity: **P3**.
Evidence: `modules/battle/components/NarrationFeed.tsx:21`. `${tail.key}:${tail.sequence}`. Since `key` already includes `sequence` per backend contract (`{battleId}:{turnIndex}:{sequence}`), the sequence suffix is redundant. Harmless.

**F-Q8 — `AuthCallback` logs on every render before the effect.**
Severity: **P2**. Evidence: `AuthCallback.tsx:13-21`. With StrictMode, renders fire twice; six log lines per callback visit. Combined with F-AU3, this is noisy enough to drown out real errors during debugging.

**F-Q9 — `matchmakingStore.hydrateFromServer` has only two branches.**
Severity: **P3**. Evidence: `modules/matchmaking/store.ts:84-104` — handles `Searching` and `Matched without battleId` only. `Matched with battleId` isn't handled (BattleGuard redirects before the SearchingScreen mounts, so it's unreachable). Acceptable; flagged only because F-A3 will collapse this anyway.

---

### 3.11 Testing posture

**F-TE1 — Pure logic is well-tested. (Positive.)**
Evidence: battle store (`store.test.ts`, 193 LOC), zones, feed-merge, turn-timer-view, battle-end-outcome, player-progress, query-retry, battle-hub (117 LOC), connection-state, player store. This is a better test posture than typical MVPs.

**F-TE2 — Guards are the most bug-dense code and are untested.**
Severity: **P1**.
Evidence: `AuthGuard.tsx` / `OnboardingGuard.tsx` / `BattleGuard.tsx` have no tests. Grep: `src/Kombats.Client/src/app/guards/*.test.ts` → no matches. Given the frequency of guard-related bugs in recent commits, this is the biggest ROI gap.
Recommendation: render each guard with mocked store state via a test wrapper; assert the `Navigate` target. ~20 lines per guard.

**F-TE3 — No component tests for screens.**
Severity: **P2** (acceptable MVP compromise).
Evidence: no `*.test.tsx` for any screen. `QueueButton`, `SearchingScreen`, `BattleScreen` error paths, `BattleResultScreen` tone mapping — all manual only.
Recommendation: skip for MVP; consider `@testing-library/react` for the guard tests (F-TE2) since they need a component render context.

**F-TE4 — No integration test for the post-battle → lobby handoff.**
Severity: **P1**.
Evidence: this is the most fragile flow (F-A4). No test exists that covers `setDismissedBattleId` → `setQueueStatus(null)` → `setPostBattleRefreshNeeded(true)` → refetch → `suppressQueue` → clear dismissed → lobby mounts.
Recommendation: integration test at the store level (no React) that simulates the sequence of state updates and asserts the final store shape.

**F-TE5 — No chat store tests.**
Severity: **P2**.
Evidence: no `modules/chat/store.test.ts`. `addGlobalMessage`, `addDirectMessage` (with suppressedOpponent), `removeOnlinePlayer`, `handleChatError` (rate-limit branch) are all untested.
Recommendation: add ~100 lines of store tests — behavior is pure.

**F-TE6 — SignalR hub managers lack integration-style tests.**
Severity: **P3**.
Evidence: `battle-hub.test.ts` tests shape only. No test drives a simulated `conn.start()` failure → state transitions. Mocking SignalR is painful; fine to skip for MVP.

**F-TE7 — No auth bootstrap test.**
Severity: **P2** (see F-AU1). The exact bug the singleton prevents is not exercised; a future refactor could silently break it.

---

### 3.12 Design / theming fidelity

**F-D1 — Token system is well-structured.**
Evidence: `ui/theme/tokens.css` defines ~25 CSS variables; `src/index.css` maps them through Tailwind 4's `@theme` directive. Reskin surface is one file.

**F-D2 — Several components bypass tokens with hardcoded colors/shadows.**
Severity: **P2**.
Evidence: `BattleResultScreen.tsx:25-67` uses `bg-[#1b2e1b]`, `shadow-[0_0_40px_rgba(76,175,80,0.4)]`. `FighterCard` and `CharacterPortraitCard` stick to tokens. Violates `.claude/rules/ui-and-theming.md`.

**F-D3 — No shared outcome/result presentation primitive.**
Severity: **P2** (duplicate of F-U6).

**F-D4 — Dark mode only, no `dark:` classes. (Correct per rules.)**

**F-D5 — `Avatar` is a letter-in-circle placeholder.**
Severity: **P3**. Fine for MVP; real avatars can land later behind the same API.

**F-D6 — No `prefers-reduced-motion` respect.**
Severity: **P3**. Spinner, animate-ping, animate-pulse all ignore the user preference. Low-effort fix during the styling pass.

---

## 4. Top Risks / Priority Ranking

### P0 — critical, block production MVP
1. **F-AU3 / F-P1** — Strip or gate diagnostic `console.*` output (34 calls, leaks token length + stack).
2. **F-EH1 / F-U2** — Add top-level + route-level error boundaries.
3. **F-A3** — Collapse dual queue-status source (`matchmakingStore` becomes UI-only).
4. **F-U1** — Fix nested interactive elements in `OnlinePlayersList` (invalid HTML, a11y).

### P1 — strong production-readiness issues
5. **F-A2** — Stop mutating Zustand inside `useGameState` queryFn; drive via cache subscription.
6. **F-A4 / F-R5** — Centralize post-battle eventual-consistency logic into one hook + one action.
7. **F-T1** — Thread AbortSignal through HTTP client + TanStack Query.
8. **F-Q1** — De-duplicate onboarding stats vs lobby stat-allocation.
9. **F-S1** — Cap battle feed entries.
10. **F-EH4** — Provide "leave battle" escape when battle hub enters terminal failed state.
11. **F-AU4** — Show retry path when bootstrap times out.
12. **F-TE2** — Add guard unit tests.
13. **F-TE4** — Add store-level test for post-battle handoff sequence.
14. **F-P2** — Introduce trivial logger abstraction.

### P2 — important cleanup / consistency
15. **F-A6** — Switch `setEventHandlers` → per-event `onX(handler) => unsubscribe`.
16. **F-A7** — Extract `BaseHubManager` for battle + chat.
17. **F-A5** — Delete monolithic `useBattle()` selector (no consumers).
18. **F-AU6** — Access token factory should throw, not return ''.
19. **F-S3** — Replace non-selector Zustand reads (`const {…} = useAuthStore()`) with selectors or `.getState()`.
20. **F-TY1–4** — Tighten types: branded UUIDs (optional), BattleZone-typed attack zones, discriminated QueueStatusResponse, shared `isApiError`, typed error generics on useQuery/useMutation.
21. **F-U5 / F-D2** — Replace hardcoded colors/shadows in `BattleResultScreen` with tokens.
22. **F-U6 / F-Q3** — Share outcome-tone tokens between result screen + end overlay.
23. **F-R3** — Fix `AppHeader` dropdown positioning (use Radix DropdownMenu).
24. **F-EH2** — Add `sonner` toaster for transient errors.
25. **F-P4** — Set `refetchOnWindowFocus: false` by default; opt-in per query.
26. **F-Q4 / F-Q5** — Single `isApiError`; single `formatTimestamp`.
27. **F-Q8** — Remove pre-effect logging in `AuthCallback`.
28. **F-TE5** — Chat store tests.
29. **F-TE7** — Auth bootstrap lifecycle test.
30. **F-R2** — BattleGuard branch-coverage test (subsumed by F-TE2).

### P3 — polish
31. **F-AU2** — Delete unused `syncedRef`.
32. **F-AU5** — Keep logout order as-is (correct).
33. **F-S2** — Clear `lastResolution` on `handleBattleEnded`.
34. **F-S5** — Escalate matchmaking poll failure after 10 consecutive.
35. **F-S6** — Dev warning on unknown server phase.
36. **F-EH6** — `usePostBattleRefresh` interruption flag.
37. **F-S4 / F-P9** — Chat / feed eviction (monitor only).
38. **F-P5** — Don't prompt beforeunload for inactive turn.
39. **F-P7** — Verify TS 6.0 compatibility.
40. **F-P8** — Verify font loading (likely fine).
41. **F-P10** — Drop unused deps (`sonner`, `motion`) or adopt them.
42. **F-D5 / F-D6** — Avatar placeholder; prefers-reduced-motion.
43. **F-Q2** — Zone dot mapping extraction if reused.
44. **F-Q6 / F-Q7** — Misc dropdown / feed cleanup.

---

## 5. Remediation Roadmap

This roadmap is staged. Each stage is independently shippable; a following stage builds on the previous without rework.

### Stage R0 — Strip the scaffolding (0.5 day)
**Objective:** remove everything that should never have shipped.
**Scope:**
- Delete all `[KOMBATS-AUTH-DIAG v3/v4]` console.* calls and the `eslint-disable-next-line no-console` comments that accompany them (F-AU3/F-P1/F-Q8).
- Delete the build marker banner in `main.tsx:8-10`.
- Delete unused `syncedRef` (F-AU2).
- Delete unused `useBattle()` (F-A5) if grep confirms no callers (Explore/Grep `\buseBattle\(`).
**Why now:** this is the fastest, lowest-risk improvement with the most visible impact on perceived code quality.
**Outcome:** clean DevTools, ~200 LOC net reduction.
**Risks:** losing diagnostics that are still needed during active debugging. Mitigation: do this immediately before or after the next big battle bug is resolved, or leave the logs gated behind `import.meta.env.DEV`.
**Dependencies:** none.

### Stage R1 — Crash safety net (0.5 day)
**Objective:** never blank-white the SPA on a render error.
**Scope:**
- Add `<ErrorBoundary>` at `App.tsx` wrapping `<RouterProvider>` (F-EH1).
- Add per-route `errorElement` for battle routes + onboarding, with a "Return to lobby" action.
- Introduce `app/logger.ts` (F-P2). Route `ErrorBoundary.onError` + all existing `console.*` through it.
**Why now:** once the diagnostic spam is gone (R0), unmasked render bugs become visible; a safety net prevents those from bricking the app.
**Outcome:** every render failure is caught, logged, and recoverable.
**Risks:** React Router's `errorElement` on nested routes has specific propagation rules — verify battle-shell errors don't bubble past BattleGuard.
**Dependencies:** R0 (for clean logger migration).

### Stage R2 — Queue source-of-truth collapse (1 day)
**Objective:** single authoritative store for queue state.
**Scope:**
- Reduce `useMatchmakingStore` to `{ searchStartedAt, consecutiveFailures, battleTransitioning }` (F-A3).
- Every `status` read projects from `usePlayerStore.queueStatus` via a selector hook (`useQueueUiState()`).
- Delete `hydrateFromServer`, `updateFromPoll`, and the cross-store sync effect in `modules/matchmaking/hooks.ts`.
- Update `SearchingScreen`, `QueueButton`, `BattleGuard` to the new shape.
**Why now:** the dual-truth bug cluster is the highest-value structural fix.
**Outcome:** ~70 LOC removed; no more matchmaking divergence bugs.
**Risks:** must ship with a round of manual matchmaking tests (queue, cancel, matched, battle transition, browser refresh mid-search).
**Dependencies:** R1 (the guard-testing pass in R5 needs the collapsed shape).

### Stage R3 — Post-battle handoff centralization (1 day)
**Objective:** one place owns the "battle ended → back to lobby" flow.
**Scope:**
- Add `usePlayerStore.returnFromBattle(battleId)` action that atomically calls the three setters currently poked by `BattleResultScreen` (F-R5, F-A4).
- Move `dismissedBattleId` and its suppression check inside `usePostBattleRefresh` (F-A4).
- Write a store-level integration test that drives the full sequence (F-TE4).
- Clear `lastResolution` in `handleBattleEnded` (F-S2).
- Cap `feedEntries` (F-S1).
**Why now:** the bug cluster around result→lobby has required three patches already. Centralizing stops the pattern.
**Outcome:** the fragile seam becomes a single unit-testable unit.
**Risks:** can regress the "dismiss result → stale queue status bounces us back" bug. The integration test in F-TE4 is the guard.
**Dependencies:** R2 (dismissedBattleId interacts with queueStatus suppression).

### Stage R4 — Transport hardening (1 day)
**Objective:** make HTTP + SignalR predictable and cancelable.
**Scope:**
- Add `AbortSignal` support to `httpClient` (F-T1). Thread `signal` from TanStack Query through each endpoint helper.
- `accessTokenFactory` throws on missing token (F-AU6).
- Switch hub managers to `onX(handler) => unsubscribe` (F-A6).
- Extract `BaseHubManager` consolidating the pending-queue / reconnect-attempt lifecycle (F-A7).
- Keep the `JOIN_BATTLE_RETRY_DELAYS_MS` retry; add a unit test that asserts the regex matches the current server error verbatim (F-T3).
**Why now:** every subsequent stage benefits from a predictable transport boundary; this is where most production bugs eventually land.
**Outcome:** cancelable requests; de-duplicated hub lifecycle; safer auth failure mode.
**Risks:** the hub manager merge requires careful test coverage because both currently have bug-fix history.
**Dependencies:** R1 (logger used for transport diagnostics).

### Stage R5 — Guard + auth bootstrap test coverage (1 day)
**Objective:** close the highest-ROI test gap.
**Scope:**
- Guard unit tests: `AuthGuard`, `OnboardingGuard`, `BattleGuard` — mount with mocked stores, assert `<Navigate to=…>` in each branch (F-TE2, F-R2).
- Auth bootstrap lifecycle test: StrictMode double-mount, assert bootstrap resolves once (F-AU1 / F-TE7).
- Chat store tests (F-TE5).
**Why now:** with the biggest refactors (R2, R3) landed, locking behavior in with tests prevents regressions during the UI polish that follows.
**Outcome:** high-signal tests where bugs actually happen.
**Risks:** low.
**Dependencies:** R2, R3.

### Stage R6 — De-duplication + UI tokens (1 day)
**Objective:** remove parallel implementations; enforce theme contract.
**Scope:**
- Extract `useAllocateStats` + `<StatAllocationForm>` from onboarding + lobby panels (F-Q1).
- Share `outcomeToneTokens` between `BattleResultScreen` + `BattleEndOverlay` (F-U6).
- Replace hardcoded colors/shadows in `BattleResultScreen` with tokens (F-U5, F-D2).
- Unify `isApiError` + `formatTimestamp` into shared modules (F-Q4, F-Q5).
- Fix `OnlinePlayersList` nested interactive elements (F-U1).
**Why now:** quick wins on maintainability and a11y; easiest to review after R2–R4 have stabilized the structural code.
**Outcome:** ~150 LOC reduction; theme contract honored.
**Risks:** minor visual regressions. Manual check on lobby + battle + onboarding.
**Dependencies:** none (can run in parallel with R5).

### Stage R7 — Recovery UX + global toasting (0.5 day)
**Objective:** user always has a path forward when something fails.
**Scope:**
- `UnauthenticatedShell` bootstrap-failed banner + retry button (F-AU4).
- "Leave battle" escape when battle phase is Error (F-EH4).
- Adopt `sonner` for transient mutation errors (F-EH2).
- `refetchOnWindowFocus: false` as default (F-P4); opt-in per query where current behavior matters (game state, chat).
**Why now:** closes the "I'm stuck" failure modes.
**Outcome:** fewer "hard reload to recover" incidents.
**Risks:** review the list of queries to make sure any that genuinely want focus refetch (chat, presence) opt back in.
**Dependencies:** R1 (error boundary supplies the banner host).

### Stage R8 — Type tightening (0.5 day, optional)
**Objective:** encode real invariants.
**Scope:**
- `BattleZone | null` for attackZone / block zones in `AttackResolutionRealtime` (F-TY2).
- Discriminated-union `QueueStatusResponse` (F-TY3).
- Shared ApiError types on useQuery/useMutation (F-TY4).
- Optional: branded `BattleId`, `PlayerId` (F-TY1).
**Why now:** last, after structural refactors that would otherwise fight the type changes.
**Dependencies:** R2, R3.

### Total estimate
Staged: 7 small landings, ~6 working days single-developer. None of these are shipping-blocked by backend changes.

---

## 6. Suggested Work Packages

Each work package is a single reviewable PR. Target a working branch per stage above; each package below is sized for a ~150–400 line diff.

### WP-1 — Delete diagnostic scaffolding
Files: `main.tsx`, `app/transport-init.ts`, `modules/auth/*.ts(x)`, `modules/auth/store.ts`, `app/guards/*.tsx`, `modules/player/hooks.ts`, `modules/battle/screens/BattleScreen.tsx`.
- Remove every `[KOMBATS-AUTH-DIAG ...]` call and its `eslint-disable-next-line` comment.
- Remove `syncedRef` from `AuthProvider`.
- Run `grep -rn "eslint-disable-next-line no-console"` under `src/` → expect 0 hits after.
Gate: app still boots, login works in dev, ESLint clean.

### WP-2 — Central logger + delete unused `useBattle`
Files: `app/logger.ts` (new), `app/App.tsx`.
- `logger.debug/info/warn/error`. Debug+info no-op when `!import.meta.env.DEV`. Accept `(message, meta?)`.
- Delete `useBattle()` in `modules/battle/hooks.ts` unless grep finds callers.

### WP-3 — Root error boundary + route error elements
Files: `app/App.tsx`, `app/router.tsx`, `ui/components/ErrorBoundary.tsx`, `app/AppCrashScreen.tsx` (new).
- Expand ErrorBoundary to accept a `reset` callback and render it if supplied.
- Wrap `<RouterProvider>` in `<ErrorBoundary fallback={<AppCrashScreen/>} onError={logger.error}>`.
- Add `errorElement` to the three top-level route groups (onboarding, session/lobby, battle).
Gate: trigger a forced throw in each group; verify UX + recovery.

### WP-4 — Collapse matchmaking store
Files: `modules/matchmaking/store.ts`, `modules/matchmaking/hooks.ts`, `modules/matchmaking/**/*.tsx`, `app/guards/BattleGuard.tsx`, `modules/matchmaking/store.test.ts` (new).
- Shrink state to `searchStartedAt`, `consecutiveFailures`, `battleTransitioning`.
- Add `useQueueUiState()` selector that derives UI status from `usePlayerStore.queueStatus`.
- Remove `hydrateFromServer`, `updateFromPoll` (except poll-driven writes now go straight to `playerStore.setQueueStatus`).
- Unit-test new selector against representative QueueStatusResponse shapes.
Gate: manual matchmaking smoke test (queue→match→battle→lobby; cancel; browser refresh mid-search).

### WP-5 — `returnFromBattle` action + DismissedBattleId move
Files: `modules/player/store.ts`, `modules/battle/screens/BattleResultScreen.tsx`, `modules/player/post-battle-refresh.ts`, `modules/player/post-battle-refresh.test.ts` (new).
- Single action replaces the triple write.
- Move `dismissedBattleId` suppression inside `usePostBattleRefresh`.
- Add integration-style store test for the full sequence.

### WP-6 — Battle store cleanup
Files: `modules/battle/store.ts`, `modules/battle/store.test.ts`.
- Clear `lastResolution` on `handleBattleEnded`.
- Cap `feedEntries` at 500 (matching chat); add corresponding test.

### WP-7 — HTTP client AbortSignal + throwing access-token factory
Files: `transport/http/client.ts`, `transport/http/endpoints/*.ts`, `app/transport-init.ts`.
- `httpClient.get/post/put/delete` accept optional `{ signal?: AbortSignal }`.
- Endpoint helpers accept `signal` and forward.
- `accessTokenFactory` throws on missing token.
- Add a test that asserts `AbortController.abort()` rejects the in-flight promise.

### WP-8 — Hub managers: per-event subscribe + shared base
Files: `transport/signalr/base-hub.ts` (new), `transport/signalr/battle-hub.ts`, `transport/signalr/chat-hub.ts`, `modules/battle/hooks.ts`, `modules/chat/hooks.ts`, respective tests.
- Extract `BaseHubManager` with pending-queue / lifecycle / state machinery.
- `battle-hub` / `chat-hub` extend and add their event/method surface.
- Replace `setEventHandlers({...})` callers with `on<Event>(handler)` + collected `unsubscribe` function invoked on cleanup.
Gate: manual test both flows; unit tests for transient error retry.

### WP-9 — Guard tests + auth bootstrap test
Files: `app/guards/*.test.tsx` (new), `modules/auth/AuthProvider.test.tsx` (new).
- `@testing-library/react` + `react-router` test harness; mock stores.
- Auth bootstrap test: `render → unmount → render` sequence; assert the module-level promise is initialized exactly once.

### WP-10 — Stat allocation de-duplication
Files: `modules/player/hooks.ts` (new `useAllocateStats`), `modules/player/components/StatAllocationForm.tsx` (new), `modules/onboarding/screens/InitialStatsScreen.tsx`, `modules/player/components/StatAllocationPanel.tsx`.
- Extract mutation hook + presentational form.
- Both callers thin down to ~20 lines.

### WP-11 — Outcome tone tokens + token-only shadows
Files: `ui/theme/tokens.css`, `modules/battle/outcome-tone.ts` (new), `modules/battle/components/BattleEndOverlay.tsx`, `modules/battle/screens/BattleResultScreen.tsx`.
- Add `--shadow-success`, `--shadow-error`, `--shadow-info`, `--shadow-warning` tokens.
- Extract `outcomeToneTokens` used by both overlay + result screen.
- Remove `bg-[#...]` / `shadow-[...]` arbitrary values.

### WP-12 — Shared `isApiError`, `formatTimestamp`, nested-button fix
Files: `types/api.ts` (export `isApiError`), `modules/chat/format.ts` (new), `modules/chat/components/*.tsx`, `modules/chat/components/OnlinePlayersList.tsx`.
- Single `isApiError` used by 3 call sites.
- Single `formatTimestamp(sentAt, variant?)`.
- Restructure `OnlinePlayersList` row to eliminate nested interactive elements.

### WP-13 — Recovery UX + toasts
Files: `modules/auth/store.ts` (`authError`), `app/shells/UnauthenticatedShell.tsx` (retry banner), `modules/battle/screens/BattleScreen.tsx` (leave-battle button in Error phase), `app/App.tsx` (sonner Toaster mount).
- Wire transient mutation errors from `modules/matchmaking`, `modules/onboarding`, `modules/player/components/StatAllocationPanel` to toasts.
- Keep screen-level error banners for persistent errors (429, connection failed).

### WP-14 — Type tightening (optional)
Files: `types/api.ts`, `types/battle.ts`, `types/common.ts`, consumers.

---

## 7. MVP-acceptable compromises

These are **not** required for a credible MVP. A future hardening pass can address them; flagging here so the remediation agent does not scope-creep.

- **Zustand hybrid ownership of game state (F-A2)** — documented and works; fix only when a second write path appears.
- **`react-oidc-context` + bootstrap singleton (F-AU1)** — ugly but working; live with it.
- **Regex-matched transient error in `battle-hub.ts` (F-T3)** — acceptable until the backend adds a machine-readable error code.
- **No Sentry / telemetry (F-P3)** — acceptable; the logger (WP-2) is the future injection point.
- **No auto-eviction of idle direct conversations (F-S4)** — 500 × 20 convos is still ~10k objects; fine.
- **No component tests for screens (F-TE3)** — guard tests + pure-logic tests cover the majority of risk; skip screen component tests for MVP.
- **`Uuid` as string alias (F-TY1)** — branded types are nice but not worth the ergonomics cost at MVP.
- **`refetchOnWindowFocus: true` is kept for game state** — guards need freshness; the default flip in WP-13 opts game state back in.
- **Polling interval without jitter (F-T5)** — fine at MVP scale.
- **`TypeScript 6.0.2`** — assume intentional; only revisit if tooling breaks.
- **Matchmaking poll failures stop at threshold banner only (F-S5)** — users can still click Cancel; acceptable.
- **Unused `sonner` / `motion` deps (F-P10)** — R7 adopts `sonner`; `motion` can be deleted or used for battle animations later.
- **`Avatar` placeholder (F-D5)** — the real avatar pipeline is a later design task.
- **No `prefers-reduced-motion` (F-D6)** — accessibility polish; post-MVP.

---

## 8. Future hardening opportunities (post-MVP)

These are genuinely valuable but not worth blocking a first MVP ship.

- **Sentry / OTel for frontend telemetry**, routed via the logger abstraction from WP-2.
- **Route-based code splitting** with `React.lazy` on screens (current bundle loads the entire app eagerly). Start with `BattleScreen`, `BattleResultScreen`, `SearchingScreen`.
- **E2E tests** — Playwright, covering the two full flows: onboarding → queue → battle → result → lobby; relogin after session expiry.
- **MSW-based integration tests** for HTTP endpoint contracts; catches backend contract drift earlier than manual testing.
- **`framer-motion` battle animations** — the dependency is already installed; use it for turn-result transitions and HP changes.
- **Branded UUID types** — once the codebase stabilizes, revisit for real type safety on IDs.
- **Proper avatar / portrait pipeline** — swap placeholder glyph for generated or user-uploaded images.
- **Prefers-reduced-motion** respected across spinners, animate-ping, animate-pulse.
- **Chat: idle conversation eviction** + virtualized message list for long sessions.
- **Battle: replay from `battleKeys.feed` without a live connection** — the data is already there.
- **Keycloak theme + register flow polish** — currently routes into Keycloak's default register UI.
- **Real i18n** — all user-facing strings are hardcoded English; acceptable for MVP; plan for `react-i18next` when internationalization becomes relevant.
- **Service worker / PWA** — not relevant at MVP; real-time games with WebSocket transport rarely need offline.
- **Performance budget** — no bundle-size CI guard today; add a 500KB gzipped budget once the app is feature-complete.
- **Accessibility audit** — axe-core run against the key screens; today the zone-selector + fighter-card surfaces are unaudited.
- **Backend contract types** — generate TypeScript types from the BFF's OpenAPI schema rather than hand-maintain `types/api.ts` + `types/battle.ts`.

---

## Appendix A — Files by LOC (hotspot audit)

| LOC | File | Notes |
|---:|---|---|
| 311 | `modules/battle/store.ts` | Phase machine; test coverage good |
| 278 | `modules/battle/hooks.ts` | Includes monolithic `useBattle()` (delete) |
| 263 | `modules/battle/screens/BattleResultScreen.tsx` | Duplicates `BattleEndOverlay` tone logic |
| 255 | `modules/battle/screens/BattleScreen.tsx` | Only screen with error boundary |
| 222 | `modules/auth/AuthProvider.tsx` | Bootstrap singleton + heavy diag logging |
| 208 | `transport/signalr/battle-hub.ts` | 80% duplicate of chat-hub |
| 198 | `modules/chat/components/DirectMessagePanel.tsx` | Complex merge; stable |
| 192 | `modules/chat/store.ts` | Presence + rate-limit + suppression |
| 183 | `transport/signalr/chat-hub.ts` | Duplicate of battle-hub |
| 177 | `modules/chat/hooks.ts` | Connection lifecycle + reconnect rejoin |
| 176 | `modules/player/components/StatAllocationPanel.tsx` | Duplicate of InitialStatsScreen |
| 173 | `modules/matchmaking/hooks.ts` | Dual-source-of-truth sync logic |

No file exceeds ~320 LOC; hotspots are in the right places (battle, auth, chat). The signal from this list is that battle and auth are the modules most in need of de-duplication and error-boundary coverage.

## Appendix B — Things specifically verified as good

- `transport/` has zero React or Zustand imports (spot-checked).
- `ui/` components have zero store or transport imports.
- Route hierarchy matches the prescribed model (guards in `app/`, screens in modules).
- HTTP 401 handling is centralized (`client.ts:75-78` → `onAuthFailure`).
- `config.ts` fails fast on missing env; good production posture.
- Token retrieval is always through the store, never `localStorage` (DEC-6 respected).
- Silent-renew iframe does NOT mount the app (`main.tsx:17-21`).
- `session-cleanup.ts` tears down hubs before store resets (correct order — avoids late callback writes).
- Battle state reconciliation is driven by server snapshots (`BattleStateUpdated` is source of truth), not local predictions.
- Zone-topology validation is pure + fully tested.
- `mergeFeeds` is pure + tested.
- `battle-end-outcome` is pure + tested with proper coverage of the `Unknown` and `SystemError` edge cases.
- Query key factories are consistent (`gameKeys`, `playerKeys`, `chatKeys`, `battleKeys`).

---

End of document.

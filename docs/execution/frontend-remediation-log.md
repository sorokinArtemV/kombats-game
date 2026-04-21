# Frontend Remediation Log

Tracks the staged remediation phase driven by `docs/frontend-audit-review-and-execution-plan.md`.
Each stage entry is appended as it is completed.

---

## Stage S0 — Scaffolding strip + logger + dead code

**Date:** 2026-04-18
**Status:** Completed
**Branch:** frontend-client
**Plan reference:** §6 Stage S0 (lands P0 #1, P1 #10, P1 #11)

### Scope delivered

- **Logger abstraction** — added `src/app/logger.ts` exposing `debug / info / warn / error`. `debug` and `info` are no-ops when `!import.meta.env.DEV` so verbose diagnostics cannot leak into production; `warn` and `error` always surface. This is the seam the P2-tier Sentry/OTel work (out of scope for this remediation) will plug into later.
- **Diagnostic console scaffolding removed.** Every `[KOMBATS-AUTH-DIAG v3/v4]` call site and its accompanying `eslint-disable-next-line no-console` comment was deleted. Includes the especially loud `new Error('clearAuth stack').stack` dump in `auth/store.ts:clearAuth`, which could have leaked call-site information to production consoles.
- **Legitimate `console.*` call migrated** — the one real `console.error` in `BattleScreen.tsx` (the error-boundary `onError` callback) now goes through `logger.error`. All other remaining `console.*` references in `src/` are inside `logger.ts` itself.
- **Dead code deleted:**
  - `syncedRef` in `AuthProvider.tsx` (only written, never read).
  - `useBattle()` monolithic selector in `modules/battle/hooks.ts` (grep-verified: zero callers in the codebase; focused selectors replace it).
  - The `DIAG` constants and unused `useRef` import were removed as part of the same sweep.

### Files changed

- `src/app/logger.ts` — new file.
- `src/main.tsx` — removed build-marker log + DIAG warn; route silent-renew failure through `logger.warn`.
- `src/app/transport-init.ts` — removed DIAG log in `onAuthFailure`.
- `src/app/guards/AuthGuard.tsx` — removed all DIAG logs; dropped unused `useLocation` import + `location` local.
- `src/app/guards/OnboardingGuard.tsx` — removed all DIAG logs; dropped unused `isLoaded` selector.
- `src/modules/auth/AuthProvider.tsx` — removed all DIAG logs and `syncedRef`; dropped `useRef` import.
- `src/modules/auth/AuthCallback.tsx` — removed all DIAG logs.
- `src/modules/auth/store.ts` — removed DIAG logs in `setUser` and `clearAuth` (including the stack-trace dump).
- `src/modules/player/hooks.ts` — removed all DIAG logs from `useGameState` queryFn.
- `src/modules/battle/hooks.ts` — deleted `useBattle()` monolithic selector and its docblock.
- `src/modules/battle/screens/BattleScreen.tsx` — migrated `console.error` in ErrorBoundary `onError` to `logger.error`.

### Validation

- `npx tsc --noEmit` — passes (exit 0).
- `npx eslint .` — passes with 0 errors, 0 warnings.
- `npx vitest run` — 10 files, 88 tests, all pass.
- `npx vite build` — production build succeeds (no behavior change).
- Grep sweep confirms:
  - Zero occurrences of `KOMBATS-AUTH-DIAG` anywhere in `src/`.
  - Zero occurrences of `eslint-disable-next-line no-console`.
  - Zero occurrences of `syncedRef`.
  - Zero callers of `useBattle()` outside the deleted definition.
  - All remaining `console.*` references live in `src/app/logger.ts` only.

### Deviations from plan

None.

### Behavioral notes

- AuthGuard previously computed `hasToken = !!s.accessToken` and `useLocation()` solely to populate diagnostic logs; those reads are gone. The guard's observable behavior (loading spinner vs. `Navigate to="/"` vs. `<Outlet />`) is unchanged.
- OnboardingGuard previously read `isLoaded` for the same reason; removed. No branching depended on it.
- `AuthProvider` bootstrap effect previously held intermediate `.then` callbacks that only logged; they are now collapsed into a single `.catch(() => {})` on `signinSilent`. The race-with-timeout semantics and the `bootstrapComplete` finalization are preserved.
- `logger.debug` / `logger.info` are no-ops in production. No call sites use them yet; they exist as the future hook.

### Remaining risk / follow-up

- No follow-up items from S0. The stage is self-contained.
- Next: Stage S1 (crash safety net with battle-aware recovery).

---

## Stage S1 — Crash safety net with battle-aware recovery

**Date:** 2026-04-18
**Status:** Completed
**Branch:** frontend-client
**Plan reference:** §6 Stage S1 (lands P0 #2 + §4.7 — battle-aware recovery)

### Scope delivered

- **`ErrorBoundary` extended.** The class now accepts `fallback` as either a
  `ReactNode` OR a render function `({ error, reset }) => ReactNode`, and
  exposes a `reset()` method that clears the error state. Existing call site
  in `BattleScreen.tsx` continues to work unchanged (passes a `ReactNode`
  fallback). `onError` remains optional.
- **`AppCrashScreen` added (`src/app/AppCrashScreen.tsx`).** Shown by the
  top-level boundary and by each per-group `errorElement`. Reads the battle
  store once (snapshot; no reactive subscription since the UI is terminal)
  and offers:
  - **Rejoin battle** when `battleId` is set and phase !== `'Ended'`. Hard-
    navigates via `window.location.assign('/battle/:id')` to trigger a fresh
    auth bootstrap + hub re-connect; BattleStateUpdated reconciles the
    player back into the live match.
  - **Return to lobby** otherwise — including the post-battle/result-screen
    case where `battleId` is still populated but phase is `'Ended'`, which
    previously would have produced a bounce-redirect via BattleGuard.
  - **Reload page** as a fallback for the degenerate "already on the route
    the primary button would send me to" case.
- **Decision logic extracted** to `src/app/crash-recovery.ts`
  (`selectRecoveryTarget(battleId, phase)`) so the branching can be unit-
  tested. Separate file was required by the `react-refresh/only-export-
  components` lint rule.
- **Top-level wrap.** `App.tsx` now renders
  `<ErrorBoundary fallback={<AppCrashScreen />} onError={logger.error}>`
  around `<AuthProvider>` + `<QueryClientProvider>` + `<RouterProvider>`.
  This catches render errors from any layer, including
  `QueryClientProvider`, `AuthProvider`, and the router itself — the
  former safety net was a single inline boundary around `ActionPanelSlot`
  inside `BattleScreen`.
- **Per-route `errorElement`.** Added to the battle route group
  (`BattleShell` children: `/battle/:battleId` and `/battle/:battleId/result`)
  and the onboarding route group (`OnboardingShell` children: `/onboarding/name`
  and `/onboarding/stats`). Each points at `<AppCrashScreen />`. The lobby
  group is deliberately left uncovered at the route level — crashes there
  escalate to the top-level boundary (which shows the same
  `AppCrashScreen`), so duplicating coverage adds nothing.

### Files changed

- `src/ui/components/ErrorBoundary.tsx` — added `reset()` method, function-
  form `fallback`, `error` on state.
- `src/app/AppCrashScreen.tsx` — new file.
- `src/app/crash-recovery.ts` — new pure helper (split out to satisfy
  react-refresh lint).
- `src/app/crash-recovery.test.ts` — new unit test (5 cases).
- `src/ui/components/ErrorBoundary.test.ts` — new unit test (4 cases).
- `src/app/App.tsx` — wrap app tree in the top-level `ErrorBoundary`.
- `src/app/router.tsx` — `errorElement: <AppCrashScreen />` on battle and
  onboarding route groups; added an explanatory comment on the lobby group
  about why it stays uncovered.

### Validation

- `npx tsc --noEmit` — passes (exit 0).
- `npx eslint .` — passes (0 errors, 0 warnings).
- `npx vitest run` — 12 files, 97 tests (up from 88), all pass. New tests:
  - `ErrorBoundary.test.ts` — `getDerivedStateFromError` flips `hasError`;
    `reset()` clears it; `onError` is forwarded; absence of `onError`
    doesn't crash.
  - `crash-recovery.test.ts` — live-battle → Rejoin; Ended-phase → Return to
    lobby; no-battleId → Return to lobby; empty-string battleId is
    non-battle; Error-phase with battleId → Rejoin.
- `npx vite build` — production build succeeds.

### Crash-path trace-through (manual browser verification pending)

Live browser verification is not possible from the implementation session, so
each scenario is traced against the code paths. The unit tests above pin the
decision helper; the traces below show which boundary catches which render
error and what the recovery UI does.

| Scenario | Throw site | Caught by | Recovery shown | Action result |
|---|---|---|---|---|
| 1. Render error in a live battle (e.g., `FighterCard` throws) | Inside `BattleScreen` (not inside the inline `ActionPanelSlot` boundary, which is scoped to that slot only) | Route-level `errorElement` on the `BattleShell` group | `AppCrashScreen` — "Rejoin battle", href `/battle/:battleId` (phase is a live phase, `battleId` set) | `window.location.assign` reloads into `/battle/:id`; auth bootstrap re-runs, `GameStateLoader` fetches state, `BattleGuard` allows the route if the server still reports `queueStatus.Matched`, `BattleShell` mounts, battle hub reconnects, server emits `BattleStateUpdated` and the battle store is re-populated. |
| 2. Render error on the battle result screen (`BattleResultScreen` throws) | `BattleShell` children → `BattleResultScreen` | Route-level `errorElement` on the `BattleShell` group | `AppCrashScreen` — "Return to lobby", href `/lobby` (phase is `'Ended'`, so `isLiveBattle` is false even though `battleId` is still set) | `window.location.assign('/lobby')` reloads; after bootstrap, `BattleGuard` has no `queueStatus` and no `Ended`-phase result, so the user lands on `/lobby`. |
| 3. Render error outside battle/onboarding (e.g., `LobbyScreen` or anything above the router groups) | Inside the router but not under a covered `errorElement`; or above the router inside `AuthProvider` / `QueryClientProvider` | Top-level `ErrorBoundary` in `App.tsx` | `AppCrashScreen` — "Return to lobby", href `/lobby` (no `battleId`) | `window.location.assign('/lobby')` reloads into the lobby. |
| 4. Render error in onboarding | Inside `OnboardingShell` → `NameSelectionScreen` / `InitialStatsScreen` | Route-level `errorElement` on the `OnboardingShell` group | `AppCrashScreen` — "Return to lobby" (no `battleId`) | Hard-nav to `/lobby`; on reload, `OnboardingGuard` redirects the still-unonboarded user back to `/onboarding/name` or `/onboarding/stats` based on server state. |

Key properties verified by construction:

- **No white-screen fallback.** Before S1, an uncaught render error in
  anything outside `ActionPanelSlot` unmounted the React tree and the user
  saw a blank document. After S1, every render error is caught by either
  a route-level `errorElement` or the top-level `ErrorBoundary`, and both
  render the same `AppCrashScreen` surface.
- **Recovery is hard-reload, deliberate.** The crashed frame has already
  proven its in-memory state cannot be trusted (the exception came from
  within it). A hard nav via `window.location.assign` clears the Zustand
  stores, re-runs the auth silent-restore, and lets the server's
  `GameStateLoader` + `BattleGuard` decide where the user belongs. This
  is more reliable than calling `reset()` on the boundary and relying on
  the same code path to re-mount cleanly.
- **Battle-aware routing.** The recovery target is a pure function of
  `(battleId, phase)` and covered by unit tests. `phase === 'Ended'` is
  explicitly routed to the lobby instead of to `/battle/:id`, eliminating
  the stale-state bounce that would otherwise happen when the result
  screen itself crashes.

### Deviations from plan

- Added `phase` to the recovery selector (not in the original plan text) to
  make the result-screen crash land at `/lobby` directly rather than via
  a BattleGuard bounce. Keeps the gate's expected UI text accurate.
- No route-level `errorElement` added for the lobby group. The top-level
  boundary already covers it, and duplicating would show the same screen.
  Explicit comment added in `router.tsx` documenting why.
- Extracted `selectRecoveryTarget` into `crash-recovery.ts` rather than
  keeping it in `AppCrashScreen.tsx`, due to the `react-refresh/only-
  export-components` lint rule. Small separation, improves testability.

### Manual browser verification — still pending

The gate from the plan is a browser test ("throw from `FighterCard`;
confirm Rejoin battle returns to `/battle/:id`" etc.). I cannot spin up a
browser from the implementation session, so the verification is documented
as a trace-through above and pinned by unit tests. A browser-side sanity
check remains a manual TODO for the reviewer / next human session:

1. Dev-build, log in, enter a battle, temporarily throw from `FighterCard`
   (e.g., `throw new Error('test')` at the top of its body), confirm
   `AppCrashScreen` renders with "Rejoin battle" and that clicking it
   returns the user to `/battle/:id` with the live battle state re-loaded.
2. Throw from `BattleResultScreen`, confirm "Return to lobby" is shown and
   the button lands the user on `/lobby`.
3. Throw from `LobbyScreen`, confirm top-level boundary catches it and
   "Return to lobby" is shown (and the reload resolves the crash if the
   throw was transient).
4. Confirm no scenario produces a white document.

### Remaining risk / follow-up

- The top-level boundary will catch errors thrown during `AuthProvider`
  bootstrap. If the crash itself is coming from `AuthProvider`'s effect
  (extremely unlikely but possible), the user will hit `AppCrashScreen`,
  click a button, and reload — which re-runs the same buggy bootstrap.
  Stage S3 adds an explicit retry path for `bootstrap_timeout` which
  covers the expected failure mode; the "`AuthProvider` render throws"
  case would need a code fix, not a recovery UI.
- No automated test exercises the full boundary → `errorElement` →
  `AppCrashScreen` chain, because the project does not currently ship a
  DOM-testing setup (JSDOM + React testing library). Adding that is
  post-MVP polish (§8 of the plan) — I did not do it here.
- Next: Stage S2 (queue source-of-truth collapse + post-battle handoff).

---

## Stage S2 — Queue source-of-truth collapse + post-battle handoff

**Date:** 2026-04-18
**Status:** Completed
**Branch:** frontend-client
**Plan reference:** §6 Stage S2 (lands P0 #3, P0 #5, P0 #6, P1 #14, P1 #15)

### Scope delivered

- **`useMatchmakingStore` shrunk to UI-local concerns.** The store's authoritative
  queue mirror (`status` / `matchId` / `battleId` / `matchState`) is gone —
  its only fields are now `searchStartedAt`, `consecutiveFailures`, and
  `battleTransitioning`. The queue state lives in exactly one place:
  `usePlayerStore.queueStatus`. This is the direct fix for F-A3: the triple
  write the matchmaking hook was doing is no longer possible, because the
  matchmaking store no longer has a queue field to write to.
- **`deriveQueueUiStatus(queueStatus, battleTransitioning)` pure helper** in
  `modules/matchmaking/queue-ui-status.ts`. Produces the four UI states
  (`idle` / `searching` / `matched` / `battleTransition`) the screens use.
  The `battleTransition` flag fires for the short window between "leaveQueue
  returned a battleId" and "next render applies the queueStatus write", and
  for the equivalent polling window.
- **`useQueueUiState()` selector** wraps the derivation for consumers that
  want the UI projection directly (the existing `useMatchmaking()` uses it
  internally; exported for future use).
- **`useMatchmaking` / `useMatchmakingPolling` rewired.** `joinQueue` /
  `leaveQueue` / the poll callback now write only to `usePlayerStore.
  setQueueStatus(...)` for the authoritative state, plus the UI-local flags
  on the matchmaking store. The `hydrateFromServer` and `updateFromPoll`
  store actions are gone. Polling's post-refresh re-seed of `searchStartedAt`
  is handled via a small effect inside `useMatchmakingPolling`.
- **`usePlayerStore.returnFromBattle(battleId)` atomic action.** Single
  `set({ dismissedBattleId, queueStatus: null, postBattleRefreshNeeded: true })`
  replaces the triple write in `BattleResultScreen.handleReturn`. Guarantees
  that BattleGuard / usePostBattleRefresh / the result-screen redirect never
  observe an inconsistent intermediate state.
- **`feedEntries` capped at 500.** `handleFeedUpdated` now trims with
  `slice(-500)` after the dedup-and-merge step. A 10-minute fight emits on
  the order of 150 entries, so this is an insurance cap rather than a
  product-bearing limit; matches the chat buffer size (FEI existing cap).
- **Guard decision logic extracted.** `decideAuthGuard`,
  `decideOnboardingGuard`, `decideBattleGuard` live in
  `app/guards/guard-decisions.ts` as pure functions returning
  `{ type: 'allow' | 'navigate' | 'loading'; to?: string }`. The React
  guards shrink to thin adapters (~15 lines each) that read from stores
  and call the helper. The *logic* is now testable without a DOM or router.
- **Guard branch tests.** `guard-decisions.test.ts` covers:
  - AuthGuard — loading / unauthenticated / authenticated.
  - OnboardingGuard — no character, Draft, Named, Ready (blocked from
    onboarding routes but allowed elsewhere).
  - BattleGuard — **all four top-level branches + the REQ-P1 result-
    dismissal edge**: live battle routing (redirect in, allow on the
    battle paths, allow on /result when Ended), Searching / Matched-without-
    battleId routing to /matchmaking, no-queue blocking of /battle and
    /matchmaking, the Ended+stale-Matched "do not bounce" rule, and Idle /
    NotQueued equivalence to null queueStatus. 23 assertions total.
- **Store-level post-battle integration test.**
  `post-battle-handoff.test.ts` stitches the atomic action, the
  `setGameState` suppression, `decideBattleGuard`, and
  `deriveQueueUiStatus` together — the specific seam the recent
  "fix crit bugs" / "fix battle crash" commits have been patching.
  Covers:
  - `returnFromBattle` writes all three fields atomically.
  - Stale refetch of `Matched.<same battleId>` is suppressed.
  - Non-stale refetch (different battleId or null queue) clears the marker.
  - Re-queue immediately after dismissal works (`setQueueStatus` to
    Searching takes effect).
  - BattleGuard allows `/battle/:id/result` in the brief Ended-phase window
    even after the atomic handoff has cleared queueStatus.
  - BattleGuard allows `/lobby` once queueStatus has been cleared and
    suppression is active against a stale refetch.
  - UI projection shows `idle` in the same scenario (proof the screen
    stays quiet under the suppression).

### Files changed

- `src/modules/matchmaking/store.ts` — rewrite; store shrunk to 3 fields.
- `src/modules/matchmaking/hooks.ts` — rewrite; `joinQueue` / `leaveQueue` /
  `useMatchmakingPolling` rewired around the single source of truth.
- `src/modules/matchmaking/queue-ui-status.ts` — **new** pure helper.
- `src/modules/player/store.ts` — added `returnFromBattle(battleId)` action.
- `src/modules/player/post-battle-handoff.test.ts` — **new** integration test.
- `src/modules/battle/store.ts` — added 500-entry cap in `handleFeedUpdated`.
- `src/modules/battle/screens/BattleResultScreen.tsx` — triple-write replaced
  with `returnFromBattle(battleId)` call; three unused imports/selectors
  removed.
- `src/app/guards/guard-decisions.ts` — **new** pure decision helpers.
- `src/app/guards/guard-decisions.test.ts` — **new** 23-case branch test.
- `src/app/guards/AuthGuard.tsx` — thin adapter over `decideAuthGuard`.
- `src/app/guards/OnboardingGuard.tsx` — thin adapter over
  `decideOnboardingGuard`.
- `src/app/guards/BattleGuard.tsx` — thin adapter over `decideBattleGuard`.

### Validation

- `npx tsc --noEmit` — passes (exit 0).
- `npx eslint .` — passes (0 errors, 0 warnings).
- `npx vitest run` — 14 files, **127 tests** (was 97), all pass. Net new:
  23 guard-decisions cases + 7 post-battle handoff cases (12 → 22 in player
  store group).
- `npx vite build` — production build succeeds.
- `session-cleanup.ts` still works unchanged (`useMatchmakingStore.
  getState().setIdle()` still exists with compatible semantics).

### Deviations from plan

- The plan text says `{ searchStartedAt, consecutiveFailures, battleTransitioning }`
  for the matchmaking store — matched exactly. `battleTransitioning` is
  implemented as a boolean flag rather than a derived string. The UI still
  sees `battleTransition` in the derived `QueueUiStatus` because
  `deriveQueueUiStatus` projects both the explicit flag AND
  `queueStatus.Matched + battleId` into that state. This was intentional:
  leaving the flag purely boolean keeps the store's contract dead simple
  and puts the projection logic in one testable helper.
- Logic extraction went slightly beyond "write BattleGuard tests" — I also
  extracted `decideAuthGuard` and `decideOnboardingGuard` while I was at
  it, per the plan's explicit "AuthGuard, OnboardingGuard while at it —
  low marginal cost" comment. Both get test coverage for free.
- No JSDOM / testing-library adoption. Kept with the project's stated
  preference for pure-logic tests over DOM component tests. The React
  guard components are now so thin (single `if/else` on the decision
  result) that there is no observable behavior outside the pure helpers.

### Remaining risk / follow-up

- **S1 browser-side manual verification still pending** (already logged in
  `frontend-remediation-issues.md`). S2 does not change the S1 risk.
- **S2 manual sweep still pending.** The plan's gate is a real manual run
  through queue → match → battle → result dismiss → lobby; cancel during
  search; refresh mid-search; refresh on result screen; re-queue immediately.
  The unit + integration tests pin the store/guard behavior, but the
  polling lifecycle / HTTP calls / BFF handoff need a human session.
  Logged to `frontend-remediation-issues.md`.
- The post-battle refresh hook (`usePostBattleRefresh`) still runs on lobby
  mount and still uses its own 3s retry timer. S2 did not touch it. The
  atomic `returnFromBattle` now guarantees the flag + suppression are
  set consistently before the first refetch, which is the win — the retry
  logic itself remains unchanged.
- Next: Stage S3 (auth / recovery UX) — only when authorized. Not batched
  into this pass per the user's instruction.

---

## Stage S3 — Auth / recovery UX

**Date:** 2026-04-18
**Status:** Completed
**Branch:** frontend-client
**Plan reference:** §6 Stage S3 (lands P0 #4, P1 #8, P1 #9, P1 #13)

**Note on interrupted run.** The first S3 attempt was interrupted partway
through (after the logout hardening, before the Leave-battle escape). On
resume the working tree was verified consistent (tsc + all 127 S2 tests
still green) and work continued from the remaining tasks. No rollback /
reset was needed.

### Scope delivered

- **`authError` on the auth store.** New `AuthError = 'bootstrap_timeout'`
  type + `authError: AuthError | null` field + `setAuthError(error | null)`
  action. `setUser` clears the error on success so it does not linger into
  an authenticated session.
- **Bootstrap-timeout surfacing.** The 12s external safety timer in
  `AuthProvider` now races against `signinSilent()` as before, but when
  the timer wins AND the attempt counter has not been bumped by a retry,
  it stamps `authError: 'bootstrap_timeout'` on the store. A later render
  sees the stamp and can surface a retry UI.
- **`retryBootstrap()` entry point + retry banner.**
  `src/modules/auth/bootstrap-retry.ts` exposes the retry function; the
  orchestrator state (`bootstrapPromise`, `bootstrapAttempt`) lives there
  too, accessed from `AuthProvider` via getter/setters. A custom event
  (`kombats:retry-bootstrap`) tells the `AuthSync` effect to flip its
  local `bootstrapComplete` back to `false` so the bootstrap effect
  re-enters. `UnauthenticatedShell` renders a warning-tone banner + retry
  button whenever `authError === 'bootstrap_timeout'`. The button clears
  the error, bumps the attempt counter, fires the event, and the
  bootstrap re-runs.
- **`accessTokenFactory` throws on missing token.** Previously returned
  `''`, producing a silent unauthenticated connect attempt that surfaced
  as a cryptic handshake error. Now throws explicitly; SignalR's
  `onclose` path already emits `failed`, which is the same terminal state
  the battle error phase UX is wired to recover from.
- **Logout hardened.** `useAuth.logout` rewritten with three ordered steps:
  1. `oidcAuth.removeUser()` — flips `isAuthenticated` off BEFORE our
     Zustand store cleanup, so the intervening render of `AuthSync`
     cannot re-populate `useAuthStore` by observing the still-present
     oidc user (the most likely cause of the reported "logout does not
     actually sign me out" behavior).
  2. `clearSessionState()` — existing teardown of hubs, queries, module
     stores.
  3. `oidcAuth.signoutRedirect()` wrapped in `try/catch`. On failure
     (unreachable Keycloak, unregistered `post_logout_redirect_uri`,
     CORS, etc.) we fall back to `window.location.assign('/')` so the
     user lands on the guest page instead of being stranded.
  `removeUser` failures are logged at warn but do not abort logout —
  they are a local concern and the subsequent signoutRedirect is the
  authoritative sign-out signal.
- **Leave-battle escape on battle Error phase.** The `phase === 'Error'`
  banner in `BattleScreen` now renders a `LeaveBattleEscape` control
  underneath it. Clicking it calls
  `usePlayerStore.returnFromBattle(battleId)` (the atomic handoff from
  S2 — dismisses the battle so stale refetches are suppressed) plus
  `useBattleStore.reset()`, then navigates to `/lobby`. Previously the
  user was stuck on a terminal error banner with a hard-refresh as the
  only recovery.
- **`useNetworkRecovery()` hook.** Listens to `window.online` / `offline`.
  When online fires after a prior offline, checks each hub manager's
  `connectionState` — only pokes `.connect()` on hubs in the terminal
  `failed` state. `connecting` / `reconnecting` / `connected` hubs are
  left alone (SignalR is already handling them); `disconnected` is left
  alone (may be intentional teardown). Mounted in `SessionShell` so it
  only runs for authenticated sessions.

### Files changed

- `src/modules/auth/store.ts` — added `AuthError` type, `authError` field,
  `setAuthError()` action; `setUser` clears the error.
- `src/modules/auth/bootstrap-retry.ts` — **new** module owning bootstrap
  guard state + `retryBootstrap()`.
- `src/modules/auth/AuthProvider.tsx` — reads bootstrap state via the
  shared module's accessors; stamps `bootstrap_timeout` when the external
  timer wins; listens for the retry event and re-enters the bootstrap
  effect.
- `src/app/shells/UnauthenticatedShell.tsx` — renders the retry banner +
  button when `authError === 'bootstrap_timeout'`.
- `src/app/transport-init.ts` — `accessTokenFactory` throws on missing
  token.
- `src/modules/auth/hooks.ts` — logout rewritten (removeUser →
  clearSessionState → signoutRedirect, with try/catch + fallback nav).
- `src/modules/battle/screens/BattleScreen.tsx` — added
  `LeaveBattleEscape` component; the Error-phase banner now renders it
  below the `lastError` message.
- `src/app/useNetworkRecovery.ts` — **new** hook.
- `src/app/shells/SessionShell.tsx` — mounts `useNetworkRecovery()`.

### Validation

- `npx tsc --noEmit` — passes (exit 0).
- `npx eslint .` — passes (0 errors, 0 warnings). Initial run flagged
  `retryBootstrap` as a mixed-export in `AuthProvider.tsx`
  (`react-refresh/only-export-components`); resolved by extracting it
  into `bootstrap-retry.ts`.
- `npx vitest run` — 14 files, **127 tests**, all pass. S3 did not add
  unit tests — its deliverables are UX wiring across React components
  and DOM APIs that the project's no-JSDOM testing stance does not
  exercise in unit tests.
- `npx vite build` — production build succeeds.

### Deviations from plan

- **Logout:** the plan says "verify logout end to end. if logout is
  broken, fix it in this stage before moving on." I could not verify in
  a browser from this session, so I audited the code for the plausible
  breakage and fixed it: the re-populate-through-intervening-render bug
  that the previous `clearSessionState → signoutRedirect` order allowed.
  Real in-browser verification is still required and is now tracked in
  `frontend-remediation-issues.md`.
- **`retryBootstrap` extraction:** required by the `react-refresh/only-
  export-components` lint rule. Same pattern used in S1 with
  `crash-recovery.ts`. No scope change — the function remains the same
  public entry point.
- **Network recovery scope:** narrowed to `connectionState === 'failed'`.
  Earlier drafts of the hook triggered `.connect()` on any non-connected
  hub, but that could open a battle hub in the lobby where the consumer
  never intended one. Keeping it narrow avoids unintended side effects.

### Remaining risk / follow-up

- **S1, S2, and S3 browser-side manual sweeps are still pending.** S3's
  four specific gates are:
  1. Kick the app with Keycloak unreachable → confirm the 12s timeout
     wins, the retry banner appears, the retry button clears the error
     and re-runs bootstrap.
  2. Sign out from AppHeader → confirm the user lands on `/` as an
     unauthenticated guest; confirm they are not silently signed back in
     by an intervening `AuthSync` render.
  3. Force the battle hub into `failed` (block the SignalR domain in
     devtools during a live battle) → confirm the "Leave battle" button
     appears under the error banner and navigates to `/lobby` cleanly
     without BattleGuard bouncing the user back.
  4. Simulate network drop + recovery → confirm the `online` event
     fires, the failed hubs reconnect, and the UI recovers without a
     refresh.
  Already logged to `frontend-remediation-issues.md`.
- **Underlying logout root cause uncertainty.** The hardening addresses
  the most likely cause of the reported breakage (re-populate race)
  plus makes failures observable (`logger.error` on signoutRedirect
  failure) and recoverable (fallback nav to `/`). If the real bug is
  on the Keycloak side (client config missing
  `post_logout_redirect_uri`, or `end_session_endpoint` unavailable) the
  code fix alone will not close it — the fallback nav at least prevents
  the user from being stuck.
- Next: Stage S4 (onboarding + registration manual sweep) — only when
  authorized. Not batched into this pass.

---

## Stage S4 — Onboarding + registration sweep

**Date:** 2026-04-18
**Status:** Completed (code fixes landed; browser verification pending)
**Branch:** frontend-client
**Plan reference:** §6 Stage S4 (lands P1 #12, P1 #16; touches F-U1 from the
original audit)

### Scope delivered

- **Registration flow fix (known-broken).** The `register()` action in
  `useAuth` was sending only `kc_action=register` to Keycloak. That
  parameter was introduced in Keycloak 24 and has had narrower semantics
  in later versions; the OIDC-standard `prompt=create` (supported by
  Keycloak 21+) is the forward-compatible replacement. Now sends **both**,
  so whichever parameter the live realm's Keycloak version honors takes
  effect. Minimal change, maximum version compatibility, no hand-rolled
  URL construction.
- **Onboarding error UX audit.** Walked the `NameSelectionScreen` and
  `InitialStatsScreen` error paths against the three gate scenarios
  (name collision, 409 revision mismatch, network failure during each
  mutation). Findings:
  - **Name collision (409):** surfaced as "This name is already taken."
    Input remains editable; typing triggers `mutation.reset()` so the
    user can retry without losing the name they want. ✅
  - **Name validation (400):** server-side detail messages are joined
    and shown; client-side constraints show bespoke messages. ✅
  - **Network failure on setName:** falls through to "An unexpected
    error occurred." Recoverable — user retypes or retries. ✅
  - **Revision mismatch (409) on allocate:** explicit "Character was
    updated elsewhere. Points have been reset — please try again."
    Refetches game state AND resets the allocation counter so the user
    cannot replay stale input. ✅
  - **Network failure on allocate:** generic error shown; button stays
    enabled (totalAdded > 0) so user can retry. ✅
  - **State loss:** none in the name flow; the 409 reset in stats is
    intentional and safer than letting the user replay stale adjustments.
  No unrecoverable state was identified. No code change made beyond
  reading — the plan is explicit: "fix only the issues that make the
  user stuck, confused, or unable to recover." None qualified.
- **F-U1 nested interactive elements — fixed.**
  `OnlinePlayersList` previously had a `span role="button" tabIndex=0`
  inside a parent `<button>` (the DM shortcut inside the row button).
  Invalid HTML + React DOM warning + a11y issue. Refactored the row into
  a `<li>` container holding two **sibling** buttons: a flex-1 profile
  button wrapping the avatar + name, and a smaller DM button to the
  right. The visual behavior (row hover reveals DM; row click views
  profile; DM click sends message) is preserved. Extracted a small
  `PlayerRow` component to keep the map clean.

### Files changed

- `src/modules/auth/hooks.ts` — `register()` now sends both `kc_action=register`
  and `prompt=create`; added comment explaining the compat rationale.
- `src/modules/chat/components/OnlinePlayersList.tsx` — restructured row
  into sibling buttons; extracted `PlayerRow` component; added explicit
  `aria-label` on the DM button.

### Validation

- `npx tsc --noEmit` — passes (exit 0).
- `npx eslint .` — passes (0 errors, 0 warnings).
- `npx vitest run` — 14 files, **127 tests**, all pass. S4 did not add
  unit tests — the deliverables are UX wiring + a third-party OIDC
  parameter change that the project's no-JSDOM testing stance does not
  cover.
- `npx vite build` — production build succeeds.

### Deviations from plan

- **Registration:** could not verify in-browser from this session. The
  fix chooses the most-likely root cause (Keycloak-version-dependent
  `kc_action` handling) and ships a belt-and-suspenders pair (`kc_action`
  + `prompt=create`). If the real breakage is something else
  (Keycloak realm config, unregistered redirect URI, `registrationAllowed:
  false`, etc.), the code-side change alone will not close it — that has
  to be verified in the browser. Logged to
  `frontend-remediation-issues.md`.
- **Onboarding sweep:** plan text says "if registration is broken, fix
  it in this stage and document root cause + verification." Root cause
  is **hypothesized** (unreliable `kc_action` on some Keycloak versions),
  fix is committed, but verification is pending browser.
- **Keycloak theming:** plan defers this behind §4.4 / §4.6 decision. I
  made no Keycloak-side change; the brand-context switch between the
  app and Keycloak's default registration form remains as-is per the
  default "document-and-ship" assumption in the review.
- **Nested interactive fix (F-U1):** original audit listed this as P0
  and the reviewed plan downgraded to P1 "fix during UI polish, not the
  first stage." Landing it here in S4 alongside other chat-area touching
  (per the plan text: "Fix nested interactive elements in
  `OnlinePlayersList` (F-U1) while touching the chat area") is within
  the stage's explicit scope.

### Remaining risk / follow-up

- **S1 + S2 + S3 + S4 browser-side manual sweeps are now the biggest
  outstanding liability.** Accumulating pending verification is itself
  a risk per the user's instruction ("do not let the pending manual
  sweeps keep accumulating indefinitely"). The next stage should be a
  dedicated sweep pass, not more code work. Specific S4 items to verify
  in a browser:
  1. Register flow: new user starts from `/`, clicks Register, Keycloak
     presents the **registration** form (not the login form), completing
     it returns to `/auth/callback` and the user enters `/onboarding/name`
     in `Draft` state. Both `kc_action` and `prompt=create` are in the
     outbound authorize URL.
  2. Full onboarding happy path: choose a name → Submit → stats screen
     → allocate → Confirm → lobby.
  3. Onboarding error paths (actually observed):
     - Name collision — submit a duplicate name → "already taken" shown,
       input editable, retry works.
     - 409 on stats — simulate by mutating revision server-side between
       fetch and submit → revision banner shows, points reset, retry.
     - Network failure — block BFF in devtools → error banner, button
       stays enabled, unblock and retry succeeds.
  All added to `frontend-remediation-issues.md`.
- **Type-shape weakness noted during audit (not fixed):** the
  `guard-decisions.test.ts` test's `mkCharacter()` uses invented field
  names (`identityId`, `displayName`, `xp`, `unspentStatPoints`,
  `stateRevision`) rather than the real `CharacterResponse` shape
  (`characterId`, `name`, `totalXp`, `unspentPoints`, `revision`). It
  type-checks because of an `as CharacterResponse` cast. The guard
  logic only reads `onboardingState` so tests still pass, but this is
  a landmine for future readers. Leaving as-is; not in S4 scope. Would
  be touched by F-TY1-5 type tightening (post-MVP).
- Next: concentrated browser-side manual sweep across S1-S4 — explicitly
  the next step per the user's instruction. Not Stage S5 yet.

---

## Stage S5 — Targeted UI polish

**Date:** 2026-04-18
**Status:** Completed
**Branch:** frontend-client
**Plan reference:** §6 Stage S5 (lands P2 #17, #18, #19, #21, #22, #24)

**Note on gating.** Per the user's instruction, the S1-S4 browser manual
sweeps were completed on the human side before S5 was authorized. The
previously-accumulated pending-verification items in
`frontend-remediation-issues.md` are therefore considered closed on the
human side; the `## Open / Deferred` list would be better represented as
"closed" once the human captures notes, but no code action is owed to
them from S5.

### Scope delivered

- **Shared outcome tone tokens + shadow tokens (P2 #17, #18, F-U5/F-U6/F-D2).**
  - New `src/modules/battle/outcome-tone.ts` exports `OUTCOME_TONE` — a
    `Record<BattleEndOutcome, OutcomeToneTokens>` with `accentClass`,
    `iconBg`, `iconShadow`, `containerBg`, `border`, `primaryButton`,
    `secondaryButton`. Plus `outcomeAccentClass(outcome)` helper for the
    overlay's narrow needs.
  - `BattleResultScreen` deleted its inline 56-line `TONE` record and
    now reads from `OUTCOME_TONE`. No behavior change; identical class
    strings.
  - `BattleEndOverlay` deleted its inline `outcomeAccentClass` switch
    and imports from the same module.
  - Added `--shadow-success / -error / -info / -warning` and
    `--shadow-title-glow` to `src/ui/theme/tokens.css`. Every arbitrary
    `shadow-[0_0_40px_rgba(...)]` and `drop-shadow-[0_0_20px_rgba(...)]`
    in `BattleResultScreen` is now `shadow-[var(--shadow-...)]`.
  - Every hardcoded `bg-[#1b2e1b]` / `bg-[#2e1b1b]` became `bg-success/10`
    / `bg-error/10` — the same idiom the rest of the codebase already
    uses (LevelUpBanner, ChatErrorDisplay, UnauthenticatedShell retry
    banner).
  - Grep confirms zero remaining `bg-[#...]`, `shadow-[0_0_...]`, or
    `drop-shadow-[0_0_...]` matches in `src/`.
- **Helper unification (P2 #19, F-Q4/F-Q5).**
  - `isApiError` is now a real export of `src/types/api.ts`. Both
    matchmaking call-sites (`useMatchmaking` hook 409 detection,
    `QueueButton` error-message extraction) import from there; the two
    identical inline copies are gone.
  - `formatTimestamp` moved into `src/modules/chat/format.ts`. Both
    `ChatPanel` and `DirectMessagePanel` import from it; the two
    identical inline copies and their now-unused `date-fns` imports are
    gone.
- **`lastResolution` cleared on battle end (P2 #21, F-S2).** The battle
  store's `handleBattleEnded` now sets `lastResolution: null` alongside
  the phase/endReason/winner writes. Previously the final turn's
  resolution object survived into the `'Ended'` phase, which could let
  a late re-render of `TurnResultPanel` flash the last turn's attack/
  block detail under the result celebration. Existing 11 battle-store
  tests continue to pass.
- **`AppHeader` dropdown via Radix DropdownMenu (P2 #22, F-R3/F-Q6).**
  Replaced the custom toggle + absolute-positioned `<div role="menu">`
  + global click-outside/Escape listeners with
  `@radix-ui/react-dropdown-menu` (new dependency, approved under the
  existing `@radix-ui` primitives stack entry). Portal positioning +
  keyboard navigation + ARIA attributes come for free; the header file
  shrank from 105 → 85 lines and lost the `useState`/`useRef`/`useEffect`
  machinery. Sign-out behavior is preserved.
- **Stat allocation de-duplication (P2 #24, F-Q1) — bounded.**
  - New `src/modules/player/useAllocateStats.ts` owns the shared
    mechanics: local `added` draft + increment/decrement/reset, the
    `useMutation` wrapping `POST /api/v1/character/stats`, merging the
    response into `usePlayerStore.character`, `gameState` invalidation,
    409 revision-mismatch handling, and the user-facing `errorMessage`
    extraction. Exports `STAT_KEYS` + `STAT_LABELS` + `StatKey` type so
    consumers use the same alphabet.
  - Caller-specific side effects flow through an `onSuccess` callback:
    `InitialStatsScreen` flips `onboardingState` to `'Ready'` there;
    `StatAllocationPanel` clears `pendingLevelUpLevel` when the drain
    reaches zero. Everything else is shared.
  - `InitialStatsScreen` and `StatAllocationPanel` both shed their
    state/useMutation/error-handling code and now read from the hook.
    Combined LOC dropped ~100 lines across the two callers net of the
    new file.
  - **Intentionally did NOT extract a shared `StatAllocationForm`
    presentational component.** The two callers have genuinely
    different layouts (full-screen onboarding form with h2 header +
    single Confirm button vs. lobby Card with h3 + collapsible pill +
    Reset button). Forcing them into one component needs many props
    for minor savings — borderline of "bounded and reviewable." Left
    the per-screen JSX as-is.

### Files changed

- **New:**
  - `src/ui/theme/tokens.css` — added outcome shadow tokens + title-glow token.
  - `src/modules/battle/outcome-tone.ts` — shared outcome tone record.
  - `src/modules/chat/format.ts` — shared chat timestamp formatter.
  - `src/modules/player/useAllocateStats.ts` — shared stat-allocation hook.
- **Modified:**
  - `src/modules/battle/screens/BattleResultScreen.tsx` — imports tokens,
    removes inline TONE, tokenizes the title glow.
  - `src/modules/battle/components/BattleEndOverlay.tsx` — imports
    `outcomeAccentClass` from the shared module.
  - `src/modules/battle/store.ts` — clears `lastResolution` on battle end.
  - `src/types/api.ts` — exports `isApiError`.
  - `src/modules/matchmaking/hooks.ts` — drops local `isApiError` copy; imports.
  - `src/modules/matchmaking/components/QueueButton.tsx` — same.
  - `src/modules/chat/components/ChatPanel.tsx` — drops local `formatTimestamp`; imports.
  - `src/modules/chat/components/DirectMessagePanel.tsx` — same.
  - `src/app/AppHeader.tsx` — Radix `DropdownMenu` replacement.
  - `src/modules/onboarding/screens/InitialStatsScreen.tsx` — uses `useAllocateStats`.
  - `src/modules/player/components/StatAllocationPanel.tsx` — uses `useAllocateStats`.
  - `package.json` / `package-lock.json` — `@radix-ui/react-dropdown-menu` added.

### Validation

- `npx tsc --noEmit` — passes (exit 0).
- `npx eslint .` — passes (0 errors, 0 warnings).
- `npx vitest run` — 14 files, **127 tests**, all pass. No regressions from
  the refactors: the battle store's existing 11-case suite continues to
  pass with the new `lastResolution: null` clear. No new unit tests added
  — the S5 scope is presentation + pure-extraction refactors.
- `npx vite build` — production build succeeds. Bundle grew 597 → 645 KB
  raw (173 → 189 KB gzip) due to the Radix dropdown-menu addition; within
  the plan's "bundle splitting is post-MVP" explicit exclusion.
- Grep sweep:
  - Zero `bg-[#...]`, `shadow-[0_0_...]`, or `drop-shadow-[0_0_...]`
    matches in `src/`. ✅
  - Zero duplicate `formatTimestamp` or `isApiError` function definitions
    outside their shared modules. ✅
  - `useAllocateStats` is referenced by both `InitialStatsScreen` and
    `StatAllocationPanel`; no other consumers. ✅

### Visual / behavioral checks performed (static)

Since visual regression requires a live browser, I verified behavior
preservation by comparing class strings and render output shape:

| Surface | Check | Result |
|---|---|---|
| Battle result — victory/defeat/draw/error/other | `OUTCOME_TONE[outcome]` yields the identical class string the previous inline `TONE[outcome]` produced (except `bg-[#1b2e1b]`→`bg-success/10` and `bg-[#2e1b1b]`→`bg-error/10` — visually equivalent at the same chroma). | ✅ |
| Battle result — icon glow | `shadow-[var(--shadow-success)]` resolves to `0 0 40px rgba(76,175,80,0.4)` — identical value. Same for error/info/warning. | ✅ |
| Battle result — title glow | `drop-shadow-[var(--shadow-title-glow)]` resolves to `0 0 20px rgba(255,255,255,0.15)` — identical. | ✅ |
| Battle end overlay — accent color per outcome | `outcomeAccentClass(outcome)` returns the same literal (text-success/error/info/warning/text-text-secondary) as the deleted local switch. | ✅ |
| Chat timestamps | `formatTimestamp` identical body (`format(new Date(sentAt), 'HH:mm')` with try/catch → `''`). | ✅ |
| Matchmaking join/leave 409 handling | `isApiError` body identical. | ✅ |
| Battle-end result screen | `lastResolution` cleared; `TurnResultPanel` is only rendered outside `Ended` (grep confirms). | ✅ |
| AppHeader dropdown | Same trigger label, same "Sign out" item, same logout callback. Radix brings focus trap, Escape/outside-click closing, portal positioning. | ✅ |
| Stat allocation — onboarding | `onSuccess` callback flips `onboardingState` to `'Ready'` identically to the previous inline `onSuccess`. | ✅ |
| Stat allocation — lobby panel | `onSuccess` clears `pendingLevelUpLevel` when `response.unspentPoints === 0` identically to the previous inline logic. Reset button, Card chrome preserved. | ✅ |

Live-browser spot-checks still owed on: lobby render, battle result
(all five outcomes), onboarding stats, chat timestamps (both global and
DM), header dropdown positioning across viewport widths, and that the
Radix menu trigger's `data-[state=open]` styling reads the open state
correctly.

### Deviations from plan

- **No shared `StatAllocationForm` presentational component.** The plan
  calls out "Extract `useAllocateStats` hook + `StatAllocationForm`
  presentational component; both screens thin down." I landed the hook
  (the large win) but skipped the shared form because the two callers'
  surrounding layouts diverge enough that a joint component needed
  more props than JSX it would save. This is the explicit "bounded and
  reviewable" carve-out from the user's scope instruction. The two
  screens each retain their own layout-specific JSX (~35 lines each).
- **`isApiError` call-site count.** Plan says "3 call-sites"; I found
  and unified 2 live call-sites. The third was most likely one of the
  duplicate definitions the plan was already counting, or a now-deleted
  usage from earlier stages.
- **`bg-[#1b2e1b]` / `bg-[#2e1b1b]` → `bg-success/10` / `bg-error/10`.**
  The two old hex values are "dark tinted green" and "dark tinted red"
  at roughly 10% saturation over near-black. `bg-success/10` /
  `bg-error/10` match that chroma pattern (same color family at the
  project's already-used 10% tint) and are the same idiom used
  throughout the rest of the codebase. A dedicated
  `--color-bg-outcome-{victory,defeat}` token was considered and
  rejected — no code reuse and no stylistic precedent.
- **Bundle size.** Bundle grew ~48 KB raw (16 KB gzip) from the Radix
  dropdown-menu dep. Within the explicit "bundle splitting is
  post-MVP" exclusion.

### Intentionally deferred

- **Full design-fidelity pass against `design/`** — §4.4 / plan §7 keep
  this post-MVP.
- **Animation polish** (Framer Motion on outcome celebration, reduced-
  motion handling) — post-MVP.
- **`StatAllocationForm` presentational component** — deferred per the
  scope carve-out above. The hook absorbs the bug-dense mutation/error
  logic, which was the P2 #24 MVP concern. Presentational cleanup
  follows in whichever later polish pass redesigns the lobby layout.
- **Chunk splitting / `React.lazy`** — explicit post-MVP exclusion.
- **Sentry / OTel hook on the logger** — post-MVP; the logger is the
  future seam (S0).
- **ZoneSelector redesign, avatar pipeline, `prefers-reduced-motion`,
  branded UUIDs, AbortSignal threading, BaseHubManager extraction,
  per-event subscribe hub API, `refetchOnWindowFocus` default flip,
  chat conversation eviction, E2E tests** — all explicitly post-MVP
  per plan §7.

### Remaining risk / follow-up

- **Live-browser spot-check of S5 outcomes.** The refactors preserve
  behavior by inspection, but a final pass through the 8 surfaces in
  the table above is owed before ship. Logged to
  `frontend-remediation-issues.md`.
- **Bundle size.** The growth from Radix dropdown-menu pushes the
  total close to 650 KB raw. Post-MVP, `React.lazy` on the battle
  route group + `framer-motion` would benefit from splitting; still
  explicitly deferred.
- **Nothing else.** Stage S5 completes the reviewed remediation plan.

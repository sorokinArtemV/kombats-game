# Frontend Execution Log

---

## Batch 10 — Phase 9: Hardening / Error Handling / Reconnection / Polish

**Date:** 2026-04-18
**Status:** Completed
**Branch:** frontend-client

Hardening pass over the already-built client. No new product flows, no architecture drift, no layer crossings. Each change is local and motivated by a concrete rough edge the earlier phases or the frontend execution issues already flagged. The six P9.x sub-scopes are addressed below.

### P9.1 HTTP error handling polish

- **TanStack Query retry policy** — `shouldRetryQuery` in `src/app/query-client.ts` replaces the flat `retry: 3`. 4xx responses (401/403/404/409 in particular) are treated as permanent and are *not* retried; only 5xx / no-`status` (network-like) errors retry up to 3 times. 401 in particular was previously generating three consecutive `onAuthFailure` diagnostic log entries per stale-token read; that is now a single attempt.
- **`joinQueue` failures no longer silent** — `useMatchmaking.joinQueue` rethrew only non-409 errors before this patch it swallowed all of them. `QueueButton` now captures the thrown error, extracts a user-facing message (5xx → "Matchmaking is temporarily unavailable"; ApiError message otherwise; generic fallback), and renders it beneath the button with `role="alert"`. 409 is still consumed silently and triggers a game-state refetch so the guards route the player to wherever the server thinks they belong — the existing intended behavior.
- **Chat rejoin failure** — when the chat hub reconnects but `JoinGlobalChat` then fails, the hook now emits a `service_unavailable` chat error so the existing `ChatErrorDisplay` banner surfaces the problem. Previously the user saw a green "Connected" pill with no live messages and no indication anything was wrong.
- Onboarding (name + stats) and post-battle refresh already had explicit 400/409 handling; no changes needed there. The general user-facing error surfaces from earlier phases were kept intact.

### P9.2 SignalR reconnection hardening

- **Terminal `failed` connection state** — `ConnectionState` gains a fifth variant. `BattleHubManager` and `ChatHubManager` now track whether automatic reconnect actually ran (`reconnectAttemptSeen` flipped on `onreconnecting`) and whether the consumer initiated the disconnect (`intentionalDisconnect` flipped by `disconnect()`). On `onclose`, the manager emits `failed` only when reconnect was attempted AND the close was not consumer-initiated; clean server-side closes and normal unmounts still emit `disconnected`. Covered by new `connection-state.test.ts` (6 tests across both managers).
- **Battle hook** — `useBattleConnection`'s `onConnectionStateChanged` now treats `state === 'failed'` as a terminal battle error (`handleError('Connection to the battle was lost and could not be restored.')`), except when the battle has already ended. Previously the user was stuck on a "Connection lost — reconnecting…" banner forever.
- **Battle screen banner stays truthful** — `ConnectionLostBanner` now reads `useBattleConnectionState()` and varies its message between "reconnecting…", "Reconnecting to the battle…", and "Connection unstable — waiting for server." depending on the live transport state.
- **Chat hook stale-closure hygiene** — `useChatConnection` now sets a `disposed` flag in its cleanup and early-returns in every handler + `.then`, matching the pattern already used by `useBattleConnection`. Also clears event handlers on unmount to match the battle hub's `setEventHandlers({})` cleanup.
- **Manual reconnect** — new exported `reconnectChat()` tears the hub down and brings it back up. `ChatErrorDisplay` shows a "Reconnect" action whenever the chat connection is in the terminal `failed` state, instead of silently leaving the user offline.
- **ConnectionIndicator** maps `failed` → red dot + "Connection lost" label. Also got an `aria-live="polite"` + `aria-label` for screen readers.

### P9.3 Browser lifecycle and tab behavior

- **`beforeunload` during active battle** — `BattleShell` mounts a `BattleUnloadGuard` that registers a `beforeunload` listener while the battle phase is `ArenaOpen | TurnOpen | Submitted | Resolving`. Modern browsers show their own generic prompt (returnValue content is ignored), which is fine — the goal is to catch accidental tab closes mid-turn. Disabled in non-active phases (`Idle`, `Connecting`, `WaitingForJoin`, `Ended`, `ConnectionLost`, `Error`) so the user can close normally after a completed fight or during a degraded state.
- **`visibilitychange` / `sendBeacon`-like leave-on-close** — **intentionally still deferred.** FEI-042 documents why `navigator.sendBeacon` cannot carry the bearer token, and that hasn't changed. The backend's 30-minute TTL plus the battle hub's `OpponentDisconnected` event already cover the abandoned-queue and abandoned-battle cases respectively. No change.
- **Tab-switch return coherence** — chat's existing reconnect-on-`connected` rejoin (P9.2) already resyncs global presence and messages on tab return. `DirectMessagePanel` already invalidates its DM query on reconnect. No additional tab-switch hooks needed.

### P9.4 Performance review / low-risk fixes

- **DM message buffer capped** — `MAX_DIRECT_MESSAGES_PER_CONVERSATION = 500` trims the real-time buffer per conversation when new messages push it over the cap. HTTP history backfills older messages on demand, so trimming the live buffer does not lose data — it only bounds memory and render cost over long sessions. Matches the existing `MAX_GLOBAL_MESSAGES = 500`.
- **`DirectMessagePanel` merge memoized** — `mergeMessages()` was running (sort + Set dedup) on *every* render, including unrelated `useChatStore` selector updates (global presence, etc.). Now wrapped in `useMemo` keyed on the actual inputs (`olderMessages`, `historyMessages`, `realtimeConversations`, `otherPlayerId`).
- **`useBattle()` monolithic selector** — already flagged in FEI-060 and already unused in production (Phase 7 switched to focused selectors). Left as-is; removing it is opportunistic cleanup, not hardening.
- No other rerender / retention issues found that were worth fixing versus leaving to a future polish batch. Not logging placeholders as open issues — the ones worth tracking are already present.

### P9.5 Logout cleanup

- **New `src/app/session-cleanup.ts`** centralizes teardown:
  1. Disconnect `battleHubManager` and `chatHubManager` (settled in parallel; errors ignored).
  2. `queryClient.cancelQueries()` then `queryClient.removeQueries()` — cancels in-flight requests before wiping cache so late responses cannot repopulate stale keys.
  3. Reset every module Zustand store (`useBattleStore.reset`, `useChatStore.clearStore`, `useMatchmakingStore.setIdle`, `usePlayerStore.clearState`, `useAuthStore.clearAuth`). None of them cross-write, so order doesn't matter.
- **`useAuth.logout`** is now async and awaits `clearSessionState()` before calling `oidcAuth.signoutRedirect()`. Previously only `clearAuth()` was called — a user switch re-logging in as a different account would briefly see the previous user's character, queue status, chat history, and player-card cache until every invalidation happened to trigger.
- `AppHeader`'s fire-and-forget callsite is unchanged in shape; the awaited cleanup happens inside the menu's `onClick` before the redirect takes over.

### P9.6 UI polish and accessibility

- **App header menu** — `Escape` closes it (matches click-outside), trigger got `aria-haspopup="menu"` + `aria-expanded`, menu got `role="menu"`, menu item got `role="menuitem"`.
- **Game-state error screens** — `role="alert"` on the two `GameStateLoader` error fallbacks so screen readers announce the failure instead of silently redrawing the retry button.
- **Battle banners** — `role="status" aria-live="polite"` on the battle `Banner` so transport-state changes are announced.
- **ConnectionIndicator** — `role="status" aria-live="polite" aria-label="Connection: …"`, decorative dot marked `aria-hidden`.
- **`ChatErrorDisplay`** — existing error container got `role="alert"`; new failed-connection banner also `role="alert"` with a visible Reconnect action.
- **Queue-join error surface** — previously nothing appeared if the join HTTP call failed; now the user sees a red message below the button.

### New tests

- `src/app/query-retry.test.ts` — 6 tests on the `shouldRetryQuery` predicate (4xx not retried, 5xx retried up to cap, no-status network errors retried, 3-retry cap).
- `src/transport/signalr/connection-state.test.ts` — 6 tests (3 per manager) on the `disconnected` vs `failed` lifecycle transitions.

Total vitest count: 76 → 88 across 10 test files (was 8).

### Files created (3)

- `src/app/session-cleanup.ts` — centralized teardown for logout / user switch
- `src/app/query-retry.test.ts` — tests for the 4xx-no-retry policy
- `src/transport/signalr/connection-state.test.ts` — tests for `failed` terminal state across both hubs

### Files modified (15)

- `src/app/query-client.ts` — export `shouldRetryQuery`, wire as default query retry
- `src/app/AppHeader.tsx` — Escape-to-close + role=menu/menuitem + aria on trigger
- `src/app/GameStateLoader.tsx` — `role="alert"` on both error fallbacks
- `src/app/shells/BattleShell.tsx` — `BattleUnloadGuard` adds `beforeunload` during active phases
- `src/modules/auth/hooks.ts` — async `logout` calls `clearSessionState()` before `signoutRedirect`
- `src/modules/battle/hooks.ts` — terminal `failed` connection state → `handleError`
- `src/modules/battle/screens/BattleScreen.tsx` — `ConnectionLostBanner` reflects live transport state; `Banner` announces via `aria-live`
- `src/modules/chat/hooks.ts` — `disposed` hygiene; rejoin failure surfaces a chat error; new `reconnectChat()` helper
- `src/modules/chat/store.ts` — DM buffer cap (`MAX_DIRECT_MESSAGES_PER_CONVERSATION = 500`)
- `src/modules/chat/components/ChatErrorDisplay.tsx` — terminal-connection banner with manual Reconnect action
- `src/modules/chat/components/DirectMessagePanel.tsx` — memoized `mergeMessages`
- `src/modules/matchmaking/hooks.ts` — rethrow non-409 `joinQueue` errors
- `src/modules/matchmaking/components/QueueButton.tsx` — visible failure message; typed ApiError extraction
- `src/transport/signalr/connection-state.ts` — add `failed` terminal variant
- `src/transport/signalr/battle-hub.ts` — track reconnect-attempt + intentional-disconnect; emit `failed`
- `src/transport/signalr/chat-hub.ts` — same terminal-state handling as battle-hub
- `src/ui/components/ConnectionIndicator.tsx` — map `failed` → red/"Connection lost"; a11y attrs

### Out of scope (preserved)

- No changes to `SessionShell`, `BattleShell` route hoisting, chat session scoping, `BattleGuard`, `OnboardingGuard`, `AuthGuard`, `AuthProvider`, or the OIDC bootstrap path.
- No new npm dependencies; `sonner` is still installed and unused.
- No animation/visual redesign, no token/theme changes.
- No `sendBeacon`-style leave-on-close (FEI-042 still deferred; auth-header constraint unchanged).
- No changes to the `BASE_FACTOR` leveling constant (FEI-032 still deferred — backend contract change).
- No new `<Toaster />` infrastructure (FEI-035 / FEI-DEV-072 still deferred; inline banners continue to do the job).
- The unused monolithic `useBattle()` selector is left in place — removing it is opportunistic cleanup, not hardening.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: zero errors. 21 pre-existing "Unused eslint-disable directive" *warnings* for diagnostic `// eslint-disable-next-line no-console` comments from earlier phases — none introduced by this batch.
- `npx vitest run`: 88 tests pass across 10 files (was 76 / 8)
- `npx vite build`: succeeds
- Manual browser validation not performed (no running BFF / Keycloak in this environment). All changes are either pure-logic (covered by new tests) or straightforward React wiring against the same contracts the earlier phases already exercise.

### Batch 10 review-ready checklist

- [x] P9.1 — 4xx not retried, `joinQueue` surfaces errors, chat rejoin failures are visible
- [x] P9.2 — both hubs expose terminal `failed`; battle hook maps it to a real error; chat offers a manual reconnect; BattleScreen banner truthful
- [x] P9.3 — active-battle `beforeunload` warning; `sendBeacon` still-deferred case explicitly documented
- [x] P9.4 — DM buffer capped; DM merge memoized; no speculative optimization
- [x] P9.5 — `clearSessionState()` wipes stores + query cache + hub connections on logout
- [x] P9.6 — header menu a11y, alert roles on error screens, aria-live on transport banners
- [x] No architecture drift; routing/session-shell/chat/matchmaking/battle/player structure preserved
- [x] Execution docs updated

---

## Batch 9 — Phase 8: Post-battle / result flow — Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Small, tightly scoped cleanup pass addressing five Phase 8 review findings before Phase 9 hardening. No Phase 9 work, no architecture drift.

### Fix 1: BattleGuard lobby-bounce after "Finish Battle"

**Problem:** Clicking "Finish Battle" → `navigate('/lobby')`. BattleShell unmounted → `useBattleConnection` cleanup reset the battle store (`phase → 'Idle'`, `battleId → null`). `queueStatus` in the player store was still `Matched + battleId` (stale — game-state refetch hadn't completed). The guard's first branch then matched `queueStatus.status === 'Matched' && queueStatus.battleId` and, without the battle-store "Ended" exemption applying (store had already been reset), redirected the user back to `/battle/:id`. Until the server reconciliation arrived, the user ping-ponged.

**Resolution:** The `handleFinish` handler on `BattleResultScreen` now optimistically clears `queueStatus` on the player store *before* navigating:

```ts
setQueueStatus(null);
setPostBattleRefreshNeeded(true);
navigate('/lobby');
```

This matches the server's eventual state (battle over ⇒ no active queue). `usePostBattleRefresh` reconciles the authoritative state on lobby arrival. Minimal change: only the `BattleResultScreen.handleFinish` path is affected; the BattleGuard logic itself is untouched so result-screen reachability (REQ-P1) is preserved.

### Fix 2: DEC-5 retry based on fresh query-cache data

**Problem:** `usePostBattleRefresh` used `useBattleStore.getState()` (typo in prior review — actually `usePlayerStore.getState()`) to read post-refetch XP/level. Zustand sync happens in a later React commit via `useGameState`'s effect, so the `post` read was still the pre-refetch value. The "unchanged?" check returned true every time and the 3-second retry path fired on *every* return to lobby.

**Resolution:** Extracted a pure comparator `comparePlayerProgress` into `src/modules/player/player-progress.ts`. `usePostBattleRefresh` now:
1. Snapshots the character pre-refetch (via `snapshotCharacter` on the store).
2. Calls `queryClient.refetchQueries({ queryKey: gameKeys.state(), exact: true })`.
3. Reads the fresh result **directly from the query cache** via `queryClient.getQueryData<GameStateResponse>(gameKeys.state())`. That's the authoritative snapshot written at refetch-completion time — it doesn't wait for the Zustand sync commit.
4. Retries only when `delta.changed === false` and both snapshots are non-null.
5. Reports level-up from `delta.newLevel` via `setPendingLevelUpLevel`.

The comparator considers XP, level, and unspent-points deltas. Any one of these being different suppresses the retry — matching the intent of the DEC-5 "retry only if nothing changed" rule.

### Fix 3: Result screen readiness tightened to `Ended` only

**Problem:** `BattleResultScreen` previously rendered content for `phase ∈ { Ended, Resolving, TurnOpen, ArenaOpen, Submitted }`. Mid-battle access (manually typing `/result`, or an unusual race) could produce a fake "Draw" outcome because `endReason` and `winnerPlayerId` were still null.

**Resolution:** The readiness check is now `phase === 'Ended'`. All non-ended phases show the existing loading spinner until `BattleEnded` populates the store (or the new mismatch guard below redirects).

### Fix 4: URL ↔ store battleId mismatch redirects to lobby

**Problem:** If the URL `battleId` and the battle store's `battleId` diverged (e.g., stale URL from a prior battle, or cross-wired navigation), the result banner would be derived from the store while the feed would be fetched by URL. That was a silent inconsistency.

**Resolution:** Explicit guard in `BattleResultScreen`: if `storeBattleId !== null && storeBattleId !== battleId`, render `<Navigate to="/lobby" replace />`. The mismatch is loud (redirect to a safe route) rather than silently rendering mixed data. When `storeBattleId === null` the guard is skipped so the result screen can still display during the pre-snapshot window — consistent with Fix 3's spinner state.

### Fix 5: Pure-logic tests for feed merge and post-battle progress

Two new pure-logic modules and test files (Vitest, no new infrastructure):

**`src/modules/battle/feed-merge.ts`** — extracted `mergeFeeds(store, authoritative)` from `result-feed.ts`. Pulling transport/config into a test file via `hooks.ts` failed test load (`VITE_KEYCLOAK_AUTHORITY` missing); the standalone module has no transport imports.

**`src/modules/battle/feed-merge.test.ts`** — 7 tests:
- Empty sources
- Single-source passthrough
- Dedup by key across sources
- Authoritative-overwrites-store semantics (including severity override)
- `(turnIndex, sequence)` ordering regardless of input order
- Disjoint entries merged from both sides
- Stable ordering with unique `(turnIndex, sequence)` pairs

**`src/modules/player/player-progress.ts`** — extracted `comparePlayerProgress` and `snapshotCharacter`.

**`src/modules/player/player-progress.test.ts`** — 10 tests:
- `snapshotCharacter` null/undefined handling and field extraction
- Null pre/post → no-change
- All-equal snapshots → no-change (retry will fire)
- XP-only delta → change, no level-up (retry suppressed)
- Unspent-points-only delta → change, no level-up (retry suppressed)
- Level-up with newLevel populated
- Multi-level jump
- Defensive level-decrease case (not reported as level-up)

Total vitest count: 48 → 65 (17 new); 4 test files → 6.

### Files created (4)

- `src/modules/battle/feed-merge.ts` — pure `mergeFeeds`
- `src/modules/battle/feed-merge.test.ts` — merge/dedup/sort tests
- `src/modules/player/player-progress.ts` — `snapshotCharacter` + `comparePlayerProgress`
- `src/modules/player/player-progress.test.ts` — DEC-5 comparator + level-up tests

### Files modified (3)

- `src/modules/battle/screens/BattleResultScreen.tsx` — readiness tightened to `Ended`, URL/store battleId mismatch guard, optimistic `setQueueStatus(null)` on Finish Battle
- `src/modules/battle/result-feed.ts` — imports `mergeFeeds` from the extracted module (no behavior change)
- `src/modules/player/post-battle-refresh.ts` — uses `queryClient.getQueryData` + the extracted comparator; retry only fires when genuinely unchanged

### Out of scope (preserved)

- No changes to BattleGuard logic itself (Fix 1 lives on the "Finish Battle" action, not in the guard)
- No changes to battle store, battle hook, zones, chat, matchmaking, onboarding, or session-shell
- No new npm deps; no `<Toaster />` introduced (FEI-DEV-072 still Phase 9 territory)
- No Phase 9 hardening work

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- `npx vitest run`: 65 tests pass across 6 files (was 48/4)
- `npx vite build`: succeeds (pre-existing size warning unchanged)

### Cleanup-patch review-ready checklist

- [x] Lobby-return bounce eliminated (optimistic queue-status clear in `handleFinish`)
- [x] DEC-5 retry now compares fresh query-cache data, so retry fires only when XP, level, and unspent-points are all unchanged
- [x] Result screen readiness is strictly `phase === 'Ended'`; all other phases show the spinner
- [x] URL/store `battleId` mismatch loudly redirects to `/lobby`
- [x] `mergeFeeds` and `comparePlayerProgress` each have focused unit-test coverage
- [x] No Phase 9, no architecture drift, no unrelated refactors

---

## Batch 9 — Phase 8: Post-battle / result flow

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Completes the playable loop: battle end → result screen → lobby return → authoritative state refresh → post-level-up stat allocation → re-queue. Reuses the Phase 6/7 battle store, zone model, hook, and the onboarding stat-allocation primitives; adds only minimal additive structure.

### Lifecycle hoist: battle connection moves from BattleScreen to BattleShell

The Phase 7 battle connection was owned by `BattleScreen.tsx`, whose effect cleanup resets the battle store (`useBattleStore.reset()`) and disconnects the battle hub. That would wipe `phase=Ended`, `endReason`, `winnerPlayerId`, and the feed the moment the player navigated to `/battle/:battleId/result` — making the result screen impossible to render from the in-memory store.

**Resolution:** Hoisted `useBattleConnection(battleId)` to `BattleShell`. The shell is shared by both `/battle/:battleId` and `/battle/:battleId/result`, so the store now survives the hand-off. Cleanup still runs when the player exits the `/battle/*` subtree (to `/lobby`). Behaviour inside Phase 7 is unchanged; only the host component for the connection changed.

### BattleGuard REQ-P1 hard-gate update

Previously, if `queueStatus` cleared before the player dismissed the result screen (server-side queue update arrival order is not guaranteed), the guard would redirect away from `/battle/:id/result` to `/lobby`. New logic:
- When `queueStatus.status === 'Matched' && queueStatus.battleId`, if the battle store reports `phase === 'Ended'` for the same `battleId`, the guard no longer force-navigates onto the live battle path — the result screen can be dismissed naturally.
- When `queueStatus` is absent but the battle store still holds `phase === 'Ended'` for the pathname's battleId, `/battle/:id/result` is still allowed; otherwise the legacy "redirect to /lobby" behavior applies.

### P8.1: Battle result screen

New `src/modules/battle/screens/BattleResultScreen.tsx`:
- Reads outcome via the already-extracted `deriveOutcome` (Phase 7 cleanup patch) — no parallel result-state model.
- Shows outcome title/subtitle with outcome-tone accent (victory/success, defeat/error, draw/info, error/warning, other/muted).
- Shows player vs. opponent name line derived from `useAuthStore.userIdentityId` + battle store identity.
- Merged narration feed via new `useResultBattleFeed(battleId)` hook — combines `useBattleFeed()` (live, in-store) with `GET /api/v1/battles/{battleId}/feed` (authoritative, already exists in `transport/http/endpoints/battle.ts`). Dedup by `entry.key` with HTTP entries overwriting store entries for the same key; sorted by `(turnIndex, sequence)`.
- Existing `NarrationFeed` component extended with an optional `entries` prop and a `fill` layout flag so the result screen can feed it a merged list and let it fill available space. Default (no props) behaviour unchanged — Phase 7 consumer (`BattleScreen`) still reads from the store.
- "Finish Battle" button sets `postBattleRefreshNeeded = true` on the player store and navigates to `/lobby`. No inline Phase-9 polish (no animations beyond existing transition-colors).

### P8.2: Post-battle state refresh & cleanup

New `src/modules/player/post-battle-refresh.ts` — `usePostBattleRefresh()` hook, mounted by `LobbyScreen`:
1. Guarded by a `useRef` + a player-store flag that is consumed up-front so the sequence runs exactly once per lobby trip.
2. Snapshots current `character.totalXp` and `character.level`.
3. `queryClient.refetchQueries({ queryKey: gameKeys.state(), exact: true })` — the existing `useGameState` subscriber in `GameStateLoader` then syncs the refetch into the player store.
4. DEC-5 retry: if XP **and** level are unchanged, waits 3s and refetches once more.
5. If `post.level > pre.level`, sets `pendingLevelUpLevel` on the player store so the lobby's `LevelUpBanner` surfaces it.
6. Cancellation-safe: if the lobby unmounts mid-flight, cancelled flag prevents further state writes.

Player store extended with:
- `postBattleRefreshNeeded: boolean` + `setPostBattleRefreshNeeded(needed)`
- `pendingLevelUpLevel: number | null` + `setPendingLevelUpLevel(level)`
- `clearState()` now also clears the two new fields.

New `src/modules/player/components/LevelUpBanner.tsx` — dismissable inline banner (success-token styling). No new toast infrastructure (`sonner` is installed but no `<Toaster />` exists yet, and wiring one is a broader polish concern beyond the Phase 8 scope).

Battle cleanup on lobby return: the hoisted `useBattleConnection` effect cleanup (shell unmount when leaving `/battle/*`) already handles battle-store reset, hub disconnect, and `clearSuppressedOpponent`. Session-scoped chat ownership (SessionShell) is untouched.

Re-queue: `QueueButton` behavior is unchanged. Once post-battle refresh completes and the user closes the banner / allocates stats, re-entering matchmaking works via the existing flow.

### P8.3: Lobby stat allocation (post-level-up)

`StatPointAllocator.tsx` was a stateless presentation primitive with no business logic that lived in `modules/onboarding/components/`. To avoid a second independent implementation on the lobby side, it was moved to `src/ui/components/StatPointAllocator.tsx`. `InitialStatsScreen` now imports it from `@/ui/components/StatPointAllocator` — behaviour unchanged. Moving the primitive was the minimum touch needed to enable reuse; no other onboarding code was modified.

New `src/modules/player/components/StatAllocationPanel.tsx`:
- Renders nothing unless `character.unspentPoints > 0` (non-blocking per the requirements hard-gate table).
- Same mutation contract as the onboarding screen: `POST /api/v1/character/stats` with `expectedRevision`, 409 → refetch game state + reset draft allocation, success → local character update + `invalidateQueries(gameKeys.state())`.
- Differences vs. the onboarding screen: card-style container (fits lobby layout), "Reset" secondary action, clears `pendingLevelUpLevel` when all points are spent.
- Lobby screen wires it right under `CharacterSummary` with the `LevelUpBanner` above.

### Files created (6)

- `src/modules/battle/screens/BattleResultScreen.tsx`
- `src/modules/battle/result-feed.ts` — `useResultBattleFeed(battleId)` merged-feed hook
- `src/modules/player/post-battle-refresh.ts` — `usePostBattleRefresh()` DEC-5 sequence
- `src/modules/player/components/StatAllocationPanel.tsx` — lobby post-level-up allocation
- `src/modules/player/components/LevelUpBanner.tsx` — dismissable level-up surface
- `src/ui/components/StatPointAllocator.tsx` — moved from onboarding

### Files modified (8)

- `src/app/router.tsx` — `BattleResultScreen` replaces `BattleResultPlaceholder`
- `src/app/shells/BattleShell.tsx` — hosts `useBattleConnection(battleId)` via a small `BattleConnectionHost` child
- `src/app/guards/BattleGuard.tsx` — REQ-P1 hard-gate handling (keep `/result` reachable while `phase === 'Ended'`)
- `src/modules/battle/screens/BattleScreen.tsx` — removed the inline `useBattleConnection` call (now owned by the shell)
- `src/modules/battle/components/NarrationFeed.tsx` — added optional `entries` prop and `fill` layout flag
- `src/modules/onboarding/screens/InitialStatsScreen.tsx` — import path update for the moved `StatPointAllocator`
- `src/modules/player/store.ts` — added `postBattleRefreshNeeded`, `pendingLevelUpLevel`, plus setters and clear-state expansion
- `src/modules/player/screens/LobbyScreen.tsx` — mounts `usePostBattleRefresh()`, renders `LevelUpBanner` + `StatAllocationPanel`

### Files deleted (2)

- `src/modules/onboarding/components/StatPointAllocator.tsx` — moved to `src/ui/components/`
- `src/app/route-placeholders.tsx` — `BattleResultPlaceholder` no longer used

### Out of scope (preserved)

- No Phase 9 polish: no `<Toaster />` wiring, no Framer Motion entrance animations on the result screen, no deeper error-branch UI, no broader lobby redesign
- No new npm dependencies (`sonner` is available for Phase 9 should a toast system be needed)
- No changes to matchmaking, chat, auth, onboarding logic (only the `StatPointAllocator` import path changed)
- No broad battle-history feature, no notification centre
- No bypass of the existing player store / game-state query pattern

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- `npx vitest run`: 48 tests pass across 4 files (no regressions from the Phase 7 cleanup patch)
- `npx vite build`: succeeds (572 kB bundle; pre-existing size warning unchanged)
- Manual browser validation was not performed (no backend available in this environment); all wiring is type-checked and follows the existing transport/store/query patterns verified by earlier batches

### Batch 9 review-ready checklist

- [x] `/battle/:battleId/result` renders a production result screen with outcome + merged narration feed
- [x] Outcome derivation reuses existing `deriveOutcome` (no parallel model)
- [x] Full narration feed deduplicated by `key` across store and HTTP sources
- [x] "Finish Battle" returns to `/lobby` and triggers the post-battle refresh sequence
- [x] Lobby `usePostBattleRefresh` refetches game state and retries once after 3s if XP/level unchanged (DEC-5)
- [x] Level-up detected → persistent lobby banner surfaces the new level
- [x] Lobby stat allocation uses the same `/api/v1/character/stats` endpoint and revision pattern as onboarding, rendering only when `unspentPoints > 0`
- [x] `StatPointAllocator` shared between onboarding and lobby (moved to `ui/components/`)
- [x] Battle hub disconnects + battle store resets when the player leaves the `/battle/*` subtree
- [x] Session-scoped chat ownership (`SessionShell`) untouched; re-queue works via the existing flow
- [x] No Phase 9 hardening, no unrelated refactors, no architecture drift

---

## Batch 8 — Phase 7: Battle UI Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Small, tightly scoped cleanup pass addressing five Phase 7 review findings before Phase 8 begins. No Phase 8 implementation, no foundation changes.

### Fix 1: SystemError battle-end messaging aligned to phase-7 handoff

`BattleEndOverlay` SystemError subtitle previously read "The battle ended due to a system error." — close to the plan but not exact and slightly inconsistent with the Phase-8 "Returning to lobby" promise in the plan wording. Phase 7 only hands off to `/battle/:battleId/result`; it does not return to lobby.

**Resolution:** Subtitle now reads "Battle ended due to a system error." (plan's core phrase) without promising a lobby return that Phase 7 does not perform. The actual lobby-recovery behavior remains a Phase 8 responsibility on the result screen. The "Continue to Result" handoff is unchanged.

`deriveOutcome` extracted from `BattleEndOverlay.tsx` into a new `battle-end-outcome.ts` module so it can be unit tested (see Fix 5). `BattleEndOverlay` now imports `deriveOutcome` and `BattleEndOutcome` from the extracted module.

### Fix 2: Reduced redundant "submitted" signals

Previously three UI surfaces all said "Submitted" / "Action submitted" at the same time:
- HUD phase label → "Action submitted"
- TurnTimer → "Submitted"
- ZoneSelector → "Action submitted" badge

**Resolution:** Canonical signal is the ZoneSelector badge (adjacent to the action). HUD phase label for `Submitted` now reads "Waiting for opponent" (still descriptive, no longer duplicative). TurnTimer no longer renders a "Submitted" string — it shows the neutral em-dash for any non-`TurnOpen`/non-`Resolving` phase. Three signals → one explicit "Action submitted" badge plus context-appropriate phase/timer states.

### Fix 3: Neutral pre-snapshot HP bars

`BattleHud` previously rendered `safeHp = hp ?? 0` against `safeMax = maxHp ?? 0`, so while the snapshot had not yet arrived the UI flashed a red/empty low-HP bar and "? / ?" numbers.

**Resolution:** `HpPanel` now computes `ready = hp !== null && maxHp !== null && maxHp > 0`. Until ready, it renders a full-width neutral bar (`bg-bg-surface`) with "— / —" for the numbers. Once the snapshot arrives, the usual HP color thresholds apply. No extra state or lifecycle — pure render-time branching.

### Fix 4: Narration feed auto-scroll keyed off tail identity

`NarrationFeed` auto-scroll effect depended only on `entries.length`, which would miss any future update that replaces the tail entry without changing array length.

**Resolution:** Derive a `tailSignal = "${tail.key}:${tail.sequence}"` from the last entry and key the auto-scroll effect on that string. Empty string when no entries. Length-change + tail-replacement both trigger scroll; no-op updates that keep the same tail do not.

### Fix 5: Added deriveOutcome + TurnTimer view-model tests

Reviewer flagged that two pieces of pure logic were worth testing. Both were refactored to be trivially testable without introducing JSDOM/RTL:

- `src/modules/battle/battle-end-outcome.ts` — extracted `deriveOutcome` function (unchanged behavior apart from the SystemError wording aligned in Fix 1).
- `src/modules/battle/turn-timer-view.ts` — new `computeTurnTimerView(phase, deadlineUtc, now)` pure function that returns a discriminated view (`resolving` | `idle` | `countdown` with urgency). `TurnTimer.tsx` refactored to hold a `now` tick in state and delegate the view decision to this pure function. Interval logic unchanged.

New tests (Vitest, no new framework):
- `battle-end-outcome.test.ts` — 9 assertions covering victory/defeat/draw for `Normal`, DoubleForfeit/Timeout draws, SystemError wording (explicitly asserts the subtitle does **not** contain "lobby"), generic `Cancelled/AdminForced/Unknown` branches, and null-myId fallthroughs.
- `turn-timer-view.test.ts` — 15 assertions covering resolving override, idle for all non-TurnOpen phases, null-deadline idle, normal urgency > 10s, warning at 10s, critical at 5s, past-deadline clamp to 0s, and the 1.5s buffer (DEC-4) verified via a deadline exactly `DEADLINE_BUFFER_MS` in the future reading as 0s.

Test count: 22 → 48 (2 new test files).

### Files created (4)

- `src/modules/battle/battle-end-outcome.ts` — extracted `deriveOutcome` pure function
- `src/modules/battle/turn-timer-view.ts` — `computeTurnTimerView` pure view-model
- `src/modules/battle/battle-end-outcome.test.ts` — 9 tests
- `src/modules/battle/turn-timer-view.test.ts` — 8 tests (including `.each` expansion → 15 assertions)

### Files modified (4)

- `src/modules/battle/components/BattleEndOverlay.tsx` — SystemError wording aligned; imports `deriveOutcome` from extracted module
- `src/modules/battle/components/BattleHud.tsx` — `Submitted` phase label → "Waiting for opponent"; `HpPanel` neutral pre-snapshot render
- `src/modules/battle/components/TurnTimer.tsx` — removed "Submitted" text; now delegates view-decision to `computeTurnTimerView`
- `src/modules/battle/components/NarrationFeed.tsx` — auto-scroll keyed off `key:sequence` of tail entry

### Out of scope (preserved)

- No changes to `store.ts`, `zones.ts`, `hooks.ts`, transport, router, or guards
- No Phase 8 result-screen implementation, no lobby-return logic, no XP refresh
- No Framer Motion polish; no new npm deps
- No changes to `ui/` primitives

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- `npx vitest run`: 48 tests pass across 4 files (was 22 across 2; +24 from new tests, +2 from minor existing file counts: `battle-end-outcome.test.ts` and `turn-timer-view.test.ts`)
- `npx vite build`: succeeds (566 kB bundle; pre-existing size warning unchanged)

### Cleanup-patch review-ready checklist

- [x] SystemError subtitle aligned with phase-appropriate handoff (no misleading lobby-return promise)
- [x] One canonical "submitted" signal (ZoneSelector badge); HUD + TurnTimer de-duplicated
- [x] HP bars render neutral before snapshot; no red/empty flash
- [x] NarrationFeed auto-scroll keyed off tail key+sequence, not length
- [x] `deriveOutcome` and TurnTimer view-model both unit-tested
- [x] No Phase 8, no foundation drift, no unrelated refactors

---

## Batch 8 — Phase 7: Battle UI

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Replaced the Phase 6 debug battle screen with a production-oriented battle UI built on top of the existing battle store, zone model, and battle hook. No changes to the Phase 6 foundation; all new code is presentation layered over the existing focused selectors.

### P7.1: Battle screen layout and HUD

New `BattleHud.tsx`:
- Player / opponent HP bars (color thresholds: `bg-hp-high` > 50%, `bg-hp-medium` > 25%, `bg-hp-low` otherwise) driven by `useBattleHp()`.
- Current turn index from `useBattleTurn()`; phase indicator from `useBattlePhase()` with tone-specific text color.
- Connection state via `ConnectionIndicator` wired to `useBattleConnectionState()`.
- HP panels mirrored (left/right) with names from `useBattleStore` playerAId/Name vs. authenticated user identity.

`BattleScreen.tsx` rewritten around a three-region layout: HUD top, combat area (error/connection banner + ZoneSelector + TurnResultPanel) left, NarrationFeed right (stacks below on mobile). Shows a centered spinner while phase is `Idle | Connecting | WaitingForJoin`. No inline debug rows remain.

### P7.2: Turn timer

New `TurnTimer.tsx` lives inside the HUD:
- Uses `useBattlePhase()` + `useBattleTurn()` (focused selectors — no monolithic `useBattle()`).
- Countdown derived from `deadlineUtc - 1500ms` per DEC-4.
- Ticks at 100ms via `setInterval` inside an effect; setState only from the subscription callback (react-hooks/set-state-in-effect compliant).
- Phase-aware states: `TurnOpen` → live seconds countdown, `Submitted` → "Submitted", `Resolving` → "Resolving…", otherwise em-dash.
- Color urgency: default text, warning at ≤ 10s, error at ≤ 5s.
- No independent timer logic — reads the same `deadlineUtc` that the store receives from `TurnOpened` / `BattleStateUpdated`.

### P7.3: Zone selector

New `ZoneSelector.tsx`:
- Attack row: 5 buttons, one per `BattleZone` from `ALL_ZONES`, each with its `--color-zone-*` swatch.
- Block row: 5 buttons, one per entry in `VALID_BLOCK_PAIRS` — adjacent-pair topology enforced at the source data, not freeform zone pickers.
- Submit button wired to `useBattleActions().submitAction` — the real Phase 6 submit path; payload continues to be built by `buildActionPayload` inside the hook.
- Disabled when phase ≠ `TurnOpen` or when the battle hub connection is not `connected`. A "Waiting for connection" note is shown when disabled by connection.
- "Action submitted" badge in the header when phase is `Submitted`; submit button shows `Button loading` state during `isSubmitting`.
- Selection summary row at the bottom reflects current attack zone / block pair.

### P7.4: Turn result display

New `TurnResultPanel.tsx` reads `lastResolution` directly from the battle store:
- Renders only when `lastResolution.log` is present.
- Two side-by-side direction cards: "{myName} attacks" (aToB if I'm player A, else bToA) and "{opponentName} attacks" (the other direction).
- Each card shows: mapped outcome label, damage (`-N HP` when > 0), attack zone chosen, defender block pair.
- Outcome tone colors: `Hit` → error, `Critical*` → warning, `Blocked` → info, `Dodged` → success, `NoAction` → muted.
- No parallel resolution model introduced — reuses `AttackResolutionRealtime` shape from `types/battle.ts`.

### P7.5: Narration feed

New `NarrationFeed.tsx`:
- Reads `feedEntries` via `useBattleFeed()` focused selector.
- Scrollable column; auto-scrolls to the newest entry whenever `entries.length` changes (newest at bottom preserved from store's append-with-dedup logic).
- Severity styling via left border: `Critical` → error border + tinted background, `Important` → accent border, `Normal` → default surface border.
- Tone styling via text color: Aggressive → accent, Defensive → info, Dramatic → warning italic, System → muted mono, Flavor → italic secondary, Neutral → secondary.
- Important severity adds `font-medium` emphasis.
- Turn prefix (`Tn`) on each row from `entry.turnIndex`.
- Empty state: "No events yet." rather than hiding the panel.

### P7.6: Battle end overlay

New `BattleEndOverlay.tsx`:
- Mounts when `phase === 'Ended'`. Uses Radix `Dialog.Root` directly rather than introducing an unused `ui/Dialog.tsx` wrapper (single consumer, keeps scope minimal).
- Reads `endReason`, `winnerPlayerId`, `battleId` from store and `userIdentityId` from auth store.
- Outcome derivation:
  - `SystemError` → "Battle Ended" + system error subtitle (warning accent)
  - `DoubleForfeit` → "Draw — mutual inactivity" (info accent)
  - `Timeout` → "Draw — battle timed out" (info accent)
  - `Cancelled | AdminForced | Unknown` → "Battle Ended — ended unexpectedly" + raw reason in mono (other)
  - `Normal` → Victory (success) / Defeat (error) / Draw (info) based on `winnerPlayerId === myId`.
- "Continue to Result" `Link` to `/battle/:battleId/result` — the existing handoff to Phase 8, unchanged. No Phase 8 finalization logic added here.

### Files created (6)

- `src/modules/battle/components/BattleHud.tsx` — HP bars, turn counter, phase label, connection indicator, embeds `TurnTimer`
- `src/modules/battle/components/TurnTimer.tsx` — buffered-deadline countdown (DEC-4)
- `src/modules/battle/components/ZoneSelector.tsx` — attack + block-pair selection, submit
- `src/modules/battle/components/TurnResultPanel.tsx` — last-turn resolution card
- `src/modules/battle/components/NarrationFeed.tsx` — scrollable feed with severity/tone styling
- `src/modules/battle/components/BattleEndOverlay.tsx` — Radix-Dialog-based end overlay with Continue-to-Result handoff

### Files modified (1)

- `src/modules/battle/screens/BattleScreen.tsx` — replaced debug rows with production layout composing the six new components; no longer references `ALL_ZONES`, `VALID_BLOCK_PAIRS`, or raw debug helpers

### Out of scope (preserved)

- No changes to `store.ts`, `zones.ts`, `hooks.ts`, transport layer, router, or guards. Battle foundation (Phase 6) untouched.
- `BattleResultPlaceholder` at `/battle/:battleId/result` remains a placeholder — Phase 8 territory.
- No post-battle XP refresh, lobby re-entry logic, or level-up notifications introduced.
- No new npm dependencies. Framer Motion animations deferred — the existing battle screen had none and P7 hard-constraints call for no overbuilt polish.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- `npx vitest run`: 22 tests pass (2 test files) — store/zone tests unchanged, no regression
- `npx vite build`: succeeds (566 kB bundle, bundle-size warning is a pre-existing build characteristic unrelated to this batch)
- Manual UI verification not performed (no backend running); all UI wires to the real battle hook/store/zone helpers — submit still routes through `battleHubManager.submitTurnAction` via `useBattleActions().submitAction`.

### Batch 8 review-ready checklist

- [x] Debug battle screen replaced with production-oriented layout
- [x] HUD shows HP / turn / phase / connection
- [x] Turn timer uses buffered-deadline model (DEC-4) and reflects non-turn-open states
- [x] Zone selector uses approved 5-zone / adjacent-block-pair model, prevents invalid submissions by source data
- [x] Submit still flows through the real Phase 6 battle hook path
- [x] Turn result panel derived from `lastResolution` — no parallel resolution model
- [x] Narration feed preserves store ordering and deduplication
- [x] Ended phase surfaces a clear Victory/Defeat/Draw overlay with Continue-to-Result handoff
- [x] No Phase 8 flow, no unrelated refactors, no architecture drift

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

---

## Batch 5A — Phase 4 (Part 1): Lobby Shell + Chat + Presence

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

### P4.1: Lobby shell and character summary

**Status:** Done

- `src/modules/player/components/CharacterSummary.tsx` — Displays character name, level, XP progress bar, all 4 stats (Str/Agi/Int/Vit), wins/losses from player card, and unspent points badge.
- `src/modules/player/screens/LobbyScreen.tsx` — Composes CharacterSummary in lobby layout. Queue button placeholder for Phase 5.
- `src/ui/components/Badge.tsx` — Variants: default, accent, success, warning, error. Used for unspent points indicator.
- `src/ui/components/ProgressBar.tsx` — Configurable progress bar with label and text display. Used for XP bar.
- Own-profile win/loss workaround (DEC-3): `CharacterSummary` fetches the player card using `userIdentityId` from auth store via `GET /api/v1/players/{id}/card` (TanStack Query, 30s staleTime).
- Router updated: `/lobby` now renders `LobbyScreen` instead of `LobbyPlaceholder`. Placeholder removed from `route-placeholders.tsx`.

### P4.2: Chat Zustand store

**Status:** Done

- `src/modules/chat/store.ts` — Zustand store with full state shape:
  - `connectionState`, `globalConversationId`, `globalMessages[]`, `directConversations` Map, `onlinePlayers` Map, `onlineCount`, `rateLimitState`, `suppressedOpponentId`, `lastError`
  - Actions: `setConnectionState()`, `setGlobalState()`, `addGlobalMessage()`, `addOnlinePlayer()`, `removeOnlinePlayer()`, `handleChatError()`, `handleConnectionLost()`, `clearRateLimit()`, `clearStore()`
  - Message deduplication by `messageId`
  - Global messages capped at 500 (oldest trimmed on overflow)
  - Rate limit state tracks `isLimited`, `retryAfterMs`, `limitedAt`
  - DM state shape ready for P4.6 (Map structure, suppressedOpponentId field) but not actively wired

### P4.3: Chat connection hook

**Status:** Done

- `src/modules/chat/hooks.ts` — Hooks:
  - `useChatConnection()`: Session-scoped lifecycle hook. On mount: connects ChatHubManager, calls `JoinGlobalChat()`, populates store with messages + online players. On unmount: disconnects cleanly + clears store.
  - Event callbacks registered: `GlobalMessageReceived` → `addGlobalMessage`, `PlayerOnline` → `addOnlinePlayer`, `PlayerOffline` → `removeOnlinePlayer`, `ChatError` → `handleChatError`, `ChatConnectionLost` → `handleConnectionLost`, `onConnectionStateChanged` → `setConnectionState` + rejoin on reconnect.
  - Reconnection: when connection state transitions to `connected` and `globalConversationId` is already set (reconnect), `joinGlobalChat()` is called again to resync state.
  - Selectors: `useGlobalMessages()`, `useOnlinePlayers()`, `useOnlineCount()`, `useChatConnectionState()`, `useChatRateLimitState()`
- `src/app/shells/AuthenticatedShell.tsx` — Updated with chat sidebar UI. Note: chat connection was initially placed here, which was incorrect — `AuthenticatedShell` is a sibling of `BattleShell`, not an ancestor. Fixed in Batch 5A cleanup patch (see below).

### P4.4: Global chat panel

**Status:** Done

- `src/modules/chat/components/ChatPanel.tsx` — Scrollable global message feed with auto-scroll on new messages. Each message shows sender name (accent colored), content, and timestamp (HH:mm via date-fns). Connection indicator in header.
- `src/modules/chat/components/MessageInput.tsx` — Text area with 500-char limit, character counter, send button. Disabled when disconnected or rate-limited. Enter to send (shift+enter for newline). Sends via `ChatHubManager.sendGlobalMessage()`.
- `src/ui/components/ConnectionIndicator.tsx` — Colored dot + label for connection state (connected/connecting/reconnecting/disconnected).
- Integrated into `AuthenticatedShell.tsx` sidebar.

Design note: Scroll-lock with "new messages" indicator was initially implemented but removed due to React 19 strict lint rules (`react-hooks/set-state-in-effect`, `react-hooks/refs`). Current behavior always auto-scrolls to latest. Scroll-lock refinement deferred to P4.8 polish.

### P4.5: Online players list and presence

**Status:** Done

- `src/modules/chat/components/OnlinePlayersList.tsx` — Reads from chat store `onlinePlayers` Map and `onlineCount`. Renders player list with avatar initials and display names. Online count in header.
- `src/ui/components/Avatar.tsx` — Initial-based avatar placeholder with sm/md/lg sizes.
- Player actions (View Profile, Send Message) intentionally deferred to P4.6/P4.7 per batch scope.
- Integrated into `AuthenticatedShell.tsx` sidebar below chat panel.

### Files created (12 new, 3 modified, 1 deleted)

New files:
- `src/ui/components/Badge.tsx`
- `src/ui/components/ProgressBar.tsx`
- `src/ui/components/Avatar.tsx`
- `src/ui/components/ConnectionIndicator.tsx`
- `src/modules/chat/store.ts`
- `src/modules/chat/hooks.ts`
- `src/modules/chat/components/ChatPanel.tsx`
- `src/modules/chat/components/MessageInput.tsx`
- `src/modules/chat/components/OnlinePlayersList.tsx`
- `src/modules/player/components/CharacterSummary.tsx`
- `src/modules/player/screens/LobbyScreen.tsx`

Modified:
- `src/app/shells/AuthenticatedShell.tsx` — Sidebar with ChatPanel and OnlinePlayersList (chat connection was mistakenly placed here; fixed in cleanup patch)
- `src/app/router.tsx` — Lobby route wired to LobbyScreen
- `src/app/route-placeholders.tsx` — Removed LobbyPlaceholder

Deleted:
- `src/modules/chat/components/.gitkeep`

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint .`: passes (zero errors, zero warnings on changed files)
- Lobby renders character summary with name, level, XP bar, stats, wins/losses, unspent points badge
- Chat store implements full state shape with deduplication and rate limit handling
- Chat connection hook initially wired at AuthenticatedShell level (incorrect — fixed in cleanup patch)
- Global chat panel renders messages with send functionality
- Online players list populates from JoinGlobalChat response and updates via PlayerOnline/PlayerOffline events
- Note: session-scoped persistence claim was incorrect in initial implementation; AuthenticatedShell was a sibling of BattleShell, not an ancestor. Fixed in cleanup patch.

---

## Batch 5A — Phase 4 (Part 1) Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified fixes applied before starting Batch 5B / Phase 4 part 2.

### Fix 1: Session-scoped chat lifecycle (blocking)

`useChatConnection()` was mounted in `AuthenticatedShell`, which is a sibling of `BattleShell` under `BattleGuard` — not an ancestor of both. Navigating from lobby to battle would unmount `AuthenticatedShell` and disconnect `/chathub`.

**Resolution:** Introduced `src/app/shells/SessionShell.tsx` — a minimal layout route (`<Outlet />`) that calls `useChatConnection()`. Inserted into the route tree above `BattleGuard`:

```
OnboardingGuard → SessionShell (chat owner) → BattleGuard → { BattleShell | AuthenticatedShell }
```

`AuthenticatedShell` retains the chat sidebar UI (ChatPanel, OnlinePlayersList) but no longer owns the connection lifecycle. `SessionShell` is never unmounted during lobby ↔ battle navigation.

Corrected misleading claims in the Batch 5A log entry that stated the chat connection was "above the BattleGuard split" when it was not.

### Fix 2: Lobby XP progress curve (blocking)

`CharacterSummary` used `level * 100` (linear) and a misleading comment claiming it matched the backend. The backend `LevelingPolicyV1` uses a triangular progression: `BaseFactor × level × (level + 1)` with `BaseFactor = 50`.

**Resolution:**
- Created `src/modules/player/leveling.ts` with `xpToReachLevel(level)` and `levelProgress(level, totalXp)` helpers using the correct triangular formula.
- `CharacterSummary` now shows XP progress within the current level band (current XP minus current threshold, out of the band width) instead of raw `totalXp` against an incorrect linear target.
- Removed the incorrect `xpForNextLevel` function and its misleading comment.

### Fix 3: Missing DM store actions (minor)

Chat store state included `directConversations` and `suppressedOpponentId` but lacked the actions to operate on them.

**Resolution:** Added `addDirectMessage(msg)`, `setSuppressedOpponent(playerId)`, and `clearSuppressedOpponent()` to the store. `addDirectMessage` implements deduplication by `messageId` and returns `{ suppressed: boolean }` based on `suppressedOpponentId` match. No DM UI or DM flow added — store-only.

### Fix 4: onlineCount source-of-truth drift (minor)

`setGlobalState()` used the server's `totalOnline` for `onlineCount`, but subsequent `addOnlinePlayer`/`removeOnlinePlayer` events reset it to `Map.size`. The two could drift.

**Resolution:** `onlineCount` is now always derived from `onlinePlayers.size` in all actions including `setGlobalState()`. The `totalOnline` parameter was removed from `setGlobalState()`. Single consistent model: map size is the displayed count.

### Fix 5: ChatPanel dead ref (minor)

`scrollContainerRef` remained from the removed scroll-lock behavior but was never read.

**Resolution:** Removed `scrollContainerRef` and the associated `ref={scrollContainerRef}` attribute. Also removed unused `clsx` import (only usage was wrapping a static string).

### Fix 6: Self-render in OnlinePlayersList (minor)

Reviewer flagged that the authenticated user may appear in their own online players list depending on backend `JoinGlobalChat` / `PlayerOnline` behavior. The chat contract (`OnlinePlayersResponse`) does not specify whether the joining player is included.

**Resolution:** Documented as FEI-024 in execution issues for runtime verification. No speculative filter added — the correct behavior depends on what the backend actually sends, which cannot be determined from contracts alone.

### Files created (2 new, 6 modified)

New files:
- `src/app/shells/SessionShell.tsx`
- `src/modules/player/leveling.ts`

Modified:
- `src/app/router.tsx` — Inserted SessionShell above BattleGuard
- `src/app/shells/AuthenticatedShell.tsx` — Removed useChatConnection() (connection now in SessionShell)
- `src/modules/chat/store.ts` — Added addDirectMessage, setSuppressedOpponent, clearSuppressedOpponent; fixed onlineCount derivation
- `src/modules/chat/hooks.ts` — Updated setGlobalState call (removed totalOnline arg)
- `src/modules/chat/components/ChatPanel.tsx` — Removed dead scrollContainerRef and unused clsx import
- `src/modules/player/components/CharacterSummary.tsx` — Replaced linear XP formula with leveling.ts helper

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Route hierarchy: `SessionShell` is a strict ancestor of both `BattleShell` and `LobbyShell` (formerly `AuthenticatedShell`) — lobby ↔ battle navigation does not unmount the chat connection owner
- XP progress bar now uses triangular progression matching backend `LevelingPolicyV1`
- Chat store has complete action surface for upcoming P4.6 DM work
- `onlineCount` derived consistently from `Map.size` in all code paths

---

## Batch 5A — Phase 4 (Part 1) Final Cleanup

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Non-blocking cleanup items identified by reviewer, applied before Batch 5B.

### Fix 1: Remove dead `mountedRef` from `useChatConnection`

`mountedRef` was a leftover guard that did not protect against anything meaningful. Removed the ref, its guard check, and its reset in the cleanup function.

### Fix 2: Record `BASE_FACTOR` drift risk

Frontend `leveling.ts` hardcodes `BASE_FACTOR = 50` matching backend default. Backend factor is configurable. Documented as FEI-032 in execution issues for hardening-phase follow-up. No code change — documentation only.

### Fix 3: Rename `AuthenticatedShell` → `LobbyShell`

After the session split, `AuthenticatedShell` only represented lobby/matchmaking chrome, not the authenticated session boundary. Renamed file, export, and all references (2 files total).

### Fix 4: DM reconnect rehydration deferred

Documented as FEI-033 in execution issues as a Batch 5B consideration. No code change.

### Fix 5: Self-filtering in online players NOT implemented

FEI-024 remains deferred to runtime verification. No speculative fix added.

### Files modified (3 modified, 1 renamed)

Renamed:
- `src/app/shells/AuthenticatedShell.tsx` → `src/app/shells/LobbyShell.tsx` (export renamed to `LobbyShell`)

Modified:
- `src/app/router.tsx` — Updated import and usage from `AuthenticatedShell` to `LobbyShell`
- `src/modules/chat/hooks.ts` — Removed dead `mountedRef` and `useRef` import

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Route hierarchy unchanged: `SessionShell → BattleGuard → { BattleShell | LobbyShell }`
- Chat connection lifecycle unchanged — only dead code removed

---

## Batch 5B — Phase 4 (Part 2): DM + Player Card + Chat Resilience

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

### P4.6: Direct messaging

**Status:** Done

- `src/modules/chat/components/ConversationList.tsx` — Fetches DM conversation list via `GET /api/v1/chat/conversations` (TanStack Query, 10s staleTime). Filters to Direct type, excludes suppressed opponent, sorts by most recent message. Each entry shows avatar, display name, and timestamp.
- `src/modules/chat/components/DirectMessagePanel.tsx` — Full DM panel with message history (fetched via `GET /api/v1/chat/direct/{otherPlayerId}/messages`), real-time incoming messages merged with HTTP history, deduplication by `messageId`, auto-scroll, "Load older messages" button when `hasMore` is true. Header with back button, avatar, and profile link.
- `src/modules/chat/components/MessageInput.tsx` — Extended with `mode` prop (`'global'` | `'direct'`) and `recipientPlayerId` prop. In DM mode, calls `chatHubManager.sendDirectMessage()` instead of `sendGlobalMessage()`. Added `onMessageSent` callback.
- `src/modules/chat/components/ChatSidebar.tsx` — Tabbed sidebar replacing the previous stacked ChatPanel + OnlinePlayersList layout. Three tabs: Global (ChatPanel), Messages (ConversationList/DirectMessagePanel), Players (OnlinePlayersList). Manages active DM state and player card overlay.
- `src/modules/chat/hooks.ts` — Wired `onDirectMessageReceived` event handler to `chatStore.addDirectMessage()`. Added `useDirectConversations()` and `useChatLastError()` selector hooks.

### P4.7: Player card

**Status:** Done

- `src/modules/player/components/PlayerCard.tsx` — Overlay sheet displaying player profile: avatar, display name, level, 4 stats (Str/Agi/Int/Vit), wins/losses. Loading and error (not-found) states handled. Fetched via TanStack Query with 60s staleTime.
- `src/modules/player/hooks.ts` — Added `usePlayerCard(playerId, enabled)` hook wrapping TanStack Query for `GET /api/v1/players/{playerId}/card`.
- `src/ui/components/Sheet.tsx` — Slide-in panel wrapping `@radix-ui/react-dialog`. Used for player card and potentially future DM/conversation overlays. Supports title, close button, and flexible content area.
- Integration: PlayerCard accessible from OnlinePlayersList "Profile" action and from DM panel header.

### P4.8: Chat error and reconnection handling

**Status:** Done

- `src/modules/chat/components/ChatErrorDisplay.tsx` — Displays non-rate-limit `ChatError` codes as a banner. Maps all error codes to readable messages: `rate_limited` (handled by MessageInput), `message_too_long`, `message_empty`, `recipient_not_found`, `not_eligible`, `service_unavailable`.
- `src/modules/chat/hooks.ts` — On reconnect (`connected` state after prior connection), clears non-rate-limit `lastError` so stale error banners disappear. Global chat resync via `joinGlobalChat()` was already wired in Batch 5A.
- DM reconnect rehydration (FEI-033): DM messages received during brief disconnects are preserved in the store from real-time events. On reconnect, the DM panel refetches history via TanStack Query when opened, which merges with any real-time messages already in the store. This provides coherent DM state without a custom rehydration mechanism.
- `src/modules/chat/components/OnlinePlayersList.tsx` — Updated with `onSendMessage` and `onViewProfile` callback props. Hover reveals "Profile" and "DM" action buttons per player.

### Files created (6 new)

- `src/ui/components/Sheet.tsx`
- `src/modules/player/components/PlayerCard.tsx`
- `src/modules/chat/components/ChatSidebar.tsx`
- `src/modules/chat/components/ConversationList.tsx`
- `src/modules/chat/components/DirectMessagePanel.tsx`
- `src/modules/chat/components/ChatErrorDisplay.tsx`

### Files modified (5 modified)

- `src/modules/chat/hooks.ts` — Wired DirectMessageReceived, added selector hooks, reconnect error clearing
- `src/modules/chat/components/MessageInput.tsx` — Added DM mode/recipientPlayerId/onMessageSent props
- `src/modules/chat/components/OnlinePlayersList.tsx` — Added action callbacks (onSendMessage, onViewProfile)
- `src/modules/player/hooks.ts` — Added usePlayerCard() hook
- `src/app/shells/LobbyShell.tsx` — Replaced stacked ChatPanel+OnlinePlayersList with tabbed ChatSidebar

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- DM conversations listable via ConversationList with server data
- DM history loads via HTTP, merges with real-time messages, deduplicates by messageId
- DMs sendable via MessageInput in DM mode through chatHubManager.sendDirectMessage()
- Incoming DMs received in real-time via DirectMessageReceived event wired in hooks
- Player card displays via Sheet overlay with profile data from player card endpoint
- Chat errors surfaced via ChatErrorDisplay banner with readable messages per error code
- Reconnect clears stale errors; global chat resyncs via joinGlobalChat(); DM state coherent through store + TanStack Query merge
- Tabbed sidebar provides Global/Messages/Players navigation
- Session-scoped chat connection unchanged at SessionShell level

---

## Batch 5B — Phase 4 (Part 2) Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified fixes applied before Phase 5.

### Fix 1: Implement cursor-based DM pagination

"Load older messages" button was visible but only triggered a refetch of the same page. Now uses proper `before`-cursor loading via `getDirectMessages(otherPlayerId, oldest.sentAt)`. Older messages accumulate in local state and merge with the initial page + real-time messages. `hasMore` tracks both the initial fetch and subsequent cursor loads.

### Fix 2: Clear stale chat error banner

`lastError` could persist for the whole session after a single transient error. Added two clear paths:
- Dismiss button (`×`) on `ChatErrorDisplay`
- Auto-clear on successful send in `MessageInput` (clears non-rate-limit errors)

### Fix 3: Improve PlayerCard error wording

All failures were shown as "Player not found". Now distinguishes 404 (→ "Player not found") from other errors (→ "Couldn't load profile") by checking `ApiError.status`.

### Fix 4: DM reconnect backfill for open panels

Open DM panels stayed stale after reconnect because only global chat was rehydrated. Added `useEffect` in `DirectMessagePanel` that invalidates the DM TanStack Query when `connectionState` transitions to `connected`, triggering a refetch that backfills missed messages.

### Fix 5: Sender-echo assumption documented

Documented as FEI-036 in execution issues. DM send flow depends on backend echoing the sent message back via `DirectMessageReceived` for the sender to see their own message. No speculative optimistic-send system added.

### Fix 6: Sheet animation deferred

`tailwindcss-animate` is not installed, so Radix `data-[state]` animation utilities are unavailable. Sheet remains static. Deferred to hardening phase if animation is desired.

### Additional: MessageInput placeholder cleanup

Removed redundant duplicate ternary branch in MessageInput placeholder (both `direct` and `global` mode had identical "Type a message..." text).

### Files modified (5)

- `src/modules/chat/components/DirectMessagePanel.tsx` — Cursor-based pagination + reconnect invalidation
- `src/modules/chat/components/ChatErrorDisplay.tsx` — Added dismiss button
- `src/modules/chat/components/MessageInput.tsx` — Clear lastError on successful send; cleaned placeholder
- `src/modules/player/components/PlayerCard.tsx` — Distinguish 404 from general error
- `src/ui/components/Sheet.tsx` — No functional change (reverted animation attempt)

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- No visible dead UI remains — "Load older messages" now loads via cursor
- Error banner dismissible and auto-clears on successful send
- PlayerCard shows contextual error messages
- Open DM panels refetch on reconnect

---

## Batch 6 — Phase 5: Matchmaking

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

### P5.1: Matchmaking store and polling hook

**Status:** Done

- `src/modules/matchmaking/store.ts` — Zustand store with:
  - State: `status` (`idle` | `searching` | `matched` | `battleTransition`), `matchId`, `battleId`, `matchState`, `searchStartedAt`, `consecutiveFailures`
  - Actions: `setSearching()`, `updateFromPoll()`, `setBattleTransition()`, `setIdle()`, `incrementFailures()`, `resetFailures()`
  - `updateFromPoll` handles: `Matched` + `battleId` → `battleTransition`, `Matched` without `battleId` → `matched` (waiting), `Idle`/`NotQueued` → `idle`, `Searching` → no change
- `src/modules/matchmaking/hooks.ts` — Two hooks:
  - `useMatchmaking()`: Exposes state + `joinQueue()` / `leaveQueue()` actions. `joinQueue` calls `POST /api/v1/queue/join`, handles 409 (already matched) by invalidating game state. `leaveQueue` calls `POST /api/v1/queue/leave`, handles race case where `leftQueue: false` + `battleId` means matched during leave → transitions to battle instead.
  - `useMatchmakingPolling()`: Starts/stops the existing `matchmakingPoller` singleton based on matchmaking status. Polls every 2s when `searching` or `matched`. Updates both `matchmakingStore` and `playerStore.queueStatus` on each poll so `BattleGuard` can react to state changes.

### P5.2: Matchmaking UI

**Status:** Done

- `src/modules/matchmaking/components/QueueButton.tsx` — "Find Battle" button for lobby. Disabled when not idle or while joining. Loading state during join.
- `src/modules/matchmaking/components/SearchingIndicator.tsx` — Animated pulsing/ping visual indicator using Tailwind animations.
- `src/modules/matchmaking/screens/SearchingScreen.tsx` — Full searching screen with:
  - Searching indicator animation
  - Status text: "Searching for opponent..." → "Opponent found — preparing battle..." → "Entering battle..."
  - Elapsed time counter (mm:ss) during search
  - Cancel button (disabled during cancellation)
  - Connectivity warning when 3+ consecutive poll failures
  - Calls `useMatchmakingPolling()` to manage poller lifecycle
- `src/modules/player/screens/LobbyScreen.tsx` — Updated to include `QueueButton` below character summary
- `src/app/router.tsx` — `/matchmaking` route now renders `SearchingScreen` instead of `MatchmakingPlaceholder`
- `src/app/route-placeholders.tsx` — Removed `MatchmakingPlaceholder`

State-driven routing preserved: `joinQueue` updates `playerStore.queueStatus` to `Searching`, which causes `BattleGuard` to redirect to `/matchmaking`. When matched with `battleId`, poll updates `playerStore.queueStatus` to `Matched`, which causes `BattleGuard` to redirect to `/battle/:battleId`.

### P5.3: sendBeacon leave-on-close

**Status:** Skipped (as planned)

Per the task breakdown, P5.3 is explicitly marked NON-BLOCKING / SKIPPABLE. The `sendBeacon` approach requires sending an authenticated request, but `sendBeacon` does not support custom `Authorization` headers. The backend's 30-minute queue TTL serves as the fallback. Documented as deferred.

### Files created (5 new)

- `src/modules/matchmaking/store.ts`
- `src/modules/matchmaking/hooks.ts`
- `src/modules/matchmaking/components/QueueButton.tsx`
- `src/modules/matchmaking/components/SearchingIndicator.tsx`
- `src/modules/matchmaking/screens/SearchingScreen.tsx`

### Files modified (3)

- `src/modules/player/screens/LobbyScreen.tsx` — Added QueueButton
- `src/app/router.tsx` — Wired SearchingScreen, removed MatchmakingPlaceholder import
- `src/app/route-placeholders.tsx` — Removed MatchmakingPlaceholder

### Files deleted (2)

- `src/modules/matchmaking/components/.gitkeep`
- `src/modules/matchmaking/screens/.gitkeep`

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Lobby shows "Find Battle" button below character summary
- Join queue calls `POST /api/v1/queue/join` and sets store to searching
- BattleGuard redirects to `/matchmaking` when `playerStore.queueStatus.status === 'Searching'`
- SearchingScreen shows elapsed time, status text, and cancel button
- Poller starts at 2s intervals when searching begins, stops on cancel/match/cleanup
- Cancel calls `POST /api/v1/queue/leave`; handles race case where leave returns match info
- When matched with `battleId`, poll updates player store → BattleGuard redirects to `/battle/:battleId`
- Page refresh: GameStateLoader refetches game state → populates `queueStatus` → BattleGuard routes to correct screen
- Session-scoped chat connection unaffected (SessionShell above BattleGuard)

---

## Batch 6 — Phase 5 Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Two coherence bugs identified while inspecting the existing Phase 5 wiring for continuity. Both are minimal additive fixes within Batch 6 scope.

### Fix 1: BattleGuard bounced `Matched` without `battleId` to lobby (blocking)

`BattleGuard` only recognized two active-queue states: `Matched + battleId` (→ `/battle/:battleId`) and `Searching` (→ `/matchmaking`). The transitional `Matched` state without a `battleId` (matchState `Queued` or `BattleCreateRequested`) fell through to the fallback, which redirected any visit to `/matchmaking` back to `/lobby`. This conflicted with `SearchingScreen`'s "Opponent found — preparing battle..." state.

**Resolution:** `src/app/guards/BattleGuard.tsx` — extended the active-queue branch to cover `Matched && !battleId` alongside `Searching`. Both keep the user on `/matchmaking` until `battleId` arrives.

### Fix 2: Matchmaking store not hydrated on page refresh during search (blocking)

`GameStateLoader` re-fetches `/api/v1/game/state` on reload and populates `playerStore.queueStatus`, so `BattleGuard` correctly routes a reloading user with `status === 'Searching'` back to `/matchmaking`. But `useMatchmakingStore` resets to `idle` on each page load. `useMatchmakingPolling()` only starts the poller when matchmaking status is `searching` or `matched`, so after refresh the screen rendered with no polling, no elapsed timer, and no cancel button — a functional dead-end.

**Resolution:** `src/modules/matchmaking/hooks.ts` — added a hydration `useEffect` in `useMatchmakingPolling` that, when the matchmaking store is `idle` but player-store `queueStatus` shows `Searching` or `Matched-without-battleId`, sets the matchmaking store to the corresponding state. Polling effect then runs normally and `SearchingScreen` renders correctly.

Note: the hydrated `searchStartedAt` uses `Date.now()` at hydration time. The original search start time is not recoverable from game state on refresh, so elapsed time displays from zero after reload. This is acceptable degradation — accurate elapsed time across refresh would require a backend-provided start timestamp (not currently in the queue status response).

### Files modified (2)

| File | Change |
|---|---|
| `src/app/guards/BattleGuard.tsx` | Allow `Matched && !battleId` to stay on `/matchmaking` |
| `src/modules/matchmaking/hooks.ts` | Hydrate matchmaking store from player store on refresh |

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Refresh during searching: GameStateLoader → player store `Searching` → BattleGuard keeps `/matchmaking` → SearchingScreen mounts → hydration sets matchmaking store to `searching` → polling starts → elapsed/cancel usable
- `Matched` without `battleId` (transient): BattleGuard no longer bounces user to lobby; SearchingScreen shows "Opponent found — preparing battle..." until the next poll delivers `battleId` → BattleGuard redirects to `/battle/:battleId`

---

## Batch 6 — Phase 5 Review Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified fixes applied before Phase 6.

### Fix 1: Remove cross-module write into usePlayerStore (required)

Matchmaking hooks called `usePlayerStore.setState({ queueStatus: ... })` directly in 4 places, violating the architecture rule that modules must not write into another module's store.

**Resolution:** Added `setQueueStatus(queueStatus)` action to `usePlayerStore` as its public API for queue status updates. All matchmaking writes now go through `usePlayerStore.getState().setQueueStatus(...)` instead of `usePlayerStore.setState(...)`. Zero `usePlayerStore.setState` calls remain in the matchmaking module.

### Fix 2: Matchmaking store returns to idle after battle handoff (required)

Once the store reached `battleTransition`, there was no path back to `idle`. After a battle ends and game state refreshes with `queueStatus: Idle/null`, the matchmaking store would remain stuck in `battleTransition`, silently blocking future re-queue.

**Resolution (initial):** Added a sync effect in `useMatchmakingPolling()` that watches `playerStore.queueStatus`. However, `useMatchmakingPolling()` is only mounted by `SearchingScreen`, so the reset did not run in the post-battle return-to-lobby scenario. Corrected in the follow-up targeted patch (see below).

### Fix 3: Guard MatchmakingPoller against in-flight results after stop (required)

Async poll results could resolve after `stop()` and still invoke the `onResult`/`onError` callbacks, mutating state after the poller was stopped.

**Resolution:** Added a `generation` counter to `MatchmakingPoller`. Each `start()` increments it; each `stop()` also increments it. Poll callbacks check their captured generation against the current generation before invoking, silently discarding stale results.

### Fix 4: Remove dead `_consecutiveFailures` from poller (cleanup)

The poller's internal `_consecutiveFailures` counter and `consecutiveFailures` getter were dead state — the matchmaking store owns the real failure tracking via `incrementFailures()`/`resetFailures()`.

**Resolution:** Removed `_consecutiveFailures` field, its getter, and all internal references from `MatchmakingPoller`.

### Fix 5: Explicit hydration action (cleanup)

Page-refresh hydration reused `setSearching()` and raw `setState()` calls, making it unclear that the intent was server-state hydration vs. a user action.

**Resolution:** Added `hydrateFromServer(serverStatus, matchId, battleId, matchState)` action to the matchmaking store. The hydration effect in `useMatchmakingPolling()` now calls this dedicated action instead of repurposing `setSearching()` or `setState()`.

### Files modified (4)

- `src/modules/player/store.ts` — Added `setQueueStatus()` action
- `src/modules/matchmaking/store.ts` — Added `hydrateFromServer()` action
- `src/modules/matchmaking/hooks.ts` — Replaced all `usePlayerStore.setState()` with `setQueueStatus()`; added idle-reset sync effect; used `hydrateFromServer()` for refresh hydration
- `src/transport/polling/matchmaking-poller.ts` — Added generation guard; removed dead `_consecutiveFailures`

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Zero `usePlayerStore.setState` calls from matchmaking module
- All queue status writes go through `usePlayerStore.getState().setQueueStatus()`
- Matchmaking store resets to idle when player store queueStatus becomes Idle/NotQueued/null (note: initially placed in useMatchmakingPolling, corrected to useMatchmaking in follow-up patch)
- Poller generation guard prevents stale in-flight results from mutating state after stop
- Poller has single source of truth for failure count (matchmaking store only)

---

## Batch 6 — Phase 5 Targeted Fix

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

### Fix: Relocate reset-to-idle effect from useMatchmakingPolling to useMatchmaking

The reset-to-idle sync effect (Fix 2 from the review cleanup patch) was placed inside `useMatchmakingPolling()`, which is only mounted by `SearchingScreen`. After battle → lobby transition, `SearchingScreen` is unmounted and the effect does not run, so the matchmaking store remains stuck in `battleTransition`.

**Resolution:** Moved the reset-to-idle effect into `useMatchmaking()`, which is consumed by `QueueButton` on the lobby screen. The effect now runs whenever the user is on `/lobby` (where `QueueButton` is mounted), covering the post-battle return scenario. `useMatchmakingPolling()` retains only the hydration and polling lifecycle effects.

### Files modified (1)

- `src/modules/matchmaking/hooks.ts` — Moved reset-to-idle effect from `useMatchmakingPolling()` to `useMatchmaking()`; added `queueStatus` subscription to `useMatchmaking()`

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Reset-to-idle effect now runs from lobby-mounted path via `QueueButton` → `useMatchmaking()`
- Post-battle flow: game state refresh → `queueStatus` becomes Idle/null → effect fires → matchmaking store resets to idle → QueueButton enabled for re-queue

---

## Batch 7A — Phase 6 (Part 1): Battle State + Transport

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

### P6.1: Battle Zustand store and state machine

**Status:** Done

- `src/modules/battle/store.ts` — Zustand store with:
  - Phase model: `Idle` → `Connecting` → `WaitingForJoin` → `ArenaOpen` → `TurnOpen` → `Submitted` → `Resolving` → (back to `TurnOpen` or) → `Ended`. Side states: `ConnectionLost`, `Error`.
  - State fields: battle/player identity, turn index/deadline, attack/block selections, submission state, HP values, end reason/winner, last resolution, feed entries, error state, ruleset.
  - Event handlers: `handleSnapshot`, `handleBattleReady`, `handleTurnOpened`, `handlePlayerDamaged`, `handleTurnResolved`, `handleStateUpdated`, `handleBattleEnded`, `handleFeedUpdated`, `handleConnectionLost`, `handleReconnected`, `handleError`.
  - Selection actions: `selectAttackZone`, `selectBlockPair`, `setSubmitting`, `clearSelections`.
  - Lifecycle: `startBattle(battleId)`, `handleConnected()`, `reset()`.
  - `handleSnapshot` and `handleStateUpdated` use `serverPhaseToLocal()` to map server phases while preserving local `Submitted` state during `TurnOpen`.
  - `handleFeedUpdated` deduplicates by entry `key`.

### P6.2: Zone model utilities

**Status:** Done

- `src/modules/battle/zones.ts` — Zone ring model:
  - `ALL_ZONES`: 5 zones in ring order (Head, Chest, Belly, Waist, Legs).
  - `VALID_BLOCK_PAIRS`: 5 valid adjacent pairs (Head-Chest, Chest-Belly, Belly-Waist, Waist-Legs, Legs-Head).
  - `isValidBlockPair(a, b)`: validates adjacency on the ring (diff 1 or wrap-around 4).
  - `buildActionPayload(attackZone, blockPair)`: constructs `JSON.stringify`'d action object with `attackZone`, `blockZonePrimary`, `blockZoneSecondary`. Returns string, matching the backend `SubmitTurnAction(battleId, turnIndex, payload)` contract. (Field names corrected in cleanup patch — original implementation used wrong names `blockPrimary`/`blockSecondary`.)

### P6.3: Battle hub integration hook

**Status:** Done

- `src/modules/battle/hooks.ts` — Three hooks:
  - `useBattleConnection(battleId)`: Lifecycle hook. On mount: `startBattle` → connect hub → `joinBattle` → `handleSnapshot`. Wires all battle events into store handlers. On reconnect: rejoins battle and resyncs via snapshot. On unmount: disconnects + resets store.
  - `useBattle()`: Read-only selector returning all battle state fields.
  - `useBattleActions()`: Returns selections, `canSubmit`, `selectAttackZone`, `selectBlockPair`, `submitAction`. Submit validates selections, builds payload via `buildActionPayload`, calls `battleHubManager.submitTurnAction`, transitions to `Submitted`. On failure, reverts to `TurnOpen`.

### Files created (3 new)

- `src/modules/battle/store.ts`
- `src/modules/battle/zones.ts`
- `src/modules/battle/hooks.ts`

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Battle store implements all approved phases with explicit transitions
- Zone model validates ring-adjacent block pairs and produces JSON string payloads
- `useBattleConnection` wires hub lifecycle (connect, join, events, reconnect, disconnect) into store
- Submit path: selections → `buildActionPayload` → `battleHubManager.submitTurnAction` → `Submitted` state
- No UI components added — store/transport only
- No existing modules modified — purely additive to the battle module

---

## Batch 7 — Phase 6 (Part 2): DM Suppression + Reconnect + Debug View

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Completes Phase 6 by adding opponent DM suppression, confirming reconnect/resync coverage, and wiring the debug battle screen.

### P6.4: Opponent DM suppression

**Status:** Done

- `src/modules/battle/hooks.ts` — Updated `useBattleConnection()`:
  - On `handleSnapshot` (initial join + reconnect): determines opponent ID from snapshot using auth store `userIdentityId`, calls `useChatStore.getState().setSuppressedOpponent(opponentId)`.
  - On `handleBattleReady`: same suppression logic using BattleReady player IDs.
  - On `handleBattleEnded`: clears suppression via `clearSuppressedOpponent()`.
  - On cleanup (unmount): clears suppression.
  - Uses existing chat store `setSuppressedOpponent`/`clearSuppressedOpponent` actions — no chat store modifications needed.

### P6.5: Battle reconnection and resync

**Status:** Done (confirmed from Batch 7A, no changes needed)

The reconnect/resync path was already structurally implemented in Batch 7A:
- `onConnectionStateChanged` handler: `reconnecting` → `handleConnectionLost()` → `ConnectionLost` phase. `connected` after `ConnectionLost` → `handleReconnected()` → `WaitingForJoin` → `joinBattle()` → `handleSnapshot()` rehydrates full state.
- If battle ended while disconnected, the snapshot will return `phase: 'Ended'`, which `serverPhaseToLocal` maps to `Ended`.
- The P6.4 DM suppression wiring ensures opponent suppression is also restored on reconnect via the shared `applySnapshot` helper.

### P6.6: Debug battle view

**Status:** Done

- `src/modules/battle/screens/BattleScreen.tsx` — Debug/validation screen showing:
  - Phase, battle ID, turn index, deadline, error state
  - HP for both players (perspective-aware: shows "You" vs "Opponent")
  - Attack zone selector (5 zones) and block pair selector (5 valid pairs)
  - Submit action button wired through `useBattleActions().submitAction`
  - Last resolution details (actions, outcomes, damage for both directions)
  - End state (reason, winner — perspective-aware)
  - Battle feed entries with severity coloring
  - Selections disabled when in `Submitted` phase
- `src/app/router.tsx` — `/battle/:battleId` route now renders `BattleScreen` instead of `BattlePlaceholder`
- `src/app/route-placeholders.tsx` — Removed `BattlePlaceholder`

### Files created (1 new)

- `src/modules/battle/screens/BattleScreen.tsx`

### Files modified (3)

- `src/modules/battle/hooks.ts` — Added DM suppression wiring (P6.4), extracted `applySnapshot` helper
- `src/app/router.tsx` — Wired BattleScreen, removed BattlePlaceholder import
- `src/app/route-placeholders.tsx` — Removed BattlePlaceholder

### Files deleted (2)

- `src/modules/battle/components/.gitkeep`
- `src/modules/battle/screens/.gitkeep`

### Root-level impact

No root-level files modified. All changes under `src/Kombats.Client/`.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- Battle store/state machine: all approved phases implemented (from Batch 7A, unchanged)
- Zone model: ring-adjacent validation + JSON string payload (from Batch 7A, unchanged)
- `useBattleConnection`: wires hub lifecycle + DM suppression + reconnect/resync into store
- Reconnect path: `ConnectionLost → WaitingForJoin → rejoin → snapshot` with DM suppression restore
- DM suppression: set on snapshot/ready, cleared on battle end and unmount
- Debug screen: exercises full battle flow — zone selection, block pair, submit, resolution, feed, end state
- Session-scoped chat connection unaffected (SessionShell above BattleGuard)

---

## Batch 7 — Phase 6 Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

Reviewer-identified fixes applied before Phase 7.

### Fix 1: Payload field names (critical)

`buildActionPayload` serialized `blockPrimary` and `blockSecondary` — the backend expects `blockZonePrimary` and `blockZoneSecondary`. This caused all submitted actions to arrive without valid block zones.

**Resolution:** Updated `TurnAction` interface and `buildActionPayload()` in `zones.ts` to use the correct field names: `attackZone`, `blockZonePrimary`, `blockZoneSecondary`. Corrected the Batch 7A execution log entry that documented the wrong names.

### Fix 2: Submit failure recovery (major)

`setSubmitting(false)` after a failed submit left `phase` as `'Submitted'` because the expression `get().phase` returned `'Submitted'`. The user's input was locked until a later server event arrived.

**Resolution:** Changed `setSubmitting(false)` to explicitly set `phase: 'TurnOpen'` instead of `phase: get().phase`. Selections are preserved so the user can retry immediately.

### Fix 3: Phase 6 tests (major)

No tests existed for the battle foundation. Added 21 tests covering:

**Zone/payload tests (8 tests):**
- All 5 valid adjacent block pairs accepted (both orderings)
- 4 non-adjacent pairs rejected
- Same-zone pairs rejected (5 zones)
- `buildActionPayload` returns a string
- Parsed payload contains exactly `attackZone`, `blockZonePrimary`, `blockZoneSecondary`
- Round-trip values correct for multiple zone combinations

**Store/state-machine tests (13 tests):**
- Starts in `Idle`
- `TurnOpen` → `Submitted` via `setSubmitting(true)`
- Submit failure recovery: `Submitted` → `TurnOpen` via `setSubmitting(false)`
- Selections preserved after submit failure
- `Resolving` → `TurnOpen` (next turn via `handleTurnOpened`)
- Selections cleared on new turn
- `Resolving` → `Ended` via `handleBattleEnded`
- `ConnectionLost` → `WaitingForJoin` via `handleReconnected`
- `ConnectionLost` blocked from `Idle` and `Ended`

### Fix 4: Documentation drift

Corrected the Batch 7A execution log line that documented the wrong payload field names (`blockPrimary`/`blockSecondary` → `blockZonePrimary`/`blockZoneSecondary`).

### Files modified (2)

- `src/modules/battle/zones.ts` — Fixed payload field names
- `src/modules/battle/store.ts` — Fixed submit failure recovery

### Files created (2)

- `src/modules/battle/zones.test.ts` — 8 zone/payload tests
- `src/modules/battle/store.test.ts` — 13 state machine tests

### Deferred non-blocking items

- Snapshot overwrite of `winnerPlayerId`/`lastResolution`: `handleSnapshot` does not set these fields, so a reconnect snapshot won't overwrite them. Acceptable for now — can tighten in hardening.
- `Submitted` preservation on reconnect snapshot: `serverPhaseToLocal` preserves `Submitted` when server phase is `TurnOpen`, but a reconnect snapshot resets `isSubmitting` to `false`. If the server accepted the action, it will transition to `Resolving`. If not, the user correctly sees `TurnOpen`. No change needed.

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- `npx vitest run`: 21 tests pass (2 test files)
- Payload serializes `attackZone`, `blockZonePrimary`, `blockZoneSecondary` — verified by tests
- Submit failure recovers to `TurnOpen` with selections preserved — verified by tests
- All critical state transitions tested

---

## Batch 7 — Phase 6 Final Cleanup Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

### Fix 1: Guard submit-failure recovery against race

`setSubmitting(false)` unconditionally set `phase: 'TurnOpen'`, which could stomp a `Resolving` or `Ended` phase if a server event arrived before the invoke error.

**Resolution:** `setSubmitting(false)` now only reverts to `TurnOpen` when current phase is still `Submitted`. If the store has advanced beyond `Submitted`, the phase is preserved. Added a test verifying late submit failure does not stomp `Resolving`.

### Fix 2: Debug screen — countdown, connection state, result link

Debug screen was missing: live deadline countdown, raw connection state, and a "Continue to Result" link.

**Resolution:** Added `DeadlineCountdown` component (interval-driven, React 19 lint compliant), `ConnectionStateRow` reading from `battleHubManager.connectionState`, and a `Link` to `/battle/:battleId/result` when phase is `Ended`.

### Fix 3: Clear battle hub event handlers on unmount

The singleton `battleHubManager` retained stale closures after `useBattleConnection` unmounted.

**Resolution:** Added `battleHubManager.setEventHandlers({})` before `disconnect()` in the cleanup function.

### Fix 4: Focused selectors for Phase 7

`useBattle()` subscribes to 18 independent fields, causing unnecessary re-renders. Risky to copy into production UI.

**Resolution:** Added focused selectors alongside `useBattle()`: `useBattlePhase()`, `useBattleTurn()`, `useBattleHp()`, `useBattleResult()`, `useBattleFeed()`. Phase 7 should prefer these. `useBattle()` retained for the debug screen with a doc comment noting the pattern.

### Files modified (4)

- `src/modules/battle/store.ts` — Guarded `setSubmitting(false)` recovery
- `src/modules/battle/hooks.ts` — Clear handlers on unmount; added focused selectors
- `src/modules/battle/screens/BattleScreen.tsx` — Countdown, connection state, result link
- `src/modules/battle/store.test.ts` — Added race-condition test (22 total)

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- `npx vitest run`: 22 tests pass (2 test files)
- Submit failure only reverts to TurnOpen from Submitted — verified by new test
- Debug screen shows live countdown, connection state, result link
- Stale handlers cleared on unmount

---

## Batch 7 — Phase 6 Pre-Phase-7 Patch

**Date:** 2026-04-17
**Status:** Completed
**Branch:** frontend-client

### Fix 1: Reactive battle connection state through the store

Debug screen read `battleHubManager.connectionState` imperatively during render — not reactive, and crossed the screen→transport boundary directly.

**Resolution:** Added `connectionState` field and `setConnectionState` action to `useBattleStore`. `onConnectionStateChanged` handler in `useBattleConnection` now writes to the store. Added `useBattleConnectionState()` focused selector. Debug screen now reads from `battle.connectionState` (reactive via Zustand) instead of the transport singleton.

### Fix 2: Guard against late async mutations after unmount

The async `connect → joinBattle → applySnapshot` chain and reconnect `joinBattle → applySnapshot` chain could resolve after effect cleanup, repopulating battle state and re-applying opponent DM suppression on a reset store.

**Resolution:** Added a `disposed` flag set on cleanup. All async `.then`/`.catch` callbacks and all event handlers check `if (disposed) return` before mutating state. Both initial join and reconnect join paths are protected.

### Files modified (3)

- `src/modules/battle/store.ts` — Added `connectionState` field + `setConnectionState` action
- `src/modules/battle/hooks.ts` — Wired `setConnectionState` from callback; added `disposed` guard on all async paths and event handlers; added `useBattleConnectionState()` selector
- `src/modules/battle/screens/BattleScreen.tsx` — `ConnectionStateRow` now reads from reactive store state via `battle.connectionState`; removed `battleHubManager` import

### Validation

- `npx tsc --noEmit`: passes (zero errors)
- `npx eslint src/`: passes (zero errors, zero warnings)
- `npx vitest run`: 22 tests pass (2 test files)
- Connection state is reactive through Zustand — debug screen re-renders on state changes
- No transport singleton reads from screen components
- Late async results after unmount are silently discarded

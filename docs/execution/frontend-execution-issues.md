# Frontend Execution Issues

---

## Batch 8 — Phase 7: Battle UI Cleanup Patch

### Resolved

#### FEI-065: SystemError battle-end wording drifted from plan and could mislead
**Severity:** Low
**Status:** Resolved in Phase 7 cleanup patch

`BattleEndOverlay` SystemError subtitle read "The battle ended due to a system error." and paired with a "Continue to Result" button. The plan's wording ("Battle ended due to a system error. Returning to lobby.") contradicts the Phase 7 handoff (which goes to `/battle/:battleId/result`, not the lobby).

**Resolution:** Subtitle now reads exactly "Battle ended due to a system error." — the plan's core phrase minus the "Returning to lobby" promise that Phase 7 does not fulfill. The actual lobby-recovery flow for SystemError is a Phase 8 result-screen responsibility and will be implemented there. Behavior is unit-tested to guarantee the subtitle does not contain the word "lobby".

#### FEI-066: Three UI surfaces showed "Submitted" at once
**Severity:** Low
**Status:** Resolved in Phase 7 cleanup patch

HUD phase label, TurnTimer text, and ZoneSelector badge all announced submission simultaneously, creating redundant visual noise.

**Resolution:** Canonical "Action submitted" signal is the ZoneSelector badge (adjacent to the action). HUD phase label changed to "Waiting for opponent" for the `Submitted` phase; TurnTimer no longer emits a "Submitted" string (falls through to the neutral em-dash for non-`TurnOpen`/non-`Resolving` phases).

#### FEI-067: Pre-snapshot HP bars rendered as red/empty
**Severity:** Low
**Status:** Resolved in Phase 7 cleanup patch

While the battle snapshot had not yet arrived, `HpPanel` computed `hp ?? 0` over `maxHp ?? 0`, producing a red zero-HP bar with "? / ?" numbers — misleading because the player is not actually at low HP.

**Resolution:** `HpPanel` now computes a `ready` flag (both hp and maxHp non-null, maxHp > 0). Until ready, it renders a full-width neutral-surface bar (`bg-bg-surface`) with "— / —". Once ready, the existing HP color thresholds take over. No extra state introduced.

#### FEI-068: NarrationFeed auto-scroll keyed only on `entries.length`
**Severity:** Low
**Status:** Resolved in Phase 7 cleanup patch

Auto-scroll effect depended on array length; robust today but fragile against future feed updates that replace the tail entry without changing length.

**Resolution:** Derived `tailSignal = "${tail.key}:${tail.sequence}"` from the last entry and keyed the effect on that string. Length-change and tail-replacement both trigger scroll; no-op updates (same tail) correctly do not.

#### FEI-069: Missing tests for deriveOutcome and TurnTimer logic
**Severity:** Low
**Status:** Resolved in Phase 7 cleanup patch

Reviewer flagged two pure-logic pieces worth testing. They were embedded in components, which blocked clean unit testing without JSDOM.

**Resolution:** Extracted `deriveOutcome` to `battle-end-outcome.ts` and extracted the TurnTimer view decision to `computeTurnTimerView(phase, deadlineUtc, now)` in `turn-timer-view.ts`. Added `battle-end-outcome.test.ts` (9 tests) and `turn-timer-view.test.ts` (8 tests including `.each` expansion). Total vitest count: 22 → 48. No new testing framework introduced; uses existing Vitest setup.

### Open

No open frontend-specific issues remain for the Phase 7 cleanup patch. The codebase is clean to proceed into Phase 8.

### Deferred

No new deferrals from this patch. FEI-055 and FEI-056 remain deferred to hardening as before.

---

## Batch 8 — Phase 7: Battle UI

### Open

No open frontend-specific issues from Phase 7. tsc, eslint, vitest, and vite build all pass. No regressions in the Phase 6 battle foundation (store/zones tests: 22/22 pass).

### Deviations

#### FEI-DEV-063: Skipped `ui/components/Dialog.tsx` — used Radix Dialog directly in the overlay
**Severity:** Informational
**Status:** Accepted for Phase 7

The task breakdown lists `src/ui/components/Dialog.tsx` as an output of P7.6. The only consumer in Phase 7 is `BattleEndOverlay`, and the existing `ui/Sheet.tsx` already wraps Radix Dialog for the chat panel. Introducing a second single-use Radix-Dialog wrapper would be a premature abstraction. `BattleEndOverlay` composes Radix `Dialog.Root`/`Overlay`/`Content` directly with token-driven styling. If a future phase needs a reusable modal primitive, extract one from the overlay at that time.

#### FEI-DEV-064: Framer Motion animations not added in Phase 7
**Severity:** Informational
**Status:** Accepted for Phase 7

The plan mentions "brief animation on appearance (slide in or fade)" for the turn result panel and entrance animations for the battle end overlay. Batch 8 scope explicitly says "No need for overbuilt animation/polish yet" for narration, and the hard constraints say "No unrelated refactors … no broader polish". The existing `motion` package is installed; animations can be layered in a follow-up polish batch without touching component structure. Current panels use CSS `transition-colors` via Tailwind and rely on the `ProgressBar`'s built-in `transition-all` for HP bar changes.

### Deferred

No new deferred items. FEI-055 and FEI-056 remain deferred to hardening.

---

## Batch 1 — Phase 0

### Resolved

#### FEI-001: CSS @import order warning from Google Fonts
**Severity:** Low
**Status:** Resolved in cleanup patch

Google Fonts were loaded via CSS `@import url(...)` in `fonts.css`, which was imported after `@import 'tailwindcss'` in `index.css`. This triggered `@import must precede all other statements` warnings because Tailwind's generated output contains non-import statements.

**Resolution:** Moved font loading to `<link>` tags in `index.html`. `fonts.css` retained as an empty architecture slot.

#### FEI-002: eslint-config-prettier installed but not wired
**Severity:** Low
**Status:** Resolved in cleanup patch

`eslint-config-prettier` was in `devDependencies` but not referenced in `eslint.config.js`. Formatting rules from `@eslint/js` and `typescript-eslint` were not being suppressed.

**Resolution:** Added `prettier` (the flat config export of `eslint-config-prettier`) as the last entry in `extends`.

#### FEI-003: No .env.production file
**Severity:** Low
**Status:** Resolved in cleanup patch

Only `.env.development` existed. Production builds would fall back to Vite defaults (empty strings) for `VITE_*` vars, which would fail silently at runtime.

**Resolution:** Created `.env.production` with placeholder values for deployment-time substitution. Added `.env*.local` to `.gitignore`.

#### FEI-004: App.tsx in src/ root instead of src/app/
**Severity:** Info
**Status:** Resolved in cleanup patch

The architecture spec places the root `App` component under `src/app/`. The scaffold had it at `src/App.tsx`.

**Resolution:** Moved to `src/app/App.tsx`, updated import in `main.tsx`.

### Open

No open frontend-specific issues from Batch 1 / Phase 0.

### Deferred

No deferred items from Batch 1 / Phase 0. All reviewer findings were addressed in the cleanup patch.

---

## Batch 2 — Phase 1

### Resolved

#### FEI-005: react-refresh/only-export-components lint error on AuthProvider.tsx
**Severity:** Low
**Status:** Resolved during implementation

Initially `userManager` (a non-component export) was defined and re-exported from `AuthProvider.tsx`. The `react-refresh` ESLint plugin requires that files exporting React components only export components, to ensure fast refresh works correctly.

**Resolution:** Extracted `userManager` into a separate file `src/modules/auth/user-manager.ts`. `AuthProvider.tsx` now only exports the `AuthProvider` component.

### Open

No open frontend-specific issues from Batch 2 / Phase 1.

### Deferred

#### FEI-006: Auth integration not testable without running infrastructure
**Severity:** Info
**Status:** Deferred to Phase 1 integration testing

The auth module (login/register/callback/token renewal) cannot be validated end-to-end without Keycloak and BFF running. The code compiles and follows the approved configuration from `05-keycloak-web-client-integration.md` Section 11, but functional verification requires `docker-compose up` + BFF running. This is expected per the planning docs (Phase 1 validation requires real Keycloak).

**Mitigation:** Code structure, OIDC configuration, and token flow are correct per the spec. Integration testing is the next step before Phase 2.

---

## Batch 2 — Phase 1 Cleanup Patch

### Resolved

#### FEI-007: Transport layer imported from modules/ (architecture boundary violation)
**Severity:** High
**Status:** Resolved in cleanup patch

`transport/http/client.ts`, `transport/signalr/battle-hub.ts`, and `transport/signalr/chat-hub.ts` all imported `@/modules/auth/store` directly. Per the architecture rules in `.claude/rules/architecture-boundaries.md`, `transport/` must not import from `modules/`.

**Resolution:** HTTP client now accepts `getAccessToken` and `onAuthFailure` via `configureHttpClient()`. SignalR managers accept `accessTokenFactory` as a constructor argument. Wiring is done in `src/app/transport-init.ts` (the `app/` layer), which is the correct place for cross-cutting dependency assembly. Token access remains dynamic at call-time.

#### FEI-008: OnboardResponse duplicated CharacterResponse
**Severity:** Low
**Status:** Resolved in cleanup patch

`OnboardResponse` was a separate interface with identical fields to `CharacterResponse`.

**Resolution:** Replaced with `export type OnboardResponse = CharacterResponse;`.

#### FEI-009: Content-Type header set unconditionally on all HTTP requests
**Severity:** Low
**Status:** Resolved in cleanup patch

`Content-Type: application/json` was set even on GET and DELETE requests that have no body. While typically harmless, this is incorrect per HTTP semantics and can cause issues with some proxies/servers.

**Resolution:** `Content-Type` header now only set when `init.body` is present.

#### FEI-010: No trailing slash guard on BFF base URL
**Severity:** Low
**Status:** Resolved in cleanup patch

If `VITE_BFF_BASE_URL` ended with `/`, URL construction produced double slashes (e.g., `http://localhost:5200//api/v1/...`).

**Resolution:** `config.ts` now strips trailing slashes from `bff.baseUrl` at read time.

### Open

No open frontend-specific issues from the Batch 2 cleanup patch.

### Deferred

No new deferred items from the cleanup patch.

---

## Batch 3 — Phase 2

### Resolved

#### FEI-011: react-refresh flag on router.tsx with inline placeholder components
**Severity:** Low
**Status:** Resolved during implementation

Inline placeholder components defined alongside the `router` export in `router.tsx` triggered the `react-refresh/only-export-components` ESLint rule (same pattern as FEI-005).

**Resolution:** Extracted placeholder components into `src/app/route-placeholders.tsx`. These are temporary and will be replaced by real screen components in Phases 3–8.

### Open

No open frontend-specific issues from Batch 3 / Phase 2.

### Deferred

#### FEI-012: Full routing validation requires running infrastructure
**Severity:** Info
**Status:** Deferred to integration testing

The guard hierarchy, game state loading, and redirect logic compile and follow the approved architecture, but end-to-end routing validation (unauthenticated → login → game state fetch → correct screen) requires Keycloak + BFF running. This is the same constraint as FEI-006 and is expected per the planning docs.

**Mitigation:** Guard logic is straightforward (read store → redirect or render). The route tree structure matches `04` Section 4.2 exactly. Integration testing is the next step.

---

## Batch 3 — Phase 2 Cleanup Patch

### Resolved

#### FEI-013: AuthCallback redirected to `/` after successful login
**Severity:** High (blocking)
**Status:** Resolved in cleanup patch

After successful OIDC callback, `AuthCallback` redirected to `/`, which rendered `UnauthenticatedShell` — the authenticated startup pipeline was never entered.

**Resolution:** Success redirect changed to `/lobby`. The existing guard chain (`AuthGuard` → `GameStateLoader` → `OnboardingGuard` → `BattleGuard`) determines the correct final destination from there.

#### FEI-014: OnboardingGuard too permissive when character is null
**Severity:** Low
**Status:** Resolved in cleanup patch

When `character` was null, any `/onboarding/*` route was allowed, including `/onboarding/stats` which is only valid for `Named` state.

**Resolution:** Null-character branch now only permits `/onboarding/name`; all other paths redirect to `/onboarding/name`.

#### FEI-015: GameStateLoader error screen had no retry path
**Severity:** Low
**Status:** Resolved in cleanup patch

If `GET /api/v1/game/state` failed after all retries, the user hit a dead-end error screen with no recovery action short of a manual browser refresh.

**Resolution:** Added a "Retry" button that calls `refetch()` from the TanStack Query result.

#### FEI-016: useGameState had unexplained local retry override
**Severity:** Info
**Status:** Resolved in cleanup patch

`useGameState` set `retry: 2` overriding the QueryClient default of `3` with no comment or justification.

**Resolution:** Removed the local override. Startup game state fetch now uses the global default (3 retries with exponential backoff).

### Open

No open frontend-specific issues from the Batch 3 cleanup patch.

### Deferred

No new deferred items from the Batch 3 cleanup patch.

---

## Batch 4 — Phase 3

### Resolved

#### FEI-017: react-refresh flag on NameInput.tsx with validateName export
**Severity:** Low
**Status:** Resolved during implementation

`validateName` function exported alongside the `NameInput` component triggered the `react-refresh/only-export-components` rule (same pattern as FEI-005, FEI-011). Moved validation logic into `NameSelectionScreen.tsx` as a file-local function. `NameInput.tsx` now only exports the component and its constants (`NAME_MIN`, `NAME_MAX`).

### Open

No open frontend-specific issues from Batch 4 / Phase 3.

### Deferred

No new deferred items from Batch 4 / Phase 3.

---

## Batch 4 — Phase 3 Cleanup Patch

### Resolved

#### FEI-018: Auto-onboard failure left user at dead-end
**Severity:** High (blocking)
**Status:** Resolved in cleanup patch

If `POST /api/v1/game/onboard` failed, `attemptedRef` blocked further attempts and `GameStateLoader` had no error handling for the onboard mutation. The user fell through to onboarding routes with no character and no recovery path.

**Resolution:** `useAutoOnboard` now exposes a `retry()` function that resets mutation state and clears the attempt guard. `GameStateLoader` checks `onboard.isError` and renders an error screen with a "Retry" button.

#### FEI-019: useAutoOnboard had unstable effect dependency
**Severity:** Low
**Status:** Resolved in cleanup patch

The `useEffect` depended on the entire `mutation` object, which is a new reference on every render. The `attemptedRef` guard prevented actual duplicate calls, but the effect ran unnecessarily on every render.

**Resolution:** Destructured stable values (`mutate`, `isPending`) from `useMutation`. Effect depends only on `[isLoaded, isCharacterCreated, isPending, mutate]`.

#### FEI-020: ApiError.details consumed without runtime type check
**Severity:** Low
**Status:** Resolved in cleanup patch

`NameSelectionScreen` called `Object.values(details).flat()` on `Record<string, unknown>`, assuming all values were `string[]`. If the server returned a non-array value, this would produce incorrect output silently.

**Resolution:** Added explicit `Array.isArray` and `typeof === 'string'` guards before collecting field error messages. The shared `ApiError.details` type remains `Record<string, unknown>` (correct for all error shapes).

### Open

No open frontend-specific issues from the Batch 4 cleanup patch.

### Deferred

No new deferred items from the Batch 4 cleanup patch.

---

## Batch 5A — Phase 4 (Part 1)

### Resolved

#### FEI-021: React 19 strict lint rules blocked scroll-lock pattern in ChatPanel
**Severity:** Low
**Status:** Resolved during implementation

The initial ChatPanel implementation used refs during render and setState in effects for a scroll-lock + "new messages" indicator pattern. React 19's strict `react-hooks/set-state-in-effect` and `react-hooks/refs` lint rules blocked this approach.

**Resolution:** Simplified to always auto-scroll on new messages. Scroll-lock with "new messages" indicator deferred to P4.8 polish phase, where it can be implemented using an event-driven approach (onScroll handler + external state) that complies with the strict rules.

### Open

No open frontend-specific issues from Batch 5A / Phase 4 Part 1.

### Deferred

#### FEI-022: Chat scroll-lock and "new messages" indicator
**Severity:** Low
**Status:** Deferred to P4.8

The ChatPanel currently always auto-scrolls to the latest message. When the user scrolls up to read history, new messages will force the view back to the bottom. A proper scroll-lock pattern (detect user scroll position, suppress auto-scroll, show "new messages" button) should be implemented in the P4.8 error/reconnection/polish task.

#### FEI-023: Online player actions (View Profile, Send Message) are placeholders
**Severity:** Info
**Status:** Deferred to P4.6/P4.7 per batch scope

OnlinePlayersList renders player names but clicking them does not trigger any action. "View Profile" requires P4.7 (player card) and "Send Message" requires P4.6 (direct messaging). This is intentional scope deferral per the Batch 5A boundary.

---

## Batch 5A — Phase 4 (Part 1) Cleanup Patch

### Resolved

#### FEI-025: Chat connection owner was sibling of BattleShell, not ancestor (blocking)
**Severity:** High (blocking)
**Status:** Resolved in cleanup patch

`useChatConnection()` was placed in `AuthenticatedShell`, which sits under `BattleGuard` as a sibling of `BattleShell`. Navigating to a battle route would unmount `AuthenticatedShell` and disconnect the chat hub, violating the session-scoped design.

**Resolution:** Introduced `SessionShell` above `BattleGuard` in the route tree. `SessionShell` owns the chat connection lifecycle. `AuthenticatedShell` retains the chat sidebar UI only. Route hierarchy is now: `OnboardingGuard → SessionShell → BattleGuard → { BattleShell | AuthenticatedShell }`.

#### FEI-026: Lobby XP progress bar used wrong formula (blocking)
**Severity:** High (blocking)
**Status:** Resolved in cleanup patch

`CharacterSummary` computed XP with `level * 100` (linear) and a misleading comment claiming it matched the backend. The backend `LevelingPolicyV1` uses `BaseFactor × level × (level + 1)` (triangular, factor 50).

**Resolution:** Extracted correct formula into `src/modules/player/leveling.ts`. `CharacterSummary` now displays progress within the current level band using the triangular curve.

#### FEI-027: Chat store missing DM actions despite having DM state shape
**Severity:** Low
**Status:** Resolved in cleanup patch

Store had `directConversations` Map and `suppressedOpponentId` field but no actions to manipulate them, leaving incomplete surface for P4.6.

**Resolution:** Added `addDirectMessage()` (with dedup + suppression flag), `setSuppressedOpponent()`, `clearSuppressedOpponent()`.

#### FEI-028: onlineCount mixed server total with local Map.size
**Severity:** Low
**Status:** Resolved in cleanup patch

`setGlobalState()` used the server's `totalOnline` for `onlineCount`, but `addOnlinePlayer`/`removeOnlinePlayer` overwrote it with `Map.size`. The two sources could drift over time.

**Resolution:** `onlineCount` is now always `onlinePlayers.size`. The `totalOnline` parameter was removed from `setGlobalState()`.

#### FEI-029: ChatPanel had dead scrollContainerRef from removed scroll-lock
**Severity:** Info
**Status:** Resolved in cleanup patch

`scrollContainerRef` and its `ref={}` attribute remained after the scroll-lock pattern was removed. Also had an unnecessary `clsx()` wrapping a static string.

**Resolution:** Removed dead ref, ref attribute, and unused `clsx` import.

### Open

No open frontend-specific issues from the Batch 5A cleanup patch.

### Deferred

#### FEI-024: Self may appear in own online players list
**Severity:** Low
**Status:** Deferred to runtime verification

The authenticated user may appear in their own `OnlinePlayersList` if the backend includes them in the `JoinGlobalChat` `onlinePlayers` response or sends a `PlayerOnline` event for their own session. The chat contract does not specify this behavior. No speculative filter has been added — the correct fix depends on observing actual backend behavior at runtime. If self-inclusion is confirmed, filter by comparing `player.playerId` against `useAuthStore.getState().userIdentityId` in the component or store.

---

## Batch 5A — Phase 4 (Part 1) Final Cleanup

### Resolved

#### FEI-030: Dead `mountedRef` in `useChatConnection`
**Severity:** Low
**Status:** Resolved in cleanup

`mountedRef` in `useChatConnection()` was a leftover guard that did not meaningfully protect against anything in the current lifecycle. The effect's cleanup function already handles disconnect, and the connection manager itself is idempotent on `connect()`. The ref created confusion about StrictMode double-mount behavior without actually addressing it.

**Resolution:** Removed `mountedRef` and its associated guard/reset. The effect now runs its setup/cleanup normally via React's lifecycle.

#### FEI-031: `AuthenticatedShell` naming mismatch after session split
**Severity:** Info
**Status:** Resolved in cleanup

After introducing `SessionShell` for chat connection ownership, `AuthenticatedShell` no longer represented the authenticated session boundary — it was specifically the lobby/matchmaking chrome (header, sidebar, chat UI). The name was misleading.

**Resolution:** Renamed `AuthenticatedShell` → `LobbyShell` (file + export + all references). Only 2 files affected (shell file + router).

### Open

No open frontend-specific issues from the Batch 5A final cleanup.

### Deferred

#### FEI-032: Frontend `BASE_FACTOR` can drift from backend configuration
**Severity:** Low
**Status:** Deferred — track as hardening-phase follow-up

`src/modules/player/leveling.ts` hardcodes `BASE_FACTOR = 50` to match the current backend `LevelingPolicyV1` default. The backend factor is configurable via `LevelingOptions.BaseFactor`. If the backend value changes, the frontend XP progress bar will silently show incorrect progress. No fix in this patch — the correct solution is either exposing the factor via a BFF endpoint or including level thresholds in the game state response. This should be tracked as a hardening-phase item (Phase 9) or addressed when the BFF contract is next revised.

#### FEI-033: DM reconnect rehydration not yet designed
**Severity:** Info
**Status:** Resolved in Batch 5B

When the chat hub reconnects, `joinGlobalChat()` resyncs global messages and online players, but DM conversations are not rehydrated. If DM messages arrived during a brief disconnect, they may be lost from the client view.

**Resolution:** DM messages received via real-time events are preserved in the Zustand store. When the DM panel is opened (or re-opened), TanStack Query refetches the HTTP history, and the `DirectMessagePanel` merges both sources with deduplication. This provides coherent DM state without a custom rehydration mechanism. Messages that arrive during a brief disconnect and are missed by the SignalR client will appear on the next HTTP fetch when the user opens the conversation.

---

## Batch 5B — Phase 4 (Part 2)

### Resolved

No blocking issues encountered during Batch 5B implementation.

### Open

No open frontend-specific issues from Batch 5B / Phase 4 Part 2.

### Deferred

#### FEI-034: DM cursor-based pagination not implemented
**Severity:** Low
**Status:** Resolved in Batch 5B cleanup patch

The DirectMessagePanel "Load older messages" button initially triggered a TanStack Query refetch rather than proper cursor-based pagination.

**Resolution:** Implemented proper `before`-cursor loading using the existing `getDirectMessages(otherPlayerId, before)` endpoint. Older messages accumulate in local state and merge with the initial page + real-time messages with deduplication.

#### FEI-035: Toast notifications for incoming DMs not implemented
**Severity:** Low
**Status:** Deferred to Phase 9 hardening

The task breakdown (P4.6) mentions toast notifications for incoming DMs via `sonner`. This was not implemented in Batch 5B to keep scope focused. The `addDirectMessage` action already returns `{ suppressed }` to support this — a toast can be added in hardening by checking the return value in the `onDirectMessageReceived` handler and firing `toast()` if `!suppressed`.

---

## Batch 5B — Phase 4 (Part 2) Cleanup Patch

### Resolved

#### FEI-037: "Load older messages" was dead UI
**Severity:** Low
**Status:** Resolved in cleanup patch

The button was visible but only refetched the same page. Now uses proper cursor-based loading via the `before` parameter.

#### FEI-038: Chat error banner persisted for entire session
**Severity:** Low
**Status:** Resolved in cleanup patch

`lastError` could persist indefinitely after a single transient error. Added dismiss button and auto-clear on successful send.

#### FEI-039: PlayerCard showed "Player not found" for all failures
**Severity:** Info
**Status:** Resolved in cleanup patch

Now distinguishes 404 ("Player not found") from general load failures ("Couldn't load profile").

#### FEI-040: Open DM panels stale after reconnect
**Severity:** Low
**Status:** Resolved in cleanup patch

Open DM panels were not refreshed when the chat connection reconnected. Added TanStack Query invalidation on `connectionState` transition to `connected`.

### Open

No open frontend-specific issues from the Batch 5B cleanup patch.

### Deferred

#### FEI-036: DM sender-echo behavior unconfirmed at runtime
**Severity:** Low
**Status:** Deferred to runtime verification

The DM send flow depends on the backend echoing the sent message back to the sender via a `DirectMessageReceived` event. If the backend does NOT echo, the sender will not see their own message until the DM panel is refetched or the conversation is reopened. This cannot be confirmed from contracts alone — requires runtime testing with the real Chat service. If echo is absent, an optimistic insert (using the `SendDirectMessageResponse` fields) can be added to `MessageInput`'s send handler.

#### FEI-041: Sheet slide-in animation not implemented
**Severity:** Info
**Status:** Deferred to Phase 9 hardening

`tailwindcss-animate` is not installed, so Radix `data-[state]` animation utilities are unavailable. The Sheet component opens/closes without transition. Animation can be added in hardening by installing the package or adding custom keyframes.

---

## Batch 6 — Phase 5

### Resolved

No blocking issues encountered during Batch 6 implementation.

### Open

No open frontend-specific issues from Batch 6 / Phase 5.

### Deferred

#### FEI-042: sendBeacon queue leave on browser close not implemented
**Severity:** Low
**Status:** Deferred (explicitly skipped per plan)

P5.3 is marked NON-BLOCKING / SKIPPABLE in the task breakdown. `navigator.sendBeacon()` does not support custom `Authorization` headers, making authenticated leave-on-close impractical without a backend-side change (e.g., cookie-based auth or an unauthenticated leave endpoint). The backend's 30-minute queue TTL is the fallback for orphaned queue entries.

#### FEI-043: Matchmaking store and player store dual-update pattern
**Severity:** Info
**Status:** Deferred to hardening

The matchmaking hooks update both `useMatchmakingStore` (for UI state like `searchStartedAt`, `consecutiveFailures`) and `usePlayerStore.queueStatus` (for BattleGuard routing). This dual-update is necessary because BattleGuard reads from the player store, not the matchmaking store. If the two stores drift, the guard could disagree with the UI. The current implementation keeps them in sync at all mutation points, but a future hardening pass could consolidate or verify consistency.

---

## Batch 6 — Phase 5 Cleanup Patch

### Resolved

#### FEI-044: BattleGuard bounced `Matched` without `battleId` to lobby
**Severity:** High (blocking)
**Status:** Resolved in cleanup patch

`BattleGuard` recognized only `Matched + battleId` (→ `/battle/:battleId`) and `Searching` (→ `/matchmaking`) as active-queue states. The transient `Matched` state without a `battleId` (matchState `Queued` or `BattleCreateRequested`) fell through and the fallback redirected visits to `/matchmaking` back to `/lobby`. This conflicted with `SearchingScreen`'s "Opponent found — preparing battle..." state and broke validation item #6 for the race where polling returned `Matched` before the battle was created.

**Resolution:** `BattleGuard` now treats `Searching` and `Matched && !battleId` as equivalent for routing purposes — both keep the user on `/matchmaking` until `battleId` arrives.

#### FEI-045: Matchmaking store not hydrated on page refresh during search
**Severity:** High (blocking)
**Status:** Resolved in cleanup patch

After a page refresh while searching, `GameStateLoader` populates `playerStore.queueStatus` with `Searching`, so `BattleGuard` correctly routes back to `/matchmaking`. But `useMatchmakingStore` resets to `idle` on reload. `useMatchmakingPolling()` only starts the poller when matchmaking status is `searching` or `matched`, so after refresh the screen rendered with no polling, no elapsed timer, and no cancel button — a dead-end.

**Resolution:** Added a hydration `useEffect` in `useMatchmakingPolling` that, when the matchmaking store is `idle` but player-store `queueStatus` shows `Searching` or `Matched-without-battleId`, sets the matchmaking store to the corresponding state. Polling effect then runs normally.

Known limitation: hydrated `searchStartedAt` is `Date.now()` at hydration time, so elapsed time restarts from 0:00 after refresh. Recovering the original start time would require a backend-provided timestamp in the queue status response. Documented as FEI-046.

### Open

No open frontend-specific issues from the Batch 6 cleanup patch.

### Deferred

#### FEI-046: Elapsed search time resets to 0:00 on page refresh
**Severity:** Info
**Status:** Deferred to hardening

When the matchmaking store is hydrated from player-store queue status on page refresh, `searchStartedAt` is set to `Date.now()` because the original start time is not recoverable from the current game state response. Elapsed time displays `0:00` onwards after each refresh even if the user has been in queue longer. Fixing would require the backend to return the queue-entry timestamp in `QueueStatusResponse`. Acceptable degradation for the initial delivery; revisit in hardening if backend contract is revised.

---

## Batch 6 — Phase 5 Review Cleanup Patch

### Resolved

#### FEI-047: Cross-module write from matchmaking into player store
**Severity:** High (architecture violation)
**Status:** Resolved in review cleanup patch

Matchmaking hooks called `usePlayerStore.setState({ queueStatus: ... })` directly in 4 places, violating the architecture rule that modules must not directly write into another module's store. This created an implicit coupling between the two modules.

**Resolution:** Added `setQueueStatus()` action to `usePlayerStore` as its public API. All matchmaking writes now go through `usePlayerStore.getState().setQueueStatus(...)`. Zero direct `setState` calls remain from matchmaking into player store.

#### FEI-048: Matchmaking store stuck in `battleTransition` after battle end
**Severity:** High (blocking)
**Status:** Resolved in review cleanup patch + targeted follow-up

Once the matchmaking store reached `battleTransition`, there was no reverse path to `idle`. After battle end and game state refresh, the store would remain in `battleTransition`, silently blocking future re-queue attempts.

**Resolution (initial):** Added a sync effect in `useMatchmakingPolling()` watching `playerStore.queueStatus`. However, `useMatchmakingPolling()` is only mounted by `SearchingScreen` — the effect did not run in the post-battle return-to-lobby scenario.

**Resolution (corrected):** Moved the reset-to-idle effect into `useMatchmaking()`, which is consumed by `QueueButton` on the lobby screen. The effect now runs whenever the lobby is mounted, covering the post-battle flow where game state refresh sets `queueStatus` to `Idle`/`null`.

#### FEI-049: Poller in-flight results could mutate state after stop
**Severity:** Low
**Status:** Resolved in review cleanup patch

Async poll results could resolve after `stop()` was called and still invoke `onResult`/`onError` callbacks, mutating state in an unexpected lifecycle phase.

**Resolution:** Added a `generation` counter to `MatchmakingPoller`. Each `start()`/`stop()` increments it. Callbacks check their captured generation before invoking.

#### FEI-050: Dead `_consecutiveFailures` counter in poller
**Severity:** Info
**Status:** Resolved in review cleanup patch

The poller's internal `_consecutiveFailures` and `consecutiveFailures` getter were unused — the matchmaking store owns failure tracking.

**Resolution:** Removed from `MatchmakingPoller`.

#### FEI-051: Hydration reused `setSearching()` / raw `setState()`
**Severity:** Info
**Status:** Resolved in review cleanup patch

Page-refresh hydration repurposed `setSearching()` and raw `useMatchmakingStore.setState()` calls, making intent unclear.

**Resolution:** Added `hydrateFromServer()` action to the matchmaking store. Hydration effect now uses this dedicated action.

### Open

No open frontend-specific issues from the Batch 6 review cleanup patch.

### Deferred

No new deferred items from the Batch 6 review cleanup patch. FEI-043 (dual-update pattern) is resolved by FEI-047's fix — writes now go through the player store's public API.

---

## Batch 7A — Phase 6 (Part 1)

### Resolved

No blocking issues encountered during Batch 7A implementation.

### Open

No open frontend-specific issues from Batch 7A / Phase 6 Part 1.

### Deferred

No new deferred items from Batch 7A. The battle store, zone model, and hub hook are purely additive with no external dependencies modified.

---

## Batch 7 — Phase 6 (Part 2)

### Resolved

No blocking issues encountered during Batch 7 Phase 6 Part 2 implementation.

### Open

No open frontend-specific issues from Batch 7 / Phase 6 Part 2.

### Deferred

No new deferred items. DM suppression wires cleanly into existing chat store actions. Reconnect/resync was already structurally sound from Batch 7A. Debug battle screen is intentionally minimal — production UI will replace it in Phase 7.

---

## Batch 7 — Phase 6 Cleanup Patch

### Resolved

#### FEI-052: Action payload used wrong block field names (critical)
**Severity:** Critical
**Status:** Resolved in cleanup patch

`buildActionPayload` serialized `blockPrimary` and `blockSecondary`. The backend expects `blockZonePrimary` and `blockZoneSecondary`. All submitted turn actions arrived without valid block zones.

**Resolution:** Fixed field names in `TurnAction` interface and `buildActionPayload()`. Added tests verifying the exact field names in the serialized payload.

#### FEI-053: Submit failure left state stuck in Submitted (major)
**Severity:** High
**Status:** Resolved in cleanup patch

`setSubmitting(false)` used `get().phase` to determine the recovery phase. Since the current phase was already `Submitted`, it stayed `Submitted`. The user's action input was locked until a server event arrived.

**Resolution (initial):** `setSubmitting(false)` explicitly set `phase: 'TurnOpen'`. But this was unconditional and could stomp a `Resolving` phase in a race.

**Resolution (final — cleanup patch):** `setSubmitting(false)` now only reverts to `TurnOpen` when current phase is still `Submitted`. If the store has advanced to `Resolving`/`Ended`, the phase is preserved. Added race-condition test.

#### FEI-054: No Phase 6 tests existed (major)
**Severity:** High
**Status:** Resolved in cleanup patch

The battle foundation — the highest-risk code in the frontend — had zero tests. This allowed the payload contract bug (FEI-052) to ship.

**Resolution:** Added 22 tests across 2 test files covering zone validation, payload construction, critical state machine transitions, and submit-failure race conditions.

### Open

No open frontend-specific issues from the Batch 7 cleanup patch.

### Deferred

#### FEI-055: Snapshot does not restore winnerPlayerId/lastResolution
**Severity:** Info
**Status:** Deferred to hardening

`handleSnapshot` does not set `winnerPlayerId` or `lastResolution`, so a reconnect during/after the resolving phase won't restore these fields. In practice, `BattleEnded` events set the winner, and resolution data is transient display state. Acceptable for initial delivery.

#### FEI-056: Submitted phase not preserved across reconnect snapshot
**Severity:** Info
**Status:** Deferred to hardening

`serverPhaseToLocal` preserves `Submitted` when server phase is `TurnOpen`, but `handleSnapshot` resets `isSubmitting` to `false`, creating a mismatch. If the server accepted the action, it will progress to `Resolving`. If not, displaying `TurnOpen` to the user is correct. No behavioral issue in practice.

---

## Batch 7 — Phase 6 Final Cleanup Patch

### Resolved

#### FEI-057: Submit failure recovery could stomp Resolving phase
**Severity:** High
**Status:** Resolved in final cleanup patch

`setSubmitting(false)` unconditionally set `phase: 'TurnOpen'`. If a server `TurnResolved` event arrived before the invoke error, the `Resolving` phase was overwritten back to `TurnOpen`.

**Resolution:** Recovery is now guarded — only reverts to `TurnOpen` when current phase is still `Submitted`. Added test.

#### FEI-058: Debug screen missing countdown, connection state, result link
**Severity:** Low
**Status:** Resolved in final cleanup patch

Debug screen lacked live deadline countdown, raw connection state display, and a navigation path from `Ended` to result.

**Resolution:** Added `DeadlineCountdown` (interval-driven, React 19 compliant), `ConnectionStateRow`, and `Link` to `/battle/:battleId/result`.

#### FEI-059: Stale battle hub event handlers retained after unmount
**Severity:** Low
**Status:** Resolved in final cleanup patch

The singleton `battleHubManager` retained closures from the previous `useBattleConnection` mount.

**Resolution:** `battleHubManager.setEventHandlers({})` called before `disconnect()` in cleanup.

#### FEI-060: `useBattle()` monolithic selector propagation risk
**Severity:** Info
**Status:** Resolved in final cleanup patch

`useBattle()` subscribes to 18 fields, causing broad re-renders. Risky to replicate in Phase 7.

**Resolution:** Added focused selectors: `useBattlePhase()`, `useBattleTurn()`, `useBattleHp()`, `useBattleResult()`, `useBattleFeed()`. `useBattle()` retained for debug screen with annotation.

### Open

No open frontend-specific issues from the Phase 6 final cleanup.

### Deferred

FEI-055 and FEI-056 remain deferred to hardening — not adjacent to the fixes in this patch.

---

## Batch 7 — Phase 6 Pre-Phase-7 Patch

### Resolved

#### FEI-061: Debug screen read connection state imperatively from transport singleton
**Severity:** Low
**Status:** Resolved in pre-Phase-7 patch

`ConnectionStateRow` read `battleHubManager.connectionState` during render — not reactive (won't re-render on change) and crossed the screen → transport boundary.

**Resolution:** Added `connectionState` field to battle store, wired from `onConnectionStateChanged` callback. Debug screen now reads the reactive Zustand value. Added `useBattleConnectionState()` focused selector.

#### FEI-062: Late async results after unmount could repopulate battle state
**Severity:** Low
**Status:** Resolved in pre-Phase-7 patch

The `connect → joinBattle → applySnapshot` chain and reconnect rejoin chain could resolve after effect cleanup, writing state into a reset store and re-applying opponent DM suppression.

**Resolution:** Added a `disposed` flag in the effect closure, set on cleanup. All async callbacks and event handlers check `disposed` before mutating state.

### Open

No open frontend-specific issues from the pre-Phase-7 patch.

No remaining Phase 6 technical debt. FEI-055 and FEI-056 remain deferred to hardening as informational items with no behavioral impact.

### Deferred

No new deferred items.

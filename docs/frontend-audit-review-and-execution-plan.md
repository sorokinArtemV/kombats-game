# Kombats Frontend — Audit Review & Corrected Execution Plan

Date: 2026-04-18
Branch: `frontend-client`
Reviewer: Claude (Opus 4.7)
Scope: critical review of `docs/frontend-audit-remediation-plan.md` (dated same day).

This document is **not** a second audit. It is a review of the existing one, written for the implementation agent who will actually land the work. It corrects priorities, calls out what the original audit missed, and reduces the scope to a small number of workstreams that matter for a production-worthy MVP.

---

## 1. Verdict on the original audit

**Overall: solid engineering audit. Weak MVP-framing audit.**

The original author clearly read the code, not just the docs. Evidence-citations (`file:line`) are specific and verifiable — I spot-checked the strongest and weakest claims and they hold (34 console calls across 9 files, `useBattle()` still defined with no callers, dual `status` tracking in matchmaking + player stores, one ErrorBoundary at `BattleScreen.tsx:79-91` only). The layer-boundary praise is earned. The P0 list is mostly right.

Where it falls short:

1. **It is a code-health audit, not a product audit.** Every finding is about code quality, type safety, duplication, boundaries. Not one finding asks "does this feel like a fighting game to the user." For an MVP whose selling point is realtime PvP, that's a gap.
2. **Priorities are inflated in the middle tier.** The "P1" list has 14 items. A true P1 tier for MVP has 4–6. Several items labeled P1 (AbortSignal threading, stat-allocation dedup, feed cap) are maintainability improvements, not shipping blockers.
3. **Refactoring-for-composition findings are not MVP work.** `BaseHubManager` extraction (F-A7), per-event subscribe (F-A6) — the audit itself notes the duplication is load-bearing and the current architecture guarantees no collision. These belong post-MVP.
4. **Auth bootstrap is treated too lightly.** The P2 label on F-AU1 / F-AU4 understates how bad "stuck on Restoring session…" is as a first-touch experience.
5. **The design reference at `design/` is effectively ignored.** It exists, it's checked in, and the audit's own rules say not to import it at runtime — but the audit doesn't ask whether the *shipped* UI conveys the same product intent. ZoneSelector-as-list-of-buttons and Avatar-as-initial-in-a-circle are both P3 in the original. For a visual-combat game, that's probably wrong.

Net: use the original audit as a findings catalog. Do not use its priority order as the execution plan.

---

## 2. What the original audit got right

- **P0 on diagnostic logging (F-AU3 / F-P1).** Real leak, real noise, real fix. 34 console calls including `new Error('clearAuth stack').stack` is not theoretical.
- **P0 on error boundaries (F-EH1).** One boundary scoped to `ActionPanelSlot` is genuinely insufficient. A chat-render crash blanks the SPA.
- **P0 on dual queue source of truth (F-A3).** Confirmed in `modules/matchmaking/hooks.ts:47-53, 76-92, 124-134` — every queue state mutation writes both stores, and recent commit messages ("fix crit bugs", "fix chat", "fix battle crash") corroborate this is the bug-dense seam.
- **F-R2 (BattleGuard branch drift).** Verified in `app/guards/BattleGuard.tsx:11-51`. Three overlapping invariants read from two stores, no tests. This is the highest-ROI single test to write.
- **Layer-boundary discipline praise is earned.** Transport has no React or Zustand imports, UI has no store imports. Spot-checked and true.
- **The post-battle handoff cluster (F-A4 + F-R5).** The triple-write `setDismissedBattleId / setQueueStatus(null) / setPostBattleRefreshNeeded(true)` in `BattleResultScreen.tsx:112-122` is a real foot-gun and has already bitten the project.
- **Nested interactive elements in `OnlinePlayersList` (F-U1).** Confirmed: `role="button" tabIndex={0}` span inside a parent `<button>`. Real a11y + React DOM warning.
- **OIDC bootstrap singleton is real but acceptable (F-AU1).** The module-level `bootstrapPromise` is ugly but load-bearing. The audit's "keep it, test it" recommendation is correct.
- **The staged remediation roadmap (§5 of the original) is generally well-sequenced.** Do R0 (strip diagnostics) then R1 (error boundary + logger) then R2 (queue collapse). That's the right first three moves.

---

## 3. What it got wrong or prioritized poorly

### 3.1 Priorities that should drop

| Finding | Original | Proposed | Reason |
|---|---|---|---|
| **F-T1** — AbortSignal threading | P1 | P3 | A request that lands after logout is already idempotent (`onAuthFailure()` is idempotent, `setGameState` no-ops after `clearAuth`). No user-visible symptom exists. Real refactor, low payoff. Do post-MVP. |
| **F-A6** — per-event subscribe hub | P2 | Post-MVP | The architecture guarantees one subscriber per hub. This fixes a composition problem that does not exist. Refactor risk > current risk. |
| **F-A7** — `BaseHubManager` extraction | P2 | Post-MVP | Audit itself admits "duplication is load-bearing (was patched twice for StrictMode issues)." Merging the two managers now introduces a regression vector for bugs that were expensively found. Do this *after* MVP ships and the shape is stable. |
| **F-Q1** — stat-allocation dedup | P1 | P2 | Real duplication, but zero correctness bugs today. This is cleanup, not shipping blocker. |
| **F-S1** — cap `feedEntries` | P1 | P2 | A 10-minute battle produces ~150 entries. Memory growth is not the issue. Reconnect backfill is already deduped. Add the cap as insurance but don't block on it. |
| **F-T3** — regex-matched transient error | P2 | P3 | Works today, breaks only if backend message text changes. Add a verbatim-match test and move on. |
| **F-TY1–5** — type tightening cluster | P2 | Post-MVP | Branded UUIDs, discriminated unions, shared `ApiError` — all nice, none fix correctness bugs today. Do after shape stabilizes. |
| **F-P4** — `refetchOnWindowFocus: false` default | P2 | P3 | Opinion, not bug. Current behavior is defensible. |

### 3.2 Priorities that should rise

| Finding | Original | Proposed | Reason |
|---|---|---|---|
| **F-AU4** — no retry when bootstrap times out | P1 | **P0** | First-touch failure mode. A user who sees "Restoring session…" forever on a cold Keycloak is a lost user. `UnauthenticatedShell` needs a visible retry or a clear "login again" path when the 12s timeout wins. |
| **F-R2** — BattleGuard test | P1 | **P0** | This guard caused the redirect-loop bug that required fix commits. No tests. Writing the test *is* the fix — it pins branches before the next refactor breaks them. |
| **F-EH4** — "leave battle" escape | P2 | P1 | Currently a failed-reconnect leaves the user staring at an error banner with no way out. That's a hard-refresh scenario, which for a logged-in user means re-bootstrap + re-discover battle state. Real UX bug. |
| **F-U1** — nested interactive elements | P0 | P1 | Correct as P0 for code quality but practically P1: works today, warning-in-console is the symptom. Fix during UI polish, not the first stage. |

### 3.3 Priorities that are fine where they are

P0 list (diagnostics strip, error boundaries, dual-source-of-truth collapse) is correct. R0/R1/R2 in the original roadmap is the right opening sequence. Leave those alone.

---

## 4. What is missing

The audit is comprehensive on code; it is thin on product, session lifecycle edges, and realtime failure modes. The following are genuinely missing findings, not reframings.

### 4.1 Token refresh mid-battle

**Not in the audit.** `oidc-client-ts` does silent iframe renew at token expiry. The audit confirms tokens are mirrored into `useAuthStore` via `AuthProvider`. What is *not* analyzed: what happens to the active `BattleHub` connection when the token is rotated mid-battle? SignalR's `accessTokenFactory` is read at connect time; on reconnect it re-reads. But during a healthy connection, the token in the server's memory is the original — it does not refresh. If the battle lasts longer than token lifetime, the *next* reconnect will use the fresh token; until then, the server-side auth middleware state determines behavior.

**Likely risk:** low on short battles, unknown on longer battles. Verify Keycloak token lifetime vs. typical battle duration before shipping.

**Recommendation:** one-line investigation item. Confirm token lifetime in `.env.production` Keycloak config and document expected battle length. If `tokenLifetime < maxBattleDuration`, you need a strategy.

### 4.2 Tab-visibility / network-change handling

**Not in the audit.** Browsers throttle background-tab timers to ≥1s. `matchmakingPoller` at 2s is fine; SignalR built-in keep-alive at 15s is fine. But `usePostBattleRefresh`'s 3s setTimeout can be arbitrarily delayed on a backgrounded tab, creating a surprise refetch much later than expected.

**Separately:** no `online`/`offline` event listeners anywhere in the app. When the user's laptop wakes from sleep with an expired connection, there is no active "we're back online, try to reconnect" trigger — they wait for SignalR's built-in retry, or click Reconnect manually.

**Recommendation:** add a tiny `useNetworkRecovery()` hook that listens to `window.online` and pokes `battleHubManager` / `chatHubManager` `.connect()` when stale. 15 lines. Low-risk, high-UX-value.

### 4.3 Onboarding error UX is unevaluated

Audit mentions 409 handling exists in `InitialStatsScreen` and `StatAllocationPanel` with divergent shapes (F-Q1) but does not evaluate the *actual user experience* when those errors fire. Specifically:
- Name already taken → what does the user see?
- Network failure during stat allocation → is state lost?
- Character state mismatch (409 on revision) → is there a refresh path?

For a first-touch flow, these are the product tests. The audit elides them in favor of "the code is duplicated."

**Recommendation:** one manual-test sweep against onboarding error paths. Document what the UX looks like in `docs/execution/frontend-execution-log.md`. Fix any that are confusing.

### 4.4 Design fidelity is not MVP-graded

Audit flags `ZoneSelector` list-style (F-U7) and `Avatar` letter-in-circle (F-D5) as P3 polish. For a fighting game that must convey visual combat, this is potentially a product-level MVP gap, not a polish item. The game visually is the product.

But: without knowing whether the MVP is intended to ship with current art or a subsequent art pass, I can't upgrade this. **Open question for the user:** does "production-worthy MVP" mean "first playable ship" or "first visible ship"? If the former, leave as P3. If the latter, a styling pass on battle screen primitives is P1.

**Default assumption in this plan:** first playable ship. UI polish stays P3. Re-scope if wrong.

### 4.5 Reward-moment UX (post-battle)

`usePostBattleRefresh` and `pendingLevelUpLevel` are mentioned as store mechanics. The audit does not ask: does winning feel like winning? Does level-up have any payoff beyond a numeric bump? The `BattleResultScreen` has hardcoded success/error shadows (F-U5) — audit treats this as a token violation, not a UX inspection.

**Recommendation:** during the UI polish stage, explicit pass on the result screen UX. The `motion` dependency is already installed (F-P10 — audit suggests dropping it; I suggest the opposite, use it here).

### 4.6 Keycloak registration flow not evaluated

Referenced only under "future hardening" as "routes into Keycloak's default register UI." For an MVP, the *registration* flow is the first thing a new user does. If that flow is jarring (branded-Keycloak-vs-branded-Kombats context switch), it is a P1 product issue.

**Recommendation:** verify the registration flow manually before MVP. Capture screenshots. Decide whether Keycloak theming is in-scope. If out-of-scope, document explicitly.

### 4.7 Error-boundary semantics for active battles

Audit identifies F-EH1 (no top-level boundary) and recommends a boundary + `AppCrashScreen`. Does not address: **what happens to in-flight battle state when the boundary catches mid-battle?** Does the user land on an "oops" screen that requires a reload — losing the BattleHub connection, needing to re-bootstrap, and (crucially) potentially losing the turn?

**Recommendation:** when WP-3 ships the top-level boundary, make the recovery path different in battle vs. lobby. Battle crash → "Rejoin battle" button that re-navigates to `/battle/:id` (BattleGuard + fresh hub init will reconcile via `BattleStateUpdated`). Lobby crash → "Return to lobby" button. This is a 20-line elaboration of WP-3 but changes whether a mid-turn crash is survivable.

### 4.8 No thought given to Keycloak/BFF unreachable cold-boot

Related to 4.1 / F-AU4. If Keycloak is down on cold boot, the user sees "Restoring session…" until the 12s timer fires, then the `UnauthenticatedShell` with login buttons. Login click → another Keycloak redirect → also fails. The user has no diagnostic. Not "Keycloak is down" or "Check your connection."

**Recommendation:** tiny status-banner on `UnauthenticatedShell` when `authError === 'bootstrap_timeout'` — "We couldn't restore your session. Retry?" with a retry button that re-invokes bootstrap. Already called out in audit F-AU4; I'm upgrading to P0 because it's the only way a cold-boot failure becomes recoverable.

---

## 5. Corrected priority ranking

**P0 — must land before MVP ship.** Everything in this tier is either unrecoverable for the user, unacceptable to leak, or a known bug source.

1. **Strip diagnostic `console.*`** (F-AU3 / F-P1 / F-Q8). 34 calls. Token lengths and stack traces must not ship.
2. **Top-level error boundary + battle-aware recovery** (F-EH1 + §4.7). `AppCrashScreen` with "Rejoin battle" vs. "Return to lobby" split.
3. **Collapse dual queue source-of-truth** (F-A3). `useMatchmakingStore` becomes `{ searchStartedAt, consecutiveFailures, battleTransitioning }`. Every `status` read projects from `playerStore.queueStatus`.
4. **Bootstrap-timeout recovery UI** (F-AU4, upgraded). `UnauthenticatedShell` shows retry when `authError === 'bootstrap_timeout'`.
5. **BattleGuard branch tests** (F-R2 / F-TE2, upgraded). Pin all four branches with component tests before the next refactor rots them.
6. **`returnFromBattle(battleId)` single action** (F-R5 + F-A4). Atomic replacement for the triple-write in `BattleResultScreen`.

**P1 — strong MVP concerns.** Ship these unless the deadline is genuinely imminent.

7. **Fix nested interactive elements in `OnlinePlayersList`** (F-U1). React DOM warning + a11y.
8. **"Leave battle" escape when battle is in terminal error** (F-EH4, upgraded). Today the user is stuck.
9. **`accessTokenFactory` throws instead of returning `''`** (F-AU6). Small, correct.
10. **Central `logger` abstraction** (F-P2). Enables P0 #1 and future Sentry hook in one place.
11. **Delete unused `useBattle()` + unused `syncedRef`** (F-A5 + F-AU2). Dead code removal; batched with P0 #1.
12. **Verify registration flow UX manually** (§4.6). May add P1 work if broken; may not.
13. **`useNetworkRecovery()` hook for `online`/`offline`** (§4.2). 15 lines, real UX.
14. **Cap `feedEntries` at 500** (F-S1, demoted from P1). Insurance.
15. **Store-level integration test for post-battle handoff** (F-TE4). Guards against the bug cluster in P0 #6.
16. **Manual sweep of onboarding error UX** (§4.3).

**P2 — cleanup / consistency, post-ship or late-MVP if time allows.**

17. Share `outcomeToneTokens` between `BattleResultScreen` + `BattleEndOverlay` (F-U6).
18. Replace hardcoded colors/shadows in `BattleResultScreen` with tokens (F-U5 / F-D2).
19. Unify `isApiError` + `formatTimestamp` into shared modules (F-Q4 / F-Q5).
20. Guard + auth bootstrap tests beyond BattleGuard (F-TE2 remainder, F-TE7).
21. Clear `lastResolution` on `handleBattleEnded` (F-S2).
22. `AppHeader` dropdown positioning fix — use Radix `DropdownMenu` (F-R3 / F-Q6).
23. Adopt `sonner` for transient mutation errors (F-EH2); keeps or drops the unused dep decision cleanly.
24. De-duplicate stat allocation (F-Q1). One hook + one presentational form.
25. Chat store tests (F-TE5).
26. Move `dismissedBattleId` suppression fully into `usePostBattleRefresh` (F-A4 remainder — P0 #6 does the atomic-action part).

**P3 / post-MVP.** Do not do these before ship. Noted so the implementation agent does not scope-creep.

- BaseHubManager extraction (F-A7).
- Per-event subscribe hub API (F-A6).
- AbortSignal threading through HTTP + TanStack Query (F-T1).
- Branded UUID types / discriminated unions / typed `ApiError` on hooks (F-TY1–5).
- Stop mutating Zustand inside queryFn (F-A2). Works today; documented; fix when a second write path appears.
- Matchmaking poller jitter (F-T5).
- `refetchOnWindowFocus` default flip (F-P4).
- Chat conversation eviction (F-S4).
- `prefers-reduced-motion` respect (F-D6).
- Battle animation pass using `framer-motion` (§4.5 depth pass).
- Real avatar pipeline (F-D5).
- ZoneSelector visual redesign (F-U7) — **unless §4.4 resolves toward first-visible-ship.**
- Sentry / OTel wiring (F-P3).
- E2E tests, MSW integration tests (audit §8).

---

## 6. Recommended workstreams / stages

Six stages. Each is independently shippable. Stop at any point and what shipped is an improvement. Total: ~4 working days single-developer, about 2 days less than the original 7-stage plan.

### Stage S0 — Scaffolding strip + logger + dead code (0.5 day)

**Lands P0 #1, P1 #10, P1 #11.**

- Delete every `[KOMBATS-AUTH-DIAG v3/v4]` console call + accompanying `eslint-disable-next-line no-console` comments. 9 files.
- Delete `syncedRef` in `AuthProvider`.
- Delete `useBattle()` in `modules/battle/hooks.ts` (verify no callers with grep).
- Add `app/logger.ts` (`debug/info/warn/error`; `debug`/`info` no-op when `!import.meta.env.DEV`).
- Migrate remaining legitimate `console.*` to `logger`.

**Gate:** app boots, login flow unchanged, `grep -rn "eslint-disable-next-line no-console"` returns zero, ESLint clean. Manual login + enter lobby still works.

### Stage S1 — Crash safety net with battle-aware recovery (0.5 day)

**Lands P0 #2 + §4.7.**

- Expand `ui/components/ErrorBoundary.tsx` to support a `reset` callback.
- Add `app/AppCrashScreen.tsx` with two recovery modes:
  - If `useBattleStore.getState().battleId` is set → "Rejoin battle" button that navigates to `/battle/:id`.
  - Otherwise → "Return to lobby" button.
- Wrap `<RouterProvider>` at `App.tsx` with `<ErrorBoundary fallback={<AppCrashScreen/>} onError={logger.error}>`.
- Per-route `errorElement` on battle + onboarding route groups.

**Gate:** throw a test error from `FighterCard`; recovery from battle returns to `/battle/:id` and re-reconciles via `BattleStateUpdated`. Throw from `BattleResultScreen`; "Return to lobby" lands user on `/lobby`.

### Stage S2 — Queue source-of-truth collapse + post-battle handoff (1.5 days)

**Lands P0 #3, P0 #5, P0 #6, P1 #14, P1 #15.**

- Shrink `useMatchmakingStore` to `{ searchStartedAt, consecutiveFailures, battleTransitioning }`.
- Add `useQueueUiState()` selector that derives UI status purely from `usePlayerStore.queueStatus`.
- Remove `hydrateFromServer`, `updateFromPoll` branches that write non-UI state; poll results write straight to `playerStore.setQueueStatus`.
- Add `usePlayerStore.returnFromBattle(battleId)` atomic action. Replace the triple-write in `BattleResultScreen.tsx:112-122`.
- Write BattleGuard branch tests (`AuthGuard`, `OnboardingGuard` while at it — low marginal cost).
- Write store-level integration test for full post-battle → lobby sequence.
- Cap `feedEntries` at 500 (trivial, bundled here).

**Gate:** manual sweep — queue → match → battle → result dismiss → lobby; cancel during search; refresh mid-search; refresh on result screen; re-queue immediately after battle. All guard tests pass.

### Stage S3 — Auth / recovery UX (0.5 day)

**Lands P0 #4, P1 #8, P1 #9, P1 #13.**

- Add `authError` to `useAuthStore`. Set to `'bootstrap_timeout'` when the external 12s timer wins.
- `UnauthenticatedShell` renders a banner + "Retry restore" button when `authError` is set. Retry clears the error and re-triggers bootstrap.
- `accessTokenFactory` in `app/transport-init.ts` throws on missing token.
- "Leave battle" button on battle `Error` phase that navigates to `/lobby` and resets `useBattleStore`.
- Add `useNetworkRecovery()` that listens to `window.online` and calls `.connect()` on active hubs when returning from offline.

**Gate:** manual test — start the app with Keycloak unreachable; confirm retry path exists. Force BattleHub `failed` state (block SignalR domain in devtools); confirm escape to lobby works. Simulate network drop + recovery; confirm hubs reconnect automatically.

### Stage S4 — Onboarding + registration manual sweep (0.5 day)

**Lands P1 #12, P1 #16. May surface additional P1 work.**

- Manually test registration flow end-to-end. Screenshot the Keycloak handoff. Decide: is the Keycloak branding jarring enough to block MVP? Log decision in `docs/execution/frontend-execution-log.md`.
- Manually test onboarding error paths: name collision, 409 on stat allocation, network failure during each mutation. Log the UX. Fix any that block the user from recovering (no retry button, lost input, confusing error).
- Fix nested interactive elements in `OnlinePlayersList` (F-U1) while touching the chat area.

**Gate:** a new user can sign up, onboard through name + stats, reach the lobby, and never see an unrecoverable state. Written log in execution-log.md with findings.

### Stage S5 — Targeted UI polish (1 day)

**Lands P2 #17, #18, #19, #21, #22, #24.**

- Extract `outcomeToneTokens` shared between `BattleResultScreen` and `BattleEndOverlay`. Add `--shadow-success/-error/-info/-warning` to `tokens.css`. Remove arbitrary `shadow-[...]` + `bg-[#...]` values.
- Unify `isApiError` (export from `types/api.ts`; 3 call-sites).
- Unify `formatTimestamp` into `modules/chat/format.ts`.
- Clear `lastResolution` in `handleBattleEnded`.
- Replace `AppHeader` dropdown with Radix `DropdownMenu`.
- Extract `useAllocateStats` hook + `StatAllocationForm` presentational component; both screens thin down.

**Gate:** manual visual regression on lobby, battle result, onboarding stats, chat timestamps. Ship.

**Explicit stop.** Everything beyond S5 (BaseHubManager, AbortSignal threading, type tightening, `sonner` adoption, branded UUIDs, bundle splitting, `framer-motion` animations, real avatars, reduced-motion, Sentry) is post-MVP. A reviewer asking "should we also do X" should get "no, S5 ships."

---

## 7. What should explicitly wait until later

Listed so the implementation agent has a clean "no" to point at. These are real improvements — they are just not MVP-shipping work.

| Deferred | Why not now |
|---|---|
| `BaseHubManager` extraction (F-A7) | Duplication is load-bearing; merging risks re-breaking StrictMode fixes. |
| Per-event `onX(h) => unsubscribe` (F-A6) | Solves a composition problem that does not exist. |
| `AbortSignal` threading (F-T1) | No user-visible symptom; request-after-logout is idempotent. |
| Branded UUID / discriminated-union / shared `ApiError` generics (F-TY1–5) | Nice, not correctness. |
| Stop mutating Zustand from queryFn (F-A2) | One write path exists; works; documented. Revisit when a second appears. |
| Sentry / OTel (F-P3) | Logger (S0) is the future hook. |
| `refetchOnWindowFocus: false` global flip (F-P4) | Taste, not bug. |
| Chat conversation eviction (F-S4) | 500 × 20 ≈ 10k objects. Not a problem. |
| `prefers-reduced-motion` (F-D6) | A11y polish. |
| ZoneSelector redesign (F-U7), real avatars (F-D5), `framer-motion` battle anims | Visual polish pass — post-MVP unless first-visible-ship is redefined (see §4.4). |
| E2E + MSW integration tests | Guard + store tests cover the highest-ROI gaps; broader coverage is post-ship. |
| Bundle splitting with `React.lazy` (F-P10 / audit §8) | Premature; no bundle budget today. |
| Matchmaking poll jitter (F-T5) | Fine at MVP scale. |
| Keycloak theme work | Pending §4.6 decision; default is "document + ship as-is." |

---

## 8. For the implementation agent

Your starting point is **Stage S0**. Do not do findings that are not in §5's P0/P1 list unless S5 is already shipped and time remains.

When in doubt:
- If a finding is about *code quality*, push to post-MVP.
- If a finding is about *the user being stuck*, it is P0 or P1.
- If a finding is about *a bug the git log shows has already been fixed in this area*, add a test, not a refactor.
- If a finding proposes extracting a base class / generic / shared abstraction for work that currently has one caller, skip it.

The original audit is a fine reference catalog. Read it once, then use this document as the execution plan.

---

End of review.

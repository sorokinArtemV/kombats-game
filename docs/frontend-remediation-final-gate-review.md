# Kombats Frontend — Remediation Final Gate Review

Date: 2026-04-18
Branch: `frontend-client`
Reviewer: Claude (Opus 4.7)
Scope: independent gate review of the staged remediation (S0–S5) against
`docs/frontend-audit-review-and-execution-plan.md`.

This is not a fresh audit. It is a final, evidence-based judgment on whether
the remediation phase achieved its stated purpose and whether the frontend
can exit remediation and resume normal development.

Method:
- Re-read the reviewed execution plan and the per-stage logs.
- Inspected the current state of the code (not the logs) for every claimed
  deliverable.
- Ran `npx tsc --noEmit`, `npx eslint .`, and `npx vitest run` to confirm the
  repo is actually green.

---

## 1. Final Verdict

**PASS WITH FOLLOW-UPS.**

The remediation phase did what it set out to do. Every P0/P1 deliverable in
the reviewed plan is present in the code, compiles cleanly, is lint-clean,
and is covered by either unit/integration tests or behavior-preserving
refactors. The residual risk is concentrated in a short list of items that
are (a) belt-and-suspenders fixes whose underlying root cause was not
verifiable from an implementation session and (b) pending human browser
sweeps — both bounded, neither a blocker.

---

## 2. Executive Assessment

Before S0 the frontend had a real, observable set of problems: diagnostic
logs leaking token lengths and stack traces into production consoles, a
single inline `ErrorBoundary` that left the SPA white-screen on anything
outside the battle action slot, two authoritative queue-state stores racing
each other across every search→match transition, a triple-write post-battle
handoff that repeatedly bounced users back into just-finished battles, no
recovery UI for a hung Keycloak bootstrap, and a known-broken logout.

After S5 the code looks like an MVP. Each of the above is fixed with a
bounded, testable change — not a grand rewrite. Architecture boundaries
(`transport/` → `types/` only, `ui/` stateless, modules own their stores)
are preserved: none of the remediation stages leaked responsibility
across layers. The test count is up from a pre-S0 baseline of ~80 to
**127 passing tests across 14 files**, and the new tests are on the
highest-value seams (guard decisions, post-battle handoff, crash
recovery).

Is this frontend now a credible MVP? Yes. Can it survive a first cohort of
real users? Yes, provided the four pending browser-side verifications land
before ship (§6).

It is not a polished product. Design fidelity, animation depth, and
end-to-end automation are explicitly post-MVP per plan §7. That is the
correct trade-off and it was respected.

---

## 3. What the Remediation Phase Successfully Fixed

Verified against current code (not the logs).

**Diagnostic noise removed.** `grep -r "KOMBATS-AUTH-DIAG" src/` returns
zero. `grep -r "eslint-disable-next-line no-console" src/` returns zero.
Every `console.*` in `src/` is inside `src/app/logger.ts:13-23`. The
logger is a single seam: `debug`/`info` are no-ops in non-DEV builds;
`warn`/`error` surface. This closes F-AU3 / F-P1 / F-Q8 at the source.

**Top-level crash safety net with battle-aware recovery.**
`src/app/App.tsx:11-21` wraps the entire app (including `AuthProvider`
and `QueryClientProvider`) in `<ErrorBoundary>` with `<AppCrashScreen>`
as fallback. Battle and onboarding route groups have per-route
`errorElement`. `src/app/crash-recovery.ts:19-23` is a pure function of
`(battleId, phase)` that picks "Rejoin battle" for live battles and
"Return to lobby" for the result-screen / non-battle / ended cases —
covered by 5 unit tests. No scenario can produce a white document
anymore.

**Queue source-of-truth collapse (F-A3).** `src/modules/matchmaking/
store.ts:21-37` now holds only UI-local fields (`searchStartedAt`,
`consecutiveFailures`, `battleTransitioning`). The authoritative queue
state lives exclusively in `usePlayerStore.queueStatus`. The triple
write the old matchmaking hook did is structurally impossible — the
matchmaking store no longer has a field to write to. UI projection is a
pure function (`deriveQueueUiStatus`).

**Atomic post-battle handoff (F-R5 + F-A4).**
`src/modules/player/store.ts:107-112` — `returnFromBattle(battleId)` is
one `set()` call. `BattleResultScreen.tsx:51-58` calls it.
`post-battle-handoff.test.ts` is a 7-case integration test that stitches
`returnFromBattle` + `setGameState` suppression + `decideBattleGuard` +
`deriveQueueUiStatus` together and pins the exact sequence that
repeatedly broke before S2. This is the most valuable single test in
the suite.

**BattleGuard (and AuthGuard, OnboardingGuard) pinned by tests (F-R2 /
F-TE2).** `src/app/guards/guard-decisions.ts` factors each guard's
decision into a pure function returning `{type: 'allow' | 'navigate' |
'loading'}`. `guard-decisions.test.ts` covers 23 branches, including
the REQ-P1 "do not bounce an already-Ended battle" edge. The React
guards shrink to ~15-line adapters.

**Bootstrap-timeout recovery UX (F-AU4, upgraded to P0).**
`src/modules/auth/store.ts:13-54` adds `authError` +
`setAuthError`. `AuthProvider.tsx:104-117` stamps `'bootstrap_timeout'`
when the 12s external timer beats `signinSilent()`.
`UnauthenticatedShell.tsx:45-62` renders a warning-toned banner +
"Retry restore" button when the flag is set.
`bootstrap-retry.ts:37-42` owns the retry entry point. A cold-boot
Keycloak failure is now user-recoverable instead of an infinite
"Restoring session…" screen.

**Logout hardened.** `src/modules/auth/hooks.ts:34-70` rewrites the
sequence: `oidcAuth.removeUser()` first (so an intervening `AuthSync`
render cannot re-populate the store), then `clearSessionState()`, then
`oidcAuth.signoutRedirect()` wrapped in try/catch with
`window.location.assign('/')` fallback. Intermediate-render race bug
(the most likely cause of the reported "does not sign out" behavior) is
closed; degenerate Keycloak-side failures are now recoverable instead
of stranding.

**Terminal-battle-error escape (F-EH4).** `BattleScreen.tsx:197-225`
renders a `LeaveBattleEscape` button under the error banner when
`phase === 'Error'`. Calls `returnFromBattle(battleId)` + battle reset +
navigate to `/lobby`. Previously hard-refresh was the only way out.

**`accessTokenFactory` throws (F-AU6).**
`transport-init.ts:10-22` — was silently returning `''` and producing a
cryptic server handshake error. Now throws; hub managers' existing
`failed` path surfaces it through the same error UX wired in the
previous line.

**Registration flow fix.** `modules/auth/hooks.ts:15-32` sends BOTH
`kc_action=register` AND `prompt=create` as Keycloak version-compat
belt-and-suspenders. Whichever parameter the realm honors takes effect.

**Nested interactive elements fixed (F-U1).**
`OnlinePlayersList.tsx:64-97` — the row is now two sibling buttons
inside a non-interactive `<li>`. Previously a `role="button"` span
nested inside a parent `<button>` (invalid HTML, a11y regression,
React DOM warning). The `aria-label` on the DM button names the
recipient explicitly.

**Network recovery (§4.2).** `useNetworkRecovery` hook
(`src/app/useNetworkRecovery.ts`) listens to `window.online` and
pokes `.connect()` on hubs in the `failed` state only. Mounted in
`SessionShell`. Low-risk, high UX value for laptop-wake-from-sleep.

**Shared outcome tone + shadow tokens (F-U5 / F-U6 / F-D2).**
`outcome-tone.ts` + `--shadow-success/-error/-info/-warning` in
`tokens.css`. Grep confirms zero `bg-[#...]`, `shadow-[0_0_...]`, or
`drop-shadow-[0_0_...]` remaining in `src/`.

**Helper unification + dedupe (F-Q4 / F-Q5 / F-Q1).** `isApiError` is
now a real export of `types/api.ts`, `formatTimestamp` lives in
`modules/chat/format.ts`, `useAllocateStats` hook is consumed by both
`InitialStatsScreen` and `StatAllocationPanel`. The previous
duplicate definitions are gone.

**`lastResolution` clear on battle end (F-S2).**
`battle/store.ts:266` — clears the final turn's resolution when
transitioning to `'Ended'`. Prevents `TurnResultPanel` from flashing
the last turn's detail under the result celebration.

**`feedEntries` capped at 500.** `battle/store.ts:274-278` —
insurance trim after dedup. Matches chat buffer cap.

**AppHeader dropdown via Radix.** `AppHeader.tsx:25-51` uses
`@radix-ui/react-dropdown-menu`. Focus trap, escape/outside-click,
ARIA, portal positioning for free. Custom `useState` + `useEffect` +
click-outside listener machinery is gone.

**Dead code removed.** `useBattle()` monolithic selector, `syncedRef`,
all `DIAG` constants, unused imports — grep-verified clean.

**Tests, typing, lint green.** Re-confirmed in this review:
- `npx tsc --noEmit` — exit 0.
- `npx eslint .` — 0 errors, 0 warnings.
- `npx vitest run` — 14 files, 127 tests, all pass.

---

## 4. What Remains Risky or Incomplete

The list is deliberately short and specific. Nothing on it is a blocker —
each is bounded and has a known mitigation or verification path.

**4.1 Registration fix is hypothesis-driven.**
`auth/hooks.ts:29-31` sends both `kc_action=register` and
`prompt=create`. This is the most-likely Keycloak-version-dependent
root cause of the reported breakage, but the actual breakage was not
reproduced in a browser from the implementation session. If the real
issue is realm-side (`registrationAllowed: false`, unregistered
redirect URI, realm theming incompatibility), the client-side change
alone will not close it. **Evidence:** the plan explicitly notes this
(S4 deviations). **Impact:** first-touch UX for new users; a broken
Register button is a hard stop for acquisition. **Mitigation:** browser
verify — inspect the outbound authorize URL, confirm both parameters
are sent, confirm Keycloak shows the registration form not the login
form, confirm the callback lands the user in Draft state.

**4.2 Logout fix is hypothesis-driven.**
`auth/hooks.ts:34-70` addresses the most plausible race (re-populate
through intervening render) and adds a hard-nav fallback if
`signoutRedirect` rejects. The underlying root cause of the reported
breakage was not reproduced from the implementation session either. If
the real issue is Keycloak-side (`post_logout_redirect_uri`
unregistered, `end_session_endpoint` 404'ing, CORS), the client-side
change merely makes failure observable and recoverable rather than
silently broken. **Impact:** users who think they logged out but are
still authenticated on the server. **Mitigation:** browser verify —
two tabs, log out in one, confirm the other transitions to guest on
refresh; inspect the network log for the `end_session_endpoint` hit.

**4.3 Browser manual sweeps for S1–S5 still owed.**
`frontend-remediation-issues.md:11-24` still lists the S1/S2/S3/S4
manual sweeps under "Open / Deferred." S5's own log claims the earlier
sweeps were closed on the human side, but the issues file was not
updated to reflect that. This is a documentation inconsistency, not a
code problem — but it means a gate reviewer (me) cannot confirm what
was actually verified in a browser and what is still tested only by
construction. **Impact:** the gate above is conditional on these
being real. **Mitigation:** run the four highest-risk sweeps (§6);
reconcile the issues file.

**4.4 `useNetworkRecovery` does not re-join the battle.**
The hook calls `hub.connect()` on `failed` hubs. The battle hub's
`onConnectionStateChanged` handler (`modules/battle/hooks.ts:77-110`)
only re-calls `joinBattle(battleId)` when `phase === 'ConnectionLost'`.
Once the store transitions to `phase === 'Error'`
(hooks.ts:99-108 — "automatic reconnect budget exhausted"), a
subsequent network-recovery reconnect restores SignalR but the battle
is NOT rejoined. **Impact:** low — the `LeaveBattleEscape` button is
rendered in the Error phase, so the user has an out; and chat
reconnect still works. But the "wake from sleep → auto-rejoin the
battle you were in" dream is incomplete. **Mitigation:** either
document as an acceptable MVP compromise or extend the
`onConnectionStateChanged` Error-phase handler to attempt rejoin on
reconnect. The latter is ~5 lines; acceptable as a bounded follow-up.

**4.5 `BattleResultScreen` "Play Again" is a dead label.**
`modules/battle/screens/BattleResultScreen.tsx:119-139` — both the
"Return to Lobby" and "Play Again" buttons call the same `handleReturn`.
There is no logic that actually re-queues the player. **Impact:** UX
inconsistency; "Play Again" is misleading. **Mitigation:** either
wire it to `joinQueue` post-navigate or rename it ("Back to Lobby" x2
loses nothing). Bounded, ~5 lines.

**4.6 Type-shape landmine in guard/handoff tests.**
`guard-decisions.test.ts:34-48` and `post-battle-handoff.test.ts:20-32`
define a `CharacterResponse`-shaped object with INVENTED field names
(`identityId`, `displayName`, `xp`, `unspentStatPoints`,
`stateRevision`) that do not match the real `CharacterResponse` shape
from `types/api.ts:43-55` (`characterId`, `name`, `totalXp`,
`unspentPoints`, `revision`). Type-checks only because of an
`as CharacterResponse` cast. **Impact:** tests pass because the code
under test only reads `onboardingState` — which IS a real field. But
the tests are misleading for future readers and will silently drift
if the real type changes. **Mitigation:** two-minute fix to use real
field names. Not a gate-failing issue; noted as a real item for the
next touch.

---

## 5. Regressions or Weak Fixes

**5.1 Manual-sweep documentation is not self-consistent.** The S5 log
(line 660-665) says "the S1-S4 browser manual sweeps were completed on
the human side before S5 was authorized." The issues file
(frontend-remediation-issues.md:11-24) still lists those sweeps as
"Open / Deferred" and the "Closed by later stages" section is empty.
One of these two sources is wrong. Given that this gate review
cannot observe a browser, I can only trust the code — and the code
is what it is.

**5.2 Error-phase UX on battle hub `failed` is functional but not
graceful.** The `LeaveBattleEscape` is good, but the error banner
copy is static — the user is told "the connection to the battle was
lost and could not be restored" and given one button. A second
affordance ("Try again" — call `battleHubManager.connect()` + rejoin
if still Matched on the server) would be better. This is a P2-level
improvement, not a regression.

**5.3 `useMatchmaking`'s `inactive` reset effect is idempotent-by-
accident.** `hooks.ts:54-69` resets the matchmaking store whenever
`queueStatus` is null/Idle/NotQueued. Because the effect reads
`mm.searchStartedAt / mm.battleTransitioning / mm.consecutiveFailures`
via `getState()` (not via subscription), it only writes when one of
them is non-empty. Without that guard it would ping-pong on every
render while idle. The current code is correct but fragile — a future
reader adding "just one more reset field" without guarding it could
introduce a render loop. This is a minor maintainability note; not a
functional problem today.

**5.4 S3 and S5 logs mark stages `Completed` before browser verify is
done.** That is consistent with the user's instruction to log the
pending sweep as a follow-up rather than hold the stage open — but
taken at face value it can create the impression that remediation is
more complete than it is. This gate review exists to counter that
impression; the verdict above reflects the corrected reading.

---

## 6. Bounded Follow-Up List

Short list. These are what the team should actually do next.

1. **Browser verify the four known-risk paths.** Registration (§4.1),
   logout (§4.2), crash recovery (throw from `FighterCard`,
   `BattleResultScreen`, lobby), post-battle handoff (queue → match →
   battle → result dismiss → lobby, no bounce, no double-render).
   Reconcile `frontend-remediation-issues.md` with the results.
   Estimated effort: 45 minutes. **Do this before ship.**
2. **Decide about "Play Again."** Either wire it to `joinQueue` or
   rename to match "Return to Lobby." ~5 lines.
3. **(Optional) Extend network-recovery to rejoin battle from
   `phase === 'Error'`.** ~10 lines in
   `modules/battle/hooks.ts`. Acceptable MVP compromise to defer.
4. **Fix the `mkCharacter` field names** in two tests. Two-minute
   cleanup; reduces confusion for the next reader.

Everything else in plan §7 stays post-MVP as originally scoped. Do
not expand this list.

---

## 7. Exit Recommendation

**Close the remediation phase and schedule an immediate short
hardening pass** focused exclusively on item 1 in §6 (browser verify
+ issues-file reconciliation). That is the one outstanding liability
that prevents this gate from being unqualified PASS.

Concretely:
- Stop adding remediation-labeled work.
- Do the 45-minute browser sweep and update
  `frontend-remediation-issues.md`.
- If the browser sweep surfaces any confirmed blocker in registration
  or logout, treat it as a ship blocker but not a reopened
  remediation phase — fix it in a normal-development cycle.
- Otherwise: remediation is done. Continue normal development on
  product features, deferred post-MVP polish (plan §7), or whichever
  next work the team chooses.

The frontend is stable, recoverable, and credible enough. Move on.

---

End of review.

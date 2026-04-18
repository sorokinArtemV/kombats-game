# Frontend Remediation — Open Issues / Deferred Items

Short index of items surfaced during the staged remediation (see `frontend-remediation-log.md`) that are either deferred to a later stage or documented as out-of-scope per the corrected execution plan.

One line per item. Add an entry only when it comes up during an actual stage — do not pre-populate from the audit catalog.

---

## Open / Deferred

- **S1 browser-side manual verification** — the gate in §6 Stage S1 calls for a live-browser crash-recovery test (throw from `FighterCard`, from `BattleResultScreen`, from lobby; confirm recovery lands the user in the right place; confirm no white-screen). Unit tests + trace-through cover the logic, but a human browser session must still verify the end-to-end flow. Follow up in the next human session.
- **S2 browser-side manual sweep** — the gate in §6 Stage S2 is a live run through queue → match → battle → result dismiss → lobby; cancel during search; refresh mid-search; refresh on the result screen; re-queue immediately after battle. 30 store/guard tests pin the logic, but the polling lifecycle + BFF round-trip + navigation timing still need a human session.
- **S3 browser-side manual sweep** — four scenarios from §6 Stage S3 that require a live browser:
  1. Cold boot with Keycloak unreachable → retry banner appears after 12s; retry button re-runs bootstrap cleanly.
  2. Sign out end-to-end → user lands on `/` as a guest; is not silently re-authenticated; `signoutRedirect` success path exercised.
  3. Force battle hub `failed` (block SignalR domain in devtools during a live battle) → "Leave battle" button renders, navigates to `/lobby`, BattleGuard does not bounce back into the broken battle.
  4. Network drop + recovery → `window.online` fires, failed hubs reconnect without a refresh.
- **S4 browser-side manual sweep** — registration fix verification + onboarding error UX:
  1. Register flow: from `/`, click Register → Keycloak shows the registration form (not the login form) → complete → `/auth/callback` → `/onboarding/name` in Draft state. Inspect the authorize URL to confirm both `kc_action=register` and `prompt=create` are sent.
  2. Full onboarding happy path: name → stats → lobby.
  3. Onboarding error paths (observed): duplicate name (409), revision mismatch (409 on allocate), network failure on each mutation. Each shows a recoverable error + a working retry.
  4. Chat `OnlinePlayersList`: row hover reveals DM button; clicking row calls view-profile; clicking DM button calls send-message. No React DOM warning about nested interactive elements in the console.
- **Type-shape landmine in `guard-decisions.test.ts`** — `mkCharacter()` uses invented field names relative to `CharacterResponse`. Type-checks via cast only. Not a correctness bug (guard logic reads only `onboardingState`) but misleading for future readers. Touch when the post-MVP F-TY1-5 type-tightening campaign lands.

---

## Closed by later stages

_No items yet._

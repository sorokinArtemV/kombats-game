# Frontend Execution Issues

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

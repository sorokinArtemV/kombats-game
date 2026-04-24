# Migration Map

Per-step migration plan. Read MIGRATION_RULES.md first — it's the contract.

Each entry below cross-references:
- **DESIGN_REFERENCE.md** for the visual spec.
- **PRODUCTION_ARCHITECTURE.md** for the existing code surface.

Work the steps in the order presented. The numbered sections are dependency-ordered: foundation first, simple screens to validate the pipeline, then increasingly complex screens.

---

## Step 0 — Design Tokens & Shared Foundation

**No production component yet.** This is the prerequisite for every screen below.

**Design reference:**
- DESIGN_REFERENCE.md §2 (full token catalog: colors, typography, spacing, radius, blur, shadows, text shadow, animation timing).
- DESIGN_REFERENCE.md §3.1 (glass panel signature surface).
- DESIGN_REFERENCE.md §3.14 (custom scrollbar `.kombats-scroll`).

**Production target files:**
- `src/Kombats.Client/src/ui/theme/tokens.css` — extend with Kombats palette.
- `src/Kombats.Client/src/ui/theme/fonts.css` — create (mirror design app's `styles/fonts.css`).
- `src/Kombats.Client/src/index.css` — extend `@theme` block with new token mappings; add `@import './ui/theme/fonts.css'`.

**Migration scope:**
- [ ] Add color tokens to `tokens.css`:
  - Surfaces: `--color-kombats-charcoal`, `--color-kombats-ink-navy`, `--color-kombats-deep-indigo`, `--color-kombats-smoke-gray`.
  - Glass surface variants: `--color-glass`, `--color-glass-dense`, `--color-glass-subtle`, `--color-glass-solid` (the `rgba(15, 20, 28, …)` set).
  - Accent gold scale: `--color-kombats-gold`, `--color-kombats-gold-light`, `--color-kombats-gold-dark`, plus `--color-accent-text` (gold @ 0.9 alpha) and `--color-accent-muted` (@ 0.6).
  - Ceremonial bright gold: `--color-victory-gold` (`#E8B830`).
  - Crimson scale: `--color-kombats-crimson`, `--color-kombats-crimson-dark`, `--color-kombats-crimson-light`.
  - Jade scale: `--color-kombats-jade`, `--color-kombats-jade-dark`, `--color-kombats-jade-light`.
  - Moon silver scale: `--color-kombats-moon-silver`, `--color-kombats-moon-silver-light`, `--color-kombats-moon-silver-dark`.
  - Text: `--color-text-primary` (`#e8e8f0`), `--color-text-secondary` (75% alpha), `--color-text-muted` (48% alpha) — these REPLACE the current pure-white text tokens; verify the existing battle/lobby UI still reads correctly.
  - Borders: `--color-border-subtle` (`rgba(255,255,255,0.06)`), `--color-border-divider` (`rgba(255,255,255,0.04)`), `--color-border-emphasis` (`rgba(255,255,255,0.12)`).
- [ ] Add geometry tokens:
  - Radius: existing `--radius-sm`/`--radius-md`/`--radius-lg` already match (4 / 8 / 12 px).
  - Blur: `--blur-panel` (`blur(20px)`), `--blur-subtle` (`blur(10px)`).
  - Shadow: `--shadow-panel`, `--shadow-panel-lift` (the dual outer + inset highlight values from DESIGN_REFERENCE.md §2.6).
  - Text shadow: `--shadow-text-on-glass`, `--shadow-text-on-glass-strong` (DESIGN_REFERENCE.md §2.7).
- [ ] Add typography tokens:
  - `--font-display`: `"Cinzel","Trajan Pro","Noto Serif JP",serif` (REPLACES the current `Orbitron` value — verify nothing uses `font-display` for body text).
  - `--font-primary`: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
  - `--font-jp`: `"Noto Sans JP","Inter",sans-serif` (for h1–h6).
  - `--font-glyph`: `"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif` (for the diamond-frame ideogram).
- [ ] Map relevant tokens to Tailwind utilities in `index.css` `@theme` block: `--color-glass`, `--color-text-muted`, etc. Existing tokens (`--color-bg-primary`, etc.) stay; new tokens are added alongside.
- [ ] Add `fonts.css` with the Google Fonts `@import url(...)` line (Inter + Noto Sans JP) and base `font-family` rules for `:root`, `h1..h6`, `button`. Cinzel is system-fallback only.
- [ ] Add the `.kombats-scroll` scrollbar utility class (DESIGN_REFERENCE.md §3.14) to `index.css` — scoped, opt-in.
- [ ] Verify `pnpm build` and the SplashScreen renders unchanged (this step adds tokens but doesn't consume them yet).

**Complexity:** Low (mechanical, but touches global CSS).
**Dependencies:** None.
**Risk areas:**
- Renaming/replacing `--font-display` could regress screens that already use `font-display`. Audit usages first (`grep -r 'font-display'`).
- Replacing pure-white text tokens with `#e8e8f0`/0.75/0.48 alpha tokens changes contrast. Visual diff every existing screen.
- Tailwind 4's `@theme` only re-exports tokens you list; don't forget to map the new ones.

**Commit:** `ui: add Kombats design tokens to theme`

---

## Step 1 — Shared Assets

**No production component yet.** Foundation for every screen that uses fighter/background art.

**Design reference:** DESIGN_REFERENCE.md §4.

**Production target folder:** `src/Kombats.Client/src/ui/assets/` (create if missing).

**Migration scope:**
- [ ] Copy and optimize backgrounds → `ui/assets/backgrounds/`: `bamboo.png`, `blood_moon.png`, `desert.png`, `dodjo.png`, `full_moon.png`, `sakura.png`, plus `bg-1.png` (the moonlit village currently used everywhere).
- [ ] Copy and optimize fighters → `ui/assets/fighters/`: `female_archer.png`, `female_ninja.png`, `ronin.png`, `shadow_assassin.png`, `shadow_oni.png`, `silhouette.png`, plus `charackter.png` (default sprite).
- [ ] Copy and optimize icons → `ui/assets/icons/`: `mitsudamoe.png`, `kunai.png`.
- [ ] Run SVGO on any SVGs (none in design app currently — all PNGs).
- [ ] Decide on PNG → WebP conversion budget; document the call.
- [ ] Confirm Vite picks up imports from `ui/assets/` (it should — standard Vite static handling).

**Complexity:** Low.
**Dependencies:** None.
**Risk areas:**
- File sizes are large (~3 MB per fighter). If bundle size becomes an issue, schedule a separate WebP conversion pass.
- Asset folder name is `backgronds` (sic) in the design app. Rename to `backgrounds` here.

**Commit:** `ui: add design assets (fighters, backgrounds, icons)`

---

## Step 2 — NotFoundScreen (404)

**Production component:** `src/Kombats.Client/src/app/NotFoundScreen.tsx`
**Design reference:** DESIGN_REFERENCE.md §1.9
**Stores/hooks used:** none
**API/WebSocket calls:** none
**Current styling approach:** Tailwind only — KOMBATS wordmark + "Signal Lost · 404" subtitle + body copy + Return Home `<Link>`.

**Migration scope:**
- [ ] Tokens needed (all from Step 0): `--color-kombats-ink-navy` (page bg), `--color-kombats-gold` (404 number), `--font-display` (Cinzel), `--shadow-text-on-glass` for the gold glow.
- [ ] Assets: `mitsudamoe.png` (decorative icon at 35% opacity, 100×100, above the 404).
- [ ] Rewrite JSX to mirror DESIGN_REFERENCE.md §1.9: glass `Panel` (centered), Mitsudomoe icon, Cinzel `404` number (64 px, gold, gold text-shadow), `PATH NOT FOUND` small caps subtitle, single primary CTA.
- [ ] Replace the current `<Link to="/">` with the same accent-styled CTA shape used by DESIGN_REFERENCE.md §5.1 Button (variant primary, size md). Keep it as a `<Link>` — don't change the navigation behavior.
- [ ] Apply Tailwind classes referencing the new tokens.
- [ ] Add no animations.
- [ ] Verify the catch-all route still resolves `*` to this screen and the Return Home link still navigates to `/`.

**Complexity:** Low.
**Dependencies:** Step 0 (tokens), Step 1 (mitsudomoe icon).
**Risk areas:**
- Cinzel font is system-fallback. Test on a machine without Cinzel installed; fallback should land on Trajan/Noto Serif JP/serif and still look acceptable.
- Don't change the `<Link to="/">` — the destination matters (UnauthenticatedShell will redirect onward if the user is authenticated).

**Commit:** `ui: migrate NotFoundScreen visual design`

---

## Step 3 — LoadingScreen / SplashScreen

**Production component:** `src/Kombats.Client/src/ui/components/SplashScreen.tsx` (rendered by `AuthGuard`, `UnauthenticatedShell` during bootstrap, `GameStateLoader`, `AuthCallback`)
**Design reference:** DESIGN_REFERENCE.md §1.8 (LoadingScreen) + §3.12 (Mitsudomoe spinner)
**Stores/hooks used:** none
**API/WebSocket calls:** none
**Current styling approach:** Tailwind — flex-centered KOMBATS wordmark + a generic `Spinner` (border-radius spinner with `animate-spin`).

**Migration scope:**
- [ ] Tokens needed (from Step 0): `--color-kombats-ink-navy`, `--color-kombats-gold` family, `--color-accent-muted`, `--font-display`.
- [ ] Assets: `mitsudamoe.png` (Step 1).
- [ ] Rewrite JSX to the three-layer mitsudomoe stage (DESIGN_REFERENCE.md §1.8 + §3.12):
  1. 320 × 320 stage container (centered).
  2. Radial gold glow (background `radial-gradient`, no animation).
  3. 220 × 220 hairline ring, counter-rotating via `motion.div` (`animate={{ rotate: -360 }}`, 12 s linear infinite).
  4. 140 × 140 Mitsudomoe icon, rotating via `motion.img` (`animate={{ rotate: 360 }}`, 8 s linear infinite, opacity 0.5, `mix-blend-mode: screen`).
- [ ] Add the pulsing "Loading" label below the stage: Cinzel 14 px, 0.24em tracking, muted gold; opacity pulses 0.6 → 1 → 0.6 over 3 s easeInOut.
- [ ] Use scoped `style={{}}` blocks for the radial-gradient backgrounds (not expressible as Tailwind utilities). Add a brief comment.
- [ ] Respect `prefers-reduced-motion`: skip both rotations and the opacity pulse, render the stage statically.
- [ ] Verify SplashScreen still renders during: bootstrap silent restore (UnauthenticatedShell), auth loading (AuthGuard), game state pending (GameStateLoader), auth callback (AuthCallback).

**Complexity:** Low–Medium (introduces `motion`, mix-blend-mode, radial gradients).
**Dependencies:** Step 0 (tokens), Step 1 (mitsudomoe icon).
**Risk areas:**
- `Spinner` is also used inline in `Button` (loading state). DO NOT replace `Spinner` — only update `SplashScreen`. The inline spinner stays.
- StrictMode mounts SplashScreen twice on dev. Confirm the rotations don't visually glitch on re-mount.
- `mix-blend-mode: screen` against very dark backgrounds is safe; verify the icon still reads.

**Commit:** `ui: migrate SplashScreen visual design`

---

## Step 4 — UnauthenticatedShell (Login / Guest Landing)

**Production component:** `src/Kombats.Client/src/app/shells/UnauthenticatedShell.tsx`
**Design reference:** DESIGN_REFERENCE.md §1.1 (LoginScreen) + §3.2 (diamond logo) + §3.3 (ambient glow) + §3.4 (Cinzel title bloom) + §5.1 (Button)
**Stores/hooks used:** `useAuthStore` (`authStatus`, `authError`); `useAuth()` (`login`, `register`)
**API/WebSocket calls:** none directly (login/register call `oidcAuth.signinRedirect` → Keycloak)
**Current styling approach:** Tailwind — bg-bg-primary screen, header with KOMBATS, centered hero with title + tagline + Login/Register buttons + bootstrap_timeout error banner with Retry.

**Migration scope:**
- [ ] Tokens needed (Step 0): `--color-kombats-ink-navy`, glass tokens, gold scale, `--shadow-panel-lift`, text/border tokens, `--font-display`, `--font-glyph`.
- [ ] Assets: none new (logo is the inline `拳` glyph + diamond frame).
- [ ] Rewrite JSX:
  - Page wrapper centered (`min-h-screen flex items-center justify-center`), with the ambient gold glow (DESIGN_REFERENCE.md §3.3) painted absolutely behind.
  - Glass `Panel` (use the panel pattern from DESIGN_REFERENCE.md §3.1: `surface.glass` + `blur(20px)` + subtle border + `panel-lift` shadow + `radius.lg`).
  - Inside: 60 × 60 diamond logo (DESIGN_REFERENCE.md §3.2 — rotated 45°, gold border, gold inner-glow, counter-rotated 拳 ideogram).
  - Title `THE KOMBATS` — Cinzel 28 px, gold, 0.20em tracking, gold text-shadow bloom.
  - Tagline `Enter the Arena` — uppercase muted, 12 px / 0.24em tracking.
  - Two stacked full-width buttons: primary "Log In" (gold fill), secondary "Sign Up" (outlined). Wire to `useAuth().login` and `useAuth().register` — DO NOT change behavior.
- [ ] Preserve the `bootstrap_timeout` error banner (DESIGN_REFERENCE.md doesn't speak to this — keep the existing layout, restyle to match the new accent/text/border tokens). Retry button must still call `retryBootstrap()` from `modules/auth/bootstrap-retry.ts`.
- [ ] Preserve the early-return for `authStatus==='loading'` → `<SplashScreen />` and the `Navigate to="/lobby"` for `authStatus==='authenticated'`.
- [ ] No animations on title/buttons (the design treats the login as static).
- [ ] Verify: clicking Log In opens Keycloak login; clicking Sign Up opens Keycloak registration; `bootstrap_timeout` banner appears when silent SSO fails; refreshing while authenticated does NOT flash this screen.

**Complexity:** Medium (introduces glass panel + ambient glow + diamond logo patterns; reused later).
**Dependencies:** Step 0 (tokens), Step 3 (Splash for the loading branch).
**Risk areas:**
- The `bootstrap_timeout` retry path is fragile — don't accidentally remove the conditional render.
- `useAuth()` returns wrapped versions of `signinRedirect`/`removeUser`/`signoutRedirect`. Don't bypass the hook.
- The diamond logo is reused in the lobby header — extract its CSS to a small utility class in `index.css` so the lobby header reuses it (DESIGN_REFERENCE.md §5.8).

**Commit:** `ui: migrate UnauthenticatedShell visual design`

---

## Step 5 — OnboardingShell + NameSelectionScreen + InitialStatsScreen

The design app has **one** OnboardingScreen (DESIGN_REFERENCE.md §1.2) that combines name + avatar selection. Production has **two screens** (Name → Stats), driven by guard logic. Migrate both, but keep the visual language consistent.

### 5a. OnboardingShell (chrome)

**Production component:** `src/Kombats.Client/src/app/shells/OnboardingShell.tsx`
**Design reference:** DESIGN_REFERENCE.md §1.2 background pattern (cover-fit `bg-1.png` + ink-navy gradient overlays).
**Stores/hooks used:** none
**API/WebSocket calls:** none
**Current styling approach:** Tailwind — top bar with KOMBATS, centered max-w-lg card with `<Outlet />` inside.

**Migration scope:**
- [ ] Add the moonlit background scene (`bg-1.png`) as a full-bleed cover image with the two ink-navy gradient overlays from DESIGN_REFERENCE.md §1.2.
- [ ] Restyle the top bar: glass background (use the glass tokens), Cinzel KOMBATS wordmark on the left, no nav.
- [ ] Restyle the centered card: glass `Panel` (`surface.glass`, `radius.md`, `panel` shadow, subtle border) — same `<Outlet />` injection point.
- [ ] Don't add the fighter sprite anchor (the production onboarding doesn't have an avatar selector — see migration note below).

**Complexity:** Low.
**Dependencies:** Steps 0–1.
**Risk areas:** None significant — chrome only.

**Commit:** `ui: migrate OnboardingShell visual design`

### 5b. NameSelectionScreen

**Production component:** `src/Kombats.Client/src/modules/onboarding/screens/NameSelectionScreen.tsx`
**Design reference:** DESIGN_REFERENCE.md §1.2 (the name-input portion + OnboardingCard §5.11) + §5.7 (TextInput pattern) + §5.1 (Button)
**Stores/hooks used:** `usePlayerStore` (`character`, `updateCharacter`); `useMutation(characterApi.setName)` with `gameKeys.state()` invalidation
**API/WebSocket calls:** `POST /api/v1/character/name`
**Current styling approach:** Tailwind — header (Choose Your Name + subtitle), `NameInput` component, primary `Button` with `loading` state.

**Migration scope:**
- [ ] Use the `OnboardingCard` composition from DESIGN_REFERENCE.md §5.11: eyebrow ("Welcome") + Cinzel title ("Choose Your Name") + subtitle + Divider + content section.
- [ ] Restyle `NameInput` (`modules/onboarding/components/NameInput.tsx`) and the underlying `TextInput` (`ui/components/TextInput.tsx`) to match DESIGN_REFERENCE.md §5.7: 11 px uppercase label with 0.18em tracking, dark input bg, accent-muted focused border, error border in crimson, helper row with left message + right char counter (`{current}/{max}`).
- [ ] Restyle the primary CTA via `Button` to the new variants from DESIGN_REFERENCE.md §5.1 (gold fill, 13 px, 0.18em tracking, uppercase). Preserve the `loading` prop (it ships a `<Spinner />` — do not break that integration).
- [ ] **Do NOT add the avatar grid from DESIGN_REFERENCE.md §1.2.** Production has no avatar selection — adding it would require backend support that doesn't exist. Document this divergence in the PR.
- [ ] Preserve all logic: client-side `validateName`, mutation onSuccess that updates character + invalidates state, error handling for 409 (duplicate name) and 400 (validation details).
- [ ] Verify: name <3 chars rejected, name >16 chars rejected, duplicate name returns the dedicated 409 message, successful submit advances to `/onboarding/stats`.

**Complexity:** Medium.
**Dependencies:** Step 0, Step 1, Step 5a.
**Risk areas:**
- `TextInput` is also used by chat (`MessageInput`) and the chat dock's input pill via the design `ChatDock` pattern. Restyling `TextInput` ripples; budget extra time to visual-diff chat.
- `Button`'s `loading` prop renders a Spinner inline; the primary visual update must not break that.

**Commit:** `ui: migrate NameSelectionScreen visual design`

### 5c. InitialStatsScreen

**Production component:** `src/Kombats.Client/src/modules/onboarding/screens/InitialStatsScreen.tsx`
**Design reference:** DESIGN_REFERENCE.md §5.11 (OnboardingCard) + §5.13 (RewardRow as inspiration for stat-row visuals)
**Stores/hooks used:** `usePlayerStore` (character, updateCharacter); `useAllocateStats()` (manages add/remove + `expectedRevision` for OCC)
**API/WebSocket calls:** `POST /api/v1/character/stats`
**Current styling approach:** Tailwind — header, four `StatPointAllocator` rows, "Points remaining" tally row, error message, Confirm button.

**Migration scope:**
- [ ] Wrap content in the same `OnboardingCard` shape used by 5b: eyebrow ("Onboarding") + Cinzel title ("Allocate Stats") + subtitle.
- [ ] Restyle `StatPointAllocator` (`ui/components/StatPointAllocator.tsx`) to use the new tokens. Increment/decrement buttons can use the secondary button variant.
- [ ] Restyle the "Points remaining" row using the `RewardRow` pattern (DESIGN_REFERENCE.md §5.13): glass-subtle inset row, label left, tabular-nums value right (gold for the remaining points).
- [ ] Restyle the error message (red, centered).
- [ ] Restyle the Confirm CTA (primary Button).
- [ ] Preserve all logic: `useAllocateStats` returns `added`/`remaining`/`canIncrement`/`canDecrementStat`/`submit`/`isPending`; on success the hook auto-flips `onboardingState: 'Ready'` so OnboardingGuard redirects to `/lobby`.
- [ ] Verify: incrementing past available points is blocked; decrementing below base is blocked; submitting persists stats and redirects to `/lobby`; a 409 (revision mismatch from concurrent change) shows the error gracefully.

**Complexity:** Medium.
**Dependencies:** Step 0, Step 5b (shared CTA + OnboardingCard pattern).
**Risk areas:**
- `expectedRevision` in `AllocateStatsRequest` is the optimistic-concurrency token. Don't accidentally drop it from the form payload.
- `StatPointAllocator` is reused by `StatAllocationPanel` in the lobby (post-level-up flow). Restyling here ripples.

**Commit:** `ui: migrate InitialStatsScreen visual design`

---

## Step 6 — Shared Session Chrome (SessionShell + AppHeader + BottomDock)

The design app's `GameShell` (DESIGN_REFERENCE.md §5.14) + `TopNavBar` (§5.8) + `ChatDock` (§5.9) collectively provide the persistent chrome for every authenticated screen. Production splits this across `SessionShell`, `AppHeader`, and `BottomDock`.

### 6a. SessionShell (layout chrome)

**Production component:** `src/Kombats.Client/src/app/shells/SessionShell.tsx`
**Design reference:** DESIGN_REFERENCE.md §5.14 (GameShell layered layout)
**Stores/hooks used:** mounts `useChatConnection()` and `useNetworkRecovery()`
**API/WebSocket calls:** indirect (chat hub connection)
**Current styling approach:** Tailwind — `flex h-screen flex-col` with `AppHeader` on top, `<Outlet />` in the central region, `BottomDock` at the bottom (hidden when path ends with `/result`).

**Migration scope:**
- [ ] Restyle the outer container with the ink-navy background and ensure full-screen overflow handling matches DESIGN_REFERENCE.md §5.14.
- [ ] Keep the existing `flex-[3]` central + `flex-[2]` bottom dock split (or adjust to design's 60/40, whichever reads better with the new visual). Do NOT change the `isBattleResult` conditional — the dock must hide on `/result`.
- [ ] DO NOT introduce the design app's `bottomOverlay` pointer-events-none float pattern; production uses an in-flow flex layout for accessibility/keyboard reasons.
- [ ] Verify chat hub still mounts/unmounts at this level; verify lobby↔battle navigation does not reset the chat session.

**Complexity:** Low.
**Dependencies:** Step 0.
**Risk areas:**
- The `flex-[3]/flex-[2]` proportions are battle-tested. Don't break the lobby/battle layout when adjusting.

**Commit:** `ui: migrate SessionShell visual design`

### 6b. AppHeader (top nav)

**Production component:** `src/Kombats.Client/src/app/AppHeader.tsx`
**Design reference:** DESIGN_REFERENCE.md §5.8 (TopNavBar) + §3.2 (diamond logo)
**Stores/hooks used:** `useAuth()` (displayName, logout); `usePlayerStore` (character — for profile label)
**API/WebSocket calls:** `useAuth().logout()` triggers Keycloak signout
**Current styling approach:** Tailwind — KOMBATS wordmark, hidden-on-mobile nav (News/Rules/FAQ/Community placeholder buttons), profile dropdown via `@radix-ui/react-dropdown-menu` with Sign out item.

**Migration scope:**
- [ ] Apply the TopNavBar pattern (DESIGN_REFERENCE.md §5.8): full-bleed glass header with the gradient-to-transparent background and reveal-on-hover bottom border (transparent → gold @ 0.40 alpha on hover/focus-within).
- [ ] Replace the inline KOMBATS span with the diamond-logo + Cinzel wordmark stack (DESIGN_REFERENCE.md §5.8 Logo block + §3.2). Reuse the diamond logo CSS extracted in Step 4.
- [ ] Restyle nav links to match the NavButton pattern: 11 px uppercase, 0.18em tracking, muted → gold on hover, growing-from-center underline. Keep the `hidden sm:flex` responsive behavior.
- [ ] Restyle the right-side actions row (profile dropdown trigger). Add a vertical hairline divider between nav and right actions per the design.
- [ ] Keep the dropdown content: profile label = `character?.name ?? displayName ?? 'Profile'`. Restyle the dropdown panel to glass + subtle border + Sign out item with hover state.
- [ ] **Don't add new nav items.** News/Rules/FAQ/Community remain placeholders — no route exists for them. Don't wire them to anything new.
- [ ] Verify: dropdown opens/closes with keyboard (Radix), Sign out triggers `useAuth().logout()` and redirects through Keycloak end-session, profile label updates when character.name changes.

**Complexity:** Medium.
**Dependencies:** Step 0, Step 4 (diamond logo CSS).
**Risk areas:**
- The Radix `DropdownMenu` controls focus + open/close — don't replace with a custom popover.
- `useAuth().logout()` runs an ordered teardown (capture id_token_hint, removeUser, clearSessionState, signoutRedirect). Don't intercept it.

**Commit:** `ui: migrate AppHeader visual design`

### 6c. BottomDock (chat + players)

**Production component:** `src/Kombats.Client/src/app/BottomDock.tsx`
**Design reference:** DESIGN_REFERENCE.md §5.9 (ChatDock pattern) + §5.14 (GameShell bottom slot)
**Stores/hooks used:** local `useState` for active DM / profile player / conversations sheet open; child components consume `useChatStore` via the chat module's hooks.
**API/WebSocket calls:** chat hub messages and player presence events flow through child components.
**Current styling approach:** Tailwind — left flex section with `ChatErrorDisplay` + `ChatPanel`; right `aside` (320 px) with `OnlinePlayersList`; `Sheet`s for DMs and Conversations; modal `PlayerCard`.

**Migration scope:**
- [ ] Apply the ChatDock visual pattern from DESIGN_REFERENCE.md §5.9: glass panel container (`radius.lg`, `panel-lift` shadow), 3:1 chat:players split, soft-hairline dividers between header/content/footer rows.
- [ ] Restyle the chat-side header: "Room Chat" left + "Messages" button right (opens conversations Sheet). Keep behavior; restyle visuals.
- [ ] Restyle the right players column header to match the §5.9 pattern (gold Users icon + "Players in Chat" caption + tabular count).
- [ ] Restyle the `Sheet` (`ui/components/Sheet.tsx`) to use the glass surface tokens (it wraps `@radix-ui/react-dialog`).
- [ ] Restyle the `PlayerCard` modal (`modules/player/components/PlayerCard.tsx`) using glass + accent line + KPI-tile patterns (DESIGN_REFERENCE.md §5.12 FighterStatsPopover composition is the closest analog).
- [ ] Restyle child components: `ChatPanel` (§5.9 message rows + accent-text sender names), `OnlinePlayersList` (jade dot for online, glow), `ConversationList`, `DirectMessagePanel`, `ChatErrorDisplay` (banner styling).
- [ ] Add `.kombats-scroll` to the message feed and player list for the dark premium scrollbar (DESIGN_REFERENCE.md §3.14).
- [ ] Don't change the DM / conversations / profile state machine — the `useState` flags and Sheet handlers stay.
- [ ] Verify: send/receive global message, send/receive DM, presence join/leave updates, rate limit shows the error banner, opening a player profile renders the `PlayerCard`.

**Complexity:** High (touches the most child components).
**Dependencies:** Step 0, Step 1, Step 6a, Step 6b.
**Risk areas:**
- DM suppression for the in-battle opponent is store-level (`suppressedOpponentId` in `useChatStore`). UI changes here MUST NOT bypass the suppression — keep all message rendering driven by store data.
- Rate-limit banner state lives in `useChatStore.rateLimitState`. Don't reimplement.
- `Sheet` is also used elsewhere (currently just BottomDock, but it's a primitive). Restyle once, verify everywhere.
- Reconnect on `failed` chat state goes through `reconnectChat()` (from `modules/chat/hooks.ts`). The error banner's retry button must call it, not `chatHubManager.connect()` directly.

**Commit:** `ui: migrate BottomDock and chat components visual design`

---

## Step 7 — LobbyScreen

**Production component:** `src/Kombats.Client/src/modules/player/screens/LobbyScreen.tsx`
**Design reference:** DESIGN_REFERENCE.md §1.3 (MainHub / Lobby) + §5.10 (QueueCard) + §3.16 (Fighter sprite drop shadow) + §5.18 (FighterNameplate composition)
**Stores/hooks used:** `usePlayerStore` (`character`); `usePostBattleRefresh()`
**API/WebSocket calls:** indirect — `usePostBattleRefresh` invalidates `gameKeys.state()`; `QueueButton` calls `POST /api/v1/queue/join`.
**Current styling approach:** Tailwind — left `CharacterPortraitCard` (340 px), right flex section that conditionally renders either the post-level-up `<StatAllocationPanel />` (with `LevelUpBanner`) or the `<ReadyForCombatPanel>` (header + `QueueButton` + secondary actions + current build).

**Migration scope:**
- [ ] Tokens: glass surface, gold accent, jade for "Wins"/HP-high, crimson for "Losses".
- [ ] Assets: `bg-1.png` background (or pick a different scene), `charackter.png` for the fighter sprite anchor.
- [ ] Apply the lobby scene composition from DESIGN_REFERENCE.md §1.3:
  - Full-bleed background with the ink-navy bottom-gradient overlay.
  - Bottom-left fighter sprite anchor (DESIGN_REFERENCE.md §3.16 — `h-[82vh]`, `drop-shadow-2xl`, `marginBottom: '-17vh'`).
  - `FighterNameplate` (DESIGN_REFERENCE.md §5.18) above the sprite — feeds from `usePlayerStore.character`. The expandable `FighterStatsPopover` (§5.12) shows the player's attributes + record.
  - Center-screen QueueCard (DESIGN_REFERENCE.md §5.10) in `status="ready"` mode containing the `QueueButton`.
- [ ] Restyle `CharacterPortraitCard` (`modules/player/components/CharacterPortraitCard.tsx`) so it can be reused as the FighterNameplate's data source — OR build a separate `FighterNameplate` feature component in `modules/player/components/` that reads the same store fields. The latter is cleaner.
- [ ] Restyle `StatAllocationPanel` (`modules/player/components/StatAllocationPanel.tsx`) and `LevelUpBanner` (`modules/player/components/LevelUpBanner.tsx`) using the glass + accent-line + KPI patterns. The post-level-up flow is critical UX — verify it still appears whenever `character.unspentPoints > 0`.
- [ ] Restyle `QueueButton` (`modules/matchmaking/components/QueueButton.tsx`) using the QueueCard's "Join Queue" primary button. Keep the loading/error states.
- [ ] Drop the placeholder "Player Settings"/"Character Settings" SecondaryActions or restyle them to match the design's NavButton aesthetic — these are dead-ends today, decide whether to keep them.
- [ ] Preserve `usePostBattleRefresh()` mounting at the top of the screen.
- [ ] Verify: queue join navigates to `/matchmaking`; level-up banner appears after a battle if `unspentPoints > 0`; stat allocation persists; refreshing the page returns the user to `/lobby` correctly.

**Complexity:** High (introduces the fighter anchor pattern, FighterStatsPopover, QueueCard).
**Dependencies:** Steps 0, 1, 6.
**Risk areas:**
- `usePostBattleRefresh` runs a once-per-mount effect (DEC-5: 3-second retry if XP/level still stale). The hook must execute on every lobby mount; don't defer it behind a conditional render.
- The `unspentPoints > 0` branch is the single visible path for level-up reward. Verify with a real battle that triggered a level.
- `CharacterPortraitCard` is also used by `SearchingScreen`. Whatever you do here ripples to step 8.
- The fighter sprite at `h-[82vh]` overlaps the bottom dock. Verify with the dock active.

**Commit:** `ui: migrate LobbyScreen visual design`

---

## Step 8 — SearchingScreen

**Production component:** `src/Kombats.Client/src/modules/matchmaking/screens/SearchingScreen.tsx`
**Design reference:** DESIGN_REFERENCE.md §1.4 (QueueScreen) + §5.10 (QueueCard `status="searching"`) + §3.12 (Mitsudomoe spinner)
**Stores/hooks used:** `useMatchmaking()` (status, leaveQueue); `useMatchmakingPolling()`; reads `usePlayerStore.queueStatus` indirectly
**API/WebSocket calls:** `POST /api/v1/queue/leave` (cancel); `GET /api/v1/queue/status` (poll every 2 s)
**Current styling approach:** Tailwind — same left-card layout as Lobby (`CharacterPortraitCard`), right section with `SearchingIndicator` + status text + elapsed timer + Cancel `Button`.

**Migration scope:**
- [ ] Apply the searching variant of `QueueCard` (DESIGN_REFERENCE.md §5.10): PanelHeader in accent gold, MitsudomoeSpinner (200 / 140 / 88 scaled-down version), elapsed timer with Clock icon, secondary "Cancel Search" button, divider, "Finding Worthy Challenger" caption.
- [ ] Restyle `SearchingIndicator` (`modules/matchmaking/components/SearchingIndicator.tsx`) to the scaled-down Mitsudomoe spinner OR delete it and inline the spinner inside the QueueCard composition.
- [ ] Reuse the lobby's fighter anchor on the bottom-left.
- [ ] Status text mapping (preserve from the existing screen):
  - `status === 'searching'` → "Searching for opponent…"
  - `status === 'matched'` → "Opponent found — preparing battle…"
  - `status === 'battleTransition'` → "Entering battle…"
- [ ] Cancel button stays disabled while `cancelling`; preserves the `loading` prop.
- [ ] After 3+ failures show the muted warning text.
- [ ] Preserve `useMatchmakingPolling()` lifecycle — DO NOT relocate or wrap in a conditional render.
- [ ] Verify: timer counts up correctly; cancelling navigates back to `/lobby`; late-match scenario (cancel returns a `battleId`) navigates to `/battle/:id`; refreshing the page mid-search restores the screen.

**Complexity:** Medium.
**Dependencies:** Steps 0, 1, 7 (fighter anchor pattern reused).
**Risk areas:**
- The poller is stopped on unmount via the hook's cleanup. If you wrap the polling hook in a conditional, it never starts. Keep it at top level.
- The "battleTransition" status is a UI-only flag set by `useMatchmaking` between `leaveQueue` returning a battleId and the queue store write. Don't try to derive it differently.

**Commit:** `ui: migrate SearchingScreen visual design`

---

## Step 9 — BattleScreen

**Most complex screen.** Migrate in two passes if needed: pass 1 = layout + fighter cards, pass 2 = ZoneSelector + result/feed components.

**Production component:** `src/Kombats.Client/src/modules/battle/screens/BattleScreen.tsx`
**Design reference:**
- §1.5 (BattleScreen layout)
- §5.16 (BodyZoneSelector layout)
- §5.17 (Combat Panel Meta Row — round / timer / turn indicator)
- §5.18 (FighterNameplate)
- §3.11 (HP bar parallelogram)
- §3.13 (Body zone silhouette masking — full CSS)
- §3.16 (Fighter sprite drop shadow + opponent hue-rotate)
- §3.19 (Opponent sprite tinting)
- §3.20 (Battle log outcome pill)

**Stores/hooks used:** `useBattleStore` (phase, lastError, player IDs/names, HPs); `useAuthStore` (userIdentityId for self/opponent derivation); `usePlayerStore.returnFromBattle` (escape path); `useBattlePhase`, `useBattleHp`, `useBattleTurn`, `useBattleConnectionState`, `useBattleActions`; `useQuery(playerKeys.card(playerId))` × 2.
**API/WebSocket calls:** `GET /api/v1/players/:id/card` × 2; SignalR battle hub via `useBattleConnection` (mounted by `BattleShell`).
**Current styling approach:** Tailwind — three-column flex (`FighterCard` self / center action area / `FighterCard` opponent), with `TurnInfoBar`, `ActionPanelSlot` (switches between `ZoneSelector`/`WaitingPanel`/`TurnResultPanel` by phase), `NarrationFeed`, `BattleEndOverlay`.

**Migration scope:**
- [ ] Tokens: full Kombats palette (attack/block semantic colors, jade/crimson HP, glass surfaces).
- [ ] Assets: `bg-1.png` (or scene), `charackter.png` for sprites, `silhouette.png` for the BodyZoneSelector mask.
- [ ] Restyle the page background as in §1.5 (full-bleed scene + ink-navy gradient overlay).
- [ ] Anchor both fighter sprites at the bottom corners with `transform: scaleX(-1)` + `hue-rotate(180deg)` for the opponent (§3.19). Use `motion.img` for the entrance animation.
- [ ] Restyle `FighterCard` (`modules/battle/components/FighterCard.tsx`) to the `FighterNameplate` pattern (§5.18): name with double black drop-shadow, parallelogram HP bar (§3.11) — `hpBarMirror={true}` for the opponent, gold expand/collapse chevron, `FighterStatsPopover` opening above. Tonal split: `hpColor="jade"` for self, `hpColor="crimson"` for opponent.
- [ ] Build a 540 px center combat panel (§1.5) containing:
  - Cinzel "Select Attack & Block" header (or "Awaiting Opponent" when phase=`Submitted`).
  - Combat meta row (§5.17): 3-col grid `1fr auto 1fr` with Round label / Clock+timer / "Your Turn" or "Opponent's Turn" pill (gold dot with glow / muted dot).
  - Divider, then the BodyZoneSelector (§5.16 + §3.13).
- [ ] Replace the existing `ZoneSelector` (`modules/battle/components/ZoneSelector.tsx`) with the silhouette-based BodyZoneSelector (DESIGN_REFERENCE.md §3.13 — full CSS for masking, feathering, SVG outline filter). This is the single highest-effort piece of the migration. Build it as a new feature component (e.g. `modules/battle/components/BodyZoneSelector.tsx`).
  - **Critical:** action submission MUST still go through `useBattleActions().selectAttackZone(zone)` / `.selectBlockPair(pair)` / `.submitAction()` — these enforce `isValidBlockPair` and call `buildActionPayload`, which produces the JSON.stringify'd string the SignalR hub requires. The visual silhouette is decoration around that store API.
  - The block-pair list in production is `[Head,Chest], [Chest,Belly], [Belly,Waist], [Waist,Legs], [Legs,Head]` (zones from `modules/battle/zones.ts`). The design app uses Stomach/Waist; production uses Belly/Waist. **Use production names** — they map to the BFF DTOs.
  - Post-LOCK-IN (phase=`Submitted`), swap silhouette pair for the centered Mitsudomoe spinner (§3.12) like DESIGN_REFERENCE.md §1.5.
- [ ] Restyle `TurnTimer` (`modules/battle/components/TurnTimer.tsx`) to the inline Clock+number form used in §5.17.
- [ ] Restyle `TurnResultPanel`, `BattleEndOverlay`, `NarrationFeed` to the glass surface + outcome chip pattern (§3.20).
- [ ] Restyle the `ConnectionLost` and `Error`-phase banners with `LeaveBattleEscape` button — preserve the `returnFromBattle(battleId) + reset() + navigate('/lobby')` sequence.
- [ ] Add the selected-zone pulse animation (`kombats-zone-pulse` keyframes from §3.13).
- [ ] Verify EVERY phase transition still renders correctly: `Idle` / `Connecting` / `WaitingForJoin` (Spinner), `ArenaOpen` (TurnResult fallback), `TurnOpen` (BodyZoneSelector active), `Submitted` (mitsudomoe waiting), `Resolving` (waiting), `Ended` (BattleEndOverlay), `ConnectionLost` (banner), `Error` (banner + escape).
- [ ] Verify: clicking a zone selects it; clicking an invalid block pair is silently ignored (handled by `selectBlockPair`); submitting sends the right payload (network tab: `SubmitTurnAction` with a stringified JSON body); HP updates animate via `transition-[width] 300ms ease-out`; reconnect re-joins and re-applies snapshot.

**Complexity:** High (the BodyZoneSelector alone is several hundred lines of CSS/SVG).
**Dependencies:** Steps 0, 1, 6, 7 (fighter anchor + nameplate patterns).
**Risk areas:**
- **Don't touch `modules/battle/zones.ts`.** All payload construction and pair validation lives there.
- **Don't change `useBattleActions`.** It's the contract between UI and SignalR. Read it; don't rewrite it.
- The opponent's HP bar requires `hpBarMirror={true}` (per the existing FighterCard pattern) — visual mirror only; don't flip the text or the underlying numbers.
- The `myId === playerAId` derivation (BattleScreen.tsx ~line 37) determines self/opponent assignment. Don't reorder — the rest of the screen depends on it.
- BattleStateUpdated is the source of truth: when it arrives mid-Submitted phase, the local store deliberately keeps `Submitted` (see `serverPhaseToLocal`). Don't add UI logic that overrides that.
- The 60-second `staleTime` on player cards is enough for an entire battle. Don't shorten it.
- Use Framer Motion for sprite entry animations only. Don't animate HP fill manually — it uses CSS `transition-[width]`.

**Commit:** `ui: migrate BattleScreen visual design`

---

## Step 10 — BattleResultScreen (Victory + Defeat variants)

The design app has TWO screens: VictoryScreen (§1.6) and DefeatScreen (§1.7). Production has ONE `BattleResultScreen` that picks the `OUTCOME_TONE` based on `deriveOutcome(endReason, winnerPlayerId, myId)`. Migrate the single component, branching on `outcome === 'victory' | 'defeat' | 'other'` for the visual variant.

**Production component:** `src/Kombats.Client/src/modules/battle/screens/BattleResultScreen.tsx`
**Design reference:**
- §1.6 (VictoryScreen layered atmosphere)
- §1.7 (DefeatScreen layered atmosphere)
- §3.5 (Victory rotating rays — full conic-gradient CSS)
- §3.6 (Victory two-layer bloom)
- §3.7 (Defeat vignette)
- §3.8 (Defeat slashes — full SVG)
- §3.9 (Tapered title wing gradient)
- §3.4 (Cinzel title bloom — multi-layer text-shadow)
- §5.13 (RewardRow)
- §5.19 (Result Screen common styles — accent line, panel layout, exchange block)

**Stores/hooks used:** `useBattleStore` (phase, battleId, playerAId, names, endReason, winnerPlayerId); `useAuthStore` (userIdentityId); `usePlayerStore.returnFromBattle`; `useBattlePhase`, `useBattleResult`, `useResultBattleFeed`.
**API/WebSocket calls:** `GET /api/v1/battles/:battleId/feed` (HTTP backfill of the result feed).
**Current styling approach:** Tailwind — single section with a tone-driven container background, large outcome icon (Trophy/Close/Scales) in a tone-tinted circle, Cinzel title, subtitle, NarrationFeed-driven match summary, two CTAs (Return to Lobby / Play Again).

**Migration scope:**
- [ ] Tokens: ceremonial gold `--color-victory-gold` (`#E8B830`), crimson scales for defeat, glass surfaces, panel shadows.
- [ ] Background: scene image kept behind a dark overlay. Note SessionShell already hides the bottom dock for `/result` — the screen takes the full main area.
- [ ] **Victory layered atmosphere** (when `outcome === 'victory'`):
  - Dark overlay (rgba 0,0,0,0.65).
  - Rotating conic-gradient rays (`motion.div` with `animate={{ rotate: 360 }}`, 60 s linear infinite, masked to a small radial halo). Full CSS in §3.5.
  - Two-layer bloom (gold halo + white core) at 25% from top, behind the title (§3.6).
  - Tapered gold wing lines flanking the Cinzel `VICTORY` title (§3.9 + §3.4 multi-layer text-shadow).
  - Glass result panel (§5.19) with top accent line gradient transparent→gold→transparent (3 px), 2-col Names grid (You / Opponent), Rewards rows (XP / Rating in jade), Final Exchange block (left-border tinted gold), CTAs.
- [ ] **Defeat layered atmosphere** (when `outcome === 'defeat'`):
  - Dark overlay (rgba 0,0,0,0.5).
  - Defeat vignette (§3.7).
  - SVG defeat slashes (§3.8 — verbatim copy is fine).
  - Tapered crimson wing lines flanking the Cinzel `DEFEAT` title (crimson text-shadow per §3.4 defeat variant).
  - Same glass result panel shape as victory but with crimson accent line, crimson "Defeated" label for the player (gold "Victor" for the opponent), Rewards rows (XP positive / Rating Lost negative in red), Final Exchange block (left-border tinted crimson).
- [ ] **`outcome === 'other'`** (timeouts, disconnects, draws): keep a neutral variant — no rays, no slashes, just the dark scene + glass panel. Use the existing Scales icon or a subdued indicator.
- [ ] Replace the current `<NarrationFeed entries={feed.entries} fill />` block with the "Final Exchange" block from the design (latest entry only) OR keep the full match summary if product-meaning is preserved. **Document the choice in the PR.**
- [ ] Both CTAs ("Return to Lobby", "Play Again") MUST call `handleReturn` which runs `returnFromBattle(battleId) + navigate('/lobby')`. Do not skip.
- [ ] Preserve the `storeBattleId !== battleId` mismatch redirect, and the `phase !== 'Ended'` Spinner placeholder.
- [ ] Respect `prefers-reduced-motion`: disable the rotating rays.
- [ ] Verify: a real victory shows gold atmosphere; a real defeat shows red atmosphere; a draw / disconnect renders the neutral variant; both CTAs return to `/lobby`; the dismissed-battle marker (`returnFromBattle`) prevents the BattleGuard from bouncing back to `/battle/:id`.

**Complexity:** High (atmosphere effects + dual-tone variant).
**Dependencies:** Steps 0, 1, 6, 9.
**Risk areas:**
- The `phase !== 'Ended'` early return is critical — without it the screen renders before the battle store has `endReason`/`winnerPlayerId`.
- `OUTCOME_TONE` (`modules/battle/outcome-tone.ts`) currently drives Tailwind class strings. Keep the file as a tone source-of-truth; just update the class strings to the new tokens. Don't replace the abstraction with inline conditionals scattered across the JSX.
- `useResultBattleFeed` combines the live store feed with an HTTP backfill — both code paths must continue to work. Don't drop one.
- Both CTAs going to the same handler is intentional ("Play Again" is the same as Return to Lobby on the result screen — re-queueing happens on the lobby's QueueButton). Don't add a re-queue shortcut here.
- Conic-gradient rendering performance: the rotating rays at 150vmax can be heavy on low-end GPUs. Verify on a low-spec laptop; reduce alpha or simplify if needed.

**Commit:** `ui: migrate BattleResultScreen visual design`

---

## Step 11 — Stragglers (AppCrashScreen + AuthCallback)

**Optional polish pass.** Two screens not covered above:

### 11a. AppCrashScreen

**Production component:** `src/Kombats.Client/src/app/AppCrashScreen.tsx`
**Design reference:** None directly — extend the NotFoundScreen visual language (§1.9). Cinzel headline + Mitsudomoe icon at low opacity + two CTAs (Return to lobby/battle + Reload page).
**Stores/hooks used:** snapshot read of `useBattleStore.getState()` (no subscription).
**Migration scope:** restyle to match. Preserve `selectRecoveryTarget` decision and the hard `window.location.assign` recovery pattern.
**Complexity:** Low.
**Risk areas:** Don't replace the hard nav with `navigate()` — in-memory state may be corrupt; only a full reload is safe.

**Commit:** `ui: migrate AppCrashScreen visual design`

### 11b. AuthCallback

**Production component:** `src/Kombats.Client/src/modules/auth/AuthCallback.tsx`
**Design reference:** None — it's just a SplashScreen during the OIDC redirect handshake.
**Migration scope:** No changes needed beyond Step 3 (SplashScreen migration).
**Complexity:** None.
**Commit:** N/A — covered by Step 3.

---

## Cross-Cutting Verification (after final step)

Before declaring the migration complete:

1. `pnpm tsc --noEmit` — no TypeScript errors.
2. `pnpm lint` — no ESLint errors.
3. `pnpm test` — all unit tests pass (especially store + zones + guard-decisions tests).
4. `pnpm build` — production build succeeds.
5. Manual smoke test of the full happy path: register → onboard (name + stats) → lobby → queue → battle → result → return to lobby → re-queue.
6. Manual sad-path: 401 redirects to `/`; 409 on stat allocation surfaces error; battle hub disconnect → reconnect re-joins; chat rate limit shows banner; refresh during each screen recovers correctly.
7. Visual audit on viewport widths 1280, 1440, 1920 (and 1024 if mobile-ish support is required).
8. Browser console clean across the smoke test.

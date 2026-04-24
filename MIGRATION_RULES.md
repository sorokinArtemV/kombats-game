# Migration Rules

Hard rules that MUST be followed during every migration task. These rules are non-negotiable.

When reviewing a migration PR, check it against this file end-to-end. Any deviation needs an explicit, written justification in the PR description — not a code comment.

---

## Source of Truth

- **Production app architecture is sacred.** Never change routing, guards, stores, hooks, transport, or auth flow. The visual layer is the only thing being migrated.
- **The design app (`design_V2/`) is a VISUAL REFERENCE only.** It is not a source of importable code. It exists to communicate "what it should look like" — nothing more.
- **Never copy component files, hooks, utilities, or architectural patterns from the design app.** Every component you write is fresh code, written against the production architecture.
- **Never `import` from the `design_V2/` tree.** No symlinks, no path aliases pointing into it, no copy-paste of file contents. If you find yourself wanting to, re-read DESIGN_REFERENCE.md — it has the patterns extracted in a portable form.
- If DESIGN_REFERENCE.md and the design app source diverge, **DESIGN_REFERENCE.md wins** — it has been curated to be portable.

---

## Styling Rules

- **Production uses Tailwind 4 + CSS variables.** Tokens live in `src/Kombats.Client/src/ui/theme/tokens.css`; the `@theme` block in `src/Kombats.Client/src/index.css` exposes them as Tailwind utilities.
- **All new visual tokens must be added as CSS variables** in `tokens.css` and (if they need to back a Tailwind utility) mapped in the `@theme` block in `index.css`.
- **Use Tailwind utility classes as the primary styling method.** Reach for them first.
- **Inline `style={{}}` is allowed ONLY for runtime-computed values** — dynamic widths (`width: ${pct}%`), dynamic positions, dynamic colors derived from data. Never for static visual properties that could be expressed as a Tailwind class or a CSS variable.
- **Never use the design app's TypeScript token objects** (`tokens.ts`, the `surface`/`accent`/`semantic` records). Translate them to CSS variables. The production app does not import `.ts` token modules anywhere.
- **Complex effects** (bloom, masks, vignettes, conic-gradient rays, parallelogram clip-paths, SVG `feMorphology` outlines) that cannot be expressed in Tailwind classes should be implemented as either:
  1. CSS variables + small utility classes / `@layer` rules defined in `index.css`, or
  2. Scoped `style={{}}` blocks with a brief comment explaining why Tailwind wasn't sufficient.

  Prefer option 1 when the effect appears more than once. The CSS for victory rays, defeat vignette, mitsudomoe spinner, body-zone masks, and Cinzel title bloom is documented verbatim in DESIGN_REFERENCE.md §3 — copy the CSS, not the JSX.
- **No CSS modules. No CSS-in-JS** (styled-components, emotion). Production has zero of these and adding any introduces a parallel styling system.
- **No `dark:` variants** — the app is dark-only.
- **Use the existing token roles whenever possible.** Production already has `bg-bg-primary`, `text-text-muted`, `border-border`, `bg-attack`, `bg-block`, `bg-go`, etc. Add a new token only when the design genuinely introduces a new visual role.

---

## Component Rules

- **Follow production conventions exactly:**
  - Named exports only — no default exports anywhere.
  - No `React.FC`. Use plain function declarations with explicit prop types.
  - PascalCase component files (`FighterCard.tsx`); camelCase utility/hook files (`hooks.ts`, `store.ts`).
  - Explicit prop interfaces (inline `interface FooProps { … }` is fine).
  - `clsx` for conditional class composition.
- **Visual primitives** (stateless, no store deps, no transport deps) go in `src/Kombats.Client/src/ui/components/`.
- **Feature components** (may read their module's store, may use TanStack Query) go in `src/Kombats.Client/src/modules/{module}/components/`.
- **Never import from design app paths.** Every line of new code is written fresh, even when it visually matches a design app component.
- **Keep components stateless where possible.** State stays in Zustand stores. Local `useState` is fine for ephemeral UI (open/closed flags, hover state, input draft text); anything that survives unmount belongs in a store.
- **Use existing Radix UI primitives** (`@radix-ui/react-{dialog,dropdown-menu,scroll-area,tabs,tooltip}`) where applicable. Don't reimplement focus-trapped modals, accessible menus, or scrollable areas from scratch.
- **Don't add new external UI libraries** (MUI, Chakra, shadcn/ui, etc.). The dependency tree is intentionally tight — see PRODUCTION_ARCHITECTURE.md §8 for what is and isn't installed.

---

## What NOT to Touch

These files contain logic, contracts, and side-effects. A visual migration **must not edit them**:

- **Zustand stores** — any file named `store.ts` under `modules/` (`auth`, `player`, `battle`, `chat`, `matchmaking`).
- **Guard logic** — `app/guards/` and `app/guards/guard-decisions.ts`.
- **Transport layer** — everything under `transport/` (`http/client.ts`, `http/endpoints/*`, `signalr/battle-hub.ts`, `signalr/chat-hub.ts`, `signalr/connection-state.ts`, `polling/matchmaking-poller.ts`).
- **Auth flow** — everything under `modules/auth/` (`AuthProvider.tsx`, `AuthCallback.tsx`, `user-manager.ts`, `bootstrap-retry.ts`, `hooks.ts`, `store.ts`).
- **Hub managers and connection hooks** — `useBattleConnection`, `useChatConnection`, `useNetworkRecovery`, `app/transport-init.ts`, `app/session-cleanup.ts`.
- **Query client and query keys** — `app/query-client.ts` (`gameKeys`, `playerKeys`, `chatKeys`, `battleKeys`, `shouldRetryQuery`).
- **Router definition** — `app/router.tsx`. (Adding a new screen route needs a separate, non-visual PR.)
- **Battle action contract** — `modules/battle/zones.ts` (`buildActionPayload`, `isValidBlockPair`, `ALL_ZONES`, `VALID_BLOCK_PAIRS`). The payload string format is the SignalR contract.
- **Post-battle handoff** — `usePlayerStore.returnFromBattle`, `usePostBattleRefresh`, `modules/player/post-battle-refresh.ts`. The atomic write order is load-bearing (PRODUCTION_ARCHITECTURE.md §9 #6).
- **`/silent-renew` short-circuit** — the `if (window.location.pathname === '/silent-renew')` branch in `main.tsx`. This iframe MUST NOT mount the React app.
- **`useState`/`useEffect` lifecycle ordering inside guards and shells** — particularly `BattleShell` mounting `useBattleConnection` and `SessionShell` mounting `useChatConnection`. Moving either changes connection lifecycle.

If you genuinely believe a touch is required, stop and write a separate PR with rationale. Do not bundle it into a visual migration.

---

## Assets

- **Copy assets from `design_V2/src/assets/` and `design_V2/src/imports/` into the production app:**
  - Static images, backgrounds, fighter sprites, icons → `src/Kombats.Client/src/ui/assets/{category}/` (create the folder if missing).
  - Truly public assets (favicons, og:image) → `src/Kombats.Client/public/`.
- **Optimize SVGs before adding.** Strip editor metadata, collapse `<defs>` that are unused, minify whitespace. Use SVGO with default settings as a baseline.
- **Don't bundle massive PNGs needlessly.** Most fighter sprites in the design app are 2-3 MB each. Re-export at the actual rendering size or convert to WebP if file size becomes a problem.
- **Fonts:** add to `src/Kombats.Client/src/ui/theme/fonts.css` (matches design app's `styles/fonts.css` shape) and register the family token in `tokens.css` (`--font-display`, `--font-primary`, `--font-mono`). Production currently uses Inter + Orbitron; the design uses Inter + Noto Sans JP + Cinzel — adjust the token values, not the import paths.
- **Reference assets via `import` from `ui/assets/`** so Vite fingerprints them. Never use string paths like `/assets/foo.png` for app-bundled images.

---

## Animation

- **Use `motion` (Framer Motion).** Already installed in production (`package.json`). Don't add a second animation library.
- **Match the design reference timings exactly** (DESIGN_REFERENCE.md §2.8):
  - Color/hover transitions: 150 ms ease.
  - Border reveals: 300 ms ease.
  - HP bar width: 300 ms ease-out.
  - Pop-in (panel/popover): 200 ms.
  - Avatar swap: 350 ms ease-out.
  - Mitsudomoe ring: 12 s linear infinite (counter-clockwise).
  - Mitsudomoe icon: 8 s linear infinite (clockwise).
  - Selected zone pulse: 2.5 s ease-in-out.
  - Victory rays: 60 s linear infinite.
  - Loading text opacity pulse: 3 s easeInOut.
- **Respect `prefers-reduced-motion`.** Skip the rotating rays / pulse loops when the user has reduced motion enabled.
- **Animations are visual sugar, not state.** A failed animation must never block a state transition. Battle phase changes happen on store updates regardless of whether their animation finished.

---

## Testing

After every screen migration, manually verify:

- **Routing still works.** Navigate to/from the screen via guards and direct URL.
- **Guards still redirect correctly.** Test the negative paths: hit `/battle/:id` while idle, hit `/onboarding/name` while Ready, etc.
- **WebSocket messages still flow.** For battle: zone selection updates HP. For chat: a sent message appears.
- **Game actions still submit correctly.** For battle: GO button → server resolves the turn. For onboarding: name + stats persist across reload.
- **Page refresh recovery.** Reload mid-screen and verify guards land you on the same screen (or the correct redirect target).
- **Token expiry.** Wait for silent renew (~60 s before expiry; default 5 min) and confirm the screen is unaffected.
- **No console errors.** Open DevTools and verify a clean run through the screen.

If a screen has a unit-tested store or pure helper, **don't break those tests.** Run `pnpm test` after every migration.

---

## Git Discipline

- **One screen per commit.** Never migrate two screens simultaneously.
- **Commit message format:** `ui: migrate {ScreenName} visual design`
  - Example: `ui: migrate LobbyScreen visual design`
  - Example: `ui: migrate BattleScreen visual design`
- **Foundation commits** (tokens, fonts, shared assets) get their own commit before the screen commits that depend on them:
  - `ui: add Kombats design tokens to theme`
  - `ui: add design assets (fighters, backgrounds, icons)`
  - `ui: add Cinzel + Noto Sans JP font registration`
- **Don't commit `WIP` or partial migrations.** Each commit must leave the app in a working state — `pnpm build` succeeds, every screen renders, no console errors.
- **Don't squash visual migrations into other work.** A reviewer should be able to bisect and find the exact commit that introduced a visual regression.

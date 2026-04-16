# Frontend Execution Log

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

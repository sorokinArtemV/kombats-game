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

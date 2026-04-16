# Frontend Architecture Compliance Review

You are reviewing frontend code for strict compliance with the Kombats frontend architecture. This is a focused structural review — not a feature review.

---

## Reference Documents

- `.claude/rules/architecture-boundaries.md` — layer and module boundaries
- `.claude/rules/state-and-transport.md` — state ownership and transport conventions
- `.claude/rules/ui-and-theming.md` — component and styling rules
- `docs/frontend/04-frontend-client-architecture.md` — binding architecture decisions

---

## For Each File Changed, Check:

### 1. Layer Placement

- Is the file in the correct directory?
  - Screens → `modules/{name}/screens/`
  - Feature components → `modules/{name}/components/`
  - Stores → `modules/{name}/store.ts`
  - Hooks → `modules/{name}/hooks.ts`
  - HTTP endpoints → `transport/http/endpoints/`
  - SignalR managers → `transport/signalr/`
  - UI primitives → `ui/components/`
  - Types → `types/`
  - Route/guard/shell → `app/`

### 2. Import Graph

- Does the file only import from allowed layers?
  - `app/` → `modules/`, `ui/`, `types/`
  - `modules/` → `transport/` (via hooks), `ui/`, `types/`
  - `transport/` → `types/` only
  - `ui/` → `types/` only (styling, no logic)
- Are there any circular imports?
- Are cross-module imports limited to public hooks (not internal stores/components)?

### 3. State Ownership

- Is state managed by the correct tool?
  - Client/realtime → Zustand
  - Server-state caching → TanStack Query
  - No mixing unless explicitly justified (game state exception documented)
- Does only the owning module write to its store?
- Are SignalR events processed through store actions, not component state?

### 4. Transport Isolation

- Are all network calls going through `transport/`?
- Does `transport/` have zero React/Zustand/TanStack imports?
- Are auth tokens injected in the HTTP client, not in individual endpoints?
- Do SignalR managers expose typed callbacks, not raw `HubConnection` methods?

### 5. Component Architecture

- Are `ui/` components stateless (no store, no transport)?
- Do feature components delegate logic to store actions?
- Do screens compose components without containing business logic?
- Are interactive primitives using Radix UI?

### 6. Theming Compliance

- All colors via CSS variable tokens?
- Tailwind utility classes only (no CSS modules, no inline styles)?
- No hardcoded hex/rgb values?
- Font references through token variables?

### 7. TypeScript Discipline

- Strict mode compatible?
- No `any` without justification?
- Named exports only?
- No `React.FC`?
- `import type` for type-only imports?

---

## Output Format

```markdown
## Architecture Compliance Review

### Files Reviewed
- [list with layer classification]

### Violations
- [NONE or numbered list with file, line, violation, required fix]

### Warnings
- [Patterns that aren't violations but risk becoming ones]

### Verdict: COMPLIANT / NON-COMPLIANT
```

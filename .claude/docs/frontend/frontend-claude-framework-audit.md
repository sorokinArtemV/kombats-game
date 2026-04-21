# Frontend Claude Framework — Migration Summary

**Date:** 2026-04-16
**Migration:** Lane separation — frontend promoted to active, backend archived.

---

## What Changed

### Structure Before (dual-lane, mixed)

```
.claude/
  CLAUDE.md                              # Dual-lane, backend-heavy
  review-checklist.md                    # Backend
  prompts/*.md                           # Backend prompts (6 files)
  prompts/frontend/*.md                  # Frontend prompts (4 files)
  rules/*.md                             # Backend rules (7 files)
  rules/frontend/*.md                    # Frontend rules (4 files)
  skills/*.md                            # Backend skills (7 files)
  skills/frontend/*.md                   # Frontend skills (6 files)
  tasks/*.md                             # Backend BFF overlays (2 files)
  docs/architecture/                     # Backend architecture (4 files)
  docs/implementation-bootstrap/         # Backend bootstrap (6 files)
  docs/tickets/                          # Backend tickets (6 files)
  docs/frontend/                         # This audit doc
```

### Structure After (frontend active, backend archived)

```
.claude/
  CLAUDE.md                              # Frontend-first entry point
  settings.local.json                    # Shared
  prompts/                               # FRONTEND prompts (promoted from frontend/)
    planner.md
    implementer.md
    reviewer.md
    architecture-compliance-review.md
  rules/                                 # FRONTEND rules (promoted from frontend/)
    architecture-boundaries.md
    state-and-transport.md
    ui-and-theming.md
    testing-and-definition-of-done.md
  skills/                                # FRONTEND skills (promoted from frontend/)
    add-route-and-guard.md
    add-zustand-store.md
    add-tanstack-query-endpoint.md
    add-signalr-manager.md
    add-feature-screen.md
    add-ui-primitive.md
  docs/frontend/                         # This audit doc
  backend/                               # ARCHIVED backend assets
    prompts/                             # 6 backend prompts
    rules/                               # 7 backend rules
    skills/                              # 7 backend skills
    tasks/                               # 2 BFF overlays
    review-checklist.md                  # Backend review checklist
    docs/architecture/                   # 4 backend architecture docs
    docs/implementation-bootstrap/       # 6 backend bootstrap docs
    docs/tickets/                        # 6 backend ticket docs
```

---

## What Moved Where

| Asset | From | To |
|-------|------|----|
| Backend prompts (6) | `.claude/prompts/*.md` | `.claude/backend/prompts/` |
| Backend rules (7) | `.claude/rules/*.md` | `.claude/backend/rules/` |
| Backend skills (7) | `.claude/skills/*.md` | `.claude/backend/skills/` |
| Backend review checklist | `.claude/review-checklist.md` | `.claude/backend/review-checklist.md` |
| BFF overlays (2) | `.claude/tasks/*.md` | `.claude/backend/tasks/` |
| Backend docs | `.claude/docs/architecture/`, `implementation-bootstrap/`, `tickets/` | `.claude/backend/docs/` |
| Frontend prompts (4) | `.claude/prompts/frontend/` | `.claude/prompts/` (promoted) |
| Frontend rules (4) | `.claude/rules/frontend/` | `.claude/rules/` (promoted) |
| Frontend skills (6) | `.claude/skills/frontend/` | `.claude/skills/` (promoted) |

---

## What Stayed Shared

| Asset | Location | Notes |
|-------|----------|-------|
| `CLAUDE.md` | `.claude/CLAUDE.md` | Rewritten: frontend-first, backend archive pointer |
| `settings.local.json` | `.claude/settings.local.json` | Unchanged |

---

## Content Fixes Applied

| Fix | File | Issue |
|-----|------|-------|
| SignalR `useEffect` cleanup | `prompts/implementer.md` | Old example returned cleanup from `.then()` — React ignores it. Fixed to use mutable array + `useEffect` return. |
| Inline style contradiction | `rules/ui-and-theming.md` | Blanket "no inline styles" conflicted with ProgressBar `style={{width}}`. Clarified: `style` allowed for dynamic computed values only. |
| Inline style in architecture-boundaries | `rules/architecture-boundaries.md` | Same fix propagated to forbidden patterns table. |
| "Patterns not literal code" | `prompts/implementer.md` | Added section clarifying code examples are structural patterns, not copy-paste templates. |
| Store/transport separation rationale | `rules/state-and-transport.md` | Added "Why Two State Tools" section explaining why Zustand and TanStack Query are separate. |
| Path references | All 4 prompts | Updated `rules/frontend/` paths to `rules/` after promotion. |

---

## How Frontend Agents Operate Now

1. **CLAUDE.md** is the entry point — it is frontend-first and self-contained
2. **Rules** at `.claude/rules/` are all frontend rules — auto-loaded by Claude Code
3. **Prompts** at `.claude/prompts/` are all frontend prompts
4. **Skills** at `.claude/skills/` are all frontend skills
5. **No backend assets pollute the active context** — they are in `.claude/backend/`
6. **Architecture source of truth** is `docs/frontend/04-frontend-client-architecture.md`
7. **Phase plan** is `docs/frontend/06-frontend-implementation-plan.md`

Frontend agents should never need to look at `.claude/backend/` unless explicitly working on backend code.

## How Backend Agents Operate (When Needed)

1. Read `.claude/backend/rules/hardening-mode.md` for operating constraints
2. Use prompts from `.claude/backend/prompts/`
3. Use skills from `.claude/backend/skills/`
4. Reference docs from `.claude/backend/docs/`
5. Backend hardening mode still applies: no new features, issue-driven fixes only

To fully restore the backend lane: move `.claude/backend/rules/` back to `.claude/rules/` and `.claude/backend/prompts/` back to `.claude/prompts/`. This is a reversible operation.

---

## Deleted: Nothing

Zero files were deleted. All backend assets are preserved in `.claude/backend/`.

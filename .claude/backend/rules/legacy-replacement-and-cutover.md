# Legacy Replacement and Cutover

## Core Principle

Old code is evidence, not authority. It shows what was built, not what should be built.

---

## When Replacement Is Required

Replacement is the default when any of these apply:

- The target architecture defines a different structure (e.g., Bootstrap instead of Api-as-composition-root, Minimal APIs instead of Controllers)
- The change would extend a forbidden pattern (new Controller, logic in `DependencyInjection.cs`, etc.)
- The old implementation violates service boundaries and requires restructuring
- The area is scheduled for replacement in the current or next implementation phase

---

## When Patching Legacy Code Is Allowed

Patching is permitted only when ALL of:

1. The change is a correctness fix, not an architectural improvement
2. The replacement for this area has not started or is not imminent
3. The patch does not extend a legacy pattern the target architecture eliminates
4. The patch does not introduce new coupling between legacy and target code

If any condition is unmet, the work must be replacement work.

---

## Coexistence Rules

Old and new code will temporarily coexist during migration. This is expected but must be managed:

- **Explicit**: every PR that leaves old and new implementations of the same concern must document that coexistence and identify follow-up removal work
- **Short-lived**: old code for a replaced concern is removed in the same phase or immediately following phase. Open-ended coexistence is a defect
- **No cross-calling internals**: old and new interact through contracts or explicit integration points only
- **No mixed-pattern files**: a single file must not contain both legacy and target patterns (e.g., Controllers and Minimal API endpoints)
- **Traffic cutover must be explicit**: when new replaces old for an endpoint or consumer, the cutover point is identified in the ticket

---

## Temporary Adapters and Shims

When old code must interact with new code during transition:

- The adaptation layer belongs in the old code's space or in an explicit temporary shim
- New code must still follow target architecture — the shim is on the legacy side
- Mark with: `// TEMPORARY: Remove when [condition]. See ticket [ref].`
- A removal ticket for the adapter must exist before the replacement ticket is closed
- Adapters must not embed business logic — structural bridges only

---

## Legacy Removal Obligation

When replacement is verified as complete and correct:

- The superseded legacy code **must** be removed
- Removal is not optional cleanup — it is part of the replacement's definition of done
- If removal cannot happen immediately, a removal ticket must be created and linked before the replacement ticket is closed
- Stale legacy code remaining after its replacement is deployed is a defect

---

## What Must Not Be Carried Forward

These legacy structural patterns must not appear in new code:

- Api project as composition root → use Bootstrap
- `DependencyInjection.cs` / `ServiceCollectionExtensions` in Infrastructure → composition in Bootstrap
- Controller-based endpoints → Minimal APIs
- `Kombats.Shared` references → `Kombats.Common` projects
- Per-service `.sln` files as primary build artifacts → unified `Kombats.sln`
- Workers hosted inside Api projects → move to Bootstrap
- Mixed transport and composition concerns in a single project

---

## Cutover Checklist

When cutting over a service from legacy to target:

1. Bootstrap project runs as the service executable
2. All endpoints served from Minimal APIs (Controllers removed)
3. All composition in Bootstrap (no `DependencyInjection.cs` in Infrastructure)
4. Outbox/inbox configured via `Kombats.Messaging`
5. JWT auth configured (no dev bypasses)
6. Health checks operational
7. All mandatory tests pass
8. Legacy entry points (old `Program.cs`, Controllers, legacy middleware) deleted
9. No references to `Kombats.Shared` from this service
10. Legacy removal complete or removal ticket linked

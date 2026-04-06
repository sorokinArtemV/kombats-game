# Implementer Mode

You are implementing approved work in the Kombats repository. You write code, create files, and run tests. You follow the approved plan exactly.

## Before Implementing

1. Confirm the plan is approved
2. Read the implementation guardrails
3. Read existing code in the affected area
4. Understand what legacy code exists and how it relates to the plan

## Implementation Rules

### Scope
- Implement the assigned scope. Nothing more.
- Do not refactor adjacent code unless the plan includes it
- Do not add features not in the plan
- Do not add comments, docs, or type annotations to code you didn't change
- Do not introduce new packages without explicit approval
- Do not introduce new abstractions without explicit approval

### Architecture Compliance

Every change must respect:

| Rule | Check |
|---|---|
| Dependency direction | Every `using` and project reference respects layer hierarchy |
| Service isolation | No references to another service's internals — Contracts only |
| Outbox for all publication | Every `Publish()`/`Send()` through transactional outbox |
| Consumer idempotency | Every consumer has idempotency test |
| MassTransit 8.3.0 | No other version |
| No auto-migration on startup | No `Database.MigrateAsync()` in `Program.cs` |
| Minimal APIs only (new code) | No controllers, no MVC |
| Bootstrap is composition root | No `DependencyInjection.cs` in Infrastructure |
| No legacy shared code | No references to `Kombats.Shared` from new code |

### Legacy Posture
- Do not preserve legacy structure automatically
- Do not extend legacy patterns for consistency with old code
- Do not reference `Kombats.Shared` from new code
- Mark temporary compatibility code: `// TEMPORARY: Remove when [condition]. See ticket [ref].`
- Report coexistence state in implementation summary
- Identify follow-up removal work if legacy code is superseded but not deleted

### Tests
- Required tests ship with the code — not in a follow-up
- Tests follow the test strategy (see `.claude/rules/testing-and-definition-of-done.md`)

### Architectural Questions
If an uncovered architectural question arises during implementation:
- Stop
- State the question explicitly
- Do not make the decision silently
- Do not default to "whatever the old code does"

## After Implementing

Report using the implementation summary format from CLAUDE.md:
- Implemented (with file references)
- Tests added
- Legacy code removed
- Legacy code superseded (removal pending)
- Coexistence state
- Intentionally not changed
- Discovered issues

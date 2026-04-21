# Implementer Mode — Hardening

You are implementing scoped fixes in the Kombats repository. You write code and run tests. You follow the approved plan exactly.

**The system is in post-implementation hardening.** Only issue-driven fixes and Phase 7 tasks are permitted. No new features, no speculative refactors, no architectural redesign.

## Before Implementing

1. Confirm the plan is approved and references a specific issue (EI-xxx) or Phase 7 task
2. Read `.claude/rules/hardening-mode.md`
3. Read existing code in the affected area
4. If there is no issue or Phase 7 reference, **stop and ask**

## Implementation Rules

### Scope — Hardening Discipline
- Implement the approved fix. Nothing more.
- Do not refactor adjacent code
- Do not add features
- Do not add comments, docs, or type annotations to code you didn't change
- Do not introduce new packages unless required for Phase 7A observability
- Do not introduce new abstractions
- Do not create new endpoints, contracts, or domain entities
- **Every change must trace back to the issue or Phase 7 task**

### Architecture Compliance

Existing architecture rules still apply. Every change must respect:

| Rule | Check |
|---|---|
| Dependency direction | Every `using` and project reference respects layer hierarchy |
| Service isolation | No references to another service's internals — Contracts only |
| Outbox for all publication | Every `Publish()`/`Send()` through transactional outbox |
| MassTransit 8.3.0 | No other version |
| Bootstrap is composition root | No `DependencyInjection.cs` in Infrastructure |

### Tests
- Tests for the fix are required — not in a follow-up
- Tests must verify the specific fix, not expand test coverage for unrelated areas
- Tests follow the test strategy (see `.claude/rules/testing-and-definition-of-done.md`)

### Scope Questions
If you discover an issue adjacent to your fix:
- Log it to `docs/execution/execution-issues.md` as a new issue
- Do NOT fix it in the current change
- Continue with the approved scope only

## After Implementing

Report using the hardening summary format from CLAUDE.md:
- Issue/Task reference
- Root cause
- Fix applied (with file references)
- Tests added or verified
- Scope verification (no unrelated changes)
- Discovered issues (logged separately)

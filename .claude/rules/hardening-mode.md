# Hardening Mode — Active

**Effective:** 2026-04-09
**Status:** The system is in POST-IMPLEMENTATION HARDENING. All implementation phases (0–6) and BFF delivery are complete.

---

## What This Means

No new features. No speculative refactors. No architectural redesign. The codebase is functionally complete. The goal is stability, correctness, and production readiness.

---

## Allowed Work Streams

Only the following work is permitted:

### 1. Issue Resolution
- Fixing issues tracked in `docs/execution/execution-issues.md`
- Bug fixes discovered during testing or review
- Correctness fixes for existing behavior

### 2. Phase 7A — Backend/Platform Production Hardening
- Redis Sentinel configuration
- Health check endpoints (`/health/live`, `/health/ready`)
- OpenTelemetry standardization
- Structured logging review
- Recovery mechanism verification (stuck-in-Resolving watchdog, orphan sweep, timeout workers)

### 3. Phase 7B — Product-Level Hardening (when preconditions met)
- End-to-end topology smoke tests
- Performance baselines for critical paths
- Production-like validation

### 4. Reliability and Observability
- Adding missing tests for existing code (not new features)
- Improving error handling at system boundaries
- Infrastructure alignment (Docker, CI/CD, configuration)

---

## Forbidden Work

| Action | Why |
|---|---|
| New features or endpoints | Hardening phase — no feature work |
| New domain entities or aggregates | Implementation is complete |
| New integration events or contracts | No new cross-service flows |
| Speculative refactoring | Only issue-driven changes |
| Architectural redesign | Architecture is settled |
| New NuGet packages (unless required for Phase 7A observability) | Stability over novelty |
| "Improvements" to working code | If it works and isn't a bug, leave it |
| Scope expansion beyond the immediate fix | Fix the issue, nothing more |

---

## Scope Discipline

Every change must answer: **"What issue, bug, or Phase 7 task does this address?"**

If the answer is "it would be nice" or "while I'm here" — stop. That work is not permitted in hardening mode.

Changes must be minimal and targeted:
- Fix the bug, not the surrounding code
- Add the missing test, not a test framework improvement
- Add the health check, not a health check abstraction layer
- Configure telemetry, not redesign the telemetry pipeline

---

## Agent Role Constraints

### Planner
- Only plans issue resolution or Phase 7A/7B tasks
- Must reference the specific issue (EI-xxx) or Phase 7 deliverable being addressed
- Must NOT propose new features, new architectural patterns, or speculative improvements
- Scope must be minimal — smallest change that resolves the issue

### Implementer
- Only implements scoped fixes approved by a plan or directly tied to an issue/Phase 7 task
- Must cite the issue or task being addressed
- Must NOT add features, refactor adjacent code, or expand scope
- Must NOT introduce new abstractions or patterns
- Tests for the fix are required; tests for unrelated areas are not

### Reviewer
- Enforces no scope creep and no feature expansion
- Rejects changes that are not tied to an issue or Phase 7 task
- Rejects "while I'm here" improvements
- Verifies the change is minimal and targeted
- Checks that no new features, endpoints, or contracts are introduced

---

## Implementation Summary Format (Hardening)

```
## Hardening Summary

### Issue/Task
- [EI-xxx reference or Phase 7 deliverable]

### Root Cause
- [What was wrong]

### Fix Applied
- [Minimal change, file references]

### Tests
- [Tests added or verified]

### Scope Verification
- [Confirmation that no unrelated changes were made]
```

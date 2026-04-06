# Claude Workflow

How Claude operates in the Kombats repository during architectural reboot. Three modes. Strict scope rules. No silent drift. No legacy preservation by default.

---

## Architectural Reboot Context

This repository contains an existing codebase undergoing in-place replacement. Claude must operate with constant awareness that:

- **Old code is evidence, not authority.** The existing implementation shows what was built. It does not define what should be built. Claude must not treat legacy patterns as normative.
- **New code follows target architecture.** All new code must comply with the architecture package and implementation guardrails, regardless of what the surrounding legacy code looks like.
- **Legacy patterns must not propagate.** Claude must not extend, copy, or preserve legacy patterns in new code unless explicitly instructed. "The old code does it this way" is never sufficient justification.

Claude must always be aware of which category of work it is performing:
- **Replacement work** — building new target-architecture code that supersedes legacy code
- **Temporary compatibility work** — adapters or shims that bridge old and new during migration (must be explicitly marked as temporary)
- **Legacy removal work** — deleting superseded code after replacement is verified
- **Legacy patching** — bug fixes in legacy code that cannot wait for replacement (allowed only under guardrail conditions)

---

## Mode 1: Planner

**When:** Before implementation begins on a phase, feature, or non-trivial ticket.

**What Claude does:**
- Reads the architecture package and implementation guardrails.
- Reads the relevant legacy code to understand what currently exists and what must be replaced.
- Proposes an implementation approach: which files to create, modify, or delete; what patterns to use; what tests to write.
- Identifies dependencies and sequencing.
- Identifies risks or ambiguities that need resolution before code is written.
- Explicitly identifies what legacy code will be superseded and when it will be removed.
- Produces a plan that can be reviewed and approved before implementation starts.

**Reboot-specific planner obligations:**
- The plan must state whether this is replacement, foundation, migration, or removal work.
- The plan must identify which legacy code is affected and what happens to it.
- If the plan involves coexistence of old and new code, it must identify the cutover point and the removal timeline.
- The plan must not propose extending legacy patterns. If the plan needs to interact with legacy code, it must explain how the new code stays architecture-compliant while the interaction exists.
- When evaluating legacy code, Claude must distinguish between: code that is roughly correct and can be cleaned up in place, and code that must be structurally replaced. Propose the proportionate approach.

**What Claude does not do in planner mode:**
- Write code.
- Create files.
- Modify the repository.
- Make architectural decisions not covered by the architecture package.
- Assume legacy code is correct.

**Exit:** Plan is reviewed and approved by the user. Claude switches to implementer mode with the approved plan as scope.

---

## Mode 2: Implementer

**When:** After a plan is approved and a specific ticket or task is assigned.

**What Claude does:**
- Implements exactly what was planned and approved.
- Writes production code following the implementation guardrails and target architecture.
- Writes required tests as part of the same implementation unit.
- Runs tests to verify correctness before declaring completion.
- Reports what was implemented, what was intentionally not changed, what legacy code was removed, and any issues discovered during implementation.

**Scope rules for implementer mode:**

- **Implement the assigned scope. Nothing more.**
- Do not refactor adjacent code unless the plan explicitly includes it.
- Do not add features not in the plan.
- Do not "improve" code that is outside the ticket scope.
- Do not add comments, documentation, or type annotations to code that was not modified as part of the ticket.
- Do not introduce new packages without explicit approval.
- Do not introduce new abstractions without explicit approval.
- If an architectural question arises during implementation, stop and ask. Do not make architectural decisions silently.

**Reboot-specific implementer rules:**

- **Do not preserve legacy structure automatically.** When replacing code, build the new structure from the target architecture. Do not mirror the legacy file layout, class hierarchy, or naming unless it happens to match the target.
- **Do not extend legacy patterns.** If implementing new code that will coexist with legacy code temporarily, the new code must follow target patterns. Do not adopt legacy patterns for consistency with soon-to-be-deleted code.
- **Do not reference `Kombats.Shared` from new code.** Use `Kombats.Common` projects instead.
- **Do not add new Controllers.** All new endpoints use Minimal APIs.
- **Do not add composition logic to Infrastructure projects.** Composition belongs in Bootstrap.
- **Mark temporary compatibility code explicitly.** If the plan requires a temporary adapter between old and new systems, mark it with a comment: `// TEMPORARY: Remove when [specific condition]. See ticket [reference].`
- **Call out coexistence.** When a change leaves old and new implementations of the same concern in the repo, explicitly state this in the implementation summary with the expected removal timeline.
- **Identify follow-up removal work.** If legacy code is now superseded by the new implementation but not yet deleted, report that a removal ticket is needed.

**Architecture compliance during implementation:**

| Rule | Enforcement |
|---|---|
| Dependency direction (Clean Architecture) | Every `using` and project reference must respect the layer hierarchy. Domain depends on nothing. Application depends on domain. Infrastructure depends on application. |
| Service isolation | No references to another service's internals. Only contract project references cross service boundaries. |
| Outbox for all event publication | Every `Publish()` or `Send()` call must go through the transactional outbox. |
| Consumer idempotency | Every consumer must have its idempotency test before the ticket is complete. |
| MassTransit 8.3.0 | No other version. Period. |
| No auto-migration on startup | If `Database.MigrateAsync()` appears anywhere in `Program.cs`, it is a defect. |
| Minimal APIs only (new code) | No controllers. No MVC. |
| Bootstrap is composition root | No `DependencyInjection.cs` in Infrastructure. No `ServiceCollectionExtensions` outside Bootstrap. |
| No legacy shared code in new code | No references to `Kombats.Shared` from new implementations. |

**Exit:** Implementation is complete. All required tests pass. Claude reports the implementation summary.

---

## Mode 3: Reviewer

**When:** After implementation is complete, or when reviewing a diff or PR.

**What Claude reviews:**

### Architecture Compliance
- Layer boundaries respected (domain has no infrastructure deps, application has no infrastructure types, etc.)
- Service boundaries respected (no cross-service internal references)
- Contract rules followed (additive-only, Version field present, publisher's language)
- Outbox used for all event/command publication
- No forbidden patterns from the guardrails
- Bootstrap is the composition root — no composition in Infrastructure or Api

### Legacy Posture
- New code does not extend or propagate legacy patterns
- No new references to `Kombats.Shared` or legacy shared code
- No new Controllers or MVC patterns
- No `DependencyInjection.cs` or `ServiceCollectionExtensions` in Infrastructure
- If old and new code coexist after this change, the coexistence is documented and time-bounded
- If legacy code was superseded, removal is either included or a removal ticket is identified
- Temporary compatibility code is explicitly marked as temporary

### Test Completeness
- All required tests exist for the scope (domain unit, application unit, infrastructure integration, API, consumer idempotency)
- Tests cover meaningful behavior, not just happy path
- Edge cases tested (nulls, concurrency, duplicate messages, invalid state transitions)
- Battle determinism tests present for any combat-related changes
- No mocked infrastructure in integration tests
- No test code in production assemblies

### Code Quality
- Code does what the ticket says, not more
- No speculative abstractions or premature generalizations
- No hidden behavior changes disguised as cleanup
- No scope creep
- Error handling is appropriate (not excessive, not missing at boundaries)

### Contract Safety
- Contract changes are additive-only
- Version field incremented on contract expansion
- Serialization/deserialization tests updated

**Review output format:**

```
## Review

### Correct
- [what is correctly implemented]

### Issues
- [specific issues with file:line references]

### Missing
- [required tests or behavior not present]

### Boundary Violations
- [any guardrail or architecture violations]

### Legacy Posture
- [any legacy pattern propagation, missing removal, undocumented coexistence]

### Verdict
APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
```

---

## Cross-Cutting Rules (All Modes)

### No Silent Architecture Drift

If Claude encounters a situation where the implementation guardrails or architecture package don't cover a needed decision:
- Stop.
- State the question explicitly.
- Do not make the decision silently and move on.
- Do not default to "whatever seems reasonable."
- Do not default to "whatever the old code does."

Architecture drift happens one silent decision at a time. Every uncovered decision is surfaced to the user.

### No Legacy Pattern Preservation by Default

Claude must not:
- Copy legacy file layouts into new code.
- Adopt legacy naming conventions that conflict with the target architecture.
- Use legacy code as a template for new implementations unless the legacy code happens to be correct by the target architecture's standards.
- Justify structural choices by referencing what the old code did.

When Claude reads legacy code during planning or implementation, the purpose is to understand behavior and intent — not to replicate structure.

### No Expanding Scope Without Approval

If Claude discovers during implementation that the scope should be larger:
- Complete the current scope as planned.
- Report the additional scope as a finding.
- Do not expand the ticket unilaterally.

### Explicit Coexistence Tracking

Whenever a change results in old and new code for the same concern both remaining in the repo:
- Claude must state this in the implementation summary.
- Claude must identify when the old code should be removed.
- Claude must identify whether a removal ticket already exists or needs to be created.

### No Code Without Tests Where Tests Are Required

The test strategy defines what tests are mandatory. If a ticket includes behavior covered by mandatory test categories, the tests ship with the code. No "I'll add tests later" or "tests in a follow-up ticket."

### Truthfulness

- Code is the source of truth.
- Distinguish between observed, inferred, and unknown.
- Do not present guesses as facts.
- Do not invent intended behavior.
- If something is ambiguous, say so.
- Do not assume legacy code is correct. Do not assume legacy code is wrong. Read it and assess.

### Implementation Summary Format

After completing implementation work, Claude reports:

```
## Implementation Summary

### Implemented
- [what was done, with file references]

### Tests Added
- [which test classes/methods, what they cover]

### Legacy Code Removed
- [what old code was deleted as part of this change]

### Legacy Code Superseded (Removal Pending)
- [what old code is now superseded but not yet deleted, with removal ticket reference]

### Coexistence State
- [what old and new code now coexist, with expected cutover/removal timeline]

### Intentionally Not Changed
- [scope that was explicitly out of bounds]

### Discovered Issues
- [problems found during implementation that are outside current scope]

### Remaining
- [anything incomplete, with reason]
```

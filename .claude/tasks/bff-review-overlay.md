# BFF Review Overlay

This overlay applies when reviewing a Kombats BFF proposal or implementation plan.

Use this together with the general reviewer mode.
If there is any conflict, this overlay takes precedence for the BFF task.

## Review Type

This is primarily an architecture/spec and execution-plan review, not only a code review.

The review target may include:
- BFF role definition
- BFF boundary proposal
- BFF v1 scope
- API/contract strategy
- auth/realtime edge decisions
- execution plan for implementing the BFF

Review it as a design artifact before implementation starts.

## Mission

Challenge the proposed Kombats BFF design and identify whether it is:
- architecturally sound
- properly scoped
- aligned with the existing Players / Matchmaking / Battle services
- safe to implement in the current execution program

Your job is not to be agreeable.
Your job is to prevent a bad BFF from entering execution.

## Mandatory Review Questions

You must explicitly evaluate:

### 1. Is the BFF role justified?
Check whether the proposal gives a real mission for the BFF:
- frontend-facing orchestration
- aggregated read models
- contract normalization
- auth edge
  If the proposal cannot explain why BFF exists beyond “for the frontend”, call that out.

### 2. Is the boundary correct?
Check whether the proposal keeps authority in the right place.
The BFF must not become:
- the owner of gameplay rules
- the owner of matchmaking rules
- the owner of player progression/business logic
- a duplicate domain layer

### 3. Is BFF v1 scope disciplined?
Check whether v1 is tight enough to implement safely.
Call out:
- too many flows in v1
- premature support for speculative frontend scenarios
- platform concerns mixed with user-facing orchestration scope
- hidden “while we’re here” expansion

### 4. Are UI-facing contracts well handled?
Check whether the proposal:
- exposes frontend-safe DTOs
- avoids leaking unstable internal service shapes directly
- normalizes errors and response semantics coherently
- avoids tight coupling to service-internal API quirks

### 5. Is auth/session edge coherent?
Check whether the proposal clearly defines:
- where auth terminates
- what identity is forwarded downstream
- what authorization remains inside services
- whether BFF is adding unnecessary session complexity

### 6. Is realtime handled intentionally?
Check whether the proposal has a clear stance on realtime:
- BFF-mediated
- direct Battle realtime
- mixed model with explicit reasoning
  If the answer is vague, that is a real issue.

### 7. Is the execution plan implementable?
Check whether the proposed work can be executed incrementally with:
- batches/phases
- gate checks
- reviewer checkpoints
- clear deliverables
- no hidden architectural rewrite

## BFF-Specific Failure Modes

Search aggressively for these failure modes:

- BFF as orchestration dump
- business logic duplication from Players / Matchmaking / Battle
- BFF becoming an accidental monolith
- unnecessary durable state in BFF
- frontend concerns driving backend corruption
- internal service contracts leaked as public contracts without adaptation
- auth boundary ambiguity
- over-broad first release
- proposal not grounded in repo reality
- vague execution plan that cannot be implemented safely

## Required Verdict Rules

Use these verdicts:

### APPROVE
Only if:
- role is clear
- boundary is sound
- v1 scope is controlled
- execution plan is realistic
- no major unresolved architectural confusion remains

### APPROVE WITH FIXES
Use if:
- core direction is right
- but specific structural or scope corrections are required before implementation

### REJECT
Use if:
- BFF role is unclear
- domain logic leaks badly into BFF
- scope is uncontrolled
- frontend/internal boundary is wrong
- execution plan is not safe to run

Do not approve vague proposals.

## Required Output Additions

In addition to the normal reviewer output, add:

### Architecture Soundness
[Is the proposed BFF shape correct for Kombats?]

### Scope Discipline
[Is v1 properly constrained?]

### Boundary Integrity
[What is wrongly pulled into BFF, if anything?]

### Execution Readiness
[Is this safe to hand to implementer or not?]

## Constraints

- Do not rewrite the proposal from scratch unless rejection is necessary
- Do not focus on naming/style while missing structural problems
- Do not accept “we can figure it out during implementation” for core architectural questions
- Do not ignore repository constraints and existing service boundaries
- Do not approve direct frontend-to-internal-services as the target architecture
- Do not treat missing realtime/auth decisions as minor if they affect the BFF boundary materially

## Stop Condition

Stop after issuing:
- verdict
- required fixes
- residual risks

Do not proceed into implementation.

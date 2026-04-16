# BFF Planning Overlay

This overlay applies when the planning task is about designing the Kombats BFF as a new execution stream.

Use this together with the general planner mode.
If there is any conflict, this overlay takes precedence for the BFF task.

## Task Type

This is not ordinary implementation planning against a fully pre-approved architecture package.
For this task, you are allowed to define the BFF architecture/spec shape, because the BFF layer does not yet exist as an approved execution package.

Treat this as:
- architecture-guided planning
- execution-stream definition
- scoped design for implementation readiness

It is NOT:
- greenfield fantasy architecture
- frontend design
- backend rewrite
- API gateway hand-waving

## Mission

Define the BFF layer for Kombats as the next execution stream after the backend service replacement work.

You must produce a plan that answers:
1. Why the BFF exists in Kombats
2. What belongs in the BFF and what does not
3. What BFF v1 should cover first
4. How the BFF sits above Players / Matchmaking / Battle
5. What target project structure and runtime shape should be used
6. How the work should be executed in batches/phases
7. What risks, open questions, and out-of-scope items must be documented

## Mandatory Context

Assume the following program context is already true unless the repository disproves it:
- Players, Matchmaking, and Battle backend replacement streams were already executed
- execution discipline exists: batch boundaries, implementer/reviewer loop, gate checks
- execution artifacts exist and matter
- original Phase 7 was split conceptually into:
    - 7A backend/platform hardening
    - 7B product-level hardening after BFF/frontend
- the current architectural direction is BFF first, frontend second

You must verify repository/docs reality before relying on any assumption.
If reality differs, record the deviation explicitly.

## Required Planning Decisions

You must make concrete decisions on the following:

### 1. BFF Role
Define the BFF mission in Kombats.
Be explicit about whether the BFF is:
- orchestration layer
- aggregation/read-composition layer
- frontend-facing contract adapter
- auth/session edge
- realtime edge, if applicable

### 2. Boundary
State clearly:
- what logic belongs in BFF
- what logic must remain in Players / Matchmaking / Battle
- whether BFF is allowed to own durable state
- whether BFF may cache/projection-read for UX reasons
- whether BFF may expose combined read models

### 3. BFF v1 Scope
Propose a realistic v1 only.
Prioritize user-facing flows and frontend-critical composition needs.
You must explicitly list:
- in scope
- out of scope
- deferred to later BFF phases

### 4. API / Contract Shape
Define:
- what the frontend should call
- what DTOs/contracts the frontend should see
- whether internal service contracts may be passed through directly or must be adapted
- how errors should be normalized at the BFF boundary

### 5. Auth Edge
Define:
- where JWT/authentication terminates
- how identity is propagated to internal services
- what authorization responsibilities remain inside backend services
- whether BFF adds session/profile conveniences or not

### 6. Realtime
Assess whether the BFF should mediate realtime traffic or whether Battle realtime stays direct.
Do not leave this vague.
Choose a position and justify it.

### 7. Execution Shape
Propose the work as an execution stream, with:
- batch or phase breakdown
- deliverables
- gate checks
- implementation order
- review points

## Required Output Additions

In addition to the normal planner output, you must also provide:

### Architecture Position
A short explicit section:
- why BFF now
- why frontend should not integrate directly against internal services as the target architecture
- why this chosen BFF shape is the best fit for Kombats

### Chosen Option
If multiple BFF styles are possible, compare them briefly and choose one.
Do not leave multiple options unresolved unless there is a true blocker.

### BFF v1 Deliverables
List concrete deliverables, not just concepts.

### Deferred Items
Explicitly list what is intentionally not part of BFF v1.

## Constraints

- Do not propose frontend-first as the main integration strategy
- Do not propose direct frontend-to-internal-services as the target end-state
- Do not move domain/gameplay/business authority into the BFF
- Do not turn the BFF into a replacement for Players / Matchmaking / Battle
- Do not introduce persistent state in BFF unless there is a strong, explicit justification
- Do not assume internal service contracts are automatically safe as public frontend contracts
- Do not propose speculative abstractions without a concrete need
- Do not expand scope into full frontend planning unless explicitly requested
- Do not propose a separate architecture disconnected from the current repository reality

## BFF-Specific Risks To Evaluate

You must explicitly evaluate these risks:
- BFF becoming an orchestration dump
- business/domain logic leaking from services into BFF
- unstable UI-facing contracts tied too closely to internal service APIs
- auth boundary confusion
- over-broad v1 scope
- unnecessary state introduced in BFF
- coupling the BFF too tightly to current internal implementation details
- unclear handling of realtime flows

## Preferred Output Structure

Use the normal planner output, but add these sections before Risks:

### Architecture Position
[Why BFF exists now and what role it serves]

### BFF Boundary
[What belongs in BFF / what stays in services]

### BFF v1
[In scope / out of scope / deferred]

### Target Architecture
[Projects, layers, runtime shape, integration pattern]

### Execution Stream
[Batch/phase sequence with gates]

## Stop Condition

Stop after producing the reviewable BFF architecture/plan package.
Do not proceed into implementation.
Do not write code.

# Claude Project Guidance

## Current Focus

Current active focus is **service-level refactoring and structural quality improvement**, starting with **Kombats.Battle** as the pilot service.

The codebase is already integrated and working.
The current goal is **not** to rebuild the system or redesign cross-service architecture.
The goal is to improve **internal service structure, maintainability, readability, separation of concerns, and code hygiene** to the level expected from a strong engineering team.

---

## Active Baseline

Treat the files under `.claude/active/` as the current project guidance baseline.

Do **not** treat the existing codebase as a quality reference.
Evaluate code against:

* modern backend best practices
* clean, maintainable, production-grade code
* pragmatic standards expected from a strong mid-to-senior engineering team

Do **not** justify poor structure with:

* "it already works"
* "it is acceptable for MVP"

Working code can still be technical debt and should be identified as such.

---

## Archive Policy

Files under `.claude/archive/` are **historical context only**.

They may contain:

* previous integration-phase rules
* old prompts
* superseded specs
* outdated decisions
* prior workflow guidance

### Archive usage rules

* Do **not** use archived files as the active source of truth
* Do **not** follow archived prompts/rules/specs by default
* Do **not** treat archived guidance as current policy
* Only consult archive content if explicitly needed for historical clarification
* If archived guidance conflicts with active guidance, **active guidance wins**

Default behavior: **ignore archive unless there is a specific reason to inspect it**

---

## Refactoring Intent

Internal structural redesign is allowed **within a service** when it clearly improves maintainability and code organization.

Allowed:

* moving responsibilities to more appropriate layers
* extracting logic from `Program.cs`, controllers, endpoints, consumers, handlers
* splitting large classes and large methods
* reorganizing folders and namespaces
* improving composition root and dependency registration
* removing clearly unused code
* improving naming, consistency, and boundaries inside the service

Not allowed:

* changing business behavior
* changing public API contracts
* changing event/message/integration semantics
* changing ownership boundaries between services
* introducing speculative abstractions
* adding enterprise-style complexity without clear value

Target state:
A clean, readable, maintainable service with strong separation of concerns and consistent structure, without overengineering.

---

## Quality Expectations

Preferred characteristics:

* thin `Program.cs`
* thin controllers/endpoints/consumers
* clear layer responsibilities
* small, focused classes
* methods with a single clear purpose
* no dumping-ground files
* predictable folder and namespace organization
* explicit, consistent naming
* minimal dead code
* simple solutions preferred over clever ones

Avoid:

* helper dumping grounds
* god classes
* orchestration and business rules mixed into transport layer
* excessive indirection
* interface/abstraction creation without concrete benefit
* "clean architecture cosplay" that adds ceremony without improving maintainability

---

## Service Pilot Model

`Kombats.Battle` is the current **pilot service** for defining the internal quality bar.

This means:

* improve Battle first
* use Battle to validate target structure and refactoring rules
* later extract reusable standards from Battle
* do **not** blindly force Battle-specific decisions onto all other services

Battle is a pilot/reference implementation, not a universal template.

---

## Analysis and Planning Expectations

When performing audit/spec work:

* identify what is already good and should remain
* identify real structural/code-quality problems
* distinguish technical debt from stylistic preference
* classify recommendations by importance and refactoring risk
* prefer concrete, actionable recommendations over generic theory
* explicitly call out areas that are risky to touch without tests

When proposing changes:

* preserve behavior
* preserve contracts
* preserve integration compatibility
* avoid unnecessary redesign outside the service boundary

---

## Decision Rule

When in doubt, choose the option that:

1. improves maintainability,
2. preserves behavior,
3. reduces structural mess,
4. avoids unnecessary complexity.

If a change is cleaner but risky and not clearly justified, do not force it.

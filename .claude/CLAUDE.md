# CLAUDE.md — Kombats Implementation Mode

## Operating Mode

This repository is in **active implementation**. The architecture package (`.claude/docs/architecture/`) is authoritative. The implementation bootstrap (`.claude/docs/implementation-bootstrap/`) defines execution constraints.

Old code is evidence, not authority. New code follows the target architecture. Replacement is preferred over patching. No silent architecture drift.

---

## Repository Context

Kombats is a .NET 10.0 backend monorepo. Three services:

- **Players** — character lifecycle, stat authority, combat profile publication
- **Matchmaking** — queue, pairing, match lifecycle orchestration
- **Battle** — deterministic 1v1 turn-based combat execution

Services communicate exclusively via async messaging (RabbitMQ/MassTransit 8.3.0). Single PostgreSQL instance with schema-per-service (`players`, `matchmaking`, `battle`). Redis for Battle (DB 0) and Matchmaking (DB 1).

Out of scope unless explicitly requested: BFF, frontend, platform rewrites.

---

## Architecture Package (Source of Truth)

Read these before planning or implementing:

| Document | Location |
|---|---|
| System architecture | `.claude/docs/architecture/kombats-system-architecture.md` |
| Architecture decisions (AD-01–AD-13) | `.claude/docs/architecture/kombats-architecture-decisions.md` |
| Technology & package baseline | `.claude/docs/architecture/kombats-technology-and-package-baseline.md` |
| Test strategy | `.claude/docs/architecture/kombats-test-strategy.md` |
| Implementation guardrails | `.claude/docs/implementation-bootstrap/implementation-guardrails.md` |
| Repository structure | `.claude/docs/implementation-bootstrap/repo-structure.md` |
| Implementation plan | `.claude/docs/implementation-bootstrap/implementation-plan.md` |
| Ticket decomposition | `.claude/docs/implementation-bootstrap/ticket-decomposition-strategy.md` |
| Claude workflow | `.claude/docs/implementation-bootstrap/claude-workflow.md` |
| Common library strategy | `.claude/docs/implementation-bootstrap/common-library-strategy.md` |

---

## Execution State Discipline

Execution state is tracked in project docs, not only in chat history.

Before starting any planning, implementation, or review work that relates to ticket/batch execution, also read:

- `docs/execution/execution-log.md`
- `docs/execution/execution-issues.md`

These execution files are **supporting state**, not architecture authority.
If execution tracking conflicts with authoritative docs or actual repository state:
- trust the architecture/ticket package over the execution log,
- verify the real repository state,
- record the discrepancy explicitly,
- do not continue on a false assumption.

Detailed rules for execution-state handling are defined in:

- `.claude/rules/execution-tracking.md`

This rule is mandatory for planner, implementer, and reviewer modes.

---

## Hard Constraints

These are non-negotiable. Violations are defects.

### Technology Pins
- .NET 10.0, `LangVersion latest`, `Nullable enable`, `ImplicitUsings enable`
- MassTransit **8.3.0** — pinned, do not upgrade, no other version
- EF Core 10.0.3, Npgsql 10.0.0, EFCore.NamingConventions 10.0.1
- StackExchange.Redis 2.8.16
- Central package management via `Directory.Packages.props` — no inline versions in `.csproj`
- No new NuGet packages without explicit approval (see baseline doc for approved list)

### Architecture Boundaries
- Services isolated: no cross-service project references except Contracts
- No cross-schema database access
- No synchronous HTTP/gRPC between services — async messaging only (AD-09)
- Dependency direction: Bootstrap → Api → Application → Domain; Infrastructure → Application + Domain
- Domain depends on nothing (zero NuGet except `Microsoft.Extensions.Logging.Abstractions`)
- Application depends on Domain + abstractions only — no infrastructure types
- Infrastructure implements Application ports — no composition logic (`DependencyInjection.cs` forbidden)
- Bootstrap is the sole composition root per service (`Microsoft.NET.Sdk.Web`)
- Api is a thin transport layer (`Microsoft.NET.Sdk`) — not a composition root

### API Conventions
- **Minimal APIs only.** No controllers. No `[ApiController]`. No MVC.
- Endpoints are thin: extract request → call handler → return response
- All endpoints `[Authorize]` (Keycloak JWT) unless health checks
- FluentValidation at API layer for input validation
- OpenAPI via `Microsoft.AspNetCore.OpenApi` + Scalar on all API hosts

### CQRS Conventions
- Separate command and query handlers at application layer
- No MediatR, no in-process mediator — direct DI registration
- Commands mutate state and may publish events; return success/failure
- Queries read state; must not mutate
- Same `DbContext` and database for read/write — no separate stores

### Messaging
- MassTransit EF Core transactional outbox for ALL event/command publication (AD-01)
- Never call `Publish()`/`Send()` outside outbox scope
- Inbox required on all consumers for idempotent message processing
- Consumers are thin: deserialize → call handler → return
- All services use `Kombats.Messaging` — no per-service messaging divergence
- Contract projects: plain C# types only, zero NuGet deps, `Version: int` on all events (AD-06)
- Additive-only contract evolution; breaking changes = new event type
- Publisher's domain language in contracts (AD-02)

### Persistence
- Single PostgreSQL instance, database `kombats`, schema-per-service
- Snake_case naming via EFCore.NamingConventions
- `EnableRetryOnFailure()` on all production connections
- No `Database.MigrateAsync()` on startup — migrations run in CI/CD (AD-13)
- Redis Sentinel for production (AD-08), not Cluster

### Testing (Binding)
- Tests are delivery gates, not follow-up work
- Domain unit tests: zero infrastructure deps
- Application unit tests: stubbed/faked ports
- Infrastructure integration tests: real PostgreSQL + Redis via Testcontainers — no mocked infra
- API tests: auth enforcement, validation, response contracts
- Consumer idempotency tests: same message twice, second is no-op
- Contract serialization/deserialization tests
- Battle: full determinism test suite mandatory (AD-11)
- No EF Core in-memory provider. No mocking `DbContext`/`IDatabase`/`IPublishEndpoint` in integration tests
- No test code in production assemblies
- See `.claude/docs/architecture/kombats-test-strategy.md` for full requirements

---

## Forbidden Patterns

| Pattern | Why |
|---|---|
| `Publish()`/`Send()` without outbox | Event loss — RISK-S1 |
| Cross-schema database access | Service boundary violation |
| Domain logic in consumers/endpoints/infrastructure | Clean Architecture violation |
| `Database.MigrateAsync()` on startup | Race conditions in multi-instance deploy |
| MassTransit != 8.3.0 | Hard constraint |
| Controllers or MVC in new code | Minimal APIs only |
| MediatR or in-process mediator | Direct DI handler registration |
| Synchronous cross-service HTTP/gRPC | Temporal coupling (AD-09) |
| `DevSignalRAuthMiddleware` in release builds | Security violation |
| Mocked infra in integration tests | Masks real bugs |
| `DependencyInjection.cs` in Infrastructure | Composition belongs in Bootstrap |
| Referencing `Kombats.Shared` from new code | Legacy — use `Kombats.Common` |
| Extending legacy patterns in new code | Target architecture only |
| Event sourcing | Not required — outbox handles publication |
| Generic repository wrappers | Direct `DbContext` in infrastructure |

---

## Legacy Code Posture

- Old code is evidence of what was built, not what should be built
- Do not extend legacy patterns because they exist
- Do not copy legacy structural choices into new code
- Replacement is the default when the target architecture differs
- Patching is allowed ONLY for correctness fixes that cannot wait for replacement AND the replacement is not imminent AND the patch does not extend a legacy pattern
- Coexistence of old and new must be explicit, short-lived, and documented
- Legacy removal is part of definition of done — not optional cleanup
- Temporary shims/adapters must be marked: `// TEMPORARY: Remove when [condition]. See ticket [ref].`

---

## Project Structure (Target)

```
src/
├── Kombats.Common/
│   ├── Kombats.Messaging/               # Shared MassTransit config, outbox, inbox
│   └── Kombats.Abstractions/            # Result<T>, Error, handler interfaces
├── Kombats.<Service>/
│   ├── Kombats.<Service>.Bootstrap/      # Composition root (Microsoft.NET.Sdk.Web)
│   ├── Kombats.<Service>.Api/            # Minimal API endpoints (Microsoft.NET.Sdk)
│   ├── Kombats.<Service>.Application/    # Handlers, ports, orchestration
│   ├── Kombats.<Service>.Domain/         # Entities, invariants, pure logic
│   ├── Kombats.<Service>.Infrastructure/ # DbContext, repos, Redis, consumers
│   └── Kombats.<Service>.Contracts/      # Integration events/commands (zero deps)

tests/
├── Kombats.<Service>/
│   ├── Kombats.<Service>.Domain.Tests/
│   ├── Kombats.<Service>.Application.Tests/
│   ├── Kombats.<Service>.Infrastructure.Tests/
│   └── Kombats.<Service>.Api.Tests/
```

Reference graph: see `.claude/docs/implementation-bootstrap/repo-structure.md`

Namespace prefix: `Kombats` (not `Combats`).

---

## Workflow Modes

### Planner Mode
Read architecture + guardrails → propose changes, deps, tests, sequencing → identify legacy impact → do not implement. See `.claude/prompts/planner.md`.

### Implementer Mode
Implement approved scope only → required tests included → no scope expansion → no architecture drift → legacy coexistence called out → report implementation summary. See `.claude/prompts/implementer.md`.

### Reviewer Mode
Check architecture compliance, boundary violations, test completeness, contract safety, legacy posture → verdict. See `.claude/prompts/reviewer.md`.

---

## Implementation Summary Format

After completing implementation:

```
## Implementation Summary

### Implemented
- [what was done, file references]

### Tests Added
- [test classes, what they cover]

### Legacy Code Removed
- [what old code was deleted]

### Legacy Code Superseded (Removal Pending)
- [what old code is now superseded, removal ticket reference]

### Coexistence State
- [old/new coexistence, cutover timeline]

### Intentionally Not Changed
- [out-of-scope items]

### Discovered Issues
- [problems outside current scope]
```

---

## Truthfulness

Code is the source of truth. Distinguish between: observed in code, inferred from code, unknown/ambiguous, recommended change. Do not present guesses as facts. Do not invent intended behavior. Do not assume legacy code is correct or incorrect without reading it.

---

## Rules, Prompts, and Skills

Detailed operating rules: `.claude/rules/`
Workflow prompts: `.claude/prompts/`
Implementation skills: `.claude/skills/`

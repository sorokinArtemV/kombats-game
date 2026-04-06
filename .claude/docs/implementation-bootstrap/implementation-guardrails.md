# Implementation Guardrails

This is the implementation law of the Kombats repository. Every code change must comply with these rules. Violations are not tech debt — they are defects.

This repository is undergoing an **architectural reboot in place**. The existing codebase is not being abandoned, but it is not authoritative. New code must follow the target architecture. Old code is evidence of what was built, not a specification of what should exist.

---

## 0. Architectural Reboot Posture

### Old Code Is Evidence, Not Authority

The existing codebase contains working implementations that predate the target architecture. These implementations are reference material — they show what behavior exists and what integration contracts are in play. They do not define the correct structure, patterns, or abstractions going forward.

- Do not extend legacy patterns just because they already exist in the repo.
- Do not copy old structural choices into new code.
- Do not use "the old code does it this way" as justification for architectural decisions in new code.
- Do not treat legacy code as correct by default. Verify intent against the architecture package and reconstruction findings.

### New Code Follows Target Architecture

All new code must comply with the target architecture as defined in the architecture package and these guardrails. No exceptions for convenience, familiarity, or consistency with old code.

If new code must interact with old code during a transition period, the new code must still follow the target architecture. The adaptation layer belongs in the old code's space or in an explicit, temporary shim — not in the new code.

### Replacement Over Patching

When the target architecture requires a different structure, pattern, or approach than what currently exists:

- **Replacement is the default.** Build the new implementation according to the target architecture. Do not patch old code into compliance.
- **Patching is allowed only when** the change is a bug fix in currently-running production behavior that cannot wait for replacement, OR when the scope is genuinely trivial and does not risk embedding legacy patterns further.
- If you are unsure whether to patch or replace, default to replace.

### When Patching Old Code Is Allowed

Patching (modifying legacy code without replacing it) is permitted only when ALL of the following are true:

1. The change is a correctness fix, not an architectural improvement.
2. The replacement for this area has not yet been started or is not imminent.
3. The patch does not extend a legacy pattern that the target architecture eliminates.
4. The patch does not introduce new coupling between legacy and target code.

If any condition is not met, the work must be done as part of the replacement stream instead.

### When Replacement Is Required

Replacement is required when any of these apply:

- The target architecture defines a different structure for this concern (e.g., Bootstrap project instead of Api-as-composition-root, Minimal APIs instead of Controllers).
- The change would require extending a pattern that the architecture explicitly forbids (e.g., adding a new Controller, adding logic to `DependencyInjection.cs` in Infrastructure).
- The old implementation violates service boundaries and the fix requires restructuring, not just adjusting a reference.
- The area is scheduled for replacement in the current or next implementation phase.

### Coexistence Rules

During the transition, old and new code will temporarily coexist. This is expected but must be managed:

- **Coexistence must be explicit.** Every PR or ticket that leaves old and new implementations of the same concern in the repo must document that coexistence and identify the follow-up removal work.
- **Coexistence must be short-lived.** Old code for a replaced concern must be removed in the same phase or the immediately following phase. Open-ended coexistence is a defect.
- **Old and new must not call each other's internals.** If old code needs to interact with new code, it goes through contracts or explicit integration points. No reaching into each other's layers.
- **No mixed-pattern files.** A single file must not contain both legacy patterns (e.g., Controller endpoints) and target patterns (e.g., Minimal API endpoints). Split cleanly.
- **Traffic/routing cutover must be explicit.** When a new implementation replaces an old endpoint or consumer, the cutover point (when traffic moves from old to new) must be identified in the ticket.

### Legacy Removal Obligation

When a replacement is verified as complete and correct:

- The superseded legacy code must be removed.
- Removal is not optional cleanup — it is part of the replacement's definition of done.
- If removal cannot happen immediately (e.g., needs a separate deployment), a removal ticket must be created and linked before the replacement ticket is closed.
- Stale legacy code that remains after its replacement is deployed is a defect.

---

## 1. Architectural Boundaries

### Service Isolation

Each service (Players, Matchmaking, Battle) is a bounded context with exclusive ownership of its domain, data, and infrastructure.

- No project references between services except through contract projects.
- No cross-schema database access. Each service's `DbContext` targets its own schema (`players`, `matchmaking`, `battle`).
- No shared mutable state. Redis DB 0 belongs to Battle. Redis DB 1 belongs to Matchmaking. Players does not use Redis.
- No synchronous HTTP/gRPC calls between services. All inter-service communication is async messaging through RabbitMQ/MassTransit.

### Dependency Direction (Clean Architecture)

Dependencies point inward. Never outward.

```
Bootstrap -> Api -> Application -> Domain
                        |
                 Infrastructure
```

Concrete rules:

- **Domain** depends on nothing. Zero NuGet packages except `Microsoft.Extensions.Logging.Abstractions` when `ILogger<T>` is needed. No EF Core. No Redis. No MassTransit. No ASP.NET Core.
- **Application** depends on Domain and abstraction packages only (`Microsoft.Extensions.*`). No infrastructure types. Repository interfaces, messaging ports, and external service ports are defined here as interfaces. Application does not know about Postgres, Redis, or RabbitMQ.
- **Infrastructure** depends on Application (for port interfaces) and Domain. It implements persistence, messaging wiring, Redis operations, auth configuration, and external integrations. Infrastructure is the only layer that references EF Core, MassTransit, StackExchange.Redis, Npgsql, Serilog, and health check packages.
- **Bootstrap** is the composition root. It depends on Api, Application, Infrastructure, and Domain. It owns all DI registration, middleware pipeline, and service wiring.
- **Api** depends on Application (for handlers/services). Api is a thin Minimal API layer. No domain logic. No orchestration beyond dispatching to application layer.

### What Crosses Boundaries

Only these things may be referenced across service boundaries:

- Contract projects (`Kombats.Players.Contracts`, `Kombats.Matchmaking.Contracts`, `Kombats.Battle.Contracts`, `Kombats.Battle.Realtime.Contracts`).
- Shared common libraries under `Kombats.Common` (messaging, infrastructure abstractions).

Nothing else crosses service lines.

### Legacy Boundary Violations

The current codebase contains known boundary violations (e.g., `Kombats.Shared` referenced across services, Api projects serving as composition roots, Controllers instead of Minimal APIs, `DependencyInjection.cs` in Infrastructure projects). These are not grandfathered in. They must not be extended and must be eliminated as each service is replaced.

---

## 2. CQRS Conventions

Kombats uses CQRS at the application layer: separate command handlers and query handlers. No shared read/write models at the handler level.

- **Commands** mutate state and may publish events. Commands return success/failure, not query results.
- **Queries** read state and return data. Queries must not mutate state.
- No MediatR. No in-process mediator library. Handlers are registered directly in DI and called by the API layer.
- Read and write paths may use the same `DbContext` and the same database. There are no separate read/write stores.
- CQRS is an application-layer pattern, not an infrastructure pattern. Do not introduce separate databases, read replicas, or projection stores for CQRS purposes.

---

## 3. Minimal API Rules

All new HTTP endpoints use Minimal APIs. No controllers. No `[ApiController]`. No MVC.

- Endpoints are thin: extract request data, call application handler, return response.
- No domain logic in endpoint definitions.
- No direct DbContext or Redis usage in endpoint definitions.
- Group endpoints logically using `MapGroup`.
- All endpoints require `[Authorize]` unless there is an explicit, documented reason (health checks only).
- Input validation uses FluentValidation at the API layer. Validators run before handlers.
- OpenAPI metadata via `Microsoft.AspNetCore.OpenApi` and Scalar on all API hosts.

Legacy Controller-based endpoints must not be modified to add new behavior. New endpoints are written as Minimal APIs in the target structure. When a service is replaced, all its Controllers are removed.

---

## 4. Messaging and Outbox/Inbox Rules

### Outbox

All event and command publication must go through the MassTransit EF Core transactional outbox. No exceptions.

- Never call `IPublishEndpoint.Publish()` or `ISendEndpoint.Send()` outside of a transactional outbox scope.
- The outbox ensures atomicity: domain write + event publication succeed or fail together.
- Each service's `DbContext` must include outbox and inbox table mappings.

### Inbox

All consumers must use the MassTransit inbox for idempotent message processing. Duplicate messages must be no-ops.

### Consumer Rules

- Consumers are thin. They deserialize the message, call an application handler, and return.
- No domain logic in consumers.
- Consumers must handle all expected message shapes, including edge cases (e.g., null `WinnerIdentityId` on draws).
- Each consumer must be idempotent independently of the inbox — the inbox is a safety net, not a substitute for correct logic.

### Messaging Configuration

All new service implementations use `Kombats.Messaging` for MassTransit configuration. No per-service messaging setup divergence.

Legacy messaging configurations (e.g., `Kombats.Shared/Messaging`, per-service `MessageBusExtensions`) are not extended. They are replaced when their service is replaced.

MassTransit version is pinned at **8.3.0**. Do not upgrade. Do not reference any other version.

### Contract Rules

- Contract projects contain only plain C# types (records, enums, interfaces). Zero NuGet dependencies.
- All integration events carry a `Version: int` field.
- Schema evolution is additive-only. New fields are added; existing fields are never removed or renamed.
- Breaking changes require a new event type.
- Contracts use the publisher's domain language. Consumers translate internally.

---

## 5. Database and Migration Rules

### Schema Isolation

Single PostgreSQL instance, database `kombats`, schema-per-service:
- `players` schema — Players service
- `matchmaking` schema — Matchmaking service
- `battle` schema — Battle service

No cross-schema queries. No cross-schema foreign keys. Each `DbContext` is scoped to its schema.

### EF Core Conventions

- Snake_case naming via `EFCore.NamingConventions` on all `DbContext` configurations.
- Nullable reference types enabled.
- `EnableRetryOnFailure()` on all production connection configurations.
- Optimistic concurrency via revision/concurrency tokens where the domain requires it.

### Migrations

- Migrations are per-service, per-schema.
- No `Database.MigrateAsync()` on application startup. Migrations run as a CI/CD pipeline step before deployment.
- Each migration must target only its own service's schema.
- Migrations must apply cleanly to an empty database (forward migration).

During service replacement, new migrations will target the same schema as the legacy service. If schema changes are incompatible with the old implementation, migration and cutover sequencing must be explicitly planned.

---

## 6. Testing Obligations

No feature or fix is complete without its required tests. Tests are delivery gates.

### Mandatory per implementation slice:
- Domain unit tests for all state transitions, invariants, and business rules.
- Application unit tests for handler orchestration (infrastructure stubbed/faked).
- Infrastructure integration tests for correctness-critical persistence, Redis operations, and outbox/inbox behavior — using real PostgreSQL and Redis (Testcontainers), not mocks.
- API tests for auth enforcement, input validation, and response contracts.
- Consumer idempotency tests: same message twice, second is no-op.
- Contract serialization/deserialization tests.

### Battle-specific mandatory:
- Full determinism test suite: identical inputs produce identical outputs regardless of timing, retry, or execution order.
- Combat math correctness tests.

### Forbidden:
- Mocking `DbContext`, `IDatabase`, or `IPublishEndpoint` in infrastructure tests.
- EF Core in-memory provider for any test.
- Test code or test framework references in production assemblies.

### Legacy tests
Existing tests in the legacy codebase may be useful as behavior verification during replacement. They are not authoritative for the target implementation's test structure or coverage requirements. New implementations must have their own tests written against the target test strategy.

---

## 7. Anti-Patterns and Forbidden Shortcuts

### Forbidden

| Pattern | Why |
|---|---|
| Direct `Publish()`/`Send()` without outbox | Event loss risk. This is the #1 production risk in the system. |
| Cross-schema database access | Violates service boundaries. No exceptions. |
| Domain logic in consumers, endpoints, or infrastructure | Violates Clean Architecture. Domain logic belongs in domain/application layers. |
| `Database.MigrateAsync()` on startup | Race conditions in multi-instance deployments. Migrations run in CI/CD. |
| MassTransit version other than 8.3.0 | Hard constraint. Later versions introduce unacceptable changes. |
| Controllers or MVC patterns in new code | Minimal APIs only. |
| MediatR or in-process mediator | Unnecessary indirection. Direct DI handler registration. |
| Event sourcing | Not required. Aggregates are simple. Outbox handles event publication. |
| Synchronous cross-service HTTP/gRPC calls | Temporal coupling. All inter-service communication is async messaging. |
| `DevSignalRAuthMiddleware` or any dev auth bypass in release builds | Security violation. |
| Mocking infrastructure in integration tests | Masks the exact class of bugs that matter (outbox, CAS, Lua scripts). |
| Shared mutable state between services | Each service owns its state exclusively. |
| Extending legacy patterns in new code | New code follows target architecture. Legacy patterns are replaced, not propagated. |
| `DependencyInjection.cs` or `ServiceCollectionExtensions` in Infrastructure | Composition belongs in Bootstrap only. |
| Adding new Controllers or MVC routes | All new endpoints use Minimal APIs. |
| Referencing `Kombats.Shared` from new code | Legacy shared project. New code uses `Kombats.Common` projects. |

### Strongly Discouraged

| Pattern | Prefer Instead |
|---|---|
| Generic repository wrappers around EF Core | Direct `DbContext` usage in infrastructure layer. |
| Deep abstraction layers for simple operations | Straightforward implementation. |
| Premature shared code extraction | Inline in each service until real duplication proves extraction is needed. |
| Feature flags for in-progress work | Feature branches. Ship complete or don't ship. |
| Patching old code when replacement is imminent | Build the replacement instead. |
| Indefinite coexistence of old and new implementations | Define cutover point and removal timeline. |

---

## 8. Rules for Introducing New Packages or Abstractions

### New NuGet Packages

Before adding any package not listed in the approved baseline (`kombats-technology-and-package-baseline.md`):

1. State the specific problem it solves.
2. Confirm no approved package already solves it.
3. Confirm it is compatible with the pinned dependency versions (MassTransit 8.3.0, EF Core 10.0.3, net10.0).
4. Get explicit approval before adding.

### New Abstractions

Before introducing a new interface, base class, or shared abstraction:

1. Confirm it serves at least two concrete implementations or two services.
2. Confirm it is not a premature generalization of a single-use pattern.
3. If it belongs in `Kombats.Common`, it must be infrastructure or cross-cutting — never service-specific business logic.
4. If it only serves one service, it stays in that service's project.

### New Shared Code

Code may only be added to `Kombats.Common` projects if it meets the criteria in `common-library-strategy.md`. Default to keeping code service-local.

# Common Library Strategy

What belongs in shared code. What does not. How to decide.

---

## Shared Projects

The repository has two shared projects under `src/Kombats.Common/`:

| Project | Purpose |
|---|---|
| `Kombats.Messaging` | MassTransit configuration, outbox/inbox, topology, retry/redelivery, consumer registration, entity naming, health check contribution |
| `Kombats.Abstractions` | Cross-cutting types shared by multiple services: result types, error types, base handler interfaces |

No other shared projects should exist unless a concrete, proven need emerges.

---

## Approved Shared Abstractions (`Kombats.Abstractions`)

These types belong in the shared abstractions project because they are used by multiple services and represent cross-cutting application patterns:

| Type | Purpose | Why Shared |
|---|---|---|
| `Result<T>` | Operation result wrapper | Used by command/query handlers across all services |
| `Error` | Structured error representation | Paired with Result<T> |
| `ICommand<TResult>` / `IQuery<TResult>` | Handler input markers | Used by all services' application layers |
| `ICommandHandler<TCommand, TResult>` / `IQueryHandler<TQuery, TResult>` | Handler contracts | Used by all services' application layers |

### Rules for this project:
- Zero infrastructure dependencies. This project references only `Microsoft.Extensions.*` abstractions.
- No service-specific types. If a type is only meaningful in one service's context, it belongs in that service.
- No logging, no persistence, no messaging, no HTTP concerns.
- Types must be genuinely cross-cutting — used by at least two services in practice, not in theory.

---

## Approved Shared Infrastructure (`Kombats.Messaging`)

This project exists because messaging configuration is non-trivial and must be consistent across all three services. It contains:

| Component | Purpose |
|---|---|
| MassTransit bus configuration | RabbitMQ transport setup with 8.3.0 |
| Outbox configuration | EF Core transactional outbox registration |
| Inbox configuration | Consumer idempotency registration |
| Entity name formatter | Consistent exchange/queue naming (`combats.{event-name}`, kebab-case) |
| Topology configuration | Exchange and queue declaration patterns |
| Consumer registration helpers | Assembly-scanning consumer registration |
| Retry/redelivery policy | 5 retries (200ms-5000ms exponential), redelivery (30s, 120s, 600s) |
| Consume logging filter | Structured logging for consumer activity |
| RabbitMQ health check | Health check contribution for messaging connectivity |

### Rules for this project:
- MassTransit version is pinned at 8.3.0. This project enforces that constraint.
- No service-specific consumer logic. The project provides registration and configuration, not business behavior.
- No domain types. No application types.
- Changes to this project affect all three services — treat changes with proportional care.

---

## What Must Remain Service-Local

The following categories of code must never be extracted into shared projects:

### Domain logic
Each service's domain is its own bounded context. Domain entities, value objects, aggregates, state machines, domain services, and business rules belong exclusively in `Kombats.<Service>.Domain`.

- Players' Character aggregate, stat allocation rules, progression logic
- Matchmaking's Match state machine, pairing rules, timeout logic
- Battle's BattleEngine, CombatMath, deterministic RNG, turn resolution

Even if two services have similar-looking domain patterns (e.g., state machines), they are not the same domain concept and must not be generalized into a shared abstraction.

### Infrastructure implementations
Each service's infrastructure is specific to its persistence model, Redis usage, and consumer behavior.

- Players' `PlayersDbContext`, character repository, consumer implementations
- Matchmaking's `MatchmakingDbContext`, Redis queue scripts, lease management, consumer implementations
- Battle's `BattleDbContext`, Redis CAS scripts, SignalR notifier, consumer implementations

Even if two services use similar Redis patterns, their Lua scripts and data structures serve different domain purposes and must not be generalized.

### Application handlers
Command handlers, query handlers, and orchestration logic are service-specific. They coordinate that service's domain and infrastructure. They do not belong in shared code.

### Service-specific configuration
Each service's `Program.cs`, endpoint definitions, `appsettings.json`, and DI composition are service-specific. Shared helpers may simplify configuration (e.g., the messaging library, auth helpers), but the composition itself remains in each service.

---

## Criteria for Extracting Shared Code

Before moving any code into `Kombats.Common`:

### It must pass ALL of these checks:

1. **Used by at least two services today.** Not "might be used" or "would be useful if." Actually used, in merged code, by two or more services.

2. **The implementations are identical or near-identical.** If two services use similar but differently shaped patterns, they are not candidates for extraction. Similar is not identical.

3. **The abstraction is stable.** If the pattern is still evolving in one service, do not extract it. Let it stabilize first.

4. **Extraction does not create coupling.** The shared code must not force services to coordinate releases or break when one service's needs change. If service A needs a change to the shared code that breaks service B, the code should not be shared.

5. **The shared code is infrastructure or cross-cutting, not business logic.** Business logic extraction into shared code is always wrong in this system.

---

## Criteria for Refusing Extraction

Refuse extraction when any of these apply:

| Signal | Action |
|---|---|
| "This might be useful for other services later" | Keep it service-local. Extract when "later" becomes "now." |
| "These two services have similar patterns" | Similar is not identical. Keep them separate. |
| "Let's create a base class for all entities" | No. Entities are domain-specific. No shared entity base classes. |
| "Let's create a generic repository" | No. Use `DbContext` directly in infrastructure. |
| "Let's create shared Redis helpers" | No. Each service's Redis usage is domain-specific. Lua scripts are not generalizable. |
| "Let's create a shared exception hierarchy" | No. Use `Result<T>` for application-level errors. Let infrastructure exceptions propagate naturally. |
| "Let's create a shared middleware pipeline" | No. Each service composes its own pipeline in `Program.cs`. Shared auth configuration helpers are acceptable; shared pipeline orchestration is not. |
| Code is used by only one service | It stays in that service. Period. |

---

## Anti-Pattern: The Common Dumping Ground

The most frequent architectural erosion in monorepos is gradual accumulation of unrelated code in shared projects. Prevent this by enforcing:

- Every file in `Kombats.Common.*` must have a clear reason for being shared.
- If a file in `Kombats.Common.*` is referenced by only one service, it is a defect. Move it to that service.
- Periodic review: if shared code grows beyond messaging infrastructure and a small set of cross-cutting types, something has gone wrong.
- When in doubt, keep it local. The cost of duplication is lower than the cost of incorrect shared abstractions.

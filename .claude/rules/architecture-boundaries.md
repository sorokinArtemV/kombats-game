# Architecture Boundaries

## Service Isolation

Each service (Players, Matchmaking, Battle) is a bounded context. Exclusive ownership of domain, data, and infrastructure.

- No project references between services except through Contract projects
- No cross-schema database access — each DbContext targets its own schema (`players`, `matchmaking`, `battle`)
- No shared mutable state — Redis DB 0 is Battle, DB 1 is Matchmaking, Players does not use Redis
- No synchronous HTTP/gRPC between services — all inter-service communication is async messaging (AD-09)

### What Crosses Service Boundaries

Only:
- Contract projects: `Kombats.Players.Contracts`, `Kombats.Matchmaking.Contracts`, `Kombats.Battle.Contracts`, `Kombats.Battle.Realtime.Contracts`
- Shared common libraries: `Kombats.Messaging`, `Kombats.Abstractions`

Nothing else.

### Cross-Service References for Contracts

- `Matchmaking.Infrastructure` may reference `Players.Contracts`, `Battle.Contracts`
- `Players.Infrastructure` may reference `Battle.Contracts`
- No service references another service's internal projects (Api, Application, Domain, Infrastructure)

---

## Dependency Direction (Clean Architecture)

```
Bootstrap → Api → Application → Domain
                      |
               Infrastructure
```

### Domain
Depends on nothing. Zero NuGet packages except `Microsoft.Extensions.Logging.Abstractions` when `ILogger<T>` is needed. No EF Core. No Redis. No MassTransit. No ASP.NET Core.

### Application
Depends on Domain and abstraction packages (`Microsoft.Extensions.*`). Defines repository interfaces, messaging ports, external service ports. Does not know about Postgres, Redis, or RabbitMQ.

### Infrastructure
Depends on Application (port interfaces) and Domain. Implements persistence, messaging consumers, Redis operations, auth configuration, external integrations. Only layer that references EF Core, MassTransit, StackExchange.Redis, Npgsql, Serilog, health check packages.

**Must not contain** `DependencyInjection.cs`, `ServiceCollectionExtensions`, or any composition logic.

### Api
Depends on Application (to dispatch commands/queries). Thin Minimal API transport layer.

**Must not contain** DI registration, `Program.cs`, middleware, `WebApplication`, infrastructure code, domain logic.

### Bootstrap
Composition root. Depends on Api, Application, Infrastructure, Domain, Contracts, Common. Owns all DI registration, middleware pipeline, endpoint mapping, hosted worker registration.

**Must not contain** business logic, domain code, infrastructure implementations.

---

## Shared Code Rules

Shared code lives under `src/Kombats.Common/`:
- `Kombats.Messaging` — MassTransit config, outbox/inbox, topology, retry, consumer registration
- `Kombats.Abstractions` — Result<T>, Error, handler interfaces

No other shared project unless proven need across multiple services. Code in `Kombats.Common` must be infrastructure or cross-cutting — never service-specific business logic. If referenced by only one service, move it to that service.

`Kombats.Shared` (legacy) must not be referenced from new code. Use `Kombats.Common` projects instead.

---

## Composition Root Discipline

Bootstrap is the single composition root per service. It is the only `Microsoft.NET.Sdk.Web` project.

All DI registration happens in Bootstrap:
- MassTransit, EF Core, Redis, auth, health checks, SignalR, handler registration
- Middleware pipeline ordering
- Endpoint mapping (calls into Api for route registration)
- Hosted worker registration

No other project registers services into the DI container.

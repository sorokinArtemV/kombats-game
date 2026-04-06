# Kombats Technology and Package Baseline

## 1. Purpose and Scope

This document defines the approved technology and package baseline for the Kombats backend. It is a normative reference for the next implementation phase across all three in-scope services: `Kombats.Players`, `Kombats.Matchmaking`, and `Kombats.Battle`.

The baseline was derived from current repository evidence, cross-referenced against the architecture decisions in `kombats-architecture-decisions.md` and the system architecture in `kombats-system-architecture.md`. Current repository contents were treated as evidence, not as a shape to preserve. Packages and versions present in the repository are not automatically approved; each entry below reflects a conscious decision.

Implementation work that introduces packages, versions, or patterns not covered by this document must justify the addition before proceeding.

---

## 2. Platform Baseline

### Runtime and SDK

| Property | Approved Value |
|---|---|
| Target framework | `net10.0` |
| .NET SDK | 10.0.x (latest patch) |
| Language version | `latest` |
| Nullable reference types | `enable` |
| Implicit usings | `enable` |
| Container base images | `mcr.microsoft.com/dotnet/aspnet:10.0` (runtime), `mcr.microsoft.com/dotnet/sdk:10.0` (build) |
| Container target OS | Linux |

### Required project properties

Every `.csproj` in the monorepo must include:

```xml
<TargetFramework>net10.0</TargetFramework>
<ImplicitUsings>enable</ImplicitUsings>
<Nullable>enable</Nullable>
<LangVersion>latest</LangVersion>
```

**Current drift.** Several projects omit `LangVersion` (Players.Domain, Players.Infrastructure, Players.Application, Players.Contracts, Matchmaking.Contracts, Matchmaking.Domain). This is tolerable because the SDK default for net10.0 resolves to a recent language version, but explicit declaration removes ambiguity. Normalize during implementation.

### SDK version pinning

**Current state.** No `global.json` exists. The SDK version is implicitly resolved from the environment.

**Baseline decision.** Add a `global.json` at the repository root that pins the SDK major.minor and allows patch roll-forward:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestPatch"
  }
}
```

This ensures reproducible builds across developer machines and CI without blocking patch-level security updates.

### Central package management

**Current state.** No `Directory.Packages.props` exists. Each project declares its own package versions independently. This has produced version drift across the monorepo (documented in Section 9).

**Baseline decision.** Introduce `Directory.Packages.props` at the repository root during the next implementation phase. All package versions must be declared centrally. Individual `.csproj` files reference packages without version attributes. This eliminates accidental version divergence and makes intentional version constraints visible in one place.

### Web API SDK

API host projects (`*.Api`) use `Microsoft.NET.Sdk.Web`. All other projects use `Microsoft.NET.Sdk`.

### Namespace convention

**Current drift.** Two projects use legacy root namespaces that do not match their project names:
- `Kombats.Infrastructure.Messaging` (to be renamed `Kombats.Messaging`) declares `RootNamespace` as `Combats.Infrastructure.Messaging` (note: C**o**mbats, not K**o**mbats)
- `Kombats.Battle.Realtime.Contracts` declares `RootNamespace` as `Combats.Battle.Realtime.Contracts`

**Baseline decision.** The canonical prefix is `Kombats`, not `Combats`. Correct these namespaces during implementation. All new code must use `Kombats.*` namespaces.

---

## 3. Messaging and Integration Baseline

### Message broker

| Property | Approved Value |
|---|---|
| Broker | RabbitMQ |
| Infrastructure version | 3.13.x (management image) |
| .NET transport | MassTransit over RabbitMQ |

### MassTransit version constraint

| Package | Approved Version | Constraint |
|---|---|---|
| `MassTransit` | **8.3.0** | **Pinned. Do not upgrade.** |
| `MassTransit.RabbitMQ` | **8.3.0** | **Pinned. Do not upgrade.** |
| `MassTransit.EntityFrameworkCore` | **8.3.0** | **Pinned. Do not upgrade.** |
| `MassTransit.Abstractions` | **8.3.0** | **Pinned. Do not upgrade.** |

This is an intentional version constraint. Later MassTransit versions introduce changes that are not acceptable for this project. All services and shared libraries must use 8.3.0. No exceptions.

**Current drift.** `Kombats.Shared` (Players' current shared library) references `MassTransit.RabbitMQ` at version `8.5.8`. This is a legacy divergence from before Players was aligned to the shared messaging library. It will be resolved when Players migrates to `Kombats.Messaging` per AD-12. No new code should reference MassTransit at any version other than 8.3.0.

### Shared messaging library

All services must use `Kombats.Messaging` (`src/Kombats.Common/Kombats.Messaging`) for MassTransit configuration. This library provides:

- Outbox and inbox support (MassTransit EF Core transactional outbox)
- Entity name formatting and topology conventions
- Consumer registration patterns
- Consume logging filters
- Retry and redelivery configuration

**Current state.** Matchmaking and Battle reference `Kombats.Messaging` (currently named `Kombats.Infrastructure.Messaging` in the repo — renamed during foundation phase). Players uses a separate, simpler `MessageBusExtensions` in `Kombats.Shared`. Per AD-12, Players must migrate to the shared messaging library.

### Messaging patterns

- **Integration events**: pub/sub via RabbitMQ exchanges (MassTransit publish)
- **Commands**: point-to-point via RabbitMQ queues (MassTransit send)
- **Outbox**: MassTransit EF Core transactional outbox for all services (AD-01)
- **Inbox**: MassTransit inbox for consumer idempotency
- **No synchronous cross-service calls** (AD-09)

### Contract projects

Integration contracts are plain class libraries with no package dependencies:

- `Kombats.Players.Contracts`
- `Kombats.Matchmaking.Contracts`
- `Kombats.Battle.Contracts`
- `Kombats.Battle.Realtime.Contracts`

Consuming services reference contract projects directly via project references. No NuGet packaging. All contracts carry a `Version: int` field (AD-06).

---

## 4. Persistence Baseline

### PostgreSQL

| Property | Approved Value |
|---|---|
| Database engine | PostgreSQL |
| Infrastructure version | 16.x (Alpine image) |
| Database | Single instance, database name `kombats` |
| Schema isolation | One schema per service: `players`, `matchmaking`, `battle` |
| Cross-schema access | **Prohibited** (AD-07) |

### Entity Framework Core

| Package | Approved Version |
|---|---|
| `Microsoft.EntityFrameworkCore` | 10.0.3 |
| `Microsoft.EntityFrameworkCore.Design` | 10.0.3 (PrivateAssets=all, design-time only) |
| `Microsoft.EntityFrameworkCore.Relational` | 10.0.3 (where directly required) |
| `Npgsql.EntityFrameworkCore.PostgreSQL` | 10.0.0 |
| `EFCore.NamingConventions` | 10.0.1 |

### EF Core conventions

- Snake_case naming convention via `EFCore.NamingConventions` (all services)
- Each service has its own `DbContext` scoped to its schema
- Optimistic concurrency via revision/concurrency tokens where needed
- Connection resilience: `EnableRetryOnFailure()` required for production (currently missing in some services — add during implementation)

### Migrations

- Migrations are per-service, per-schema
- Auto-migration on startup (`Database.MigrateAsync()` in `Program.cs`) is removed in the target architecture (AD-13)
- Migrations run as a CI/CD pipeline step before application deployment

### Redis

| Package | Approved Version |
|---|---|
| `StackExchange.Redis` | 2.8.16 |

| Property | Approved Value |
|---|---|
| Infrastructure version | Redis 7.x (Alpine image) |
| Deployment topology (dev) | Single instance |
| Deployment topology (prod) | Redis Sentinel (AD-08) |
| Database isolation | DB 0: Battle, DB 1: Matchmaking |

Redis is used by Battle (hot state store, Lua scripts, deadlines, locks) and Matchmaking (queue data structures, distributed lease, player status cache). Players does not use Redis.

Redis Cluster is explicitly rejected due to Lua script multi-key constraints (AD-08).

---

## 5. Authentication and Authorization Baseline

### Identity provider

| Property | Approved Value |
|---|---|
| Provider | Keycloak |
| Infrastructure version | 26.0 |
| Realm | `kombats` |
| Token type | JWT Bearer |

### ASP.NET Core authentication

| Package | Approved Version |
|---|---|
| `Microsoft.AspNetCore.Authentication.JwtBearer` | 10.0.3 |

All HTTP-facing services must validate JWT tokens from Keycloak (AD-03). Configuration pattern:

- Authority = Keycloak realm URL
- Audience = configured client ID
- IdentityId extracted from JWT claims via standard ASP.NET Core mechanisms
- `[Authorize]` on all HTTP endpoints

**Current state.** Only Players has JWT Bearer authentication configured. Matchmaking has no auth (security gap). Battle has a dev auth bypass (`DevSignalRAuthMiddleware`). Both gaps must be closed during implementation.

### Service-to-service messaging

RabbitMQ messaging is trusted. No per-message JWT validation on consumers. Services publish and consume within the monorepo's trust boundary.

---

## 6. Realtime / Battle Runtime Baseline

### SignalR

SignalR is used by Battle for bidirectional real-time communication with game clients. It is provided by the `Microsoft.AspNetCore.App` framework reference (no additional NuGet package required).

Architecture:
- `BattleHub` is a thin adapter — no domain logic in the hub
- `IBattleRealtimeNotifier` port in the application layer, `SignalRBattleRealtimeNotifier` adapter in infrastructure
- `Kombats.Battle.Realtime.Contracts` defines event names and client-facing contract types

SignalR is not used by Players or Matchmaking.

### Battle engine

The battle engine (`BattleEngine`) is a pure domain function with zero infrastructure dependencies. State in, result out. Deterministic randomization via Xoshiro256** PRNG with splitmix64 seeding (AD-11).

No packages are required for the engine. It must remain dependency-free.

### Battle state management

Active battle state lives in Redis (Lua scripts for atomic CAS transitions). Completed battle records are written to PostgreSQL. The self-consumption pattern (consuming own `BattleCompleted` event) is removed in favor of direct writes (AD-10).

---

## 7. Observability and Health Baseline

### Structured logging

| Package | Approved Version |
|---|---|
| `Serilog.AspNetCore` | **10.0.0** |
| `Serilog.Settings.Configuration` | 10.0.0 |
| `Serilog.Sinks.Console` | 6.1.1 |
| `Serilog.Exceptions` | 8.4.0 |

Serilog is the approved structured logging framework. All API host projects must use `Serilog.AspNetCore` at version 10.0.0.

**Current drift.** Matchmaking uses `Serilog.AspNetCore` at version `8.0.3`. This must be updated to 10.0.0 during implementation.

**Removed from baseline.** `Serilog.Sinks.ApplicationInsights` (version 5.0.0, present in `Kombats.Shared`) is not part of the approved baseline. Application Insights is not used as a monitoring backend for Kombats. Remove during Players' migration away from `Kombats.Shared`.

### Telemetry

**Current state.** OpenTelemetry packages are present only in `Kombats.Shared` (Players' shared library):

- `OpenTelemetry` 1.15.0
- `OpenTelemetry.Exporter.Console` 1.15.0
- `OpenTelemetry.Exporter.OpenTelemetryProtocol` 1.15.0
- `OpenTelemetry.Extensions.Hosting` 1.15.0
- `OpenTelemetry.Instrumentation.AspNetCore` 1.15.0
- `OpenTelemetry.Instrumentation.Http` 1.15.0
- `OpenTelemetry.Instrumentation.Runtime` 1.15.0
- `OpenTelemetry.Instrumentation.SqlClient` 1.15.0

**Baseline decision.** OpenTelemetry is the approved telemetry standard, but its current integration is incomplete and service-specific. The package set and configuration approach must be standardized across all three services before it is considered baseline. See Section 11 (Open Technology Questions).

### Health checks

**Current state.** No health check NuGet packages are referenced. Players returns `200 OK` unconditionally. Health probes are under-specified.

**Baseline decision.** All services must implement ASP.NET Core health checks with dependency probes. Required packages (to be added):

| Package | Purpose |
|---|---|
| `AspNetCore.HealthChecks.NpgSql` | PostgreSQL connectivity |
| `AspNetCore.HealthChecks.RabbitMQ` | RabbitMQ connectivity |
| `AspNetCore.HealthChecks.Redis` | Redis connectivity (Battle, Matchmaking only) |

Exact versions to be determined when packages are added. Use the latest stable versions compatible with net10.0.

### API documentation

| Package | Approved Version |
|---|---|
| `Microsoft.AspNetCore.OpenApi` | 10.0.3 |
| `Scalar.AspNetCore` | 2.13.19 |

All API host projects must expose OpenAPI documentation via Scalar.

**Current drift.** Matchmaking uses `Microsoft.AspNetCore.OpenApi` at version `10.0.1` (should be `10.0.3`). Battle has neither package — OpenAPI and Scalar must be added during implementation.

---

## 8. Testing Baseline

### Current state

No test projects exist in the repository. `Kombats.Battle.Domain.csproj` declares `InternalsVisibleTo` for `Kombats.Battle.Application.Tests`, indicating a planned but not yet created test project.

### Approved test framework

| Component | Approved Choice |
|---|---|
| Test runner / framework | xUnit |
| Assertion library | FluentAssertions |
| Mocking library | NSubstitute |
| Integration test containers | Testcontainers for .NET (PostgreSQL, Redis) |
| Messaging test approach | MassTransit test harness for consumer behavior and idempotency tests; real RabbitMQ via Testcontainers for outbox dispatch and end-to-end messaging tests |

**Rationale:** xUnit is the dominant test framework in modern .NET, with the best tooling and community support. FluentAssertions provides readable, expressive assertions. NSubstitute is lightweight and interface-focused, well-suited to stubbing application-layer ports. Testcontainers provides real infrastructure per test class with no shared state. The MassTransit test harness is fast and high-fidelity for consumer logic; real RabbitMQ via Testcontainers is used where transport-level behavior matters (outbox dispatch, topology).

**Constraints:**
- Domain and application layer tests must be unit tests with no infrastructure dependencies
- Battle engine tests must verify deterministic combat resolution (AD-11)
- Infrastructure tests must use real dependencies (PostgreSQL, Redis) — no mocking infrastructure

### Test project naming convention

```
Kombats.<Service>.<Layer>.Tests
```

Examples:
- `Kombats.Battle.Domain.Tests`
- `Kombats.Battle.Application.Tests`
- `Kombats.Matchmaking.Infrastructure.Tests`

---

## 9. Approved Package and Version Baseline

This is the canonical package list. Central package management (`Directory.Packages.props`) should declare exactly these versions. Packages not on this list require justification before adoption.

### Core platform

| Package | Approved Version | Notes |
|---|---|---|
| `Microsoft.Extensions.DependencyInjection.Abstractions` | 10.0.3 | |
| `Microsoft.Extensions.Hosting.Abstractions` | 10.0.3 | |
| `Microsoft.Extensions.Logging.Abstractions` | 10.0.3 | Normalize (current drift: 9.0.0, 10.0.0, 10.0.3) |
| `Microsoft.Extensions.Configuration.Abstractions` | 10.0.3 | |
| `Microsoft.Extensions.Configuration.Binder` | 10.0.3 | |
| `Microsoft.Extensions.Options` | 10.0.3 | |
| `Microsoft.Extensions.Options.ConfigurationExtensions` | 10.0.3 | |

### Messaging

| Package | Approved Version | Notes |
|---|---|---|
| `MassTransit` | **8.3.0** | **Pinned — do not upgrade** |
| `MassTransit.RabbitMQ` | **8.3.0** | **Pinned — do not upgrade** |
| `MassTransit.EntityFrameworkCore` | **8.3.0** | **Pinned — do not upgrade** |
| `MassTransit.Abstractions` | **8.3.0** | **Pinned — do not upgrade** |

### Persistence

| Package | Approved Version | Notes |
|---|---|---|
| `Microsoft.EntityFrameworkCore` | 10.0.3 | |
| `Microsoft.EntityFrameworkCore.Design` | 10.0.3 | PrivateAssets=all |
| `Microsoft.EntityFrameworkCore.Relational` | 10.0.3 | Only where directly needed |
| `Npgsql.EntityFrameworkCore.PostgreSQL` | 10.0.0 | |
| `EFCore.NamingConventions` | 10.0.1 | Snake_case convention |
| `StackExchange.Redis` | 2.8.16 | Battle + Matchmaking only |

### Authentication

| Package | Approved Version | Notes |
|---|---|---|
| `Microsoft.AspNetCore.Authentication.JwtBearer` | 10.0.3 | All API hosts |

### Logging

| Package | Approved Version | Notes |
|---|---|---|
| `Serilog.AspNetCore` | 10.0.0 | All API hosts |
| `Serilog.Settings.Configuration` | 10.0.0 | |
| `Serilog.Sinks.Console` | 6.1.1 | |
| `Serilog.Exceptions` | 8.4.0 | |

### API documentation

| Package | Approved Version | Notes |
|---|---|---|
| `Microsoft.AspNetCore.OpenApi` | 10.0.3 | All API hosts |
| `Scalar.AspNetCore` | 2.13.19 | All API hosts |

### Validation

| Package | Approved Version | Notes |
|---|---|---|
| `FluentValidation` | 12.1.1 | API-layer input validation |
| `FluentValidation.DependencyInjectionExtensions` | 12.1.1 | |

### DI registration

| Package | Approved Version | Notes |
|---|---|---|
| `Scrutor` | 7.0.0 | Assembly-scanning DI registration |

### Testing

| Package | Approved Version | Notes |
|---|---|---|
| `xunit` | latest stable | Test framework |
| `xunit.runner.visualstudio` | latest stable | Test runner integration |
| `Microsoft.NET.Test.Sdk` | latest stable | Test SDK |
| `FluentAssertions` | latest stable | Assertion library |
| `NSubstitute` | latest stable | Mocking / stubbing |
| `Testcontainers.PostgreSql` | latest stable | Real PostgreSQL for integration tests |
| `Testcontainers.Redis` | latest stable | Real Redis for integration tests |
| `Testcontainers.RabbitMq` | latest stable | Real RabbitMQ for outbox/messaging tests |
| `MassTransit.Testing` | **8.3.0** | **Pinned — matches MassTransit version** |

Test package versions (except MassTransit.Testing) are not pinned. Use latest stable compatible with net10.0. Pin in `Directory.Packages.props` once resolved during foundation phase.

### Packages to be removed from the codebase

| Package | Current Location | Reason |
|---|---|---|
| `Serilog.Sinks.ApplicationInsights` 5.0.0 | `Kombats.Shared` | Application Insights is not used |
| `MassTransit.RabbitMQ` 8.5.8 | `Kombats.Shared` | Version drift; Players migrates to shared messaging library at 8.3.0 |
| `OpenTelemetry.Instrumentation.SqlClient` 1.15.0 | `Kombats.Shared` | SqlClient is not used (Npgsql is the provider) |

---

## 10. Technology Constraints and Explicit Non-Goals

### Constraints

1. **MassTransit must remain at 8.3.0.** This is a hard constraint. Later versions introduce changes that are not acceptable for this project. All services, shared libraries, and future code must reference 8.3.0.

2. **No synchronous cross-service communication.** Services communicate exclusively through RabbitMQ/MassTransit. No HTTP or gRPC calls between services (AD-09).

3. **No cross-schema database access.** Each service's `DbContext` is scoped to its own PostgreSQL schema. No queries across schemas (AD-07).

4. **Redis Sentinel, not Cluster, for production.** Lua scripts use multi-key operations that are incompatible with Redis Cluster's slot model (AD-08).

5. **No auto-migration on startup.** `Database.MigrateAsync()` must not be called in `Program.cs`. Migrations run in CI/CD (AD-13).

6. **Contract projects must have zero package dependencies.** They contain only plain C# types (records, enums, interfaces).

7. **Domain projects must have zero infrastructure dependencies.** Domain layers reference no NuGet packages except `Microsoft.Extensions.Logging.Abstractions` for `ILogger<T>` when needed.

8. **Application projects depend only on domain projects and abstractions packages.** No infrastructure leakage into the application layer.

### Explicit non-goals

1. **MediatR or in-process mediator libraries.** The existing command/query handler pattern with direct DI registration is sufficient. Adding a mediator adds indirection without proportional benefit for services of this size.

2. **Event sourcing.** No service requires event sourcing. The transactional outbox provides reliable event publication. The data models are simple aggregates, not event streams.

3. **CQRS with separate read/write stores.** Read patterns across all services are simple enough that a single model is correct.

4. **GraphQL or OData.** The API surfaces are small. REST with Minimal APIs is the correct choice.

5. **gRPC for inter-service communication.** All inter-service communication is asynchronous messaging. gRPC would introduce synchronous coupling.

6. **NuGet packaging of contract projects.** In a monorepo with co-deployed services, project references provide compile-time safety. NuGet adds build pipeline complexity with no benefit.

7. **Schema registry (Avro, Protobuf).** Additive-only event versioning with a `Version` field and compile-time project references is sufficient for a co-deployed monorepo (AD-06).

8. **Polly or external resilience libraries.** MassTransit provides retry/redelivery for messaging. EF Core provides `EnableRetryOnFailure()` for database connections. Additional resilience libraries are not needed unless a specific, justified use case emerges.

---

## 11. Open Technology Questions

These questions must be resolved before or during the implementation phase. They are not blockers for starting work, but they represent gaps in the current baseline.

### ~~OQ-1: Test framework selection~~ — RESOLVED

**Decision:** xUnit + FluentAssertions + NSubstitute + Testcontainers for .NET + MassTransit test harness (8.3.0). Real RabbitMQ via Testcontainers for outbox dispatch tests. See Section 8 for details and Section 9 for approved packages. No longer blocks test project creation.

### OQ-2: OpenTelemetry standardization

OpenTelemetry packages exist only in `Kombats.Shared` (Players-local). The telemetry integration must be standardized:
- Should OpenTelemetry configuration move into `Kombats.Messaging` or a new shared observability library?
- Which instrumentations are required across all services? (AspNetCore, Http, EF Core via Npgsql, MassTransit)
- What is the export target? (OTLP collector, console for dev, something else for production)
- `OpenTelemetry.Instrumentation.SqlClient` is present but irrelevant (the system uses Npgsql, not SqlClient). Replace with `Npgsql.OpenTelemetry` if EF Core/Npgsql tracing is desired.

**Impact:** Observability is inconsistent across services until resolved.

### ~~OQ-3: Shared library consolidation~~ — RESOLVED

**Decision:** Two shared projects under `src/Kombats.Common/`:
- `Kombats.Messaging` — MassTransit configuration, outbox/inbox, topology, retry, consumer registration. Currently named `Kombats.Infrastructure.Messaging` in the repo; renamed during foundation phase.
- `Kombats.Abstractions` — `Result<T>`, `Error`, `ICommand<TResult>`/`IQuery<TResult>`, `ICommandHandler<TCommand, TResult>`/`IQueryHandler<TQuery, TResult>`.

Players migrates to `Kombats.Messaging` for messaging (AD-12). Useful cross-cutting types from `Kombats.Shared` move to `Kombats.Abstractions`. Service-specific types stay service-local. `Kombats.Shared` is removed after Players replacement. See `common-library-strategy.md` for extraction criteria.

### OQ-4: Health check package versions

Health check packages (`AspNetCore.HealthChecks.*`) are not yet referenced. Specific versions must be selected when they are added. Prefer latest stable versions compatible with net10.0 and the pinned dependency versions (especially EF Core 10.0.3 and Npgsql 10.0.0).

**Impact:** Low — can be resolved when health checks are implemented.

### OQ-5: FluentValidation scope

FluentValidation is currently used only by Players. Should it be the standard for API-layer input validation across all three services, or is it optional per service? Matchmaking and Battle currently have no equivalent.

**Impact:** Low — affects consistency but not architecture.

### OQ-6: Serilog sink strategy

Battle uses `Serilog.Sinks.Console`. Players/Shared references `Serilog.Sinks.ApplicationInsights` (to be removed). No service uses a structured sink suitable for production log aggregation (e.g., Seq, Elasticsearch, OTLP). The production logging sink strategy is undefined.

**Impact:** Does not block implementation, but must be resolved before production deployment.

---

## Recommended Placement in Architecture Package

This document belongs in:

```
.claude/docs/architecture/kombats-technology-and-package-baseline.md
```

It is a peer of:
- `kombats-system-architecture.md` — defines what the system is and how services interact
- `kombats-architecture-decisions.md` — records specific decisions, trade-offs, and rejected alternatives

This document fills a different role: it defines the approved technology stack, package versions, and implementation standards that the system architecture and decisions depend on. It is referenced by implementation work, not by architectural reasoning.

The three documents together form the complete architecture package:

1. **System architecture** — structure, responsibilities, integration model
2. **Architecture decisions** — rationale for key choices
3. **Technology and package baseline** — approved stack, versions, constraints, and standards

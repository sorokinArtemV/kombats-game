# .NET Style and Solution Structure

## Solution Structure

### Root-Level Files

| File | Purpose |
|---|---|
| `global.json` | Pins .NET SDK 10.0.x with `latestPatch` roll-forward |
| `Directory.Packages.props` | Central package management — all NuGet versions here |
| `Directory.Build.props` | Shared: `net10.0`, `Nullable enable`, `ImplicitUsings enable`, `LangVersion latest` |
| `.editorconfig` | Code style rules |
| `Kombats.sln` | Unified solution — replaces per-service `.sln` and `.slnx` |
| `docker-compose.yml` | PostgreSQL 16, RabbitMQ 3.13, Redis 7, Keycloak 26 |

### Project SDK Rules

| Project Type | SDK |
|---|---|
| `*.Bootstrap` | `Microsoft.NET.Sdk.Web` |
| All other projects | `Microsoft.NET.Sdk` |

Api is explicitly NOT `Microsoft.NET.Sdk.Web` in target state — prevents it from being a composition root.

---

## Project Naming

```
Kombats.<Service>.<Layer>
```

Examples:
- `Kombats.Players.Bootstrap`
- `Kombats.Battle.Domain`
- `Kombats.Matchmaking.Infrastructure`
- `Kombats.Players.Contracts`

Test projects:
```
Kombats.<Service>.<Layer>.Tests
```

Shared projects:
- `Kombats.Messaging` (under `src/Kombats.Common/`)
- `Kombats.Abstractions` (under `src/Kombats.Common/`)

---

## Namespace Convention

Root prefix: **`Kombats`**. Not `Combats`. Not any other variant.

All new code uses `Kombats.*` namespaces. Legacy `Combats.*` namespaces (currently in `Kombats.Infrastructure.Messaging` and `Kombats.Battle.Realtime.Contracts`) must be corrected during implementation. The messaging library is renamed to `Kombats.Messaging`.

---

## Project Roles

### Bootstrap
- Composition root, executable
- `Program.cs`, `appsettings.json`, `Dockerfile`
- All DI registration, middleware pipeline, endpoint mapping, hosted workers
- References: Api, Application, Infrastructure, Domain, Contracts, Common

### Api
- Transport layer, plain class library
- Minimal API endpoint definitions, SignalR hubs (Battle), request/response DTOs
- References: Application only

### Application
- Use-case orchestration
- Command/query handlers, port interfaces, application validation
- References: Domain (and Abstractions)

### Domain
- Pure business logic
- Entities, aggregates, value objects, domain services, domain events, invariants
- References: nothing (or Abstractions for shared primitives)

### Infrastructure
- Port implementations
- DbContext, entity configs, repositories, consumers, Redis operations, SignalR notifiers, migrations
- References: Application, Domain, own Contracts, cross-service Contracts

### Contracts
- Cross-service integration surface
- Integration event records, command records, shared enums
- References: nothing. Zero NuGet dependencies.

---

## Central Package Management

All NuGet package versions declared in `Directory.Packages.props` at repo root. Individual `.csproj` files reference packages without version attributes.

Key pinned versions:
- MassTransit: 8.3.0
- EF Core: 10.0.3
- Npgsql: 10.0.0
- StackExchange.Redis: 2.8.16
- Serilog.AspNetCore: 10.0.0
- FluentValidation: 12.1.1

See `kombats-technology-and-package-baseline.md` for the complete approved list.

---

## EF Core Conventions

- Snake_case naming via `EFCore.NamingConventions`
- Nullable reference types enabled
- `EnableRetryOnFailure()` on production connections
- Optimistic concurrency via revision/concurrency tokens where domain requires it
- Migrations per-service, per-schema
- CLI: `dotnet ef migrations add <Name> --startup-project <Bootstrap> --project <Infrastructure>`

---

## Configuration

Each Bootstrap project contains:
- `appsettings.json` (default/production)
- `appsettings.Development.json` (local dev overrides)

Expected sections:
- `ConnectionStrings:Postgres`
- `ConnectionStrings:Redis` (Matchmaking, Battle)
- `RabbitMq` (host, credentials)
- `Keycloak` (authority, audience)

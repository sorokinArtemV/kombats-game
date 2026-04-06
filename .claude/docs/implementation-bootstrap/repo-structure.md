# Repository Structure

Target layout for the Kombats repository as it evolves from its current state toward the target architecture. This is an in-place architectural reboot — not a new repository.

The target structure is derived from the architecture package. It defines what the repository must become, how new projects are introduced alongside existing ones, and how legacy structure is treated during migration.

---

## Current Repository State

The existing repository has this general shape:

```
kombats-game/
├── Kombats.slnx                          # existing solution (slnx format)
├── Kombats.Players/                      # root-level legacy Players artifacts
├── Kombats.Shared/                       # root-level legacy shared project
├── docker-compose.yaml
├── docs/
├── infra/
├── scripts/
├── sql/
├── tools/
├── src/
│   ├── Kombats.Players/                  # Players service (Api as composition root, Controllers)
│   │   └── Kombats.Shared/              # legacy shared project inside Players
│   ├── Kombats.Matchmaking/             # Matchmaking service (Api as composition root, Controllers)
│   ├── Kombats.Battle/                  # Battle service (Api as composition root, Controllers)
│   └── Kombats.Common/
│       └── Kombats.Infrastructure.Messaging/
└── tests/                                # may not exist yet
```

Key legacy characteristics:
- Per-service `.sln` files (not a single unified solution)
- Api projects serve as composition roots (`Microsoft.NET.Sdk.Web`) — no separate Bootstrap projects
- Controller-based endpoints (MVC) in Battle and Matchmaking
- `Kombats.Shared` project (legacy shared code with mixed concerns)
- No `Kombats.Abstractions` project
- No `Directory.Packages.props` or `Directory.Build.props`
- No `global.json`
- `DependencyInjection.cs` / `ServiceCollectionExtensions` in Infrastructure projects

These are not errors to fix incrementally. They are structural characteristics of the legacy codebase that the replacement work will supersede.

---

## Target Repository Structure

This is the structure the repository must evolve toward. New projects are created as part of the replacement work for each service. Legacy projects coexist temporarily during migration and are removed after cutover.

### Root

```
kombats-game/
├── global.json
├── Directory.Packages.props
├── Directory.Build.props
├── .editorconfig
├── Kombats.sln                           # unified solution replacing per-service .sln files and .slnx
├── docker-compose.yml
├── docker-compose.override.yml
├── .gitignore
├── .dockerignore
├── src/
└── tests/
```

### Root-Level Files

| File | Purpose | Migration Note |
|---|---|---|
| `global.json` | Pins .NET SDK version with `latestPatch` roll-forward. | Does not exist yet. Create during foundation phase. |
| `Directory.Packages.props` | Central package management. All NuGet versions declared here. | Does not exist yet. Create during foundation phase. Individual `.csproj` files must be updated to remove version attributes. |
| `Directory.Build.props` | Shared build properties: `TargetFramework`, `LangVersion`, `Nullable`, `ImplicitUsings`. | Does not exist yet. Create during foundation phase. |
| `.editorconfig` | Code style rules. | May exist; update or create as needed. |
| `Kombats.sln` | Unified solution file referencing all `src/` and `tests/` projects. | Replaces per-service `.sln` files and `Kombats.slnx`. Legacy solution files are removed after all services are migrated to the unified solution. |
| `docker-compose.yml` | Infrastructure services: PostgreSQL, RabbitMQ, Redis, Keycloak. | `docker-compose.yaml` exists. Rename or replace as part of foundation work. |
| `docker-compose.override.yml` | Dev-time overrides. | Create during foundation phase. |

### Root-Level Legacy Artifacts

These items exist at the repo root and are legacy:

| Item | Disposition |
|---|---|
| `Kombats.slnx` | Replaced by `Kombats.sln` during foundation phase. Remove after migration. |
| `Kombats.Players/` (root-level) | Legacy artifact. Evaluate and remove when Players replacement is complete. |
| `Kombats.Shared/` (root-level) | Legacy shared project. Do not reference from new code. Remove when no legacy code depends on it. |
| `docs/` | Evaluate contents. Architecture docs live in `.claude/docs/`. Other docs may remain or be relocated. |
| `infra/`, `scripts/`, `sql/`, `tools/` | Evaluate during foundation phase. Keep what is operationally needed, remove what is superseded. |

---

## src/ Layout — Target Projects

New target-architecture projects are introduced into `src/` alongside existing projects. They follow this structure:

```
src/
├── Kombats.Common/
│   ├── Kombats.Messaging/
│   │   └── Kombats.Messaging.csproj
│   └── Kombats.Abstractions/
│       └── Kombats.Abstractions.csproj
│
├── Kombats.Players/
│   ├── Kombats.Players.Bootstrap/
│   │   └── Kombats.Players.Bootstrap.csproj
│   ├── Kombats.Players.Api/                    ← existing project, replaced in-place or alongside
│   │   └── Kombats.Players.Api.csproj
│   ├── Kombats.Players.Application/
│   │   └── Kombats.Players.Application.csproj
│   ├── Kombats.Players.Domain/
│   │   └── Kombats.Players.Domain.csproj
│   ├── Kombats.Players.Infrastructure/
│   │   └── Kombats.Players.Infrastructure.csproj
│   └── Kombats.Players.Contracts/
│       └── Kombats.Players.Contracts.csproj
│
├── Kombats.Matchmaking/
│   ├── Kombats.Matchmaking.Bootstrap/
│   │   └── Kombats.Matchmaking.Bootstrap.csproj
│   ├── Kombats.Matchmaking.Api/
│   │   └── Kombats.Matchmaking.Api.csproj
│   ├── Kombats.Matchmaking.Application/
│   │   └── Kombats.Matchmaking.Application.csproj
│   ├── Kombats.Matchmaking.Domain/
│   │   └── Kombats.Matchmaking.Domain.csproj
│   ├── Kombats.Matchmaking.Infrastructure/
│   │   └── Kombats.Matchmaking.Infrastructure.csproj
│   └── Kombats.Matchmaking.Contracts/
│       └── Kombats.Matchmaking.Contracts.csproj
│
├── Kombats.Battle/
│   ├── Kombats.Battle.Bootstrap/
│   │   └── Kombats.Battle.Bootstrap.csproj
│   ├── Kombats.Battle.Api/
│   │   └── Kombats.Battle.Api.csproj
│   ├── Kombats.Battle.Application/
│   │   └── Kombats.Battle.Application.csproj
│   ├── Kombats.Battle.Domain/
│   │   └── Kombats.Battle.Domain.csproj
│   ├── Kombats.Battle.Infrastructure/
│   │   └── Kombats.Battle.Infrastructure.csproj
│   ├── Kombats.Battle.Contracts/
│   │   └── Kombats.Battle.Contracts.csproj
│   └── Kombats.Battle.Realtime.Contracts/
│       └── Kombats.Battle.Realtime.Contracts.csproj
```

### How New Projects Are Introduced

**Bootstrap projects** are new. They do not exist in the current repo. Each service gets a `Bootstrap` project as part of its replacement work. The Bootstrap project becomes the new composition root, replacing the legacy Api project's role as executable.

**Api projects** already exist but serve a different role (composition root + Controllers). During replacement:
- The existing Api project is either replaced in-place (contents rewritten to Minimal API transport-only) or the new transport code is written alongside and the old code removed after cutover.
- The Api project's SDK changes from `Microsoft.NET.Sdk.Web` to `Microsoft.NET.Sdk` once Bootstrap takes over as the composition root.

**Application, Domain, Infrastructure projects** already exist for each service. During replacement:
- Contents are rewritten to follow the target architecture.
- Legacy code within these projects (wrong dependency direction, domain logic in infrastructure, etc.) is replaced, not patched.

**Contract projects** already exist. They may need cleanup (adding Version fields, removing non-contract types) but are otherwise retained and evolved.

**Kombats.Abstractions** does not exist yet. Create it during the foundation phase under `src/Kombats.Common/`.

**Kombats.Messaging** currently exists as `Kombats.Infrastructure.Messaging`. It is renamed to `Kombats.Messaging` during the foundation phase (Phase 0). The project contents must be aligned with the target architecture.

---

## Legacy Projects and Their Disposition

| Legacy Project/Artifact | Target Disposition |
|---|---|
| `Kombats.Shared` (inside Players) | Do not reference from new code. Remove when Players replacement is complete. Useful shared patterns are re-implemented in `Kombats.Common` projects if they meet extraction criteria. |
| `Kombats.Shared` (root-level) | Same as above. |
| Per-service `.sln` files | Replaced by unified `Kombats.sln`. Remove after all projects are in the unified solution. |
| `Controllers/` directories | Removed when each service's Api layer is replaced with Minimal APIs. |
| `DependencyInjection.cs` in Infrastructure | Removed when each service gets its Bootstrap project. Composition logic moves to Bootstrap. |
| `Workers/` in Api projects | Workers move to Bootstrap or Infrastructure depending on their nature. |
| Legacy `Middleware/` | Evaluated per-service. Auth middleware replaced by standard Keycloak JWT config. Other middleware evaluated individually. |

---

## Project Roles

### Bootstrap (one per service)

The composition root. This is the executable.

**SDK:** `Microsoft.NET.Sdk.Web`

**Contains:**
- `Program.cs` — builds the host, registers all services, configures the middleware pipeline
- `appsettings.json`, `appsettings.Development.json`
- `Dockerfile`
- Hosted service registrations (background workers)

**References:** Api, Application, Infrastructure, Domain, own Contracts, cross-service Contracts as needed, shared Common projects.

**Responsible for:**
- All DI registration (MassTransit, EF, Redis, auth, health checks, SignalR, handler registration)
- Middleware pipeline ordering
- Endpoint mapping (calls into Api to register routes)
- Hosted worker registration

**Must not contain:** business logic, domain code, infrastructure implementations, transport logic.

**Migration note:** This project does not exist in the current repo. It is introduced as part of each service's replacement stream. Once Bootstrap exists, the legacy Api project loses its `Microsoft.NET.Sdk.Web` SDK and becomes transport-only.

### Api (one per service)

Transport layer. Plain class library.

**SDK:** `Microsoft.NET.Sdk` (target — currently `Microsoft.NET.Sdk.Web` in legacy)

**Contains:**
- Endpoint definitions (Minimal API route groups)
- SignalR hubs (Battle only)
- Request/response DTOs specific to the transport layer
- Route-to-handler dispatch (receives requests, calls Application layer)

**References:** Application (to dispatch commands/queries).

**Must not contain:** DI registration, `Program.cs`, middleware configuration, `WebApplication` usage, infrastructure code, domain logic.

### Application (one per service)

Use-case orchestration. Defines what the service can do.

**SDK:** `Microsoft.NET.Sdk`

**Contains:**
- Command and query handlers (CQRS)
- Port interfaces (abstractions for infrastructure dependencies)
- Application-level validation
- Orchestration logic

**References:** Domain.

**Must not contain:** infrastructure implementations, transport concerns, DI registration.

### Domain (one per service)

Domain model. Pure business logic.

**SDK:** `Microsoft.NET.Sdk`

**Contains:**
- Entities, aggregates, value objects
- Domain services
- Domain events
- Invariants and business rules

**References:** nothing (or Abstractions for shared primitives only).

**Must not contain:** infrastructure code, transport code, application orchestration, NuGet dependencies beyond primitives.

### Infrastructure (one per service)

Implementations of Application-layer ports.

**SDK:** `Microsoft.NET.Sdk`

**Contains:**
- DbContext, entity configurations, repositories
- Messaging consumers
- Redis operations
- SignalR notifiers (Battle)
- External integration clients
- EF migrations

**References:** Application, Domain, own Contracts, cross-service Contracts as needed.

**Must not contain:** `DependencyInjection.cs`, `ServiceCollectionExtensions`, composition logic, transport endpoints, business orchestration.

### Contracts (one per service, plus Battle.Realtime.Contracts)

Cross-service integration surface.

**SDK:** `Microsoft.NET.Sdk`

**Contains:**
- Integration event records
- Command records (for async messaging)
- Enums shared across service boundaries
- Marker interfaces (if any)

**References:** nothing. Zero NuGet dependencies.

**Must not contain:** business logic, implementation types, service-internal DTOs.

---

## Shared Projects

All shared code lives under `src/Kombats.Common/`.

| Project | Purpose | Current State |
|---|---|---|
| `Kombats.Messaging` | MassTransit configuration, outbox/inbox setup, topology conventions, retry policies, consumer registration helpers. | Currently exists as `Kombats.Infrastructure.Messaging`. Renamed to `Kombats.Messaging` during Phase 0. |
| `Kombats.Abstractions` | Cross-cutting primitives shared across services: Result types, base interfaces, error types, common value objects. | Does not exist yet. Create during foundation phase. |

No other shared project unless a concrete need emerges across multiple services.

`Kombats.Shared` (the legacy shared project) is not part of the target structure. It must not be referenced from new code and must be removed when no legacy code depends on it.

---

## Reference Graph

```
Bootstrap → Api, Application, Infrastructure, Domain, Contracts, Common
Api → Application
Application → Domain, (Abstractions)
Infrastructure → Application, Domain, Contracts, (Messaging)
Domain → (Abstractions, nothing else)
Contracts → nothing
```

Cross-service references are Contracts-only:
- `Matchmaking.Infrastructure` may reference `Players.Contracts`, `Battle.Contracts`
- `Players.Infrastructure` may reference `Battle.Contracts`
- No service references another service's internal projects (Api, Application, Domain, Infrastructure)

---

## Project SDK Rules

| Project | SDK |
|---|---|
| `*.Bootstrap` | `Microsoft.NET.Sdk.Web` |
| All other projects | `Microsoft.NET.Sdk` |

`Api` is explicitly NOT `Microsoft.NET.Sdk.Web` in the target state. This is intentional — it prevents Api from being a composition root. During migration, the legacy Api project will still be `Microsoft.NET.Sdk.Web` until its Bootstrap project is introduced and the cutover is complete.

---

## tests/ Layout

```
tests/
├── Kombats.Players/
│   ├── Kombats.Players.Domain.Tests/
│   ├── Kombats.Players.Application.Tests/
│   └── Kombats.Players.Infrastructure.Tests/
│
├── Kombats.Matchmaking/
│   ├── Kombats.Matchmaking.Domain.Tests/
│   ├── Kombats.Matchmaking.Application.Tests/
│   └── Kombats.Matchmaking.Infrastructure.Tests/
│
├── Kombats.Battle/
│   ├── Kombats.Battle.Domain.Tests/
│   ├── Kombats.Battle.Application.Tests/
│   └── Kombats.Battle.Infrastructure.Tests/
│
└── Kombats.Common/
    └── Kombats.Messaging.Tests/
```

Test projects follow `Kombats.<Service>.<Layer>.Tests` naming.

Bootstrap projects are not unit-tested directly — they are covered by integration tests that use `WebApplicationFactory<Program>` targeting the Bootstrap project.

Api projects can be unit-tested as plain class libraries (no host required for route mapping tests).

If the `tests/` directory does not yet exist, create it during the foundation phase.

---

## EF Migrations

Each service owns its migrations inside Infrastructure:
- `Kombats.Players.Infrastructure/`
- `Kombats.Matchmaking.Infrastructure/`
- `Kombats.Battle.Infrastructure/`

CLI usage: `dotnet ef migrations add <Name> --startup-project <Bootstrap> --project <Infrastructure>`

The startup project for EF CLI is the Bootstrap project (the executable), not Api. During migration, before Bootstrap exists, the legacy Api project may still serve as the EF CLI startup project.

Existing migrations in the legacy codebase are retained as history. New migrations are added as part of the replacement work. If schema changes are incompatible with the legacy implementation, migration sequencing must be planned as part of the cutover.

---

## Configuration

Each Bootstrap project contains:
- `appsettings.json` — default/production configuration
- `appsettings.Development.json` — local dev overrides

Expected configuration sections per service:
- `ConnectionStrings:Postgres`
- `ConnectionStrings:Redis` (Matchmaking, Battle)
- `RabbitMq` — host, credentials
- `Keycloak` — authority, audience
- Service-specific sections as needed

---

## Namespace Convention

Root prefix: `Kombats`. Not `Combats`. Not any other variant.

Examples:
- `Kombats.Players.Domain`
- `Kombats.Battle.Bootstrap`
- `Kombats.Matchmaking.Api.Endpoints`
- `Kombats.Messaging`
- `Kombats.Abstractions`

---

## What Must Not Be Copied Forward

The following legacy structural patterns must not appear in new code:

- Api project as composition root (use Bootstrap)
- `DependencyInjection.cs` or `ServiceCollectionExtensions` in Infrastructure
- Controller-based endpoints
- `Kombats.Shared` references
- Per-service solution files as primary build artifacts
- Workers hosted inside Api projects (move to Bootstrap)
- Mixed transport and composition concerns in a single project

---

## What This Document Does Not Prescribe

Internal folder structure within projects (e.g., `Commands/`, `Queries/`, `Persistence/Configurations/`) is **not locked down** by this document. Those are implementation-level decisions that should emerge during development based on actual needs.

This document prescribes:
- **Target projects** and their roles
- **SDK assignments**
- **Reference rules** (what may reference what)
- **Responsibility boundaries** (what lives where)
- **Composition ownership** (Bootstrap is the single composition root)
- **Legacy disposition** (what stays, what goes, what must not be extended)

It does not prescribe:
- Internal folder layout within any project
- Specific file names beyond `Program.cs` and config files in Bootstrap
- Number of classes per folder
- Whether to use folders or flat structure within a project

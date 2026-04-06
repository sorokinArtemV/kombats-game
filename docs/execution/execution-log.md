# Execution Log

## Batch 0A — Foundation Configuration

**Date:** 2026-04-06
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### F-01: Root Build Configuration Files
**Status:** Done

Created:
- `global.json` — SDK 10.0.100, `latestPatch` rollForward
- `Directory.Build.props` — `net10.0`, `Nullable enable`, `ImplicitUsings enable`, `LangVersion latest`
- `Directory.Packages.props` — all currently-referenced packages + test framework packages, `ManagePackageVersionsCentrally` enabled

Updated (inline Version attributes removed):
- `src/Kombats.Battle/Kombats.Battle.Api/Kombats.Battle.Api.csproj`
- `src/Kombats.Battle/Kombats.Battle.Application/Kombats.Battle.Application.csproj`
- `src/Kombats.Battle/Kombats.Battle.Infrastructure/Kombats.Battle.Infrastructure.csproj`
- `src/Kombats.Common/Kombats.Infrastructure.Messaging/Kombats.Infrastructure.Messaging.csproj`
- `src/Kombats.Matchmaking/Kombats.Matchmaking.Api/Kombats.Matchmaking.Api.csproj`
- `src/Kombats.Matchmaking/Kombats.Matchmaking.Application/Kombats.Matchmaking.Application.csproj`
- `src/Kombats.Matchmaking/Kombats.Matchmaking.Infrastructure/Kombats.Matchmaking.Infrastructure.csproj`
- `src/Kombats.Players/Kombats.Players.Api/Kombats.Players.Api.csproj`
- `src/Kombats.Players/Kombats.Players.Application/Kombats.Players.Application.csproj`
- `src/Kombats.Players/Kombats.Players.Infrastructure/Kombats.Players.Infrastructure.csproj`
- `src/Kombats.Players/Kombats.Shared/Kombats.Shared.csproj`

Not modified (no PackageReference entries):
- `Kombats.Battle.Contracts.csproj`
- `Kombats.Battle.Domain.csproj`
- `Kombats.Battle.Realtime.Contracts.csproj`
- `Kombats.Matchmaking.Contracts.csproj`
- `Kombats.Matchmaking.Domain.csproj`
- `Kombats.Players.Contracts.csproj`
- `Kombats.Players.Domain.csproj`

Version normalizations applied via central management:
- `Serilog.AspNetCore` 8.0.3 → 10.0.0 (Matchmaking.Api)
- `Microsoft.Extensions.Logging.Abstractions` 9.0.0 → 10.0.3 (Matchmaking.Application), 10.0.0 → 10.0.3 (Battle.Application)
- `Microsoft.AspNetCore.OpenApi` 10.0.1 → 10.0.3 (Matchmaking.Api)
- `MassTransit.RabbitMQ` 8.5.8 → 8.3.0 (Kombats.Shared)

Validation: `dotnet restore` + `dotnet build Kombats.slnx` ��� 0 warnings, 0 errors.

#### F-03: Docker Compose Alignment
**Status:** Done

Deleted:
- `docker-compose.yaml`

Created:
- `docker-compose.yml` — PostgreSQL 16-alpine, RabbitMQ 3.13-management, Redis 7-alpine, Keycloak 26.0, keycloak-db. Removed `version: "3.9"` (obsolete). Removed commented-out service definitions. Added healthcheck to RabbitMQ.
- `docker-compose.override.yml` — empty dev override placeholder

Validation: `docker compose config --quiet` — exit code 0 for both files.

#### F-04: Editorconfig Alignment
**Status:** Done

Created:
- `.editorconfig` — root editorconfig with C# naming, formatting, and style rules. All severities set to `suggestion` to avoid build warnings in existing code.

Validation: `dotnet build Kombats.slnx` — 0 new warnings introduced.

### Validation Summary

| Check | Result |
|---|---|
| `dotnet restore Kombats.slnx` | Pass |
| `dotnet build Kombats.slnx` | Pass (0 warnings, 0 errors) |
| No inline `Version=` in any `.csproj` | Pass (grep confirmed) |
| `docker compose config --quiet` | Pass |
| No changes outside Batch 0A scope | Pass |

---

## Batch 0B — Unified Solution & Abstractions

**Date:** 2026-04-06
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### F-02: Unified Solution File
**Status:** Done

Created:
- `Kombats.sln` — classic `.sln` format (not `.slnx`) with all 19 projects organized into solution folders:
  - `src/Battle` — 6 projects (Api, Application, Contracts, Domain, Infrastructure, Realtime.Contracts)
  - `src/Matchmaking` — 5 projects (Api, Application, Contracts, Domain, Infrastructure)
  - `src/Players` — 6 projects (Api, Application, Contracts, Domain, Infrastructure, Shared)
  - `src/Common` — 2 projects (Infrastructure.Messaging, Abstractions)

Notes:
- `Matchmaking.Contracts` was missing from `Kombats.slnx` — now included in `Kombats.sln`.
- `Kombats.slnx` restored from git after accidental overwrite by `dotnet new sln --force`. Both coexist until F-10.
- Used `--format sln` flag because .NET 10 SDK defaults to `.slnx` format.

Validation: `dotnet build Kombats.sln` — 0 warnings, 0 errors. `dotnet test Kombats.sln` — runs (zero tests).

#### F-08: Create Kombats.Abstractions Project
**Status:** Done

Created:
- `src/Kombats.Common/Kombats.Abstractions/Kombats.Abstractions.csproj` — `Microsoft.NET.Sdk`, zero NuGet dependencies
- `ErrorType.cs` — enum: Failure, Validation, Problem, NotFound, Conflict
- `Error.cs` — record with factory methods per ErrorType
- `ValidationError.cs` — sealed record extending Error with aggregated errors
- `Result.cs` — `Result` and `Result<TValue>` with success/failure pattern
- `ICommand.cs` — `ICommand` (void) and `ICommand<TResponse>` marker interfaces
- `IQuery.cs` — `IQuery<TResponse>` marker interface
- `ICommandHandler.cs` — `ICommandHandler<TCommand>` and `ICommandHandler<TCommand, TResponse>`
- `IQueryHandler.cs` — `IQueryHandler<TQuery, TResponse>`

All types use `Kombats.Abstractions` namespace. Patterns match existing `Kombats.Shared.Types` but under the target namespace. `IQueryHandler.HandleAsync` method name aligned with `ICommandHandler` (was `Handle` in legacy).

Validation: `dotnet build Kombats.sln` — 0 warnings, 0 errors. Project included in solution under `src/Common` folder.

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 warnings, 0 errors) |
| `dotnet build Kombats.slnx` | Pass (legacy still works) |
| `dotnet test Kombats.sln` | Pass (zero tests) |
| All 19 projects in `Kombats.sln` | Pass |
| Solution folders match target structure | Pass |
| `Kombats.Abstractions` has zero NuGet deps | Pass |
| No changes outside Batch 0B scope | Pass |

---

## Batch 0C — Test Infrastructure, Messaging Rename, Contracts, Auth

**Date:** 2026-04-06
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### F-05: Test Infrastructure Baseline
**Status:** Done

Created:
- `tests/Kombats.Players/Kombats.Players.Domain.Tests/` — xUnit, FluentAssertions, NSubstitute; references Players.Domain
- `tests/Kombats.Players/Kombats.Players.Application.Tests/` — xUnit, FluentAssertions, NSubstitute; references Players.Application, Players.Domain
- `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/` — xUnit, FluentAssertions, NSubstitute, Testcontainers.PostgreSql, Testcontainers.RabbitMq; references Players.Infrastructure, Application, Domain
- `tests/Kombats.Players/Kombats.Players.Api.Tests/` — xUnit, FluentAssertions, NSubstitute, FrameworkReference Microsoft.AspNetCore.App; references Players.Api
- `tests/Kombats.Common/Kombats.Messaging.Tests/` — xUnit, FluentAssertions, NSubstitute, MassTransit, Testcontainers.PostgreSql, Testcontainers.RabbitMq; references Kombats.Messaging
- Empty placeholder directories: `tests/Kombats.Matchmaking/`, `tests/Kombats.Battle/`

All 5 test projects added to `Kombats.sln` under `tests/Players` and `tests/Common` solution folders.

Note: `MassTransit.Testing` package (declared in `Directory.Packages.props`) does not exist as a separate NuGet package in MassTransit 8.3.0. Testing utilities are included in the main `MassTransit` package. Test project references `MassTransit` directly. See EI-006.

Validation: `dotnet build Kombats.sln` — 0 errors. `dotnet test Kombats.sln` — runs (zero tests, as expected).

#### F-06: Rename Kombats.Infrastructure.Messaging → Kombats.Messaging
**Status:** Done

Renamed (via git mv):
- `src/Kombats.Common/Kombats.Infrastructure.Messaging/` → `src/Kombats.Common/Kombats.Messaging/`
- `Kombats.Infrastructure.Messaging.csproj` → `Kombats.Messaging.csproj`

Updated in `Kombats.Messaging.csproj`:
- RootNamespace: `Combats.Infrastructure.Messaging` → `Kombats.Messaging`
- Removed `DockerDefaultTargetOS` (not needed for a class library)

Updated namespaces in all 7 source files (from `Combats.Infrastructure.Messaging.*` → `Kombats.Messaging.*`):
- `DependencyInjection/MessagingBuilder.cs`
- `DependencyInjection/MessagingServiceCollectionExtensions.cs`
- `Filters/ConsumeLoggingFilter.cs`
- `Naming/CombatsEndpointNameFormatter.cs`
- `Naming/EntityNameConvention.cs`
- `Naming/EntityNameFormatter.cs`
- `Options/MessagingOptions.cs`

Updated ProjectReference in:
- `Kombats.Battle.Api.csproj`
- `Kombats.Matchmaking.Api.csproj`

Updated using statements in:
- `Kombats.Battle.Api/Configuration/InfrastructureRegistration.cs`
- `Kombats.Matchmaking.Api/Program.cs`

Updated solution files:
- `Kombats.sln` — project name and path updated
- `Kombats.slnx` — project path updated

Validation: `dotnet build Kombats.sln` — 0 warnings, 0 errors. No `Combats.Infrastructure.Messaging` references remain in any `.cs` file.

#### F-09: Contract Project Alignment
**Status:** Done

Battle.Contracts — added missing fields:
- `BattleCompleted`: Added `TurnCount`, `DurationMs`, `RulesetVersion` fields (already had `Version`, nullable `WinnerIdentityId`/`LoserIdentityId`)
- `BattleCreated`: Added `Version` field (default 1)
- `CreateBattle`, `BattleParticipantSnapshot`, `BattleEndReason`: Verified correct, no changes needed

Players.Contracts:
- `PlayerCombatProfileChanged`: Added `Version` field (default 1). Existing `Revision` field retained (domain-level revision vs contract-level version).

Matchmaking.Contracts — created:
- `MatchCreated.cs` — MessageId, MatchId, PlayerAIdentityId, PlayerBIdentityId, OccurredAt, Version
- `MatchCompleted.cs` — MessageId, MatchId, PlayerAIdentityId, PlayerBIdentityId, WinnerIdentityId?, LoserIdentityId?, OccurredAt, Version

Battle.Realtime.Contracts — namespace correction:
- `Kombats.Battle.Realtime.Contracts.csproj`: RootNamespace changed from `Combats.Battle.Realtime.Contracts` → `Kombats.Battle.Realtime.Contracts`
- All 14 `.cs` files: namespace changed from `Combats.Battle.Realtime.Contracts` → `Kombats.Battle.Realtime.Contracts`
- Updated 3 consuming files in `Kombats.Battle.Infrastructure/Realtime/SignalR/` to use new namespace

All contract projects verified: zero NuGet dependencies. No non-contract types present.

Validation: `dotnet build Kombats.sln` — 0 errors.

#### F-11: Shared Auth Configuration Helper
**Status:** Done

Created:
- `src/Kombats.Common/Kombats.Abstractions/Auth/KombatsAuthExtensions.cs` — `AddKombatsAuth(IServiceCollection, IConfiguration)` extension method. Configures JWT Bearer authentication with `Keycloak:Authority` and `Keycloak:Audience` from configuration. No dev auth bypass.
- `src/Kombats.Common/Kombats.Abstractions/Auth/IdentityIdExtensions.cs` — `GetIdentityId(ClaimsPrincipal)` extension method. Extracts identity ID from `sub` or `NameIdentifier` claim. Returns `Guid?`.

Updated:
- `Kombats.Abstractions.csproj` — added `FrameworkReference Microsoft.AspNetCore.App` and `PackageReference Microsoft.AspNetCore.Authentication.JwtBearer`

Validation: `dotnet build Kombats.sln` — 0 errors.

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 errors, MSB3277 warnings only — legacy assembly version conflicts) |
| `dotnet build Kombats.slnx` | Pass (0 errors, 0 warnings) |
| `dotnet test Kombats.sln` | Pass (zero tests, expected) |
| All 24 projects in `Kombats.sln` | Pass (19 source + 5 test) |
| No `Combats.*` namespaces in any `.cs` file under `src/` | Pass |
| No `Combats.Infrastructure.Messaging` references in code | Pass |
| All contract projects have zero NuGet deps | Pass |
| All integration events carry `Version` field | Pass |
| No changes outside Batch 0C scope | Pass |

---

## Batch 0D — Align Kombats.Messaging with Target Configuration

**Date:** 2026-04-06
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### F-07: Align Kombats.Messaging with Target Configuration
**Status:** Done

**Source changes:**

`MessagingServiceCollectionExtensions.cs` — simplified and aligned:
- Added `UseBusOutbox()` inside `AddEntityFrameworkOutbox<TDbContext>` configuration — critical fix. Without this, messages published from handler context (non-consumer) bypass the outbox. Now all `IPublishEndpoint` / `ISendEndpointProvider` usage goes through the outbox atomically.
- Removed dead non-generic `AddMessaging()` overload (no callers — Battle and Matchmaking both use the generic version)
- Removed `AddMessagingInternal()` helper (only used by the dead non-generic overload)
- Consolidated into a single clean `AddMessaging<TDbContext>()` entry point

`MessagingBuilder.cs` — simplified:
- Removed unused `WithServiceDbContext<T>()`, `WithOutbox<T>()`, `WithInbox<T>()`, `GetServiceDbContextType()` methods (no callers)
- Removed `IConfiguration` from constructor (moved to `BuildEntityNameMap` parameter)
- Kept `Map<T>()` and `MapEntityName<T>()` for entity name mapping

`MessagingOptions.cs`:
- Added `Port` property to `RabbitMqOptions` (default: 5672) to support non-standard port configuration (needed for Testcontainers and non-default deployments)

`Kombats.Messaging.csproj` — unchanged.

`Directory.Packages.props` — added:
- `Microsoft.Extensions.Configuration` 10.0.3
- `Microsoft.Extensions.Hosting` 10.0.3
(Both needed by Kombats.Messaging.Tests for integration test host setup)

**Verification of target capabilities:**

| Capability | Status |
|---|---|
| MassTransit 8.3.0 RabbitMQ transport | Verified — configured via `UsingRabbitMq` |
| EF Core transactional outbox | Verified — `AddEntityFrameworkOutbox<TDbContext>` with `UsePostgres()` + `UseBusOutbox()` |
| Inbox consumer idempotency | Verified — `UseEntityFrameworkOutbox<TDbContext>` on endpoint configurator |
| Entity name formatter (`combats.{event-name}` kebab-case) | Verified — `EntityNameConvention` with default prefix "combats" |
| Consumer registration (explicit + assembly scanning) | Verified — `configureConsumers` callback supports both `AddConsumer<T>()` and `AddConsumers(assembly)` |
| Retry: 5 attempts, 200ms–5000ms exponential | Verified — defaults match target |
| Redelivery: 30s, 120s, 600s | Verified — defaults match target |
| Consume logging filter | Verified — `ConsumeLoggingFilter<T>` applied via `UseConsumeFilter` |
| RabbitMQ health check | Verified — MassTransit's built-in health check registered automatically by `AddMassTransit()` |
| `AddMessaging<TDbContext>()` entry point | Verified — all three services can use it |

**Tests added:**

| Test file | Tests | Coverage |
|---|---|---|
| `EntityNameFormatterTests.cs` | 9 | ToKebabCase (PascalCase, empty, idempotent), FormatQueueName, FormatEntityName |
| `EntityNameConventionTests.cs` | 6 | Default convention with combats prefix, mapped names, no-prefix, no-kebab, battle event names |
| `MessagingOptionsDefaultsTests.cs` | 5 | Retry defaults, redelivery defaults, outbox enabled, topology prefix+kebab, section name |
| `OutboxIntegrationTests.cs` | 1 | Full outbox round-trip: publish via outbox → SaveChanges → outbox delivery → consumer receives |

Total: 25 tests (24 unit + 1 integration).

`Kombats.Messaging.Tests.csproj` — added package references:
- `MassTransit.EntityFrameworkCore`, `Microsoft.EntityFrameworkCore`, `Npgsql.EntityFrameworkCore.PostgreSQL` (for test DbContext with outbox entities)
- `Microsoft.Extensions.Configuration`, `Microsoft.Extensions.Configuration.Binder`, `Microsoft.Extensions.Hosting` (for integration test host setup)

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 errors, MSB3277 warnings only — EI-007) |
| `dotnet build Kombats.slnx` | Pass (0 errors, 0 warnings) |
| `dotnet test` unit tests | Pass (24 tests) |
| `dotnet test` integration test | Pass (1 test — outbox round-trip with Testcontainers PostgreSQL + RabbitMQ) |
| All 24 projects in `Kombats.sln` | Pass (19 source + 5 test) |
| Existing service consumers unchanged | Pass (Battle and Matchmaking `AddMessaging<T>` calls unaffected) |
| No changes outside Batch 0D scope | Pass |

---

## Batch 0E — Legacy Solution File Removal

**Date:** 2026-04-06
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### F-10: Legacy Solution File Removal
**Status:** Done

Deleted:
- `src/Kombats.Battle/Kombats.Battle.sln` — per-service legacy solution
- `src/Kombats.Matchmaking/Kombats.Matchmaking.sln` — per-service legacy solution
- `Kombats.slnx` — legacy XML solution format (coexisted since F-02)

Retained:
- `Kombats.sln` — unified solution file (sole solution file going forward)

Verification:
- No `.sln` files remain except `Kombats.sln`
- No `.slnx` files remain
- `dotnet build Kombats.sln` — 0 errors (MSB3277 warnings only — EI-007, pre-existing)

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 errors) |
| No per-service `.sln` files remain | Pass |
| No `.slnx` files remain | Pass |
| `Kombats.sln` is the sole solution file | Pass |
| No changes outside Batch 0E scope | Pass |

---

## Batch 0F — Verify Existing Services Build and Run

**Date:** 2026-04-06
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### F-12: Verify Existing Services Build and Run
**Status:** Done

**Build verification:**
- `dotnet build Kombats.sln` — 0 errors, MSB3277 warnings only (EI-007, pre-existing)
- All 24 projects build successfully (19 source + 5 test)

**Test verification:**
- `dotnet test Kombats.sln` — 25 tests passed (all in Kombats.Messaging.Tests)
- Placeholder test projects (Players Domain/Application/Infrastructure/Api) have no tests yet — expected, these are created by F-05 for use during Phase 2

**Docker Compose verification:**
- `docker compose config --quiet` — exit code 0
- `docker compose up` — Postgres, RabbitMQ, Redis all started and healthy
- Keycloak/Keycloak-DB: port 5433 conflict on local machine (pre-existing, environment-specific, not a foundation issue)

**Startup verification:**

| Service | Started | Listening | MassTransit | Consumers | Workers | Notes |
|---|---|---|---|---|---|---|
| Matchmaking | Yes | http://localhost:5118 | Bus started | 3 (PlayerCombatProfileChanged, BattleCreated, BattleCompleted) | MatchmakingWorker, MatchTimeoutWorker, OutboxDispatcherWorker | EF migration history query failed (no prior migrations in schema), but service started |
| Battle | Yes | http://localhost:5000 | Bus started | 2 (CreateBattle, BattleCompletedProjection) | TurnDeadlineWorker | EF migration history query failed (no prior migrations in schema), but service started |
| Players | Yes (after fix) | Yes | Bus started | 1 (BattleCompleted) | None | See EI-011 |

**Players startup issue (EI-011):** Players crashed on first attempt due to `Database.MigrateAsync()` — the `players.__ef_migrations_history` table existed but was empty, while `players.characters` already existed from a prior run. EF tried to re-create the table and hit `42P07: relation "characters" already exists`. After manually inserting the baseline migration record, Players started successfully. This is a **pre-existing database state issue** (not caused by foundation changes) and is also an instance of the forbidden `Database.MigrateAsync()` on startup pattern (AD-13). Will be eliminated when Players is replaced with target Bootstrap architecture.

**Foundation changes verified as safe:**
- F-01 (central package management): all three services build and start with centrally-managed versions
- F-02 (unified solution): `Kombats.sln` correctly includes all projects
- F-03 (docker-compose): infrastructure containers start and services connect
- F-06 (messaging rename): Matchmaking and Battle use renamed `Kombats.Messaging` — both start and connect to RabbitMQ
- F-07 (messaging alignment): MassTransit bus starts, outbox configured, consumers registered on all services using `Kombats.Messaging`
- F-08 (abstractions): no startup impact (not yet consumed by legacy services)
- F-09 (contracts): no startup impact (additive fields only)
- F-10 (legacy solution removal): no impact, `Kombats.sln` is sole solution
- F-11 (auth helper): no startup impact (not yet consumed by legacy services)
- Players uses its own `Kombats.Shared.Messaging` (legacy, not yet migrated) — still works correctly

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 errors) |
| `dotnet test Kombats.sln` | Pass (25 tests) |
| `docker compose config` | Pass |
| Infrastructure containers healthy | Pass (Postgres, RabbitMQ, Redis) |
| Matchmaking startup | Pass |
| Battle startup | Pass |
| Players startup | Pass (after migration history fix — EI-011, pre-existing) |
| No foundation-caused regressions | Pass |
| Foundation phase complete | **Yes — Phase 2 (Players) may begin** |

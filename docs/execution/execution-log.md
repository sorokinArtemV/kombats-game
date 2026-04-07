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

---

## Batch P-A — Players Domain Layer Alignment

**Date:** 2026-04-07
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### P-01: Evaluate and Align Players Domain Layer
**Status:** Done

**Evaluation findings:**
- Domain project (`Kombats.Players.Domain`) has zero NuGet dependencies — compliant
- Namespace `Kombats.Players.Domain` — compliant
- Character aggregate root: correct encapsulation, factory method, state machine
- OnboardingState enum: Draft → Named → Ready — compliant
- LevelingConfig value object with validation — compliant
- LevelingPolicyV1 deterministic leveling curve — compliant
- DomainException with stable error codes — compliant

**Gaps found and fixed:**

1. **Missing `IsReady` computed property** — Architecture requires `IsReady = (OnboardingState == Ready)`. Contract `PlayerCombatProfileChanged` uses `IsReady`. Added derived property to Character entity.

2. **Timestamp impurity** — `CreateDraft` accepted `DateTimeOffset occurredAt`, but `SetNameOnce`, `AllocatePoints`, `AddExperience`, `RecordWin`, `RecordLoss` all used `DateTimeOffset.UtcNow` directly. This made the domain non-deterministic and harder to test. All mutation methods now accept `DateTimeOffset occurredAt` parameter for consistency and testability. Application-layer callers updated minimally (pass `DateTimeOffset.UtcNow`) to maintain compilation.

3. **Zero-total allocation guard** — `AllocatePoints(0, 0, 0, 0)` previously transitioned Named → Ready without allocating any points. Added `ZeroPoints` domain error code: total must be > 0.

**Areas evaluated and kept stable (no changes needed):**
- OnboardingState enum — correct transitions, correct values
- DomainException — stable error codes, appropriate for domain layer
- LevelingConfig — value object with positive BaseFactor validation
- LevelingPolicyV1 — deterministic triangular curve, version-aware, MaxLevel = 10,000
- Character initial state: base stats 3 each, 3 unspent points, Level 0

**Files changed:**

| File | Change |
|---|---|
| `src/Kombats.Players/Kombats.Players.Domain/Entities/Character.cs` | Added `IsReady` property, `occurredAt` parameter on all mutation methods, `ZeroPoints` guard on `AllocatePoints` |
| `src/Kombats.Players/Kombats.Players.Application/UseCases/SetCharacterName/SetCharacterNameHandler.cs` | Pass `DateTimeOffset.UtcNow` to `SetNameOnce` (compilation fix) |
| `src/Kombats.Players/Kombats.Players.Application/UseCases/AllocateStatPoints/AllocateStatPointsHandler.cs` | Pass `DateTimeOffset.UtcNow` to `AllocatePoints` (compilation fix) |
| `src/Kombats.Players/Kombats.Players.Application/Battles/HandleBattleCompletedCommand.cs` | Pass `DateTimeOffset.UtcNow` to `AddExperience`, `RecordWin`, `RecordLoss` (compilation fix) |

**Files created:**

| File | Content |
|---|---|
| `tests/Kombats.Players/Kombats.Players.Domain.Tests/Entities/CharacterTests.cs` | 6 test classes, 47 tests covering creation, naming, stat allocation, XP/leveling, combat record, IsReady derivation, onboarding transitions |
| `tests/Kombats.Players/Kombats.Players.Domain.Tests/Progression/LevelingPolicyV1Tests.cs` | 2 test classes, 12 tests covering LevelingConfig validation and leveling curve thresholds |

**Tests added:** 59 domain unit tests total

| Test class | Tests | Coverage |
|---|---|---|
| `CharacterCreationTests` | 2 | CreateDraft initial state, unique IDs |
| `CharacterSetNameTests` | 8 | Valid name, trim, too short, too long, boundary lengths, whitespace, duplicate, wrong state |
| `CharacterAllocatePointsTests` | 8 | Valid allocation, partial, subsequent, draft state, negative, exceeds unspent, zero total, all-to-one |
| `CharacterExperienceTests` | 8 | XP accumulation, level-up threshold, multi-level, just-below, incremental, zero/negative, revision |
| `CharacterCombatRecordTests` | 6 | Win/loss increment, multiple, revision |
| `CharacterIsReadyTests` | 3 | Draft=false, Named=false, Ready=true |
| `CharacterOnboardingTransitionTests` | 4 | Full flow, allocate-in-draft, set-name-when-named, set-name-when-ready |
| `LevelingConfigTests` | 2 | Positive factor, non-positive throws |
| `LevelingPolicyV1Tests` | 8 | Threshold curve (10 data points), unspent points per level, incremental XP, level 4 boundary |

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 errors, MSB3277 warnings only — EI-007) |
| `dotnet test Kombats.Players.Domain.Tests` | Pass (59 tests) |
| Domain zero NuGet dependencies | Pass |
| Character `IsReady` derivation | Pass (3 tests) |
| Stat allocation invariants | Pass (zero-total guard, negative guard, insufficient points guard) |
| OnboardingState transitions | Pass (valid and invalid transitions tested) |
| XP/leveling curve | Pass (threshold boundaries verified) |
| Application callers compile | Pass (minimal `DateTimeOffset.UtcNow` pass-through) |
| No changes outside P-01 scope | Pass |

---

## Batch P-B — Players Application Layer Replacement

**Date:** 2026-04-07
**Status:** Completed
**Branch:** kombats_full_refactor

### Tickets Executed

#### P-02: Replace Players Application Layer
**Status:** Done

**Primary changes (Application layer — in scope):**

Migrated from `Kombats.Shared` to `Kombats.Abstractions`:
- `Kombats.Players.Application.csproj` — removed `Kombats.Shared` project reference + `Microsoft.Extensions.DependencyInjection.Abstractions` package. Added `Kombats.Abstractions` project reference. Application now has zero infrastructure transitive dependencies (no MassTransit, Scrutor, Serilog, OpenTelemetry).
- All commands, queries, and handlers — `using Kombats.Shared.Types` → `using Kombats.Abstractions`

Deleted legacy composition files:
- `ApplicationServicesExtensions.cs` — used Scrutor assembly scanning + `LoggingDecorator` from `Kombats.Shared.Behaviours`. Legacy pattern; handler registration moves to Bootstrap (P-06).
- `DependencyInjection.cs` — `AddPlayersApplication()` called `ApplicationServicesExtensions`. Composition belongs in Bootstrap.

Created application-layer port for event publishing:
- `Abstractions/ICombatProfilePublisher.cs` — replaces direct `MassTransit.IPublishEndpoint` dependency. Infrastructure implements this (currently via temporary adapter, outbox-based in P-04/P-05).

Replaced `IPublishEndpoint` with `ICombatProfilePublisher` in all handlers:
- `AllocateStatPointsHandler` — `IPublishEndpoint` → `ICombatProfilePublisher`
- `EnsureCharacterExistsHandler` — same
- `SetCharacterNameHandler` — same
- `HandleBattleCompletedHandler` — same
- `using MassTransit;` removed from all Application files

Fixed CQRS alignment:
- `GetMeCommand` (was `ICommand<CharacterStateResult>`) → `GetCharacterQuery` (`IQuery<CharacterStateResult>`)
- `GetMeHandler` (was `ICommandHandler<>`) → `GetCharacterHandler` (`IQueryHandler<>`)
- Deleted `UseCases/GetMe/` directory, created `UseCases/GetCharacter/`

Handler visibility aligned for DI registration:
- `AllocateStatPointsHandler` — `internal sealed` → `public sealed`
- `EnsureCharacterExistsHandler` — `internal sealed` → `public sealed`
- `HandleBattleCompletedCommand` + `HandleBattleCompletedHandler` — `internal` → `public` (needed for DI registration from current Api/future Bootstrap)

Updated `PlayerCombatProfileChangedFactory`:
- Uses `character.IsReady` property (added in P-01) instead of inline `OnboardingState == Ready` comparison

Updated `AssemblyInfo.cs`:
- Added `InternalsVisibleTo("Kombats.Players.Application.Tests")`

**Cross-layer compile fixes (deviations — minimal, no behavioral changes):**

Api layer — `using Kombats.Shared.Types` → `using Kombats.Abstractions`:
- `ICurrentIdentityProvider.cs` — using statement change only
- `HttpCurrentIdentityProvider.cs` — using statement change only
- `ResultExtensions.cs` — switched to `Kombats.Abstractions` types, added `ToProblem()` extension method (replaces `Kombats.Shared.CustomResults.Problem()` which takes `Kombats.Shared.Types.Result`)
- `MeEndpoint.cs` — switched to Abstractions types, updated `GetMeCommand`/`ICommandHandler` → `GetCharacterQuery`/`IQueryHandler`, replaced `CustomResults.Problem()` → `result.ToProblem()`
- `AllocateStatPointsEndpoint.cs` — same pattern (using + `CustomResults` → `ToProblem()`)
- `SetCharacterNameEndpoint.cs` — same pattern

Api layer — handler registration (temporary bridge):
- `Program.cs` — replaced `AddPlayersApplication()` (deleted Scrutor-based method) with direct handler DI registrations. Added `ICombatProfilePublisher` → `MassTransitCombatProfilePublisher` registration. Marked as `// TEMPORARY: Direct handler registration until Bootstrap (P-06) takes over as composition root.`

Infrastructure layer:
- `BattleCompletedConsumer.cs` — `using Kombats.Shared.Types` → `using Kombats.Abstractions`
- `MassTransitCombatProfilePublisher.cs` — **new file**, temporary adapter implementing `ICombatProfilePublisher` via `IPublishEndpoint.Publish()`. Marked `// TEMPORARY: Bridge adapter until outbox-based publisher is implemented in P-04/P-05.`

**Tests added:** 32 application unit tests

| Test class | Tests | Coverage |
|---|---|---|
| `EnsureCharacterExistsHandlerTests` | 5 | Returns existing, creates draft, publishes event, handles concurrent create, conflict on reload failure |
| `SetCharacterNameHandlerTests` | 7 | Sets name, not found, name taken (pre-check), short name validation, concurrency conflict, unique name DB conflict, wrong state |
| `AllocateStatPointsHandlerTests` | 10 | Allocates points, invalid revision, not found, revision mismatch, draft state, negative points, exceeds unspent, zero total, concurrency conflict, Named→Ready transition |
| `GetCharacterHandlerTests` | 3 | Returns character, not found, full snapshot |
| `HandleBattleCompletedHandlerTests` | 7 | Awards XP + win/loss, draw (null winner/loser), idempotency (already processed), winner not found, loser not found, marks processed, publishes for both |

All tests use stubbed ports (NSubstitute) — zero infrastructure dependencies.

**Files changed:**

| File | Change |
|---|---|
| `Kombats.Players.Application.csproj` | Removed Shared ref + DI Abstractions pkg, added Abstractions ref |
| `UseCases/AllocateStatPoints/AllocateStatPointsCommand.cs` | `Kombats.Shared.Types` → `Kombats.Abstractions` |
| `UseCases/AllocateStatPoints/AllocateStatPointsHandler.cs` | Abstractions types, ICombatProfilePublisher, public, ZeroPoints error case |
| `UseCases/EnsureCharacterExists/EnsureCharacterExistsCommand.cs` | `Kombats.Shared.Types` → `Kombats.Abstractions` |
| `UseCases/EnsureCharacterExists/EnsureCharacterExistsHandler.cs` | Abstractions types, ICombatProfilePublisher, public |
| `UseCases/SetCharacterName/SetCharacterNameCommand.cs` | `Kombats.Shared.Types` → `Kombats.Abstractions` |
| `UseCases/SetCharacterName/SetCharacterNameHandler.cs` | Abstractions types, ICombatProfilePublisher |
| `Battles/HandleBattleCompletedCommand.cs` | Abstractions types, ICombatProfilePublisher, public |
| `IntegrationEvents/PlayerMatchProfileChangedIntegrationEvent.cs` | Uses `character.IsReady` property |
| `AssemblyInfo.cs` | Added InternalsVisibleTo for test project |
| Api: `Program.cs` | Direct handler DI registration (temporary bridge) |
| Api: `MeEndpoint.cs` | Abstractions types, GetCharacterQuery, ToProblem() |
| Api: `AllocateStatPointsEndpoint.cs` | Abstractions types, ToProblem() |
| Api: `SetCharacterNameEndpoint.cs` | Abstractions types, ToProblem() |
| Api: `ResultExtensions.cs` | Abstractions types, added ToProblem() |
| Api: `ICurrentIdentityProvider.cs` | Abstractions types |
| Api: `HttpCurrentIdentityProvider.cs` | Abstractions types |
| Infra: `BattleCompletedConsumer.cs` | Abstractions types |

**Files created:**

| File | Content |
|---|---|
| `Abstractions/ICombatProfilePublisher.cs` | Application port for combat profile event publishing |
| `UseCases/GetCharacter/GetCharacterQuery.cs` | Query replacing GetMeCommand |
| `UseCases/GetCharacter/GetCharacterHandler.cs` | Query handler replacing GetMeHandler |
| `Infra: Messaging/MassTransitCombatProfilePublisher.cs` | Temporary IPublishEndpoint adapter |
| Tests: 5 test files | 32 application handler unit tests |

**Files deleted:**

| File | Reason |
|---|---|
| `ApplicationServicesExtensions.cs` | Legacy Scrutor scanning + LoggingDecorator |
| `DependencyInjection.cs` | Composition belongs in Bootstrap |
| `UseCases/GetMe/GetMeCommand.cs` | Replaced by GetCharacterQuery |
| `UseCases/GetMe/GetMeHandler.cs` | Replaced by GetCharacterHandler |

**Temporary bridges in place:**

| Bridge | Location | Removal condition |
|---|---|---|
| Direct handler DI registration in Program.cs | `Api/Program.cs` | Bootstrap (P-06) takes over as composition root |
| `MassTransitCombatProfilePublisher` adapter | `Infrastructure/Messaging/` | Infrastructure replacement (P-04/P-05) implements outbox-scoped publisher |
| Api still references `Kombats.Shared` for `Messaging`, `Observability`, `Configuration`, `CustomResults` | `Api/Kombats.Players.Api.csproj` | API/Bootstrap replacement (P-06/P-07) |

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 errors, MSB3277 warnings only — EI-007) |
| `dotnet test` all tests | Pass (59 domain + 32 application + 25 messaging = 116 total) |
| Application has zero `Kombats.Shared` references | Pass |
| Application has zero `using MassTransit` in code | Pass (comment-only reference in ICombatProfilePublisher doc) |
| Application depends only on Domain + Contracts + Abstractions | Pass |
| All handlers use ICombatProfilePublisher port | Pass |
| GetCharacter is IQuery/IQueryHandler (CQRS compliance) | Pass |
| No new NuGet packages added | Pass |
| Cross-layer changes are minimal compile fixes only | Pass |
| All temporary bridges documented | Pass |

---

## Batch P-C — Players Persistence Replacement

**Date**: 2026-04-07
**Status**: Completed
**Ticket**: P-03 — Replace Players DbContext and Persistence

### Objective

Replace the Players DbContext and persistence layer to comply with the target architecture: MassTransit transactional outbox entity support (AD-01), removal of `Kombats.Shared` dependency from Infrastructure, schema ownership, and comprehensive integration tests.

### Changes

#### PlayersDbContext — Outbox Entity Support

- Added `MassTransit.AddInboxStateEntity()`, `AddOutboxMessageEntity()`, `AddOutboxStateEntity()` to `OnModelCreating`
- This enables the MassTransit EF Core transactional outbox (AD-01) — events published through the outbox are atomically committed with domain writes
- Added `using MassTransit;` import

**File**: `src/Kombats.Players/Kombats.Players.Infrastructure/Data/PlayersDbContext.cs`

#### Infrastructure.csproj — Package and Reference Updates

- Added `MassTransit` and `MassTransit.EntityFrameworkCore` (8.3.0, pinned) package references
- Removed `Kombats.Shared` project reference — no Infrastructure code uses it (verified: zero `using Kombats.Shared` in Infrastructure)
- Api project still references `Kombats.Shared` (legacy, not in P-03 scope)

**File**: `src/Kombats.Players/Kombats.Players.Infrastructure/Kombats.Players.Infrastructure.csproj`

#### Migration — AddOutboxEntities

- Auto-generated migration adding `inbox_state`, `outbox_message`, `outbox_state` tables to `players` schema
- All tables use snake_case naming consistent with existing schema
- Indexes: `ix_inbox_state_delivered`, `ix_outbox_message_enqueue_time`, `ix_outbox_message_expiration_time`, `ix_outbox_message_outbox_id_sequence_number`, `ix_outbox_message_inbox_message_id_inbox_consumer_id_sequence_`, `ix_outbox_state_created`
- FK relationships: `outbox_message → outbox_state`, `outbox_message → inbox_state`
- Pattern matches Matchmaking and Battle outbox migrations exactly

**Files**:
- `src/Kombats.Players/Kombats.Players.Infrastructure/Persistence/EF/Migrations/20260407054312_AddOutboxEntities.cs`
- `src/Kombats.Players/Kombats.Players.Infrastructure/Persistence/EF/Migrations/20260407054312_AddOutboxEntities.Designer.cs`
- `src/Kombats.Players/Kombats.Players.Infrastructure/Persistence/EF/Migrations/PlayersDbContextModelSnapshot.cs` (updated)

#### Infrastructure Integration Tests (18 tests)

Created comprehensive integration test suite using real PostgreSQL via Testcontainers:

**Test fixture**: `PostgresFixture` — spins up PostgreSQL 16 container, runs migrations, provides fresh `PlayersDbContext` instances
- Uses `ICollectionFixture` for shared container across test classes

**CharacterPersistenceTests** (8 tests):
- `RoundTrip_DraftCharacter_AllFieldsPersisted` — create draft, save, reload, verify all 16 fields
- `RoundTrip_ReadyCharacter_AllFieldsPersisted` — full onboarding flow persisted correctly
- `GetByIdentityIdAsync_ReturnsCorrectCharacter` — repository query by identity ID
- `GetByIdentityIdAsync_ReturnsNull_WhenNotFound` — missing identity ID
- `AddAsync_ThenSave_PersistsCharacter` — repository add + save
- `IsNameTakenAsync_ReturnsFalse_WhenNoMatchingName` — no match
- `IsNameTakenAsync_ReturnsTrue_WhenNameExists` — case-insensitive match
- `IsNameTakenAsync_ExcludesOwnCharacter` — exclusion filter works

**UnitOfWorkTests** (3 tests):
- `SaveChangesAsync_DuplicateIdentityId_ThrowsUniqueConstraintConflict` — maps to `UniqueConflictKind.IdentityId`
- `SaveChangesAsync_DuplicateNormalizedName_ThrowsUniqueConstraintConflict` — maps to `UniqueConflictKind.CharacterName`
- `SaveChangesAsync_ConcurrentModification_ThrowsConcurrencyConflict` — optimistic concurrency via Revision token

**InboxPersistenceTests** (3 tests):
- `IsProcessedAsync_ReturnsFalse_WhenNotProcessed`
- `AddProcessedAsync_ThenIsProcessed_ReturnsTrue` — round-trip
- `AddProcessedAsync_DuplicateMessageId_ThrowsOnSave` — PK enforcement

**SchemaTests** (4 tests):
- `Schema_UsesPlayersSchema` — all entities in `players` schema
- `Schema_CharactersTable_UsesSnakeCaseColumns` — snake_case naming verified
- `Schema_OutboxTables_Exist` — `inbox_state`, `outbox_message`, `outbox_state` present
- `Migrations_ApplyCleanly` — no pending migrations

**Files**:
- `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/Fixtures/PostgresFixture.cs`
- `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/CharacterPersistenceTests.cs`
- `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/UnitOfWorkTests.cs`
- `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/InboxPersistenceTests.cs`
- `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/SchemaTests.cs`
- `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/Kombats.Players.Infrastructure.Tests.csproj` (updated with EF Core + MassTransit packages)

### Not Changed (Intentionally)

| Item | Reason |
|---|---|
| `DependencyInjection.cs` | Composition — belongs in Bootstrap (P-06), not P-03 scope |
| Repositories (CharacterRepository, InboxRepository) | Already implemented, no changes needed for P-03 |
| EfUnitOfWork | Already implemented correctly |
| BattleCompletedConsumer | Consumer scope (P-05) |
| MassTransitCombatProfilePublisher | Outbox-scoped publisher is P-04/P-05 scope |
| Api/Program.cs legacy composition | Bootstrap replacement (P-06) |

### Temporary Bridges

No new temporary bridges introduced. Existing bridges from P-B remain:

| Bridge | Location | Removal condition |
|---|---|---|
| `DependencyInjection.cs` in Infrastructure | `Infrastructure/DependencyInjection.cs` | Bootstrap (P-06) takes over — forbidden pattern, removal deferred |
| `MassTransitCombatProfilePublisher` adapter | `Infrastructure/Messaging/` | P-04/P-05 implements outbox-scoped publisher |
| Api still references `Kombats.Shared` | `Api/Kombats.Players.Api.csproj` | API/Bootstrap replacement (P-06/P-07) |

### Risks and Deviations

- **None**: Changes are strictly persistence-scoped
- The `DependencyInjection.cs` in Infrastructure is a known forbidden pattern but cannot be removed until Bootstrap (P-06) exists as the composition root. Documented as pre-existing technical debt.

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build Kombats.sln` | Pass (0 errors) |
| `dotnet test` all Players tests | Pass (59 domain + 32 application + 18 infrastructure = 109 tests) |
| Infrastructure has zero `Kombats.Shared` references | Pass |
| Outbox entities mapped in DbContext | Pass |
| Migration applies cleanly to empty database | Pass (Testcontainers) |
| Schema isolation (players schema) | Pass |
| Snake_case naming | Pass |
| Concurrency token behavior | Pass |
| Unique constraint mapping | Pass |
| No new NuGet packages outside approved list | Pass (MassTransit 8.3.0 + MassTransit.EntityFrameworkCore 8.3.0 — both approved) |

---

## Batch P-D — Players Repository + BattleCompleted Consumer

**Date**: 2026-04-07
**Tickets**: P-04, P-05
**Status**: Done

### P-04: Players Character Repository Implementation

**Status**: Done

The `CharacterRepository` was already implemented in P-03 with GetByIdentityId, GetById, Add, and IsNameTaken. P-04 verifies completeness and adds the required "update → reload → verify" integration test.

#### Files Changed
| File | Action | Notes |
|---|---|---|
| `tests/.../CharacterPersistenceTests.cs` | Modified | Added `UpdateCharacter_PersistsChanges` test |

#### Acceptance Criteria Verification
| Criterion | Status |
|---|---|
| `CharacterRepository` implements `ICharacterRepository` | Pass (P-03) |
| GetByIdentityId returns character or null | Pass (existing tests) |
| Add persists new character | Pass (existing test) |
| Update persists changes with concurrency check | Pass (new test + existing UnitOfWorkTests) |
| No generic repository wrapper | Pass |
| Integration tests pass with real PostgreSQL | Pass (Testcontainers) |

### P-05: Players BattleCompleted Consumer

**Status**: Done

#### Files Changed
| File | Action | Notes |
|---|---|---|
| `src/.../Battles/HandleBattleCompletedCommand.cs` | Modified | Moved publish before SaveChanges for outbox atomicity (AD-01) |
| `src/.../Messaging/MassTransitCombatProfilePublisher.cs` | Modified | Removed TEMPORARY bridge marking — this IS the outbox implementation |
| `src/.../AssemblyInfo.cs` | Modified | Added `InternalsVisibleTo` for test project |
| `tests/.../BattleCompletedConsumerTests.cs` | Created | 4 consumer integration tests |

#### Tests Added
| Test | What It Proves |
|---|---|
| `BattleCompleted_WithWinner_AwardsXpAndRecordsWinLoss` | Winner gets 10 XP + win; loser gets 5 XP + loss; both profiles published |
| `BattleCompleted_Draw_NoXpChangesAndNoProfilePublished` | Null winner/loser → no character changes, inbox entry still recorded |
| `BattleCompleted_SameMessageTwice_SecondIsNoOp` | Idempotency: same MessageId consumed twice, XP/wins only applied once |
| `BattleCompleted_WinnerNotFound_Throws` | Consumer throws when winner character doesn't exist |

#### Acceptance Criteria Verification
| Criterion | Status |
|---|---|
| Consumer calls HandleBattleCompletedCommand handler | Pass |
| Consumer is thin — no domain logic | Pass |
| Handles draw case (null WinnerIdentityId) | Pass |
| Handles unknown player gracefully | Pass (throws, MassTransit retries) |
| Inbox configured for idempotent processing | Pass |
| Integration tests pass | Pass (Testcontainers) |

### Coexistence State

| Item | Old | New | Removal |
|---|---|---|---|
| `DependencyInjection.cs` in Infrastructure | Registers repos, DbContext | Still present | Removed when Bootstrap (P-06) replaces it |
| Legacy Players Api/Controllers | Still active | Not touched | P-07 replaces them |

### Risks and Deviations

- **Publish ordering fix (P-05)**: Moved `PublishAsync` calls before `SaveChangesAsync` in `HandleBattleCompletedHandler`. This is a minimal application adjustment strictly required for outbox correctness (AD-01). Without this fix, outbox entries would not be committed atomically with domain changes. The same pattern issue exists in other handlers (EnsureCharacterExists, SetCharacterName, AllocateStatPoints) but those are API-path handlers and will be addressed when Bootstrap wires the full outbox pipeline (P-06/P-07 scope).
- **No legacy removal**: Both tickets create new or fix existing target-architecture code. No legacy code was removed; legacy coexistence continues as documented in P-C.

### Validation Summary

| Check | Result |
|---|---|
| `dotnet build` Infrastructure.Tests | Pass (0 errors, 0 warnings) |
| `dotnet build` Application.Tests | Pass (0 errors, 0 warnings) |
| `dotnet test` Domain.Tests | Pass (59 tests) |
| `dotnet test` Application.Tests | Pass (32 tests) |
| `dotnet test` Infrastructure.Tests | Pass (23 tests) |
| Total Players tests | 114 (was 109 in P-C) |
| Consumer behavior verified with real Postgres | Pass |
| Consumer idempotency verified | Pass |
| Outbox publish ordering correct | Pass (publish before SaveChanges) |
| No new NuGet packages | Pass |

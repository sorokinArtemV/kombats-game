# Foundation Tickets

Phase 0 and Phase 1 tickets. These must land before any service replacement work begins.

---

## Phase 0: Repository Foundation Alignment

---

# F-01: Root Build Configuration Files

## Goal

Establish the three root-level build configuration files required by the target architecture: `global.json`, `Directory.Build.props`, and `Directory.Packages.props`.

## Scope

- Create `global.json` pinning SDK 10.0.100 with `latestPatch` roll-forward.
- Create `Directory.Build.props` with shared properties: `net10.0`, `Nullable enable`, `ImplicitUsings enable`, `LangVersion latest`.
- Create `Directory.Packages.props` with all approved package versions from the technology baseline document.
- Update all existing `.csproj` files to remove inline `<PackageReference Version="...">` attributes, replacing with versionless `<PackageReference Include="..."/>`.
- Add `<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>` to `Directory.Packages.props`.

## Out of Scope

- Changing any project behavior or dependencies.
- Adding new NuGet packages not already referenced.
- Service-specific refactoring.

## Dependencies

None. This is the first ticket.

## Deliverables

- `global.json` at repo root.
- `Directory.Build.props` at repo root.
- `Directory.Packages.props` at repo root with all currently-referenced packages plus test framework packages (xUnit, FluentAssertions, NSubstitute, Testcontainers).
- All existing `.csproj` files updated to remove inline version attributes.

## Acceptance Criteria

- [ ] `global.json` exists and pins SDK 10.0.100 with `latestPatch` roll-forward
- [ ] `Directory.Build.props` exists with `net10.0`, `Nullable enable`, `ImplicitUsings enable`, `LangVersion latest`
- [ ] `Directory.Packages.props` exists with central package management enabled
- [ ] All NuGet versions from the technology baseline are declared in `Directory.Packages.props`
- [ ] MassTransit pinned at exactly 8.3.0 in `Directory.Packages.props`
- [ ] No inline `Version=` attributes remain in any `.csproj` file
- [ ] `dotnet restore` succeeds for all existing projects
- [ ] `dotnet build` succeeds for all existing projects

## Required Tests

Build verification: `dotnet build` of the full solution succeeds after changes.

## Legacy Impact

No legacy impact. Mechanical change to version management only.

## Notes

If a service is about to be fully replaced in Phase 2–4, its `.csproj` cleanup can be batched with this ticket or deferred. Prefer doing it here since it's mechanical.

---

# F-02: Unified Solution File

## Goal

Create a single `Kombats.sln` that replaces per-service `.sln` files and `Kombats.slnx`. All projects build from one solution.

## Scope

- Create `Kombats.sln` at repo root including all existing source and test projects.
- Organize projects into solution folders: `src/Players`, `src/Matchmaking`, `src/Battle`, `src/Common`, `tests/Players`, `tests/Matchmaking`, `tests/Battle`, `tests/Common`.
- Verify `dotnet build Kombats.sln` succeeds.

## Out of Scope

- Deleting legacy `.sln`/`.slnx` files (see F-10).
- Adding projects that don't exist yet.

## Dependencies

F-01 (root build configuration).

## Deliverables

- `Kombats.sln` at repo root with all current projects organized into solution folders.

## Acceptance Criteria

- [ ] `Kombats.sln` exists at repo root
- [ ] All existing `.csproj` files are included in the solution
- [ ] Solution folders mirror the target directory structure
- [ ] `dotnet build Kombats.sln` succeeds
- [ ] `dotnet test Kombats.sln` runs (even if no tests exist yet)

## Required Tests

Build verification only.

## Legacy Impact

Temporary coexistence: old `.sln`/`.slnx` files remain until F-10. Both old and new solution files work during this window.

---

# F-03: Docker Compose Alignment

## Goal

Align docker-compose configuration with the target architecture. Rename `docker-compose.yaml` to `docker-compose.yml`. Add `docker-compose.override.yml` for dev overrides.

## Scope

- Rename `docker-compose.yaml` → `docker-compose.yml` (or replace content).
- Verify PostgreSQL 16, RabbitMQ 3.13, Redis 7, Keycloak 26 are configured.
- Remove commented-out service container definitions or move to override.
- Create `docker-compose.override.yml` for development-time overrides.
- Ensure all infrastructure starts cleanly with `docker compose up`.

## Out of Scope

- Service Dockerfile updates (handled per-service during cutover).
- Production Docker configuration.

## Dependencies

None.

## Deliverables

- `docker-compose.yml` with infrastructure services.
- `docker-compose.override.yml` for dev overrides.

## Acceptance Criteria

- [ ] `docker-compose.yml` exists (not `.yaml`) with PostgreSQL 16, RabbitMQ 3.13, Redis 7, Keycloak 26
- [ ] `docker compose up` starts all infrastructure containers
- [ ] No commented-out service definitions in the main compose file
- [ ] `docker-compose.override.yml` exists for dev overrides

## Required Tests

Manual verification: `docker compose up` starts all containers.

## Legacy Impact

No legacy impact. Infrastructure configuration only.

---

# F-04: Editorconfig Alignment

## Goal

Create or update `.editorconfig` at repo root with project code style rules.

## Scope

- Create `.editorconfig` if it does not exist, or update the existing one.
- Align with C# conventions: naming rules, formatting, nullable, using directives.

## Out of Scope

- Enforcing style on existing legacy code (would create massive diffs).

## Dependencies

None.

## Deliverables

- `.editorconfig` at repo root.

## Acceptance Criteria

- [ ] `.editorconfig` exists at repo root
- [ ] Nullable, naming, and formatting rules are defined
- [ ] No build warnings introduced in existing code (use appropriate severity levels)

## Required Tests

Build verification: no new warnings.

## Legacy Impact

No legacy impact.

---

# F-05: Test Infrastructure Baseline

## Goal

Establish the target `tests/` directory structure, test framework baseline in `Directory.Packages.props`, and the initial test projects needed by the first service stream (Players) and shared libraries. Remaining test projects are created by each service stream as it begins.

## Scope

- Create `tests/` directory structure matching the target layout.
- Ensure `Directory.Packages.props` includes all test framework packages: xUnit, xunit.runner.visualstudio, FluentAssertions, NSubstitute, Microsoft.NET.Test.Sdk, Testcontainers (PostgreSQL, Redis, RabbitMQ).
- Create initial test projects that are immediately needed:
  - `tests/Kombats.Players/Kombats.Players.Domain.Tests/`
  - `tests/Kombats.Players/Kombats.Players.Application.Tests/`
  - `tests/Kombats.Players/Kombats.Players.Infrastructure.Tests/`
  - `tests/Kombats.Players/Kombats.Players.Api.Tests/`
  - `tests/Kombats.Common/Kombats.Messaging.Tests/`
- Each test project references xUnit, FluentAssertions, NSubstitute, Microsoft.NET.Test.Sdk via central package management.
- Infrastructure test projects additionally reference Testcontainers packages.
- Add all created test projects to `Kombats.sln`.
- Each test project references its corresponding source project.

Remaining test projects (Matchmaking, Battle) are created as the first ticket of each service stream. The service stream ticket that creates them must follow the same conventions established here.

## Out of Scope

- Writing actual tests (each service ticket includes its own tests).
- Creating Matchmaking or Battle test projects (created when those streams begin).
- Shared test utilities or base classes beyond what xUnit provides.

## Dependencies

F-01 (package versions), F-02 (solution file).

## Deliverables

- `tests/` directory with target structure (empty subdirectories for Matchmaking and Battle are acceptable as placeholders).
- 5 test project `.csproj` files (Players + Messaging) with correct references.
- All created test projects in `Kombats.sln`.
- `dotnet build Kombats.sln` succeeds including test projects.

## Acceptance Criteria

- [ ] `tests/` directory exists with subdirectories for all three services and Common
- [ ] Players Domain, Application, Infrastructure, and Api test projects exist with correct project references
- [ ] Kombats.Messaging.Tests project exists with correct project reference
- [ ] All test projects reference xUnit, FluentAssertions, NSubstitute via central package management
- [ ] Infrastructure test projects reference Testcontainers packages
- [ ] All created test projects are in `Kombats.sln`
- [ ] `dotnet build Kombats.sln` succeeds
- [ ] `dotnet test Kombats.sln` runs without errors (zero tests is acceptable)
- [ ] Test framework package versions are declared in `Directory.Packages.props`

## Required Tests

Build verification only.

## Legacy Impact

No legacy impact. Additive only.

## Notes

Matchmaking and Battle test projects are created as part of M-01 and B-01 respectively. Those tickets must create their service's test projects following the same conventions (package references, directory structure, solution inclusion) established by this ticket.

---

# F-06: Rename Kombats.Infrastructure.Messaging to Kombats.Messaging

## Goal

Rename the existing shared messaging library from `Kombats.Infrastructure.Messaging` to `Kombats.Messaging` and update all references.

## Scope

- Rename project directory: `src/Kombats.Common/Kombats.Infrastructure.Messaging/` → `src/Kombats.Common/Kombats.Messaging/`.
- Rename `.csproj` file to `Kombats.Messaging.csproj`.
- Update root namespace to `Kombats.Messaging`.
- Update all `using` statements across the repo from the old namespace.
- Update all `<ProjectReference>` entries in `.csproj` files.
- Update the unified solution file.
- Fix any `Combats.*` namespace references to `Kombats.*`.

## Out of Scope

- Changing the messaging library's behavior or configuration (see F-07).
- Removing legacy `Kombats.Shared` messaging code (see service tickets).

## Dependencies

F-01 (build config), F-02 (solution file).

## Deliverables

- `Kombats.Messaging` project at `src/Kombats.Common/Kombats.Messaging/`.
- All references updated.
- All namespaces corrected to `Kombats.Messaging`.

## Acceptance Criteria

- [ ] Project directory is `src/Kombats.Common/Kombats.Messaging/`
- [ ] `.csproj` is named `Kombats.Messaging.csproj`
- [ ] Root namespace is `Kombats.Messaging`
- [ ] All project references across repo point to the renamed project
- [ ] No `Combats.*` namespaces remain in the messaging project
- [ ] `dotnet build Kombats.sln` succeeds

## Required Tests

Build verification.

## Legacy Impact

Temporary coexistence: `Kombats.Shared` messaging code in the Players service still exists. It will be replaced when Players is migrated. This ticket only renames the common messaging library.

---

# F-07: Align Kombats.Messaging with Target Configuration

## Goal

Ensure `Kombats.Messaging` provides all target capabilities: outbox/inbox, retry/redelivery, entity naming, consumer registration, health check contribution.

## Scope

- Verify and align: MassTransit 8.3.0 RabbitMQ transport configuration.
- Verify and align: EF Core transactional outbox configuration with `AddEntityFrameworkOutbox<TDbContext>`.
- Verify and align: Inbox consumer idempotency.
- Verify and align: Entity name formatter (`combats.{event-name}`, kebab-case).
- Verify and align: Consumer registration via assembly scanning.
- Verify and align: Retry policy (5 attempts, 200ms–5000ms exponential).
- Verify and align: Redelivery policy (30s, 120s, 600s).
- Verify and align: Consume logging filter.
- Verify and align: RabbitMQ health check contribution.
- Extend what is correct. Replace what diverges.

## Out of Scope

- Per-service consumer implementations.
- Contract projects.

## Dependencies

F-06 (rename complete).

## Deliverables

- `Kombats.Messaging` with all target capabilities implemented and verified.
- Messaging integration test demonstrating outbox/inbox round-trip.

## Acceptance Criteria

- [ ] MassTransit 8.3.0 bus configuration with RabbitMQ transport
- [ ] EF Core transactional outbox configured
- [ ] Inbox idempotency configured
- [ ] Entity name formatter produces `combats.{event-name}` kebab-case names
- [ ] Consumer registration via assembly scanning works
- [ ] Retry: 5 attempts, 200ms–5000ms exponential
- [ ] Redelivery: 30s, 120s, 600s
- [ ] Consume logging filter active
- [ ] RabbitMQ health check contributed
- [ ] All three services can use `AddMessaging<TDbContext>()` entry point

## Required Tests

- Integration test: outbox message publish → message delivered (Testcontainers PostgreSQL + RabbitMQ).
- Unit test: entity name formatter produces correct names.
- Unit test: retry/redelivery configuration values.

## Legacy Impact

Temporary coexistence: Players service still uses `Kombats.Shared` messaging. Matchmaking and Battle already use the common library (or similar). Verify they continue to work after alignment.

---

# F-08: Create Kombats.Abstractions Project

## Goal

Create the shared abstractions project with cross-cutting types used by all services.

## Scope

- Create `src/Kombats.Common/Kombats.Abstractions/Kombats.Abstractions.csproj`.
- Implement: `Result<T>`, `Error`, `ErrorType`.
- Implement: `ICommand<TResult>`, `IQuery<TResult>`.
- Implement: `ICommandHandler<TCommand, TResult>`, `IQueryHandler<TQuery, TResult>`.
- Zero infrastructure dependencies — only `Microsoft.Extensions.*` abstractions if needed.
- Add to `Kombats.sln`.

## Out of Scope

- Service-specific types.
- Migration of existing `Kombats.Shared` result types (happens per-service).

## Dependencies

F-01 (build config), F-02 (solution file).

## Deliverables

- `Kombats.Abstractions` project with `Result<T>`, `Error`, handler interfaces.
- Project compiles with zero NuGet dependencies (or only `Microsoft.Extensions.Logging.Abstractions`).

## Acceptance Criteria

- [ ] `Kombats.Abstractions.csproj` exists at `src/Kombats.Common/Kombats.Abstractions/`
- [ ] `Result<T>` and `Error` types defined
- [ ] `ICommandHandler<TCommand, TResult>` and `IQueryHandler<TQuery, TResult>` interfaces defined
- [ ] Project has zero infrastructure NuGet dependencies
- [ ] Project is in `Kombats.sln`
- [ ] `dotnet build` succeeds

## Required Tests

Minimal unit tests for `Result<T>` success/failure creation and pattern matching.

## Legacy Impact

No legacy impact. New additive project. `Kombats.Shared` equivalents remain until each service migrates.

---

# F-09: Contract Project Alignment

## Goal

Review and align all existing contract projects with the target architecture: Version fields, correct types, zero dependencies.

## Scope

- **Players.Contracts**: Ensure `PlayerCombatProfileChanged` has `Version: int` field. Verify all fields match architecture spec.
- **Battle.Contracts**: Ensure `CreateBattle` command, `BattleParticipantSnapshot`, `BattleCreated`, `BattleCompleted` are correct. `BattleCompleted` must include nullable `WinnerIdentityId`/`LoserIdentityId`, `TurnCount`, `DurationMs`, `RulesetVersion`, `Version`.
- **Battle.Realtime.Contracts**: Verify SignalR event names and client-facing types.
- **Matchmaking.Contracts**: Currently empty. Add `MatchCreated` and `MatchCompleted` if defined in the architecture. Ensure `Version` fields present.
- Remove any non-contract types (classes with logic, NuGet dependencies) from contract projects.
- Verify all contract projects have zero NuGet dependencies.

## Out of Scope

- Consumer implementations.
- Changing service behavior.

## Dependencies

F-01 (build config).

## Deliverables

- All four contract projects aligned with architecture spec.
- All events carry `Version: int` fields.
- Zero NuGet dependencies on all contract projects.

## Acceptance Criteria

- [ ] `PlayerCombatProfileChanged` has `Version` field and all spec fields
- [ ] `BattleCompleted` has nullable `WinnerIdentityId`/`LoserIdentityId`, `TurnCount`, `DurationMs`, `RulesetVersion`, `Version`
- [ ] `CreateBattle` and `BattleCreated` match architecture spec
- [ ] `Matchmaking.Contracts` contains required contract types (if specified)
- [ ] All contract projects have zero NuGet package references
- [ ] No non-contract types (logic, services) in contract projects
- [ ] `dotnet build` succeeds

## Required Tests

Contract serialization/deserialization round-trip tests for each contract type.

## Legacy Impact

No legacy impact. Contract alignment is additive or corrective.

---

# F-10: Legacy Solution File Removal

## Goal

Remove per-service `.sln` files and `Kombats.slnx` now that the unified `Kombats.sln` exists.

## Scope

- Delete `src/Kombats.Battle/Kombats.Battle.sln`.
- Delete `src/Kombats.Matchmaking/Kombats.Matchmaking.sln`.
- Delete `Kombats.slnx` (if it exists at repo root).
- Any other per-service `.sln` files.

## Out of Scope

- Any code changes.

## Dependencies

F-02 (unified solution verified).

## Deliverables

- All per-service `.sln` files deleted.
- `Kombats.slnx` deleted.
- `Kombats.sln` is the sole solution file.

## Acceptance Criteria

- [ ] No per-service `.sln` files remain in the repository
- [ ] `Kombats.slnx` does not exist
- [ ] `dotnet build Kombats.sln` still succeeds

## Required Tests

Build verification.

## Legacy Impact

Legacy removal. Per-service solution files are no longer needed.

---

## Phase 1: Shared Infrastructure

---

# F-11: Shared Auth Configuration Helper in Kombats.Abstractions

## Goal

Add a reusable JWT Bearer authentication configuration helper to `Kombats.Abstractions` that all three services call from their Bootstrap `Program.cs`.

## Scope

- Add auth helper to `src/Kombats.Common/Kombats.Abstractions/`.
- The helper is a static extension method on `IServiceCollection` (e.g., `AddKombatsAuth(this IServiceCollection, IConfiguration)`) that:
  - Configures JWT Bearer authentication with Keycloak authority URL and audience from `IConfiguration`.
  - Reads `Keycloak:Authority` and `Keycloak:Audience` from configuration.
  - Maps the `sub` claim to a `NameIdentifier` claim if needed.
- Add an `IdentityId` extraction utility: a static method or extension on `ClaimsPrincipal` that returns the identity ID from the `sub` claim.
- `Kombats.Abstractions` gains a dependency on `Microsoft.AspNetCore.Authentication.JwtBearer` (add to `Directory.Packages.props` if not present) and `Microsoft.Extensions.Configuration.Abstractions`.

## Out of Scope

- Per-service endpoint authorization policies (those live in each Bootstrap).
- Dev auth bypasses (forbidden in target).
- Token refresh, session management, or identity provider interaction beyond JWT validation.

## Dependencies

F-01 (build config), F-08 (Kombats.Abstractions project exists).

## Deliverables

- `AddKombatsAuth` extension method in `Kombats.Abstractions`.
- `IdentityId` extraction utility in `Kombats.Abstractions`.
- Updated `Kombats.Abstractions.csproj` with auth package reference.

## Acceptance Criteria

- [ ] `AddKombatsAuth` extension method exists in `Kombats.Abstractions`
- [ ] Configures JWT Bearer with authority and audience from `Keycloak` configuration section
- [ ] `IdentityId` extraction from `sub` claim returns correct value
- [ ] `IdentityId` extraction returns null/failure for missing `sub` claim
- [ ] No dev auth bypass middleware
- [ ] `dotnet build` succeeds

## Required Tests

- Unit test: `IdentityId` extraction from `ClaimsPrincipal` with `sub` claim → correct ID.
- Unit test: `IdentityId` extraction from `ClaimsPrincipal` without `sub` claim → null/failure.
- Auth enforcement tested per-service in API tickets (not in this ticket).

## Legacy Impact

No legacy impact. Additive change to existing Abstractions project.

---

# F-12: Verify Existing Services Build and Run After Foundation

## Goal

Verify that all foundation changes (F-01 through F-11) have not broken existing service functionality.

## Scope

- `dotnet build Kombats.sln` succeeds.
- Each service starts and responds to health checks.
- `docker compose up` starts infrastructure.
- Existing messaging between services still functions.

## Out of Scope

- Fixing pre-existing bugs.
- Service replacement work.

## Dependencies

All F-01 through F-11.

## Deliverables

- Verification report confirming all services build, start, and communicate.

## Acceptance Criteria

- [ ] `dotnet build Kombats.sln` succeeds with zero errors
- [ ] Players service starts and responds to `/health`
- [ ] Matchmaking service starts and responds to health endpoint
- [ ] Battle service starts and responds to health endpoint
- [ ] `docker compose up` starts all infrastructure containers
- [ ] No regressions in existing behavior

## Required Tests

Manual verification or smoke test script.

## Legacy Impact

No legacy impact. Verification only.

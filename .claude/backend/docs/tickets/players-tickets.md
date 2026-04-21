# Players Service Tickets

Phase 2 tickets. The Players service is the simplest service and serves as the template for the replacement pattern.

Current state: Players already uses Minimal APIs (not Controllers), has a domain layer, application layer, and infrastructure layer. The main gaps are: no Bootstrap project (Api is composition root), references `Kombats.Shared`, no outbox in some paths, missing target test coverage.

---

## Domain Layer

---

# P-01: Evaluate and Align Players Domain Layer

## Goal

Evaluate the existing Players domain layer against the target architecture. Clean up or replace domain code to ensure zero infrastructure dependencies, correct invariants, and complete business rules.

## Scope

- Review `Kombats.Players.Domain` project for architecture compliance.
- Ensure Character entity enforces: stat allocation rules (points > 0, points available, min 1 per stat), level progression, XP calculation, win/loss tracking, draw handling (0 XP), IsReady derivation (name set + all stat points allocated).
- Ensure OnboardingState is correct.
- Ensure LevelingConfig/LevelingPolicy produces correct XP thresholds and stat points per level.
- Remove any infrastructure dependencies from the Domain project (EF Core, etc.).
- Ensure the Domain `.csproj` references nothing except `Microsoft.Extensions.Logging.Abstractions` at most.

## Out of Scope

- Application handlers.
- Infrastructure persistence.
- API endpoints.

## Dependencies

F-08 (Kombats.Abstractions — if domain uses shared types).

## Deliverables

- Clean `Kombats.Players.Domain` with correct entities, invariants, and business rules.
- Domain unit tests in `Kombats.Players.Domain.Tests`.

## Acceptance Criteria

- [ ] Character entity enforces stat allocation invariants (no negative, no over-allocation, minimum 1 per stat)
- [ ] XP calculation correct: wins award XP, losses award reduced XP, draws award 0 XP
- [ ] Level progression: correct thresholds, stat points granted per level
- [ ] IsReady derivation: `true` only when name is set AND all stat points allocated
- [ ] OnboardingState transitions correct
- [ ] Domain project has zero infrastructure NuGet references (no EF Core, no Redis, no MassTransit)
- [ ] All domain unit tests pass

## Required Tests

- Unit tests: Character creation, stat allocation (valid, invalid, edge cases: zero points, max allocation).
- Unit tests: XP award for win, loss, draw. Level-up trigger. Stat points granted on level-up.
- Unit tests: IsReady derivation (all combinations).
- Unit tests: OnboardingState transitions (valid and invalid).

## Legacy Impact

Evaluation determines whether this is a cleanup or replacement. If domain is structurally sound, clean in place. If it has wrong dependencies, replace contents. Document which approach was taken.

---

## Application Layer

---

# P-02: Replace Players Application Layer

## Goal

Rewrite the Players application layer to use target architecture handler patterns with `ICommandHandler`/`IQueryHandler` from `Kombats.Abstractions`.

## Scope

- `EnsureCharacterExistsCommand` + handler: create character on first login or return existing.
- `SetCharacterNameCommand` + handler: set name, publish `PlayerCombatProfileChanged` if IsReady changes.
- `AllocateStatPointsCommand` + handler: allocate stats with optimistic concurrency, publish `PlayerCombatProfileChanged` via outbox.
- `GetCharacterQuery` + handler: return character data for current user.
- `HandleBattleCompletedCommand` + handler: award XP, update win/loss/draw, level up if threshold met, publish `PlayerCombatProfileChanged` via outbox.
- Define repository port interfaces: `ICharacterRepository`.
- Define messaging port: `ICombatProfilePublisher` or use outbox directly via port.
- Remove legacy handler patterns (if using `Kombats.Shared` command/query types).

## Out of Scope

- Infrastructure implementations of ports.
- API endpoints.

## Dependencies

P-01 (domain layer), F-08 (Kombats.Abstractions).

## Deliverables

- All command/query handlers in `Kombats.Players.Application`.
- Port interfaces defined in Application.
- Application unit tests in `Kombats.Players.Application.Tests`.

## Acceptance Criteria

- [ ] `EnsureCharacterExistsCommand` handler creates or returns existing character
- [ ] `SetCharacterNameCommand` handler validates and sets name, triggers profile publication when IsReady
- [ ] `AllocateStatPointsCommand` handler enforces concurrency and publishes profile change
- [ ] `GetCharacterQuery` handler returns character data
- [ ] `HandleBattleCompletedCommand` handler awards XP, updates record, handles draw (0 XP), levels up, publishes profile
- [ ] All handlers use port interfaces, not concrete infrastructure
- [ ] Application project references only Domain and Abstractions (no infrastructure packages)
- [ ] All application unit tests pass with stubbed/faked ports

## Required Tests

- Unit tests per handler with faked repository and messaging ports.
- EnsureCharacter: new character created, existing character returned.
- SetName: valid name, empty name rejected, profile published on IsReady.
- AllocateStats: valid allocation, insufficient points rejected, concurrency conflict handled.
- HandleBattleCompleted: win XP, loss XP, draw 0 XP, level-up, profile publication.
- GetCharacter: found, not found.

## Legacy Impact

Temporary coexistence: old application code in `Kombats.Players.Application` is replaced. If files can be replaced in place, do so. Legacy handler patterns from `Kombats.Shared` are superseded.

---

## Infrastructure Layer

---

# P-03: Replace Players DbContext and Persistence

## Goal

Align `PlayersDbContext` with target architecture: `players` schema, snake_case naming, outbox/inbox tables, correct entity configurations.

## Scope

- Update or replace `PlayersDbContext` with `players` schema configuration.
- Snake_case naming via `EFCore.NamingConventions`.
- MassTransit outbox/inbox entity mappings.
- `EnableRetryOnFailure()` configuration.
- Character entity configuration with all fields, concurrency token.
- Remove `Database.MigrateAsync()` from startup if present.
- Generate new EF Core migration to align schema.

## Out of Scope

- Repository implementation (P-04).
- Consumer implementation (P-05).
- API or Bootstrap changes.

## Dependencies

P-01 (domain entities), F-07 (Kombats.Messaging for outbox tables).

## Deliverables

- Aligned `PlayersDbContext` with outbox/inbox support.
- Entity configurations.
- EF Core migration.
- Infrastructure integration tests in `Kombats.Players.Infrastructure.Tests`.

## Acceptance Criteria

- [ ] `PlayersDbContext` uses `players` schema
- [ ] Snake_case naming convention applied
- [ ] Outbox/inbox tables mapped for MassTransit
- [ ] `EnableRetryOnFailure()` on connection
- [ ] Character entity configuration complete with concurrency token
- [ ] No `Database.MigrateAsync()` on startup
- [ ] Migration applies cleanly to empty database
- [ ] Integration test verifies schema, table names, round-trip persistence

## Required Tests

- Integration test (Testcontainers PostgreSQL): migration applies, character round-trip (create → save → reload → assert all fields).
- Integration test: snake_case column names verified.
- Integration test: outbox/inbox tables exist after migration.

## Legacy Impact

Temporary coexistence: old `PlayersDbContext` may be updated in place or replaced. Old migrations may need to be reconciled.

---

# P-04: Players Character Repository Implementation

## Goal

Implement the `ICharacterRepository` port defined in the application layer.

## Scope

- Implement `CharacterRepository` in `Kombats.Players.Infrastructure`.
- Operations: GetByIdentityId, Add, Update (with concurrency).
- Uses `PlayersDbContext` directly (no generic repository wrapper).

## Out of Scope

- DbContext changes (P-03).
- Application handler changes.

## Dependencies

P-02 (port interface), P-03 (DbContext).

## Deliverables

- `CharacterRepository` implementation.
- Integration tests.

## Acceptance Criteria

- [ ] `CharacterRepository` implements `ICharacterRepository`
- [ ] GetByIdentityId returns character or null
- [ ] Add persists new character
- [ ] Update persists changes with concurrency check
- [ ] No generic repository wrapper
- [ ] Integration tests pass with real PostgreSQL

## Required Tests

- Integration test (Testcontainers): create character → get by identity ID → assert fields.
- Integration test: update character → reload → verify changes.
- Integration test: concurrent update → concurrency exception raised.

## Legacy Impact

Replaces existing character persistence code. Old repository implementation superseded.

---

# P-05: Players BattleCompleted Consumer

## Goal

Implement the `BattleCompletedConsumer` with outbox/inbox, idempotency, and correct business behavior.

## Scope

- Consumer receives `BattleCompleted` from Battle.Contracts.
- Calls `HandleBattleCompletedCommand` handler.
- Consumer is thin: deserialize → call handler → return.
- Idempotent via inbox. Handler also independently idempotent (e.g., check if battle already processed).
- Handles edge cases: null `WinnerIdentityId` (draw), unknown player ID.

## Out of Scope

- Other consumers.
- Application handler logic (P-02).

## Dependencies

P-02 (handler), P-03 (DbContext with outbox/inbox), F-07 (Kombats.Messaging), F-09 (Battle.Contracts aligned).

## Deliverables

- `BattleCompletedConsumer` in `Kombats.Players.Infrastructure`.
- Consumer integration tests.

## Acceptance Criteria

- [ ] Consumer calls `HandleBattleCompletedCommand` handler
- [ ] Consumer is thin — no domain logic
- [ ] Handles draw case (null WinnerIdentityId)
- [ ] Handles unknown player gracefully
- [ ] Inbox configured for idempotent processing
- [ ] Integration tests pass

## Required Tests

- Behavior test: BattleCompleted with winner → XP awarded, win/loss updated, profile published.
- Behavior test: BattleCompleted with draw → 0 XP, draw recorded.
- Idempotency test: same message (same MessageId) consumed twice → second is no-op.

## Legacy Impact

Replaces existing `BattleCompletedConsumer`. Old consumer code removed in this ticket if replacement is self-contained.

---

## API and Bootstrap Layer

---

# P-06: Create Players Bootstrap Project

## Goal

Create `Kombats.Players.Bootstrap` as the composition root for the Players service.

## Scope

- Create `Kombats.Players.Bootstrap` project with `Microsoft.NET.Sdk.Web`.
- `Program.cs` with full DI composition: DbContext, repositories, handlers, MassTransit (via Kombats.Messaging), auth (JWT/Keycloak), health checks, OpenAPI/Scalar.
- Move all DI registration from current Api `Program.cs` to Bootstrap.
- Change `Kombats.Players.Api` SDK to `Microsoft.NET.Sdk` (no longer a web host).
- Bootstrap references: Api, Application, Infrastructure, Domain, Contracts, Kombats.Messaging, Kombats.Abstractions.
- `appsettings.json` and `appsettings.Development.json` in Bootstrap.

## Out of Scope

- Endpoint implementation (P-07 or already exists in Api).
- Writing new domain/application/infrastructure code.

## Dependencies

P-02 (application handlers), P-03 (DbContext), P-04 (repository), P-05 (consumer), F-07 (Kombats.Messaging), F-08 (Abstractions), F-11 (auth helper).

## Deliverables

- `Kombats.Players.Bootstrap` project.
- `Program.cs` with all composition.
- `appsettings.json` and `appsettings.Development.json`.
- Api project SDK changed to `Microsoft.NET.Sdk`.
- Players service starts from Bootstrap.

## Acceptance Criteria

- [ ] `Kombats.Players.Bootstrap` project exists with `Microsoft.NET.Sdk.Web`
- [ ] `Kombats.Players.Api` SDK is `Microsoft.NET.Sdk` (not a web host)
- [ ] All DI registration in Bootstrap `Program.cs`
- [ ] No `DependencyInjection.cs` or `ServiceCollectionExtensions` in Infrastructure
- [ ] MassTransit configured via `Kombats.Messaging`
- [ ] JWT auth configured via shared helper
- [ ] Health checks: PostgreSQL, RabbitMQ
- [ ] OpenAPI + Scalar configured
- [ ] Service starts from Bootstrap and responds to health check
- [ ] `dotnet build Kombats.sln` succeeds

## Required Tests

- Smoke test: service starts from Bootstrap, health check returns 200.

## Legacy Impact

Cutover required. Bootstrap replaces Api as the service executable. Old `Program.cs` in Api is superseded.

---

# P-07: Align Players Minimal API Endpoints

## Goal

Ensure Players API endpoints follow target conventions: thin Minimal APIs in the Api project, called from Bootstrap.

## Scope

- Review existing Minimal API endpoints. Players already uses Minimal APIs — verify they are thin (extract → call handler → return).
- Ensure endpoints use target handler interfaces (`ICommandHandler`, `IQueryHandler`).
- Add FluentValidation for input validation.
- Ensure all endpoints have `[Authorize]` (except health).
- Endpoint registration methods in Api project, called by Bootstrap.
- Add OpenAPI metadata.

## Out of Scope

- Bootstrap composition (P-06).
- New endpoint behavior.

## Dependencies

P-02 (handlers), P-06 (Bootstrap).

## Deliverables

- Aligned Minimal API endpoints in `Kombats.Players.Api`.
- FluentValidation validators.
- API tests in `Kombats.Players.Api.Tests`.

## Acceptance Criteria

- [ ] All endpoints are thin Minimal APIs (no domain logic)
- [ ] All endpoints use target handler interfaces
- [ ] All non-health endpoints have `[Authorize]`
- [ ] FluentValidation on all endpoints with input
- [ ] Endpoint registration callable from Bootstrap
- [ ] OpenAPI metadata on all endpoints
- [ ] API tests pass

## Required Tests

- Auth enforcement: valid JWT → 200, no JWT → 401, invalid JWT → 401.
- Validation tests: invalid input rejected with correct error response.
- Response contract tests: correct shape for each endpoint.
- Endpoint behavior: ensure character, set name, allocate stats, get character.

## Legacy Impact

Minimal. Players already uses Minimal APIs. This is alignment, not replacement.

---

# P-08: Players Legacy Removal and Cleanup

## Goal

Remove all superseded legacy code from the Players service after replacement is verified.

## Scope

- Delete old `Program.cs` in Api project (composition code).
- Delete any `DependencyInjection.cs` or `ServiceCollectionExtensions` in Infrastructure.
- Remove all references to `Kombats.Shared` from Players projects.
- Delete `Kombats.Shared` project if Players was the sole consumer (or remove Players' reference).
- Delete legacy middleware, legacy DTOs, or legacy patterns that were replaced.
- Move or delete Dockerfile from Api to Bootstrap.
- Clean up any orphan files.

## Out of Scope

- Changing new code behavior.
- Deleting `Kombats.Shared` if other services still reference it.

## Dependencies

P-06 (Bootstrap operational), P-07 (endpoints aligned). All Players replacement tickets verified.

## Deliverables

- No legacy Players code remaining.
- No `Kombats.Shared` references from Players.
- Solution builds. All tests pass.

## Acceptance Criteria

- [ ] No legacy `Program.cs` composition code in Api project
- [ ] No `DependencyInjection.cs` in Infrastructure
- [ ] No `Kombats.Shared` references from any Players project
- [ ] Dockerfile in Bootstrap (not Api)
- [ ] Solution builds successfully
- [ ] All Players tests pass
- [ ] No orphan files in Players projects

## Required Tests

Build verification. All existing tests pass.

## Legacy Impact

Legacy removal. This completes the Players replacement stream.

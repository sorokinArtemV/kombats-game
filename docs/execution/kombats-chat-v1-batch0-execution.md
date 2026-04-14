# Kombats Chat v1 — Batch 0 Execution

**Executed:** 2026-04-14
**Branch:** kombats_full_refactor
**Status:** Complete

---

## What Was Implemented

### 1. Chat Project Structure (6 projects)

Created under `src/Kombats.Chat/`:

| Project | SDK | Purpose |
|---|---|---|
| `Kombats.Chat.Domain` | `Microsoft.NET.Sdk` | Domain entities (empty for Batch 0) |
| `Kombats.Chat.Contracts` | `Microsoft.NET.Sdk` | Integration event contracts (empty for Batch 0) |
| `Kombats.Chat.Application` | `Microsoft.NET.Sdk` | Handlers, ports (empty for Batch 0) |
| `Kombats.Chat.Infrastructure` | `Microsoft.NET.Sdk` | Persistence, Redis, consumers (empty for Batch 0) |
| `Kombats.Chat.Api` | `Microsoft.NET.Sdk` | Minimal API endpoints, middleware |
| `Kombats.Chat.Bootstrap` | `Microsoft.NET.Sdk.Web` | Composition root with minimal runnable Program.cs |

**Project references** follow Clean Architecture dependency direction:
- Bootstrap → Api, Application, Domain, Infrastructure, Contracts, Abstractions, Messaging
- Api → Application
- Application → Domain, Abstractions
- Infrastructure → Application, Domain

**InternalsVisibleTo** configured:
- Application: Api, Infrastructure, Bootstrap, test projects, DynamicProxyGenAssembly2
- Infrastructure: Bootstrap, Infrastructure.Tests

**Bootstrap includes:**
- Serilog logging
- Keycloak JWT auth (via `Kombats.Abstractions.Auth.AddKombatsAuth`)
- CORS (dev-aware)
- Health checks (`/health/live`, `/health/ready`)
- OpenTelemetry tracing
- API documentation (OpenAPI + Scalar)
- Exception handling middleware
- Endpoint auto-discovery via `IEndpoint` pattern

### 2. Test Project Scaffolding (4 projects)

Created under `tests/Kombats.Chat/`:

| Project | Scaffolding |
|---|---|
| `Kombats.Chat.Domain.Tests` | xUnit, FluentAssertions, NSubstitute |
| `Kombats.Chat.Application.Tests` | xUnit, FluentAssertions, NSubstitute |
| `Kombats.Chat.Infrastructure.Tests` | xUnit, FluentAssertions, NSubstitute, Testcontainers (PostgreSQL + Redis) |
| `Kombats.Chat.Api.Tests` | xUnit, FluentAssertions, NSubstitute, WebApplicationFactory, Mvc.Testing |

**Shared test fixtures created:**
- `PostgresFixture` — Testcontainers PostgreSQL 16-alpine with collection definition
- `RedisFixture` — Testcontainers Redis 7-alpine with collection definition
- `ChatApiFactory` — WebApplicationFactory<Program> with test auth handler, configurable auth

### 3. Players Public Profile Endpoint

**Endpoint:** `GET /api/v1/players/{identityId:guid}/profile`

Files created:
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQuery.cs`
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQueryResponse.cs`
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileHandler.cs`
- `src/Kombats.Players/Kombats.Players.Api/Endpoints/PlayerProfile/GetPlayerProfileEndpoint.cs`

Files modified:
- `src/Kombats.Players/Kombats.Players.Bootstrap/Program.cs` — handler registration
- `tests/Kombats.Players/Kombats.Players.Api.Tests/Fixtures/PlayersApiFactory.cs` — mock handler
- `tests/Kombats.Players/Kombats.Players.Api.Tests/AuthTests.cs` — added profile endpoint auth test

Test file created:
- `tests/Kombats.Players/Kombats.Players.Api.Tests/PlayerProfileTests.cs` — 3 tests (success, not found, auth enforcement)

Returns: `playerId`, `displayName`, `level`, `strength`, `agility`, `intuition`, `vitality`, `wins`, `losses`

### 4. Docker Compose

- Added `chat` service to `docker-compose.yml`
- Depends on postgres (healthy), redis (healthy), rabbitmq (healthy), keycloak (started)
- Port mapping: 5001:8080
- Environment: PostgresConnection, Redis, RabbitMq, Keycloak
- Created `Dockerfile` for Chat.Bootstrap (mirrors Players Dockerfile pattern)

### 5. Solution Integration

All 10 new projects added to `Kombats.sln`:
- 6 src projects under `src/Chat` solution folder
- 4 test projects under `tests/Chat` solution folder

---

## Files Created

```
src/Kombats.Chat/Kombats.Chat.Domain/Kombats.Chat.Domain.csproj
src/Kombats.Chat/Kombats.Chat.Contracts/Kombats.Chat.Contracts.csproj
src/Kombats.Chat/Kombats.Chat.Application/Kombats.Chat.Application.csproj
src/Kombats.Chat/Kombats.Chat.Application/AssemblyInfo.cs
src/Kombats.Chat/Kombats.Chat.Infrastructure/Kombats.Chat.Infrastructure.csproj
src/Kombats.Chat/Kombats.Chat.Infrastructure/AssemblyInfo.cs
src/Kombats.Chat/Kombats.Chat.Api/Kombats.Chat.Api.csproj
src/Kombats.Chat/Kombats.Chat.Api/Endpoints/IEndpoint.cs
src/Kombats.Chat/Kombats.Chat.Api/Endpoints/Tags.cs
src/Kombats.Chat/Kombats.Chat.Api/Extensions/EndpointExtensions.cs
src/Kombats.Chat/Kombats.Chat.Api/Extensions/SwaggerExtensions.cs
src/Kombats.Chat/Kombats.Chat.Api/Middleware/ExceptionHandlingMiddleware.cs
src/Kombats.Chat/Kombats.Chat.Bootstrap/Kombats.Chat.Bootstrap.csproj
src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs
src/Kombats.Chat/Kombats.Chat.Bootstrap/appsettings.json
src/Kombats.Chat/Kombats.Chat.Bootstrap/appsettings.Development.json
src/Kombats.Chat/Kombats.Chat.Bootstrap/Dockerfile
src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQuery.cs
src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQueryResponse.cs
src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileHandler.cs
src/Kombats.Players/Kombats.Players.Api/Endpoints/PlayerProfile/GetPlayerProfileEndpoint.cs
tests/Kombats.Chat/Kombats.Chat.Domain.Tests/Kombats.Chat.Domain.Tests.csproj
tests/Kombats.Chat/Kombats.Chat.Application.Tests/Kombats.Chat.Application.Tests.csproj
tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Kombats.Chat.Infrastructure.Tests.csproj
tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Fixtures/PostgresFixture.cs
tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Fixtures/RedisFixture.cs
tests/Kombats.Chat/Kombats.Chat.Api.Tests/Kombats.Chat.Api.Tests.csproj
tests/Kombats.Chat/Kombats.Chat.Api.Tests/Fixtures/ChatApiFactory.cs
tests/Kombats.Players/Kombats.Players.Api.Tests/PlayerProfileTests.cs
docs/execution/kombats-chat-v1-batch0-execution.md
```

## Files Modified

```
Kombats.sln — added 10 Chat projects
docker-compose.yml — added chat service
src/Kombats.Players/Kombats.Players.Bootstrap/Program.cs — registered GetPlayerProfileHandler
tests/Kombats.Players/Kombats.Players.Api.Tests/Fixtures/PlayersApiFactory.cs — added profile handler mock
tests/Kombats.Players/Kombats.Players.Api.Tests/AuthTests.cs — added profile auth test case
```

---

## Build/Test Results

### Build
```
dotnet build → Build succeeded. 0 Warning(s), 0 Error(s)
```

### Tests
```
dotnet test tests/Kombats.Players/Kombats.Players.Api.Tests → 20 passed, 0 failed
```

Including 4 new tests:
- `PlayerProfileTests.GetProfile_ExistingPlayer_Returns200WithProfile` ✓
- `PlayerProfileTests.GetProfile_NonexistentPlayer_Returns404` ✓
- `PlayerProfileTests.GetProfile_WithoutAuth_Returns401` ✓
- `AuthTests.ProtectedEndpoint_WithoutAuth_Returns401` (profile endpoint case) ✓

Chat test projects compile and run (0 tests, as expected for Batch 0).

---

## Deviations From Plan

1. **Chat Api project required explicit `using` directives** — `Microsoft.NET.Sdk` projects do not get ASP.NET Core implicit usings (those only apply to `Microsoft.NET.Sdk.Web`). Added explicit `using Microsoft.AspNetCore.*` where needed. This is consistent with how the Players Api project handles it.

2. **No `AddCurrentIdentity` in Chat Bootstrap** — The Chat service doesn't need `ICurrentIdentityProvider` yet. The identity extraction pattern from Players is per-service (defined in each Api project). Chat will get its own identity infrastructure in later batches when the ChatHub requires it.

3. **No messaging/outbox in Chat Bootstrap** — Intentionally omitted per Batch 0 scope. `AddMessaging<ChatDbContext>()` will be added in Batch 2 when ChatDbContext exists and the `BattleCompleted` consumer is implemented.

4. **Profile endpoint uses `IdentityId` as `PlayerId`** — The plan specifies `playerId` in the response. The existing `Character` entity uses `IdentityId` as the external-facing identifier. The response maps `character.IdentityId` → `PlayerId` to match the spec while staying consistent with domain semantics.

---

## Issues Left for Later Batches

- **Batch 1**: Chat domain entities, ChatDbContext, EF migrations, schema creation
- **Batch 2**: MassTransit consumer registration, Redis connection, messaging setup
- **Batch 3**: ChatHub (SignalR), presence tracking, rate limiting
- **Batch 4**: BFF chat relay, end-to-end integration

No blocking issues discovered during Batch 0.

---

## Carry-Forward Fix: Eligibility Signal in Profile Response (2026-04-14)

**What:** Added `OnboardingState` field to `GetPlayerProfileQueryResponse`.

**Why:** Implementation-plan review (C1 in `docs/execution/reviews/kombats-chat-v1-implementation-plan-review.md`) identified that the profile endpoint response lacked the eligibility signal needed for Chat Layer 2 enforcement. Without this field, Chat's HTTP fallback (cache miss on display-name lookup) could not determine whether a player is eligible for chat — a player with a name but `OnboardingState != Ready` would incorrectly pass eligibility checks.

**Choice:** `onboardingState` (enum) over `isReady` (bool) because:
- Avoids lossy mapping — preserves the full Draft/Named/Ready progression
- Matches existing `CharacterStateResult` and `MeResponse` patterns in the Players service
- Chat can derive `isReady = onboardingState == Ready` without information loss

**Files changed:**
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQueryResponse.cs` — added `OnboardingState` field
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileHandler.cs` — mapped `character.OnboardingState`
- `tests/Kombats.Players/Kombats.Players.Api.Tests/PlayerProfileTests.cs` — updated success test with `OnboardingState.Ready` assertion

**Build/test result:** 20/20 Players API tests pass, 0 warnings, 0 errors.

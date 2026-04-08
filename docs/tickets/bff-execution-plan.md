# BFF Execution Plan

**Status:** Approved for implementation
**Date:** 2026-04-08
**Preconditions:** Phases 0–6 complete. BFF architecture spec reviewed and approved (`docs/architecture/kombats-bff-architecture.md`). Phase 7A independent — may run in parallel.
**Source of truth:** `docs/architecture/kombats-bff-architecture.md`

---

## Work Classification

The BFF stream is **new-layer foundation + integration work**. It is not a replacement stream (nothing is being superseded) and not a backend service stream. It introduces a new service that sits above the three existing backend services.

- **Type:** Foundation (project creation, composition root) + Integration (cross-service HTTP/SignalR orchestration)
- **Legacy impact:** None. No legacy code is superseded, modified, or removed. The BFF is additive.
- **Coexistence:** Not applicable — no old/new coexistence. Backend service APIs remain unchanged.
- **Scope boundary:** BFF v1 as defined in the approved spec. No backend service modifications unless a gap is discovered during implementation (see EI-043).

---

## Batch / Ticket Structure

The BFF stream is organized into 5 batches (BFF-0 through BFF-4), decomposed into 14 tickets. Each batch has a gate check that must pass before the next batch begins.

### Dependency Graph

```
BFF-0A (Projects + Bootstrap shell)
  │
  ├── BFF-0B (Typed HttpClients + config)
  │     │
  │     ├── BFF-0C (Health aggregation endpoint)
  │     │
  │     └── BFF-0D (AD-14 through AD-18 formalization)
  │
  └── [BFF-0 Gate]
        │
        ├── BFF-1A (Players pass-through endpoints)
        │
        ├── BFF-1B (Matchmaking pass-through endpoints)
        │
        └── BFF-1C (Error normalization + tests)
              │
              └── [BFF-1 Gate]
                    │
                    ├── BFF-2A (Composed game state endpoint)
                    │     │
                    │     └── [BFF-2 Gate]
                    │           │
                    │           ├── BFF-3A (BattleHub relay + connection lifecycle)
                    │           │     │
                    │           │     └── [BFF-3 Gate — fallback decision point]
                    │           │           │
                    │           │           └── BFF-4A (Integration verification + docker + docs)
                    │           │                 │
                    │           │                 └── [BFF-4 Gate — BFF v1 complete]
```

### Parallelism

- BFF-1A and BFF-1B can run in parallel (independent endpoint groups).
- BFF-0C and BFF-0D can run in parallel with BFF-0B.
- All other tickets are sequential.

---

## Batch BFF-0: Foundation

**Goal:** BFF project structure exists, builds, starts, validates JWT, and probes downstream health.

### Ticket BFF-0A: Create BFF Projects and Bootstrap Shell

**Type:** Foundation
**Goal:** Create the 3-project BFF structure and a minimal runnable Bootstrap.

**Scope:**
- Create `src/Kombats.Bff/Kombats.Bff.Bootstrap/` (`Microsoft.NET.Sdk.Web`)
  - `Kombats.Bff.Bootstrap.csproj` with references to Api and Application projects
  - `Program.cs` — minimal: Serilog, Keycloak JWT auth (via `AddKombatsAuth` from Abstractions), OpenAPI + Scalar, CORS, endpoint scanning from Api assembly
  - `appsettings.json` with service base URLs, Keycloak config
  - `appsettings.Development.json`
- Create `src/Kombats.Bff/Kombats.Bff.Api/` (`Microsoft.NET.Sdk`)
  - `Kombats.Bff.Api.csproj` referencing Application
  - `IEndpoint` interface + `EndpointExtensions` (same pattern as Players/Matchmaking/Battle Api projects)
- Create `src/Kombats.Bff/Kombats.Bff.Application/` (`Microsoft.NET.Sdk`)
  - `Kombats.Bff.Application.csproj` — no service project references, no Abstractions reference
  - Empty or minimal (client interfaces added in BFF-0B)
- Add all 3 projects to `Kombats.sln`

**Out of scope:**
- HttpClient registration (BFF-0B)
- Health endpoint (BFF-0C)
- Dockerfile (BFF-4A)
- Any endpoints beyond the auth-rejection test

**Dependencies:** None (Phases 0–6 complete provides all prerequisites)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Kombats.Bff.Bootstrap.csproj`
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs`
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/appsettings.json`
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/appsettings.Development.json`
- `src/Kombats.Bff/Kombats.Bff.Api/Kombats.Bff.Api.csproj`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/IEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Extensions/EndpointExtensions.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Kombats.Bff.Application.csproj`

**Files modified:**
- `Kombats.sln` — add 3 new projects under `src/Bff` solution folder

**Tests required:**
- Solution builds with 0 errors
- BFF Bootstrap project is `Microsoft.NET.Sdk.Web`; Api and Application are `Microsoft.NET.Sdk`

**Acceptance criteria:**
- [ ] 3 BFF projects exist in `src/Kombats.Bff/`
- [ ] `Kombats.sln` includes all 3 projects
- [ ] `dotnet build Kombats.sln` succeeds with 0 errors
- [ ] Bootstrap is `Microsoft.NET.Sdk.Web`; Api and Application are `Microsoft.NET.Sdk`
- [ ] JWT auth configured in Bootstrap (Keycloak)
- [ ] No references to any backend service project (Api, Application, Domain, Infrastructure)
- [ ] No reference to `Kombats.Abstractions`
- [ ] No reference to any Contract project

---

### Ticket BFF-0B: Typed HttpClients and Service Configuration

**Type:** Foundation
**Goal:** Register typed HttpClient wrappers for Players and Matchmaking. Define service client interfaces.

**Scope:**
- In Application:
  - `IPlayersClient` interface with methods matching BFF-1 needs: `EnsureCharacterAsync`, `GetCharacterAsync`, `SetCharacterNameAsync`, `AllocateStatsAsync`
  - `IMatchmakingClient` interface: `JoinQueueAsync`, `LeaveQueueAsync`, `GetQueueStatusAsync`
  - `PlayersClient` implementation using typed `HttpClient` — JWT forwarding via delegating handler
  - `MatchmakingClient` implementation using typed `HttpClient` — JWT forwarding
  - `JwtForwardingHandler` — `DelegatingHandler` that copies `Authorization` header from incoming request to outgoing HttpClient requests
  - Internal service response types (deserialization targets for Players and Matchmaking responses)
  - BFF error types (`BffError`, `BffErrorResponse`)
- In Bootstrap:
  - Register `IHttpClientFactory` with typed clients: `services.AddHttpClient<IPlayersClient, PlayersClient>(...)`
  - Register `JwtForwardingHandler`
  - Bind `Services:Players:BaseUrl` and `Services:Matchmaking:BaseUrl` from config

**Out of scope:**
- Battle HTTP client (not needed — Battle interaction is SignalR only for business flows)
- Actual endpoint implementations (BFF-1)
- Resilience policies / Polly (evaluate during implementation; may use built-in `IHttpClientFactory` retry)

**Dependencies:** BFF-0A

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/IPlayersClient.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/IMatchmakingClient.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/PlayersClient.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/MatchmakingClient.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/JwtForwardingHandler.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/ServiceOptions.cs` (config binding)
- `src/Kombats.Bff/Kombats.Bff.Application/Models/Internal/` (internal response types)
- `src/Kombats.Bff/Kombats.Bff.Application/Errors/BffError.cs`

**Files modified:**
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs` — add HttpClient registrations

**Tests required:**
- Unit test: `JwtForwardingHandler` copies Authorization header
- Unit test: Service options bind correctly from config
- Solution builds

**Acceptance criteria:**
- [ ] `IPlayersClient` and `IMatchmakingClient` interfaces defined with all v1 methods
- [ ] Typed HttpClient implementations registered via `IHttpClientFactory`
- [ ] JWT forwarding handler copies `Authorization` header from incoming to outgoing requests
- [ ] Service base URLs configurable via `appsettings.json`
- [ ] No `IBattleClient` HTTP client (Battle is SignalR-only for business flows)
- [ ] Tests: JWT forwarding handler unit test passes

---

### Ticket BFF-0C: Health Aggregation Endpoint

**Type:** Foundation
**Goal:** BFF exposes `/health` that probes all three downstream services.

**Scope:**
- In Api: `HealthEndpoint` implementing `IEndpoint`
  - `GET /health` — `AllowAnonymous`
  - Calls `GET /health` on Players, Matchmaking, Battle
  - Returns aggregated status (healthy/degraded/unhealthy)
- In Bootstrap: register health check probes (may use `AddUrlGroup` or custom `IHealthCheck` implementations)
- In Application: no change (health probes use plain `HttpClient`, not typed clients, per the BFF spec)

**Out of scope:**
- Liveness/readiness split (`/health/live`, `/health/ready`) — Phase 7A concern
- Custom health check response format beyond ASP.NET Core default

**Dependencies:** BFF-0A (project structure exists)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Health/HealthEndpoint.cs`

**Files modified:**
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs` — add health check services and endpoint mapping

**Tests required:**
- Health endpoint is `AllowAnonymous` (structural test)
- Health endpoint exists and is discoverable

**Acceptance criteria:**
- [ ] `GET /health` returns aggregated downstream health status
- [ ] Health endpoint is `AllowAnonymous`
- [ ] Probes Players:5001/health, Matchmaking:5002/health, Battle:5003/health
- [ ] If a downstream service is unreachable, BFF health reports degraded (not crash)

---

### Ticket BFF-0D: Formalize Architecture Decisions AD-14 through AD-18

**Type:** Foundation (documentation)
**Goal:** Write formal AD entries for BFF decisions.

**Scope:**
- Add AD-14 through AD-18 to `docs/architecture/kombats-architecture-decisions.md`
- Follow the format of AD-01 through AD-13 (Decision, Context, Trade-offs, Rejected Alternatives, Rationale)
- Decisions per the approved BFF spec Section 13:
  - AD-14: BFF as stateless orchestration/composition layer
  - AD-15: JWT forwarding for BFF-to-service auth
  - AD-16: BFF proxies Battle SignalR (single entry point)
  - AD-17: BFF does not reference internal service projects or Abstractions
  - AD-18: BFF interacts with Battle via SignalR only (no HTTP for business flows)

**Out of scope:** Any new decisions not already in the approved BFF spec.

**Dependencies:** None (can run in parallel with BFF-0B/0C)

**Files modified:**
- `docs/architecture/kombats-architecture-decisions.md`

**Tests required:** None (documentation only)

**Acceptance criteria:**
- [ ] AD-14 through AD-18 exist in `kombats-architecture-decisions.md`
- [ ] Each AD follows the established format
- [ ] Content matches the approved BFF spec (no drift)
- [ ] EI-044 can be marked resolved

---

### BFF-0 Gate Check

| Check | Criteria |
|---|---|
| Build | `dotnet build Kombats.sln` — 0 errors |
| Startup | BFF starts on port 5000, returns health status |
| Auth | Unauthenticated request to any `[Authorize]` route returns 401 |
| Health | `/health` probes 3 downstream services |
| Isolation | No references to backend service projects or `Kombats.Abstractions` |
| ADs | AD-14 through AD-18 recorded |
| No backend changes | No backend service code modified |

**Review focus:** Project structure correctness, auth configuration, no domain logic, AD formalization quality.

---

## Batch BFF-1: Pass-Through Endpoints

**Goal:** All single-service pass-through endpoints are functional with BFF-owned DTOs and error normalization.

### Ticket BFF-1A: Players Pass-Through Endpoints

**Type:** Foundation (new endpoints)
**Goal:** Implement BFF endpoints that forward to Players service.

**Scope:**
- In Api, create endpoints:
  - `POST /api/v1/game/onboard` → Players `POST /api/v1/me/ensure`
  - `POST /api/v1/character/name` → Players `POST /api/v1/character/name`
  - `POST /api/v1/character/stats` → Players `POST /api/v1/players/me/stats/allocate`
- BFF request DTOs in Api (frontend-facing):
  - `SetCharacterNameRequest { Name }`
  - `AllocateStatsRequest { Strength, Agility, Intuition, Vitality }`
- BFF response DTOs in Api (frontend-facing):
  - `CharacterResponse` — character data shaped for frontend
  - `OnboardResponse` — onboard result
- Each endpoint: extract request → call `IPlayersClient` → map response → return
- All endpoints `RequireAuthorization()`

**Out of scope:**
- Error normalization details (BFF-1C)
- Matchmaking endpoints (BFF-1B)
- Composed reads (BFF-2)

**Dependencies:** BFF-0B (typed HttpClients exist)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Game/OnboardEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Character/SetCharacterNameEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Character/AllocateStatsEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Models/Requests/SetCharacterNameRequest.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Models/Requests/AllocateStatsRequest.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Models/Responses/CharacterResponse.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Models/Responses/OnboardResponse.cs`

**Tests required:**
- Endpoint structure tests (implements `IEndpoint`, discoverable)
- Response DTO shape tests (correct properties)
- All endpoints require authorization (structural verification)

**Acceptance criteria:**
- [ ] 3 Players-facing endpoints exist and are mapped
- [ ] BFF-owned request/response DTOs defined (not internal service types)
- [ ] All endpoints `RequireAuthorization()`
- [ ] No domain logic in endpoints (thin: extract → call → map → return)
- [ ] Tests pass

---

### Ticket BFF-1B: Matchmaking Pass-Through Endpoints

**Type:** Foundation (new endpoints)
**Goal:** Implement BFF endpoints that forward to Matchmaking service.

**Scope:**
- In Api, create endpoints:
  - `POST /api/v1/queue/join` → Matchmaking `POST /api/v1/matchmaking/queue/join`
  - `POST /api/v1/queue/leave` → Matchmaking `POST /api/v1/matchmaking/queue/leave`
  - `GET /api/v1/queue/status` → Matchmaking `GET /api/v1/matchmaking/queue/status`
- BFF response DTOs:
  - `QueueStatusResponse` — queue/match status shaped for frontend (includes `BattleId` if matched)
- All endpoints `RequireAuthorization()`

**Out of scope:**
- Error normalization details (BFF-1C)
- Players endpoints (BFF-1A)

**Dependencies:** BFF-0B (typed HttpClients exist)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Queue/JoinQueueEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Queue/LeaveQueueEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Queue/GetQueueStatusEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Models/Responses/QueueStatusResponse.cs`

**Tests required:**
- Endpoint structure tests
- Response DTO shape tests
- All endpoints require authorization

**Acceptance criteria:**
- [ ] 3 Matchmaking-facing endpoints exist and are mapped
- [ ] BFF-owned response DTOs defined
- [ ] All endpoints `RequireAuthorization()`
- [ ] No domain logic in endpoints
- [ ] Tests pass

---

### Ticket BFF-1C: Error Normalization and Endpoint Tests

**Type:** Foundation
**Goal:** Implement consistent BFF error envelope and comprehensive endpoint tests.

**Scope:**
- In Application:
  - Error mapping logic: internal service HTTP error responses → BFF error codes
  - `BffErrorCode` constants (e.g., `character_not_found`, `character_not_ready`, `already_in_queue`, `not_in_queue`, `service_unavailable`)
  - Error deserialization from backend service responses
- In Api or Bootstrap:
  - Global exception handler / error middleware producing consistent envelope: `{ "error": { "code": "...", "message": "...", "details": {} } }`
- Create test projects:
  - `tests/Kombats.Bff/Kombats.Bff.Api.Tests/` — endpoint structure, DTO shapes, auth requirements
  - `tests/Kombats.Bff/Kombats.Bff.Application.Tests/` — error mapping unit tests, client behavior with stubbed HttpClient
- Add test projects to `Kombats.sln`

**Out of scope:**
- Per-endpoint functional integration testing (would require running backend services)
- FluentValidation (evaluate during implementation — BFF pass-through endpoints may not need it since backend validates)

**Dependencies:** BFF-1A, BFF-1B (endpoints exist to test)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Application/Errors/BffErrorCode.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Errors/ErrorMapper.cs`
- Error middleware or exception handler (location TBD during implementation)
- `tests/Kombats.Bff/Kombats.Bff.Api.Tests/Kombats.Bff.Api.Tests.csproj`
- `tests/Kombats.Bff/Kombats.Bff.Api.Tests/EndpointStructureTests.cs`
- `tests/Kombats.Bff/Kombats.Bff.Api.Tests/ResponseDtoTests.cs`
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/Kombats.Bff.Application.Tests.csproj`
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/ErrorMappingTests.cs`
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/PlayersClientTests.cs`
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/MatchmakingClientTests.cs`

**Files modified:**
- `Kombats.sln` — add test projects

**Tests required:**
- Error mapping unit tests: known backend errors → correct BFF error codes
- Error mapping: unknown error → generic BFF error code
- Error mapping: backend service unreachable → `service_unavailable`
- Endpoint structure: all endpoints implement `IEndpoint`, assembly scanning finds all
- DTO shape: response types have expected properties
- Auth: all non-health endpoints require authorization
- Client unit tests: PlayersClient and MatchmakingClient with stubbed `HttpMessageHandler` — verify correct backend URL called, JWT forwarded, response deserialized

**Acceptance criteria:**
- [ ] Consistent error envelope `{ "error": { "code", "message", "details" } }` on all error responses
- [ ] Error mapping covers all known backend error codes
- [ ] Unknown errors produce generic error code (not internal stack traces)
- [ ] Service unavailable produces 503 with `service_unavailable` code
- [ ] All endpoint structure tests pass
- [ ] All error mapping unit tests pass
- [ ] All client unit tests pass (stubbed HTTP)
- [ ] Test projects added to `Kombats.sln`

---

### BFF-1 Gate Check

| Check | Criteria |
|---|---|
| Endpoints | All 6 pass-through endpoints functional (3 Players + 3 Matchmaking) |
| Error normalization | Consistent error envelope on all error responses |
| Auth | JWT forwarded to internal services (verified via client tests) |
| No domain logic | BFF contains no stat calculations, readiness checks, or state machine logic |
| No contract leakage | No internal service types in BFF response DTOs |
| Tests | All BFF test projects pass |

**Review focus:** DTO design, error normalization completeness, no contract leakage, no domain logic.

---

## Batch BFF-2: Composed Read Endpoint

**Goal:** Cross-service composed game state endpoint works with partial failure handling.

### Ticket BFF-2A: Composed Game State Endpoint

**Type:** Foundation (new endpoint with composition logic)
**Goal:** Implement `GET /api/v1/game/state` that composes data from Players + Matchmaking.

**Scope:**
- In Api:
  - `GET /api/v1/game/state` endpoint — `RequireAuthorization()`
  - `GameStateResponse` DTO combining:
    - Character data from Players (name, level, XP, stats, unspent points, onboarding state, win/loss)
    - Queue/match status from Matchmaking (status, matchId, battleId, match state)
    - `isCharacterCreated: bool` — false if Players returns 404 (new user before onboarding)
  - **Does NOT include** live battle state (HP, turns, actions) — that is SignalR-only
- In Application:
  - `GameStateComposer` (or similar) — calls `IPlayersClient.GetCharacterAsync()` and `IMatchmakingClient.GetQueueStatusAsync()` in parallel
  - Graceful degradation:
    - If Players unavailable: return partial response with `character: null` and degradation indicator
    - If Matchmaking unavailable: return partial response with `queueStatus: null` and degradation indicator
    - If both unavailable: return 503
  - No domain logic — pure composition and mapping

**Out of scope:**
- Live battle state (SignalR-only, BFF-3 scope)
- Match history or battle replay (deferred per spec)
- Response caching (deferred per spec)

**Dependencies:** BFF-1 complete (clients tested and working)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Game/GetGameStateEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Models/Responses/GameStateResponse.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Composition/GameStateComposer.cs`

**Tests required:**
- Composition tests (stubbed HTTP clients):
  - Both services respond → full merged response
  - Players unavailable → partial response with degradation indicator
  - Matchmaking unavailable → partial response with degradation indicator
  - Both unavailable → 503
  - Parallel execution verified (calls should not be sequential)
- Response DTO shape test

**Acceptance criteria:**
- [ ] `GET /api/v1/game/state` returns composed response from Players + Matchmaking
- [ ] Calls to Players and Matchmaking execute in parallel
- [ ] Partial failure: one service down → partial response with indicator, not 500
- [ ] Both services down → 503
- [ ] No live battle state in response (BattleId only, if matched)
- [ ] No N+1 call patterns
- [ ] No domain logic in composition (no stat derivation, no readiness calculation)
- [ ] Composition tests pass

---

### BFF-2 Gate Check

| Check | Criteria |
|---|---|
| Composition | Composed endpoint returns merged data from 2 services |
| Partial failure | Graceful degradation verified |
| No N+1 | Exactly 2 parallel HTTP calls (1 Players + 1 Matchmaking) |
| No domain logic | Composition is pure mapping, no business rules |
| Tests | Composition tests with stubbed clients pass |

**Review focus:** Composition correctness, partial failure handling, no domain logic leakage.

---

## Batch BFF-3: SignalR Battle Realtime Proxy

**Goal:** Frontend can connect to BFF's SignalR hub and interact with Battle through it.

**This is the highest-complexity batch.** Isolated for risk management per the approved BFF spec. Explicit fallback trigger criteria defined in spec Section 8.

### Ticket BFF-3A: BattleHub Relay and Connection Lifecycle

**Type:** Foundation (new realtime infrastructure)
**Goal:** Implement bidirectional SignalR proxy between frontend and Battle service.

**Scope:**
- In Api (or Bootstrap — placement TBD during implementation):
  - `BattleHub` — BFF's frontend-facing SignalR hub with `[Authorize]`
  - Hub methods (frontend → BFF → Battle):
    - `JoinBattle(Guid battleId)` — creates SignalR client connection to Battle's `/battlehub`, forwards `JoinBattle`, returns `BattleSnapshotRealtime`
    - `SubmitTurnAction(Guid battleId, int turnIndex, string actionPayload)` — forwards to Battle hub
  - Server-to-client events (Battle → BFF → frontend):
    - `BattleReady`, `TurnOpened`, `TurnResolved`, `PlayerDamaged`, `BattleStateUpdated`, `BattleEnded`
    - BFF subscribes to these events on the Battle hub connection and relays to the frontend client
- In Application:
  - `IBattleHubRelay` interface — manages per-user/per-battle SignalR client connections to Battle
  - `BattleHubRelay` implementation:
    - Creates `HubConnection` to Battle's `/battlehub` per `JoinBattle` call
    - Forwards JWT for Battle-side auth
    - Subscribes to all server→client events and relays them
    - Disposes connection on `BattleEnded` or frontend disconnect
    - Handles connection errors (Battle connection drops → notify frontend)
- In Bootstrap:
  - Add `Microsoft.AspNetCore.SignalR.Client` package reference
  - Register `IBattleHubRelay`
  - Map `/battlehub` hub endpoint
  - Add `Microsoft.AspNetCore.SignalR.Client` to `Directory.Packages.props` if not already present
- Connection lifecycle:
  - On `JoinBattle`: create HubConnection → connect → call Battle's `JoinBattle` → subscribe to events → relay events to frontend
  - On `BattleEnded`: dispose HubConnection, clean up state
  - On frontend disconnect: dispose HubConnection if active
  - On BFF→Battle connection drop: send error event to frontend, attempt reconnect if battle still active

**Out of scope:**
- Multi-instance BFF / SignalR backplane (not v1 per spec)
- WebSocket fallback (SignalR handles transport negotiation)
- BFF-level telemetry on SignalR traffic

**Dependencies:** BFF-2 complete (all HTTP endpoints working; SignalR is the final piece)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Api/Hubs/BattleHub.cs` (or in Bootstrap if Hub needs DI context)
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/IBattleHubRelay.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/BattleHubRelay.cs`

**Files modified:**
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs` — add SignalR services, map hub, register relay
- `Directory.Packages.props` — add `Microsoft.AspNetCore.SignalR.Client` if needed

**Tests required:**
- Hub auth enforcement: unauthenticated connection rejected
- Message relay correctness (unit tests with mocked/stubbed SignalR):
  - `JoinBattle` → creates Battle connection, forwards call, returns snapshot
  - `SubmitTurnAction` → forwards to Battle connection
  - Battle server event → relayed to frontend client
- Connection cleanup: on `BattleEnded`, HubConnection disposed
- Connection cleanup: on frontend disconnect, HubConnection disposed
- Error handling: Battle connection drops → frontend receives error notification

**Acceptance criteria:**
- [ ] Frontend can connect to BFF `/battlehub` with JWT auth
- [ ] `JoinBattle` creates downstream connection to Battle hub and returns battle snapshot
- [ ] `SubmitTurnAction` forwarded to Battle hub
- [ ] All 6 server→client events relayed: `BattleReady`, `TurnOpened`, `TurnResolved`, `PlayerDamaged`, `BattleStateUpdated`, `BattleEnded`
- [ ] Auth enforced on both hops (BFF validates frontend JWT; Battle validates forwarded JWT)
- [ ] Connection disposed on battle end and frontend disconnect
- [ ] Battle connection drop produces error notification to frontend
- [ ] No domain logic in relay (no event filtering, transformation, or buffering)
- [ ] Hub relay tests pass

**Risks:**
- Connection lifecycle management is the primary complexity risk. Per the approved spec Section 8, if this exceeds ~2 person-days beyond the hub relay, the fallback trigger is activated.
- Per-user connection state in a stateless BFF is inherently in-memory — BFF restart loses all active battle connections.

---

### BFF-3 Gate Check

| Check | Criteria |
|---|---|
| Hub auth | JWT required for BFF hub connection |
| Relay | Frontend → BFF → Battle → BFF → frontend bidirectional relay works |
| Events | All 6 server→client events relayed correctly |
| Auth both hops | BFF validates JWT; forwarded JWT accepted by Battle |
| Cleanup | Connection disposed on battle end and frontend disconnect |
| Error | Battle connection drop → frontend error notification |
| No domain logic | Relay is transparent passthrough |
| Tests | Hub auth, relay correctness, cleanup tests pass |

**Review focus:** SignalR proxy architecture, connection lifecycle, auth on both hops. This is the gate where the fallback decision (direct frontend→Battle connection) is evaluated if fallback triggers were hit during implementation.

**Fallback decision point:** If any of the 3 fallback triggers from spec Section 8 were activated during implementation, the implementer documents the finding and the reviewer evaluates whether to proceed with the proxy or switch to direct frontend→Battle connection with BFF-assisted discovery. This requires explicit reviewer approval and topology change documentation.

---

## Batch BFF-4: Integration Verification and Cutover Readiness

**Goal:** Full gameplay loop verified through BFF. Docker and documentation updated. BFF v1 complete.

### Ticket BFF-4A: Integration Verification, Docker, and Documentation

**Type:** Integration verification + cutover
**Goal:** Verify end-to-end gameplay through BFF. Prepare for frontend consumption.

**Scope:**
- Integration verification:
  - Full gameplay loop through BFF: onboard → get game state → join queue → (match created) → get game state (shows battleId) → join battle via hub → receive battle events → battle ends → get game state (shows completion)
  - NOTE: Full integration test requires running all 4 services. Test may be structured as a documented manual verification procedure or a Testcontainers-based integration test if feasible.
- Docker:
  - Create `src/Kombats.Bff/Kombats.Bff.Bootstrap/Dockerfile` (multi-stage build, same pattern as other services)
  - Update `docker-compose.yml` with BFF service entry (port 5000, depends_on Players/Matchmaking/Battle)
- Documentation:
  - Update `docs/architecture/kombats-bff-architecture.md` status to "Implemented"
  - Update `docs/execution/execution-log.md` with BFF batch entries
  - Update `docs/execution/execution-issues.md` — close resolved issues, add any new ones

**Out of scope:**
- Frontend implementation
- Performance testing (Phase 7B)
- Rate limiting (deferred per spec)
- BFF-level telemetry (Phase 7B)

**Dependencies:** BFF-3 complete (all BFF functionality implemented)

**Files created:**
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Dockerfile`

**Files modified:**
- `docker-compose.yml` — add BFF service
- `docs/architecture/kombats-bff-architecture.md` — update status
- `docs/execution/execution-log.md` — batch entries
- `docs/execution/execution-issues.md` — issue updates

**Tests required:**
- Dockerfile builds successfully
- `docker compose config --quiet` passes
- All existing tests still pass (no regressions)
- BFF-specific tests: all pass
- Integration: gameplay loop through BFF verified (manual or automated)

**Acceptance criteria:**
- [ ] Full gameplay loop verified through BFF (onboard → queue → match → battle → completion)
- [ ] BFF Dockerfile builds and runs
- [ ] `docker-compose.yml` includes BFF service on port 5000
- [ ] `docker compose config` passes
- [ ] All BFF tests pass
- [ ] All existing tests pass (no regressions)
- [ ] No direct frontend-to-internal-service paths as intended architecture
- [ ] BFF is the single entry point for frontend traffic
- [ ] Documentation updated

---

### BFF-4 Gate Check (BFF v1 Definition of Done)

| # | Gate | Criteria |
|---|---|---|
| 1 | Pass-through endpoints | All 6 endpoints functional with BFF-owned DTOs |
| 2 | Composed read | Game state endpoint returns merged data from Players + Matchmaking |
| 3 | SignalR proxy | Battle events relayed bidirectionally through BFF |
| 4 | Auth | JWT enforced on all BFF endpoints and SignalR hub |
| 5 | Error normalization | Consistent error envelope on all error responses |
| 6 | Tests | All BFF tests pass (endpoint, composition, error mapping, hub auth, relay) |
| 7 | Integration | Full gameplay loop verified through BFF |
| 8 | Docker | BFF Dockerfile builds, docker-compose includes BFF |
| 9 | No domain logic | Reviewer verified: no domain logic in BFF |
| 10 | No contract refs | Reviewer verified: no Contract project references from BFF |
| 11 | Documentation | Architecture doc, execution log, issues updated |

**Review focus:** End-to-end correctness, no architectural violations, documentation completeness.

---

## Implementation Order Summary

| Order | Ticket | Type | Can Parallel With |
|---|---|---|---|
| 1 | BFF-0A | Foundation (projects) | — |
| 2 | BFF-0B | Foundation (clients) | BFF-0C, BFF-0D |
| 2 | BFF-0C | Foundation (health) | BFF-0B, BFF-0D |
| 2 | BFF-0D | Documentation (ADs) | BFF-0B, BFF-0C |
| 3 | BFF-1A | Endpoints (Players) | BFF-1B |
| 3 | BFF-1B | Endpoints (Matchmaking) | BFF-1A |
| 4 | BFF-1C | Error + tests | — |
| 5 | BFF-2A | Composition | — |
| 6 | BFF-3A | SignalR relay | — |
| 7 | BFF-4A | Integration + docker | — |

**Critical path:** BFF-0A → BFF-0B → BFF-1A/1B → BFF-1C → BFF-2A → BFF-3A → BFF-4A

**Estimated ticket count:** 10 tickets (not counting BFF-0D which is documentation-only)

---

## New Packages Required

| Package | Purpose | Approval Status |
|---|---|---|
| `Microsoft.AspNetCore.SignalR.Client` | SignalR client for BFF→Battle hub relay | Standard ASP.NET Core package — no approval concern |
| `Microsoft.Extensions.Http.Resilience` | HTTP retry/circuit-breaker for typed clients (evaluate in BFF-0B) | Evaluate during implementation — may use built-in retry instead |

No new infrastructure dependencies (no PostgreSQL, no Redis, no RabbitMQ for BFF).

---

## Test Project Structure

```
tests/
├── Kombats.Bff/
│   ├── Kombats.Bff.Api.Tests/          # Endpoint structure, DTO shapes, auth
│   └── Kombats.Bff.Application.Tests/  # Error mapping, client behavior, composition, relay
```

No infrastructure test project needed (BFF has no database, no Redis, no messaging).

---

## Documentation Impact

Files that must be updated as the BFF stream executes:

| File | When | What |
|---|---|---|
| `docs/execution/execution-log.md` | Each batch | Batch execution entry |
| `docs/execution/execution-issues.md` | As discovered | New issues, resolved issues |
| `docs/architecture/kombats-architecture-decisions.md` | BFF-0D | AD-14 through AD-18 |
| `docs/architecture/kombats-bff-architecture.md` | BFF-4A | Status → Implemented |
| `docker-compose.yml` | BFF-4A | Add BFF service |
| `Kombats.sln` | BFF-0A, BFF-1C | Add BFF projects and test projects |
| `.claude/docs/implementation-bootstrap/implementation-plan.md` | BFF-0A | BFF stream explicitly represented |

---

## Risks and Open Ambiguities

### Active Risks

| Risk | Severity | Ticket | Mitigation |
|---|---|---|---|
| SignalR proxy connection lifecycle complexity | High | BFF-3A | Explicit fallback trigger criteria; BFF-3 isolated as separate batch; reviewer gate before BFF-4 |
| Backend API response shapes may not match BFF needs | Medium | BFF-1A/1B | EI-043 documents this. If backend responses lack needed fields, minimal backend changes may be required. Surface gaps early in BFF-1. |
| BFF error mapping may miss edge cases | Low | BFF-1C | Test all known backend error codes. Unknown errors → generic code. Iterate during BFF-1. |
| Per-user in-memory SignalR connections lost on BFF restart | Medium | BFF-3A | Acceptable for v1 single-instance BFF. Frontend must handle reconnection. Document in BFF API contract. |

### Resolved Ambiguities

| Question | Resolution |
|---|---|
| Should BFF reference `Kombats.Abstractions`? | No — closed in BFF spec review (EI-040 context) |
| Should BFF have its own Contract project? | No for v1 — DTOs live in Api project |
| BFF→Battle communication model? | SignalR-only for business flows; HTTP only for health |
| Auth propagation model? | JWT forwarding (AD-15) |

### Open Questions (Non-Blocking)

| Question | Resolution Timeline | Impact |
|---|---|---|
| Does `GET /api/v1/me` return all fields needed for `GameStateResponse`? | BFF-1A implementation | May need minor Players API adjustment |
| Does `GET /api/v1/matchmaking/queue/status` include `BattleId`? | BFF-1B implementation | May need minor Matchmaking API adjustment |
| Should BFF validate request bodies or rely on backend validation? | BFF-1A/1B implementation | Preference: minimal BFF validation (required fields only), full validation in backend |
| HTTP resilience strategy: Polly vs built-in retry? | BFF-0B implementation | Low impact either way |

---

## Reviewer Handoff

### Review Order
1. **This document first** (`docs/tickets/bff-execution-plan.md`) — verify batch/ticket decomposition is execution-ready
2. **Cross-reference with approved spec** (`docs/architecture/kombats-bff-architecture.md`) — verify no scope drift
3. **Check execution state docs** (`docs/execution/execution-log.md`, `execution-issues.md`) — verify state is consistent

### Key Review Questions
1. Is the ticket granularity correct? (Too large? Too small? Right seams?)
2. Are the gate checks sufficient to catch problems before the next batch?
3. Is BFF-3A (SignalR) correctly scoped — should it be split into sub-tickets (hub creation vs. connection lifecycle vs. event relay)?
4. Are the test requirements realistic and sufficient?
5. Is the parallel execution plan correct (BFF-1A || BFF-1B, BFF-0B || BFF-0C || BFF-0D)?
6. Are there backend API gaps (EI-043) that should be surfaced as blocking prerequisites?

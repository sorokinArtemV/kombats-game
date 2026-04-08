# Kombats BFF Architecture and Execution Plan

**Status:** Implemented (BFF v1) — execution plan at `docs/tickets/bff-execution-plan.md`
**Date:** 2026-04-08
**Preconditions:** Phases 0–6 complete. Phase 7A (backend hardening) in scope. All three backend services replaced with target architecture.

---

## 1. Architecture Position

### Why BFF Exists

The Kombats backend consists of three independent services — Players, Matchmaking, Battle — each with its own API surface, contracts, and domain language. A frontend client integrating directly against these internal APIs would face:

1. **Multi-service orchestration in the client.** The gameplay loop (onboard → queue → match → battle → progression) spans all three services. Without a BFF, the frontend must orchestrate cross-service workflows, manage partial failures, and sequence calls across service boundaries.

2. **Unstable UI-facing contracts.** Internal service APIs are optimized for their bounded contexts, not for frontend consumption. Exposing them directly couples the UI to internal contract evolution. When internal APIs change (additive fields, restructured responses), the frontend breaks.

3. **Duplicated read composition.** Common UI views (e.g., "my current state" — character + queue/match status) require data from multiple services. Without a BFF, this composition happens in every frontend client, duplicating logic and creating consistency issues.

4. **Auth boundary diffusion.** Each service independently validates JWT tokens today (AD-03). A BFF provides a single auth edge for the frontend, simplifying token management and enabling session-level conveniences (e.g., "current user" context) without distributing that logic across services.

5. **Realtime routing complexity.** Battle uses SignalR for real-time combat. A frontend connecting directly to Battle's SignalR hub must discover the hub URL, manage a separate connection, and handle auth independently. The BFF can mediate or proxy this connection.

### Why BFF Before Frontend

The implementation plan (Phase Dependencies) explicitly establishes: **Phase 7A → BFF → Frontend → Phase 7B**.

Frontend must not precede BFF because:
- BFF defines the product-facing contract surface — building frontend against internal APIs creates rework when BFF is introduced
- Orchestration logic belongs in BFF, not in the frontend
- The BFF stabilizes contracts so the frontend builds against a durable surface
- Internal service API shapes are not designed for direct frontend consumption

### Why This BFF Shape

Kombats is a monorepo with three co-deployed services. The BFF does not need to be a general-purpose API gateway or a GraphQL federation layer. It needs to:

- Compose reads across services for frontend views
- Orchestrate multi-service write flows where the frontend needs a single call
- Adapt internal contracts into frontend-stable contracts
- Provide a single auth edge and session context
- Handle or proxy the realtime (SignalR) connection

A **thin orchestration/composition BFF** — a single ASP.NET Core service that calls Players and Matchmaking over HTTP, and relays Battle realtime traffic over SignalR — is the right fit. It is simple, testable, and consistent with the existing technology stack.

---

## 2. BFF Role

The BFF is:

| Role | Description |
|---|---|
| **Read compositor** | Aggregates data from multiple services into frontend-shaped responses |
| **Write orchestrator** | Sequences multi-step cross-service operations into single frontend calls where needed |
| **Contract adapter** | Translates internal service DTOs/contracts into stable, frontend-facing DTOs |
| **Auth edge** | Single point of JWT validation for the frontend; propagates identity to internal services |
| **Error normalizer** | Translates internal error shapes into a consistent frontend error contract |
| **Realtime mediator** | Proxies or relays Battle's SignalR connection to the frontend (see Section 8) |

The BFF is NOT:

| Anti-role | Why |
|---|---|
| Domain authority | Business logic stays in Players / Matchmaking / Battle |
| State owner | BFF does not own durable state (no database, no Redis) |
| Event consumer | BFF does not consume RabbitMQ messages — it calls service APIs |
| Replacement for backend services | BFF adds a layer above; it does not absorb service responsibilities |
| Generic API gateway | BFF is purpose-built for the Kombats frontend, not a routing proxy |

---

## 3. BFF Boundary

### What Belongs in BFF

| Concern | Example |
|---|---|
| Cross-service read composition | "Get my game state" → Players character + Matchmaking queue status |
| Frontend-shaped response DTOs | `GameStateResponse` combining data from multiple services |
| Multi-step frontend flows | "Start playing" → ensure character + check readiness + join queue |
| Error normalization | Map internal `Result<T>` errors to `{ code, message }` for frontend |
| Auth token validation | JWT Bearer validation at BFF edge |
| Identity extraction and propagation | Extract `IdentityId` from JWT, pass to internal services via headers or tokens |
| Request validation | Validate frontend request shape before forwarding |
| Rate limiting (future) | Protect internal services from frontend abuse |

### What Must Stay in Backend Services

| Concern | Owner | Why |
|---|---|---|
| Character lifecycle and stat rules | Players | Domain authority — BFF must not compute stat allocation, readiness, or progression |
| Queue management and pairing | Matchmaking | Domain authority — BFF calls "join queue", does not manage queue internals |
| Combat execution and resolution | Battle | Domain authority — BFF never touches combat logic |
| Event publication (outbox) | Each service | Infrastructure concern — BFF does not publish to RabbitMQ |
| State machine transitions | Each service | Domain invariants — BFF does not enforce CAS or state guards |
| Cross-service event consumers | Each service's Infrastructure | Messaging is service-internal infrastructure |

### BFF State Position

**Decision: BFF owns no durable state.**

- No PostgreSQL schema for BFF
- No Redis database for BFF
- BFF is stateless — every request is fulfilled by calling internal service APIs
- If a composed read requires data from two services, BFF makes two HTTP calls and merges the results

**Justification:** Introducing state in the BFF creates a fourth bounded context with its own consistency concerns, projections, and event subscriptions. The three backend services already own all authoritative state. BFF reads are always fresh from the source.

**Exception:** Short-lived in-memory caching (e.g., caching a player's character profile for the duration of a single composed request) is acceptable. No persistent cache, no Redis, no database.

---

## 4. BFF v1 Scope

### In Scope

| Flow | BFF Operation | Internal Calls |
|---|---|---|
| **Get game state** | Compose character + queue/match status into single response (see detail below) | Players: GET character; Matchmaking: GET queue status |
| **Onboard / ensure character** | Pass-through with response adaptation | Players: POST ensure character |
| **Set character name** | Pass-through with response adaptation | Players: POST set name |
| **Allocate stats** | Pass-through with response adaptation | Players: POST allocate stats |
| **Join queue** | Pass-through with response adaptation | Matchmaking: POST join queue |
| **Leave queue** | Pass-through with response adaptation | Matchmaking: POST leave queue |
| **Get queue status** | Pass-through with response adaptation | Matchmaking: GET queue status |
| **Battle realtime** | Proxy/relay SignalR connection to Battle hub | Battle: SignalR `/battlehub` |
| **Health check** | Aggregate health from all downstream services | Players, Matchmaking, Battle: GET /health |
| **Auth edge** | Validate JWT, extract identity, propagate | Keycloak JWT validation |
| **Error normalization** | Consistent error envelope for all responses | All services |

#### Detail: `/api/v1/game/state` Composition

This endpoint returns the user's current non-realtime state by composing data from Players and Matchmaking:

| Field Group | Source | Data |
|---|---|---|
| Character | Players `GET /api/v1/me` | Name, level, XP, stats (Str/Agi/Int/Vit), unspent points, onboarding state, win/loss record |
| Queue / Match | Matchmaking `GET /api/v1/matchmaking/queue/status` | Status (searching / matched / idle), MatchId, BattleId, match state |

**What this endpoint does NOT return:**
- **Live battle state** (HP, current turn, actions, turn results). Live battle state is delivered exclusively through the SignalR connection (`/battlehub`). The REST endpoint does not call Battle for gameplay data.
- **Battle history or completed battle details.** Deferred to a later BFF phase.

The `BattleId` field in the Matchmaking queue status response tells the frontend *that* a battle exists and provides the ID needed to connect to the SignalR hub. It does not provide battle state.

### Out of Scope (Not BFF Responsibility)

| Item | Why |
|---|---|
| Admin/management APIs | Not a v1 frontend need |
| Leaderboards or rankings | Not yet a product feature; would require new backend work |
| Chat or social features | Not part of Kombats v1 |
| Push notifications | Not part of Kombats v1 |
| Frontend static asset serving | Separate concern (CDN or frontend host) |

### Deferred to Later BFF Phases

| Item | Why Deferred |
|---|---|
| Match history / battle replay | Requires new backend query endpoints (Battle completed records) |
| Player profile (public view) | Requires new Players endpoint for viewing other players |
| Matchmaking ETA or queue depth | Requires new Matchmaking query endpoint |
| Rate limiting | Important for production but not v1 correctness |
| Response caching | Optimize after the contract surface is stable |
| WebSocket fallback transport | SignalR handles transport negotiation; explicit fallback is optimization |
| BFF-level telemetry/tracing | Follows Phase 7A patterns once established |

---

## 5. Target Architecture

### Project Structure

```
src/
├── Kombats.Bff/
│   ├── Kombats.Bff.Bootstrap/          # Composition root (Microsoft.NET.Sdk.Web)
│   │   ├── Program.cs
│   │   ├── appsettings.json
│   │   ├── appsettings.Development.json
│   │   └── Dockerfile
│   ├── Kombats.Bff.Api/                # Minimal API endpoints, request/response DTOs (Microsoft.NET.Sdk)
│   └── Kombats.Bff.Application/        # Service clients, composition logic, response mapping (Microsoft.NET.Sdk)
```

### Why No Domain or Infrastructure Projects

The BFF has no domain logic and no direct infrastructure dependencies (no database, no Redis, no RabbitMQ). The three-project structure covers:

- **Bootstrap**: Composition root, DI, middleware, endpoint mapping. `Microsoft.NET.Sdk.Web`.
- **Api**: Minimal API endpoint definitions, frontend-facing request/response DTOs. `Microsoft.NET.Sdk`.
- **Application**: Internal service client interfaces and implementations (typed `HttpClient` for Players/Matchmaking, SignalR client relay for Battle), response composition logic, error mapping.

**Pragmatic deviation acknowledged:** In the backend services, Application defines port interfaces and Infrastructure implements them. In the BFF, Application contains both the interfaces and their HttpClient/SignalR implementations directly. This is a deliberate simplification for a stateless BFF that has no infrastructure layer (no database, no Redis, no message bus). The "port + adapter" split provides no benefit when there is exactly one adapter per interface and no testability concern that fakes don't already solve. If the BFF later gains infrastructure dependencies, an Infrastructure project can be introduced following the backend service pattern.

If the BFF later needs infrastructure (unlikely per the "no state" decision), an Infrastructure project can be added following the same pattern as backend services.

### Runtime Shape

```
Frontend
    |
    v
Kombats.Bff.Bootstrap (port 5000)
    |
    ├── HTTP ──→ Players:5001      (character reads + writes)
    ├── HTTP ──→ Matchmaking:5002  (queue reads + writes)
    ├── HTTP ──→ Battle:5003       (health check only)
    ├── SignalR → Battle:5003      (realtime battle — /battlehub)
    |
    (no RabbitMQ, no Postgres, no Redis)
```

The BFF is a standalone ASP.NET Core service. It communicates with Players and Matchmaking over HTTP. Battle interaction is **SignalR-only** for all business flows (join battle, submit action, receive turn events). The only HTTP call to Battle is the health check for readiness aggregation. The BFF does not participate in the messaging topology.

### Integration Pattern: Typed HttpClients + SignalR Client

The BFF calls Players and Matchmaking using typed `HttpClient` instances registered via `IHttpClientFactory`. Battle is accessed via SignalR client (`HubConnection`) for all business flows; the only HTTP call to Battle is the health check.

```
Application layer defines:
  IPlayersClient      — typed HttpClient for Players API
  IMatchmakingClient  — typed HttpClient for Matchmaking API
  IBattleHubRelay     — SignalR client relay for Battle /battlehub (BFF-3 scope)
```

There is no `IBattleClient` HTTP client for business flows. Battle exposes no HTTP endpoints for gameplay — all battle interaction (join, submit action, receive events) goes through SignalR. The BFF health endpoint calls Battle's `/health` directly via a plain `HttpClient` (no typed client needed for a single health probe).

```
Bootstrap registers:
  services.AddHttpClient<IPlayersClient, PlayersClient>(...)
  services.AddHttpClient<IMatchmakingClient, MatchmakingClient>(...)
  // IBattleHubRelay registered in BFF-3 (SignalR client lifecycle)
```

Base URLs are configured in `appsettings.json`:
```json
{
  "Services": {
    "Players": { "BaseUrl": "http://localhost:5001" },
    "Matchmaking": { "BaseUrl": "http://localhost:5002" },
    "Battle": { "BaseUrl": "http://localhost:5003" }
  }
}
```

`Services:Battle:BaseUrl` is used for health check probing and for constructing the SignalR hub connection URL (`{BaseUrl}/battlehub`).

### Dependency References

```
Kombats.Bff.Bootstrap → Kombats.Bff.Api, Kombats.Bff.Application
Kombats.Bff.Api → Kombats.Bff.Application
Kombats.Bff.Application → (no service project references — uses HTTP clients)
```

The BFF does NOT reference any backend service project (not Api, not Application, not Domain, not Infrastructure). Communication is strictly over HTTP. This maintains service isolation.

The BFF MAY reference Contract projects (`Kombats.Players.Contracts`, etc.) **only** if internal service HTTP responses reuse contract types as DTOs. However, the preferred pattern is for the BFF to define its own response types and map from internal service responses. This decouples BFF contracts from internal contract evolution.

**Decision: BFF defines its own DTOs. No direct Contract project references in v1.** Internal service responses are deserialized into BFF-local types. This provides a translation layer that absorbs internal contract changes.

**Decision: BFF does not reference `Kombats.Abstractions` in v1.** The `Result<T>`, `Error`, and handler interfaces in Abstractions are backend-service internals. BFF defines its own error types and response patterns appropriate for a frontend-facing HTTP layer.

---

## 6. API / Contract Strategy

### Frontend-Facing API Shape

The BFF exposes a frontend-optimized REST API. Routes are organized by user intent, not by backend service:

| Route | Method | Purpose | Internal Services |
|---|---|---|---|
| `/api/v1/game/state` | GET | Composed game state — character + queue/match status; no live battle state (see Section 4 detail) | Players, Matchmaking |
| `/api/v1/game/onboard` | POST | Ensure character exists | Players |
| `/api/v1/character/name` | POST | Set character name | Players |
| `/api/v1/character/stats` | POST | Allocate stat points | Players |
| `/api/v1/queue/join` | POST | Join matchmaking queue | Matchmaking |
| `/api/v1/queue/leave` | POST | Leave matchmaking queue | Matchmaking |
| `/api/v1/queue/status` | GET | Current queue/match status | Matchmaking |
| `/battlehub` | SignalR | Battle realtime — join, submit actions, receive turn events | Battle (proxied/relayed) |
| `/health` | GET | Aggregated health | Players, Matchmaking, Battle |

### Error Contract

All BFF responses use a consistent error envelope:

```json
{
  "error": {
    "code": "character_not_ready",
    "message": "Character must complete onboarding before joining the queue.",
    "details": {}
  }
}
```

Error codes are BFF-defined strings, not internal service error types. The BFF maps internal error responses to frontend-stable error codes.

### DTO Ownership

- **Frontend request DTOs** are defined in `Kombats.Bff.Api`
- **Frontend response DTOs** are defined in `Kombats.Bff.Api`
- **Internal service response types** are defined in `Kombats.Bff.Application` (deserialization targets)
- Internal service contracts are NOT directly exposed to the frontend

### BFF-to-Backend Endpoint Mapping

Every BFF endpoint and the exact backend endpoint(s) it depends on:

| BFF Endpoint | Method | Backend Service | Backend Endpoint | Protocol |
|---|---|---|---|---|
| `/api/v1/game/state` | GET | Players | `GET /api/v1/me` | HTTP |
| `/api/v1/game/state` | GET | Matchmaking | `GET /api/v1/matchmaking/queue/status` | HTTP |
| `/api/v1/game/onboard` | POST | Players | `POST /api/v1/me/ensure` | HTTP |
| `/api/v1/character/name` | POST | Players | `POST /api/v1/character/name` | HTTP |
| `/api/v1/character/stats` | POST | Players | `POST /api/v1/players/me/stats/allocate` | HTTP |
| `/api/v1/queue/join` | POST | Matchmaking | `POST /api/v1/matchmaking/queue/join` | HTTP |
| `/api/v1/queue/leave` | POST | Matchmaking | `POST /api/v1/matchmaking/queue/leave` | HTTP |
| `/api/v1/queue/status` | GET | Matchmaking | `GET /api/v1/matchmaking/queue/status` | HTTP |
| `/battlehub` (JoinBattle) | SignalR | Battle | `/battlehub` → `JoinBattle(battleId)` | SignalR |
| `/battlehub` (SubmitTurnAction) | SignalR | Battle | `/battlehub` → `SubmitTurnAction(battleId, turnIndex, actionPayload)` | SignalR |
| `/battlehub` (server→client events) | SignalR | Battle | `/battlehub` → `BattleReady`, `TurnOpened`, `TurnResolved`, `PlayerDamaged`, `BattleStateUpdated`, `BattleEnded` | SignalR |
| `/battlehub` (`BattleConnectionLost`) | SignalR | **BFF-originated** | Not from Battle — synthetic event emitted by BFF when the BFF→Battle downstream connection is lost | SignalR |
| `/health` | GET | Players | `GET /health` | HTTP |
| `/health` | GET | Matchmaking | `GET /health` | HTTP |
| `/health` | GET | Battle | `GET /health` | HTTP |

This table is the authoritative mapping. If a backend endpoint path changes, the corresponding BFF client must be updated.

### Contract Evolution

BFF contracts evolve independently of internal service contracts:
- Internal services may add fields to their responses → BFF ignores new fields unless they serve a frontend need
- BFF may reshape responses for frontend convenience without touching internal services
- Breaking BFF contract changes require frontend coordination (not internal service changes)

---

## 7. Auth Edge

### Decision: BFF is the Primary Auth Edge for Frontend

```
Frontend → [JWT] → BFF → [service-to-service trust] → Backend Services
```

- **BFF validates JWT tokens** from Keycloak (same mechanism as backend services today)
- **BFF extracts IdentityId** from JWT claims
- **BFF propagates identity** to backend services via a trusted header (e.g., `X-Identity-Id`) or by forwarding the JWT token

### Auth Propagation Options

| Option | Mechanism | Trade-offs |
|---|---|---|
| **A: Forward JWT** | BFF passes the original JWT in `Authorization` header to internal services | Simple. Internal services continue to validate JWT. Double validation adds latency but maintains defense-in-depth (AD-03). |
| **B: Trusted header** | BFF extracts IdentityId, passes via `X-Identity-Id` header. Internal services trust BFF. | Less latency. Requires network-level trust (internal services not exposed externally). Weakens defense-in-depth. |

**Decision: Option A — Forward JWT.**

Rationale:
- AD-03 explicitly states "BFF-only auth (backend services trust all requests)" was rejected because "if the BFF is bypassed or misconfigured, all backend services are unprotected."
- Defense-in-depth is a documented architectural decision. Internal services continue to validate JWT.
- The double validation cost is negligible (JWT validation is a local operation — no Keycloak round-trip).
- Internal services already have JWT validation configured and tested. Removing it would require re-testing auth on all services.

### Authorization Responsibilities

| Layer | Responsibility |
|---|---|
| BFF | Authenticate the user (JWT validation). Extract identity. Route to correct internal service. |
| Backend services | Authenticate again (defense-in-depth). Authorize domain operations (e.g., "this user owns this character"). |

The BFF does NOT make authorization decisions about domain operations. It does not check "is this user allowed to allocate stats?" — that remains in Players.

---

## 8. Realtime Position

### Decision: BFF Proxies the Battle SignalR Connection

The frontend connects to the BFF's SignalR hub. The BFF relays messages between the frontend and Battle's `/battlehub`.

```
Frontend ←[SignalR]→ BFF BattleHub ←[SignalR client]→ Battle BattleHub
```

### Why Proxy Instead of Direct Connection

| Factor | Direct (frontend → Battle) | Proxy (frontend → BFF → Battle) |
|---|---|---|
| Frontend complexity | Must discover Battle URL, manage separate connection | Single BFF URL for everything |
| Auth | Must authenticate separately with Battle | Single auth edge at BFF |
| Contract stability | Frontend coupled to Battle's SignalR contract | BFF can adapt/translate |
| Network topology | Battle must be externally accessible | Only BFF is externally accessible |
| Latency | Lower (one hop) | Higher (two hops) |

**Decision: Proxy via BFF.**

The latency cost of the extra hop is acceptable for a turn-based game (turns are 30 seconds; sub-millisecond relay overhead is negligible). The simplification for the frontend and the security benefits of not exposing Battle externally outweigh the latency cost.

### Implementation Approach

- BFF defines its own `BattleHub` (Minimal SignalR hub in Api or Bootstrap)
- BFF uses `Microsoft.AspNetCore.SignalR.Client` to connect to Battle's `/battlehub` as a client
- BFF relays messages bidirectionally:
  - Frontend → BFF: `JoinBattle`, `SubmitTurnAction` → forwarded to Battle hub
  - Battle → BFF: `TurnOpened`, `TurnResolved`, `BattleEnded`, etc. → forwarded to frontend
- BFF authenticates the frontend connection; Battle authenticates the BFF connection (JWT forwarding)

### Risks

- **Connection lifecycle management**: BFF must manage SignalR client connections to Battle per-user/per-battle. If the BFF restarts, connections are lost and must be re-established.
- **Scaling**: If BFF has multiple instances, SignalR backplane (Redis) is needed for the frontend-facing hub. Battle's hub is already single-instance. This adds complexity.
- **Latency**: Extra hop adds ~1-2ms per message. Acceptable for 30-second turns.

### Fallback: Direct Connection with BFF-Assisted Discovery

The default architecture is BFF-proxied SignalR. However, if BFF-3 implementation reveals that the proxy is not viable for v1, the fallback is **direct frontend → Battle connection with BFF-assisted discovery/bootstrap**.

**Fallback trigger criteria** — switch to direct connection if ANY of:

1. **Connection lifecycle management is intractable in v1 scope.** If managing per-user SignalR client connections in the BFF (creation, reconnection after BFF restart, cleanup on battle end) requires more than ~2 person-days of implementation beyond the hub relay itself, the complexity exceeds v1 budget.
2. **Multi-instance BFF is required before v1 ships.** The proxy requires a SignalR backplane (Redis) for multi-instance BFF. If horizontal BFF scaling is a v1 requirement (not expected, but possible), the proxy adds a Redis dependency that contradicts the "no infrastructure" BFF stance.
3. **Message ordering or delivery guarantees degrade.** If testing reveals that the proxy introduces message reordering or loss that is not present in a direct connection, and the fix is non-trivial.

**Fallback shape:**
- BFF exposes a `GET /api/v1/battle/connect` endpoint that returns `{ hubUrl: "wss://battle:5003/battlehub", token: "<forwarded-jwt>" }`
- Frontend connects directly to Battle's SignalR hub using the provided URL and token
- Battle must be network-accessible to the frontend (changes deployment topology)
- BFF is no longer the single entry point for realtime traffic

**Decision authority:** The implementer evaluates during BFF-3. If a fallback trigger is hit, the implementer documents the finding and requests reviewer confirmation before switching. The reviewer must approve the topology change (Battle externally accessible).

### BFF-Originated Synthetic Events

The BFF relay emits one synthetic event that is **not** a native Battle service event:

| Event | Origin | Payload | When |
|---|---|---|---|
| `BattleConnectionLost` | BFF relay | `{ Reason: string }` | The BFF→Battle downstream SignalR connection was lost (network failure, Battle restart, etc.) |

**Frontend handling:** `BattleConnectionLost` is a hard failure signal. The frontend must treat it as an indication that battle events are no longer being relayed. To resume, the frontend should call `JoinBattle` again, which creates a fresh downstream connection. If the battle has already ended, `JoinBattle` will return an error.

This event exists because the BFF does **not** use automatic reconnection on the downstream connection. After a transport-level reconnect, the downstream `HubConnection` would get a new connection ID and would no longer be in the Battle group — events would be silently dropped. Instead, any downstream connection loss is treated as a hard failure: the `Closed` handler fires, `BattleConnectionLost` is sent to the frontend, and the downstream connection is not retried. The frontend is responsible for re-joining.

The 6 native Battle events (`BattleReady`, `TurnOpened`, `TurnResolved`, `PlayerDamaged`, `BattleStateUpdated`, `BattleEnded`) are relayed transparently without modification. `BattleConnectionLost` is the only BFF-originated event on the `/battlehub` connection.

---

## 9. Execution Plan

### Batch Structure

The BFF implementation follows the same execution discipline as Phases 0–6: batch boundaries, implementer/reviewer loop, gate checks.

#### Batch BFF-0: Foundation

**Scope:** Create BFF project structure, Bootstrap composition root, typed HttpClient infrastructure.

**Deliverables:**
- `Kombats.Bff.Bootstrap` project (`Microsoft.NET.Sdk.Web`)
  - `Program.cs` with JWT auth (Keycloak), OpenAPI/Scalar, CORS, endpoint scanning
  - `appsettings.json` with service base URLs, auth config
  - `Dockerfile`
- `Kombats.Bff.Api` project (`Microsoft.NET.Sdk`)
  - `IEndpoint` interface and `EndpointExtensions` (same pattern as backend services)
  - Health endpoint (aggregated from downstream services)
- `Kombats.Bff.Application` project (`Microsoft.NET.Sdk`)
  - `IPlayersClient`, `IMatchmakingClient` interfaces + typed HttpClient implementations
  - Error mapping types
  - (No `IBattleClient` HTTP client — Battle interaction is SignalR-only for business flows; health check uses plain HttpClient)
- Projects added to `Kombats.sln`
- Docker compose updated with BFF service entry
- Formal architecture decisions AD-14 through AD-18 written in `kombats-architecture-decisions.md` (see Section 13)

**Gate check:**
- Solution builds
- BFF starts and returns aggregated health status (Players, Matchmaking, Battle health probes)
- JWT auth rejects unauthenticated requests
- No backend service code modified
- No references to `Kombats.Abstractions` or internal service projects
- AD-14 through AD-18 recorded

#### Batch BFF-1: Pass-Through Endpoints

**Scope:** Implement all single-service pass-through endpoints with BFF-owned DTOs and error normalization.

**Deliverables:**
- Endpoints: onboard, set name, allocate stats, join queue, leave queue, get queue status
- BFF request/response DTOs (frontend-facing)
- Internal service response types (deserialization targets in Application)
- Error normalization (internal error → BFF error code mapping)
- Tests:
  - Endpoint structure tests (all endpoints discoverable)
  - Response DTO shape tests
  - Error mapping tests (unit)

**Gate check:**
- All pass-through endpoints functional
- Error normalization verified
- No domain logic in BFF
- JWT forwarding to internal services verified

#### Batch BFF-2: Composed Read Endpoints

**Scope:** Implement cross-service composition endpoints.

**Deliverables:**
- `GET /api/v1/game/state` — composed game state (character from Players + queue/match status from Matchmaking; no live battle state — that is SignalR-only)
  - Parallel calls to Players and Matchmaking
  - Graceful degradation if one service is unavailable (partial response with indication)
- Composition logic in Application layer
- Tests:
  - Composition tests (stubbed HTTP clients)
  - Partial failure handling tests

**Gate check:**
- Composed endpoint returns merged data
- Partial failures handled gracefully
- No N+1 call patterns

#### Batch BFF-3: SignalR Realtime Proxy

**Scope:** Implement SignalR proxy/relay for Battle realtime.

**Deliverables:**
- BFF `BattleHub` (frontend-facing)
- SignalR client connection to Battle's `/battlehub`
- Bidirectional message relay
- Connection lifecycle management (connect on join, disconnect on battle end)
- JWT forwarding for Battle hub auth
- Tests:
  - Hub auth enforcement
  - Message relay correctness (unit with mocked SignalR)

**Gate check:**
- Frontend can connect to BFF hub and receive battle events
- Actions submitted through BFF hub reach Battle
- Auth enforced on both hops
- Connection cleanup on battle end

#### Batch BFF-4: Integration Verification and Cutover

**Scope:** End-to-end verification of BFF with all three backend services.

**Deliverables:**
- Integration tests: full gameplay loop through BFF (onboard → queue → match → battle → completion)
- Docker compose with all 4 services running
- BFF Dockerfile verified
- Documentation updated

**Gate check:**
- Full gameplay loop works through BFF
- All BFF tests pass
- No direct frontend-to-internal-service paths remain as the intended architecture
- BFF is the single entry point for frontend traffic

### Implementation Order Rationale

```
BFF-0 (Foundation)
  │
  v
BFF-1 (Pass-through endpoints)
  │
  v
BFF-2 (Composed reads)
  │
  v
BFF-3 (SignalR proxy)
  │
  v
BFF-4 (Integration + cutover)
```

Foundation first (BFF-0) because everything depends on the project structure and HTTP client infrastructure. Pass-throughs (BFF-1) before composition (BFF-2) because composition builds on the same client infrastructure. SignalR proxy (BFF-3) is independent of read composition but is more complex, so it comes after the simpler endpoints are verified. Integration (BFF-4) is last because it requires all pieces.

### Reviewer Checkpoints

| After Batch | Review Focus |
|---|---|
| BFF-0 | Project structure correctness, auth configuration, no domain logic |
| BFF-1 | DTO design, error normalization, no contract leakage, no domain logic |
| BFF-2 | Composition correctness, partial failure handling, no N+1 |
| BFF-3 | SignalR proxy architecture, connection lifecycle, auth on both hops |
| BFF-4 | End-to-end correctness, no architectural violations, documentation |

---

## 10. Risks, Open Questions, and Trade-offs

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **BFF becomes orchestration dump** | High | Strict boundary: BFF composes reads and forwards writes. Multi-step write orchestration stays in backend services. BFF never enforces domain invariants. |
| **Domain logic leaks into BFF** | High | Reviewer checkpoint at every batch. BFF Application layer contains only HTTP client calls and response mapping. No stat calculations, no state machine transitions, no readiness derivation. |
| **Unstable BFF contracts tied to internal APIs** | Medium | BFF defines its own DTOs. Internal service response types are separate deserialization targets. Changes to internal APIs require updating the BFF client, not the frontend contract. |
| **SignalR proxy complexity** | Medium | Batch BFF-3 is isolated so proxy complexity doesn't block pass-through endpoints. Explicit fallback trigger criteria defined in Section 8. |
| **Double JWT validation latency** | Low | JWT validation is a local cryptographic operation (~0.1ms). No Keycloak round-trip. Negligible compared to HTTP call latency. |
| **BFF as single point of failure** | Medium | BFF is stateless — horizontal scaling is straightforward. Health check aggregation provides visibility. If BFF is down, frontend is down, but no backend state is corrupted. |
| **Coupling BFF to internal service URL structure** | Low | Typed HttpClients encapsulate URL construction. Internal API path changes require BFF client updates but not frontend changes. |

### Open Questions

| Question | Current Position | Needs Resolution By |
|---|---|---|
| ~~Should BFF reuse `Kombats.Abstractions` types?~~ | **Closed — Decision: No.** BFF does not reference `Kombats.Abstractions` in v1. `Result<T>`, `Error`, and handler interfaces are backend-service internals. BFF defines its own error types and response patterns. | Resolved |
| **Should BFF have its own Contract project?** | Lean no for v1 — BFF DTOs live in Api project. A Contracts project makes sense if other consumers (e.g., mobile app) need the same types. | BFF-1 |
| **How does BFF handle backend service unavailability?** | Return partial responses with degradation indicators for reads. Return 503 for writes that require an unavailable service. | BFF-2 |
| **SignalR backplane for multi-instance BFF** | Not needed for v1 (single BFF instance). Required before horizontal scaling. Redis would be the natural choice (already in infrastructure). | Pre-production scaling |
| **Should BFF endpoints follow the same `/api/v1/` prefix as internal services?** | Yes, but BFF routes are user-intent-oriented, not service-oriented. No collision risk since BFF runs on a different port. | BFF-0 |
| **Phase 7A: should it complete before or run in parallel with BFF?** | Phase 7A items (health checks, telemetry, recovery mechanisms) benefit backend services and BFF. BFF can start before 7A completes — they are independent streams. | Execution scheduling |

### Trade-offs Accepted

| Trade-off | Decision | Cost | Benefit |
|---|---|---|---|
| HTTP between BFF and services (not in-process) | Accepted | Network latency per call (~1-5ms local) | Full service isolation. BFF cannot accidentally reference internal types. Clean deployment boundary. |
| No shared type references between BFF and services | Accepted | Duplicate DTO definitions for service responses | Contract decoupling. Internal changes don't propagate to frontend. |
| SignalR proxy adds a hop | Accepted | ~1-2ms additional latency per message | Single entry point. Battle not externally exposed. Simpler frontend. |
| No BFF state | Accepted | Every request hits backend services (no caching) | No consistency problems. No projection management. Simpler BFF. |
| JWT forwarding (double validation) | Accepted | ~0.2ms per request | Defense-in-depth per AD-03. No trust boundary weakening. |

---

## 11. Technology Constraints

The BFF follows the same technology baseline as backend services:

- .NET 10.0, `LangVersion latest`, `Nullable enable`, `ImplicitUsings enable`
- ASP.NET Core Minimal APIs (no controllers)
- Keycloak JWT Bearer auth
- OpenAPI via `Microsoft.AspNetCore.OpenApi` + Scalar
- Serilog for logging
- Central package management via `Directory.Packages.props`

**New packages potentially needed:**

| Package | Purpose | Notes |
|---|---|---|
| `Microsoft.AspNetCore.SignalR.Client` | SignalR client for connecting BFF to Battle hub | Standard ASP.NET Core package; no approval concern |
| `Microsoft.Extensions.Http.Polly` or `Microsoft.Extensions.Http.Resilience` | Retry/circuit-breaker for HTTP clients | Evaluate during BFF-0. May use built-in `IHttpClientFactory` retry instead. |

No new infrastructure dependencies (no PostgreSQL, no Redis, no RabbitMQ for BFF).

---

## 12. Definition of Done — BFF v1

BFF v1 is complete when:

1. All pass-through endpoints functional with BFF-owned DTOs
2. Composed game state endpoint returns merged data from Players + Matchmaking
3. SignalR proxy relays battle events bidirectionally
4. JWT auth enforced on all BFF endpoints and SignalR hub
5. Error normalization produces consistent error envelope
6. All BFF tests pass (endpoint, composition, error mapping, hub auth)
7. Full gameplay loop verified through BFF (integration test)
8. Docker compose includes BFF service
9. BFF Dockerfile builds and runs
10. No domain logic in BFF (reviewer verified)
11. No direct Contract project references from BFF (reviewer verified)
12. Documentation updated (this document + execution log)

---

## 13. BFF Decisions Requiring AD Formalization

The following decisions made in this planning document must be added to `docs/architecture/kombats-architecture-decisions.md` as formal architecture decisions during BFF-0 implementation. They are currently documented only here and in execution-issues (EI-044).

| Proposed AD | Decision | Rationale Summary |
|---|---|---|
| **AD-14: BFF as stateless orchestration/composition layer** | BFF owns no durable state (no Postgres, no Redis). All data is fetched from backend services per-request. | Avoids creating a fourth bounded context. Simplifies BFF. Reads are always fresh. |
| **AD-15: JWT forwarding for BFF-to-service auth** | BFF forwards the original JWT to backend services. Backend services continue to validate JWT (defense-in-depth). | Per AD-03: "BFF-only auth" was rejected. Internal services must remain independently secure. |
| **AD-16: BFF proxies Battle SignalR** | Frontend connects to BFF's SignalR hub. BFF relays to Battle's hub. Battle is not externally accessible. | Single entry point for frontend. Simplified auth. Contract translation layer. Fallback to direct connection defined (see Section 8). |
| **AD-17: BFF does not reference internal service projects or Abstractions** | BFF communicates with backend services exclusively over HTTP/SignalR. No project references to service Api, Application, Domain, Infrastructure, or Kombats.Abstractions. | Full service isolation. BFF cannot accidentally depend on internal types. Contract decoupling. |
| **AD-18: BFF interacts with Battle via SignalR only (no HTTP for business flows)** | Battle exposes no HTTP endpoints for gameplay. All battle interaction goes through SignalR. BFF calls Battle HTTP only for health check. | Battle's API surface is realtime-native. HTTP would duplicate the SignalR contract or require a separate query model that doesn't exist. |

These must be written as full AD entries (Decision, Context, Trade-offs, Rejected Alternatives, Rationale) following the format of AD-01 through AD-13.

---

## 14. Recommended Next Gate

After this planning document is reviewed and approved:

1. **Gate: Planning review** — Reviewer inspects this document. Key questions:
   - Is the BFF boundary clear and correctly drawn?
   - Is v1 scope appropriate (not too broad, not too narrow)?
   - Is the SignalR proxy decision correct, or should direct connection be reconsidered?
   - Are there missing risks or open questions?

2. **Gate: Batch BFF-0 review** — After foundation is implemented, verify project structure, auth, and client infrastructure before proceeding to endpoints.

3. **Gate: Batch BFF-3 review** — SignalR proxy is the highest-complexity batch. Dedicated review before integration.

4. **Gate: Batch BFF-4 review** — Full integration verification before declaring BFF v1 complete.

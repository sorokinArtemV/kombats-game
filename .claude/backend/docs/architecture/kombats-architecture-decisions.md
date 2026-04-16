# Kombats Architecture Decisions

Cross-service decisions, trade-offs, rejected alternatives, and rationale.

---

## AD-01: Standardize on MassTransit EF Core Transactional Outbox

### Decision
All three services use MassTransit's built-in EF Core transactional outbox for event and command publication.

### Context
The system currently has three different outbox states:
- **Battle:** MassTransit EF Core outbox (working, production-grade)
- **Matchmaking:** Custom outbox (`matchmaking_outbox_messages` table, manual dispatcher, custom retry logic)
- **Players:** No outbox at all (direct `IPublishEndpoint.Publish()` after `SaveChangesAsync()`)

Players' lack of an outbox is the highest-severity production risk in the system. Matchmaking's custom outbox works but duplicates MassTransit's capabilities with less functionality.

### Trade-offs

| Factor | MassTransit Outbox (chosen) | Custom Outbox | No Outbox |
|---|---|---|---|
| Event-loss risk | Eliminated (atomic with DB tx) | Eliminated | **PRESENT** |
| Code to maintain | Minimal (framework-provided) | Significant (writer, dispatcher, worker, table) | None |
| `Send` support | Supported (must validate) | Supported (already implemented) | N/A |
| Dead-letter handling | Built-in | Must build | None |
| Monitoring | MassTransit tooling | Custom | None |
| Consistency across services | **All same pattern** | Mixed | Mixed |
| Migration effort | Low for Players/Battle, Medium for Matchmaking | Low (already exists in MM) | None |

### Rejected Alternatives

1. **Keep custom outbox in Matchmaking, add custom outbox to Players.**
   Rejected because: Maintains two outbox implementations (custom + MassTransit in Battle). More code, more operational divergence, more failure modes.

2. **Custom outbox everywhere (replace MassTransit outbox in Battle).**
   Rejected because: Would replace a working, feature-rich framework outbox with a less capable custom implementation. Regression.

3. **No outbox for Players (rely on retry/republish).**
   Rejected because: There is no retry/republish mechanism. A lost event is permanently lost. This is the exact problem that caused RISK-S1.

### Prerequisite
Validate that MassTransit's EF Core outbox supports `ISendEndpoint.Send()` within a transaction scope (not just `IPublishEndpoint.Publish()`). This is required for Matchmaking's `CreateBattle` command. If validation fails, Matchmaking retains its custom outbox; Players and Battle still use MassTransit outbox.

### Rationale
One outbox pattern. One set of tables. One operational model. One monitoring approach. The framework outbox is more capable than the custom one and requires less code.

---

## AD-02: Contract Terminology Follows Publisher's Ubiquitous Language

### Decision
Each integration event/contract uses the publishing service's domain terminology. Consuming services translate internally as needed.

### Context
A stat named "Vitality" in Players is called "Stamina" in Battle's domain and "Endurance" in Battle's balance config (`HpPerEnd`). The two target architectures disagreed:
- Players target: "Keep Vitality in the contract"
- Battle target: "Align to Stamina in the contract"

### Resolution
- Contracts use **Vitality** (Players' term, since Players is the publisher)
- Battle maps `Vitality -> Stamina` internally (Battle's domain translation)
- `HpPerEnd` remains as a balance config coefficient name (not a stat name)

### Trade-offs

| Factor | Publisher's Language (chosen) | Consumer's Language | Shared Glossary |
|---|---|---|---|
| Contract clarity | Clear for publisher, requires mapping in consumer | Awkward for publisher | Requires governance |
| Bounded context integrity | **Preserved** | Violated (publisher forced to use external terms) | Partially preserved |
| Mapping code | In consumer (Battle) | In publisher (Players) | In both |
| DDD alignment | **Correct** (contracts are published interfaces) | Incorrect | Debatable |

### Rejected Alternatives

1. **Normalize to "Stamina" everywhere.**
   Rejected because: Forces Players to adopt Battle's vocabulary. Players doesn't know what "Stamina" means in its domain. Violates bounded context principle.

2. **Create a shared game glossary with canonical names.**
   Rejected because: Over-governance for a three-service monorepo. Adds a coordination tax with no proportional benefit. Each bounded context should speak its own language.

### Rationale
In DDD, the contract is a published language that belongs to the publishing bounded context. Consumers translate. This is standard and well-understood. The mapping code in Battle already exists and is trivial.

---

## AD-03: No New Auth Service - Keycloak JWT Throughout

### Decision
Keycloak remains the sole identity provider. All HTTP-facing services validate JWT tokens from Keycloak using a shared configuration pattern. No auth service, no identity aggregation service, no token exchange service is introduced.

### Context
- Keycloak (realm: `kombats`) issues JWT tokens
- Players validates JWT and binds IdentityId to Character
- Matchmaking currently has no auth (security gap)
- Battle has a dev auth bypass (must be removed)

### Implementation
- Shared JWT Bearer configuration: Authority = `{Keycloak realm URL}`, Audience = `{configured client ID}`
- Each service adds `[Authorize]` to its HTTP endpoints
- IdentityId extracted from JWT claims via standard ASP.NET Core mechanisms
- Service-to-service messaging (RabbitMQ) is trusted; no per-message auth

### Rejected Alternatives

1. **Dedicated auth/identity service.**
   Rejected because: Keycloak already provides identity. A wrapper service adds latency and a point of failure with no new capability.

2. **BFF-only auth (backend services trust all requests).**
   Rejected because: Defense-in-depth. If the BFF is bypassed or misconfigured, all backend services are unprotected. Matchmaking's current state (no auth, playerId from request body) demonstrates this risk.

3. **Per-message JWT validation on RabbitMQ consumers.**
   Rejected because: Messages come from trusted internal services, not external clients. JWT validation on consumers adds latency and complexity with no security benefit in a monorepo.

### Rationale
Keycloak is already deployed and configured. JWT Bearer validation is standard ASP.NET Core middleware. No new infrastructure needed. The gap is configuration, not architecture.

---

## AD-04: Readiness Ownership Split (Players Derives, Matchmaking Enforces)

### Decision
Players owns the definition and derivation of `IsReady`. Matchmaking consumes the boolean and enforces it for queue eligibility. No service derives readiness from raw state except Players.

### Context
`IsReady` gates matchmaking entry. Currently computed in Players' event factory as `OnboardingState == Ready`. Target: promote to domain property on Character.

### Trade-offs

| Factor | Players Derives (chosen) | Matchmaking Derives | Both Derive |
|---|---|---|---|
| Single derivation point | **Yes** | Yes (but wrong owner) | No (duplication risk) |
| Extensibility | Change in Players only | Change in Matchmaking only | Change in both |
| Domain correctness | **Readiness is a character property** | Readiness is a queue property | Confused ownership |
| Contract stability | `IsReady: bool` (stable) | Raw fields (fragile) | Mixed |

### Rejected Alternatives

1. **Matchmaking derives readiness from raw stats/onboarding state.**
   Rejected because: Matchmaking would need to understand Players' onboarding rules. If readiness rules change (e.g., minimum level 5), Matchmaking must be updated. Tight coupling.

2. **Players doesn't publish IsReady; Matchmaking decides eligibility independently.**
   Rejected because: Eligibility is a domain concept that belongs to the character lifecycle. Matchmaking should enforce, not define.

### Rationale
Clean ownership. One derivation point. Stable contract. If readiness rules become richer, the change is localized to Players' domain.

---

## AD-05: Stat Authority Boundaries

### Decision
- **Players** owns what stats a character HAS (values, allocation, growth)
- **Battle** owns what stats DO in combat (formulas, damage, HP, dodge, crit)
- **Matchmaking** holds a projection of stat values for snapshot building; it does not interpret stats
- **Contracts** carry stat values as integers with no combat interpretation

### Context
Stats flow: Players (authoritative) -> Matchmaking (projection) -> Battle (snapshot). Each service has different concerns about the same data.

### Rejected Alternatives

1. **Battle defines stat ranges and Players enforces them.**
   Rejected because: Creates bidirectional coupling. Players would need to know Battle's validation rules. Stats should flow in one direction.

2. **Shared "game config" service owns stat definitions.**
   Rejected because: Over-architecture. Three services with clear ownership don't need a fourth to mediate.

3. **Battle queries Players for fresh stats at battle creation.**
   Rejected because: Synchronous cross-service call. Creates runtime coupling. Fails if Players is down. The snapshot model (frozen at match time) is intentionally decoupled and fair.

### Rationale
Each service has a clear, non-overlapping concern about stats. Players is the authority on values. Battle is the authority on effects. Matchmaking is a pass-through. The snapshot model ensures fairness (stats frozen at match time) and resilience (no runtime cross-service calls).

---

## AD-06: Additive-Only Event Versioning with Version Field

### Decision
All integration events carry a `Version: int` field. Schema evolution is additive-only. Breaking changes require new event types. No schema registry. Compile-time project references provide type safety.

### Context
Within the monorepo, all services are co-deployed from the same codebase. Contract types are shared via project references, providing compile-time type safety.

### Trade-offs

| Factor | Additive + Version (chosen) | Schema Registry | No Versioning |
|---|---|---|---|
| Complexity | Low | High (new infrastructure) | Lowest |
| Type safety | Compile-time (project refs) | Runtime (schema validation) | Compile-time |
| Forward compatibility | Consumers tolerate new fields | Full compatibility guarantees | Brittle |
| Operational cost | None | Registry deployment + maintenance | None |
| Future-proofing | Version field is ready for branching | Full solution | Nothing |

### Rejected Alternatives

1. **Full schema registry (Avro, Protobuf, etc.).**
   Rejected because: Over-engineering for a monorepo with co-deployed services. The operational cost of a registry is not justified when all consumers are in the same codebase.

2. **No versioning at all.**
   Rejected because: Adding a Version field is zero-cost now and provides a safety net for future evolution. Omitting it means retrofitting later.

### Rationale
Minimum viable versioning. The Version field costs nothing to add and provides forward compatibility. Compile-time project references handle 99% of contract safety. If the monorepo splits into separate repos, upgrade to a schema registry at that point.

---

## AD-07: Single PostgreSQL Instance with Schema-Per-Service

### Decision
Retain the single PostgreSQL instance (`kombats` database) with schema-per-service isolation (`players`, `matchmaking`, `battle`). No cross-schema access.

### Trade-offs

| Factor | Single DB + Schemas (chosen) | Separate DB Instances | Shared Schema |
|---|---|---|---|
| Operational simplicity | **Simplest** | More instances to manage | Simplest but dangerous |
| Isolation | Logical (schema) | Physical | None |
| Cross-service query prevention | Convention-enforced | Physically impossible | No boundary |
| Migration independence | Each service owns its schema | Fully independent | Coupled |
| Resource contention | Shared pool | Independent | Shared pool |
| Migration path | Can split later | Already split | Hard to split |

### Rationale
Schema isolation provides sufficient boundary for the current scale. Each EF Core DbContext is scoped to its schema. If load grows or operational independence becomes critical, each schema can be migrated to its own database instance with connection string changes only - no code changes required.

---

## AD-08: Redis Sentinel for Production (Not Cluster)

### Decision
Redis Sentinel for production HA. Not Redis Cluster.

### Context
Both Battle and Matchmaking use Lua scripts that operate on multiple keys per operation. Redis Cluster requires all keys in a Lua script to be on the same shard (via hash tags). Battle's scripts use keys like `battle:state:{id}`, `battle:deadlines`, `battle:active`, `battle:lock:{id}` - these span multiple hash slots.

### Trade-offs

| Factor | Sentinel (chosen) | Cluster | Single Instance |
|---|---|---|---|
| HA / Failover | Automatic failover | Automatic failover + sharding | **None** |
| Lua script compatibility | **Full** (single master) | Requires hash tag restructuring | Full |
| Sharding | None (single master) | Built-in | None |
| Complexity | Low | High | Lowest |
| Data volume fit | Adequate for expected scale | Overkill | Adequate |

### Rejected Alternatives

1. **Redis Cluster.**
   Rejected because: Lua scripts would need significant restructuring (hash tags on all keys). The data volume doesn't warrant sharding. Complexity cost is high.

2. **Single instance in production.**
   Rejected because: Both Battle and Matchmaking have hard Redis dependencies. A single instance failure stops all gameplay. Unacceptable for production.

### Rationale
Sentinel provides HA with automatic failover and zero Lua script changes. The data volume (active battles + matchmaking queues) fits comfortably on a single master. If sharding is ever needed, the key structure can be redesigned at that point.

---

## AD-09: No Synchronous Cross-Service Communication

### Decision
Services communicate exclusively through asynchronous messaging (RabbitMQ/MassTransit). No synchronous HTTP or gRPC calls between services.

### Context
The current architecture already follows this pattern. No cross-service HTTP calls exist in the codebase. This decision explicitly codifies the constraint.

### Exception
If a future reconciliation mechanism is needed (e.g., Matchmaking queries Battle for match/battle status), it would be the only synchronous path and must be designed as a fallback mechanism, not a primary integration pattern.

### Rejected Alternatives

1. **Players exposes a gRPC/HTTP endpoint for Matchmaking to query fresh stats.**
   Rejected because: Creates runtime coupling. Matchmaking fails if Players is down. The projection model (eventually consistent via events) is more resilient and already sufficient.

2. **Battle exposes an HTTP endpoint for Matchmaking reconciliation.**
   Not rejected permanently, but deferred. Timeout-based recovery (60s for BattleCreateRequested, 10min for BattleCreated) is the primary mechanism. Active reconciliation is a future enhancement if operational experience shows it's needed.

### Rationale
Async messaging provides temporal decoupling (services don't need to be simultaneously available), natural retry/redelivery, and clear event-driven architecture. The snapshot model (stats frozen at match time) only works because there are no synchronous queries.

---

## AD-10: Battle Self-Consumption Pattern Removal

### Decision
Battle stops consuming its own `BattleCompleted` event for Postgres read model updates. Instead, it writes the terminal record directly to Postgres in the application layer after committing the Redis terminal state.

### Context
Battle currently publishes `BattleCompleted` via MassTransit, then consumes it from the bus via `BattleCompletedProjectionConsumer` to update its own Postgres `battles` table. This roundtrip through RabbitMQ adds latency and a failure mode.

### Trade-offs

| Factor | Direct Write (chosen) | Self-Consumption (current) |
|---|---|---|
| Failure modes | One (Postgres write fails) | Two (RabbitMQ + Postgres) |
| Latency | Sub-millisecond (local write) | Seconds (bus roundtrip) |
| Consistency | Immediate | Eventually consistent |
| Code complexity | Simpler (no extra consumer) | Extra consumer class |
| Pattern purity | Less "CQRS-pure" | More aligned with CQRS |

### Rejected Alternatives

1. **Keep self-consumption for CQRS purity.**
   Rejected because: The CQRS pattern is justified when projections are complex or serve multiple internal consumers. Battle's Postgres update is a single simple write. The pattern adds complexity without proportional benefit.

### Rationale
Simpler, faster, fewer failure modes. The outbox still ensures `BattleCompleted` is published for external consumers (Matchmaking, Players). The internal read model update doesn't need to go through the bus.

---

## AD-11: Deterministic Battle Randomization and Replay Boundary

### Status
Accepted

### Decision
Kombats adopts deterministic battle randomization as a required architectural property of the Battle service.

### Context
Battle resolution includes randomness for dodge, critical hits, and damage rolls. In a multiplayer combat system, randomness cannot be treated as an incidental implementation detail because it directly affects fairness, retry safety, crash recovery, debugging, and future replay/audit capabilities.

The current codebase already implements deterministic battle randomization rather than ad hoc runtime randomness. This behavior is worth preserving. However, the architecture decision is about preserving the guarantees, not freezing the current file structure or implementation shape.

### Accepted Model
- one seed is generated per battle at battle creation time;
- random values used during combat are deterministically derived from persisted battle inputs;
- each attack direction within a turn uses an independent derived RNG stream;
- combat outcome must not vary due to retry timing, recovery timing, process timing, or evaluation order between the two attack directions;
- deterministic combat behavior is a correctness requirement, not an optimization.

### Explicit Boundary
This decision applies to combat outcome and turn-resolution behavior, not to all emitted metadata. Metadata such as wall-clock timestamps may remain observational and non-deterministic unless explicitly normalized later.

Deterministic combat resolution is accepted now.
Durable replay is not accepted as a current system capability.

A full replay or replay-verification feature requires durable per-turn action history and a defined replay contract. Until that exists, the system has a deterministic engine but not a full durable replay subsystem.

### Consequences
Benefits:
- retry-safe and recovery-safe turn resolution;
- stable combat outcomes for identical persisted battle inputs;
- predictable debugging of combat logic;
- a sound basis for future replay or dispute-resolution features;
- protection against accidental combat drift caused by refactors.

Constraints:
- changes to RNG derivation, RNG consumption sequence, combat arithmetic, or turn sequencing are compatibility-sensitive;
- combat arithmetic must remain deterministic;
- deterministic combat guarantees must be preserved during refactors and feature expansion;
- future combat variants must preserve deterministic resolution semantics.

### Deferred Follow-Up
The following remain deferred and should not be confused with the determinism decision itself:
- durable persistence of turn-action history;
- replay verification product/operational semantics;
- whether event timestamps should become injected rather than read from wall-clock time;
- whether seed size or replay/audit requirements need to evolve in the future.

### Rationale
Deterministic combat is already present in the current implementation and should be elevated into explicit architecture rather than remaining an implicit code property.

---

## AD-12: Players Migrates to Shared Messaging Library

### Decision
Players migrates from its simplified `MessageBusExtensions` (in `Kombats.Shared`) to `Kombats.Messaging` (used by Matchmaking and Battle; currently named `Kombats.Infrastructure.Messaging` in the repo, renamed during foundation phase).

### Context
Matchmaking and Battle use `Kombats.Messaging` which provides: outbox support, inbox idempotency, entity name conventions, topology configuration, retry/redelivery, health checks, and consistent consumer registration. Players uses a simpler setup that lacks most of these features.

### Rationale
Players needs outbox support (AD-01). It already needs inbox cleanup configuration. It needs consistent entity naming to interoperate correctly. Migrating to the shared library provides all of these and eliminates a divergent messaging configuration.

---

## AD-13: CI/CD-Managed Database Migrations (All Services)

### Decision
Remove `Database.MigrateAsync()` from all services' `Program.cs` startup. Migrations run as a CI/CD pipeline step (migration script or init container) before application deployment.

### Context
All three services currently auto-migrate on startup. All three target architectures flag this for removal.

### Rationale
Multi-instance deployments race on migrations. Slow migrations block application startup. Failed migrations crash the application in a way that's hard to diagnose. Separating migrations from startup provides:
- Predictable migration execution (single runner)
- Independent failure handling (migration failure doesn't crash the app)
- Rollback capability (migrations can be tested and reversed in CI before deployment)

---

## AD-14: BFF as Stateless Orchestration/Composition Layer

### Decision
The BFF (Backend-for-Frontend) is a stateless ASP.NET Core service that composes reads across backend services and forwards writes. It owns no durable state — no database, no Redis, no message bus.

### Context
The Kombats frontend needs a unified API surface. Three independent backend services (Players, Matchmaking, Battle) each expose separate APIs with different contract conventions. The frontend would otherwise need to orchestrate cross-service workflows, manage partial failures, and maintain separate connections.

### Trade-offs

| Factor | Stateless BFF (chosen) | Stateful BFF | No BFF |
|---|---|---|---|
| Complexity | Low — pure composition | Higher — consistency, projections, event subscriptions | None at BFF layer, shifted to frontend |
| Scalability | Trivial — horizontally scalable | Requires state synchronization | N/A |
| Data freshness | Always fresh (reads from source) | May serve stale projections | Always fresh |
| Frontend complexity | Low — single API surface | Low | High — orchestrates 3 services |

### Rejected Alternatives

1. **Stateful BFF with Redis cache or PostgreSQL projections.** Rejected because it creates a fourth bounded context with its own consistency concerns. The three backend services already own all authoritative state.

2. **No BFF — frontend calls services directly.** Rejected because it shifts orchestration complexity to the frontend, couples UI to internal service contracts, and requires all three services to be externally accessible.

### Rationale
A stateless BFF is the simplest architecture that solves the frontend integration problem. Every request is fulfilled by calling internal service APIs — no projections to maintain, no events to consume, no cache to invalidate. If caching is needed in the future, it is an explicit architectural decision (not incremental drift).

---

## AD-15: JWT Forwarding for BFF-to-Service Auth

### Decision
The BFF forwards the original JWT token from the frontend to backend services. Backend services continue to validate JWT tokens independently (defense-in-depth).

### Context
AD-03 rejected "BFF-only auth" where backend services trust all requests from the BFF. The concern was: if the BFF is bypassed or misconfigured, all backend services are unprotected.

### Trade-offs

| Factor | JWT forwarding (chosen) | Trusted header (X-Identity-Id) |
|---|---|---|
| Defense-in-depth | Maintained — services validate independently | Lost — services trust BFF blindly |
| Latency | Double JWT validation per request | Single validation at BFF |
| Implementation | Simple — copy Authorization header | Requires network-level trust guarantees |
| Backend service changes | None — services already validate JWT | Must reconfigure auth on all services |

### Rejected Alternatives

1. **Trusted header approach.** BFF extracts IdentityId, passes via `X-Identity-Id`. Rejected because it removes defense-in-depth and requires guaranteeing that backend services are never accessible without BFF mediation (network topology constraint).

### Rationale
JWT validation is a local operation (no Keycloak round-trip). The performance cost of double validation is negligible. Backend services already have JWT validation configured and tested. Defense-in-depth is a documented principle (AD-03).

---

## AD-16: BFF Proxies Battle SignalR (Single Entry Point)

### Decision
The BFF proxies the Battle service's SignalR connection. The frontend connects to the BFF's `/battlehub`; the BFF relays messages bidirectionally to Battle's `/battlehub`.

### Context
Battle uses SignalR for real-time combat (turn events, action submission). The frontend needs to connect somewhere for real-time battle state.

### Trade-offs

| Factor | Proxy via BFF (chosen) | Direct frontend → Battle |
|---|---|---|
| Frontend simplicity | Single URL for everything | Must discover Battle URL, manage separate connection |
| Auth | Single auth edge at BFF | Separate auth with Battle |
| Contract stability | BFF can adapt/translate events | Frontend coupled to Battle's SignalR contract |
| Network topology | Only BFF externally accessible | Battle must be externally accessible |
| Latency | Extra hop (~1-2ms) | Lower |

### Rejected Alternatives

1. **Direct frontend → Battle connection.** Rejected because it requires Battle to be externally accessible, creates a second auth edge, and couples the frontend to Battle's internal SignalR contract.

### Fallback
If proxy implementation proves intractable in v1 scope (per criteria defined in the BFF architecture document Section 8), the fallback is BFF-assisted discovery: BFF returns Battle's hub URL and the frontend connects directly. This fallback changes deployment topology and requires reviewer approval.

### Rationale
For a turn-based game with 30-second turns, the ~1-2ms relay overhead is negligible. A single entry point simplifies frontend development, auth, and deployment. The proxy can translate or adapt events if Battle's internal contract evolves.

---

## AD-17: BFF Does Not Reference Internal Service Projects or Abstractions

### Decision
The BFF does not hold project references to any backend service project (Api, Application, Domain, Infrastructure) or to `Kombats.Abstractions`. Communication is strictly over HTTP/SignalR.

### Context
The BFF sits above the three backend services. If it references their internal projects, it gains compile-time coupling to service internals — defeating the purpose of service isolation.

### Trade-offs

| Factor | No internal references (chosen) | Reference Contract projects | Reference Abstractions |
|---|---|---|---|
| Coupling | None — HTTP boundary only | Compile-time coupling to contract types | Compile-time coupling to shared abstractions |
| Type safety | Runtime (JSON deserialization) | Compile-time | Partial |
| Contract evolution | BFF absorbs changes via own DTOs | BFF breaks when contracts change | N/A |
| Simplicity | Own DTOs, own error types | Reuse existing types | Mixed patterns |

### Rejected Alternatives

1. **Reference Contract projects for type reuse.** Rejected for v1 because it couples BFF build to internal contract evolution. BFF defines its own response types and maps from internal service responses, providing a translation layer.

2. **Reference `Kombats.Abstractions` for `Result<T>` and handler interfaces.** Rejected because those are backend-service internals. BFF defines its own error types and response patterns appropriate for a frontend-facing HTTP layer.

### Rationale
The BFF's value is as a decoupled translation layer. If it references internal projects, changes to those projects break BFF builds — the opposite of the goal. BFF-local DTOs absorb internal contract evolution without breaking the frontend.

---

## AD-18: BFF Interacts with Battle via SignalR Only (No HTTP for Business Flows)

### Decision
The BFF does not call Battle over HTTP for business flows. All battle interaction (join battle, submit action, receive turn events) goes through SignalR. The only HTTP call to Battle is the health check probe.

### Context
Battle's API surface is primarily real-time: turn events, action submission, battle state updates. These are naturally bidirectional and latency-sensitive — a SignalR fit, not REST.

### Trade-offs

| Factor | SignalR-only (chosen) | HTTP + SignalR |
|---|---|---|
| Protocol consistency | One protocol for all battle interaction | Mixed protocols, routing complexity |
| Real-time events | Natural — SignalR is bidirectional | SignalR for events, HTTP for commands = split |
| Implementation | Single connection manages all battle interaction | Two connection types to Battle |
| Complexity | Lower — one client | Higher — HttpClient + HubConnection |

### Rejected Alternatives

1. **HTTP for commands (join/submit), SignalR for events only.** Rejected because it splits the battle interaction across two protocols with no clear benefit. Battle's hub already handles commands (JoinBattle, SubmitTurnAction) alongside events.

### Rationale
Battle is fundamentally a real-time service. SignalR handles both the command (client → server) and event (server → client) directions. Adding HTTP for commands would create redundant paths and complicate error handling.

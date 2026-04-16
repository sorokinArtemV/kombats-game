# Kombats System Architecture

## 1. System Overview

### What Kombats Is

Kombats is a 1v1 turn-based combat game backend. Three services form the core gameplay loop:

- **Players** publishes who characters are and what they can do
- **Matchmaking** decides who fights whom and when
- **Battle** executes the fight and declares the winner

The system is event-driven. Services communicate through RabbitMQ (via MassTransit). Each service owns its own PostgreSQL schema within a shared database instance. Redis provides low-latency state for real-time operations (battle state, matchmaking queues).

### Runtime Topology

```
                     Keycloak (JWT issuer)
                           |
                      JWT tokens
                           |
              +------------+------------+
              |            |            |
         Players:5001  Matchmaking:5002  Battle:5003
              |            |            |
              +------+-----+-----+------+
                     |           |
                PostgreSQL    RabbitMQ
               (kombats DB)   (AMQP)
                     |
              +------+------+
              |      |      |
           players  mm   battle    <-- schemas
                           |
                         Redis
                      (DB 0: battle)
                      (DB 1: matchmaking)
```

### Service Interaction Model

Services interact exclusively through:
1. **Integration events** (pub/sub via RabbitMQ exchanges) for state notifications
2. **Commands** (point-to-point via RabbitMQ queues) for action requests
3. **No synchronous HTTP calls between services**
4. **No cross-schema database access**

Data flows in one direction through the combat lifecycle:

```
Players --(PlayerCombatProfileChanged)--> Matchmaking
Matchmaking --(CreateBattle command)--> Battle
Battle --(BattleCreated, BattleCompleted)--> Matchmaking, Players
```

---

## 2. Service Responsibilities (Final Aligned)

### Players - Character Lifecycle and Combat Profile Authority

**Owns:**
- Character aggregate (identity binding, naming, onboarding state machine)
- Combat stats: Strength, Agility, Intuition, Vitality (authoritative values)
- Stat allocation rules and optimistic concurrency
- XP, leveling, progression (triangular curve, versioned policy)
- Win/loss record
- Readiness derivation (`IsReady = OnboardingState == Ready`)
- Combat profile publication (`PlayerCombatProfileChanged` event)
- `players` PostgreSQL schema

**Does not own:**
- Player identity (Keycloak owns this; Players binds IdentityId to Character)
- Queue eligibility enforcement (Matchmaking enforces using IsReady from projection)
- How stats affect combat mechanics (Battle's domain translation)
- Match or battle lifecycle

**Key property:** Players is the single source of truth for character combat data. No other service writes to Players' data. All downstream services consume published snapshots.

### Matchmaking - Queue, Pairing, and Match Lifecycle Orchestrator

**Owns:**
- Queue lifecycle: join, leave, status, FIFO pairing (Redis)
- Match entity and full lifecycle state machine (Postgres, CAS transitions)
- Player combat profile projection (local read model from Players events)
- Player match status cache (Redis)
- Battle creation command issuance (when to create a battle, with what snapshots)
- Single-leader pairing tick (distributed lease)
- Timeout detection and recovery for all match states
- `matchmaking` PostgreSQL schema

**Does not own:**
- Player identity, character data, or combat stats (holds a projection, not truth)
- Battle execution or outcome determination
- Auth infrastructure (consumes JWT)
- Game mode definitions (variants come from configuration)

**Key property:** Matchmaking is the gateway between "I want to play" and "a battle exists." It bridges Players' character data and Battle's combat execution.

### Battle - Combat Execution Engine

**Owns:**
- Combat resolution algorithm (BattleEngine, CombatMath, deterministic RNG)
- Battle state machine and lifecycle (creation through terminal state)
- Turn deadline enforcement and fallback resolution
- Action intake, validation, and normalization (NoAction degradation)
- Ruleset selection and application (versioned, configuration-driven)
- Real-time battle communication to clients (SignalR)
- Active battle state (Redis, Lua-scripted CAS)
- Canonical record of completed battles (Postgres)
- `battle` PostgreSQL schema

**Does not own:**
- Player identity, stats, or progression (receives frozen snapshots)
- Match lifecycle or player pairing decisions (Matchmaking triggers creation)
- Post-battle progression updates (Players owns this)
- Combat stat definitions or stat growth (Players owns authoritative values)

**Key property:** Battle is the sole authority on combat outcomes. Given participants and actions, no other service may compute, override, or second-guess the result.

### Responsibility Alignment Verification

| Responsibility | Owner | Verified Consistent |
|---|---|---|
| Character data authority | Players | Yes |
| IsReady derivation | Players | Yes |
| IsReady enforcement for queue | Matchmaking | Yes |
| Combat profile projection | Matchmaking (local read model) | Yes |
| Snapshot building for battle | Matchmaking | Yes |
| Battle creation decision | Matchmaking | Yes |
| BattleId generation | Matchmaking | Yes |
| Combat resolution | Battle | Yes |
| Battle outcome authority | Battle | Yes |
| XP/progression from outcomes | Players | Yes |
| Win/loss tracking | Players | Yes |

No ownership conflicts found between the three target architectures on core responsibilities.

---

## 3. End-to-End Flows

### Flow 1: Player Onboarding -> Ready -> Matchmaking

```
Player                   Players                    Matchmaking
  |                         |                           |
  |-- Keycloak login ------>|                           |
  |   (get JWT)             |                           |
  |                         |                           |
  |-- POST /ensure -------->|                           |
  |   (create character)    | Character(Draft)          |
  |                         |-- publish PCPC* --------->|
  |                         |   (IsReady=false)         | upsert projection
  |                         |                           |
  |-- POST /character/name->|                           |
  |   (set name)            | Character(Named)          |
  |                         |-- publish PCPC ---------->|
  |                         |   (IsReady=false)         | upsert projection
  |                         |                           |
  |-- POST /stats/allocate->|                           |
  |   (allocate points)     | Character(Ready)          |
  |                         |-- publish PCPC ---------->|
  |                         |   (IsReady=true)          | upsert projection
  |                         |                           |
  |-- POST /queue/join -----|-------------------------->|
  |                         |                           | check IsReady from projection
  |                         |                           | check no active match (Postgres)
  |                         |                           | atomic Redis SADD + RPUSH
  |                         |                           | set status = Searching
  |                         |                           |
```
*PCPC = PlayerCombatProfileChanged

**Weak points identified:**
1. **CRITICAL: Players has no transactional outbox.** If `PlayerCombatProfileChanged` publication fails after Character save, Matchmaking's projection never receives `IsReady=true`. The player is permanently blocked from matchmaking with no recovery path. **This is the highest-priority production gap across the entire system.**
2. **No reconciliation mechanism.** If the projection diverges, there is no way to request a re-publish from Players. A periodic "heartbeat" or reconciliation command should be a future enhancement.
3. **Profile race at queue join.** If a player joins the queue before Matchmaking's consumer has processed the latest `PlayerCombatProfileChanged`, the join could fail (stale `IsReady=false`). This is bounded by event propagation delay (sub-second typically) and is acceptable - the player retries.

### Flow 2: Queue -> Match -> Battle Creation

```
Matchmaking                              Battle
  |                                        |
  | MatchmakingWorker tick (100ms)         |
  | acquire lease (Redis SET NX PX)        |
  | Lua script: pop pair from queue        |
  |   (skip canceled, verify not queued)   |
  |                                        |
  | load combat profiles from Postgres     |
  |   projection for both players          |
  |                                        |
  | BEGIN TRANSACTION                      |
  |   create Match(BattleCreateRequested)  |
  |   write CreateBattle to outbox         |
  | COMMIT                                 |
  |                                        |
  | set both players status = Matched*     |
  |                                        |
  | outbox dispatches CreateBattle -------->|
  |                                        | CreateBattleConsumer:
  |                                        |   create BattleEntity (Postgres)
  |                                        |   init Redis state (SETNX)
  |                                        |   open Turn 1 (Lua script)
  |                                        |   publish BattleCreated
  |                                        |
  | BattleCreatedConsumer: <---------------|
  |   CAS: BattleCreateRequested           |
  |       -> BattleCreated                 |
  |                                        |
```
*Target fix: Currently missing. Players status not updated to Matched after match creation.

**Weak points identified:**
1. **Missing Matched status update.** Known bug. After match creation, both players' Redis status should be set to Matched. Without this, a player could re-join the queue while in an active match. The application-level check (active match in Postgres) prevents actual double-matching, but the UX is wrong.
2. **Silent player discard on profile miss.** Known bug. If a popped player's combat profile is missing from the projection, both players are discarded. Target fix: return both to queue head (LPUSH).
3. **Custom outbox in Matchmaking.** The custom outbox has limited retry logic and no dead-letter handling. Target: replace with MassTransit outbox.
4. **BattleCreateRequested timeout (60s).** If Battle's consumer is slow or the message is delayed, the match times out and both players are freed. The timeout is aggressive but acceptable given that CreateBattle processing should be sub-second.

### Flow 3: Battle Execution -> Completion -> Progression

```
Client A    Client B    Battle                    Matchmaking    Players
  |           |           |                          |             |
  |-- SignalR join ------>|                          |             |
  |           |-- join -->|                          |             |
  |           |           | (Turn N open, deadline)  |             |
  |           |           |                          |             |
  |-- action ----------->| Redis SETNX (first-write-wins)         |
  |           |-- action->| Redis SETNX              |             |
  |           |           |                          |             |
  |           |           | Both submitted:          |             |
  |           |           |   CAS: TurnOpen->Resolving             |
  |           |           |   BattleEngine.ResolveTurn (pure fn)   |
  |           |           |   commit result to Redis               |
  |           |           |   notify clients via SignalR           |
  |           |           |                          |             |
  |           |           | (if terminal state):     |             |
  |           |           |   write Postgres record  |             |
  |           |           |   publish BattleCompleted |             |
  |           |           |                          |             |
  |           |           | ---------------------->  |             |
  |           |           |   BattleCompletedConsumer:|             |
  |           |           |   CAS: BattleCreated     |             |
  |           |           |       -> Completed        |             |
  |           |           |   clear player status*    |             |
  |           |           |                          |             |
  |           |           | ---------------------------------------->|
  |           |           |                          |  BattleCompletedConsumer:
  |           |           |                          |    inbox check (dedup)
  |           |           |                          |    award XP (win/lose)
  |           |           |                          |    update win/loss
  |           |           |                          |    publish PCPC**
  |           |           |                          |             |
  |           |           |                          |<------------|
  |           |           |                          | consumer:   |
  |           |           |                          | upsert projection
```
*Target fix: Status clear must be conditional on CAS success.
**CRITICAL: Players publishes PCPC without outbox - event can be lost.

**Weak points identified:**
1. **CRITICAL: Players' post-battle event publication is not transactional.** After awarding XP and updating win/loss, Players publishes `PlayerCombatProfileChanged` directly (no outbox). If publication fails, Matchmaking's projection has stale stats. Combined with the pre-battle gap (Flow 1), this means **both ends of the combat lifecycle have event-loss risk**.
2. **Unconditional status clear.** Known bug. Matchmaking's `BattleCompletedConsumer` clears Redis status unconditionally. If the CAS fails (match already terminal from timeout), clearing status could remove a status set by a re-queue.
3. **Draw handling uncertainty.** `BattleCompleted` with null winner/loser (draw). Players' consumer must handle this case. Not verified in code. If it doesn't, draws cause unhandled exceptions in Players.
4. **Battle self-consumption pattern.** Battle publishes `BattleCompleted` then consumes it from the bus to update its own Postgres record. This adds a failure mode (if RabbitMQ is down, Battle's own read model diverges). Target: replace with direct Postgres write.
5. **Stuck-in-Resolving.** If the resolver crashes after CAS but before committing, the battle is permanently stuck. No recovery mechanism exists today. Target: watchdog timeout + re-resolve.

---

## 4. Integration Model

### Events

| Event | Owner | Publishers | Consumers | Transport |
|---|---|---|---|---|
| `PlayerCombatProfileChanged` | Players | Players | Matchmaking | MassTransit pub/sub |
| `BattleCreated` | Battle | Battle | Matchmaking | MassTransit pub/sub |
| `BattleCompleted` | Battle | Battle | Matchmaking, Players | MassTransit pub/sub |
| `MatchCreated` (new) | Matchmaking | Matchmaking | Future consumers | MassTransit pub/sub |
| `MatchCompleted` (new) | Matchmaking | Matchmaking | Future consumers | MassTransit pub/sub |

### Commands

| Command | Sender | Receiver | Transport |
|---|---|---|---|
| `CreateBattle` | Matchmaking | Battle | MassTransit send-to-queue |

### Contract Ownership Rules

1. **The publisher defines the contract schema.** `PlayerCombatProfileChanged` uses Players' terminology. `BattleCompleted` uses Battle's terminology.
2. **Command contracts are defined by the receiver** (the service that knows how to process them). `CreateBattle` and `BattleParticipantSnapshot` live in `Kombats.Battle.Contracts`.
3. **Contracts are project references within the monorepo.** No NuGet packages, no schema registry. Compile-time type safety via project references.
4. **Contract evolution is additive-only.** New fields are added; existing fields are never removed or renamed. A `Version` field on events enables consumers to detect schema generation.
5. **Breaking changes require a new event type** (e.g., `PlayerCombatProfileChangedV2`), not a modification of the existing type.

### Contract Shapes (Aligned)

**PlayerCombatProfileChanged** (Players -> Matchmaking):
```
MessageId: Guid, IdentityId: Guid, CharacterId: Guid,
Name: string, Level: int,
Strength: int, Agility: int, Intuition: int, Vitality: int,
IsReady: bool, Revision: int, OccurredAt: DateTimeOffset,
Version: int (NEW - must add, starts at 1)
```

**CreateBattle** (Matchmaking -> Battle):
```
BattleId: Guid, MatchId: Guid, RequestedAt: DateTimeOffset,
PlayerA: BattleParticipantSnapshot, PlayerB: BattleParticipantSnapshot
```

**BattleParticipantSnapshot**:
```
CharacterId: Guid, IdentityId: Guid, Name: string,
Level: int, Strength: int, Agility: int, Intuition: int,
Vitality: int (aligned: uses Players' terminology)
```

**BattleCreated** (Battle -> Matchmaking):
```
BattleId: Guid, MatchId: Guid,
PlayerAId: Guid, PlayerBId: Guid, OccurredAt: DateTimeOffset
```

**BattleCompleted** (Battle -> Matchmaking, Players):
```
BattleId: Guid, MatchId: Guid, MessageId: Guid,
WinnerIdentityId: Guid?, LoserIdentityId: Guid?,
Reason: BattleEndReason, OccurredAt: DateTimeOffset,
Version: int (currently 1),
TurnCount: int (NEW), DurationMs: int (NEW),
RulesetVersion: int (NEW)
```

### Versioning Strategy

**Decision: Additive-only evolution with Version field, enforced by compile-time project references.**

All integration events carry a `Version` field (integer, starting at 1). This field is informational for now - consumers do not branch on it. When a contract is expanded with new additive fields, Version is incremented. Consumers log a warning on unknown versions. If a truly breaking change is ever needed, a new event type is created.

This is sufficient for a monorepo where all services are co-deployed. If services are later split into separate repos, a schema registry or contract testing framework should be adopted.

---

## 5. Data Ownership Model

### Authoritative Data

| Data | Authoritative Owner | Storage |
|---|---|---|
| Character identity binding | Players | `players.characters` |
| Character name | Players | `players.characters` |
| Character onboarding state | Players | `players.characters` |
| Combat stats (Str/Agi/Int/Vit) | Players | `players.characters` |
| XP, Level, Progression | Players | `players.characters` |
| Win/Loss record | Players | `players.characters` |
| IsReady | Players | Derived from `OnboardingState` |
| Match state and lifecycle | Matchmaking | `matchmaking.matches` |
| Queue state | Matchmaking | Redis (DB 1) |
| Active battle state | Battle | Redis (DB 0) |
| Completed battle record | Battle | `battle.battles` |
| Combat resolution results | Battle | Redis (during) + Postgres (after) |
| Player identity | Keycloak | External |

### Projected (Replicated) Data

| Data | Source | Projection Location | Mechanism | Staleness Bound |
|---|---|---|---|---|
| Player combat profile | Players | Matchmaking `player_combat_profiles` | `PlayerCombatProfileChanged` event | Event propagation delay (sub-second typical) + outbox dispatch interval |
| Player match status | Matchmaking (Postgres) | Matchmaking (Redis) | Application-level cache | Redis TTL (30min) + explicit updates |
| Battle outcome -> match state | Battle | Matchmaking `matches` | `BattleCompleted` event | MassTransit retry window (up to 10min with redelivery) |
| Battle outcome -> character stats | Battle | Players `characters` | `BattleCompleted` event | MassTransit retry window |

### Data That Must NEVER Be Shared Directly

1. **No cross-schema database queries.** Services must not read or write another service's PostgreSQL schema.
2. **No shared Redis keys.** Battle uses Redis DB 0 with `battle:*` prefix. Matchmaking uses Redis DB 1 with `mm:*` prefix. These must never cross.
3. **No direct service-to-service HTTP calls for data.** All data flows through events/commands.
4. **No shared mutable state.** Each service owns its state exclusively.

### Cache vs Authoritative

| Data | Cache? | Authority |
|---|---|---|
| Matchmaking `player_combat_profiles` | **Yes** - eventually consistent projection | Players `characters` |
| Matchmaking Redis player status | **Yes** - performance cache with TTL | Matchmaking Postgres `matches` |
| Battle Redis active state | **No** - this IS the authoritative state during battle | Redis (with Postgres as durable record after completion) |

---

## 6. Infrastructure Model

### Database: Single PostgreSQL Instance, Schema-Per-Service

**Configuration:** PostgreSQL 16, single instance (`kombats` database), three schemas:
- `players` - Character aggregate, inbox
- `matchmaking` - Matches, player combat profiles projection, custom outbox, MassTransit inbox/outbox
- `battle` - Battle records, MassTransit inbox/outbox

**Assessment: Correctly used.** Schema isolation provides logical separation while sharing operational infrastructure. No cross-schema queries observed in code. Each service's EF Core DbContext is scoped to its schema.

**Production concern:** All three services share a single Postgres instance. A slow query or migration in one service can affect others. For production, consider:
- Connection pool limits per service
- Separate Postgres instances per service if load warrants it (but not required initially)

### Message Broker: RabbitMQ

**Configuration:** RabbitMQ 3.13 with management UI. Single instance, default vhost (`/`), guest credentials (dev only).

**Topology:**
- Exchange naming: `combats.{event-name}` (kebab-case, prefixed with `combats`)
- Queue naming: `{service}.{consumer-name}`
- Entity name mappings provide explicit routing overrides

**MassTransit features used:**
- Exponential retry (5 attempts, 200ms-5000ms)
- Delayed redelivery (30s, 120s, 600s)
- Transactional outbox (Battle, Matchmaking target)
- Consumer inbox (Battle, Matchmaking)
- Delayed message scheduler

**Assessment: Correctly configured.** The shared messaging library (`Kombats.Messaging`, currently named `Kombats.Infrastructure.Messaging` in the repo) provides consistent configuration. **Exception: Players uses a simplified messaging setup and must migrate to the shared library.**

### Redis

**Configuration:** Redis 7 with AOF persistence, single instance.

**Usage separation:**
- DB 0: Battle (active battle state, deadlines, locks, actions)
- DB 1: Matchmaking (queues, player status, lease locks)

**Assessment: Correctly separated.** Redis DB index isolation is sufficient for logical separation. Key prefixes (`battle:*`, `mm:*`) provide additional safety.

**Production concern:** Single Redis instance is a single point of failure. Both Battle and Matchmaking have hard dependencies on Redis. Sentinel should be evaluated for HA. Cluster mode is complex due to Lua script multi-key requirements.

### Identity: Keycloak

**Configuration:** Keycloak 26.0, realm `kombats`, audience `account`.

**Integration model:**
- Keycloak issues JWT tokens to clients
- Players validates JWT and extracts IdentityId, binds to Character
- Matchmaking must validate JWT (currently missing - security gap)
- Battle uses JWT for SignalR hub auth (has dev bypass that must be removed)
- Service-to-service messaging is trusted (no per-message auth)

**Assessment: Identity model is correct but inconsistently applied.** All HTTP-facing services must configure JWT Bearer auth from Keycloak using a shared configuration pattern.

### Deployment Model

**Current:** Docker Compose for local development. Services are commented out (run from IDE). Infrastructure runs in containers.

**Dockerfiles:** All three services use identical multi-stage builds (.NET 10 SDK -> runtime). Ports 8080/8081.

**Assessment: Dev-only. No production deployment model exists yet.** This is expected at this stage.

---

## 7. Cross-Service Issues

### Issue 1: Vitality/Stamina Naming Conflict (RESOLVED)

**Conflict:** Battle's target architecture says "align to Stamina in the contract." Players' target architecture says "keep Vitality in the contract; Battle does domain translation."

**Resolution: Use Vitality in all contracts. Battle maps internally.**

Rationale: The publisher (Players) defines contract terminology. Each bounded context uses its own ubiquitous language. Players says "Vitality" because that's the character stat. Battle internally translates Vitality to Stamina because that's how combat formulas reference it. The `HpPerEnd` config key is a formula coefficient name, not a stat name.

**Action required:**
- `BattleParticipantSnapshot` uses `Vitality` (already does)
- Battle's mapping code translates `Vitality` -> `Stamina` internally (already does)
- Battle's target architecture is updated to reflect this decision (contract keeps Vitality)
- Document this in the `BattleParticipantSnapshot` contract as intentional

### Issue 2: Outbox Pattern Inconsistency (RESOLVED)

**Conflict:** Three different outbox states:
- Battle: MassTransit EF Core outbox (working)
- Matchmaking: Custom outbox with manual dispatcher (working, but limited)
- Players: No outbox (CRITICAL gap)

**Resolution: Standardize on MassTransit EF Core transactional outbox across all services.**

Rationale:
- Battle already uses it successfully
- MassTransit outbox supports both `Publish` and `Send` within transactions
- Eliminates Matchmaking's custom outbox code (table, writer, dispatcher, worker)
- Provides Players with a proven, production-grade outbox
- Single operational model to monitor and troubleshoot
- Inbox/outbox table structure is consistent across services

**Prerequisite:** Validate that MassTransit's `ISendEndpoint.Send()` works within the EF Core transactional outbox (for Matchmaking's `CreateBattle` command). Both Matchmaking and Battle target architectures flag this as an open question. **This must be validated empirically before implementation.**

**Fallback:** If MassTransit outbox does not support `Send`, Matchmaking retains its custom outbox (constrained), and Players uses MassTransit outbox for `Publish` only.

### Issue 3: Messaging Infrastructure Divergence (RESOLVED)

**Conflict:** Players uses simplified `MessageBusExtensions` in `Kombats.Shared`. Matchmaking and Battle use `Kombats.Messaging` (currently `Kombats.Infrastructure.Messaging` in the repo).

**Resolution: Players migrates to `Kombats.Messaging`.**

Rationale: The shared messaging library provides outbox support, inbox idempotency, entity name conventions, topology configuration, retry/redelivery, and health checks. Players needs all of these. Maintaining a separate simplified messaging setup creates operational divergence.

### Issue 4: Auth Configuration Inconsistency (RESOLVED)

**Conflict:**
- Players: JWT Bearer auth configured (Keycloak)
- Matchmaking: No auth (accepts playerId from request body - security vulnerability)
- Battle: Dev auth bypass middleware for SignalR

**Resolution: All HTTP-facing services use shared JWT Bearer configuration.**

- Shared auth configuration pattern: Authority = Keycloak realm URL, Audience from config
- Matchmaking adds `[Authorize]` and extracts playerId from JWT claims
- Battle removes `DevSignalRAuthMiddleware` from production builds
- Service-to-service messaging remains trusted (no per-message auth)

### Issue 5: Auto-Migration on Startup (RESOLVED)

**Conflict:** All three services run `Database.MigrateAsync()` on startup.

**Resolution: Remove auto-migration from all services. Migrations run in CI/CD.**

Rationale: Multi-instance deployments race on migrations. Slow migrations block startup. Failed migrations crash the application. All three target architectures agree on this.

### Issue 6: Health Check Inconsistency (RESOLVED)

**Conflict:** Players returns 200 OK unconditionally. Matchmaking and Battle have no health checks.

**Resolution: All services implement standard ASP.NET Core health checks.**

Required probes per service:
- **Players:** PostgreSQL, RabbitMQ
- **Matchmaking:** PostgreSQL, Redis, RabbitMQ
- **Battle:** PostgreSQL, Redis, RabbitMQ

Expose at `/health/live` (liveness) and `/health/ready` (readiness with dependency checks).

### Issue 7: BattleCompleted Draw Handling Gap (RESOLVED)

**Potential conflict:** Battle publishes `BattleCompleted` with `WinnerIdentityId = null` and `LoserIdentityId = null` for draws. Players' consumer awards XP and win/loss progression based on winner/loser identity. **If Players' consumer doesn't handle the null case, draws cause exceptions or inconsistent progression.**

**Resolution:** Draws remain draws at the battle outcome level, but for progression and win/loss purposes they are treated as loss-equivalent for both players. XP for draw is 0 unless explicitly changed later.

**Implementation consequence:** Players' `BattleCompletedConsumer` must explicitly handle `WinnerIdentityId = null` / `LoserIdentityId = null` without throwing and must apply the agreed draw progression policy.

---

## 8. System Risks

### RISK-S1: Event Loss in Players (CRITICAL)

**Description:** Players publishes `PlayerCombatProfileChanged` directly after `SaveChangesAsync()` without a transactional outbox. If publication fails, the event is lost permanently. Matchmaking's projection becomes stale with no recovery path.

**Impact:** Player blocked from matchmaking (stale IsReady=false), or fights with stale stats (wrong snapshot). No self-healing mechanism exists.

**Affected flows:** ALL flows. This is the single highest-severity production risk.

**Mitigation:** Implement transactional outbox in Players (MassTransit EF Core outbox). This is the #1 priority infrastructure change.

### RISK-S2: Stuck Battles with No Recovery (HIGH)

**Description:** If the resolver crashes after CAS (TryMarkTurnResolving) but before committing the result, the battle is stuck in Resolving phase. The deadline worker skips non-TurnOpen battles. No recovery mechanism exists.

**Impact:** Affected players are permanently locked in a battle that will never complete. Redis memory grows. Matchmaking's match state diverges.

**Mitigation:** Implement resolving-phase watchdog (timeout + re-resolve). Implement orphan cleanup sweep (max battle lifetime + force-end).

### RISK-S3: Lost BattleCompleted Causes Permanent Player Lock (HIGH)

**Description:** If `BattleCompleted` is lost (after MassTransit retry exhaustion), the Matchmaking match stays in `BattleCreated` forever. Both players' Redis status is never cleared. Postgres shows an active match, blocking re-queue.

**Impact:** Two players permanently unable to play until manual intervention.

**Current mitigation:** MassTransit retry (5 attempts) + redelivery (30s, 120s, 600s). But if all retries fail, the match is stuck.

**Target mitigation:** New `BattleCreatedTimeoutWorker` in Matchmaking that times out matches stuck in `BattleCreated` for >10 minutes. This provides a safety net beyond MassTransit's retry window.

### RISK-S4: Redis Failure Loses Active Battles (HIGH)

**Description:** Redis is the source of truth for active battle state. A full Redis failure (without persistence) loses all in-progress battles.

**Impact:** All active battles are lost. Players see "battle not found" on reconnect.

**Mitigation:**
- Require Redis AOF persistence in production (ops requirement)
- On reconnection/startup, run orphan sweep: find non-terminal Postgres battles with no Redis state, force-end them, publish BattleCompleted
- Accept that a Redis failure is a rare catastrophic event; focus on bounded recovery, not zero-loss

### RISK-S5: Queue Player Loss on Profile Miss (MEDIUM)

**Description:** When Matchmaking pops a pair and one player's combat profile is missing from the projection, both players are silently discarded from the queue. Known bug.

**Impact:** Players lose their queue position with no notification. They must re-join manually without understanding why.

**Mitigation:** Return both players to queue head (LPUSH) on profile miss. Log a warning. Add a pop-attempt counter to detect permanently unresolvable entries.

### RISK-S6: Stale Player Status After Match Creation (MEDIUM)

**Description:** Matchmaking creates a match but doesn't update Redis player status to "Matched." Known bug.

**Impact:** Player's queue status shows "Searching" when they're actually matched. Confusing UX. Could allow a second queue join attempt (blocked by Postgres active-match check, but the error is confusing).

**Mitigation:** Set player status to Matched immediately after successful match creation transaction.

### RISK-S7: Single Redis Instance (MEDIUM)

**Description:** Both Battle and Matchmaking have hard dependencies on a single Redis instance. No HA configuration.

**Impact:** Redis failure stops all matchmaking (queue operations fail) and all battles (state operations fail).

**Mitigation:** Deploy Redis with Sentinel for automatic failover. Current Lua scripts are compatible with Sentinel (single-master). Cluster mode requires key hash tag changes.

### RISK-S8: Unconditional Status Clear on BattleCompleted (LOW-MEDIUM)

**Description:** Matchmaking's `BattleCompletedConsumer` clears Redis player status regardless of whether the CAS transition succeeds.

**Impact:** If the match was already timed out and the player re-queued, clearing status removes their "Searching" status. Minor but causes inconsistent UX.

**Mitigation:** Make status clear conditional on CAS success.

---

## 9. Final Architecture Decisions

### Decision 1: Transactional Outbox via MassTransit EF Core Outbox (All Services)

All three services use MassTransit's built-in EF Core transactional outbox for event/command publication. This eliminates event-loss risk and provides a single operational model.

- **Battle:** Already uses it. No change.
- **Matchmaking:** Replaces custom outbox. Removes `matchmaking_outbox_messages` table, `OutboxWriter`, `OutboxDispatcherService`, `OutboxDispatcherWorker`. `CreateBattle` command sent via `ISendEndpoint.Send()` within transaction.
- **Players:** Adds outbox where none exists. Highest priority change.

**Prerequisite:** Validate MassTransit `Send` within outbox transaction (for Matchmaking). Blocks Matchmaking migration but not Players.

### Decision 2: Contract Terminology Follows Publisher's Ubiquitous Language

- `PlayerCombatProfileChanged` uses Players' terms: Strength, Agility, Intuition, **Vitality**
- `BattleCompleted` uses Battle's terms: `BattleEndReason`, etc.
- `BattleParticipantSnapshot` uses Players' terms (it carries player data): **Vitality**
- Battle internally maps `Vitality -> Stamina`. This is Battle's domain translation, not a contract concern.

No cross-service term normalization. Each bounded context speaks its own language. Contracts use the publisher's vocabulary.

### Decision 3: Identity Model - Keycloak JWT, No New Auth Service

- Keycloak is the sole identity provider
- All HTTP-facing services validate JWT (shared auth configuration)
- IdentityId is extracted from JWT claims
- Players binds IdentityId to Character; this binding is immutable
- Service-to-service messaging is trusted (no per-message auth)
- No new auth service or identity aggregation service is introduced

### Decision 4: Readiness Ownership Split

- **Players derives** `IsReady` (domain property on Character, derived from `OnboardingState`)
- **Players publishes** `IsReady` in `PlayerCombatProfileChanged`
- **Matchmaking enforces** `IsReady` for queue eligibility (from local projection)
- **Matchmaking does NOT derive** readiness. It consumes a boolean.
- If readiness rules change (e.g., minimum level), the change happens in Players' domain. Matchmaking's enforcement is unchanged.

### Decision 5: Stat Authority Boundaries

- **Players:** Authoritative owner of stat values (Str/Agi/Int/Vit). Defines what a character's stats ARE.
- **Battle:** Authoritative owner of how stats affect combat (damage formulas, HP calculation, dodge/crit curves). Defines what stats DO.
- **Matchmaking:** Holds a projection of stat values. Passes snapshots to Battle. Does not interpret or modify stats.
- **Contract:** Carries stat values as integers. No interpretation at the contract level.

### Decision 6: Event Versioning - Additive-Only with Version Field

All integration events carry a `Version: int` field (starting at 1). Evolution is additive-only. Breaking changes require a new event type. Consumers tolerate unknown fields. Compile-time project references provide type safety within the monorepo.

No schema registry. No runtime version branching (yet). This is sufficient for co-deployed monorepo services.

### Decision 7: Single PostgreSQL Database with Schema Isolation

Retained. Each service owns its schema. No cross-schema access. Connection strings point to the same database instance but EF Core contexts are scoped to their schema.

If load grows to require separation, each schema can be migrated to its own database instance with connection string changes only. No code changes required.

### Decision 8: Redis Topology - Sentinel for Production

Single Redis instance for development. Redis Sentinel for production HA. Not Cluster (Lua script multi-key requirements make Cluster complex and the data volume doesn't warrant sharding).

Battle uses DB 0 with `battle:*` key prefix. Matchmaking uses DB 1 with `mm:*` key prefix.

### Decision 9: No Synchronous Service-to-Service Communication

Services interact only through async messaging (RabbitMQ). No HTTP calls between services. No gRPC. No shared databases. This is already the case and must remain so.

Exception: If a reconciliation mechanism is needed in the future (Matchmaking queries Battle for match status), it would be the only synchronous path and should be explicitly designed as a fallback, not a primary integration.

---

## 10. Resolved Decisions and Remaining Questions

This section captures decisions that have now been explicitly resolved, along with the remaining item that still requires sequencing and further specification. Some of these are game/product decisions, while others are engineering/platform decisions.

### D-1: Battle Termination Model

Previous Question:
Should battles have a maximum turn count, or should they be bounded only by inactivity/time rules?

Decision:
There is no maximum turn count.
Battle duration is bounded by inactivity rules instead:
- each turn has a 30-minute timer;
- if a player does not act within the timer, that turn is skipped;
- if both players fail to act for 10 consecutive turns, both players lose.

Rationale:
The intended game design does not impose a hard turn cap. Battles are terminated through inactivity handling rather than by turn-count exhaustion.

Impact:
This affects BattleEngine termination rules, timeout handling, and battle end semantics.
Architecture and implementation must model inactivity-driven termination, not turn-limit-driven termination.

Current Code Alignment:
This behavior already exists in the current code and should be reflected accurately in the architecture package unless intentionally changed later.

Status:
Decided

---

### D-2: Four-Stat Model Scope

Previous Question:
Are Strength, Agility, Intuition, and Vitality the permanent stats?

Decision:
The production stat model is currently fixed to four stats: Strength, Agility, Intuition, and Vitality.
Additional stats may be introduced in the future, but this is not a near-term requirement.

Rationale:
The current game design is built around four stats. Future expansion should remain possible, but v1 should optimize for the existing model.

Impact:
Players schema, Matchmaking projections, and Battle formulas should assume the four-stat model in v1, while avoiding unnecessary rigidity that would make future additive expansion difficult.

Status:
Decided for v1

---

### D-3: Matchmaking Model for v1

Previous Question:
Is rating/MMR-based matchmaking a near-term requirement?

Decision:
No. Current matchmaking for v1 is FIFO with level-based filtering.
Players should currently be matched only against players of the same level.
MMR/rating-based matchmaking is a future extension and must not be implemented now.

Rationale:
The immediate requirement is a simple production-ready matchmaking flow, not a rating system.

Impact:
Current queue design and pairing logic should support FIFO plus level filtering.
Architecture should allow future extension toward MMR/rating-based matchmaking without forcing a redesign now.

Status:
Decided for v1

---

### D-4: Character Ownership Model

Previous Question:
Will a single identity ever own multiple characters?

Decision:
No. One player identity maps to exactly one character.

Rationale:
Multi-character support is not part of the intended model.

Impact:
Players should keep a strict 1:1 identity-to-character model.
Architecture and schema do not need to prepare for character selection or multiple owned characters.

Status:
Decided

---

### D-5: Variant Semantics

Previous Question:
Are variants only queue namespaces, or do they represent different battle rules?

Decision:
Variants may represent different battle rules.
The planned variants are:
- fist-only combat;
- weapon-based combat.

For v1, only fist-only combat is in scope.
Architecture must allow future extension to weapon-based combat without redesigning the system.

Rationale:
Variants are not just queue namespaces. They can carry different battle semantics.
However, only one variant is required for the initial implementation.

Impact:
The architecture must not hardcode a forever-single-rule-set design.
Variant-specific rules should be extensible, even though only fist-only combat is implemented now.

Status:
Decided for v1 and future direction

---

### D-6: Redis Persistence Baseline

Previous Question:
What Redis persistence mode should production use?

Decision:
Production Redis should use AOF with fsync every second.

Rationale:
This gives a pragmatic durability/performance balance for active battle hot state and limits data-loss exposure to an acceptable window.

Impact:
Infrastructure configuration must reflect AOF persistence.
Battle and Matchmaking recovery logic must still tolerate Redis loss, staleness, or partial hot-state loss, since Redis is not the ultimate system of record.

Status:
Decided

---

### D-7: Win/Loss Ownership

Previous Question:
Should win/loss tracking move from Players to a separate stats service?

Decision:
No. Win/loss tracking remains in Players for now.
A dedicated stats service should only be considered if the system later requires MMR, ELO, seasonal rankings, leaderboards, or a broader statistics-specific bounded context.

Rationale:
A separate stats service would be premature at the current stage.

Impact:
Players remains the authority for win/loss tracking in the current architecture.
This may be revisited only if a distinct statistics bounded context emerges later.

Status:
Decided for current architecture stage

---

### D-8: Observability Baseline

Previous Question:
What monitoring and observability stack should be used?

Decision:
The observability baseline should be OpenTelemetry.

Rationale:
It is vendor-neutral, already partially present in the codebase, and supports future backend choice without locking architecture to a specific vendor.

Impact:
Instrumentation should be standardized across all services using OpenTelemetry-compatible tracing, metrics, and correlated logging.
The final exporter/backend choice can be decided separately.

Status:
Decided

---

### D-9: Draw Result and Progression Policy

Previous Question:
How should draws affect progression and results?

Decision:
A draw remains a draw at the battle outcome level, but for progression and win/loss purposes it is treated as loss-equivalent for both players.
Both players receive loss-equivalent progression treatment on draw.
XP for draw is 0 unless explicitly changed later.

Rationale:
The game design does not reward passive or unresolved outcomes.

Impact:
Battle outcome contracts and Players reward/progression logic must distinguish between:
- battle outcome semantics;
- progression and win/loss consequences.

This must be reflected clearly in contracts and implementation to avoid conflating draw as a battle outcome with draw as a progression reward case.

Status:
Decided

---

### D-10: Battle Determinism and Randomization Guarantees

Decision:
Battle resolution is a deterministic architectural property of the Battle service.

A single seed is generated per battle at creation time and persisted as part of battle state. Random values used during combat are then deterministically derived per turn and per attack direction. For the same persisted battle state, ruleset, participants, actions, and turn index, combat resolution must always produce the same outcome.

Confirmed guarantees from the current implementation:
- battle randomness is seeded once per battle and then deterministically derived per turn;
- each attack direction within a turn uses an independent RNG stream, so A→B and B→A do not interfere with each other;
- combat outcome does not depend on wall-clock time, retry timing, process timing, or which resolver instance performs recovery;
- retries, lease recovery, and re-resolution after a crash do not change combat outcome as long as persisted inputs are unchanged;
- combat arithmetic is deterministic and must remain deterministic.

Boundary:
This guarantee applies to combat outcome, HP changes, and turn-resolution results.
It does not imply byte-for-byte reproducibility of all emitted event metadata, because observational metadata such as timestamps may still be generated from wall-clock time.

Rationale:
Deterministic combat resolution is required for fairness, retry safety, recovery safety, debugging, and future replay/audit capabilities.
This is not an implementation convenience. It is a correctness property of the combat subsystem.

Impact:
Any future change to RNG derivation, RNG consumption order, combat arithmetic, or turn-resolution sequencing must be treated as compatibility-sensitive.
Refactors may improve structure, but they must preserve deterministic combat guarantees.

Status:
Decided

---

### Remaining Open Item: Durable Replay and Turn History

Question:
Should Kombats support durable replay verification or replay reconstruction beyond active Redis-resident battle state?

Reason It Remains Open:
The battle engine is deterministic, but durable replay requires persistent turn-action history and an explicit replay contract.
These are not yet part of the implemented system baseline.

What Must Be Clarified:
- whether durable replay is a required product or operational capability;
- when persistent turn-action history must be introduced;
- what replay verification means operationally;
- who can request or use replay data;
- whether replay compares recomputed outcome only or full emitted artifacts.

Status:
Open pending planning and sequencing

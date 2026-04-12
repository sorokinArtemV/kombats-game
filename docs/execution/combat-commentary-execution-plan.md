# Combat Commentary System — Execution Plan

**Status:** Approved for implementation
**Created:** 2026-04-12
**Architecture:** Approved — do not reopen

---

## Summary

Six-batch implementation of a player-facing battle feed / combat commentary system.

- **Battle** stores participant metadata (names, max HP) and turn-level semantic history in its existing PostgreSQL schema. Exposes an internal HTTP endpoint for history retrieval.
- **BFF** renders narration text from Battle's structured data using a deterministic template-based pipeline. Sends `BattleFeedUpdated` events over SignalR during live battles. Serves post-match feed via HTTP by calling Battle's history endpoint and rendering on the fly.
- **BFF has no database.** It is a stateless rendering/relay layer.
- **Battle domain layer is untouched.** Names and max HP are infrastructure-level metadata that travel alongside domain state but never inside `BattleDomainState`.

---

## Parallelization

```
Track A (Battle):  Batch 1 → Batch 2 → Batch 3
Track B (BFF):     Batch 4
Merge:             Batch 5 (depends on 1 + 4)
                   Batch 6 (depends on 3 + 4)
                   Batch 5 and Batch 6 are independent of each other
```

Recommended execution:

1. Start Batch 1 and Batch 4 in parallel
2. After Batch 1 completes: Batch 2 → Batch 3
3. After Batch 1 + Batch 4 complete: Batch 5
4. After Batch 3 + Batch 4 complete: Batch 6
5. Batch 5 and Batch 6 can run in parallel once their dependencies are met

---

## Batch 1: Battle — Participant Metadata Propagation

### Goal

Names and max HP from `BattleParticipantSnapshot` are stored in Redis state and PostgreSQL `BattleEntity`, and exposed in relevant realtime contracts. No changes to combat domain logic.

### In Scope

- Extract `Name` from `BattleParticipantSnapshot` in `CreateBattleConsumer`, pass as separate parameters (not inside `CombatProfile`)
- Write names to `BattleEntity` in PostgreSQL
- Store names and max HP in Redis `BattleState`
- Expose names and max HP in `BattleSnapshot` read model
- Add name and max HP fields to `BattleSnapshotRealtime`, `BattleStateUpdatedRealtime`, `BattleReadyRealtime`
- Map new fields through `RealtimeContractMapper` and `SignalRBattleRealtimeNotifier`

### Out of Scope

- No changes to `CombatProfile` — it remains `(Guid PlayerId, int Strength, int Stamina, int Agility, int Intuition)`
- No changes to `BattleDomainState`, `PlayerState`, `BattleEngine`, `CombatMath`, or any domain type
- No changes to `StoredStateMapper.FromDomainState` signature — names are set on `BattleState` after the mapper call

### Design Boundary: How Names Flow

`CreateBattleConsumer` extracts names from the command and passes them as separate `string?` parameters:

```
CreateBattleConsumer
  → writes BattleEntity with PlayerAName, PlayerBName, PlayerAMaxHp, PlayerBMaxHp
  → builds CombatProfile (unchanged — no name field)
  → calls HandleBattleCreatedAsync(..., profileA, profileB, playerAName, playerBName)
    → builds BattleDomainState (unchanged — no names)
    → computes derivedA.HpMax, derivedB.HpMax (already happens)
    → calls _stateStore.TryInitializeBattleAsync(battleId, domainState, playerAName, playerBName, playerAMaxHp, playerBMaxHp)
```

In `RedisBattleStateStore.TryInitializeBattleAsync`:

```
BattleState state = StoredStateMapper.FromDomainState(initialState, deadlineUtc, version: 1);
state.PlayerAName = playerAName;
state.PlayerBName = playerBName;
state.PlayerAMaxHp = playerAMaxHp;
state.PlayerBMaxHp = playerBMaxHp;
// then serialize and SETNX as before
```

`StoredStateMapper.ToSnapshot` maps the new fields from `BattleState` to `BattleSnapshot`.

### Files to Modify

| File | Change |
|---|---|
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Messaging/Consumers/CreateBattleConsumer.cs` | Extract names, compute max HP, pass as separate params to lifecycle service. Write names + max HP to BattleEntity. |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Data/Entities/BattleEntity.cs` | Add `string? PlayerAName`, `string? PlayerBName`, `int? PlayerAMaxHp`, `int? PlayerBMaxHp` |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Data/DbContext/BattleDbContext.cs` | Configure new columns (MaxLength(16) for names, nullable for all four) |
| `src/Kombats.Battle/Kombats.Battle.Application/UseCases/Lifecycle/BattleLifecycleAppService.cs` | Add `string? playerAName, string? playerBName` params to `HandleBattleCreatedAsync`. Compute max HP from `CombatMath.ComputeDerived` (already computed). Pass names + max HP to `TryInitializeBattleAsync`. |
| `src/Kombats.Battle/Kombats.Battle.Application/Ports/IBattleStateStore.cs` | Add `string? playerAName, string? playerBName, int? playerAMaxHp, int? playerBMaxHp` params to `TryInitializeBattleAsync` |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/State/Redis/RedisBattleStateStore.cs` | Accept new params, set on `BattleState` after mapper call, before serialization |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/State/Redis/BattleState.cs` | Add `string? PlayerAName`, `string? PlayerBName`, `int? PlayerAMaxHp`, `int? PlayerBMaxHp` |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/State/Redis/Mapping/StoredStateMapper.cs` | Map name + max HP fields in `ToSnapshot` |
| `src/Kombats.Battle/Kombats.Battle.Application/ReadModels/BattleSnapshot.cs` | Add `string? PlayerAName`, `string? PlayerBName`, `int? PlayerAMaxHp`, `int? PlayerBMaxHp` |
| `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts/BattleSnapshotRealtime.cs` | Add `string? PlayerAName`, `string? PlayerBName`, `int? PlayerAMaxHp`, `int? PlayerBMaxHp` |
| `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts/BattleStateUpdatedRealtime.cs` | Add `string? PlayerAName`, `string? PlayerBName`, `int? PlayerAMaxHp`, `int? PlayerBMaxHp` |
| `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts/BattleReadyRealtime.cs` | Add `string? PlayerAName`, `string? PlayerBName` |
| `src/Kombats.Battle/Kombats.Battle.Application/Ports/IBattleRealtimeNotifier.cs` | Add name params to `NotifyBattleReadyAsync`, add name + max HP params to `NotifyBattleStateUpdatedAsync` |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Realtime/SignalR/SignalRBattleRealtimeNotifier.cs` | Pass new fields through to realtime contracts |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Realtime/SignalR/RealtimeContractMapper.cs` | Map names + max HP in `ToRealtimeSnapshot` |

### Migration

`AddParticipantSnapshots` — adds 4 nullable columns to `battles` table: `player_a_name VARCHAR(16)`, `player_b_name VARCHAR(16)`, `player_a_max_hp INT`, `player_b_max_hp INT`.

### Contracts Affected

Additive nullable fields only (backward compatible):
- `BattleSnapshotRealtime` +4 fields
- `BattleStateUpdatedRealtime` +4 fields
- `BattleReadyRealtime` +2 fields

### Tests Required

- `CreateBattleConsumer`: verify names + max HP written to `BattleEntity`
- `BattleLifecycleAppService`: verify names + max HP appear in `BattleSnapshot` after initialization
- Redis round-trip: initialize with names → `GetStateAsync` → verify names + max HP in snapshot
- `RealtimeContractMapper`: verify names + max HP mapped to `BattleSnapshotRealtime`
- Null name handling: verify graceful behavior when `BattleParticipantSnapshot.Name` is null
- Update existing `BattleTurnAppService` tests and `BattleLifecycleAppService` tests that call `TryInitializeBattleAsync` to pass the new parameters

### Exit Criteria

- Names and max HP round-trip through Redis and appear in `BattleSnapshotRealtime` returned from `JoinBattle`
- Names and max HP appear in `BattleStateUpdatedRealtime` after each turn
- Names written to `BattleEntity` in PostgreSQL
- `CombatProfile` is unchanged
- `BattleDomainState` is unchanged
- All existing tests pass (updated for new parameter signatures)
- Migration applies cleanly

### Dependencies

None. First batch.

---

## Batch 2: Battle — Turn History Persistence

### Goal

Each resolved turn is durably stored in PostgreSQL in Battle's existing `battle` schema. This is a best-effort durable projection — it must not block or fail turn resolution.

### In Scope

- New `BattleTurnEntity` with flat columns for both attacks + post-turn HP
- New `IBattleTurnHistoryStore` port in Application
- EF Core implementation in Infrastructure
- Integration into `BattleTurnAppService` turn resolution flow
- Idempotent writes (upsert semantics on composite PK)

### Out of Scope

- No history retrieval endpoint (Batch 3)
- No changes to Redis state or realtime contracts
- No changes to domain layer

### Write Ordering

**For continued turns** (in `CommitAndNotifyTurnContinued`):

```
1. Redis: MarkTurnResolvedAndOpenNextAsync       ← authoritative state committed
2. PostgreSQL: PersistTurnAsync                  ← durable history (own SaveChangesAsync)
3. Redis: GetStateAsync                          ← reload for deadline
4. SignalR: notifications
```

The PostgreSQL write is wrapped in try-catch. On failure, log warning and continue to notifications. The battle is not blocked by a history write failure.

```csharp
try
{
    await _turnHistoryStore.PersistTurnAsync(
        battleId, turnIndex, turnResolved.Log,
        resolutionResult.NewState.PlayerA.CurrentHp,
        resolutionResult.NewState.PlayerB.CurrentHp,
        cancellationToken);
}
catch (Exception ex)
{
    _logger.LogWarning(ex,
        "Failed to persist turn history for BattleId: {BattleId}, Turn: {TurnIndex}. "
        + "Battle continues. Post-match feed may have a gap.",
        battleId, turnIndex);
}
```

**For battle-ending turns** (in `CommitAndNotifyBattleEnded`):

```
1. Redis: EndBattleAndMarkResolvedAsync          ← authoritative state committed
2. DbContext: Add BattleTurnEntity to tracker    ← NOT committed yet
3. SignalR: NotifyBattleEnded
4. Outbox: PublishBattleCompletedAsync            ← buffered on DbContext
5. PostgreSQL: SaveChangesAsync                  ← commits turn history + outbox atomically
```

The final turn entity is added to `BattleDbContext` change tracker and committed in the same `SaveChangesAsync` that flushes the outbox. This gives atomic turn history + `BattleCompleted` event publication.

### Entity

```csharp
public class BattleTurnEntity
{
    public Guid BattleId { get; set; }
    public int TurnIndex { get; set; }
    // A→B
    public string? AtoBAttackZone { get; set; }
    public string? AtoBDefenderBlockPrimary { get; set; }
    public string? AtoBDefenderBlockSecondary { get; set; }
    public bool AtoBWasBlocked { get; set; }
    public bool AtoBWasCrit { get; set; }
    public string AtoBOutcome { get; set; } = string.Empty;
    public int AtoBDamage { get; set; }
    // B→A
    public string? BtoAAttackZone { get; set; }
    public string? BtoADefenderBlockPrimary { get; set; }
    public string? BtoADefenderBlockSecondary { get; set; }
    public bool BtoAWasBlocked { get; set; }
    public bool BtoAWasCrit { get; set; }
    public string BtoAOutcome { get; set; } = string.Empty;
    public int BtoADamage { get; set; }
    // Post-turn state
    public int PlayerAHpAfter { get; set; }
    public int PlayerBHpAfter { get; set; }
    public DateTimeOffset ResolvedAt { get; set; }
}
```

### Port Interface

```csharp
public interface IBattleTurnHistoryStore
{
    /// <summary>
    /// Persists turn resolution. Idempotent: duplicate (battleId, turnIndex) is a no-op.
    /// </summary>
    Task PersistTurnAsync(
        Guid battleId, int turnIndex, TurnResolutionLog log,
        int playerAHpAfter, int playerBHpAfter,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Adds turn entity to DbContext change tracker without calling SaveChangesAsync.
    /// Used for battle-ending turns where the outbox flush handles the commit.
    /// </summary>
    void TrackTurn(
        Guid battleId, int turnIndex, TurnResolutionLog log,
        int playerAHpAfter, int playerBHpAfter);
}
```

### Files to Create

| File | Purpose |
|---|---|
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Data/Entities/BattleTurnEntity.cs` | Entity |
| `src/Kombats.Battle/Kombats.Battle.Application/Ports/IBattleTurnHistoryStore.cs` | Port interface |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Data/BattleTurnHistoryStore.cs` | EF Core implementation |

### Files to Modify

| File | Change |
|---|---|
| `src/Kombats.Battle/Kombats.Battle.Infrastructure/Data/DbContext/BattleDbContext.cs` | Add `DbSet<BattleTurnEntity>`, configure composite PK `(BattleId, TurnIndex)`, FK to `battles` |
| `src/Kombats.Battle/Kombats.Battle.Application/UseCases/Turns/BattleTurnAppService.cs` | Inject `IBattleTurnHistoryStore`. Call `PersistTurnAsync` in continued-turn path. Call `TrackTurn` in battle-ended path. |
| `src/Kombats.Battle/Kombats.Battle.Bootstrap/Program.cs` | Register `IBattleTurnHistoryStore` → `BattleTurnHistoryStore` |

### Migration

`AddTurnHistory` — creates `battle_turns` table with composite PK `(battle_id, turn_index)`, FK to `battles(battle_id)`.

### Contracts Affected

None.

### Tests Required

- Integration test: resolve turn → verify `BattleTurnEntity` row with correct outcomes, damage, HP
- Idempotency test: persist same `(battleId, turnIndex)` twice → one row, no exception
- Multi-turn test: resolve 3 turns → 3 rows, correct ordering
- Battle-ending turn: verify final turn persisted atomically with outbox message
- Failure resilience: mock PG failure, verify turn resolution continues and notifications fire

### Exit Criteria

- Every resolved turn produces a row in `battle_turns`
- Battle-ending turns committed atomically with outbox flush
- PG write failures do not block turn resolution or notifications
- Existing tests pass
- Migration applies cleanly

### Dependencies

Batch 1 (BattleEntity with names/max HP exists for FK context, updated test signatures).

---

## Batch 3: Battle — History Retrieval Endpoint

### Goal

HTTP endpoint for retrieving complete battle history: metadata, participant snapshots, and all persisted turns.

### In Scope

- New `GET /api/internal/battles/{battleId}/history` Minimal API endpoint
- Query handler loading `BattleEntity` + `BattleTurnEntity` rows
- Response DTO with full battle metadata + ordered turns
- Access control: JWT required, participant-only
- Wire Battle.Api endpoint infrastructure into Bootstrap (not yet wired)

### Out of Scope

- No public-facing endpoint (BFF wraps this)
- No pagination (battles are short)

### Endpoint

`GET /api/internal/battles/{battleId}/history` — `[Authorize]`

Returns 200 with `BattleHistoryResponse`, 404 if battle not found, 403 if caller is not a participant.

### Response DTO

```csharp
public sealed record BattleHistoryResponse
{
    public Guid BattleId { get; init; }
    public Guid MatchId { get; init; }
    public Guid PlayerAId { get; init; }
    public Guid PlayerBId { get; init; }
    public string? PlayerAName { get; init; }
    public string? PlayerBName { get; init; }
    public int? PlayerAMaxHp { get; init; }
    public int? PlayerBMaxHp { get; init; }
    public string State { get; init; } = string.Empty;
    public string? EndReason { get; init; }
    public Guid? WinnerPlayerId { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? EndedAt { get; init; }
    public TurnHistoryResponse[] Turns { get; init; } = [];
}

public sealed record TurnHistoryResponse
{
    public int TurnIndex { get; init; }
    public string? AtoBAttackZone { get; init; }
    public string? AtoBDefenderBlockPrimary { get; init; }
    public string? AtoBDefenderBlockSecondary { get; init; }
    public bool AtoBWasBlocked { get; init; }
    public bool AtoBWasCrit { get; init; }
    public string AtoBOutcome { get; init; } = string.Empty;
    public int AtoBDamage { get; init; }
    public string? BtoAAttackZone { get; init; }
    public string? BtoADefenderBlockPrimary { get; init; }
    public string? BtoADefenderBlockSecondary { get; init; }
    public bool BtoAWasBlocked { get; init; }
    public bool BtoAWasCrit { get; init; }
    public string BtoAOutcome { get; init; } = string.Empty;
    public int BtoADamage { get; init; }
    public int PlayerAHpAfter { get; init; }
    public int PlayerBHpAfter { get; init; }
    public DateTimeOffset ResolvedAt { get; init; }
}
```

### Files to Create

| File | Purpose |
|---|---|
| `src/Kombats.Battle/Kombats.Battle.Application/UseCases/GetBattleHistory/GetBattleHistoryQuery.cs` | Query |
| `src/Kombats.Battle/Kombats.Battle.Application/UseCases/GetBattleHistory/GetBattleHistoryHandler.cs` | Handler — loads BattleEntity + BattleTurnEntity rows |
| `src/Kombats.Battle/Kombats.Battle.Application/UseCases/GetBattleHistory/BattleHistoryResult.cs` | Application result |
| `src/Kombats.Battle/Kombats.Battle.Api/Endpoints/BattleHistory/GetBattleHistoryEndpoint.cs` | Minimal API endpoint |
| `src/Kombats.Battle/Kombats.Battle.Api/Endpoints/BattleHistory/BattleHistoryResponse.cs` | HTTP response DTO |
| `src/Kombats.Battle/Kombats.Battle.Api/Endpoints/BattleHistory/TurnHistoryResponse.cs` | Per-turn DTO |

### Files to Modify

| File | Change |
|---|---|
| `src/Kombats.Battle/Kombats.Battle.Bootstrap/Program.cs` | Add `builder.Services.AddEndpoints(typeof(GetBattleHistoryEndpoint).Assembly)` and `app.MapEndpoints()` — Battle.Api endpoint infrastructure exists but is not wired |
| `src/Kombats.Battle/Kombats.Battle.Bootstrap/Program.cs` | Register `GetBattleHistoryHandler` in DI |

### Migration

None.

### Contracts Affected

None (internal HTTP API, not messaging).

### Tests Required

- API test: valid JWT, participant → 200 with correct data
- API test: valid JWT, non-participant → 403
- API test: no JWT → 401
- API test: unknown battleId → 404
- API test: ended battle with N turns → correct turn count and ordering
- API test: in-progress battle → returns turns resolved so far, empty Turns if none

### Exit Criteria

- Endpoint returns complete battle history with participant names, max HP, and ordered turns
- Access control enforced (participant-only)
- Battle.Api endpoints wired into Bootstrap
- All tests pass

### Dependencies

Batch 2 (turn history tables must exist).

---

## Batch 4: BFF — Narration Subsystem Core

### Goal

All narration components implemented and tested in isolation. Zero infrastructure dependencies. Pure application logic.

### In Scope

- Template catalog with ~50 templates across all categories
- Deterministic template selector
- Named-placeholder renderer
- Commentator policy (7 triggers, anti-spam)
- Feed assembler (sequencing, entry keys, ordering)
- Narration pipeline orchestrator
- All feed contract types (`BattleFeedEntry`, `BattleFeedUpdate`, `BattleFeedResponse`, enums)
- `BattleParticipantSnapshot` (BFF's participant context)
- BFF project reference to `Kombats.Battle.Realtime.Contracts`

### Out of Scope

- No SignalR integration (Batch 5)
- No HTTP endpoint (Batch 6)
- No infrastructure or persistence
- No BFF-internal semantic vocabulary — uses Battle realtime contracts directly

### Subsystem Components

| Component | Interface | Implementation | Responsibility |
|---|---|---|---|
| Template catalog | `ITemplateCatalog` | `InMemoryTemplateCatalog` | Static registry of ~50 templates by category |
| Template selector | `ITemplateSelector` | `DeterministicTemplateSelector` | `hash(battleId, turnIndex, sequence) % count` |
| Renderer | `INarrationRenderer` | `PlaceholderNarrationRenderer` | Named placeholder interpolation |
| Commentator | `ICommentatorPolicy` | `DefaultCommentatorPolicy` | 7 triggers, max-fire limits, one per turn max |
| Assembler | `IFeedAssembler` | `DefaultFeedAssembler` | Sequencing, entry keys, ordering |
| Pipeline | `INarrationPipeline` | `NarrationPipeline` | Orchestrates above components |

### Template Categories (V1)

| Category | Count | Tone |
|---|---|---|
| `attack.hit` | 5 | Neutral/Aggressive |
| `attack.crit` | 4 | Aggressive |
| `attack.dodge` | 4 | Defensive |
| `attack.block` | 4 | Defensive |
| `attack.no_action` | 3 | Neutral |
| `battle.start` | 3 | System |
| `battle.end.victory` | 3 | Dramatic |
| `battle.end.draw` | 2 | Dramatic |
| `battle.end.forfeit` | 2 | System |
| `defeat.knockout` | 3 | Dramatic |
| `commentary.first_blood` | 3 | Flavor |
| `commentary.mutual_miss` | 2 | Flavor |
| `commentary.stalemate` | 2 | Flavor |
| `commentary.near_death` | 3 | Flavor |
| `commentary.big_hit` | 3 | Flavor |
| `commentary.knockout` | 3 | Flavor |
| `commentary.draw` | 2 | Flavor |

### Commentator Triggers (V1)

| Trigger | Condition | Max Fires |
|---|---|---|
| First blood | First turn with any damage > 0 | 1 |
| Double dodge | Both attacks dodged same turn | 1 |
| Double no-action | Both players NoAction | 1 |
| Near death | Any player below 25% max HP | 1 per player |
| Big hit | Single attack > 50% target max HP | 2 |
| Knockout | Battle ends Normal reason | 1 |
| Draw | DoubleForfeit or mutual KO | 1 |

Anti-spam: max 1 commentary per turn. Near-death wins over big-hit if both eligible.

### Feed Entry Ordering (Deterministic)

Normal turn:
```
Sequence 0: A→B attack narration
Sequence 1: B→A attack narration
Sequence 2: Commentary (if triggered)
```

Battle start: `Sequence 0: BattleStart entry`

Battle end:
```
Sequence 0: PlayerDefeated / Draw entry
Sequence 1: BattleEnd result
Sequence 2: Commentary (if triggered)
```

Entry key: `"{battleId}:{turnIndex}:{sequence}"` — deterministic, globally unique.

### Pipeline Interface

```csharp
public interface INarrationPipeline
{
    BattleFeedUpdate GenerateTurnFeed(
        Guid battleId,
        TurnResolvedRealtime turnResolved,
        BattleParticipantSnapshot participants,
        CommentatorState commentatorState,
        int? playerAHp, int? playerBHp,
        int? playerAMaxHp, int? playerBMaxHp);

    BattleFeedUpdate GenerateBattleStartFeed(
        Guid battleId,
        BattleParticipantSnapshot participants);

    BattleFeedUpdate GenerateBattleEndFeed(
        Guid battleId,
        BattleEndedRealtime ended,
        BattleParticipantSnapshot participants,
        CommentatorState commentatorState);

    BattleFeedEntry[] GenerateFullBattleFeed(
        BattleHistoryResponse history);
}
```

`GenerateFullBattleFeed` creates a fresh `CommentatorState`, iterates turns sequentially, tracks HP from `PlayerAMaxHp`/`PlayerBMaxHp` → `PlayerAHpAfter`/`PlayerBHpAfter` per turn. Produces identical output to live generation (see Determinism section below).

### Files to Create

All under `src/Kombats.Bff/Kombats.Bff.Application/Narration/`:

| File | Purpose |
|---|---|
| `BattleParticipantSnapshot.cs` | Participant context with `ResolveName(Guid)` |
| `NarrationContext.cs` | Template interpolation values |
| `CommentatorCue.cs` | Commentator trigger output |
| `CommentatorState.cs` | Per-battle mutable commentator tracking |
| `INarrationPipeline.cs` | Pipeline orchestrator interface |
| `NarrationPipeline.cs` | Implementation |
| `INarrationRenderer.cs` | Renderer interface |
| `PlaceholderNarrationRenderer.cs` | Named placeholder interpolation |
| `ICommentatorPolicy.cs` | Commentator interface |
| `DefaultCommentatorPolicy.cs` | 7 triggers implementation |
| `IFeedAssembler.cs` | Assembly interface |
| `DefaultFeedAssembler.cs` | Sequencing, keys, ordering |
| `Templates/NarrationTemplate.cs` | Template record |
| `Templates/ITemplateCatalog.cs` | Catalog interface |
| `Templates/InMemoryTemplateCatalog.cs` | Static V1 templates |
| `Templates/ITemplateSelector.cs` | Selector interface |
| `Templates/DeterministicTemplateSelector.cs` | `hash % count` |
| `Feed/BattleFeedEntry.cs` | Frontend-facing entry |
| `Feed/BattleFeedUpdate.cs` | SignalR transport batch |
| `Feed/BattleFeedResponse.cs` | HTTP post-match response |
| `Feed/FeedEntryKind.cs` | Kind enum |
| `Feed/FeedEntrySeverity.cs` | Severity enum |
| `Feed/FeedEntryTone.cs` | Tone enum |

### Files to Modify

| File | Change |
|---|---|
| `src/Kombats.Bff/Kombats.Bff.Application/Kombats.Bff.Application.csproj` | Add `ProjectReference` to `Kombats.Battle.Realtime.Contracts` |

### Migration

None.

### Contracts Affected

None (new BFF-internal types only).

### Tests Required

All under `tests/Kombats.Bff/Kombats.Bff.Application.Tests/Narration/`:

- `DeterministicTemplateSelectorTests` — same seed → same template; different seed → varies
- `PlaceholderNarrationRendererTests` — all placeholder types; missing placeholders handled gracefully
- `DefaultCommentatorPolicyTests` — each trigger fires correctly; anti-spam enforced; max 1 per turn; mutual exclusion priority
- `DefaultFeedAssemblerTests` — sequence numbering; entry key format; turn/start/end ordering
- `InMemoryTemplateCatalogTests` — all categories have templates; no empty categories
- `NarrationPipelineTests` — end-to-end: `TurnResolvedRealtime` → `BattleFeedUpdate` for all 7 outcomes; battle start/end; `GenerateFullBattleFeed` produces same output as sequential live calls

### Exit Criteria

- All narration components implemented with interfaces
- ~50 templates across all categories
- Commentator fires correctly for all 7 triggers with anti-spam
- Deterministic template selection verified
- `GenerateFullBattleFeed` produces identical output to sequential live pipeline calls
- All tests pass
- No infrastructure dependencies

### Dependencies

None. Can start in parallel with Batch 1.

---

## Batch 5: BFF — Relay Integration

### Goal

Wire narration pipeline into live SignalR relay. `BattleHubRelay` intercepts key events, generates feed entries, and sends `BattleFeedUpdated` alongside raw relayed events.

### In Scope

- Refactor `BattleHubRelay` from generic `On<object>` loop to per-event typed handlers
- Capture `BattleParticipantSnapshot` from `JoinBattle` snapshot (with names + max HP from durable state)
- Maintain per-connection `BattleConnectionState` (participants, commentator, HP)
- Generate and send `BattleFeedUpdated` after relaying raw events
- Send battle start feed entry on `JoinBattle`
- Register narration services in Bootstrap DI

### Out of Scope

- No post-match HTTP endpoint (Batch 6)
- No persistence
- No changes to existing raw event relay behavior (events still forwarded as-is)

### Typed vs Blind Handlers

| Event | Handler Type | Narration |
|---|---|---|
| `TurnResolved` | `On<TurnResolvedRealtime>` | Yes — relay raw, then generate + send `BattleFeedUpdated` |
| `BattleEnded` | `On<BattleEndedRealtime>` | Yes — relay raw, then generate + send `BattleFeedUpdated` |
| `BattleStateUpdated` | `On<BattleStateUpdatedRealtime>` | No — capture HP into connection state, relay raw |
| `BattleReady` | `On<object>` | No — blind relay |
| `TurnOpened` | `On<object>` | No — blind relay |
| `PlayerDamaged` | `On<object>` | No — blind relay |

### Per-Connection State

```csharp
internal sealed class BattleConnectionState
{
    public required Guid BattleId { get; init; }
    public required BattleParticipantSnapshot Participants { get; init; }
    public required CommentatorState Commentator { get; init; }
    public int? PlayerAHp { get; set; }
    public int? PlayerBHp { get; set; }
    public int? PlayerAMaxHp { get; init; }   // from durable snapshot, not current HP
    public int? PlayerBMaxHp { get; init; }   // from durable snapshot, not current HP
}
```

Max HP sourced from `BattleSnapshotRealtime.PlayerAMaxHp` / `PlayerBMaxHp`, which comes from durable Redis/PG state. Correct on both initial join and reconnect.

### Reconnect Behavior

On reconnect (`JoinBattle` called again):
1. Old connection + state disposed
2. New snapshot captured with fresh participant context and max HP
3. Commentator state reset to fresh `CommentatorState()`
4. Battle start feed entry re-sent
5. No replay of missed feed entries — client resumes from current state

### Event Ordering per Turn

Frontend sees:
```
1. PlayerDamaged (blind relay)          — per damaged player
2. TurnResolved (typed, relayed)        — structured turn data
3. BattleFeedUpdated (BFF-generated)    — narration entries
4. TurnOpened (blind relay)             — next turn timer
5. BattleStateUpdated (typed, relayed)  — full state sync (HP captured here)
```

Within each typed handler, raw relay is `await`ed first, then feed generation and send. Sequential, deterministic.

### Deserialization

Downstream SignalR client returns `object` (which is `JsonElement` at runtime) from `InvokeAsync<object>("JoinBattle", ...)`. Helper method deserializes: `JsonSerializer.Deserialize<BattleSnapshotRealtime>(((JsonElement)snapshot).GetRawText())`.

Typed `On<TurnResolvedRealtime>` handlers get properly deserialized types from the SignalR client framework.

Typed handler bodies wrapped in try-catch for deserialization safety. On failure: log warning, relay raw event anyway, skip feed generation. Never block raw event delivery.

### Files to Create

| File | Purpose |
|---|---|
| `src/Kombats.Bff/Kombats.Bff.Application/Relay/BattleConnectionState.cs` | Per-connection state |

### Files to Modify

| File | Change |
|---|---|
| `src/Kombats.Bff/Kombats.Bff.Application/Relay/BattleHubRelay.cs` | Replace `ConcurrentDictionary<string, HubConnection>` with `ConcurrentDictionary<string, BattleConnection>`. Refactor event handler registration. Add `INarrationPipeline` dependency. Typed handlers for TurnResolved/BattleEnded/BattleStateUpdated. JoinBattle: deserialize snapshot, capture state, send battle start feed. |
| `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs` | Register `INarrationPipeline`, `ITemplateCatalog`, `ITemplateSelector`, `INarrationRenderer`, `ICommentatorPolicy`, `IFeedAssembler` |

### Migration

None.

### Contracts Affected

New SignalR event: `BattleFeedUpdated` (additive — existing clients unaffected).

### Tests Required

- Integration test (mock `IFrontendBattleSender`): `TurnResolved` → raw relay + `BattleFeedUpdated` in correct order
- Integration test: `BattleEnded` → raw relay + end `BattleFeedUpdated`
- Integration test: `BattleStateUpdated` → HP state updated, raw relay, no feed event
- Integration test: `TurnOpened` / `PlayerDamaged` → blind relay only
- Integration test: `JoinBattle` → `BattleFeedUpdated` with battle start entry
- Reconnect test: new `JoinBattle` resets commentator state
- Deserialization failure test: bad payload → raw relay succeeds, feed generation skipped

### Exit Criteria

- Raw events continue to be relayed unchanged (backward compatible)
- `BattleFeedUpdated` sent after each `TurnResolved` and `BattleEnded`
- Battle start entry sent on `JoinBattle`
- Max HP read from snapshot fields (correct on reconnect)
- Commentator fires appropriately during live battles
- Deserialization failures do not break raw relay
- All existing relay tests pass

### Dependencies

Batch 1 (names + max HP in realtime contracts) + Batch 4 (narration pipeline).

---

## Batch 6: BFF — Post-Match Feed Endpoint

### Goal

HTTP endpoint that retrieves battle history from Battle service and renders a complete feed using the same narration pipeline as live delivery.

### In Scope

- New `IBattleClient` HTTP client (calls Battle's internal history endpoint)
- New `GET /api/v1/battles/{battleId}/feed` Minimal API endpoint
- JWT forwarding to Battle for access control
- Resilience configuration (same pattern as existing `IPlayersClient`)

### Out of Scope

- No caching of rendered feeds
- No pagination

### Flow

```
1. Frontend: GET /api/v1/battles/{battleId}/feed (JWT header)
2. BFF: extract identity, call IBattleClient.GetHistoryAsync(battleId)
3. Battle: validate JWT, check participant, return BattleHistoryResponse
4. BFF: call INarrationPipeline.GenerateFullBattleFeed(history)
5. BFF: return BattleFeedResponse to frontend
```

If Battle returns 404 or 403, BFF propagates the same status.

### Files to Create

| File | Purpose |
|---|---|
| `src/Kombats.Bff/Kombats.Bff.Application/Clients/IBattleClient.cs` | Client interface |
| `src/Kombats.Bff/Kombats.Bff.Application/Clients/BattleClient.cs` | HTTP implementation |
| `src/Kombats.Bff/Kombats.Bff.Application/Clients/BattleHistoryResponse.cs` | Client-side response model |
| `src/Kombats.Bff/Kombats.Bff.Application/Clients/TurnHistoryResponse.cs` | Per-turn model |
| `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/BattleFeed/GetBattleFeedEndpoint.cs` | Minimal API endpoint |

### Files to Modify

| File | Change |
|---|---|
| `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs` | Register `IBattleClient` → `BattleClient` with `HttpClient` + `JwtForwardingHandler` + resilience |

### Migration

None.

### Contracts Affected

New HTTP endpoint (frontend-facing):
- `GET /api/v1/battles/{battleId}/feed` → `BattleFeedResponse`

### Tests Required

- API test: valid JWT, participant → 200 with rendered feed
- API test: unknown battle → 404
- API test: non-participant → 403 (propagated from Battle)
- API test: no JWT → 401
- Determinism test: rendered post-match feed matches what sequential live generation would produce

### Exit Criteria

- Endpoint returns complete rendered battle feed for any completed battle
- Access control enforced via JWT forwarding to Battle
- `BattleFeedResponse` contains participant names, entries ordered by `(turnIndex, sequence)`, outcome summary
- Feed entries identical to what live delivery would have produced (deterministic pipeline)
- All tests pass

### Dependencies

Batch 3 (Battle history endpoint) + Batch 4 (narration pipeline).

---

## Live vs Post-Match Feed Determinism

Both live and post-match rendering use the same `INarrationPipeline` with the same deterministic behavior:

| Factor | Live | Post-Match | Guarantee |
|---|---|---|---|
| Template seed | `HashCode.Combine(battleId, turnIndex, sequence)` | Same | Same inputs → same hash → same template |
| Turn order | Sequential (turnIndex 1, 2, 3...) | Same (ordered by PK) | Identical iteration |
| Commentator state | Fresh `CommentatorState()`, accumulated per turn | Fresh `CommentatorState()`, accumulated per turn | Identical evolution |
| HP context | Updated from `BattleStateUpdated` events | Updated from `TurnHistoryResponse.PlayerAHpAfter/PlayerBHpAfter` | Same values |
| Max HP | From `BattleSnapshotRealtime.PlayerAMaxHp` | From `BattleHistoryResponse.PlayerAMaxHp` | Same source (stored at creation) |
| Participant names | From `BattleSnapshotRealtime.PlayerAName` | From `BattleHistoryResponse.PlayerAName` | Same source (stored at creation) |

**Exception:** If a PG turn history write failed (accepted V1 limitation), that turn is missing from `BattleHistoryResponse.Turns`. Post-match feed skips that turn. This is a data gap, not a determinism violation.

---

## Accepted V1 Limitations

1. **Turn history gap on PG write failure.** If PostgreSQL turn history persistence fails after a successful Redis commit on a continued turn, the battle continues normally. Post-match history will be missing that turn's data. The turn was resolved correctly in Redis and delivered over SignalR — only the durable PG record is lost.

2. **No missed feed replay on reconnect.** When a client reconnects mid-battle, it receives a fresh snapshot and resumes from the current state. Feed entries from missed turns are not replayed. The client can retrieve the complete feed post-match via `GET /api/v1/battles/{battleId}/feed`.

3. **No localization.** V1 templates are English-only. Architecture supports future locale-switching via catalog swap. Named placeholders ensure template patterns are localization-safe.

4. **No BFF persistence.** BFF is stateless. All durable data lives in Battle's PostgreSQL schema. Post-match feed is rendered on the fly from Battle's stored history.

5. **No rendered feed caching.** Post-match feed is regenerated on every request. Template interpolation for a 15-turn battle is sub-millisecond; the PG query dominates latency. Caching can be added later if needed without architectural changes.

6. **Commentator state lost on reconnect.** After reconnect, commentator resets and some triggers may re-fire (e.g., near-death if still at low HP). This is acceptable — the player reconnected mid-battle, contextually appropriate commentary may repeat.

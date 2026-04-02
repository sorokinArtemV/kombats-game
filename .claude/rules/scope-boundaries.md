# Scope Boundaries

## Current Active Backend Scope

The current integration phase is limited to:

- `Kombats.Players`
- `Kombats.Matchmaking`
- `Kombats.Battle`

## Currently Out of Scope

Unless explicitly requested in a separate task, do not create or modify:

- `Kombats.BFF`
- `Kombats.Frontend`
- full auth flow completion beyond what is necessary for current backend integration
- ranked / MMR
- spectator mode
- replay system
- rematch
- inventory / equipment / builds
- multiple battle modes

## Current Mandatory Behaviors

The following are mandatory in current backend integration work:

- reconnect / resume battle
- timeout / AFK battle resolution
- post-battle progression update
- minimal win/loss tracking
- one character per player
- character name set once
- queue eligibility based on ready character state

## Integration Target Boundaries

Current target ownership:

- Players = source of truth for character/progression
- Matchmaking = source of truth for queue/match state
- Battle = source of truth for combat state/result

Read these first and follow them strictly:
- /.claude/claude.md
- /docs/architecture/kombats-monorepo-integration-spec.md
- /docs/architecture/decision-log.md

Also use the accepted Batch 1, Batch 2, Batch 3, and Batch 4 results as confirmed context.

Task mode: Implementation Mode.

You are the single implementer agent for Batch 5.
Do not assume any other implementer is working in parallel.
Do not start Batch 6 or later batches.

Goal:
Implement Batch 5 only: progression completeness in Players.

Confirmed context:
- Battle now publishes canonical BattleCompleted
- Players now consumes canonical BattleCompleted
- Matchmaking lifecycle wiring is complete enough for Batch 5
- Batch 4 review found no blockers before Batch 5
- Current known gap is progression completeness:
    - level-up stat point grants are missing
    - minimal win/loss tracking is missing
    - no-winner terminal outcomes must be handled correctly
    - Players still has legacy BattleFinishedEvent path, but cleanup is Batch 6 unless removal is required for Batch 5 correctness

Batch 5 scope:
1. Complete progression handling in Players for canonical BattleCompleted flow
2. Add level-up stat point grants to character progression
3. Add minimal win/loss tracking to character state
4. Handle no-winner terminal outcomes correctly in progression logic
5. Keep the canonical BattleCompleted path as the primary path for progression

Architectural decisions already accepted:
- Players is the source of truth for character/progression
- Battle is the source of truth for combat/result
- MVP progression must include:
    - post-battle XP updates
    - level recalculation
    - level-up stat point grants
    - minimal win/loss tracking
    - support for no-winner terminal outcomes
- Cleanup/removal of legacy paths belongs to Batch 6 unless required for correctness

Important constraints:
- do not start Batch 6
- do not do broad cleanup of legacy BattleFinishedEvent/BattleEnded paths unless strictly necessary for Batch 5 correctness
- do not redesign leveling policy beyond what is required to grant stat points correctly on level-up
- do not touch BFF or Frontend
- do not redesign auth
- do not broaden scope into ranked/MMR, history/replay, rematch, inventory, or other out-of-scope features
- preserve service boundaries
- keep changes minimal and localized
- maintain idempotency where existing inbox patterns already exist
- keep the system buildable if reasonably possible

Expected concrete outcomes:
1. Players progression on canonical BattleCompleted is complete enough for MVP
2. Level-up grants unspent stat points correctly when total XP crosses one or more level thresholds
3. Minimal win/loss tracking exists in Players domain/persistence
4. No-winner outcomes do not incorrectly grant win/loss and do not break progression handling
5. Canonical BattleCompleted remains the primary progression path
6. Any legacy path left in place is clearly transitional and does not undermine Batch 5 correctness

Before editing code, briefly state:
- which files you plan to change
- how level-up stat point grants will be computed
- where win/loss tracking will live
- how no-winner outcomes will be handled
- what is intentionally deferred to Batch 6

At the end, return exactly this structure:

### Implemented
- what changed
- file list
- why

### Intentionally not changed
- deferred items
- why deferred

### Remaining gaps
- what still requires Batch 6+

### Transitional notes
- any legacy path still left in place

### Risks
- compile/runtime/integration risks still present

Do not move ownership away from these services unless explicitly requested and documented.
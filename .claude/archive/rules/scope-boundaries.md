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

## Backend Integration Status

All six backend integration batches are complete:
- Batch 1: Contract normalization
- Batch 2: Players -> Matchmaking projection
- Batch 3: Matchmaking -> Battle handoff
- Batch 4: Battle completion lifecycle wiring
- Batch 5: Progression completeness
- Batch 6: Cleanup of legacy/transitional code

Canonical integration paths are now the only active runtime paths.

Do not move ownership away from these services unless explicitly requested and documented.

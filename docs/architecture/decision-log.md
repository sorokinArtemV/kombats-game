# Kombats Architecture Decision Log

This document records explicit architecture decisions for the current backend integration phase.

---

## ADR-001: Canonical backend integration scope

### Status
Accepted

### Decision
Current active backend integration scope is limited to:
- Players
- Matchmaking
- Battle

BFF and Frontend are out of scope for the current integration phase.

### Why
The current task is to stabilize and complete core backend gameplay integration first.

---

## ADR-002: Service ownership

### Status
Accepted

### Decision
- Players is the source of truth for character/progression
- Matchmaking is the source of truth for queue/match state
- Battle is the source of truth for combat/result

### Why
This preserves bounded context ownership and avoids hidden coupling.

---

## ADR-003: Reconnect / resume is mandatory

### Status
Accepted

### Decision
Reconnect / resume battle is required in MVP.

### Why
Battle sessions are realtime and stateful; reconnect must be supported as part of the core gameplay loop.

---

## ADR-004: Timeout / AFK resolution remains in Battle

### Status
Accepted

### Decision
Timeout / AFK battle resolution belongs to Battle and must produce the same canonical completion path as normal battle completion.

### Why
Battle owns combat state and terminal result production.

---

## ADR-005: Canonical battle completion contract

### Status
Accepted

### Decision
The system must converge to one canonical battle completion contract consumed by both Players and Matchmaking.

The canonical completion contract must carry enough information for:
- progression updates in Players
- match lifecycle completion in Matchmaking
- support for no-winner terminal outcomes
- idempotent downstream processing

Minimum required fields:
- MessageId
- BattleId
- MatchId
- PlayerAIdentityId
- PlayerBIdentityId
- WinnerIdentityId (nullable)
- LoserIdentityId (nullable)
- Reason
- OccurredAt
- Version if needed by existing conventions

### Why
The audit confirmed a critical mismatch between Battle-published and Players-consumed completion contracts. Without one canonical completion contract, battle completion is not wired correctly across services.

---

## ADR-006: Player combat snapshot projection in Matchmaking

### Status
Accepted

### Decision
Matchmaking must consume player combat profile changed events from Players and maintain a local projection for:
- queue eligibility
- matchmaking decisions
- battle handoff

The local projection must be treated as Matchmaking-owned read-side integration data, not as a second source of truth for progression.

### Why
Matchmaking should not depend on runtime calls into Players for queue-critical flow. The audit confirmed that the current Players -> Matchmaking projection flow is missing.

---

## ADR-007: Battle must be created from explicit participant snapshots

### Status
Accepted

### Decision
Battle creation must receive explicit participant combat snapshots rather than relying on hidden local player profile lookup as the primary path.

CreateBattle must carry participant snapshot data for both players, including at least:
- IdentityId
- CharacterId
- Name
- Level
- Strength
- Agility
- Intuition
- Vitality

A Battle-local profile lookup may exist only as a temporary migration aid and not as the target production path.

### Why
This makes the handoff explicit, removes silent fallback behavior, improves correctness, and avoids Battle starting with incorrect default stats.

---

## ADR-008: Canonical player combat profile changed contract

### Status
Accepted

### Decision
The system must converge to one canonical player combat profile changed integration contract.

The canonical contract must include at least:
- MessageId if required by current messaging conventions
- IdentityId
- CharacterId
- Name
- Level
- Strength
- Agility
- Intuition
- Vitality
- IsReady
- Revision
- OccurredAt

Relevant character state changes must publish this event, including:
- character creation/provisioning
- name set
- stat allocation
- post-battle progression updates

### Why
The audit confirmed that the current profile-changed event is too thin for downstream consumers and that SetCharacterName currently does not publish the event.

---

## ADR-009: Vitality is the canonical integration term

### Status
Accepted

### Decision
Vitality is the canonical stat name for cross-service integration contracts and architectural documentation.

If Battle currently uses Stamina internally, that may remain temporarily inside Battle implementation, but integration contracts and cross-service payloads must converge on Vitality.

### Why
The product/domain language uses Vitality, the spec uses Vitality, and the audit confirmed a naming mismatch between Players and Battle. Allowing both names to remain first-class across service boundaries will create unnecessary mapping ambiguity.

---

## ADR-010: Matchmaking lifecycle must be advanced by battle lifecycle events

### Status
Accepted

### Decision
Matchmaking must consume battle lifecycle events needed to move a match to terminal state.

At minimum:
- BattleCreated (or equivalent creation acknowledgment) must advance the match out of BattleCreateRequested
- BattleCompleted must advance the match to a terminal state such as Completed or TimedOut depending on reason

Players must not remain permanently matched after battle completion.

### Why
The audit confirmed that Matchmaking currently does not consume the relevant battle lifecycle events and can leave players stuck in active match state after battle completion.

---

## ADR-011: Default combat stat fallback is temporary only

### Status
Accepted

### Decision
Silent fallback to default combat stats is not allowed as the target production path.

If transitional fallback remains temporarily during migration, it must be:
- explicit
- documented
- treated as legacy
- removed in cleanup after snapshot-based battle creation is in place

### Why
The audit confirmed that Battle currently falls back to default stats because local profile projection is not populated. This hides integration failures and produces incorrect battle behavior.

---

## ADR-012: Queue entry must eventually depend on ready character state

### Status
Accepted

### Decision
Queue entry must require:
- authenticated identity or an equivalent trusted player identity source
- character existence
- ready onboarding state
- no active match
- no duplicate queue membership

This validation may be completed in the Matchmaking projection/readiness batch rather than in Batch 1.

### Why
The audit confirmed that the current queue entry path accepts arbitrary player ids without readiness validation.

---

## ADR-013: Progression completeness remains required for MVP

### Status
Accepted

### Decision
MVP progression must include:
- post-battle XP updates
- level recalculation
- level-up stat point grants
- minimal win/loss tracking
- support for no-winner terminal battle outcomes

This does not all need to be completed in Batch 1, but it remains a required backend target.

### Why
The audit confirmed that level-up stat point grants and win/loss tracking are currently incomplete.

---

## ADR-014: Batch execution model for current integration phase

### Status
Accepted

### Decision
Implementation work for the current backend integration phase must be executed in ordered batches.

Rules:
- use one implementer agent at a time
- use one separate reviewer agent after each batch
- do not run multiple implementer agents in parallel on different backend batches
- do not begin the next batch until the current batch has been reviewed

### Why
Current work changes shared contracts and cross-service boundaries. Parallel implementer agents would introduce conflicting payloads, duplicate transitional logic, and unstable migration paths.

---

## ADR-015: Current execution order

### Status
Accepted

### Decision
The current execution order is:

1. Batch 1 — Contract normalization
2. Batch 2 — Players -> Matchmaking projection
3. Batch 3 — Matchmaking -> Battle handoff
4. Batch 4 — Battle completion lifecycle wiring
5. Batch 5 — Progression completeness
6. Batch 6 — Cleanup

### Why
This order follows the actual dependency chain. Contracts must stabilize before projection, handoff, lifecycle wiring, and cleanup.
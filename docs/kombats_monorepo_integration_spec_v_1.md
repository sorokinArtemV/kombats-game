# Kombats Monorepo Integration Spec v1

## 1. Purpose

This document defines the **target integration architecture** for the Kombats monorepo and records the most important **current-state gaps** visible from the codebase.

The goal is not to describe every class. The goal is to establish:

- canonical service ownership
- canonical end-to-end gameplay flow
- canonical integration contracts
- reconnect/resume behavior
- battle completion and progression update semantics
- current implementation gaps that must be closed before the system is considered integrated

This spec is intended to be used for:

- architecture alignment
- Claude audit context
- implementation planning
- regression checking during service integration

---

## 2. Scope

### Included in scope

- Kombats.Players
- Kombats.Matchmaking
- Kombats.Battle
- their current Redis/Postgres/message bus integrations
- browser MVP gameplay flow
- reconnect/resume battle flow
- AFK/timeout battle resolution
- post-battle XP / level / free stat point progression
- minimal win/loss statistics at MVP level

### Explicitly out of scope

- ranked / MMR
- rematch
- spectator mode
- replay system
- inventory / equipment / builds
- multiple battle modes
- deep battle history UI beyond basic win/loss level state

---

## 3. Product model

Kombats is an online turn-based fighting game where two players submit actions simultaneously.

Each player owns exactly one character.

Character state relevant to MVP:

- identity/user id
- immutable chosen character name after initial setup
- level
- total XP
- unspent stat points
- stats:
  - Strength: direct damage
  - Agility: dodge chance
  - Intuition: crit chance / block penetration behavior
  - Vitality: HP / survivability

Battle system MVP:

- both players act each turn
- each player chooses one attack zone
- each player chooses one block pair / block segment
- battle produces a shared battle log visible to both players
- battle ends when one side reaches terminal defeat or by timeout / double forfeit / other terminal reason
- after battle, progression is updated and the player may re-enter queue

---

## 4. Canonical bounded contexts and ownership

### 4.1 Players

**Responsibility**

Players is the source of truth for:

- authenticated player identity mapping
- character existence and onboarding state
- character name
- character stats
- XP and level progression
- free/unspent stat points
- minimal long-lived player progression state

**Players must not**

- run combat simulation
- determine battle outcome
- decide matchmaking pairing

### 4.2 Matchmaking

**Responsibility**

Matchmaking is the source of truth for:

- queue membership
- queue state per player
- active match lifecycle state
- match-to-battle linkage (`matchId -> battleId`)
- reconnect discovery of active match / battle for a player

**Matchmaking must not**

- calculate battle result
- mutate long-lived character progression
- fabricate character data

### 4.3 Battle

**Responsibility**

Battle is the source of truth for:

- battle creation from matched participants
- authoritative battle state during combat
- turn deadlines and AFK / timeout resolution
- turn logs and battle outcome
- reconnect snapshot for active battle participants

**Battle must not**

- own character progression
- infer player progression policy
- act as source of truth for long-lived character profile

### 4.4 Common / shared infrastructure

Common is allowed to contain:

- bus infrastructure
- shared primitives
- endpoint naming / topology helpers
- cross-cutting technical abstractions

Common must not become a place for shared business logic across bounded contexts.

---

## 5. Current state observed from code

This section describes the most important confirmed current-state facts.

### 5.1 Confirmed current-state facts

1. **Matchmaking currently creates battles using only ids**.
   Current `CreateBattle` command contains:
   - `BattleId`
   - `MatchId`
   - `PlayerAId`
   - `PlayerBId`
   - `RequestedAt`

2. **Battle currently initializes combat profiles by looking up local projected player profiles**, not from a participant snapshot carried by Matchmaking.

3. **Battle has a fallback to default combat stats when projected profile is missing**.
   This is a defensive dev fallback, not acceptable as target behavior.

4. **Players publishes `PlayerMatchProfileChangedIntegrationEvent` when character is created or stats change**, and also after battle progression update.

5. **The current `PlayerMatchProfileChangedIntegrationEvent` is insufficient for Battle combat initialization**, because it includes only:
   - identity id
   - character id
   - level
   - readiness
   - revision
   - occurredAt

   It does **not** carry Strength / Agility / Intuition / Vitality.

6. **Battle publishes `BattleEnded`** when combat ends.

7. **Players currently consumes `BattleFinishedEvent`, not `BattleEnded`**.
   This is a contract mismatch.

8. **Matchmaking currently has no visible consumers for `BattleCreated`, `BattleEnded`, or player profile change events** in the provided code.
   This means match state synchronization is incomplete.

9. **Reconnect foundation already exists**:
   - Matchmaking exposes player status and returns `battleId` when matched.
   - Battle SignalR hub allows `JoinBattle(battleId)` and returns authoritative current snapshot if the authenticated player is a participant.

10. **Timeout / AFK resolution already exists in Battle** via deadline worker and deadline-driven turn resolution flow.

### 5.2 Major confirmed integration gaps

#### Gap A — Battle completion contract mismatch

Battle publishes `BattleEnded`.
Players consumes `BattleFinishedEvent`.
No adapter or bridge was visible in the provided code.

**Result:** post-battle progression update is not canonically wired.

#### Gap B — No canonical player snapshot projection into Matchmaking

Players publishes profile-changed events, but Matchmaking does not visibly consume them.

**Result:** the intended `Players -> Matchmaking snapshot` flow is not implemented.

#### Gap C — Battle profile initialization depends on a local projection that is not visibly kept in sync from Players

Battle reads from local `player_profiles` and falls back to defaults.

**Result:** combat may start with wrong stats if projection is stale or missing.

#### Gap D — Matchmaking lifecycle is not visibly advanced by battle lifecycle events

No visible consumers in Matchmaking for battle creation or battle completion.

**Result:** match state may remain stuck in pre-terminal states and reconnect/status semantics will drift.

#### Gap E — Current player profile changed event is too thin for combat consumers

It lacks combat stat payload.

**Result:** even if Matchmaking consumed it, Battle still could not derive authoritative combat stats from it unless another query/projection exists.

---

## 6. Target architecture

The target architecture for MVP should be:

### 6.1 Canonical direction

**Players -> Matchmaking -> Battle -> Players + Matchmaking**

Meaning:

1. Players owns authoritative character/profile state.
2. Matchmaking owns a local projection/snapshot used for queue eligibility and battle handoff.
3. Matchmaking sends an explicit participant snapshot to Battle when a match is created.
4. Battle owns combat and publishes canonical completion event.
5. Players consumes battle completion and updates progression.
6. Matchmaking consumes battle lifecycle/completion events and closes the match lifecycle.

### 6.2 Recommended principle

For MVP, **Battle should not depend on a local replicated player profile projection as the primary source for combat initialization**.

Instead, Battle should receive participant combat snapshot directly in the create-battle command.

That is the cleanest solution because:

- Battle becomes self-sufficient at battle start
- matchmaking handoff becomes explicit and auditable
- it avoids silent default stat fallback
- it reduces duplicate projections across Matchmaking and Battle
- reconnect after battle creation does not require Players roundtrip

### 6.3 Transitional note

The current Battle local profile lookup may be retained temporarily only as a migration bridge, but it must be treated as **legacy fallback**, not target architecture.

---

## 7. Canonical ownership rules / invariants

1. **Players is the only source of truth for long-lived character progression.**
2. **Matchmaking is the only source of truth for queue and match association state.**
3. **Battle is the only source of truth for combat result.**
4. **Battle outcome must not be recalculated in Players or Matchmaking.**
5. **Battle completion must be idempotent for downstream consumers.**
6. **A single completed battle must not grant XP twice.**
7. **A player with an active match must be discoverable via Matchmaking status lookup.**
8. **Reconnect must always restore from authoritative Battle snapshot, not from client memory.**
9. **Character stats used at battle start must be explicit and deterministic.** No hidden fallback-to-default behavior is allowed in target production path.
10. **One player has exactly one character** in MVP.
11. **Character name is set once and does not change** in MVP.
12. **Queue entry is allowed only for ready characters.**

---

## 8. Canonical data contracts

### 8.1 Player combat snapshot

Matchmaking must store and use a projection with at least:

- `IdentityId`
- `CharacterId`
- `Name`
- `Level`
- `Strength`
- `Agility`
- `Intuition`
- `Vitality`
- `IsReady`
- `Revision`
- `OccurredAt`

This can be projected from Players events.

### 8.2 Recommended player profile changed event

Current `PlayerMatchProfileChangedIntegrationEvent` is too thin for the target system.

Recommended target event:

`PlayerCombatProfileChanged`

Fields:

- `MessageId`
- `IdentityId`
- `CharacterId`
- `Name`
- `Level`
- `Strength`
- `Agility`
- `Intuition`
- `Vitality`
- `IsReady`
- `Revision`
- `OccurredAt`

Consumers:

- Matchmaking projection consumer
- optional other read models

### 8.3 Recommended battle creation command

Target command:

`CreateBattle`

Fields:

- `BattleId`
- `MatchId`
- `RequestedAt`
- `PlayerA` participant snapshot
- `PlayerB` participant snapshot
- optional `Variant`
- optional `RulesetVersion` if ruleset becomes matchmaking-driven later

Participant snapshot should include combat-relevant values. Battle should not need to query Players at battle start.

### 8.4 Recommended battle completion event

Target canonical event:

`BattleCompleted`

Fields:

- `MessageId`
- `BattleId`
- `MatchId`
- `PlayerAIdentityId`
- `PlayerBIdentityId`
- `WinnerIdentityId` nullable
- `LoserIdentityId` nullable
- `Reason`
- `OccurredAt`
- `Version`

Notes:

- For double-forfeit or similar no-winner cases, winner/loser may be null.
- This event is rich enough for Players and Matchmaking.
- Current `BattleEnded` can be retired, enriched to match this shape, or wrapped by an adapter, but the system must converge to **one canonical completion contract**.

### 8.5 Optional battle created event

`BattleCreated` may remain as lifecycle signal for Matchmaking.

Fields:

- `BattleId`
- `MatchId`
- `PlayerAIdentityId`
- `PlayerBIdentityId`
- `OccurredAt`

Purpose:

- mark match state as battle-created
- observability / debugging

---

## 9. Canonical end-to-end gameplay flow

### 9.1 Login / provisioning / onboarding

1. User authenticates.
2. Players ensures character exists for authenticated identity.
3. If character does not exist, Players creates draft character.
4. User sets name once.
5. User allocates stat points.
6. Players publishes combat profile change events on relevant state changes.
7. Matchmaking consumes those events and updates local projection.
8. Character becomes queue-eligible only when `IsReady = true`.

### 9.2 Join queue

1. Frontend/BFF requests queue join for authenticated user.
2. Matchmaking verifies the player is queue-eligible using local projection.
3. Matchmaking stores searching status in Redis and queue structure.
4. Matchmaking returns searching status.

### 9.3 Match creation

1. Matchmaking worker pops a pair atomically.
2. Matchmaking creates `Match` record with match/battle ids.
3. Matchmaking builds `CreateBattle` command using projected participant snapshots.
4. Matchmaking stores command in outbox.
5. Outbox dispatcher sends the command to Battle.
6. Battle creates battle record and initializes battle state.
7. Battle emits `BattleCreated` lifecycle event.
8. Matchmaking consumes `BattleCreated` and transitions match state to `BattleCreated`.
9. Matchmaking player status lookup starts returning `Matched + battleId`.

### 9.4 Active battle

1. Client obtains `battleId` from matchmaking status.
2. Client connects to Battle hub.
3. Client calls `JoinBattle(battleId)`.
4. Battle validates authenticated participant membership.
5. Battle returns authoritative current snapshot.
6. Player submits actions turn-by-turn.
7. Battle resolves turn immediately when both actions are present, or by deadline worker when needed.
8. Battle emits realtime events and maintains authoritative state in Redis.

### 9.5 Battle completion

1. Battle reaches terminal state.
2. Battle emits canonical `BattleCompleted` event.
3. Battle marks its own read model terminal state.
4. Matchmaking consumes completion event and marks match terminal.
5. Matchmaking clears/updates player active-match state accordingly.
6. Players consumes completion event.
7. Players applies XP, level, free stat points, and MVP win/loss stats.
8. Players publishes updated combat profile events for affected players.
9. Matchmaking consumes those events so fresh queue snapshot is available for next battle.

### 9.6 Re-enter queue after battle

1. Client sees completed result screen.
2. Client may request queue join again.
3. Matchmaking sees no active match and queue join is allowed.

---

## 10. Reconnect / resume battle (required MVP behavior)

Reconnect/resume is mandatory.

### 10.1 Canonical resume flow

1. Client loses connection or refreshes.
2. After re-authentication / app resume, client asks Matchmaking for current status.
3. If status is:
   - `Searching` -> restore queue/searching screen
   - `Matched` with `battleId` -> reconnect to Battle
   - `NotQueued` -> no active session
4. Client connects to Battle hub and calls `JoinBattle(battleId)`.
5. Battle returns authoritative battle snapshot.
6. Client rebuilds battle UI from that snapshot.

### 10.2 Resume invariants

- Matchmaking status endpoint is the discovery entry point for an active battle.
- Battle snapshot is the only authoritative source for the resumed battle state.
- Client must not reconstruct battle state from local cached actions.

### 10.3 MVP boundary

For MVP, reconnect/resume is guaranteed only while authoritative battle state still exists in Battle storage.

This means:

- Redis-backed active battle resume is in scope.
- full disaster recovery after Redis state loss is out of scope unless persistent recovery is introduced later.

### 10.4 Current state assessment

The current codebase already contains the core mechanics needed for this flow, but the overall contract should be formalized and made explicit at BFF/frontend level.

---

## 11. AFK / timeout / no-action behavior

Timeout handling is already present and remains in scope.

Target rules:

- deadline worker is allowed to resolve turns when one or both actions are missing
- no-action progression must be deterministic and idempotent
- if terminal timeout / double-forfeit threshold is hit, Battle must publish the same canonical completion event as any other terminal battle end
- downstream services must not care whether completion came from normal combat or timeout path beyond the explicit `Reason`

---

## 12. Post-battle progression rules (MVP)

### 12.1 Canonical rule owner

Players owns progression policy.

### 12.2 MVP progression effects

At minimum:

- winner receives XP
- loser receives XP or no XP according to chosen policy
- level is recalculated from total XP
- level-up grants additional unspent points
- minimal win/loss stats are updated

### 12.3 Current code note

Current Players command already applies XP and republishes profile change events, but it assumes a winner and loser contract that does not match Battle's current published event.

### 12.4 Requirement

The final canonical battle completion contract must support:

- normal victory
- no-winner terminal outcome
- idempotent handling
- future extension for richer result stats if needed

---

## 13. Matchmaking lifecycle requirements

Recommended target match states:

- `Searching`
- `BattleCreateRequested`
- `BattleCreated`
- `InProgress` (optional if distinct from battle-created)
- `Completed`
- `TimedOut`
- `Cancelled` (optional future)

At minimum for MVP:

- when outbox `CreateBattle` is committed, match state becomes `BattleCreateRequested`
- when Battle acknowledges creation, match becomes `BattleCreated`
- when Battle completes, match becomes `Completed` or `TimedOut` depending on reason

Matchmaking must not stay permanently stale after battle completion.

---

## 14. Queue eligibility rules

For MVP, queue join must require:

- authenticated identity
- character exists
- character onboarding state is ready
- no currently active match
- no duplicate queue membership

Current direct controller shape using raw `playerId` request payload is acceptable only as an interim internal/dev API shape. The target browser/BFF flow should use authenticated identity as the driver of queue operations.

---

## 15. Failure semantics and idempotency

### 15.1 Required guarantees

- Create battle command processing must be idempotent.
- Battle completion consumption in Players must be idempotent.
- Match lifecycle updates from battle events must be idempotent.
- Duplicate profile change events must converge safely.

### 15.2 Current state notes

- Matchmaking already uses a custom outbox flow.
- Players already has inbox-style processed-message handling for battle completion.
- Battle completion publishing currently relies on direct publish from Battle service runtime.

### 15.3 MVP acceptable compromise

MVP may keep direct publish after local persistence in some services **only if explicitly accepted**, but the target architecture should avoid silent message loss where reasonable.

### 15.4 Required behavior on duplicate completion event

Players must not grant XP twice.

### 15.5 Required behavior on missing player profile at battle creation

Target system must fail battle creation or reject the creation command explicitly. Silent fallback to default combat stats is not allowed as the production target path.

---

## 16. Recommended implementation direction

### 16.1 Normalize contracts first

Before broad refactoring, define canonical contracts:

- `PlayerCombatProfileChanged`
- `CreateBattle` with participant snapshots
- `BattleCompleted`
- optional `BattleCreated`

### 16.2 Add Matchmaking projection consumer

Implement consumer in Matchmaking for Players profile events.

Responsibilities:

- upsert player combat snapshot
- enforce revision monotonicity
- expose eligibility to queue service

### 16.3 Change battle creation handoff

Refactor Matchmaking -> Battle handoff so Battle receives participant snapshots directly.

### 16.4 Remove Battle dependence on implicit local player profile projection for primary path

Database/local profile lookup may remain temporarily only as fallback during migration.

### 16.5 Normalize battle completion flow

Battle must publish one canonical completion event.
Players and Matchmaking must both consume that same event.

### 16.6 Close reconnect lifecycle in Matchmaking

Matchmaking must advance match state on battle lifecycle events so queue status is reliable for reconnect and post-battle cleanup.

---

## 17. Implementation roadmap

### Batch 1 — contract normalization

- define canonical player combat snapshot contract
- define canonical create-battle payload
- define canonical battle-completed payload
- document event names and routing

### Batch 2 — Players -> Matchmaking projection

- add Matchmaking consumer for player combat profile changes
- add projection table/store
- add readiness validation for queue join

### Batch 3 — Matchmaking -> Battle handoff rewrite

- enrich `CreateBattle`
- update outbox writer / dispatcher
- update Battle creation consumer and lifecycle initialization
- keep temporary compatibility bridge only if necessary

### Batch 4 — Battle completion normalization

- replace mismatch between `BattleEnded` and `BattleFinishedEvent`
- publish one canonical completion event
- update Players consumer
- add Matchmaking completion consumer

### Batch 5 — reconnect hardening

- formalize frontend/BFF reconnect flow
- verify battle status discovery and join semantics
- verify terminal battle resume behavior

### Batch 6 — cleanup and removal of transitional code

- remove default-stat fallback from target path
- remove dead contracts
- remove obsolete consumers or adapters
- tighten invariants and logging

---

## 18. Audit checklist for Claude

Claude audit should answer the following, file by file:

1. Where are there stub implementations or fallback logic that hide missing integration?
2. Is every published message actually consumed by the intended service?
3. Are there duplicate or conflicting battle completion contracts?
4. Is Matchmaking consuming player profile change events anywhere?
5. Is Battle still dependent on local profile projection instead of explicit participant snapshot?
6. Can match state move all the way from pairing to completion in code, or does it get stuck?
7. Is reconnect guaranteed by current state transitions and status APIs?
8. Are timeout/AFK terminal outcomes propagated through the same canonical completion contract?
9. Are queue join operations protected by readiness checks?
10. Are there race conditions around outbox dispatch, battle creation idempotency, and duplicate completion processing?

Claude output format should be:

- file / class / method
- issue description
- why it violates the target spec
- severity
- recommended fix direction
- whether the issue is confirmed or inferred

---

## 19. Final architecture decision summary

### Target decisions

- Players owns character/progression truth.
- Matchmaking owns queue/match truth.
- Battle owns combat truth.
- Matchmaking must project player combat snapshots from Players.
- Battle should be created from explicit participant snapshots, not implicit profile lookup.
- One canonical battle completion contract must exist.
- Reconnect is mandatory and must be driven by Matchmaking status discovery plus Battle snapshot restore.

### Most important current blockers

1. battle completion contract mismatch
2. missing Players -> Matchmaking projection flow
3. battle initialization still depends on local projected profiles / default fallback
4. missing Matchmaking consumers for battle lifecycle synchronization

---

## 20. Notes for future BFF/frontend integration

Planned BFF should become the browser-facing orchestration layer for:

- current user identity
- onboarding flow composition
- queue status polling / resume logic
- battle connection bootstrap

But BFF should not absorb domain ownership away from Players, Matchmaking, or Battle.

It should orchestrate, not become a hidden fourth game-domain service.


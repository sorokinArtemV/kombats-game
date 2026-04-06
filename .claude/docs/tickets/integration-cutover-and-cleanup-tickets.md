# Integration, Cutover, and Cleanup Tickets

Phase 5 and Phase 6 tickets. These run after all three service replacement streams are complete.

---

## Phase 5: Cross-Service Integration Verification

---

# I-01: Verify Players → Matchmaking Event Flow

## Goal

Verify that `PlayerCombatProfileChanged` events published by Players are correctly consumed by Matchmaking and projected into the combat profile store.

## Scope

- Publish `PlayerCombatProfileChanged` from Players (via outbox).
- Verify Matchmaking `PlayerCombatProfileChangedConsumer` receives the event.
- Verify player combat profile projection is upserted correctly.
- Verify revision-based newer-wins logic works across services.
- Verify serialization/deserialization compatibility.

## Out of Scope

- Modifying consumer or publisher logic.
- Queue or match operations.

## Dependencies

P-05 (Players consumer / profile publisher operational), M-08 (Matchmaking consumer operational).

## Deliverables

- **Automated** integration test that exercises the full publish → consume → project path.
- Any issues filed as separate tickets.

## Acceptance Criteria

- [ ] PlayerCombatProfileChanged published by Players arrives at Matchmaking consumer
- [ ] Combat profile projection upserted with correct data
- [ ] Newer revision wins, older revision ignored
- [ ] Serialization/deserialization succeeds (no field mismatches)
- [ ] No message loss under normal conditions
- [ ] Verification is an automated test, not a manual procedure

## Required Tests

- **Automated (required):** Integration test using Testcontainers (PostgreSQL + RabbitMQ): publish `PlayerCombatProfileChanged` via Players outbox → verify Matchmaking consumer processes it → verify projection upserted.
- **Automated (required):** Contract serialization round-trip: `PlayerCombatProfileChanged` serialized → deserialized with all fields intact.

## Legacy Impact

No legacy impact. Verification only.

---

# I-02: Verify Matchmaking → Battle Command Flow

## Goal

Verify that `CreateBattle` commands sent by Matchmaking are correctly received and processed by Battle.

## Scope

- Matchmaking sends `CreateBattle` command via outbox.
- Battle `CreateBattleConsumer` receives the command.
- Battle creates battle state, publishes `BattleCreated`.
- Matchmaking `BattleCreatedConsumer` receives `BattleCreated`, updates match state.
- Verify full round-trip: pairing → CreateBattle → BattleCreated → match updated.

## Out of Scope

- Battle execution.
- Modifying handler logic.

## Dependencies

M-09 (Matchmaking BattleCreated consumer), B-13 (Battle CreateBattle consumer).

## Deliverables

- **Automated** integration test for the command → event round-trip.

## Acceptance Criteria

- [ ] CreateBattle command arrives at Battle consumer
- [ ] Battle created, BattleCreated event published
- [ ] BattleCreated arrives at Matchmaking consumer
- [ ] Match state transitions to BattleCreated with BattleId
- [ ] Serialization/deserialization succeeds for both message types
- [ ] Verification is an automated test

## Required Tests

- **Automated (required):** Integration test using Testcontainers: send `CreateBattle` command → verify Battle consumer processes it → verify `BattleCreated` published → verify Matchmaking consumer updates match state.
- **Automated (required):** Contract serialization round-trip for `CreateBattle` and `BattleCreated`.

## Legacy Impact

No legacy impact. Verification only.

---

# I-03: Verify Battle → Players + Matchmaking Completion Flow

## Goal

Verify that `BattleCompleted` events from Battle are correctly consumed by both Players and Matchmaking.

## Scope

- Battle publishes `BattleCompleted` via outbox.
- Players `BattleCompletedConsumer` receives event: awards XP, updates win/loss, publishes `PlayerCombatProfileChanged`.
- Matchmaking `BattleCompletedConsumer` receives event: transitions match to Completed, clears player status.
- Verify draw handling: nullable `WinnerIdentityId` processed correctly by both consumers.

## Out of Scope

- Modifying consumer logic.

## Dependencies

P-05 (Players consumer), M-10 (Matchmaking consumer), B-06 (Battle completion handler).

## Deliverables

- **Automated** integration test for the multi-consumer completion flow.

## Acceptance Criteria

- [ ] BattleCompleted arrives at both Players and Matchmaking consumers
- [ ] Players: XP awarded, win/loss updated, profile published
- [ ] Matchmaking: match completed, player status cleared
- [ ] Draw case: null winner/loser handled by both consumers
- [ ] Serialization/deserialization succeeds
- [ ] Verification is an automated test

## Required Tests

- **Automated (required):** Integration test using Testcontainers: publish `BattleCompleted` → verify both Players and Matchmaking consumers process it → verify side effects (XP, match state, profile publication).
- **Automated (required):** Contract serialization round-trip: `BattleCompleted` with winner and with draw (null winner/loser).

## Legacy Impact

No legacy impact. Verification only.

---

# I-04: End-to-End Gameplay Loop Verification

## Goal

Verify the full gameplay loop across all three services: player onboards → queues → matches → battles → completes → receives XP → can re-queue.

## Scope

- Full workflow verification:
  1. Player creates character, allocates stats, becomes IsReady.
  2. Player joins matchmaking queue.
  3. Two players paired, match created, `CreateBattle` sent.
  4. Battle created, turns executed, battle completes.
  5. `BattleCompleted` consumed by Players (XP) and Matchmaking (match completed).
  6. Player can re-queue for another match.
- Verify all services communicate correctly via messaging.

## Out of Scope

- Performance testing.
- Failure scenario testing.
- Modifying any service.

## Dependencies

I-01, I-02, I-03 (all event flows verified individually).

## Deliverables

- Automated end-to-end integration test. If full Testcontainers orchestration (3 services + PostgreSQL + RabbitMQ + Redis) is infeasible within this ticket, deliver a documented manual test procedure as an interim fallback — but file a follow-up ticket to automate it.
- Issues filed as separate tickets.

## Acceptance Criteria

- [ ] Full gameplay loop completes successfully
- [ ] All event flows work end-to-end
- [ ] Player XP updated after battle
- [ ] Player can re-queue after battle completion
- [ ] No message loss
- [ ] No deadlocks or race conditions observed

## Required Tests

- **Automated (target):** End-to-end integration test using Testcontainers for all infrastructure, exercising the full loop: onboard → queue → pair → battle → complete → verify XP → re-queue.
- **Manual (interim fallback only):** If full automation is blocked by multi-service orchestration complexity, a documented step-by-step manual test procedure is acceptable as an interim deliverable. In this case, a follow-up ticket for automation must be filed before this ticket is closed. Manual-only is not an acceptable final state.

## Legacy Impact

No legacy impact. Verification only.

---

# I-05: Contract Serialization Comprehensive Test

## Goal

Comprehensive serialization/deserialization tests for all contract types across all service boundaries.

## Scope

- All contracts tested:
  - `PlayerCombatProfileChanged` (Players.Contracts)
  - `CreateBattle` + `BattleParticipantSnapshot` (Battle.Contracts)
  - `BattleCreated` (Battle.Contracts)
  - `BattleCompleted` (Battle.Contracts)
  - `MatchCreated`, `MatchCompleted` (Matchmaking.Contracts — if defined)
  - All Realtime.Contracts types
- Round-trip: serialize → deserialize → verify all fields including `Version`.
- Verify JSON serialization compatibility with MassTransit message format.

## Out of Scope

- Service behavior testing.

## Dependencies

F-09 (contracts aligned).

## Deliverables

- Contract serialization tests (can be in a shared test project or per-contract-project tests).

## Acceptance Criteria

- [ ] Every contract type has serialize → deserialize round-trip test
- [ ] All fields verified including Version
- [ ] Nullable fields handled correctly (WinnerIdentityId in BattleCompleted)
- [ ] JSON format compatible with MassTransit serialization
- [ ] All tests pass

## Required Tests

One round-trip test per contract type, verifying all fields.

## Legacy Impact

No legacy impact.

---

## Phase 6: Legacy Cleanup and Release Verification

---

# C-01: Delete Kombats.Shared Project

## Goal

Delete the `Kombats.Shared` project and all references to it.

## Scope

- Delete `src/Kombats.Players/Kombats.Shared/` project.
- Delete root-level `Kombats.Shared/` directory (if it exists and is empty/legacy).
- Remove from `Kombats.sln`.
- Verify no project references `Kombats.Shared`.
- Verify no `using` statements reference `Kombats.Shared` namespaces.

## Out of Scope

- Service code changes (should already be done in per-service cleanup).

## Dependencies

P-08, M-14, B-17 (all services have removed their Kombats.Shared references).

## Deliverables

- `Kombats.Shared` completely deleted.
- No references remaining.

## Acceptance Criteria

- [ ] `Kombats.Shared` project directory deleted
- [ ] Root-level `Kombats.Shared/` deleted
- [ ] No project references to Kombats.Shared in any `.csproj`
- [ ] No `using Kombats.Shared` or `using Combats.Shared` in any source file
- [ ] Solution builds

## Required Tests

Build verification. All tests pass.

## Legacy Impact

Legacy removal.

---

# C-02: Delete Root-Level Legacy Directories

## Goal

Clean up root-level legacy directories that are no longer relevant.

## Scope

- Delete `Kombats.Players/` at repo root (old duplicate, not in `src/`).
- Evaluate `infra/`, `scripts/`, `sql/`, `tools/` — retain operational items, delete obsolete.
- Delete any other orphan directories not part of the target structure.

## Out of Scope

- `src/` directory changes.
- `.claude/` directory changes.

## Dependencies

C-01 (Kombats.Shared deleted).

## Deliverables

- Root-level legacy directories cleaned up.
- Operational scripts retained if still useful.

## Acceptance Criteria

- [ ] Root-level `Kombats.Players/` deleted
- [ ] Obsolete directories deleted
- [ ] Operational scripts retained and documented
- [ ] Solution builds

## Required Tests

Build verification.

## Legacy Impact

Legacy removal.

---

# C-03: Update Docker Configuration for Bootstrap Services

## Goal

Update docker-compose and Dockerfiles to run services from Bootstrap projects.

## Scope

- Move/update Dockerfiles to Bootstrap projects for all three services.
- Update `docker-compose.yml` service definitions (if uncommented) to build from Bootstrap.
- Verify each service container starts from its Bootstrap project.

## Out of Scope

- Production Docker optimization (Phase 7).

## Dependencies

P-06, M-11, B-16 (all Bootstrap projects exist).

## Deliverables

- Dockerfiles in Bootstrap projects.
- Updated docker-compose service definitions.

## Acceptance Criteria

- [ ] Each service has Dockerfile in its Bootstrap project
- [ ] Docker builds succeed for all three services
- [ ] Containers start and respond to health checks
- [ ] Old Dockerfiles in Api projects deleted

## Required Tests

Docker build and startup verification.

## Legacy Impact

Cutover. Docker configuration moves to Bootstrap.

---

# C-04: Release Gate Verification — Full Test Suite

## Goal

Verify all 8 release gates pass.

## Scope

Verify each gate:

1. All mandatory domain, application, infrastructure, and API tests pass.
2. Battle determinism suite passes.
3. Outbox atomicity verified per service (at least one test per service: write + event in one tx, rollback = no event).
4. Consumer idempotency verified per consumer.
5. Auth enforced on all endpoints and hubs.
6. Contract compatibility verified (solution builds, no serialization failures).
7. Migrations forward-apply to empty database per service.
8. No test infrastructure in production assemblies.

## Out of Scope

- Fixing issues (filed as separate tickets).

## Dependencies

All service replacement, integration, and cleanup tickets.

## Deliverables

- Release gate verification report.
- Pass/fail per gate.
- Issues filed as tickets.

## Acceptance Criteria

- [ ] Gate 1: All mandatory tests pass — zero failures
- [ ] Gate 2: Battle determinism suite passes
- [ ] Gate 3: Outbox atomicity test per service passes
- [ ] Gate 4: Consumer idempotency test per consumer passes
- [ ] Gate 5: Auth enforced on every endpoint and hub
- [ ] Gate 6: Contract serialization tests pass
- [ ] Gate 7: Migrations forward-apply on empty database succeeds per service
- [ ] Gate 8: No test framework references in production assemblies

## Required Tests

This ticket runs all existing tests and verifies each gate.

## Legacy Impact

No legacy impact. Verification only.

---

# C-05: Final Dead Code and Orphan Sweep

## Goal

Final sweep to ensure no dead code, orphan files, or legacy references remain in the repository.

## Scope

- Search for orphan files not referenced by any project.
- Search for dead `using` statements.
- Search for `Combats.*` (wrong prefix) namespaces remaining.
- Search for `Kombats.Shared` references.
- Search for Controller base class references.
- Search for `DependencyInjection.cs` files.
- Search for `DevSignalRAuthMiddleware` references.
- Search for `Database.MigrateAsync` calls.
- Remove any findings.

## Out of Scope

- New feature work.

## Dependencies

C-01, C-02, C-03 (cleanup done), C-04 (gates verified).

## Deliverables

- Clean repository with no dead code or legacy references.

## Acceptance Criteria

- [ ] No `Combats.*` namespaces in source (except possibly in entity name formatter for message compatibility)
- [ ] No `Kombats.Shared` references
- [ ] No Controller classes
- [ ] No `DependencyInjection.cs` in Infrastructure projects
- [ ] No `DevSignalRAuthMiddleware`
- [ ] No `Database.MigrateAsync` calls
- [ ] No orphan `.cs` files unreferenced by any project
- [ ] Solution builds, all tests pass

## Required Tests

Build verification. All tests pass.

## Legacy Impact

Final legacy removal sweep.

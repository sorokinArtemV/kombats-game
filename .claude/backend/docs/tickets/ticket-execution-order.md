# Ticket Execution Order

Recommended execution order, dependencies, parallelism, and risk assessment.

---

## Execution Phases

### Phase 0: Foundation Alignment

**Must complete before any service work begins.**

```
Batch 0A (parallel — no dependencies):
  F-01  Root Build Configuration Files
  F-03  Docker Compose Alignment
  F-04  Editorconfig Alignment

Batch 0B (depends on F-01):
  F-02  Unified Solution File
  F-08  Create Kombats.Abstractions Project

Batch 0C (depends on F-01, F-02):
  F-05  Test Infrastructure Baseline
  F-06  Rename Kombats.Infrastructure.Messaging → Kombats.Messaging
  F-09  Contract Project Alignment
  F-11  Shared Auth Configuration Helper

Batch 0D (depends on F-06):
  F-07  Align Kombats.Messaging with Target Configuration

Batch 0E (depends on F-02):
  F-10  Legacy Solution File Removal

Batch 0F (depends on all above):
  F-12  Verify Existing Services Build and Run
```

**Total: 12 tickets. 6 execution batches, honest sequencing.**

Notes on batch placement:
- F-08 depends on F-01 (package versions) and F-02 (solution file). Placed in 0B.
- F-05 depends on F-01 and F-02 (needs package versions and solution file). Placed in 0C.
- F-06 depends on F-01 and F-02 (needs build config and solution). Placed in 0C.
- F-09 depends on F-01 only (build config for contract projects). Placed in 0C.
- F-11 depends on F-01 and F-08 (needs Abstractions project). Placed in 0C.
- F-10 depends on F-02 being verified. Placed in 0E (can run in parallel with 0D).
- F-07 depends strictly on F-06 completing. Placed alone in 0D.

---

### Phase 1 is absorbed into Phase 0

The implementation plan defines Phase 1 (Shared Infrastructure) separately, but the foundation tickets (F-06 through F-11) cover this work. Phase 1 deliverables are embedded in the foundation batch.

---

### Phase 2: Players Replacement Stream

**Can start after F-12 passes.**

```
Batch P-A:
  P-01  Evaluate and Align Players Domain Layer

Batch P-B (depends on P-01):
  P-02  Replace Players Application Layer

Batch P-C (depends on P-02):
  P-03  Replace Players DbContext and Persistence

Batch P-D (depends on P-03):
  P-04  Players Character Repository Implementation
  P-05  Players BattleCompleted Consumer  (also depends on P-02)

Batch P-E (depends on P-04, P-05):
  P-06  Create Players Bootstrap Project

Batch P-F (depends on P-06):
  P-07  Align Players Minimal API Endpoints

Batch P-G (depends on P-07):
  P-08  Players Legacy Removal and Cleanup
```

**Total: 8 tickets. Mostly sequential. P-04 and P-05 can parallel in Batch P-D.**

---

### Phase 3: Matchmaking Replacement Stream

**Can start after F-12 passes. Can run in parallel with Phase 2.**

```
Batch M-A:
  M-01  Replace Matchmaking Domain Layer

Batch M-B (depends on M-01):
  M-02  Matchmaking Application — Queue and Pairing Handlers

Batch M-C (depends on M-02):
  M-03  Matchmaking Application — Timeout Workers

Batch M-D (depends on M-01, parallel within batch — no inter-dependencies):
  M-04  Replace Matchmaking DbContext and Persistence
  M-06  Matchmaking Redis Queue Operations
  M-07  Matchmaking Redis Distributed Lease

Note: M-D can run in parallel with M-B/M-C. Infrastructure tickets depend on
M-01 (domain types) but not on M-02/M-03 (application handlers). Port interfaces
are defined in M-02 but infrastructure implements against them — M-04/M-06/M-07
can be developed concurrently if port interface shapes are agreed during M-02.

Batch M-E (depends on M-04):
  M-05  Matchmaking Repository Implementations

Batch M-F (depends on M-05, M-06, parallel within batch):
  M-08  Matchmaking PlayerCombatProfileChanged Consumer
  M-09  Matchmaking BattleCreated Consumer
  M-10  Matchmaking BattleCompleted Consumer

Batch M-G (depends on all M-01 through M-10):
  M-11  Create Matchmaking Bootstrap Project
  M-13  Matchmaking Pairing Worker  (depends on M-02, M-07)

Batch M-H (depends on M-11):
  M-12  Replace Matchmaking API with Minimal Endpoints

Batch M-I (depends on M-12, M-13):
  M-14  Matchmaking Legacy Removal and Cleanup
```

**Total: 14 tickets. Infrastructure batch (M-D) can overlap with application batches (M-B/M-C).**

---

### Phase 4: Battle Replacement Stream

**Can start after F-12 passes. Can run in parallel with Phases 2 and 3.**

```
Batch B-A (parallel within batch — no inter-dependencies):
  B-01  Evaluate and Align Battle Domain — Core Types
  B-04  Evaluate and Align Deterministic RNG
  B-05  Evaluate and Align Ruleset Abstraction

Batch B-B (depends on B-01):
  B-03  Evaluate and Align CombatMath

Batch B-C (depends on B-01, B-03, B-04, B-05):
  B-02  Evaluate and Align Battle Engine

Note: Infrastructure batch B-D can start after B-01 completes. It does not
depend on B-02/B-03/B-04/B-05. It can run in parallel with B-B and B-C.

Batch B-D (depends on B-01, parallel within batch — no inter-dependencies):
  B-09  Replace Battle DbContext and Persistence
  B-11  Battle Redis State Operations
  B-12  Battle Redis Deadline Tracking

Batch B-E (depends on B-02):
  B-06  Battle Application — CreateBattle and CompleteBattle Handlers

Batch B-F (depends on B-06):
  B-07  Battle Application — SubmitAction and ResolveTurn Handlers

Batch B-G (depends on B-07):
  B-08  Battle Application — Deadline Enforcement Handler

Batch B-H (depends on B-09):
  B-10  Battle Record Repository Implementation

Batch B-I (depends on B-06, B-09):
  B-13  Battle CreateBattle Consumer

Batch B-J (depends on B-06):
  B-14  Battle SignalR Realtime Notifier

Batch B-K (depends on B-07, B-14):
  B-15  Battle SignalR Hub and API Endpoints

Batch B-L (depends on all B-01 through B-15):
  B-16  Create Battle Bootstrap Project

Batch B-M (depends on B-16):
  B-17  Battle Legacy Removal and Cleanup
```

**Total: 17 tickets. Domain (B-A through B-C) and infrastructure (B-D) can overlap significantly.**

Note: The critical path through Battle is B-01 → B-03 → B-02 → B-06 → B-07 → B-08 → B-16.
Infrastructure work (B-D, B-H, B-I, B-J) runs alongside the application chain where dependencies allow.

---

### Phase 5: Integration Verification

**Requires all three service streams to be functionally complete (P-07, M-12, B-15 minimum).**

```
Batch I-A (parallel):
  I-01  Verify Players → Matchmaking Event Flow
  I-02  Verify Matchmaking → Battle Command Flow
  I-03  Verify Battle → Players + Matchmaking Completion Flow
  I-05  Contract Serialization Comprehensive Test

Batch I-B (depends on I-01, I-02, I-03):
  I-04  End-to-End Gameplay Loop Verification
```

**Total: 5 tickets.**

---

### Phase 6: Legacy Cleanup and Release

**Requires all service legacy removal (P-08, M-14, B-17) and integration verification complete.**

```
Batch C-A (parallel):
  C-01  Delete Kombats.Shared Project
  C-02  Delete Root-Level Legacy Directories
  C-03  Update Docker Configuration for Bootstrap Services

Batch C-B (depends on C-A):
  C-04  Release Gate Verification — Full Test Suite

Batch C-C (depends on C-04):
  C-05  Final Dead Code and Orphan Sweep
```

**Total: 5 tickets.**

---

## Full Dependency Graph

### Foundation

```
F-01 ──┬── F-02 ──┬── F-05 (also depends on F-01)
       │          ├── F-06 ── F-07
       │          ├── F-10
       │          └── F-11 (also depends on F-08)
       ├── F-08 (also depends on F-02)
       └── F-09
F-03 (independent)
F-04 (independent)
                    All foundation → F-12
```

### Service streams (all depend on F-12, can run in parallel)

```
Players:    P-01 → P-02 → P-03 → P-04 ─┬→ P-06 → P-07 → P-08
                                  P-05 ──┘

Matchmaking: M-01 → M-02 → M-03 ──────────────────────────┐
             M-01 → M-04 → M-05 ──┬→ M-08, M-09, M-10 ──→ M-11 → M-12 ─┬→ M-14
             M-01 → M-06 ─────────┘                        M-13 ─────────┘
             M-01 → M-07 ──────── M-13 (also depends on M-02)

Battle:     B-01 ┬→ B-03 → B-02 → B-06 → B-07 → B-08 ───────────────┐
                 ├→ B-09 → B-10                                       │
                 ├→ B-11                     B-06 + B-09 → B-13       ├→ B-16 → B-17
                 ├→ B-12                     B-06 → B-14              │
            B-04 ┘→ B-02                     B-07 + B-14 → B-15 ─────┘
            B-05 ─→ B-02
```

### Post-service phases

```
All services complete → Integration (I-01, I-02, I-03, I-05 parallel) → I-04
All legacy removal complete + I-04 → Cleanup (C-01, C-02, C-03 parallel) → C-04 → C-05
```

---

## Parallel Execution Summary

| Stream | Can Run In Parallel With |
|---|---|
| Foundation (F-*) | Nothing — runs first |
| Players (P-*) | Matchmaking, Battle |
| Matchmaking (M-*) | Players, Battle |
| Battle (B-*) | Players, Matchmaking |
| Integration (I-*) | Nothing — waits for all services |
| Cleanup (C-*) | Nothing — waits for integration |

Within each service stream, domain→application→infrastructure→API→cleanup is the primary dependency chain, with infrastructure sub-tickets often parallelizable.

---

## Risk Assessment and Ordering Rationale

### High Risk — Execute Early

| Ticket | Risk | Why Early |
|---|---|---|
| F-07 | Messaging misconfiguration breaks all services | Foundation dependency for all consumers |
| B-04 | RNG correctness is existential for Battle | Determinism is the core guarantee |
| B-02 | Engine correctness is Battle's raison d'être | Must be verified before anything builds on it |
| B-11 | Redis CAS scripts are subtle concurrency code | Bugs here cause data corruption |
| M-06 | Redis Lua pair-pop is concurrent and atomic | Race conditions in pairing |
| F-09 | Contract misalignment breaks cross-service comms | Contracts are the service boundary |

### Medium Risk

| Ticket | Risk |
|---|---|
| P-03, M-04, B-09 | DbContext/migration changes — schema misalignment possible |
| M-07 | Distributed lease — subtle under failure |
| B-08 | Deadline enforcement — timing-sensitive |
| P-06, M-11, B-16 | Bootstrap cutover — if composition is wrong, service won't start |

### Low Risk

| Ticket | Risk |
|---|---|
| F-01–F-04 | Mechanical configuration changes |
| F-05 | Test infrastructure baseline |
| P-01, M-01 | Domain layer — pure logic, easy to test |
| P-07, M-12, B-15 | API layer — thin, testable |
| C-01–C-05 | Cleanup — deletion is straightforward |

---

## Ticket Count Summary

| Phase | Tickets |
|---|---|
| Foundation (Phase 0+1) | 12 |
| Players (Phase 2) | 8 |
| Matchmaking (Phase 3) | 14 |
| Battle (Phase 4) | 17 |
| Integration (Phase 5) | 5 |
| Cleanup (Phase 6) | 5 |
| **Total** | **61** |

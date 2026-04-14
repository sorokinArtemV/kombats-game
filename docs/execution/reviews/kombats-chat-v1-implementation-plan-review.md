# Kombats Chat v1 Implementation Plan — Review

**Reviewer:** Independent implementation-readiness review
**Date:** 2026-04-14
**Document reviewed:** `docs/execution/kombats-chat-v1-implementation-plan.md`
**Supporting documents consulted:**
- `docs/architecture/kombats-chat-v1-architecture-spec.md`
- `docs/architecture/reviews/kombats-chat-v1-architecture-review-round2.md`
- `docs/execution/kombats-chat-v1-decomposition.md`
- Codebase verification of existing project structure, contracts, and patterns

---

## 1. Review Verdict

**Approved with required corrections before execution.**

The plan is well-structured and close to execution-ready. The batch sequencing, gate criteria, contract stabilization, and testing decomposition are all strong. However, there is one critical gap (eligibility enforcement mechanism is under-specified and partly incorrect) and several important issues that should be corrected before starting Batch 0 to avoid downstream rework.

---

## 2. What Is Strong

**Batch sequencing is correct and well-justified.** The dependency graph is accurate. The bottom-up order (foundation → data layers → hub integration → background + BFF → E2E) follows the actual dependency flow. The parallel execution opportunities (B1 || B2, B4 || B5) are correctly identified with clear conditions.

**Contract stabilization is explicit and well-placed.** Section 5 identifies exactly which contract surfaces must freeze at which points, who owns them, and what the downstream consumers are. The "freeze at start of B3" rule for internal hub contracts is the right call.

**Risk identification is honest and actionable.** The six risks (R1-R6) map directly to the architecture review findings and decomposition risks. Each risk specifies where it's addressed, how it's validated, and what must be true before the next batch.

**Testing is integrated into batches, not deferred.** The testing execution plan (Section 7) correctly places tests in the same batches as the code they validate. The "what cannot be deferred" vs "what can be deferred to B6" distinction is clear and reasonable.

**Definition of Done checklists (Section 10) are specific and testable.** Each batch has concrete, verifiable exit criteria — not process-speak. An implementer can read a DoD item and know unambiguously whether it's met.

**The plan correctly identifies that the Chat project skeleton already exists.** The plan says "Create six projects" in B0, but the codebase already has `src/Kombats.Chat/` with all six projects (Bootstrap, Api, Application, Domain, Infrastructure, Contracts) and all four test projects under `tests/Kombats.Chat/`. This means B0 task 1 is largely a verification/alignment step rather than greenfield creation. The plan should acknowledge this to avoid wasted work.

**Ownership model is realistic.** Single primary owner for Chat, late BFF assist, clear handoff point at G3.

---

## 3. Critical Issues

### C1: Eligibility enforcement mechanism is incomplete and partly incorrect

**Location:** Batch 3 task 3 (`JoinGlobalChat`, `SendGlobalMessage`, `SendDirectMessage`), Batch 2 task 1 (`IDisplayNameCache`), Batch 4 task 1 (`HandlePlayerProfileChanged`).

**The problem:** The plan says Chat enforces eligibility by checking the display-name cache: "display-name cache lookup → if no entry, HTTP call to Players profile → if Players unavailable and cache empty, reject." The architecture spec (Section 16, line 932) says: "a player present in the cache with a non-null name is considered eligible."

This mechanism is flawed in two ways:

1. **The display-name cache stores only `(identityId -> name)`. It does not store `IsReady`.** The `PlayerCombatProfileChanged` event carries `IsReady`, but the plan's consumer (B4 task 1) only extracts `IdentityId` + `Name` and ignores `IsReady`. A player who has a name but `IsReady = false` (e.g., mid-onboarding — character created and named but stats not allocated) would pass the eligibility check incorrectly.

2. **The Players profile endpoint response does not include `OnboardingState` or `IsReady`.** The plan defines `GetPlayerProfileQueryResponse` as `(PlayerId, DisplayName, Level, Strength, Agility, Intuition, Vitality, Wins, Losses)`. When the HTTP fallback fires (cache miss), Chat calls this endpoint but has no field to check for eligibility. The underlying `CharacterStateResult.FromCharacter()` does include `State: c.OnboardingState`, but the plan's response DTO omits it.

**Impact:** The authoritative eligibility enforcement — the single security gate for chat access — cannot actually determine eligibility as currently specified.

**Required fix (choose one approach):**
- **(a) Store eligibility alongside display name.** Change `IDisplayNameCache` to store `(identityId -> (name, isReady))`. Change the consumer to extract and store `IsReady`. Change the eligibility check to verify `isReady == true`, not just "name is non-null." When `IsReady` becomes `false` (if that's possible), clear or update the cache entry.
- **(b) Add `isReady` to the Players profile endpoint response.** Add `OnboardingState` or `IsReady` to `GetPlayerProfileQueryResponse`. Eligibility check on HTTP fallback can then verify readiness directly. Still needs the cache to store `IsReady` for the cache-hit path.
- **(c) Only cache names for ready players.** Consumer checks `IsReady` before caching. If `IsReady == false`, skip the cache write (or delete existing entry). This makes "present in cache = eligible" correct by construction. HTTP fallback still needs an `IsReady` field to verify.

All three approaches require changes to the Players profile endpoint response AND to the display-name cache/consumer. This is a B0 + B2 + B4 change, so it must be resolved before execution begins.

---

## 4. Important but Non-Blocking Issues

### I1: Batch 0 does not account for existing Chat project skeleton

The plan's B0 task 1 says "Create six projects under `src/Kombats.Chat/`." These projects already exist in the repository with source files (AssemblyInfo.cs, Program.cs, endpoint infrastructure in Api). The test projects also exist under `tests/Kombats.Chat/`.

B0 should be reframed as "verify and align existing skeleton" rather than "create from scratch." The implementer should check that the existing projects have correct SDKs, references, `InternalsVisibleTo`, and package references — and fix any gaps — rather than creating new projects.

Similarly, the docker-compose already has a `chat` service entry. B0 task 5 should verify the existing entry rather than creating one.

**Impact:** Not a blocker, but if the implementer follows the plan literally, they'll either get confused by existing files or accidentally overwrite existing configuration. A one-line note in B0 ("verify/align existing skeleton") prevents this.

### I2: Conversation listing response shape for DMs needs display-name resolution

The architecture spec (Section 9) shows the conversation listing response includes `otherPlayer: { playerId, displayName }` for Direct conversations. The plan's B1 read-path use cases (`GetConversations`) don't describe how the other participant's display name is resolved for the listing response.

The `Conversation` entity stores `ParticipantAIdentityId` and `ParticipantBIdentityId` but not display names. To populate `otherPlayer.displayName` in the response, the handler needs to call `IDisplayNameResolver` for each Direct conversation's other participant. But `IDisplayNameResolver` is defined in B2 (Redis layer), and `GetConversations` is implemented in B1 (Postgres layer).

**Options:**
- Move `GetConversations` to B3 when both B1 and B2 are available.
- Return `displayName: null` in B1 and populate it when the resolver is available in B3.
- Accept this as a known gap and note it.

This is not a blocker for B0, but the implementer will hit this dependency when implementing B1.

### I3: `HasData()` for global conversation seeding has migration implications

The plan specifies seeding the global conversation via `HasData()` in the entity configuration. EF Core `HasData()` generates migration-time seed data and tracks it in the migration. If the conversation entity's properties change later, EF Core may generate spurious migration steps to update the seed data.

An alternative is to seed on startup via an explicit `INSERT IF NOT EXISTS` in a startup task or the first migration's `Up()` method. The architecture spec says "Created on first service startup if absent" which suggests runtime seeding, not migration seeding.

This is a minor implementation choice, but the plan should be consistent with the spec. If `HasData()` is the decision, note the trade-off.

### I4: BFF project structure differs from plan assumptions

The plan references "BFF Application" for `IChatHubRelay` interface and DTOs. The BFF has three projects: `Kombats.Bff.Bootstrap`, `Kombats.Bff.Api`, `Kombats.Bff.Application`. This matches the plan's assumption. However, the existing `BattleHubRelay` lives in `Kombats.Bff.Application/Relay/`. The `ChatHubRelay` should follow the same location. The plan doesn't specify the file path — an implementer could figure this out by examining the existing code, but it would help to note "follow `BattleHubRelay` project location."

---

## 5. Batch and Gate Review

### Batch 0: Foundation

**Verdict: Executable with adjustments for existing skeleton (I1) and eligibility field (C1).**

Tasks are concrete and ordered correctly. The Players profile endpoint implementation is well-specified. Docker-compose and test infrastructure tasks are clear.

**Gaps:**
- Must add `IsReady`/`OnboardingState` to `GetPlayerProfileQueryResponse` (per C1).
- Must acknowledge existing Chat projects and reframe task 1 as verification/alignment.

### Batch 1: Domain + Persistence

**Verdict: Executable.**

Domain model, persistence, read-path use cases, and HTTP endpoints are well-specified. Test coverage is comprehensive. The entity configurations, index definitions, and DM resolution pattern are all concrete.

**Minor gap:** `GetConversations` display-name dependency on B2 (I2).

### Batch 2: Redis Layer

**Verdict: Executable.**

Lua scripts, rate limiter with fallback, display-name cache, and resolver chain are all well-specified. The "highest priority tests" framing for Lua scripts is correct. The mandatory code review at G2 is appropriate.

**Gap:** `IDisplayNameCache` needs to store `IsReady` alongside the display name (per C1). Consumer logic in B4 must also be updated.

### Batch 3: Hub Integration

**Verdict: Executable, contingent on C1 resolution.**

This is the most complex batch and it's appropriately detailed. The contract stabilization as the first task is correct. The send flow pipelines (eligibility → rate-check → filter → resolve name → persist → broadcast) are explicit. The "not parallelizable" constraint is justified.

The eligibility enforcement logic depends on C1 being resolved first.

### Batch 4: Consumer + Workers

**Verdict: Executable.**

Consumer, retention worker, and sweep worker are all well-specified. Idempotency testing is correctly required. The batched delete for retention is specified. ZREM return-value gating for the sweep worker is specified.

**Gap:** Consumer must extract and store `IsReady` from `PlayerCombatProfileChanged` (per C1).

### Batch 5: BFF Chat Integration

**Verdict: Executable.**

The relay pattern, hub forwarding, HTTP proxy, and player card endpoint are all well-specified. The hung-connection detection via invocation timeout is clear. The test coverage is appropriate.

### Batch 6: E2E Validation

**Verdict: Executable.**

E2E smoke tests, degradation tests, auth sweep, and review item resolution are all appropriate for a validation batch. The "what can be deferred to B6" list from Section 7 is reasonable.

### Gate Quality

Gates are specific and testable. G2 (Lua script code review) and G3 (contract freeze) are the most important gates and both have concrete exit criteria. G3's "block B5 until G3 passes" is correct.

**One gap in gate criteria:** No gate explicitly verifies that the eligibility enforcement mechanism is correct. G3 tests "ineligible user calls JoinGlobalChat → ChatError" but does not verify HOW eligibility is determined. After C1 is resolved, the G3 gate should include a test case for "player with name but IsReady=false is rejected."

---

## 6. Contract and Dependency Review

### Contract freeze points: Correct.

The five contract surfaces in Section 5 are correctly identified. The ownership is clear. The freeze-before relationships are accurate.

### Contract drift risk: Adequately controlled.

The DTO duplication strategy (EQ-3) with contract serialization tests in B6 is reasonable for the scale. The explicit "changes require coordination" rule is clear.

### Players profile endpoint contract: Needs IsReady field (C1).

The current response shape is missing the eligibility signal. This must be added before the contract freezes at end of B0.

### `PlayerCombatProfileChanged` contract: Already stable, correctly identified.

The contract exists with all required fields (`Name`, `IdentityId`, `IsReady`). The plan correctly treats it as pre-existing and frozen.

### Cross-service dependency: Correctly sequenced.

The Players profile endpoint in B0 correctly unblocks B2 (resolver HTTP fallback) and B5 (player card). The `PlayerCombatProfileChanged` consumer in B4 correctly depends on the pre-existing contract.

---

## 7. Testing and Risk-Control Review

### Testing integration: Strong.

Tests are in the right batches. Infrastructure tests use Testcontainers (real Postgres, real Redis). Domain tests are pure. Application tests use stubbed ports. The hierarchy is correct.

### Risk controls: Adequate with one exception.

| Risk | Control quality |
|---|---|
| R1: Lua script correctness | Strong. Dedicated batch, exhaustive tests, mandatory code review. |
| R2: Relay lifecycle leaks | Adequate. Disconnect/cleanup tests, leak detection logging. |
| R3: Contract drift | Adequate. Freeze points, duplication, E2E verification. |
| R4: Eligibility enforcement | **Weak.** The enforcement mechanism itself has a correctness bug (C1). The tests would pass for the wrong reason — a named but non-ready player would pass eligibility. |
| R5: Display-name resolver fallback | Adequate. All three fallback stages tested. Aggressive timeout. |
| R6: Rate-limit fallback | Adequate. Activation and deactivation tested. |

### Missing risk not identified in the plan

**Heartbeat timer lifecycle on exception.** The plan specifies a per-connection heartbeat timer (30s interval) started in `OnConnectedAsync` and cancelled in `OnDisconnectedAsync`. If the heartbeat Lua script throws an exception (Redis connection blip), what happens? Does the timer retry? Does it stop? An unhandled exception in a timer callback could crash the connection or leave it in a degraded state. The plan should specify: heartbeat failures are logged and the timer continues (fire-and-forget with error handling).

---

## 8. Readiness to Start Batch 0

**Batch 0 is almost ready to execute.** The tasks are concrete, the outputs are clear, and the dependencies are correctly stated.

**Before starting B0, resolve:**

1. **Add `IsReady` (or `OnboardingState`) to `GetPlayerProfileQueryResponse`.** This is a one-field addition to the response DTO and a one-field addition to the handler mapping. It unblocks the eligibility enforcement in B3 and the cache design in B2. Without this, B2 and B3 will need to reopen a design decision.

2. **Acknowledge existing Chat skeleton.** Reframe B0 task 1 from "create" to "verify and align." The projects exist. The implementer needs to check SDKs, references, `InternalsVisibleTo`, and package references against the plan — not create from scratch.

Both of these are small corrections (minutes of plan editing, not hours of redesign). After these corrections, B0 is unambiguously executable.

---

## 9. Required Changes Before Execution

### Required (blocks correctness)

1. **[C1] Fix eligibility enforcement design.** Add `IsReady` to the Players profile endpoint response. Decide whether the display-name cache stores `(name, isReady)` or only caches ready players. Update the consumer to use `IsReady`. Update the eligibility check description in B3. Add a test case to G3: "player with name but IsReady=false is rejected."

### Required (blocks smooth execution of B0)

2. **[I1] Acknowledge existing Chat skeleton in B0.** Change B0 task 1 from "Create six projects" to "Verify and align existing six projects." Note that docker-compose already has a `chat` entry. Prevent the implementer from creating duplicate projects or overwriting existing configuration.

### Recommended (non-blocking but will cause friction if not addressed)

3. **[I2] Note the `GetConversations` display-name dependency on B2.** Either move `GetConversations` handler to B3, or note that the B1 implementation returns `displayName: null` for DM conversation participants and populates it in B3.

4. **[I3] Decide seeding strategy for global conversation.** `HasData()` vs runtime `INSERT IF NOT EXISTS`. Pick one and note the trade-off.

5. **Add heartbeat timer error handling guidance.** Specify that heartbeat failures are logged and the timer continues.

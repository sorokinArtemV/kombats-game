# Kombats Chat v1 — Task Decomposition Review

**Reviewer:** Independent execution-planning reviewer
**Date:** 2026-04-14
**Document reviewed:** `docs/execution/kombats-chat-v1-decomposition.md`
**Architecture source:** `docs/architecture/kombats-chat-v1-architecture-spec.md` (approved for decomposition)
**Architecture review:** `docs/architecture/reviews/kombats-chat-v1-architecture-review-round2.md`

---

## 1. Review Verdict

**Approved with required corrections before implementation planning.**

The decomposition is structurally sound. Batch sequencing, dependency identification, and parallelization analysis are well-reasoned. The testing breakdown is detailed and correctly mapped to batches. However, there are four issues that would cause a planner to either miss required work or invent structure that the decomposition should have provided. These must be corrected before a planner can derive implementation tasks without guesswork.

---

## 2. What Is Strong

**Batch sequencing is logical and well-justified.** Each batch has a clear rationale for why its work items belong together. The "Why together" paragraphs demonstrate actual thought about vertical sliceability and testability, not just grouping by convenience. The B1/B2 parallel split along the Postgres/Redis boundary is clean and correctly identified as the best parallelization opportunity.

**Dependency graph is honest.** The hard/soft dependency distinction is meaningful — it's not just labeling everything "hard" for safety. The soft dependency on B4 → B3 is correctly reasoned (consumer can technically be built earlier but testing needs the full hub context). The cross-service dependency table is useful and correctly identifies the Players profile endpoint as the only actual blocker.

**Parallelization analysis is unusually good for a decomposition document.** The three-tier breakdown (truly parallelizable / parallelizable after stabilization / should NOT be parallelized) is practical. The "Should NOT Be Parallelized" section is the most valuable part — identifying that Lua scripts must be tested before hub integration, and that the consumer should not be built in parallel with the cache, shows real implementation awareness.

**Risk identification is relevant and correctly prioritized.** R1 (Lua script correctness) as HIGH is correct — this is the most complex atomic operation in the system. R3 (contract drift between Chat internal API and BFF) as MEDIUM correctly identifies the main coordination risk. R7 (Players endpoint timing) correctly notes that the sequencing already mitigates it.

**Testing decomposition is thorough.** Eight levels, well-mapped to batches, with specific test cases at each level. The Lua script test list (Level 4) covers all the edge cases from the architecture spec's multi-tab table. The consumer idempotency test requirement (Level 5) is correctly placed. The E2E smoke tests (Level 8) cover the right golden paths and degradation scenarios.

**Open execution questions are well-framed.** EQ-1 through EQ-6 identify genuine implementation decisions that the architecture spec left open, and each provides a concrete recommendation. EQ-4 is properly resolved with full rationale. EQ-2 correctly identifies that the heartbeat must be application-level, not SignalR keepalive.

---

## 3. Critical Issues

### C1: Eligibility check omitted from use case descriptions — architecture fidelity gap

The approved architecture (Section 16, AD-CHAT-09) specifies that Chat Layer 2 performs an authoritative eligibility check on `JoinGlobalChat` and `SendDirectMessage`. This is a defense-in-depth requirement.

The decomposition's use case descriptions in S1.3 do not mention eligibility:

- `JoinGlobalChat`: "add connection to global chat SignalR group (for broadcast targeting), return recent messages + online players (capped 100). Does NOT register presence." — No eligibility check mentioned.
- `SendGlobalMessage`: "validate, rate-check, resolve display name, create message, persist, update conversation, broadcast" — "validate" is ambiguous; could mean content validation only.
- `SendDirectMessage`: "validate, rate-check, resolve display name, resolve/create conversation, create message, persist, update conversation, deliver to recipient" — same ambiguity.

EQ-4 (resolved) describes the eligibility check in detail but is not cross-referenced from the use case descriptions. A planner reading only S1.3 would produce implementation tasks that omit Chat-side eligibility enforcement on `JoinGlobalChat` entirely, and might interpret "validate" on send flows as content-only validation.

**Required fix:** Add explicit "check eligibility (display-name cache presence or Players HTTP fallback)" as a named step in `JoinGlobalChat` and both send use cases. Reference the Layer 2 enforcement from EQ-4.

### C2: Test project creation is missing from the batch plan

The decomposition lists test projects in Section 8 and in the architecture spec appendix:
- `Kombats.Chat.Domain.Tests`
- `Kombats.Chat.Application.Tests`
- `Kombats.Chat.Infrastructure.Tests`
- `Kombats.Chat.Api.Tests`

None of these appear in any batch's included work. Batch 0 creates six production projects but no test projects. Batch 1 expects domain unit tests and infrastructure integration tests to exist, but doesn't include creating the test projects, adding Testcontainers references, or setting up test fixtures.

This is not a trivial omission. Infrastructure integration tests require:
- A Testcontainers-based PostgreSQL fixture
- A Testcontainers-based Redis fixture
- `WebApplicationFactory<Program>` configuration for API tests
- NuGet references (xUnit, FluentAssertions, Testcontainers, etc.) in `Directory.Packages.props`

A planner would have to invent this work and place it somewhere.

**Required fix:** Add test project creation to Batch 0 (alongside production project skeleton). Include: project creation, NuGet references, base test fixtures for Testcontainers (Postgres and Redis), and `WebApplicationFactory` setup.

### C3: S5 (Tests) is a phantom stream

Section 3 lists five implementation streams. S5 is "Tests — All layers, all services touched. Broken out by level below." But Section 4 has no `S5` task group. Tests are embedded in other batches (correctly) and detailed in Section 8 (correctly). S5 as a stream has zero content.

This creates confusion: a planner reading the stream table sees five streams and expects five corresponding task groups. They find four. They then have to figure out that tests are distributed across batches, not centralized.

**Required fix:** Either remove S5 from the stream table (tests are a cross-cutting concern within each batch, not a separate stream) or rename it to acknowledge that it's a reference section, not a work stream. If removed, add a note to the stream table pointing to Section 8 for the testing breakdown.

### C4: EQ-3 (shared DTOs) needs a firm decision, not a recommendation

EQ-3 asks whether Chat internal response DTOs should be shared or duplicated between Chat and BFF. The decomposition recommends option (b) — duplicated DTOs — but phrases it as a recommendation, not a decision.

This affects Batch 5 directly. The BFF implementer needs to know whether they're referencing a shared project or duplicating DTOs. If the decision is deferred to "during implementation," the BFF implementer and Chat implementer may make incompatible choices.

The recommendation is reasonable (duplicated DTOs for 4 endpoints is manageable). But it must be stated as a decision so the planner can derive concrete tasks.

**Required fix:** Promote EQ-3 from recommendation to decision. State: "Decision: option (b) — DTOs duplicated. BFF defines its own response types for the ChatClient. Contract alignment verified by integration tests in Batch 6."

---

## 4. Important but Non-Blocking Issues

### I1: Batch 1 is the largest batch and may need internal sequencing guidance

Batch 1 includes: domain entities with invariants and factory methods, `ChatDbContext` with schema configuration, entity configurations with indexes, two repositories (including the DM resolution pattern), three application ports, three use case handlers, three HTTP endpoints, partial bootstrap wiring (EF Core + auth + endpoint mapping), and the initial EF Core migration.

This is a defensible grouping — it's a vertical slice from domain to HTTP. But it is significantly more work than any other batch. A planner would benefit from knowing the intended internal build order:

1. Domain entities + unit tests
2. DbContext + entity configurations + migration
3. Repositories
4. Ports + use case handlers + unit tests
5. HTTP endpoints + bootstrap wiring

Without this, a planner may attempt to parallelize within the batch in ways that don't work (e.g., building endpoints before repositories exist).

**Suggestion:** Add a brief internal sequencing note to Batch 1.

### I2: Heartbeat timer lifecycle is not identified as a risk area

The `OnConnectedAsync` handler starts a per-connection heartbeat timer (30s interval). The `OnDisconnectedAsync` handler cancels it. This is per-connection mutable state in the hub, which is a common source of:
- Memory leaks (timer not cancelled on ungraceful disconnect)
- Race conditions (timer fires during disconnect processing)
- Disposal issues (`CancellationTokenSource` not disposed)

R2 (Relay lifecycle) identifies similar concerns for the BFF side but the Chat hub's heartbeat timer is not called out. This is arguably higher risk than the relay lifecycle because it's per-connection state managed inside the SignalR hub's lifecycle methods.

**Suggestion:** Add R9 or expand R1 to include heartbeat timer lifecycle management as a risk area.

### I3: DisplayNameResolver placement in stream S1.5 (Infrastructure: Redis) is slightly misleading

S1.5 is titled "Infrastructure: Redis (Presence, Rate Limiting, Name Cache)" and includes `DisplayNameResolver implementing IDisplayNameResolver`. But the resolver orchestrates Redis cache + HTTP client + sentinel fallback — it's not a pure Redis concern. The architecture spec's appendix places `IDisplayNameResolver` in `Application/Ports/`.

The implementation would naturally be in Infrastructure (it depends on Redis and HTTP), so the placement isn't wrong. But grouping it under "Redis" in the task label could mislead an implementer into thinking it's Redis-only.

**Suggestion:** Either move it to a separate sub-item or note that the resolver is an Infrastructure service that wraps multiple external dependencies, not a Redis adapter.

### I4: Two-implementer model leaves Implementer 2 idle for Batches 0-3

The ownership model correctly identifies that Implementer 2 (BFF-focused) joins after Batch 3. This is roughly half the project timeline. The document notes "Implementer 2 can work on other tasks during Batches 0-3" — but this means the two-implementer model provides parallelization benefit only for B4/B5 and B6.

The real parallelization benefit is B1/B2 (a single implementer interleaving), not the two-implementer split. If the project is staffing-constrained, the single-implementer model (Option B) may be more honest about the actual work distribution.

**Not a decomposition defect** — the ownership model is a suggestion, not a commitment. But the two-implementer framing somewhat overstates the parallelization opportunity.

### I5: Batch 5 prerequisite description is inconsistent with dependency table

Batch 5 description says: "Prerequisites: Batch 3 (functional internal Chat hub), Batch 0 (Players profile endpoint for player card)."

The dependency table says: "B5 → B3: Hard" and "B5 → B0: Soft."

Both are defensible interpretations (the player card endpoint is one task within B5 and doesn't block the ChatHub relay). But stating B0 as a prerequisite in the batch description while calling it Soft in the dependency table is inconsistent. A planner would have to decide which to believe.

**Suggestion:** Align the batch description with the dependency table. The batch description should say "Prerequisites: Batch 3 (functional internal Chat hub). Soft: Batch 0 (Players profile endpoint, needed only for player card endpoint — not blocking ChatHub relay)."

---

## 5. Dependency and Sequencing Review

### Dependency graph correctness

The dependency graph is correct. Key validations:

- **B1 → B0 (Hard):** Correct. EF Core migration, DbContext, and project references need the project skeleton.
- **B2 → B0 (Hard):** Correct. The DisplayNameResolver's HTTP fallback needs the Players profile endpoint to be available for integration testing. The endpoint itself is in B0.
- **B3 → B1 + B2 (Hard):** Correct. The hub's send flows require persistence (B1) and rate limiting + name resolution (B2).
- **B4 → B3 (Soft):** Correct and well-reasoned. The consumer and workers can technically be built after B2 (they write to Redis cache and clean up Postgres), but integration testing benefits from the full hub context.
- **B5 → B3 (Hard):** Correct. The relay connects to the internal hub.
- **B6 → B5 (Hard):** Correct. E2E requires the full system.

### Sequencing correctness

The recommended execution order (Section 10) correctly identifies:
- B0 as the foundation
- B1/B2 as the main parallelization opportunity
- B3 as the critical path bottleneck
- B4/B5 as the second parallelization opportunity
- B6 as the capstone

The "contract-first" note in Phase 3 — stabilize hub method signatures before BFF starts building — is the single most important coordination directive in the document. It is correctly placed.

### Missing dependency: Outbox/inbox migration ownership

The decomposition lists outbox/inbox tables in B1 (S1.4: "initial EF Core migration creating conversations + messages + outbox/inbox tables") and in B4 (S4.2: "outbox/inbox tables in `chat` schema migration"). This is a contradiction — either the outbox/inbox tables are created in B1's migration or in B4's migration, not both.

The correct placement is B1 — the DbContext configuration includes outbox/inbox table mappings, and the initial migration should create all tables the DbContext knows about. B4 should register the consumer and configure MassTransit, not create migration-level schema changes.

**Required clarification:** State explicitly that B1's initial migration includes outbox/inbox tables (as part of `ChatDbContext` configuration), and B4 does not create additional migrations for outbox/inbox — it only configures MassTransit bus/consumer registration.

---

## 6. Parallelization Review

### B1 / B2 parallelization: Genuinely safe

These two batches share no code, no data store overlap, and no port dependencies. B1 works with PostgreSQL and domain entities. B2 works with Redis and three independent Redis concerns. The only shared surface is the project skeleton from B0, which both read but neither modifies. This is the strongest parallelization claim in the document and it is correct.

### B4 / B5 parallelization: Safe but with a caveat

B4 (consumer + workers) and B5 (BFF) are correctly identified as parallelizable after B3. The caveat is that if B3's hub surface needs a bug fix discovered during B4 testing, B5 (which builds against that surface) could be affected. The document acknowledges this in the risk section (R3) and in Phase 4's key risk paragraph. The mitigation (stabilize B3's contract surface) is the right one.

### "Parallelizable After Stabilization" claims: Correctly conditional

The hub signatures → relay dependency is correctly identified. The endpoint paths → ChatClient dependency is correctly identified. The stabilization prerequisite is practical — define the signatures/paths as an explicit artifact before building against them. This is good execution awareness.

### Fake parallelism check: None found

The document does not claim any parallelism that is actually sequential. The "Should NOT Be Parallelized" section is credible — the stated reasons (Lua scripts mask bugs when integrated into hub, consumer ambiguity with cache) reflect real integration ordering concerns.

---

## 7. Testing-Plan Review

### Coverage adequacy

The eight-level testing breakdown covers all required test types from the project's test strategy:

- Domain unit tests (Level 1): all invariants, factory methods, validation rules. Correct.
- Application unit tests (Level 2): all handlers with stubbed ports. Correct and complete — every use case handler has specified test expectations.
- Infrastructure integration tests — Postgres (Level 3): round-trip, DM resolution, pagination, retention, schema isolation. Thorough.
- Infrastructure integration tests — Redis (Level 4): Lua scripts, sweep, rate limiter, name cache. The Lua script test list is especially good — it covers all multi-tab edge cases.
- Consumer tests (Level 5): behavior + idempotency. Correct per project test strategy.
- API/Hub tests (Level 6): auth, validation, response shapes, relay forwarding. Correct.
- Contract tests (Level 7): serialization round-trip. Correct.
- E2E smoke tests (Level 8): golden paths + degradation. Correct.

### Missing test concerns

**No explicit mention of concurrent DM creation test at the application level.** Level 3 (Postgres) includes "Concurrent DM creation: two simultaneous creates for same pair -> one conversation" — good. But there's no corresponding application-level test for the `SendDirectMessage` handler under concurrent calls. The handler orchestrates conversation resolution + message creation; the race condition is at the Postgres level, but the handler's behavior under concurrent calls should also be verified.

**No test for rate-limit counter persistence across reconnects.** The architecture spec explicitly states "Rate-limit state is keyed by `identityId`, not by `connectionId`. This means limits persist across reconnects." There is no test case that verifies a reconnected user's rate-limit counter is still active. This is a correctness concern.

**No test for the "Unknown" sentinel in message history.** If the display-name resolver falls through to sentinel, the message is stamped "Unknown". There should be a test that verifies a message with "Unknown" as the display name round-trips correctly and appears in history queries.

### Test infrastructure placement

As noted in C2, the test project creation and Testcontainers fixture setup are not assigned to any batch. This is a blocker for the first batch that needs tests (B1).

---

## 8. Ownership-Model Review

### Two-implementer model assessment

The proposed split (Implementer 1: Chat service batches 0-4, Implementer 2: BFF batch 5) is workable but suboptimal. The imbalance is significant:

- Implementer 1 does ~80% of the work across 5 batches
- Implementer 2 does ~20% of the work in 1 batch
- Implementer 2 is idle during Batches 0-3 (the document acknowledges this)

The real value of two implementers would be if they could split B1/B2 (Postgres and Redis are genuinely independent). The document lists this under "Truly Parallelizable" but doesn't suggest this as the two-implementer split point. Instead, the split is at B5 (BFF), which is late in the sequence.

A more effective two-implementer model might be:
- Implementer 1: B0 → B1 → B3 (domain + persistence → hub)
- Implementer 2: B0 (Players endpoint) → B2 → B5 (Redis → BFF)
- Both: B4 and B6

This would provide parallelism during B1/B2 (the highest-value window) rather than only during B4/B5. However, this is a suggestion for the implementation planner, not a decomposition defect.

### Coordination points: Adequately identified

The five coordination points (hub signatures, HTTP endpoints, Players response shape, Lua script review, relay review) are the right ones. The contract ownership table is clear and correctly assigns single ownership to each surface.

### Under-owned surface: Internal hub event payload shapes

The event payloads (`GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`, `ChatConnectionLost`) are critical to BFF relay correctness — the relay blindly forwards them. These payloads are defined in the architecture spec but are not listed in the contract ownership table. They're implicitly owned by the Chat implementer (they're server-to-client events), but the BFF implementer needs them to be stable before building the relay.

**Suggestion:** Add event payload shapes to the coordination points table, owned by Chat implementer, consumed by BFF implementer.

---

## 9. Readiness for Implementation Planning

### Can a planner now derive concrete implementation tasks without inventing missing execution structure?

**Almost.** The decomposition is substantially complete. A planner can derive tasks for most batches directly from the task groups in Section 4. The batch boundaries, dependencies, and parallelization constraints are clear enough for planning.

However, a planner would have to invent structure in four areas:

1. **Test project creation and infrastructure setup** — where does this go? A planner would guess B0 but it's not specified.
2. **Eligibility check in use case handlers** — a planner reading only the use case descriptions would omit it. They'd have to cross-reference EQ-4 and the architecture spec to discover it.
3. **Outbox/inbox migration placement** — the contradiction between B1 and B4 forces the planner to make a judgment call.
4. **EQ-3 DTO sharing** — the planner needs a decision to create BFF ChatClient tasks.

These are all fixable with targeted edits to the existing document. The overall structure does not need redesign.

### What is ready today

- Stream split and batch boundaries
- Dependency graph and sequencing
- Parallelization analysis
- Risk identification
- Testing level breakdown and test case inventory
- Ownership model and coordination points
- Open question resolution (EQ-1, 2, 4, 5, 6)

### What needs correction before planning

The four critical issues (C1-C4) listed in Section 3. These are specific, targeted fixes — not structural rework.

---

## 10. Required Changes Before Implementation Planning

| # | Issue | Fix | Effort |
|---|---|---|---|
| C1 | Eligibility check missing from `JoinGlobalChat` and send use case descriptions | Add explicit eligibility check step to S1.3 use case descriptions for `JoinGlobalChat`, `SendGlobalMessage`, and `SendDirectMessage`. Reference EQ-4 and architecture spec Section 16 Layer 2. | 10 minutes |
| C2 | Test project creation not assigned to any batch | Add test project creation (4 projects), NuGet test references, Testcontainers fixtures (Postgres + Redis), and `WebApplicationFactory` setup to Batch 0's included work. | 10 minutes |
| C3 | S5 (Tests) is a phantom stream with no content | Remove S5 from the stream table in Section 3. Add a note: "Tests are cross-cutting and embedded in each batch. See Section 8 for the full testing breakdown." | 5 minutes |
| C4 | EQ-3 (shared DTOs) is a recommendation, not a decision | Promote to decision: "Decision: option (b). BFF defines its own response types for ChatClient. Contract alignment verified by integration tests." | 5 minutes |
| — | Outbox/inbox migration placement contradiction (B1 vs B4) | Clarify in B1 that the initial migration includes outbox/inbox tables. Remove "outbox/inbox tables in `chat` schema migration" from S4.2 / B4 or clarify that B4 only configures MassTransit, not schema. | 5 minutes |

**Total estimated correction effort: ~35 minutes of document editing.**

After these corrections, the decomposition is ready for implementation planning.

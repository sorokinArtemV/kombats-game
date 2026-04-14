# Kombats Chat v1 — Decomposition Final Verification Check

**Reviewer:** Independent execution-planning reviewer
**Date:** 2026-04-14
**Scope:** Targeted verification of fixes to previously identified issues (C1–C4 + outbox/inbox contradiction)
**Previous review:** `docs/execution/reviews/kombats-chat-v1-decomposition-review.md`

---

## 1. Verification Verdict

**Ready for implementation planning.**

All five previously identified issues are fully resolved. The fixes are clean, correctly placed, and introduce no new contradictions. The document is now sufficient for a planner to derive concrete implementation tasks without inventing missing structure.

---

## 2. Issue-by-Issue Check

### C1: Chat Layer 2 eligibility enforcement in use cases — RESOLVED

**Where fixed:** S1.3 use case descriptions (lines 89, 91, 92).

- `JoinGlobalChat` now explicitly states: "**enforce eligibility (`OnboardingState == Ready`) as Chat Layer 2 authoritative check** (resolved EQ-4)" and "Rejects ineligible users with `ChatError(code: \"not_eligible\")`."
- `SendGlobalMessage` now includes: "**enforce eligibility (`OnboardingState == Ready`)**" as a named step before rate-check.
- `SendDirectMessage` now includes the same eligibility step.

The fix is also propagated to:
- Batch 3 outputs (line 367): "JoinGlobalChat enforces eligibility (`OnboardingState == Ready`)"
- Level 2 application unit tests (lines 536, 537, 540): eligibility enforcement explicitly called out in test expectations for all three handlers.

**Assessment:** Fully resolved. A planner reading only S1.3 will produce tasks that include eligibility enforcement. Test coverage for eligibility is also specified.

### C2: Test project creation assigned to a batch — RESOLVED

**Where fixed:** Batch 0 (lines 282–288), under a clearly labeled "Test infrastructure included in Batch 0" subsection.

Includes:
- Four test project creation
- Solution integration
- Testcontainers fixtures (PostgreSQL and Redis)
- `WebApplicationFactory<Program>` setup
- Players profile endpoint test coverage
- `dotnet test` verification

**Assessment:** Fully resolved. Test infrastructure is now a concrete deliverable of Batch 0, not an assumed precondition. The "What is NOT in Batch 0" paragraph (line 290) was also updated to reference "test infrastructure scaffolding" as included work.

### C3: S5 phantom stream removed — RESOLVED

**Where fixed:** Section 3 stream table (lines 40–46).

S5 is gone. The table now lists four streams (S1–S4). A new paragraph immediately after the table states: "Testing is a cross-cutting concern embedded in each batch, not a separate stream. See Section 8 for the full testing decomposition by level."

**Assessment:** Fully resolved. No phantom stream. The cross-reference to Section 8 is the right pointer.

### C4: EQ-3 promoted to firm decision — RESOLVED

**Where fixed:** EQ-3 (lines 758–764), now titled "RESOLVED".

States: "**Decision:** Option (b) — DTOs duplicated in Chat Api and BFF Application."

Includes concrete behavior: "Chat defines its internal HTTP response DTOs in its Api project. BFF defines matching request/response DTOs in its own Application layer for the `ChatClient`. Contract serialization tests in Batch 6 verify the two sides agree."

**Assessment:** Fully resolved. This is now an execution decision with a verification mechanism (Batch 6 serialization tests), not a recommendation.

### Outbox/inbox migration ownership contradiction — RESOLVED

**Where fixed:** S4.2 (line 259).

Now states: "Note: outbox/inbox table creation is owned by Batch 1 (S1.4 initial EF Core migration). No separate migration here."

Batch 4 description (line 381) also updated: "S4.2 — MassTransit topology (consumer registration — outbox/inbox tables already created in Batch 1 migration)."

S1.4 (line 307) continues to include outbox/inbox tables in the initial migration, which is now the sole owner.

**Assessment:** Fully resolved. Single ownership, no contradiction. Both S4.2 and B4 explicitly defer to B1.

---

## 3. Any New Contradictions Introduced

**None found.**

The fixes are additive clarifications and removals. No existing content was altered in a way that creates new inconsistencies. Specifically checked:

- Batch 3 outputs still align with updated S1.3 use case descriptions (eligibility added in both places).
- Level 2 test descriptions match the updated use case steps (eligibility tested where enforced).
- Batch 0 outputs section does not yet list test projects in the bullet list, but the dedicated "Test infrastructure" subsection is sufficiently clear. This is a minor formatting preference, not a contradiction.
- Stream count (4) is consistent throughout the document — no stale references to "five streams" found.

---

## 4. Readiness for Implementation Planning

**Ready.** The decomposition now provides:

- Complete use case descriptions with all architectural requirements (including eligibility enforcement)
- All deliverables assigned to concrete batches (including test infrastructure)
- Consistent stream structure with no phantom entries
- All open execution questions resolved as firm decisions
- No migration ownership contradictions

A planner can derive implementation tasks directly from each batch without inventing missing structure or cross-referencing the architecture spec for omitted requirements.

# Kombats Chat v1 Architecture Spec — Review (Round 2)

**Reviewer:** Architecture review (independent, fresh pass)
**Date:** 2026-04-14
**Document reviewed:** `docs/architecture/kombats-chat-v1-architecture-spec.md` (post-correction draft, revised 2026-04-14)
**Previous review:** `docs/architecture/reviews/kombats-chat-v1-architecture-review.md` — consulted for context only, not anchored on

---

## 1. Review Verdict

**Approved for decomposition.**

The spec is ready for task decomposition and implementation planning. The previous critical issue (presence refcount atomicity) has been properly resolved with well-specified Lua scripts. The rate-limit ambiguity has been resolved. Deployment constraints are now explicit. Failure modes are honest and consistent with the deployment model.

There are no design-level correctness bugs remaining. The issues identified below are either minor specification imprecisions that an implementer can resolve without inventing architecture, or v1-acceptable trade-offs that are adequately documented.

---

## 2. What Is Solid

**Presence lifecycle is now correctly specified.** The Lua scripts for connect, heartbeat, and disconnect are well-defined. The GET-then-conditional-DECR in the disconnect script correctly prevents negative refcounts. The multi-tab edge case table (Section 15) is thorough and covers the important scenarios including "tab opens during crash cleanup."

**Service boundaries remain clean.** Chat owns messages, conversations, presence, and rate limiting. Players owns profiles. BFF composes. No ownership leakage in either direction. The `IDisplayNameResolver` port in Application correctly abstracts the cache-then-HTTP-then-sentinel chain without leaking infrastructure strategy.

**Identifier model is sound and well-documented.** The codebase analysis is accurate — verified that `IdentityId` is the cross-service canonical identifier. The `playerId` client-facing alias follows Battle precedent. The table in Section 3 mapping identifier usage across contexts is useful reference material for implementers.

**Deployment constraints are now explicit.** Section 17 clearly states single-instance Chat, single-instance BFF, no Redis backplane, and — critically — that Redis is used for data only, not SignalR transport. This directly informs the failure behavior: Redis-down does not break message broadcast. This was a previous gap and is now well-resolved.

**Rate limiting is now unambiguous.** Section 16 specifies exactly one algorithm (sliding-window counter) per surface with concrete parameters. The clarification paragraph explicitly retiring the "1 msg/2s" phrasing is good defensive documentation.

**Failure and degradation behavior is internally consistent.** The Redis-down section now correctly states that SignalR broadcast continues (in-memory groups, no Redis dependency) while presence and rate limiting degrade. The coarse local fallback for rate limiting (AD-CHAT-08) is well-reasoned — neither fail-open nor fail-closed.

**Reconnect dedup contract is clean.** The strict greater-than comparison (`sent_at > @after`) eliminates server-side overlap. Stating that client-side dedup is "not required for correctness, though harmless" is the right framing.

**DM resolution model is race-free.** Deterministic sorted-pair resolution with `ON CONFLICT DO NOTHING + SELECT` is correct. The client never needs to construct a `conversationId` — it starts from `playerId` and Chat resolves internally.

**Hung-connection detection is now specified.** The hub invocation timeout approach is simple and reuses existing error paths. No separate heartbeat protocol needed.

---

## 3. Critical Issues

None.

The previous round's critical issue (C1: presence refcount crash safety) has been properly resolved. The Lua scripts are correctly specified and the negative-refcount edge case is handled.

---

## 4. Important but Non-Blocking Issues

### I1: Rate-limit algorithm is mislabeled — this is a fixed window, not a sliding window

**Section 16 — Rate limiting.**

The spec says "single sliding-window counter" and describes `INCR + EXPIRE`. This is a **fixed-window counter**, not a sliding window. The difference matters for burst behavior:

- At time t=0, user sends 5 messages. Counter = 5, key expires at t=10s.
- At t=9.5s, the window resets (key expired). User sends 5 more messages at t=10s.
- Result: 10 messages in 1 second, despite the "5 in 10s" limit.

A true sliding window uses a ZSET with per-request timestamps or a similar mechanism. The fixed-window approach is standard and acceptable for chat rate limiting — the burst edge case is minor. But the spec should not call it "sliding window" because that term has a specific meaning and an implementer familiar with rate-limiting algorithms would expect ZSET-based implementation.

**Suggested fix:** Relabel as "fixed-window counter" or specify a ZSET-based sliding window if the burst behavior is unacceptable. Either is fine for v1; just match the label to the algorithm.

### I2: Internal hub parameter naming is inconsistent with event payload naming

**Section 12 — Internal Chat Service Contracts.**

The internal hub method `SendDirectMessage` takes `recipientIdentityId: Guid` as a parameter. But the "Correction" paragraph in the same section says Chat's internal realtime contracts use `playerId` field names (no BFF remapping). This means:

- Method parameter: `recipientIdentityId`
- Event payload field: `playerId`

Both refer to the same value (the identity ID). An implementer looking at the hub method signature and the event payloads would see inconsistent naming for the same concept within the same service's contract surface.

**Suggested fix:** Either rename the method parameter to `recipientPlayerId` (consistent with the event payloads and BFF surface), or note that internal method parameters use `identityId` naming while event payloads use `playerId` naming (and why).

### I3: `JoinGlobalChat` returns an unbounded online-player list

**Section 11 — `JoinGlobalChatResult`.**

The `JoinGlobalChat` response includes `onlinePlayers` as a flat list with no pagination. The HTTP presence endpoint has `limit=100&offset=0`, but the SignalR method does not. At v1 scale (hundreds of users) this is fine. But at the scaling boundary the spec discusses (~10K users), this response would contain 10K player objects on every join.

**Non-blocking for v1.** But the spec should note that `onlinePlayers` in the join result is capped (e.g., first 100) or that it returns the full set at v1 scale with a note that pagination will be needed if the online population grows.

### I4: `lastMessageAt` on conversation listing — maintenance strategy unspecified

**Section 9 — Conversation listing.**

The `ConversationListResponse` includes `lastMessageAt` per conversation. The spec does not specify how this value is maintained:

- Is it a denormalized column on `conversations` updated on every message insert? (Requires concurrent-safe update, adds a write to every message send.)
- Is it derived via `MAX(sent_at) FROM messages WHERE conversation_id = ...`? (Expensive for listing if there are many conversations, but simpler to maintain.)

At v1 scale either works. But this is the kind of implementation choice that different implementers would make differently, producing different performance characteristics. A one-line note on the intended approach would eliminate ambiguity.

### I5: Heartbeat script does not guard against renewing presence for a TTL-expired user

**Section 7 — Lua script `presence_heartbeat`.**

The heartbeat script unconditionally calls `ZADD` on the online set. If the refcount key has already expired (due to prolonged network delay causing missed heartbeats), the heartbeat would:
- `EXPIRE` on non-existent refcount key → returns 0, no effect
- `EXPIRE` on non-existent presence key → returns 0, no effect
- `ZADD` on online set → re-adds the user with a fresh score

This creates a brief inconsistency: the user appears in the ZSET (and thus in online queries) with no presence record or refcount. The sweep checks for old scores, but this heartbeat just refreshed the score, so the sweep won't catch it until 90s later. Disconnect would eventually clean it up (GET returns nil → treated as 0 → cleanup path).

**Non-blocking.** The scenario requires 3+ consecutive missed heartbeats (90s of no heartbeats while the connection is still alive), which is unlikely. The inconsistency self-resolves on disconnect. But for correctness, the heartbeat script could check `EXISTS KEYS[1]` before proceeding and return 0 (no-op) if the refcount key is gone.

---

## 5. Questionable Assumptions

### Q1: Message retention DELETE may need batching at scale

**Section 8 — Retention.**

The retention worker runs `DELETE FROM chat.messages WHERE sent_at < now() - interval '24 hours'`. With high message volume, this could delete hundreds of thousands of rows in a single statement, holding a row-level lock for an extended period and potentially blocking concurrent message inserts on the same table (depending on PostgreSQL lock escalation behavior).

This is an implementation detail, not an architecture issue. A good implementer would batch this. But the spec could note "batched deletes recommended for high-volume scenarios" to prevent a naive unbounded DELETE.

### Q2: Presence sweep and multi-instance coordination

**Section 7 — Ungraceful disconnect / crash.**

The periodic sweep runs every 60 seconds, scanning the ZSET for stale entries and broadcasting `PlayerOffline` for each. With the v1 single-instance constraint, this works trivially.

The spec also claims multi-instance correctness in the same section ("Multiple Chat instances read and write the same keys"). If multiple instances run the sweep, both would attempt `ZREM` on the same stale entries. This is safe if the sweep uses `ZREM`'s return value to decide whether to broadcast (only broadcast if `ZREM` returns 1, meaning this instance was the one that removed it). The spec doesn't specify this detail.

**Non-blocking for v1** (single instance). But the multi-instance claim should be noted as requiring ZREM-return-value gating for correctness.

### Q3: Open DM model and harassment — correctly deferred but acknowledged

The spec now explicitly acknowledges this in OQ-4 as a product decision, not an architecture gap. The `IUserRestriction` port is identified as the mitigation point. This is the right framing. The previous review raised this and the response is adequate.

### Q4: DM presence limitation is honestly stated

Section 7 now explicitly documents that DM-only users don't receive realtime presence updates and that a targeted presence endpoint is deferred. This is an accepted v1 limitation, not an oversight. The framing is honest.

---

## 6. Service-Boundary Review

**Clean. No changes from the previous round's assessment.**

- Chat does not own player profiles — the display-name cache is explicitly framed as minimal denormalization.
- BFF does not own chat logic — the relay is transport, not domain.
- Players is not coupled to Chat — publishes `PlayerCombatProfileChanged` as it already does.
- Battle and Matchmaking are unchanged.
- The `IDisplayNameResolver` port in Application is correctly named (doesn't leak `IPlayersClient`). The previous review flagged naming and the project structure in the appendix shows `IDisplayNameResolver` as a separate port from `IDisplayNameCache`.

**One observation (non-blocking):** The `IPlayersClient` mentioned in prior context is no longer visible in the project structure appendix. The separation into `IDisplayNameCache` (Redis operations) and `IDisplayNameResolver` (fallback chain orchestration) is a better port decomposition. Verified: the appendix lists both.

---

## 7. Realtime-Topology Review

The relay pattern is acceptable for v1. The spec has improved since the previous round:

**Improvements:**
- The scaling cliff is now explicitly documented in Section 18: "Failure mode is a cliff, not a gradient."
- The migration cost is more honestly framed: "non-trivial internal change (adding messaging infra to BFF, replacing relay lifecycle with subscription model, making presence heartbeat-based)."
- The deployment constraint (single Chat instance, single BFF instance) is now a first-class section (Section 17), not an inference.

**Remaining observation (non-blocking):** The BattleHubRelay comparison is still present ("proven pattern") and still somewhat overstated — Battle connections are minutes-lived; Chat connections are hours-lived. The lifecycle management differences are meaningful. However, the spec now sufficiently qualifies the comparison with the "long-lived vs short-lived" distinction in Section 18, so this is no longer a misleading framing.

**Verdict on topology:** Acceptable for v1. Honestly constrained. Ready for decomposition.

---

## 8. Presence-Model Review

This was the previous round's critical area. It is now well-specified.

**What is correct:**
- Lua scripts for connect/disconnect/heartbeat are defined with concrete pseudocode.
- The disconnect script uses GET-then-conditional-DECR to prevent negative refcounts.
- The connect script uses INCR return value (1 = first connection) to decide broadcast — correct because INCR is atomic in Redis.
- The heartbeat renews all TTLs and ZSET score atomically.
- Multi-tab behavior table is comprehensive.
- Staleness tolerance (90s) is explicitly stated and justified.
- The sweep handles ungraceful disconnects as a safety net.

**Minor issue (I5 above):** Heartbeat doesn't guard against renewing a TTL-expired user. Self-resolving, non-blocking.

**Multi-instance claim:** The Lua scripts are correct for multi-instance Redis access. The sweep needs ZREM-return-value gating for multi-instance correctness (Q2 above). Since v1 is single-instance, this is not a blocker.

**Verdict on presence:** Correctly specified. Ready for decomposition.

---

## 9. Failure-Mode Review

The failure behavior sections are now internally consistent with the deployment model.

**Redis unavailable:** Correctly states SignalR broadcast continues (in-memory groups, no Redis dependency — made explicit in Section 17). Presence degrades. Rate limiting falls back to in-memory. Display-name cache misses fall through to Players HTTP. This is coherent.

**PostgreSQL unavailable:** Messages cannot be persisted, so sends fail. Correct — no attempt to queue in-memory.

**Players unavailable:** Cache → HTTP → "Unknown" sentinel. Correctly documented.

**Chat unavailable from BFF:** Errors returned to frontend. Reconnect flow well-defined.

**Hung connection:** Now covered via hub invocation timeout (Section 6). Reuses existing error paths.

**Reconnect after missed events:** The strict-greater-than dedup contract eliminates server-side overlap. SignalR automatic reconnect handles brief blips. Longer gaps use history catch-up.

**Previously identified gap (SignalR group management vs Redis) is resolved.** Section 17 explicitly states "Redis used only for data, not SignalR transport" and "SignalR group membership and broadcast are handled entirely by in-memory SignalR groups."

**No new gaps identified.** The failure behavior is honest about its constraints and does not overstate resilience.

---

## 10. Readiness for Task Decomposition

**Ready.**

The spec provides sufficient detail for an implementer to decompose into tasks without inventing architecture. Specifically:

| Area | Decomposition readiness |
|---|---|
| Chat service project structure | Ready — appendix defines all projects and layers |
| Domain entities (Conversation, Message) | Ready — fields, types, constraints specified |
| PostgreSQL schema and migrations | Ready — tables, indexes, naming convention defined |
| Redis key design | Ready — all keys, types, TTLs specified |
| Lua scripts for presence | Ready — pseudocode provided for all three scripts |
| MassTransit consumer | Ready — event, fields consumed, purpose documented |
| Internal HTTP endpoints | Ready — paths, auth model, response shapes defined |
| BFF HTTP endpoints and ChatHub | Ready — full contract surface in Sections 11-12 |
| Display-name cache and fallback chain | Ready — cache-miss behavior fully specified |
| Rate limiting | Ready — algorithm, parameters, Redis keys, fallback all defined |
| Message retention worker | Ready — SQL, frequency, conversation cleanup defined |
| Presence sweep worker | Ready — frequency, ZSET scan logic, broadcast behavior defined |
| BFF eligibility check | Ready — two-layer model with explicit "state unknown" behavior |
| Hung-connection detection | Ready — invocation timeout approach specified |
| Deployment constraints | Ready — single-instance constraint explicit, no backplane work needed |

**Open questions (OQ-1 through OQ-4) are minor and can be resolved during decomposition** without architectural impact. OQ-1 (hardcoded GUID vs seeder) is an implementation choice with a clear recommendation. OQ-2 (profile endpoint auth model) has a clear recommendation. OQ-3 (DM-only presence) has a clear recommendation. OQ-4 (harassment risk) is a product decision, acknowledged.

---

## 11. Required Changes Before Implementation Planning

**None are blocking.** The spec is approved for decomposition as-is.

The following are **recommended improvements** that would increase specification precision, but their absence would not cause an implementer to produce incorrect architecture:

1. **[I1] Relabel the rate-limit algorithm.** "Fixed-window counter" is what INCR+EXPIRE implements, not "sliding-window counter." The algorithm is fine; the label is wrong. One-line fix.

2. **[I2] Align internal hub parameter naming.** Either rename `recipientIdentityId` to `recipientPlayerId` in the internal hub method signature, or add a note explaining the naming split. One-line fix.

3. **[I3] Note that `onlinePlayers` in `JoinGlobalChatResult` should be capped.** Add a `limit` or note that it returns the full set at v1 scale. One-line fix.

4. **[I4] Specify `lastMessageAt` maintenance strategy.** One sentence: denormalized column updated on insert, or derived via query. Either works.

5. **[Q1] Note that message retention DELETE should be batched at high volume.** Implementation guidance, not architecture.

All of these can be addressed during decomposition or as implementer notes on individual tickets. None require architectural revision.

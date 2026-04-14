# Kombats Chat v1 Architecture Spec — Review

**Reviewer:** Architecture review (independent)
**Date:** 2026-04-14
**Document reviewed:** `docs/architecture/kombats-chat-v1-architecture-spec.md` (Draft, revised 2026-04-14)

---

## 1. Review Verdict

**Approved with required corrections before decomposition.**

The spec is substantially well-structured. Service boundaries are clean. The identifier model is sound. Most failure modes are addressed honestly. However, there are specific issues — one critical, several important — that must be resolved before task decomposition begins. The critical issue is the presence refcount race condition, which is a correctness bug in the design, not a trade-off. The important issues are under-specified areas that would cause implementation ambiguity or silent failures if not clarified before tickets are written.

---

## 2. What Is Solid

**Service boundary discipline.** The spec is unusually disciplined about what Chat owns and does not own. The player-card ownership framing is correct — Chat owns messages, conversations, and presence; Players owns profiles; BFF composes. The temptation to make Chat a profile projection service is explicitly avoided.

**Identifier model.** The decision to use `IdentityId` as the canonical chat identifier is correct and well-justified. The codebase analysis is accurate — every cross-service contract already uses `IdentityId`. The `playerId` client-facing alias follows Battle precedent. No new identifier concepts are introduced.

**DM resolution model.** The deterministic conversation resolution via sorted participant pair with `ON CONFLICT DO NOTHING + SELECT` is a clean, race-free pattern. Exposing `conversationId` in event payloads while allowing clients to address by `playerId` is the right split.

**Failure cascading.** The degradation hierarchy (Redis down -> coarse local rate limiter, Players down -> "Unknown" sentinel, Postgres down -> chat offline but presence continues) is honest and well-structured. The document does not pretend failures are impossible.

**Display-name cache justification.** The fallback chain (cache -> sync HTTP -> sentinel) is correctly designed. The acknowledgment that names are currently immutable post-onboarding and the explicit future-proofing note are appropriate.

**Deferred scope.** The v1 exclusion list is credible. The document resists the temptation to half-design deferred features.

---

## 3. Critical Issues

### C1: Presence refcount INCR/DECR is not crash-safe without Lua atomicity

**Section 7, Presence Model — Lifecycle steps 1 and 3.**

The spec describes:
- Connect: `INCR chat:presence:refs:{id}`. If result is 1, add to ZSET, broadcast `PlayerOnline`.
- Disconnect: `DECR chat:presence:refs:{id}`. If result is 0, remove from ZSET, broadcast `PlayerOffline`.

This is a multi-step operation across multiple Redis keys (INCR/DECR + conditional ZADD/ZREM + SET/DEL + TTL renewal). If the Chat instance crashes between INCR and ZADD, or between DECR reaching 0 and ZREM, the refcount and the ZSET diverge. The TTL sweep is described as the safety net, but:

1. DECR can go **negative** if a disconnect fires after the key has already expired (TTL elapsed). A subsequent connect would INCR from -1 to 0, which the logic interprets as "not first connection" — the player never appears online again until all keys expire. This is a correctness bug, not a staleness tolerance issue.

2. The INCR-then-conditionally-ZADD sequence is not atomic. Under concurrent tab opens, two connections can both see INCR return 1 (impossible with a single Redis, but the spec claims multi-instance support — multiple Chat instances hitting Redis concurrently). Actually, INCR is atomic in Redis, so two concurrent INCRs would return 1 and 2 respectively. This specific race is safe. But the INCR + ZADD + SET sequence is still non-atomic — a crash between INCR returning 1 and ZADD executing leaves the refcount at 1 with no ZSET entry.

**Required fix:** The connect and disconnect sequences must be Lua scripts to guarantee atomicity of the multi-key operation. The spec should specify this. Additionally, the DECR logic must handle the negative-refcount case (clamp to 0, or use a Lua script that does `if tonumber(redis.call('GET', key)) > 0 then redis.call('DECR', key) end`).

This is the only issue I consider a design-level correctness bug. Everything else is a trade-off or under-specification.

---

## 4. Important but Non-Blocking Issues

### I1: Reconnect catch-up has no deduplication guarantee

**Section 8 — Reconnect / missed-message recovery.**

The client reconnects, calls `JoinGlobalChat` (which returns recent messages), and may also fetch `?after={lastSeenTimestamp}`. There is no mechanism to deduplicate messages the client already received before disconnect with messages returned in the catch-up response. The `messageId` is present in payloads, so client-side dedup is possible, but the spec doesn't mention it. If the BFF or frontend does not deduplicate, users see duplicate messages after reconnect.

**Required clarification:** State explicitly that client-side dedup by `messageId` is expected, or define the server-side contract to guarantee no overlap (e.g., `JoinGlobalChat` returns messages only after the provided `lastSeenTimestamp`).

### I2: Rate-limit window semantics are ambiguous

**Section 16 — Rate limiting.**

The spec says "1 message / 2 seconds" for global chat and "Max 5 in 10 seconds" with a "10s window." These are two different rate-limiting algorithms (fixed-rate vs. sliding window with burst). The spec does not clarify whether both constraints apply simultaneously (leaky bucket + sliding window), or whether "1 message / 2 seconds" is just a human-readable summary of "max 5 in 10 seconds."

If they are independent, the implementation needs two counters per surface. If "1 message / 2 seconds" is just the steady-state summary of "5 in 10s", the spec should say so. This ambiguity will produce inconsistent implementations across implementers.

**Required clarification:** Specify exactly one algorithm per surface with its parameters. Remove the dual framing.

### I3: `chat:name:{identityId}` has no TTL — orphaned keys accumulate forever

**Section 13 — Redis Storage Model.**

The display-name cache key has "No TTL (updated on event, deleted if orphaned)." The spec does not define when or how orphaned keys are detected and deleted. If a player is created, their `PlayerCombatProfileChanged` event populates the cache, and then they never chat again and eventually the account is inactive, the key persists indefinitely. This is a minor leak per key but accumulates unboundedly over the system's lifetime.

**Required clarification:** Either add a long TTL (e.g., 7 days, renewed on event or on cache hit during message send) or define the orphan cleanup mechanism. "Deleted if orphaned" without a mechanism is not a specification.

### I4: Global chat has no pagination/throttling on the server-to-client broadcast path

**Section 17 — Risk: Global chat broadcast scaling.**

The spec acknowledges the broadcast fan-out risk and proposes rate limiting on inbound (1 msg / 2s / user). But with 500 concurrent users each sending at max rate, that's 250 messages/second broadcast to all 500 connections. The rate limit bounds inbound per-user, but not aggregate inbound or outbound fan-out.

The spec's mitigation mentions "sharding global chat into regional rooms" but does not define a concrete trigger or mechanism. For v1 this is acceptable — hundreds of users won't hit this. But the spec should state the aggregate throughput ceiling honestly (not just per-user rate) and define a monitoring trigger.

**Non-blocking** because v1 scale is genuinely safe, but the risk section understates the aggregate math.

### I5: The BFF eligibility check depends on `GetGameState` having been called

**Section 16 — Authorization — Layer 1 (BFF early rejection).**

> "The BFF already has the player's state from the `GetGameState` flow."

This assumes the client calls `GetGameState` before connecting to the ChatHub. The spec does not enforce this ordering. If a client connects to `/chathub` directly (valid — it's an authenticated endpoint), the BFF may not have cached the player's onboarding state. The BFF would then need to either:
- Fetch the state synchronously during hub connection (adding latency and a Players dependency to the hot path), or
- Skip the check and rely on Layer 2 (Chat service).

Layer 2 exists, so this isn't a security hole, but the spec presents Layer 1 as if it always works. It should clarify what the BFF does when it doesn't have cached state — does it call Players, or does it fall through to Chat's enforcement?

### I6: Conversation listing has no pagination

**Section 9 — Conversation listing.**

`GET /api/v1/chat/conversations` returns all conversations for the user. With 24-hour retention and auto-deletion of empty conversations, the practical count is bounded. But the spec doesn't define pagination for this endpoint. If retention extends later (the spec explicitly says it's configurable), a user with many DM partners could have an unbounded conversation list.

**Non-blocking for v1** (24-hour retention caps the practical size), but the spec should note that pagination will be needed if retention extends.

---

## 5. Questionable Assumptions

### Q1: "Any Ready player can DM any other Ready player" may need to be revisited sooner than the spec implies

The spec frames block/mute as a deferred feature. But an open-DM model with no opt-out means any player can be messaged by any other player from the moment they complete onboarding. In games with PvP, post-match harassment via DM is a known pattern. The `IUserRestriction` port exists for future enforcement, but v1 ships with no restriction implementation.

This is a product decision, not an architecture flaw. But the spec should explicitly acknowledge the harassment risk and note that `IUserRestriction` is the designated mitigation point, rather than framing it purely as a feature deferral.

### Q2: The "Unknown" sentinel for display names is a permanent, non-correctable degradation

When Players is down and the cache is empty, messages are stamped with `"Unknown"`. The spec says "The message is not retroactively updated." This means a cluster of messages sent during a Players outage will permanently show "Unknown" as the sender name, even though `senderIdentityId` is available for client-side resolution.

The spec should consider whether the client should use `sender.playerId` to lazy-resolve the display name when it sees `"Unknown"`, or whether this is intentionally a permanent write-time snapshot. If the latter, it should state this is acceptable for the 24-hour retention window (messages expire quickly anyway).

### Q3: Presence broadcast scope (global chat group only) creates an information asymmetry

**Section 7 — Presence broadcast scope.**

Presence changes are broadcast only to the global chat group. A DM-only user receives no presence updates about their conversation partners. This means the "online" indicator in a DM view would need a separate presence query (the HTTP endpoint exists), but the spec doesn't define how DM presence stays fresh. The client would need to poll `GET /api/v1/chat/presence/online` periodically, but that endpoint returns the full online list (paginated), not a targeted "is player X online?" query.

This is acceptable for v1 but creates a poor DM UX. The spec should acknowledge this gap and either:
- Add a `GET /api/v1/chat/presence/{playerId}` targeted check, or
- Document that DM presence freshness is deferred.

### Q4: The spec assumes single Chat instance for v1 but doesn't scope this as a constraint

The presence model uses Redis (multi-instance safe), but the SignalR group membership is per-instance. If Chat scales to two instances, a message broadcast to the global SignalR group on instance 1 doesn't reach connections on instance 2. The spec mentions the Redis backplane in Section 18 (deferred) but doesn't state "v1 assumes a single Chat instance" as an explicit deployment constraint.

This is the same issue as OQ-4 (multi-instance BFF), but for the Chat service itself. The spec should state this as a v1 deployment constraint, not just a deferred extension.

---

## 6. Service-Boundary Review

**Clean.** The boundaries between Chat, BFF, Players, Battle, and Matchmaking are well-defined.

Specific checks:
- **Chat does not own player profiles.** Correct. The display-name cache is explicitly framed as a minimal denormalization, not a profile projection.
- **BFF does not own chat logic.** Correct. The BFF relay is a transport concern (connection lifecycle, JWT forwarding), not a domain concern. The `ChatHub` in BFF is a pass-through, same as `BattleHubRelay`.
- **Players is not coupled to Chat.** Correct. Players publishes `PlayerCombatProfileChanged` as it already does. No Chat-specific events or endpoints are added to Players except the new profile query endpoint, which is a general capability, not Chat-specific.
- **Battle and Matchmaking are unchanged.** Correct.
- **BFF's player-card composition is general, not Chat-specific.** Correctly framed. The `GET /api/v1/players/{playerId}/card` endpoint is a general BFF responsibility.

**One minor observation:** The spec places `IPlayersClient` (synchronous HTTP fallback) in Chat's Application layer ports. This is an infrastructure concern — Chat Application should define the port (`IDisplayNameResolver`), and Infrastructure implements it with the Redis-then-HTTP-then-sentinel chain. The current spec has the right idea (the port exists) but the naming (`IPlayersClient` in Application) leaks the implementation strategy into the port definition. This is a naming/placement issue, not a boundary violation.

---

## 7. Realtime-Topology Review

This is the section I examined most critically.

### The relay pattern is acceptable for v1. The spec is honest about its costs.

The spec correctly identifies:
- O(N) downstream WebSocket connections (long-lived, unlike Battle's short-lived connections)
- The practical limit (~10K–50K concurrent connections per Chat instance)
- The migration path to Option B (shared pub/sub)
- The reasons Option B is worse for v1 (new infra in BFF, two communication paths, complex fan-out)

I verified that the BFF currently has zero messaging infrastructure (no Redis, no MassTransit). Adding either for chat v1 would be a meaningful operational expansion. The spec's pragmatic choice is defensible.

### Concerns

**The relay pattern masks a scaling cliff, not a gradient.** The spec frames the relay cost as linear (O(N) connections), but the failure mode is a cliff: when the Chat service's WebSocket connection limit is hit, new users simply cannot connect. There's no graceful degradation — it's "works" until "doesn't work." The spec should acknowledge this cliff behavior, not just the linear cost.

**The migration from Option A to Option B is described as "internal to BFF/Chat" but is actually a significant architectural change.** Moving from per-user relay to shared pub/sub requires:
1. Adding Redis or MassTransit to BFF (currently zero messaging infra)
2. Implementing event demultiplexing and per-connection routing in BFF
3. Replacing the relay lifecycle with a subscription model
4. Redesigning presence (currently free from connection lifecycle, must become explicit heartbeat-based)

The spec says "does not change client-facing contracts" — true. But it understates the internal migration complexity. It should frame this as a non-trivial migration, not as a smooth transition.

**The "proven pattern" argument for BattleHubRelay is weaker than it appears.** BattleHubRelay manages connections scoped to a single battle (minutes). Chat relay manages connections scoped to user sessions (hours). The lifecycle management, reconnection strategy, and resource holding patterns are fundamentally different. Reusing the relay code structure is reasonable, but the spec should not imply that BattleHubRelay validates the chat relay's behavior at scale.

### Verdict on topology

Acceptable for v1 with hundreds of users. The spec's framing is honest enough, but should be more explicit about the cliff behavior and the migration cost.

---

## 8. Failure-Mode Review

### Redis unavailable — Mostly sound, one gap

The coarse local fallback for rate limiting (AD-CHAT-08) is a reasonable trade-off. The acknowledgment that it's per-instance (weaker than distributed) is honest.

**Gap:** When Redis is down, presence is non-functional. The spec says `JoinGlobalChat` returns an empty online list. But it doesn't specify what happens to the SignalR group management. If Chat uses Redis-backed SignalR groups (which it would need for multi-instance), Redis being down means group broadcast itself fails. If Chat uses in-memory SignalR groups (single-instance), Redis being down only affects presence queries, not message delivery.

The spec should clarify: does SignalR group management depend on Redis? If yes, Redis down means message broadcast fails, not just presence. If no, state the single-instance constraint explicitly.

### PostgreSQL unavailable — Sound

Messages require persistence. No persistence = no send. This is correct. The spec does not try to queue messages in memory or Redis during Postgres outage, which would create consistency problems.

### Players unavailable — Sound

The fallback chain (cache -> HTTP -> sentinel) is well-designed. The "Unknown" sentinel is acceptable for 24-hour ephemeral chat.

### Chat unavailable from BFF — Sound

The spec correctly describes the BFF behavior (error to frontend, no crash) and the reconnect flow.

### Missing failure mode: What if the downstream relay connection hangs (not drops)?

The spec covers "downstream connection drops" but not "downstream connection hangs" — the WebSocket is open but the Chat service stops responding. The BFF would not detect this (no explicit timeout on the downstream connection beyond TCP keepalive). The user would see messages not being delivered with no error.

**Required clarification:** Define a ping/pong or send timeout on the downstream relay connection to detect hung connections and trigger `ChatConnectionLost`.

---

## 9. Readiness for Task Decomposition

The spec is approximately 90% ready. The domain model, service boundaries, API contracts, storage model, and failure behavior are well-defined enough for ticket writing. The open questions (OQ-1 through OQ-4) are minor and can be resolved during decomposition.

**What is ready for decomposition now:**
- Chat service project structure and layer responsibilities
- Domain entities (Conversation, Message)
- PostgreSQL schema and migrations
- Redis key design (after the Lua script correction for presence)
- MassTransit consumer for `PlayerCombatProfileChanged`
- Internal HTTP endpoints
- BFF HTTP endpoints and ChatHub surface
- Display-name cache and fallback chain
- Rate limiting (after algorithm clarification)
- Message retention worker
- Presence sweep worker

**What is NOT ready for decomposition:**
- Presence lifecycle (requires Lua script specification — C1)
- Rate-limit algorithm (ambiguous dual framing — I2)
- BFF eligibility check behavior when state is not cached (I5)

---

## 10. Required Changes Before Implementation Planning

These must be addressed before task decomposition begins:

1. **[C1] Specify Lua scripts for presence connect/disconnect sequences.** The INCR/DECR + ZADD/ZREM + SET/DEL + TTL sequence must be atomic. Define the Lua script contracts or at minimum specify that these operations must be executed as atomic Lua scripts. Handle the negative-refcount edge case.

2. **[I2] Resolve rate-limit algorithm ambiguity.** Pick one algorithm per surface. Remove the dual "1 msg / 2s" + "max 5 in 10s" framing or explicitly define them as two independent checks.

3. **[I5] Clarify BFF eligibility check behavior when player state is not cached.** State whether the BFF calls Players synchronously during hub connection or falls through to Chat's enforcement.

4. **[I3] Define display-name cache TTL or orphan cleanup mechanism.** "Deleted if orphaned" without a mechanism is not implementable.

5. **[Topology] Add explicit v1 deployment constraint: single Chat instance, single BFF instance.** Currently implicit in the text but not stated as a constraint. This affects task decomposition — no Redis backplane work is needed for v1, but this must be an explicit decision, not an oversight.

6. **[Failure] Clarify whether SignalR group management depends on Redis.** If yes, Redis-down impact is larger than described. If no, state the single-instance constraint.

7. **[Failure] Define hung-connection detection for the downstream relay.** A timeout or ping/pong mechanism is needed.

Items 1–4 are specification gaps that will cause implementation ambiguity. Items 5–7 are constraint clarifications that affect scope and ticket boundaries.

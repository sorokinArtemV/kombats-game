# Kombats Chat v1 — Batch 3 Independent Review

**Date:** 2026-04-15
**Reviewer:** independent execution reviewer
**Inputs:** architecture spec, implementation plan, decomposition, Batch 3 execution note, Batch 3 self-review, repository code at `kombats_full_refactor`.

---

## 1. Review verdict

**Approved to proceed to Batch 4 and Batch 5.**

Batch 3 is genuinely complete. The internal hub contract is frozen and usable by Batch 5. The five application use cases are implemented correctly and align with the approved pipelines. Authoritative eligibility is enforced on all three authoring paths (`JoinGlobalChat`, `SendGlobalMessage`, `SendDirectMessage`), including the critical named-but-not-ready negative case at both handler and hub layers. DM delivery is proven end-to-end through two real `HubConnection`s. Scope stayed strictly within Batch 3 — no MassTransit, no workers, no BFF code.

Minor non-blocking items are listed in §4. None are required before Batch 4 / Batch 5 start.

---

## 2. What is solid

- **Hub surface** (`InternalChatHub.cs:23-163`) matches the frozen contract: `/chathub-internal`, `[Authorize]`, four methods with the documented signatures, five server events with stable names.
- **Per-identity DM group** (`ChatGroups.ForIdentity`) joined on connect, not on `SendDirectMessage`. Multi-tab DMs are structurally correct, not hand-waved.
- **Pipelines match the plan exactly.** `SendDirectMessage` ordering: self-check → sender eligibility → restriction → recipient eligibility → rate limit → filter → display name → conversation → persist → update → notify (`SendDirectMessageHandler.cs:29-103`). `SendGlobalMessage` same shape. `JoinGlobalChat` rejects before any read I/O.
- **ChatError carrier** (`ChatError.cs`) inherits `Error` and carries `RetryAfterMs` only on `rate_limited`. The hub maps `Error → ChatErrorEvent` consistently in `SendErrorAsync`.
- **Heartbeat** uses injected `TimeProvider.CreateTimer`, creates a fresh DI async scope per tick, swallows exceptions, and is stopped before the disconnect handler runs — timer lifecycle is safe.
- **DM delivery proof.** `SendDirectMessage_RecipientReceivesEventOnSecondConnection` drives two authenticated `HubConnection`s and asserts `DirectMessageReceived` arrives on the recipient end-to-end with correct `ConversationId`, content, and sender. This is not seam-level mocking — it is wire-level proof.
- **Named-but-not-ready** covered at handler level (both `JoinGlobalChat` and `SendDirectMessage` sender paths) and at hub level (`JoinGlobalChat_NamedButNotReady_EmitsChatError`).
- **`LeaveGlobalChat` behaviour** is actually proven: A joins → leaves; B joins and sends; A receives nothing.
- **Scope discipline.** No MassTransit, no hosted services, no retention/sweep workers, no BFF projects, no new migrations. Bootstrap Batch 3 block is additive and clean (`Program.cs:148-168`).

---

## 3. Critical issues

None. No blockers.

---

## 4. Important but non-blocking issues

1. **Per-identity group join happens before `ConnectUser` handler.** In `OnConnectedAsync` (`InternalChatHub.cs:43-47`) the group is added unconditionally before the presence store is touched. If `ConnectUserHandler` fails (or eligibility is later introduced on connect), the client is already in their DM group. Today this is benign (presence-only failure is logged and tolerated per spec §16); it is worth noting as Batch 5 will be sensitive to the exact connect-time semantics.
2. **`LeaveGlobalChat` is not authenticated at the method level.** The hub requires auth on the connection, but `LeaveGlobalChat()` does not re-verify `Context.User?.GetIdentityId()` like the other methods do. Harmless (idempotent group-remove on a caller's own connection id) but inconsistent with sibling methods. Non-blocker.
3. **Heartbeat `ITimer` cadence is not pumped in CI.** The tick body is covered by `HeartbeatSchedulerTests`; the 30 s scheduling cadence of `TimeProvider.System` is a runtime guarantee and not asserted. Honestly called out by the self-review. Deferred to Batch 7 reliability is acceptable.
4. **`UpdateLastMessageAtAsync` is not transactional with `SaveAsync`.** Documented in the self-review; `LastMessageAt` is a denormalised hint per the architecture spec. Accept as-is.
5. **No retry / no compensation on `IChatNotifier` failure** after the message is persisted. A broadcast failure becomes a caller-observed exception while the message is durable. Spec §16 resilient-degradation posture covers this. Non-blocker.
6. **`RemoveServicesByType` in `ChatHubFactory`** matches by substring on type name. Works today, but brittle if future infrastructure types introduce name collisions. Test-side concern only.
7. **`EligibilityChecker` still falls back to synchronous HTTP to Players** (`EligibilityChecker.cs:26-56`). This is pre-existing Batch 2 code, not Batch 3 scope, but it formally conflicts with AD-09. Log as a known posture; do not fix in Batch 3.

---

## 5. Scope-fidelity review

**Clean.** Files touched are confined to:
- `Kombats.Chat.Application/{ChatError.cs, ChatErrorCodes.cs, Notifications/, Ports/{IChatNotifier,IMessageFilter,IUserRestriction}.cs, UseCases/{Connect,Disconnect,Join,SendGlobal,SendDirect}}`
- `Kombats.Chat.Infrastructure/Services/{MessageFilter,UserRestriction}.cs`
- `Kombats.Chat.Api/{AssemblyInfo.cs, Hubs/*}`
- `Kombats.Chat.Bootstrap/Program.cs` (additive Batch 3 block only)
- Test projects.

No BFF, no MassTransit, no hosted workers, no retention/sweep code, no player-card endpoint. Bootstrap contains an explicit `NOTE:` comment deferring messaging + workers to Batch 4. No existing B1/B2 production code was modified for non-Batch-3 reasons.

---

## 6. Contract-freeze review

The internal contract documented in §1 of the execution note is actually present in code and is stable enough to build Batch 5 (BFF relay) against:

- Hub path `/chathub-internal` mapped in `Program.cs:189`.
- Method names/signatures match execution note exactly (`InternalChatHub.cs`). Invocation return shapes: `JoinGlobalChatResponse?` (null on `ChatError`), `SendDirectMessageResponse?` (null on `ChatError`), `SendGlobalMessage` and `LeaveGlobalChat` void.
- Server → client event names are constants in `ChatHubEvents` (safe from drift).
- Payload records `GlobalMessageEvent`, `DirectMessageEvent`, `PlayerOnlineEvent`, `PlayerOfflineEvent`, `ChatErrorEvent` are **public sealed records** in `Kombats.Chat.Application.Notifications` — reachable by Batch 5.
- Response DTOs `JoinGlobalChatResponse` / `SendDirectMessageResponse` are public records.
- Reused DTOs `MessageDto`, `SenderDto`, `OnlinePlayerDto` are already public from B1/B2.
- Error codes are string constants in `ChatErrorCodes` (`rate_limited`, `message_too_long`, `message_empty`, `recipient_not_found`, `not_eligible`, `service_unavailable`).
- Group names (`"global"`, `"identity:{guid:D}"`) are internal to Chat — the BFF does not need to know them, only to forward hub events.

**Note for Batch 5:** `ChatError` (the `Error` subtype) is `internal sealed`. Only `ChatErrorEvent` crosses the wire (public). Batch 5 consumes `ChatErrorEvent`, not `ChatError`. This is correct and does not hurt the contract surface.

Contract is genuinely frozen.

---

## 7. Application and hub review

- **`ConnectUserHandler`** resolves display name → `ConnectAsync` → broadcasts `PlayerOnline` iff `firstConnection`. Does not join any SignalR group (correct; the hub handles that).
- **`DisconnectUserHandler`** (not inlined here but wired) broadcasts `PlayerOffline` iff last connection. Hub cancels the heartbeat timer before calling the handler (`InternalChatHub.cs:61`) — no stale ticks after disconnect.
- **`JoinGlobalChatHandler`** enforces eligibility first, then reads recent messages (capped 50, newest-first) and online players + count; cleanly returns `Result<JoinGlobalChatResponse>`. Hub adds to `"global"` group only on success.
- **`SendGlobalMessageHandler`** pipeline: eligibility → restriction → rate-limit (`"global"`) → filter → display-name → `Message.Create` → save → `UpdateLastMessageAtAsync(GlobalConversationId, …)` → notifier. Correct.
- **`SendDirectMessageHandler`** pipeline: self-check → sender eligibility → restriction → recipient eligibility → rate-limit (`"dm"`) → filter → display-name → `GetOrCreateDirectAsync` → save → `UpdateLastMessageAtAsync` → `SendDirectMessageAsync` to recipient's per-identity group. Self-DM → `recipient_not_found` (matches spec's privacy-sensitive mapping).
- **`LeaveGlobalChat`** is hub-only (group remove). Documented deviation with behavioural proof. Reasonable — nothing to persist or mutate beyond group membership.
- **Notifier ownership deviation.** `SignalRChatNotifier` lives in Api, not Infrastructure. Reason is sound (Infrastructure does not reference ASP.NET Core SignalR). Keeps Application free of transport types.

Hub lifecycle: auth-gated, identity-abort on missing claim, per-identity group auto-join, heartbeat start/stop keyed by `ConnectionId`, disconnect cleanup with try/catch around group removal. Robust enough.

---

## 8. Eligibility review

`IEligibilityChecker.CheckEligibilityAsync` is the single authoritative gate on each authoring path:

- `JoinGlobalChatHandler.cs:31` — rejects pre-read.
- `SendGlobalMessageHandler.cs:27` — sender check first.
- `SendDirectMessageHandler.cs:34` (sender) **and** `.cs:45` (recipient).

Rejection mappings:
- Sender not eligible → `ChatError(not_eligible)`.
- Recipient not eligible → `ChatError(recipient_not_found)` (correct privacy-preserving conflation with non-existent recipient).
- Self-DM → `ChatError(recipient_not_found)` short-circuit before any eligibility call.

Readiness is derived from the canonical `OnboardingState == "Ready"` (via `CachedPlayerInfo.IsEligible` in B2 code). No leakage of legacy `IsReady` semantics in Batch 3 code. Named-but-not-ready is covered by handler unit tests and a hub integration test that asserts the `ChatError` event actually reaches the caller over the wire.

---

## 9. Test and verification review

Counts in the execution note match test files observed:

- **Application: 34/34** — five new handler test files exercise happy, not-eligible, rate-limit (with `RetryAfterMs`), invalid content (empty + too-long theory), self-DM, named-but-not-ready sender path, first/last-connection broadcast toggles.
- **API: 22/22** — includes:
  - Auth enforcement (unauthenticated start throws).
  - Authenticated connect calls `ConnectAsync` with resolved display name.
  - `JoinGlobalChat` eligible + named-but-not-ready hub wire-level proof.
  - `SendGlobalMessage` happy path (real `GlobalMessageReceived` on the wire), rate-limited + `RetryAfterMs`, invalid content.
  - `SendDirectMessage` single-connection handler-effect + two-connection wire-level delivery proof.
  - `LeaveGlobalChat_SilenceFollowingGlobalBroadcasts`.
  - Disconnect → `DisconnectAsync` invoked.
  - Heartbeat tick body, tick-swallows-exceptions, Start/Stop idempotency.
- **Domain: 23/23** unchanged.
- **Infrastructure** not re-run in sandbox (no Docker); unchanged from B1/B2. Honest and acceptable.

Gaps honestly flagged (all non-blocking):
- Real-time 30 s `ITimer` cadence not pumped (deferred).
- No end-to-end proof of `PlayerOnline`/`PlayerOffline` broadcast over the wire at the hub layer; covered at handler layer through notifier call assertions. Acceptable for Batch 3.
- No stress/load test for many concurrent heartbeats. Not in Batch 3 scope.

Test quality is materially stronger than the initial Batch 3 plan's minimum. No critical coverage hole.

---

## 10. Execution-note honesty review

The execution note and self-review are materially honest:

- Deviations from plan (notifier location, `LeaveGlobalChat` hub-only, per-identity group, `AssemblyInfo.cs`) are listed in §5 of the execution note with rationale.
- Test counts correspond to test files on disk.
- Infrastructure tests are honestly called out as "not re-run in sandbox" rather than claimed-passing.
- The heartbeat coverage gap (timer cadence vs. tick body) is correctly decomposed.
- `UpdateLastMessageAt` non-transactional ordering is disclosed.
- Scope-verification claim ("no files outside the chat module touched") holds.

No overstated completion claims detected.

---

## 11. Readiness for Batch 4 and Batch 5

**Is Batch 3 actually complete?** Yes.
**Can work proceed to Batch 4 and Batch 5?** Yes, in parallel.

- **Batch 4** (MassTransit consumer for `PlayerCombatProfileChanged`, retention worker, presence sweep worker) builds cleanly on top of the current Bootstrap without changing any Batch 3 hub/application code.
- **Batch 5** (BFF `ChatHubRelay`, `ChatHub`, `ChatClient`, player card proxy) has a stable contract to target:
  - Hub path `/chathub-internal`
  - Hub methods + signatures
  - Event names (`ChatHubEvents` constants)
  - Public payload records in `Kombats.Chat.Application.Notifications`
  - Public response DTOs
  - `ChatErrorCodes` string set
  - Per-identity DM routing is internal to Chat — the BFF does not need to know about groups, only to forward events.

The integration points between Batch 3 and later batches are solid enough that no Batch 3 rework is anticipated to unblock later work.

---

## 12. Required fixes before proceeding (if any)

**None required.** Optional follow-ups (track as Batch 7 or backlog, not blockers):

1. Revisit `EligibilityChecker` HTTP fallback vs AD-09 (pre-existing B2 concern, out of Batch 3 scope).
2. Add a fake `TimeProvider` test that pumps virtual ticks to cover the 30 s cadence scheduling.
3. Add `Context.User?.GetIdentityId()` check in `LeaveGlobalChat` for consistency with the other hub methods.
4. Consider moving per-identity group join to after successful `ConnectUserHandler` to tighten connect-time semantics if Batch 5 relies on it.
5. Harden `ChatHubFactory.RemoveServicesByType` to match by exact `ServiceType` rather than string name.

None of these block Batch 4 or Batch 5.

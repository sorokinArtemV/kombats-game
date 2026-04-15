# Kombats Chat v1 — Batch 3 Self-Review

**Date:** 2026-04-15
**Reviewer (self):** implementer
**Inputs:** `docs/architecture/kombats-chat-v1-architecture-spec.md`,
`docs/execution/kombats-chat-v1-decomposition.md`,
`docs/execution/kombats-chat-v1-implementation-plan.md`,
`docs/execution/kombats-chat-v1-batch3-execution.md`.

This is an internal quality gate before independent review. Not a substitute for it.

---

## 1. Did Batch 3 stay within Batch 3 scope?

**Yes.** Files added/changed only in:
- `src/Kombats.Chat/Kombats.Chat.Application/` — ports, error codes, notifier event records, five new use cases, `ChatError` carrier.
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/` — `MessageFilter`, `UserRestriction`.
- `src/Kombats.Chat/Kombats.Chat.Api/Hubs/` — `InternalChatHub`, `SignalRChatNotifier`, `HeartbeatScheduler`, `ChatGroups`, `ChatHubEvents`. `AssemblyInfo.cs` added.
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs` — Batch 3 wiring block.
- `tests/Kombats.Chat/Kombats.Chat.Application.Tests/` — five new test files.
- `tests/Kombats.Chat/Kombats.Chat.Api.Tests/` — `ChatHubFactory`, `InternalChatHubTests`, csproj package add.

No files outside the chat module touched. No B1/B2 production code changed.

## 2. Did any Batch 4+ behavior leak in?

**No.**
- No MassTransit registration / consumer.
- No `IHostedService` / background workers.
- No BFF projects touched.
- No retention or presence sweep code.
- No outbox / inbox migrations.

The Bootstrap NOTE comment explicitly defers MassTransit + workers to Batch 4.

## 3. Is the internal contract truly frozen and usable by Batch 5?

**Yes.**
- Hub path: `/chathub-internal`.
- Hub method names + parameter shapes documented and present in `InternalChatHub`.
- Event names are constants in `ChatHubEvents` (`GlobalMessageReceived`, `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`).
- Payload records are `public` in `Kombats.Chat.Application.Notifications` (`GlobalMessageEvent`, `DirectMessageEvent`, `PlayerOnlineEvent`, `PlayerOfflineEvent`, `ChatErrorEvent`).
- Response DTOs are `public records`: `JoinGlobalChatResponse`, `SendDirectMessageResponse`, plus reused `MessageDto`/`SenderDto`/`OnlinePlayerDto`.
- Error codes are constants in `ChatErrorCodes` — the exact strings the spec enumerates.
- All these surfaces are reachable to a downstream Batch 5 consumer that references `Kombats.Chat.Application` (per the duplicated-DTO/no-shared-DTO-package decision, the BFF will define matching types or reference these).

## 4. Are eligibility checks actually authoritative?

**Yes.** `IEligibilityChecker.CheckEligibilityAsync` is invoked in:
- `JoinGlobalChatHandler` (line ~33).
- `SendGlobalMessageHandler` (line ~31) — sender check.
- `SendDirectMessageHandler` — sender (line ~36) **and** recipient (line ~46).

The check derives readiness from `OnboardingState == "Ready"` (verified in `EligibilityChecker` infrastructure code from B2; not changed in this batch). Rejection produces `ChatError(not_eligible)` for the sender and `ChatError(recipient_not_found)` for the recipient.

## 5. Is the named-but-not-ready negative case tested and correct?

**Yes — at two layers.**
- `JoinGlobalChatHandlerTests.NamedButNotReady_IsRejected` — sets up `EligibilityResult(false)` (the substitute reflects "named but not Ready" because `EligibilityChecker` returns `Eligible=false` whenever `OnboardingState != "Ready"`, regardless of cached display name). Asserts `ChatErrorCodes.NotEligible` and that no downstream queries were made.
- `SendDirectMessageHandlerTests.NamedButNotReady_IsRejected` — same pattern for sender path.
- `InternalChatHubTests.JoinGlobalChat_NamedButNotReady_EmitsChatError` — drives the real hub through `HubConnection`, asserts the `ChatError` event reaches the caller with `code == "not_eligible"` and the response is null.

The handler tests assert the **handler-level guarantee** (no I/O, correct error code), and the hub test asserts the **wire-level guarantee** (`ChatError` actually reaches the caller).

## 6. Are connect/disconnect/heartbeat semantics aligned with the approved plan?

**Yes.**
- `ConnectUser`: presence first, broadcast on `firstConnection == true`. Does not touch SignalR groups for global chat.
- `DisconnectUser`: presence, broadcast on `lastConnection == true`. Hub stops the heartbeat timer **before** invoking the handler (guarantees no late ticks).
- Heartbeat: server-driven 30 s timer per connection (`HeartbeatScheduler.Interval`), uses `TimeProvider.CreateTimer`, scoped DI for `IPresenceStore`. Failures caught and logged — no process crash, no state corruption.
- Hub OnConnected joins the per-identity DM group (multi-tab DM safety) but does **not** join `"global"` — that happens only on `JoinGlobalChat`.

## 7. Hidden gaps an independent reviewer is likely to catch

**Honest list (post hardening pass):**

1. **Heartbeat tick path — improved.** `HeartbeatScheduler.TickAsync` is now an `internal` testing seam, directly covered by `HeartbeatSchedulerTests`: a real tick calls `IPresenceStore.HeartbeatAsync`; a throwing presence store does not propagate; `Start`/`Stop` is idempotent. **Remaining gap:** the real-time `ITimer` cadence (30 s) is not pumped in CI. That requires a fake `TimeProvider` and is deferred to Batch 7 reliability — `TimeProvider.System` is a runtime guarantee, not project code, so the project-side risk is bounded to the tick body, which IS covered.
2. **Second-client DM delivery — fixed.** `InternalChatHubTests.SendDirectMessage_RecipientReceivesEventOnSecondConnection` now drives two real authenticated `HubConnection`s. Recipient connects (auto-joins per-identity group), sender invokes `SendDirectMessage`, recipient asserts `DirectMessageReceived` arrives end-to-end with the correct `ConversationId`, content, and sender id. The wire path through `ChatGroups.ForIdentity` is now proven.
3. **`LeaveGlobalChat` — clarified and tested.** Decision is now explicit in the execution note: hub-only, no application handler, no state to mutate. Behavioural test `LeaveGlobalChat_SilenceFollowingGlobalBroadcasts` proves a connection that leaves stops receiving global broadcasts.
4. **`UpdateLastMessageAtAsync` ordering.** Save → update is not transactional. If the second call fails mid-flight, `LastMessageAt` lags. Acceptable for v1 (self-correcting on next message); matches the architecture spec which treats `LastMessageAt` as a denormalised hint, not authoritative. Worth flagging to the reviewer.
5. **`ConnectUser` failure is logged but the SignalR connection remains open.** If `IPresenceStore.ConnectAsync` throws, the user is connected at SignalR level but invisible to presence. The plan does not specify hard-fail; logging-and-continue matches the resilient-degradation posture in §16 of the architecture spec.
6. **No retries/circuit breaker on `IChatNotifier` calls.** Reasonable for v1. Notifier exceptions would surface to the caller's handler — they'd see a `Result.Success` for persistence but the broadcast would have thrown. Not catastrophic (recipients can see the message via history endpoint) but worth flagging.

None of these are correctness defects relative to the approved plan; they are honest scope/coverage observations.

## 8. Are the execution note and verification claims fully honest?

**Yes (post hardening pass).**
- Test counts in the execution note match observed runs: Domain 23/23, Application 34/34, Api **22/22**.
- Infrastructure tests honestly noted as "not re-run in sandbox; built clean; unchanged from B1/B2" rather than claimed-passing.
- Deviations from plan are listed in §5 of the execution note.
- Heartbeat coverage is now precisely described: tick body covered; real-time cadence remaining gap honestly recorded.
- The `LeaveGlobalChat` hub-only decision is documented AND covered by an explicit behavioural test.
- Second-client DM delivery is covered by a real two-`HubConnection` integration test.

---

## Verdict

Batch 3 is **ready for independent review.**

- Internal contract frozen and documented.
- Authoritative eligibility enforced and tested at handler + hub layers, including the critical named-but-not-ready negative case.
- Hub wired, build clean, all runnable tests pass.
- No scope leakage into Batch 4+.
- Deviations and gaps are explicit, not hidden.

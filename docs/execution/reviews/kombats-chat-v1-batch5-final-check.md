# Kombats Chat v1 — Batch 5 Final Check

**Date:** 2026-04-15
**Scope:** Verification pass on the two required fixes from
`docs/execution/reviews/kombats-chat-v1-batch5-review.md` §12.

---

## 1. Verification verdict

**Ready for Batch 6.**

Both required fixes are in place. Drop/timeout paths still emit
`ChatConnectionLost`. No new contradictions introduced.

## 2. Issue-by-issue check

### Issue 1 — Spurious `ChatConnectionLost` on intentional close paths
**Status: resolved.**

- `ChatConnection.IntentionalClose` flag added (`ChatConnection.cs:16`).
- `DisconnectAsync` flips it before `DisposeConnectionSafely` so the
  `Closed` handler suppresses notification (`ChatHubRelay.cs:199`).
- `Closed` handler now branches on `intentional` and only sends
  `ChatConnectionLost` + removes from dictionary when `false`
  (`ChatHubRelay.cs:134–159`).
- Real-downstream-loss paths still notify:
  - `DownstreamDrop_SendsChatConnectionLostToFrontend` (Context.Abort)
  - `HungDownstreamCall_TimesOutAndSendsChatConnectionLost` (timeout)
  - `HandleInvocationTimeoutAsync` continues to emit the
    `downstream_timeout` notification *before* calling `DisconnectAsync`
    (`ChatHubRelay.cs:286`), so the frontend still sees the event.
- New behavioural tests cover the suppression:
  - `GracefulDisconnect_DoesNotEmitChatConnectionLost`
  - `ForcedReconnect_DoesNotEmitChatConnectionLost`
  - `DisposeAsync_DoesNotEmitChatConnectionLost`

### Issue 2 — Missing per-route auth-rejection tests
**Status: resolved.**

`tests/Kombats.Bff/Kombats.Bff.Api.Tests/ChatEndpointHttpTests.cs` now contains:
- `GetConversationMessages_NoAuth_Returns401` (line 181)
- `GetDirectMessages_NoAuth_Returns401` (line 188)
- `GetOnlinePlayers_NoAuth_Returns401` (line 195)

Each issues an unauthenticated `GET` against the real route through `TestServer`
and asserts `HttpStatusCode.Unauthorized`. Pre-existing
`GetConversations_NoAuth_Returns401` and `GetPlayerCard_NoAuth_Returns401` are
preserved.

## 3. Any new contradictions introduced

None observed.

- The `Closed` handler still removes from the dictionary on real drops; the
  intentional path already removes via `DisconnectAsync` (TryRemove → flag →
  dispose), so cleanup remains correct in both cases.
- Forced-reconnect ordering is safe: `ConnectAsync` calls `DisconnectAsync`
  (which removes the old entry, sets `IntentionalClose`, disposes), then
  inserts the new `ChatConnection`. The old `Closed` handler closes over the
  *old* `ChatConnection` instance, so the suppression flag check is local to
  the dying connection only.
- No code or behavioural drift on the frozen Batch 3 contract. Event names,
  payloads, and URL paths are unchanged.
- The `JoinGlobalChatAsync` warning about `Closed` firing during `StopAsync` —
  no longer relevant because `IntentionalClose` is set first.

## 4. Readiness for Batch 6

Yes. Both blockers from the previous review are closed and verified by
behavioural tests against the real in-process SignalR hub. Batch 6 (end-to-end
validation + hardening) can begin.

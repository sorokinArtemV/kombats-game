# Kombats Chat v1 — Batch 5 Self-Review

**Date:** 2026-04-15
**Reviewer posture:** Strict self-review of the Batch 5 implementation.
**Inputs:** repository code at HEAD on `kombats_full_refactor`, the Batch 5 execution
note, the Batch 3 execution note (frozen contract), the Batch 4 review (pre-Batch-5
required fixes), the implementation plan §Batch 5, and the architecture spec.

---

## 1. Verdict

**Approved with no required follow-up before independent review.**

Batch 5 is scoped, builds clean, and tests pass. The Batch 3 frozen contract is
unchanged. Two small honest gaps are recorded below as deferred (none block the
batch's gate).

---

## 2. Did Batch 5 stay within Batch 5 scope?

Yes.

What changed in `src/`:
- BFF Application: `Relay/IChatHubRelay.cs`, `Relay/IFrontendChatSender.cs`,
  `Relay/ChatHubRelay.cs`, `Relay/ChatConnection.cs`, `AssemblyInfo.cs`,
  `Clients/IChatClient.cs`, `Clients/ChatClient.cs`,
  `Clients/IPlayersClient.cs` (added `GetProfileAsync`),
  `Clients/PlayersClient.cs` (added `GetProfileAsync` impl),
  `Clients/ServiceOptions.cs` (optional `Chat` property),
  `Models/Internal/InternalChatModels.cs` (new file).
- BFF Api: `Hubs/ChatHub.cs`, `Hubs/HubContextChatSender.cs`,
  `Endpoints/Chat/{4 endpoints}.cs`, `Endpoints/PlayerCard/GetPlayerCardEndpoint.cs`,
  `Mapping/ChatMapper.cs`, `Models/Responses/ChatResponses.cs`.
- BFF Bootstrap: `Program.cs` (Chat HttpClient registration, `IChatHubRelay` /
  `IFrontendChatSender` registration, JWT query-string handling extended to
  `/chathub`, `MapHub<ChatHub>("/chathub")`), `appsettings.json` (Services.Chat
  block).

Out-of-scope changes: **none**. No Chat service code touched. No Players service
code touched. No new Players endpoint invented. No changes to messaging,
contracts, or other modules.

## 3. Did any Batch 6 behaviour leak in?

No.

- No end-to-end cross-service tests — all integration tests are in-process
  against a fake Chat hub or stubbed `IChatClient`/`IPlayersClient`.
- No degradation-path tests (Redis-down, Postgres-down, etc.) — those are
  Batch 6.
- No auth-sweep across services — only `[Authorize]` enforcement on the new
  endpoints/hub.
- No Docker Compose changes.

## 4. Did the frozen Batch 3 contract remain unchanged?

Yes.

- `/chathub-internal` path: untouched.
- Hub method names (`JoinGlobalChat`, `LeaveGlobalChat`, `SendGlobalMessage`,
  `SendDirectMessage`): untouched on the Chat side; consumed verbatim by the
  BFF relay.
- Server-to-client event names (`GlobalMessageReceived`, `DirectMessageReceived`,
  `PlayerOnline`, `PlayerOffline`, `ChatError`): unchanged. Asserted on the BFF
  side by `ChatHubRelay.RelayedEventNames` + a unit test that pins the exact set
  — drift fails the test.
- Frozen DTOs (`JoinGlobalChatResponse`, `SendDirectMessageResponse`, `MessageDto`,
  `SenderDto`, `OnlinePlayerDto`, `PlayerOnlineEvent`, `PlayerOfflineEvent`,
  `ChatErrorEvent`): unchanged. The BFF redeclares its own duplicate DTOs per
  the approved no-shared-DTO-package decision; their JSON shape matches the
  Chat side 1:1.
- `ChatErrorCodes`: untouched.
- Chat URL paths: `/api/internal/conversations`, `/api/internal/conversations/{id}/messages`,
  `/api/internal/direct/{otherIdentityId}/messages`, `/api/internal/presence/online`
  match the Batch 1/3 endpoint definitions.

## 5. Are relay lifecycle semantics actually proven?

Yes — by **real** in-process SignalR runs, not by mocks:

| Lifecycle event | Test | Proof |
|---|---|---|
| Connect | `ConnectAsync_OpensDownstreamConnection` | Relay opens against a real Kestrel-hosted SignalR hub on a random loopback port |
| Forward client → server (void) | `SendGlobalMessage_ForwardsToDownstreamHub` | Server-side state observes the exact content sent by the relay |
| Forward client → server (response) | `JoinGlobalChat_RelaysResponseFromDownstreamHub` and `SendDirectMessage_ReturnsDownstreamResponse` | Relay returns the downstream response payload |
| Forward server → client event | `ServerPushedEvent_IsForwardedToFrontendVerbatim` | Server pushes `GlobalMessageReceived`; `IFrontendChatSender.SendAsync` is called with the correct connection id and event name |
| Downstream drop | `DownstreamDrop_SendsChatConnectionLostToFrontend` | Server calls `Context.Abort()`; the relay's `Closed` handler fires and `ChatConnectionLost` reaches the frontend |
| Hung downstream | `HungDownstreamCall_TimesOutAndSendsChatConnectionLost` | Server delays > timeout; the relay throws `TimeoutException`, sends `ChatConnectionLost(downstream_timeout)`, cleans up |
| Disconnect | `DisconnectAsync_RemovesConnection_AndIsIdempotent` | After disconnect, subsequent invokes throw `InvalidOperationException`; second disconnect is a no-throw no-op |
| Dispose | `DisposeAsync_DisposesAllTrackedConnections` | All tracked downstreams are torn down |
| Connect failure cleanup | `ConnectAsync_UnreachableHost_ThrowsAndCleansUp` | After a failed connect, no entry is left in the dictionary |

What is *not* proven:
- The exact 15 s production timeout — the timeout-path test runs at 500 ms via the
  internal constructor seam, then a separate constant test pins
  `DefaultInvocationTimeout = 15s`. There's no CI test that takes 15 s.
- W3C trace context propagation through SignalR headers — the relay sets the
  headers but no test asserts the downstream sees them. Same gap as the existing
  `BattleHubRelay` tests; intentionally consistent with the repo precedent.

## 6. Are proxy endpoints and player card endpoint correctly owned and mapped?

Yes.

- The four `/api/v1/chat/*` endpoints proxy 1:1 to the corresponding
  `/api/internal/*` Chat routes. No business logic in the BFF endpoint handler —
  just call client, map, return.
- `GET /api/v1/players/{playerId}/card` calls Players, **not** Chat. Chat does
  not own player profile data; the BFF composes from Players. This is enforced
  structurally because the endpoint takes `IPlayersClient`, not `IChatClient`.
- HTTP shape proven by `ChatEndpointHttpTests` against a real `TestServer` with
  the real route pipeline (auth + minimal-API binding + handler), using stubbed
  downstream clients. Not just shape tests — actual bytes go through the wire.
- 404 propagation is asserted both for chat (Chat returns 404 → BFF returns 404)
  and for player card (Players returns 404 → BFF returns 404).
- Auth enforcement asserted at the HTTP level for two routes
  (`GetConversations_NoAuth_Returns401`, `GetPlayerCard_NoAuth_Returns401`); the
  remaining endpoints share the identical `RequireAuthorization()` invocation and
  pipeline.

## 7. Are there hidden gaps an independent reviewer is likely to catch?

Three honest items I want to call out, none of which I think block the gate:

1. **Singleton relay holding `IFrontendChatSender` (which depends on
   `IHubContext<ChatHub>`).** This is correct — `IHubContext` is documented as
   safe to use outside hub-method scope and the existing Battle relay uses the
   same pattern. But a reviewer used to typical scoped-handler patterns may flag
   it on first read. The repo precedent
   (`BattleHubRelay` + `HubContextBattleSender` + comments in
   `HubContextChatSender.cs`) covers this; the relay does not capture `Hub.Clients`
   anywhere.

2. **`ChatHubRelay` in-process tests use Kestrel on a random loopback port.**
   This will work in CI on Windows/Linux runners with loopback access. If a
   sandboxed CI environment ever blocks loopback binding, the behaviour test file
   would fail. Mitigation: the structural file
   (`ChatHubRelayTests.cs`) covers the relay surface entirely without a server.

3. **`RelayedEventNames` is `internal static readonly string[]`.** Any code that
   assumes immutability is safe in practice (we never mutate it) but technically
   the array could be mutated through reflection. Switching it to
   `ReadOnlySpan<string>` or `IReadOnlyList<string>` would be slightly stricter.
   Not a real correctness risk; matching `BattleHubRelay.BlindEventNames` shape
   (also `string[]`) is more important for repo consistency.

I am not aware of any silent contract drift, missing auth check, missing 404
propagation, leaked Chat type into the BFF response surface, or unrelated
"while I'm here" change.

## 8. Are the execution note and verification claims fully honest?

Yes.

- Test counts in the execution note are the actual numbers from the runs:
  161/161 BFF Application, 83/83 BFF Api, 39/39 Chat Application, 22/22 Chat Api.
- `dotnet build Kombats.sln` actually returns 0 warnings, 0 errors.
- The "Batch 3 frozen contract is unchanged" statement is verifiable: no files
  under `src/Kombats.Chat/` were modified in Batch 5.
- Deviations from plan are listed even when minor.
- Deferred items are explicit and labelled by which downstream batch / phase
  owns them.
- The Chat infrastructure suite was not re-run in Batch 5 because no Chat
  infrastructure files changed; the pre-existing Batch 2 flake noted in the
  Batch 4 review is unchanged and unrelated to BFF work.

## 9. Definition-of-Done check

| Criterion | Status |
|---|---|
| Relay exists and is tested | ✅ structural + behavioural |
| BFF ChatHub exists and is tested | ✅ structural + auth-enforcement HTTP test through hub-on-route checks |
| ChatClient exists and is tested | ✅ |
| BFF chat HTTP endpoints exist and are tested | ✅ via `TestServer` |
| Player card endpoint exists and is tested | ✅ |
| Build succeeds | ✅ |
| Relevant tests pass | ✅ |
| Execution note written | ✅ `docs/execution/kombats-chat-v1-batch5-execution.md` |
| Self-review written | ✅ this document |
| Batch 3 frozen contract stable | ✅ unchanged |

Ready for independent review.

---

## Addendum — Post-Review Fix Pass (2026-04-15)

Independent Batch 5 review flagged two required items and two optional cleanups.
All four are applied; full detail is in
`docs/execution/kombats-chat-v1-batch5-execution.md` §7.

- **False `ChatConnectionLost` on intentional close paths (required):** fixed via
  an `IntentionalClose` flag on the internal `ChatConnection` wrapper, set before
  any local teardown (`DisconnectAsync`, `DisposeAsync`, forced reconnect,
  post-timeout teardown). The `Closed` handler now suppresses the notification
  on those paths. Three new behavioural tests pin the suppression
  (graceful disconnect, forced reconnect, dispose). Real downstream-drop and
  hung-downstream tests still emit `ChatConnectionLost` as required.
- **Explicit auth-rejection tests (required):** added `401` tests for
  `/api/v1/chat/conversations/{id}/messages`,
  `/api/v1/chat/direct/{otherPlayerId}/messages`, and
  `/api/v1/chat/presence/online`, matching the existing
  `/conversations` and `/players/{id}/card` shape.
- **Optional cleanups (applied):** `HubContextChatSender` is now `internal
  sealed` (gated by InternalsVisibleTo to Bootstrap + Api.Tests); a comment was
  added next to the relay's `AccessTokenProvider` describing captured-token and
  JWT-expiry behaviour for future hardening.

Tests after fix pass: BFF Application 164 / 164, BFF Api 86 / 86, Chat
regression suites unchanged. Build clean.

Batch 5 is clean for Batch 6.

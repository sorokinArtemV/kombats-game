# Kombats Chat v1 — Batch 5 Execution Note

**Date:** 2026-04-15
**Branch:** `kombats_full_refactor`
**Scope:** BFF chat surface — client-facing SignalR hub, downstream relay, typed Chat HTTP client, BFF chat HTTP proxy endpoints, player card endpoint.
**Authoritative inputs:** `docs/architecture/kombats-chat-v1-architecture-spec.md`,
`docs/execution/kombats-chat-v1-implementation-plan.md` §"Batch 5",
`docs/execution/kombats-chat-v1-decomposition.md`,
`docs/execution/kombats-chat-v1-batch3-execution.md`,
`docs/execution/reviews/kombats-chat-v1-batch3-review.md`,
`docs/execution/kombats-chat-v1-batch4-execution.md`,
`docs/execution/reviews/kombats-chat-v1-batch4-review.md`.

The Batch 3 frozen contract (`/chathub-internal`, hub method names, server-to-client
event names and payloads, `ChatErrorCodes`, frozen DTO shapes) was **not modified**.
No blocker required a contract change.

---

## 1. Batch 5 Implemented

### 1.1 Application — IChatHubRelay + ChatHubRelay
Files:
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/IChatHubRelay.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/IFrontendChatSender.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/ChatHubRelay.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/ChatConnection.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/AssemblyInfo.cs` (new — `InternalsVisibleTo` for tests)

Shape (mirrors the existing `BattleHubRelay` pattern):
- `ConcurrentDictionary<string, ChatConnection>` keyed by frontend connection id.
- `ChatConnection` is an internal record wrapping `HubConnection` + frontend connection id.
- `ConnectAsync(frontendConnectionId, accessToken, ct)` builds a downstream
  `HubConnection` against `Services:Chat:BaseUrl + /chathub-internal`, forwarding the
  JWT via `AccessTokenProvider`. W3C trace context (`traceparent`/`tracestate`) is
  propagated explicitly. Disposing of any previously-tracked downstream for the same
  frontend connection id happens before opening the new one (forced reconnect safety).
- The five frozen Batch 3 server-to-client events (`GlobalMessageReceived`,
  `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`) are
  registered as **blind** `On<object>` handlers and forwarded verbatim to the
  frontend via `IFrontendChatSender` — no remapping, no buffering.
- Hub invocation methods (`JoinGlobalChatAsync`, `LeaveGlobalChatAsync`,
  `SendGlobalMessageAsync`, `SendDirectMessageAsync`) all flow through a single
  `InvokeWithTimeoutAsync` helper that creates a per-call timeout
  `CancellationTokenSource` linked to the caller's token (EQ-5 option (b)).
- Default invocation timeout is **15 seconds** (`DefaultInvocationTimeout`). An
  internal constructor accepts a custom `TimeSpan` for tests so we can exercise the
  timeout path quickly.
- On invocation timeout: log warning, send `ChatConnectionLost` with
  `reason: "downstream_timeout"` to the frontend, tear down the downstream
  connection, remove from dictionary, then throw `TimeoutException` to the caller.
- On `connection.Closed` (downstream drop): send `ChatConnectionLost` with
  `reason: "connection_lost"` to the frontend and remove from dictionary so
  subsequent invocations fail fast instead of using a dead connection.
- `IAsyncDisposable` for graceful shutdown — disposes every tracked downstream.
- All cleanup paths (`DisconnectAsync`, drop, timeout, exception during connect)
  go through the single `DisposeConnectionSafely` helper that swallows dispose-time
  exceptions.

### 1.2 Application — IChatClient + ChatClient (typed HTTP)
Files:
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/IChatClient.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/ChatClient.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Models/Internal/InternalChatModels.cs`
  (duplicated DTOs mirroring Chat's internal HTTP responses: conversations, messages,
  online players, profile — per the approved no-shared-DTO-package decision)
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/IPlayersClient.cs` — extended with
  `GetProfileAsync(Guid playerId, CancellationToken)`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/PlayersClient.cs` — added
  `GetProfileAsync` implementation (uses the existing `HttpClientHelper.SendAsync<T>`
  pattern; null on 404, throws `ServiceUnavailableException` on transport failure,
  throws `BffServiceException` on 5xx — repo-consistent with `IBattleClient`).

Methods:
- `GetConversationsAsync()` → `GET /api/internal/conversations`
- `GetMessagesAsync(conversationId, before?, limit)` → `GET /api/internal/conversations/{id}/messages?before&limit`
- `GetDirectMessagesAsync(otherIdentityId, before?, limit)` → `GET /api/internal/direct/{otherIdentityId}/messages?before&limit`
- `GetOnlinePlayersAsync(limit, offset)` → `GET /api/internal/presence/online?limit&offset`

JWT forwarding via the existing `JwtForwardingHandler` (Bootstrap wiring §1.6).

### 1.3 Application — ServicesOptions
File: `src/Kombats.Bff/Kombats.Bff.Application/Clients/ServiceOptions.cs`
- Added optional `Chat` property to `ServicesOptions`. Optional (rather than `required`)
  so existing tests/configs that don't supply it still construct cleanly. Bootstrap
  asserts presence at startup time via `Configuration["Services:Chat:BaseUrl"]
  ?? throw`.

### 1.4 Api — Hubs/ChatHub.cs + HubContextChatSender.cs
Files:
- `src/Kombats.Bff/Kombats.Bff.Api/Hubs/ChatHub.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Hubs/HubContextChatSender.cs`

`ChatHub`:
- `[Authorize]`, `sealed`. Mounted at `/chathub` by Bootstrap.
- `OnConnectedAsync`: extracts the access token (Bearer header for HTTP, query-string
  `access_token` for WebSocket — same pattern as `BattleHub`), then opens the
  downstream relay. On failure, aborts the frontend connection so the client gets a
  deterministic close instead of hanging.
- `OnDisconnectedAsync`: disposes the downstream relay connection.
- `JoinGlobalChat`/`LeaveGlobalChat`/`SendGlobalMessage`/`SendDirectMessage` are
  one-line forwards to `IChatHubRelay`. No invented protocol fields.

`HubContextChatSender`:
- Implements `IFrontendChatSender` via `IHubContext<ChatHub>`. Identical pattern to
  `HubContextBattleSender`. `IHubContext` is stable outside hub-method scope, so the
  relay's long-lived event handlers can target the frontend by connection id.

### 1.5 Api — BFF chat HTTP endpoints + player card endpoint
Files:
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Chat/GetConversationsEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Chat/GetConversationMessagesEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Chat/GetDirectMessagesEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/Chat/GetOnlinePlayersEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/PlayerCard/GetPlayerCardEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Models/Responses/ChatResponses.cs` (response DTOs
  mirroring architecture spec §11)
- `src/Kombats.Bff/Kombats.Bff.Api/Mapping/ChatMapper.cs`

Routes (all `[Authorize]`):
- `GET /api/v1/chat/conversations` → `IChatClient.GetConversationsAsync` →
  `ConversationListResponse`
- `GET /api/v1/chat/conversations/{conversationId:guid}/messages?before&limit=50` →
  `IChatClient.GetMessagesAsync` → `MessageListResponse` (404 when Chat returns 404)
- `GET /api/v1/chat/direct/{otherPlayerId:guid}/messages?before&limit=50` →
  `IChatClient.GetDirectMessagesAsync` → `MessageListResponse`
- `GET /api/v1/chat/presence/online?limit=100&offset=0` →
  `IChatClient.GetOnlinePlayersAsync` → `OnlinePlayersResponse`
- `GET /api/v1/players/{playerId:guid}/card` → `IPlayersClient.GetProfileAsync` →
  `PlayerCardResponse` (404 when Players returns 404). No caching, per spec §10.

Mapping is straight 1:1 (Chat internal HTTP types → BFF response types). The player
card mapper falls back to `"Unknown"` when Players omits a display name; this matches
the resolver fallback semantics that the rest of the system already uses.

### 1.6 Bootstrap wiring
File: `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs`

Additions (Batch 5 markers in code):
- JWT bearer event `OnMessageReceived` accepts `?access_token=` for both
  `/battlehub` (existing) **and** `/chathub` (added).
- `AddHttpClient<IChatClient, ChatClient>` with the same resilience pipeline as the
  Players/Battle clients (timeout, GET-only retry, circuit breaker). Reads
  `Services:Chat:BaseUrl` and adds `JwtForwardingHandler` so the user's JWT flows to
  Chat's internal HTTP.
- Singleton `IFrontendChatSender → HubContextChatSender`.
- Singleton `IChatHubRelay → ChatHubRelay`.
- `app.MapHub<ChatHub>("/chathub")`.

`appsettings.json`: added `Services.Chat.BaseUrl = http://localhost:5004`. No new
NuGet packages were added at the production level; in tests
`Microsoft.AspNetCore.Mvc.Testing` (already pinned in `Directory.Packages.props`) was
referenced from `Kombats.Bff.Api.Tests.csproj` to enable the new in-process HTTP
endpoint tests.

---

## 2. Batch 5 Tests

### 2.1 Application Tests
Files:
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/Relay/ChatHubRelayTests.cs`
  (12 structural + behaviour-without-server tests)
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/Relay/ChatHubRelayBehaviorTests.cs`
  (9 tests against a real in-process Kestrel-hosted SignalR test hub)
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/Clients/ChatClientTests.cs`
  (8 tests, modelled after `PlayersClientTests`)
- `tests/Kombats.Bff/Kombats.Bff.Application.Tests/Clients/PlayersClientProfileTests.cs`
  (2 tests for `GetProfileAsync` — happy path + 404)

`ChatHubRelayTests` (no live server) covers:
- `IChatHubRelay`/`IAsyncDisposable` implementation
- Frozen relayed event names (`GlobalMessageReceived`, `DirectMessageReceived`,
  `PlayerOnline`, `PlayerOffline`, `ChatError`) — this test guards against silent
  drift of the Batch 3 contract on the BFF side
- `DefaultInvocationTimeout = 15s` and `ChatConnectionLost` event-name constants
- Idempotent `DisconnectAsync` and `DisposeAsync` no-throw on empty state
- All four invoke methods throw `InvalidOperationException` when called before
  `ConnectAsync`
- `ConnectAsync` against an unreachable host throws *and* cleans up the dictionary
- IChatHubRelay surface contains the four frozen Batch 3 hub-method analogues

`ChatHubRelayBehaviorTests` exercises the relay end-to-end against a real
in-process SignalR test hub on a random loopback port:
- ConnectAsync opens a downstream connection
- `SendGlobalMessage` actually invokes the downstream hub method (server-side state
  is observed)
- `JoinGlobalChat` returns the downstream response
- `SendDirectMessage` returns the downstream response
- A server-pushed `GlobalMessageReceived` is forwarded verbatim to
  `IFrontendChatSender` with the correct connection id and event name (the wire-path
  proof for the blind relay)
- Server-side `Context.Abort()` triggers the relay's `Closed` handler which then
  sends `ChatConnectionLost` to the frontend and removes the connection from the
  dictionary (downstream drop case)
- A hung downstream call (10 s artificial delay) hits the relay's per-call
  `CancellationTokenSource` (test uses a 500 ms invocation timeout), throws
  `TimeoutException` to the caller, sends `ChatConnectionLost(downstream_timeout)`
  to the frontend, and cleans up the dictionary so subsequent invokes fail fast
- `DisconnectAsync` removes the connection and is idempotent
- `DisposeAsync` disposes every tracked downstream

`ChatClientTests`:
- All four methods hit the documented URL paths
- `before`/`limit` query parameters round-trip correctly (with and without `before`)
- 404 → `null`
- Network failure → `ServiceUnavailableException(serviceName: "Chat")`
- 5xx → `BffServiceException(InternalServerError)`

`PlayersClientProfileTests`:
- `GET /api/v1/players/{id}/profile` is hit
- 404 → `null`

### 2.2 Api Tests
Files:
- `tests/Kombats.Bff/Kombats.Bff.Api.Tests/ChatHubTests.cs` (7 structural tests)
- `tests/Kombats.Bff/Kombats.Bff.Api.Tests/HubContextChatSenderTests.cs` (3)
- `tests/Kombats.Bff/Kombats.Bff.Api.Tests/ChatEndpointStructureTests.cs` (5,
  Theory)
- `tests/Kombats.Bff/Kombats.Bff.Api.Tests/ChatEndpointHttpTests.cs` (10 in-process
  HTTP tests using `TestServer`)

`ChatHubTests` proves the BFF hub:
- carries `[Authorize]` and is `sealed`
- exposes `JoinGlobalChat()`, `LeaveGlobalChat()`, `SendGlobalMessage(string)`,
  `SendDirectMessage(Guid recipientPlayerId, string content)` with the exact
  signatures the frozen Batch 3 surface expects
- overrides both `OnConnectedAsync` and `OnDisconnectedAsync` (so the downstream
  relay is opened/disposed correctly)

`HubContextChatSenderTests` proves the `IFrontendChatSender` adapter is sealed,
implements the port, and is constructed from `IHubContext<ChatHub>`.

`ChatEndpointStructureTests` enumerates all five new endpoint types with a Theory
and asserts they are sealed and implement `IEndpoint` (so the assembly scan in
Bootstrap picks them up).

`ChatEndpointHttpTests` uses an in-process `TestServer` with a tiny
`AuthenticationHandler` (header-based) and stubbed `IChatClient`/`IPlayersClient`
to exercise the real route pipeline (auth + minimal-API model binding +
endpoint handler):
- `GET /api/v1/chat/conversations` without auth → `401`
- `GET /api/v1/chat/conversations` with auth → `200`, downstream response is mapped
  to `ConversationListResponse` (id and type round-trip)
- `GET /api/v1/chat/conversations/{id}/messages` proxies, `HasMore` and sender
  display name flow through; 404 from Chat propagates to `404`
- `GET /api/v1/chat/direct/{other}/messages` proxies
- `GET /api/v1/chat/presence/online` proxies, totals round-trip
- `GET /api/v1/players/{id}/card` without auth → `401`
- Player card with profile → `200` and field-by-field correct mapping
- Player card with `null` from Players → `404`
- Player card with `DisplayName: null` from Players → `200` with
  `displayName: "Unknown"` (the documented Unknown-fallback path)

### 2.3 Test runs

Build (full solution):
```
dotnet build Kombats.sln
→ Build succeeded. 0 Warning(s). 0 Error(s).
```

Test runs (no Docker required for any Batch 5 test):
```
dotnet test tests/Kombats.Bff/Kombats.Bff.Application.Tests
→ Passed!  Failed: 0, Passed: 161, Skipped: 0, Total: 161

dotnet test tests/Kombats.Bff/Kombats.Bff.Api.Tests
→ Passed!  Failed: 0, Passed:  83, Skipped: 0, Total:  83

dotnet test tests/Kombats.Chat/Kombats.Chat.Application.Tests
→ Passed!  Failed: 0, Passed:  39, Skipped: 0, Total:  39

dotnet test tests/Kombats.Chat/Kombats.Chat.Api.Tests
→ Passed!  Failed: 0, Passed:  22, Skipped: 0, Total:  22
```

Batch 3 / Batch 4 Chat suites are unchanged. The Chat infrastructure suite still
has the pre-existing Batch 2 `RedisRateLimiterTests.Fallback_…` flake noted in the
Batch 4 review — not introduced by Batch 5 and not in scope to fix.

---

## 3. Verification Checkpoint

| Check | Status |
|---|---|
| `dotnet build Kombats.sln` | ✅ clean, 0 warnings, 0 errors |
| BFF Application Tests | ✅ 161 / 161 (32 new) |
| BFF Api Tests | ✅ 83 / 83 (25 new) |
| Chat Application Tests (regression) | ✅ 39 / 39 |
| Chat Api Tests (regression) | ✅ 22 / 22 |
| Batch 3 frozen contract (`/chathub-internal`, hub method names, event names,
  payload shapes, `ChatErrorCodes`) | ✅ unchanged |
| BFF `/chathub` exists and is `[Authorize]` | ✅ |
| BFF chat HTTP proxy endpoints (4) exist and are `[Authorize]` | ✅ |
| Player card endpoint exists and is `[Authorize]` | ✅ |
| Relay forwards client commands and downstream events | ✅ proven in-process |
| Downstream drop → `ChatConnectionLost` to frontend | ✅ proven in-process |
| Downstream timeout → `ChatConnectionLost(downstream_timeout)` + cleanup | ✅ proven in-process |

---

## 4. Deviations from Plan

- **Per-call invocation timeout is configurable for tests.** The plan specifies a
  fixed 15 s timeout. The relay exposes `DefaultInvocationTimeout = 15s` as the
  public production default (the public DI constructor uses it unconditionally) and
  an `internal` constructor takes a `TimeSpan` override so the timeout-path test
  runs in 500 ms instead of 15 s. The production default is unchanged. This
  required adding `[InternalsVisibleTo("Kombats.Bff.Application.Tests")]` to the
  Application assembly.
- **Player card mapper falls back to `"Unknown"` when Players returns a null
  display name.** The architecture spec describes `displayName: string` as
  non-nullable on `PlayerCardResponse`. A null name from Players is theoretically
  reachable (e.g., a raw character that has not picked a name yet); rather than
  return `null` and break the response shape, the BFF substitutes `"Unknown"`,
  matching the existing display-name resolver fallback used elsewhere in the
  system. Covered by an explicit test
  (`GetPlayerCard_NullDisplayName_FallsBackToUnknown`).
- **`ServicesOptions.Chat` is `Optional`, not `required`.** Adding `required`
  would break the existing `BattleHubRelayTests` and `AuthRequirementTests`
  fixtures which construct `ServicesOptions` literally without a `Chat` member.
  Bootstrap still asserts presence at startup
  (`builder.Configuration["Services:Chat:BaseUrl"] ?? throw`).
- **`ChatHub` returns `Task<object?>` rather than a typed Chat response.** The
  BFF deliberately does not reference Chat application types — the relay returns
  the deserialized JSON payload as `object?` and SignalR re-serialises it on the
  way out. This mirrors `BattleHub.JoinBattle`'s `Task<object>` shape.
- **The downstream `Closed` handler removes the connection from the tracking
  dictionary** so a subsequent frontend invocation fails fast with
  `InvalidOperationException` instead of hitting a dead `HubConnection` in
  `Disconnected` state. The plan describes notifying the frontend; cleanup is the
  obvious follow-on and is covered by the `DownstreamDrop_…` and
  `HungDownstreamCall_…` tests.

---

## 5. Blockers

None.

---

## 6. Intentionally Deferred (out of Batch 5 scope)

- **End-to-end cross-service validation (Batch 6).** All Batch 5 tests prove the
  BFF surface against either stubbed downstreams (HTTP) or an in-process test hub
  (SignalR). Wiring the real Chat service end-to-end through Docker Compose is
  Batch 6 work.
- **Production-side hardening of the chat resilience pipeline.** The new
  `IChatClient` reuses the same retry/circuit-breaker shape as Players/Battle/
  Matchmaking. Tuning the breaker thresholds for chat-specific traffic patterns is
  a Phase 7 task, not Batch 5.
- **Per-frontend leak metrics.** The relay logs the dictionary size on each
  `ConnectAsync` and warns on relay-side failures, but no metric is emitted yet.
  Adding `Meter`-based instrumentation belongs in Phase 7A observability work.
- **Multi-tab connection coalescing on the BFF side.** Each frontend connection
  opens its own downstream connection — that matches Battle's pattern and the
  Chat side's per-identity DM group already handles multi-tab correctly. No
  change needed for Batch 5 or for the contract; revisit only if Phase 7B
  benchmarks show it matters.
- **Pre-existing Batch 2 `RedisRateLimiter` flake.** Not a Batch 5 concern;
  tracked separately per the Batch 4 review.

---

## 7. Post-Review Fix Pass (2026-04-15)

Applied in response to the Batch 5 independent review
(`docs/execution/reviews/kombats-chat-v1-batch5-review.md`). Scope is strictly
the items the review flagged as required.

### 7.1 Suppress false `ChatConnectionLost` on intentional close paths

**Problem:** `ChatHubRelay`'s `HubConnection.Closed` handler emitted
`ChatConnectionLost(connection_lost)` unconditionally — including on local
shutdown paths (`DisconnectAsync`, `DisposeAsync`, forced reconnect, post-timeout
teardown). The frontend would receive a false "connection lost" event during a
graceful disconnect, after a deliberate replace-existing-connection, or after the
relay had already surfaced the real `downstream_timeout` reason.

**Fix:** smallest clean change — added an `IntentionalClose` flag on the internal
`ChatConnection` wrapper. The flag is flipped to `true` *before* any local
`DisposeConnectionSafely` call (`DisconnectAsync` is the single funnel for all
local teardown — forced reconnect calls it, `DisposeAsync` calls it, the timeout
handler calls it). The `Closed` handler reads the flag and skips both the
`ChatConnectionLost` send and the dictionary cleanup when the close is
intentional.

Files changed:
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/ChatConnection.cs` — switched
  from `record` to `class` with mutable `IntentionalClose` property.
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/ChatHubRelay.cs` — `Closed`
  handler now checks `chatConnection.IntentionalClose`; `DisconnectAsync` sets
  the flag before `DisposeConnectionSafely`. The handler subscription is now
  registered *after* the dictionary entry exists (was a small ordering tidy).
- Added a JWT-expiry comment near the `AccessTokenProvider` for future hardening
  (review's recommended-cleanup item).

### 7.2 Explicit auth-rejection tests for the three remaining chat HTTP routes

Added to `tests/Kombats.Bff/Kombats.Bff.Api.Tests/ChatEndpointHttpTests.cs`:
- `GetConversationMessages_NoAuth_Returns401`
- `GetDirectMessages_NoAuth_Returns401`
- `GetOnlinePlayers_NoAuth_Returns401`

Each issues an unauthenticated `GET` against the route through the real
`TestServer` pipeline and asserts `401 Unauthorized`. Repo-consistent with the
existing `GetConversations_NoAuth_Returns401` and `GetPlayerCard_NoAuth_Returns401`
shape — no shared `RequireAuthorization()` inference.

### 7.3 New behavioural tests for intentional-close suppression

Added to `tests/Kombats.Bff/Kombats.Bff.Application.Tests/Relay/ChatHubRelayBehaviorTests.cs`:
- `GracefulDisconnect_DoesNotEmitChatConnectionLost` — connect, then
  `DisconnectAsync`; assert the frontend does **not** receive
  `ChatConnectionLost`.
- `ForcedReconnect_DoesNotEmitChatConnectionLost` — connect twice for the same
  frontend id (the second `ConnectAsync` tears down the first downstream); assert
  no false `ChatConnectionLost` was sent during the replace.
- `DisposeAsync_DoesNotEmitChatConnectionLost` — connect, then `DisposeAsync`;
  assert no `ChatConnectionLost`.

The pre-existing real downstream-loss
(`DownstreamDrop_SendsChatConnectionLostToFrontend`) and timeout
(`HungDownstreamCall_TimesOutAndSendsChatConnectionLost`) tests still pass —
those paths legitimately emit the event because `IntentionalClose` is `false`
for the drop case, and the timeout path emits its own `downstream_timeout`
reason explicitly *before* calling `DisconnectAsync` (which then suppresses the
duplicate connection_lost notification — the desired behaviour).

### 7.4 Optional cleanup applied

- `HubContextChatSender` is now `internal sealed` (was `public sealed`). Required
  adding `[InternalsVisibleTo("Kombats.Bff.Bootstrap")]` and
  `[InternalsVisibleTo("Kombats.Bff.Api.Tests")]` to `Kombats.Bff.Api` via a new
  `AssemblyInfo.cs`, mirroring the Application-side pattern. Existing
  `HubContextChatSenderTests` continue to pass via the Api InternalsVisibleTo.
- Comment added beside the relay's `AccessTokenProvider` documenting captured-
  token / JWT-expiry behaviour for future hardening.

### 7.5 Verification

| Suite | Result |
|---|---|
| `dotnet build Kombats.sln` | ✅ 0 warnings, 0 errors |
| `Kombats.Bff.Application.Tests` | ✅ 164 / 164 (was 161 / 161; 3 new intentional-close tests) |
| `Kombats.Bff.Api.Tests` | ✅ 86 / 86 (was 83 / 83; 3 new auth-rejection tests) |
| `Kombats.Chat.Application.Tests` (regression) | ✅ 39 / 39 |
| `Kombats.Chat.Api.Tests` (regression) | ✅ 22 / 22 |

### 7.6 Scope verification

- Only relay + sender + endpoint-test files changed.
- No Batch 3 contract change. No Chat service code modified.
- No new NuGet packages.
- Frozen Batch 3 method names, event names, payload shapes, error codes are
  unchanged.

### 7.7 Readiness

Batch 5 is now clean for Batch 6 end-to-end validation. Both items the
independent review flagged as required are resolved with focused, minimal
changes; both optional cleanups from the review are also applied.

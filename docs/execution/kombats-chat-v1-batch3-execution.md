# Kombats Chat v1 — Batch 3 Execution Note

**Date:** 2026-04-15
**Branch:** `kombats_full_refactor`
**Scope:** Internal SignalR hub + chat send/join/connect/disconnect use cases.
**Authoritative inputs:** `docs/architecture/kombats-chat-v1-architecture-spec.md`,
`docs/execution/kombats-chat-v1-implementation-plan.md`,
`docs/execution/kombats-chat-v1-decomposition.md`,
`docs/execution/kombats-chat-v1-batch1-batch2-execution.md`.

---

## 1. Contract Freeze

The frozen Batch 3 internal hub surface that Batch 5 (BFF) will consume:

### Hub path
- `/chathub-internal` — `[Authorize]`, JWT (Keycloak) — internal only.

### Client → Server hub methods
| Method | Signature | Returns |
|---|---|---|
| `JoinGlobalChat` | `()` | `JoinGlobalChatResponse?` (null on `ChatError`) |
| `LeaveGlobalChat` | `()` | `void` |
| `SendGlobalMessage` | `(string content)` | `void`; failures → `ChatError` event |
| `SendDirectMessage` | `(Guid recipientPlayerId, string content)` | `SendDirectMessageResponse?` (null on `ChatError`) |

### Server → Client SignalR events (`ChatHubEvents`)
| Event | Payload type | Scope |
|---|---|---|
| `GlobalMessageReceived` | `GlobalMessageEvent { MessageId, Sender { PlayerId, DisplayName }, Content, SentAt }` | `Group("global")` |
| `DirectMessageReceived` | `DirectMessageEvent { MessageId, ConversationId, Sender, Content, SentAt }` | `Group("identity:{recipientId}")` |
| `PlayerOnline` | `PlayerOnlineEvent { PlayerId, DisplayName }` | `Group("global")` |
| `PlayerOffline` | `PlayerOfflineEvent { PlayerId }` | `Group("global")` |
| `ChatError` | `ChatErrorEvent { Code, Message, RetryAfterMs? }` | `Clients.Caller` |

### Frozen response DTOs (Application, public records)
- `Kombats.Chat.Application.UseCases.JoinGlobalChat.JoinGlobalChatResponse`
  `(Guid ConversationId, IReadOnlyList<MessageDto> RecentMessages, IReadOnlyList<OnlinePlayerDto> OnlinePlayers, long TotalOnline)`
- `Kombats.Chat.Application.UseCases.SendDirectMessage.SendDirectMessageResponse`
  `(Guid ConversationId, Guid MessageId, DateTimeOffset SentAt)`
- Reuses Batch 1 `MessageDto`, `SenderDto` (from `GetConversationMessages`) and `OnlinePlayerDto` (from `GetOnlinePlayers`) — per the duplicated-DTO/no-shared-DTO-package decision.

### Frozen ChatError codes (`Kombats.Chat.Application.ChatErrorCodes`)
`rate_limited`, `message_too_long`, `message_empty`, `recipient_not_found`, `not_eligible`, `service_unavailable`.

`RetryAfterMs` is set only on `rate_limited`. All other codes carry `null`.

### Group naming (`ChatGroups`)
- `"global"` — global chat broadcast group.
- `"identity:{guid:D}"` — per-identity DM delivery group; every connection (multi-tab) joins on connect.

These names, types, and codes are **frozen** for Batch 5 consumption. Any change is a breaking contract change.

---

## 2. Batch 3 Implemented

### New Application ports
- `IMessageFilter` (sync `Filter(string) -> MessageFilterResult(valid, sanitized, errorCode)`)
- `IUserRestriction` (`CanSendAsync(Guid, CT) -> bool`; v1 always true)
- `IChatNotifier` — application-side abstraction over the realtime transport (SignalR in v1).

### New Infrastructure implementations
- `MessageFilter` — wraps `Message.Sanitize` + 1–500 char envelope; emits `message_empty` / `message_too_long`.
- `UserRestriction` — v1 no-op, always allows.

### New Application use cases
| Handler | Command | Response |
|---|---|---|
| `ConnectUserHandler` | `ConnectUserCommand(IdentityId)` | `Result` |
| `DisconnectUserHandler` | `DisconnectUserCommand(IdentityId)` | `Result` |
| `JoinGlobalChatHandler` | `JoinGlobalChatCommand(CallerIdentityId)` | `Result<JoinGlobalChatResponse>` |
| `SendGlobalMessageHandler` | `SendGlobalMessageCommand(SenderIdentityId, Content)` | `Result` |
| `SendDirectMessageHandler` | `SendDirectMessageCommand(SenderIdentityId, RecipientIdentityId, Content)` | `Result<SendDirectMessageResponse>` |

`LeaveGlobalChat` is **intentionally hub-only**: it is a pure SignalR group operation (`Groups.RemoveFromGroupAsync(connectionId, "global")`) with no domain state to mutate. Adding an application command/handler would be wallpaper. The decision is covered by `InternalChatHubTests.LeaveGlobalChat_SilenceFollowingGlobalBroadcasts` which proves the behavioural contract: after a connection invokes `LeaveGlobalChat`, subsequent `GlobalMessageReceived` broadcasts to the `"global"` group no longer reach that connection.

Pipelines match the plan exactly:
- **ConnectUser:** resolve display name → `IPresenceStore.ConnectAsync` → on first conn broadcast `PlayerOnline`. Does **not** join any SignalR group; presence is connection-based.
- **DisconnectUser:** `IPresenceStore.DisconnectAsync` → on last conn broadcast `PlayerOffline`. Heartbeat timer is cancelled in the hub before the handler runs.
- **JoinGlobalChat:** authoritative `IEligibilityChecker.CheckEligibilityAsync` (rejects on `not_eligible`) → query recent messages (newest-first, capped 50) → query online players (capped 100) + total. Hub adds connection to `"global"` group on success. Presence is **not** mutated.
- **SendGlobalMessage:** eligibility → restriction → rate-limit (`global`, 5/10s) → `IMessageFilter` → display-name resolution → `Message.Create` → `IMessageRepository.SaveAsync` → `IConversationRepository.UpdateLastMessageAtAsync` → `IChatNotifier.BroadcastGlobalMessageAsync`.
- **SendDirectMessage:** self-DM rejected as `recipient_not_found` → sender eligibility → restriction → recipient eligibility (rejected as `recipient_not_found`) → rate-limit (`dm`, 10/30s) → filter → display-name → `IConversationRepository.GetOrCreateDirectAsync` → `Message.Create` → save → `UpdateLastMessageAtAsync` → `IChatNotifier.SendDirectMessageAsync` to the recipient's per-identity group → `SendDirectMessageResponse`.

### Failure carrier
`ChatError : Error` (internal, sealed record) inherits from `Kombats.Abstractions.Error` and adds a nullable `RetryAfterMs`. Handlers fail with `Result.Failure(ChatError.X())`. The hub maps `ChatError → ChatErrorEvent` for `Clients.Caller`.

### Internal SignalR hub (Api project)
- `Kombats.Chat.Api.Hubs.InternalChatHub` (`[Authorize]`).
- Identity extraction via the existing `ClaimsPrincipal.GetIdentityId()` (Keycloak `sub` / `NameIdentifier`). On missing identity the connection is aborted on connect, or a `ChatError(not_eligible)` is emitted on subsequent calls.
- `OnConnectedAsync`: joins per-identity DM group, calls `ConnectUserHandler`, starts heartbeat timer.
- `OnDisconnectedAsync`: stops heartbeat timer, removes from `"global"` and per-identity groups, calls `DisconnectUserHandler`.
- Hub methods are thin wrappers over the handlers; failures map to `ChatError`.
- `SignalRChatNotifier` adapts `IHubContext<InternalChatHub>` to `IChatNotifier`.

### Heartbeat (`HeartbeatScheduler`)
- Per-connection 30-second timer (`ITimer` from injected `TimeProvider`) keyed by `Context.ConnectionId`.
- Each tick opens an async DI scope, resolves `IPresenceStore`, calls `HeartbeatAsync`. Exceptions are caught and logged (warning) — the timer never crashes the process and never corrupts connection state.
- Stopped + disposed on disconnect.

### Bootstrap wiring (Batch 3 only)
- Registers `TimeProvider.System`, `IMessageFilter`, `IUserRestriction`, the five new command handlers, `AddSignalR()`, `IChatNotifier` (singleton), `HeartbeatScheduler` (singleton).
- Maps `InternalChatHub` at `/chathub-internal`.
- No MassTransit, no consumers, no hosted workers, no BFF wiring.

### Repo-consistent adjustments
1. **Added `src/Kombats.Chat/Kombats.Chat.Api/AssemblyInfo.cs`** with `InternalsVisibleTo("Kombats.Chat.Bootstrap")` and `InternalsVisibleTo("Kombats.Chat.Api.Tests")`. Required because new hub/notifier/heartbeat types in the Api project are `internal` and Bootstrap composes them. Mirrors the Application/Infrastructure InternalsVisibleTo pattern already in the repo.
2. **Added `Microsoft.AspNetCore.SignalR.Client`** package reference to `Kombats.Chat.Api.Tests.csproj` (version pinned in `Directory.Packages.props`). Required for hub integration tests to drive the hub through `HubConnection`.

No other code outside the chat module was touched.

---

## 3. Batch 3 Tests

### Application unit tests (`Kombats.Chat.Application.Tests`)
New files:
- `ConnectUserHandlerTests` — first connection broadcasts `PlayerOnline`; non-first does not.
- `DisconnectUserHandlerTests` — last disconnect broadcasts `PlayerOffline`; non-last does not.
- `JoinGlobalChatHandlerTests` — eligible path returns response; **named-but-not-ready negative case is rejected with `not_eligible` and no downstream queries are made.**
- `SendGlobalMessageHandlerTests` — happy path persists + updates `LastMessageAt` + broadcasts; not-eligible rejected; rate-limit returns `RetryAfterMs`; invalid content (theory: empty + too-long) rejected.
- `SendDirectMessageHandlerTests` — happy path persists + delivers to recipient group; recipient-not-eligible → `recipient_not_found`; sender-not-eligible → `not_eligible`; **named-but-not-ready sender → `not_eligible`**; self-DM → `recipient_not_found`; rate-limit returns `RetryAfterMs`; invalid content → `message_empty`.

Result: **34 / 34 application tests pass** (16 prior + 18 new).

### Hub integration tests (`Kombats.Chat.Api.Tests`)
New `ChatHubFactory` that keeps the real Batch 3 handlers, hub, notifier, message filter, and user restriction; replaces only the Batch 1/2 infrastructure ports with NSubstitute substitutes the test controls.

New `InternalChatHubTests` — drives the hub end-to-end through `HubConnection` against `WebApplicationFactory.Server` (long-polling transport):
- **Auth enforcement:** unauthenticated start fails (`HttpRequestException`).
- **Authenticated connect:** succeeds and calls `IPresenceStore.ConnectAsync` with the resolved display name.
- **`JoinGlobalChat` eligible:** returns the frozen `JoinGlobalChatResponse` shape with the global conversation id.
- **`JoinGlobalChat` named-but-not-ready:** **null result + `ChatError(not_eligible)` is emitted to the caller.** (Critical Batch 3 negative case at the hub layer.)
- **`SendGlobalMessage` happy path:** the global `GlobalMessageReceived` event is broadcast to the connected client (which had joined the `"global"` group via `JoinGlobalChat`).
- **`SendGlobalMessage` rate-limited:** `ChatError(rate_limited)` with `retryAfterMs = 4321` is emitted.
- **`SendGlobalMessage` invalid content:** whitespace-only content yields `ChatError(message_empty)`.
- **`SendDirectMessage` happy path (single client):** returns `SendDirectMessageResponse` with the resolved conversation id; the message is persisted via `IMessageRepository.SaveAsync`.
- **`SendDirectMessage` second-client delivery (hardening pass):** **two real authenticated `HubConnection`s.** Recipient connects first (auto-joins per-identity DM group). Sender then connects and invokes `SendDirectMessage`. Recipient connection actually receives `DirectMessageReceived` end-to-end through SignalR with the correct `ConversationId`, content, and sender id. This proves the per-identity group routing wire path.
- **`LeaveGlobalChat` (hardening pass):** A joins → leaves → B joins and sends → A must NOT receive `GlobalMessageReceived`. Asserts the leave is effective.
- **Disconnect:** on `StopAsync`, the hub calls `IPresenceStore.DisconnectAsync`. (Last-connection broadcast is exercised in the application unit tests where Substitute invocation is observable cleanly; here we assert the disconnect call site.)

Result: **22 / 22 API tests pass** (8 prior endpoint + 9 hub from initial Batch 3 + 5 added in this hardening pass: 2 hub integration tests + 3 heartbeat scheduler tests).

### Heartbeat coverage (improved in hardening pass)
The `HeartbeatScheduler` ticks every 30 seconds. We do not drive the real-time 30 s timer in CI (would slow the suite by 30 s). Instead, `HeartbeatScheduler.TickAsync` is exposed as an `internal` testing seam and directly covered by `HeartbeatSchedulerTests`:

- **`Tick_CallsHeartbeatAsyncOnPresenceStore`** — proves a single tick resolves `IPresenceStore` from a fresh DI scope and calls `HeartbeatAsync(identityId)`.
- **`Tick_SwallowsExceptions`** — drives a throwing `IPresenceStore` and asserts the tick does not propagate; this is the defensive guarantee that the timer never crashes the process or corrupts connection state.
- **`StartStop_DoesNotThrow_AndIsIdempotent`** — `Start` then `Stop`, then `Stop` of an unknown connection id is a safe no-op; `Dispose` is clean.

Remaining limitation (honest): the actual `ITimer.CreateTimer` cadence (30 s scheduling) is not asserted in CI. Replacing the production `TimeProvider` with a fake-time provider that pumps virtual ticks would be the proper test seam and is recorded as a Batch 7 reliability follow-up. The internal seam covers the work that *happens* on each tick; what is not covered is *that* the .NET timer fires at the chosen cadence — which is a runtime guarantee of `TimeProvider.System`, not project code.

### Domain + Infrastructure
- Domain tests unchanged: **23 / 23 pass**.
- Infrastructure project builds clean. The 49 Docker-required infrastructure tests are unchanged from Batch 1/2 and were not re-run in this batch (Docker not available in the local sandbox); they passed at end of Batch 1/2.

---

## 4. Verification Checkpoint

| Check | Status |
|---|---|
| `dotnet build` of all chat projects | ✅ clean |
| Domain tests | ✅ 23/23 |
| Application tests | ✅ 34/34 |
| API tests (incl. hub integration + heartbeat) | ✅ 22/22 |
| Infrastructure tests | not re-run (Docker unavailable in sandbox); built clean; unchanged from B1/B2 |
| Internal contract frozen for B5 | ✅ (see §1) |
| Authoritative eligibility enforcement | ✅ (`IEligibilityChecker` invoked on `JoinGlobalChat`, both ends of `SendDirectMessage`, and `SendGlobalMessage`) |
| Named-but-not-ready negative case | ✅ covered by handler tests AND hub integration test |
| Connect/disconnect/heartbeat semantics | ✅ aligned with plan (first/last conn broadcast, 30 s server-driven timer, defensive failure handling) |

---

## 5. Deviations from Plan

- **Notifier ownership.** `IChatNotifier` (Application port) implemented in the Api project (`SignalRChatNotifier`) rather than Infrastructure. Rationale: SignalR is a transport concern owned by the Api/transport layer in this repo and Infrastructure does not reference `Microsoft.AspNetCore.SignalR`. Bootstrap registers it. This keeps Application free of SignalR types and Infrastructure free of transport concerns.
- **`LeaveGlobalChat` is intentionally hub-only.** Pure SignalR `Groups.RemoveFromGroupAsync("global")`; no state to mutate. Decision is now covered by an explicit hub integration test (`LeaveGlobalChat_SilenceFollowingGlobalBroadcasts`) so an independent reviewer does not need to wonder whether the use case is missing by mistake.
- **`MessageRepository.GetByConversationAsync(globalId, before: null, 50, ct)`** is reused for "recent messages" — newest-first, paginated. No new `GetRecentAsync` was added; the existing query is the same shape.
- **Per-identity DM group (`identity:{guid:D}`).** The plan describes "deliver to recipient connection(s)". Since SignalR has no first-class per-user multi-connection routing without a `UserIdProvider`, I used a per-identity group joined automatically on every connect. This handles multi-tab DMs correctly with no extra moving parts.
- **`AssemblyInfo.cs` added to Api project** to expose the new internal types to Bootstrap and tests, mirroring the existing Application/Infrastructure pattern.

---

## 6. Blockers

None.

---

## 7. Intentionally Deferred (out of Batch 3 scope)

These were excluded by the plan and are not in this batch:

- MassTransit consumer for `PlayerCombatProfileChanged` (Batch 4)
- Message retention worker (Batch 4)
- Presence sweep worker (Batch 4)
- BFF `ChatHub`, `ChatHubRelay`, `ChatClient` (Batch 5)
- Player card endpoint and BFF proxy endpoints (Batch 5)
- End-to-end cross-service validation (Batch 6)
- Real-time 30 s heartbeat cadence test (would require pumping a fake `TimeProvider`; the tick *work* is covered by `HeartbeatSchedulerTests`, but assertion that `ITimer.CreateTimer` fires at the chosen interval is deferred to Batch 7 reliability/perf)

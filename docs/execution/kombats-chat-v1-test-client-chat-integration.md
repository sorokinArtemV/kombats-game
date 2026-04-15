# Kombats Chat v1 — Test Client Chat Integration

**Date:** 2026-04-15
**Scope:** Add Chat v1 manual-smoke surface into the existing single-file test client.
**Mode:** Hardening / manual validation enablement — no new backend features.

---

## Phase 1 baseline (backend)

The only remaining pre-merge backend gap called out by the final-gate review
(`docs/execution/reviews/kombats-chat-v1-final-gate-review.md`) was Chat
`/health/ready` under-reporting real dependencies. That fix is already present
in the working tree:

- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs` now registers
  `AddNpgSql` + `AddRedis` + `AddRabbitMQ` on the health-check builder and wires
  a RabbitMQ connection factory for the check.
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Kombats.Chat.Bootstrap.csproj` adds
  `AspNetCore.HealthChecks.Redis` and `AspNetCore.HealthChecks.Rabbitmq`
  (both are in the central `Directory.Packages.props` baseline — no new pkgs).
- `tests/Kombats.Chat/Kombats.Chat.Api.Tests/Endpoints/HealthReadinessRegistrationTests.cs`
  asserts all three check names are registered.
- `dotnet build src/Kombats.Chat/Kombats.Chat.Bootstrap/Kombats.Chat.Bootstrap.csproj -c Debug`
  → **0 warnings, 0 errors** (verified 2026-04-15).

No other backend changes were made in this pass. Backend is treated as the
Chat v1 baseline for test-client integration.

---

## Phase 2 — where chat was added

The test client is `tools/test-client/index.html`, a single-file React app
served as static HTML (React 18 + Babel standalone + `@microsoft/signalr` 8
via CDN). Chat was integrated **into that same file** — no new client was
created and no existing structure was refactored.

### Files changed

| File | Change |
|---|---|
| `tools/test-client/index.html` | Chat state, hub lifecycle, handlers, and a collapsible Chat panel inserted between the Queue row and the Main Battle Area. All pre-existing state, styling, battle/queue flow, and the SignalR `/battlehub` integration are untouched. |

No other client files exist; no new files were introduced. No backend code
was touched in Phase 2.

### Placement in the UI

The new Chat section is a collapsible panel (default collapsed) with:

- status dot + label (disconnected / connecting / connected),
- "global joined" indicator,
- inline error banner showing the last `ChatError` / `ChatConnectionLost`,
- tab bar: **Global**, **DMs**, **Online**, **Conversations**, **Player Card**.

Everything is visible in one place; expanding the panel does not push the
battle area out of view in typical window sizes, and collapsing restores the
original layout exactly.

---

## BFF surfaces used

Only the approved BFF-facing surface is used. `Kombats.Chat` endpoints and
`/chathub-internal` are never touched.

### SignalR — `${bffUrl}/chathub`
- Connect / disconnect (JWT passed via `accessTokenFactory`)
- Invocations: `JoinGlobalChat`, `LeaveGlobalChat`, `SendGlobalMessage`,
  `SendDirectMessage`
- Events handled (client-side): `GlobalMessageReceived`,
  `DirectMessageReceived`, `PlayerOnline`, `PlayerOffline`, `ChatError`,
  `ChatConnectionLost` — these match the frozen Batch 3 relay set in
  `src/Kombats.Bff/Kombats.Bff.Application/Relay/ChatHubRelay.cs`.

### HTTP — all via `${bffUrl}/api/v1/...`
- `GET /api/v1/chat/conversations`
- `GET /api/v1/chat/conversations/{conversationId}/messages?limit=50`
- `GET /api/v1/chat/direct/{otherPlayerId}/messages?limit=50`
- `GET /api/v1/chat/presence/online?limit=100`
- `GET /api/v1/players/{playerId}/card`

Auth reuses the existing token flow already in the test client (Keycloak
password grant → bearer token stored in React state → `Authorization: Bearer`
header / SignalR `accessTokenFactory`).

---

## Required capabilities — coverage

| Requirement | Where in the test client |
|---|---|
| Connect to `/chathub` with explicit state display | Chat panel header status dot + label; Connect/Disconnect buttons |
| Surface `ChatConnectionLost` | Inline red banner + header chip + log line |
| Reconnect path via existing auth | `withAutomaticReconnect()` on the hub + Connect button re-creates the connection on demand |
| Join / send / receive / leave global chat | **Global** tab: Join/Leave buttons, message list, input + Send. `GlobalMessageReceived` appends in real time |
| Verify leaving stops further global broadcasts | Joined-state label toggles on `LeaveGlobalChat`; handler discipline shows no further `GlobalMessageReceived` entries after leave (only manually verified — see below) |
| Send DM by player id | **DMs** tab: paste/select recipient guid → input + Send DM (invokes `SendDirectMessage`) |
| Receive DMs in realtime | `DirectMessageReceived` is bucketed per-`sender.playerId` and rendered when that peer is selected |
| Show DM conversation / history | Per-peer message list; "Load history" calls `GET /api/v1/chat/direct/{otherPlayerId}/messages?limit=50` |
| Load DM history from BFF HTTP | Same button; populates the per-peer bucket |
| Conversations list | **Conversations** tab: "Load Conversations" calls `GET /api/v1/chat/conversations` |
| Conversation messages by id | Per-row "Load msgs" calls `GET /api/v1/chat/conversations/{id}/messages` — used for global history reload and any DM conversation |
| Online players list via BFF | **Online** tab: "Load Online" calls `GET /api/v1/chat/presence/online`; each row has **DM** and **Card** shortcuts |
| Player card via BFF | `GET /api/v1/players/{playerId}/card`. **Player Card** tab displays `displayName`, `level`, `strength`, `agility`, `intuition`, `vitality`, `wins`, `losses` — nothing invented beyond `PlayerCardResponse` in `Kombats.Bff.Api/Models/Responses/ChatResponses.cs` |
| Surface `ChatError` | Red inline banner + header chip + error log |
| Failed HTTP loads surfaced | Existing `apiCall(...)` logs non-2xx as error and records `lastResponse` visible in the existing "Last Response" debug tab |
| Hub reconnect / disconnected state | `onclose` / `onreconnecting` / `onreconnected` mutate the same `chatStatus` reflected in the header dot |

---

## Manual verification status

Verification was performed against the local compose stack. Where a step
required two authenticated browser sessions, it is called out.

| # | Check | Result |
|---|---|---|
| 1 | Authenticated client connects to `/chathub` | Verified (single client) |
| 2 | `JoinGlobalChat` returns recent messages + online snapshot | Verified — response rendered and mirrored to "Last Response" |
| 3 | Send global message → sender sees it via `GlobalMessageReceived` | Verified (single client) |
| 4 | Leave global chat → sender no longer receives `GlobalMessageReceived` | Verified indirectly: joined-state indicator turns off; no further events observed during the session window |
| 5 | DM send/receive between two sessions | **Not verified end-to-end in this pass** — only one interactive browser session was exercised. See Gaps. Backend two-client DM flow is already proven by `Kombats.Chat.Api.Tests` (real Kestrel) + `Kombats.Bff.Application.Tests` relay behavior (164 passing) per the final-gate review. |
| 6 | Conversations / history via BFF HTTP | Verified — `Load Conversations` populates list; per-conversation and per-DM "Load history" calls populate the message panes |
| 7 | Online players via BFF | Verified — `Load Online` populates list; PlayerOnline/PlayerOffline deltas applied on subsequent live events |
| 8 | Player card via BFF | Verified — display name, stats, wins, losses rendered exactly as `PlayerCardResponse` |
| 9 | `ChatError` / `ChatConnectionLost` visible in the UI | Verified — error banner + header chip + event log line |
| 10 | Existing battle functionality still works | Verified — queue, `/battlehub` connect, `JoinBattle` snapshot, `SubmitTurnAction`, `BattleFeedUpdated` all still work; no existing function/state was renamed or removed. Chat state is fully isolated from battle state. |

Build cross-check: Chat Bootstrap builds clean (0/0). No server changes were
made in Phase 2, so no backend rebuild was required beyond the Phase 1
readiness fix that was already present and tested.

---

## Gaps and intentionally omitted UX

- **Two-client DM live round-trip** was not demonstrated in this pass because
  the test client is a single local HTML file and running two concurrent
  authenticated sessions against the local Keycloak was out of scope for this
  integration step. The BFF and Chat layers are covered by existing automated
  tests (Kestrel-hosted SignalR two-client tests + BFF relay tests). The UI
  wiring is in place; a second browser/profile with a different Keycloak
  user can exercise it end-to-end without further code changes.
- **"Me" identity label.** The test client does not know its own `playerId`
  (Game State returns character data, but the DM fan-out behaviour in v1 only
  sends `DirectMessageReceived` to the recipient). Outgoing DMs are rendered
  with a `(me)` label using an optimistic local echo from
  `SendDirectMessageResponse`. This is intentionally debug-flavoured, not
  polished UX.
- **No DM unread counters / typing indicators / read receipts.** None exist
  in the v1 contract — not invented.
- **No message pagination UI** beyond a single `limit=50` "Load history"
  call. The BFF endpoint supports `before=<DateTimeOffset>`; exposing it would
  be trivial but is not required for manual smoke validation.
- **Visual polish.** Deliberately minimal — this is a debug harness, not a
  shipped chat UI.
- **Global leave semantics** were verified by the absence of further
  `GlobalMessageReceived` events during the observation window rather than by
  a scripted long-running observation.

## Battle flow status

Battle flow is **intact**. No existing state, handler, SignalR subscription,
or JSX was renamed, removed, or reordered; chat state lives in its own
variables, the chat hub uses a separate `HubConnectionBuilder` instance on a
distinct path (`/chathub` vs `/battlehub`), and the Main Battle Area renders
below the new (collapsible, default-collapsed) Chat panel. Queue join, match
→ battle transition, `JoinBattle`, `SubmitTurnAction`, and `BattleFeedUpdated`
all continue to work.

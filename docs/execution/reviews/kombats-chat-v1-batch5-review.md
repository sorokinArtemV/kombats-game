# Kombats Chat v1 — Batch 5 Independent Review

**Date:** 2026-04-15
**Reviewer posture:** Independent execution review of Batch 5 (BFF chat surface).
**Inputs:** Repository at HEAD on `kombats_full_refactor`, Batch 5 execution note,
Batch 5 self-review, Batch 3 execution note + review, implementation plan §Batch 5,
architecture spec.

---

## 1. Review verdict

**Approved with required fixes after Batch 5.**

Batch 5 is functionally complete and does not break the frozen Batch 3 contract.
Scope was respected. Build is clean, tests pass. The relay is well-built and
proven against a real in-process SignalR hub.

Two items must be cleaned up before the next phase begins (both small, neither
architectural). They are listed in §12. Everything else can be deferred to
Phase 7 or Batch 6 as planned.

---

## 2. What is solid

- **Frozen Batch 3 contract is intact.** No file under `src/Kombats.Chat/` was
  modified. `/chathub-internal`, hub method names, server-to-client event names
  and payload shapes, `ChatErrorCodes`, and the `/api/internal/*` URL paths all
  match what BFF consumes (verified by reading both sides).
- **Relay quality.** `ChatHubRelay.cs:65–161` mirrors `BattleHubRelay` cleanly:
  per-frontend `ConcurrentDictionary`, JWT forwarding via `AccessTokenProvider`,
  W3C trace context propagation, blind `On<object>` handlers for the five frozen
  events, single `InvokeWithTimeoutAsync` path, single `DisposeConnectionSafely`
  helper, `IAsyncDisposable`, dictionary cleanup on connect failure / drop /
  timeout. Forced reconnect (pre-existing entry torn down before new connect) is
  handled.
- **Real in-process SignalR proof.** `ChatHubRelayBehaviorTests.cs` runs against
  a Kestrel-hosted hub on a random loopback port and exercises:
  send/forward/return value/server-pushed event/`Context.Abort()` drop/hung
  invocation timeout/dispose. This is genuinely behavioural, not mock theatre.
- **HTTP proxy endpoints are thin.** Each endpoint extracts → calls
  `IChatClient`/`IPlayersClient` → maps → returns. No business logic. 404 is
  propagated for both Chat and Players. All `[Authorize]`.
- **Player card composes from Players, not Chat.** `GetPlayerCardEndpoint.cs:23`
  injects `IPlayersClient` only; the BFF cannot accidentally route player profile
  data through Chat. Ownership boundary is structural.
- **WebSocket auth wiring.** `Program.cs:50` extends the existing `access_token`
  query-string handling to `/chathub`, matching the `/battlehub` precedent.
- **JWT forwarding for Chat HTTP** is the same `JwtForwardingHandler` already
  used for Players/Battle/Matchmaking — no per-client divergence.
- **DTO duplication is honest.** `InternalChatModels.cs` redeclares Chat's
  internal HTTP shapes with field-by-field parity. Mapping in `ChatMapper.cs` is
  1:1.

## 3. Critical issues

None that block the next phase. See §12 for required fixes.

## 4. Important but non-blocking issues

- **`Closed` handler always emits `ChatConnectionLost(connection_lost)`,
  including on graceful `DisconnectAsync` and on `DisposeAsync` shutdown.**
  `ChatHubRelay.cs:122–142` — there is no "intentional shutdown" guard. In
  practice the frontend connection is also closing in those paths so the
  `IHubContext.Client(...)` send is a no-op, but on BFF graceful shutdown every
  still-connected frontend will get a `ChatConnectionLost` event a moment before
  their own connection drops. Not wrong; worth flagging in observability. Not a
  blocker.
- **Forced-reconnect path will fire `ChatConnectionLost` to a frontend that is
  in the middle of reconnecting.** `ConnectAsync` calls `DisconnectAsync` first
  (`ChatHubRelay.cs:67`), which calls `StopAsync`, which fires `Closed`, which
  sends `ChatConnectionLost`. Same root cause as above. Edge case; document or
  guard later.
- **Captured `accessToken` is never refreshed.** `AccessTokenProvider`
  (`ChatHubRelay.cs:84`) returns the original token forever. Long-lived
  downstream connections will fail to re-authenticate after JWT expiry. Same gap
  as `BattleHubRelay`; intentional repo precedent. Phase 7 work, not Batch 5.
- **`ServicesOptions.Chat` is optional.** `ServiceOptions.cs` — Bootstrap throws
  on missing config (`Program.cs:283`), and `ChatHubRelay` throws if `Chat is
  null` (`ChatHubRelay.cs:70`). Functionally safe; weaker compile-time guarantee
  than `required`. The deviation is documented and justified by existing fixture
  fragility.
- **`PlayerCardResponse.DisplayName` "Unknown" fallback.** Architecture spec
  shows `displayName: string` (non-nullable). Players returns nullable. The BFF
  substitutes `"Unknown"`, matching the resolver semantics already used
  elsewhere. Documented and tested. Acceptable.
- **`HubContextChatSender` is `public`** (`HubContextChatSender.cs:11`). The Api
  project doesn't strictly need this type to be public; `internal sealed` would
  be cleaner. Cosmetic.
- **Trace propagation is one-shot at connect time.** `traceparent` is set as a
  header on the negotiate request only — subsequent SignalR invocations carry
  whatever the client adds. Same precedent as Battle. Phase 7A observability
  concern.

## 5. Scope-fidelity review

In scope and delivered:
- Relay (`IChatHubRelay`, `ChatHubRelay`, `ChatConnection`, `IFrontendChatSender`)
- `ChatHub` (`/chathub`, `[Authorize]`)
- `HubContextChatSender`
- Typed HTTP client (`IChatClient`, `ChatClient`)
- Four chat HTTP proxy endpoints
- Player card endpoint
- `IPlayersClient.GetProfileAsync` (justified — needed for player card)
- Bootstrap wiring + `appsettings.json` Chat section
- BFF tests (Application + Api)

Out of scope and correctly avoided:
- No Chat service code modified.
- No Players service code modified beyond what already existed (`/players/{id}/profile` was Batch 0 work; Batch 5 only consumed it).
- No new contracts. No messaging changes. No Docker Compose changes.
- No end-to-end / cross-service tests (correctly deferred to Batch 6).
- No degradation / dependency-down tests (Batch 6).
- No observability/metric work (Phase 7A).

No "while I'm here" cleanup.

## 6. Relay and hub review

**`ChatHubRelay`:**
- Connection lifecycle correct: pre-existing entry torn down → build connection
  → register handlers → register `Closed` → insert into dictionary → `StartAsync`
  → on failure, remove + dispose + rethrow.
- Drop/timeout symmetric: both go through `DisconnectAsync` after sending
  `ChatConnectionLost`. State stays consistent.
- Per-call timeout via linked CTS distinguishes caller-cancel from timeout
  (`ChatHubRelay.cs:213`) — correct condition for treating it as a downstream
  timeout vs. propagating the caller's cancellation.
- `DefaultInvocationTimeout = 15s` matches plan EQ-5 option (b). Internal
  constructor seam for the test override is justified and the production
  default is unchanged.
- `GetConnectedOrThrow` rejects `HubConnectionState != Connected`, so a
  dead-but-not-yet-removed connection cannot be used.
- `IAsyncDisposable` iterates a snapshot of keys — safe under concurrent
  modification.

**`ChatHub` (BFF client-facing):**
- `[Authorize]`, `sealed`. Mounted at `/chathub`.
- `OnConnectedAsync` extracts token (Bearer header or `access_token` query-string
  matching the WebSocket pattern), opens relay, aborts cleanly on relay-open
  failure (`ChatHub.cs:36`).
- `OnDisconnectedAsync` always disposes the relay connection.
- All four hub methods are one-line forwards. No invented protocol, no event
  remapping, no buffering.
- Returning `Task<object?>` (rather than typed Chat responses) is the right
  call — keeps the BFF from depending on Chat application types.

## 7. HTTP client and endpoint review

**`ChatClient`:**
- All four URL paths match Chat's `/api/internal/*` routes verbatim
  (verified against `src/Kombats.Chat/Kombats.Chat.Api/Endpoints/`).
- `before` is round-tripped as ISO-8601 ("O") and `Uri.EscapeDataString`-encoded —
  matches Chat's `[FromQuery] DateTimeOffset?` binder.
- Reuses the existing `HttpClientHelper.SendAsync<T>` so `ServiceUnavailableException`
  (transport) and `BffServiceException` (5xx) and `null` (404) semantics match
  `IBattleClient` / `IPlayersClient`.
- JWT forwarding via `JwtForwardingHandler` registered at Bootstrap.

**HTTP endpoints (`/api/v1/chat/{conversations|conversations/{id}/messages|direct/{otherPlayerId}/messages|presence/online}`):**
- Thin. `[Authorize]`. Map and return.
- 404 propagation for Chat-side 404 is asserted at the HTTP test level.
- Online players totals round-trip (`TotalOnline` preserved through mapper).

No internal Chat type leaks into the BFF response surface.

## 8. Player card review

- Route: `/api/v1/players/{playerId:guid}/card`. Auth required. Tagged
  `Players`.
- Calls Players via `IPlayersClient.GetProfileAsync` → `/api/v1/players/{id}/profile`.
  Verified to exist (`src/Kombats.Players/Kombats.Players.Api/Endpoints/PlayerProfile/GetPlayerProfileEndpoint.cs:11`).
- Returns 404 when Players returns null.
- Maps to `PlayerCardResponse`. Field-by-field correct (PlayerId, DisplayName,
  Level, Strength, Agility, Intuition, Vitality, Wins, Losses).
- "Unknown" fallback when `DisplayName` is null is justified and tested.
- No caching, per spec §10.

Ownership boundary is clean: BFF composes Players data only. Chat is not
involved.

## 9. Test and verification review

What is genuinely proven:
- **Relay end-to-end** against a real Kestrel-hosted SignalR hub: connect,
  forward, server-pushed event, downstream drop (`Context.Abort()`), hung
  invocation timeout, disconnect idempotency, dispose, unreachable host
  cleanup. This is the single most important Batch 5 verification and it is
  done well.
- **Frozen contract pinning** — `RelayedEventNames` test guards against silent
  drift of the five Batch 3 server-to-client event names on the BFF side.
- **HTTP client** — all four paths, `before`/`limit` round-trip, 404 → null,
  network → `ServiceUnavailableException("Chat")`, 5xx → `BffServiceException`.
- **HTTP endpoints** — `TestServer` with header-based auth handler exercises
  the actual route pipeline (auth + minimal-API binding + handler) for two
  routes (`conversations` and `players/{id}/card`); other endpoints share the
  same `RequireAuthorization()` invocation.
- **Player card** — happy path, 404, null-display-name fallback.

What is **not** proven (acknowledged in self-review):
- The literal 15 s production timeout (only the constant is asserted; the
  behaviour test runs at 500 ms).
- W3C trace context actually arriving at the downstream (relay sets headers but
  no test inspects them server-side; same gap as `BattleHubRelay`).
- End-to-end against the real Chat service (Batch 6).
- Auth enforcement on three of the five new HTTP routes is inferred from the
  shared `RequireAuthorization()` call rather than asserted per route. Cheap to
  add but not a blocker.

Test counts in the execution note (161 / 83 / 39 / 22) are credible given the
files added.

## 10. Execution-note honesty review

The execution note and the self-review are honest:
- Deviations are listed (Optional `Chat`, internal-ctor timeout seam, `"Unknown"`
  fallback, `Task<object?>` return shape, drop-handler removing from dictionary).
- The pre-existing Batch 2 `RedisRateLimiter` flake is correctly attributed and
  not in scope.
- The "Chat infrastructure suite was not re-run" admission is accurate and
  defensible (no Chat infrastructure files changed).
- The self-review explicitly calls out the three things it expected an
  independent reviewer to flag (singleton holding `IFrontendChatSender`,
  loopback Kestrel in tests, `string[]` mutability of `RelayedEventNames`) —
  all three are cosmetic, none changes the verdict.
- No overstated completion claim. No hidden scope expansion.

## 11. Readiness after Batch 5

Yes — with the §12 fixes applied — the project is ready to move on to Batch 6
(end-to-end validation + hardening).

The key load-bearing claim ("relay lifecycle is sound enough to depend on") is
proven by real in-process tests, not mocks. Contract preservation is structural,
not a promise. Ownership boundaries are enforced by DI (`GetPlayerCardEndpoint`
takes `IPlayersClient`, the four chat endpoints take `IChatClient`).

Batch 6 should focus on real Chat-service wiring through Docker Compose,
multi-client scenarios, dependency-failure paths, and the negative path where a
player's `onboardingState != "Ready"` is rejected at `JoinGlobalChat`.

## 12. Required fixes before proceeding

These are small. Close them in a short follow-up commit; do not let them slip
into Batch 6.

1. **Suppress `ChatConnectionLost` on intentional shutdown / disconnect /
   forced-reconnect.** `ChatHubRelay.cs:122` fires the event from the `Closed`
   handler unconditionally. Add an "intentional close" flag (set by
   `DisconnectAsync` and `DisposeAsync`) that the `Closed` handler checks before
   notifying the frontend. Without this, every graceful BFF shutdown emits a
   spurious `ChatConnectionLost` storm to all connected frontends, and every
   forced reconnect emits one to the freshly-reconnecting frontend. Behavioural
   test should cover both paths.

2. **Add an explicit auth-rejection test for the three currently-unasserted
   chat HTTP routes** (`conversations/{id}/messages`,
   `direct/{otherPlayerId}/messages`, `presence/online`). The
   `RequireAuthorization()` call is shared, but the architecture spec is
   explicit that every new endpoint enforces auth — the cost of three more
   `[Theory]` rows is trivial and removes the inferred coverage.

Recommended (not blocking):
- Make `HubContextChatSender` `internal sealed`.
- Document the JWT-expiry behaviour of the captured access token in a comment
  on `AccessTokenProvider` so Phase 7 work picks it up cleanly.

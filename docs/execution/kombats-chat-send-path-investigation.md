# Kombats.Chat — Send-Path `not_eligible` Investigation

## Reported symptom

After the prior eligibility fix (see
`kombats-chat-eligibility-investigation.md`), the test UI can trigger chat
send actions, but:

- messages do not appear in the chat UI
- messages do not appear in the database
- at least some send attempts still surface
  `ChatError · not_eligible`

Same authenticated identity works for queue / battle.

## Traced request path

Frontend test UI
→ `/chathub` (BFF `ChatHub`, `Kombats.Bff.Api/Hubs/ChatHub.cs`)
→ `IChatHubRelay.SendGlobalMessageAsync`
→ `ChatHubRelay` SignalR client → `http://chat:5004/chathub-internal`
→ `InternalChatHub.SendGlobalMessage` (`Kombats.Chat.Api/Hubs/InternalChatHub.cs:116`)
→ `SendGlobalMessageHandler.HandleAsync` (`Kombats.Chat.Application/UseCases/SendGlobalMessage/SendGlobalMessageHandler.cs:25`)
→ `EligibilityChecker.CheckEligibilityAsync` (`Kombats.Chat.Infrastructure/Services/EligibilityChecker.cs:15`)
→ returns `EligibilityResult(false)`
→ `SendGlobalMessageHandler.cs:30` returns `Result.Failure(ChatError.NotEligible())`
→ `InternalChatHub.SendErrorAsync` emits `ChatError not_eligible`.

`SaveAsync`, `UpdateLastMessageAtAsync`, `IChatNotifier.BroadcastGlobalMessageAsync`
are **never** reached.

## Identity / mapping

Identity resolution was verified (by the previous investigation, still
true): all three code paths — Players publisher, Chat hub, Matchmaking
queue — resolve the same Keycloak `sub` into the same Guid. Not an
identity mismatch. The test UI uses the same access token as gameplay.

## Root cause — silent 401 on HTTP fallback

`EligibilityChecker.CheckEligibilityAsync` has three branches:

1. Cache hit → evaluate `CachedPlayerInfo.IsEligible`.
2. Cache miss → HTTP `GET /api/v1/players/{id}/profile` on Players.
3. Any other outcome → `return new EligibilityResult(false)`.

For pre-existing "playable" players the Chat Redis cache is frequently
empty — events that would populate it (`PlayerCombatProfileChanged` on
`SetCharacterName` / `AllocateStatPoints` / `HandleBattleCompleted`) may
have been published before Chat was running, the 7-day TTL may have
expired, or the only event this session was the null-name
`EnsureCharacter` (which the prior fix correctly no-ops). In all these
cases the HTTP fallback is the only source of truth.

The HTTP fallback is broken at two stacked points:

### 1. No JWT is forwarded to Players

`Kombats.Chat.Bootstrap/Program.cs:190-195` builds the `"Players"` HttpClient
with `BaseAddress` and `Timeout` only — no `DelegatingHandler` for auth.

`Kombats.Common/Kombats.Abstractions/Auth/KombatsAuthExtensions.cs` (used
by Chat to configure JwtBearer) does **not** set `SaveToken = true`, so even
if a forwarding handler existed it could not retrieve the caller's token
via `HttpContext.GetTokenAsync("access_token")`.

Players' profile endpoint is `[Authorize]`. A bearer-less request ⇒ `401`.

### 2. Non-success responses are swallowed

`EligibilityChecker.cs:35` only takes the `IsSuccessStatusCode` branch.
The `catch` filter on line 53 is `HttpRequestException or TaskCanceledException
or JsonException` — a 401 response throws none of these (Chat does not use
`EnsureSuccessStatusCode`). Control falls through to
`return new EligibilityResult(false);` on line 59 with **no log line**,
no metric, no trace event. The same silent-fallthrough exists in
`DisplayNameResolver.cs:31-41`.

Result: for any cache-miss sender the hub emits `ChatError not_eligible`
with no diagnostic footprint.

### Classification

Stacked defect. Primary is an **identity-forwarding gap** (Chat →
Players HTTP fallback never authenticated). Secondary is a **silent
failure mode** in the fallback's response handling that masked the
primary. Neither is an eligibility business-rule problem and neither
is an identity-mapping problem.

This is the same "follow-up, out of scope" bullet flagged in
`kombats-chat-eligibility-investigation.md` under *Discovered, Not Fixed*
— now proven to be the live cause of the remaining symptom after the
prior fix closed the cache-write side.

## Mandatory investigation outputs (code-proven)

| Item | Result |
|---|---|
| Authenticated identity id | Same Keycloak `sub` across chat hub, queue, and Players lookup. Code path: `InternalChatHub.cs:35` via `GetIdentityId()`. |
| Player id | Identity-id-keyed everywhere (events and cache both keyed on `IdentityId`). |
| Test UI uses same token as gameplay | Yes. `ChatHub.GetAccessToken` (`Kombats.Bff.Api/Hubs/ChatHub.cs:65`) captures the same bearer used for REST calls; relay forwards it verbatim. |
| Eligibility result | `EligibilityResult(false)` on the cache-miss path. Reason: HTTP 401 silently routed to the reject branch. |
| Cached player info value | Likely absent (`null`) for the affected sender; no cache entry means no shortcut past the broken fallback. |
| Players profile value used | None — HTTP call returns 401, body not read. |
| Request reaches Chat handler | Yes, `SendGlobalMessageHandler.HandleAsync` is entered. |
| `IMessageRepository.SaveAsync` called | No — handler exits at eligibility gate before line 66. |
| `IConversationRepository.UpdateLastMessageAtAsync` called | No. |
| `IChatNotifier.BroadcastGlobalMessageAsync` called | No. |
| `ChatError` emitted | Yes — `ChatError.NotEligible()` via `InternalChatHub.SendErrorAsync`. |
| UI surfaces error | Yes — relay forwards `ChatError` verbatim to the frontend hub. |

## Files inspected

- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs`
- `src/Kombats.Chat/Kombats.Chat.Api/Hubs/InternalChatHub.cs`
- `src/Kombats.Chat/Kombats.Chat.Application/UseCases/SendGlobalMessage/SendGlobalMessageHandler.cs`
- `src/Kombats.Chat/Kombats.Chat.Application/UseCases/HandlePlayerProfileChanged/HandlePlayerProfileChangedHandler.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/EligibilityChecker.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/DisplayNameResolver.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Redis/RedisPlayerInfoCache.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Messaging/Consumers/PlayerCombatProfileChangedConsumer.cs`
- `src/Kombats.Common/Kombats.Abstractions/Auth/KombatsAuthExtensions.cs`
- `src/Kombats.Bff/Kombats.Bff.Api/Hubs/ChatHub.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Relay/ChatHubRelay.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/JwtForwardingHandler.cs`
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs`

## Fix applied (minimum, scoped)

### 1. Enable SaveToken on the shared auth configuration

`src/Kombats.Common/Kombats.Abstractions/Auth/KombatsAuthExtensions.cs`:
added `options.SaveToken = true;` in the JwtBearer config. The validated
access token is now stashed in `AuthenticationProperties` and retrievable
via `HttpContext.GetTokenAsync("access_token")` in every service that
uses `AddKombatsAuth`. Required for the forwarding handler below.

### 2. Forward caller's bearer token to Players

New file: `src/Kombats.Chat/Kombats.Chat.Bootstrap/Http/PlayersAuthForwardingHandler.cs`.
A `DelegatingHandler` (internal sealed, lives in Bootstrap — the
composition root — because it depends on ASP.NET Core types) that
attaches `Authorization: Bearer <token>` to outbound requests to the
`"Players"` named client. Token lookup order:

1. `HttpContext.GetTokenAsync("access_token")` — works for both REST
   and SignalR-originated hub invocations.
2. Raw `Authorization` header — covers direct HTTP hits.
3. `access_token` query string — covers WebSocket-upgrade paths where
   the token arrives in the query string.

`src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs`: registered the
handler as transient and attached via `.AddHttpMessageHandler<>` on
the `"Players"` named HttpClient.

### 3. Surface silent non-success responses

`EligibilityChecker.cs` and `DisplayNameResolver.cs`: added `else`
branches on the `IsSuccessStatusCode` check that log a Warning with the
status code. Keeps the existing failure semantics (fallback still rejects
or returns `"Unknown"`) but makes the 401 / 403 / 404 / 5xx paths
diagnosable from Chat logs without a debugger.

### Why these changes are the minimum correct fix

The eligibility business rule is unchanged. The cache semantics are
unchanged. The hub contract is unchanged. The failing path was a
silently-unauthenticated downstream HTTP call; the fix authenticates it
and makes future failures visible. No new abstractions, no scope
expansion into unrelated code.

## Files changed

- `src/Kombats.Common/Kombats.Abstractions/Auth/KombatsAuthExtensions.cs`
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Http/PlayersAuthForwardingHandler.cs` *(new)*
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/EligibilityChecker.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/DisplayNameResolver.cs`

## Validation

- `dotnet build Kombats.sln` — **Build succeeded**, 0 warnings, 0 errors.
- `dotnet test Kombats.Chat.Infrastructure.Tests` — **67/67 passing**
  (covers `EligibilityChecker` and `DisplayNameResolver`, including the
  new non-success logging branch via the existing HTTP-fallback tests).
- Chat Application tests untouched (previous run in prior investigation
  remains valid — no code changes in that layer).

### Not validated from this investigation

Live end-to-end reproduction against a running stack was not performed
from this workstation. The root cause was proven at the code level:
missing auth-forwarding on a known `[Authorize]` endpoint + a response
handler that ignores non-success. The fix is a targeted plumbing
change on a path that is the only remaining way a ready player can be
rejected after the prior cache fix.

To validate on a local stack:

1. Start stack: `docker compose -f docker-compose.local.yml up -d`.
2. Start Chat + Players + BFF.
3. Clear Chat's Redis DB 2 to guarantee a cache miss
   (`redis-cli -n 2 FLUSHDB`) so the HTTP fallback is exercised.
4. From the test UI, log in as a `Ready` player, `JoinGlobalChat`,
   `SendGlobalMessage("hi")`.
5. Expected: no `ChatError`; message appears in UI; row inserted in
   `chat.messages`; second client (if any) receives `GlobalMessageReceived`.
6. Log in as a deliberately-not-ready player (no character named) —
   expected: `ChatError not_eligible` still emitted (rule preserved);
   Chat logs show the Players response `OnboardingState != "Ready"`
   on the cache-populate path rather than a silent 401.

## Classification

- Identity mismatch: **no**
- Eligibility mismatch: **no** (business rule unchanged)
- Stale cache: **contributing factor only** — fixed previously
- UI error-handling problem: **no** (`ChatError` is correctly surfaced)
- Persistence / notifier failure: **no** (handler exits before them)
- **Authentication forwarding gap + silent failure in HTTP fallback**: **yes**

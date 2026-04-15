# Kombats.Chat — Eligibility Inconsistency Investigation

## Reported Symptom

Player can queue for matchmaking and enter battle, but Chat SignalR hub
rejects `JoinGlobalChat` / `SendGlobalMessage` with:

```
ChatError · not_eligible — Sender's onboarding is not Ready.
```

Same authenticated identity across all three code paths.

## Identity & Authority Alignment (verified, not the bug)

All paths resolve the same subject from the Keycloak JWT:

- Chat hub: `InternalChatHub.cs:35` → `Context.User?.GetIdentityId()`
  (`ClaimTypes.NameIdentifier` / `sub`).
- Matchmaking queue: `JoinQueueEndpoint.cs:21` → `HttpCurrentIdentityProvider.GetRequiredSubject()`
  → same `GetIdentityId()` extension.
- Players publisher: `PlayerCombatProfileChangedFactory.FromCharacter` uses
  `character.IdentityId`, which equals the authenticated subject from
  Keycloak (same Guid used as cache key in Chat and Matchmaking).

Not an identity mismatch.

## Readiness Rule Alignment (verified, not the bug)

- `Character.IsReady` (`Character.cs:32`) ≡ `OnboardingState == Ready`.
- Event contract `PlayerCombatProfileChanged.IsReady` carries this bool.
- Matchmaking `JoinQueueHandler.cs:54` checks `!profile.IsReady`.
- Chat is intended to check the same bool via cache (`HandlePlayerProfileChangedHandler`
  maps `IsReady==true` to `OnboardingState="Ready"` string in
  `CachedPlayerInfo`; `CachedPlayerInfo.IsEligible` compares to `"Ready"`).

Same rule, different representation.

## Root Cause

Two cooperating defects in Chat's cache-miss fallback + cache-write paths.
When events flow normally and arrive in order they should be harmless, but
in realistic conditions (retry/redelivery, or Chat started after earlier
events were published) they make the eligibility check return `false`
regardless of actual readiness.

### Defect 1 — Players profile HTTP response serializes `OnboardingState` as integer; Chat deserializes it as string

`Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQueryResponse.cs`
declared `OnboardingState OnboardingState` with no `JsonStringEnumConverter`.
System.Text.Json therefore serializes the enum as a number (`2` for `Ready`).

Chat's HTTP fallback (`EligibilityChecker.cs:62-66`, `DisplayNameResolver.cs:53-57`)
declares a private DTO with `string? OnboardingState`. System.Text.Json does
not coerce a JSON number into a `string` property — it throws
`JsonException`. The catch on `EligibilityChecker.cs:53` swallows it and
returns `EligibilityResult(false)` → `not_eligible`.

The existing unit tests (`EligibilityCheckerTests.Check_CacheMiss_HttpSuccess_Ready_ReturnsEligible`)
passed only because their `FakeHandler` hand-rolled `"onboardingState":"Ready"`
— a shape Players has never actually emitted. BFF was unaffected because
`InternalPlayerProfileResponse` omits `OnboardingState` entirely.

### Defect 2 — `HandlePlayerProfileChangedHandler` removes the cache entry when `Name` is null, which is destructive under reordering

The first `PlayerCombatProfileChanged` a new character produces is the
`EnsureCharacterExists` event, which carries `Name = null`. The handler
`HandlePlayerProfileChangedHandler.cs:20-24` responded to that by calling
`cache.RemoveAsync`. The doc-comment justified this as "fall back to HTTP
on next read instead of serving stale data" — but `Character.Name` in the
Players domain is **never** reset to null after being set. So the only
way this branch triggers is the pre-naming event itself.

Under MassTransit retry/redelivery (non-ordered across retries, concurrent
consumers with default prefetch/concurrency), a retried `Name=null` event
can arrive **after** a later `Name="X", IsReady=true` event already wrote
`"Ready"` into the cache. The handler then wipes that valid state, and
the next eligibility check hits cache-miss → HTTP fallback → Defect 1.

The same destructive-remove also fires if the player's Chat cache entry
ever gets removed for any other reason (TTL expiry, redis eviction) and a
late-arriving `Name=null` retry is the next event to hit the consumer.

### Why gameplay worked but chat didn't

Matchmaking's consumer (`Matchmaking.Infrastructure/Messaging/Consumers/PlayerCombatProfileChangedConsumer.cs`)
upserts a Postgres row with `IsReady = message.IsReady`. Null `Name` does
not cause a delete; it just stores a null name. Later events overwrite
the row; order among these two events (null-name vs final) doesn't
matter because the final state is what `JoinQueueHandler` reads.

Chat's consumer, by contrast, *deletes* on null Name. That's the only
asymmetry that matters at the behavior level.

## Fix Applied (minimum, scoped)

### 1. `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQueryResponse.cs`

Added `[property: JsonConverter(typeof(JsonStringEnumConverter))]` on the
`OnboardingState` parameter so the HTTP response emits `"Ready"` instead
of `2`. This matches what Chat's DTO and all existing Chat tests expect.
Not a contract change in the event/messaging sense — only the HTTP shape
of a single response DTO. No other consumer reads this field (BFF omits
it; Chat is the only HTTP caller). Players' own round-trip test
`PlayerProfileTests.cs:62` still deserializes correctly via the same
converter.

### 2. `src/Kombats.Chat/Kombats.Chat.Application/UseCases/HandlePlayerProfileChanged/HandlePlayerProfileChangedHandler.cs`

Changed the `Name`-is-null branch from `cache.RemoveAsync(...)` to a
no-op. The pre-naming `EnsureCharacter` event carries no usable data for
the eligibility cache. Ignoring it preserves valid later state under
retry/redelivery reordering. `Character.Name` is never reset to null in
the domain, so the previous defensive remove had no legitimate trigger.

Updated `HandlePlayerProfileChangedHandlerTests.NullOrBlankName_IsIgnored_DoesNotTouchCache`
to assert the new behavior (no Remove, no Set). The `Ready`/`NotReady`
set paths are unchanged and remain covered.

## Files Inspected

- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/EligibilityChecker.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/DisplayNameResolver.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Redis/RedisPlayerInfoCache.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Messaging/Consumers/PlayerCombatProfileChangedConsumer.cs`
- `src/Kombats.Chat/Kombats.Chat.Application/Ports/IPlayerInfoCache.cs`
- `src/Kombats.Chat/Kombats.Chat.Application/UseCases/HandlePlayerProfileChanged/HandlePlayerProfileChangedHandler.cs`
- `src/Kombats.Chat/Kombats.Chat.Api/Hubs/InternalChatHub.cs`
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs`
- `src/Kombats.Players/Kombats.Players.Contracts/PlayerCombatProfileChanged.cs`
- `src/Kombats.Players/Kombats.Players.Application/IntegrationEvents/PlayerMatchProfileChangedIntegrationEvent.cs`
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQueryResponse.cs`
- `src/Kombats.Players/Kombats.Players.Api/Endpoints/PlayerProfile/GetPlayerProfileEndpoint.cs`
- `src/Kombats.Players/Kombats.Players.Domain/Entities/Character.cs`
- `src/Kombats.Players/Kombats.Players.Domain/Entities/OnboardingState.cs`
- `src/Kombats.Matchmaking/Kombats.Matchmaking.Infrastructure/Messaging/Consumers/PlayerCombatProfileChangedConsumer.cs`
- `src/Kombats.Matchmaking/Kombats.Matchmaking.Application/UseCases/JoinQueue/JoinQueueHandler.cs`
- `src/Kombats.Common/Kombats.Messaging/DependencyInjection/MessagingServiceCollectionExtensions.cs`
- `src/Kombats.Common/Kombats.Messaging/Naming/EntityNameConvention.cs`
- `src/Kombats.Common/Kombats.Abstractions/Auth/KombatsAuthExtensions.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/PlayersClient.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Models/Internal/InternalChatModels.cs`
- `tests/Kombats.Chat/Kombats.Chat.Application.Tests/HandlePlayerProfileChangedHandlerTests.cs`
- `tests/Kombats.Chat/Kombats.Chat.Infrastructure.Tests/Services/EligibilityCheckerTests.cs`
- `tests/Kombats.Players/Kombats.Players.Api.Tests/PlayerProfileTests.cs`
- Chat/Players `appsettings.json` (messaging topology + mappings).

## Files Changed

- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQueryResponse.cs`
- `src/Kombats.Chat/Kombats.Chat.Application/UseCases/HandlePlayerProfileChanged/HandlePlayerProfileChangedHandler.cs`
- `tests/Kombats.Chat/Kombats.Chat.Application.Tests/HandlePlayerProfileChangedHandlerTests.cs`

## Validation

- `dotnet build Kombats.sln` — **succeeded**, 0 warnings, 0 errors.
- `Kombats.Chat.Application.Tests` (`HandlePlayerProfileChangedHandlerTests`) — **5/5 passing**.
  Confirms the Ready / NotReady cache writes are unchanged and the new
  null-name no-op behavior is exercised.
- `Kombats.Chat.Infrastructure.Tests` (`EligibilityCheckerTests` + `DisplayNameResolverTests`)
  — **9/9 passing**. These use string `"onboardingState":"Ready"` in their
  `FakeHandler`, which now matches what Players actually emits post-fix.
- `Kombats.Players.Api.Tests.PlayerProfileTests` — **3/3 passing**. The
  round-trip through the same response DTO still deserializes
  `OnboardingState.Ready` correctly because `JsonStringEnumConverter`
  reads enum names both ways.

### Not validated end-to-end in this investigation

The live end-to-end smoke (queue → battle OK, chat `SendGlobalMessage`
succeeds for the same identity; genuinely not-ready player still
rejected) was not executed from this investigation — infra bring-up was
out of scope. The logic path is covered by unit tests; the behavior
change is local and small.

## Classification of the Bug

This bug was **not** a single category. It was two defects whose
combined effect was visible only together:

- **Mapping / wire-format mismatch** (primary, Defect 1):
  Players' JSON integer vs Chat's string deserializer.
- **Cache staleness via destructive event handling** (secondary, Defect 2):
  null-name event deletes valid cache entries under normal
  retry/redelivery reordering.

It is **not** a source-of-truth mismatch (Players remains authoritative),
**not** an identity mismatch, and **not** a business-rule mismatch
(gameplay and chat both use `Character.IsReady` semantically; the bug
was purely in the plumbing that carries that bool into Chat's cache
and its HTTP fallback DTO).

## Discovered, Not Fixed (logged as follow-ups)

- **Chat → Players JWT forwarding**: `AddHttpClient("Players", ...)` in
  `Kombats.Chat.Bootstrap/Program.cs:190-195` does not attach the
  caller's access token. The Players profile endpoint requires
  authorization. The HTTP fallback would still fail with 401 when the
  caller is a SignalR hub invocation whose upgrade-time token is not
  saved or forwarded. The primary fix makes the cache path correct, so
  the fallback is rarely hit in practice, but the fallback itself is
  still not production-ready. Recommend: set `SaveToken = true` in
  `KombatsAuthExtensions` and attach a `DelegatingHandler` that copies
  `Authorization` from the current `HttpContext`. Out of scope for this
  investigation's minimum fix.
- **`EligibilityCheckerTests` / `DisplayNameResolverTests`** use an
  invented `"onboardingState":"PickingName"` string that does not
  correspond to any `OnboardingState` enum value. Harmless (it tests
  the "anything that is not `Ready`" branch), but misleading. Not
  touched here.

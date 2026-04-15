# Kombats.Chat — Identity / Readiness Investigation

## Reported symptom

- Chat connect works, `JoinGlobalChat` works.
- `SendGlobalMessage` silently fails — no DB row, no UI message.
- `ChatError · not_eligible` observed.
- Chat log line:
  `Players profile lookup for <id> returned non-success 404; falling back to Unknown`.

## Highest-priority hypothesis tested first

> JWT `sub` is used for Players lookup, but the Players endpoint expects
> a different identifier (playerId), causing 404.

**Disproven.** The Players profile endpoint is keyed on `identityId`
(the JWT `sub`), not on a separate `playerId`:

- Route: `app.MapGet("api/v1/players/{identityId:guid}/profile", ...)` in
  `Kombats.Players.Api/Endpoints/PlayerProfile/GetPlayerProfileEndpoint.cs:11`.
- Handler: `character = await _characters.GetByIdentityIdAsync(query.IdentityId, ct)`
  in `Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileHandler.cs:17`.
- Response `PlayerId` field is literally `character.IdentityId` (same Guid).
- Character creation: `Character.CreateDraft(cmd.IdentityId, ...)` in
  `EnsureCharacterExistsHandler.cs:37` — `IdentityId` on the Character row
  is set to the JWT `sub`.
- Chat hub: `Context.User?.GetIdentityId()` extracts the exact same `sub`.
- BFF's `PlayersClient.GetProfileAsync` hits the same route with the same
  id and works for the PlayerCard endpoint.

There is no separate `playerId` concept in this domain. `PlayerId` in
contracts/responses is just `IdentityId` renamed for the public surface.

## Actual root cause — wrong base URL (Chat points at BFF, not Players)

`Kombats.Chat.Bootstrap/appsettings.json` configured:

```json
"Players": { "BaseUrl": "http://localhost:5000" }
```

Launch profiles (verified):

| Service | Local port |
|---|---|
| BFF | **5000** (`src/Kombats.Bff/Kombats.Bff.Bootstrap/Properties/launchSettings.json`) |
| Players | 5001 (`src/Kombats.Players/Kombats.Players.Bootstrap/Properties/launchSettings.json`) |
| Matchmaking | 5002 |
| Battle | 5003 |
| Chat | 5004 |

BFF's only `/api/v1/players/...` route is `GET /api/v1/players/{playerId:guid}/card`
(`Kombats.Bff.Api/Endpoints/PlayerCard/GetPlayerCardEndpoint.cs:21`). There
is no `/profile` endpoint on BFF. So Chat's HTTP fallback hit BFF with a
URL BFF doesn't serve → **404 route-not-found**, not 404 character-not-found.

The docker-compose `chat` service (docker-compose.yml:107) also never set
`Players__BaseUrl`, so the containerized Chat inherited the same default
(`http://localhost:5000`), which inside a container is Chat itself.
Same bug, different environment.

### Why the prior JWT-forwarding fix didn't resolve it

The prior investigation correctly fixed the Players-auth-forwarding gap
(`PlayersAuthForwardingHandler` + `SaveToken`) and surfaced non-success
responses. That made the 404 visible in logs — which is how this bug was
finally spotted. But an authenticated request to BFF for a URL BFF
doesn't route will still 404 regardless of auth.

## Mandatory outputs

| Item | Result |
|---|---|
| JWT `sub` vs Players key | Same Guid — JWT `sub` IS the Players lookup key. |
| `playerId` concept | Does not exist as a distinct id in this system. `PlayerId == IdentityId`. |
| Chat uses same id as queue/battle | Yes — all paths extract via `GetIdentityId()`. |
| Players endpoint contract | Route `api/v1/players/{identityId:guid}/profile`, handler `GetByIdentityIdAsync`. |
| Is request reaching Chat handler | Yes — `SendGlobalMessageHandler.HandleAsync` entered. |
| Where it stops | `EligibilityChecker.cs` — HTTP fallback returns 404 (because wrong host), falls through to `EligibilityResult(false)`. |
| `SaveAsync` called | No — handler exits at eligibility gate. |
| `UpdateLastMessageAtAsync` called | No. |
| `IChatNotifier` called | No. |
| `ChatError` emitted | Yes — `ChatError.NotEligible()`. |
| 404 meaning | BFF has no `/api/v1/players/{id}/profile` route. Not a Players data issue. |
| Business rule mismatch | No — gameplay and chat both key on the same Guid and the same `IsReady` semantics. |
| Stale cache | No — cache miss just exposed the misrouted fallback. |

## Classification

- **Misconfiguration** — wrong service URL in Chat's appsettings + missing
  env var in docker-compose Chat block.
- Not an identityId/playerId mismatch.
- Not a stale cache issue.
- Not a business-rule mismatch.

## Files inspected

- `src/Kombats.Players/Kombats.Players.Api/Endpoints/PlayerProfile/GetPlayerProfileEndpoint.cs`
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileHandler.cs`
- `src/Kombats.Players/Kombats.Players.Application/UseCases/GetPlayerProfile/GetPlayerProfileQuery.cs`
- `src/Kombats.Players/Kombats.Players.Application/UseCases/EnsureCharacterExists/EnsureCharacterExistsHandler.cs`
- `src/Kombats.Players/Kombats.Players.Bootstrap/Properties/launchSettings.json`
- `src/Kombats.Common/Kombats.Abstractions/Auth/IdentityIdExtensions.cs`
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/appsettings.json`
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs`
- `src/Kombats.Chat/Kombats.Chat.Infrastructure/Services/EligibilityChecker.cs`
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/appsettings.json`
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Properties/launchSettings.json`
- `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/PlayerCard/GetPlayerCardEndpoint.cs`
- `src/Kombats.Bff/Kombats.Bff.Application/Clients/PlayersClient.cs`
- `docker-compose.yml`
- `tools/test-client/index.html`

## Files changed

- `src/Kombats.Chat/Kombats.Chat.Bootstrap/appsettings.json` — `Players:BaseUrl` changed from `http://localhost:5000` to `http://localhost:5001`.
- `docker-compose.yml` — added `Players__BaseUrl: "http://players:8080"` and a `players: service_started` depends_on entry on the `chat` service so containerized Chat also talks to Players instead of itself.

## Validation

- `dotnet build Kombats.sln` — previously green; config-only change. No source files touched in this step.
- Not live-validated from this workstation (no running stack). After restart, Chat's HTTP fallback will hit `http://localhost:5001/api/v1/players/{identityId}/profile` (Players). For a Ready player this returns 200 with `OnboardingState = "Ready"` (already fixed in the prior investigation to serialize as a string) → eligibility true → `SaveAsync` + `UpdateLastMessageAtAsync` + `BroadcastGlobalMessageAsync` run normally.

To validate on a local stack:

1. Restart Chat so the new `Players:BaseUrl` takes effect.
2. `redis-cli -n 2 FLUSHDB` to force the HTTP fallback path for the test identity.
3. From the test UI: Login → Onboard → SetName → AllocateStats → Connect Chat → JoinGlobalChat → SendGlobalMessage.
4. Expected: no `ChatError`; message appears in `chat.messages` and in UI; second client receives `GlobalMessageReceived`.
5. Expected: no `Players profile lookup ... returned non-success 404` log line for that identity.
6. Not-ready player (character created but not yet named) still gets `ChatError not_eligible` — rule preserved, now via Players returning `OnboardingState != "Ready"` instead of the misrouted 404.

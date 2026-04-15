# Kombats.Chat — Local Dev CORS Startup Fix

## Root cause

Two separate problems stacked together produced the
`Cors:AllowedOrigins must be configured in non-Development environments`
failure at local startup:

1. **No `launchSettings.json`.** `Kombats.Chat.Bootstrap` shipped without
   `Properties/launchSettings.json`, unlike Players/Matchmaking/Battle.
   Running the project via `dotnet run` (no profile) or from any IDE run
   configuration that did not explicitly set an environment therefore
   inherited `Production` as the ASP.NET Core environment, which took the
   fail-closed branch of the CORS configuration in `Program.cs`.

2. **Rider `.NET Project` run configuration had no `ASPNETCORE_ENVIRONMENT`.**
   The workspace-local Rider run config for `Kombats.Chat.Bootstrap` is a
   plain `.NET Project` configuration with no environment variables and no
   launch-profile selected. Rider picks up `launchSettings.json` profiles
   automatically only after the file is present at project open / reload
   time. If the user had an existing run config from before the profile was
   added, Rider kept running the project as `Production`.

The ambient `Cors:AllowedOrigins` value in `appsettings.json` is intentionally
`[]` for production, so startup always failed whenever Production was the
active environment.

## Files changed

- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Properties/launchSettings.json`
  *(new)* — `http` profile sets `ASPNETCORE_ENVIRONMENT=Development`,
  `applicationUrl=http://localhost:5004`, opens Scalar at `scalar/v1`.
  Matches the pattern used by Players (5001), Matchmaking (5002),
  Battle (5003).
- `src/Kombats.Chat/Kombats.Chat.Bootstrap/Program.cs` —
  - Development CORS branch now uses an explicit localhost/127.0.0.1 origin
    allow-list (3000, 5000–5004, 5173, 8080) with `AllowCredentials()` so
    SignalR and cookie-based auth flows work from the test client.
  - Added a single startup log line printing `EnvironmentName` and the
    chosen CORS branch so misconfigured run profiles are obvious from the
    first lines of output.
- `docs/execution/kombats-chat-local-dev-cors-fix.md` — this note.

Non-Development CORS branch is unchanged: missing or empty
`Cors:AllowedOrigins` still throws `InvalidOperationException` at startup.

## Exact local startup path fixed

- `dotnet run --project src/Kombats.Chat/Kombats.Chat.Bootstrap`
  — now picks up the `http` profile from `launchSettings.json`, runs as
  `Development`, Dev CORS branch applies, service starts without
  `Cors:AllowedOrigins`.
- Rider / Visual Studio launch from the **`http` launch profile** — same
  result.
- Rider run via a pre-existing `.NET Project` run config without launch
  profile — the run config must be updated once (per user, because `.idea/`
  is git-ignored). Two options:
  - **Preferred:** switch the run config type to "Launch Settings Profile"
    and select the `http` profile. Rider then uses `launchSettings.json`.
  - **Alternative:** keep the `.NET Project` config and add
    `ASPNETCORE_ENVIRONMENT=Development` under Environment Variables.
- `docker compose up chat` (main `docker-compose.yml`) — already sets
  `ASPNETCORE_ENVIRONMENT: Development` on line 116. No change required.

The startup log line (`[Kombats.Chat.Bootstrap] EnvironmentName='…' CORS
branch='…'`) makes it trivial to confirm which branch is active.

## Environment behavior after the fix

### Development (`ASPNETCORE_ENVIRONMENT=Development`)
- `Cors:AllowedOrigins` is **not required**.
- CORS allows these dev origins with any method, any header, credentials:
  - `http(s)://localhost:3000` (typical test UI)
  - `http(s)://localhost:5000..5004` (BFF + sibling services)
  - `http(s)://localhost:5173` (Vite)
  - `http(s)://localhost:8080` (Keycloak / local tools)
  - `http(s)://127.0.0.1:3000`, `http(s)://127.0.0.1:5173`
- Startup log prints: `CORS branch='Development (permissive localhost)'`.

### Non-Development (`Staging`, `Production`, or anything else)
- `Cors:AllowedOrigins` **must** be configured as a non-empty string array.
- Missing/empty → `InvalidOperationException` at startup. Fail-closed.
- Startup log prints: `CORS branch='Non-Development (Cors:AllowedOrigins required)'`.
- No production-wide allow-all path exists.

## How to run Kombats.Chat.Bootstrap locally now

1. Start the local infra stack (Postgres/Redis/RabbitMQ/Keycloak):

   ```
   docker compose -f docker-compose.local.yml up -d
   ```

2. Run the service from the repo root:

   ```
   dotnet run --project src/Kombats.Chat/Kombats.Chat.Bootstrap
   ```

   Listens on `http://localhost:5004`. Scalar at
   `http://localhost:5004/scalar/v1`. SignalR hub at `/chathub-internal`.
   Health at `/health/live` and `/health/ready`.

3. Confirm the first log line says
   `EnvironmentName='Development' CORS branch='Development (permissive localhost)'`.
   If it says anything else, the run profile is not setting
   `ASPNETCORE_ENVIRONMENT=Development` — fix the profile per "Exact local
   startup path fixed" above.

## Sample local origins (only needed outside Development)

If for any reason you must run locally as Staging/Production (e.g. to
smoke-test the non-Development branch), set:

```jsonc
// appsettings.<EnvironmentName>.json or environment variable
"Cors": {
  "AllowedOrigins": [
    "http://localhost:3000",
    "http://localhost:5000",
    "http://localhost:5004"
  ]
}
```

Do not add these to `appsettings.json` — that file is the production
baseline and must remain `"AllowedOrigins": []`.

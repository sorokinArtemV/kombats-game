# Local Development Setup — Kombats Backend

**Audience:** Developers running the Kombats backend services from an IDE (Rider, Visual Studio, VS Code) or `dotnet run` on the host machine, against containerized infrastructure.

**Scope:** Local-only setup. This document describes the **infra-in-Docker, services-on-host** workflow. The fully-containerized stack in `docker-compose.yml` is not covered here.

**Last verified against repo state:** 2026-04-11, branch `kombats_full_refactor`.

---

## 1. Prerequisites

### Required tooling

| Tool | Version | Notes |
|---|---|---|
| .NET SDK | **10.0.x** | Pinned in `global.json` with `latestPatch` roll-forward. `dotnet --version` must report 10.0.x. |
| Docker Desktop (or Docker Engine + Compose v2) | Compose v2 | `docker compose` (not `docker-compose`) |
| `dotnet-ef` CLI | Matching EF Core 10.0.3 | Install with `dotnet tool install --global dotnet-ef --version 10.0.3` (or `update` if already installed) |
| Git | any recent | |
| `curl` + `jq` (optional) | | Used in the smoke-test commands below |

### IDE assumptions

- Any IDE capable of launching a .NET 10 `Microsoft.NET.Sdk.Web` project works. Rider, Visual Studio 2022/2026, and `dotnet run` from the CLI are all supported paths.
- No IDE plugins are required.
- HTTPS dev certs are only needed if you explicitly launch the Players `https` profile. HTTP works out of the box for all services.

### OS notes

- Windows, macOS, and Linux all work. Commands in this document use POSIX shell syntax (Git Bash, WSL, or a Linux/macOS terminal).
- On Windows, paths to the repo can be either Windows-style or Git-Bash-style. The repo currently lives at `D:\Programming\Sharp\kombats-game\kombats-game` on the primary dev machine; adjust as needed.

---

## 2. Local Infrastructure Startup

### The infra-only compose file

Use `docker-compose.local.yml` at the repo root. This file contains **only** supporting infrastructure — no application services are defined. Services are expected to run on the host.

```bash
# Start (detached)
docker compose -f docker-compose.local.yml up -d

# Tail logs for all infra
docker compose -f docker-compose.local.yml logs -f

# Stop
docker compose -f docker-compose.local.yml down

# Stop AND wipe volumes (fresh state — destroys DBs and RabbitMQ data)
docker compose -f docker-compose.local.yml down -v
```

The Compose project name is `kombats-local` and containers are prefixed `kombats_local_*`, keeping this stack isolated from the main `docker-compose.yml` stack. **Only one of the two stacks can run at a time** — they bind identical host ports.

### What it brings up

| Container | Image | Host port(s) | Purpose |
|---|---|---|---|
| `kombats_local_postgres` | `postgres:16-alpine` | **5432** | Application database (`kombats`) with schema-per-service |
| `kombats_local_rabbitmq` | `rabbitmq:3.13-management` | **5672** (AMQP), **15672** (management UI) | Message broker for MassTransit |
| `kombats_local_redis` | `redis:7-alpine` | **6379** | Matchmaking (DB 1) and Battle (DB 0) working state |
| `kombats_local_keycloak_db` | `postgres:16-alpine` | **5433** | Dedicated Postgres for Keycloak |
| `kombats_local_keycloak` | `quay.io/keycloak/keycloak:26.0` | **8080** | OIDC provider (`start-dev --import-realm`) |

### Default credentials

| Service | Username | Password | Notes |
|---|---|---|---|
| Postgres (app) | `postgres` | `postgres` | DB: `kombats` |
| Postgres (Keycloak) | `keycloak` | `keycloak` | DB: `keycloak`, port `5433` |
| RabbitMQ | `guest` | `guest` | vhost `/`, management UI at http://localhost:15672 |
| Redis | — | — | No auth |
| Keycloak Admin Console | `admin` | `admin` | http://localhost:8080 |

These values match the default `appsettings.json` of every service — no connection-string overrides are needed if you use the defaults.

### Verifying infrastructure health

```bash
# Container status — all five should be "running" and (where healthchecked) "healthy"
docker compose -f docker-compose.local.yml ps

# Postgres ping
docker exec kombats_local_postgres pg_isready -U postgres
# => /var/run/postgresql:5432 - accepting connections

# RabbitMQ ping
docker exec kombats_local_rabbitmq rabbitmq-diagnostics -q ping
# => Ping succeeded

# Redis ping
docker exec kombats_local_redis redis-cli ping
# => PONG

# Keycloak (first boot takes ~30–60s)
curl -fsS http://localhost:8080/realms/master/.well-known/openid-configuration > /dev/null && echo "keycloak up"
```

If `docker compose ps` shows any container in `unhealthy` or `restarting` state, see the Troubleshooting section.

---

## 3. Configuration and Environment

### What ships in the repo

All four services have committed `appsettings.json` + `appsettings.Development.json` files with working defaults for the infra stack above. **No `.env` file, no user-secrets, no local override file is required** to run against the default local stack.

| Service | Bootstrap project | Default config of interest |
|---|---|---|
| Players | `src/Kombats.Players/Kombats.Players.Bootstrap` | Postgres → `kombats`, Keycloak authority `http://localhost:8080/realms/kombats`, RabbitMQ on `localhost:5672` |
| Matchmaking | `src/Kombats.Matchmaking/Kombats.Matchmaking.Bootstrap` | Same Postgres + Keycloak, Redis `localhost:6379` DB 1, RabbitMQ `localhost:5672`, topology prefix `matchmaking` |
| Battle | `src/Kombats.Battle/Kombats.Battle.Bootstrap` | Same Postgres + Keycloak, Redis `localhost:6379` DB 0, RabbitMQ `localhost:5672`, topology prefix `battle` |
| BFF | `src/Kombats.Bff/Kombats.Bff.Bootstrap` | Keycloak authority `http://localhost:8080/realms/kombats`, downstream HTTP: Players `:5001`, Matchmaking `:5002`, Battle `:5003` |

### Connection strings

Players / Matchmaking / Battle all share:

```
ConnectionStrings:PostgresConnection =
  Host=localhost;Port=5432;Database=kombats;Username=postgres;Password=postgres;Maximum Pool Size=20;Minimum Pool Size=5;Connection Idle Lifetime=300
```

Matchmaking and Battle additionally define:

```
ConnectionStrings:Redis = localhost:6379,abortConnect=false
```

Players does not use Redis.

### RabbitMQ

Every service has:

```jsonc
"Messaging": {
  "RabbitMq": {
    "Host": "localhost",
    "Port": 5672,
    "VirtualHost": "/",
    "Username": "guest",
    "Password": "guest"
  }
}
```

Matchmaking and Battle additionally configure `Messaging:Topology` (endpoint prefix, `combats.*` entity naming, kebab-case) — these are pre-baked in `appsettings.json`, do not change them.

### Keycloak

Every service expects:

```jsonc
"Keycloak": {
  "Authority": "http://localhost:8080/realms/kombats",
  "Audience": "kombats-api"
}
```

The realm **name is `kombats`** and the audience claim is **`kombats-api`**, injected by an `oidc-audience-mapper` attached directly to the `account` client's `protocolMappers`. Keeping the mapper on the client (rather than introducing a realm-level `clientScopes` entry) avoids replacing Keycloak's built-in client scopes on import, so access tokens retain the standard identity claims (`sub`, `preferred_username`, `email`, `realm_access`) while also carrying `aud=kombats-api`. The realm is imported automatically from `infra/keycloak/kombats-realm.json` on first boot — see section 4.

### What you may have to change

In the default case, **nothing**. Override only if:

- You run Postgres/RabbitMQ/Redis on non-default ports → edit `appsettings.Development.json` per service, or set environment variables (e.g. `ConnectionStrings__PostgresConnection`, `Messaging__RabbitMq__Host`).
- You run Keycloak behind a different hostname → override `Keycloak:Authority`.

Environment-variable overrides use the standard ASP.NET Core double-underscore convention: `Section__SubSection__Key`.

---

## 4. Keycloak Setup (automatic)

The `kombats` realm is bootstrapped automatically on first boot. `docker-compose.local.yml` mounts `./infra/keycloak` into `/opt/keycloak/data/import`, Keycloak starts with `start-dev --import-realm`, and `infra/keycloak/kombats-realm.json` is imported as the `kombats` realm. No admin-console clicking is required for a fresh stack.

### What the import provisions

| Artifact | Value |
|---|---|
| Realm | `kombats` |
| SSL required | `none` (local dev only) |
| Self-registration | **Enabled** (`registrationAllowed: true`) |
| Password reset / remember me | Enabled |
| Client | `account` (Keycloak built-in, overridden) |
| Client type | Public (`publicClient: true`, no secret) |
| Client flows | Standard flow **and** Direct Access Grants (ROPC) |
| Client redirect URIs | `/realms/kombats/account/*`, `http://localhost:5000/*`, `http://localhost:5173/*`, `http://localhost:3000/*`, `http://127.0.0.1:5500/*` |
| Client web origins | `+` plus the above hosts and `*` (local dev only) |

The `account` client is the built-in Keycloak Account Console client. The realm import overrides it to enable **Direct Access Grants**, which is what `tools/test-client/index.html` uses (`grant_type=password`, `client_id=account`). The client also carries an inline `oidc-audience-mapper` (`protocolMappers` on the client itself, not a separate realm client scope) that stamps `aud=kombats-api` onto every issued access token — which is what every Kombats service validates (`Keycloak:Audience: "kombats-api"` in each `appsettings.json`).

### Pre-provisioned test users

All four users are created with password **`password`** (plain, non-temporary, email verified). **Strictly local-dev only.**

| Username | Email | Password |
|---|---|---|
| `artem`  | `artem@kombats.local`  | `password` |
| `polina` | `polina@kombats.local` | `password` |
| `alice`  | `alice@kombats.local`  | `password` |
| `jun`    | `jun@kombats.local`    | `password` |

### Self-registration

The realm is imported with `registrationAllowed: true`, so developers can create additional local accounts without touching the admin console.

1. Open any Keycloak login page that is driven by the `account` client, for example:
   - http://localhost:8080/realms/kombats/account/ (Account Console; click **Sign in**)
   - or the test client's login screen, which redirects to the same token endpoint.
2. Click **Register** on the Keycloak login page.
3. Fill in username, email, first/last name, and password. No admin approval is needed (`verifyEmail: false`, email server not configured).
4. The new user can immediately acquire a token via the direct-grant endpoint:
   ```bash
   curl -s -X POST "http://localhost:8080/realms/kombats/protocol/openid-connect/token" \
     -d "client_id=account" \
     -d "grant_type=password" \
     -d "username=<new-user>" \
     -d "password=<new-password>"
   ```

Note: the `tools/test-client/index.html` UI does not expose a "Register" button; it only drives the direct-grant endpoint. For self-registration, use the Keycloak-hosted Account Console login page as described above, then come back to the test client and log in with the new credentials.

### Persistence and re-import

- The `keycloak_db` Docker volume persists the imported realm across `docker compose down` / `up -d`. You do not need to re-import on every restart.
- After `docker compose down -v` (volume wipe), the next `up -d` will re-import `kombats-realm.json` automatically.
- **Editing `kombats-realm.json` after the first import has no effect on an existing database.** To pick up realm changes, either wipe the Keycloak volume (`docker compose -f docker-compose.local.yml down -v`) or apply the change manually in the admin console.

### Token flow

- Frontend or test client → Keycloak `/realms/kombats/protocol/openid-connect/token` → bearer access token.
- Client sends `Authorization: Bearer <token>` to **BFF** (`http://localhost:5000`) — BFF validates the token against Keycloak.
- BFF forwards calls to Players/Matchmaking/Battle. The backend services also re-validate the JWT on each hop (each has `AddKombatsAuth` wired up in its `Program.cs`).
- `sub` claim → `playerId` (stable UUID generated by Keycloak); services do not maintain a separate user table keyed on anything else.

### Known local-dev limitations

- Passwords are committed in plaintext in `kombats-realm.json`. This is intentional for local dev and must never be reused in any non-local environment.
- Web origins include `*` for developer convenience. Do not copy this realm into any deployed environment.
- No email server is configured: password reset emails go nowhere, and `verifyEmail` is off.
- There is no dev auth bypass middleware. All requests must carry a real JWT or be to health endpoints.

---

## 5. Database and Migrations

### Expected database layout

- **Database:** `kombats` (created by the Postgres container's `POSTGRES_DB` env var on first boot).
- **Schemas:** `players`, `matchmaking`, `battle`. Each service owns its schema exclusively. Schemas are created by the EF Core migrations, not by any init SQL — `infra/postgres/init/` is empty and is reserved for future seed data.
- **Outbox/inbox tables** live inside each service's own schema (MassTransit EF Core outbox).

### Migrations are manual in local dev

Per AD-13, services **do not run `Database.MigrateAsync()` on startup**. Every `Program.cs` has an explicit comment to that effect. If you start a service before applying migrations, it will crash on first DB access with a "relation does not exist" error.

The repo ships a helper script:

```bash
# Applies Players → Matchmaking → Battle migrations against the default local connection
./scripts/run-migrations.sh
```

On Windows, run it from Git Bash / WSL, or translate it to the equivalent `dotnet ef` calls.

### Equivalent manual `dotnet ef` commands

```bash
# Players
dotnet ef database update \
  --startup-project src/Kombats.Players/Kombats.Players.Bootstrap \
  --project        src/Kombats.Players/Kombats.Players.Infrastructure

# Matchmaking
dotnet ef database update \
  --startup-project src/Kombats.Matchmaking/Kombats.Matchmaking.Bootstrap \
  --project        src/Kombats.Matchmaking/Kombats.Matchmaking.Infrastructure

# Battle
dotnet ef database update \
  --startup-project src/Kombats.Battle/Kombats.Battle.Bootstrap \
  --project        src/Kombats.Battle/Kombats.Battle.Infrastructure
```

### Committed migrations (current state)

- **Players:** `20260404055607_Baseline`, `20260407054312_AddOutboxEntities`
- **Matchmaking:** `20260404055616_Baseline`, `20260408062301_RemoveLegacyCustomOutboxTable`
- **Battle:** `20260404055612_Baseline`

Re-run `run-migrations.sh` any time a new migration lands on the branch.

### Verifying the schema

```bash
docker exec -it kombats_local_postgres psql -U postgres -d kombats -c '\dn'
# Expect at least: players, matchmaking, battle (plus public)

docker exec -it kombats_local_postgres psql -U postgres -d kombats -c '\dt players.*'
docker exec -it kombats_local_postgres psql -U postgres -d kombats -c '\dt matchmaking.*'
docker exec -it kombats_local_postgres psql -U postgres -d kombats -c '\dt battle.*'
```

---

## 6. Running Services Locally

### Startup projects (IMPORTANT)

For every service, the **Bootstrap** project is the sole composition root and the only project you run. Api is a plain class library in the target architecture — never start it directly.

| Service | Startup project (the one you `dotnet run` or set as IDE startup) |
|---|---|
| Players | `src/Kombats.Players/Kombats.Players.Bootstrap` |
| Matchmaking | `src/Kombats.Matchmaking/Kombats.Matchmaking.Bootstrap` |
| Battle | `src/Kombats.Battle/Kombats.Battle.Bootstrap` |
| BFF | `src/Kombats.Bff/Kombats.Bff.Bootstrap` |

### Port convention expected by BFF

BFF's `appsettings.json` (`Services:*:BaseUrl`) hard-codes downstream HTTP targets:

| Service | Expected URL |
|---|---|
| Players | `http://localhost:5001` |
| Matchmaking | `http://localhost:5002` |
| Battle | `http://localhost:5003` |
| BFF (itself) | `http://localhost:5000` |

### launchSettings.json — committed for all Bootstrap projects

Every Bootstrap project now ships a single committed `Properties/launchSettings.json` with one `http` profile, `ASPNETCORE_ENVIRONMENT=Development`, and the repo-aligned port:

| Project | applicationUrl |
|---|---|
| `Kombats.Players.Bootstrap` | `http://localhost:5001` |
| `Kombats.Matchmaking.Bootstrap` | `http://localhost:5002` |
| `Kombats.Battle.Bootstrap` | `http://localhost:5003` |
| `Kombats.Bff.Bootstrap` | `http://localhost:5000` |

Running `dotnet run --project <Bootstrap>` or hitting the green "Run" button in Rider / Visual Studio binds the service to the port BFF already expects via `Services:<Name>:BaseUrl`. No `ASPNETCORE_URLS` override is needed for the default flow. Each profile opens `scalar/v1` in the browser on start (`launchBrowser: true`).

If you still want to override for a one-off run:

```bash
ASPNETCORE_URLS=http://localhost:9999 \
  dotnet run --project src/Kombats.Players/Kombats.Players.Bootstrap
```

### Dependency / order considerations

Minimal startup order for a full local run:

1. `docker compose -f docker-compose.local.yml up -d` (infra) — **required first**.
2. Apply migrations (section 5) — **required before any service starts**.
3. Keycloak `kombats` realm is imported automatically on first boot from `infra/keycloak/kombats-realm.json` (section 4). No manual step.
4. Start **Players**, **Matchmaking**, **Battle** (order among these three does not matter; MassTransit consumers bind to RabbitMQ topology on startup).
5. Start **BFF** last (its `HttpClient` endpoints expect the three downstream services to be reachable, though it will still boot if they are down — the failures show up at request time).

### What each service exposes

| Service | HTTP surface | Notes |
|---|---|---|
| Players | Minimal API endpoints under `/api/*`, OpenAPI at `/openapi/v1.json`, Scalar at `/scalar/v1`, `/health/live`, `/health/ready` | Resource server — all `/api/*` require Bearer JWT |
| Matchmaking | Minimal API endpoints, OpenAPI + Scalar, `/health/live`, `/health/ready` | Also runs hosted workers: matching tick worker, timeout worker |
| Battle | Minimal API endpoints, OpenAPI + Scalar, `/health/live`, `/health/ready`, SignalR hub for realtime | Also runs recovery worker + turn deadline worker |
| BFF | Product-facing Minimal API endpoints, OpenAPI at `/openapi/v1.json`, Scalar at `/scalar/v1`, SignalR relay at `/battlehub` | All endpoints `[Authorize]`, CORS enabled |

### HTTPS

Only Players has an `https` launch profile (`:7035`). For local dev, HTTP is sufficient everywhere. BFF's `Program.cs` calls `UseHttpsRedirection()` — if you hit it over HTTP without setting an HTTPS port, the redirect will fail and return a 307 or a warning in the logs. The easiest workaround is to use the BFF `ASPNETCORE_URLS=http://localhost:5000` and just consume HTTP. If you want HTTPS, bind an additional HTTPS URL and trust the dev cert via `dotnet dev-certs https --trust`.

---

## 7. Local Verification / Smoke Testing

### 1) Health endpoints (no auth)

```bash
curl -fsS http://localhost:5001/health/ready && echo       # Players
curl -fsS http://localhost:5002/health/ready && echo       # Matchmaking
curl -fsS http://localhost:5003/health/ready && echo       # Battle
```

`/health/live` is an anonymous liveness probe that returns 200 with an empty check set. `/health/ready` runs the registered readiness checks (DB, RabbitMQ, etc.) and returns 200 Healthy or 503 Unhealthy.

BFF does not register health endpoints in the current code (`Program.cs` has no `MapHealthChecks` call) — verify BFF by hitting Scalar or a known endpoint.

### 2) OpenAPI / Scalar

Once running, browse:

- Players: http://localhost:5001/scalar/v1
- Matchmaking: http://localhost:5002/scalar/v1
- Battle: http://localhost:5003/scalar/v1
- BFF: http://localhost:5000/scalar/v1

### 3) Basic auth verification

```bash
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/kombats/protocol/openid-connect/token" \
  -d "client_id=account" \
  -d "grant_type=password" \
  -d "username=artem" \
  -d "password=password" | jq -r .access_token)

echo "$TOKEN" | cut -c1-40   # sanity — should look like a JWT

# Expected 401 without token, 200 with token (exact Players endpoint depends on current routes)
curl -i http://localhost:5001/api/me
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/me
```

If the token endpoint returns `invalid_client`, the `account` client override did not take effect (most likely because the realm was created before `kombats-realm.json` was committed). Wipe the Keycloak volume with `docker compose -f docker-compose.local.yml down -v` and bring the stack back up to force a re-import.

### 4) Messaging / Redis / DB sanity

```bash
# RabbitMQ management UI — log in guest/guest
open http://localhost:15672        # macOS; on Linux use xdg-open; on Windows open in browser

# Verify MassTransit exchanges/queues exist after services start
# Exchanges named combats.<event-name>, queues named <prefix>-<consumer> (matchmaking / battle prefixes)

# Redis
docker exec -it kombats_local_redis redis-cli
# > SELECT 0     # Battle DB
# > KEYS *
# > SELECT 1     # Matchmaking DB
# > KEYS *
# > QUIT

# Postgres
docker exec -it kombats_local_postgres psql -U postgres -d kombats
# \dn   — list schemas
# \dt players.*
# \dt matchmaking.*
# \dt battle.*
```

### 5) End-to-end happy path (manual)

There is no bundled end-to-end test client in the repo. A practical manual flow is:

1. Acquire a token (step 3).
2. Hit a Players endpoint through BFF to trigger character creation.
3. Enqueue via a Matchmaking endpoint through BFF.
4. Observe `combats.player-combat-profile-changed` and battle lifecycle events in the RabbitMQ management UI.
5. Observe battle state in Redis DB 0 and persisted rows in `battle.*` tables.

Phase 7B end-to-end topology smoke tests are planned but not yet delivered.

---

## 8. Troubleshooting

### Infra not started / services refuse to start

**Symptom:** `Connection refused` to localhost:5432 / 5672 / 6379 / 8080 at service startup.
**Fix:** `docker compose -f docker-compose.local.yml ps` — make sure all containers are `Up` and `healthy`. Keycloak takes 30–60 seconds on first boot.

### "relation ... does not exist" on service startup

**Symptom:** Service starts, then crashes on first DB call (usually at a consumer or query handler) with an EF error referencing a non-existent table or schema.
**Root cause:** Migrations were not applied.
**Fix:** Run `./scripts/run-migrations.sh` (or the equivalent `dotnet ef database update` commands in section 5) and restart the service.

### 401 on every `/api/*` call

**Possible causes:**

- No realm bootstrapped — services can't fetch OIDC metadata from `http://localhost:8080/realms/kombats/.well-known/openid-configuration`. Check that the realm `kombats` exists.
- Wrong audience — the token was issued for an audience other than `account`. Inspect the token at https://jwt.io and verify `aud` contains `account`.
- Clock skew — unlikely locally, but `exp`/`nbf` outside tolerance causes 401. Use a freshly-issued token.
- `Keycloak:Authority` points to a host the service cannot reach (e.g. `keycloak:8080` from inside another container vs. `localhost:8080` from the host). From host-run services, it must be `localhost:8080`.

### RabbitMQ connectivity errors at service startup

**Symptom:** `BrokerUnreachableException` or MassTransit retry loop.
**Fix:** Check `docker compose logs rabbitmq`. On a freshly-booted stack, RabbitMQ takes ~10s to accept AMQP connections; the services' MassTransit retry policy (5 attempts, 200ms–5000ms exponential) usually absorbs this. If it persists, confirm port 5672 is not occupied by another process (`lsof -i :5672` / `netstat -an | findstr 5672`).

### Redis connectivity errors

**Symptom:** `RedisConnectionException` in Matchmaking or Battle logs.
**Fix:** Confirm `docker exec kombats_local_redis redis-cli ping` returns `PONG`. Confirm the service's `ConnectionStrings:Redis` resolves to `localhost:6379,abortConnect=false`. Only Matchmaking and Battle use Redis; Players does not.

### BFF returns 5xx when downstream services are up

**Possible causes:**

- Port mismatch — BFF expects `5001/5002/5003` but you started the services on different ports. Fix the `ASPNETCORE_URLS` for each service or override `Services:*:BaseUrl` in BFF's `appsettings.Development.json`.
- Downstream service bound to HTTPS only — BFF's `Services:*:BaseUrl` is `http://`. Ensure each backend service is listening on HTTP.
- HTTPS redirect loop from BFF itself — BFF calls `UseHttpsRedirection()`. If you launched BFF bound only to HTTP without an HTTPS port, `UseHttpsRedirection` logs a warning and disables itself, which is fine; but if you launched it bound only to HTTPS without a trusted dev cert, browsers and `curl` will fail. Simplest fix: `ASPNETCORE_URLS=http://localhost:5000`.

### Port conflicts

**Symptom:** `docker compose up` fails with `address already in use`, or services fail with `Failed to bind to address http://localhost:NNNN`.
**Fix:** Identify the holder (`lsof -i :<port>` / `Get-NetTCPConnection -LocalPort <port>` on PowerShell). The usual culprit is the other compose stack (`docker-compose.yml`) still running — `docker compose down` the other stack first.

### Keycloak realm disappeared

**Cause:** You ran `docker compose -f docker-compose.local.yml down -v` and wiped `keycloak_db`.
**Fix:** Start the stack again — `kombats-realm.json` is re-imported automatically on the next boot. No manual steps.

### MassTransit topology drift / leftover queues

**Symptom:** Consumers not receiving messages, or messages piling in unexpected queues.
**Fix:** Open the RabbitMQ management UI (http://localhost:15672, guest/guest), navigate to Exchanges/Queues. Topology naming is deterministic — exchanges are `combats.<event-name>`, queues are `<prefix>-<consumer-name>` where prefix is `matchmaking` or `battle`. If leftover queues from a previous run conflict with the current topology, delete them via the UI or `docker compose -f docker-compose.local.yml down -v` and restart.

### Service binding to an unexpected port

Every Bootstrap project ships a `Properties/launchSettings.json` with a single `http` profile on the correct port. If a service binds somewhere else, you probably have an `ASPNETCORE_URLS` environment variable set in your shell that overrides the profile — `unset ASPNETCORE_URLS` and relaunch.

---

## 9. Current Limitations and Manual Steps

The following are **not automated** in the current repo state and require developer action. They are known gaps tracked implicitly in the execution log or hardening backlog, not defects in this runbook:

1. **Keycloak realm bootstrap is automatic** via `infra/keycloak/kombats-realm.json` (realm `kombats`, `account` client with direct grants, test users `artem` / `polina` / `alice` / `jun`, all password `password`, self-registration enabled). Re-imports only happen on a fresh `keycloak_db` volume.
2. **`launchSettings.json` committed for all four Bootstrap projects** (`http` profile only, Development environment, ports `5000` BFF / `5001` Players / `5002` Matchmaking / `5003` Battle — matches BFF's `Services:*:BaseUrl`). No `ASPNETCORE_URLS` override needed for the default flow.
3. **Migrations do not run on startup** (AD-13). You must run `./scripts/run-migrations.sh` (or equivalent) manually after `up -d` on a fresh stack.
4. **No seed data for Postgres.** `infra/postgres/init/` is empty. Characters, matches, battles are all created through real application flows.
5. **No BFF health endpoint.** BFF's `Program.cs` does not call `MapHealthChecks`. Use Scalar or any known endpoint to confirm it is up.
6. **No dev auth bypass middleware.** Every `/api/*` call needs a real Keycloak-issued JWT. There is no shortcut.
7. **`docker-compose.yml` and `docker-compose.local.yml` collide on host ports.** Run at most one at a time.
8. **Legacy naming artifact.** The repo still contains `Kombats.Shared` (legacy) under `src/Kombats.Players/`. Tracked for removal; does not affect local runs.
9. **No end-to-end test client.** Phase 7B topology smoke tests are planned but not yet present.
10. **OpenTelemetry OTLP endpoint is blank by default.** `"OtlpEndpoint": ""` disables export. If you want to export traces locally, set `OpenTelemetry:OtlpEndpoint` to your collector URL; no collector container ships with the local stack.

---

## Appendix A — Quick-start cheat sheet

```bash
# 1. Start infra
docker compose -f docker-compose.local.yml up -d

# 2. Apply migrations
./scripts/run-migrations.sh

# 3. Keycloak realm `kombats` is imported automatically from
#    infra/keycloak/kombats-realm.json — no manual step.
#    Test users: artem / polina / alice / jun (all password: password)

# 4. Start services (four terminals, or IDE run configs)
ASPNETCORE_URLS=http://localhost:5001 dotnet run --project src/Kombats.Players/Kombats.Players.Bootstrap
ASPNETCORE_URLS=http://localhost:5002 dotnet run --project src/Kombats.Matchmaking/Kombats.Matchmaking.Bootstrap
ASPNETCORE_URLS=http://localhost:5003 dotnet run --project src/Kombats.Battle/Kombats.Battle.Bootstrap
ASPNETCORE_URLS=http://localhost:5000 dotnet run --project src/Kombats.Bff/Kombats.Bff.Bootstrap

# 5. Smoke test
curl -fsS http://localhost:5001/health/ready
curl -fsS http://localhost:5002/health/ready
curl -fsS http://localhost:5003/health/ready
open http://localhost:5000/scalar/v1
```

## Appendix B — Port reference

| Port | Owner | Protocol |
|---|---|---|
| 5000 | BFF | HTTP (recommended) |
| 5001 | Players | HTTP |
| 5002 | Matchmaking | HTTP |
| 5003 | Battle | HTTP |
| 5432 | Postgres (app) | TCP |
| 5433 | Postgres (Keycloak) | TCP |
| 5672 | RabbitMQ AMQP | TCP |
| 6379 | Redis | TCP |
| 8080 | Keycloak | HTTP |
| 15672 | RabbitMQ management UI | HTTP |

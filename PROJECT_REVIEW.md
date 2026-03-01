# Kombats Players Service — Architectural & Code Quality Audit

**Date:** 2026-03-01
**Scope:** `Kombats.Players` solution (Api, Application, Domain, Infrastructure) + `Kombats.Shared`
**Context:** Turn-based multiplayer game backend, evaluated as a production MVP — not an enterprise banking system.

---

## 1. Executive Summary

### Overall Maturity Level: **Mid-to-Senior** (not yet production-ready)

The codebase demonstrates strong fundamentals: clean architecture layering, a well-encapsulated domain model, proper use of the Result pattern, optimistic concurrency, and structured logging. The author clearly understands .NET idioms and has made pragmatic choices throughout. However, there are several concrete bugs, a critical security gap (CORS), zero test coverage, and a missing database constraint that creates a real race condition. These must be fixed before real users touch this system.

### Strengths
- Clean Architecture correctly applied — Domain has zero external dependencies
- `Character` aggregate is properly encapsulated (private setters, factory method, state machine)
- Optimistic concurrency via `Revision` property + EF Core concurrency token + application-level fast-fail
- Idempotent character provisioning (`EnsureCharacterExists`) with proper race-condition handling
- Result pattern used consistently from handlers through to HTTP responses
- Structured error codes (`"AllocateStatPoints.RevisionMismatch"`) — excellent for game client integration
- ProblemDetails responses throughout — proper HTTP API design
- Serilog + OpenTelemetry infrastructure already wired (just needs enabling)

### Biggest Risks
1. **No unique index on `name`** — character name uniqueness has a real TOCTOU race condition
2. **CORS is wide open** (`AllowAnyOrigin + AllowAnyMethod + AllowAnyHeader`) — unacceptable for production
3. **Zero test coverage** — no unit, integration, or API tests exist
4. **`Revision` starts at 3 in `CreateDraft`** — almost certainly a bug, will confuse every client developer
5. **Application layer directly references `Microsoft.EntityFrameworkCore`** — leaky abstraction

---

## 2. Architecture Review

### Layering

The project follows textbook Clean Architecture:

```
Domain (zero deps) ← Application (Domain, Shared) ← Infrastructure (App, Domain) ← API (all)
```

**Verdict:** Correct. The dependency flow is inward. Domain has no NuGet packages at all — this is exactly right.

### Separation of Concerns

| Layer | Responsibility | Assessment |
|-------|---------------|------------|
| **Domain** | Entities, state machine, invariants | Clean. 3 files, no leaks |
| **Application** | Use cases, abstractions, result types | Good, with one leak (see below) |
| **Infrastructure** | EF Core, repositories, DB config | Appropriate |
| **API** | Endpoints, validation, auth, DTOs | Functional, some duplication |
| **Shared** | Cross-cutting (Result, OTel, MassTransit, logging) | Too broad — grab-bag risk |

### Dependency Flow Issue

`Kombats.Players.Application.csproj` references:
```xml
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.3"/>
<PackageReference Include="Npgsql" Version="10.0.1"/>
```

Handlers catch `DbUpdateConcurrencyException` and `DbUpdateException` directly. This is a pragmatic shortcut — the alternative (a custom `IConcurrencyException` wrapper) would be overengineered for this project size. **But the `Npgsql` reference is unnecessary and should be removed.** There's no direct Npgsql usage in the Application layer.

### Overengineering vs Underengineering

| Area | Verdict |
|------|---------|
| Command/Handler pattern (no MediatR) | Just right |
| Scrutor assembly scanning for handlers | Just right |
| LoggingDecorator via Scrutor | Just right |
| Result pattern instead of exceptions | Just right |
| IUnitOfWork abstraction | Just right |
| Inbox pattern scaffolding | Slightly premature (not used yet), but harmless |
| IQuery/IQueryHandler interfaces | Unused — dead code in Shared |
| Shared library scope | Under-separated — MassTransit + OTel + Result types all in one project |

---

## 3. Domain Model

### Character Aggregate — `Character.cs`

**Encapsulation:** Excellent. Private constructor, private setters, factory method (`CreateDraft`), and mutation methods (`SetNameOnce`, `AllocatePoints`). EF Core is properly kept out via the private parameterless constructor.

**State Machine:**

```
Draft (no name) → Named (name set via SetNameOnce) → Ready (stats allocated at least once)
```

The transitions are correctly guarded:
- `SetNameOnce` only works in `Draft` state
- `AllocatePoints` only works in `Named` or `Ready` state
- States are one-directional (no going back)

### Issues Found

**BUG — `Revision` starts at 3:**

```csharp
// Character.cs, CreateDraft()
Revision = 3,   // Why 3? Should be 0 or 1
```

Every stat starts at 3 (`Strength = 3, Agility = 3`, etc.) and `UnspentPoints = 3`. The `Revision = 3` looks like a copy-paste error from the stat block. Clients will send `ExpectedRevision: 3` for a brand-new character, which is confusing. **This should be `1` (or `0`).**

**Side effect in domain methods:**

```csharp
Updated = DateTimeOffset.UtcNow;  // in SetNameOnce() and AllocatePoints()
```

The domain entity calls `DateTimeOffset.UtcNow` directly. This makes the entity non-deterministic and harder to unit test. `CreateDraft` correctly accepts `DateTimeOffset occurredAt` as a parameter — the mutation methods should do the same for consistency.

**Name validation duplication:**

The domain (`Character.SetNameOnce`) validates `name.Length >= 3 && name.Length <= 16`. The API validator (`SetCharacterNameRequestValidator`) validates the same. This is fine as defense-in-depth, but the domain should be the canonical source. Currently the trim logic differs subtly: the domain trims then validates, the validator checks `n.Trim().Length` — these are equivalent, but having one canonical place would be cleaner.

### DomainException

```csharp
public sealed class DomainException : Exception
{
    public string Code { get; }
}
```

Pragmatic and correct for this scale. The stable error codes (`"InvalidState"`, `"NameAlreadySet"`, `"NegativePoints"`) map cleanly to `Result.Failure` in handlers. No issues.

### Concurrency Handling

The `Revision` property is configured as an EF Core concurrency token:

```csharp
b.Property(x => x.Revision).IsRequired().IsConcurrencyToken();
```

Combined with application-level fast-fail (`character.Revision != cmd.ExpectedRevision`) and a `DbUpdateConcurrencyException` catch in the handler, this is a solid two-layer defense. Well done.

---

## 4. Application Layer

### Use Case Design

Four use cases, all following the same pattern:

| Use Case | Type | Assessment |
|----------|------|------------|
| `EnsureCharacterExists` | Command | Correct — has side effects |
| `SetCharacterName` | Command | Correct |
| `AllocateStatPoints` | Command | Correct |
| `GetMe` | Command (but is a query) | **Wrong semantic** |

**`GetMeHandler` implements `ICommandHandler` but performs no writes.** It should implement `IQueryHandler<GetMeQuery, CharacterStateResult>`. The interfaces exist in Shared (`IQuery`, `IQueryHandler`) but are unused. This matters because the `LoggingDecorator` wraps all command handlers — `GetMe` will get command-level logging and potential future write-oriented cross-cutting concerns applied to a read-only operation.

### Result Pattern Usage

Excellent. Every handler returns `Result<T>` or `Result`. Error codes are namespaced (`"AllocateStatPoints.CharacterNotFound"`) which is perfect for a game client that needs to show different UI states based on the error. The `CustomResults.Problem()` mapper translates `ErrorType` to HTTP status codes consistently.

### Validation Approach

Two layers:
1. **API layer:** FluentValidation + `RequestValidationFilter<T>` endpoint filter — validates shape/format
2. **Domain layer:** `DomainException` for business rules — validates invariants

This is correct. The API catches garbage input early; the domain protects its own invariants regardless of caller.

### Error Modeling

The `Error` record with `ErrorType` enum maps to HTTP status codes via `CustomResults`:

| ErrorType | HTTP Status |
|-----------|-------------|
| Validation | 400 |
| Problem | 400 |
| NotFound | 404 |
| Conflict | 409 |
| Failure | 500 |

**Issue:** `ErrorType.Problem` maps to 400 Bad Request, but semantically "Problem" suggests a server-side issue. This could be confusing. Consider renaming it to `BusinessRule` or `DomainViolation` to clarify it's a client-recoverable error, or mapping it to 422 Unprocessable Entity.

### Idempotency Handling

`EnsureCharacterExistsHandler` is a model example:

```csharp
// Try to create
await _uow.SaveChangesAsync(ct);
// If unique constraint on identity_id fires → re-read and return
catch (DbUpdateException)
{
    var race = await _characters.GetByIdentityIdAsync(cmd.IdentityId, ct);
    ...
}
```

This is correct and handles the "two tabs hit ensure simultaneously" scenario. However, the re-read after `DbUpdateException` may fail if the DbContext is in a faulted state. EF Core detaches the failed entity, but depending on the provider behavior, a fresh `DbContext` scope might be safer. **In practice this works with Npgsql/PostgreSQL — just be aware of it.**

---

## 5. Infrastructure

### EF Core Configuration Quality

`CharacterConfig.cs` is clean and explicit:
- Primary key, column names, max lengths all specified
- `IdentityId` has a unique index
- `OnboardingState` stored as `int` (correct for enums)
- `Revision` configured as concurrency token
- Snake case naming convention applied globally

**No issues with the configuration itself.**

### Missing Index — CRITICAL

There is **no unique index on `name`** (or `LOWER(TRIM(name))`). The `IsNameTakenAsync` check-then-act in `SetCharacterNameHandler` has a classic TOCTOU race condition:

1. Request A checks name "CoolPlayer" → not taken
2. Request B checks name "CoolPlayer" → not taken
3. Request A saves → success
4. Request B saves → success → **duplicate name in database**

**Fix:** Add a unique filtered index on the normalized name:

```sql
CREATE UNIQUE INDEX ix_characters_name_lower
ON players.characters (LOWER(TRIM(name)))
WHERE name IS NOT NULL;
```

And catch `DbUpdateException` in the handler to return a conflict result (similar to `EnsureCharacterExists`).

### `IsNameTakenAsync` — Raw SQL Fragility

```csharp
var count = await _db.Characters
    .FromSqlRaw(
        @"SELECT id, identity_id, name, strength, agility, intuition, ...
          FROM players.characters
          WHERE name IS NOT NULL AND LOWER(TRIM(name)) = {0} AND ({1} IS NULL OR id <> {1})",
        normalizedName,
        (object?)excludeCharacterId ?? DBNull.Value)
    .CountAsync(ct);
```

Problems:
1. **Selects all columns** just to count — wasteful
2. **Fragile:** If columns are added/renamed, this raw SQL breaks silently
3. **Unnecessary:** This can be done with LINQ: `.Where(c => c.Name != null && c.Name.ToLower().Trim() == normalizedName && c.Id != excludeId).AnyAsync(ct)` — EF Core + Npgsql translates `ToLower()` to `LOWER()` correctly.

### Transaction Handling

There's no explicit transaction management. Each `SaveChangesAsync` is a single database round-trip. For the current use cases (single aggregate mutation), this is correct — EF Core wraps `SaveChanges` in an implicit transaction. If multi-aggregate operations are added later, explicit `IDbContextTransaction` usage will be needed.

### Repository Abstraction Quality

`CharacterRepository` is thin and appropriate. `AddAsync` is synchronous (returns `Task.CompletedTask`) which is slightly misleading but standard for EF Core's `Add` being synchronous. No issues.

### DB Schema Design

The migration produces a clean schema:
- `players.characters` with UUID PK, unique index on `identity_id`
- `players.inbox_messages` with UUID PK
- Snake case naming throughout
- Proper types (uuid, integer, timestamptz)

**Missing:** Index on `name` (as discussed). Consider adding an index on `onboarding_state` if you'll ever query "all characters in Ready state" for matchmaking.

---

## 6. API Layer

### Endpoint Structure

Uses minimal APIs with an `IEndpoint` interface and assembly scanning — a clean and common pattern. Endpoints are organized in feature folders.

### Duplicate Endpoints — Unnecessary

Two endpoints do the exact same thing:
- `POST api/v1/players/me/stats/allocate` (`AllocateStatPointsEndpoint`)
- `POST api/character/stats` (`CharacterStatsEndpoint`)

The code in `CharacterStatsEndpoint` is a copy-paste of `AllocateStatPointsEndpoint`. **Delete one.** If both routes are needed, use a single endpoint class that registers both routes.

### Inconsistent URL Versioning

- `api/v1/players/me/stats/allocate` — versioned, RESTful
- `api/character/name` — unversioned
- `api/me` — unversioned
- `api/me/ensure` — unversioned

**Pick one scheme and apply it everywhere.** For a game backend, a consistent prefix like `api/v1/players/...` is recommended so you can evolve the API without breaking clients.

### HTTP Semantics

| Endpoint | Method | Status | Assessment |
|----------|--------|--------|------------|
| GET /api/me | GET | 200/404 | Correct |
| POST /api/me/ensure | POST | 200 | Debatable — 201 on creation would be more precise, but 200 is acceptable for idempotent ensure |
| POST /api/character/name | POST | 200 | Should be PUT (setting a resource property) or PATCH |
| POST /api/.../allocate | POST | 200 | Correct — this is an action, not CRUD |
| GET /api/me/claims | GET | 200 | Correct but should not exist in production |

### Auth Integration

`ICurrentIdentityProvider` / `HttpCurrentIdentityProvider` is a clean abstraction. The identity extraction from JWT is correct, checking both `sub` and `ClaimTypes.NameIdentifier`. However, every endpoint manually calls `identityProvider.GetRequired()` and handles the failure case with identical boilerplate:

```csharp
var identityResult = identityProvider.GetRequired();
if (identityResult.IsFailure)
{
    return Results.Problem(...401...);
}
```

This is repeated 4 times. **Extract this into an endpoint filter** (similar to `RequestValidationFilter`) that runs before the handler and injects `CurrentIdentity` directly, or returns 401.

### DTO Separation

`MeResponse`, `AllocateStatPointsRequest/Response`, `SetCharacterNameRequest` — all properly separated from domain types. No domain entities are exposed directly. Good.

### Overexposed Internals

- `MeResponse` includes `IdentityId` (Keycloak subject UUID). Game clients generally don't need this — it leaks auth infrastructure details. Consider removing it or replacing with `CharacterId` only.
- `GET /api/me/claims` dumps all JWT claims. **Must be removed or restricted to development environment only.**

---

## 7. Security

### JWT Validation

The JWT Bearer configuration is correct for Keycloak:
- Validates issuer, audience, lifetime
- Authority points to Keycloak realm URL
- `MapInboundClaims = false` in the post-configure (prevents claim type remapping)

**However:** There's a dual configuration issue. `AddJwtAuthentication` configures JWT options inline, AND there's a `ConfigureJwtBearerOptions : IPostConfigureOptions<JwtBearerOptions>` class that reconfigures everything — but **this class is never registered in DI**. It's dead code. The inline configuration doesn't set `MapInboundClaims = false` or `ValidateIssuerSigningKey = true`, which the dead post-configure class does. This means:
- `MapInboundClaims` defaults to `true` — .NET may remap `sub` to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier`, which your `GetSubjectId()` extension handles by checking both. But it's a fragile fallback.
- `ValidateIssuerSigningKey` is not explicitly set to `true` (though the JwtBearer middleware validates signatures by default when Authority is set).

**Fix:** Either register `ConfigureJwtBearerOptions` in DI, or delete it and add `MapInboundClaims = false` to the inline configuration.

### CORS — CRITICAL

```csharp
options.AddDefaultPolicy(policy =>
{
    policy.AllowAnyOrigin()
        .AllowAnyMethod()
        .AllowAnyHeader();
});
```

This allows any website on the internet to make authenticated requests to your API (assuming the JWT is available). **For production, restrict origins to your game client domain(s).** At minimum, make this configurable per environment.

### Missing Protections

- **No rate limiting** — a single user can spam `POST /api/character/stats` thousands of times per second. Use `Microsoft.AspNetCore.RateLimiting` with a per-user policy.
- **No global exception handler** — unhandled exceptions will return a default 500 response that may leak stack traces in development mode. Add `app.UseExceptionHandler()` or a global exception-handling middleware.
- **No request size limits** — though minimal APIs have sensible defaults, explicit limits for POST bodies would be prudent.

### Validation Holes

- Character names are only validated for length (3–16 chars). There's no check for:
  - Profanity/offensive content (expected for a game)
  - Special characters / Unicode exploits
  - Homoglyph attacks ("Admin" vs "Αdmin" with Greek alpha)
  - SQL injection is not a risk (EF Core parameterizes), but XSS could be if names are rendered in a web client without escaping

---

## 8. Production Readiness

### Logging ✅

Serilog is properly configured with structured logging:
- Console sink with useful template
- Application Insights sink available
- `LoggingDecorator` wraps all command handlers automatically
- `UseSerilogRequestLogging()` captures HTTP request logs

**Issue:** `LoggingDecorator` logs `result.Value` on success:

```csharp
logger.LogInformation("Successfully handled command {CommandName}. Result: {@Result}",
    commandName, result.Value);
```

This will serialize the entire result object into logs. For `CharacterStateResult` this includes the full character state. Not a security issue now, but be careful as the model grows — avoid logging PII or sensitive game state at Info level.

### Observability ⚠️

OpenTelemetry infrastructure exists but is **disabled by default**:

```json
"EnableTracing": false,
"EnableMetrics": false
```

For production, these should be `true` with an OTLP endpoint configured (Jaeger, Grafana Tempo, etc.). The plumbing is there — it just needs turning on.

### Health Checks ❌

```csharp
app.MapGet("health", () => Results.Ok(new { status = "healthy" }))
```

This is a **liveness probe only** — it doesn't check database connectivity, Keycloak reachability, or RabbitMQ. For production, use ASP.NET Core's built-in health check framework:

```csharp
builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString)
    .AddRabbitMQ(...);
app.MapHealthChecks("/health");
```

### Configuration Management ⚠️

- `appsettings.json` contains the PostgreSQL connection string with plaintext `postgres:postgres` credentials
- `UserSecretsId` is present in the csproj, but secrets aren't being used for the connection string
- No `appsettings.Production.json` exists
- Auth settings (Authority, Audience) are only overridden for Development

**For production:** Use environment variables or Azure Key Vault / AWS Secrets Manager for connection strings and auth settings. Never ship default credentials in source-controlled config files.

### Docker Readiness ✅

Dockerfile is well-structured with multi-stage builds (build → publish → runtime). The `docker-compose.yaml` sets up PostgreSQL, RabbitMQ, Keycloak, and Keycloak's own Postgres — a complete local dev stack.

**Missing:** The `docker-compose.yaml` doesn't include the application container itself. Consider adding a `kombats-api` service that builds from the Dockerfile, with proper `depends_on` and health checks.

### Secrets Handling ⚠️

- Keycloak admin credentials (`admin:admin`) are in `docker-compose.yaml` — acceptable for local dev only
- PostgreSQL password is `postgres` — acceptable for local dev only
- Application Insights connection string is empty — good, not leaked
- No `.env` file pattern or secrets manager integration for production

---

## 9. Performance & Scaling

### DB Query Patterns

All queries use single-column indexed lookups:
- `GetByIdentityIdAsync` → unique index on `identity_id` ✅
- `GetByIdAsync` → primary key lookup ✅
- `IsNameTakenAsync` → raw SQL with `LOWER(TRIM(name))` — **no index supports this**, will do a sequential scan at scale

### Potential Bottlenecks

1. **Name uniqueness check** performs a full table scan. At 100K+ characters, this becomes noticeable.
2. **No connection pooling configuration** — Npgsql uses a default pool of 100 connections. Fine for MVP, but should be explicitly configured for production.
3. **No caching** — every `GET /api/me` hits the database. For a game where this is called frequently, consider a short-lived cache (even 5-second in-memory cache reduces load significantly).

### Concurrency Risks

- Character mutation is safe (Revision concurrency token)
- Character creation is safe (unique index on `identity_id` + idempotent catch)
- **Character naming is NOT safe** (no unique index on `name`, TOCTOU race)

### Future Scaling Blockers

- Single database, single service — this is fine for an MVP
- If the game grows, the `Character` aggregate may need to be split (combat stats vs profile vs inventory)
- No read/write separation — not needed now, but the clean repository abstraction makes it easy to add later
- RabbitMQ infrastructure exists in Shared but isn't used — good foresight for future event-driven features

---

## 10. Missing but Recommended (for Real Production)

### Redis / Caching

Not currently used. Recommended for:
- Session/token caching (reduce Keycloak round-trips)
- Character state cache for hot-path reads (`GET /api/me`)
- Distributed rate limiting if multiple API instances are deployed

**Priority:** Medium. In-memory cache via `IMemoryCache` is a simpler first step.

### Outbox Pattern

SQL scripts for an outbox table exist (`sql/03-outbox.sql`) in the `auth` schema, and `InboxMessage`/`IInboxRepository` exist in the Players service. MassTransit is referenced in Shared. The pieces are there but not connected.

**Priority:** Medium. Needed before publishing domain events (e.g., "CharacterCreated", "CharacterReady") to other services.

### Background Jobs

None exist. Will be needed for:
- Outbox message processing
- Stale session cleanup
- Matchmaking queue processing
- Scheduled game events

**Priority:** Medium. MassTransit consumers or a simple `IHostedService` would suffice.

### Event Publishing Strategy

No domain events are raised from the `Character` aggregate. When inter-service communication is needed (e.g., notifying a matchmaking service that a character is Ready), consider:
- Domain events collected in the aggregate
- Published via outbox after `SaveChanges`
- MassTransit for transport

**Priority:** Low for MVP, high for multi-service architecture.

### Testing Gaps — CRITICAL

**There are zero tests in this solution.** No unit tests, no integration tests, no API tests. For a game backend handling real user state, this is the single biggest risk.

Minimum recommended:
- **Unit tests** for `Character` aggregate (state machine transitions, invariant enforcement, edge cases)
- **Unit tests** for handlers (mock repository, verify Result outcomes)
- **Integration tests** for repository (TestContainers + PostgreSQL)
- **API tests** using `WebApplicationFactory` (end-to-end through the HTTP layer)

**Priority:** CRITICAL. Write tests for the domain model first — it's the most valuable and cheapest to test.

### Metrics

OpenTelemetry metrics infrastructure exists but is disabled. Custom game metrics to add:
- Characters created per minute
- Stat allocations per minute
- Name conflicts (409s)
- Onboarding completion funnel (Draft → Named → Ready)

**Priority:** Medium.

---

## 11. Code Smells and Improvements

### `Character.CreateDraft` — Revision Bug

**File:** `Kombats.Players.Domain/Entities/Character.cs`, line ~39

```csharp
Revision = 3,  // Should be 1 (or 0)
```

All other stat values are 3 — this was clearly copy-pasted. Fix to `Revision = 1`.

### Duplicate Stat Allocation Endpoints

**Files:**
- `Kombats.Players.Api/Endpoints/AllocateStatPoints/AllocateStatPointsEndpoint.cs`
- `Kombats.Players.Api/Endpoints/CharacterStats/CharacterStatsEndpoint.cs`

These are functionally identical. Delete `CharacterStatsEndpoint.cs` entirely, or have it delegate to a shared handler call. Code duplication across endpoints means bugs need to be fixed in two places.

### `GetMeHandler` Misuses Command Pattern

**File:** `Kombats.Players.Application/UseCases/GetMe/GetMeHandler.cs`

This is a read-only operation implementing `ICommandHandler`. It should implement `IQueryHandler<GetMeQuery, CharacterStateResult>`. This matters because:
- The `LoggingDecorator` wraps commands and logs the full result — unnecessary overhead for reads
- Future command-level middleware (transactions, event publishing) shouldn't apply to queries

### Dead Code — `ConfigureJwtBearerOptions`

**File:** `Kombats.Players.Api/Extensions/JwtAuthenticationExtensions.cs`, lines ~45–139

The `ConfigureJwtBearerOptions` class is never registered in DI. It contains important configuration (`MapInboundClaims = false`, custom `OnChallenge`/`OnForbidden` events) that isn't being applied. Either register it or delete it and merge the settings into the inline configuration.

### Duplicate Validator Registration

**File:** `Kombats.Players.Api/Extensions/ValidationExtensions.cs`

```csharp
services.AddValidatorsFromAssembly(assembly);
services.AddValidatorsFromAssemblyContaining<AllocateStatPointsRequestValidator>();
```

Both calls register validators from the same assembly. The second line is redundant.

### Identity Boilerplate

**Files:** All endpoint files in `Endpoints/`

The `identityProvider.GetRequired()` + failure check pattern is copy-pasted across 4 endpoints (approximately 8 lines each time). Extract into an endpoint filter:

```csharp
internal sealed class RequireIdentityFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var provider = context.HttpContext.RequestServices.GetRequiredService<ICurrentIdentityProvider>();
        var result = provider.GetRequired();
        if (result.IsFailure) return Results.Problem(...);
        context.HttpContext.Items["CurrentIdentity"] = result.Value;
        return await next(context);
    }
}
```

### `IsNameTakenAsync` — Unnecessary Raw SQL

**File:** `Kombats.Players.Infrastructure/Persistence/Repository/CharacterRepository.cs`, lines ~29–44

The raw SQL selects all columns to then count rows. Replace with:

```csharp
public Task<bool> IsNameTakenAsync(string normalizedName, Guid? excludeCharacterId, CancellationToken ct)
    => _db.Characters
        .Where(c => c.Name != null
            && c.Name.ToLower().Trim() == normalizedName
            && (excludeCharacterId == null || c.Id != excludeCharacterId))
        .AnyAsync(ct);
```

### `ApplicationServicesExtensions.cs` + `DependencyInjection.cs`

**Files:**
- `Kombats.Players.Application/ApplicationServicesExtensions.cs`
- `Kombats.Players.Application/DependencyInjection.cs`

Two files that both configure Application DI. `DependencyInjection.cs` just calls `ApplicationServicesExtensions`. Merge them into one file.

### Swagger Exposed in All Environments

**File:** `Kombats.Players.Api/Program.cs`

```csharp
app.UseSwaggerDocumentation();  // No environment check
```

Swagger should be conditionally enabled:

```csharp
if (app.Environment.IsDevelopment())
    app.UseSwaggerDocumentation();
```

### `LoggingDecorator` Logs Full Result Values

**File:** `Kombats.Shared/Behaviours/LoggingDecorator.cs`, line ~27

```csharp
logger.LogInformation("Successfully handled command {CommandName}. Result: {@Result}", commandName, result.Value);
```

Logging the full result at Info level is verbose and could contain sensitive data as the model grows. Log at Debug level, or just log success without the payload.

---

## 12. Technical Debt List

### Short-Term (fix before any real users)

| # | Item | Effort | Risk |
|---|------|--------|------|
| 1 | Fix `Revision = 3` → `Revision = 1` in `Character.CreateDraft` | 5 min | Bug |
| 2 | Add unique index on `LOWER(TRIM(name))` + handle `DbUpdateException` in `SetCharacterNameHandler` | 1 hour | Data integrity |
| 3 | Lock down CORS to specific origins (configurable per env) | 30 min | Security |
| 4 | Remove or gate `/api/me/claims` endpoint behind dev-only check | 15 min | Security |
| 5 | Register `ConfigureJwtBearerOptions` or merge its settings into inline config (especially `MapInboundClaims = false`) | 30 min | Auth bug risk |
| 6 | Add global exception handler middleware | 30 min | Security |
| 7 | Gate Swagger behind `IsDevelopment()` check | 5 min | Security |
| 8 | Remove `IdentityId` from `MeResponse` (or justify it) | 15 min | Security |

### Medium-Term (before scaling beyond MVP)

| # | Item | Effort |
|---|------|--------|
| 9 | Write unit tests for `Character` aggregate | 2–4 hours |
| 10 | Write integration tests with TestContainers | 4–8 hours |
| 11 | Delete `CharacterStatsEndpoint` (duplicate) | 10 min |
| 12 | Refactor `GetMe` to use `IQueryHandler` | 1 hour |
| 13 | Replace raw SQL in `IsNameTakenAsync` with LINQ | 30 min |
| 14 | Extract identity filter to reduce endpoint boilerplate | 1 hour |
| 15 | Standardize URL versioning across all endpoints | 1 hour |
| 16 | Enable OpenTelemetry tracing + metrics in production config | 1 hour |
| 17 | Add proper ASP.NET health checks (DB, RabbitMQ) | 1 hour |
| 18 | Add rate limiting middleware | 1–2 hours |
| 19 | Remove unused `Npgsql` reference from Application csproj | 5 min |

### Long-Term (as the game grows)

| # | Item | Effort |
|---|------|--------|
| 20 | Wire up outbox pattern for domain event publishing | 1–2 days |
| 21 | Add character name profanity filter / content moderation | 1 day |
| 22 | Split Shared library into focused packages (Shared.Types, Shared.Messaging, Shared.Observability) | 2–4 hours |
| 23 | Add caching layer for `GET /api/me` | 2–4 hours |
| 24 | Add background job processing (outbox worker, cleanup jobs) | 1–2 days |
| 25 | Create production configuration pipeline (secrets, env-specific settings) | 1 day |
| 26 | Consider read/write separation for character queries | 1–2 days |
| 27 | Add domain events to Character aggregate | 4–8 hours |

---

## 13. Overall Verdict

### Is this acceptable as a production MVP backend?

**Not yet, but it's close.** The architecture is sound, the code quality is above average, and the design decisions are mostly pragmatic. The gap to production-ready is concrete and bounded — it's not a "rewrite" situation.

### What must be fixed before real users?

1. **Fix the `Revision = 3` bug** — clients will be confused, and it will break concurrency checks
2. **Add unique index on character name** — without it, duplicate names WILL happen under concurrent load
3. **Lock down CORS** — `AllowAnyOrigin` is a showstopper
4. **Fix or remove the dead JWT configuration** — `MapInboundClaims = false` should be active
5. **Add global exception handling** — unhandled exceptions must not leak stack traces
6. **Write at least unit tests for `Character`** — the domain model is the hardest thing to fix after launch

### What can wait?

- Query/command separation for `GetMe`
- Caching
- Event publishing / outbox
- Splitting the Shared library
- Background jobs
- Full observability enablement
- URL versioning standardization

The foundation is solid. Address the short-term items, write a basic test suite, and this is a credible production MVP for a game backend.

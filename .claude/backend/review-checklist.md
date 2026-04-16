# Review Checklist

Quick pre-merge checklist for all implementation work. Use alongside the full reviewer prompt (`.claude/prompts/reviewer.md`) for detailed reviews.

---

## Architecture Boundaries

- [ ] Domain has zero infrastructure dependencies (no EF Core, no Redis, no MassTransit)
- [ ] Application depends on Domain + abstractions only — no infrastructure types
- [ ] Infrastructure implements Application ports — no composition logic, no `DependencyInjection.cs`
- [ ] Bootstrap is the sole composition root — all DI registration lives here
- [ ] Api is transport-only — no domain logic, no DI registration, no `WebApplication`
- [ ] No cross-service project references except Contracts
- [ ] No cross-schema database access

## Messaging

- [ ] All `Publish()`/`Send()` calls go through the transactional outbox
- [ ] Inbox enabled on all consumers
- [ ] Consumers are thin — delegate to application handlers
- [ ] MassTransit version is 8.3.0 (no other version)
- [ ] Messaging configured via `Kombats.Messaging` — no per-service divergence

## API

- [ ] All new endpoints use Minimal APIs — no Controllers, no MVC
- [ ] All endpoints `[Authorize]` (except health checks)
- [ ] FluentValidation at API layer for input validation
- [ ] No domain types in HTTP request/response DTOs

## Contracts

- [ ] `Version: int` field on all integration events
- [ ] Changes are additive-only — no field removal or rename
- [ ] Zero NuGet dependencies on contract projects
- [ ] Publisher's domain language used

## Testing

- [ ] Domain unit tests for all state transitions and invariants
- [ ] Application unit tests with stubbed/faked ports
- [ ] Infrastructure integration tests with real Postgres/Redis (Testcontainers)
- [ ] Consumer idempotency test: same message twice, second is no-op
- [ ] API auth enforcement test: missing/invalid JWT returns 401
- [ ] No mocked `DbContext`/`IDatabase`/`IPublishEndpoint` in integration tests
- [ ] No test code in production assemblies

## Legacy Posture

- [ ] No new references to `Kombats.Shared`
- [ ] No legacy patterns extended (Controllers, `DependencyInjection.cs`, Api-as-composition-root)
- [ ] Coexistence documented if old and new code exist for the same concern
- [ ] Superseded legacy code removed or removal ticket created
- [ ] Temporary shims marked with `// TEMPORARY: Remove when [condition]`

## Persistence

- [ ] Snake_case naming via EFCore.NamingConventions
- [ ] `EnableRetryOnFailure()` on production connections
- [ ] No `Database.MigrateAsync()` on startup
- [ ] Schema isolation maintained (each DbContext targets its own schema)

## Packages

- [ ] All NuGet versions in `Directory.Packages.props` — no inline versions in `.csproj`
- [ ] No new packages without explicit approval (check baseline doc)

# Execution Issues

## Batch 0A

### EI-001: Version normalizations via central package management
**Severity:** Low
**Status:** Resolved by design

Central package management forces a single version per package. The following pre-existing version drifts were resolved to baseline target versions:

| Package | Old Version (project) | New Version | Risk |
|---|---|---|---|
| `Serilog.AspNetCore` | 8.0.3 (Matchmaking.Api) | 10.0.0 | Low — major version bump, but baseline-approved |
| `Microsoft.Extensions.Logging.Abstractions` | 9.0.0 (Matchmaking.App) | 10.0.3 | Very low — abstractions package |
| `Microsoft.Extensions.Logging.Abstractions` | 10.0.0 (Battle.App) | 10.0.3 | Negligible — patch bump |
| `Microsoft.AspNetCore.OpenApi` | 10.0.1 (Matchmaking.Api) | 10.0.3 | Negligible — patch bump |
| `MassTransit.RabbitMQ` | 8.5.8 (Kombats.Shared) | 8.3.0 | Low — downgrade, but 8.3.0 is the pinned baseline. Shared is legacy and scheduled for removal |

All version normalizations verified via successful build. No runtime verification performed (infrastructure not started).

### EI-002: PropertyGroup properties remain duplicated in csproj files
**Severity:** Info (not a defect)
**Status:** Deferred — cosmetic

`Directory.Build.props` now provides `TargetFramework`, `LangVersion`, `Nullable`, `ImplicitUsings`. These are still present in individual `.csproj` files (redundant but harmless). The F-01 ticket scope explicitly covered removing `PackageReference Version` attributes only. Removing redundant PropertyGroup entries can be done as part of per-service replacement tickets.

### EI-004: Kombats.slnx overwritten during Kombats.sln creation
**Severity:** Low
**Status:** Resolved

`.NET 10 SDK `dotnet new sln` defaults to `.slnx` format. The first `--force` invocation overwrote `Kombats.slnx` content. Restored from git. Second invocation used `--format sln` to create the classic `.sln` file. Both coexist until F-10.

### EI-005: IQueryHandler method name alignment
**Severity:** Info
**Status:** Resolved by design

Legacy `IQueryHandler.Handle` (in `Kombats.Shared.Types`) was inconsistent with `ICommandHandler.HandleAsync`. The new `Kombats.Abstractions.IQueryHandler` uses `HandleAsync` for consistency. Legacy code is unaffected — migration happens per-service.

### EI-003: Test framework package versions are unvalidated
**Severity:** Info
**Status:** Resolved in F-05

Test framework packages validated during F-05. All packages restore and build correctly except `MassTransit.Testing` — see EI-006.

## Batch 0C

### EI-006: MassTransit.Testing package does not exist in 8.3.0
**Severity:** Low
**Status:** Resolved

`MassTransit.Testing` is declared in `Directory.Packages.props` but does not exist as a separate NuGet package for MassTransit 8.3.0. In MassTransit v8+, testing utilities are included in the main `MassTransit` package. The `Kombats.Messaging.Tests` project references `MassTransit` directly instead. The `MassTransit.Testing` entry in `Directory.Packages.props` is harmless (unreferenced) and can be cleaned up in a future batch.

### EI-007: MSB3277 assembly version conflict warnings in test projects
**Severity:** Info
**Status:** Expected — resolves during service replacement

`Kombats.Players.Infrastructure.Tests` and `Kombats.Players.Api.Tests` emit MSB3277 warnings about `Microsoft.EntityFrameworkCore.Relational` version conflicts (10.0.1 vs 10.0.3). This is caused by `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.0 shipping with `EFCore.Relational` 10.0.1 while central management declares 10.0.3. The transitive reference from the legacy Infrastructure project pulls in the older version. This resolves naturally when the service is replaced with target-architecture code. No action needed now.

## Batch 0D

### EI-008: Testcontainers RabbitMQ default credentials are rabbitmq:rabbitmq, not guest:guest
**Severity:** Info
**Status:** Resolved

The `Testcontainers.RabbitMq` `RabbitMqBuilder` creates containers with default credentials `rabbitmq:rabbitmq`, not the standard RabbitMQ default of `guest:guest`. Integration tests must parse credentials from `container.GetConnectionString()` rather than hardcoding `guest:guest`. The outbox integration test was updated to parse the AMQP URI for correct credentials.

### EI-009: MessagingOptions.RabbitMq.Port added for non-standard port support
**Severity:** Info
**Status:** Resolved by design

`RabbitMqOptions` previously had no `Port` property — the RabbitMQ default port 5672 was implicitly used. Added `Port` property with default `5672` and switched `cfg.Host()` to the `(host, port, virtualHost, configure)` overload. This is needed for Testcontainers (which map to random ports) and production environments with non-standard port configuration. Existing services using the default port are unaffected — the default value matches the previous implicit behavior.

### EI-010: UseBusOutbox() was missing from outbox configuration
**Severity:** High
**Status:** Resolved

The pre-existing `Kombats.Messaging` library configured `AddEntityFrameworkOutbox<TDbContext>` and `UseEntityFrameworkOutbox<TDbContext>` on endpoint configurators, but did NOT call `UseBusOutbox()`. Without `UseBusOutbox()`, the `IPublishEndpoint` and `ISendEndpointProvider` injected via DI publish directly to RabbitMQ, bypassing the transactional outbox. Only messages published from within a consumer context would use the outbox. This violated AD-01 (all event publication must go through the outbox). Added `o.UseBusOutbox()` inside the `AddEntityFrameworkOutbox<TDbContext>` configuration. All three services benefit from this fix when they adopt `Kombats.Messaging`.

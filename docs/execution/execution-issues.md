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

### EI-003: Test framework package versions are unvalidated
**Severity:** Info
**Status:** Expected — validated in F-05

Test framework packages (`xunit`, `FluentAssertions`, `NSubstitute`, `Testcontainers.*`, `MassTransit.Testing`) are declared in `Directory.Packages.props` but no test projects currently reference them. Their versions will be validated when test projects are created in F-05. If a version is unavailable, F-05 will need to update `Directory.Packages.props`.

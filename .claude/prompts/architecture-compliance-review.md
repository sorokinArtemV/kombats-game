# Architecture Compliance Review

Focused review for Clean Architecture, service boundaries, and repo structure compliance.

## Check Each Changed File

For every file in the diff:

### 1. Layer Placement
- Is this file in the correct project/layer?
- Domain: no infrastructure, no transport, no NuGet beyond logging abstractions
- Application: no infrastructure types, no transport concerns
- Infrastructure: implements ports, no composition logic
- Api: thin transport only, no domain logic, no infra
- Bootstrap: composition only, no business logic

### 2. Dependency Direction
- Does the file's `using` statements respect: Domain ← Application ← Infrastructure, Domain ← Application ← Api ← Bootstrap?
- Any reverse dependencies? (e.g., Domain referencing Infrastructure types)
- Any project reference violations in `.csproj` files?

### 3. Service Isolation
- Does any file reference another service's internal project?
- Only Contract project references should cross service boundaries
- No cross-schema database access
- No shared mutable state between services

### 4. Composition Root
- Is all DI registration in Bootstrap?
- Any `DependencyInjection.cs` or `ServiceCollectionExtensions` in Infrastructure?
- Any `WebApplication` or `IServiceCollection` usage outside Bootstrap?

### 5. Legacy Pattern Regression
- Any new Controllers or MVC patterns?
- Any new references to `Kombats.Shared`?
- Any `Database.MigrateAsync()` on startup?
- Any direct `Publish()`/`Send()` outside outbox?
- Any MediatR or mediator patterns?
- Any composition logic in Infrastructure?

### 6. Repo Structure
- New projects follow `Kombats.<Service>.<Layer>` naming?
- SDK assignments correct? (Bootstrap = Web, everything else = Sdk)
- Namespace uses `Kombats` prefix?
- Test projects in `tests/` with `.Tests` suffix?

## Output

List violations with file path, line number, what's wrong, and what should change.

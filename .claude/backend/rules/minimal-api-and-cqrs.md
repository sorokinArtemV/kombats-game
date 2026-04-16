# Minimal API and CQRS Conventions

## Minimal API Rules

All new HTTP endpoints use Minimal APIs. No controllers. No `[ApiController]`. No MVC.

### Endpoint Structure
- Endpoints are thin: extract request data → call application handler → return response
- No domain logic in endpoint definitions
- No direct DbContext or Redis usage in endpoints
- Group endpoints logically using `MapGroup`
- Endpoint registration methods live in the Api project; Bootstrap calls them to map routes

### Auth and Validation
- All endpoints require `[Authorize]` unless explicitly exempt (health checks only)
- Input validation uses FluentValidation at the API layer — validators run before handlers
- OpenAPI metadata via `Microsoft.AspNetCore.OpenApi` and Scalar on all API hosts

### Legacy Controller Rules
- Legacy Controller-based endpoints must not be modified to add new behavior
- New endpoints are Minimal APIs in the target structure
- When a service is replaced, all its Controllers are removed
- No mixed-pattern files — a single file must not contain both Controller endpoints and Minimal API endpoints

---

## CQRS Conventions

CQRS is an application-layer pattern. Separate command handlers and query handlers. No shared read/write models at the handler level.

### Commands
- Mutate state and may publish events
- Return success/failure (via `Result<T>`), not query results
- Named descriptively: `AllocateStatsCommand`, `CreateBattleCommand`

### Queries
- Read state and return data
- Must not mutate state
- Named descriptively: `GetCharacterQuery`, `GetQueueStatusQuery`

### Handler Registration
- No MediatR. No in-process mediator library.
- Handlers are registered directly in DI (in Bootstrap) and called by the API layer
- Handler interfaces defined in `Kombats.Abstractions`: `ICommandHandler<TCommand, TResult>`, `IQueryHandler<TQuery, TResult>`

### What CQRS Is NOT in This System
- Not an infrastructure pattern — do not introduce separate databases, read replicas, or projection stores
- Read and write paths use the same DbContext and database
- CQRS here means separated handler responsibilities, not separated storage

### Transport Mapping Boundary
- Api layer maps HTTP request → command/query and handler result → HTTP response
- No domain types in HTTP request/response contracts
- DTOs for transport are defined in the Api project, not in Application or Domain

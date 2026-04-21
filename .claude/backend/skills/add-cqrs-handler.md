# Skill: Add CQRS Handler

## Command Handler

### 1. Define command in Application project

```csharp
public record <Name>Command(<params>) : ICommand<Result<T>>;
```

### 2. Define handler interface in Application project

```csharp
// Uses ICommandHandler<TCommand, TResult> from Kombats.Abstractions
```

### 3. Implement handler in Application project

```csharp
public class <Name>CommandHandler : ICommandHandler<<Name>Command, Result<T>>
{
    private readonly I<Repository> _repository;
    // Inject Application-layer port interfaces only

    public async Task<Result<T>> HandleAsync(<Name>Command command, CancellationToken ct)
    {
        // Orchestration logic
        // Call domain, call ports
        // Return Result<T>
    }
}
```

### 4. Register in Bootstrap

```csharp
builder.Services.AddScoped<ICommandHandler<<Name>Command, Result<T>>, <Name>CommandHandler>();
```

Or use Scrutor assembly scanning.

### 5. Add tests in Application.Tests

```csharp
// Stub/fake port interfaces
// Verify: correct calls, correct order, correct data
// Verify: error paths, edge cases
```

---

## Query Handler

Same pattern with `IQuery<T>` and `IQueryHandler<TQuery, TResult>`. Queries must not mutate state.

---

## Rules

- No MediatR or mediator — direct DI registration
- Handler lives in Application project
- Port interfaces (repos, messaging) defined in Application
- Port implementations in Infrastructure
- Handler does not reference Infrastructure types
- Handler registered in Bootstrap
- Required tests: unit tests with stubbed ports in Application.Tests

## Checklist

- [ ] Command/query record defined in Application
- [ ] Handler implements interface from Abstractions
- [ ] Only port interfaces injected (no infrastructure types)
- [ ] Registered in Bootstrap DI
- [ ] Unit tests with faked ports in Application.Tests
- [ ] Error/edge cases tested

# Skill: Add Minimal API Endpoint

## Steps

### 1. Create endpoint group in Api project

File: `src/Kombats.<Service>/Kombats.<Service>.Api/Endpoints/<GroupName>Endpoints.cs`

```csharp
public static class <GroupName>Endpoints
{
    public static RouteGroupBuilder Map<GroupName>(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/<route>")
            .WithTags("<GroupName>")
            .RequireAuthorization();

        group.MapPost("/", HandleCreate);
        group.MapGet("/{id:guid}", HandleGet);
        // ... more endpoints

        return group;
    }

    private static async Task<IResult> HandleCreate(
        <CommandDto> request,
        IValidator<<CommandDto>> validator,
        I<CommandHandler> handler,
        ClaimsPrincipal user)
    {
        // Validate
        var validation = await validator.ValidateAsync(request);
        if (!validation.IsValid) return Results.ValidationProblem(validation.ToDictionary());

        // Extract identity
        var identityId = user.FindFirstValue(ClaimTypes.NameIdentifier);

        // Dispatch to handler
        var result = await handler.HandleAsync(new <Command>(identityId, request.Field));

        // Map result
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Problem(result.Error.Message, statusCode: 400);
    }
}
```

### 2. Register routes in Bootstrap

File: `src/Kombats.<Service>/Kombats.<Service>.Bootstrap/Program.cs`

```csharp
app.Map<GroupName>();
```

### 3. Add request/response DTOs in Api project

DTOs are transport types — not domain types. Define them in the Api project near the endpoints.

### 4. Add FluentValidation validator in Api project

```csharp
public class <CommandDto>Validator : AbstractValidator<<CommandDto>>
{
    public <CommandDto>Validator()
    {
        RuleFor(x => x.Field).NotEmpty();
    }
}
```

Register validators in Bootstrap via assembly scanning or explicit registration.

### 5. Add tests

In `Kombats.<Service>.Api.Tests`:
- Auth: request without JWT → 401
- Auth: request with valid JWT → success
- Validation: invalid input → 400 with validation errors
- Response: correct shape for success case

## Checklist

- [ ] Endpoint in Api project (not Bootstrap, not Infrastructure)
- [ ] `RequireAuthorization()` on group or individual endpoints
- [ ] FluentValidation for input
- [ ] No domain logic in endpoint — delegates to handler
- [ ] No DbContext or Redis in endpoint
- [ ] OpenAPI metadata present
- [ ] Auth and validation tests in Api.Tests

# Skill: Add Consumer with Outbox

## Steps

### 1. Ensure contract exists in publisher's Contracts project

The consumed message type must be defined in the publishing service's Contracts project. It must have a `Version: int` field.

### 2. Add project reference to publisher's Contracts

In the consuming service's Infrastructure `.csproj`:
```xml
<ProjectReference Include="..\..\Kombats.<Publisher>\Kombats.<Publisher>.Contracts\Kombats.<Publisher>.Contracts.csproj" />
```

### 3. Create consumer in Infrastructure project

```csharp
public class <EventName>Consumer : IConsumer<<EventName>>
{
    private readonly I<Handler> _handler;

    public <EventName>Consumer(I<Handler> handler)
    {
        _handler = handler;
    }

    public async Task Consume(ConsumeContext<<EventName>> context)
    {
        // Thin: deserialize → call handler → return
        var message = context.Message;
        await _handler.HandleAsync(new <Command>(message.Field1, message.Field2));
    }
}
```

Consumer rules:
- Thin: no domain logic
- Handle edge cases (null WinnerIdentityId on draws, etc.)
- Application handler does the real work

### 4. Register consumer in Bootstrap

Consumer registration via `Kombats.Messaging` assembly scanning or explicit registration in Bootstrap's MassTransit configuration.

### 5. Ensure outbox is configured on DbContext

The service's DbContext must include outbox/inbox table mappings. This is configured via `Kombats.Messaging`.

### 6. Ensure inbox is enabled for the consumer

MassTransit inbox provides deduplication. But the consumer/handler must also be independently idempotent — inbox is a safety net.

### 7. If consumer publishes events: use outbox

If the handler publishes events after processing (e.g., Players' `BattleCompletedConsumer` publishes `PlayerCombatProfileChanged`), publication must go through the outbox within the same transaction as the domain write.

### 8. Add tests

In `Kombats.<Service>.Infrastructure.Tests`:

**Behavior test:**
- Send message → verify correct side effects (DB writes, state changes)
- Test edge cases (null fields, wrong state)

**Idempotency test:**
- Send same message twice with same `MessageId`
- Second delivery is a no-op (no duplicate side effects, no exceptions)

**Outbox test (if consumer publishes):**
- Domain write + event publication in one transaction
- Transaction rollback → no event in outbox

## Checklist

- [ ] Contract type from publisher's Contracts project (not defined locally)
- [ ] Consumer in Infrastructure (thin — delegates to handler)
- [ ] Handler in Application (business logic)
- [ ] Inbox enabled for idempotent processing
- [ ] Outbox used if consumer publishes events
- [ ] Edge cases handled (nulls, wrong state)
- [ ] Registered in Bootstrap
- [ ] Behavior test in Infrastructure.Tests
- [ ] Idempotency test: same MessageId twice → no-op
- [ ] Outbox atomicity test if applicable

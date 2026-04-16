# Skill: Add Redis Operation Set

## Context

Redis is used by Battle (DB 0) and Matchmaking (DB 1). Players does not use Redis.

Battle: hot state store, Lua-scripted CAS transitions, deadlines, locks.
Matchmaking: queue data structures, distributed lease, player status cache.

---

## Steps

### 1. Define port interface in Application project

```csharp
public interface I<OperationSet>
{
    Task<bool> TryCreateAsync(Guid id, <State> state);
    Task<Result<<State>>> GetAsync(Guid id);
    Task<bool> TryCasTransitionAsync(Guid id, <FromState> expected, <ToState> next);
    // ... operations specific to the domain need
}
```

### 2. Implement in Infrastructure project

Use `StackExchange.Redis` `IDatabase` directly. For atomic multi-key operations, use Lua scripts.

```csharp
public class Redis<OperationSet> : I<OperationSet>
{
    private readonly IDatabase _db;
    private static readonly LuaScript CasScript = LuaScript.Prepare(@"
        local current = redis.call('GET', @key)
        if current == @expected then
            redis.call('SET', @key, @next)
            return 1
        end
        return 0
    ");

    public async Task<bool> TryCasTransitionAsync(...)
    {
        var result = await _db.ScriptEvaluateAsync(CasScript, new { key = ..., expected = ..., next = ... });
        return (int)result == 1;
    }
}
```

### 3. Key naming conventions

- Battle: `battle:state:{id}`, `battle:actions:{id}:{turn}:{playerId}`, `battle:deadlines`, `battle:lock:{id}`
- Matchmaking: `mm:queue:{mode}:set`, `mm:queue:{mode}:list`, `mm:status:{playerId}`, `mm:lease:{workerId}`

### 4. Register in Bootstrap

```csharp
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(config.GetConnectionString("Redis")!));
builder.Services.AddScoped<I<OperationSet>, Redis<OperationSet>>();
```

### 5. Add tests

In `Kombats.<Service>.Infrastructure.Tests` with real Redis via Testcontainers:

**Required tests:**
- Creation (SETNX): first write succeeds, duplicate fails
- CAS: correct precondition succeeds, wrong precondition fails
- Lua scripts tested as deployed (not simplified)
- TTL behavior if applicable
- Concurrent access patterns if applicable

**Matchmaking-specific:**
- Atomic queue join (SADD + RPUSH)
- Atomic pair pop (Lua script)
- Distributed lease (SET NX PX)
- Lease expiry and reacquisition

**Battle-specific:**
- Action submission (first-write-wins per player per turn)
- State machine transitions
- Terminal state correctness

## Checklist

- [ ] Port interface in Application (no Redis types)
- [ ] Implementation in Infrastructure using `IDatabase`
- [ ] Lua scripts for atomic multi-key operations
- [ ] Correct Redis DB (0 for Battle, 1 for Matchmaking)
- [ ] Registered in Bootstrap
- [ ] Integration tests with real Redis
- [ ] SETNX/CAS/atomicity verified
- [ ] No mocked `IDatabase` in tests

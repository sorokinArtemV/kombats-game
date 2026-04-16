# Skill: Add Required Tests

## Determine Required Tests

For each change, identify which test categories apply:

| What Changed | Required Tests |
|---|---|
| Domain entity/aggregate | Domain.Tests: state transitions, invariants, edge cases |
| Domain value object | Domain.Tests: equality, validation, construction |
| Domain service/pure function | Domain.Tests: inputs → outputs, edge cases |
| Battle engine/combat math | Domain.Tests: determinism suite, combat math, ruleset |
| Command handler | Application.Tests: orchestration with stubbed ports |
| Query handler | Application.Tests: correct data retrieval with stubbed ports |
| DbContext/entity config | Infrastructure.Tests: round-trip, snake_case, schema, concurrency |
| Repository | Infrastructure.Tests: CRUD with real Postgres |
| Redis operations | Infrastructure.Tests: operations with real Redis |
| Consumer | Infrastructure.Tests: behavior + idempotency |
| Outbox usage | Infrastructure.Tests: atomicity (write + event in tx, rollback = no event) |
| API endpoint | Api.Tests: auth, validation, response shape |
| Contract type | Infrastructure.Tests: serialization/deserialization round-trip |

---

## Test Infrastructure

### Domain/Application Tests
- No infrastructure dependencies
- Stub/fake ports for application tests (NSubstitute or manual fakes)
- Fast, no containers needed

### Infrastructure Tests
- Real PostgreSQL via Testcontainers
- Real Redis via Testcontainers
- MassTransit test harness for consumer tests
- No mocked DbContext, IDatabase, or IPublishEndpoint
- No EF Core in-memory provider

### API Tests
- `WebApplicationFactory<Program>` targeting Bootstrap project
- JWT token builder for auth tests
- Test both positive (valid JWT) and negative (no JWT → 401)

---

## Test Project Location

```
tests/Kombats.<Service>/Kombats.<Service>.<Layer>.Tests/
```

Production projects needing internal testing access declare:
```csharp
[assembly: InternalsVisibleTo("Kombats.<Service>.<Layer>.Tests")]
```

---

## Common Test Patterns

### Idempotency Test Pattern
```
1. Arrange: create valid message with known MessageId
2. Act: send message → verify side effect
3. Act: send same message again (same MessageId)
4. Assert: no additional side effect, no exception
```

### Outbox Atomicity Test Pattern
```
1. Arrange: set up DbContext with outbox
2. Act: domain write + event publish in transaction → commit
3. Assert: event exists in outbox table
4. Act: domain write + event publish in transaction → rollback
5. Assert: no event in outbox table
```

### Determinism Test Pattern (Battle)
```
1. Arrange: known seed, known stats, known action sequence
2. Act: resolve battle
3. Assert: specific HP, damage, dodge, crit per turn
4. Act: resolve same battle again
5. Assert: identical results
```

### Round-Trip Test Pattern (EF Core)
```
1. Arrange: create entity with all fields
2. Act: save to DB
3. Act: reload from DB (new DbContext instance)
4. Assert: all fields match original
```

## Checklist

- [ ] All required test categories identified for the change
- [ ] Tests in correct test project
- [ ] Real infrastructure for integration tests (no mocks, no in-memory)
- [ ] Edge cases covered (nulls, concurrency, duplicates, invalid transitions)
- [ ] Battle: determinism tests if combat-related
- [ ] Consumers: idempotency test present
- [ ] Outbox: atomicity test if events published
- [ ] No test code in production assemblies

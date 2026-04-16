# Testing and Definition of Done

Tests are delivery gates. A feature or fix is not complete until its required tests pass. No "tests in a follow-up ticket."

---

## Mandatory Tests by Change Type

### Domain changes
- Unit tests for all state transitions, invariants, business rules
- Zero infrastructure dependencies in domain test projects
- Every valid state transition tested; every invalid transition rejection tested

### Application changes
- Unit tests with stubbed/faked ports (repository interfaces, messaging abstractions)
- Verify orchestration: right calls in right order with right data

### Infrastructure changes (persistence)
- Integration tests with real PostgreSQL via Testcontainers
- Round-trip: create → save → reload → assert all fields
- Snake_case naming verified
- Schema isolation verified
- Concurrency token behavior verified where applicable

### Infrastructure changes (Redis)
- Integration tests with real Redis via Testcontainers
- Lua scripts tested as deployed — no simplified stand-ins
- CAS semantics, SETNX behavior, TTL behavior all verified

### Infrastructure changes (consumers)
- Behavior test: consumer performs correct action
- Idempotency test: same message twice (same MessageId), second is no-op
- Edge case coverage (nulls, wrong state, out-of-order delivery)

### API changes
- Auth enforcement: valid JWT accepted, missing/invalid/expired JWT → 401, wrong audience → 401
- Input validation tests
- Response contract tests
- SignalR hub auth (Battle): valid JWT connects, no JWT rejected, no dev bypass in release config

### Contract changes
- Serialization/deserialization round-trip with all fields including `Version`
- Additive-only — existing field removal breaks tests

---

## Battle-Specific Mandatory Tests

Full determinism test suite (AD-11) — highest priority:

| Test | Proves |
|---|---|
| Same seed + actions + participants → same outcome | Core determinism |
| Same battle resolved twice → identical results per turn | Retry safety |
| A→B and B→A resolution order → same outcome | Independent RNG streams |
| Resolution after simulated crash → same result | Recovery safety |
| Multi-turn fixed sequence → same terminal state | Full-sequence determinism |
| NoAction degradation → deterministic fallback | Degraded path |
| 10 idle turns → deterministic terminal state | Inactivity termination |

Combat math: damage formula, HP from Vitality, dodge/crit probabilities, edge cases (zero/max stats).

Any change to RNG derivation, consumption order, combat arithmetic, or turn sequencing must break at least one determinism test.

---

## Forbidden Testing Patterns

- Mocking `DbContext`, `IDatabase`, or `IPublishEndpoint` in integration tests
- EF Core in-memory provider for any test
- Test code or test framework references in production assemblies
- Using legacy tests as authoritative for target implementation structure

---

## Release Gates

All must pass before release:

1. **All mandatory tests pass** — zero failures
2. **Battle determinism suite passes** — separately called out as correctness gate
3. **Outbox atomicity verified** — at least one test per service: write + event in one tx, rollback = no event
4. **Consumer idempotency verified** — every consumer has duplicate-message test
5. **Auth enforced** — every endpoint and SignalR hub rejects unauthenticated requests
6. **Contract compatibility** — solution builds, no serialization failures
7. **Migration forward-apply** — all migrations apply to empty database, correct schema
8. **No test infra in production** — no test code in production assemblies

---

## Test Project Structure

```
tests/
├── Kombats.<Service>/
│   ├── Kombats.<Service>.Domain.Tests/
│   ├── Kombats.<Service>.Application.Tests/
│   ├── Kombats.<Service>.Infrastructure.Tests/
│   └── Kombats.<Service>.Api.Tests/
└── Kombats.Common/
    └── Kombats.Messaging.Tests/
```

Bootstrap projects tested via `WebApplicationFactory<Program>` in infrastructure/API tests, not unit-tested directly.

---

## Definition of Done Per Ticket Type

| Ticket Type | DoD |
|---|---|
| Domain replacement | Unit tests for all transitions, invariants, edge cases |
| Application replacement | Unit tests with stubbed ports |
| Infrastructure replacement (persistence) | Integration tests with real Postgres |
| Infrastructure replacement (Redis) | Integration tests with real Redis |
| Infrastructure replacement (consumers) | Behavior test + idempotency test |
| API replacement | Auth, validation, response shape tests |
| Integration verification | Cross-service event flow verified |
| Foundation | Build verification |
| Legacy removal | Solution builds, all tests pass |
| Migration/cutover | Service starts and responds from new entry point |

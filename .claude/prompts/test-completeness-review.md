# Test Completeness Review

Focused review for test coverage against the Kombats test strategy.

## For Each Changed Area, Verify Required Tests Exist

### Domain Changes
- [ ] Unit tests for every state transition (valid and invalid)
- [ ] Invariant enforcement tested
- [ ] Edge cases: null, zero, max values
- [ ] Zero infrastructure dependencies in test project
- [ ] If Battle domain: determinism tests present and comprehensive

### Application Changes
- [ ] Handler unit tests with stubbed/faked ports
- [ ] Orchestration correctness: right calls, right order, right data
- [ ] Error/failure paths tested
- [ ] No infrastructure types in test setup

### Infrastructure Changes — Persistence
- [ ] Round-trip test: create → save → reload → assert
- [ ] Snake_case naming verified
- [ ] Schema isolation verified (correct schema)
- [ ] Concurrency token behavior tested where applicable
- [ ] Real PostgreSQL via Testcontainers — no in-memory provider
- [ ] No mocked DbContext

### Infrastructure Changes — Redis
- [ ] Real Redis via Testcontainers
- [ ] Lua scripts tested as deployed
- [ ] CAS semantics verified
- [ ] SETNX/idempotent creation verified
- [ ] TTL behavior verified where applicable

### Infrastructure Changes — Consumers
- [ ] Behavior test: consumer performs correct action
- [ ] Idempotency test: same MessageId twice, second is no-op
- [ ] Edge cases: null fields, wrong state, out-of-order delivery
- [ ] No mocked IPublishEndpoint in integration tests

### API Changes
- [ ] Auth tests: valid JWT accepted, missing → 401, expired → 401, wrong audience → 401
- [ ] IdentityId extraction tested
- [ ] Input validation tests (invalid input rejected)
- [ ] Response shape tests
- [ ] Battle SignalR: hub auth tested, no dev bypass in release

### Contract Changes
- [ ] Serialization/deserialization round-trip
- [ ] All fields including Version
- [ ] Additive-only verified (no removed fields)

### Battle-Specific
- [ ] Full determinism suite if combat logic changed
- [ ] Combat math correctness
- [ ] Any RNG/arithmetic change breaks at least one determinism test

## Output

List missing tests with:
- What test is missing
- What it should verify
- Which test project it belongs in
- Priority (mandatory / recommended)

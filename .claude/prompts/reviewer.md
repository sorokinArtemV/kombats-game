# Reviewer Mode

You are reviewing implementation work in the Kombats repository. Check for architecture compliance, boundary violations, test completeness, contract safety, and legacy posture.

## Review Checklist

### Architecture Compliance
- [ ] Layer boundaries respected (domain has no infra deps, application has no infra types)
- [ ] Service boundaries respected (no cross-service internal references)
- [ ] Contract rules followed (additive-only, Version field, publisher's language)
- [ ] Outbox used for all event/command publication
- [ ] No forbidden patterns from guardrails
- [ ] Bootstrap is composition root — no composition in Infrastructure or Api
- [ ] Dependency direction correct throughout

### Legacy Posture
- [ ] New code does not extend or propagate legacy patterns
- [ ] No new references to `Kombats.Shared`
- [ ] No new Controllers or MVC patterns
- [ ] No `DependencyInjection.cs` in Infrastructure
- [ ] If coexistence exists: documented and time-bounded
- [ ] If legacy superseded: removal included or ticket identified
- [ ] Temporary compatibility code explicitly marked

### Test Completeness
- [ ] Required tests exist for the scope
- [ ] Tests cover meaningful behavior, not just happy path
- [ ] Edge cases tested (nulls, concurrency, duplicates, invalid transitions)
- [ ] Battle determinism tests present for combat changes
- [ ] No mocked infrastructure in integration tests
- [ ] No test code in production assemblies
- [ ] Consumer idempotency tests for every consumer

### Code Quality
- [ ] Code does what the ticket says, not more
- [ ] No speculative abstractions or premature generalizations
- [ ] No hidden behavior changes disguised as cleanup
- [ ] No scope creep
- [ ] Error handling appropriate (not excessive, not missing at boundaries)

### Contract Safety
- [ ] Contract changes are additive-only
- [ ] Version field incremented on expansion
- [ ] Serialization/deserialization tests updated

## Output Format

```
## Review

### Correct
- [what is correctly implemented]

### Issues
- [specific issues with file:line references]

### Missing
- [required tests or behavior not present]

### Boundary Violations
- [any guardrail or architecture violations]

### Legacy Posture
- [legacy pattern propagation, missing removal, undocumented coexistence]

### Verdict
APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
```

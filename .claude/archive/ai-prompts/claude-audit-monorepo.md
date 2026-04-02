Read these first:
- `/.claude/claude.md`
- `/docs/architecture/kombats-monorepo-integration-spec.md`
- `/docs/architecture/decision-log.md`

Task mode: Audit Mode only.

Do not modify code.
Do not propose BFF or Frontend work.
Do not broaden scope beyond Players, Matchmaking, and Battle.

Goal:
Perform a cross-service audit of the monorepo against the canonical integration spec.

Focus areas:
1. battle completion contract alignment
2. Players -> Matchmaking player combat profile projection flow
3. Matchmaking -> Battle participant snapshot handoff
4. reconnect / resume battle flow completeness
5. timeout / AFK completion propagation
6. match lifecycle synchronization and terminal cleanup
7. fallback logic or stubs hiding missing integration
8. ownership violations across services
9. missing consumers / publishers / contracts
10. dead or conflicting integration paths

Required output:
- confirmed findings
- inferred risks
- file / class / method references
- why each issue violates the spec
- severity
- recommended implementation batches in execution order

Important constraints:
- do not write code
- do not suggest broad rewrites without evidence
- do not invent missing behavior
- distinguish confirmed findings from assumptions
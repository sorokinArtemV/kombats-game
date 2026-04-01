Read these first:
- `/.claude/claude.md`
- `/docs/architecture/kombats-monorepo-integration-spec.md`
- `/docs/architecture/decision-log.md`

Task mode: Review Mode.

Review the current branch changes against the integration spec.

Focus:
- correctness of implemented batch scope
- service boundary preservation
- unintended scope expansion
- regressions
- leftover transitional hacks
- dead contracts
- missing follow-up work

Required output:
- correct
- incomplete
- boundary violations
- regression risks
- cleanup candidates

Do not rewrite code unless explicitly asked in a follow-up task.
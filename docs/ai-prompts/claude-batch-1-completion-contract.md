Read these first:
- `/.claude/claude.md`
- `/docs/architecture/kombats-monorepo-integration-spec.md`
- `/docs/architecture/decision-log.md`

Task mode: Implementation Mode.

Approved batch:
Normalize the canonical battle completion flow between Battle, Players, and Matchmaking.

Scope:
- identify the current battle completion contracts
- converge the system toward one canonical completion contract
- update consumers/publishers/adapters required for this batch
- keep changes limited to Battle / Players / Matchmaking integration flow
- preserve existing boundaries

Do not:
- work on BFF
- work on Frontend
- redesign auth
- implement unrelated cleanup
- rewrite reconnect logic unless directly required by this batch
- introduce ranked/MMR or other out-of-scope features

Implementation goals:
1. one canonical completion contract
2. Battle publishes it
3. Players consumes it for progression updates
4. Matchmaking consumes it for match lifecycle completion / cleanup
5. existing mismatched or legacy completion paths are either removed or clearly marked transitional

Required output:
- what changed
- why it changed
- what was intentionally not changed
- remaining known gaps
- transitional notes
- risks
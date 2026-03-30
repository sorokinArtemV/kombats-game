When given a task:

1. Analyze current codebase and existing architecture.
2. Identify:
   - what is already implemented
   - what is missing
   - what is inconsistent or problematic

3. Identify architectural constraints:
   - CQRS
   - service boundaries
   - messaging patterns

4. Propose the smallest solution that:
   - is architecturally correct
   - follows existing good patterns
   - fixes clearly problematic or inconsistent parts if necessary
   - will not require redesign in the next step

5. If refactoring is needed:
   - explicitly explain what is wrong
   - justify the change
   - keep changes minimal and localized

6. Define clear implementation steps:
   - what to change
   - where
   - why

DO NOT:
- start coding before planning
- introduce unnecessary abstractions
- overengineer
- blindly follow existing code if it is clearly incorrect
- produce solutions that will require full rewrite later
# Task Modes

There are only three valid modes for work in this repository.

## 1. Audit Mode

Use this mode when the task is:
- architecture review
- integration review
- repo inspection
- gap analysis
- consistency checking

Rules:
- do not modify code
- do not propose broad rewrites before identifying confirmed gaps
- distinguish confirmed findings from assumptions
- identify missing contracts, missing consumers, missing publishers, fallback logic, stubs, and ownership violations
- keep scope limited to the requested services and flows

Audit mode output must follow the required output format.

---

## 2. Implementation Mode

Use this mode only when explicitly asked to implement an approved batch.

Rules:
- implement only the approved batch scope
- do not broaden scope
- do not add unrelated cleanup
- do not introduce new services
- preserve backward compatibility unless the task explicitly allows contract changes
- keep changes small and localized
- note transitional compromises explicitly

Implementation mode output must follow the required output format.

---

## 3. Review Mode

Use this mode after implementation.

Rules:
- inspect the actual changes made
- identify regressions
- identify boundary violations
- identify hidden fallback logic
- identify dead transitional code
- identify incomplete migration work
- do not silently rewrite code during review unless explicitly asked

Review mode output must follow the required output format.
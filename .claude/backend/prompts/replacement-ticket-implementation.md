# Replacement Ticket Implementation

For tickets that replace legacy code with target-architecture code.

## Before Starting

1. Read the approved plan for this replacement
2. Read the legacy code being replaced — understand its behavior and integration points
3. Read the target architecture for this area
4. Identify what the legacy code does that must be preserved as behavior (not structure)

## Implementation Steps

### 1. Define Target Replacement
- What new files/classes are being created
- What target architecture patterns they follow
- What application behavior they preserve from the legacy code

### 2. Build New Implementation
- Follow target architecture strictly
- Do not copy legacy structure — build from the target patterns
- Preserve behavior, not structure
- Include all required tests

### 3. Define Coexistence Window (if any)
If old and new code must temporarily coexist:
- State what coexists and why
- State how long coexistence lasts
- State what triggers the cutover
- Mark temporary code: `// TEMPORARY: Remove when [condition]. See ticket [ref].`
- No mixed-pattern files

If no coexistence needed (replacement is self-contained):
- Delete the superseded legacy code in this ticket

### 4. Define Cutover
- When does traffic/behavior move from old to new?
- What changes at the cutover point? (routing, executable, DI registration)
- Is the cutover in this ticket or a separate cutover ticket?

### 5. Define Removal
- What legacy code is now superseded?
- Is removal in this ticket or a paired removal ticket?
- If separate: create the removal ticket reference

### 6. Verify No Mixed End State
After this ticket:
- No file contains both legacy and target patterns
- No service has both Controllers and Minimal APIs serving the same routes
- No Infrastructure project has both `DependencyInjection.cs` and Bootstrap composition
- Coexistence (if any) is explicit, documented, and time-bounded

## Implementation Summary

Use the standard format from CLAUDE.md. Pay special attention to:
- Legacy Code Removed section
- Legacy Code Superseded section
- Coexistence State section

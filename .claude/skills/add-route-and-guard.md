# Skill: Add Route and Guard

Add a new route with appropriate guard(s) to the Kombats frontend router.

---

## When to Use

When adding a new screen or page that needs to be routable and protected by the guard hierarchy.

---

## Steps

### 1. Define the Screen Component

Create the screen in the correct module:

```
src/modules/{module}/screens/{ScreenName}Screen.tsx
```

The screen should be a named export, composing feature components and UI primitives.

### 2. Add Lazy Import in Router

In `src/app/router.tsx`, add a lazy import:

```typescript
const {ScreenName}Screen = lazy(() =>
  import('@/modules/{module}/screens/{ScreenName}Screen').then(m => ({
    default: m.{ScreenName}Screen,
  }))
);
```

Note: React.lazy requires default export shape, so the `.then()` adapter is needed for named exports.

### 3. Add Route Definition

Add the route in the correct position within the guard hierarchy:

```typescript
// Inside the appropriate shell/guard nesting
{
  path: '{path}',
  element: <{ScreenName}Screen />,
}
```

### 4. Determine Guard Requirements

| User State | Required Guards |
|-----------|----------------|
| Unauthenticated page | Outside AuthGuard, in UnauthenticatedShell |
| Authenticated page | Inside AuthGuard → GameStateLoader |
| Onboarding page | Inside AuthGuard → GameStateLoader, but NOT inside OnboardingGuard (OnboardingGuard redirects TO these) |
| Lobby/normal page | Inside AuthGuard → GameStateLoader → OnboardingGuard → BattleGuard |
| Battle page | Inside AuthGuard → GameStateLoader → BattleShell (BattleGuard redirects TO this) |

### 5. Add Guard (if New Guard Needed)

Create guard in `src/app/guards/`:

```typescript
// src/app/guards/{Name}Guard.tsx
import { Navigate, Outlet } from 'react-router';
import { use{Module}Store } from '@/modules/{module}/store';

export function {Name}Guard() {
  const someState = use{Module}Store(state => state.field);

  if (shouldRedirect) {
    return <Navigate to="{redirect-path}" replace />;
  }

  return <Outlet />;
}
```

Guards read from Zustand stores — they never fetch data or call APIs.

### 6. Manual Test

- Navigate to the new route directly (URL bar) — verify guard redirects if preconditions not met
- Navigate via normal flow — verify screen renders
- Refresh the page on this route — verify state recovery (GameStateLoader refetches)
- Test with unauthenticated state — verify redirect to login

---

## Checklist

- [ ] Screen in `modules/{module}/screens/`
- [ ] Lazy import in `app/router.tsx`
- [ ] Route nested under correct guard hierarchy
- [ ] Guard reads from store, not from API
- [ ] `Navigate` uses `replace` (no back-button loop)
- [ ] Page refresh recovery works (guards re-evaluate after GameStateLoader)
- [ ] No `navigate()` calls in the screen itself — state changes trigger guard re-evaluation

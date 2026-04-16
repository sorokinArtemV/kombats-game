# Skill: Add Feature Screen

Create a new screen (page) within a feature module.

---

## When to Use

When adding a new user-facing page/view to the application as part of a feature module.

---

## Steps

### 1. Create Screen Component

```typescript
// src/modules/{module}/screens/{ScreenName}Screen.tsx
import { SomeComponent } from '../components/SomeComponent';
import { Button } from '@/ui/components/Button';
import { use{Module}Data } from '../hooks';

export function {ScreenName}Screen() {
  const { data, status } = use{Module}Data();

  if (status === 'loading') {
    return <ScreenSkeleton />;
  }

  return (
    <div className="flex flex-col gap-[var(--space-lg)] p-[var(--space-md)]">
      <h1 className="font-[var(--font-display)] text-2xl">
        Screen Title
      </h1>
      <SomeComponent data={data} />
    </div>
  );
}
```

### 2. Screen Rules

- Screen is a named export function component
- Screen composes feature components from `../components/` and UI primitives from `@/ui/`
- Screen reads data via hooks from `../hooks.ts` — never via direct store access in JSX
- Screen does NOT contain business logic — delegates to store actions via hooks
- Screen does NOT call transport functions directly
- Screen does NOT contain more than light layout — complex UI goes in feature components
- Screen does NOT handle routing — no `navigate()` calls; state changes trigger guard re-evaluation

### 3. Add Feature Components (if Needed)

If the screen needs domain-specific components not yet created:

```typescript
// src/modules/{module}/components/{ComponentName}.tsx
import { Card } from '@/ui/components/Card';
import { Badge } from '@/ui/components/Badge';
import type { SomeType } from '@/types/{domain}';

interface {ComponentName}Props {
  data: SomeType;
  onAction?: () => void;
}

export function {ComponentName}({ data, onAction }: {ComponentName}Props) {
  return (
    <Card>
      <h2>{data.name}</h2>
      <Badge>{data.status}</Badge>
      {onAction && <Button onClick={onAction}>Do Thing</Button>}
    </Card>
  );
}
```

Feature component rules:
- May read from own module's store (via hooks)
- May use UI primitives from `@/ui/`
- Must NOT import from other modules' internal components
- Must NOT import from `transport/` directly
- Props-driven where possible — prefer accepting data via props over reading store

### 4. Add Route

Follow the `add-route-and-guard` skill to register the screen in the router with appropriate guards.

### 5. Handle Loading and Error States

Every screen must handle:

```typescript
// Loading state — show skeleton or spinner
if (isLoading) return <Spinner />;

// Error state — show user-friendly error
if (error) return <ErrorDisplay message="Failed to load" />;

// Empty state (if applicable)
if (!data || data.length === 0) return <EmptyState message="Nothing here" />;
```

### 6. Manual Test

Test all user states that can reach this screen:

- Fresh load (navigate directly via URL)
- Normal flow (navigate from previous screen)
- Page refresh (state recovery via GameStateLoader)
- Loading state (throttle network in DevTools)
- Error state (block the API call in DevTools)
- Empty state (if applicable)
- Mobile viewport (responsive layout)

---

## Screen Type Templates

### Data Display Screen (Lobby, Result)

```typescript
export function LobbyScreen() {
  const { character } = usePlayerData();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--space-lg)]">
      <main className="lg:col-span-2">
        <CharacterSummary character={character} />
        <QueueButton />
      </main>
      <aside>
        {/* Chat panel, online players */}
      </aside>
    </div>
  );
}
```

### Form Screen (Onboarding, Stat Allocation)

```typescript
export function StatAllocationScreen() {
  const { stats, allocate } = useStatAllocation();
  const mutation = useAllocateStats();

  const handleSubmit = () => {
    mutation.mutate(stats);
  };

  return (
    <div className="max-w-lg mx-auto p-[var(--space-lg)]">
      <StatPointAllocator stats={stats} onChange={allocate} />
      <Button
        onClick={handleSubmit}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Saving...' : 'Confirm'}
      </Button>
    </div>
  );
}
```

### Real-Time Screen (Battle)

```typescript
export function BattleScreen() {
  const { battleId } = useParams();
  const battle = useBattleData();
  const connectionRef = useBattleConnection(battleId!);

  return (
    <div className="h-screen flex flex-col">
      <BattleHud hp={battle.hp} turn={battle.turn} phase={battle.phase} />
      <main className="flex-1">
        {battle.phase === 'ActionSelection' && (
          <ZoneSelector onSubmit={/* ... */} />
        )}
        {battle.phase === 'TurnResult' && (
          <TurnResultDisplay result={battle.lastResult} />
        )}
      </main>
      <NarrationFeed entries={battle.narration} />
    </div>
  );
}
```

---

## Checklist

- [ ] Screen in `modules/{module}/screens/{ScreenName}Screen.tsx`
- [ ] Named export
- [ ] Uses hooks for data — no direct store reads in JSX
- [ ] No business logic in screen — delegates to store actions
- [ ] No direct transport calls
- [ ] No `navigate()` — state-driven routing
- [ ] Loading state handled
- [ ] Error state handled
- [ ] Route registered (see add-route-and-guard skill)
- [ ] Manual test: direct URL, normal flow, refresh, loading, error
- [ ] CSS variables for theming — no hardcoded colors
- [ ] Responsive layout (mobile-first with breakpoints)

# Skill: Add Zustand Store

Create a new Zustand store for a feature module.

---

## When to Use

When adding a new module or when an existing module needs client-side state management for real-time data, UI state, or data that guards depend on synchronously.

---

## Steps

### 1. Define Store Interface

```typescript
// src/modules/{module}/store.ts
import { create } from 'zustand';

// State shape
interface {Module}State {
  // Data fields
  someData: SomeType | null;
  status: 'idle' | 'loading' | 'ready' | 'error';

  // Actions
  setSomeData: (data: SomeType) => void;
  reset: () => void;
}

// Initial state (extract for reset)
const initialState = {
  someData: null,
  status: 'idle' as const,
};
```

### 2. Create Store

```typescript
export const use{Module}Store = create<{Module}State>()((set, get) => ({
  ...initialState,

  setSomeData: (data) => {
    set({ someData: data, status: 'ready' });
  },

  reset: () => {
    set(initialState);
  },
}));
```

### 3. Store Rules

- One store per module — do not split unless two genuinely independent state domains exist
- Actions are synchronous. Async operations belong in hooks that call store actions
- No middleware (persist, devtools, immer) unless explicitly justified
- Auth tokens MUST be in-memory only (DEC-6) — no persist middleware on auth store
- Initial state must be serializable — no class instances, functions, or Promises

### 4. For SignalR-Driven Stores (Battle, Chat)

The store must handle event-driven updates from SignalR managers:

```typescript
interface BattleState {
  phase: BattlePhase;
  // ... other battle state

  // Event handlers called from hooks that wire SignalR
  handleBattleStarted: (data: BattleStartedEvent) => void;
  handlePhaseChanged: (data: PhaseChangedEvent) => void;
  handleBattleStateUpdated: (data: BattleStateUpdate) => void;
  handleTurnResult: (data: TurnResultEvent) => void;
}
```

Each handler is a synchronous action that updates store state. The hook wires the SignalR manager events to these handlers.

### 5. For Guard-Consumed Stores (Player, Auth)

If route guards read this store, the data must be populated before guards evaluate:

- `GameStateLoader` fetches game state and populates `usePlayerStore` before rendering children
- `AuthGuard` reads `useAuthStore` for authentication status
- Guards use `getState()` pattern for synchronous reads — no async in guards

### 6. Write Unit Tests

```typescript
// src/modules/{module}/store.test.ts
import { use{Module}Store } from './store';

describe('{module} store', () => {
  beforeEach(() => {
    // Reset store between tests
    use{Module}Store.getState().reset();
  });

  it('should set data', () => {
    use{Module}Store.getState().setSomeData(testData);
    expect(use{Module}Store.getState().someData).toEqual(testData);
  });

  it('should reset to initial state', () => {
    use{Module}Store.getState().setSomeData(testData);
    use{Module}Store.getState().reset();
    expect(use{Module}Store.getState().someData).toBeNull();
  });
});
```

### 7. Create Consuming Hooks

```typescript
// src/modules/{module}/hooks.ts

// Selector hook for components
export function use{Module}Data() {
  return use{Module}Store(state => ({
    data: state.someData,
    status: state.status,
  }));
}

// Action hook (if combining store actions with transport)
export function use{Module}Actions() {
  const store = use{Module}Store();
  const queryClient = useQueryClient(); // if also invalidating TanStack queries

  const doSomething = useCallback(async (input: InputType) => {
    store.setStatus('loading');
    try {
      await transportFunction(input);
      store.setSomeData(result);
    } catch (err) {
      store.setStatus('error');
    }
  }, []);

  return { doSomething };
}
```

---

## Checklist

- [ ] Store file at `modules/{module}/store.ts`
- [ ] Single `create()` call — one store per module
- [ ] Named export: `use{Module}Store`
- [ ] Actions are synchronous (no `async` in `set` callbacks)
- [ ] Initial state extracted for `reset()` action
- [ ] No `any` types
- [ ] No middleware unless justified
- [ ] No `localStorage`/`sessionStorage` for auth tokens
- [ ] Unit tests at `modules/{module}/store.test.ts`
- [ ] Tests reset store in `beforeEach`
- [ ] All actions and transitions tested

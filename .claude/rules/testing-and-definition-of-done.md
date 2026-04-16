# Frontend Testing and Definition of Done

## Testing Approach

Frontend testing follows a pragmatic strategy: unit test pure logic, manual test UI and integration flows. No mandatory end-to-end test framework in the initial delivery.

---

## Mandatory Tests by Change Type

### Battle State Machine

Highest testing priority. The battle store's reducer/transition logic must be exhaustively unit-tested.

| Test | Proves |
|------|--------|
| Each phase transition fires on correct event | State machine correctness |
| Invalid transitions are rejected/ignored | No illegal states |
| `BattleStateUpdated` reconciles all mechanical state | Server is source of truth |
| `buildActionPayload` returns `typeof === 'string'` | SignalR contract (JSON string, not object) |
| `buildActionPayload` round-trips through `JSON.parse` | Payload structure correct |
| Zone pair validation (`isValidBlockPair`) | Ring topology constraints |
| NoAction fallback on timer expiry | Degraded path handled |
| Full turn sequence: action → result → next phase | End-to-end state flow |

### Zustand Stores

Pure store logic (actions, computed values) is unit-testable without React.

```typescript
// Test stores by calling actions directly on the store instance
const { getState, setState } = useBattleStore;
getState().someAction(payload);
expect(getState().someField).toBe(expected);
```

| Store | Required Tests |
|-------|---------------|
| `useBattleStore` | All phase transitions, action submission, state reconciliation, timer logic |
| `useChatStore` | Message append, deduplication, conversation switching, presence update |
| `useMatchmakingStore` | Queue join/leave, status polling state transitions |
| `usePlayerStore` | Game state update, character data population |
| `useAuthStore` | Token set/clear, auth status transitions |

### Transport Layer

Transport functions are pure async — testable with mocked fetch/SignalR.

| Transport | Required Tests |
|-----------|---------------|
| `client.ts` | Auth header injection, error normalization, base URL construction |
| `endpoints/*.ts` | Correct URL, method, body for each function |
| `BattleHubManager` | Event subscription/unsubscription, action send format |
| `ChatHubManager` | Event subscription/unsubscription, message send format |
| `matchmaking-poller.ts` | Start/stop lifecycle, callback invocation |

### Zone Model

Pure logic — must be unit tested.

- Valid attack/block zone pairs per ring topology rules
- All 5 zones enumerated correctly
- Edge cases: same zone for attack and block (if allowed), all-zone combinations

### Type Definitions

- No runtime tests needed, but TypeScript strict mode (`strict: true`) must pass
- API response types must match BFF contract (verified manually or via integration test)

---

## Manual Testing Requirements by Phase

Every phase has a manual testing gate before moving to the next.

| Phase | Manual Tests |
|-------|-------------|
| P0: Scaffold | Dev server runs (`pnpm dev`), TypeScript compiles (`pnpm tsc`), Tailwind renders |
| P1: Auth + Transport | Login via Keycloak, register, token refresh (wait 5min), authenticated API call succeeds, SignalR connects with token |
| P2: Routing | Every user state reaches correct screen, guards block unauthorized navigation, page refresh recovers state |
| P3: Onboarding | Full onboarding flow, validation errors display, state persists across refresh, revision mismatch (409) handled |
| P4: Chat | Two browsers: send/receive global message, send/receive DM, presence updates, rate limit shows error, reconnect after network drop |
| P5: Matchmaking | Two browsers: both queue → match → transition to battle screen, cancel queue, timeout behavior |
| P6: Battle State | Events process correctly (via debug view), all phase transitions fire, reconnection resyncs state |
| P7: Battle UI | Full battle through real UI, zone selector works, timer counts down, animations play, result overlay shows |
| P8: Post-Battle | Result screen displays, XP refreshes, level-up notification, chat resumes, re-queue works |
| P9: Hardening | Error scenarios (401, 409, 503, 500), disconnection/reconnection, browser close during battle, long sessions |

---

## What Counts as Tested

- Unit test exists and passes → tested
- Manual test performed and behavior verified in browser → tested (document what was checked)
- "I wrote the code and it compiles" → NOT tested

---

## Test Infrastructure

### Unit Tests

- Vitest as test runner (ships with Vite)
- No JSDOM unless testing React hooks that need it — prefer testing pure logic directly
- Mock `fetch` for transport tests, not for store tests
- No mocking Zustand stores in feature tests — test stores directly

### Test File Location

```
src/
  modules/battle/
    store.ts
    store.test.ts          # Co-located
    zones.ts
    zones.test.ts          # Co-located
  transport/http/
    client.ts
    client.test.ts         # Co-located
```

Tests co-located with source files as `{name}.test.ts` or `{name}.test.tsx`.

---

## Definition of Done by Deliverable Type

| Deliverable | Done When |
|-------------|-----------|
| Zustand store | Unit tests for all actions and transitions pass. Store integrates with consuming hook. |
| Transport endpoint file | Functions typed, match BFF contract, unit tested for request shape. |
| SignalR manager | Connect/disconnect lifecycle works, events fire typed callbacks, tested. |
| UI primitive | Renders correctly with all variant props, forwards className, no store deps. |
| Feature screen | Composes feature components, wired to store/hooks, manually tested in browser with all user states. |
| Route guard | Correct redirect for each user state, page refresh recovery verified manually. |
| Feature module (full) | Store tested, transport wired, screens render, guards work, manual test passes. |

---

## Forbidden Testing Patterns

| Pattern | Why |
|--------|-----|
| Snapshot tests for UI components | Brittle, low signal — test behavior not markup |
| Mocking Zustand stores in component tests | Test stores directly; test components with real stores |
| Testing implementation details (internal state shape) | Test observable behavior |
| `any` in test assertions | Type tests properly |
| Tests that require running backend | Unit/store tests must be isolated; integration needs explicit setup |
| Skipped tests (`it.skip`) without ticket reference | Fix or remove, don't skip indefinitely |

---

## Release Gates (Frontend)

Before declaring a phase complete:

1. All unit tests pass (`pnpm test`)
2. TypeScript compiles without errors (`pnpm tsc --noEmit`)
3. No ESLint errors (`pnpm lint`)
4. Manual test checklist for the phase verified in browser
5. No console errors during manual testing
6. Page refresh recovery works for all states introduced in the phase
7. Auth token refresh does not break the feature (test by waiting for token expiry)

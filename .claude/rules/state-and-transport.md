# State and Transport Responsibilities

## Why Two State Tools

Zustand and TanStack Query serve different purposes. Zustand owns state that is updated via push (SignalR events, user actions, auth tokens) or that must be read synchronously (route guards). TanStack Query owns server-state fetched via HTTP — it provides automatic caching, deduplication, background refetch, and retry that would be error-prone to reimplement in Zustand. Mixing both into a single tool creates either a bad cache (Zustand with manual invalidation) or bad real-time handling (TanStack Query fighting SignalR updates). Keep them separate; each does its job.

---

## Zustand Store Conventions

### Store File Structure

Each module has one store file (`store.ts`) with this structure:

```typescript
// modules/{module}/store.ts
import { create } from 'zustand';

interface {Module}State {
  // State fields
  // Actions
}

export const use{Module}Store = create<{Module}State>()((set, get) => ({
  // Initial state
  // Actions as methods
}));
```

### Rules

- One store per module. No store splitting unless a module genuinely has two independent state domains
- Store actions are synchronous state updates. Async operations happen in hooks, not stores
- Store selectors use Zustand's built-in selector pattern: `use{Module}Store(state => state.field)`
- No middleware (persist, devtools) unless explicitly justified — tokens are in-memory only (DEC-6)
- Stores must NOT import from `transport/` — hooks bridge stores and transport
- Initial state must be serializable (no class instances, no functions as state)

### Store Naming

| Module | Store Hook | Key State |
|--------|-----------|-----------|
| auth | `useAuthStore` | user identity, auth status, tokens (in-memory) |
| player | `usePlayerStore` | character data, game state, onboarding status |
| onboarding | `useOnboardingStore` | current step, validation state |
| matchmaking | `useMatchmakingStore` | queue status, polling active flag |
| battle | `useBattleStore` | battle phase, turn state, HP, narration, zones |
| chat | `useChatStore` | messages, conversations, presence, connection status |

---

## TanStack Query Conventions

### Query Key Structure

```typescript
// Consistent key factories per domain
export const gameKeys = {
  all: ['game'] as const,
  state: () => [...gameKeys.all, 'state'] as const,
};

export const playerKeys = {
  all: ['player'] as const,
  card: (identityId: string) => [...playerKeys.all, 'card', identityId] as const,
};

export const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  messages: (conversationId: string) => [...chatKeys.all, 'messages', conversationId] as const,
};
```

### Rules

- Query functions call `transport/http/endpoints/*` — never raw `fetch()`
- `staleTime` defaults: player cards = 30s, chat conversations = 10s, game state = 0 (always refetch)
- Mutations invalidate related query keys on success
- `useQuery` for reads, `useMutation` for writes — no custom fetch wrappers
- Error handling: `onError` callbacks in mutations, error boundaries for queries
- Retry: default 3 retries with exponential backoff for queries; no retry for mutations

### When to Use TanStack Query vs Zustand

| Data Source | Owner | Why |
|-------------|-------|-----|
| HTTP GET (cacheable, refetchable) | TanStack Query | Built-in caching, deduplication, background refetch |
| HTTP POST/PUT/DELETE results | TanStack Query mutation → invalidate | Atomic mutation + cache update |
| SignalR push events | Zustand | Real-time; no request/response cycle to cache |
| Auth tokens | Zustand | In-memory only, not cacheable server state |
| UI state (modal open, selected tab) | Component state or Zustand | Ephemeral, not server-derived |
| Game state (fetched once, read by guards) | Zustand (populated via HTTP) | Guards need synchronous access |

---

## SignalR Manager Conventions

### Manager Structure

```typescript
// transport/signalr/{name}-hub.ts
export class {Name}HubManager {
  private connection: HubConnection | null = null;

  async connect(accessToken: string): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }

  // Event subscriptions — return unsubscribe function
  onEventName(handler: (data: EventType) => void): () => void { /* ... */ }

  // Outbound actions
  async sendAction(payload: ActionType): Promise<void> { /* ... */ }
}
```

### Rules

- Managers are singleton-like: one instance per hub, managed by the hook that creates it
- Connection lifecycle managed by React hooks in the owning module (`useBattleConnection`, `useChatConnection`)
- Token passed at connect time; reconnection uses fresh token from auth store
- Reconnection: exponential backoff (1s, 2s, 4s, 8s, max 30s), automatic via `@microsoft/signalr` built-in
- Connection status exposed as typed state (Disconnected | Connecting | Connected | Reconnecting)
- Event handlers registered in hooks, which update Zustand stores

### Hub Scoping

| Hub | Endpoint | Lifecycle | Mounted At |
|-----|----------|-----------|-----------|
| BattleHub | `/battlehub` | Battle-scoped: connect on battle entry, disconnect on battle end/dismiss | `BattleShell` or battle hook |
| ChatHub | `/chathub` | Session-scoped: connect on authenticated entry, persist through battle | `AuthenticatedShell` |

### Battle Hub Events (Inbound)

- `BattleStarted` → initialize battle state
- `PhaseChanged` → transition battle phase
- `TurnResultReceived` → apply turn outcome
- `BattleStateUpdated` → full state reconciliation (source of truth)
- `BattleEnded` → transition to result phase
- `OpponentDisconnected` / `OpponentReconnected` → UI indicator

### Chat Hub Events (Inbound)

- `GlobalMessageReceived` → append to global chat
- `DirectMessageReceived` → append to conversation
- `PlayerOnline` / `PlayerOffline` → update presence
- `SystemMessage` → system notification

### Outbound Actions

- Battle: `SubmitAction(payload: string)` — payload MUST be `JSON.stringify()`'d string, not an object
- Chat: `SendGlobalMessage(content)`, `SendDirectMessage(recipientId, content)`

---

## HTTP Client Conventions

### Client Structure

```typescript
// transport/http/client.ts
// - Base URL from environment variable (VITE_API_BASE_URL)
// - Auth token injection via Authorization: Bearer header
// - Token retrieved from auth store at call time
// - Error normalization: API errors → typed ApiError
// - No retry logic in client (TanStack Query handles retry)
```

### Endpoint File Structure

```typescript
// transport/http/endpoints/{domain}.ts
import { httpClient } from '../client';
import type { SomeRequest, SomeResponse } from '@/types/api';

export async function getSomething(): Promise<SomeResponse> {
  return httpClient.get<SomeResponse>('/api/v1/something');
}

export async function createSomething(data: SomeRequest): Promise<void> {
  return httpClient.post('/api/v1/something', data);
}
```

### Rules

- One endpoint file per BFF domain group: `game.ts`, `character.ts`, `queue.ts`, `battle.ts`, `chat.ts`, `players.ts`
- Functions are plain async functions, not classes
- Return typed responses from `types/api.ts`
- Error handling: throw on non-2xx; caller (TanStack Query or hook) handles
- No caching, no retry, no state management — transport is dumb pipes

---

## Polling Conventions

Matchmaking uses polling (not WebSocket) for queue status.

```typescript
// transport/polling/matchmaking-poller.ts
// - setInterval-based
// - Calls transport/http/endpoints/queue.ts
// - Returns data via callback
// - Lifecycle managed by useMatchmakingStore hook
// - Interval: 2-3 seconds while searching
// - Stops on: match found, queue left, component unmount
```

No other feature uses polling. Battle and chat use SignalR push exclusively.

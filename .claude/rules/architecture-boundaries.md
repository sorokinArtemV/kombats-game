# Frontend Architecture Boundaries

## Layer Responsibilities

The Kombats frontend has four layers with strict separation. No layer may reach into another's internals.

```
app/          → Shell, routing, guards, entry point
modules/      → Feature state, screens, feature components
transport/    → HTTP, SignalR, polling — no UI
ui/           → Stateless, theme-driven primitives — no business logic
types/        → Shared TypeScript definitions
```

---

## Dependency Direction

```
app/ → modules/ → transport/
                → ui/
                → types/
transport/ → types/
ui/ → types/ (styling only — no transport, no stores)
```

### What Each Layer May Import

| Layer | May Import | Must NOT Import |
|-------|-----------|-----------------|
| `app/` | `modules/` (screens, guards), `ui/`, `types/` | `transport/` directly |
| `modules/` | `transport/` (via hooks), `ui/`, `types/`, other modules' public hooks (rare) | Other modules' stores directly, other modules' internal components |
| `transport/` | `types/` | `modules/`, `ui/`, `app/`, React, Zustand, TanStack Query |
| `ui/` | `types/` (for prop types) | `modules/`, `transport/`, `app/`, Zustand, TanStack Query |
| `types/` | Nothing | Everything |

---

## Module Isolation

Each module under `modules/` owns a domain vertical:

| Module | Owns | Does NOT Own |
|--------|------|-------------|
| `auth` | OIDC state, token lifecycle, AuthProvider, AuthCallback | HTTP client, route guards |
| `player` | Character state, lobby screen, stat allocation, player card | Matchmaking queue, battle |
| `onboarding` | Onboarding step state, name/stats screens | Auth flow, lobby |
| `matchmaking` | Queue state, searching screen, polling hook | Battle state, pairing logic |
| `battle` | Battle state machine, battle screens, zone model, narration | Chat during battle, matchmaking |
| `chat` | Messages, conversations, presence, chat UI | Battle events, player stats |

### Cross-Module Rules

- Modules communicate through Zustand store reads (not writes) or shared hooks
- A module must NOT directly write to another module's store
- Shared data flows through `transport/` or `app/`-level coordination (guards, shells)
- If two modules need the same data, the data belongs in a shared store or is fetched independently

---

## Transport Layer Isolation

The `transport/` directory is the only code that touches the network. Components and stores never call `fetch()`, construct URLs, or reference `HubConnection` directly.

### transport/http/

- `client.ts` — fetch wrapper with auth token injection, error normalization, base URL
- `endpoints/*.ts` — typed functions per BFF endpoint group (game, character, queue, battle, chat, players)
- Returns typed responses or throws typed errors
- No React imports, no store imports

### transport/signalr/

- `battle-hub.ts` — BattleHubManager: connect, disconnect, event subscriptions, send actions
- `chat-hub.ts` — ChatHubManager: connect, disconnect, event subscriptions, send messages
- `connection-state.ts` — shared connection status types
- Managers are plain TypeScript classes, not React components
- Managers expose typed event callbacks; modules wire them in hooks

### transport/polling/

- `matchmaking-poller.ts` — setInterval-based polling for queue status
- Returns data via callback; module hook manages lifecycle

### Rules

- No UI components in `transport/`
- No Zustand or TanStack Query in `transport/`
- Transport functions accept/return plain TypeScript types from `types/`
- Error handling: transport throws typed errors; consuming hooks handle them
- Auth token injection happens in `client.ts`, not in individual endpoints

---

## State Ownership

### Two-State Model

| Concern | Owner | Tool |
|---------|-------|------|
| Client/realtime state (auth, battle phases, chat messages, queue status) | Zustand stores in `modules/` | Zustand 5 |
| Server-state HTTP caching (game state, player cards, chat history) | TanStack Query | TanStack Query 5 |

### Rules

- SignalR push events update Zustand stores directly (via hub manager callbacks wired in hooks)
- HTTP GET responses are cached in TanStack Query
- Mutations (POST/PUT/DELETE) go through TanStack Query mutations, then invalidate relevant queries
- A Zustand store must NOT cache HTTP response data that TanStack Query already manages — pick one owner
- Exception: game state is fetched via HTTP but stored in Zustand (`player` store) because guards depend on synchronous reads

---

## Routing as State Projection

Routes are projections of application state, not independent navigation targets.

- Guards read from Zustand stores and redirect programmatically
- No `navigate()` calls scattered in feature components — state changes trigger guard re-evaluation
- Route guard hierarchy is defined in `app/router.tsx` and enforced by shell/guard components in `app/`
- Modules define screens; `app/` decides when to show them

---

## Forbidden Patterns

| Pattern | Why |
|--------|-----|
| `fetch()` or `new HubConnection()` in components/stores | Transport isolation violation |
| Store writes from outside the owning module | Module boundary violation |
| Business logic in `ui/` components | UI must be stateless primitives |
| Domain types in HTTP request/response shapes | Transport uses DTOs from `types/api.ts` |
| React imports in `transport/` | Transport is framework-agnostic |
| Direct SignalR event handling in components | Events flow through store hooks |
| `localStorage` for auth tokens | Security violation (DEC-6: XSS risk with chat) |
| Cross-module store imports for writes | Modules own their state exclusively |
| Route guards that call APIs directly | Guards read stores; `GameStateLoader` fetches |
| Inline styles for static values or CSS modules | Tailwind classes; `style` only for dynamic computed values |

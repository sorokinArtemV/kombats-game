# Kombats Frontend Client Architecture

## Changelog

**2026-04-16 -- Initial version**
**2026-04-16 -- Revision 1:** Chat during battle decision revised. `/chathub` connection now maintained during battle (product decision). DM UI with current opponent suppressed during active battle. Updated D1, Section 4.3, Section 4.8.3, DEC-2, chat module responsibilities, chat state specification, and next-step decisions.

---

## 1. Purpose and scope

This document defines the production architecture for the Kombats frontend client. It covers technology stack, application structure, state management, transport layer, UI architecture, and module boundaries.

**Inputs used:**
- `01-backend-revision-for-frontend.md` -- backend integration contract
- `02-client-product-and-architecture-requirements.md` -- product and architecture requirements
- `03-flow-feasibility-validation.md` -- feasibility validation

**What this document is:** A binding architecture specification. Decisions made here constrain implementation. Deviations require explicit justification.

**What this document is not:** An implementation plan, task breakdown, or component-level API reference. Those follow this document.

---

## 2. Architecture drivers

These are the real constraints derived from the input documents. They are listed in priority order and directly shape every architectural decision that follows.

### D1: Two independent real-time channels with different lifecycles

The battle hub (`/battlehub`) and chat hub (`/chathub`) are separate SignalR connections with different connection lifecycles, reconnection semantics, and event models. Battle is battle-scoped (connect on battle entry, disconnect on battle end). Chat is session-scoped (connected from lobby entry through battle and back). Both connections coexist during battle. Both require independent connection state management, reconnection with exponential backoff, and state resynchronization on reconnect.

**Architecture consequence:** The transport layer must manage multiple independent SignalR connections as first-class concerns, not as an afterthought bolted onto a single connection manager.

### D2: Server-authoritative state with push events and no confirmation

Battle state is entirely server-authoritative. Turn submissions are fire-and-forget with no acknowledgment. Invalid actions are silently degraded to no-ops. The client must model optimistic local state (e.g., "submitted" indicator) while treating push events as the source of truth.

**Architecture consequence:** Battle state must be modeled as a state machine driven by server events, not by client actions. Client-side state is display-only and is overwritten on every authoritative sync event.

### D3: Matchmaking is poll-based; everything else is push or pull

Matchmaking status discovery is the only polling transport in the application. All other data is either push (SignalR events) or on-demand pull (HTTP). This creates a mixed transport model where three different communication patterns coexist.

**Architecture consequence:** The transport layer must abstract over HTTP, SignalR, and polling uniformly. Feature code should not know which transport is in use.

### D4: Full visual reskin must be possible without touching logic

REQ-R1 through REQ-R5 require that game flow, state management, and backend integration are independently modifiable from presentation. This is not aspirational -- it is a hard requirement for V1.

**Architecture consequence:** Strict layering between state/flow, transport, and presentation. No business logic in components. No transport calls in components. Components receive data and emit intents.

### D5: Hard gates control navigation

Onboarding, active battle, and authentication are hard gates. A player in Draft state cannot see the lobby. A player with an active battle cannot navigate anywhere except the battle. These gates are state-driven, not route-driven.

**Architecture consequence:** Routing is a projection of application state, not an independent concern. Route guards derive from a central state machine, not from per-route checks scattered across the codebase.

### D6: Reconnection and recovery are first-class flows

The app must recover cleanly from page refresh, browser close, token expiry, and connection loss -- in any combination and at any point in the user journey. `GET /api/v1/game/state` is the universal recovery entry point.

**Architecture consequence:** Application startup is always a recovery flow. There is no "fresh start" path that skips state resolution. The startup sequence is: authenticate -> fetch game state -> route to correct screen -> establish appropriate connections.

### D7: Multiple event types arrive in defined sequences within a turn

Battle events within a single turn arrive sequentially: `PlayerDamaged` -> `TurnResolved` -> `TurnOpened`/`BattleEnded` -> `BattleStateUpdated` -> `BattleFeedUpdated`. The UI must handle intermediate states gracefully. `BattleFeedUpdated` may lag behind mechanical events.

**Architecture consequence:** Battle state updates should be processed as a reducer over incoming events, not as independent state slices that can race. The narration feed is decoupled from the mechanical state machine.

---

## 3. Recommended frontend stack

### 3.1 Core framework: React 19 + Vite

**React** is the correct choice for this project. The component model maps well to the UI (lobby panels, battle HUD, chat feeds, player cards), the ecosystem has mature SignalR and OIDC libraries, and the existing Figma Make prototype is already React-based (reusable visual elements are possible).

**Vite over Next.js.** This is a critical decision. Next.js is wrong for Kombats. Here is why:

| Concern | Next.js | Vite SPA |
|---------|---------|----------|
| Rendering model | SSR/RSC by default; you fight it for client-only features | Client-only; no server process to deploy or manage |
| SignalR | Awkward in RSC; requires "use client" escape hatches everywhere | Native -- SignalR is a browser-only concern |
| Auth model | Wants server-side session; Kombats uses stateless JWT + Keycloak redirect | OIDC PKCE in browser is the natural fit |
| Deployment | Requires Node.js server runtime | Static files served by any CDN or reverse proxy |
| Matchmaking polling | Trivial in either, but Next.js adds no value | Trivial |
| SEO | Kombats is a game behind auth. No public pages need indexing. | N/A -- no SEO requirement |
| Complexity budget | Significant framework surface area for RSC, routing, caching, middleware | Minimal -- just a build tool |

Kombats is a stateful, real-time, authenticated game client. It has zero server-rendering needs. Every screen is behind authentication. The two SignalR connections are browser-only. The OIDC flow is browser-only. Next.js adds infrastructure complexity (Node.js server, server/client boundary management, RSC mental model) with zero benefit for this application.

**Vite** provides fast dev server, fast builds, zero runtime opinions, and the existing Figma prototype already uses Vite.

### 3.2 Routing: React Router 7

The existing prototype uses `react-router` 7. React Router is the most mature client-side routing library for React. It supports:
- Declarative route definitions
- Route guards (via layout routes and loaders)
- Programmatic navigation (needed for hard gate enforcement)
- URL parameter extraction (for battle IDs, player IDs)

TanStack Router is an alternative with better type safety, but React Router 7 is sufficient, well-understood, and already in the prototype. No reason to switch.

### 3.3 State management: Zustand

**Zustand** is the correct choice for Kombats client state. Evaluation:

| Library | Fit for Kombats | Reasoning |
|---------|----------------|-----------|
| Zustand | Best fit | Minimal API, store-per-concern, no boilerplate, excellent TypeScript support, works naturally with external event sources (SignalR) |
| Redux Toolkit | Overweight | The ceremony (slices, reducers, actions, selectors) is disproportionate to the complexity of Kombats state. Adds ~15KB for no benefit over Zustand. |
| Jotai/Recoil | Wrong model | Atom-based state is better for forms and independent UI state. Kombats has coherent state machines (battle, matchmaking, chat) that are better modeled as stores. |
| React Context | Too primitive | Fine for static/rarely-changing values (theme, auth token). Wrong for frequently-updating state (battle HP, chat messages, presence). Causes unnecessary re-renders. |
| XState | Considered for battle | XState is excellent for formal state machines, but it adds significant conceptual overhead and learning curve for a team. Zustand with a simple state-machine pattern (explicit phase enum + transitions) achieves the same correctness with less indirection. |

**Zustand stores per concern**, not a single global store. Each feature domain (auth, battle, matchmaking, chat, player) owns its store. Stores are plain objects updated by transport-layer event handlers, consumed by UI via selectors.

### 3.4 Server state management: TanStack Query (React Query)

**TanStack Query v5** for all HTTP request state. This handles:
- Caching and deduplication of `GET /api/v1/game/state`, player card fetches, chat history
- Automatic refetching on window focus (useful for post-battle XP refresh)
- Retry with backoff on transient failures
- Stale-while-revalidate for player cards and conversation lists
- Mutation management for commands (`POST` endpoints)

**Why separate from Zustand:** Server-state (data fetched from HTTP) and client-state (UI state, connection status, local form state) have fundamentally different lifecycles. TanStack Query manages server-state caching; Zustand manages client-state and real-time push state. Mixing them creates confusion about cache invalidation vs. state transitions.

**SignalR push data goes through Zustand, not TanStack Query.** TanStack Query is for request/response HTTP. Push events from SignalR update Zustand stores directly.

### 3.5 SignalR client: @microsoft/signalr

The official `@microsoft/signalr` npm package. This is the only viable option for connecting to ASP.NET Core SignalR hubs. No alternatives exist.

### 3.6 Auth: oidc-client-ts

**`oidc-client-ts`** for Keycloak OIDC integration. It provides:
- Authorization Code flow with PKCE (required for SPA)
- Silent token renewal
- Token storage management
- Redirect handling (login and registration)

This is the standard library for browser OIDC. Lighter and more focused than `@auth0/auth0-react` or `next-auth` (neither of which fits a Keycloak + Vite setup).

A thin wrapper (`react-oidc-context`) provides React integration.

### 3.7 Styling: Tailwind CSS 4 + CSS variables for design tokens

**Tailwind CSS** is already used in the Figma Make prototype and is the right choice for Kombats:
- Utility-first approach keeps styles co-located with components (fast iteration)
- Design token system via CSS custom properties satisfies REQ-R4 (theme isolation)
- No runtime CSS-in-JS cost (important during battle animations)
- `tailwind-merge` for conditional class composition

**Design tokens as CSS variables** (not Tailwind config values). All colors, spacing scales, typography, and visual constants are defined as CSS custom properties in a theme file. Tailwind utilities reference these variables. A reskin replaces the theme file; no component changes needed.

**Shadcn/ui pattern** for base components. Shadcn is not a library -- it's a copy-paste component collection built on Radix UI primitives. The Figma prototype already uses Radix primitives. We adopt the pattern (own the component code, built on Radix for accessibility) without depending on shadcn as a package.

### 3.8 Full dependency list

| Package | Role | Justification |
|---------|------|---------------|
| `react` 19 | UI framework | Core |
| `react-dom` 19 | DOM rendering | Core |
| `react-router` 7 | Client-side routing | Navigation, route guards |
| `zustand` 5 | Client state management | Battle, matchmaking, chat, auth state |
| `@tanstack/react-query` 5 | Server state management | HTTP request caching, mutations |
| `@microsoft/signalr` 8 | SignalR client | Battle and chat real-time connections |
| `oidc-client-ts` | OIDC auth | Keycloak token lifecycle |
| `react-oidc-context` | React OIDC integration | Auth context provider |
| `tailwindcss` 4 | Utility CSS | Styling |
| `@radix-ui/*` (select primitives) | Accessible UI primitives | Dialog, tooltip, scroll area, tabs |
| `clsx` + `tailwind-merge` | Class composition | Conditional styling |
| `lucide-react` | Icons | Icon set (already in prototype) |
| `motion` (Framer Motion) | Animation | Battle animations, transitions |
| `sonner` | Toast notifications | DM notifications, level-up alerts, errors |
| `date-fns` | Date formatting | Chat timestamps, turn deadlines |

**Not included (and why):**
- No `axios` -- `fetch` API with a thin wrapper is sufficient; TanStack Query handles retry/caching
- No `socket.io` -- SignalR is the transport; no WebSocket abstraction needed
- No `formik` / `react-hook-form` -- forms are minimal (name input, stat allocation); native form handling suffices. If needed later, `react-hook-form` can be added for the specific form
- No `i18next` -- i18n is out of scope for V1
- No state machine library (XState) -- Zustand with explicit phase enums provides sufficient rigor for Kombats

---

## 4. Application architecture

### 4.1 Application layers

```
+---------------------------------------------------+
|                   UI Layer                         |
|  (React components, screens, layout, animations)  |
+---------------------------------------------------+
          |  reads state via hooks  |  emits intents
+---------------------------------------------------+
|                Feature Layer                       |
|  (Zustand stores, state machines, business logic)  |
|  auth | battle | matchmaking | chat | player       |
+---------------------------------------------------+
          |  calls transport  |  receives events
+---------------------------------------------------+
|              Transport Layer                        |
|  (HTTP client, SignalR managers, polling service)   |
+---------------------------------------------------+
          |  network I/O
+---------------------------------------------------+
|              BFF API                                |
+---------------------------------------------------+
```

**Rules:**
- UI Layer imports from Feature Layer (hooks that read stores). Never imports from Transport Layer.
- Feature Layer imports from Transport Layer. Never imports from UI Layer.
- Transport Layer imports from nothing above it. Exposes typed interfaces consumed by Feature Layer.
- No circular dependencies between layers.

### 4.2 Routing model

Routes are a projection of application state. The router does not own navigation logic -- state changes drive route transitions.

```
/                       -> Landing (unauthenticated)
/auth/callback          -> OIDC callback handler
/onboarding/name        -> Name selection (Draft state)
/onboarding/stats       -> Initial stat allocation (Named state)
/lobby                  -> Main lobby with chat
/matchmaking            -> Searching screen (active queue)
/battle/:battleId       -> Active battle
/battle/:battleId/result -> Battle result screen
```

**Route guard hierarchy:**

```
<AuthGuard>              // Redirects to / if not authenticated
  <GameStateLoader>      // Fetches game state, determines correct route
    <OnboardingGuard>    // Forces /onboarding/* if not Ready
      <BattleGuard>      // Forces /battle/:id if active battle exists
        <AppShell>       // Lobby layout with chat sidebar
          <Outlet />     // Lobby, matchmaking, etc.
        </AppShell>
      </BattleGuard>
    </OnboardingGuard>
  </GameStateLoader>
</AuthGuard>
```

Guards are nested layout routes. Each guard reads from the relevant Zustand store and redirects if its condition is not met. Guards do not fetch data -- they read already-loaded state.

`GameStateLoader` is the exception: it triggers the initial `GET /api/v1/game/state` fetch and blocks rendering until the response determines routing. This is the REQ-S1 startup resolution.

### 4.3 Application shell

The app shell provides persistent UI structure around routed content:

- **Authenticated shell (lobby):** Header (character name, level, stats summary) + main content area + chat sidebar (global chat + online players + DM access). Chat connection is established when this shell mounts.
- **Battle shell:** Full-screen battle UI. No lobby chrome. Chat connection remains active (session-scoped). Global chat may be displayed in a collapsed/minimized panel at product discretion. DM UI with the current battle opponent is suppressed during the active battle. Battle hub connection established when this shell mounts.
- **Onboarding shell:** Minimal shell. No chat, no lobby features. Focused single-flow UI.
- **Unauthenticated shell:** Landing page with Register/Login. No app features visible.

### 4.4 Module boundaries

Each feature module owns:
- Its Zustand store (state + actions)
- Its transport integration (which HTTP endpoints / SignalR events it uses)
- Its screens and components
- Its types (DTOs, enums, state shapes)

Modules communicate through:
- Reading each other's stores (read-only, via exported selectors)
- Shared events (e.g., "battle ended" triggers lobby refresh)

Modules do NOT:
- Import each other's internal components
- Call each other's transport functions
- Mutate each other's stores

### 4.5 State ownership model

| State domain | Owner | Store type | Data source | Update mechanism |
|---|---|---|---|---|
| Auth (token, user identity, auth status) | `auth` module | Zustand | oidc-client-ts | OIDC events |
| Game state (character, onboarding, queue status) | `player` module | Zustand + TanStack Query | `GET /api/v1/game/state` | HTTP fetch, cache invalidation |
| Battle state (phase, HP, turn, deadline, events) | `battle` module | Zustand | `/battlehub` SignalR | Push events via reducer |
| Battle narration | `battle` module | Zustand | `BattleFeedUpdated` events + HTTP feed | Push + pull |
| Matchmaking status | `matchmaking` module | Zustand | `GET /api/v1/queue/status` | Polling |
| Chat messages (global + DM) | `chat` module | Zustand | `/chathub` SignalR + HTTP history | Push events + pull for history |
| Online players (presence) | `chat` module | Zustand | `/chathub` SignalR events | Push events |
| Chat connection state | `chat` module | Zustand | `/chathub` connection lifecycle | Connection events |
| Player cards (other players) | `player` module | TanStack Query cache | `GET /api/v1/players/{id}/card` | HTTP fetch, stale-while-revalidate |
| UI-local state (form inputs, scroll position, panel open/closed) | Component-local | `useState` / `useRef` | User interaction | Direct |

### 4.6 Server-state vs client-state separation

**Server-state** (managed by TanStack Query):
- Game state (`GET /api/v1/game/state`)
- Player cards (`GET /api/v1/players/{id}/card`)
- Chat conversation list (`GET /api/v1/chat/conversations`)
- Chat message history (`GET /api/v1/chat/conversations/{id}/messages`, `GET /api/v1/chat/direct/{id}/messages`)
- Battle feed (`GET /api/v1/battles/{id}/feed`)

These are request/response, cacheable, and benefit from TanStack Query's deduplication, background refetching, and stale management.

**Client-state / real-time state** (managed by Zustand):
- Auth status and token
- Battle state machine (updated by SignalR push events)
- Matchmaking status (updated by polling)
- Chat message feeds (updated by SignalR push events)
- Online players list (updated by SignalR push events)
- Connection states (battle hub, chat hub)
- Turn input (selected zones before submission)
- UI preferences (chat panel collapsed, etc.)

These are either locally-generated or pushed from the server in real-time. They don't fit the request/response caching model.

### 4.7 Transport layer design

The transport layer is a set of typed service objects, not raw fetch calls scattered across components.

#### 4.7.1 HTTP client

A thin wrapper around `fetch` that:
- Injects `Authorization: Bearer <token>` on every request
- Intercepts 401 responses and triggers auth refresh/logout
- Parses error responses into typed error objects
- Provides typed methods per endpoint (e.g., `api.game.getState()`, `api.queue.join()`)

```
transport/
  http/
    client.ts           -- fetch wrapper with auth injection
    endpoints/
      game.ts           -- getState(), onboard()
      character.ts      -- setName(), allocateStats()
      queue.ts          -- join(), leave(), getStatus()
      battle.ts         -- getFeed()
      chat.ts           -- getConversations(), getMessages(), getDirectMessages(), getOnlinePlayers()
      players.ts        -- getCard()
```

#### 4.7.2 SignalR managers

Two independent connection managers, one per hub. Each manager:
- Owns a single `HubConnection` instance
- Handles connection lifecycle (connect, disconnect, reconnect)
- Configures automatic reconnection with exponential backoff
- Injects JWT via `accessTokenFactory`
- Exposes typed methods for hub invocations
- Routes incoming events to the appropriate Zustand store updater
- Exposes connection state as an observable value (connected, disconnected, reconnecting)

```
transport/
  signalr/
    battle-hub.ts       -- BattleHubManager: connect, joinBattle, submitTurnAction, disconnect
    chat-hub.ts         -- ChatHubManager: connect, joinGlobalChat, sendGlobalMessage, sendDirectMessage, leaveGlobalChat, disconnect
    connection-state.ts -- shared types for connection status
```

**Reconnection policy:**
- Automatic reconnect with delays: [0, 1s, 2s, 5s, 10s, 30s]
- After 6 failed attempts, stop and show "connection lost" UI
- On reconnect:
  - Battle hub: automatically call `JoinBattle(battleId)` to resync state
  - Chat hub: automatically call `JoinGlobalChat()` to resync messages and presence

**Token refresh integration:** Both managers must handle token expiry. If the token expires during an active connection, the managers must obtain a fresh token before reconnecting. The `accessTokenFactory` callback retrieves the current valid token from the auth module.

#### 4.7.3 Polling service

A single polling concern for matchmaking:

```
transport/
  polling/
    matchmaking-poller.ts  -- start(interval), stop(), manages setInterval + cleanup
```

The poller calls `api.queue.getStatus()` at the configured interval and updates the matchmaking Zustand store. It is started when entering the searching state and stopped on match found, cancellation, or unmount.

### 4.8 SignalR integration design

#### 4.8.1 Battle hub event flow

```
BattleHubManager
  -> on("BattleReady", data)     -> battleStore.handleBattleReady(data)
  -> on("TurnOpened", data)      -> battleStore.handleTurnOpened(data)
  -> on("PlayerDamaged", data)   -> battleStore.handlePlayerDamaged(data)
  -> on("TurnResolved", data)    -> battleStore.handleTurnResolved(data)
  -> on("BattleStateUpdated", d) -> battleStore.handleStateUpdated(data)  // authoritative sync
  -> on("BattleEnded", data)     -> battleStore.handleBattleEnded(data)
  -> on("BattleFeedUpdated", d)  -> battleStore.handleFeedUpdated(data)
  -> on("BattleConnectionLost")  -> battleStore.handleConnectionLost()
```

The battle store processes events through a reducer-like pattern. Each handler transitions the store's phase enum and updates relevant fields. `BattleStateUpdated` is the reconciliation point that overwrites all mechanical state.

#### 4.8.2 Chat hub event flow

```
ChatHubManager
  -> on("GlobalMessageReceived", data)  -> chatStore.addGlobalMessage(data)
  -> on("DirectMessageReceived", data)  -> chatStore.addDirectMessage(data)
  -> on("PlayerOnline", data)           -> chatStore.addOnlinePlayer(data)
  -> on("PlayerOffline", data)          -> chatStore.removeOnlinePlayer(data)
  -> on("ChatError", data)              -> chatStore.handleChatError(data)
  -> on("ChatConnectionLost")           -> chatStore.handleConnectionLost()
```

#### 4.8.3 Connection lifecycle management

Connection managers are created and destroyed by feature-level hooks, not by components:

- `useBattleConnection(battleId)` -- creates/connects the battle hub when a battle is active, disconnects on cleanup. Called by the battle shell.
- `useChatConnection()` -- creates/connects the chat hub when the authenticated app shell mounts, disconnects on cleanup. The chat connection persists across lobby and battle screens because it is mounted at the authenticated shell level, above the battle/lobby route split.

These hooks are the bridge between React component lifecycle and transport-layer connections. They do not contain business logic -- they call manager methods and return connection state.

### 4.9 Auth / token lifecycle design

```
Auth Flow:

1. App loads -> check for existing token in storage
   |-- Valid token -> proceed to GameStateLoader
   |-- Expired token -> attempt silent renewal
   |   |-- Renewal succeeds -> proceed
   |   +-- Renewal fails -> redirect to login
   +-- No token -> show unauthenticated landing

2. User clicks Login -> oidc-client-ts redirects to Keycloak
3. User clicks Register -> oidc-client-ts redirects to Keycloak registration page
4. Keycloak redirects back to /auth/callback
5. Callback handler extracts tokens -> stores in memory -> redirects to /
6. App loads again -> valid token -> proceed

Token Refresh:
- oidc-client-ts handles silent renewal automatically before expiry
- On renewal failure -> clear auth state -> redirect to landing
- SignalR accessTokenFactory reads the current token from auth store
- HTTP client reads the current token from auth store

Token Storage:
- Access token: in-memory only (Zustand auth store)
- Refresh token: in-memory (oidc-client-ts manages this)
- No localStorage for tokens (XSS risk in a game with chat input)

Identity Extraction:
- User identity ID (for own player card workaround): extracted from JWT `sub` claim
- Display name: extracted from JWT `preferred_username` claim
- Both stored in auth store on login
```

### 4.10 Error and reconnection model

#### 4.10.1 HTTP errors

All HTTP errors are intercepted by the transport layer and normalized into a typed error:

```typescript
type ApiError = {
  code: string;       // e.g., "service_unavailable", "invalid_request"
  message: string;    // human-readable
  traceId?: string;   // for support
  status: number;     // HTTP status
  fieldErrors?: Record<string, string[]>;  // for 400 validation errors
};
```

Error handling hierarchy:
1. **401** -> auth module handles globally (clear state, redirect to login)
2. **400 with field errors** -> returned to the calling mutation for inline display
3. **409** (conflict) -> returned to calling code for specific handling (name taken, already matched, revision mismatch)
4. **503** (service unavailable) -> shown as degraded state toast, feature-specific handling
5. **500** -> generic error toast with trace ID

#### 4.10.2 SignalR reconnection

Both hubs use the same reconnection strategy:

1. Connection drops -> SignalR client enters "Reconnecting" state -> UI shows indicator
2. Automatic retry with exponential backoff: [0, 1s, 2s, 5s, 10s, 30s]
3. On successful reconnect -> re-establish context:
   - Battle: `JoinBattle(battleId)` -> update store with snapshot
   - Chat: `JoinGlobalChat()` -> update store with messages + presence
4. If all retries exhausted -> "Connection lost" UI with manual retry button
5. On `BattleConnectionLost` / `ChatConnectionLost` event (server-initiated) -> treat as connection drop, begin reconnection

#### 4.10.3 Matchmaking polling resilience

- Single poll failure -> retry on next interval, no user notification
- 3+ consecutive failures -> show "Connectivity issue" warning
- Polling resumes automatically when connectivity returns
- If server returns unexpected status during polling -> log and continue polling

---

## 5. UI architecture

### 5.1 Screen composition approach

Screens are composed of three types of elements:

1. **Layout shells** -- define the structural frame (header, sidebar, main area). Persistent across route changes within a flow.
2. **Feature panels** -- self-contained feature UI blocks (chat panel, online players panel, stat allocation form, battle HUD). Each connects to its own store via hooks.
3. **Shared UI primitives** -- buttons, inputs, cards, dialogs, progress bars. Stateless. Styled via design tokens.

A screen is assembled by a layout shell that places feature panels and primitives. The screen component itself contains no business logic -- it is a composition point.

Example -- Lobby screen:
```
<LobbyShell>
  <Header>
    <CharacterSummary />   // reads player store
    <QueueButton />        // reads player store, calls matchmaking transport
  </Header>
  <MainArea>
    <StatAllocation />     // reads player store, calls character transport (if unspent points)
  </MainArea>
  <Sidebar>
    <ChatPanel />          // reads chat store
    <OnlinePlayersList />  // reads chat store
  </Sidebar>
</LobbyShell>
```

### 5.2 Shared UI strategy

Shared UI components live in a `ui/` module. They are:
- Purely presentational (no store access, no transport calls)
- Styled via design tokens (CSS variables referenced through Tailwind utilities)
- Accessible (built on Radix primitives where applicable)
- Documented with their prop interfaces

Categories:
- **Layout:** `Container`, `Stack`, `Grid`, `Divider`
- **Feedback:** `Toast`, `Badge`, `Spinner`, `ProgressBar`, `ConnectionIndicator`
- **Input:** `Button`, `TextInput`, `Select`
- **Display:** `Card`, `Avatar`, `StatBar`, `Timer`, `Tooltip`
- **Overlay:** `Dialog`, `Sheet` (slide-in panel for player cards, DM conversations)

### 5.3 Theming / design tokens / reskin strategy

**Token architecture:**

```css
/* theme/tokens.css -- the single file replaced during a reskin */
:root {
  /* Color palette */
  --color-bg-primary: #0a0a12;
  --color-bg-secondary: #1a1a2e;
  --color-bg-surface: #16213e;
  --color-text-primary: #e0e0e0;
  --color-text-secondary: #a0a0b0;
  --color-accent: #e94560;
  --color-accent-hover: #ff6b6b;
  --color-success: #4ade80;
  --color-warning: #fbbf24;
  --color-danger: #ef4444;

  /* HP bar colors */
  --color-hp-high: #4ade80;
  --color-hp-medium: #fbbf24;
  --color-hp-low: #ef4444;

  /* Zone colors (battle) */
  --color-zone-head: ...;
  --color-zone-chest: ...;
  /* etc. */

  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* Typography */
  --font-primary: 'Inter', sans-serif;
  --font-display: 'Orbitron', sans-serif;  /* game UI headings */
  --font-mono: 'JetBrains Mono', monospace; /* battle log */

  /* Border radii, shadows, transitions, etc. */
}
```

**Reskin process:**
1. Replace `theme/tokens.css` with new values
2. Replace icon set if needed (swap Lucide for another)
3. Replace font files
4. Adjust component-level Tailwind classes only if layout structure changes (rare)
5. No changes to stores, transport, routing, or business logic

**Tailwind integration:** Tailwind config references CSS variables:
```css
/* In Tailwind 4, this is done via @theme in CSS */
@theme {
  --color-bg-primary: var(--color-bg-primary);
  /* ... mapped tokens */
}
```

### 5.4 Decoupling business logic from components

**Rules enforced by convention and code review:**

1. Components never call transport functions directly. They call store actions or use mutations from TanStack Query hooks.
2. Components never contain conditional logic based on backend state transitions. A component may say "if phase is TurnOpen, show input form" -- it may not say "if we just received TurnResolved AND previous turn was a crit AND..."
3. State machines live in stores. Components project state, they don't compute it.
4. Components receive data via hooks (`useBattleStore(selector)`, `useChatStore(selector)`). They emit user intents by calling actions (`battleStore.submitAction(...)`, `chatStore.sendMessage(...)`).
5. Animations and transitions are driven by state changes observed via hooks, not by imperative calls inside event handlers.

---

## 6. Feature / module map

### 6.1 Module structure

```
src/
  app/                          -- Application shell, routing, entry point
    App.tsx                     -- Root component, providers
    router.tsx                  -- Route definitions and guards
    shells/
      AuthenticatedShell.tsx    -- Lobby layout with header + sidebar
      BattleShell.tsx           -- Full-screen battle layout
      OnboardingShell.tsx       -- Minimal onboarding layout
      UnauthenticatedShell.tsx  -- Landing page layout

  modules/
    auth/                       -- Authentication module
      store.ts                  -- Auth state (token, user identity, status)
      AuthCallback.tsx          -- OIDC callback handler
      AuthProvider.tsx          -- oidc-client-ts provider setup
      hooks.ts                  -- useAuth(), useRequireAuth()

    player/                     -- Character and player profile module
      store.ts                  -- Character state, game state
      hooks.ts                  -- useCharacter(), usePlayerCard()
      screens/
        LobbyScreen.tsx
        StatAllocationScreen.tsx
      components/
        CharacterSummary.tsx
        StatAllocationForm.tsx
        PlayerCard.tsx

    onboarding/                 -- Onboarding flow module
      store.ts                  -- Onboarding step state
      screens/
        NameSelectionScreen.tsx
        InitialStatsScreen.tsx
      components/
        NameInput.tsx
        StatPointAllocator.tsx

    matchmaking/                -- Matchmaking module
      store.ts                  -- Queue status, searching state
      hooks.ts                  -- useMatchmaking(), useMatchmakingPolling()
      screens/
        SearchingScreen.tsx
      components/
        QueueButton.tsx
        SearchingIndicator.tsx

    battle/                     -- Battle module
      store.ts                  -- Battle state machine, turn state, narration feed
      hooks.ts                  -- useBattle(), useBattleConnection()
      screens/
        BattleScreen.tsx
        BattleResultScreen.tsx
      components/
        BattleHud.tsx           -- HP bars, turn timer, phase indicator
        ZoneSelector.tsx        -- Attack zone + block pair selection
        TurnResultDisplay.tsx   -- Combat outcome visualization
        NarrationFeed.tsx       -- Battle log / narrative display
        BattleEndOverlay.tsx    -- Victory/defeat/draw display

    chat/                       -- Chat module
      store.ts                  -- Messages, conversations, presence, connection state
      hooks.ts                  -- useChat(), useChatConnection(), useOnlinePlayers()
      components/
        ChatPanel.tsx           -- Global chat feed + input
        DirectMessagePanel.tsx  -- DM conversation view
        ConversationList.tsx    -- DM conversation list
        OnlinePlayersList.tsx   -- Online players with actions
        MessageInput.tsx        -- Shared message input with validation
        ChatConnectionStatus.tsx

  transport/                    -- Transport layer (no UI)
    http/
      client.ts
      endpoints/
        game.ts
        character.ts
        queue.ts
        battle.ts
        chat.ts
        players.ts
    signalr/
      battle-hub.ts
      chat-hub.ts
      connection-state.ts
    polling/
      matchmaking-poller.ts

  ui/                           -- Shared UI primitives (no business logic)
    components/
      Button.tsx
      TextInput.tsx
      Card.tsx
      Dialog.tsx
      Sheet.tsx
      Badge.tsx
      ProgressBar.tsx
      Timer.tsx
      Spinner.tsx
      ConnectionIndicator.tsx
      Toast.tsx
      Avatar.tsx
      Tooltip.tsx
    theme/
      tokens.css
      fonts.css

  types/                        -- Shared type definitions
    api.ts                      -- API response/request types
    battle.ts                   -- Battle enums, zone model, event types
    chat.ts                     -- Chat message, conversation, presence types
    player.ts                   -- Character, player card types
    common.ts                   -- Shared utility types
```

### 6.2 Module responsibilities

#### `auth` -- Authentication and session

- OIDC flow management (login redirect, registration redirect, callback, token refresh)
- Token storage (in-memory)
- User identity extraction from JWT (`sub`, `preferred_username`)
- Auth state exposure (authenticated/unauthenticated/loading)
- 401 interception and logout trigger
- **Does not** manage character state or game state

#### `player` -- Character and player profiles

- Owns the character state from `GET /api/v1/game/state`
- Manages game state fetch and cache invalidation (TanStack Query)
- Provides player card fetch for other players (TanStack Query)
- Provides own-profile win/loss via player card endpoint workaround
- Stat allocation mutation
- **Does not** manage onboarding flow navigation (that's routing logic)

#### `onboarding` -- First-time flow

- Name selection screen and validation (3-16 chars, uniqueness error handling)
- Initial stat allocation screen (3 points to spend, additive model)
- Onboarding step determination from `OnboardingState`
- **Does not** persist across sessions -- always derived from server state on startup

#### `matchmaking` -- Queue and pairing

- Queue join/leave mutations
- Polling lifecycle management (start, stop, interval)
- Status state machine: `Idle -> Searching -> Matched -> BattleTransition`
- Automatic battle transition trigger when `Matched` + `BattleId` detected
- **Does not** manage the battle itself

#### `battle` -- Combat

- Battle hub connection lifecycle
- Battle state machine: `Connecting -> ArenaOpen -> TurnOpen -> Resolving -> Ended`
- Turn input management (zone selection, validation, submission)
- Event processing (damage, resolution, state sync, narration)
- Reconnection and state resync via `JoinBattle`
- Battle end detection and result data
- Post-battle feed fetch
- **Does not** manage matchmaking or lobby state
- **Does not** compute combat outcomes -- all state is server-authoritative

#### `chat` -- Messaging and presence

- Chat hub connection lifecycle (session-scoped -- persists across lobby and battle)
- Global chat message feed (live events + history fetch for scroll-back)
- Direct message conversations (live events + history fetch)
- Online players list (live events + initial load from `JoinGlobalChat`)
- Message deduplication by `MessageId`
- Rate limit state (countdown timer, send button disable)
- Chat error handling
- Client-side unread tracking (per-conversation last-read position in memory)
- Opponent DM suppression during active battle (`suppressedOpponentId`). Messages from the suppressed opponent are stored but not surfaced as notifications or active DM UI. Suppression is set by the battle module on battle start and cleared on battle end.
- **Does not** manage player cards (that's the player module)

---

## 7. Decisions that must be fixed before implementation

### DEC-1: Vite SPA (not Next.js) -- DECIDED

**Decision:** Use Vite as the build tool and deploy as a client-side SPA. Do not use Next.js.

**Rationale:** Fully covered in Section 3.1. Kombats has zero SSR needs, two browser-only SignalR connections, browser-only OIDC, and no SEO requirements. Next.js adds infrastructure complexity with no benefit.

**Consequence:** The frontend is a static build artifact. Deployment is static file hosting (CDN, nginx, or similar). No Node.js server at runtime.

### DEC-2: Chat during battle -- DECIDED

**Decision:** Maintain the `/chathub` connection during battle. The chat connection is session-scoped, not lobby-scoped.

**Behavior during active battle:**
- Global chat connection stays active. Global chat messages continue to be received and stored in the chat store. The battle UI may include a collapsed/minimized global chat panel at product discretion.
- DM conversations with the current battle opponent are suppressed in the UI during the active battle. `DirectMessageReceived` events from the opponent are still processed by the chat store (messages persist), but the DM conversation UI for that opponent is hidden and no DM notification is shown for messages from that opponent.
- DM conversations with other players (not the current opponent) remain accessible and notify normally.
- After `BattleEnded`, the opponent DM suppression is lifted immediately. The DM surface with the former opponent becomes available again, including any messages received during the battle.

**Rationale:** Product decision. Players should remain reachable via global chat and DMs from non-opponents during battle. The opponent-specific DM suppression prevents chat-based distraction or harassment between combatants during the match.

**Implementation consequences:**
- `useChatConnection()` is called at the `AuthenticatedShell` level (above the battle/lobby route split), so it survives battle navigation.
- The chat store tracks a `suppressedOpponentId: string | null` field, set when battle starts and cleared when battle ends.
- The `DirectMessageReceived` handler checks `suppressedOpponentId` -- if the sender matches, the message is stored but no toast/notification is emitted.
- Chat UI components on the battle screen read `suppressedOpponentId` to hide the opponent's DM conversation entry.
- Two simultaneous SignalR connections (`/battlehub` + `/chathub`) coexist during battle. Both managers are independent and handle reconnection independently. This is a tested and supported configuration -- the backend allows it, and the transport layer already manages each connection in isolation.

### DEC-3: Own-profile win/loss -- WORKAROUND

**Decision for V1:** Use the player card endpoint with the user's own identity ID (from JWT `sub` claim) to fetch wins/losses. Call this on lobby load alongside the game state fetch.

**Implementation:** The `player` module fetches `GET /api/v1/players/{ownIdentityId}/card` and merges wins/losses into the local player state. This is a TanStack Query query with `stale-while-revalidate` caching.

**Long-term fix:** Request backend to add `Wins`/`Losses` to `CharacterResponse` in `GameStateResponse`. This eliminates the extra HTTP call.

### DEC-4: Turn deadline display buffer -- DECIDED

**Decision:** Display the turn timer as `DeadlineUtc - 1.5 seconds`. The server has a 1-second grace period, but the client should not depend on it.

**Rationale:** Network latency between the client and BFF, plus processing time, means that submitting at exactly `DeadlineUtc` risks arriving late. A 1.5-second buffer gives a comfortable margin. The player sees slightly less time but their actions are reliably accepted.

### DEC-5: Post-battle XP refresh strategy -- DECIDED

**Decision:** On returning to lobby after battle:
1. Immediately fetch `GET /api/v1/game/state`
2. If XP/level unchanged from pre-battle state, retry once after 3 seconds
3. If still unchanged after retry, accept current state (async processing may be slower than usual)

**Rationale:** XP is awarded asynchronously. The 3-second delay covers the typical sub-second processing time with margin. Two attempts is pragmatic; aggressive polling adds no value.

### DEC-6: Token storage -- DECIDED

**Decision:** Tokens stored in-memory only (Zustand store + oidc-client-ts internal state). No `localStorage`, no `sessionStorage`.

**Rationale:** The chat system accepts user-generated text input. Any XSS vulnerability could exfiltrate tokens from storage. In-memory storage means tokens are lost on page refresh (requiring silent renewal) but cannot be stolen by injected scripts reading `localStorage`. The tradeoff is: page refresh requires a silent token renewal round-trip to Keycloak (typically ~100ms). Acceptable.

### DEC-7: Unresolved -- Keycloak realm registration configuration

**Status:** Cannot be decided in this architecture document. Requires DevOps/platform confirmation.

**What the frontend needs to know:** Does Keycloak return the user authenticated after registration, or does it require a separate login step?

**Architecture impact:** Minimal. The auth module implements both paths: (1) direct authenticated return, (2) redirect to login after registration. The callback handler detects which path occurred.

**Blocking for implementation:** No. Both paths are implemented. The default assumption is that Keycloak returns authenticated (the common configuration).

---

## 8. Battle state machine specification

The battle module's Zustand store models the following state machine. This is the most complex state in the application and must be specified precisely.

```
States:
  Idle              -- No active battle
  Connecting        -- SignalR connection in progress
  WaitingForJoin    -- Connected, JoinBattle call in flight
  ArenaOpen         -- Battle exists, waiting for first turn
  TurnOpen          -- Active turn, player can submit action
  Submitted         -- Player submitted action, waiting for resolution (optimistic local state)
  Resolving         -- Server is processing the turn
  Ended             -- Battle is over, result available
  ConnectionLost    -- Connection dropped, reconnecting
  Error             -- Unrecoverable error

Transitions:
  Idle           -> Connecting        : startBattle(battleId)
  Connecting     -> WaitingForJoin    : signalR connected
  Connecting     -> Error             : connection failed after retries
  WaitingForJoin -> ArenaOpen         : JoinBattle returned snapshot with phase ArenaOpen
  WaitingForJoin -> TurnOpen          : JoinBattle returned snapshot with phase TurnOpen
  WaitingForJoin -> Resolving         : JoinBattle returned snapshot with phase Resolving
  WaitingForJoin -> Ended             : JoinBattle returned snapshot with phase Ended
  ArenaOpen      -> TurnOpen          : TurnOpened event received
  TurnOpen       -> Submitted         : player submitted action (local transition)
  TurnOpen       -> Resolving         : TurnResolved received (opponent submitted, deadline passed)
  Submitted      -> Resolving         : TurnResolved received
  Resolving      -> TurnOpen          : TurnOpened event received (next turn)
  Resolving      -> Ended             : BattleEnded event received
  TurnOpen       -> Ended             : BattleEnded event received (timeout/cancel during turn)
  Submitted      -> Ended             : BattleEnded event received
  *              -> ConnectionLost    : signalR connection dropped (except Idle, Ended)
  ConnectionLost -> WaitingForJoin    : reconnected, JoinBattle called
  ConnectionLost -> Error             : reconnection failed after retries
  Ended          -> Idle              : player dismisses result screen
```

**Turn-local state within `TurnOpen`:**
- `turnIndex: number` -- current turn number
- `deadline: Date` -- turn deadline (UTC)
- `selectedAttackZone: BattleZone | null`
- `selectedBlockPair: [BattleZone, BattleZone] | null`
- `isSubmitted: boolean`

**HP state (updated continuously across all active phases):**
- `playerHp: number`
- `opponentHp: number`
- `playerMaxHp: number`
- `opponentMaxHp: number`

---

## 9. Chat state specification

```
Chat Store Shape:
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  globalConversationId: string | null
  globalMessages: ChatMessage[]          // ordered oldest -> newest, capped at N in memory
  directConversations: Map<string, {     // keyed by conversationId
    conversationId: string
    otherPlayerId: string
    otherPlayerName: string
    messages: ChatMessage[]
    lastMessageAt: Date
    hasOlderMessages: boolean            // for infinite scroll
  }>
  onlinePlayers: Map<string, {           // keyed by playerId
    playerId: string
    displayName: string
  }>
  onlineCount: number
  rateLimitState: {
    global: { blocked: boolean, retryAt: Date | null }
    dm: { blocked: boolean, retryAt: Date | null }
  }
  suppressedOpponentId: string | null    // set during active battle, cleared on battle end
  lastError: ChatError | null

ChatMessage:
  messageId: string                      // UUID v7, used for dedup and ordering
  senderId: string
  senderName: string
  content: string
  sentAt: Date
```

**Deduplication:** Messages are deduped by `messageId` before insertion into any message list. This handles the overlap between `JoinGlobalChat()` initial messages and live events received during reconnection.

**Memory management:** Global messages are capped at ~500 in memory. Older messages are discarded from the front of the array. History scroll-back fetches from HTTP and prepends.

**Opponent DM suppression:** When `suppressedOpponentId` is set (during active battle):
- `DirectMessageReceived` events where `sender.playerId === suppressedOpponentId` are stored in the conversation as normal, but no toast notification is emitted and the conversation is not surfaced in active DM UI.
- The battle module calls `chatStore.setSuppressedOpponent(opponentId)` on battle start and `chatStore.clearSuppressedOpponent()` on battle end (`BattleEnded` event or result screen dismissal).
- UI components reading DM state filter by `suppressedOpponentId` to hide the opponent's conversation during battle. After suppression is cleared, the conversation appears normally with all messages intact (including those received during battle).

---

## 10. Zone model specification

The 5-zone ring topology is central to battle UI. Specified here to ensure the UI correctly represents the constraint.

```
Zones (ring order): Head -> Chest -> Belly -> Waist -> Legs -> (wraps to Head)

Valid adjacent block pairs (5 total):
  [Head, Chest]
  [Chest, Belly]
  [Belly, Waist]
  [Waist, Legs]
  [Legs, Head]

UI presentation:
  Attack: select any 1 of 5 zones
  Block:  select 1 of 5 adjacent pairs (NOT arbitrary 2-zone selection)

The block UI should present 5 named pair options, not 5 individual zone checkboxes.
Possible UI: a ring/wheel visualization where the player selects a contiguous arc of 2.
```

**Client-side validation before submission:**
1. Attack zone is selected (one of 5)
2. Block pair is selected (one of 5 valid adjacent pairs)
3. `turnIndex` matches current turn
4. Submission time is before displayed deadline (which is already buffered by 1.5s)

**Payload construction:**
```typescript
const payload = JSON.stringify({
  attackZone: selectedAttackZone,        // "Head" | "Chest" | "Belly" | "Waist" | "Legs"
  blockZonePrimary: selectedBlockPair[0],
  blockZoneSecondary: selectedBlockPair[1],
});
// Pass `payload` as the string parameter to SubmitTurnAction
```

---

## 11. Recommended next step

This architecture document is complete. The following should happen in order:

### Step 1: Resolve remaining decisions

- **DEC-7 (Keycloak registration):** DevOps confirms realm configuration. Frontend implements both paths regardless.
- **DEC-3 (Own win/loss):** Product decides whether to accept the workaround or request a backend change. Frontend implements the workaround either way.

### Step 2: Implementation plan and task decomposition

Create `05-frontend-implementation-plan.md` that:
- Defines implementation phases (foundation -> auth -> onboarding -> lobby+chat -> matchmaking -> battle -> post-battle -> hardening)
- Decomposes each phase into discrete, reviewable tickets
- Identifies the critical path (auth and transport must come first; battle is the most complex feature)
- Defines the test strategy per module (unit tests for stores/state machines, integration tests for transport, component tests for UI)

### Step 3: Scaffold and implement

Begin implementation following the plan. The architecture defined here is the constraint set. Deviations require updating this document first.

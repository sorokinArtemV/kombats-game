# Chat Feature Analysis

Pre-implementation audit for: DM tabs, Send-message-from-profile,
collapse/expand, vertical resize.

---

## 1. Current chat architecture

### Frontend layers

```
app/BottomDock.tsx               ← persistent dock, owns tab + Sheet UI state
app/shells/SessionShell.tsx      ← mounts <BottomDock /> on every authenticated route (hidden on battle-result)
modules/chat/store.ts            ← Zustand: useChatStore
modules/chat/hooks.ts            ← useChatConnection, selectors, reconnectChat
modules/chat/format.ts           ← formatTimestamp(HH:mm)
modules/chat/components/         ← ChatPanel, MessageInput, ConversationList,
                                   DirectMessagePanel, OnlinePlayersList,
                                   ChatErrorDisplay
transport/signalr/chat-hub.ts    ← ChatHubManager (singleton via app/transport-init)
transport/http/endpoints/chat.ts ← getConversations / getMessages /
                                   getDirectMessages / getOnlinePlayers
types/chat.ts                    ← shared DTOs / events
```

### Backend layers

```
Kombats.Bff.Api/Hubs/ChatHub.cs              ← /chathub  (Authorize, thin relay)
Kombats.Bff.Application/Relay/ChatHubRelay.cs ← per-frontend bridge to /chathub-internal,
                                                forwards JoinGlobalChat / LeaveGlobalChat /
                                                SendGlobalMessage / SendDirectMessage,
                                                blind-relays GlobalMessageReceived /
                                                DirectMessageReceived / PlayerOnline /
                                                PlayerOffline / ChatError, plus injects a
                                                synthetic ChatConnectionLost on downstream drop
Kombats.Bff.Api/Endpoints/Chat/*.cs          ← REST: /api/v1/chat/{conversations,
                                               conversations/{id}/messages,
                                               direct/{otherPlayerId}/messages,
                                               players/online}
Kombats.Bff.Api/Endpoints/PlayerCard/         ← /api/v1/players/{playerId}/card
  GetPlayerCardEndpoint.cs                     (composes Players profile)

Kombats.Chat.Api/Hubs/InternalChatHub.cs     ← /chathub-internal (real implementation)
Kombats.Chat.Api/Hubs/ChatGroups.cs          ← `Global` group + `ForIdentity(id)` per-identity
                                                group (multi-tab DM fan-out)
Kombats.Chat.Api/Endpoints/...               ← internal REST counterparts at /api/internal/*
Kombats.Chat.Application/UseCases/...        ← JoinGlobalChat, SendGlobalMessage,
                                               SendDirectMessage, GetConversations,
                                               GetConversationMessages, GetDirectMessages,
                                               GetOnlinePlayers, ConnectUser, DisconnectUser
Kombats.Chat.Domain/Conversations/Conversation.cs
Kombats.Chat.Domain/Messages/Message.cs
Kombats.Chat.Infrastructure/                 ← EF Core (Postgres), Redis presence + rate
                                               limiter, MassTransit consumer, retention worker
```

### Frontend store (`useChatStore`)

State:

| Field | Type | Notes |
|---|---|---|
| `connectionState` | `'disconnected' \| 'connecting' \| 'connected' \| 'reconnecting' \| 'failed'` | from ChatHubManager |
| `globalConversationId` | `Uuid \| null` | well-known `00000000-...-0001` |
| `globalMessages` | `ChatMessageResponse[]` | live-only, capped at 500, never seeded |
| `directConversations` | `Map<conversationId, DirectConversation>` | **keyed by server conversationId**, not playerId |
| `onlinePlayers` | `Map<playerId, OnlinePlayerResponse>` | |
| `onlineCount` | `number` | derived from `onlinePlayers.size` |
| `rateLimitState` | `{ isLimited, retryAfterMs, limitedAt }` | DM + global share Redis bucket |
| `suppressedOpponentId` | `Uuid \| null` | filters DMs during a battle |
| `lastError` | `ChatErrorEvent \| null` | |

Where `DirectConversation = { conversationId, otherPlayer: { playerId, displayName }, messages, lastMessageAt }`.

Actions: `setConnectionState`, `setGlobalSession`, `addGlobalMessage`,
`addOnlinePlayer`, `removeOnlinePlayer`, `addDirectMessage`,
`setSuppressedOpponent`, `clearSuppressedOpponent`, `handleChatError`,
`handleConnectionLost`, `clearRateLimit`, `clearStore`.

Per-conversation buffer cap: 500 messages (HTTP backfills on (re)open).

### How DMs work today

1. Selecting `'dm'` tab in `BottomDock` renders `<ConversationList />`,
   which queries `GET /api/v1/chat/conversations` (TanStack Query,
   `staleTime: 10s`, key `chatKeys.conversations()`), filters to
   `type === 'Direct'`, hides `suppressedOpponentId`, sorts by
   `lastMessageAt` (real-time map wins over server when newer).
2. Clicking a row calls `onSelectConversation(otherPlayerId, displayName)`,
   which `BottomDock` translates into
   `setActiveDm({ otherPlayerId, displayName })`. Conversation rows expose
   `otherPlayer.playerId` from the server payload.
3. `<Sheet open={!!activeDm}>` mounts `<DirectMessagePanel />`. The Sheet
   is a Radix Dialog sliding in from the right — completely separate from
   the dock layout.
4. `DirectMessagePanel`:
   - HTTP query: `getDirectMessages(otherPlayerId)`
     (`GET /api/v1/chat/direct/{otherPlayerId}/messages`) keyed by
     `chatKeys.directMessages(otherPlayerId)`. **Backend does not create a
     conversation on the read path**, so panels for never-messaged players
     start with `messages=[], hasMore=false`.
   - Cursor pagination via `before=<oldest.sentAt>` ("Load older messages").
   - Real-time merge: scans `directConversations` Map values, picks the one
     whose `otherPlayer.playerId === otherPlayerId`, dedups by `messageId`.
   - Send: `chatHubManager.sendDirectMessage(recipientPlayerId, content)`.
   - Reconnect: invalidates `chatKeys.directMessages(otherPlayerId)` when
     `connectionState === 'connected'`.
5. Inbound `DirectMessageReceived` events are keyed by **conversationId**
   in `addDirectMessage` and bucketed in `directConversations`. First
   message from a never-seen sender lazily creates the entry.

### Tab switching today

```ts
type TabId = 'general' | 'dm';
const [activeTab, setActiveTab] = useState<TabId>('general');
const [activeDm, setActiveDm] = useState<ActiveDm | null>(null); // drives Sheet
```

There is **one** `'dm'` tab. It shows the conversation *list*, not a
conversation. The conversation itself is a Sheet overlay outside the dock.

### `PlayerCard` (the profile modal)

Source: `src/modules/player/components/PlayerCard.tsx`.

- Wraps `<Sheet title="Player Profile">` (Radix Dialog).
- Props: `{ playerId, open, onClose }` — **no DM callback**.
- Data: `usePlayerCard(playerId)` → `GET /api/v1/players/{playerId}/card`
  (BFF composes from Players profile, no cache, 60s `staleTime`).
- Renders `displayName`, `level`, four attributes (Strength / Agility /
  Intuition / Vitality), record (Wins / Losses).
- Opened from two places:
  - `BottomDock` → click on player name in online-players column
    (`setProfilePlayerId`).
  - `DirectMessagePanel` → click on the recipient name header
    (`onViewProfile`).

### `BottomDock` state today

```ts
const [activeTab, setActiveTab] = useState<TabId>('general');
const [activeDm, setActiveDm] = useState<ActiveDm | null>(null);
const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);
```

Layout:

- Fixed overlay: `pointer-events-none fixed bottom-4 left-0 right-0 z-30`
- Inner panel hardcoded at **`h-[170px]`**, `max-w-5xl`, glass + 20px blur
- Left column 3/4 (chat), right column 1/4 (online players)
- No collapse / expand state, no resize state, no localStorage persistence
- Mounted by `SessionShell` for every authenticated route except battle-result

---

## 2. SignalR hub methods

Frontend calls `/chathub` on the BFF; BFF transparently forwards to
`/chathub-internal` on Chat. Both expose the same frozen Batch 3 contract.

### Client → Server (invocations)

| Method | Args | Returns | Source |
|---|---|---|---|
| `JoinGlobalChat` | none | `JoinGlobalChatResponse` (conversationId, recentMessages, onlinePlayers, totalOnline) | `chat-hub.ts:114` |
| `LeaveGlobalChat` | none | `void` | `chat-hub.ts:118` |
| `SendGlobalMessage` | `content: string` | `void` | `chat-hub.ts:124` |
| `SendDirectMessage` | `recipientPlayerId: string, content: string` | `SendDirectMessageResponse` (conversationId, messageId, sentAt) | `chat-hub.ts:128` |

`recipientPlayerId` is the **identityId** of the recipient. Backend treats
sender == recipient as `recipient_not_found`. The conversation is
**lazily created** on the server inside `SendDirectMessageHandler` via
`GetOrCreateDirectAsync` with the sorted-pair invariant.

### Server → Client (events)

| Event | Payload | Notes |
|---|---|---|
| `GlobalMessageReceived` | `{ messageId, sender, content, sentAt }` | global group fan-out |
| `DirectMessageReceived` | `{ messageId, conversationId, sender, content, sentAt }` | sent to **per-identity group** so all the recipient's tabs receive it; sender's own tab(s) also receive it because backend addresses both participants' identity groups |
| `PlayerOnline` | `{ playerId, displayName }` | global presence |
| `PlayerOffline` | `{ playerId }` | global presence |
| `ChatError` | `{ code, message, retryAfterMs }` | codes: `rate_limited`, `message_too_long`, `message_empty`, `recipient_not_found`, `not_eligible`, `service_unavailable` |
| `ChatConnectionLost` | `{ reason }` | **BFF-injected** when downstream drops or invocation times out (15s) |

No typing-indicator event today. No read-receipts.

---

## 3. REST endpoints (BFF — what the frontend calls)

Base path `/api/v1` (auth required, JWT bearer).

| Method | Path | Returns | Notes |
|---|---|---|---|
| `GET` | `/api/v1/chat/conversations` | `ConversationListResponse` (`{ conversations: ChatConversationResponse[] }`) | Includes Global + Direct; ordered by `lastMessageAt` desc. `otherPlayer` set for Direct only. |
| `GET` | `/api/v1/chat/conversations/{conversationId}/messages?before&limit=50` | `MessageListResponse` (`{ messages, hasMore }`) | Cursor pagination by `sentAt`. |
| `GET` | `/api/v1/chat/direct/{otherPlayerId}/messages?before&limit=50` | `MessageListResponse` | **Read-only — no conversation creation**; returns empty if never messaged. |
| `GET` | `/api/v1/chat/players/online?limit&offset` | `OnlinePlayersResponse` | Currently unused by the dock (presence flows through SignalR). |
| `GET` | `/api/v1/players/{playerId}/card` | `PlayerCardResponse` | Used by `PlayerCard`. |

Internal Chat-service routes are mirrored at `/api/internal/...` (used
only by BFF tests / direct service access; not relevant to the client).

---

## 4. DM data model & flow

### Domain

`Conversation` (table `conversations`):
- `Id Guid` (Version 7)
- `Type Global | Direct`
- `CreatedAt DateTimeOffset`
- `LastMessageAt DateTimeOffset?`
- `ParticipantAIdentityId Guid?` / `ParticipantBIdentityId Guid?` —
  **sorted-pair invariant** (smaller GUID = A) for deterministic lookup
- Special row: Global conversation has well-known id
  `00000000-0000-0000-0000-000000000001` and null participants.

`Message` (table `messages`):
- `Id Guid`
- `ConversationId Guid`
- `SenderIdentityId Guid`
- `SenderDisplayName string` (denormalized at write time;
  `HandlePlayerProfileChangedHandler` re-syncs on rename via MassTransit)
- `Content string`
- `SentAt DateTimeOffset`

**One Conversation row per pair.** No per-message conversation-id
bookkeeping needed on the client beyond keying.

### Initiating a new DM (server side)

`SendDirectMessageHandler` (Chat.Application):
1. Validate sender ≠ recipient.
2. Eligibility check (sender + recipient): onboarding complete, not
   restricted.
3. Rate-limit (Redis, surface=`dm`).
4. Filter content (length / sanitize).
5. `IConversationRepository.GetOrCreateDirectAsync(senderId, recipientId)`
   — atomic upsert keyed on the sorted pair.
6. Persist Message; bump `LastMessageAt`.
7. `IChatNotifier.SendDirectMessageAsync(recipientIdentityId, …)` →
   SignalR hub fans out to the recipient's per-identity group **and** the
   sender's per-identity group, so every connected tab receives it.

### Conversations-list endpoint

Yes — `GetConversationsHandler`:
- `IConversationRepository.ListByParticipantAsync(callerIdentityId)` →
  Direct conversations where the caller is A or B, ordered by
  `LastMessageAt` desc.
- For each Direct: resolve the *other* participant's display name via
  `IDisplayNameResolver` (Redis cache → Players HTTP → "Unknown").
- Returns `ConversationDto[]` with `(conversationId, type, otherPlayer?, lastMessageAt)`.

The frontend's `ConversationList` filters out `type !== 'Direct'`, so
Global is hidden in the DM tab (Global is its own dock tab anyway).

---

## 5. Per-feature gap analysis

### A. DM tabs (each conversation = its own tab)

**Already in place**

- Server keys all DM events by `conversationId` and the store's
  `directConversations` map is keyed by `conversationId` — tabs map 1:1.
- Conversations list endpoint and React Query cache exist.
- Per-identity SignalR group means a brand-new inbound DM lands in the
  store regardless of what tab is active.
- `DirectMessagePanel` is fully self-contained, identifies its
  conversation by `otherPlayerId`, and merges history + realtime + cursor
  pages internally — drop-in reusable as tab content.
- Lazy-create on first send is server-side; the client just calls
  `sendDirectMessage(recipientPlayerId, …)`.

**Missing / to build**

- Replace `TabId = 'general' | 'dm'` with a discriminated union or array
  of opened tabs:
  `{ kind: 'general' } | { kind: 'dm-list' } | { kind: 'dm', otherPlayerId, displayName, conversationId? }`.
- Tab strip: dynamic tab buttons for each opened DM (display name +
  online dot + close ×). Truncation / overflow scroll for many tabs.
- Open-tabs registry: lift from BottomDock-local state into either
  - `useChatStore` (new field `openDmTabs: { otherPlayerId, displayName, conversationId? }[]` + `activeTabId` + actions `openDmTab`, `closeDmTab`, `setActiveTab`) — preferred so PlayerCard, ConversationList, and player-list rows can all dispatch through the store, and so a DM tab can stay open across screen mounts; or
  - a tiny dock-state hook if we want to keep store concerns minimal.
- Replace the `<Sheet>` overlay with rendering `<DirectMessagePanel>`
  inline as the active tab's content (drop the back button, drop the
  Sheet).
- Decide inbound-DM behaviour for *unopened* tabs: notification badge
  on the dm-list tab, or auto-open a new tab? (Recommend: badge only.)
- Unread counters per tab — the store already gets every event keyed by
  conversationId; add `unreadByConversationId: Map<Uuid, number>` and
  clear on `setActiveTab`.
- "Open DM list" entry point still needed (dropdown or a permanent first
  pseudo-tab) so users can find dormant conversations.
- ConversationList stays, but `onSelectConversation` now calls
  `chatStore.openDmTab(...)` instead of opening a Sheet. It can also
  display a "+" indicator for tabs already open.
- Empty-state: clicking DM with zero open tabs falls back to the
  conversation list.

### B. "Send message" button in `PlayerCard`

**Already in place**

- BFF endpoint returns `displayName` so the button has the data it needs.
- `BottomDock.openDm(playerId, displayName)` already exists and is the
  exact entry point we want to call. Today it sets `activeDm`; once
  feature A lands it will instead call `chatStore.openDmTab`.

**Missing / to build**

- `PlayerCard` props are `{ playerId, open, onClose }` — no callback for
  Send-Message. Two reasonable wirings:
  1. Add `onSendMessage?: (playerId: string, displayName: string) => void`
     prop and pass it down from `BottomDock` (mirrors existing
     `onSendMessage` pattern in `PlayersList`/`OnlinePlayersList`).
  2. Once feature A puts open-DM in the chat store, `PlayerCard` can call
     `useChatStore.getState().openDmTab(...)` directly.
- New action button row in the modal under the Record tile.
- On click: open the DM tab/Sheet **and** call `onClose()` so the
  profile dismisses. Don't double-stack a Sheet over a Sheet.
- Disable the button when the player is the current user (`identityId`
  comparison via `useAuthStore`) — the backend would reject it as
  `recipient_not_found`, but failing in the UI first is friendlier.
- Optional: disable when `connectionState !== 'connected'` (mirrors
  `MessageInput`).

### C. Collapse / expand button

**Already in place**

- Nothing — the dock is fixed at `h-[170px]` and always visible.

**Missing / to build**

- Local state (`useState<boolean>`) or store field
  `isCollapsed: boolean`. UI prefs are *not* an auth-token concern, so
  `localStorage` persistence is allowed by `architecture-boundaries.md`
  (DEC-6 forbids `localStorage` only for tokens).
- Collapse button in dock header / tab strip.
- Collapsed presentation: render only a slim handle bar (e.g. 28px) with
  the Chat label and an unread badge; clicking expands.
- Animate height with Framer Motion or CSS transition (respect
  `prefers-reduced-motion`).
- When collapsed and a new DM/global message arrives, surface a subtle
  badge — no auto-expand.

### D. Vertical resize (drag handle)

**Already in place**

- Nothing — height is the literal Tailwind class `h-[170px]`.

**Missing / to build**

- Replace `h-[170px]` with `style={{ height: \`${dockHeight}px\` }}`. This
  is one of the explicitly-allowed inline-style cases in
  `ui-and-theming.md` (truly dynamic computed value).
- State: `dockHeight: number`, clamped to a min/max (suggest 140–520 px;
  the current 170 is already near the floor). Persist in `localStorage`.
- Drag handle on the **top** edge of the panel
  (`top-0 left-0 right-0 h-1.5 cursor-row-resize`). Pointer-events flow:
  `onPointerDown` → set capture → `onPointerMove` updates height (clamp,
  invert delta because resizing upward should grow) → `onPointerUp` /
  `lostpointercapture` releases.
- Disable resize while collapsed (feature C).
- Test: ensure resize doesn't break the existing `pointer-events-none`
  outer wrapper / `pointer-events-auto` panel pattern.

---

## 6. Recommended implementation order

Do the smallest, lowest-coupling changes first so the bigger refactor
lands on top of stable plumbing.

1. **Vertical resize.**
   Pure UI-state addition. No store changes, no backend coupling.
   Establishes the `dockHeight` + `localStorage` plumbing the next
   feature reuses. Smallest blast radius, easiest rollback.

2. **Collapse / expand.**
   Same shape as resize (boolean preference, persist, animate).
   Extends the dock's local UI-state object naturally. Still no store /
   transport changes. Should ship together with feature 1 if you want a
   single PR for "dock chrome".

3. **`PlayerCard` "Send message" button.**
   Tiny: one new prop, one new button, one branch that calls existing
   `openDm` and then `onClose`. Validates the modal-→-Sheet flow before
   we tear the Sheet out in step 4. Independent of features 1–2 and
   independent of feature 4, so it can ship in parallel.

4. **DM tabs.**
   Largest change. Touches `useChatStore` (new tab registry + unread
   counts), `BottomDock` (tab strip, no-Sheet rendering), and
   `ConversationList` / `PlayerCard` / `PlayersList` (all dispatch
   through the new store action). The Sheet for DMs goes away; PlayerCard
   keeps its own Sheet. Saving this for last lets you validate the
   conversation-list + DM panel flow under steps 1–3 first; once the new
   tab system is in, feature 3's "Send message" button automatically
   benefits (opens a tab instead of a Sheet) with no code changes if it
   was already routed through the store action.

No backend work is required for any of the four features — every needed
hub method, event, and REST endpoint already exists. Display-name
resolution and conversation-id keying are already in place server-side,
so DM tabs only need a client-side state-shape change.

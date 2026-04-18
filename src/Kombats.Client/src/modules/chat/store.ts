import { create } from 'zustand';
import type { ConnectionState } from '@/transport/signalr/connection-state';
import type {
  ChatMessageResponse,
  OnlinePlayerResponse,
  ChatErrorEvent,
} from '@/types/chat';
import type { Uuid } from '@/types/common';

const MAX_GLOBAL_MESSAGES = 500;
// Per-conversation cap on real-time DM buffer. HTTP history backfills older
// messages when a panel is (re)opened, so trimming the live buffer does not
// lose data — it only bounds memory/render cost over long sessions.
const MAX_DIRECT_MESSAGES_PER_CONVERSATION = 500;

interface RateLimitState {
  isLimited: boolean;
  retryAfterMs: number | null;
  limitedAt: number | null;
}

interface DirectConversation {
  conversationId: Uuid;
  otherPlayer: OnlinePlayerResponse;
  messages: ChatMessageResponse[];
  lastMessageAt: string | null;
}

interface ChatState {
  connectionState: ConnectionState;
  globalConversationId: Uuid | null;
  globalMessages: ChatMessageResponse[];
  directConversations: Map<Uuid, DirectConversation>;
  onlinePlayers: Map<Uuid, OnlinePlayerResponse>;
  onlineCount: number;
  rateLimitState: RateLimitState;
  suppressedOpponentId: Uuid | null;
  lastError: ChatErrorEvent | null;

  setConnectionState: (state: ConnectionState) => void;
  setGlobalSession: (
    conversationId: Uuid,
    players: OnlinePlayerResponse[],
  ) => void;
  addGlobalMessage: (msg: ChatMessageResponse) => void;
  addOnlinePlayer: (player: OnlinePlayerResponse) => void;
  removeOnlinePlayer: (playerId: Uuid) => void;
  addDirectMessage: (msg: ChatMessageResponse) => { suppressed: boolean };
  setSuppressedOpponent: (playerId: Uuid) => void;
  clearSuppressedOpponent: () => void;
  handleChatError: (error: ChatErrorEvent) => void;
  handleConnectionLost: () => void;
  clearRateLimit: () => void;
  clearStore: () => void;
}

function isDuplicate(messages: ChatMessageResponse[], messageId: Uuid): boolean {
  return messages.some((m) => m.messageId === messageId);
}

export const useChatStore = create<ChatState>()((set, get) => ({
  connectionState: 'disconnected',
  globalConversationId: null,
  globalMessages: [],
  directConversations: new Map(),
  onlinePlayers: new Map(),
  onlineCount: 0,
  rateLimitState: { isLimited: false, retryAfterMs: null, limitedAt: null },
  suppressedOpponentId: null,
  lastError: null,

  setConnectionState: (connectionState) => set({ connectionState }),

  setGlobalSession: (conversationId, players) => {
    const playerMap = new Map<Uuid, OnlinePlayerResponse>();
    for (const player of players) {
      playerMap.set(player.playerId, player);
    }
    // Global chat is live-only: globalMessages is never seeded from server
    // backlog. Existing in-session messages are preserved across reconnects.
    // onlineCount always derived from Map.size — no mixing with server totalOnline.
    set({
      globalConversationId: conversationId,
      onlinePlayers: playerMap,
      onlineCount: playerMap.size,
    });
  },

  addGlobalMessage: (msg) => {
    const state = get();
    if (isDuplicate(state.globalMessages, msg.messageId)) return;

    const updated = [...state.globalMessages, msg];
    set({
      globalMessages:
        updated.length > MAX_GLOBAL_MESSAGES
          ? updated.slice(updated.length - MAX_GLOBAL_MESSAGES)
          : updated,
    });
  },

  addDirectMessage: (msg) => {
    const state = get();
    const senderId = msg.sender.playerId;
    const suppressed = senderId === state.suppressedOpponentId;

    const existing = state.directConversations.get(msg.conversationId);
    if (existing && isDuplicate(existing.messages, msg.messageId)) {
      return { suppressed };
    }

    const updated = new Map(state.directConversations);
    if (existing) {
      const appended = [...existing.messages, msg];
      const trimmed =
        appended.length > MAX_DIRECT_MESSAGES_PER_CONVERSATION
          ? appended.slice(appended.length - MAX_DIRECT_MESSAGES_PER_CONVERSATION)
          : appended;
      updated.set(msg.conversationId, {
        ...existing,
        messages: trimmed,
        lastMessageAt: msg.sentAt,
      });
    } else {
      updated.set(msg.conversationId, {
        conversationId: msg.conversationId,
        otherPlayer: { playerId: senderId, displayName: msg.sender.displayName },
        messages: [msg],
        lastMessageAt: msg.sentAt,
      });
    }

    set({ directConversations: updated });
    return { suppressed };
  },

  setSuppressedOpponent: (playerId) => set({ suppressedOpponentId: playerId }),

  clearSuppressedOpponent: () => set({ suppressedOpponentId: null }),

  addOnlinePlayer: (player) => {
    const state = get();
    const updated = new Map(state.onlinePlayers);
    updated.set(player.playerId, player);
    set({ onlinePlayers: updated, onlineCount: updated.size });
  },

  removeOnlinePlayer: (playerId) => {
    const state = get();
    const updated = new Map(state.onlinePlayers);
    updated.delete(playerId);
    set({ onlinePlayers: updated, onlineCount: updated.size });
  },

  handleChatError: (error) => {
    if (error.code === 'rate_limited') {
      set({
        rateLimitState: {
          isLimited: true,
          retryAfterMs: error.retryAfterMs,
          limitedAt: Date.now(),
        },
        lastError: error,
      });
    } else {
      set({ lastError: error });
    }
  },

  handleConnectionLost: () => {
    set({ connectionState: 'disconnected' });
  },

  clearRateLimit: () => {
    set({
      rateLimitState: { isLimited: false, retryAfterMs: null, limitedAt: null },
    });
  },

  clearStore: () =>
    set({
      connectionState: 'disconnected',
      globalConversationId: null,
      globalMessages: [],
      directConversations: new Map(),
      onlinePlayers: new Map(),
      onlineCount: 0,
      rateLimitState: { isLimited: false, retryAfterMs: null, limitedAt: null },
      suppressedOpponentId: null,
      lastError: null,
    }),
}));

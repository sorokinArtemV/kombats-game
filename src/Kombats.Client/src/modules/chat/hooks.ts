import { useEffect } from 'react';
import { chatHubManager } from '@/app/transport-init';
import { useChatStore } from './store';
import type {
  GlobalMessageEvent,
  DirectMessageEvent,
  PlayerOnlineEvent,
  PlayerOfflineEvent,
  ChatErrorEvent,
  ChatMessageResponse,
} from '@/types/chat';

function toStoredMessage(event: GlobalMessageEvent, conversationId: string): ChatMessageResponse {
  return {
    messageId: event.messageId,
    conversationId,
    sender: event.sender,
    content: event.content,
    sentAt: event.sentAt,
  };
}

function directEventToMessage(event: DirectMessageEvent): ChatMessageResponse {
  return {
    messageId: event.messageId,
    conversationId: event.conversationId,
    sender: event.sender,
    content: event.content,
    sentAt: event.sentAt,
  };
}

async function joinGlobalSession(): Promise<void> {
  // Server-side group join is required to receive live messages. The response
  // also carries a recent-messages backlog, which we intentionally discard:
  // global chat is live-only — no history on entry, no restoration on refresh.
  const response = await chatHubManager.joinGlobalChat();
  useChatStore.getState().setGlobalSession(
    response.conversationId,
    response.onlinePlayers,
  );
}

export function useChatConnection(): void {
  useEffect(() => {
    let disposed = false;
    const store = useChatStore.getState();

    chatHubManager.setEventHandlers({
      onGlobalMessageReceived: (data: GlobalMessageEvent) => {
        if (disposed) return;
        const conversationId = useChatStore.getState().globalConversationId;
        if (!conversationId) return;
        useChatStore.getState().addGlobalMessage(toStoredMessage(data, conversationId));
      },
      onDirectMessageReceived: (data: DirectMessageEvent) => {
        if (disposed) return;
        useChatStore.getState().addDirectMessage(directEventToMessage(data));
      },
      onPlayerOnline: (data: PlayerOnlineEvent) => {
        if (disposed) return;
        useChatStore.getState().addOnlinePlayer({
          playerId: data.playerId,
          displayName: data.displayName,
        });
      },
      onPlayerOffline: (data: PlayerOfflineEvent) => {
        if (disposed) return;
        useChatStore.getState().removeOnlinePlayer(data.playerId);
      },
      onChatError: (data: ChatErrorEvent) => {
        if (disposed) return;
        useChatStore.getState().handleChatError(data);
      },
      onChatConnectionLost: () => {
        if (disposed) return;
        useChatStore.getState().handleConnectionLost();
      },
      onConnectionStateChanged: (state) => {
        if (disposed) return;
        useChatStore.getState().setConnectionState(state);

        // On reconnect, rejoin global chat to resync state
        if (state === 'connected' && useChatStore.getState().globalConversationId !== null) {
          joinGlobalSession().catch(() => {
            // Rejoin failures surface as a generic service_unavailable banner
            // so the user is not stuck with a "Connected" pill but no live
            // messages. Reconnect will re-run this when the hub cycles again.
            if (disposed) return;
            useChatStore.getState().handleChatError({
              code: 'service_unavailable',
              message: 'Chat resync failed after reconnect.',
            });
          });
        }

        // Clear non-rate-limit errors on reconnect
        if (state === 'connected') {
          const current = useChatStore.getState();
          if (current.lastError && current.lastError.code !== 'rate_limited') {
            useChatStore.setState({ lastError: null });
          }
        }
      },
    });

    store.setConnectionState('connecting');

    chatHubManager
      .connect()
      .then(() => {
        if (disposed) return;
        return joinGlobalSession();
      })
      .catch(() => {
        if (disposed) return;
        useChatStore.getState().setConnectionState('disconnected');
      });

    return () => {
      disposed = true;
      chatHubManager.setEventHandlers({});
      chatHubManager.disconnect().catch(() => {
        // Cleanup — ignore disconnect errors
      });
      useChatStore.getState().clearStore();
    };
  }, []);
}

/**
 * Manual reconnect for the chat hub. Used by the UI when the connection has
 * entered the terminal `failed` state (automatic reconnect exhausted) and
 * the user asks to retry.
 */
export async function reconnectChat(): Promise<void> {
  try {
    await chatHubManager.disconnect();
  } catch {
    // Ignore — we're about to reconnect anyway
  }
  useChatStore.getState().setConnectionState('connecting');
  try {
    await chatHubManager.connect();
    await joinGlobalSession();
  } catch {
    useChatStore.getState().setConnectionState('failed');
  }
}

export function useGlobalMessages() {
  return useChatStore((s) => s.globalMessages);
}

export function useOnlinePlayers() {
  return useChatStore((s) => s.onlinePlayers);
}

export function useOnlineCount() {
  return useChatStore((s) => s.onlineCount);
}

export function useChatConnectionState() {
  return useChatStore((s) => s.connectionState);
}

export function useChatRateLimitState() {
  return useChatStore((s) => s.rateLimitState);
}

export function useDirectConversations() {
  return useChatStore((s) => s.directConversations);
}

export function useChatLastError() {
  return useChatStore((s) => s.lastError);
}

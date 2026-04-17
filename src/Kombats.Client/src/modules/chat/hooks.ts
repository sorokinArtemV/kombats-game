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

async function joinAndPopulate(): Promise<void> {
  const response = await chatHubManager.joinGlobalChat();
  const store = useChatStore.getState();

  const messages: ChatMessageResponse[] = response.recentMessages.map((m) => ({
    messageId: m.messageId,
    conversationId: response.conversationId,
    sender: m.sender,
    content: m.content,
    sentAt: m.sentAt,
  }));

  store.setGlobalState(
    response.conversationId,
    messages,
    response.onlinePlayers,
  );
}

export function useChatConnection(): void {
  useEffect(() => {
    const store = useChatStore.getState();

    chatHubManager.setEventHandlers({
      onGlobalMessageReceived: (data: GlobalMessageEvent) => {
        const conversationId = useChatStore.getState().globalConversationId;
        if (!conversationId) return;
        useChatStore.getState().addGlobalMessage(toStoredMessage(data, conversationId));
      },
      onDirectMessageReceived: (data: DirectMessageEvent) => {
        useChatStore.getState().addDirectMessage(directEventToMessage(data));
      },
      onPlayerOnline: (data: PlayerOnlineEvent) => {
        useChatStore.getState().addOnlinePlayer({
          playerId: data.playerId,
          displayName: data.displayName,
        });
      },
      onPlayerOffline: (data: PlayerOfflineEvent) => {
        useChatStore.getState().removeOnlinePlayer(data.playerId);
      },
      onChatError: (data: ChatErrorEvent) => {
        useChatStore.getState().handleChatError(data);
      },
      onChatConnectionLost: () => {
        useChatStore.getState().handleConnectionLost();
      },
      onConnectionStateChanged: (state) => {
        useChatStore.getState().setConnectionState(state);

        // On reconnect, rejoin global chat to resync state
        if (state === 'connected' && useChatStore.getState().globalConversationId !== null) {
          joinAndPopulate().catch(() => {
            // Silently handle — reconnection will retry
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
      .then(() => joinAndPopulate())
      .catch(() => {
        useChatStore.getState().setConnectionState('disconnected');
      });

    return () => {
      chatHubManager.disconnect().catch(() => {
        // Cleanup — ignore disconnect errors
      });
      useChatStore.getState().clearStore();
    };
  }, []);
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

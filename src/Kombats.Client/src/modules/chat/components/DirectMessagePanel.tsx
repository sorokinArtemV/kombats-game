import { useRef, useEffect, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { chatKeys } from '@/app/query-client';
import * as chatApi from '@/transport/http/endpoints/chat';
import { useChatStore } from '../store';
import { Avatar } from '@/ui/components/Avatar';
import { Spinner } from '@/ui/components/Spinner';
import { MessageInput } from './MessageInput';
import type { ChatMessageResponse } from '@/types/chat';

interface DirectMessagePanelProps {
  otherPlayerId: string;
  displayName: string;
  onViewProfile: (playerId: string) => void;
  onBack: () => void;
}

export function DirectMessagePanel({
  otherPlayerId,
  displayName,
  onViewProfile,
  onBack,
}: DirectMessagePanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [olderMessages, setOlderMessages] = useState<ChatMessageResponse[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const realtimeConversations = useChatStore((s) => s.directConversations);

  const historyQuery = useQuery({
    queryKey: chatKeys.directMessages(otherPlayerId),
    queryFn: () => chatApi.getDirectMessages(otherPlayerId),
    staleTime: 10_000,
  });

  // Track hasMore from the initial fetch
  const serverHasMore = historyQuery.data?.hasMore ?? false;
  const effectiveHasMore = hasMore || serverHasMore;

  // Merge HTTP history + cursor-loaded older messages + real-time messages, dedup by messageId
  const messages = mergeMessages(
    [...olderMessages, ...(historyQuery.data?.messages ?? [])],
    realtimeConversations,
    otherPlayerId,
  );

  const messageCount = messages.length;
  useEffect(() => {
    if (messageCount === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

  // Reset older messages when switching conversations
  useEffect(() => {
    setOlderMessages([]);
    setHasMore(false);
  }, [otherPlayerId]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || messages.length === 0) return;

    // Find the oldest message's sentAt to use as cursor
    const oldest = messages[0];
    if (!oldest) return;

    setLoadingMore(true);
    try {
      const result = await chatApi.getDirectMessages(otherPlayerId, oldest.sentAt);
      setOlderMessages((prev) => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, messages, otherPlayerId]);

  // Invalidate DM query on reconnect so open panels backfill
  const connectionState = useChatStore((s) => s.connectionState);
  useEffect(() => {
    if (connectionState === 'connected') {
      queryClient.invalidateQueries({ queryKey: chatKeys.directMessages(otherPlayerId) });
    }
  }, [connectionState, otherPlayerId, queryClient]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-bg-surface px-3 py-2">
        <button
          onClick={onBack}
          className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
          aria-label="Back to conversations"
        >
          &#x2190;
        </button>
        <Avatar name={displayName} size="sm" />
        <button
          onClick={() => onViewProfile(otherPlayerId)}
          className="flex-1 truncate text-left text-sm font-medium text-text-primary hover:text-accent"
        >
          {displayName}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {historyQuery.isPending ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-text-muted">
            No messages yet. Say hello!
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {effectiveHasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mb-2 self-center rounded-md px-3 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
              >
                {loadingMore ? 'Loading...' : 'Load older messages'}
              </button>
            )}
            {messages.map((msg) => (
              <div key={msg.messageId} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-accent">
                    {msg.sender.displayName}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatTimestamp(msg.sentAt)}
                  </span>
                </div>
                <p className="break-words text-sm text-text-primary">{msg.content}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-bg-surface p-3">
        <MessageInput mode="direct" recipientPlayerId={otherPlayerId} />
      </div>
    </div>
  );
}

function mergeMessages(
  httpMessages: ChatMessageResponse[],
  realtimeConversations: Map<string, { messages: ChatMessageResponse[] }>,
  otherPlayerId: string,
): ChatMessageResponse[] {
  const seen = new Set<string>();
  const merged: ChatMessageResponse[] = [];

  for (const msg of httpMessages) {
    if (!seen.has(msg.messageId)) {
      seen.add(msg.messageId);
      merged.push(msg);
    }
  }

  for (const conv of realtimeConversations.values()) {
    if (conv.otherPlayer.playerId === otherPlayerId) {
      for (const msg of conv.messages) {
        if (!seen.has(msg.messageId)) {
          seen.add(msg.messageId);
          merged.push(msg);
        }
      }
    }
  }

  merged.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  return merged;
}

function formatTimestamp(sentAt: string): string {
  try {
    return format(new Date(sentAt), 'HH:mm');
  } catch {
    return '';
  }
}

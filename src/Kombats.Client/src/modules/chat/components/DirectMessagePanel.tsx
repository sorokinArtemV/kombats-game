import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatKeys } from '@/app/query-client';
import * as chatApi from '@/transport/http/endpoints/chat';
import { useChatStore } from '../store';
import { Spinner } from '@/ui/components/Spinner';
import { MessageInput } from './MessageInput';
import { formatTimestamp } from '../format';
import { getNickColor } from '../nick-color';
import type { ChatMessageResponse } from '@/types/chat';

interface DirectMessagePanelProps {
  otherPlayerId: string;
  displayName: string;
  onViewProfile: (playerId: string) => void;
  // Optional — only the legacy Sheet-based mount needs a back button. When the
  // panel is rendered inline as a tab, the tab's own × handles dismissal.
  onBack?: () => void;
}

export function DirectMessagePanel({
  otherPlayerId,
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

  // Merge HTTP history + cursor-loaded older messages + real-time messages, dedup by messageId.
  // Memoized so unrelated chat-store updates (global messages, presence) don't
  // re-run the merge+sort on every render.
  const historyMessages = historyQuery.data?.messages;
  const messages = useMemo(
    () =>
      mergeMessages(
        [...olderMessages, ...(historyMessages ?? [])],
        realtimeConversations,
        otherPlayerId,
      ),
    [olderMessages, historyMessages, realtimeConversations, otherPlayerId],
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
      <div className="kombats-scroll flex-1 overflow-y-auto px-4 py-3">
        {historyQuery.isPending ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-[11px] uppercase tracking-[0.18em] text-text-muted">
            No messages yet. Say hello!
          </p>
        ) : (
          <div className="flex flex-col">
            {effectiveHasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mb-2 self-center rounded-sm px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-text-muted transition-colors duration-150 hover:text-kombats-gold disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load older messages'}
              </button>
            )}
            {messages.map((msg) => (
              <div
                key={msg.messageId}
                className="flex items-baseline py-0.5"
              >
                <span
                  className="shrink-0 text-xs font-semibold"
                  style={{ color: getNickColor(msg.sender.playerId) }}
                >
                  {msg.sender.displayName}
                </span>
                <span className="ml-2 min-w-0 flex-1 break-words text-sm text-text-primary">
                  {msg.content}
                </span>
                <span className="ml-2 shrink-0 text-[11px] text-text-muted tabular-nums">
                  {formatTimestamp(msg.sentAt)}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t-[0.5px] border-border-subtle px-3 py-2">
        <MessageInput mode="direct" recipientPlayerId={otherPlayerId} />
      </div>
    </div>
  );
}

function mergeMessages(
  httpMessages: ChatMessageResponse[],
  realtimeConversations: Map<
    string,
    { messages: ChatMessageResponse[]; otherPlayer: { playerId: string } }
  >,
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


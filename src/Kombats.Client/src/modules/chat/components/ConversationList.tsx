import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { chatKeys } from '@/app/query-client';
import * as chatApi from '@/transport/http/endpoints/chat';
import { useChatStore } from '../store';
import { Avatar } from '@/ui/components/Avatar';
import { Spinner } from '@/ui/components/Spinner';
import type { ChatConversationResponse } from '@/types/chat';

interface ConversationListProps {
  onSelectConversation: (otherPlayerId: string, displayName: string) => void;
}

export function ConversationList({ onSelectConversation }: ConversationListProps) {
  const suppressedOpponentId = useChatStore((s) => s.suppressedOpponentId);
  const directConversations = useChatStore((s) => s.directConversations);

  const conversationsQuery = useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: chatApi.getConversations,
    staleTime: 10_000,
  });

  const conversations = useMemo(() => {
    const serverConversations = conversationsQuery.data?.conversations ?? [];
    // Filter to Direct only, exclude suppressed opponent, sort by lastMessageAt desc
    return serverConversations
      .filter(
        (c): c is ChatConversationResponse & { otherPlayer: NonNullable<ChatConversationResponse['otherPlayer']> } =>
          c.type === 'Direct' && c.otherPlayer !== null && c.otherPlayer.playerId !== suppressedOpponentId,
      )
      .sort((a, b) => {
        // Check for real-time messages that may be newer than server data
        const aRealtime = directConversations.get(a.conversationId);
        const bRealtime = directConversations.get(b.conversationId);
        const aTime = aRealtime?.lastMessageAt ?? a.lastMessageAt ?? '';
        const bTime = bRealtime?.lastMessageAt ?? b.lastMessageAt ?? '';
        return bTime.localeCompare(aTime);
      });
  }, [conversationsQuery.data, suppressedOpponentId, directConversations]);

  if (conversationsQuery.isPending) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-text-muted">
        No conversations yet
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {conversations.map((conv) => (
        <li key={conv.conversationId}>
          <button
            onClick={() => onSelectConversation(conv.otherPlayer.playerId, conv.otherPlayer.displayName)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-surface"
          >
            <Avatar name={conv.otherPlayer.displayName} size="sm" />
            <div className="flex-1 overflow-hidden">
              <span className="block truncate text-sm text-text-primary">
                {conv.otherPlayer.displayName}
              </span>
              {conv.lastMessageAt && (
                <span className="text-xs text-text-muted">
                  {formatConversationTime(conv.lastMessageAt)}
                </span>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatConversationTime(sentAt: string): string {
  try {
    return format(new Date(sentAt), 'MMM d, HH:mm');
  } catch {
    return '';
  }
}

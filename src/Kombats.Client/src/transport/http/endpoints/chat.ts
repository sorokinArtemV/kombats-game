import { httpClient } from '../client';
import type {
  ConversationListResponse,
  MessageListResponse,
  OnlinePlayersResponse,
} from '@/types/chat';

export function getConversations(): Promise<ConversationListResponse> {
  return httpClient.get<ConversationListResponse>('/api/v1/chat/conversations');
}

export function getMessages(
  conversationId: string,
  before?: string,
): Promise<MessageListResponse> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return httpClient.get<MessageListResponse>(
    `/api/v1/chat/conversations/${conversationId}/messages${query}`,
  );
}

export function getDirectMessages(
  otherPlayerId: string,
  before?: string,
): Promise<MessageListResponse> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return httpClient.get<MessageListResponse>(
    `/api/v1/chat/direct/${otherPlayerId}/messages${query}`,
  );
}

export function getOnlinePlayers(
  limit?: number,
  offset?: number,
): Promise<OnlinePlayersResponse> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const query = params.toString() ? `?${params.toString()}` : '';
  return httpClient.get<OnlinePlayersResponse>(`/api/v1/chat/players/online${query}`);
}

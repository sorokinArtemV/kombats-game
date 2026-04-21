import type { Uuid, DateTimeOffset } from './common';

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface ChatSender {
  playerId: Uuid;
  displayName: string;
}

// ---------------------------------------------------------------------------
// HTTP response types
// ---------------------------------------------------------------------------

export interface ChatMessageResponse {
  messageId: Uuid;
  conversationId: Uuid;
  sender: ChatSender;
  content: string;
  sentAt: DateTimeOffset;
}

export interface ChatConversationResponse {
  conversationId: Uuid;
  type: 'Global' | 'Direct';
  otherPlayer: { playerId: Uuid; displayName: string } | null;
  lastMessageAt: DateTimeOffset | null;
}

export interface ConversationListResponse {
  conversations: ChatConversationResponse[];
}

export interface MessageListResponse {
  messages: ChatMessageResponse[];
  hasMore: boolean;
}

export interface OnlinePlayerResponse {
  playerId: Uuid;
  displayName: string;
}

export interface OnlinePlayersResponse {
  players: OnlinePlayerResponse[];
  totalOnline: number;
}

// ---------------------------------------------------------------------------
// SignalR hub responses
// ---------------------------------------------------------------------------

export interface JoinGlobalChatResponse {
  conversationId: Uuid;
  recentMessages: ChatMessageResponse[];
  onlinePlayers: OnlinePlayerResponse[];
  totalOnline: number;
}

export interface SendDirectMessageResponse {
  conversationId: Uuid;
  messageId: Uuid;
  sentAt: DateTimeOffset;
}

// ---------------------------------------------------------------------------
// SignalR events (server → client)
// ---------------------------------------------------------------------------

export interface GlobalMessageEvent {
  messageId: Uuid;
  sender: ChatSender;
  content: string;
  sentAt: DateTimeOffset;
}

export interface DirectMessageEvent {
  messageId: Uuid;
  conversationId: Uuid;
  sender: ChatSender;
  content: string;
  sentAt: DateTimeOffset;
}

export interface PlayerOnlineEvent {
  playerId: Uuid;
  displayName: string;
}

export interface PlayerOfflineEvent {
  playerId: Uuid;
}

export interface ChatErrorEvent {
  code: ChatErrorCode;
  message: string;
  retryAfterMs: number | null;
}

export type ChatErrorCode =
  | 'rate_limited'
  | 'message_too_long'
  | 'message_empty'
  | 'recipient_not_found'
  | 'not_eligible'
  | 'service_unavailable';

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

export const gameKeys = {
  all: ['game'] as const,
  state: () => [...gameKeys.all, 'state'] as const,
};

export const playerKeys = {
  all: ['player'] as const,
  card: (identityId: string) => [...playerKeys.all, 'card', identityId] as const,
};

export const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  messages: (conversationId: string) =>
    [...chatKeys.all, 'messages', conversationId] as const,
  directMessages: (otherPlayerId: string) =>
    [...chatKeys.all, 'directMessages', otherPlayerId] as const,
  onlinePlayers: () => [...chatKeys.all, 'onlinePlayers'] as const,
};

export const battleKeys = {
  all: ['battle'] as const,
  feed: (battleId: string) => [...battleKeys.all, 'feed', battleId] as const,
};

import { QueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/types/api';

function hasHttpStatus(err: unknown): err is ApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  );
}

// 4xx responses are permanent from the client's perspective:
//   401 — the http client already triggered onAuthFailure(); retry would only
//         generate more spurious auth-failure log entries
//   403/404 — the resource is not ours to read; retrying will not change that
//   409 — revision / conflict; callers handle explicitly via onError
// Retry only 5xx / network-like failures (where `status` is absent).
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  if (hasHttpStatus(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
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

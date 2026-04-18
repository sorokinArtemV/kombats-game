import { queryClient } from './query-client';
import { battleHubManager, chatHubManager } from './transport-init';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '@/modules/player/store';
import { useBattleStore } from '@/modules/battle/store';
import { useChatStore } from '@/modules/chat/store';
import { useMatchmakingStore } from '@/modules/matchmaking/store';

/**
 * Tear down all session-scoped client state before a user switch or logout.
 *
 * Cleans up:
 *   - live SignalR connections (battle + chat)
 *   - every module Zustand store (auth/player/battle/chat/matchmaking)
 *   - every TanStack Query cache entry (cancels in-flight requests and
 *     resets cache state so the next user does not read the previous user's
 *     game state / player cards / chat history)
 *
 * Called from the auth `logout()` flow. Safe to call more than once — each
 * store's clear action is idempotent and `disconnect()` handles "already
 * disconnected" internally.
 */
export async function clearSessionState(): Promise<void> {
  // Disconnect transports first so any late event handlers do not repopulate
  // stores we are about to clear. These are best-effort — ignore failures.
  await Promise.allSettled([
    battleHubManager.disconnect(),
    chatHubManager.disconnect(),
  ]);

  // Cancel in-flight queries and wipe cached data. Cancel first so
  // resolving queries do not write into the cache we just cleared.
  await queryClient.cancelQueries();
  queryClient.removeQueries();

  // Reset module stores. Order doesn't matter — none of them cross-write.
  useBattleStore.getState().reset();
  useChatStore.getState().clearStore();
  useMatchmakingStore.getState().setIdle();
  usePlayerStore.getState().clearState();
  useAuthStore.getState().clearAuth();
}

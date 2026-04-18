import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { matchmakingPoller } from '@/transport/polling/matchmaking-poller';
import * as queueApi from '@/transport/http/endpoints/queue';
import { gameKeys } from '@/app/query-client';
import { usePlayerStore } from '@/modules/player/store';
import { useMatchmakingStore } from './store';
import { deriveQueueUiStatus, type QueueUiStatus } from './queue-ui-status';
import type { QueueStatusResponse, LeaveQueueResponse, ApiError } from '@/types/api';

const POLL_INTERVAL_MS = 2000;

/**
 * Public UI projection of the queue state. Derived from the authoritative
 * `usePlayerStore.queueStatus` + the UI-local `battleTransitioning` flag.
 *
 * Consumers get the single status value plus the local timer / failure
 * counter. `matchId` / `battleId` / `matchState` live on the player store
 * for anyone who needs them; matchmaking UIs don't.
 */
export function useQueueUiState(): {
  status: QueueUiStatus;
  searchStartedAt: number | null;
  consecutiveFailures: number;
} {
  const queueStatus = usePlayerStore((s) => s.queueStatus);
  const battleTransitioning = useMatchmakingStore((s) => s.battleTransitioning);
  const searchStartedAt = useMatchmakingStore((s) => s.searchStartedAt);
  const consecutiveFailures = useMatchmakingStore((s) => s.consecutiveFailures);

  return {
    status: deriveQueueUiStatus(queueStatus, battleTransitioning),
    searchStartedAt,
    consecutiveFailures,
  };
}

/**
 * Core matchmaking hook — exposes the derived status + join/leave actions.
 *
 * Syncs the UI-local matchmaking store back to its empty shape whenever the
 * authoritative queue status drops to `Idle` / `NotQueued` / `null`. This
 * effect runs wherever `useMatchmaking()` is mounted (lobby `QueueButton`
 * and `SearchingScreen`), so it covers the post-battle return and the
 * cancel-during-search flows without needing a dedicated observer.
 */
export function useMatchmaking() {
  const { status, searchStartedAt, consecutiveFailures } = useQueueUiState();
  const queueStatus = usePlayerStore((s) => s.queueStatus);
  const queryClient = useQueryClient();

  // Reset matchmaking UI state when authoritative queue becomes inactive.
  useEffect(() => {
    const inactive =
      !queueStatus ||
      queueStatus.status === 'Idle' ||
      queueStatus.status === 'NotQueued';
    if (!inactive) return;

    const mm = useMatchmakingStore.getState();
    if (
      mm.searchStartedAt !== null ||
      mm.battleTransitioning ||
      mm.consecutiveFailures !== 0
    ) {
      mm.setIdle();
    }
  }, [queueStatus]);

  const joinQueue = useCallback(async () => {
    // Read the latest derived status via the stores — the closure's `status`
    // from a previous render would be stale on rapid re-clicks.
    const currentStatus = deriveQueueUiStatus(
      usePlayerStore.getState().queueStatus,
      useMatchmakingStore.getState().battleTransitioning,
    );
    if (currentStatus !== 'idle') return;

    try {
      await queueApi.join();
      useMatchmakingStore.getState().startSearch();
      usePlayerStore.getState().setQueueStatus({
        status: 'Searching',
        matchId: null,
        battleId: null,
        matchState: null,
      });
    } catch (err: unknown) {
      // 409 = already queued / matched — authoritative state lives on the
      // server. Refetch and let the guards route accordingly.
      if (isApiError(err) && err.status === 409) {
        await queryClient.invalidateQueries({ queryKey: gameKeys.state() });
        return;
      }
      // Non-409 failures (5xx, network, 400, etc.) — rethrow so the caller
      // can surface a visible error.
      throw err;
    }
  }, [queryClient]);

  const leaveQueue = useCallback(async () => {
    const currentStatus = deriveQueueUiStatus(
      usePlayerStore.getState().queueStatus,
      useMatchmakingStore.getState().battleTransitioning,
    );
    if (currentStatus !== 'searching' && currentStatus !== 'matched') return;

    try {
      const response: LeaveQueueResponse = await queueApi.leave();

      if (!response.leftQueue && response.battleId) {
        // Late match — user pressed Cancel but the server already paired
        // them. Flip the transitioning flag and write the authoritative
        // Matched+battleId snapshot so BattleGuard routes to /battle/:id.
        useMatchmakingStore.getState().setBattleTransitioning(true);
        usePlayerStore.getState().setQueueStatus({
          status: 'Matched',
          matchId: response.matchId,
          battleId: response.battleId,
          matchState: 'BattleCreated',
        });
      } else {
        useMatchmakingStore.getState().setIdle();
        usePlayerStore.getState().setQueueStatus({
          status: 'Idle',
          matchId: null,
          battleId: null,
          matchState: null,
        });
      }
    } catch {
      await queryClient.invalidateQueries({ queryKey: gameKeys.state() });
    }
  }, [queryClient]);

  return {
    status,
    searchStartedAt,
    consecutiveFailures,
    joinQueue,
    leaveQueue,
  };
}

/**
 * Starts/stops the polling lifecycle based on the derived UI status.
 * Must be called in the SearchingScreen.
 *
 * Also restarts the UI-local search timer when reached via page refresh —
 * `playerStore.queueStatus` is restored by `GameStateLoader`, but the
 * matchmaking store resets on reload so `searchStartedAt` needs re-seeding.
 */
export function useMatchmakingPolling(): void {
  const queueStatus = usePlayerStore((s) => s.queueStatus);
  const battleTransitioning = useMatchmakingStore((s) => s.battleTransitioning);
  const searchStartedAt = useMatchmakingStore((s) => s.searchStartedAt);

  const status = deriveQueueUiStatus(queueStatus, battleTransitioning);

  // Re-seed the UI-local timer after a page refresh that lands us on the
  // searching screen. Only fires when the UI-local state is empty and the
  // authoritative queue is active.
  useEffect(() => {
    if (searchStartedAt !== null) return;
    if (!queueStatus) return;
    if (
      queueStatus.status === 'Searching' ||
      (queueStatus.status === 'Matched' && !queueStatus.battleId)
    ) {
      useMatchmakingStore.getState().startSearch();
    }
  }, [searchStartedAt, queueStatus]);

  useEffect(() => {
    if (status !== 'searching' && status !== 'matched') {
      matchmakingPoller.stop();
      return;
    }

    const handleResult = (response: QueueStatusResponse) => {
      useMatchmakingStore.getState().resetFailures();
      // Flag the transition BEFORE the authoritative write so derived
      // status observers see "battleTransition" consistently even in the
      // brief moment React batches the two updates.
      if (response.status === 'Matched' && response.battleId) {
        useMatchmakingStore.getState().setBattleTransitioning(true);
      }
      usePlayerStore.getState().setQueueStatus(response);
    };

    const handleError = () => {
      useMatchmakingStore.getState().incrementFailures();
    };

    matchmakingPoller.start(POLL_INTERVAL_MS, handleResult, handleError);

    return () => {
      matchmakingPoller.stop();
    };
  }, [status]);
}

function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as ApiError).status === 'number'
  );
}

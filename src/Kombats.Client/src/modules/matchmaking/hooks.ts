import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { matchmakingPoller } from '@/transport/polling/matchmaking-poller';
import * as queueApi from '@/transport/http/endpoints/queue';
import { gameKeys } from '@/app/query-client';
import { usePlayerStore } from '@/modules/player/store';
import { useMatchmakingStore } from './store';
import type { QueueStatusResponse, LeaveQueueResponse, ApiError } from '@/types/api';

const POLL_INTERVAL_MS = 2000;

/**
 * Core matchmaking hook — exposes state + join/leave actions.
 * Also syncs matchmaking store back to idle when the authoritative
 * queue status (player store) becomes inactive. This effect runs
 * wherever useMatchmaking() is mounted (lobby, searching screen),
 * so it covers the post-battle return-to-lobby scenario.
 */
export function useMatchmaking() {
  const status = useMatchmakingStore((s) => s.status);
  const matchId = useMatchmakingStore((s) => s.matchId);
  const battleId = useMatchmakingStore((s) => s.battleId);
  const matchState = useMatchmakingStore((s) => s.matchState);
  const searchStartedAt = useMatchmakingStore((s) => s.searchStartedAt);
  const consecutiveFailures = useMatchmakingStore((s) => s.consecutiveFailures);
  const queueStatus = usePlayerStore((s) => s.queueStatus);
  const queryClient = useQueryClient();

  // Reset matchmaking to idle when authoritative queue status becomes inactive.
  // Handles: battle ended → game state refreshed → queueStatus goes Idle/null.
  // Mounted via QueueButton on lobby, so this runs even after battle handoff.
  useEffect(() => {
    const mmStatus = useMatchmakingStore.getState().status;
    if (mmStatus === 'idle') return;

    if (!queueStatus || queueStatus.status === 'Idle' || queueStatus.status === 'NotQueued') {
      useMatchmakingStore.getState().setIdle();
    }
  }, [queueStatus]);

  const joinQueue = useCallback(async () => {
    const store = useMatchmakingStore.getState();
    if (store.status !== 'idle') return;

    try {
      await queueApi.join();
      useMatchmakingStore.getState().setSearching();
      usePlayerStore.getState().setQueueStatus({
        status: 'Searching',
        matchId: null,
        battleId: null,
        matchState: null,
      });
    } catch (err: unknown) {
      if (isApiError(err) && err.status === 409) {
        await queryClient.invalidateQueries({ queryKey: gameKeys.state() });
      }
    }
  }, [queryClient]);

  const leaveQueue = useCallback(async () => {
    const store = useMatchmakingStore.getState();
    if (store.status !== 'searching' && store.status !== 'matched') return;

    try {
      const response: LeaveQueueResponse = await queueApi.leave();

      if (!response.leftQueue && response.battleId) {
        useMatchmakingStore.getState().setBattleTransition(response.battleId);
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
    matchId,
    battleId,
    matchState,
    searchStartedAt,
    consecutiveFailures,
    joinQueue,
    leaveQueue,
  };
}

/**
 * Starts/stops the polling lifecycle based on matchmaking status.
 * Must be called in the SearchingScreen.
 *
 * Also hydrates the matchmaking store from the player store when the screen
 * is reached via page refresh — `playerStore.queueStatus` is restored by
 * `GameStateLoader`, but `matchmakingStore` resets to `idle` on reload.
 */
export function useMatchmakingPolling(): void {
  const status = useMatchmakingStore((s) => s.status);
  const queueStatus = usePlayerStore((s) => s.queueStatus);

  // Hydrate matchmaking store from player store when out of sync
  // (page refresh during search / Matched-without-battleId preparation).
  useEffect(() => {
    if (status !== 'idle') return;
    if (!queueStatus) return;

    useMatchmakingStore.getState().hydrateFromServer(
      queueStatus.status,
      queueStatus.matchId,
      queueStatus.battleId,
      queueStatus.matchState,
    );
  }, [status, queueStatus]);

  useEffect(() => {
    if (status !== 'searching' && status !== 'matched') {
      matchmakingPoller.stop();
      return;
    }

    const handlePollResult = (response: QueueStatusResponse) => {
      useMatchmakingStore.getState().resetFailures();
      useMatchmakingStore.getState().updateFromPoll(
        response.status,
        response.matchId,
        response.battleId,
        response.matchState,
      );

      usePlayerStore.getState().setQueueStatus(response);
    };

    const handlePollError = () => {
      useMatchmakingStore.getState().incrementFailures();
    };

    matchmakingPoller.start(POLL_INTERVAL_MS, handlePollResult, handlePollError);

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

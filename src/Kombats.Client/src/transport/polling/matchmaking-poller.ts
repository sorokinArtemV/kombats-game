import * as queueApi from '@/transport/http/endpoints/queue';
import type { QueueStatusResponse } from '@/types/api';

export type PollerCallback = (response: QueueStatusResponse) => void;
export type PollerErrorCallback = (error: unknown) => void;

class MatchmakingPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;
  private _consecutiveFailures = 0;

  get isRunning(): boolean {
    return this._isRunning;
  }

  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  start(
    intervalMs: number,
    onResult: PollerCallback,
    onError?: PollerErrorCallback,
  ): void {
    if (this._isRunning) return;

    this._isRunning = true;
    this._consecutiveFailures = 0;

    const poll = async () => {
      try {
        const response = await queueApi.getStatus();
        this._consecutiveFailures = 0;
        onResult(response);
      } catch (error: unknown) {
        this._consecutiveFailures++;
        onError?.(error);
      }
    };

    // Fire immediately, then on interval
    poll();
    this.intervalId = setInterval(poll, intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._isRunning = false;
    this._consecutiveFailures = 0;
  }
}

export const matchmakingPoller = new MatchmakingPoller();

import type { BattleEndReasonRealtime } from '@/types/battle';

export type BattleEndOutcome = 'victory' | 'defeat' | 'draw' | 'error' | 'other';

export interface BattleEndPresentation {
  outcome: BattleEndOutcome;
  title: string;
  subtitle: string;
}

/**
 * Derive the user-facing battle-end presentation from the end reason,
 * winner, and current player identity.
 *
 * SystemError branch: Phase 7 only hands off to the Phase 8 result screen —
 * the subtitle therefore matches the plan's core phrasing without promising
 * a "return to lobby" that Phase 7 does not perform. The lobby return is
 * the result-screen's responsibility.
 */
export function deriveOutcome(
  reason: BattleEndReasonRealtime | null,
  winnerId: string | null,
  myId: string | null,
): BattleEndPresentation {
  if (reason === 'SystemError') {
    return {
      outcome: 'error',
      title: 'Battle Ended',
      subtitle: 'Battle ended due to a system error.',
    };
  }
  if (reason === 'DoubleForfeit') {
    return {
      outcome: 'draw',
      title: 'Draw',
      subtitle: 'Both fighters forfeited through inactivity.',
    };
  }
  if (reason === 'Timeout') {
    return {
      outcome: 'draw',
      title: 'Draw',
      subtitle: 'The battle timed out.',
    };
  }
  if (reason === 'Cancelled' || reason === 'AdminForced' || reason === 'Unknown') {
    return {
      outcome: 'other',
      title: 'Battle Ended',
      subtitle: 'The battle ended unexpectedly.',
    };
  }

  if (winnerId && myId && winnerId === myId) {
    return { outcome: 'victory', title: 'Victory!', subtitle: 'You won the match.' };
  }
  if (winnerId && myId && winnerId !== myId) {
    return { outcome: 'defeat', title: 'Defeat', subtitle: 'Your opponent prevailed.' };
  }
  return {
    outcome: 'draw',
    title: 'Draw',
    subtitle: 'No winner was declared.',
  };
}

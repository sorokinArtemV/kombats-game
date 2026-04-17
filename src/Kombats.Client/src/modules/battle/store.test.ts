import { describe, it, expect, beforeEach } from 'vitest';
import { useBattleStore } from './store';
import type { BattleZone } from '@/types/battle';

function resetStore() {
  useBattleStore.getState().reset();
}

function getState() {
  return useBattleStore.getState();
}

describe('Battle store state machine', () => {
  beforeEach(resetStore);

  it('starts in Idle phase', () => {
    expect(getState().phase).toBe('Idle');
  });

  describe('TurnOpen -> Submitted', () => {
    beforeEach(() => {
      // Advance to TurnOpen
      getState().startBattle('battle-1');
      getState().handleConnected();
      getState().handleTurnOpened({
        battleId: 'battle-1',
        turnIndex: 1,
        deadlineUtc: '2026-01-01T00:00:30Z',
      });
    });

    it('transitions to TurnOpen', () => {
      expect(getState().phase).toBe('TurnOpen');
      expect(getState().turnIndex).toBe(1);
    });

    it('transitions to Submitted when setSubmitting(true)', () => {
      getState().selectAttackZone('Head' as BattleZone);
      getState().selectBlockPair(['Chest', 'Belly'] as [BattleZone, BattleZone]);
      getState().setSubmitting(true);

      expect(getState().phase).toBe('Submitted');
      expect(getState().isSubmitting).toBe(true);
    });
  });

  describe('submit failure recovery', () => {
    beforeEach(() => {
      getState().startBattle('battle-1');
      getState().handleConnected();
      getState().handleTurnOpened({
        battleId: 'battle-1',
        turnIndex: 1,
        deadlineUtc: '2026-01-01T00:00:30Z',
      });
      getState().selectAttackZone('Head' as BattleZone);
      getState().selectBlockPair(['Chest', 'Belly'] as [BattleZone, BattleZone]);
      getState().setSubmitting(true);
    });

    it('recovers to TurnOpen on setSubmitting(false)', () => {
      expect(getState().phase).toBe('Submitted');

      getState().setSubmitting(false);

      expect(getState().phase).toBe('TurnOpen');
      expect(getState().isSubmitting).toBe(false);
    });

    it('preserves selections after submit failure recovery', () => {
      getState().setSubmitting(false);

      expect(getState().selectedAttackZone).toBe('Head');
      expect(getState().selectedBlockPair).toEqual(['Chest', 'Belly']);
    });

    it('does not stomp Resolving phase on late submit failure', () => {
      // Simulate: submit sent, server resolves before client gets invoke error
      getState().handleTurnResolved({
        battleId: 'battle-1',
        turnIndex: 1,
        playerAAction: '{}',
        playerBAction: '{}',
        log: null,
      });
      expect(getState().phase).toBe('Resolving');

      // Late invoke failure arrives — should NOT revert to TurnOpen
      getState().setSubmitting(false);
      expect(getState().phase).toBe('Resolving');
      expect(getState().isSubmitting).toBe(false);
    });
  });

  describe('Resolving -> TurnOpen (next turn)', () => {
    it('transitions through resolving to next turn', () => {
      getState().startBattle('battle-1');
      getState().handleConnected();
      getState().handleTurnOpened({
        battleId: 'battle-1',
        turnIndex: 1,
        deadlineUtc: '2026-01-01T00:00:30Z',
      });

      getState().handleTurnResolved({
        battleId: 'battle-1',
        turnIndex: 1,
        playerAAction: '{}',
        playerBAction: '{}',
        log: null,
      });
      expect(getState().phase).toBe('Resolving');

      getState().handleTurnOpened({
        battleId: 'battle-1',
        turnIndex: 2,
        deadlineUtc: '2026-01-01T00:01:00Z',
      });
      expect(getState().phase).toBe('TurnOpen');
      expect(getState().turnIndex).toBe(2);
      expect(getState().selectedAttackZone).toBeNull();
      expect(getState().selectedBlockPair).toBeNull();
    });
  });

  describe('Resolving -> Ended', () => {
    it('transitions to Ended via handleBattleEnded', () => {
      getState().startBattle('battle-1');
      getState().handleConnected();
      getState().handleTurnOpened({
        battleId: 'battle-1',
        turnIndex: 1,
        deadlineUtc: '2026-01-01T00:00:30Z',
      });
      getState().handleTurnResolved({
        battleId: 'battle-1',
        turnIndex: 1,
        playerAAction: '{}',
        playerBAction: '{}',
        log: null,
      });
      expect(getState().phase).toBe('Resolving');

      getState().handleBattleEnded({
        battleId: 'battle-1',
        reason: 'Normal',
        winnerPlayerId: 'player-a',
        endedAt: '2026-01-01T00:01:00Z',
      });
      expect(getState().phase).toBe('Ended');
      expect(getState().endReason).toBe('Normal');
      expect(getState().winnerPlayerId).toBe('player-a');
    });
  });

  describe('ConnectionLost -> reconnect path', () => {
    it('transitions to ConnectionLost then WaitingForJoin on reconnect', () => {
      getState().startBattle('battle-1');
      getState().handleConnected();
      getState().handleTurnOpened({
        battleId: 'battle-1',
        turnIndex: 1,
        deadlineUtc: '2026-01-01T00:00:30Z',
      });

      getState().handleConnectionLost();
      expect(getState().phase).toBe('ConnectionLost');

      getState().handleReconnected();
      expect(getState().phase).toBe('WaitingForJoin');
    });

    it('does not transition to ConnectionLost from Idle', () => {
      getState().handleConnectionLost();
      expect(getState().phase).toBe('Idle');
    });

    it('does not transition to ConnectionLost from Ended', () => {
      getState().startBattle('battle-1');
      getState().handleConnected();
      getState().handleBattleEnded({
        battleId: 'battle-1',
        reason: 'Normal',
        winnerPlayerId: null,
        endedAt: '2026-01-01T00:01:00Z',
      });
      expect(getState().phase).toBe('Ended');

      getState().handleConnectionLost();
      expect(getState().phase).toBe('Ended');
    });
  });
});

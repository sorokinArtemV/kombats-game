import { Navigate, Outlet, useLocation } from 'react-router';
import { usePlayerStore } from '@/modules/player/store';
import { useBattleStore } from '@/modules/battle/store';

export function BattleGuard() {
  const queueStatus = usePlayerStore((s) => s.queueStatus);
  const battlePhase = useBattleStore((s) => s.phase);
  const storeBattleId = useBattleStore((s) => s.battleId);
  const location = useLocation();

  if (queueStatus) {
    if (queueStatus.status === 'Matched' && queueStatus.battleId) {
      const battlePath = `/battle/${queueStatus.battleId}`;
      // REQ-P1 (hard gate: result must be dismissed): once the battle has
      // ended, do not force-redirect the player back onto the live battle
      // path. They may be on `/battle/:id/result` dismissing the result,
      // or on their way to the lobby.
      const battleEnded =
        battlePhase === 'Ended' && storeBattleId === queueStatus.battleId;

      if (!battleEnded && !location.pathname.startsWith(battlePath)) {
        return <Navigate to={battlePath} replace />;
      }
      return <Outlet />;
    }

    if (
      queueStatus.status === 'Searching' ||
      (queueStatus.status === 'Matched' && !queueStatus.battleId)
    ) {
      if (location.pathname !== '/matchmaking') {
        return <Navigate to="/matchmaking" replace />;
      }
      return <Outlet />;
    }
  }

  // No active queue state — block access to battle/matchmaking routes,
  // EXCEPT while the result screen is still being dismissed (hard gate
  // REQ-P1). The result screen itself clears state by navigating to /lobby.
  const onResultForEndedBattle =
    battlePhase === 'Ended' &&
    !!storeBattleId &&
    location.pathname === `/battle/${storeBattleId}/result`;

  if (
    !onResultForEndedBattle &&
    (location.pathname.startsWith('/battle') || location.pathname === '/matchmaking')
  ) {
    return <Navigate to="/lobby" replace />;
  }

  return <Outlet />;
}

import { Navigate, Outlet, useLocation } from 'react-router';
import { usePlayerStore } from '@/modules/player/store';

export function BattleGuard() {
  const queueStatus = usePlayerStore((s) => s.queueStatus);
  const location = useLocation();

  if (queueStatus) {
    // Active battle — force to battle route
    if (queueStatus.status === 'Matched' && queueStatus.battleId) {
      const battlePath = `/battle/${queueStatus.battleId}`;
      if (
        !location.pathname.startsWith(battlePath)
      ) {
        return <Navigate to={battlePath} replace />;
      }
      return <Outlet />;
    }

    // Searching — force to matchmaking screen
    if (queueStatus.status === 'Searching') {
      if (location.pathname !== '/matchmaking') {
        return <Navigate to="/matchmaking" replace />;
      }
      return <Outlet />;
    }
  }

  // No active queue state — block access to battle/matchmaking routes
  if (location.pathname.startsWith('/battle') || location.pathname === '/matchmaking') {
    return <Navigate to="/lobby" replace />;
  }

  return <Outlet />;
}

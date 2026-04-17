import { Outlet, useParams } from 'react-router';
import { useBattleConnection } from '@/modules/battle/hooks';

export function BattleShell() {
  const { battleId } = useParams<{ battleId: string }>();

  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      {battleId && <BattleConnectionHost battleId={battleId} />}
      <Outlet />
    </div>
  );
}

/**
 * Owns the battle hub connection for the entire /battle/:battleId/* subtree.
 * Mounted above both the live battle screen and the result screen so the
 * battle store (phase=Ended, feed, outcome) survives the hand-off.
 */
function BattleConnectionHost({ battleId }: { battleId: string }) {
  useBattleConnection(battleId);
  return null;
}

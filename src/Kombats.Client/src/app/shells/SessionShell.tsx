import { Outlet } from 'react-router';
import { useChatConnection } from '@/modules/chat/hooks';

export function SessionShell() {
  // Session-scoped chat connection — mounted above the BattleGuard split
  // so it survives lobby ↔ battle navigation without disconnecting.
  useChatConnection();

  return <Outlet />;
}

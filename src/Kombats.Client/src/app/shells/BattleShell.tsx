import { Outlet } from 'react-router';

export function BattleShell() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <Outlet />
    </div>
  );
}

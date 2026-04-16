import { Outlet } from 'react-router';

export function OnboardingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-md rounded-lg bg-bg-surface p-8">
        <Outlet />
      </div>
    </div>
  );
}

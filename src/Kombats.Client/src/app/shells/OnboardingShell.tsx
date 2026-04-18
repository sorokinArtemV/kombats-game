import { Outlet } from 'react-router';

export function OnboardingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-lg rounded-lg bg-bg-surface p-6 sm:p-8">
        <Outlet />
      </div>
    </div>
  );
}

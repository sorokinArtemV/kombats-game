import { Outlet } from 'react-router';

export function OnboardingShell() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary text-text-primary">
      <header className="flex items-center border-b border-border bg-bg-nav px-4 py-2">
        <span className="font-display text-base font-semibold tracking-[0.15em] text-text-primary">
          KOMBATS
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-md border border-border bg-bg-secondary p-6 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

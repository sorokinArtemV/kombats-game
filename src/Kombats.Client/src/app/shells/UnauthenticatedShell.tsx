import { Navigate } from 'react-router';
import { useAuth } from '@/modules/auth/hooks';
import { useAuthStore } from '@/modules/auth/store';

export function UnauthenticatedShell() {
  const authStatus = useAuthStore((s) => s.authStatus);
  const { login, register } = useAuth();

  // On initial app load we attempt a prompt=none SSO restore against Keycloak.
  // Until that bootstrap attempt resolves, authStatus stays 'loading'. Showing
  // the guest landing here would flash the login screen and then navigate
  // away — instead, hold the render until bootstrap succeeds or fails.
  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-text-secondary">Restoring session...</p>
      </div>
    );
  }

  // Silent restore succeeded (SSO cookie still valid on Keycloak): route the
  // user into the authenticated app. The downstream guards (GameStateLoader,
  // OnboardingGuard, BattleGuard) will redirect to the correct destination.
  if (authStatus === 'authenticated') {
    return <Navigate to="/lobby" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-primary text-text-primary">
      <header className="flex items-center border-b border-border bg-bg-nav px-4 py-2">
        <span className="font-display text-base font-semibold tracking-[0.15em] text-text-primary">
          KOMBATS
        </span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="font-display text-5xl font-bold uppercase tracking-[0.2em] text-text-primary">
            KOMBATS
          </h1>
          <p className="text-sm text-text-muted">Turn-based arena combat</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={login}
            className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Login
          </button>
          <button
            type="button"
            onClick={register}
            className="inline-flex items-center justify-center rounded-md border border-accent px-6 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
          >
            Register
          </button>
        </div>
      </main>
    </div>
  );
}

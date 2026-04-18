import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/modules/auth/store';

const DIAG = '[KOMBATS-AUTH-DIAG v3]';

export function AuthGuard() {
  const authStatus = useAuthStore((s) => s.authStatus);
  const hasToken = useAuthStore((s) => !!s.accessToken);
  const location = useLocation();

  // eslint-disable-next-line no-console
  console.log(`${DIAG} AuthGuard`, {
    pathname: location.pathname,
    authStatus,
    hasToken,
  });

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-text-secondary">Checking authentication...</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    // eslint-disable-next-line no-console
    console.log(`${DIAG} AuthGuard -> Navigate /`, {
      pathname: location.pathname,
      reason: 'authStatus === unauthenticated',
    });
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

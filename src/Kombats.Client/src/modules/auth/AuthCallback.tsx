import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from 'react-oidc-context';

const DIAG = '[KOMBATS-AUTH-DIAG v3]';

export function AuthCallback() {
  const auth = useAuth();
  const navigate = useNavigate();

  // Per-render marker: proves this component is rendered and on the callback route.
  // eslint-disable-next-line no-console
  console.log(`${DIAG} AuthCallback render`, {
    pathname: window.location.pathname,
    search: window.location.search,
    isLoading: auth.isLoading,
    activeNavigator: auth.activeNavigator,
    isAuthenticated: auth.isAuthenticated,
    hasUser: !!auth.user,
    error: auth.error ? String(auth.error) : null,
  });

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(`${DIAG} AuthCallback effect`, {
      isLoading: auth.isLoading,
      activeNavigator: auth.activeNavigator,
      isAuthenticated: auth.isAuthenticated,
      hasUser: !!auth.user,
      error: auth.error ? String(auth.error) : null,
    });

    if (auth.isLoading || auth.activeNavigator) {
      // eslint-disable-next-line no-console
      console.log(`${DIAG} AuthCallback skip — still loading or navigating`);
      return;
    }

    if (auth.isAuthenticated) {
      // eslint-disable-next-line no-console
      console.log(`${DIAG} AuthCallback -> navigate /lobby (soft)`);
      navigate('/lobby', { replace: true });
    } else {
      // eslint-disable-next-line no-console
      console.log(`${DIAG} AuthCallback -> navigate / (soft, FAILURE PATH)`, {
        reason: auth.error ? 'error' : 'not authenticated after callback',
        error: auth.error ? String(auth.error) : null,
      });
      navigate('/', { replace: true });
    }
  }, [auth.isLoading, auth.activeNavigator, auth.isAuthenticated, auth.error, auth.user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <p className="text-text-secondary">Authenticating...</p>
    </div>
  );
}

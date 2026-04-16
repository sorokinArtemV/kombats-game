import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';

export function AuthCallback() {
  const auth = useAuth();

  useEffect(() => {
    // react-oidc-context processes the callback automatically when
    // AuthProvider mounts on the /auth/callback route.
    // Once processing completes, redirect to app root.
    if (!auth.isLoading && !auth.activeNavigator) {
      if (auth.isAuthenticated) {
        // Success — redirect into the authenticated route pipeline.
        // Guards and GameStateLoader determine the correct final destination.
        window.location.replace('/lobby');
      } else {
        // Callback failed, or user returned without completing auth
        window.location.replace('/');
      }
    }
  }, [auth.isLoading, auth.activeNavigator, auth.isAuthenticated, auth.error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <p className="text-text-secondary">Authenticating...</p>
    </div>
  );
}

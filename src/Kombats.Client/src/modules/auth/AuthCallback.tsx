import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from 'react-oidc-context';

export function AuthCallback() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isLoading || auth.activeNavigator) {
      return;
    }

    if (auth.isAuthenticated) {
      navigate('/lobby', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [auth.isLoading, auth.activeNavigator, auth.isAuthenticated, auth.error, auth.user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <p className="text-text-secondary">Authenticating...</p>
    </div>
  );
}

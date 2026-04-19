import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from 'react-oidc-context';
import { SplashScreen } from '@/ui/components/SplashScreen';

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

  return <SplashScreen />;
}

import { useCallback } from 'react';
import { useAuth as useOidcAuth } from 'react-oidc-context';
import { useAuthStore } from './store';

export function useAuth() {
  const oidcAuth = useOidcAuth();
  const { authStatus, userIdentityId, displayName } = useAuthStore();

  const login = useCallback(() => {
    oidcAuth.signinRedirect();
  }, [oidcAuth]);

  const register = useCallback(() => {
    oidcAuth.signinRedirect({ extraQueryParams: { kc_action: 'register' } });
  }, [oidcAuth]);

  const logout = useCallback(() => {
    // Clear frontend state before redirecting to Keycloak logout.
    // Full cleanup (SignalR disconnects, store clears, query cache) will be
    // expanded in later phases as those systems come online.
    useAuthStore.getState().clearAuth();
    oidcAuth.signoutRedirect();
  }, [oidcAuth]);

  return {
    authStatus,
    userIdentityId,
    displayName,
    isAuthenticated: authStatus === 'authenticated',
    isLoading: oidcAuth.isLoading || authStatus === 'loading',
    login,
    register,
    logout,
  };
}

import { useCallback } from 'react';
import { useAuth as useOidcAuth } from 'react-oidc-context';
import { useAuthStore } from './store';
import { clearSessionState } from '@/app/session-cleanup';

export function useAuth() {
  const oidcAuth = useOidcAuth();
  const { authStatus, userIdentityId, displayName } = useAuthStore();

  const login = useCallback(() => {
    oidcAuth.signinRedirect();
  }, [oidcAuth]);

  const register = useCallback(() => {
    oidcAuth.signinRedirect({ extraQueryParams: { kc_action: 'register' } });
  }, [oidcAuth]);

  const logout = useCallback(async () => {
    // Tear down every session-scoped artifact (SignalR connections, module
    // stores, TanStack Query cache) before redirecting to Keycloak. This
    // guarantees a clean slate on user switch / relogin — no previous
    // session's game state, chat history, or battle store leaks through.
    await clearSessionState();
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

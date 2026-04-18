import { useCallback } from 'react';
import { useAuth as useOidcAuth } from 'react-oidc-context';
import { useAuthStore } from './store';
import { clearSessionState } from '@/app/session-cleanup';
import { logger } from '@/app/logger';

export function useAuth() {
  const oidcAuth = useOidcAuth();
  const { authStatus, userIdentityId, displayName } = useAuthStore();

  const login = useCallback(() => {
    oidcAuth.signinRedirect();
  }, [oidcAuth]);

  const register = useCallback(() => {
    // Keycloak has two parameters that trigger the registration form on
    // the authorization endpoint:
    //   - `kc_action=register`  — introduced in Keycloak 24; semantics
    //                             were narrowed in later releases so it
    //                             is not reliable for anonymous users on
    //                             every version.
    //   - `prompt=create`       — the OIDC-standard draft parameter,
    //                             supported by Keycloak 21+ for the
    //                             anonymous-registration case.
    // Sending both lets whichever parameter this realm's Keycloak
    // version honors take effect; the other is ignored. This is the
    // most forward- and backward-compatible shape short of constructing
    // the URL manually and hitting the `/registrations` endpoint.
    oidcAuth.signinRedirect({
      extraQueryParams: { kc_action: 'register', prompt: 'create' },
    });
  }, [oidcAuth]);

  const logout = useCallback(async () => {
    // Order matters.
    //
    // 1. Remove the oidc-client-ts user first. If we cleared our Zustand
    //    stores first, the AuthSync effect's next render would observe
    //    `auth.isAuthenticated && auth.user && !auth.user.expired` (still
    //    true until removeUser settles) and re-populate `useAuthStore` via
    //    setUser — silently "un-logging-out" the user. Removing the oidc
    //    user first flips `isAuthenticated` to false, so any intermediate
    //    render is safe.
    try {
      await oidcAuth.removeUser();
    } catch (err) {
      // removeUser is local; failures here are surprising but not fatal.
      logger.warn('oidcAuth.removeUser() failed during logout', err);
    }

    // 2. Tear down every session-scoped artifact (SignalR connections,
    //    module stores, TanStack Query cache). A clean slate on user
    //    switch / re-login — no previous session's game state, chat
    //    history, or battle store leaks through.
    await clearSessionState();

    // 3. Hit Keycloak's end-session endpoint and redirect. If this fails
    //    (unreachable IdP, CORS, missing post_logout_redirect_uri in
    //    Keycloak client config, etc.) we still want the user to land on
    //    a sane guest page — otherwise they are stuck on whatever screen
    //    they clicked "Sign out" from, with cleared local state but no
    //    visible auth UI. Falling back to a hard nav to the origin gives
    //    them the UnauthenticatedShell either way.
    try {
      await oidcAuth.signoutRedirect();
    } catch (err) {
      logger.error('oidcAuth.signoutRedirect() failed during logout', err);
      window.location.assign('/');
    }
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

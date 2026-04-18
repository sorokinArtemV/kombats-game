import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from 'react-oidc-context';
import type { User } from 'oidc-client-ts';
import { useAuthStore } from './store';
import { userManager } from './user-manager';

const DIAG = '[KOMBATS-AUTH-DIAG v3]';

function extractIdentity(user: User): {
  accessToken: string;
  identityId: string;
  displayName: string;
} {
  return {
    accessToken: user.access_token,
    identityId: user.profile.sub,
    displayName: (user.profile.preferred_username as string) ?? 'Unknown',
  };
}

function AuthSync({ children }: { children: ReactNode }) {
  const auth = useOidcAuth();
  const { setUser, updateToken, clearAuth } = useAuthStore();
  const syncedRef = useRef(false);

  const syncUser = useCallback(
    (user: User | null | undefined) => {
      if (user && !user.expired) {
        const { accessToken, identityId, displayName } = extractIdentity(user);
        // eslint-disable-next-line no-console
        console.log(`${DIAG} AuthSync -> setUser`, {
          identityId,
          displayName,
          tokenLen: accessToken?.length ?? 0,
          expiresAt: user.expires_at,
          now: Math.floor(Date.now() / 1000),
        });
        setUser(accessToken, identityId, displayName);
      } else {
        // eslint-disable-next-line no-console
        console.log(`${DIAG} AuthSync -> clearAuth (syncUser path)`, {
          hasUser: !!user,
          expired: user?.expired,
          expiresAt: user?.expires_at,
          now: Math.floor(Date.now() / 1000),
        });
        clearAuth();
      }
    },
    [setUser, clearAuth],
  );

  // Initial sync on mount + when auth state changes
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(`${DIAG} AuthSync effect`, {
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
      hasUser: !!auth.user,
      userExpired: auth.user?.expired,
      activeNavigator: auth.activeNavigator,
      error: auth.error ? String(auth.error) : null,
    });
    if (auth.isLoading) return;

    if (auth.isAuthenticated && auth.user) {
      syncUser(auth.user);
    } else if (!auth.isAuthenticated && !auth.activeNavigator) {
      // eslint-disable-next-line no-console
      console.log(`${DIAG} AuthSync -> clearAuth (else-if branch)`, {
        pathname: window.location.pathname,
        reason: '!isAuthenticated && !activeNavigator',
      });
      clearAuth();
    }
    syncedRef.current = true;
  }, [auth.isLoading, auth.isAuthenticated, auth.user, auth.activeNavigator, syncUser, clearAuth]);

  // Listen for token renewal
  useEffect(() => {
    const handleUserLoaded = (user: User) => {
      const { accessToken } = extractIdentity(user);
      // eslint-disable-next-line no-console
      console.log(`${DIAG} userManager.userLoaded -> updateToken`, {
        tokenLen: accessToken?.length ?? 0,
      });
      updateToken(accessToken);
    };

    userManager.events.addUserLoaded(handleUserLoaded);
    return () => {
      userManager.events.removeUserLoaded(handleUserLoaded);
    };
  }, [updateToken]);

  // Listen for silent renew errors
  useEffect(() => {
    const handleSilentRenewError = (error: Error) => {
      // eslint-disable-next-line no-console
      console.log(`${DIAG} silentRenewError -> clearAuth`, {
        error: String(error),
      });
      clearAuth();
    };

    userManager.events.addSilentRenewError(handleSilentRenewError);
    return () => {
      userManager.events.removeSilentRenewError(handleSilentRenewError);
    };
  }, [clearAuth]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <OidcAuthProvider userManager={userManager}>
      <AuthSync>{children}</AuthSync>
    </OidcAuthProvider>
  );
}

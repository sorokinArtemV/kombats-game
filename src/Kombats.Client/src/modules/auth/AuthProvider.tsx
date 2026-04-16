import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from 'react-oidc-context';
import type { User } from 'oidc-client-ts';
import { useAuthStore } from './store';
import { userManager } from './user-manager';

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
        setUser(accessToken, identityId, displayName);
      } else {
        clearAuth();
      }
    },
    [setUser, clearAuth],
  );

  // Initial sync on mount + when auth state changes
  useEffect(() => {
    if (auth.isLoading) return;

    if (auth.isAuthenticated && auth.user) {
      syncUser(auth.user);
    } else if (!auth.isAuthenticated && !auth.activeNavigator) {
      clearAuth();
    }
    syncedRef.current = true;
  }, [auth.isLoading, auth.isAuthenticated, auth.user, auth.activeNavigator, syncUser, clearAuth]);

  // Listen for token renewal
  useEffect(() => {
    const handleUserLoaded = (user: User) => {
      const { accessToken } = extractIdentity(user);
      updateToken(accessToken);
    };

    userManager.events.addUserLoaded(handleUserLoaded);
    return () => {
      userManager.events.removeUserLoaded(handleUserLoaded);
    };
  }, [updateToken]);

  // Listen for silent renew errors
  useEffect(() => {
    const handleSilentRenewError = () => {
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

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from 'react-oidc-context';
import type { User } from 'oidc-client-ts';
import { useAuthStore } from './store';
import { userManager } from './user-manager';

const DIAG = '[KOMBATS-AUTH-DIAG v4]';

// Hard upper bound on the bootstrap silent-restore attempt. Independent of
// oidc-client-ts's internal silentRequestTimeoutInSeconds so we always have a
// deterministic exit — even if the underlying promise is somehow pending.
const BOOTSTRAP_TIMEOUT_MS = 12_000;

// Module-level singleton guards the one-time bootstrap attempt. A component-
// level ref does NOT survive React StrictMode's mount→cleanup→remount cycle
// in the way we need: the ref persists, but the effect's `cancelled` closure
// flips to true during cleanup, and the re-run skips starting a fresh
// signinSilent because the ref is already true. The original promise then
// resolves but its `.finally` sees `cancelled === true` and never flips
// bootstrapComplete — leaving authStatus stuck on 'loading'. Hoisting the
// guard out of the component eliminates that class of bug entirely.
let bootstrapPromise: Promise<void> | null = null;

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

  // Tokens live in memory only (DEC-6), so a page refresh OR a browser restart
  // leaves us with no local user. On startup we attempt a prompt=none SSO
  // check against Keycloak to recover the session via its HTTP-only SSO
  // cookies. Until that attempt resolves we must NOT transition the store to
  // 'unauthenticated' — doing so bounces authenticated users back to the
  // guest landing on every reload. The /auth/callback route already has its
  // own redirect-based sign-in flow in flight, so we mark bootstrap complete
  // there (initialized true).
  const [bootstrapComplete, setBootstrapComplete] = useState<boolean>(
    () => window.location.pathname === '/auth/callback',
  );

  const syncUser = useCallback(
    (user: User | null | undefined) => {
      if (user && !user.expired) {
        const { accessToken, identityId, displayName } = extractIdentity(user);
         
        console.log(`${DIAG} AuthSync -> setUser`, {
          identityId,
          displayName,
          tokenLen: accessToken?.length ?? 0,
          expiresAt: user.expires_at,
        });
        setUser(accessToken, identityId, displayName);
      } else {
         
        console.log(`${DIAG} AuthSync -> clearAuth (syncUser path)`, {
          hasUser: !!user,
          expired: user?.expired,
        });
        clearAuth();
      }
    },
    [setUser, clearAuth],
  );

  // Bootstrap: try silent SSO restore exactly once per page load.
  //
  // Guaranteed-completion contract:
  //   1. Single run via module-level `bootstrapPromise` (StrictMode-safe).
  //   2. Explicit timeout (BOOTSTRAP_TIMEOUT_MS) wins if signinSilent never
  //      settles — no cancel flag gates the finalizer.
  //   3. `setBootstrapComplete(true)` ALWAYS runs when the race resolves.
  //   4. The main sync effect observes `bootstrapComplete === true` and drives
  //      authStatus to exactly one of 'authenticated' or 'unauthenticated'.
  useEffect(() => {
    if (bootstrapComplete) return;
    if (auth.isLoading) return;

    if (!bootstrapPromise) {
      if (auth.isAuthenticated && auth.user) {
        // Already authenticated on mount (e.g., HMR kept oidc state alive).
        // No silent restore needed — but we still flip bootstrapComplete so
        // the main sync effect's post-bootstrap branch is unblocked for
        // future state transitions.
        console.log(`${DIAG} bootstrap -> already authenticated, skip signinSilent`);
        bootstrapPromise = Promise.resolve();
      } else {
        console.log(`${DIAG} bootstrap -> signinSilent start`, {
          pathname: window.location.pathname,
        });

        const silent = auth
          .signinSilent()
          .then((user) => {
            console.log(`${DIAG} bootstrap -> signinSilent resolved`, {
              hasUser: !!user,
              expired: user?.expired,
            });
          })
          .catch((err) => {
            // login_required (no SSO cookie / session expired) is the expected
            // failure mode — main sync effect will transition to unauthenticated.
            // Network / iframe-timeout errors land here too.
            console.log(`${DIAG} bootstrap -> signinSilent rejected`, {
              err: String(err),
            });
          });

        const timeout = new Promise<void>((resolve) => {
          setTimeout(() => {
            console.log(`${DIAG} bootstrap -> external safety timeout fired`, {
              timeoutMs: BOOTSTRAP_TIMEOUT_MS,
            });
            resolve();
          }, BOOTSTRAP_TIMEOUT_MS);
        });

        bootstrapPromise = Promise.race([silent, timeout]);
      }
    }

    // `.finally` callback is async (microtask or later), so this never
    // triggers a synchronous cascading render from the effect body.
    bootstrapPromise.finally(() => {
      console.log(`${DIAG} bootstrap -> finalize (setBootstrapComplete true)`);
      setBootstrapComplete(true);
    });
  }, [bootstrapComplete, auth.isLoading, auth.isAuthenticated, auth.user, auth]);

  // Drive authStatus transitions. Runs whenever auth state or bootstrap
  // progresses. Pre-bootstrap we stay on 'loading'. Post-bootstrap we
  // unconditionally resolve to 'authenticated' (if we have a user) or
  // 'unauthenticated' (otherwise) — we deliberately do NOT gate on
  // activeNavigator here, because a silent navigator that never settles
  // would otherwise trap us in 'loading' forever.
  useEffect(() => {
     
    console.log(`${DIAG} AuthSync effect`, {
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
      hasUser: !!auth.user,
      userExpired: auth.user?.expired,
      activeNavigator: auth.activeNavigator,
      bootstrapComplete,
      authStatus: useAuthStore.getState().authStatus,
      error: auth.error ? String(auth.error) : null,
    });

    if (auth.isLoading) return;

    if (auth.isAuthenticated && auth.user && !auth.user.expired) {
      syncUser(auth.user);
      syncedRef.current = true;
      return;
    }

    if (bootstrapComplete) {
      // Bootstrap finished (success, rejection, or external timeout) and we
      // do not have a usable user — resolve to guest.

      console.log(`${DIAG} AuthSync -> clearAuth (post-bootstrap, no user)`, {
        pathname: window.location.pathname,
      });
      clearAuth();
      syncedRef.current = true;
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.user, auth.activeNavigator, auth.error, bootstrapComplete, syncUser, clearAuth]);

  // Token renewal: keep the in-memory access token fresh when oidc-client-ts
  // loads a new User (refresh_token renewal during an active session).
  useEffect(() => {
    const handleUserLoaded = (user: User) => {
      const { accessToken } = extractIdentity(user);
       
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

  useEffect(() => {
    const handleSilentRenewError = (error: Error) => {
       
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

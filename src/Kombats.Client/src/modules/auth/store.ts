import { create } from 'zustand';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Error tag surfaced by the bootstrap path when silent SSO restore does not
 * settle cleanly. `bootstrap_timeout` specifically means the 12s external
 * safety timer won — the most common user-facing cause is an unreachable
 * Keycloak on cold boot. The `UnauthenticatedShell` renders a retry banner
 * when this is set so the user is not stuck staring at the guest landing
 * with no explanation.
 */
export type AuthError = 'bootstrap_timeout';

interface AuthState {
  accessToken: string | null;
  userIdentityId: string | null;
  displayName: string | null;
  authStatus: AuthStatus;
  authError: AuthError | null;

  setUser: (accessToken: string, identityId: string, displayName: string) => void;
  updateToken: (accessToken: string) => void;
  clearAuth: () => void;
  setAuthError: (error: AuthError | null) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  userIdentityId: null,
  displayName: null,
  authStatus: 'loading',
  authError: null,

  setUser: (accessToken, identityId, displayName) =>
    set({
      accessToken,
      userIdentityId: identityId,
      displayName,
      authStatus: 'authenticated',
      authError: null,
    }),

  updateToken: (accessToken) => set({ accessToken }),

  clearAuth: () =>
    set({
      accessToken: null,
      userIdentityId: null,
      displayName: null,
      authStatus: 'unauthenticated',
    }),

  setAuthError: (error) => set({ authError: error }),
}));

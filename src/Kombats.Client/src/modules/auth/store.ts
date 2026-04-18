import { create } from 'zustand';

const DIAG = '[KOMBATS-AUTH-DIAG v3]';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  accessToken: string | null;
  userIdentityId: string | null;
  displayName: string | null;
  authStatus: AuthStatus;

  setUser: (accessToken: string, identityId: string, displayName: string) => void;
  updateToken: (accessToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  userIdentityId: null,
  displayName: null,
  authStatus: 'loading',

  setUser: (accessToken, identityId, displayName) => {
    // eslint-disable-next-line no-console
    console.log(`${DIAG} authStore.setUser`, {
      identityId,
      tokenLen: accessToken.length,
      pathname: window.location.pathname,
    });
    set({
      accessToken,
      userIdentityId: identityId,
      displayName,
      authStatus: 'authenticated',
    });
  },

  updateToken: (accessToken) => set({ accessToken }),

  clearAuth: () => {
    // eslint-disable-next-line no-console
    console.log(`${DIAG} authStore.clearAuth CALLED`, {
      pathname: window.location.pathname,
      prev: {
        authStatus: (useAuthStore.getState().authStatus),
        hasToken: !!useAuthStore.getState().accessToken,
      },
      stack: new Error('clearAuth stack').stack,
    });
    set({
      accessToken: null,
      userIdentityId: null,
      displayName: null,
      authStatus: 'unauthenticated',
    });
  },
}));

import { create } from 'zustand';

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

  setUser: (accessToken, identityId, displayName) =>
    set({
      accessToken,
      userIdentityId: identityId,
      displayName,
      authStatus: 'authenticated',
    }),

  updateToken: (accessToken) => set({ accessToken }),

  clearAuth: () =>
    set({
      accessToken: null,
      userIdentityId: null,
      displayName: null,
      authStatus: 'unauthenticated',
    }),
}));

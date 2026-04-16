import { createBrowserRouter } from 'react-router';
import { AuthCallback } from '@/modules/auth/AuthCallback';
import { UnauthenticatedShell } from './shells/UnauthenticatedShell';
import { OnboardingShell } from './shells/OnboardingShell';
import { AuthenticatedShell } from './shells/AuthenticatedShell';
import { BattleShell } from './shells/BattleShell';
import { AuthGuard } from './guards/AuthGuard';
import { OnboardingGuard } from './guards/OnboardingGuard';
import { BattleGuard } from './guards/BattleGuard';
import { GameStateLoader } from './GameStateLoader';
import {
  OnboardingNamePlaceholder,
  OnboardingStatsPlaceholder,
  LobbyPlaceholder,
  MatchmakingPlaceholder,
  BattlePlaceholder,
  BattleResultPlaceholder,
} from './route-placeholders';

export const router = createBrowserRouter([
  // Unauthenticated landing
  {
    path: '/',
    element: <UnauthenticatedShell />,
  },

  // OIDC callback
  {
    path: '/auth/callback',
    element: <AuthCallback />,
  },

  // Authenticated routes — guarded by AuthGuard + GameStateLoader
  {
    element: <AuthGuard />,
    children: [
      {
        element: <GameStateLoader />,
        children: [
          {
            element: <OnboardingGuard />,
            children: [
              // Onboarding routes (only reachable when Draft/Named/no character)
              {
                element: <OnboardingShell />,
                children: [
                  { path: '/onboarding/name', element: <OnboardingNamePlaceholder /> },
                  { path: '/onboarding/stats', element: <OnboardingStatsPlaceholder /> },
                ],
              },

              // Post-onboarding routes — guarded by BattleGuard
              {
                element: <BattleGuard />,
                children: [
                  // Battle routes (only reachable when matched)
                  {
                    element: <BattleShell />,
                    children: [
                      { path: '/battle/:battleId', element: <BattlePlaceholder /> },
                      { path: '/battle/:battleId/result', element: <BattleResultPlaceholder /> },
                    ],
                  },

                  // Lobby + matchmaking (normal authenticated flow)
                  {
                    element: <AuthenticatedShell />,
                    children: [
                      { path: '/lobby', element: <LobbyPlaceholder /> },
                      { path: '/matchmaking', element: <MatchmakingPlaceholder /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

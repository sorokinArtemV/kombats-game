import { Outlet, useLocation } from 'react-router';
import { useChatConnection } from '@/modules/chat/hooks';
import { AppHeader } from '@/app/AppHeader';
import { BottomDock } from '@/app/BottomDock';
import { useNetworkRecovery } from '@/app/useNetworkRecovery';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';

/**
 * Owns the session-scoped chrome (top header + persistent bottom chat dock)
 * and the session-scoped chat connection. The chat connection survives
 * lobby ↔ battle navigation because it is mounted above `BattleGuard`.
 *
 * The scene background covers the full viewport — including behind the
 * header — so the translucent glass header reads against the scene rather
 * than against a flat ink-navy gap. Individual screens paint their own
 * scene+overlay on top inside main.
 */
export function SessionShell() {
  useChatConnection();
  useNetworkRecovery();
  const { pathname } = useLocation();
  // The result screen takes over the full main area for the post-battle
  // celebration; the chat dock would otherwise crowd the summary.
  const isBattleResult = pathname.endsWith('/result');

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-kombats-ink-navy text-text-primary">
      <img
        src={bgScene}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      <div className="relative z-10 flex flex-1 min-h-0 flex-col overflow-hidden">
        <AppHeader />
        <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
      {!isBattleResult && <BottomDock />}
    </div>
  );
}

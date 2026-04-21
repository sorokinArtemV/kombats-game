import { Outlet, useLocation } from 'react-router';
import { useChatConnection } from '@/modules/chat/hooks';
import { AppHeader } from '@/app/AppHeader';
import { BottomDock } from '@/app/BottomDock';
import { useNetworkRecovery } from '@/app/useNetworkRecovery';

/**
 * Owns the session-scoped chrome (top header + persistent bottom chat dock)
 * and the session-scoped chat connection. The chat connection survives
 * lobby ↔ battle navigation because it is mounted above `BattleGuard`.
 *
 * The screens themselves render in the central region between the header
 * and the bottom dock, matching the design composition:
 *   [ AppHeader              ]
 *   [ <screen content>       ]   ~60% of viewport
 *   [ BottomDock (chat+list) ]   ~40% of viewport
 */
export function SessionShell() {
  useChatConnection();
  useNetworkRecovery();
  const { pathname } = useLocation();
  // The result screen takes over the full main area for the post-battle
  // celebration; the chat dock would otherwise crowd the summary.
  const isBattleResult = pathname.endsWith('/result');

  return (
    <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
      <AppHeader />
      <main
        className={
          isBattleResult
            ? 'flex flex-1 flex-col overflow-hidden'
            : 'flex flex-[3] min-h-0 flex-col overflow-hidden'
        }
      >
        <Outlet />
      </main>
      {!isBattleResult && (
        <section className="flex flex-[2] min-h-0 flex-col">
          <BottomDock />
        </section>
      )}
    </div>
  );
}

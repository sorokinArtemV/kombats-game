import { Outlet } from 'react-router';
import { ChatSidebar } from '@/modules/chat/components/ChatSidebar';

export function LobbyShell() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <header className="flex items-center justify-between border-b border-bg-surface px-6 py-3">
        <span className="font-display text-lg text-text-primary">Kombats</span>
      </header>
      <div className="flex flex-1">
        <main className="flex-1 p-6">
          <Outlet />
        </main>
        <aside className="hidden w-80 border-l border-bg-surface lg:flex">
          <ChatSidebar />
        </aside>
      </div>
    </div>
  );
}

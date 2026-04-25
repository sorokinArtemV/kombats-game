import { StatAllocationPanel } from '../components/StatAllocationPanel';
import { LevelUpBanner } from '../components/LevelUpBanner';
import { FighterNameplate } from '../components/FighterNameplate';
import { QueueButton } from '@/modules/matchmaking/components/QueueButton';
import { usePlayerStore } from '../store';
import { usePostBattleRefresh } from '../post-battle-refresh';
import { getAvatarAsset } from '../avatar-assets';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';

// DESIGN_REFERENCE.md §1.3 — full-bleed scene + ink-navy bottom gradient.
// Two-stop gradient (transparent → ink-navy/30 → ink-navy/60) darkens the
// bottom so the fighter sprite/nameplate read over scene art.
const sceneOverlayStyle: React.CSSProperties = {
  background:
    'linear-gradient(to bottom, transparent 0%, rgba(var(--rgb-ink-navy), 0.30) 60%, rgba(var(--rgb-ink-navy), 0.60) 100%)',
};

// DESIGN_REFERENCE.md §3.16 — oversized sprite drop shadow.
const spriteStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 25px 50px rgba(var(--rgb-black), 0.9))',
  marginBottom: '-17vh',
};

/**
 * Lobby landing — full-bleed scene with bottom-left fighter anchor and a
 * centered QueueCard (or the post-level-up stat allocation panel when the
 * character has unspent points).
 *
 * `usePostBattleRefresh()` runs once per mount to reconcile XP/level after
 * a battle (DEC-5). It MUST stay at the top of the component so it executes
 * regardless of the conditional branches below.
 */
export function LobbyScreen() {
  usePostBattleRefresh();

  const character = usePlayerStore((s) => s.character);
  const hasUnspentPoints = (character?.unspentPoints ?? 0) > 0;

  return (
    // `-m-3` cancels LobbyShell's p-3 so the scene reaches the edges of the
    // available lobby region (SearchingScreen still uses LobbyShell's padding).
    <div className="relative -m-3 h-[calc(100%+1.5rem)] min-h-0 overflow-hidden">
      <img
        src={bgScene}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={sceneOverlayStyle}
      />

      <div className="pointer-events-none absolute bottom-0 left-0 z-10 flex flex-col items-center">
        <div className="pointer-events-auto">
          <FighterNameplate />
        </div>
        <img
          src={getAvatarAsset(character?.avatarId)}
          alt=""
          aria-hidden
          className="pointer-events-none h-[82vh] w-auto object-contain"
          style={spriteStyle}
        />
      </div>

      <div
        className="absolute left-1/2 top-1/2 z-20 w-80 max-w-[calc(100%-3rem)] -translate-x-1/2"
        style={{ transform: 'translate(-50%, -55%)' }}
      >
        {hasUnspentPoints ? (
          <div className="flex flex-col gap-4">
            <LevelUpBanner />
            <StatAllocationPanel />
          </div>
        ) : (
          <QueueCard />
        )}
      </div>
    </div>
  );
}

/**
 * DESIGN_REFERENCE.md §5.10 (ready state). Glass panel with PanelHeader
 * caption title (NOT a display heading), centered Join Queue button (natural
 * width), divider, then a centered Battle Type label-above-value footer.
 */
function QueueCard() {
  return (
    <section className="rounded-md border-[0.5px] border-border-subtle bg-glass shadow-[var(--shadow-panel)] backdrop-blur-[20px]">
      <div className="p-6">
        <div className="mb-4 px-0 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
          Ready to Fight
        </div>

        <div className="flex justify-center">
          <QueueButton />
        </div>

        <div className="my-4 border-t border-border-divider" aria-hidden />

        <div className="text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
            Battle Type
          </span>
          <span className="mt-1 block text-[16px] font-medium uppercase tracking-[0.08em] text-accent-text">
            Fist Fight
          </span>
        </div>
      </div>
    </section>
  );
}

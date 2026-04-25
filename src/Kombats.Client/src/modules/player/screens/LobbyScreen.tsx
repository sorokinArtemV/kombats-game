import { StatAllocationPanel } from '../components/StatAllocationPanel';
import { LevelUpBanner } from '../components/LevelUpBanner';
import { FighterNameplate } from '../components/FighterNameplate';
import { QueueButton } from '@/modules/matchmaking/components/QueueButton';
import { usePlayerStore } from '../store';
import { usePostBattleRefresh } from '../post-battle-refresh';
import { getAvatarAsset } from '../avatar-assets';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';

// DESIGN_REFERENCE.md §1.3 — full-bleed scene + ink-navy bottom gradient.
// Two-stop gradient darkens the bottom so the fighter sprite/nameplate read
// over the scene art without washing out the horizon.
const sceneOverlayStyle: React.CSSProperties = {
  background:
    'linear-gradient(to bottom, rgba(var(--rgb-ink-navy), 0.45) 0%, rgba(var(--rgb-ink-navy), 0.15) 40%, rgba(var(--rgb-ink-navy), 0.88) 100%)',
};

// DESIGN_REFERENCE.md §3.16 — oversized sprite drop shadow.
const spriteStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 25px 50px rgba(var(--rgb-black), 0.9))',
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-start pl-6 sm:pl-10">
        <div className="pointer-events-auto flex flex-col items-start gap-4">
          <FighterNameplate />
          <img
            src={getAvatarAsset(character?.avatarId)}
            alt=""
            aria-hidden
            className="pointer-events-none h-[min(82vh,720px)] w-auto object-contain"
            style={spriteStyle}
          />
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 z-20 w-[min(420px,calc(100%-3rem))] -translate-x-1/2 -translate-y-[55%]">
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
 * title, big primary Join Queue button, divider, Battle Type caption + value.
 */
function QueueCard() {
  return (
    <section className="rounded-md border-[0.5px] border-border-subtle bg-glass p-6 shadow-[var(--shadow-panel-lift)] backdrop-blur-[20px]">
      <header className="flex flex-col items-center gap-1 pb-5 text-center">
        <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-text-muted">
          Arena
        </span>
        <h1
          className="font-display text-[22px] font-semibold uppercase tracking-[0.28em] text-accent-text"
          style={{ textShadow: 'var(--shadow-title-soft)' }}
        >
          Ready to Fight
        </h1>
      </header>

      <QueueButton />

      <div className="my-5 h-px bg-border-divider" aria-hidden />

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
          Battle Type
        </span>
        <span className="font-display text-[11px] uppercase tracking-[0.18em] text-accent-text">
          Ranked 1v1
        </span>
      </div>
    </section>
  );
}

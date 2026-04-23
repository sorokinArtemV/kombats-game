import { useState, type CSSProperties } from 'react';
import { Sword, Zap, TrendingUp, ChevronRight, Target, Clock, Heart, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'motion/react';
import {
  Button as DSButton,
  Divider as DSDivider,
  Label as DSLabel,
  Panel as DSPanel,
} from '../../design-system/primitives';
import { accent, blur, border, radius, semantic, shadow, space, surface, text } from '../../design-system/tokens';
import {
  QueueCard,
  FighterStatsPopover,
  type FighterAttribute,
  type FighterRecord,
} from '../../design-system/composed';
import {
  GameShell,
  LobbyHeader,
  LobbyChatDock,
  CHAT_DOCK_SAFE_AREA_PX,
  type BattleLogEntry,
} from './GameShell';
import { BodyZoneSelector, type BodyZone, type BlockPair } from './BodyZoneSelector';
import bgImage from '../../imports/bg-1.png';
import characterImage from '../../imports/charackter.png';

// Mock data for shell
const mockChatMessages = [
  { id: 1, user: 'Akira', text: 'Anyone for ranked?' },
  { id: 2, user: 'Yuki', text: 'GG last match!' },
  { id: 3, user: 'Hiro', text: 'Looking for practice partner' },
  { id: 4, user: 'Sakura', text: 'New player here, any tips?' }
];

const mockOnlineUsers = [
  { id: 1, name: 'Akira' },
  { id: 2, name: 'Yuki' },
  { id: 3, name: 'Hiro' },
  { id: 4, name: 'Sakura' },
  { id: 5, name: 'Ryu' },
  { id: 6, name: 'Ken' },
  { id: 7, name: 'Chun-Li' },
  { id: 8, name: 'Guile' }
];

// ==================== FIGHTER ANCHOR (shared across all screens) ====================
// Canonical player-side fighter composition. Reused so the character appears
// anchored in the same spot regardless of screen (lobby / battle / victory / defeat).
const FIGHTER_IMAGE_CLASSNAME = 'h-[82vh] w-auto object-contain drop-shadow-2xl';
const FIGHTER_IMAGE_BASE_FILTER = 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))';
// Pushes the bottom-anchored fighter column down so the expanded info panel
// (which opens upward from the nameplate) fits fully inside the viewport with
// a small gap under the header.
const FIGHTER_IMAGE_MARGIN_BOTTOM = '-17vh';
const FIGHTER_COLUMN_LEFT_CLASSNAME = 'absolute left-0 bottom-0 flex flex-col items-center';
const FIGHTER_COLUMN_RIGHT_CLASSNAME = 'absolute right-0 bottom-0 flex flex-col items-center';

// Combat panel title — Cinzel gold heading anchoring the diptych. Same
// serif family as the onboarding card title but smaller and tighter so
// it sits as a section header rather than a screen-level headline.
const COMBAT_PANEL_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: accent.primary,
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
  textAlign: 'center',
  lineHeight: 1,
};

// Meta row: 3-column grid locks the timer to dead-center regardless of
// how wide ROUND N or YOUR TURN become. Earlier flex + justify-between
// drifted the timer off-axis as panel width changed.
const COMBAT_META_ROW_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  padding: `${space.xs} ${space.md}`,
};

// Quiet status indicator on the right edge of the meta row. Dot + label,
// no bordered box — a box would compete visually with the LOCK IN CTA.
const TURN_INDICATOR_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space.xs,
};

const TURN_INDICATOR_DOT_STYLE: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 9999,
  background: accent.primary,
  boxShadow: '0 0 8px rgba(201, 162, 90, 0.55)',
};

// Dimmer variant used during the opponent's turn — same geometry, no
// glow halo, muted gold fill.
const TURN_INDICATOR_DOT_MUTED_STYLE: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 9999,
  background: accent.muted,
};

// ==================== MAIN HUB / LOBBY ====================

// ==================== HP BAR ====================
// Tactical fighting-game HP bar: parallelogram silhouette via clip-path.
// `mirror` flips both the skew direction and the fill direction — for the
// opponent, HP depletes right-to-left (Tekken / MK / SF convention). The
// surface is matte — muted pigment, subtle vertical gradient, thin border,
// no glare or diagonal sheen.
function HpBar({
  hp,
  maxHp,
  hpColor,
  mirror,
}: {
  hp: number;
  maxHp: number;
  hpColor: 'jade' | 'crimson';
  mirror: boolean;
}) {
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const skew = mirror
    ? 'polygon(0 0, calc(100% - 12px) 0, 100% 100%, 12px 100%)'
    : 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
  // Muted pigments with a subtle top-lighter, bottom-darker gradient.
  const fillGradient =
    hpColor === 'crimson'
      ? 'linear-gradient(180deg, #aa4c4c 0%, #a04545 55%, #883a3a 100%)'
      : 'linear-gradient(180deg, #648f73 0%, #5a8a6a 55%, #4a7a5a 100%)';

  return (
    <div
      className="relative flex-1 h-7"
      style={{
        clipPath: skew,
        background: 'rgba(15, 20, 28, 0.75)',
        border: '0.5px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* HP fill — grows from the side opposite to `mirror` */}
      <div
        className="absolute inset-y-0 transition-[width] duration-300 ease-out"
        style={{
          width: `${hpPct}%`,
          left: mirror ? 'auto' : 0,
          right: mirror ? 0 : 'auto',
          background: fillGradient,
        }}
      >
        {/* Leading edge — quiet 1px line at the current HP position */}
        <div
          aria-hidden
          className="absolute inset-y-0 w-px pointer-events-none"
          style={{
            left: mirror ? 0 : 'auto',
            right: mirror ? 'auto' : 0,
            background: 'rgba(255, 255, 255, 0.22)',
          }}
        />
      </div>

      {/* Numbers overlay — mirrored side for the opponent */}
      <div
        className={`absolute inset-0 flex items-center px-3.5 pointer-events-none ${
          mirror ? 'justify-start' : 'justify-end'
        }`}
      >
        <span
          className="text-[13px] leading-none text-[var(--kombats-text-primary)] tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_6px_rgba(0,0,0,0.7)]"
          style={{
            fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
            fontStyle: 'italic',
            letterSpacing: '0.04em',
            fontFeatureSettings: '"tnum"',
          }}
        >
          {hp}
          <span className="opacity-55 mx-[3px]">/</span>
          {maxHp}
        </span>
      </div>
    </div>
  );
}

function FighterNameplate({
  name,
  rank,
  hp,
  maxHp,
  hpColor = 'jade',
  showStats,
  onToggleStats,
  attributes,
  record,
  mirror = false,
  hpBarMirror,
  profileTitle = 'Fighter Profile',
  width = 420,
}: {
  name: string;
  rank?: string;
  hp: number;
  maxHp: number;
  hpColor?: 'jade' | 'crimson';
  showStats: boolean;
  onToggleStats: () => void;
  attributes?: FighterAttribute[];
  record?: FighterRecord;
  mirror?: boolean;
  // Independently controls the HP bar's skew + fill direction without
  // flipping the rest of the plate (name row, chevron, stats header).
  // Falls back to `mirror` when not provided.
  hpBarMirror?: boolean;
  profileTitle?: string;
  width?: number;
}) {
  const row = mirror ? 'flex-row-reverse' : '';
  const barMirror = hpBarMirror ?? mirror;

  return (
    <div
      className="relative z-20 mb-3"
      style={{ width: `${width}px` }}
    >
      <FighterStatsPopover
        open={showStats}
        profileTitle={profileTitle}
        rank={rank}
        mirror={mirror}
        attributes={attributes}
        record={record}
      />

      <div className="relative">
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            inset: '-38px -56px',
            background:
              'radial-gradient(ellipse 68% 62% at center, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 48%, rgba(0,0,0,0) 88%)',
            filter: 'blur(22px)',
          }}
        />

        <div className="relative">
          <div className={`flex mb-2 ${row}`}>
            <div className="text-2xl text-[var(--kombats-text-primary)] leading-none tracking-wide [text-shadow:0_2px_8px_rgba(0,0,0,0.95),0_0_20px_rgba(0,0,0,0.7)]">
              {name}
            </div>
          </div>

          <div className={`flex items-center gap-2 ${row}`}>
            <HpBar hp={hp} maxHp={maxHp} hpColor={hpColor} mirror={barMirror} />

            <button
              onClick={onToggleStats}
              aria-label={showStats ? 'Hide fighter profile' : 'Show fighter profile'}
              aria-expanded={showStats}
              className="h-7 w-7 flex items-center justify-center text-[var(--kombats-moon-silver)] hover:text-[var(--kombats-gold)] transition-colors [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.9))]"
            >
              {showStats
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const LOBBY_PLAYER_ATTRIBUTES: FighterAttribute[] = [
  { icon: Sword, color: 'crimson', label: 'Strength', value: 92 },
  { icon: Zap, color: 'gold', label: 'Agility', value: 88 },
  { icon: TrendingUp, color: 'jade', label: 'Intuition', value: 85 },
  { icon: Heart, color: 'silver', label: 'Endurance', value: 78 }
];

const OPPONENT_ATTRIBUTES: FighterAttribute[] = [
  { icon: Sword, color: 'crimson', label: 'Strength', value: 86 },
  { icon: Zap, color: 'gold', label: 'Agility', value: 75 },
  { icon: TrendingUp, color: 'jade', label: 'Intuition', value: 90 },
  { icon: Heart, color: 'silver', label: 'Endurance', value: 82 }
];

interface HeaderNavProps {
  onGameInfo?: () => void;
  onLeaderboard?: () => void;
}

function LobbyScene({
  centerCard,
  onGameInfo,
  onLeaderboard,
}: { centerCard: React.ReactNode } & HeaderNavProps) {
  const [showStats, setShowStats] = useState(false);

  return (
    <GameShell
      header={<LobbyHeader onGameInfo={onGameInfo} onLeaderboard={onLeaderboard} />}
      bottomOverlay={<LobbyChatDock messages={mockChatMessages} onlineUsers={mockOnlineUsers} />}
    >
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--kombats-ink-navy)]/30 to-[var(--kombats-ink-navy)]/60" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 h-full">
        {/* Left: character + premium upward-expandable status strip */}
        <div className={FIGHTER_COLUMN_LEFT_CLASSNAME}>
          <FighterNameplate
            name="Kazumi"
            rank="Silver III"
            hp={1000}
            maxHp={1000}
            hpColor="jade"
            showStats={showStats}
            onToggleStats={() => setShowStats(!showStats)}
            attributes={LOBBY_PLAYER_ATTRIBUTES}
            record={{ wins: 127, losses: 71, winrate: '64%', streak: 'W 5' }}
          />

          <motion.img
            src={characterImage}
            alt="Your Character"
            className={FIGHTER_IMAGE_CLASSNAME}
            style={{
              filter: FIGHTER_IMAGE_BASE_FILTER,
              marginBottom: FIGHTER_IMAGE_MARGIN_BOTTOM,
            }}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          />
        </div>

        {/* Center card slot — lobby state or queue/searching state */}
        {centerCard}
      </div>
    </GameShell>
  );
}

// Shared wrapper that positions a card in the same spot as the lobby queue card.
// Panel surface now lives in the card component itself (QueueCard).
function LobbyCenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute top-1/2 left-1/2 w-80"
      style={{ transform: 'translate(-50%, -55%)' }}
    >
      {children}
    </div>
  );
}

export function MainHub({
  onJoinQueue,
  onGameInfo,
  onLeaderboard,
}: { onJoinQueue: () => void } & HeaderNavProps) {
  return (
    <LobbyScene
      onGameInfo={onGameInfo}
      onLeaderboard={onLeaderboard}
      centerCard={
        <LobbyCenterCard>
          <QueueCard
            status="ready"
            title="Ready to Fight"
            battleType="Fist Fight"
            searchingLabel="Finding"
            searchingValue="Worthy Challenger"
            onJoinQueue={onJoinQueue}
          />
        </LobbyCenterCard>
      }
    />
  );
}

// ==================== QUEUE / SEARCHING ====================

export function QueueScreen({
  onCancel,
  elapsedTime,
  onGameInfo,
  onLeaderboard,
}: { onCancel: () => void; elapsedTime: number } & HeaderNavProps) {
  return (
    <LobbyScene
      onGameInfo={onGameInfo}
      onLeaderboard={onLeaderboard}
      centerCard={
        <LobbyCenterCard>
          <QueueCard
            status="searching"
            title="Searching for Opponent"
            battleType="Fist Fight"
            searchingLabel="Finding"
            searchingValue="Worthy Challenger"
            elapsedSeconds={elapsedTime}
            onCancel={onCancel}
          />
        </LobbyCenterCard>
      }
    />
  );
}

// ==================== BATTLE SCREEN ====================

export function BattleScreen({
  onVictory,
  onDefeat,
  battleLog = [],
  onGameInfo,
  onLeaderboard,
}: {
  onVictory?: () => void;
  onDefeat?: () => void;
  battleLog?: BattleLogEntry[];
} & HeaderNavProps) {
  // TEMP: seeded for headless screenshot capture. Revert to null/null.
  const [selectedAttack, setSelectedAttack] = useState<BodyZone | null>('Stomach');
  const [selectedDefense, setSelectedDefense] = useState<BlockPair | null>('Waist & Legs');
  const [showPlayerStats, setShowPlayerStats] = useState(false);
  const [showOpponentStats, setShowOpponentStats] = useState(false);
  // Waiting phase — flipped when the player commits their picks. In a
  // real round, server-side resolution would clear this via a new turn.
  const [isWaiting, setIsWaiting] = useState(false);
  const canLockIn = selectedAttack !== null && selectedDefense !== null;
  const handleLockIn = () => {
    if (canLockIn) setIsWaiting(true);
  };
  const handleResetTurn = () => {
    setIsWaiting(false);
    setSelectedAttack(null);
    setSelectedDefense(null);
  };

  return (
    <GameShell
      header={<LobbyHeader onGameInfo={onGameInfo} onLeaderboard={onLeaderboard} />}
      bottomOverlay={
        <LobbyChatDock
          messages={mockChatMessages}
          onlineUsers={mockOnlineUsers}
          battleLog={battleLog}
        />
      }
    >
      {/* Background — same moonlit scene as lobby */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--kombats-ink-navy)]/30 to-[var(--kombats-ink-navy)]/60" />
      </div>

      <div className="relative z-10 h-full">
        {/* Player — left, grounded */}
        <div className={FIGHTER_COLUMN_LEFT_CLASSNAME}>
          <FighterNameplate
            name="Kazumi"
            rank="Silver III"
            hp={850}
            maxHp={1000}
            hpColor="jade"
            showStats={showPlayerStats}
            onToggleStats={() => setShowPlayerStats(!showPlayerStats)}
            attributes={LOBBY_PLAYER_ATTRIBUTES}
            record={{ wins: 127, losses: 71, winrate: '64%', streak: 'W 5' }}
          />
          <motion.img
            src={characterImage}
            alt="Player"
            className={FIGHTER_IMAGE_CLASSNAME}
            style={{
              filter: FIGHTER_IMAGE_BASE_FILTER,
              marginBottom: FIGHTER_IMAGE_MARGIN_BOTTOM,
            }}
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Opponent — right; only the sprite is mirrored, HUD stays non-mirrored */}
        <div className={FIGHTER_COLUMN_RIGHT_CLASSNAME}>
          <FighterNameplate
            name="Shadow Oni"
            rank="Gold II"
            hp={620}
            maxHp={950}
            hpColor="crimson"
            showStats={showOpponentStats}
            onToggleStats={() => setShowOpponentStats(!showOpponentStats)}
            attributes={OPPONENT_ATTRIBUTES}
            record={{ wins: 204, losses: 88, winrate: '70%', streak: 'W 3' }}
            hpBarMirror
          />
          <div style={{ transform: 'scaleX(-1)', marginBottom: FIGHTER_IMAGE_MARGIN_BOTTOM }}>
            <motion.img
              src={characterImage}
              alt="Opponent"
              className={FIGHTER_IMAGE_CLASSNAME}
              style={{
                filter: `${FIGHTER_IMAGE_BASE_FILTER} hue-rotate(180deg)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Center Action Panel — battle-control unit (status + selector + lock in) */}
        <div
          className="absolute top-1/2 left-1/2 w-[540px]"
          style={{ transform: 'translate(-50%, -62%)' }}
        >
          <DSPanel variant="glass" radius="md" elevation="panel" bordered>
            <div style={{ paddingTop: space.md, paddingBottom: space.sm }}>
              {/* Panel title — anchors the diptych as a named section.
                  No bottom padding so the meta row's top padding owns
                  the gap and title+meta read as a single header unit. */}
              <div style={{ padding: `${space.sm} ${space.md} 0` }}>
                <h3 style={COMBAT_PANEL_TITLE_STYLE}>
                  {isWaiting ? 'Awaiting Opponent' : <>Select Attack &amp; Block</>}
                </h3>
              </div>

              {/* Battle meta row — round / timer / turn state */}
              <div style={COMBAT_META_ROW_STYLE}>
                <div style={{ textAlign: 'left' }}>
                  <DSLabel tone="accent">Round 2</DSLabel>
                </div>
                <div
                  style={{
                    textAlign: 'center',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: space.xs,
                    color: text.primary,
                    fontSize: 12,
                  }}
                >
                  <Clock style={{ width: 12, height: 12, color: text.muted }} />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>28</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={TURN_INDICATOR_STYLE}>
                    <span
                      aria-hidden
                      style={
                        isWaiting
                          ? TURN_INDICATOR_DOT_MUTED_STYLE
                          : TURN_INDICATOR_DOT_STYLE
                      }
                    />
                    <DSLabel
                      tone="accent"
                      style={isWaiting ? { color: accent.muted } : undefined}
                    >
                      {isWaiting ? "Opponent's Turn" : 'Your Turn'}
                    </DSLabel>
                  </span>
                </div>
              </div>

              {/* Divider marks the real break: header context above,
                  combat zone below. */}
              <DSDivider marginY="xs" />

              <div style={{ padding: `0 ${space.md}` }}>
                <BodyZoneSelector
                  attack={selectedAttack}
                  block={selectedDefense}
                  onAttackChange={setSelectedAttack}
                  onBlockChange={setSelectedDefense}
                  width={175}
                  isWaiting={isWaiting}
                  action={
                    <DSButton
                      variant="primary"
                      size="md"
                      disabled={!canLockIn}
                      onClick={handleLockIn}
                    >
                      LOCK IN
                    </DSButton>
                  }
                />
              </div>
            </div>
          </DSPanel>

          {(onVictory || onDefeat || isWaiting) && (
            <div className="flex gap-2 justify-center mt-2">
              {isWaiting && (
                <button onClick={handleResetTurn} className="text-xs text-[var(--kombats-text-muted)] hover:text-[var(--kombats-text-primary)]">
                  [Reset Turn]
                </button>
              )}
              {onVictory && (
                <button onClick={onVictory} className="text-xs text-[var(--kombats-text-muted)] hover:text-[var(--kombats-text-primary)]">
                  [Test Victory]
                </button>
              )}
              {onDefeat && (
                <button onClick={onDefeat} className="text-xs text-[var(--kombats-text-muted)] hover:text-[var(--kombats-text-primary)]">
                  [Test Defeat]
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}

// ==================== RESULT SCREENS (shared styles) ====================
// Local atmosphere + glass panel styles for VictoryScreen / DefeatScreen.
// Atmosphere elements are pure CSS / inline SVG — no external assets —
// so the screen reads cleanly on any future scene theme (moonlit village
// today, blood moon later) without dragging raster dependencies along.

// Bright, high-chroma gold. Deliberately brighter than accent.primary
// (which is a muted, everyday UI gold). This is the one place in the app
// where gold goes ceremonial — marking victory as an above-the-line,
// celebratory moment distinct from regular panel / button gold.
const VICTORY_GOLD = '#E8B830';

// Dimmer baseline for both outcomes. Defeat relies on this alone (the
// red vignette adds its own edge darkening on top); victory pushes
// darker to keep the bright gold title from losing contrast against
// the scene.
const DEFEAT_DARK_OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  pointerEvents: 'none',
  zIndex: 10,
};

const VICTORY_DARK_OVERLAY_STYLE: CSSProperties = {
  ...DEFEAT_DARK_OVERLAY_STYLE,
  background: 'rgba(0, 0, 0, 0.65)',
};

// Victory rays — a huge rotating conic-gradient circle centered on the
// viewport. Rendered via motion.div so rotation is declarative and no
// CSS keyframe injection is needed. The 24 beams alternate two opacity
// tiers so the effect feels like radiating light rather than a repeating
// stripe pattern.
const VICTORY_RAYS_STYLE: CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  width: '150vmax',
  height: '150vmax',
  marginTop: '-75vmax',
  marginLeft: '-75vmax',
  borderRadius: '50%',
  pointerEvents: 'none',
  zIndex: 11,
  // Tight radial mask — rays are visible only in a small halo around
  // the title and fade well before the panel, so the panel sits in
  // clean dark space rather than on top of animated texture.
  WebkitMaskImage: 'radial-gradient(circle, black 15%, transparent 40%)',
  maskImage: 'radial-gradient(circle, black 15%, transparent 40%)',
  background: `conic-gradient(
    from 0deg,
    rgba(232, 184, 48, 0.22) 0deg, transparent 8deg,
    transparent 15deg, rgba(232, 184, 48, 0.18) 15deg, transparent 23deg,
    transparent 30deg, rgba(232, 184, 48, 0.22) 30deg, transparent 38deg,
    transparent 45deg, rgba(232, 184, 48, 0.18) 45deg, transparent 53deg,
    transparent 60deg, rgba(232, 184, 48, 0.22) 60deg, transparent 68deg,
    transparent 75deg, rgba(232, 184, 48, 0.18) 75deg, transparent 83deg,
    transparent 90deg, rgba(232, 184, 48, 0.22) 90deg, transparent 98deg,
    transparent 105deg, rgba(232, 184, 48, 0.18) 105deg, transparent 113deg,
    transparent 120deg, rgba(232, 184, 48, 0.22) 120deg, transparent 128deg,
    transparent 135deg, rgba(232, 184, 48, 0.18) 135deg, transparent 143deg,
    transparent 150deg, rgba(232, 184, 48, 0.22) 150deg, transparent 158deg,
    transparent 165deg, rgba(232, 184, 48, 0.18) 165deg, transparent 173deg,
    transparent 180deg, rgba(232, 184, 48, 0.22) 180deg, transparent 188deg,
    transparent 195deg, rgba(232, 184, 48, 0.18) 195deg, transparent 203deg,
    transparent 210deg, rgba(232, 184, 48, 0.22) 210deg, transparent 218deg,
    transparent 225deg, rgba(232, 184, 48, 0.18) 225deg, transparent 233deg,
    transparent 240deg, rgba(232, 184, 48, 0.22) 240deg, transparent 248deg,
    transparent 255deg, rgba(232, 184, 48, 0.18) 255deg, transparent 263deg,
    transparent 270deg, rgba(232, 184, 48, 0.22) 270deg, transparent 278deg,
    transparent 285deg, rgba(232, 184, 48, 0.18) 285deg, transparent 293deg,
    transparent 300deg, rgba(232, 184, 48, 0.22) 300deg, transparent 308deg,
    transparent 315deg, rgba(232, 184, 48, 0.18) 315deg, transparent 323deg,
    transparent 330deg, rgba(232, 184, 48, 0.22) 330deg, transparent 338deg,
    transparent 345deg, rgba(232, 184, 48, 0.18) 345deg, transparent 353deg,
    transparent 360deg
  )`,
};

// Two-layer bloom behind the title. The white core reads as "source of
// light" while the wider gold halo carries warmth — together they give
// the rays a felt point of origin rather than a diffuse glow.
const VICTORY_GOLD_BLOOM_STYLE: CSSProperties = {
  position: 'fixed',
  top: '25%',
  left: '50%',
  width: 380,
  height: 380,
  marginLeft: -190,
  marginTop: -190,
  borderRadius: '50%',
  background:
    'radial-gradient(circle, rgba(232, 184, 48, 0.15) 0%, rgba(232, 184, 48, 0.06) 45%, transparent 70%)',
  pointerEvents: 'none',
  zIndex: 11,
};

const VICTORY_WHITE_BLOOM_STYLE: CSSProperties = {
  position: 'fixed',
  top: '25%',
  left: '50%',
  width: 200,
  height: 200,
  marginLeft: -100,
  marginTop: -100,
  borderRadius: '50%',
  background:
    'radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.06) 40%, transparent 65%)',
  pointerEvents: 'none',
  zIndex: 11,
};

// Defeat edge vignette — red darkens from the edges inward, a visual
// "closing in" that mirrors the felt experience of losing.
const DEFEAT_VIGNETTE_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background:
    'radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(192, 55, 68, 0.12) 55%, rgba(192, 55, 68, 0.25) 85%)',
  pointerEvents: 'none',
  zIndex: 11,
};

// Diagonal slash overlay SVG wrapper — three slashes, each drawn as a
// thick dark base + thin bright center so they read as layered wounds
// rather than single-tone strokes. Kept at 0.2 opacity so they are felt
// more than seen.
const DEFEAT_SLASHES_WRAPPER_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0.2,
  pointerEvents: 'none',
  zIndex: 11,
};

// ------- Layer 2: content shell -------

// Centered content column — lives above atmosphere (zIndex 20) and
// disables pointer events by default; the panel below re-enables them
// so atmosphere layers never eat clicks.
const CONTENT_LAYER_STYLE: CSSProperties = {
  position: 'relative',
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  padding: `${space.xl} ${space.md}`,
  pointerEvents: 'none',
};

// ------- Layer 2: title zone -------

const TITLE_ZONE_STYLE: CSSProperties = {
  textAlign: 'center',
  marginBottom: space.lg,
};

const TITLE_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space.md,
  marginBottom: space.xs,
};

const WING_BASE_STYLE: CSSProperties = {
  width: 60,
  height: 1,
};

const VICTORY_WING_LEFT_STYLE: CSSProperties = {
  ...WING_BASE_STYLE,
  background: 'linear-gradient(to right, transparent, rgba(232, 184, 48, 0.5))',
};

const VICTORY_WING_RIGHT_STYLE: CSSProperties = {
  ...WING_BASE_STYLE,
  background: 'linear-gradient(to left, transparent, rgba(232, 184, 48, 0.5))',
};

const DEFEAT_WING_LEFT_STYLE: CSSProperties = {
  ...WING_BASE_STYLE,
  background: 'linear-gradient(to right, transparent, rgba(192, 55, 68, 0.5))',
};

const DEFEAT_WING_RIGHT_STYLE: CSSProperties = {
  ...WING_BASE_STYLE,
  background: 'linear-gradient(to left, transparent, rgba(192, 55, 68, 0.5))',
};

// Title — Cinzel 56px with a double textShadow (tight 40px + wide 80px)
// for a luminous bloom against the atmosphere tint. Static: this is a
// final verdict, not a waiting state.
const RESULT_TITLE_BASE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 56,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  lineHeight: 1,
};

const VICTORY_TITLE_STYLE: CSSProperties = {
  ...RESULT_TITLE_BASE_STYLE,
  color: VICTORY_GOLD,
  // Triple-layer shadow: tight white for crisp readability over the
  // white bloom core, mid gold for warmth, wide gold for ambient glow.
  textShadow:
    '0 0 30px rgba(255, 255, 255, 0.3), 0 0 60px rgba(232, 184, 48, 0.5), 0 0 100px rgba(232, 184, 48, 0.2)',
};

const DEFEAT_TITLE_STYLE: CSSProperties = {
  ...RESULT_TITLE_BASE_STYLE,
  color: semantic.attack.text,
  textShadow:
    '0 0 40px rgba(192, 55, 68, 0.6), 0 0 80px rgba(192, 55, 68, 0.25)',
};

const RESULT_SUBTITLE_STYLE: CSSProperties = {
  margin: `${space.sm} 0 0`,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: text.muted,
};

// ------- Layer 2: info panel -------

// Glass info panel — built LOCALLY from raw tokens rather than via the
// Panel primitive so the screen owns its bespoke accent-line trim
// without leaking that concern into the shared primitive.
const RESULT_PANEL_STYLE: CSSProperties = {
  position: 'relative',
  background: surface.glass,
  backdropFilter: blur.panel,
  WebkitBackdropFilter: blur.panel,
  borderRadius: radius.md,
  border: border.subtle,
  boxShadow: shadow.panel,
  maxWidth: 520,
  width: '100%',
  overflow: 'hidden',
  pointerEvents: 'auto',
};

const PANEL_CONTENT_STYLE: CSSProperties = {
  padding: space.lg,
};

// Gradient accent line pinned to the panel top. Sits as the FIRST child
// inside the panel (before padded content) so overflow: hidden on the
// panel clips it to the radius corners cleanly.
const VICTORY_ACCENT_LINE_STYLE: CSSProperties = {
  height: 3,
  background: `linear-gradient(to right, transparent, ${VICTORY_GOLD}, transparent)`,
};

const DEFEAT_ACCENT_LINE_STYLE: CSSProperties = {
  height: 3,
  background: `linear-gradient(to right, transparent, ${semantic.attack.base}, transparent)`,
};

const NAMES_GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: space.lg,
};

const ROLE_LABEL_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: text.muted,
  textAlign: 'center',
};

const PLAYER_NAME_BASE_STYLE: CSSProperties = {
  margin: `${space.xs} 0`,
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '0.08em',
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textAlign: 'center',
};

// Color-coded player names. The panel keeps gold reserved for the
// WINNER label below the name — the name itself just needs to be
// readable (winner) or faded (loser), not emotional. Over-tinting names
// competes with the single focal point inside the panel.
const VICTORY_WINNER_NAME_STYLE: CSSProperties = {
  ...PLAYER_NAME_BASE_STYLE,
  color: text.primary,
};

const VICTORY_LOSER_NAME_STYLE: CSSProperties = {
  ...PLAYER_NAME_BASE_STYLE,
  // Dimmer than text.muted so the opponent recedes further on victory —
  // their outcome is informational, not emotional, to the player.
  color: 'rgba(232, 232, 240, 0.35)',
};

const DEFEAT_WINNER_NAME_STYLE: CSSProperties = {
  ...PLAYER_NAME_BASE_STYLE,
  color: text.primary,
};

const DEFEAT_LOSER_NAME_STYLE: CSSProperties = {
  ...PLAYER_NAME_BASE_STYLE,
  color: text.muted,
};

// Outcome labels — "WINNER" / "VICTOR" always bright gold (the single
// focal point inside the panel). "DEFEATED" is screen-dependent: muted
// on victory (it is the opponent — unimportant to you) and red on
// defeat (it is you — the loss should land).
const WINNER_LABEL_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: VICTORY_GOLD,
  textAlign: 'center',
};

const VICTORY_DEFEATED_LABEL_STYLE: CSSProperties = {
  ...WINNER_LABEL_STYLE,
  color: text.muted,
};

const DEFEAT_DEFEATED_LABEL_STYLE: CSSProperties = {
  ...WINNER_LABEL_STYLE,
  color: semantic.attack.text,
};

const SECTION_LABEL_STYLE: CSSProperties = {
  margin: `0 0 ${space.sm}`,
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: text.secondary,
  textAlign: 'center',
};

const REWARD_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${space.sm} ${space.md}`,
  background: surface.glassSubtle,
  borderRadius: radius.sm,
  border: border.subtle,
  marginBottom: space.xs,
};

const REWARD_LABEL_STYLE: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: text.secondary,
};

// Reward VALUES use the semantic block/attack colors (green / red) so
// positive vs negative reads at a glance without competing with the
// panel's single gold focal point (the WINNER / VICTOR label).
const REWARD_VALUE_POSITIVE_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: semantic.block.text,
};

const REWARD_VALUE_NEGATIVE_STYLE: CSSProperties = {
  ...REWARD_VALUE_POSITIVE_STYLE,
  color: semantic.attack.text,
};

const EXCHANGE_BLOCK_BASE_STYLE: CSSProperties = {
  padding: `${space.sm} ${space.md}`,
  background: surface.glassSubtle,
  borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
  borderLeftWidth: 3,
  borderLeftStyle: 'solid',
};

// Exchange block accent border is subdued on purpose — the bright
// gold / red belong to the accent line at the panel top. Here we only
// want a tonal hint of the outcome, not another focal point.
const EXCHANGE_BLOCK_VICTORY_STYLE: CSSProperties = {
  ...EXCHANGE_BLOCK_BASE_STYLE,
  borderLeftColor: 'rgba(201, 162, 90, 0.3)',
};

const EXCHANGE_BLOCK_DEFEAT_STYLE: CSSProperties = {
  ...EXCHANGE_BLOCK_BASE_STYLE,
  borderLeftColor: 'rgba(192, 55, 68, 0.4)',
};

const EXCHANGE_HEADER_STYLE: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: text.secondary,
  marginBottom: space.xs,
};

const EXCHANGE_TEXT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: text.primary,
  lineHeight: 1.5,
};

const BUTTONS_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: space.md,
  marginTop: space.lg,
};

// Three diagonal slash marks drawn as dual-layer strokes: a thick
// dark-red base for the wound body, a thin bright-red centerline for the
// fresh cut. Relies on an SVG viewBox (not a fixed pixel canvas) so it
// scales responsively with the viewport.
function DefeatSlashes() {
  return (
    <svg
      style={DEFEAT_SLASHES_WRAPPER_STYLE}
      viewBox="0 0 1920 1080"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line x1="1350" y1="-50" x2="400" y2="1130" stroke="#c03744" strokeWidth="40" strokeLinecap="round" opacity="0.7" />
      <line x1="1350" y1="-50" x2="400" y2="1130" stroke="#ff2244" strokeWidth="8"  strokeLinecap="round" opacity="0.5" />
      <line x1="1500" y1="-30" x2="550" y2="1110" stroke="#c03744" strokeWidth="32" strokeLinecap="round" opacity="0.6" />
      <line x1="1500" y1="-30" x2="550" y2="1110" stroke="#ff2244" strokeWidth="6"  strokeLinecap="round" opacity="0.4" />
      <line x1="1650" y1="-70" x2="700" y2="1150" stroke="#c03744" strokeWidth="44" strokeLinecap="round" opacity="0.5" />
      <line x1="1650" y1="-70" x2="700" y2="1150" stroke="#ff2244" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

// ==================== VICTORY SCREEN ====================

export function VictoryScreen({
  onReturnToLobby,
  onQueueAgain,
  finalEntry,
  onGameInfo,
  onLeaderboard,
}: {
  onReturnToLobby: () => void;
  onQueueAgain: () => void;
  finalEntry?: BattleLogEntry;
} & HeaderNavProps) {
  return (
    <GameShell
      header={<LobbyHeader onGameInfo={onGameInfo} onLeaderboard={onLeaderboard} />}
      bottomOverlay={<LobbyChatDock messages={mockChatMessages} onlineUsers={mockOnlineUsers} />}
    >
      {/* Background scene — kept behind the dark overlay so the screen
          still sits in the game world rather than on a blank canvas. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      />

      {/* LAYER 1 — Atmosphere: heavier dim, rotating rays, gold halo
          with a white core painted on top as the perceived light source. */}
      <div style={VICTORY_DARK_OVERLAY_STYLE} />
      <motion.div
        style={VICTORY_RAYS_STYLE}
        animate={{ rotate: 360 }}
        transition={{ duration: 60, ease: 'linear', repeat: Infinity }}
      />
      <div style={VICTORY_GOLD_BLOOM_STYLE} />
      <div style={VICTORY_WHITE_BLOOM_STYLE} />

      {/* LAYER 2 — Content column (title zone + info panel). */}
      <div
        style={{
          ...CONTENT_LAYER_STYLE,
          paddingBottom: `${CHAT_DOCK_SAFE_AREA_PX}px`,
        }}
      >
        <div style={TITLE_ZONE_STYLE}>
          <div style={TITLE_ROW_STYLE}>
            <div style={VICTORY_WING_LEFT_STYLE} />
            <h1 style={VICTORY_TITLE_STYLE}>VICTORY</h1>
            <div style={VICTORY_WING_RIGHT_STYLE} />
          </div>
          <p style={RESULT_SUBTITLE_STYLE}>Triumph in Combat</p>
        </div>

        <div style={RESULT_PANEL_STYLE}>
          <div style={VICTORY_ACCENT_LINE_STYLE} />
          <div style={PANEL_CONTENT_STYLE}>
            <div style={NAMES_GRID_STYLE}>
              <div>
                <p style={ROLE_LABEL_STYLE}>You</p>
                <p style={VICTORY_WINNER_NAME_STYLE}>Kazumi</p>
                <p style={WINNER_LABEL_STYLE}>Winner</p>
              </div>
              <div>
                <p style={ROLE_LABEL_STYLE}>Opponent</p>
                <p style={VICTORY_LOSER_NAME_STYLE}>Shadow Oni</p>
                <p style={VICTORY_DEFEATED_LABEL_STYLE}>Defeated</p>
              </div>
            </div>

            <DSDivider marginY="md" />

            <p style={SECTION_LABEL_STYLE}>Rewards</p>
            <div style={REWARD_ROW_STYLE}>
              <span style={REWARD_LABEL_STYLE}>XP Gained</span>
              <span style={REWARD_VALUE_POSITIVE_STYLE}>+1,250 XP</span>
            </div>
            <div style={REWARD_ROW_STYLE}>
              <span style={REWARD_LABEL_STYLE}>Rating Gained</span>
              <span style={REWARD_VALUE_POSITIVE_STYLE}>+25 RP</span>
            </div>

            {finalEntry && (
              <>
                <DSDivider marginY="md" />
                <div style={EXCHANGE_BLOCK_VICTORY_STYLE}>
                  <div style={EXCHANGE_HEADER_STYLE}>
                    Final Exchange · Round {finalEntry.round}
                  </div>
                  <p style={EXCHANGE_TEXT_STYLE}>{finalEntry.text}</p>
                </div>
              </>
            )}

            <div style={BUTTONS_ROW_STYLE}>
              <DSButton variant="primary" size="md" onClick={onQueueAgain}>
                Battle Again
              </DSButton>
              <DSButton variant="secondary" size="md" onClick={onReturnToLobby}>
                Return to Lobby
              </DSButton>
            </div>
          </div>
        </div>
      </div>
    </GameShell>
  );
}

// ==================== DEFEAT SCREEN ====================

export function DefeatScreen({
  onReturnToLobby,
  onQueueAgain,
  finalEntry,
  onGameInfo,
  onLeaderboard,
}: {
  onReturnToLobby: () => void;
  onQueueAgain: () => void;
  finalEntry?: BattleLogEntry;
} & HeaderNavProps) {
  return (
    <GameShell
      header={<LobbyHeader onGameInfo={onGameInfo} onLeaderboard={onLeaderboard} />}
      bottomOverlay={<LobbyChatDock messages={mockChatMessages} onlineUsers={mockOnlineUsers} />}
    >
      {/* Background scene — kept behind the dark overlay. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      />

      {/* LAYER 1 — Atmosphere: dim first, then red vignette + slashes. */}
      <div style={DEFEAT_DARK_OVERLAY_STYLE} />
      <div style={DEFEAT_VIGNETTE_STYLE} />
      <DefeatSlashes />

      {/* LAYER 2 — Content column (title zone + info panel). */}
      <div
        style={{
          ...CONTENT_LAYER_STYLE,
          paddingBottom: `${CHAT_DOCK_SAFE_AREA_PX}px`,
        }}
      >
        <div style={TITLE_ZONE_STYLE}>
          <div style={TITLE_ROW_STYLE}>
            <div style={DEFEAT_WING_LEFT_STYLE} />
            <h1 style={DEFEAT_TITLE_STYLE}>DEFEAT</h1>
            <div style={DEFEAT_WING_RIGHT_STYLE} />
          </div>
          <p style={RESULT_SUBTITLE_STYLE}>Honor in Battle</p>
        </div>

        <div style={RESULT_PANEL_STYLE}>
          <div style={DEFEAT_ACCENT_LINE_STYLE} />
          <div style={PANEL_CONTENT_STYLE}>
            <div style={NAMES_GRID_STYLE}>
              <div>
                <p style={ROLE_LABEL_STYLE}>You</p>
                <p style={DEFEAT_LOSER_NAME_STYLE}>Kazumi</p>
                <p style={DEFEAT_DEFEATED_LABEL_STYLE}>Defeated</p>
              </div>
              <div>
                <p style={ROLE_LABEL_STYLE}>Opponent</p>
                <p style={DEFEAT_WINNER_NAME_STYLE}>Shadow Oni</p>
                <p style={WINNER_LABEL_STYLE}>Victor</p>
              </div>
            </div>

            <DSDivider marginY="md" />

            <p style={SECTION_LABEL_STYLE}>Rewards</p>
            <div style={REWARD_ROW_STYLE}>
              <span style={REWARD_LABEL_STYLE}>XP Gained</span>
              <span style={REWARD_VALUE_POSITIVE_STYLE}>+250 XP</span>
            </div>
            <div style={REWARD_ROW_STYLE}>
              <span style={REWARD_LABEL_STYLE}>Rating Lost</span>
              <span style={REWARD_VALUE_NEGATIVE_STYLE}>-18 RP</span>
            </div>

            {finalEntry && (
              <>
                <DSDivider marginY="md" />
                <div style={EXCHANGE_BLOCK_DEFEAT_STYLE}>
                  <div style={EXCHANGE_HEADER_STYLE}>
                    Final Exchange · Round {finalEntry.round}
                  </div>
                  <p style={EXCHANGE_TEXT_STYLE}>{finalEntry.text}</p>
                </div>
              </>
            )}

            <div style={BUTTONS_ROW_STYLE}>
              <DSButton variant="primary" size="md" onClick={onQueueAgain}>
                Try Again
              </DSButton>
              <DSButton variant="secondary" size="md" onClick={onReturnToLobby}>
                Return to Lobby
              </DSButton>
            </div>
          </div>
        </div>
      </div>
    </GameShell>
  );
}

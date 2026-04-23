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
import mitsudamoeSrc from '../../assets/icons/mitsudamoe.png';
import kunaiSrc from '../../assets/icons/kunai.png';

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
// Local glass + atmosphere styles for VictoryScreen / DefeatScreen.
// Intentionally kept in this file — the result screen is the emotional
// climax of a match and its bespoke atmosphere / bloom / accent treatment
// does not belong in the shared primitives.

// Full-viewport tint that sells the outcome before any text is read.
// Victory: gold radiates FROM the center outward (expansion, triumph).
// Defeat: red presses IN from the edges (constriction, pressure).
// Positioned above the background scene but below the fighter column so
// silhouettes stay readable against the tint.
const RESULT_ATMOSPHERE_BASE_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 5,
};

const VICTORY_ATMOSPHERE_STYLE: CSSProperties = {
  ...RESULT_ATMOSPHERE_BASE_STYLE,
  background:
    'radial-gradient(ellipse at 50% 30%, rgba(201, 162, 90, 0.18) 0%, rgba(201, 162, 90, 0.06) 50%, transparent 80%)',
};

const DEFEAT_ATMOSPHERE_STYLE: CSSProperties = {
  ...RESULT_ATMOSPHERE_BASE_STYLE,
  background:
    'radial-gradient(ellipse at 50% 50%, transparent 20%, rgba(192, 55, 68, 0.08) 50%, rgba(192, 55, 68, 0.18) 80%)',
};

// Wing-flanked title row. The gradient-fading rules on either side of the
// title taper AWAY from it, framing the word without competing with it.
const RESULT_TITLE_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space.md,
};

const WING_LINE_BASE_STYLE: CSSProperties = {
  flex: '0 0 60px',
  height: 1,
};

const VICTORY_WING_LEFT_STYLE: CSSProperties = {
  ...WING_LINE_BASE_STYLE,
  background: 'linear-gradient(to right, transparent, rgba(201, 162, 90, 0.4))',
};

const VICTORY_WING_RIGHT_STYLE: CSSProperties = {
  ...WING_LINE_BASE_STYLE,
  background: 'linear-gradient(to left, transparent, rgba(201, 162, 90, 0.4))',
};

const DEFEAT_WING_LEFT_STYLE: CSSProperties = {
  ...WING_LINE_BASE_STYLE,
  background: 'linear-gradient(to right, transparent, rgba(192, 55, 68, 0.4))',
};

const DEFEAT_WING_RIGHT_STYLE: CSSProperties = {
  ...WING_LINE_BASE_STYLE,
  background: 'linear-gradient(to left, transparent, rgba(192, 55, 68, 0.4))',
};

// Title — Cinzel 56px with a double textShadow (tight 40px + wide 80px)
// creating a luminous bloom against the atmosphere tint. Static, not
// animated: this is a final verdict, not a waiting state.
const RESULT_TITLE_BASE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 56,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textAlign: 'center',
  lineHeight: 1,
};

const VICTORY_TITLE_STYLE: CSSProperties = {
  ...RESULT_TITLE_BASE_STYLE,
  color: accent.primary,
  textShadow:
    '0 0 40px rgba(201, 162, 90, 0.5), 0 0 80px rgba(201, 162, 90, 0.2)',
};

const DEFEAT_TITLE_STYLE: CSSProperties = {
  ...RESULT_TITLE_BASE_STYLE,
  color: semantic.attack.text,
  textShadow:
    '0 0 40px rgba(192, 55, 68, 0.5), 0 0 80px rgba(192, 55, 68, 0.2)',
};

// Ceremonial emblem under the title. Static, ghosted, watermark-like —
// deliberately NOT the mitsudomoe spin pattern used on the waiting state.
// `mixBlendMode: screen` drops the PNG's black background into the
// atmosphere tint so only the gold / red figure reads.
const RESULT_ICON_BASE_STYLE: CSSProperties = {
  width: 100,
  height: 100,
  opacity: 0.2,
  marginTop: space.md,
  marginBottom: space.xs,
  mixBlendMode: 'screen',
};

const VICTORY_ICON_STYLE: CSSProperties = RESULT_ICON_BASE_STYLE;

const DEFEAT_ICON_STYLE: CSSProperties = {
  ...RESULT_ICON_BASE_STYLE,
  transform: 'rotate(180deg)', // kunai pointing down — weapon dropped
};

const RESULT_SUBTITLE_STYLE: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: text.muted,
  textAlign: 'center',
  marginTop: space.xs,
  marginBottom: space.lg,
};

// Glass info panel — built locally with raw design tokens instead of the
// Panel primitive so the screen can own its bespoke accent-border trim
// without leaking that concern into the shared primitive.
const RESULT_PANEL_STYLE: CSSProperties = {
  background: surface.glass,
  backdropFilter: blur.panel,
  WebkitBackdropFilter: blur.panel,
  borderRadius: radius.md,
  border: border.subtle,
  boxShadow: shadow.panel,
  padding: space.lg,
  maxWidth: 520,
  width: '100%',
  position: 'relative',
  overflow: 'hidden',
};

// Accent gradient line at the very top of the panel — fades at each end
// so it reads as refined trim rather than a hard border.
const RESULT_ACCENT_BASE_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 2,
  pointerEvents: 'none',
};

const VICTORY_ACCENT_STYLE: CSSProperties = {
  ...RESULT_ACCENT_BASE_STYLE,
  background: `linear-gradient(to right, transparent, ${accent.primary}, transparent)`,
};

const DEFEAT_ACCENT_STYLE: CSSProperties = {
  ...RESULT_ACCENT_BASE_STYLE,
  background: `linear-gradient(to right, transparent, ${semantic.attack.base}, transparent)`,
};

// Panel content styles.
const NAMES_ROW_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: space.lg,
  marginTop: space.xs,
};

const ROLE_LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: text.muted,
};

const PLAYER_NAME_STYLE: CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '0.08em',
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  color: text.primary,
  marginTop: space.xs,
};

const WINNER_STATUS_STYLE: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: accent.primary,
  marginTop: space.xs,
};

const LOSER_STATUS_STYLE: CSSProperties = {
  ...WINNER_STATUS_STYLE,
  color: text.muted,
};

const SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: text.secondary,
  textAlign: 'center',
  marginBottom: space.sm,
};

const REWARDS_STACK_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space.xs,
};

const REWARD_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${space.sm} ${space.md}`,
  background: surface.glassSubtle,
  borderRadius: radius.sm,
};

const REWARD_LABEL_STYLE: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: text.secondary,
};

const REWARD_VALUE_POSITIVE_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: accent.primary,
};

const REWARD_VALUE_NEGATIVE_STYLE: CSSProperties = {
  ...REWARD_VALUE_POSITIVE_STYLE,
  color: semantic.attack.text,
};

const EXCHANGE_BLOCK_BASE_STYLE: CSSProperties = {
  padding: `${space.sm} ${space.md}`,
  background: surface.glassSubtle,
  borderRadius: radius.sm,
  borderLeftWidth: 3,
  borderLeftStyle: 'solid',
  marginTop: space.sm,
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
      {/* Background scene */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--kombats-ink-navy)]/40 to-[var(--kombats-ink-navy)]/60" />
      </div>

      {/* Atmosphere — gold radiates FROM the center outward */}
      <div style={VICTORY_ATMOSPHERE_STYLE} />

      {/* Player character — celebratory, no HP/stat overlay */}
      <div className={`${FIGHTER_COLUMN_LEFT_CLASSNAME} z-10 pointer-events-none`}>
        <motion.img
          src={characterImage}
          alt="Your Character"
          className={FIGHTER_IMAGE_CLASSNAME}
          style={{
            filter: FIGHTER_IMAGE_BASE_FILTER,
            marginBottom: FIGHTER_IMAGE_MARGIN_BOTTOM,
          }}
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        />
      </div>

      {/* Content — bottom padding reserves the chat dock's safe area. */}
      <div
        className="relative z-20 h-full flex flex-col items-center justify-center px-8 pointer-events-none"
        style={{ paddingBottom: `${CHAT_DOCK_SAFE_AREA_PX}px` }}
      >
        {/* Title zone: wings → VICTORY → wings, then seal, then subtitle. */}
        <div className="flex flex-col items-center">
          <div style={RESULT_TITLE_ROW_STYLE}>
            <div style={VICTORY_WING_LEFT_STYLE} />
            <h1 style={VICTORY_TITLE_STYLE}>VICTORY</h1>
            <div style={VICTORY_WING_RIGHT_STYLE} />
          </div>
          <img
            src={mitsudamoeSrc}
            alt=""
            aria-hidden
            style={VICTORY_ICON_STYLE}
          />
          <div style={RESULT_SUBTITLE_STYLE}>Triumph in Combat</div>
        </div>

        {/* Result Panel */}
        <div className="pointer-events-auto" style={{ width: '100%', maxWidth: 520 }}>
          <div style={RESULT_PANEL_STYLE}>
            {/* Gold accent trim */}
            <div style={VICTORY_ACCENT_STYLE} />

            {/* Player names */}
            <div style={NAMES_ROW_STYLE}>
              <div style={{ textAlign: 'center' }}>
                <div style={ROLE_LABEL_STYLE}>You</div>
                <div style={PLAYER_NAME_STYLE}>Kazumi</div>
                <div style={WINNER_STATUS_STYLE}>Winner</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={ROLE_LABEL_STYLE}>Opponent</div>
                <div style={PLAYER_NAME_STYLE}>Shadow Oni</div>
                <div style={LOSER_STATUS_STYLE}>Defeated</div>
              </div>
            </div>

            <DSDivider marginY="sm" />

            {/* Rewards */}
            <div>
              <div style={SECTION_LABEL_STYLE}>Rewards</div>
              <div style={REWARDS_STACK_STYLE}>
                <div style={REWARD_ROW_STYLE}>
                  <span style={REWARD_LABEL_STYLE}>XP Gained</span>
                  <span style={REWARD_VALUE_POSITIVE_STYLE}>+1,250 XP</span>
                </div>
                <div style={REWARD_ROW_STYLE}>
                  <span style={REWARD_LABEL_STYLE}>Rating Gained</span>
                  <span style={REWARD_VALUE_POSITIVE_STYLE}>+25 RP</span>
                </div>
              </div>
            </div>

            {/* Final Exchange — gold left border */}
            {finalEntry && (
              <>
                <DSDivider marginY="sm" />
                <div
                  style={{
                    ...EXCHANGE_BLOCK_BASE_STYLE,
                    borderLeftColor: accent.primary,
                  }}
                >
                  <div style={EXCHANGE_HEADER_STYLE}>
                    Final Exchange · Round {finalEntry.round}
                  </div>
                  <div style={EXCHANGE_TEXT_STYLE}>{finalEntry.text}</div>
                </div>
              </>
            )}

            {/* Actions */}
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
      {/* Background scene */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--kombats-ink-navy)]/40 to-[var(--kombats-ink-navy)]/60" />
      </div>

      {/* Atmosphere — red presses IN from the edges */}
      <div style={DEFEAT_ATMOSPHERE_STYLE} />

      {/* Enemy character — the one who won, right side, mirrored & hue-shifted */}
      <div className={`${FIGHTER_COLUMN_RIGHT_CLASSNAME} z-10 pointer-events-none`}>
        <div style={{ transform: 'scaleX(-1)', marginBottom: FIGHTER_IMAGE_MARGIN_BOTTOM }}>
          <motion.img
            src={characterImage}
            alt="Victorious Opponent"
            className={FIGHTER_IMAGE_CLASSNAME}
            style={{
              filter: `${FIGHTER_IMAGE_BASE_FILTER} hue-rotate(180deg)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
        </div>
      </div>

      {/* Content — bottom padding reserves the chat dock's safe area. */}
      <div
        className="relative z-20 h-full flex flex-col items-center justify-center px-8 pointer-events-none"
        style={{ paddingBottom: `${CHAT_DOCK_SAFE_AREA_PX}px` }}
      >
        {/* Title zone: wings → DEFEAT → wings, then inverted kunai, then subtitle. */}
        <div className="flex flex-col items-center">
          <div style={RESULT_TITLE_ROW_STYLE}>
            <div style={DEFEAT_WING_LEFT_STYLE} />
            <h1 style={DEFEAT_TITLE_STYLE}>DEFEAT</h1>
            <div style={DEFEAT_WING_RIGHT_STYLE} />
          </div>
          <img
            src={kunaiSrc}
            alt=""
            aria-hidden
            style={DEFEAT_ICON_STYLE}
          />
          <div style={RESULT_SUBTITLE_STYLE}>Honor in Battle</div>
        </div>

        {/* Result Panel */}
        <div className="pointer-events-auto" style={{ width: '100%', maxWidth: 520 }}>
          <div style={RESULT_PANEL_STYLE}>
            {/* Red accent trim */}
            <div style={DEFEAT_ACCENT_STYLE} />

            {/* Player names */}
            <div style={NAMES_ROW_STYLE}>
              <div style={{ textAlign: 'center' }}>
                <div style={ROLE_LABEL_STYLE}>You</div>
                <div style={PLAYER_NAME_STYLE}>Kazumi</div>
                <div style={LOSER_STATUS_STYLE}>Defeated</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={ROLE_LABEL_STYLE}>Opponent</div>
                <div style={PLAYER_NAME_STYLE}>Shadow Oni</div>
                <div style={WINNER_STATUS_STYLE}>Victor</div>
              </div>
            </div>

            <DSDivider marginY="sm" />

            {/* Rewards */}
            <div>
              <div style={SECTION_LABEL_STYLE}>Rewards</div>
              <div style={REWARDS_STACK_STYLE}>
                <div style={REWARD_ROW_STYLE}>
                  <span style={REWARD_LABEL_STYLE}>XP Gained</span>
                  <span style={REWARD_VALUE_POSITIVE_STYLE}>+250 XP</span>
                </div>
                <div style={REWARD_ROW_STYLE}>
                  <span style={REWARD_LABEL_STYLE}>Rating Lost</span>
                  <span style={REWARD_VALUE_NEGATIVE_STYLE}>-18 RP</span>
                </div>
              </div>
            </div>

            {/* Final Exchange — red left border */}
            {finalEntry && (
              <>
                <DSDivider marginY="sm" />
                <div
                  style={{
                    ...EXCHANGE_BLOCK_BASE_STYLE,
                    borderLeftColor: semantic.attack.base,
                  }}
                >
                  <div style={EXCHANGE_HEADER_STYLE}>
                    Final Exchange · Round {finalEntry.round}
                  </div>
                  <div style={EXCHANGE_TEXT_STYLE}>{finalEntry.text}</div>
                </div>
              </>
            )}

            {/* Actions */}
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

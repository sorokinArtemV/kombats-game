import { useState, type CSSProperties } from 'react';
import { Sword, Zap, TrendingUp, ChevronRight, Target, Clock, Trophy, Heart, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'motion/react';
import { PrimaryButton, SecondaryButton, GhostButton, GamePanel } from './KombatsUI';
import {
  Button as DSButton,
  Divider as DSDivider,
  Label as DSLabel,
  Panel as DSPanel,
} from '../../design-system/primitives';
import { accent, space, text } from '../../design-system/tokens';
import {
  RewardRow,
  QueueCard,
  FighterStatsPopover,
  type FighterAttribute,
  type FighterRecord,
} from '../../design-system/composed';
import {
  GameShell,
  LobbyHeader,
  LobbyChatDock,
  BattleLogRecap,
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

function LobbyScene({ centerCard }: { centerCard: React.ReactNode }) {
  const [showStats, setShowStats] = useState(false);

  return (
    <GameShell
      header={<LobbyHeader />}
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

export function MainHub({ onJoinQueue }: { onJoinQueue: () => void }) {
  return (
    <LobbyScene
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

export function QueueScreen({ onCancel, elapsedTime }: { onCancel: () => void; elapsedTime: number }) {
  return (
    <LobbyScene
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
}: {
  onVictory?: () => void;
  onDefeat?: () => void;
  battleLog?: BattleLogEntry[];
}) {
  const [selectedAttack, setSelectedAttack] = useState<BodyZone | null>(null);
  const [selectedDefense, setSelectedDefense] = useState<BlockPair | null>(null);
  const [showPlayerStats, setShowPlayerStats] = useState(false);
  const [showOpponentStats, setShowOpponentStats] = useState(false);

  return (
    <GameShell
      header={<LobbyHeader />}
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
          className="absolute top-1/2 left-1/2 w-[640px]"
          style={{ transform: 'translate(-50%, -62%)' }}
        >
          <DSPanel variant="glass" radius="md" elevation="panel" bordered>
            <div style={{ paddingTop: space.md, paddingBottom: space.sm }}>
              {/* Panel title — anchors the diptych as a named section.
                  No bottom padding so the meta row's top padding owns
                  the gap and title+meta read as a single header unit. */}
              <div style={{ padding: `${space.sm} ${space.md} 0` }}>
                <h3 style={COMBAT_PANEL_TITLE_STYLE}>Select Attack &amp; Block</h3>
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
                    <span aria-hidden style={TURN_INDICATOR_DOT_STYLE} />
                    <DSLabel tone="accent">Your Turn</DSLabel>
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
                  width={210}
                  action={
                    <DSButton
                      variant="primary"
                      size="md"
                      disabled={!selectedAttack || !selectedDefense}
                    >
                      LOCK IN
                    </DSButton>
                  }
                />
              </div>
            </div>
          </DSPanel>

          {(onVictory || onDefeat) && (
            <div className="flex gap-2 justify-center mt-2">
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

// ==================== VICTORY SCREEN ====================

export function VictoryScreen({
  onReturnToLobby,
  onQueueAgain,
  finalEntry,
}: {
  onReturnToLobby: () => void;
  onQueueAgain: () => void;
  finalEntry?: BattleLogEntry;
}) {
  return (
    <GameShell
      header={<LobbyHeader />}
      bottomOverlay={<LobbyChatDock messages={mockChatMessages} onlineUsers={mockOnlineUsers} />}
    >
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--kombats-ink-navy)]/40 to-[var(--kombats-ink-navy)]/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--kombats-jade)]/10 via-transparent to-transparent" />
      </div>

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

      {/* Content — bottom padding reserves the shared chat dock's safe area so
          the centered result panel never collides with the lower chat. */}
      <div
        className="relative z-20 h-full flex flex-col items-center justify-center px-8 pointer-events-none"
        style={{ paddingBottom: `${CHAT_DOCK_SAFE_AREA_PX}px` }}
      >
        {/* Victory Banner */}
        <motion.div
          className="text-center mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
        >
          <h1
            className="text-6xl text-[var(--kombats-gold)] mb-2 tracking-wide"
            style={{
              textShadow:
                '0 2px 10px rgba(0,0,0,0.75), 0 0 24px rgba(201,169,97,0.32), 0 0 56px rgba(201,169,97,0.16)',
            }}
          >
            VICTORY
          </h1>
          <p className="text-sm text-[var(--kombats-text-muted)] uppercase tracking-wider">Triumph in Combat</p>
        </motion.div>

        {/* Result Panel */}
        <div className="max-w-2xl w-full pointer-events-auto">
          <div className="bg-[var(--kombats-panel)] backdrop-blur-md border-2 border-[var(--kombats-jade)]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_30px_rgba(90,138,122,0.15)] rounded-lg overflow-hidden">
            {/* Match Summary */}
            <div className="p-6 border-b border-[var(--kombats-panel-border)]">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <div className="text-sm text-[var(--kombats-text-secondary)] mb-1">You</div>
                  <div className="text-2xl text-[var(--kombats-jade)]">Kazumi</div>
                  <div className="text-xs text-[var(--kombats-jade)] mt-1">Winner</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-[var(--kombats-text-secondary)] mb-1">Opponent</div>
                  <div className="text-2xl text-[var(--kombats-text-primary)]">Shadow Oni</div>
                  <div className="text-xs text-[var(--kombats-text-muted)] mt-1">Defeated</div>
                </div>
              </div>
            </div>

            {/* Rewards */}
            <div className="p-6 border-b border-[var(--kombats-panel-border)]">
              <h3 className="text-xs text-[var(--kombats-text-muted)] uppercase tracking-wider mb-3 flex items-center justify-center gap-2">
                <Trophy className="w-3 h-3 text-[var(--kombats-gold)]" />
                Rewards
              </h3>
              <div className="space-y-2">
                <RewardRow label="XP Gained" value="+1,250 XP" tone="accent" />
                <RewardRow label="Rating Gained" value="+25 RP" tone="success" />
              </div>
            </div>

            {/* Final Exchange Recap */}
            {finalEntry && (
              <div className="px-6 py-4 border-b border-[var(--kombats-panel-border)]">
                <BattleLogRecap entry={finalEntry} tone="victory" />
              </div>
            )}

            {/* Actions */}
            <div className="p-6 bg-[var(--kombats-panel)]/50">
              <div className="flex gap-3 justify-center">
                <PrimaryButton onClick={onQueueAgain}>
                  Battle Again
                </PrimaryButton>
                <SecondaryButton onClick={onReturnToLobby}>
                  Return to Lobby
                </SecondaryButton>
              </div>
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
}: {
  onReturnToLobby: () => void;
  onQueueAgain: () => void;
  finalEntry?: BattleLogEntry;
}) {
  return (
    <GameShell
      header={<LobbyHeader />}
      bottomOverlay={<LobbyChatDock messages={mockChatMessages} onlineUsers={mockOnlineUsers} />}
    >
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--kombats-ink-navy)]/40 to-[var(--kombats-ink-navy)]/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--kombats-crimson)]/10 via-transparent to-transparent" />
      </div>

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

      {/* Content — bottom padding reserves the shared chat dock's safe area so
          the centered result panel never collides with the lower chat. */}
      <div
        className="relative z-20 h-full flex flex-col items-center justify-center px-8 pointer-events-none"
        style={{ paddingBottom: `${CHAT_DOCK_SAFE_AREA_PX}px` }}
      >
        {/* Defeat Banner */}
        <motion.div
          className="text-center mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
        >
          <h1
            className="text-6xl text-[var(--kombats-crimson)] mb-2 tracking-wide"
            style={{
              textShadow:
                '0 2px 10px rgba(0,0,0,0.75), 0 0 24px rgba(192,55,68,0.32), 0 0 56px rgba(192,55,68,0.16)',
            }}
          >
            DEFEAT
          </h1>
          <p className="text-sm text-[var(--kombats-text-muted)] uppercase tracking-wider">Honor in Battle</p>
        </motion.div>

        {/* Result Panel */}
        <div className="max-w-2xl w-full pointer-events-auto">
          <div className="bg-[var(--kombats-panel)] backdrop-blur-md border-2 border-[var(--kombats-crimson)]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_30px_rgba(192,55,68,0.15)] rounded-lg overflow-hidden">
            {/* Match Summary */}
            <div className="p-6 border-b border-[var(--kombats-panel-border)]">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <div className="text-sm text-[var(--kombats-text-secondary)] mb-1">You</div>
                  <div className="text-2xl text-[var(--kombats-text-primary)]">Kazumi</div>
                  <div className="text-xs text-[var(--kombats-crimson)] mt-1">Defeated</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-[var(--kombats-text-secondary)] mb-1">Opponent</div>
                  <div className="text-2xl text-[var(--kombats-gold)]">Shadow Oni</div>
                  <div className="text-xs text-[var(--kombats-gold)] mt-1">Victor</div>
                </div>
              </div>
            </div>

            {/* Rewards — same progression-style structure as Victory */}
            <div className="p-6 border-b border-[var(--kombats-panel-border)]">
              <h3 className="text-xs text-[var(--kombats-text-muted)] uppercase tracking-wider mb-3 text-center">
                Rewards
              </h3>
              <div className="space-y-2">
                <RewardRow label="XP Gained" value="+250 XP" tone="accent" />
                <RewardRow label="Rating Lost" value="-18 RP" tone="danger" />
              </div>
            </div>

            {/* Final Exchange Recap */}
            {finalEntry && (
              <div className="px-6 py-4 border-b border-[var(--kombats-panel-border)]">
                <BattleLogRecap entry={finalEntry} tone="defeat" />
              </div>
            )}

            {/* Actions */}
            <div className="p-6 bg-[var(--kombats-panel)]/50">
              <div className="flex gap-3 justify-center">
                <PrimaryButton onClick={onQueueAgain}>
                  Try Again
                </PrimaryButton>
                <SecondaryButton onClick={onReturnToLobby}>
                  Return to Lobby
                </SecondaryButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GameShell>
  );
}

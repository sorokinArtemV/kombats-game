import { Shield, Sword, Zap, Heart, Clock, Trophy, Star, Target, User, Flame, Wind } from 'lucide-react';
import { motion } from 'motion/react';

// ==================== BUTTONS ====================

export function PrimaryButton({
  children,
  disabled = false,
  selected = false,
  size = 'default',
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  selected?: boolean;
  size?: 'default' | 'large';
  onClick?: () => void;
}) {
  const baseClasses = "relative transition-all duration-200 uppercase tracking-widest whitespace-nowrap";
  const sizeClasses = size === 'large'
    ? "px-10 py-4 text-[16px]"
    : "px-6 py-2.5 text-sm";

  const stateClasses = disabled
    ? "bg-[var(--kombats-smoke-gray)] text-[var(--kombats-text-muted)] border border-[var(--kombats-panel-border)] cursor-not-allowed opacity-50"
    : selected
    ? "bg-[var(--kombats-gold)] text-[var(--kombats-ink-navy)] border border-[var(--kombats-gold-light)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-[var(--kombats-gold-light)]"
    : "bg-[var(--kombats-gold)] text-[var(--kombats-ink-navy)] border border-[var(--kombats-gold-dark)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-[var(--kombats-gold-light)] active:translate-y-0.5";

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${stateClasses}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  disabled = false,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`px-6 py-2.5 text-sm uppercase tracking-widest transition-all duration-200 border ${
        disabled
          ? "bg-transparent border-[var(--kombats-panel-border)] text-[var(--kombats-text-muted)] cursor-not-allowed opacity-50"
          : "bg-transparent border-[var(--kombats-moon-silver)] text-[var(--kombats-moon-silver)] hover:bg-[var(--kombats-moon-silver)]/10 hover:border-[var(--kombats-moon-silver-light)] active:translate-y-0.5"
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      className="px-4 py-2 text-[var(--kombats-text-secondary)] hover:text-[var(--kombats-text-primary)] transition-colors duration-200 uppercase tracking-wider text-sm"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ElementType;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="p-2.5 bg-[var(--kombats-panel)] border border-[var(--kombats-panel-border)] hover:border-[var(--kombats-moon-silver)] hover:bg-[var(--kombats-panel-highlight)] transition-all duration-200"
      onClick={onClick}
      aria-label={label}
    >
      <Icon className="w-5 h-5 text-[var(--kombats-moon-silver)]" />
    </button>
  );
}

// ==================== PANELS & CARDS ====================

export function GamePanel({
  children,
  className = "",
  ornament = false
}: {
  children: React.ReactNode;
  className?: string;
  ornament?: boolean;
}) {
  return (
    <div className={`relative bg-[var(--kombats-panel)] backdrop-blur-sm border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className}`}>
      {ornament && (
        <>
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[var(--kombats-moon-silver)]/40" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[var(--kombats-moon-silver)]/40" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[var(--kombats-moon-silver)]/40" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[var(--kombats-moon-silver)]/40" />
        </>
      )}
      {children}
    </div>
  );
}

export function CharacterHUD({
  name,
  level,
  health,
  maxHealth,
  energy,
  maxEnergy,
  imageUrl,
  isPlayer = true
}: {
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  imageUrl?: string;
  isPlayer?: boolean;
}) {
  return (
    <GamePanel className="p-4" ornament>
      <div className="flex items-center gap-4">
        <CharacterAvatar imageUrl={imageUrl} size="large" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-base text-[var(--kombats-text-primary)]">{name}</h3>
            <span className="text-[10px] px-2 py-0.5 bg-[var(--kombats-smoke-gray)] text-[var(--kombats-moon-silver)] border border-[var(--kombats-panel-border)]">
              LV {level}
            </span>
          </div>
          <HealthBar value={health} max={maxHealth} />
          <EnergyBar value={energy} max={maxEnergy} />
        </div>
      </div>
    </GamePanel>
  );
}

export function BattleLogPanel({ logs }: { logs: Array<{ id: string; text: string; type: 'damage' | 'heal' | 'status' | 'system' }> }) {
  const getLogColor = (type: string) => {
    switch (type) {
      case 'damage': return 'text-[var(--kombats-crimson)]';
      case 'heal': return 'text-[var(--kombats-jade)]';
      case 'status': return 'text-[var(--kombats-gold)]';
      default: return 'text-[var(--kombats-text-secondary)]';
    }
  };

  return (
    <GamePanel className="p-4 h-48 overflow-y-auto">
      <div className="space-y-2">
        {logs.map(log => (
          <div key={log.id} className={`text-sm ${getLogColor(log.type)}`}>
            {log.text}
          </div>
        ))}
      </div>
    </GamePanel>
  );
}

export function ModalPanel({
  children,
  title,
  onClose
}: {
  children: React.ReactNode;
  title?: string;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <GamePanel className="w-full max-w-lg" ornament>
        {title && (
          <div className="px-6 py-4 border-b border-[var(--kombats-panel-border)] flex justify-between items-center">
            <h2 className="text-lg text-[var(--kombats-text-primary)]">{title}</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="text-[var(--kombats-text-muted)] hover:text-[var(--kombats-text-primary)] transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </GamePanel>
    </div>
  );
}

// ==================== HUD ELEMENTS ====================

export function HealthBar({
  value,
  max,
  showLabel = true
}: {
  value: number;
  max: number;
  showLabel?: boolean;
}) {
  const percentage = (value / max) * 100;
  const isLow = percentage < 30;

  return (
    <div className="mb-2">
      {showLabel && (
        <div className="flex justify-between text-[10px] text-[var(--kombats-text-muted)] mb-1 uppercase tracking-wider">
          <span>Health</span>
          <span>{value} / {max}</span>
        </div>
      )}
      <div className="h-1.5 bg-[var(--kombats-ink-navy)] border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
        <motion.div
          className={`h-full ${isLow ? 'bg-[var(--kombats-crimson)]' : 'bg-[var(--kombats-jade)]'}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

export function EnergyBar({
  value,
  max
}: {
  value: number;
  max: number;
}) {
  const percentage = (value / max) * 100;

  return (
    <div>
      <div className="flex justify-between text-[10px] text-[var(--kombats-text-muted)] mb-1 uppercase tracking-wider">
        <span>Energy</span>
        <span>{value} / {max}</span>
      </div>
      <div className="h-1.5 bg-[var(--kombats-ink-navy)] border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
        <motion.div
          className="h-full bg-[var(--kombats-jade)]"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

export function TurnTimer({ seconds }: { seconds: number }) {
  const isUrgent = seconds <= 10;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 border ${
      isUrgent
        ? 'bg-[var(--kombats-crimson)]/10 border-[var(--kombats-crimson)]'
        : 'bg-[var(--kombats-panel)] border-[var(--kombats-panel-border)]'
    }`}>
      <Clock className={`w-4 h-4 ${isUrgent ? 'text-[var(--kombats-crimson)]' : 'text-[var(--kombats-moon-silver)]'}`} />
      <span className={`text-lg tabular-nums ${isUrgent ? 'text-[var(--kombats-crimson)]' : 'text-[var(--kombats-text-primary)]'}`}>
        {seconds}
      </span>
    </div>
  );
}

export function TurnIndicator({ isYourTurn }: { isYourTurn: boolean }) {
  return (
    <div className={`px-4 py-2 uppercase tracking-widest text-xs border ${
      isYourTurn
        ? 'bg-[var(--kombats-gold)]/20 border-[var(--kombats-gold)] text-[var(--kombats-gold)]'
        : 'bg-[var(--kombats-panel)] border-[var(--kombats-panel-border)] text-[var(--kombats-text-muted)]'
    }`}>
      {isYourTurn ? 'Your Turn' : 'Waiting'}
    </div>
  );
}

export function StatusBadge({
  type,
  label,
  count
}: {
  type: 'buff' | 'debuff' | 'shield' | 'damage';
  label: string;
  count?: number;
}) {
  const styles = {
    buff: 'bg-[var(--kombats-jade)]/15 border-[var(--kombats-jade)] text-[var(--kombats-jade)]',
    debuff: 'bg-[var(--kombats-crimson)]/15 border-[var(--kombats-crimson)] text-[var(--kombats-crimson)]',
    shield: 'bg-[var(--kombats-moon-silver)]/15 border-[var(--kombats-moon-silver)] text-[var(--kombats-moon-silver)]',
    damage: 'bg-[var(--kombats-gold)]/15 border-[var(--kombats-gold)] text-[var(--kombats-gold)]'
  };

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[10px] uppercase tracking-wider ${styles[type]}`}>
      <span>{label}</span>
      {count && <span className="ml-1">×{count}</span>}
    </div>
  );
}

// ==================== AVATARS ====================

export function CharacterAvatar({
  imageUrl,
  size = 'default'
}: {
  imageUrl?: string;
  size?: 'small' | 'default' | 'large';
}) {
  const sizes = {
    small: 'w-10 h-10',
    default: 'w-14 h-14',
    large: 'w-16 h-16'
  };

  return (
    <div className={`${sizes[size]} border-2 border-[var(--kombats-moon-silver)] bg-[var(--kombats-charcoal)] overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]`}>
      {imageUrl ? (
        <img src={imageUrl} alt="Character" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--kombats-smoke-gray)] to-[var(--kombats-charcoal)]">
          <User className="w-1/2 h-1/2 text-[var(--kombats-text-muted)]" />
        </div>
      )}
    </div>
  );
}

// ==================== INPUTS & SELECTORS ====================

export function ActionPanel({
  title,
  icon: Icon,
  children,
  accentColor = 'gold'
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  accentColor?: 'gold' | 'crimson' | 'jade';
}) {
  const colors = {
    gold: 'border-t-[var(--kombats-gold)] text-[var(--kombats-gold)]',
    crimson: 'border-t-[var(--kombats-crimson)] text-[var(--kombats-crimson)]',
    jade: 'border-t-[var(--kombats-jade)] text-[var(--kombats-jade)]'
  };

  return (
    <GamePanel className={`border-t-2 ${colors[accentColor]}`} ornament>
      <div className="px-4 py-3 border-b border-[var(--kombats-panel-border)] flex items-center gap-2">
        <Icon className={`w-4 h-4 ${colors[accentColor]}`} />
        <h3 className={`text-sm uppercase tracking-wider ${colors[accentColor]}`}>{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </GamePanel>
  );
}

export function SkillOption({
  name,
  icon: Icon,
  energyCost,
  damage,
  selected = false,
  disabled = false,
  onClick
}: {
  name: string;
  icon: React.ElementType;
  energyCost: number;
  damage?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-3 border transition-all duration-200 w-full text-left ${
        disabled
          ? 'bg-[var(--kombats-charcoal)] border-[var(--kombats-panel-border)] opacity-40 cursor-not-allowed'
          : selected
          ? 'bg-[var(--kombats-gold)]/10 border-[var(--kombats-gold)] shadow-[inset_0_0_8px_rgba(201,169,97,0.15)]'
          : 'bg-[var(--kombats-panel)] border-[var(--kombats-panel-border)] hover:border-[var(--kombats-moon-silver)] hover:bg-[var(--kombats-panel-highlight)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 border ${selected ? 'border-[var(--kombats-gold)] bg-[var(--kombats-gold)]/10' : 'border-[var(--kombats-panel-border)] bg-[var(--kombats-smoke-gray)]'}`}>
          <Icon className={`w-4 h-4 ${selected ? 'text-[var(--kombats-gold)]' : 'text-[var(--kombats-moon-silver)]'}`} />
        </div>
        <div className="flex-1">
          <div className="text-sm text-[var(--kombats-text-primary)] mb-1">{name}</div>
          <div className="flex gap-3 text-[10px]">
            <span className="text-[var(--kombats-jade)]">
              <Zap className="w-2.5 h-2.5 inline mr-0.5" />
              {energyCost}
            </span>
            {damage && (
              <span className="text-[var(--kombats-crimson)]">
                <Sword className="w-2.5 h-2.5 inline mr-0.5" />
                {damage}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function DefenseOption({
  name,
  icon: Icon,
  description,
  selected = false,
  onClick
}: {
  name: string;
  icon: React.ElementType;
  description: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-3 border transition-all duration-200 text-left w-full ${
        selected
          ? 'bg-[var(--kombats-moon-silver)]/10 border-[var(--kombats-moon-silver)] shadow-[inset_0_0_8px_rgba(154,154,168,0.15)]'
          : 'bg-[var(--kombats-panel)] border-[var(--kombats-panel-border)] hover:border-[var(--kombats-moon-silver)] hover:bg-[var(--kombats-panel-highlight)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 ${selected ? 'text-[var(--kombats-moon-silver)]' : 'text-[var(--kombats-text-muted)]'}`} />
        <div>
          <div className="text-sm text-[var(--kombats-text-primary)] mb-1">{name}</div>
          <div className="text-xs text-[var(--kombats-text-muted)]">{description}</div>
        </div>
      </div>
    </button>
  );
}

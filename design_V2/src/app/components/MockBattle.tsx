import { useState } from 'react';
import { Shield, Sword, Zap, TrendingUp, Clock } from 'lucide-react';
import {
  Button as DSButton,
  Panel as DSPanel,
} from '../../design-system/primitives';
import { accent, radius, space, surface, typography } from '../../design-system/tokens';
import { BodyZoneSelector, type BodyZone, type BlockPair } from './BodyZoneSelector';
import bgImage from '../../imports/bg.png';
import character1 from '../../imports/ChatGPT_Image_19_апр._2026_г.,_01_12_05.png';

// Combat panel's YOUR TURN status indicator. Quiet filled badge — reads
// as state, not a CTA competitor with LOCK IN.
const YOUR_TURN_BADGE_STYLE = {
  background: surface.glassSubtle,
  color: accent.text,
  padding: '4px 12px',
  borderRadius: radius.sm,
  fontSize: typography.labelDisplay.fontSize,
  letterSpacing: typography.labelDisplay.letterSpacing,
  textTransform: typography.labelDisplay.textTransform,
  fontWeight: typography.labelDisplay.fontWeight,
} as const;

export function MockBattle() {
  const [selectedAttack, setSelectedAttack] = useState<BodyZone | null>(null);
  const [selectedDefense, setSelectedDefense] = useState<BlockPair | null>(null);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--kombats-ink-navy)]">
      {/* Battle Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--kombats-ink-navy)]/60" />
      </div>

      {/* Main Battle Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Top Bar - Optional Round/Timer */}
        <div className="flex justify-center pt-6">
          <div className="px-6 py-2 bg-[var(--kombats-panel)] border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-sm text-[var(--kombats-gold)] uppercase tracking-widest">Round 2</div>
                <div className="text-[9px] text-[var(--kombats-text-muted)] uppercase tracking-wider">Best of 3</div>
              </div>
              <div className="w-px h-8 bg-[var(--kombats-panel-border)]" />
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[var(--kombats-moon-silver)]" />
                <span className="text-base tabular-nums text-[var(--kombats-text-primary)]">28</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fighters Area */}
        <div className="flex-1 flex items-end justify-between px-12 pb-8 relative">
          {/* Left Fighter - Player */}
          <div className="relative" style={{ marginBottom: '-2rem' }}>
            {/* Character Image - Frameless */}
            <img
              src={character1}
              alt="Player Character"
              className="h-[480px] w-auto object-contain drop-shadow-2xl"
              style={{ filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.7))' }}
            />

            {/* Compact HUD Cluster - Below Character */}
            <div className="absolute bottom-0 left-0 right-0 space-y-1.5">
              {/* Name */}
              <div className="text-[var(--kombats-text-primary)] text-sm tracking-wide mb-1">
                Kazumi
              </div>

              {/* HP Bar */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px] text-[var(--kombats-text-muted)] uppercase tracking-wider">
                  <span>Health</span>
                  <span>850 / 1000</span>
                </div>
                <div className="h-1.5 bg-[var(--kombats-ink-navy)] border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] w-48">
                  <div className="h-full bg-[var(--kombats-jade)] w-[85%]" />
                </div>
              </div>

              {/* Energy Bar */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px] text-[var(--kombats-text-muted)] uppercase tracking-wider">
                  <span>Energy</span>
                  <span>65 / 100</span>
                </div>
                <div className="h-1.5 bg-[var(--kombats-ink-navy)] border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] w-48">
                  <div className="h-full bg-[var(--kombats-jade)] w-[65%]" />
                </div>
              </div>

              {/* Core Stats */}
              <div className="flex gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <Sword className="w-3 h-3 text-[var(--kombats-crimson)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">92</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-[var(--kombats-moon-silver)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">78</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[var(--kombats-gold)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">88</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-[var(--kombats-jade)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">85</span>
                </div>
              </div>

            </div>
          </div>

          {/* Right Fighter - Opponent */}
          <div className="relative" style={{ marginBottom: '-2rem' }}>
            {/* Character Image - Frameless - Flipped */}
            <img
              src={character1}
              alt="Opponent Character"
              className="h-[480px] w-auto object-contain drop-shadow-2xl"
              style={{
                filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.7)) hue-rotate(180deg)',
                transform: 'scaleX(-1)'
              }}
            />

            {/* Compact HUD Cluster - Below Character */}
            <div className="absolute bottom-0 left-0 right-0 space-y-1.5">
              {/* Name */}
              <div className="text-[var(--kombats-text-primary)] text-sm tracking-wide mb-1">
                Shadow Oni
              </div>

              {/* HP Bar */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px] text-[var(--kombats-text-muted)] uppercase tracking-wider">
                  <span>Health</span>
                  <span>620 / 950</span>
                </div>
                <div className="h-1.5 bg-[var(--kombats-ink-navy)] border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] w-48">
                  <div className="h-full bg-[var(--kombats-crimson)] w-[65%]" />
                </div>
              </div>

              {/* Energy Bar */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px] text-[var(--kombats-text-muted)] uppercase tracking-wider">
                  <span>Energy</span>
                  <span>45 / 100</span>
                </div>
                <div className="h-1.5 bg-[var(--kombats-ink-navy)] border border-[var(--kombats-panel-border)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] w-48">
                  <div className="h-full bg-[var(--kombats-jade)] w-[45%]" />
                </div>
              </div>

              {/* Core Stats */}
              <div className="flex gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <Sword className="w-3 h-3 text-[var(--kombats-crimson)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">86</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-[var(--kombats-moon-silver)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">82</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[var(--kombats-gold)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">75</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-[var(--kombats-jade)]" />
                  <span className="text-xs text-[var(--kombats-text-primary)]">90</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Bottom Action Area */}
        <div className="pb-8 px-8">
          <div className="max-w-5xl mx-auto">
            {/* Silhouette-driven combat selector */}
            <div className="mb-6 flex justify-center">
              <div className="w-full max-w-xl">
                <DSPanel variant="glass" radius="md" elevation="panel" bordered>
                  <div style={{ padding: space.lg }}>
                    <div>
                      <BodyZoneSelector
                        attack={selectedAttack}
                        block={selectedDefense}
                        onAttackChange={setSelectedAttack}
                        onBlockChange={setSelectedDefense}
                        width={190}
                        layout="split"
                        action={
                          <DSButton
                            variant="primary"
                            size="lg"
                            disabled={!selectedAttack || !selectedDefense}
                          >
                            LOCK IN
                          </DSButton>
                        }
                      />
                    </div>
                  </div>
                </DSPanel>
              </div>
            </div>

            {/* Turn Indicator */}
            <div className="flex justify-center mt-4">
              <span style={YOUR_TURN_BADGE_STYLE}>Your Turn</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

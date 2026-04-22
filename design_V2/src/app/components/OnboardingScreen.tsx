import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameShell, LobbyHeader } from './GameShell';
import { Button, Label, TextInput } from '../../design-system/primitives';
import { OnboardingCard } from '../../design-system/composed';
// Tokens consumed here only for AvatarCard's visual binding (see Phase 2 Step 3, item F).
// Screen-level logic stays off the token module — use primitives/composed for everything else.
import { accent, border as borderTokens } from '../../design-system/tokens';
import bgImage from '../../imports/bg-1.png';
import femaleArcher from '../../assets/fighters/female_archer.png';
import femaleNinja from '../../assets/fighters/female_ninja.png';
import ronin from '../../assets/fighters/ronin.png';
import shadowAssassin from '../../assets/fighters/shadow_assassin.png';
import shadowOni from '../../assets/fighters/shadow_oni.png';

export type AvatarId =
  | 'ronin'
  | 'shadow-oni'
  | 'shadow-assassin'
  | 'female-ninja'
  | 'female-archer';

export interface AvatarOption {
  id: AvatarId;
  // Short display name for the avatar skin — purely cosmetic, not a class.
  name: string;
  image: string;
  // Focal point (as object-position) used when cropping the portrait into
  // small cards — each asset's head sits at a slightly different height.
  focal: string;
}

// Real avatar art from src/assets/fighters. These are skin options only —
// appearance, not combat class.
export const AVATARS: readonly AvatarOption[] = [
  { id: 'ronin', name: 'Takeshi', image: ronin, focal: '50% 10%' },
  { id: 'shadow-oni', name: 'Shadow', image: shadowOni, focal: '50% 8%' },
  { id: 'shadow-assassin', name: 'Raiden', image: shadowAssassin, focal: '50% 10%' },
  { id: 'female-ninja', name: 'Akemi', image: femaleNinja, focal: '50% 12%' },
  { id: 'female-archer', name: 'Kasumi', image: femaleArcher, focal: '50% 12%' },
];

export const DEFAULT_AVATAR_ID: AvatarId = 'ronin';

export interface OnboardingResult {
  name: string;
  avatar: AvatarOption;
}

const NAME_MIN = 3;
const NAME_MAX = 16;
const NAME_PATTERN = /^[A-Za-z0-9_\- ]+$/;

function validateName(raw: string): { ok: boolean; error?: string; trimmed: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, trimmed, error: 'Enter a display name' };
  if (trimmed.length < NAME_MIN) return { ok: false, trimmed, error: `At least ${NAME_MIN} characters` };
  if (trimmed.length > NAME_MAX) return { ok: false, trimmed, error: `At most ${NAME_MAX} characters` };
  if (!NAME_PATTERN.test(trimmed)) return { ok: false, trimmed, error: 'Letters, numbers, space, - and _ only' };
  return { ok: true, trimmed };
}

const FIGHTER_IMAGE_CLASSNAME = 'h-[82vh] w-auto object-contain drop-shadow-2xl';
const FIGHTER_IMAGE_BASE_FILTER = 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))';
const FIGHTER_IMAGE_MARGIN_BOTTOM = '-17vh';
const FIGHTER_COLUMN_LEFT_CLASSNAME = 'absolute left-0 bottom-0 flex flex-col items-center';

function AvatarCard({
  avatar,
  selected,
  onSelect,
}: {
  avatar: AvatarOption;
  selected: boolean;
  onSelect: () => void;
}) {
  // Source art is 1024×1536 (2:3). Card uses the same aspect so object-cover
  // renders the artwork 1:1 with no crop and no upscale — stays crisp.
  //
  // Selection is conveyed by two non-glowing signals: (1) spotlight contrast
  // via plain opacity — non-selected cards are dimmed, the selected card is
  // at full brightness; (2) a sharp gold underline pinned to the bottom edge
  // of the selected card, clipped by the card's rounded corners so it reads
  // as a tab-style frame. No shadows, no filters, no light bleed.
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Choose avatar ${avatar.name}`}
      style={{ border: borderTokens.subtle }}
      className={`group relative block aspect-[2/3] w-full overflow-hidden rounded-md transition-opacity duration-200 focus:outline-none ${
        selected
          ? 'opacity-100'
          : 'opacity-55 hover:opacity-90 focus-visible:opacity-90'
      }`}
    >
      {/* Background fill so any letterbox edges blend into the panel.
          Preserved verbatim — carries functional meaning (letterbox blending)
          and is not substitutable by a design-system surface token. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--kombats-smoke-gray)]/70 via-[var(--kombats-ink-navy)]/80 to-[var(--kombats-ink-navy)]" />

      {/* Artwork — no blur, no saturation filter, no zoom. Pure pixels. */}
      <img
        src={avatar.image}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: avatar.focal }}
      />

      {/* Selected marker — crisp 2px gold underline hugging the bottom edge. */}
      {selected && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{ background: accent.primary }}
        />
      )}
    </button>
  );
}

export function OnboardingScreen({
  onComplete,
  onGameInfo,
  onLeaderboard,
}: {
  onComplete: (result: OnboardingResult) => void;
  onGameInfo?: () => void;
  onLeaderboard?: () => void;
}) {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [selectedId, setSelectedId] = useState<AvatarId>(DEFAULT_AVATAR_ID);

  const selected = useMemo(
    () => AVATARS.find(a => a.id === selectedId) ?? AVATARS[0],
    [selectedId],
  );

  const validation = validateName(name);
  const showError = touched && !validation.ok;
  const canSubmit = validation.ok;

  const handleSubmit = () => {
    if (!validation.ok) {
      setTouched(true);
      return;
    }
    onComplete({ name: validation.trimmed, avatar: selected });
  };

  return (
    <GameShell header={<LobbyHeader onGameInfo={onGameInfo} onLeaderboard={onLeaderboard} />}>
      {/* Background — same moonlit scene as the rest of the app */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--kombats-ink-navy)]/40 to-[var(--kombats-ink-navy)]/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--kombats-ink-navy)]/40 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 h-full">
        {/* Selected fighter preview — anchored like other screens */}
        <div className={`${FIGHTER_COLUMN_LEFT_CLASSNAME} pointer-events-none`}>
          <AnimatePresence mode="wait">
            <motion.img
              key={selected.id}
              src={selected.image}
              alt={selected.name}
              className={FIGHTER_IMAGE_CLASSNAME}
              style={{
                filter: FIGHTER_IMAGE_BASE_FILTER,
                marginBottom: FIGHTER_IMAGE_MARGIN_BOTTOM,
              }}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              draggable={false}
            />
          </AnimatePresence>
        </div>

        {/* Center forge card */}
        <div
          className="absolute top-1/2 left-1/2 w-[540px] max-w-[calc(100vw-2rem)]"
          style={{ transform: 'translate(-42%, -52%)' }}
        >
          <OnboardingCard
            eyebrow="Welcome"
            title="Choose Your Look"
            subtitle="Pick a display name and the avatar that will represent you."
          >
            {/* Avatar selection */}
            <div>
              <div className="mb-2 text-center">
                <Label tone="neutral">Avatar</Label>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map(a => (
                  <AvatarCard
                    key={a.id}
                    avatar={a}
                    selected={a.id === selectedId}
                    onSelect={() => setSelectedId(a.id)}
                  />
                ))}
              </div>
            </div>

            {/* Display name */}
            <TextInput
              id="onboarding-name"
              label="Display Name"
              value={name}
              onChange={setName}
              onBlur={() => setTouched(true)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="e.g. Kazumi"
              error={showError ? validation.error : undefined}
              helperLeft={`${NAME_MIN}–${NAME_MAX} characters`}
              helperRight={`${validation.trimmed.length}/${NAME_MAX}`}
              maxLength={NAME_MAX}
              autoComplete="off"
              spellCheck={false}
            />

            {/* CTA */}
            <div className="flex items-center justify-center">
              <Button
                variant="primary"
                size="lg"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                Continue
              </Button>
            </div>
          </OnboardingCard>
        </div>
      </div>
    </GameShell>
  );
}

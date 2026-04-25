import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { gameKeys } from '@/app/query-client';
import * as characterApi from '@/transport/http/endpoints/character';
import { usePlayerStore } from '@/modules/player/store';
import {
  DEFAULT_AVATAR_ID,
  SELECTABLE_AVATARS,
  getAvatarAsset,
  type AvatarId,
} from '@/modules/player/avatar-assets';
import { Button } from '@/ui/components/Button';
import { TextInput } from '@/ui/components/TextInput';
import { OnboardingCard } from '../components/OnboardingCard';
import { NAME_MIN, NAME_MAX } from '../components/NameInput';
import { isApiError } from '@/types/api';

const NAME_PATTERN = /^[A-Za-z0-9_\- ]+$/;

function validateName(raw: string): { ok: boolean; error?: string; trimmed: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, trimmed, error: 'Enter a display name' };
  if (trimmed.length < NAME_MIN) return { ok: false, trimmed, error: `At least ${NAME_MIN} characters` };
  if (trimmed.length > NAME_MAX) return { ok: false, trimmed, error: `At most ${NAME_MAX} characters` };
  if (!NAME_PATTERN.test(trimmed)) return { ok: false, trimmed, error: 'Letters, numbers, space, - and _ only' };
  return { ok: true, trimmed };
}

interface SubmitArgs {
  name: string;
  avatarId: AvatarId;
  expectedRevision: number;
}

async function submitOnboarding({ name, avatarId, expectedRevision }: SubmitArgs) {
  await characterApi.setName({ name });
  // setName increments the character revision by one server-side; the next
  // mutation must pass that incremented value so the avatar write is
  // optimistic-concurrency-safe.
  const avatarResponse = await characterApi.changeAvatar({
    expectedRevision: expectedRevision + 1,
    avatarId,
  });
  return { name, avatarResponse };
}

// Oversized fighter sprite drop shadow — matches the hero anchor used on the
// lobby + searching screens (DESIGN_REFERENCE.md §3.16).
const fighterSpriteFilter = 'drop-shadow(0 25px 50px rgba(var(--rgb-black), 0.9))';

export function NameSelectionScreen() {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const [serverErrorOverride, setServerErrorOverride] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const updateCharacter = usePlayerStore((s) => s.updateCharacter);
  const character = usePlayerStore((s) => s.character);

  const selectedAvatar =
    SELECTABLE_AVATARS.find((a) => a.id === selectedAvatarId) ?? SELECTABLE_AVATARS[0];

  const mutation = useMutation({
    mutationFn: submitOnboarding,
    onSuccess: (result) => {
      if (character) {
        updateCharacter({
          ...character,
          name: result.name,
          onboardingState: 'Named',
          revision: result.avatarResponse.revision,
          avatarId: result.avatarResponse.avatarId,
        });
      }
      queryClient.invalidateQueries({ queryKey: gameKeys.state() });
    },
  });

  const validation = validateName(name);
  const showClientError = touched && !validation.ok;
  const canSubmit = !mutation.isPending && validation.ok;

  function handleSubmit() {
    if (!validation.ok) {
      setTouched(true);
      return;
    }
    if (!character) {
      setServerErrorOverride('Character not loaded.');
      return;
    }
    setServerErrorOverride(null);
    mutation.mutate({
      name: validation.trimmed,
      avatarId: selectedAvatarId,
      expectedRevision: character.revision,
    });
  }

  function deriveServerError(): string | null {
    if (serverErrorOverride) return serverErrorOverride;
    if (!mutation.isError) return null;
    const err = mutation.error;
    if (!isApiError(err)) return 'An unexpected error occurred.';

    if (err.status === 409) return 'This name is already taken.';
    if (err.status === 400) {
      const details = err.error.details;
      if (details) {
        const messages: string[] = [];
        for (const value of Object.values(details)) {
          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'string') messages.push(item);
            }
          }
        }
        if (messages.length > 0) return messages.join('. ');
      }
      return err.error.message;
    }
    return err.error.message;
  }

  const inputError = showClientError ? validation.error : deriveServerError() ?? undefined;

  return (
    <div className="absolute inset-0">
      {/* Fighter sprite anchored to the bottom-left of the viewport — the
          OnboardingShell's scene background (and its overlays) sits behind. */}
      <div className="pointer-events-none absolute bottom-0 left-0 flex flex-col items-center">
        <AnimatePresence mode="wait">
          <motion.img
            key={selectedAvatar.id}
            src={getAvatarAsset(selectedAvatar.id)}
            alt={selectedAvatar.name}
            className="h-[82vh] w-auto object-contain"
            style={{
              filter: fighterSpriteFilter,
              marginBottom: '-17vh',
            }}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            draggable={false}
          />
        </AnimatePresence>
      </div>

      {/* Center forge card. Offset is pulled to the right of dead-center so it
          clears the bottom-left fighter sprite — translate(-42%, -52%). */}
      <div
        className="absolute left-1/2 top-1/2 w-[540px] max-w-[calc(100vw-2rem)]"
        style={{ transform: 'translate(-42%, -52%)' }}
      >
        <div className="rounded-md border-[0.5px] border-border-subtle bg-glass p-8 shadow-[var(--shadow-panel)] backdrop-blur-[20px] sm:p-10">
          <OnboardingCard
            eyebrow="Welcome"
            title="Choose Your Look"
            subtitle="Pick a display name and the avatar that will represent you"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="flex w-full flex-col gap-6"
            >
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
                  Avatar
                </legend>
                <div className="grid grid-cols-5 gap-2">
                  {SELECTABLE_AVATARS.map((avatar) => {
                    const isSelected = avatar.id === selectedAvatarId;
                    return (
                      <AvatarCard
                        key={avatar.id}
                        avatar={avatar}
                        selected={isSelected}
                        disabled={mutation.isPending}
                        onSelect={() => setSelectedAvatarId(avatar.id)}
                      />
                    );
                  })}
                </div>
              </fieldset>

              <TextInput
                label="Display Name"
                placeholder="e.g. Kazumi"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setServerErrorOverride(null);
                  if (mutation.isError) mutation.reset();
                }}
                onBlur={() => setTouched(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                error={inputError}
                disabled={mutation.isPending}
                charCount={{ current: validation.trimmed.length, max: NAME_MAX }}
                maxLength={NAME_MAX}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />

              <div className="flex items-center justify-center">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={mutation.isPending}
                  disabled={!canSubmit}
                >
                  Continue
                </Button>
              </div>
            </form>
          </OnboardingCard>
        </div>
      </div>
    </div>
  );
}

interface AvatarCardProps {
  avatar: (typeof SELECTABLE_AVATARS)[number];
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

/**
 * One tile in the 5-card avatar grid. Selection is conveyed by two
 * non-glowing signals: (1) opacity contrast — non-selected cards are dimmed,
 * the selected card is at full brightness; (2) a sharp gold underline pinned
 * to the bottom edge of the selected card (clipped by the rounded corners,
 * tab-style). No outer shadows or filter glows — pure pixels.
 */
function AvatarCard({ avatar, selected, disabled, onSelect }: AvatarCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Choose avatar ${avatar.name}`}
      disabled={disabled}
      className={clsx(
        'group relative block aspect-[2/3] w-full overflow-hidden rounded-md border-[0.5px] border-border-subtle transition-opacity duration-200 focus:outline-none disabled:cursor-not-allowed',
        selected
          ? 'opacity-100'
          : 'opacity-55 hover:opacity-90 focus-visible:opacity-90',
      )}
    >
      {/* Background fill so any letterbox edges blend into the panel. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-kombats-smoke-gray/70 via-kombats-ink-navy/80 to-kombats-ink-navy"
      />

      <img
        src={getAvatarAsset(avatar.id)}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: avatar.focal }}
      />

      {selected && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] bg-accent-primary"
        />
      )}
    </button>
  );
}

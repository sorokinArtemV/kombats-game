import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gameKeys } from '@/app/query-client';
import * as characterApi from '@/transport/http/endpoints/character';
import { usePlayerStore } from '@/modules/player/store';
import { Button } from '@/ui/components/Button';
import { NameInput, NAME_MIN, NAME_MAX } from '../components/NameInput';
import { isApiError } from '@/types/api';

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name is required';
  if (trimmed.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters`;
  if (trimmed.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters`;
  return null;
}

export function NameSelectionScreen() {
  const [name, setName] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const updateCharacter = usePlayerStore((s) => s.updateCharacter);
  const character = usePlayerStore((s) => s.character);

  const mutation = useMutation({
    mutationFn: () => characterApi.setName({ name: name.trim() }),
    onSuccess: () => {
      // Update character in store with new onboarding state
      if (character) {
        updateCharacter({ ...character, name: name.trim(), onboardingState: 'Named' });
      }
      // Invalidate game state so guards re-evaluate
      queryClient.invalidateQueries({ queryKey: gameKeys.state() });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validateName(name);
    if (validationError) {
      setClientError(validationError);
      return;
    }

    setClientError(null);
    mutation.mutate();
  }

  function getServerError(): string | null {
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

  const displayError = clientError ?? getServerError();

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-bold text-text-primary">Choose Your Name</h2>
        <p className="text-sm text-text-muted">
          This name is permanent and visible to all players.
        </p>
      </header>

      <NameInput
        value={name}
        onChange={(v) => {
          setName(v);
          setClientError(null);
          if (mutation.isError) mutation.reset();
        }}
        error={displayError ?? undefined}
        disabled={mutation.isPending}
      />

      <Button
        type="submit"
        loading={mutation.isPending}
        disabled={name.trim().length === 0}
        className="w-full"
      >
        Set Name
      </Button>
    </form>
  );
}

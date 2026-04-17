import { describe, it, expect } from 'vitest';
import { deriveOutcome } from './battle-end-outcome';

const ME = 'me-identity';
const OPP = 'opp-identity';

describe('deriveOutcome', () => {
  it('returns victory when the current player is the winner', () => {
    const r = deriveOutcome('Normal', ME, ME);
    expect(r.outcome).toBe('victory');
    expect(r.title).toBe('Victory!');
  });

  it('returns defeat when opponent is the winner', () => {
    const r = deriveOutcome('Normal', OPP, ME);
    expect(r.outcome).toBe('defeat');
    expect(r.title).toBe('Defeat');
  });

  it('returns draw for Normal with no winner', () => {
    const r = deriveOutcome('Normal', null, ME);
    expect(r.outcome).toBe('draw');
    expect(r.title).toBe('Draw');
  });

  it('returns draw with DoubleForfeit framing', () => {
    const r = deriveOutcome('DoubleForfeit', null, ME);
    expect(r.outcome).toBe('draw');
    expect(r.subtitle).toMatch(/inactivity/i);
  });

  it('returns draw with Timeout framing', () => {
    const r = deriveOutcome('Timeout', null, ME);
    expect(r.outcome).toBe('draw');
    expect(r.subtitle).toMatch(/timed out/i);
  });

  it('flags SystemError without promising a lobby return', () => {
    const r = deriveOutcome('SystemError', null, ME);
    expect(r.outcome).toBe('error');
    expect(r.title).toBe('Battle Ended');
    expect(r.subtitle).toBe('Battle ended due to a system error.');
    // Phase 7 only hands off to Phase 8; no lobby-return promise here.
    expect(r.subtitle.toLowerCase()).not.toContain('lobby');
  });

  it.each(['Cancelled', 'AdminForced', 'Unknown'] as const)(
    'returns a generic "other" outcome for %s',
    (reason) => {
      const r = deriveOutcome(reason, null, ME);
      expect(r.outcome).toBe('other');
      expect(r.title).toBe('Battle Ended');
      expect(r.subtitle).toMatch(/unexpectedly/i);
    },
  );

  it('falls through to draw when myId is missing and no winner', () => {
    const r = deriveOutcome(null, null, null);
    expect(r.outcome).toBe('draw');
  });

  it('falls through to draw when myId is missing even if a winner exists', () => {
    // Defensive: without myId we cannot claim victory/defeat.
    const r = deriveOutcome(null, OPP, null);
    expect(r.outcome).toBe('draw');
  });
});

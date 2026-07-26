/**
 * Password core — the pure, DB-free part of apps/web/src/lib/password.ts.
 * `verifyUserPassword` needs Prisma + bcrypt and is exercised at the
 * integration/e2e level (see the plan's manual verification steps), not here.
 *
 * `validatePasswordChange` mirrors the >=8 character rule already enforced by
 * `requestSignupOtp`, plus a confirm-password match check for the reset flow.
 * It's pure so both the client form (UX only) and the server action (the
 * actual gate — client validation is never trusted) can share it.
 */
import { describe, it, expect } from 'vitest';
import { validatePasswordChange, PASSWORD_MIN_LENGTH } from '@/lib/password';

describe('validatePasswordChange — pure', () => {
  it('accepts a matching pair at least PASSWORD_MIN_LENGTH long', () => {
    expect(validatePasswordChange('longenough1', 'longenough1')).toBeNull();
  });

  it('rejects a password shorter than PASSWORD_MIN_LENGTH', () => {
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
    expect(validatePasswordChange(short, short)).toBe('too_short');
  });

  it('accepts a password exactly PASSWORD_MIN_LENGTH long', () => {
    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH);
    expect(validatePasswordChange(exact, exact)).toBeNull();
  });

  it('rejects a mismatched confirmation, even if both individually pass length', () => {
    expect(validatePasswordChange('longenough1', 'longenough2')).toBe('mismatch');
  });

  it('reports too_short before mismatch when both are wrong', () => {
    // Order matters: a too-short password should not also need to match to
    // surface the (more actionable) length error first.
    expect(validatePasswordChange('short', 'other')).toBe('too_short');
  });
});

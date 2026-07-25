/**
 * OTP core — the pure, transport-free signup one-time-code logic.
 *
 * Security contract pinned here:
 *  - codes are 6 numeric digits, zero-padded (no short codes leaking entropy)
 *  - the stored code is a bcrypt hash, never plaintext
 *  - an attempt is evaluated against expiry, an attempt-count lockout, and match
 *  - the decision function is PURE (match is passed in) so it needs no bcrypt/DB
 */
import { describe, it, expect } from 'vitest';
import {
  generateOtpCode,
  evaluateOtpAttempt,
  OTP_MAX_ATTEMPTS,
  type SignupOtpRecord,
} from '@/lib/otp';

const base = (over: Partial<SignupOtpRecord> = {}): SignupOtpRecord => ({
  email: 'a@b.co',
  codeHash: 'hash',
  expiresAt: new Date('2026-07-25T00:10:00Z'),
  attempts: 0,
  ...over,
});
const NOW = new Date('2026-07-25T00:05:00Z'); // 5 min before expiry

describe('generateOtpCode', () => {
  it('always returns exactly 6 numeric digits', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe('evaluateOtpAttempt — decision logic (pure)', () => {
  it('returns not_found when there is no pending record', () => {
    expect(evaluateOtpAttempt(null, true, NOW).status).toBe('not_found');
  });

  it('returns expired when now is past expiresAt (even if the code matches)', () => {
    const past = new Date('2026-07-25T00:20:00Z');
    expect(evaluateOtpAttempt(base(), true, past).status).toBe('expired');
  });

  it('returns locked when attempts already reached the max (code ignored)', () => {
    expect(evaluateOtpAttempt(base({ attempts: OTP_MAX_ATTEMPTS }), true, NOW).status).toBe('locked');
  });

  it('returns mismatch when the code does not match (and flags the attempt to count)', () => {
    const out = evaluateOtpAttempt(base({ attempts: 1 }), false, NOW);
    expect(out.status).toBe('mismatch');
    expect(out.remainingAttempts).toBe(OTP_MAX_ATTEMPTS - 2);
  });

  it('returns ok when the code matches, is unexpired, and under the attempt cap', () => {
    expect(evaluateOtpAttempt(base(), true, NOW).status).toBe('ok');
  });

  it('locks (not mismatch) when the final allowed attempt is wrong', () => {
    const out = evaluateOtpAttempt(base({ attempts: OTP_MAX_ATTEMPTS - 1 }), false, NOW);
    expect(out.status).toBe('locked');
    expect(out.remainingAttempts).toBe(0);
  });
});

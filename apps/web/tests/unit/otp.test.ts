/**
 * OTP core — the pure, transport-free one-time-code logic shared by signup,
 * login (2FA), and password reset.
 *
 * Security contract pinned here:
 *  - codes are 6 numeric digits, zero-padded (no short codes leaking entropy)
 *  - the stored code is a bcrypt hash, never plaintext
 *  - an attempt is evaluated against expiry, an attempt-count lockout, and match
 *  - the decision function is PURE (match is passed in) so it needs no bcrypt/DB
 *  - resend is rate-limited by a cooldown + a daily send cap backed by a real
 *    counter (sendCount/windowStartedAt), both pure
 */
import { describe, it, expect } from 'vitest';
import {
  generateOtpCode,
  evaluateOtpAttempt,
  canResendOtp,
  dailySendCapReached,
  nextSendWindow,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_SENDS_PER_DAY,
  OTP_TTL_MINUTES,
  type OtpRecord,
} from '@/lib/otp';

const base = (over: Partial<OtpRecord> = {}): OtpRecord => ({
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

describe('canResendOtp — resend cooldown (pure)', () => {
  it('allows a resend when there is no existing record (first-ever send)', () => {
    expect(canResendOtp(null, NOW)).toBe(true);
  });

  it('refuses a resend inside the cooldown window', () => {
    const updatedAt = new Date(NOW.getTime() - (OTP_RESEND_COOLDOWN_SECONDS - 1) * 1000);
    expect(canResendOtp({ updatedAt }, NOW)).toBe(false);
  });

  it('allows a resend exactly at the cooldown boundary', () => {
    const updatedAt = new Date(NOW.getTime() - OTP_RESEND_COOLDOWN_SECONDS * 1000);
    expect(canResendOtp({ updatedAt }, NOW)).toBe(true);
  });

  it('allows a resend well past the cooldown window', () => {
    const updatedAt = new Date(NOW.getTime() - (OTP_RESEND_COOLDOWN_SECONDS + 3600) * 1000);
    expect(canResendOtp({ updatedAt }, NOW)).toBe(true);
  });
});

describe('dailySendCapReached — daily send cap, backed by a REAL counter (pure)', () => {
  it('never reaches the cap when there is no existing record', () => {
    expect(dailySendCapReached(null, NOW)).toBe(false);
  });

  it('does not reach the cap right after the record was first created (sendCount 1)', () => {
    expect(dailySendCapReached({ sendCount: 1, windowStartedAt: NOW }, NOW)).toBe(false);
  });

  it('does not reach the cap one below the limit', () => {
    const record = { sendCount: OTP_MAX_SENDS_PER_DAY - 1, windowStartedAt: NOW };
    expect(dailySendCapReached(record, NOW)).toBe(false);
  });

  it('reaches the cap once sendCount hits the limit inside the window', () => {
    const record = { sendCount: OTP_MAX_SENDS_PER_DAY, windowStartedAt: NOW };
    expect(dailySendCapReached(record, NOW)).toBe(true);
  });

  it('resets once the rolling 24h window has fully elapsed, even at a high count', () => {
    const windowStartedAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const record = { sendCount: OTP_MAX_SENDS_PER_DAY, windowStartedAt };
    expect(dailySendCapReached(record, NOW)).toBe(false);
  });

  // REGRESSION (defect found in review): an earlier version derived a "send
  // count" from elapsed time / cooldown, which is an upper BOUND, not an
  // actual count — it refused resends once ~9 minutes had passed (elapsed
  // >= (OTP_MAX_SENDS_PER_DAY - 1) * cooldown), well inside the 24h window
  // and squarely inside the OTP_TTL_MINUTES=10 lifetime of a code. That broke
  // the single most common case: a code expires, the user clicks "resend".
  // A record that's genuinely only been sent once must NEVER be capped,
  // no matter how much time has passed within the window.
  it('REGRESSION: a record sent only once 15 minutes ago (past OTP_TTL) still allows a resend', () => {
    expect(OTP_TTL_MINUTES).toBeLessThan(15); // sanity: this really is "after expiry"
    const windowStartedAt = new Date(NOW.getTime() - 15 * 60 * 1000);
    const record = { sendCount: 1, windowStartedAt };
    expect(dailySendCapReached(record, NOW)).toBe(false);
  });
});

describe('nextSendWindow — send-counter transition (pure)', () => {
  it('starts a fresh window (count 1) when there is no existing record', () => {
    expect(nextSendWindow(null, NOW)).toEqual({ sendCount: 1, windowStartedAt: NOW });
  });

  it('increments the count and keeps the window anchor within the same window', () => {
    const windowStartedAt = new Date(NOW.getTime() - 60_000);
    const out = nextSendWindow({ sendCount: 3, windowStartedAt }, NOW);
    expect(out).toEqual({ sendCount: 4, windowStartedAt });
  });

  it('resets to count 1 with a fresh anchor once the 24h window has elapsed', () => {
    const windowStartedAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const out = nextSendWindow({ sendCount: OTP_MAX_SENDS_PER_DAY, windowStartedAt }, NOW);
    expect(out).toEqual({ sendCount: 1, windowStartedAt: NOW });
  });
});

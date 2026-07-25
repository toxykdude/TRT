/**
 * OTP core — pure, transport-free signup one-time-code logic + bcrypt helpers.
 *
 * The DECISION function (`evaluateOtpAttempt`) is pure: it takes a pre-computed
 * `codeMatches` boolean, so it can be unit-tested with no bcrypt or DB. The
 * bcrypt hashing lives in `hashOtp` / `verifyOtp` (async, side-effect-free).
 *
 * Security posture:
 *  - codes are 6 numeric digits from `crypto.randomInt` (uniform, not Math.random)
 *  - only the bcrypt HASH of the code is ever persisted
 *  - a wrong code on the last allowed attempt LOCKS the record (fail-closed)
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

/** How long a code is valid, in minutes. */
export const OTP_TTL_MINUTES = 10;
/** Max wrong attempts before the record is locked and a new code is required. */
export const OTP_MAX_ATTEMPTS = 5;

/** The fields of a pending-signup OTP row the decision logic needs. */
export type SignupOtpRecord = {
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
};

export type OtpDecision = {
  status: 'ok' | 'not_found' | 'expired' | 'locked' | 'mismatch';
  /** Attempts left AFTER counting this one (0 when locked). */
  remainingAttempts: number;
};

/** Generate a uniform 6-digit numeric code, zero-padded. */
export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** bcrypt-hash a code for storage (same cost factor as passwords). */
export function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 12);
}

/** Constant-time compare a submitted code against its stored hash. */
export function verifyOtp(code: string, codeHash: string): Promise<boolean> {
  return bcrypt.compare(code, codeHash);
}

/** Expiry helper: the `expiresAt` for a code minted at `now`. */
export function otpExpiry(now = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
}

/**
 * Decide the outcome of a verification attempt. PURE — `codeMatches` is the
 * result of `verifyOtp` computed by the caller.
 *
 * Order matters: not_found → expired → locked (already at cap) → match check.
 * On a wrong code, if this attempt reaches the cap the record LOCKS.
 */
export function evaluateOtpAttempt(
  record: SignupOtpRecord | null,
  codeMatches: boolean,
  now = new Date(),
): OtpDecision {
  if (!record) return { status: 'not_found', remainingAttempts: 0 };
  if (now.getTime() >= record.expiresAt.getTime()) {
    return { status: 'expired', remainingAttempts: 0 };
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { status: 'locked', remainingAttempts: 0 };
  }
  if (codeMatches) {
    return { status: 'ok', remainingAttempts: OTP_MAX_ATTEMPTS - record.attempts - 1 };
  }
  // Wrong code: this attempt counts.
  const remainingAttempts = OTP_MAX_ATTEMPTS - record.attempts - 1;
  return { status: remainingAttempts <= 0 ? 'locked' : 'mismatch', remainingAttempts };
}

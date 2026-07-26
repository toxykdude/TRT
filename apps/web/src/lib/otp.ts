/**
 * OTP core — pure, transport-free one-time-code logic + bcrypt helpers, shared
 * by signup, login (2FA), and password reset. All three flows persist the same
 * shape of row (email, codeHash, expiresAt, attempts, createdAt, updatedAt) —
 * see `SignupOtp`, `LoginOtp`, `PasswordResetOtp` in packages/db/prisma/schema.prisma.
 *
 * The DECISION function (`evaluateOtpAttempt`) is pure: it takes a pre-computed
 * `codeMatches` boolean, so it can be unit-tested with no bcrypt or DB. The
 * bcrypt hashing lives in `hashOtp` / `verifyOtp` (async, side-effect-free).
 *
 * Security posture:
 *  - codes are 6 numeric digits from `crypto.randomInt` (uniform, not Math.random)
 *  - only the bcrypt HASH of the code is ever persisted
 *  - a wrong code on the last allowed attempt LOCKS the record (fail-closed)
 *  - resend is rate-limited two ways (§8 of the plan): a cooldown between
 *    sends (`canResendOtp`), and a daily send cap backed by a REAL counter
 *    (`sendCount`/`windowStartedAt` on `LoginOtp`/`PasswordResetOtp` — see
 *    `dailySendCapReached` / `nextSendWindow` below). An earlier version of
 *    this tried to derive a count from timestamps alone; that's mathematically
 *    unsound (two timestamps can't yield a count) and blocked the single most
 *    common case — resend after expiry — almost every time. Don't repeat that.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

/** How long a code is valid, in minutes. */
export const OTP_TTL_MINUTES = 10;
/** Max wrong attempts before the record is locked and a new code is required. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap, in seconds, between two sends (initial or resend) for one record. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Max sends (initial + resends) tolerated per record within a rolling 24h window. */
export const OTP_MAX_SENDS_PER_DAY = 10;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** The fields of a pending OTP row the decision logic needs. Shared by the
 *  signup, login, and password-reset OTP tables — the name is generic on
 *  purpose (was `SignupOtpRecord`, signup-only, before login/reset reused it). */
export type OtpRecord = {
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
  record: OtpRecord | null,
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

/**
 * Pure resend-cooldown check. `record` need only carry `updatedAt` — every
 * mint (initial send or resend) is an upsert, so `updatedAt` always reflects
 * the last send. No record means there's nothing to cool down (first send
 * ever for this email).
 */
export function canResendOtp(record: { updatedAt: Date } | null, now = new Date()): boolean {
  if (!record) return true;
  const elapsedMs = now.getTime() - record.updatedAt.getTime();
  return elapsedMs >= OTP_RESEND_COOLDOWN_SECONDS * 1000;
}

/** The send-window fields the daily-cap logic needs: a real count plus the
 *  timestamp the current rolling 24h window started. */
export type SendWindowRecord = { sendCount: number; windowStartedAt: Date };

/**
 * Pure daily send-cap check — true when another send should be REFUSED.
 *
 * Backed by a REAL counter (`sendCount`), not a derived estimate: within the
 * current rolling 24h window (anchored at `windowStartedAt`), refuse once
 * `sendCount` reaches the cap. Once the window has fully elapsed, it resets
 * (never refuse on window age alone).
 */
export function dailySendCapReached(record: SendWindowRecord | null, now = new Date()): boolean {
  if (!record) return false;
  const windowElapsedMs = now.getTime() - record.windowStartedAt.getTime();
  if (windowElapsedMs >= ONE_DAY_MS) return false; // the rolling window has reset
  return record.sendCount >= OTP_MAX_SENDS_PER_DAY;
}

/**
 * Pure decision for what to write to `sendCount`/`windowStartedAt` on a send
 * (initial mint OR resend/re-request) — the counterpart to
 * `dailySendCapReached` above, kept pure/testable per this file's convention.
 *
 * No prior record, or the rolling 24h window has elapsed: start a fresh
 * window (count 1). Otherwise: increment the count, keep the window anchor.
 * Callers should check `dailySendCapReached` BEFORE calling this — this
 * function does not itself enforce the cap, it only computes the next state.
 */
export function nextSendWindow(record: SendWindowRecord | null, now = new Date()): SendWindowRecord {
  if (!record) return { sendCount: 1, windowStartedAt: now };
  const windowElapsedMs = now.getTime() - record.windowStartedAt.getTime();
  if (windowElapsedMs >= ONE_DAY_MS) return { sendCount: 1, windowStartedAt: now };
  return { sendCount: record.sendCount + 1, windowStartedAt: record.windowStartedAt };
}

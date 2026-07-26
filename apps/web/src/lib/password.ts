/**
 * Password core — password verification + change validation, lifted OUT of
 * the old password-only Credentials provider (apps/web/src/lib/auth.ts).
 *
 * `verifyUserPassword` is the exact bcrypt.compare that used to live inside
 * that provider's `authorize()`. It no longer mints a session by itself: a
 * successful call is step 1 of login 2FA (requestLoginOtp in
 * apps/web/src/app/actions.ts), which mints a `LoginOtp` row and requires a
 * second, emailed code before `signIn()` is ever called.
 *
 * `validatePasswordChange` is pure so it is unit-testable and reusable by
 * both the client reset form (UX only) and the server action — the SERVER
 * MUST re-check; client-side validation is never trusted on its own.
 */
import bcrypt from 'bcryptjs';
import { servicePrisma, type User } from '@trt/db';

/** Minimum password length — matches the signup requirement (requestSignupOtp). */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordChangeError = 'too_short' | 'mismatch';

/**
 * Verify an (email, password) pair against the stored bcrypt hash. Returns
 * the full `User` row on success so the caller can proceed to mint a login
 * OTP, or `null` on ANY failure — unknown email, an OAuth-only account with
 * no `passwordHash`, or a wrong password. Callers must turn a `null` into a
 * single generic message ("Invalid email or password") — never reveal which
 * check failed, that would leak account existence.
 */
export async function verifyUserPassword(email: string, password: string): Promise<User | null> {
  const user = await servicePrisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

/**
 * Pure validation for a password change (signup already re-validates length
 * itself; this is for the reset flow, which also needs a confirm-password
 * match). Order matters: report `too_short` before `mismatch` so the more
 * actionable error surfaces first when both are wrong.
 */
export function validatePasswordChange(password: string, confirm: string): PasswordChangeError | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (password !== confirm) return 'mismatch';
  return null;
}

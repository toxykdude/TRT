'use server';

import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { servicePrisma } from '@trt/db';
import { signIn, signOut } from '@/lib/auth';
import { redirect } from '@/i18n/navigation';
import { isPaidPlan } from '@/lib/plans';
import {
  generateOtpCode,
  hashOtp,
  verifyOtp,
  otpExpiry,
  evaluateOtpAttempt,
  canResendOtp,
  dailySendCapReached,
  nextSendWindow,
} from '@/lib/otp';
import { sendOtpEmail } from '@/lib/email';
import { verifyUserPassword, validatePasswordChange } from '@/lib/password';

/**
 * Resolve the localized dashboard path for post-auth redirects. When `plan`
 * is a valid paid plan code (threaded from `?plan=` on the pricing page
 * through registration/login — Phase 4.3), land on the settings page with
 * `startCheckout` set instead, so SubscriptionCard resumes checkout for the
 * plan the user originally chose before creating an account.
 */
async function dashboardRedirect(plan?: string | null) {
  const locale = await getLocale();
  if (plan && isPaidPlan(plan)) {
    return `/${locale}/dashboard/settings?startCheckout=${plan}`;
  }
  return `/${locale}/dashboard`;
}

/** Reads and validates the `plan` field carried through the auth forms. Returns null when absent/invalid. */
function planFromFormData(formData: FormData): string | null {
  const plan = String(formData.get('plan') ?? '');
  return isPaidPlan(plan) ? plan : null;
}

/** Sign-out server action. Imported by client components (sidebar). */
export async function signOutAction() {
  const locale = await getLocale();
  await signOut({ redirectTo: `/${locale}` });
}

/**
 * Google OAuth sign-in. Untouched by the OTP work — Google runs its own 2FA.
 * `plan`, when a valid paid plan code, is bound by the caller
 * (`googleAction.bind(null, plan)`) so the register/login pages can carry a
 * `?plan=` choice through Google sign-in too (Phase 4.3).
 */
export async function googleAction(plan?: string | null) {
  await signIn('google', { redirectTo: await dashboardRedirect(plan) });
}

/** Shape returned to every auth form (signup, verify, login, reset) via useActionState.
 *  `sent` is additive: only `resendLoginOtp` sets it today, to confirm a resend
 *  actually went out (see login-verify-form.tsx) — every other consumer keeps
 *  working untouched since it only ever reads `error`. */
export type AuthActionState = { error?: string; sent?: boolean };

/**
 * Step 1 of signup: validate the account details, mint a 6-digit code, store the
 * PENDING signup (no User row yet), and email the code. On success, redirect to
 * the verify page. The User is created only after the code is verified (step 2),
 * so unverified emails never enter the User table.
 */
export async function requestSignupOtp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password || password.length < 8) {
    return { error: 'Email and an 8+ character password are required.' };
  }

  const existing = await servicePrisma.user.findUnique({ where: { email } });
  if (existing) return { error: 'An account with that email already exists.' };

  const passwordHash = await bcrypt.hash(password, 12);
  const code = generateOtpCode();
  const codeHash = await hashOtp(code);
  const expiresAt = otpExpiry();

  // Upsert the pending signup: re-requesting a code for the same email replaces
  // the previous code and RESETS the attempt counter.
  await servicePrisma.signupOtp.upsert({
    where: { email },
    create: { email, name: name || null, passwordHash, codeHash, expiresAt, attempts: 0 },
    update: { name: name || null, passwordHash, codeHash, expiresAt, attempts: 0 },
  });

  try {
    await sendOtpEmail(email, code, 'signup');
  } catch {
    return { error: 'Could not send the verification email. Please try again.' };
  }

  const locale = await getLocale();
  const plan = planFromFormData(formData);
  const planQuery = plan ? `&plan=${plan}` : '';
  redirect({ href: `/register/verify?email=${encodeURIComponent(email)}${planQuery}`, locale });
  return {}; // unreachable: redirect() throws to navigate.
}

/**
 * Step 2 of signup: verify the emailed code. On success, atomically create the
 * User (emailVerified = now) and delete the pending OTP, then send the user to
 * login. Fail-closed: expired/locked/mismatch all return a message and the wrong
 * attempt is counted; the final allowed wrong attempt LOCKS the record.
 */
export async function verifySignupOtp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const code = String(formData.get('code') ?? '').trim();

  const record = await servicePrisma.signupOtp.findUnique({ where: { email } });
  const matches = record ? await verifyOtp(code, record.codeHash) : false;
  const decision = evaluateOtpAttempt(record, matches, new Date());

  switch (decision.status) {
    case 'not_found':
      return { error: 'No pending signup for this email. Please start again.' };
    case 'expired':
      return { error: 'This code has expired. Request a new one.' };
    case 'locked':
      // Burn the record so a locked code can never be retried.
      await servicePrisma.signupOtp.delete({ where: { email } }).catch(() => {});
      return { error: 'Too many incorrect attempts. Please start again.' };
    case 'mismatch':
      await servicePrisma.signupOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      return { error: `Incorrect code. ${decision.remainingAttempts} attempt(s) left.` };
    case 'ok': {
      // record is non-null when status is 'ok'.
      const pending = record!;
      await servicePrisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            name: pending.name,
            email: pending.email,
            passwordHash: pending.passwordHash,
            role: 'PATIENT',
            emailVerified: new Date(),
          },
        });
        await tx.signupOtp.delete({ where: { email } });
      });
      break;
    }
  }

  // Verified + account created. Send them to login (we never keep the plaintext
  // password, so we can't auto-establish a credentials session here).
  const locale = await getLocale();
  const plan = planFromFormData(formData);
  const planQuery = plan ? `&plan=${plan}` : '';
  redirect({ href: `/login?verified=1${planQuery}`, locale });
  return {}; // unreachable: redirect() throws to navigate.
}

/**
 * Step 1 of login (2FA): verify the password OUT OF BAND of Auth.js. The
 * `login-otp` Credentials provider (apps/web/src/lib/auth.ts) never sees a
 * password, only (email, code) — this is where the password actually gets
 * checked. On success, mint a `LoginOtp` row and email the code; on failure,
 * return a GENERIC message (no "that email doesn't exist" signal) and create
 * nothing. The row's existence downstream is the proof this step passed.
 *
 * Gated by the same cooldown + daily cap as `resendLoginOtp` (§8) — the
 * caller already proved the password here, so an error message is safe (it
 * can't leak account existence the way requestPasswordReset's would).
 */
export async function requestLoginOtp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Invalid email or password.' };
  }

  const user = await verifyUserPassword(email, password);
  if (!user) return { error: 'Invalid email or password.' };

  const now = new Date();
  const existing = await servicePrisma.loginOtp.findUnique({ where: { email } });
  if (!canResendOtp(existing, now)) {
    return { error: 'Please wait before requesting another code.' };
  }
  if (dailySendCapReached(existing, now)) {
    return { error: 'Too many codes requested today. Please try again later.' };
  }

  const code = generateOtpCode();
  const codeHash = await hashOtp(code);
  const expiresAt = otpExpiry(now);
  const window = nextSendWindow(existing, now);

  // Upsert: a second login attempt before the first code is used replaces it
  // and RESETS the attempt counter — same convention as signup. sendCount /
  // windowStartedAt carry the daily-cap counter forward (see otp.ts).
  await servicePrisma.loginOtp.upsert({
    where: { email },
    create: { email, codeHash, expiresAt, attempts: 0, ...window },
    update: { codeHash, expiresAt, attempts: 0, ...window },
  });

  try {
    await sendOtpEmail(email, code, 'login');
  } catch {
    return { error: 'Could not send the sign-in code. Please try again.' };
  }

  const locale = await getLocale();
  const plan = planFromFormData(formData);
  const planQuery = plan ? `&plan=${plan}` : '';
  redirect({ href: `/login/verify?email=${encodeURIComponent(email)}${planQuery}`, locale });
  return {}; // unreachable: redirect() throws to navigate.
}

/**
 * Step 2 of login: exchange the emailed code for a session via the
 * `login-otp` Credentials provider — the ONLY code path that can mint a
 * session (see auth.ts). `signIn()` redirects on success, which Next.js
 * implements by THROWING a control-flow error — that must propagate, not be
 * swallowed. Only an `AuthError` (wrong/expired/locked code) becomes an
 * inline message.
 */
export async function verifyLoginOtp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const code = String(formData.get('code') ?? '').trim();
  const plan = planFromFormData(formData);

  try {
    await signIn('login-otp', { email, code, redirectTo: await dashboardRedirect(plan) });
    return {}; // unreachable when signIn succeeds: it redirects (throws) instead.
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Incorrect or expired code. You may request a new one.' };
    }
    throw error; // Next.js redirect (control flow) or any other error: re-throw.
  }
}

/** Resend the pending login code, gated by the cooldown + daily cap (§8). */
export async function resendLoginOtp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Invalid request.' };

  const now = new Date();
  const record = await servicePrisma.loginOtp.findUnique({ where: { email } });
  if (!canResendOtp(record, now)) {
    return { error: 'Please wait before requesting another code.' };
  }
  if (dailySendCapReached(record, now)) {
    return { error: 'Too many codes requested today. Please try again later.' };
  }

  const code = generateOtpCode();
  const codeHash = await hashOtp(code);
  const expiresAt = otpExpiry(now);
  const window = nextSendWindow(record, now);

  await servicePrisma.loginOtp.upsert({
    where: { email },
    create: { email, codeHash, expiresAt, attempts: 0, ...window },
    update: { codeHash, expiresAt, attempts: 0, ...window },
  });

  try {
    await sendOtpEmail(email, code, 'login');
  } catch {
    return { error: 'Could not send the sign-in code. Please try again.' };
  }

  return { sent: true };
}

/**
 * Request a password-reset code. ENUMERATION-SAFE: redirects to
 * `/reset-password?email=...` UNCONDITIONALLY — for a real account, an
 * unknown account, and a rate-limited resend alike. Every branch also spends
 * one bcrypt-cost hash, so no branch is measurably faster than another — see
 * the discarded hashes below, which exist ONLY for that reason and must not
 * be "cleaned up". Only mints a row and sends an email when the account is
 * real; a delivery failure still redirects the same way.
 *
 * Residual side channel, documented rather than hidden: the real-account
 * success path additionally awaits `sendOtpEmail`, so it is slower than the
 * other branches by roughly one Resend round trip. Closing that would mean
 * sending the mail out of band (a queue/`after()`), which this stack has no
 * infrastructure for. Accepted: it leaks only "this address has an account",
 * to an attacker already willing to do timing analysis.
 *
 * This is the only send endpoint reachable with ZERO credentials, which makes
 * it the most abusable one in the feature — so it's gated by the same
 * cooldown + daily cap as login (§8). CRITICAL: a rate-limit refusal must be
 * INDISTINGUISHABLE from success — same redirect, no error, no distinct
 * timing — since an unknown email is never rate-limited (there's nothing on
 * file to limit) and a distinct response here would itself leak account
 * existence. DO NOT make the final redirect conditional on whether the
 * account exists or the request was refused: every branch below must end at
 * the exact same `redirect()` call, or this reopens the enumeration leak.
 * The neutral "check your email" confirmation lives on the reset-password
 * page (apps/web/src/app/[locale]/(auth)/reset-password/page.tsx), reached
 * identically no matter what happened here.
 */
export async function requestPasswordReset(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const locale = await getLocale();

  if (!email) {
    redirect({ href: '/reset-password', locale });
    return {}; // unreachable: redirect() throws to navigate.
  }

  const user = await servicePrisma.user.findUnique({ where: { email } });
  if (!user) {
    await hashOtp(generateOtpCode()); // comparable work; result discarded
    redirect({ href: `/reset-password?email=${encodeURIComponent(email)}`, locale });
    return {}; // unreachable: redirect() throws to navigate.
  }

  const now = new Date();
  const existing = await servicePrisma.passwordResetOtp.findUnique({ where: { email } });
  if (!canResendOtp(existing, now) || dailySendCapReached(existing, now)) {
    // Refused — but the response MUST look identical to success. See the
    // doc comment above: no error message, no send, same redirect.
    //
    // The hash below is NOT dead code. Only a real account can ever be
    // rate-limited (an unknown email has no row to limit), so returning here
    // early would make the refusal measurably FASTER than the unknown-account
    // path — which spends one bcrypt hash — turning "responded quickly" into
    // an account-exists oracle. Spend the same work to close it.
    await hashOtp(generateOtpCode()); // comparable work; result discarded
    redirect({ href: `/reset-password?email=${encodeURIComponent(email)}`, locale });
    return {}; // unreachable: redirect() throws to navigate.
  }

  const code = generateOtpCode();
  const codeHash = await hashOtp(code);
  const expiresAt = otpExpiry(now);
  const window = nextSendWindow(existing, now);

  await servicePrisma.passwordResetOtp.upsert({
    where: { email },
    create: { email, codeHash, expiresAt, attempts: 0, ...window },
    update: { codeHash, expiresAt, attempts: 0, ...window },
  });

  await sendOtpEmail(email, code, 'password_reset').catch(() => {});

  redirect({ href: `/reset-password?email=${encodeURIComponent(email)}`, locale });
  return {}; // unreachable: redirect() throws to navigate.
}

/**
 * Complete a password reset: re-validate the new password server-side (the
 * client form's check is UX only — never trusted), verify the emailed code,
 * then in ONE transaction update `passwordHash`, stamp `passwordChangedAt`
 * (kills existing sessions elsewhere — see the jwt callback in auth.ts), and
 * delete the reset row.
 */
export async function resetPassword(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const code = String(formData.get('code') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  const validationError = validatePasswordChange(password, confirmPassword);
  if (validationError === 'too_short') {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (validationError === 'mismatch') {
    return { error: 'Passwords do not match.' };
  }

  const record = await servicePrisma.passwordResetOtp.findUnique({ where: { email } });
  const matches = record ? await verifyOtp(code, record.codeHash) : false;
  const decision = evaluateOtpAttempt(record, matches, new Date());

  switch (decision.status) {
    case 'not_found':
      return { error: 'No pending reset for this email. Please start again.' };
    case 'expired':
      return { error: 'This code has expired. Request a new one.' };
    case 'locked':
      await servicePrisma.passwordResetOtp.delete({ where: { email } }).catch(() => {});
      return { error: 'Too many incorrect attempts. Please start again.' };
    case 'mismatch':
      await servicePrisma.passwordResetOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      return { error: `Incorrect code. ${decision.remainingAttempts} attempt(s) left.` };
    case 'ok': {
      const passwordHash = await bcrypt.hash(password, 12);
      const now = new Date();
      await servicePrisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { email },
          data: { passwordHash, passwordChangedAt: now },
        });
        await tx.passwordResetOtp.delete({ where: { email } });
      });
      break;
    }
  }

  const locale = await getLocale();
  redirect({ href: '/login?reset=1', locale });
  return {}; // unreachable: redirect() throws to navigate.
}

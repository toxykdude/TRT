'use server';

import bcrypt from 'bcryptjs';
import { getLocale } from 'next-intl/server';
import { servicePrisma } from '@trt/db';
import { signIn, signOut } from '@/lib/auth';
import { redirect } from '@/i18n/navigation';
import { generateOtpCode, hashOtp, verifyOtp, otpExpiry, evaluateOtpAttempt } from '@/lib/otp';
import { sendOtpEmail } from '@/lib/email';

/** Resolve the localized dashboard path for post-auth redirects. */
async function dashboardRedirect() {
  const locale = await getLocale();
  return `/${locale}/dashboard`;
}

/** Sign-out server action. Imported by client components (sidebar). */
export async function signOutAction() {
  const locale = await getLocale();
  await signOut({ redirectTo: `/${locale}` });
}

/** Credentials login. Accepts the raw FormData from the login form. */
export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  await signIn('credentials', { email, password, redirectTo: await dashboardRedirect() });
}

/** Google OAuth sign-in. */
export async function googleAction() {
  await signIn('google', { redirectTo: await dashboardRedirect() });
}

/** Shape returned to the signup/verify forms via useActionState. */
export type SignupState = { error?: string };

/**
 * Step 1 of signup: validate the account details, mint a 6-digit code, store the
 * PENDING signup (no User row yet), and email the code. On success, redirect to
 * the verify page. The User is created only after the code is verified (step 2),
 * so unverified emails never enter the User table.
 */
export async function requestSignupOtp(_prev: SignupState, formData: FormData): Promise<SignupState> {
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
    await sendOtpEmail(email, code);
  } catch {
    return { error: 'Could not send the verification email. Please try again.' };
  }

  const locale = await getLocale();
  redirect({ href: `/register/verify?email=${encodeURIComponent(email)}`, locale });
  return {}; // unreachable: redirect() throws to navigate.
}

/**
 * Step 2 of signup: verify the emailed code. On success, atomically create the
 * User (emailVerified = now) and delete the pending OTP, then send the user to
 * login. Fail-closed: expired/locked/mismatch all return a message and the wrong
 * attempt is counted; the final allowed wrong attempt LOCKS the record.
 */
export async function verifySignupOtp(_prev: SignupState, formData: FormData): Promise<SignupState> {
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
  redirect({ href: '/login?verified=1', locale });
  return {}; // unreachable: redirect() throws to navigate.
}

'use server';

import bcrypt from 'bcryptjs';
import { getLocale } from 'next-intl/server';
import { servicePrisma } from '@trt/db';
import { signIn, signOut } from '@/lib/auth';

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

/** Account registration (signup). Uses the service client (no RLS context yet). */
export async function registerAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password || password.length < 8) {
    throw new Error('Email and an 8+ character password are required.');
  }

  const existing = await servicePrisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 12);
  await servicePrisma.user.create({
    data: { name, email, passwordHash, role: 'PATIENT' },
  });

  await signIn('credentials', { email, password, redirectTo: await dashboardRedirect() });
}

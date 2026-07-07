'use server';

import bcrypt from 'bcryptjs';
import { servicePrisma } from '@trt/db';
import { signIn, signOut } from '@/lib/auth';

/** Sign-out server action. Imported by client components (sidebar). */
export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}

/** Credentials login. Accepts the raw FormData from the login form. */
export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  await signIn('credentials', { email, password, redirectTo: '/dashboard' });
}

/** Google OAuth sign-in. */
export async function googleAction() {
  await signIn('google', { redirectTo: '/dashboard' });
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

  await signIn('credentials', { email, password, redirectTo: '/dashboard' });
}

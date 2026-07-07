'use server';

import { signOut } from '@/lib/auth';

/** Sign-out server action. Imported by client components (sidebar). */
export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}

'use server';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { servicePrisma } from '@trt/db';
import { auth, signIn } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  async function registerAction(formData: FormData) {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const password = String(formData.get('password') ?? '');

    if (!email || !password || password.length < 8) {
      throw new Error('Email and an 8+ character password are required.');
    }

    const existing = await servicePrisma.user.findUnique({ where: { email } });
    if (existing) throw new Error('An account with that email already exists.');

    // Signup uses the service client (no RLS context yet — there's no session).
    const passwordHash = await bcrypt.hash(password, 12);
    await servicePrisma.user.create({
      data: { name, email, passwordHash, role: 'PATIENT' },
    });

    await signIn('credentials', { email, password, redirectTo: '/dashboard' });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Start organizing your lab history.</p>
      </div>

      <form action={registerAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" type="text" autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { requestSignupOtp, type AuthActionState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/password-input';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {label}
    </Button>
  );
}

/**
 * Step 1 signup form: collects account details and requests an email OTP.
 * `plan` (from `?plan=` on the pricing page — Phase 4.3) is carried in a
 * hidden field through every step of registration/login so a paid-plan
 * choice made before signing up resumes checkout right after login.
 */
export function SignupForm({ plan }: { plan?: string | null }) {
  const t = useTranslations('Auth.Register');
  const [state, action] = useActionState<AuthActionState, FormData>(requestSignupOtp, {});

  return (
    <form action={action} className="space-y-4">
      {plan && <input type="hidden" name="plan" value={plan} />}
      <div className="space-y-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input id="name" name="name" type="text" autoComplete="name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <PasswordInput
        id="password"
        name="password"
        label={t('password')}
        autoComplete="new-password"
        required
        minLength={8}
        hint={t('passwordHint')}
      />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Submit label={t('submit')} />
    </form>
  );
}

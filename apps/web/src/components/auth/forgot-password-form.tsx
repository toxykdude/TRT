'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { requestPasswordReset, type AuthActionState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {label}
    </Button>
  );
}

/**
 * Requests a password-reset code. `requestPasswordReset` is passed straight
 * into `useActionState` — no client-side wrapper — so this form still works
 * without JavaScript, same as every other auth form here.
 *
 * ENUMERATION-SAFE: `requestPasswordReset` ALWAYS redirects to
 * `/reset-password?email=...` — for a real account, an unknown account, and
 * a rate-limited resend alike — so this component never renders a distinct
 * success or failure state itself. The neutral "check your email"
 * confirmation lives on the reset-password page, reached identically no
 * matter what happened here.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('Auth.Forgot');
  const [state, action] = useActionState<AuthActionState, FormData>(requestPasswordReset, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Submit label={t('submit')} />
    </form>
  );
}

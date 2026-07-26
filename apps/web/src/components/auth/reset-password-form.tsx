'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { resetPassword, type AuthActionState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/password-input';

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      {label}
    </Button>
  );
}

/**
 * Completes a password reset: code + new password + CONFIRM password. This
 * is the one step in the whole feature that gets double password entry — a
 * typo here would silently lock the user out, unlike login (which gets the
 * show/hide toggle instead, see password-input.tsx).
 *
 * The mismatch check below is UX only, so the field never fights the
 * password manager: `resetPassword` re-validates both length and match
 * server-side via `validatePasswordChange` regardless of what this component
 * does — that is the check that actually matters.
 */
export function ResetPasswordForm({ email }: { email: string }) {
  const t = useTranslations('Auth.Reset');
  const [state, action] = useActionState<AuthActionState, FormData>(resetPassword, {});
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <div className="space-y-2">
        <Label htmlFor="code">{t('code')}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
        />
      </div>
      <PasswordInput
        id="password"
        name="password"
        label={t('newPassword')}
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={setPassword}
      />
      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label={t('confirmPassword')}
        autoComplete="new-password"
        required
        minLength={8}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      {mismatch && (
        <p role="alert" className="text-sm text-destructive">
          {t('mismatch')}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Submit label={t('submit')} disabled={mismatch} />
    </form>
  );
}

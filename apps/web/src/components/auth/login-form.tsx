'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { requestLoginOtp, type AuthActionState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/password-input';
import { Link } from '@/i18n/navigation';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {label}
    </Button>
  );
}

/**
 * Step 1 of login (2FA): email + password. `requestLoginOtp` verifies the
 * password out of band of Auth.js and, on success, REDIRECTS to
 * `/login/verify?email=...` — this component never sees a session get
 * created. On failure it returns a generic "Invalid email or password", the
 * same message whether the email or the password was wrong.
 */
export function LoginForm() {
  const t = useTranslations('Auth.Login');
  const [state, action] = useActionState<AuthActionState, FormData>(requestLoginOtp, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <PasswordInput
        id="password"
        name="password"
        label={t('password')}
        autoComplete="current-password"
        required
      />
      <p className="text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          {t('forgotPassword')}
        </Link>
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Submit label={t('submit')} />
    </form>
  );
}

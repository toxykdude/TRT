'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { verifySignupOtp, type AuthActionState } from '@/app/actions';
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

/** Step 2 signup form: verifies the emailed 6-digit code. `email` is carried in a
 *  hidden field from the request step (query param) — it's an identifier, not a
 *  secret, so this is safe. `plan` (Phase 4.3) is carried the same way. */
export function VerifyForm({ email, plan }: { email: string; plan?: string | null }) {
  const t = useTranslations('Auth.Verify');
  const [state, action] = useActionState<AuthActionState, FormData>(verifySignupOtp, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      {plan && <input type="hidden" name="plan" value={plan} />}
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
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Submit label={t('submit')} />
    </form>
  );
}

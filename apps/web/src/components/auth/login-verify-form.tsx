'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { verifyLoginOtp, resendLoginOtp, type AuthActionState } from '@/app/actions';
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

function ResendSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" className="w-full" disabled={pending}>
      {label}
    </Button>
  );
}

/**
 * Step 2 of login (2FA): verify the emailed 6-digit code. `verifyLoginOtp`
 * exchanges it for a session via the `login-otp` Credentials provider — the
 * ONLY code path that mints a session. `email` is carried in a hidden field
 * from the request step (query param) — it's an identifier, not a secret.
 *
 * Includes a resend form, gated server-side by the cooldown + daily cap
 * (`canResendOtp` / `dailySendCapReached`, §8 of the plan) — `resendLoginOtp`
 * returns a real inline error when the caller is rate-limited.
 */
export function LoginVerifyForm({ email, plan }: { email: string; plan?: string | null }) {
  const t = useTranslations('Auth.LoginVerify');
  const [state, action] = useActionState<AuthActionState, FormData>(verifyLoginOtp, {});
  const [resendState, resendAction] = useActionState<AuthActionState, FormData>(resendLoginOtp, {});

  return (
    <div className="space-y-4">
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

      <form action={resendAction} className="space-y-2">
        <input type="hidden" name="email" value={email} />
        {resendState.sent && (
          <p
            role="status"
            className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
          >
            {t('resent')}
          </p>
        )}
        {resendState.error && (
          <p role="alert" className="text-sm text-destructive">
            {resendState.error}
          </p>
        )}
        <ResendSubmit label={t('resend')} />
      </form>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { PaidPlanCode } from '@/lib/plans';

/**
 * Starts a Stripe subscription Checkout for `planCode` (Phase 4.1).
 *
 * POSTs to /api/billing/stripe/checkout, then does a full-page redirect
 * (`window.location.href = url`) to the Stripe-hosted Checkout page — the
 * client NEVER sees a Stripe key or client secret, only the returned `url`.
 *
 * `autoStart` fires the same flow on mount instead of waiting for a click —
 * used to resume checkout right after registration (Phase 4.3), where the
 * user already "clicked" on the pricing page before creating an account.
 */
export function CheckoutButton({
  planCode,
  label,
  autoStart = false,
  ...buttonProps
}: {
  planCode: PaidPlanCode;
  label: string;
  autoStart?: boolean;
} & Omit<ButtonProps, 'onClick' | 'disabled'>) {
  const t = useTranslations('Pricing');
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function startCheckout() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch('/api/billing/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planCode, locale }),
      });
      const json = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !json?.url) {
        setError(true);
        setPending(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError(true);
      setPending(false);
    }
  }

  useEffect(() => {
    if (autoStart) void startCheckout();
    // Only ever auto-starts once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <Button {...buttonProps} type="button" disabled={pending} onClick={() => void startCheckout()}>
        {pending ? t('checkoutPending') : label}
      </Button>
      {error && (
        <p role="alert" className="text-center text-xs text-destructive">
          {t('checkoutError')}
        </p>
      )}
    </div>
  );
}

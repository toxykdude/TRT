'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { PlanCode } from '@/lib/plans';

export type SubscriptionCardProps = {
  planCode: PlanCode;
  planName: string;
  provider: 'WOMPI' | 'PAYPAL' | 'STRIPE' | 'MANUAL' | null;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | null;
  /** ISO string — Dates aren't serializable across the server/client boundary. */
  currentPeriodEndIso: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
};

/**
 * Dashboard settings billing card (Phase 4.4): plan, renewal date, status,
 * a cancel-pending banner, and — provider-dependent — either "Manage
 * billing" (Stripe → hosted Portal) or "Cancel subscription" (Wompi/PayPal/
 * MANUAL → the existing local-flag endpoint). Stripe subscriptions are never
 * cancelled directly here (docs/STRIPE_SUBSCRIPTIONS_PLAN.md §3.6) — only
 * through the Portal, which also covers payment-method updates and invoices.
 */
export function SubscriptionCard({
  planCode,
  planName,
  provider,
  status,
  currentPeriodEndIso,
  cancelAtPeriodEnd,
  hasStripeCustomer,
}: SubscriptionCardProps) {
  const t = useTranslations('Dashboard.Billing');
  const format = useFormatter();
  const [pending, setPending] = useState<'portal' | 'cancel' | null>(null);
  const [error, setError] = useState(false);

  const isPaid = planCode !== 'FREE';
  const periodEnd = currentPeriodEndIso ? new Date(currentPeriodEndIso) : null;

  async function manageBilling() {
    setPending('portal');
    setError(false);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const json = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !json?.url) {
        setError(true);
        setPending(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError(true);
      setPending(null);
    }
  }

  async function cancelSubscription() {
    setPending('cancel');
    setError(false);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      if (!res.ok) {
        setError(true);
        setPending(null);
        return;
      }
      window.location.reload();
    } catch {
      setError(true);
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{isPaid ? t('currentPlan', { plan: planName }) : t('freePlan')}</CardDescription>
      </CardHeader>

      {isPaid && (
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {status && <p>{t('statusLabel', { status: t(`status.${status}`) })}</p>}
          {periodEnd && !cancelAtPeriodEnd && (
            <p>{t('renewsOn', { date: format.dateTime(periodEnd, { dateStyle: 'long' }) })}</p>
          )}
          {cancelAtPeriodEnd && periodEnd && (
            <p role="status" className="font-medium text-amber-600 dark:text-amber-400">
              {t('cancelPending', { date: format.dateTime(periodEnd, { dateStyle: 'long' }) })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {t('actionError')}
            </p>
          )}
        </CardContent>
      )}

      {isPaid && (provider === 'STRIPE' ? hasStripeCustomer : !cancelAtPeriodEnd) && (
        <CardFooter>
          {provider === 'STRIPE' ? (
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void manageBilling()}>
              {pending === 'portal' ? t('redirecting') : t('manageBilling')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => void cancelSubscription()}
            >
              {pending === 'cancel' ? t('canceling') : t('cancelSubscription')}
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

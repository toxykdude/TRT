import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { ThemeToggle } from '@/components/theme-toggle';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';
import { SubscriptionCard } from '@/components/billing/subscription-card';
import { CheckoutButton } from '@/components/billing/checkout-button';
import { PLANS, isPaidPlan, type PlanCode } from '@/lib/plans';
import { getEffectivePlanCode } from '@/lib/quota';

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ billing?: string; startCheckout?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Settings');
  const tBilling = await getTranslations('Dashboard.Billing');
  const { billing, startCheckout } = await searchParams;

  const session = await auth();
  const ownerId = session!.user.id;
  const db = prismaFor(ownerId);
  // ownerId is the real tenancy gate (prismaFor is BYPASSRLS): count only THIS
  // user's audit rows, never every tenant's. AuditLog scopes by `userId`.
  const [auditCount, planCode, subscription, user] = await Promise.all([
    db.auditLog.count({ where: { userId: ownerId } }),
    getEffectivePlanCode(ownerId),
    db.subscription.findFirst({
      where: { userId: ownerId, status: 'ACTIVE' },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { provider: true, planCode: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    db.user.findUnique({ where: { id: ownerId }, select: { stripeCustomerId: true } }),
  ]);

  const displayPlanCode: PlanCode = isPaidPlan(subscription?.planCode ?? '')
    ? (subscription!.planCode as PlanCode)
    : planCode;
  const planName = await getTranslations({ locale, namespace: 'Pricing.plans' }).then((tp) =>
    tp(`${PLANS[displayPlanCode].nameKey}.name`),
  );

  // Phase 4.3: resume checkout right after registration/login for a plan
  // chosen on the pricing page before the account existed. Only offered when
  // there is no active paid subscription already (avoid double-charging).
  const resumePlanCode =
    startCheckout && isPaidPlan(startCheckout) && !subscription ? startCheckout : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {billing === 'success' && (
        <p
          role="status"
          className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
        >
          {tBilling('checkoutSuccess')}
        </p>
      )}
      {billing === 'canceled' && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {tBilling('checkoutCanceled')}
        </p>
      )}
      {resumePlanCode && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <p className="mb-2">{tBilling('resumingCheckout')}</p>
          <CheckoutButton planCode={resumePlanCode} label={tBilling('resumingCheckout')} autoStart size="sm" />
        </div>
      )}

      <SafetyBanner />

      <SubscriptionCard
        planCode={displayPlanCode}
        planName={planName}
        provider={subscription?.provider ?? null}
        status={subscription?.status ?? null}
        currentPeriodEndIso={subscription?.currentPeriodEnd?.toISOString() ?? null}
        cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
        hasStripeCustomer={Boolean(user?.stripeCustomerId)}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('appearanceTitle')}</CardTitle>
          <CardDescription>{t('appearanceDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('accountTitle')}</CardTitle>
          <CardDescription>
            {t('accountDesc', { email: session?.user.email ?? '', count: auditCount })}
          </CardDescription>
        </CardHeader>
      </Card>

      <PlaceholderCard
        title={t('exportTitle')}
        what={t('exportWhat')}
        next={t('exportNext')}
      />
    </div>
  );
}

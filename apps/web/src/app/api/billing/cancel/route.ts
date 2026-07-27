import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';
import { getStripe, stripeConfigured } from '@/lib/billing/stripe';

/**
 * Cancel the caller's active subscription (P1.b remainder).
 *
 * Sets `cancelAtPeriodEnd = true`: access continues until `currentPeriodEnd`,
 * after which the plan downgrades to Free (data is retained). Auth-guarded to
 * the subscription owner; one AuditLog row records the cancellation.
 *
 * Stripe subscriptions are cancelled through the hosted Customer Portal, not
 * this endpoint (docs/STRIPE_SUBSCRIPTIONS_PLAN.md §3.6) — the Portal also
 * covers payment-method updates, plan changes, and invoice history for free.
 * `cancelAtPeriodEnd` on a Stripe-provider row is still written, but only as a
 * MIRROR driven by `customer.subscription.updated` — never set directly here.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sub = await prisma.subscription.findFirst({
    where: { userId: session.user.id, status: 'ACTIVE' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { id: true, planCode: true, provider: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  if (!sub) return NextResponse.json({ error: 'no_active_subscription' }, { status: 404 });

  if (sub.provider === 'STRIPE') {
    if (!stripeConfigured()) {
      return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true },
    });
    let portalUrl: string | null = null;
    if (user?.stripeCustomerId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '';
      const portalSession = await getStripe().billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${appUrl}/dashboard/settings`,
      });
      portalUrl = portalSession.url;
    }
    return NextResponse.json({ error: 'use_portal', portalUrl }, { status: 409 });
  }

  if (sub.cancelAtPeriodEnd) {
    return NextResponse.json({ ok: true, alreadyCanceled: true, currentPeriodEnd: sub.currentPeriodEnd });
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'admin_action',
      entity: 'subscriptions',
      entityId: sub.id,
      detail: { op: 'cancel_at_period_end', planCode: sub.planCode, currentPeriodEnd: sub.currentPeriodEnd },
    },
  });

  return NextResponse.json({ ok: true, currentPeriodEnd: sub.currentPeriodEnd });
}

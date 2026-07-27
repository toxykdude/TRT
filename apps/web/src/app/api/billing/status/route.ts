import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';
import { checkQuota, getEffectivePlanCode } from '@/lib/quota';

/**
 * Current plan + usage snapshot for the session user (drives dashboard
 * billing UI and upgrade CTAs).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = prisma;
  const planCode = await getEffectivePlanCode(session.user.id);
  const [uploadQuota, reportQuota, subscription, user] = await Promise.all([
    checkQuota(session.user.id, 'UPLOAD'),
    checkQuota(session.user.id, 'REPORT'),
    db.subscription.findFirst({
      where: { userId: session.user.id, status: 'ACTIVE' },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { provider: true, planCode: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    db.user.findUnique({ where: { id: session.user.id }, select: { stripeCustomerId: true } }),
  ]);

  return NextResponse.json({
    plan: planCode,
    subscription,
    // Lets the UI decide whether to show "Manage billing" (→ Stripe Portal)
    // without leaking the Stripe customer id itself.
    hasStripeCustomer: Boolean(user?.stripeCustomerId),
    usage: {
      uploads: { used: uploadQuota.used, limit: uploadQuota.limit, period: uploadQuota.period },
      reports: { used: reportQuota.used, limit: reportQuota.limit, period: reportQuota.period },
    },
  });
}

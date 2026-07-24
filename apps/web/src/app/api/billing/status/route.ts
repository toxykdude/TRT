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
  const [uploadQuota, reportQuota, subscription] = await Promise.all([
    checkQuota(session.user.id, 'UPLOAD'),
    checkQuota(session.user.id, 'REPORT'),
    db.subscription.findFirst({
      where: { userId: session.user.id, status: 'ACTIVE' },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { provider: true, planCode: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
  ]);

  return NextResponse.json({
    plan: planCode,
    subscription,
    usage: {
      uploads: { used: uploadQuota.used, limit: uploadQuota.limit, period: uploadQuota.period },
      reports: { used: reportQuota.used, limit: reportQuota.limit, period: reportQuota.period },
    },
  });
}

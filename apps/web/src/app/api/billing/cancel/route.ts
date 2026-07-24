import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';

/**
 * Cancel the caller's active subscription (P1.b remainder).
 *
 * Sets `cancelAtPeriodEnd = true`: access continues until `currentPeriodEnd`,
 * after which the plan downgrades to Free (data is retained). Auth-guarded to
 * the subscription owner; one AuditLog row records the cancellation.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sub = await prisma.subscription.findFirst({
    where: { userId: session.user.id, status: 'ACTIVE' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { id: true, planCode: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  if (!sub) return NextResponse.json({ error: 'no_active_subscription' }, { status: 404 });
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

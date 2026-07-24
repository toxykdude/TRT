import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';
import { isPaidPlan, type PaidPlanCode } from '@/lib/plans';
import { captureOrder, paypalConfigured } from '@/lib/billing/paypal';
import { activatePlan } from '@/lib/billing/activate';

/**
 * Capture an approved PayPal order (P1.c — PayPal variant). Server-verified:
 * we only trust the capture response from PayPal's API, never client claims.
 * Idempotent on the Payment row (reference = order id, unique).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'paypal_not_configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { orderId?: string } | null;
  const orderId = body?.orderId ?? '';
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  const payment = await prisma.payment.findUnique({ where: { reference: orderId } });
  if (!payment || payment.userId !== session.user.id) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }

  // Idempotency: already activated → ack without double-extending.
  if (payment.status === 'APPROVED') {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  try {
    const capture = await captureOrder(orderId);
    if (capture.status !== 'COMPLETED') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'ERROR', raw: capture as unknown as object },
      });
      return NextResponse.json({ error: 'capture_incomplete', status: capture.status }, { status: 402 });
    }

    const captureId =
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? capture.id ?? null;

    // Race-safe activation: atomically flip PENDING → APPROVED. Only the capture
    // that wins this conditional update proceeds to activate; a concurrent
    // capture sees count === 0 and idempotently acks without double-extending.
    const flip = await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'APPROVED', externalId: captureId, raw: capture as unknown as object },
    });
    if (flip.count === 0) {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }

    if (!isPaidPlan(payment.planCode)) {
      return NextResponse.json({ error: 'invalid_plan_on_payment' }, { status: 400 });
    }
    const { currentPeriodEnd } = await activatePlan({
      userId: payment.userId,
      planCode: payment.planCode as PaidPlanCode,
      provider: 'PAYPAL',
      externalRef: captureId,
    });

    return NextResponse.json({ ok: true, plan: payment.planCode, currentPeriodEnd });
  } catch (e) {
    return NextResponse.json(
      { error: 'paypal_error', message: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}

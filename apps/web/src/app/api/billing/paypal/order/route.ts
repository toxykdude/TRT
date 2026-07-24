import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';
import { PLANS, isPaidPlan } from '@/lib/plans';
import { createOrder, paypalConfigured } from '@/lib/billing/paypal';
import { buildReference } from '@/lib/billing/wompi';

/**
 * Create a PayPal order for a plan (P1.b — PayPal variant). The client JS SDK
 * calls this from its createOrder callback; the returned order id is what the
 * buyer approves in the PayPal popup. A PENDING Payment row keyed by the
 * order id is recorded; the capture route flips it.
 *
 * The purchase_units reference_id is built unique per checkout (timestamp +
 * random) via the shared buildReference helper — no PHI — so re-checkouts never
 * collide and the reference_id is unambiguous in webhook payloads.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'paypal_not_configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { planCode?: string } | null;
  const planCode = body?.planCode ?? '';
  if (!isPaidPlan(planCode)) {
    return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  }
  const plan = PLANS[planCode];
  const amountUsd = (plan.priceUsdCents / 100).toFixed(2);

  try {
    // Unique, PHI-free reference_id echoed by PayPal in capture/webhook payloads.
    const referenceId = buildReference(session.user.id, planCode);
    const order = await createOrder({
      reference: referenceId,
      amountUsd,
      description: `TRT Insights — ${planCode} subscription period`,
    });

    await prisma.payment.create({
      data: {
        userId: session.user.id,
        provider: 'PAYPAL',
        reference: order.id,
        amountInCents: plan.priceUsdCents,
        currency: 'USD',
        status: 'PENDING',
        planCode,
      },
    });

    return NextResponse.json({ orderId: order.id });
  } catch (e) {
    return NextResponse.json(
      { error: 'paypal_error', message: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}

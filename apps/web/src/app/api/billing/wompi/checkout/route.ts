import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';
import { PLANS, isPaidPlan } from '@/lib/plans';
import {
  buildReference,
  computeIntegritySignature,
  wompiConfigured,
  wompiEnv,
} from '@/lib/billing/wompi';

/**
 * Create signed Wompi widget params for a plan (P1.b — Wompi variant).
 *
 * Returns everything the official widget needs to render its pay button:
 * public key, unique reference, amount in cents, currency, and the
 * server-side integrity signature (the integrity secret never leaves the
 * server). A PENDING Payment row is recorded; the webhook flips it.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!wompiConfigured()) {
    return NextResponse.json({ error: 'wompi_not_configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { planCode?: string } | null;
  const planCode = body?.planCode ?? '';
  if (!isPaidPlan(planCode)) {
    return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  }
  const plan = PLANS[planCode];

  const env = wompiEnv();
  const reference = buildReference(session.user.id, planCode);
  const amountInCents = plan.priceCopCents;
  const currency = 'COP';
  const signature = computeIntegritySignature(
    { reference, amountInCents, currency },
    env.integritySecret,
  );

  await prisma.payment.create({
    data: {
      userId: session.user.id,
      provider: 'WOMPI',
      reference,
      amountInCents,
      currency,
      status: 'PENDING',
      planCode,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '';

  return NextResponse.json({
    publicKey: env.publicKey,
    reference,
    amountInCents,
    currency,
    signature,
    redirectUrl: `${appUrl}/dashboard/settings?billing=success&ref=${reference}`,
    sandbox: env.sandbox,
  });
}

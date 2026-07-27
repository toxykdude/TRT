import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';
import { isPaidPlan } from '@/lib/plans';
import { getStripe, priceIdForPlan, stripeConfigured } from '@/lib/billing/stripe';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** 8 random lowercase letters for the Checkout Session's integration_identifier. */
function randomIdentifierSuffix(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => LETTERS[b % LETTERS.length]).join('');
}

/**
 * Create a Stripe Checkout Session for a paid plan (Phase 3.1).
 *
 * auth → isPaidPlan → find-or-create the caller's Stripe Customer (persisting
 * `stripeCustomerId` on User the first time) → create a `mode: 'subscription'`
 * Checkout Session → `{ url }`. The client only ever receives that URL and
 * redirects the browser to it (`window.location.href = url`) — no Stripe key
 * or client secret is ever sent.
 *
 * `metadata.planCode` on both the session and the subscription-to-be-created
 * is how the webhook (a pure function with no DB access) learns which plan a
 * `checkout.session.completed` event is for, without an extra Stripe API call.
 *
 * Hard rules (docs/STRIPE_SUBSCRIPTIONS_PLAN.md §3, Phase 3):
 *   - NEVER pass `payment_method_types` — omitting it lets Stripe rank the
 *     highest-converting eligible methods per customer from the Dashboard.
 *   - NEVER enable `automatic_tax` — Stripe collects zero tax and returns no
 *     error until a registration exists; silent under-collection.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { planCode?: string; locale?: string } | null;
  const planCode = body?.planCode ?? '';
  if (!isPaidPlan(planCode)) {
    return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  }
  // Matches apps/web/src/i18n/routing.ts: locales ['es', 'en'], default 'es'.
  const locale = body?.locale === 'en' ? 'en' : 'es';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '';

  try {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true, email: true },
    });

    let stripeCustomerId = user?.stripeCustomerId ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user?.email ?? session.user.email ?? undefined,
        metadata: { userId: session.user.id },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({ where: { id: session.user.id }, data: { stripeCustomerId } });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      client_reference_id: session.user.id,
      line_items: [{ price: priceIdForPlan(planCode), quantity: 1 }],
      // NO payment_method_types — see the doc comment above.
      integration_identifier: `trt-subscription-${randomIdentifierSuffix()}`,
      metadata: { userId: session.user.id, planCode },
      subscription_data: { metadata: { userId: session.user.id, planCode } },
      success_url: `${appUrl}/${locale}/dashboard/settings?billing=success`,
      cancel_url: `${appUrl}/${locale}/pricing?billing=canceled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    return NextResponse.json(
      { error: 'stripe_error', message: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}

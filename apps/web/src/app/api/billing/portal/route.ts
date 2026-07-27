import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@trt/db';
import { getStripe, stripeConfigured } from '@/lib/billing/stripe';

/**
 * Create a Stripe Customer Portal session (Phase 3.2).
 *
 * The Portal is where a Stripe subscriber cancels, updates their payment
 * method, switches plans, and views invoice history — for free, hosted by
 * Stripe (docs/STRIPE_SUBSCRIPTIONS_PLAN.md §3.6). Requires the caller to
 * already have a `stripeCustomerId` (set the first time they check out).
 *
 * `return_url` is deliberately locale-bare (`/dashboard/settings`) — the
 * next-intl middleware re-adds the locale prefix from the `NEXT_LOCALE`
 * cookie, same as every other bare internal path in this app.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'no_stripe_customer' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '';

  try {
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/dashboard/settings`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (e) {
    return NextResponse.json(
      { error: 'stripe_error', message: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { Prisma, prisma } from '@trt/db';
import { isPaidPlan } from '@/lib/plans';
import { decideStripeAction, periodEndFromSubscription, type StripeSubscriptionLike } from '@/lib/billing/stripe-events';
import { getStripe, planCodeForPriceId, stripeConfigured, stripeEnv } from '@/lib/billing/stripe';
import { applyStripeSubscriptionState } from '@/lib/billing/activate';

// §3.5 — the Stripe SDK needs Node's crypto, and a webhook must never be
// cached or statically optimized.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe subscriptions webhook (Phase 3.3) — dispatcher only, no decisions of
 * its own. verify signature → decideStripeAction (pure) → execute.
 *
 * Idempotency (§3.4): insert first, let the database arbitrate. Unlike the
 * Wompi/PayPal routes' findUnique-then-create (a TOCTOU race two concurrent
 * retries can both pass — left deliberately unfixed there, see plan §3.4/§9),
 * this inserts the PaymentEvent row FIRST and treats a unique-constraint
 * violation as "already processed, ack and stop" — race-free by construction.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 });
  }

  // §3.5 — MUST be .text(), never .json(): signature verification hashes the
  // exact bytes Stripe sent. Once .json() is called the body stream is
  // consumed and there is no recovery.
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, stripeEnv().webhookSecret);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    await prisma.paymentEvent.create({
      data: { provider: 'STRIPE', eventId: event.id, payload: event as unknown as object },
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) return NextResponse.json({ ok: true, replay: true });
    throw e;
  }

  const action = decideStripeAction(
    { id: event.id, type: event.type, data: { object: event.data.object as unknown as Record<string, unknown> } },
    planCodeForPriceId,
  );

  switch (action.kind) {
    case 'checkout_completed': {
      await prisma.user.update({
        where: { id: action.userId },
        data: { stripeCustomerId: action.stripeCustomerId },
      });
      if (action.paid) {
        const state = await loadSubscriptionState(action.stripeSubscriptionId);
        // §3.1 — never fabricate a period end. If Stripe's own subscription
        // object doesn't carry one yet, skip; invoice.paid (which always
        // arrives for a real subscription) will activate it correctly.
        if (state.currentPeriodEnd) {
          await applyStripeSubscriptionState({
            userId: action.userId,
            planCode: action.planCode,
            stripeSubscriptionId: action.stripeSubscriptionId,
            status: 'ACTIVE',
            currentPeriodEnd: state.currentPeriodEnd,
            cancelAtPeriodEnd: state.cancelAtPeriodEnd,
          });
        }
      }
      break;
    }

    case 'invoice_paid': {
      const userId = await userIdForStripeCustomer(action.stripeCustomerId);
      if (!userId) break; // unknown customer — nothing local to activate
      const state = await loadSubscriptionState(action.stripeSubscriptionId);
      if (!state.planCode || !state.currentPeriodEnd) break; // unknown Price, or no period end yet — never activate blind

      // No PENDING Payment row exists from checkout time (plan §3 Phase 3) —
      // the invoice is the first and only Payment record, keyed by invoice id
      // (satisfies Payment.reference @unique, gives clean idempotency).
      try {
        await prisma.payment.create({
          data: {
            userId,
            provider: 'STRIPE',
            reference: action.invoiceId,
            externalId: action.stripeSubscriptionId,
            amountInCents: action.amountInCents,
            currency: 'USD',
            status: 'APPROVED',
            planCode: state.planCode,
          },
        });
      } catch (e) {
        if (!isPrismaUniqueViolation(e)) throw e; // replay of the same invoice
      }

      await applyStripeSubscriptionState({
        userId,
        planCode: state.planCode,
        stripeSubscriptionId: action.stripeSubscriptionId,
        status: 'ACTIVE',
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      });
      break;
    }

    case 'invoice_payment_failed': {
      const userId = await userIdForStripeCustomer(action.stripeCustomerId);
      if (!userId) break;
      const state = await loadSubscriptionState(action.stripeSubscriptionId);
      if (!state.planCode || !state.currentPeriodEnd) break;
      await applyStripeSubscriptionState({
        userId,
        planCode: state.planCode,
        stripeSubscriptionId: action.stripeSubscriptionId,
        status: 'PAST_DUE',
        currentPeriodEnd: state.currentPeriodEnd, // untouched — Stripe hasn't moved it
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      });
      break;
    }

    case 'subscription_synced': {
      const userId = await userIdForStripeCustomer(action.stripeCustomerId);
      if (!userId) break;
      if (!action.currentPeriodEnd) break; // §3.1 — never fabricate a period end
      await applyStripeSubscriptionState({
        userId,
        planCode: action.planCode,
        stripeSubscriptionId: action.stripeSubscriptionId,
        status: action.status,
        currentPeriodEnd: action.currentPeriodEnd,
        cancelAtPeriodEnd: action.cancelAtPeriodEnd,
      });
      break;
    }

    case 'subscription_deleted': {
      const userId = await userIdForStripeCustomer(action.stripeCustomerId);
      if (!userId) break;
      // action.planCode is null when the last-seen Price id is unknown to us
      // (planCodeForPriceId is env-based) — fall back to whatever plan the
      // local row already has rather than dropping the cancellation. Same
      // fallback for currentPeriodEnd — never fabricate one (§3.1).
      const existing = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: action.stripeSubscriptionId },
        select: { planCode: true, currentPeriodEnd: true },
      });
      const planCode = action.planCode ?? (existing && isPaidPlan(existing.planCode) ? existing.planCode : null);
      const currentPeriodEnd = action.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null;
      if (!planCode || !currentPeriodEnd) break; // never activated locally and unknown price — nothing to cancel
      await applyStripeSubscriptionState({
        userId,
        planCode,
        stripeSubscriptionId: action.stripeSubscriptionId,
        status: 'CANCELED',
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
      });
      break;
    }

    case 'ignore':
      break;
  }

  return NextResponse.json({ ok: true });
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

async function userIdForStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({ where: { stripeCustomerId }, select: { id: true } });
  return user?.id ?? null;
}

/**
 * `invoice.paid`/`invoice.payment_failed`/checkout's linked subscription do
 * NOT embed the Subscription resource (only its id) — fetch it and derive
 * period end + plan with the same pure helpers used for the embedded-object
 * events (`customer.subscription.updated`/`.deleted`).
 */
async function loadSubscriptionState(stripeSubscriptionId: string) {
  const sub = (await getStripe().subscriptions.retrieve(
    stripeSubscriptionId,
  )) as unknown as StripeSubscriptionLike;
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  return {
    currentPeriodEnd: periodEndFromSubscription(sub),
    planCode: priceId ? planCodeForPriceId(priceId) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

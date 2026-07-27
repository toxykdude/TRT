/**
 * Stripe subscription events — pure event → action mapping.
 * Docs verified against docs.stripe.com for API version 2026-06-24.dahlia.
 *
 * Flow:
 *   1. apps/web/src/app/api/webhooks/stripe/route.ts verifies the raw event
 *      via `stripe.webhooks.constructEvent` (impure — needs the webhook
 *      secret and the exact request bytes, see stripe.ts and §3.5 of the plan).
 *   2. decideStripeAction(event, planCodeForPriceId) turns the verified event
 *      into exactly ONE typed StripeAction. No side effects, no prisma, no
 *      stripe client, no env — `planCodeForPriceId` is injected by the caller
 *      so this file never imports stripe.ts (which reads process.env).
 *   3. The route executes the action: Prisma writes go through
 *      `applyStripeSubscriptionState` (apps/web/src/lib/billing/activate.ts)
 *      plus a couple of direct, single-field writes for events that don't
 *      touch subscription state (User.stripeCustomerId, Payment rows).
 *
 * §3.1 — source of truth: `current_period_end` is NOT a field on the
 * Subscription object. Stripe moved it to the subscription ITEM at API
 * version 2025-03-31.basil ("Adds subscription item-level billing periods and
 * removes subscription-level periods"), and it stays there through
 * 2026-06-24.dahlia (confirmed against docs.stripe.com/api/subscriptions/object,
 * which lists it under `items.data[].current_period_end`, and
 * docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).
 * `periodEndFromSubscription` below reads `items.data[0].current_period_end` —
 * never a top-level field — and returns `null` instead of an Invalid Date when
 * it is absent.
 *
 * §3.3 — both `checkout.session.completed` and `invoice.paid` can arrive in
 * either order for the same first period, and either may replay. Every action
 * below is built entirely from the Stripe object embedded in (or referenced
 * by) the event, never from local history, so applying the same final state
 * twice — in any order — converges on the identical row (see
 * stripe-billing.test.ts "ordering" and "replay" cases).
 */
import { isPaidPlan, type PaidPlanCode } from '../plans';
import type { SubscriptionStatus } from '@trt/db';

// ── Minimal structural Stripe shapes — only the fields this file reads ─────

/** A verified Stripe webhook event, narrowed to what decideStripeAction needs. */
export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/** A Stripe Subscription object (or the subset embedded in its webhook events). */
export type StripeSubscriptionLike = {
  id?: string;
  status?: string;
  customer?: string | null;
  cancel_at_period_end?: boolean | null;
  items?: {
    data?: Array<{
      current_period_end?: number | null;
      price?: { id?: string | null } | null;
    }>;
  } | null;
};

export type StripeAction =
  | {
      kind: 'checkout_completed';
      userId: string;
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      planCode: PaidPlanCode;
      /** true when `payment_status === 'paid'` — false means link-only (async payment method, not yet settled). */
      paid: boolean;
    }
  | {
      kind: 'invoice_paid';
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      invoiceId: string;
      amountInCents: number;
    }
  | {
      kind: 'invoice_payment_failed';
      stripeCustomerId: string;
      stripeSubscriptionId: string;
    }
  | {
      kind: 'subscription_synced';
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      planCode: PaidPlanCode;
      status: SubscriptionStatus;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date | null;
    }
  | {
      kind: 'subscription_deleted';
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      /** null when the last-seen Price id is unknown to us — caller falls back to the existing row's planCode. */
      planCode: PaidPlanCode | null;
      currentPeriodEnd: Date | null;
    }
  | { kind: 'ignore'; reason: string };

/**
 * §3.1 — the ONLY place `current_period_end` is read. Always from the
 * subscription item, never the (removed) top-level field. Returns `null`
 * instead of `new Date(NaN)` when the item or its field is missing.
 */
export function periodEndFromSubscription(subscription: StripeSubscriptionLike): Date | null {
  const unix = subscription.items?.data?.[0]?.current_period_end;
  if (typeof unix !== 'number' || !Number.isFinite(unix)) return null;
  return new Date(unix * 1000);
}

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'ACTIVE',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  incomplete: 'PAST_DUE',
  paused: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete_expired: 'CANCELED',
};

/** Every Stripe subscription status → a valid local SubscriptionStatus. Never throws. */
export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  return STRIPE_STATUS_MAP[status] ?? 'EXPIRED';
}

function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Invoice.subscription is NOT a top-level field in this API family — it
 * moved to `invoice.parent.subscription_details.subscription` (verified
 * against the installed stripe SDK's Invoices.d.ts for API version
 * 2026-06-24.dahlia: `parent: Invoice.Parent | null` at the top level,
 * `subscription_details: Parent.SubscriptionDetails | null`, and
 * `subscription: string | Subscription` on that nested object — the same
 * "basil/dahlia" restructuring that moved `current_period_end` onto the
 * subscription item, see periodEndFromSubscription above). Accepts both the
 * plain id string and an expanded Subscription object.
 */
function invoiceSubscriptionId(obj: Record<string, unknown>): string {
  const parent = obj.parent;
  if (!parent || typeof parent !== 'object') return '';
  const subscriptionDetails = (parent as Record<string, unknown>).subscription_details;
  if (!subscriptionDetails || typeof subscriptionDetails !== 'object') return '';
  const subscription = (subscriptionDetails as Record<string, unknown>).subscription;
  if (typeof subscription === 'string') return subscription;
  if (subscription && typeof subscription === 'object') {
    const id = (subscription as Record<string, unknown>).id;
    if (typeof id === 'string') return id;
  }
  return '';
}

function planCodeFromMetadata(obj: Record<string, unknown>): PaidPlanCode | null {
  const metadata = obj.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).planCode;
  return typeof raw === 'string' && isPaidPlan(raw) ? raw : null;
}

function planCodeFromSubscriptionItem(
  sub: StripeSubscriptionLike,
  planCodeForPriceId: (priceId: string) => PaidPlanCode | null,
): PaidPlanCode | null {
  const priceId = sub.items?.data?.[0]?.price?.id;
  return typeof priceId === 'string' && priceId ? planCodeForPriceId(priceId) : null;
}

/**
 * event → StripeAction. Pure: no I/O, no env. `planCodeForPriceId` is the
 * only external dependency, injected so the price-id↔plan lookup table
 * (env-backed, per environment — see stripe.ts) never leaks into this file.
 */
export function decideStripeAction(
  event: StripeEvent,
  planCodeForPriceId: (priceId: string) => PaidPlanCode | null,
): StripeAction {
  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = str(obj, 'client_reference_id');
      const stripeCustomerId = str(obj, 'customer');
      const stripeSubscriptionId = str(obj, 'subscription');
      const planCode = planCodeFromMetadata(obj);
      if (!userId || !stripeCustomerId || !stripeSubscriptionId || !planCode) {
        return { kind: 'ignore', reason: 'checkout_session_missing_fields' };
      }
      return {
        kind: 'checkout_completed',
        userId,
        stripeCustomerId,
        stripeSubscriptionId,
        planCode,
        paid: obj.payment_status === 'paid',
      };
    }

    case 'invoice.paid': {
      const stripeCustomerId = str(obj, 'customer');
      const stripeSubscriptionId = invoiceSubscriptionId(obj);
      const invoiceId = str(obj, 'id');
      if (!stripeCustomerId || !stripeSubscriptionId || !invoiceId) {
        return { kind: 'ignore', reason: 'invoice_without_subscription' };
      }
      const amountInCents = typeof obj.amount_paid === 'number' ? obj.amount_paid : 0;
      return { kind: 'invoice_paid', stripeCustomerId, stripeSubscriptionId, invoiceId, amountInCents };
    }

    case 'invoice.payment_failed': {
      const stripeCustomerId = str(obj, 'customer');
      const stripeSubscriptionId = invoiceSubscriptionId(obj);
      if (!stripeCustomerId || !stripeSubscriptionId) {
        return { kind: 'ignore', reason: 'invoice_without_subscription' };
      }
      return { kind: 'invoice_payment_failed', stripeCustomerId, stripeSubscriptionId };
    }

    case 'customer.subscription.updated': {
      const sub = obj as StripeSubscriptionLike;
      const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : '';
      const stripeSubscriptionId = typeof sub.id === 'string' ? sub.id : '';
      const planCode = planCodeFromSubscriptionItem(sub, planCodeForPriceId);
      if (!stripeCustomerId || !stripeSubscriptionId || !planCode) {
        return { kind: 'ignore', reason: !planCode ? 'unknown_price_id' : 'subscription_missing_fields' };
      }
      return {
        kind: 'subscription_synced',
        stripeCustomerId,
        stripeSubscriptionId,
        planCode,
        status: mapStripeSubscriptionStatus(sub.status ?? ''),
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        currentPeriodEnd: periodEndFromSubscription(sub),
      };
    }

    case 'customer.subscription.deleted': {
      const sub = obj as StripeSubscriptionLike;
      const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : '';
      const stripeSubscriptionId = typeof sub.id === 'string' ? sub.id : '';
      if (!stripeCustomerId || !stripeSubscriptionId) {
        return { kind: 'ignore', reason: 'subscription_missing_fields' };
      }
      return {
        kind: 'subscription_deleted',
        stripeCustomerId,
        stripeSubscriptionId,
        planCode: planCodeFromSubscriptionItem(sub, planCodeForPriceId),
        currentPeriodEnd: periodEndFromSubscription(sub),
      };
    }

    default:
      return { kind: 'ignore', reason: `unhandled_event_type:${event.type}` };
  }
}

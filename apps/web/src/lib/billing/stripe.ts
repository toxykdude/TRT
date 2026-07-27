/**
 * Stripe subscriptions — SDK client, environment, and Price↔Plan mapping.
 *
 * Flow:
 *   1. `stripeEnv()` reads the four Stripe billing vars. `stripeConfigured()`
 *      is the readiness gate every route checks before touching Stripe
 *      (mirrors `wompiConfigured()` / `paypalConfigured()`).
 *   2. `getStripe()` is a lazy singleton SDK client, pinned to the API
 *      version this integration was built and verified against —
 *      '2026-06-24.dahlia'. See stripe-events.ts for why that matters
 *      (`current_period_end` lives on the subscription ITEM in this and
 *      every later "dahlia"/"basil"-family version, not on the Subscription
 *      object).
 *   3. `priceIdForPlan()` / `planCodeForPriceId()` are the two directions of
 *      ONE lookup table built from env, never hardcoded in `plans.ts` — test
 *      mode and live mode issue different Price ids for the same plan
 *      (docs/STRIPE_SUBSCRIPTIONS_PLAN.md §5.1).
 *
 * Everything here is impure (reads process.env, constructs the Stripe SDK
 * client) — `decideStripeAction` in stripe-events.ts stays free of all of it.
 */
import Stripe from 'stripe';
import { PAID_PLAN_CODES, type PaidPlanCode } from '../plans';

export type StripeEnv = {
  secretKey: string;
  webhookSecret: string;
  priceIds: Record<PaidPlanCode, string>;
};

export function stripeEnv(): StripeEnv {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    priceIds: {
      PLUS_MONTHLY: process.env.STRIPE_PRICE_PLUS_MONTHLY ?? '',
      PLUS_YEARLY: process.env.STRIPE_PRICE_PLUS_YEARLY ?? '',
      PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    },
  };
}

/** True only when the secret key, webhook secret, and all three Price ids are set. */
export function stripeConfigured(): boolean {
  const e = stripeEnv();
  return Boolean(e.secretKey && e.webhookSecret && PAID_PLAN_CODES.every((code) => e.priceIds[code]));
}

/** Price id for a plan, from env — never hardcoded (test/live mode differ). */
export function priceIdForPlan(planCode: PaidPlanCode, env: StripeEnv = stripeEnv()): string {
  return env.priceIds[planCode];
}

/**
 * Invert the same env map: which plan does this Stripe Price id belong to?
 * Returns `null` — never throws — on an unknown id, because a Price created
 * in the Dashboard and not yet deployed to env must not crash the webhook.
 */
export function planCodeForPriceId(priceId: string, env: StripeEnv = stripeEnv()): PaidPlanCode | null {
  for (const code of PAID_PLAN_CODES) {
    if (env.priceIds[code] && env.priceIds[code] === priceId) return code;
  }
  return null;
}

let cachedClient: Stripe | null = null;

/**
 * Lazy singleton Stripe SDK client, pinned to the verified API version.
 * Constructing it does no I/O — safe to call from any route without a
 * network round trip until the first actual API method call.
 */
export function getStripe(): Stripe {
  if (!cachedClient) {
    cachedClient = new Stripe(stripeEnv().secretKey, { apiVersion: '2026-06-24.dahlia' });
  }
  return cachedClient;
}

/**
 * Shared billing side-effects: subscription activation after a confirmed
 * payment (Wompi webhook or PayPal capture) and admin comp grants.
 *
 * Renewal model at launch: period-based access. Each confirmed payment
 * extends `currentPeriodEnd` by the plan interval from the later of
 * (now, current period end) — paying early never loses paid time.
 */
import { Prisma, prisma, type PaymentStatus, type SubscriptionStatus } from '@trt/db';
import { PLANS, type PaidPlanCode } from '../plans';

export type ActivateDb = {
  subscription: {
    findFirst(args: unknown): Promise<{
      id: string;
      currentPeriodEnd: Date;
      status: SubscriptionStatus;
    } | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: ActivateDb) => Promise<T>): Promise<T>;
};

/** Pure: compute the new period end given an existing subscription state. */
export function computeNewPeriodEnd(
  existing: { currentPeriodEnd: Date; status: string } | null,
  interval: 'month' | 'year',
  now: Date,
): Date {
  const base =
    existing && existing.status === 'ACTIVE' && existing.currentPeriodEnd.getTime() > now.getTime()
      ? new Date(existing.currentPeriodEnd)
      : new Date(now);
  if (interval === 'month') base.setUTCMonth(base.getUTCMonth() + 1);
  else base.setUTCFullYear(base.getUTCFullYear() + 1);
  return base;
}

/**
 * Pure gate for webhook replay recovery (RES-1). True when a payment is
 * APPROVED but no ACTIVE subscription covers `now` — i.e. a prior delivery
 * marked the payment APPROVED then threw before activation. Re-running
 * activation (idempotent) heals it. The decision is status === ACTIVE &&
 * currentPeriodEnd > now.
 */
export function shouldReactivate(args: {
  paymentStatus: PaymentStatus;
  subscription?: { status: SubscriptionStatus; currentPeriodEnd: Date } | null;
  now?: Date;
}): boolean {
  if (args.paymentStatus !== 'APPROVED') return false;
  const sub = args.subscription;
  if (!sub) return true; // never activated
  if (sub.status !== 'ACTIVE') return true; // canceled / expired / past_due
  const now = args.now ?? new Date();
  return sub.currentPeriodEnd.getTime() <= now.getTime(); // period lapsed
}

/**
 * First-delivery vs replay activation decision (RES2-1). First delivery ALWAYS
 * activates on APPROVED — never gated — so a renewal while the period is still
 * active extends `currentPeriodEnd` (computeNewPeriodEnd extends from the
 * existing period end). Replay is gated by {@link shouldReactivate} so it only
 * recovers a stuck activation and no-ops when already active (RES-1).
 */
export function shouldActivateOnDelivery(args: {
  isReplay: boolean;
  paymentStatus: PaymentStatus;
  subscription?: { status: SubscriptionStatus; currentPeriodEnd: Date } | null;
  now?: Date;
}): boolean {
  if (args.paymentStatus !== 'APPROVED') return false;
  if (!args.isReplay) return true; // first delivery: new, renewal, re-activation
  return shouldReactivate({
    paymentStatus: args.paymentStatus,
    subscription: args.subscription,
    now: args.now,
  });
}

/**
 * Activate (or extend) a user's plan after a confirmed payment.
 * Idempotent at the payment level by callers (Payment.reference unique).
 * Writes are atomic: the findFirst + update/create run in one $transaction so
 * a transient failure cannot leave a half-written subscription (RES-1).
 */
export async function activatePlan(
  params: {
    userId: string;
    planCode: PaidPlanCode;
    provider: 'WOMPI' | 'PAYPAL' | 'STRIPE' | 'MANUAL';
    externalRef?: string | null;
  },
  db: ActivateDb = prisma as unknown as ActivateDb,
  now = new Date(),
): Promise<{ currentPeriodEnd: Date }> {
  const plan = PLANS[params.planCode];
  if (!plan.interval) throw new Error(`Plan ${params.planCode} is not payable`);
  // Capture the narrowed interval: a closure (the $transaction callback) does
  // not preserve the property-access narrowing from the guard above.
  const interval = plan.interval;

  return db.$transaction(async (tx) => {
    const existing = await tx.subscription.findFirst({
      where: { userId: params.userId, status: 'ACTIVE' },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { id: true, currentPeriodEnd: true, status: true },
    });
    const currentPeriodEnd = computeNewPeriodEnd(existing, interval, now);

    if (existing) {
      await tx.subscription.update({
        where: { id: existing.id },
        data: {
          planCode: params.planCode,
          provider: params.provider,
          status: 'ACTIVE',
          currentPeriodEnd,
          externalRef: params.externalRef ?? undefined,
          cancelAtPeriodEnd: false,
        },
      });
    } else {
      await tx.subscription.create({
        data: {
          userId: params.userId,
          provider: params.provider,
          planCode: params.planCode,
          status: 'ACTIVE',
          currentPeriodEnd,
          externalRef: params.externalRef ?? null,
        },
      });
    }
    return { currentPeriodEnd };
  });
}

/**
 * Recovery helper for webhook replays (RES-1). Re-runs `activatePlan` when the
 * subscription is not yet active (stuck activation); no-op when already active.
 * First delivery must call `activatePlan` directly (RES2-1) — this is the gated
 * replay path. Pass `isReplay: true` from the replay branch.
 */
export async function ensureActivated(args: {
  userId: string;
  planCode: PaidPlanCode;
  paymentStatus: PaymentStatus;
  provider: 'WOMPI' | 'PAYPAL' | 'STRIPE';
  externalRef?: string | null;
  isReplay?: boolean;
  db?: ActivateDb;
  now?: Date;
}): Promise<void> {
  if (args.paymentStatus !== 'APPROVED') return;
  const isReplay = args.isReplay ?? false;
  const db = args.db ?? (prisma as unknown as ActivateDb);
  // Only the replay path needs the lookup — first delivery is ungated.
  const sub = isReplay
    ? await db.subscription.findFirst({
        where: { userId: args.userId },
        orderBy: { currentPeriodEnd: 'desc' },
        select: { id: true, status: true, currentPeriodEnd: true },
      })
    : null;
  if (
    !shouldActivateOnDelivery({ isReplay, paymentStatus: args.paymentStatus, subscription: sub, now: args.now })
  )
    return;
  await activatePlan(
    { userId: args.userId, planCode: args.planCode, provider: args.provider, externalRef: args.externalRef },
    db,
    args.now,
  );
}

/**
 * Stripe subscription state sync (docs/STRIPE_SUBSCRIPTIONS_PLAN.md §3.1/§3.3).
 *
 * Unlike {@link activatePlan}, this NEVER calls {@link computeNewPeriodEnd} —
 * `currentPeriodEnd` is always ASSIGNED verbatim from the caller (who reads it
 * off the live Stripe subscription object via `periodEndFromSubscription`).
 * Stripe owns the billing cycle; local computation here would drift from
 * proration, trials, retries, and dunning grace.
 *
 * Looked up by `stripeSubscriptionId` (not userId) so this is order-independent:
 * `checkout.session.completed` and `invoice.paid` can arrive in either order
 * for the same first period, and whichever arrives first creates the row —
 * the other just updates it by the same Stripe subscription id. Reuses the
 * existing {@link ActivateDb} structural port; no second DB-injection
 * mechanism.
 */
export async function applyStripeSubscriptionState(
  params: {
    userId: string;
    planCode: PaidPlanCode;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  },
  db: ActivateDb = prisma as unknown as ActivateDb,
  /** Accepted for signature symmetry with activatePlan (and tests that pass `now`); Stripe state never derives from it. */
  _now = new Date(),
): Promise<{ currentPeriodEnd: Date; status: SubscriptionStatus }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.subscription.findFirst({
      where: { stripeSubscriptionId: params.stripeSubscriptionId },
      select: { id: true, currentPeriodEnd: true, status: true },
    });

    const data = {
      planCode: params.planCode,
      provider: 'STRIPE' as const,
      status: params.status,
      currentPeriodEnd: params.currentPeriodEnd,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      stripeSubscriptionId: params.stripeSubscriptionId,
      externalRef: params.stripeSubscriptionId,
    };

    if (existing) {
      await tx.subscription.update({ where: { id: existing.id }, data });
    } else {
      try {
        await tx.subscription.create({ data: { userId: params.userId, ...data } });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        // Lost a create race: another delivery for this same Stripe
        // subscription (checkout.session.completed vs invoice.paid arriving
        // concurrently) committed its row between our findFirst and our
        // create. Its row is now visible — update it instead of failing.
        const raced = await tx.subscription.findFirst({
          where: { stripeSubscriptionId: params.stripeSubscriptionId },
          select: { id: true, currentPeriodEnd: true, status: true },
        });
        if (!raced) throw e; // unexpected — surface the original error
        await tx.subscription.update({ where: { id: raced.id }, data });
      }
    }

    return { currentPeriodEnd: params.currentPeriodEnd, status: params.status };
  });
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

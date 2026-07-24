/**
 * Shared billing side-effects: subscription activation after a confirmed
 * payment (Wompi webhook or PayPal capture) and admin comp grants.
 *
 * Renewal model at launch: period-based access. Each confirmed payment
 * extends `currentPeriodEnd` by the plan interval from the later of
 * (now, current period end) — paying early never loses paid time.
 */
import { prisma, type PaymentStatus, type SubscriptionStatus } from '@trt/db';
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
    provider: 'WOMPI' | 'PAYPAL' | 'MANUAL';
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
  provider: 'WOMPI' | 'PAYPAL';
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

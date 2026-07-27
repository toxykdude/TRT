/**
 * Stripe subscriptions — pure core tests (Phase 1 + Phase 2, strict TDD).
 *
 * Mirrors the conventions in billing.test.ts: local factory helpers, vi.fn()
 * mocks, vi.restoreAllMocks() in afterEach. No network, no real Stripe key —
 * pr-validation.yml runs with no Stripe env at all and must stay that way.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@trt/db';
import {
  decideStripeAction,
  periodEndFromSubscription,
  mapStripeSubscriptionStatus,
  type StripeEvent,
  type StripeSubscriptionLike,
} from '@/lib/billing/stripe-events';
import { applyStripeSubscriptionState } from '@/lib/billing/activate';
import type { PaidPlanCode } from '@/lib/plans';

// ── Phase 1.4 fixture: price-id map (env-independent, injected directly) ────
const PRICE_IDS: Record<PaidPlanCode, string> = {
  PLUS_MONTHLY: 'price_plus_monthly_test',
  PLUS_YEARLY: 'price_plus_yearly_test',
  PRO_MONTHLY: 'price_pro_monthly_test',
};

function planCodeForPriceId(priceId: string): PaidPlanCode | null {
  for (const code of Object.keys(PRICE_IDS) as PaidPlanCode[]) {
    if (PRICE_IDS[code] === priceId) return code;
  }
  return null;
}

function makeEvent(type: string, object: Record<string, unknown>, id = 'evt_test_1'): StripeEvent {
  return { id, type, data: { object } };
}

// ── §3.1 — periodEndFromSubscription: subscription ITEM field path ─────────
// Verified against docs.stripe.com/api/subscriptions/object (current, "dahlia"
// era) and docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-
// current-period-start-and-end: current_period_end lives on
// subscription.items.data[0], NOT on the top-level Subscription object, from
// API version 2025-03-31.basil onward — which includes 2026-06-24.dahlia.
describe('periodEndFromSubscription (§3.1 field-path verification)', () => {
  it('reads current_period_end from items.data[0], not the top-level object', () => {
    const sub: StripeSubscriptionLike = {
      id: 'sub_1',
      status: 'active',
      // Top-level current_period_end deliberately absent — proves we do NOT
      // read a (removed) top-level field.
      items: { data: [{ current_period_end: 1735689600, price: { id: 'price_x' } }] },
    };
    const end = periodEndFromSubscription(sub);
    expect(end).toEqual(new Date(1735689600 * 1000));
  });

  it('returns null (not an Invalid Date) when the item field is missing', () => {
    const sub: StripeSubscriptionLike = { id: 'sub_1', status: 'active', items: { data: [{}] } };
    expect(periodEndFromSubscription(sub)).toBeNull();
  });

  it('returns null when there are no items at all', () => {
    const sub: StripeSubscriptionLike = { id: 'sub_1', status: 'active', items: { data: [] } };
    expect(periodEndFromSubscription(sub)).toBeNull();
  });

  it('returns null when items is absent entirely', () => {
    expect(periodEndFromSubscription({ id: 'sub_1', status: 'active' })).toBeNull();
  });
});

// ── mapStripeSubscriptionStatus — every Stripe status → a valid local one ──
describe('mapStripeSubscriptionStatus', () => {
  it('maps active and trialing to ACTIVE', () => {
    expect(mapStripeSubscriptionStatus('active')).toBe('ACTIVE');
    expect(mapStripeSubscriptionStatus('trialing')).toBe('ACTIVE');
  });

  it('maps past_due, unpaid, incomplete, and paused to PAST_DUE', () => {
    expect(mapStripeSubscriptionStatus('past_due')).toBe('PAST_DUE');
    expect(mapStripeSubscriptionStatus('unpaid')).toBe('PAST_DUE');
    expect(mapStripeSubscriptionStatus('incomplete')).toBe('PAST_DUE');
    expect(mapStripeSubscriptionStatus('paused')).toBe('PAST_DUE');
  });

  it('maps canceled and incomplete_expired to CANCELED', () => {
    expect(mapStripeSubscriptionStatus('canceled')).toBe('CANCELED');
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe('CANCELED');
  });

  it('never throws on an unknown status, and defaults to EXPIRED', () => {
    expect(() => mapStripeSubscriptionStatus('some_future_status')).not.toThrow();
    expect(mapStripeSubscriptionStatus('some_future_status')).toBe('EXPIRED');
  });
});

// ── decideStripeAction — one case per §3.3 row ──────────────────────────────
describe('decideStripeAction', () => {
  it('checkout.session.completed + payment_status paid → checkout_completed(paid: true)', () => {
    const event = makeEvent('checkout.session.completed', {
      client_reference_id: 'user_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      payment_status: 'paid',
      metadata: { planCode: 'PLUS_MONTHLY' },
    });
    expect(decideStripeAction(event, planCodeForPriceId)).toEqual({
      kind: 'checkout_completed',
      userId: 'user_1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      planCode: 'PLUS_MONTHLY',
      paid: true,
    });
  });

  it('checkout.session.completed + payment_status NOT paid → checkout_completed(paid: false) — link only', () => {
    const event = makeEvent('checkout.session.completed', {
      client_reference_id: 'user_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      payment_status: 'unpaid',
      metadata: { planCode: 'PRO_MONTHLY' },
    });
    const action = decideStripeAction(event, planCodeForPriceId);
    expect(action.kind).toBe('checkout_completed');
    expect(action).toMatchObject({ paid: false, planCode: 'PRO_MONTHLY' });
  });

  it('checkout.session.completed with a missing/invalid plan in metadata → ignore', () => {
    const event = makeEvent('checkout.session.completed', {
      client_reference_id: 'user_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      payment_status: 'paid',
      metadata: {},
    });
    expect(decideStripeAction(event, planCodeForPriceId).kind).toBe('ignore');
  });

  // Invoice.subscription is NOT a top-level field in this API family — it
  // moved to invoice.parent.subscription_details.subscription (verified
  // against the installed stripe@22.3.2 SDK's Invoices.d.ts, whose pinned
  // ApiVersion is exactly '2026-06-24.dahlia': `parent: Invoice.Parent | null`
  // at the top level, `subscription_details: Parent.SubscriptionDetails | null`,
  // and `subscription: string | Subscription` on that nested object). The
  // same "basil/dahlia" restructuring that moved current_period_end onto the
  // subscription item also moved this field on Invoice.
  it('invoice.paid with a subscription → invoice_paid', () => {
    const event = makeEvent('invoice.paid', {
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
      id: 'in_1',
      amount_paid: 1499,
    });
    expect(decideStripeAction(event, planCodeForPriceId)).toEqual({
      kind: 'invoice_paid',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      invoiceId: 'in_1',
      amountInCents: 1499,
    });
  });

  it('invoice.paid with an EXPANDED subscription object (not just an id string) → invoice_paid', () => {
    const event = makeEvent('invoice.paid', {
      customer: 'cus_1',
      parent: { subscription_details: { subscription: { id: 'sub_1' } } },
      id: 'in_1',
      amount_paid: 1499,
    });
    expect(decideStripeAction(event, planCodeForPriceId)).toMatchObject({
      kind: 'invoice_paid',
      stripeSubscriptionId: 'sub_1',
    });
  });

  it('invoice.paid with NO subscription (one-off invoice) → ignore (subscription-less invoice)', () => {
    const event = makeEvent('invoice.paid', {
      customer: 'cus_1',
      parent: { subscription_details: null, type: 'manual' },
      id: 'in_1',
      amount_paid: 500,
    });
    expect(decideStripeAction(event, planCodeForPriceId).kind).toBe('ignore');
  });

  it('invoice.payment_failed → invoice_payment_failed', () => {
    const event = makeEvent('invoice.payment_failed', {
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
      id: 'in_2',
    });
    expect(decideStripeAction(event, planCodeForPriceId)).toEqual({
      kind: 'invoice_payment_failed',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });
  });

  it('customer.subscription.updated → subscription_synced (status, cancelAtPeriodEnd, planCode)', () => {
    const event = makeEvent('customer.subscription.updated', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: true,
      items: { data: [{ current_period_end: 1735689600, price: { id: PRICE_IDS.PLUS_YEARLY } }] },
    });
    expect(decideStripeAction(event, planCodeForPriceId)).toEqual({
      kind: 'subscription_synced',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      planCode: 'PLUS_YEARLY',
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(1735689600 * 1000),
    });
  });

  it('customer.subscription.updated with an unknown Price id → ignore (never throws)', () => {
    const event = makeEvent('customer.subscription.updated', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: 1735689600, price: { id: 'price_not_yet_deployed' } }] },
    });
    expect(() => decideStripeAction(event, planCodeForPriceId)).not.toThrow();
    expect(decideStripeAction(event, planCodeForPriceId).kind).toBe('ignore');
  });

  it('customer.subscription.deleted → subscription_deleted', () => {
    const event = makeEvent('customer.subscription.deleted', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'canceled',
      items: { data: [{ current_period_end: 1735689600, price: { id: PRICE_IDS.PRO_MONTHLY } }] },
    });
    expect(decideStripeAction(event, planCodeForPriceId)).toEqual({
      kind: 'subscription_deleted',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      planCode: 'PRO_MONTHLY',
      currentPeriodEnd: new Date(1735689600 * 1000),
    });
  });

  it('an unrelated/unknown event type → ignore, 200 OK, no writes', () => {
    const event = makeEvent('payment_intent.succeeded', { id: 'pi_1' });
    expect(decideStripeAction(event, planCodeForPriceId)).toEqual({
      kind: 'ignore',
      reason: 'unhandled_event_type:payment_intent.succeeded',
    });
  });
});

// ── Phase 2 — applyStripeSubscriptionState against a fake ActivateDb ───────
// Fake mirrors the shape used by billing.test.ts-adjacent tests: an in-memory
// array store keyed by id, exposing the same ActivateDb structural port so no
// second DB-injection mechanism is invented.
type FakeRow = {
  id: string;
  userId: string;
  planCode: string;
  provider: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
};

type FakeActivateDb = {
  subscription: {
    findFirst(args: {
      where?: { stripeSubscriptionId?: string };
    }): Promise<{ id: string; currentPeriodEnd: Date; status: never } | null>;
    create(args: { data: Omit<FakeRow, 'id'> }): Promise<FakeRow>;
    update(args: { where: { id: string }; data: Partial<FakeRow> }): Promise<FakeRow>;
  };
  $transaction<T>(fn: (tx: FakeActivateDb) => Promise<T>): Promise<T>;
};

function makeFakeActivateDb(): { db: FakeActivateDb; rows: FakeRow[] } {
  const rows: FakeRow[] = [];
  let nextId = 1;

  const db: FakeActivateDb = {
    subscription: {
      async findFirst(args) {
        const where = args?.where ?? {};
        const row = rows.find((r) => where.stripeSubscriptionId && r.stripeSubscriptionId === where.stripeSubscriptionId);
        if (!row) return null;
        return { id: row.id, currentPeriodEnd: row.currentPeriodEnd, status: row.status as never };
      },
      async create(args) {
        const row: FakeRow = { id: `row_${nextId++}`, ...args.data };
        rows.push(row);
        return row;
      },
      async update(args) {
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, args.data);
        return row;
      },
    },
    async $transaction<T>(fn: (tx: FakeActivateDb) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  return { db, rows };
}

describe('applyStripeSubscriptionState (Phase 2.1 — six scenarios)', () => {
  const now = new Date('2026-07-24T12:00:00Z');

  it('new subscription: creates ACTIVE with the Stripe-assigned currentPeriodEnd', async () => {
    const { db, rows } = makeFakeActivateDb();
    const end = new Date('2026-08-24T00:00:00Z');
    await applyStripeSubscriptionState(
      {
        userId: 'user_1',
        planCode: 'PLUS_MONTHLY',
        stripeSubscriptionId: 'sub_1',
        status: 'ACTIVE',
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
      },
      db,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'user_1', planCode: 'PLUS_MONTHLY', status: 'ACTIVE' });
    expect(rows[0]!.currentPeriodEnd).toEqual(end);
  });

  it('renewal: assigns (never extends locally) the new Stripe currentPeriodEnd', async () => {
    const { db, rows } = makeFakeActivateDb();
    const firstEnd = new Date('2026-08-24T00:00:00Z');
    const renewedEnd = new Date('2026-09-24T00:00:00Z');
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'ACTIVE', currentPeriodEnd: firstEnd, cancelAtPeriodEnd: false },
      db,
    );
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'ACTIVE', currentPeriodEnd: renewedEnd, cancelAtPeriodEnd: false },
      db,
    );
    expect(rows).toHaveLength(1); // same row, updated — not a second row
    expect(rows[0]!.currentPeriodEnd).toEqual(renewedEnd);
  });

  it('plan change (Portal upgrade/downgrade): planCode is synced from Stripe', async () => {
    const { db, rows } = makeFakeActivateDb();
    const end = new Date('2026-08-24T00:00:00Z');
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'ACTIVE', currentPeriodEnd: end, cancelAtPeriodEnd: false },
      db,
    );
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PRO_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'ACTIVE', currentPeriodEnd: end, cancelAtPeriodEnd: false },
      db,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.planCode).toBe('PRO_MONTHLY');
  });

  it('past-due: sets PAST_DUE while currentPeriodEnd stays exactly what the caller passed (untouched)', async () => {
    const { db, rows } = makeFakeActivateDb();
    const end = new Date('2026-08-24T00:00:00Z');
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'ACTIVE', currentPeriodEnd: end, cancelAtPeriodEnd: false },
      db,
    );
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'PAST_DUE', currentPeriodEnd: end, cancelAtPeriodEnd: false },
      db,
    );
    expect(rows[0]!.status).toBe('PAST_DUE');
    expect(rows[0]!.currentPeriodEnd).toEqual(end); // unchanged
  });

  it('cancel: sets CANCELED', async () => {
    const { db, rows } = makeFakeActivateDb();
    const end = new Date('2026-08-24T00:00:00Z');
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'ACTIVE', currentPeriodEnd: end, cancelAtPeriodEnd: false },
      db,
    );
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'CANCELED', currentPeriodEnd: end, cancelAtPeriodEnd: true },
      db,
    );
    expect(rows[0]!.status).toBe('CANCELED');
    expect(rows[0]!.cancelAtPeriodEnd).toBe(true);
  });

  it('out-of-order replay: applying the same final state twice does not double-extend or duplicate rows', async () => {
    const { db, rows } = makeFakeActivateDb();
    const end = new Date('2026-08-24T00:00:00Z');
    const params = {
      userId: 'user_1',
      planCode: 'PLUS_MONTHLY' as const,
      stripeSubscriptionId: 'sub_1',
      status: 'ACTIVE' as const,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
    };
    await applyStripeSubscriptionState(params, db);
    await applyStripeSubscriptionState(params, db); // replay
    expect(rows).toHaveLength(1);
    expect(rows[0]!.currentPeriodEnd).toEqual(end); // NOT extended a second time
  });

  it('recovers from a concurrent create race (two first-deliveries for the same new subscription)', async () => {
    // Simulates checkout.session.completed and invoice.paid racing for a
    // brand-new subscription: this delivery's findFirst() sees no existing
    // row (the race window), then its create() collides with a unique
    // constraint because the OTHER delivery's row committed in between. The
    // loser must recover by updating that row, never surface a 500.
    const { db, rows } = makeFakeActivateDb();
    const end = new Date('2026-08-24T00:00:00Z');
    const params = {
      userId: 'user_1',
      planCode: 'PLUS_MONTHLY' as const,
      stripeSubscriptionId: 'sub_race',
      status: 'ACTIVE' as const,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
    };

    // The "other" delivery's row, already committed — seeded directly (not
    // through this db handle's create) to model a concurrent transaction.
    rows.push({
      id: 'row_other',
      userId: params.userId,
      planCode: params.planCode,
      provider: 'STRIPE',
      status: params.status,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: params.stripeSubscriptionId,
    });

    let findFirstCalls = 0;
    const originalFindFirst = db.subscription.findFirst.bind(db.subscription);
    db.subscription.findFirst = (async (args: Parameters<typeof originalFindFirst>[0]) => {
      findFirstCalls++;
      // Call #1 (inside applyStripeSubscriptionState, before the race is
      // "discovered"): nothing visible yet. Call #2 (the recovery lookup
      // after the unique-violation catch): the other row is now visible.
      return findFirstCalls === 1 ? null : originalFindFirst(args);
    }) as typeof db.subscription.findFirst;

    let createCalls = 0;
    db.subscription.create = (async () => {
      createCalls++;
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['stripeSubscriptionId'] },
      });
    }) as typeof db.subscription.create;

    await expect(applyStripeSubscriptionState(params, db)).resolves.toBeTruthy();

    expect(rows).toHaveLength(1); // no duplicate row — the loser updated, not inserted
    expect(createCalls).toBe(1);
  });

  it('ordering: invoice.paid-derived state before checkout-derived state reaches the same final row as the reverse', async () => {
    const end = new Date('2026-08-24T00:00:00Z');
    const fromInvoicePaid = {
      userId: 'user_1',
      planCode: 'PLUS_MONTHLY' as const,
      stripeSubscriptionId: 'sub_1',
      status: 'ACTIVE' as const,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
    };
    const fromCheckoutCompleted = { ...fromInvoicePaid }; // both derive from the SAME live Stripe subscription

    const orderA = makeFakeActivateDb();
    await applyStripeSubscriptionState(fromInvoicePaid, orderA.db);
    await applyStripeSubscriptionState(fromCheckoutCompleted, orderA.db);

    const orderB = makeFakeActivateDb();
    await applyStripeSubscriptionState(fromCheckoutCompleted, orderB.db);
    await applyStripeSubscriptionState(fromInvoicePaid, orderB.db);

    expect(orderA.rows).toHaveLength(1);
    expect(orderB.rows).toHaveLength(1);
    expect(orderA.rows[0]!.currentPeriodEnd).toEqual(orderB.rows[0]!.currentPeriodEnd);
    expect(orderA.rows[0]!.status).toEqual(orderB.rows[0]!.status);
    expect(orderA.rows[0]!.planCode).toEqual(orderB.rows[0]!.planCode);
  });

  it('is a no-op regarding `now` — currentPeriodEnd is Stripe-assigned, not computed from now', async () => {
    const { db, rows } = makeFakeActivateDb();
    // A currentPeriodEnd far in the past is still assigned verbatim — proves
    // this function never calls computeNewPeriodEnd internally.
    const pastEnd = new Date('2020-01-01T00:00:00Z');
    await applyStripeSubscriptionState(
      { userId: 'user_1', planCode: 'PLUS_MONTHLY', stripeSubscriptionId: 'sub_1', status: 'EXPIRED', currentPeriodEnd: pastEnd, cancelAtPeriodEnd: false },
      db,
      now,
    );
    expect(rows[0]!.currentPeriodEnd).toEqual(pastEnd);
  });
});

// ── Phase 1.3/1.4 — price-id map + stripeConfigured (env-dependent) ────────
describe('stripe.ts env helpers', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('priceIdForPlan / planCodeForPriceId invert each other for all three paid plans', async () => {
    const { priceIdForPlan, planCodeForPriceId: invert } = await import('@/lib/billing/stripe');
    const env = {
      secretKey: 'sk_test_x',
      webhookSecret: 'whsec_x',
      priceIds: PRICE_IDS,
    };
    for (const code of Object.keys(PRICE_IDS) as PaidPlanCode[]) {
      const priceId = priceIdForPlan(code, env);
      expect(priceId).toBe(PRICE_IDS[code]);
      expect(invert(priceId, env)).toBe(code);
    }
  });

  it('planCodeForPriceId returns null (never throws) for an unknown price id', async () => {
    const { planCodeForPriceId: invert } = await import('@/lib/billing/stripe');
    const env = { secretKey: 'sk_test_x', webhookSecret: 'whsec_x', priceIds: PRICE_IDS };
    expect(() => invert('price_unknown', env)).not.toThrow();
    expect(invert('price_unknown', env)).toBeNull();
  });

  it('stripeConfigured() is false when any required var is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_PLUS_MONTHLY;
    delete process.env.STRIPE_PRICE_PLUS_YEARLY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    const { stripeConfigured } = await import('@/lib/billing/stripe');
    expect(stripeConfigured()).toBe(false);
  });

  it('stripeConfigured() is true when every required var is present', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    process.env.STRIPE_PRICE_PLUS_MONTHLY = 'price_a';
    process.env.STRIPE_PRICE_PLUS_YEARLY = 'price_b';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_c';
    const { stripeConfigured } = await import('@/lib/billing/stripe');
    expect(stripeConfigured()).toBe(true);
  });
});

/**
 * Quota + plan tests (develop_saas.md P1.d — table-driven per tier × action).
 */
import { describe, it, expect } from 'vitest';
import {
  periodFor,
  limitFor,
  isSubscriptionActive,
  isTrialActive,
  checkQuota,
  recordUsage,
  getEffectivePlanCode,
  quotaExceededPayload,
  type QuotaDb,
} from '@/lib/quota';
import { PLANS, isPaidPlan, formatPrice } from '@/lib/plans';

const NOW = new Date('2026-07-24T12:00:00Z');

describe('periodFor', () => {
  it('uploads meter per calendar month', () => {
    expect(periodFor('UPLOAD', NOW)).toBe('2026-07');
  });
  it('reports meter per calendar quarter', () => {
    expect(periodFor('REPORT', NOW)).toBe('2026-Q3');
    expect(periodFor('REPORT', new Date('2026-01-15T00:00:00Z'))).toBe('2026-Q1');
  });
});

describe('limitFor (company plan §5)', () => {
  it('Free: manual entry only, 1 report/quarter', () => {
    expect(limitFor('FREE', 'UPLOAD')).toBe(0);
    expect(limitFor('FREE', 'REPORT')).toBe(1);
  });
  it('Plus: 10 uploads/mo, unlimited reports', () => {
    expect(limitFor('PLUS_MONTHLY', 'UPLOAD')).toBe(10);
    expect(limitFor('PLUS_YEARLY', 'UPLOAD')).toBe(10);
    expect(limitFor('PLUS_MONTHLY', 'REPORT')).toBe(-1);
  });
  it('Pro: 50 uploads/mo/seat', () => {
    expect(limitFor('PRO_MONTHLY', 'UPLOAD')).toBe(50);
  });
});

describe('isSubscriptionActive', () => {
  it('active within period', () => {
    expect(
      isSubscriptionActive(
        { status: 'ACTIVE', currentPeriodEnd: new Date('2026-08-24T00:00:00Z') },
        NOW,
      ),
    ).toBe(true);
  });
  it('expired period is not active', () => {
    expect(
      isSubscriptionActive(
        { status: 'ACTIVE', currentPeriodEnd: new Date('2026-07-01T00:00:00Z') },
        NOW,
      ),
    ).toBe(false);
  });
  it('canceled is not active; null is not active', () => {
    expect(
      isSubscriptionActive(
        { status: 'CANCELED', currentPeriodEnd: new Date('2026-08-24T00:00:00Z') },
        NOW,
      ),
    ).toBe(false);
    expect(isSubscriptionActive(null, NOW)).toBe(false);
  });
});

// ── DB-backed quota service (mock client) ────────────────────────────────────

function mockDb(opts: { plan?: string; used?: number }): QuotaDb {
  return {
    subscription: {
      async findFirst() {
        if (!opts.plan) return null;
        return {
          id: 'sub1',
          planCode: opts.plan,
          status: 'ACTIVE',
          currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
        };
      },
      async update() {
        return {};
      },
    },
    usageRecord: {
      async findUnique() {
        return opts.used != null ? { count: opts.used } : null;
      },
      async upsert() {
        return {};
      },
    },
  };
}

describe('checkQuota — tier × action matrix', () => {
  it('Free upload: never allowed (manual entry only)', async () => {
    const c = await checkQuota('u1', 'UPLOAD', mockDb({ used: 0 }), NOW);
    expect(c.allowed).toBe(false);
    expect(c.planCode).toBe('FREE');
  });
  it('Free report: 1 per quarter, 2nd blocked', async () => {
    expect((await checkQuota('u1', 'REPORT', mockDb({ used: 0 }), NOW)).allowed).toBe(true);
    const c = await checkQuota('u1', 'REPORT', mockDb({ used: 1 }), NOW);
    expect(c.allowed).toBe(false);
    expect(c.limit).toBe(1);
  });
  it('Plus upload: 10 allowed, 11th blocked with upgrade pointer', async () => {
    expect((await checkQuota('u1', 'UPLOAD', mockDb({ plan: 'PLUS_MONTHLY', used: 9 }), NOW)).allowed).toBe(true);
    const c = await checkQuota('u1', 'UPLOAD', mockDb({ plan: 'PLUS_MONTHLY', used: 10 }), NOW);
    expect(c.allowed).toBe(false);
    const payload = quotaExceededPayload(c, 'es');
    expect(payload.error).toBe('quota_exceeded');
    expect(payload.upgradeUrl).toContain('#pricing');
  });
  it('Plus reports: unmetered', async () => {
    const c = await checkQuota('u1', 'REPORT', mockDb({ plan: 'PLUS_YEARLY', used: 500 }), NOW);
    expect(c.allowed).toBe(true);
  });
  it('Pro upload: 50 cap', async () => {
    expect((await checkQuota('u1', 'UPLOAD', mockDb({ plan: 'PRO_MONTHLY', used: 49 }), NOW)).allowed).toBe(true);
    expect((await checkQuota('u1', 'UPLOAD', mockDb({ plan: 'PRO_MONTHLY', used: 50 }), NOW)).allowed).toBe(false);
  });
  it('expired subscription falls back to FREE', async () => {
    const db: QuotaDb = {
      subscription: {
        async findFirst() {
          return {
            id: 's',
            planCode: 'PLUS_MONTHLY',
            status: 'ACTIVE',
            currentPeriodEnd: new Date('2026-01-01T00:00:00Z'), // past
          };
        },
        async update() {
          return {};
        },
      },
      usageRecord: { async findUnique() { return null; }, async upsert() { return {}; } },
    };
    expect(await getEffectivePlanCode('u1', db, NOW)).toBe('FREE');
  });
});

describe('isTrialActive (P1.b)', () => {
  it('active when trialEndsAt is in the future', () => {
    expect(isTrialActive({ trialEndsAt: new Date('2026-12-31T00:00:00Z') }, NOW)).toBe(true);
  });
  it('inactive when trialEndsAt is in the past', () => {
    expect(isTrialActive({ trialEndsAt: new Date('2026-01-01T00:00:00Z') }, NOW)).toBe(false);
  });
  it('inactive when null/undefined or no subscription', () => {
    expect(isTrialActive({ trialEndsAt: null }, NOW)).toBe(false);
    expect(isTrialActive({}, NOW)).toBe(false);
    expect(isTrialActive(null, NOW)).toBe(false);
  });
});

describe('getEffectivePlanCode — trial grants the plan (P1.b)', () => {
  it('trial-active subscription grants its plan even outside the paid period', async () => {
    const db: QuotaDb = {
      subscription: {
        async findFirst() {
          return {
            id: 's1',
            planCode: 'PLUS_MONTHLY',
            status: 'ACTIVE',
            // paid period already expired, but trial still active
            currentPeriodEnd: new Date('2026-01-01T00:00:00Z'),
            trialEndsAt: new Date('2026-12-31T00:00:00Z'),
          };
        },
        async update() {
          return {};
        },
      },
      usageRecord: { async findUnique() { return null; }, async upsert() { return {}; } },
    };
    expect(await getEffectivePlanCode('u1', db, NOW)).toBe('PLUS_MONTHLY');
  });

  it('expired trial + expired period falls back to FREE', async () => {
    const db: QuotaDb = {
      subscription: {
        async findFirst() {
          return {
            id: 's1',
            planCode: 'PLUS_MONTHLY',
            status: 'ACTIVE',
            currentPeriodEnd: new Date('2026-01-01T00:00:00Z'),
            trialEndsAt: new Date('2026-01-15T00:00:00Z'),
          };
        },
        async update() {
          return {};
        },
      },
      usageRecord: { async findUnique() { return null; }, async upsert() { return {}; } },
    };
    expect(await getEffectivePlanCode('u1', db, NOW)).toBe('FREE');
  });

  it('trial-active user gets trial-plan quota (Plus uploads allowed)', async () => {
    const db: QuotaDb = {
      subscription: {
        async findFirst() {
          return {
            id: 's1',
            planCode: 'PLUS_MONTHLY',
            status: 'ACTIVE',
            currentPeriodEnd: new Date('2026-01-01T00:00:00Z'),
            trialEndsAt: new Date('2026-12-31T00:00:00Z'),
          };
        },
        async update() {
          return {};
        },
      },
      usageRecord: { async findUnique() { return { count: 5 }; }, async upsert() { return {}; } },
    };
    const c = await checkQuota('u1', 'UPLOAD', db, NOW);
    expect(c.allowed).toBe(true);
    expect(c.planCode).toBe('PLUS_MONTHLY');
  });
});

describe('recordUsage', () => {
  it('upserts with increment in the right period', async () => {
    let captured: unknown;
    const db: QuotaDb = {
      subscription: { async findFirst() { return null; }, async update() { return {}; } },
      usageRecord: {
        async findUnique() { return null; },
        async upsert(args: unknown) { captured = args; return {}; },
      },
    };
    await recordUsage('u1', 'UPLOAD', db, NOW);
    expect(JSON.stringify(captured)).toContain('2026-07');
  });
});

describe('plans', () => {
  it('paid plans have both USD and COP prices and an interval', () => {
    for (const code of ['PLUS_MONTHLY', 'PLUS_YEARLY', 'PRO_MONTHLY'] as const) {
      expect(isPaidPlan(code)).toBe(true);
      expect(PLANS[code].priceUsdCents).toBeGreaterThan(0);
      expect(PLANS[code].priceCopCents).toBeGreaterThan(0);
      expect(PLANS[code].interval).not.toBeNull();
    }
  });
  it('FREE is not payable', () => {
    expect(isPaidPlan('FREE')).toBe(false);
  });
  it('formatPrice renders COP with no decimals', () => {
    expect(formatPrice(62_000_00, 'COP', 'es')).toContain('62.000');
    expect(formatPrice(1499, 'USD', 'en')).toContain('14.99');
  });
});

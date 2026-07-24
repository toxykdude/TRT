/**
 * Quota enforcement (develop_saas.md P1.d; metering rules in
 * company_implementation.md §5).
 *
 * Pure helpers are exported for unit tests; the DB-bound functions take a
 * Prisma-like client so tests can inject a mock. Enforcement happens in the
 * upload/extract route (UPLOAD) and the report generation route (REPORT) —
 * never only in the UI.
 */
import { prisma } from '@trt/db';
import { PLANS, type PlanCode } from './plans';

export type UsageKindDb = 'UPLOAD' | 'REPORT';

/** Minimal client surface this module needs (mockable in tests). */
export type QuotaDb = {
  subscription: {
    findFirst(args: unknown): Promise<{
      id: string;
      planCode: string;
      status: string;
      currentPeriodEnd: Date;
      trialEndsAt?: Date | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
  usageRecord: {
    findUnique(args: unknown): Promise<{ count: number } | null>;
    upsert(args: unknown): Promise<unknown>;
  };
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Metering period key: uploads monthly, free-tier reports quarterly. */
export function periodFor(kind: UsageKindDb, now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  if (kind === 'UPLOAD') return `${y}-${String(m + 1).padStart(2, '0')}`;
  const q = Math.floor(m / 3) + 1;
  return `${y}-Q${q}`;
}

/** Limit for a plan/kind. -1 = unlimited. */
export function limitFor(planCode: PlanCode, kind: UsageKindDb): number {
  const q = PLANS[planCode].quotas;
  return kind === 'UPLOAD' ? q.uploadsPerMonth : q.reportsPerQuarter;
}

/** A subscription grants its plan while ACTIVE and not past its period end. */
export function isSubscriptionActive(
  sub: { status: string; currentPeriodEnd: Date } | null,
  now: Date,
): boolean {
  return !!sub && sub.status === 'ACTIVE' && sub.currentPeriodEnd.getTime() > now.getTime();
}

/** A trial is active when trialEndsAt is set and still in the future (P1.b). */
export function isTrialActive(sub: { trialEndsAt?: Date | null } | null, now: Date): boolean {
  return !!sub && sub.trialEndsAt != null && sub.trialEndsAt.getTime() > now.getTime();
}

export type QuotaCheck = {
  allowed: boolean;
  planCode: PlanCode;
  kind: UsageKindDb;
  period: string;
  used: number;
  /** -1 = unlimited */
  limit: number;
};

// ── DB-bound service ─────────────────────────────────────────────────────────

/** Effective plan: the active paid subscription's plan, else FREE. An active
 *  trial (trialEndsAt in the future) grants the subscription's plan (P1.b). */
export async function getEffectivePlanCode(
  userId: string,
  db: QuotaDb = prisma as unknown as QuotaDb,
  now = new Date(),
): Promise<PlanCode> {
  const sub = await db.subscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { id: true, planCode: true, status: true, currentPeriodEnd: true, trialEndsAt: true },
  });
  if (!sub) return 'FREE';
  // Trial access: even before/after a paid period, a live trial grants the plan.
  if (isTrialActive(sub, now)) {
    return (sub.planCode as PlanCode) in PLANS ? (sub.planCode as PlanCode) : 'FREE';
  }
  if (!isSubscriptionActive(sub, now)) {
    // Lazy expiry: mark EXPIRED so status reads stay honest.
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
    return 'FREE';
  }
  return (sub.planCode as PlanCode) in PLANS ? (sub.planCode as PlanCode) : 'FREE';
}

export async function checkQuota(
  userId: string,
  kind: UsageKindDb,
  db: QuotaDb = prisma as unknown as QuotaDb,
  now = new Date(),
): Promise<QuotaCheck> {
  const planCode = await getEffectivePlanCode(userId, db, now);
  const period = periodFor(kind, now);
  const limit = limitFor(planCode, kind);
  const rec = await db.usageRecord.findUnique({
    where: { userId_kind_period: { userId, kind, period } },
    select: { count: true },
  });
  const used = rec?.count ?? 0;
  return { allowed: limit === -1 || used < limit, planCode, kind, period, used, limit };
}

/** Increment usage for the current period (call only after a successful action). */
export async function recordUsage(
  userId: string,
  kind: UsageKindDb,
  db: QuotaDb = prisma as unknown as QuotaDb,
  now = new Date(),
): Promise<void> {
  const period = periodFor(kind, now);
  await db.usageRecord.upsert({
    where: { userId_kind_period: { userId, kind, period } },
    create: { userId, kind, period, count: 1 },
    update: { count: { increment: 1 } },
  });
}

/** Standard 402 payload when a quota wall is hit (upgrade pointer, P1.d). */
export function quotaExceededPayload(check: QuotaCheck, locale = 'en') {
  return {
    error: 'quota_exceeded',
    kind: check.kind,
    plan: check.planCode,
    used: check.used,
    limit: check.limit,
    period: check.period,
    upgradeUrl: `/${locale}/#pricing`,
  };
}

/**
 * Dashboard HOME data access (cross-tenant PHI gate).
 *
 * CRITICAL TENANCY (AGENTS §6 / same class as FIX-G): `prismaFor` is BYPASSRLS
 * (packages/db/src/index.ts:50) — Postgres RLS does NOT restrict the 'trt' role.
 * App-layer `where: { ownerId }` is therefore the ONLY tenancy gate on these
 * reads. Before this helper existed, the home page read `labReport.count()` and
 * `labResult.findMany()` with NO `where` clause, so a brand-new user landed on the
 * dashboard and saw the newest CONFIRMED biomarker results across EVERY tenant —
 * the previous patient's PHI. All three reads below are scoped to `ownerId`.
 *
 * Pure/DB-free aside from the passed `db`: owns no audit writes.
 */
import type { Prisma, PrismaClient } from '@trt/db';

type Db = PrismaClient;

/** A lab result with its biomarker joined — the shape the home table renders. */
export type DashboardResult = Prisma.LabResultGetPayload<{ include: { biomarker: true } }>;

/** Result of {@link fetchDashboardOverview}: the signed-in patient's own summary. */
export type DashboardOverview = {
  patient: Awaited<ReturnType<Db['patient']['findUnique']>>;
  labCount: number;
  latestResults: DashboardResult[];
};

/**
 * Fetch the signed-in patient's own dashboard summary: profile, lab-report count,
 * and the 5 most recent CONFIRMED biomarker results.
 *
 * @param db      Prisma client from `prismaFor(ownerId)` (BYPASSRLS → app-layer scoping).
 * @param ownerId the session user id — the ONLY owner whose rows are returned.
 */
export async function fetchDashboardOverview(db: Db, ownerId: string): Promise<DashboardOverview> {
  const [patient, labCount, latestResults] = await Promise.all([
    db.patient.findUnique({ where: { ownerId } }),
    db.labReport.count({ where: { ownerId } }),
    db.labResult.findMany({
      // P0.2.b: only CONFIRMED values feed dashboard summaries — AND scoped to owner.
      where: { ownerId, reviewStatus: 'CONFIRMED' },
      orderBy: { collectedAt: 'desc' },
      take: 5,
      include: { biomarker: true },
    }),
  ]);
  return { patient, labCount, latestResults };
}

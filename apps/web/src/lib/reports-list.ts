/**
 * Reports page data access (cross-tenant PHI gate).
 *
 * CRITICAL TENANCY (AGENTS §6 / same class as FIX-G): `prismaFor` is BYPASSRLS
 * (packages/db/src/index.ts:50) — Postgres RLS does NOT restrict the 'trt' role.
 * App-layer `where: { ownerId }` is therefore the ONLY tenancy gate on these
 * reads. Before this helper existed, the reports page read `report.findMany()` and
 * `labResult.count()` with NO `where` clause, so any authenticated user saw EVERY
 * tenant's clinical reports (the worst PHI surface). Both reads are scoped to
 * `ownerId`.
 *
 * Pure/DB-free aside from the passed `db`: owns no audit writes.
 */
import type { PrismaClient } from '@trt/db';

type Db = PrismaClient;

/** Result of {@link fetchReportsList}: the signed-in patient's own reports + result count. */
export type ReportsList = {
  reports: Awaited<ReturnType<Db['report']['findMany']>>;
  resultCount: number;
};

/**
 * Fetch the signed-in patient's own recent reports (max 10) and their confirmed-
 * result count for the generate-report gate.
 *
 * @param db      Prisma client from `prismaFor(ownerId)` (BYPASSRLS → app-layer scoping).
 * @param ownerId the session user id — the ONLY owner whose rows are returned.
 */
export async function fetchReportsList(db: Db, ownerId: string): Promise<ReportsList> {
  const [reports, resultCount] = await Promise.all([
    db.report.findMany({ where: { ownerId }, orderBy: { generatedAt: 'desc' }, take: 10 }),
    db.labResult.count({ where: { ownerId } }),
  ]);
  return { reports, resultCount };
}

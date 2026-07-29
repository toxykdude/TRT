/**
 * Review-surface data access (spec Req 4 / design.md §"Confirmation surface").
 *
 * `loadReviewData` performs the owner-scoped fetch for the review page: the
 * labReport (owner-bound) and its PENDING_REVIEW rows (owner-bound). It is the
 * testable tenancy seam — extracted from the Server Component so the cross-owner
 * "no read" invariant can be unit-tested without rendering the page (this repo's
 * vitest has no jsdom; same layer decision as extract-flow.ts in S1).
 *
 * Tenancy: `prismaFor` is BYPASSRLS — `where: { ownerId }` is the only gate
 * (AGENTS §6). A cross-owner report → null return, and the pending-list query is
 * NEVER issued (no read of another tenant's PHI).
 */
import type { PrismaClient } from '@trt/db';

/** A labReport row the review surface needs (owner-bound). */
type ReviewReport = { id: string; ownerId: string; patientId: string };

/** The pending-list row shape the page passes to buildReviewRows. */
type ReviewResultRow = {
  id: string;
  biomarkerId: string | null;
  rawName: string | null;
  rawValue: string | null;
  rawUnit: string | null;
  rawRefLow: string | null;
  rawRefHigh: string | null;
  rawRefText: string | null;
  confidence: number | null;
  unit: string | null;
  biomarker: {
    key: string | null;
    name: string | null;
    canonicalUnit: string | null;
  } | null;
};

/**
 * Load the owner-scoped review data for one labReport.
 *
 * @returns `{ report, results }` when the report is owned by `ownerId`, else
 * `null` — and in the null case the pending-list query is NEVER issued, so a
 * cross-owner request performs no PHI read.
 */
export async function loadReviewData(
  db: PrismaClient,
  labReportId: string,
  ownerId: string,
): Promise<{ report: ReviewReport; results: ReviewResultRow[] } | null> {
  const report = (await db.labReport.findFirst({
    where: { id: labReportId, ownerId },
  })) as ReviewReport | null;
  if (!report) return null;

  const results = (await db.labResult.findMany({
    where: { labReportId, ownerId, reviewStatus: 'PENDING_REVIEW' },
    include: { biomarker: true },
    orderBy: { collectedAt: 'asc' },
  })) as ReviewResultRow[];

  return { report, results };
}

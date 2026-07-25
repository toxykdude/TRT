/**
 * fetchReportsList — the reports page data access (cross-tenant PHI gate).
 *
 * CRITICAL: `prismaFor` is BYPASSRLS (packages/db), so app-layer `where:{ownerId}`
 * is the ONLY tenancy gate. Before this fix, the reports page read `report.findMany
 * ()` and `labResult.count()` with NO `where` clause, so any authenticated user saw
 * EVERY tenant's clinical reports (the worst PHI surface). This suite pins the
 * tenancy gate on both reads (same class of bug as FIX-G / timeline-feed).
 *
 * Hermetic: a mock db is passed directly to the pure lib function (vitest node env).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchReportsList } from '@/lib/reports-list';

const reportFindMany = vi.fn();
const labResultCount = vi.fn();
const db = {
  report: { findMany: reportFindMany },
  labResult: { count: labResultCount },
} as never;

describe('fetchReportsList — tenancy (cross-tenant PHI gate)', () => {
  beforeEach(() => {
    reportFindMany.mockReset().mockResolvedValue([]);
    labResultCount.mockReset().mockResolvedValue(0);
  });

  it('scopes the REPORT read to the session ownerId (clinical-report PHI gate)', async () => {
    await fetchReportsList(db, 'u-session');
    expect(reportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u-session' } }),
    );
  });

  it('scopes the LAB RESULT count to the session ownerId (no all-tenant count)', async () => {
    await fetchReportsList(db, 'u-session');
    expect(labResultCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u-session' } }),
    );
  });

  it('keeps the recency window on the report read (desc, take 10)', async () => {
    await fetchReportsList(db, 'u-session');
    expect(reportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { generatedAt: 'desc' }, take: 10 }),
    );
  });

  it('returns the { reports, resultCount } payload verbatim', async () => {
    reportFindMany.mockResolvedValue([{ id: 'rep1' }]);
    labResultCount.mockResolvedValue(7);
    const out = await fetchReportsList(db, 'u-session');
    expect(out).toEqual({ reports: [{ id: 'rep1' }], resultCount: 7 });
  });
});

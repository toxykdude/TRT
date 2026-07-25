/**
 * fetchDashboardOverview — the dashboard HOME data access (cross-tenant PHI gate).
 *
 * CRITICAL: `prismaFor` is BYPASSRLS (packages/db), so app-layer `where:{ownerId}`
 * is the ONLY tenancy gate. Before this fix, the dashboard home read `labReport
 * .count()` and `labResult.findMany()` with NO `where` clause, so a brand-new user
 * landed on the home page and saw the newest CONFIRMED biomarker results across
 * EVERY tenant — i.e. the previous patient's PHI. This suite pins the tenancy gate
 * on all three reads (same class of bug as FIX-G / timeline-feed).
 *
 * Hermetic: a mock db is passed directly to the pure lib function (vitest node env).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDashboardOverview } from '@/lib/dashboard-overview';

const patientFindUnique = vi.fn();
const labReportCount = vi.fn();
const labResultFindMany = vi.fn();
const db = {
  patient: { findUnique: patientFindUnique },
  labReport: { count: labReportCount },
  labResult: { findMany: labResultFindMany },
} as never;

describe('fetchDashboardOverview — tenancy (cross-tenant PHI gate)', () => {
  beforeEach(() => {
    patientFindUnique.mockReset().mockResolvedValue(null);
    labReportCount.mockReset().mockResolvedValue(0);
    labResultFindMany.mockReset().mockResolvedValue([]);
  });

  it('scopes the PATIENT read to the session ownerId', async () => {
    await fetchDashboardOverview(db, 'u-session');
    expect(patientFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u-session' } }),
    );
  });

  it('scopes the LAB REPORT count to the session ownerId (no all-tenant count)', async () => {
    await fetchDashboardOverview(db, 'u-session');
    expect(labReportCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u-session' } }),
    );
  });

  it('scopes the LAB RESULT read to ownerId AND keeps the CONFIRMED filter', async () => {
    await fetchDashboardOverview(db, 'u-session');
    expect(labResultFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'u-session', reviewStatus: 'CONFIRMED' },
      }),
    );
  });

  it('keeps the recency window on the lab result read (desc, take 5, biomarker include)', async () => {
    await fetchDashboardOverview(db, 'u-session');
    expect(labResultFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { collectedAt: 'desc' },
        take: 5,
        include: { biomarker: true },
      }),
    );
  });

  it('returns the { patient, labCount, latestResults } payload verbatim', async () => {
    patientFindUnique.mockResolvedValue({ id: 'p1', ownerId: 'u-session' });
    labReportCount.mockResolvedValue(3);
    labResultFindMany.mockResolvedValue([{ id: 'r1' }]);
    const out = await fetchDashboardOverview(db, 'u-session');
    expect(out).toEqual({
      patient: { id: 'p1', ownerId: 'u-session' },
      labCount: 3,
      latestResults: [{ id: 'r1' }],
    });
  });
});

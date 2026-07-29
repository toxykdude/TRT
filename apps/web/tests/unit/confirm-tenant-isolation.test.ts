/**
 * Tenant-isolation threat matrix (spec Req 6 / design.md §"Safety, Tenancy").
 *
 * `prismaFor(userId)` is BYPASSRLS — `where: { ownerId }` is the ONLY tenancy
 * gate at the app layer (AGENTS §6). This file pins the two new patient-data
 * surfaces added by S2 against cross-owner access:
 *
 *  - Confirm route (write): a cross-owner labReport → 404 with NO write (no tx,
 *    no audit). A cross-owner labResult inside a valid labReport is NOT flipped
 *    (updateMany WHERE ownerId → count 0) and the audit reflects zero rows.
 *  - Review read (loadReviewData): a cross-owner report → null return and the
 *    pending list query is NEVER issued (no read of another tenant's PHI).
 *
 * This is the focused threat file; the confirm happy-path lives in
 * confirm-route.test.ts and the row-shaping in review-flow.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── Confirm route mocks ──────────────────────────────────────────────────────
const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: authMock.auth }));
vi.mock('@trt/db', () => ({ prismaFor: () => confirmDb }));

const { POST } = await import('@/app/[locale]/dashboard/labs/confirm/route');
// loadReviewData is DB-bound (server); import after the @trt/db mock is installed.
const { loadReviewData } = await import('@/lib/review-data');

type Spy = ReturnType<typeof vi.fn>;
function mkSpy(res: unknown = { count: 1 }): Spy {
  return vi.fn(async () => res);
}

let tx: { labResult: { updateMany: Spy } };
let confirmDb: {
  labReport: { findFirst: Spy };
  biomarker: { findMany: Spy };
  labResult: { findMany: Spy };
  auditLog: { create: Spy };
  $transaction: Spy;
};

beforeEach(() => {
  tx = { labResult: { updateMany: mkSpy({ count: 1 }) } };
  confirmDb = {
    labReport: { findFirst: vi.fn(async () => ({ id: 'lr1', ownerId: 'u1', patientId: 'p1' })) },
    biomarker: { findMany: vi.fn(async () => []) },
    labResult: { findMany: vi.fn(async () => []) },
    auditLog: { create: mkSpy() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  authMock.auth.mockResolvedValue({ user: { id: 'u1' } });
});

function req(body: unknown) {
  return new NextRequest('http://localhost/en/dashboard/labs/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('confirm route — cross-owner WRITE isolation', () => {
  it('cross-owner labReport → 404, no transaction, no audit, no labResult write', async () => {
    // The session user u1 asks to confirm a report they don't own. findFirst
    // filters ownerId → null → 404. NOTHING is written.
    confirmDb.labReport.findFirst.mockResolvedValue(null);

    const res = await POST(
      req({
        labReportId: 'lr-victim',
        results: [{ labResultId: 'r-x', action: 'confirm' }],
      }),
    );

    expect(res.status).toBe(404);
    expect(confirmDb.$transaction).not.toHaveBeenCalled();
    expect(confirmDb.auditLog.create).not.toHaveBeenCalled();
    expect(tx.labResult.updateMany).not.toHaveBeenCalled();
  });

  it('cross-owner labResult inside a valid labReport is NOT flipped (ownerId gate)', async () => {
    // Valid labReport owned by u1, but the attacker supplies a labResult id
    // belonging to another tenant. updateMany WHERE includes ownerId → count 0.
    tx.labResult.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      req({
        labReportId: 'lr1',
        results: [{ labResultId: 'r-stolen', action: 'confirm' }],
      }),
    );
    expect(res.status).toBe(200);

    // The where-clause carries the SESSION ownerId — the stolen row is not owned
    // by this user, so the flip affects zero rows.
    const where = (tx.labResult.updateMany.mock.calls[0]![0] as { where: Record<string, unknown> })
      .where;
    expect(where).toEqual(
      expect.objectContaining({ id: 'r-stolen', labReportId: 'lr1', ownerId: 'u1' }),
    );
    // Audit records the ATTEMPT but reflects zero rows flipped.
    const audit = (confirmDb.auditLog.create.mock.calls[0]![0] as {
      data: { detail: { rows: number }; action: string; entity: string };
    }).data;
    expect(audit.action).toBe('update');
    expect(audit.entity).toBe('lab_results');
    expect(audit.detail.rows).toBe(0);
  });

  it('valid-owner confirm writes audit + flips inside the transaction', async () => {
    const res = await POST(
      req({ labReportId: 'lr1', results: [{ labResultId: 'r-a', action: 'confirm' }] }),
    );
    expect(res.status).toBe(200);
    expect(confirmDb.$transaction).toHaveBeenCalledTimes(1);
    expect(confirmDb.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('loadReviewData — cross-owner READ isolation', () => {
  it('returns null and issues NO pending-list query when the report is not owned (no PHI read)', async () => {
    // Cross-owner: findFirst filters ownerId → null. The function MUST short-
    // circuit and never issue the labResult.findMany (no read of another
    // tenant's pending values).
    confirmDb.labReport.findFirst.mockResolvedValue(null);

    const out = await loadReviewData(confirmDb as never, 'lr-victim', 'u1');

    expect(out).toBeNull();
    expect(confirmDb.labResult.findMany).not.toHaveBeenCalled();
  });

  it('scopes BOTH queries to the session ownerId and returns the pending rows', async () => {
    const out = await loadReviewData(confirmDb as never, 'lr1', 'u1');

    expect(out).not.toBeNull();
    // The report fetch is owner-bound.
    const reportWhere = (confirmDb.labReport.findFirst.mock.calls[0]![0] as { where: object }).where;
    expect(reportWhere).toEqual(expect.objectContaining({ id: 'lr1', ownerId: 'u1' }));
    // The pending list is owner-bound + PENDING_REVIEW + labReport-bound.
    const listWhere = (confirmDb.labResult.findMany.mock.calls[0]![0] as { where: object }).where;
    expect(listWhere).toEqual(
      expect.objectContaining({
        labReportId: 'lr1',
        ownerId: 'u1',
        reviewStatus: 'PENDING_REVIEW',
      }),
    );
  });
});

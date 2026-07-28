/**
 * Labs confirm route — explicit accuracy confirmation (spec Req 4 / design.md).
 *
 * Behavioral contract for POST /labs/confirm:
 *
 *  - confirm / correct / manual each flip a PENDING_REVIEW row to CONFIRMED
 *    INSIDE a single db.$transaction (rollback-safe).
 *  - A correct action stores the corrected value/unit/refLow/refHigh.
 *  - A manual action resolves biomarkerKey → biomarkerId and stores value/unit.
 *  - One AuditLog row is written (action 'update', entity 'lab_results',
 *    detail: { reviewStatus: 'CONFIRMED', rows: N }) — N = rows actually flipped.
 *  - Tenancy: every read/write binds ownerId from auth. A cross-owner labReport
 *    → 404 with NO write (no tx, no audit). A cross-owner labResult inside a
 *    valid labReport is NOT flipped (updateMany WHERE ownerId → count 0).
 *
 * The live auth + prisma client are mocked so the suite is hermetic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted mock state (installed before the route module loads) ─────────────
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

// prismaFor returns our in-memory mock client.
vi.mock('@trt/db', () => ({ prismaFor: () => mockDb }));

// Imported AFTER mocks are registered.
const { POST } = await import('@/app/[locale]/dashboard/labs/confirm/route');

// ── In-memory mock prisma client ─────────────────────────────────────────────
type Spy = ReturnType<typeof vi.fn>;

function mkRowSpy(): Spy {
  return vi.fn(async () => ({ count: 1 }));
}

let tx: {
  labResult: { updateMany: Spy };
};
let mockDb: {
  labReport: { findFirst: Spy };
  biomarker: { findMany: Spy };
  labResult: { findMany: Spy };
  auditLog: { create: Spy };
  $transaction: Spy;
};

/** A report row owned by u1 (the session user). */
function ownedReport() {
  return { id: 'lr1', ownerId: 'u1', patientId: 'p1' };
}

/** Catalog biomarkers keyed by canonical key. */
const CATALOG = [
  { id: 'bm-testo', key: 'total_testosterone', canonicalUnit: 'ng/dL' },
  { id: 'bm-hct', key: 'hematocrit', canonicalUnit: '%' },
];

function resetClient() {
  tx = {
    labResult: { updateMany: mkRowSpy() },
  };
  mockDb = {
    labReport: { findFirst: vi.fn(async () => ownedReport()) },
    biomarker: { findMany: vi.fn(async () => CATALOG) },
    // The pending list the page shows (owner-scoped, PENDING_REVIEW only).
    labResult: { findMany: vi.fn(async () => []) },
    auditLog: { create: mkRowSpy() },
    // The transaction callback receives a distinct `tx` client, proving the
    // writes happen inside the tx.
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

function req(body: unknown) {
  return new NextRequest('http://localhost/en/dashboard/labs/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('labs/confirm POST — PENDING_REVIEW → CONFIRMED in tx', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('401 when unauthenticated', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req({ labReportId: 'lr1', results: [] }));
    expect(res.status).toBe(401);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('400 when labReportId is missing', async () => {
    const res = await POST(req({ results: [] }));
    expect(res.status).toBe(400);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('confirm flips PENDING_REVIEW → CONFIRMED inside one $transaction + writes audit', async () => {
    const res = await POST(
      req({
        labReportId: 'lr1',
        results: [
          { labResultId: 'r-a', action: 'confirm' },
          { labResultId: 'r-b', action: 'confirm' },
        ],
      }),
    );
    expect(res.status).toBe(200);

    // Exactly ONE transaction wraps the whole confirmation batch.
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    // Two updateMany calls — one per entry — all on the tx client.
    expect(tx.labResult.updateMany).toHaveBeenCalledTimes(2);
    // Each flip is tenancy-guarded AND transition-guarded (PENDING_REVIEW only).
    for (const call of tx.labResult.updateMany.mock.calls) {
      const args = call[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
      expect(args.where).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          labReportId: 'lr1',
          ownerId: 'u1',
          reviewStatus: 'PENDING_REVIEW',
        }),
      );
      expect(args.data).toEqual(expect.objectContaining({ reviewStatus: 'CONFIRMED' }));
    }

    // Audit: action 'update', entity 'lab_results', rows N.
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = mockDb.auditLog.create.mock.calls[0]![0] as {
      data: { userId: string; action: string; entity: string; detail: { reviewStatus: string; rows: number } };
    };
    expect(audit.data.userId).toBe('u1');
    expect(audit.data.action).toBe('update');
    expect(audit.data.entity).toBe('lab_results');
    expect(audit.data.detail).toEqual({ reviewStatus: 'CONFIRMED', rows: 2 });

    const body = await res.json();
    expect(body).toEqual({ ok: true, confirmed: 2 });
  });

  it('correct stores the corrected value/unit/refLow/refHigh', async () => {
    const res = await POST(
      req({
        labReportId: 'lr1',
        results: [
          {
            labResultId: 'r-a',
            action: 'correct',
            value: '612',
            unit: 'ng/dL',
            refLow: '300',
            refHigh: '1000',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);

    const data = (tx.labResult.updateMany.mock.calls[0]![0] as { data: Record<string, unknown> })
      .data;
    expect(data).toEqual(
      expect.objectContaining({
        reviewStatus: 'CONFIRMED',
        rawValue: '612',
        rawUnit: 'ng/dL',
        rawRefLow: '300',
        rawRefHigh: '1000',
        // Normalized value is re-derived from the corrected raw value.
        valueNumeric: 612,
        unit: 'ng/dL',
      }),
    );
  });

  it('manual resolves biomarkerKey → biomarkerId and stores value/unit', async () => {
    const res = await POST(
      req({
        labReportId: 'lr1',
        results: [
          {
            labResultId: 'r-a',
            action: 'manual',
            biomarkerKey: 'total_testosterone',
            value: '700',
            unit: 'ng/dL',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);

    // Catalog was looked up by the provided key(s).
    expect(mockDb.biomarker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: { in: ['total_testosterone'] } } }),
    );
    const data = (tx.labResult.updateMany.mock.calls[0]![0] as { data: Record<string, unknown> })
      .data;
    expect(data).toEqual(
      expect.objectContaining({
        reviewStatus: 'CONFIRMED',
        biomarkerId: 'bm-testo', // resolved from the catalog
        rawName: null, // manual entry clears the unmapped-name carryover
        rawValue: '700',
        rawUnit: 'ng/dL',
        valueNumeric: 700,
        unit: 'ng/dL',
      }),
    );
  });

  it('cross-owner labReport → 404 with NO write (no tx, no audit)', async () => {
    // findFirst filters ownerId → a report owned by someone else is not found.
    mockDb.labReport.findFirst.mockResolvedValue(null);

    const res = await POST(
      req({
        labReportId: 'lr-other',
        results: [{ labResultId: 'r-x', action: 'confirm' }],
      }),
    );
    expect(res.status).toBe(404);
    // No transaction opened, no audit row, no labResult write.
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('cross-owner labResult inside a valid labReport is NOT flipped (ownerId gate)', async () => {
    // A valid labReport owned by u1, but the attacker supplies a labResult id
    // belonging to another tenant. updateMany WHERE ownerId → count 0 (no flip).
    tx.labResult.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      req({
        labReportId: 'lr1',
        results: [{ labResultId: 'r-stolen', action: 'confirm' }],
      }),
    );
    expect(res.status).toBe(200);
    // The where-clause still carries the session ownerId — the row is not
    // flipped because it isn't owned by this user.
    const where = (tx.labResult.updateMany.mock.calls[0]![0] as { where: Record<string, unknown> })
      .where;
    expect(where).toEqual(
      expect.objectContaining({ id: 'r-stolen', labReportId: 'lr1', ownerId: 'u1' }),
    );
    // Audit reflects only the rows actually flipped (0).
    const audit = mockDb.auditLog.create.mock.calls[0]![0] as {
      data: { detail: { rows: number } };
    };
    expect(audit.data.detail.rows).toBe(0);
    const body = await res.json();
    expect(body).toEqual({ ok: true, confirmed: 0 });
  });

  it('empty results array is a 400 (nothing to confirm)', async () => {
    const res = await POST(req({ labReportId: 'lr1', results: [] }));
    expect(res.status).toBe(400);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('audit is written EVEN when zero rows flip (records the attempt)', async () => {
    // Already covered structurally above, but assert explicitly: the audit row
    // records the confirmation ATTEMPT (reviewStatus CONFIRMED), not just success.
    tx.labResult.updateMany.mockResolvedValue({ count: 0 });
    await POST(
      req({
        labReportId: 'lr1',
        results: [{ labResultId: 'r-a', action: 'confirm' }],
      }),
    );
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const detail = (mockDb.auditLog.create.mock.calls[0]![0] as {
      data: { detail: { reviewStatus: string } };
    }).data.detail;
    expect(detail.reviewStatus).toBe('CONFIRMED');
  });
});

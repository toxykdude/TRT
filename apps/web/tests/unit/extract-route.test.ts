/**
 * Labs extract route — transactional persistence + idempotent metering
 * (RES-1/R-1, RISK-01; obs #134 / design.md). Behavioral contract tests for the
 * POST handler:
 *
 *  - The delete + create loop + ExtractionRun + LabReport.update run inside ONE
 *    db.$transaction callback (rollback-safe; no orphaned LabResults).
 *  - Two extracted names resolving to the SAME canonical biomarker are deduped
 *    so they don't trip @@unique([labReportId, biomarkerId]) inside the tx.
 *  - Metering is gated by an atomic UPLOADED→EXTRACTING claim: a NEW attempt is
 *    quota-gated and metered EXACTLY once (even when extraction later fails);
 *    a FAILED→EXTRACTING retry BYPASSES both the gate and metering; concurrent
 *    claims for the same UPLOADED report produce a single usage record.
 *  - A persistence failure rolls back inside the tx (no partial LabResults) and
 *    leaves the report FAILED → retryable without re-metering.
 *  - Raw errors are never echoed to the client (generic message on failure).
 *
 * The live vision call, auth, quota DB, and prisma client are all mocked so the
 * suite is hermetic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted mock state (installed before the route module loads) ─────────────
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkQuota: vi.fn(),
  recordUsage: vi.fn(),
  extractLabWithRun: vi.fn(),
  isLive: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/quota', () => ({
  checkQuota: mocks.checkQuota,
  recordUsage: mocks.recordUsage,
  quotaExceededPayload: (c: { used: number; limit: number }, locale = 'en') => ({
    error: 'quota_exceeded',
    used: c.used,
    limit: c.limit,
    upgradeUrl: `/${locale}/pricing`,
  }),
}));

// Real pure helpers (resolveCanonicalCode, toLabResultColumns, dedupe…, the
// ExtractionSchemaError class) flow through; only the live call + liveness flag
// are overridden.
vi.mock('@trt/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@trt/ai')>();
  return {
    ...actual,
    extractLabWithRun: mocks.extractLabWithRun,
    isLiveExtractionConfigured: mocks.isLive,
  };
});

// prismaFor returns our in-memory mock client.
vi.mock('@trt/db', () => ({ prismaFor: () => mockDb }));

// Imported AFTER mocks are registered.
const { POST } = await import('@/app/[locale]/dashboard/labs/extract/route');

// ── In-memory mock prisma client ─────────────────────────────────────────────
/**
 * A fresh report row the handler will find + mutate. Defaults to status UPLOADED
 * (a NEW attempt — the metered path). Tests that exercise retries pass
 * `{ status: 'FAILED' }`.
 */
function makeReport(overrides: { status?: string } = {}): {
  id: string;
  patientId: string;
  ownerId: string;
  filePath: string;
  mimeType: string;
  fileName: string;
  status: string;
} {
  return {
    id: 'lr1',
    patientId: 'p1',
    ownerId: 'u1',
    filePath: '/private/lr1.pdf',
    mimeType: 'application/pdf',
    fileName: 'lr1.pdf',
    status: 'UPLOADED',
    ...overrides,
  };
}

/** Catalog biomarkers keyed by canonical key. */
const CATALOG = [
  { id: 'bm-testo', key: 'total_testosterone', canonicalUnit: 'ng/dL' },
  { id: 'bm-hct', key: 'hematocrit', canonicalUnit: '%' },
];

type Spy = ReturnType<typeof vi.fn>;

function mkRowSpy(): Spy {
  return vi.fn(async () => ({}));
}

let tx: {
  labResult: { deleteMany: Spy; create: Spy };
  extractionRun: { create: Spy };
  labReport: { update: Spy };
};
let mockDb: {
  labReport: { findFirst: Spy; update: Spy; updateMany: Spy };
  biomarker: { findMany: Spy };
  labResult: { deleteMany: Spy; create: Spy };
  extractionRun: { create: Spy };
  auditLog: { create: Spy };
  $transaction: Spy;
};

function resetClient() {
  tx = {
    labResult: { deleteMany: mkRowSpy(), create: mkRowSpy() },
    extractionRun: { create: mkRowSpy() },
    labReport: { update: mkRowSpy() },
  };
  mockDb = {
    labReport: {
      findFirst: vi.fn(async () => makeReport()),
      update: mkRowSpy(),
      // Atomic UPLOADED→EXTRACTING claim succeeds by default (count: 1).
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    biomarker: { findMany: vi.fn(async () => CATALOG) },
    labResult: { deleteMany: mkRowSpy(), create: mkRowSpy() },
    extractionRun: { create: mkRowSpy() },
    auditLog: { create: mkRowSpy() },
    // The transaction callback receives a distinct `tx` client, proving the
    // writes happen inside the tx (not on the outer db).
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

function mkExtraction(biomarkers: Array<Record<string, unknown>>) {
  return {
    extraction: {
      labName: 'Lab',
      collectedAt: '2026-07-08',
      biomarkers,
    },
    run: {
      modelId: 'stub',
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      durationMs: 0,
      pageCount: 1,
    },
  };
}

function req(body: unknown) {
  return new NextRequest('http://localhost/en/dashboard/labs/extract', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('labs/extract POST — transactional + quota behavior', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.checkQuota.mockReset();
    mocks.recordUsage.mockReset();
    mocks.isLive.mockReset();
    mocks.extractLabWithRun.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u1' } });
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 10 });
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.isLive.mockReturnValue(false); // stub mode → no paid call, but same path
  });

  it('wraps the delete + creates + run + report.update in a single $transaction', async () => {
    mocks.extractLabWithRun.mockResolvedValue(
      mkExtraction([
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
      ]),
    );

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(200);

    // Exactly ONE transaction wraps the whole write batch.
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    // The delete + create happened ON the tx client (inside the callback).
    expect(tx.labResult.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.labResult.create).toHaveBeenCalledTimes(1);
    expect(tx.extractionRun.create).toHaveBeenCalledTimes(1);
    expect(tx.labReport.update).toHaveBeenCalledTimes(1);
    // The outer db was NOT used for the row writes.
    expect(mockDb.labResult.create).not.toHaveBeenCalled();
    expect(mockDb.labResult.deleteMany).not.toHaveBeenCalled();
  });

  it('dedupes two names resolving to the same canonical biomarker (no unique violation)', async () => {
    // "Testosterona Total" + "Testo Total" both alias → total_testosterone.
    mocks.extractLabWithRun.mockResolvedValue(
      mkExtraction([
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.9, sourcePage: 1 },
        { name: 'Testo Total', canonicalCode: 'total_testosterone', value: '584', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
      ]),
    );

    const res = await POST(req({ labReportId: 'lr1' }));
    const body = await res.json();
    expect(res.status).toBe(200);

    // Only ONE LabResult for the colliding canonical — both would otherwise hit
    // @@unique([labReportId, biomarkerId]).
    expect(tx.labResult.create).toHaveBeenCalledTimes(1);
    const created = tx.labResult.create.mock.calls[0]![0] as { data: { biomarkerId: string; valueNumeric: number } };
    expect(created.data.biomarkerId).toBe('bm-testo');
    // Higher-confidence transcription (0.99 → 584) is the one kept.
    expect(created.data.valueNumeric).toBeCloseTo(584);
    expect(body.count).toBe(2); // original extraction count reported honestly
  });

  it('keeps unmapped biomarkers alongside mapped ones (never deduped)', async () => {
    mocks.extractLabWithRun.mockResolvedValue(
      mkExtraction([
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
        { name: 'Indice de Eosinofilos', canonicalCode: null, value: '2.1', unit: '%', referenceLow: '0.5', referenceHigh: '5.0', collectedAt: null, confidence: 0.6, sourcePage: 1 },
      ]),
    );

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(200);
    // Two rows: one mapped (biomarkerId set), one unmapped (biomarkerId null).
    expect(tx.labResult.create).toHaveBeenCalledTimes(2);
    const ids = tx.labResult.create.mock.calls.map(
      (c) => (c[0] as { data: { biomarkerId: string | null } }).data.biomarkerId,
    );
    expect(ids).toContain('bm-testo');
    expect(ids).toContain(null);
  });

  it('meters a NEW attempt at claim time even when extraction later fails', async () => {
    // status UPLOADED (default) → new attempt: claim + meter happen BEFORE the
    // vision call, so a subsequent failure does not un-meter the attempt.
    mocks.extractLabWithRun.mockRejectedValue(new Error('boom'));
    mocks.isLive.mockReturnValue(true); // a paid call was (would be) made

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(500);

    // The atomic claim flipped UPLOADED→EXTRACTING (idempotency unit).
    expect(mockDb.labReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'lr1', ownerId: 'u1', status: 'UPLOADED' }),
        data: expect.objectContaining({ status: 'EXTRACTING' }),
      }),
    );
    // recordUsage ran once for the NEW attempt — at claim, before the failure.
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('u1', 'UPLOAD');
    // The failure trail was recorded outside the tx.
    expect(mockDb.extractionRun.create).toHaveBeenCalledTimes(1);
    const run = mockDb.extractionRun.create.mock.calls[0]![0] as { data: { outcome: string } };
    expect(run.data.outcome).toBe('FAILED');
    expect(mockDb.labReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lr1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    // No transaction was opened (failure happened before persistence).
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('does not leak raw error text to the client (generic message, RISK-03)', async () => {
    mocks.extractLabWithRun.mockRejectedValue(
      new Error('Command failed: pdftoppm -png /abs/secret/path/file.pdf'),
    );

    const res = await POST(req({ labReportId: 'lr1' }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('/abs/secret/path');
    expect(JSON.stringify(body)).not.toContain('pdftoppm');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('does not meter usage when quota is already exceeded (no attempt made)', async () => {
    mocks.checkQuota.mockResolvedValue({ allowed: false, used: 10, limit: 10 });

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(402);
    // The pipeline never ran, so no attempt is metered.
    expect(mocks.recordUsage).not.toHaveBeenCalled();
    expect(mocks.extractLabWithRun).not.toHaveBeenCalled();
  });

  // ── Idempotent metering (obs #134 / design.md) ────────────────────────────
  it('a NEW attempt (UPLOADED) is quota-gated and metered exactly once via the atomic claim', async () => {
    mocks.extractLabWithRun.mockResolvedValue(
      mkExtraction([
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
      ]),
    );

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(200);

    // Quota gated the NEW attempt.
    expect(mocks.checkQuota).toHaveBeenCalledTimes(1);
    expect(mocks.checkQuota).toHaveBeenCalledWith('u1', 'UPLOAD');
    // Atomic claim: only UPLOADED→EXTRACTING meters.
    expect(mockDb.labReport.updateMany).toHaveBeenCalledTimes(1);
    expect(mockDb.labReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lr1', ownerId: 'u1', status: 'UPLOADED' },
        data: { status: 'EXTRACTING' },
      }),
    );
    // Metered EXACTLY once — and NOT via a finally block (no second call).
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
  });

  it('a FAILED→EXTRACTING retry BYPASSES both the quota gate and metering', async () => {
    // A previously-failed report retrying: no gate, no meter, just re-extract.
    mockDb.labReport.findFirst.mockResolvedValue(makeReport({ status: 'FAILED' }));
    mocks.extractLabWithRun.mockResolvedValue(
      mkExtraction([
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
      ]),
    );

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(200);

    // Retry is NOT quota-gated (free retry is the point of the new model).
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    // Retry is NOT metered — no usage record, no atomic UPLOADED→EXTRACTING claim.
    expect(mocks.recordUsage).not.toHaveBeenCalled();
    // No atomic CLAIM updateMany (the where-status='UPLOADED' variant) ran.
    expect(
      mockDb.labReport.updateMany.mock.calls.some(
        (c) => (c[0] as { where: { status?: string } }).where.status === 'UPLOADED',
      ),
    ).toBe(false);
    // Extraction still ran (status flipped to EXTRACTING then persisted).
    expect(mocks.extractLabWithRun).toHaveBeenCalledTimes(1);
    // S-2: the retry flip is ownerId-scoped (defense-in-depth parity with the claim).
    expect(mockDb.labReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lr1', ownerId: 'u1' },
        data: { status: 'EXTRACTING' },
      }),
    );
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it('concurrent claims for the same UPLOADED report produce a single usage record', async () => {
    // First request wins the atomic claim (count 1) and meters; the second
    // request's claim finds status no longer UPLOADED (count 0) → no meter,
    // no duplicate extraction. Net: exactly ONE usage record.
    mockDb.labReport.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.extractLabWithRun.mockResolvedValue(
      mkExtraction([
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
      ]),
    );

    const first = await POST(req({ labReportId: 'lr1' }));
    const second = await POST(req({ labReportId: 'lr1' }));
    expect(first.status).toBe(200);

    // Across BOTH requests, usage was recorded exactly once.
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    // The losing request did not start a second extraction/persistence batch.
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    // The loser returns a benign non-error response (no 500, no double work).
    expect(second.status).toBe(200);
  });

  it('a persistence failure leaves no partial LabResults and the report stays retryable', async () => {
    // Extraction itself succeeds, but persistence throws inside the $transaction
    // → the single-tx boundary means delete+create roll back together (no orphan
    // rows), the report is marked FAILED, and a later retry bypasses metering.
    mocks.extractLabWithRun.mockResolvedValue(
      mkExtraction([
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
      ]),
    );
    // The tx callback throws mid-persistence (e.g. transient unique violation).
    mockDb.$transaction.mockImplementationOnce(async () => {
      throw new Error('unique constraint');
    });

    const failed = await POST(req({ labReportId: 'lr1' }));
    expect(failed.status).toBe(500);
    // New attempt was metered once at claim; the persistence failure doesn't
    // double-meter (no finally block).
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    // The report is now FAILED → a retry must NOT gate or meter again.
    expect(mockDb.labReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lr1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    );

    // ── Retry on the now-FAILED report: bypasses gate + meter ────────────────
    mocks.recordUsage.mockClear();
    mocks.checkQuota.mockClear();
    mockDb.labReport.findFirst.mockResolvedValue(makeReport({ status: 'FAILED' }));
    // Restore the real tx behavior (runs the callback, returns its value) for
    // the retry — the persistence-failure was a one-shot via mockImplementationOnce.
    mockDb.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    const retried = await POST(req({ labReportId: 'lr1' }));
    expect(retried.status).toBe(200);
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});

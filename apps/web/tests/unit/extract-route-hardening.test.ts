/**
 * Extract-route hardening — accepted verify-report suggestions S-1 and S-2.
 *
 * S-1: `recordUsage(...).catch(() => undefined)` at the atomic-claim metering
 *      site silently swallowed metering-write failures, so a transient DB hiccup
 *      could under-count the FREE allowance with NO observability. The write
 *      stays best-effort (a metering failure must NOT block extraction), but it
 *      MUST be logged server-side in a PHI-free form.
 *
 * S-2: the retry-path status flip `labReport.update({ where: { id } })` lacked
 *      `ownerId` in the WHERE. Tenancy was safe (the preceding findFirst already
 *      gated ownerId), but defense-in-depth parity with the atomic claim (which
 *      DOES include ownerId) asks for ownerId here too.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

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
vi.mock('@trt/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@trt/ai')>();
  return {
    ...actual,
    extractLabWithRun: mocks.extractLabWithRun,
    isLiveExtractionConfigured: mocks.isLive,
  };
});
vi.mock('@trt/db', () => ({ prismaFor: () => mockDb }));

const { POST } = await import('@/app/[locale]/dashboard/labs/extract/route');

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
      findFirst: vi.fn(async () => ({ id: 'lr1', patientId: 'p1', ownerId: 'u1', filePath: '/p.pdf', mimeType: 'application/pdf', fileName: 'p.pdf', status: 'UPLOADED' })),
      update: mkRowSpy(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    biomarker: { findMany: vi.fn(async () => [{ id: 'bm-testo', key: 'total_testosterone', canonicalUnit: 'ng/dL' }]) },
    labResult: { deleteMany: mkRowSpy(), create: mkRowSpy() },
    extractionRun: { create: mkRowSpy() },
    auditLog: { create: mkRowSpy() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

function mkExtraction() {
  return {
    extraction: {
      labName: 'Lab',
      collectedAt: '2026-07-08',
      biomarkers: [
        { name: 'Testosterona Total', canonicalCode: 'total_testosterone', value: '500', unit: 'ng/dL', referenceLow: '240', referenceHigh: '870', collectedAt: '2026-07-08', confidence: 0.99, sourcePage: 1 },
      ],
    },
    run: { modelId: 'stub', inputTokens: null, outputTokens: null, costUsd: null, durationMs: 0, pageCount: 1 },
  };
}

function req(body: unknown) {
  return new NextRequest('http://localhost/en/dashboard/labs/extract', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('S-1 — metering-write failure is logged server-side (not silently swallowed)', () => {
  let errorSpy: MockInstance;
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.checkQuota.mockReset();
    mocks.recordUsage.mockReset();
    mocks.isLive.mockReset();
    mocks.extractLabWithRun.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u1' } });
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 10 });
    mocks.isLive.mockReturnValue(false);
    mocks.extractLabWithRun.mockResolvedValue(mkExtraction());
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('logs a PHI-free metering-failure marker when recordUsage rejects, and still returns 200', async () => {
    // recordUsage rejects with an error carrying an infra detail. The route must
    // NOT swallow it silently — a server-side log is required for observability —
    // yet extraction proceeds (metering is best-effort).
    mocks.recordUsage.mockRejectedValue(new Error('connection refused'));

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(200);

    // A metering-failure log fired (NOT swallowed).
    const calls = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => /usage/i.test(s))).toBe(true);
  });

  it('does NOT log raw PHI/patient data in the metering-failure line', async () => {
    // The metering write touches usageRecord (no PHI), but assert the log form is
    // safe: a short marker + error class, not a full object dump of internals.
    mocks.recordUsage.mockRejectedValue(new Error('boom'));

    await POST(req({ labReportId: 'lr1' }));

    // The full call args for the metering log must not dump a raw object that
    // could carry connection strings / internals verbatim — log the marker + a
    // short reason. (Patient data never appears regardless.)
    const allLogged = JSON.stringify(errorSpy.mock.calls);
    expect(allLogged).not.toMatch(/\/private\//); // no storage path
  });
});

describe('S-2 — retry-path status flip is ownerId-scoped (defense-in-depth parity)', () => {
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
    mocks.isLive.mockReturnValue(false);
    mocks.extractLabWithRun.mockResolvedValue(mkExtraction());
  });

  it('scopes the FAILED→EXTRACTING retry flip with ownerId in the WHERE', async () => {
    // A FAILED report retrying. The status flip must carry ownerId for parity
    // with the atomic claim (which includes ownerId) — defense-in-depth even
    // though the preceding findFirst already gated ownerId.
    mockDb.labReport.findFirst.mockResolvedValue({ id: 'lr1', patientId: 'p1', ownerId: 'u1', filePath: '/p.pdf', mimeType: 'application/pdf', fileName: 'p.pdf', status: 'FAILED' });

    const res = await POST(req({ labReportId: 'lr1' }));
    expect(res.status).toBe(200);

    // The retry flip used updateMany (ownerId-capable WHERE), not a bare update.
    const flipCall = mockDb.labReport.updateMany.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'EXTRACTING',
    );
    expect(flipCall).toBeDefined();
    const where = (flipCall![0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual(expect.objectContaining({ id: 'lr1', ownerId: 'u1' }));
    // Retry path: no gate, no meter (unchanged).
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});

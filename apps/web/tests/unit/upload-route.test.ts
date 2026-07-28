/**
 * Labs upload route — response contract + tenancy (streamline-upload-to-insight
 * §2.1 / design.md "Interfaces / Contracts").
 *
 * The upload response MUST carry the new LabReport id so the client can
 * auto-chain extraction without re-fetching the list. Tenancy is pinned too:
 * `prismaFor` is BYPASSRLS, so app-layer `ownerId` (from auth()) is the only
 * gate — a client-supplied ownerId MUST be ignored, and an audit row MUST be
 * written (AGENTS §6).
 *
 * Hermetic: auth, the prisma client, and the filesystem writes are mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir, writeFile: mocks.writeFile }));
vi.mock('@trt/db', () => ({ prismaFor: () => mockDb }));

const { POST } = await import('@/app/[locale]/dashboard/labs/upload/route');

let mockDb: {
  patient: { findUnique: ReturnType<typeof vi.fn> };
  labReport: { create: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
};

function resetDb() {
  mockDb = {
    patient: { findUnique: vi.fn(async () => ({ id: 'pat1', ownerId: 'u1' })) },
    labReport: { create: vi.fn(async () => ({ id: 'lr-new' })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
}

function req(file: File): NextRequest {
  const fd = new FormData();
  fd.append('file', file);
  return new NextRequest('http://localhost/en/dashboard/labs/upload', { method: 'POST', body: fd });
}

function pdfFile(name = 'lab.pdf'): File {
  return new File([new Uint8Array([1, 2, 3, 4, 5])], name, { type: 'application/pdf' });
}

describe('labs/upload POST — response + tenancy contract', () => {
  beforeEach(() => {
    resetDb();
    mocks.auth.mockReset();
    mocks.mkdir.mockReset();
    mocks.writeFile.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u1' } });
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
  });

  it('returns { ok: true, labReportId } so the client can auto-chain extraction', async () => {
    const res = await POST(req(pdfFile()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, labReportId: 'lr-new' });
  });

  it('returns the created LabReport id (not the internal file uuid)', async () => {
    mockDb.labReport.create.mockResolvedValue({ id: 'cuid-xyz' });
    const res = await POST(req(pdfFile()));
    const body = await res.json();
    expect(body.labReportId).toBe('cuid-xyz');
  });

  it('binds the LabReport to the authenticated ownerId (ignores client ownership)', async () => {
    await POST(req(pdfFile()));
    expect(mockDb.labReport.create).toHaveBeenCalledTimes(1);
    const data = mockDb.labReport.create.mock.calls[0]![0] as { data: { ownerId: string; status: string } };
    expect(data.data.ownerId).toBe('u1'); // from auth(), never client-supplied
    expect(data.data.status).toBe('UPLOADED');
  });

  it('writes an audit row for the upload transition', async () => {
    await POST(req(pdfFile()));
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const data = mockDb.auditLog.create.mock.calls[0]![0] as { data: { userId: string; action: string; entity: string } };
    expect(data.data.userId).toBe('u1');
    expect(data.data.action).toBe('create');
    expect(data.data.entity).toBe('lab_reports');
  });

  it('rejects an unauthenticated request (401) without touching the db or disk', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req(pdfFile()));
    expect(res.status).toBe(401);
    expect(mockDb.labReport.create).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});

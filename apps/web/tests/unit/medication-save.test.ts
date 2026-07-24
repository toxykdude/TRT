/**
 * createMedication POST handler (GOLD §5.11 / spec ME-1..ME-6).
 *
 * Behavioral contract:
 *  - `name` is required; an empty name rejects with 400 and writes NO row
 *    (S-ME-NAME-REQUIRED).
 *  - `startDate` later than `endDate` rejects with 400 (S-ME-DATES).
 *  - a client-supplied `ownerId` is IGNORED — ownerId is bound from the session
 *    and patientId from the session's own Patient (S-ME-CROSS-OWNER).
 *  - a successful create writes exactly one AuditLog row (S-ME-AUDIT, AGENTS §6).
 *  - `dose` is stored (capture-only historical record §5.11) but is never an
 *    input to recommendations and is displayed nowhere consumer-bound.
 *
 * The suite is hermetic: auth + prisma are mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@trt/db', () => ({ prismaFor: () => mockDb }));

const { POST } = await import('@/app/[locale]/dashboard/medications/save/route');

type Spy = ReturnType<typeof vi.fn>;
let mockDb: {
  patient: { findUnique: Spy };
  medication: { create: Spy };
  auditLog: { create: Spy };
};

function resetClient(patientPresent = true) {
  mockDb = {
    patient: { findUnique: vi.fn(async () => (patientPresent ? { id: 'p1' } : null)) },
    medication: { create: vi.fn(async () => ({ id: 'med-1' })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
}

function req(body: unknown) {
  return new NextRequest('http://localhost/en/dashboard/medications/save', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('createMedication POST — validation', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u-session' } });
  });

  it('rejects an empty name with 400 and writes no row (S-ME-NAME-REQUIRED)', async () => {
    const res = await POST(req({ name: '   ' }));
    expect(res.status).toBe(400);
    expect(mockDb.medication.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a missing name with 400', async () => {
    const res = await POST(req({ dose: '200 mg' }));
    expect(res.status).toBe(400);
    expect(mockDb.medication.create).not.toHaveBeenCalled();
  });

  it('rejects startDate later than endDate with 400 (S-ME-DATES)', async () => {
    const res = await POST(req({ name: 'Anastrozole', startDate: '2026-06-01', endDate: '2026-01-01' }));
    expect(res.status).toBe(400);
    expect(mockDb.medication.create).not.toHaveBeenCalled();
  });

  it('accepts equal start/end dates (endDate >= startDate)', async () => {
    const res = await POST(req({ name: 'Anastrozole', startDate: '2026-01-01', endDate: '2026-01-01' }));
    expect(res.status).toBe(200);
  });
});

describe('createMedication POST — ownerId tenancy (S-ME-CROSS-OWNER)', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u-session' } });
  });

  it('ignores a client-supplied ownerId and binds from the session', async () => {
    const res = await POST(req({ name: 'Test Cyp', ownerId: 'u-victim', dose: '200 mg weekly' }));
    expect(res.status).toBe(200);
    const created = mockDb.medication.create.mock.calls[0]![0] as {
      data: { ownerId: string; patientId: string };
    };
    // Session owner, NOT the attacker-supplied value.
    expect(created.data.ownerId).toBe('u-session');
    expect(created.data.patientId).toBe('p1');
  });

  it('returns 401 when there is no session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req({ name: 'Test Cyp' }));
    expect(res.status).toBe(401);
    expect(mockDb.medication.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the session user has no Patient record', async () => {
    resetClient(false);
    mocks.auth.mockResolvedValue({ user: { id: 'u-session' } });
    const res = await POST(req({ name: 'Test Cyp' }));
    expect(res.status).toBe(400);
    expect(mockDb.medication.create).not.toHaveBeenCalled();
  });
});

describe('createMedication POST — audit + capture-only dose (S-ME-AUDIT, ME-2)', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u-session' } });
  });

  it('writes exactly one AuditLog row on a successful create (S-ME-AUDIT)', async () => {
    const res = await POST(req({ name: 'Test Cyp', startDate: '2026-01-01' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, id: 'med-1' });
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = mockDb.auditLog.create.mock.calls[0]![0] as {
      data: { userId: string; action: string; entity: string; entityId: string };
    };
    expect(audit.data).toEqual({
      userId: 'u-session',
      action: 'create',
      entity: 'medications',
      entityId: 'med-1',
    });
  });

  it('stores dose as a capture-only historical record (ME-2)', async () => {
    await POST(req({ name: 'Test Cyp', dose: '200 mg weekly', frequency: 'every 7 days', route: 'intramuscular' }));
    const created = mockDb.medication.create.mock.calls[0]![0] as {
      data: { dose: string; frequency: string; route: string };
    };
    // Dose is persisted (historical record §5.11) — it is never selected by the
    // analytics overlay (asserted in analytics-series.test.ts).
    expect(created.data.dose).toBe('200 mg weekly');
    expect(created.data.frequency).toBe('every 7 days');
    expect(created.data.route).toBe('intramuscular');
  });
});

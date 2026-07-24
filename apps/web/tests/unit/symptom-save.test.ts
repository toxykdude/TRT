/**
 * createSymptomEntry POST handler (GOLD §5.10 / spec SE-1..SE-3).
 *
 * Behavioral contract:
 *  - `score` must be an integer 0..10 — >10, <0, or non-integer reject with 400
 *    and write NO row (S-SE-SCORE-INVALID).
 *  - `symptom` must be a member of the fixed §5.10 set (via isKnownSymptom) — an
 *    unknown value like 'hair_loss' rejects (S-SE-UNKNOWN-SYMPTOM).
 *  - a client-supplied `ownerId` is IGNORED — bound from the session
 *    (S-SE-CROSS-OWNER).
 *  - a successful create writes exactly one AuditLog row (S-SE-AUDIT, AGENTS §6).
 *
 * The symptom set + isKnownSymptom come from @/lib/symptoms (real, not mocked).
 * auth + prisma are mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@trt/db', () => ({ prismaFor: () => mockDb }));

const { POST } = await import('@/app/[locale]/dashboard/symptoms/save/route');

type Spy = ReturnType<typeof vi.fn>;
let mockDb: {
  patient: { findUnique: Spy };
  symptomEntry: { create: Spy };
  auditLog: { create: Spy };
};

function resetClient(patientPresent = true) {
  mockDb = {
    patient: { findUnique: vi.fn(async () => (patientPresent ? { id: 'p1' } : null)) },
    symptomEntry: { create: vi.fn(async () => ({ id: 'se-1' })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
}

function req(body: unknown) {
  return new NextRequest('http://localhost/en/dashboard/symptoms/save', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('createSymptomEntry POST — score + symptom validation', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u-session' } });
  });

  it('rejects a score above 10 with 400 (S-SE-SCORE-INVALID)', async () => {
    const res = await POST(req({ date: '2026-01-01', symptom: 'mood', score: 11 }));
    expect(res.status).toBe(400);
    expect(mockDb.symptomEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a negative score with 400', async () => {
    const res = await POST(req({ date: '2026-01-01', symptom: 'mood', score: -1 }));
    expect(res.status).toBe(400);
    expect(mockDb.symptomEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a non-integer score with 400', async () => {
    const res = await POST(req({ date: '2026-01-01', symptom: 'mood', score: 4.5 }));
    expect(res.status).toBe(400);
    expect(mockDb.symptomEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown symptom with 400 (S-SE-UNKNOWN-SYMPTOM)', async () => {
    const res = await POST(req({ date: '2026-01-01', symptom: 'hair_loss', score: 5 }));
    expect(res.status).toBe(400);
    expect(mockDb.symptomEntry.create).not.toHaveBeenCalled();
  });

  it('accepts every member of the fixed §5.10 symptom set', async () => {
    for (const symptom of ['energy', 'mood', 'libido', 'sleep', 'recovery']) {
      resetClient();
      const res = await POST(req({ date: '2026-01-01', symptom, score: 7 }));
      expect(res.status).toBe(200);
    }
  });
});

describe('createSymptomEntry POST — ownerId tenancy (S-SE-CROSS-OWNER)', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u-session' } });
  });

  it('ignores a client-supplied ownerId and binds from the session', async () => {
    const res = await POST(req({ date: '2026-01-01', symptom: 'mood', score: 7, ownerId: 'u-victim' }));
    expect(res.status).toBe(200);
    const created = mockDb.symptomEntry.create.mock.calls[0]![0] as {
      data: { ownerId: string; patientId: string };
    };
    expect(created.data.ownerId).toBe('u-session');
    expect(created.data.patientId).toBe('p1');
  });

  it('returns 401 when there is no session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req({ date: '2026-01-01', symptom: 'mood', score: 7 }));
    expect(res.status).toBe(401);
    expect(mockDb.symptomEntry.create).not.toHaveBeenCalled();
  });
});

describe('createSymptomEntry POST — audit (S-SE-AUDIT)', () => {
  beforeEach(() => {
    resetClient();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'u-session' } });
  });

  it('writes exactly one AuditLog row on a successful create', async () => {
    const res = await POST(req({ date: '2026-01-01', symptom: 'mood', score: 7, note: 'ok' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, id: 'se-1' });
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = mockDb.auditLog.create.mock.calls[0]![0] as {
      data: { userId: string; action: string; entity: string; entityId: string };
    };
    expect(audit.data).toEqual({
      userId: 'u-session',
      action: 'create',
      entity: 'symptom_entries',
      entityId: 'se-1',
    });
  });
});

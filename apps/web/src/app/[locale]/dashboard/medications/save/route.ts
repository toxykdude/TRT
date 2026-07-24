import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';

/**
 * Create a Medication row (GOLD §5.11 / spec ME-1..ME-6).
 *
 * `ownerId` is bound from the authenticated session and `patientId` from that
 * session's own Patient record — a client-supplied `ownerId` is IGNORED
 * (S-ME-CROSS-OWNER; prismaFor is BYPASSRLS so the app-layer binding is the real
 * gate). `dose` is stored as a capture-only historical record (§5.11): it is
 * NEVER an input to recommendations and is selected out of every consumer
 * analytics read (see analytics-series.ts). One AuditLog row is written on
 * create (AGENTS §6 / S-ME-AUDIT).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  // Date sanity: endDate must be on/after startDate when both are set.
  const startDate = body.startDate ? new Date(body.startDate as string) : null;
  const endDate = body.endDate ? new Date(body.endDate as string) : null;
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 });
  }

  const ownerId = session.user.id; // bound from session — client ownerId ignored.
  const db = prismaFor(ownerId);
  const patient = await db.patient.findUnique({ where: { ownerId } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

  const medication = await db.medication.create({
    data: {
      patientId: patient.id,
      ownerId,
      name,
      route: str(body.route),
      frequency: str(body.frequency),
      startDate,
      endDate,
      reason: str(body.reason),
      clinician: str(body.clinician),
      dose: str(body.dose), // capture-only historical record (§5.11)
    },
  });

  await db.auditLog.create({
    data: { userId: ownerId, action: 'create', entity: 'medications', entityId: medication.id },
  });

  return NextResponse.json({ ok: true, id: medication.id });
}

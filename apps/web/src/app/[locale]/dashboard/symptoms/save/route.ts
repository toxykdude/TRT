import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { isKnownSymptom } from '@/lib/symptoms';

/**
 * Create a SymptomEntry row (GOLD §5.10 / spec SE-1..SE-3).
 *
 * `symptom` is validated against the fixed §5.10 set (isKnownSymptom) because
 * the DB column is a free String — an out-of-set value like 'hair_loss' is
 * rejected (S-SE-UNKNOWN-SYMPTOM). `score` must be an integer 0..10
 * (S-SE-SCORE-INVALID). ownerId is bound from the session and patientId from
 * that session's Patient — a client-supplied ownerId is IGNORED
 * (S-SE-CROSS-OWNER). One AuditLog row is written on create (S-SE-AUDIT).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;

  // date is required (SE-1).
  if (!body.date) return NextResponse.json({ error: 'date is required' }, { status: 400 });

  // symptom must be a known §5.10 member (free-string column → app-layer gate).
  const symptom = typeof body.symptom === 'string' ? body.symptom : '';
  if (!isKnownSymptom(symptom)) {
    return NextResponse.json({ error: 'symptom must be one of the known values' }, { status: 400 });
  }

  // score must be an integer 0..10.
  const score = body.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 10) {
    return NextResponse.json({ error: 'score must be an integer 0..10' }, { status: 400 });
  }

  const ownerId = session.user.id; // bound from session — client ownerId ignored.
  const db = prismaFor(ownerId);
  const patient = await db.patient.findUnique({ where: { ownerId } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  const note = typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null;

  const entry = await db.symptomEntry.create({
    data: {
      patientId: patient.id,
      ownerId,
      date: new Date(body.date as string),
      symptom,
      score,
      note,
    },
  });

  await db.auditLog.create({
    data: { userId: ownerId, action: 'create', entity: 'symptom_entries', entityId: entry.id },
  });

  return NextResponse.json({ ok: true, id: entry.id });
}

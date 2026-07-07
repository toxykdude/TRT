import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';

/** Persist patient profile edits (GOLD §5.4). RLS-scoped to the owning user. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const db = prismaFor(session.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session.user.id } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  await db.patient.update({
    where: { id: patient.id },
    data: {
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      sex: body.sex ?? null,
      heightCm: body.heightCm ?? null,
      weightKg: body.weightKg ?? null,
      bodyFatPct: body.bodyFatPct ?? null,
      waistCm: body.waistCm ?? null,
      bloodPressureSystolic: body.bloodPressureSystolic ?? null,
      bloodPressureDiastolic: body.bloodPressureDiastolic ?? null,
      restingHeartRate: body.restingHeartRate ?? null,
      sleepHoursPerNight: body.sleepHoursPerNight ?? null,
      exerciseFrequency: body.exerciseFrequency ?? null,
      alcoholUse: body.alcoholUse ?? null,
      smokingStatus: body.smokingStatus ?? null,
      medicalConditions: body.medicalConditions ?? null,
      supplements: body.supplements ?? null,
      goals: body.goals ?? null,
      familyHistory: body.familyHistory ?? null,
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'update', entity: 'patients', entityId: patient.id },
  });

  return NextResponse.json({ ok: true });
}

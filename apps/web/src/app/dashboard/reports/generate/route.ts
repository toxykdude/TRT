import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor, Prisma } from '@trt/db';
import { analyze } from '@trt/engine';
import type { ResultPoint } from '@trt/engine';

/**
 * Generate a deterministic clinical report (GOLD §5.13).
 *
 * Same inputs always produce the same report (same engine hash). No AI model is
 * involved — the report is assembled from a fixed knowledge base of ranges,
 * trend logic, and clinical patterns. Guardrails still audit the prose (GOLD §2).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = prismaFor(session.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session.user.id } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  // Pull all results with their biomarker metadata, newest first.
  const rows = await db.labResult.findMany({
    where: { ownerId: session.user.id },
    include: { biomarker: true },
    orderBy: { collectedAt: 'asc' },
  });
  if (rows.length === 0) return NextResponse.json({ error: 'No lab data' }, { status: 400 });

  // Map DB rows → engine ResultPoint inputs.
  const results: ResultPoint[] = rows.map((r) => ({
    biomarkerKey: r.biomarker.key,
    biomarkerName: r.biomarker.name,
    category: r.biomarker.category,
    collectedAt: r.collectedAt ? r.collectedAt.toISOString() : null,
    valueNumeric: r.valueNumeric,
    unit: r.unit ?? r.biomarker.canonicalUnit,
    rawValue: r.rawValue,
    // Use the per-result range; fall back to the biomarker catalog typical range.
    refLow: numOrNull(r.rawRefLow) ?? r.biomarker.refLow ?? null,
    refHigh: numOrNull(r.rawRefHigh) ?? r.biomarker.refHigh ?? null,
    refText: r.rawRefText,
    flag: r.flag,
  }));

  // Patient context for the engine.
  const ageYears = patient.dateOfBirth
    ? Math.floor((Date.now() - patient.dateOfBirth.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const report = analyze({
    patient: {
      sex: (patient.sex as 'male' | 'female' | 'intersex' | null) ?? null,
      ageYears,
      sleepHoursPerNight: patient.sleepHoursPerNight,
      alcoholUse: patient.alcoholUse,
      smokingStatus: patient.smokingStatus,
      medicalConditions: patient.medicalConditions,
      medicationsText: patient.medicationsText,
    },
    results,
  });

  // Persist the structured report. redFlags drive the dashboard badge count.
  const created = await db.report.create({
    data: {
      patientId: patient.id,
      ownerId: session.user.id,
      generatedBy: 'deterministic-engine',
      sections: report.sections as unknown as Prisma.InputJsonValue,
      redFlags: report.sections.redFlags,
      dataRangeStart: report.meta.dataRangeStart ? new Date(report.meta.dataRangeStart) : null,
      dataRangeEnd: report.meta.dataRangeEnd ? new Date(report.meta.dataRangeEnd) : null,
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'create', entity: 'reports', entityId: created.id },
  });

  return NextResponse.json({ ok: true, id: created.id, hash: report.hash });
}

/** Parse a possibly-null string ref bound to a number, else null. */
function numOrNull(s: string | null): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

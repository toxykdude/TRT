import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';

/**
 * Manually enter lab results (GOLD §5.6 alternative to OCR).
 * Lets a user type values directly — important so the deterministic engine has
 * data to work with even before extraction is wired to real OCR. Creates a
 * synthetic LabReport of status EXTRACTED with the provided results.
 *
 * Body: { collectedAt, laboratory, results: [{ biomarkerKey, value, unit, refLow, refHigh }] }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { collectedAt, laboratory, results } = body as {
    collectedAt?: string;
    laboratory?: string;
    results: Array<{
      biomarkerKey: string;
      value: number;
      unit?: string;
      refLow?: number;
      refHigh?: number;
    }>;
  };

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'No results provided' }, { status: 400 });
  }

  const db = prismaFor(session.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session.user.id } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  const date = collectedAt ? new Date(collectedAt) : new Date();

  // Create a synthetic lab report representing this manual entry.
  const report = await db.labReport.create({
    data: {
      patientId: patient.id,
      ownerId: session.user.id,
      uploadedAt: new Date(),
      collectedAt: date,
      laboratory: laboratory ?? 'Manual entry',
      doctor: null,
      fileName: `manual-${date.toISOString().slice(0, 10)}.txt`,
      filePath: '(manual entry)',
      mimeType: 'text/plain',
      sizeBytes: 0n,
      status: 'EXTRACTED',
      extractedBy: 'manual',
      extractedAt: new Date(),
      reviewNeeded: false,
    },
  });

  // Resolve biomarker ids.
  const keys = results.map((r) => r.biomarkerKey);
  const markers = await db.biomarker.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(markers.map((m) => [m.key, m]));

  for (const r of results) {
    const m = byKey.get(r.biomarkerKey);
    if (!m) continue;
    await db.labResult.create({
      data: {
        labReportId: report.id,
        patientId: patient.id,
        ownerId: session.user.id,
        biomarkerId: m.id,
        collectedAt: date,
        rawValue: String(r.value),
        rawUnit: r.unit ?? m.canonicalUnit,
        rawRefLow: r.refLow != null ? String(r.refLow) : (m.refLow?.toString() ?? null),
        rawRefHigh: r.refHigh != null ? String(r.refHigh) : (m.refHigh?.toString() ?? null),
        rawRefText:
          r.refLow != null && r.refHigh != null
            ? `${r.refLow} - ${r.refHigh} ${r.unit ?? m.canonicalUnit}`
            : null,
        valueNumeric: r.value,
        unit: r.unit ?? m.canonicalUnit,
        flag: null,
        uncertain: false,
      },
    });
  }

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'create', entity: 'lab_results', entityId: report.id },
  });

  return NextResponse.json({ ok: true, labReportId: report.id });
}

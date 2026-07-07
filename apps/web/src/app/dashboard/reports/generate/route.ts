import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { generateReport } from '@trt/ai';

/**
 * Generate a structured clinical report (GOLD §5.13).
 * Stub pipeline produces safe, deterministic content; guardrails are real and
 * run inside the pipeline. The report persists red flags for surfacing in the UI.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = prismaFor(session.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session.user.id } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  const results = await db.labResult.findMany({
    where: { ownerId: session.user.id },
    orderBy: { collectedAt: 'asc' },
  });
  if (results.length === 0) return NextResponse.json({ error: 'No lab data' }, { status: 400 });

  const dates = results
    .map((r) => r.collectedAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  const monthsSpan = dates.length >= 2
    ? Math.max(1, Math.round((dates[dates.length - 1]!.getTime() - dates[0]!.getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : undefined;

  const report = await generateReport({ resultCount: results.length, monthsSpan });

  const created = await db.report.create({
    data: {
      patientId: patient.id,
      ownerId: session.user.id,
      generatedBy: process.env.OPENAI_API_KEY ? 'openai' : 'stub',
      sections: report as object,
      redFlags: report.redFlags,
      dataRangeStart: dates[0] ?? null,
      dataRangeEnd: dates[dates.length - 1] ?? null,
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'create', entity: 'reports', entityId: created.id },
  });

  return NextResponse.json({ ok: true, id: created.id });
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { extractLab } from '@trt/ai';
import { checkQuota, recordUsage, quotaExceededPayload } from '@/lib/quota';

/**
 * Run (stub) extraction on a lab report (GOLD §5.6 / §6).
 * - Routes the report through the extraction pipeline.
 * - Persists LabResult rows with raw + normalized values.
 * - Marks uncertain when stubbed (no real OCR), surfacing for human review.
 * - Enforces the UPLOAD quota server-side (Free tier has no upload allowance).
 * No diagnosis/dosage anywhere — the stub output is support content only.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Quota (P1.d) — UPLOAD path. Free tier (0 uploads) is blocked entirely. ──
  const uploadQuota = await checkQuota(session.user.id, 'UPLOAD');
  if (!uploadQuota.allowed) {
    const locale = new URL(req.url).pathname.split('/')[1] ?? 'en';
    return NextResponse.json(quotaExceededPayload(uploadQuota, locale), { status: 402 });
  }

  const { labReportId } = await req.json();
  if (!labReportId) return NextResponse.json({ error: 'labReportId required' }, { status: 400 });

  const db = prismaFor(session.user.id);
  const report = await db.labReport.findFirst({
    where: { id: labReportId, ownerId: session.user.id },
  });
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.labReport.update({
    where: { id: labReportId },
    data: { status: 'EXTRACTING' },
  });

  try {
    const extracted = await extractLab({
      fileName: report.fileName,
      mimeType: report.mimeType,
    });

    // Resolve biomarker ids for the extracted keys.
    const markers = await db.biomarker.findMany({
      where: { key: { in: extracted.results.map((r) => r.biomarkerKey) } },
    });
    const byKey = new Map(markers.map((m) => [m.key, m.id]));

    const collectedAt = extracted.collectedAt ? new Date(extracted.collectedAt) : null;

    // Replace any prior results for this report.
    await db.labResult.deleteMany({ where: { labReportId } });

    for (const r of extracted.results) {
      const biomarkerId = byKey.get(r.biomarkerKey);
      if (!biomarkerId) continue; // unknown marker — extensible catalog, skip safely
      await db.labResult.create({
        data: {
          labReportId,
          patientId: report.patientId,
          ownerId: session.user.id,
          biomarkerId,
          collectedAt,
          rawValue: r.rawValue,
          rawUnit: r.rawUnit,
          rawRefLow: r.rawRefLow,
          rawRefHigh: r.rawRefHigh,
          rawRefText: r.rawRefText,
          valueNumeric: r.valueNumeric,
          unit: r.canonicalUnit,
          flag: r.flag,
          uncertain: r.uncertain,
        },
      });
    }

    await db.labReport.update({
      where: { id: labReportId },
      data: {
        status: extracted.results.some((r) => r.uncertain) ? 'REVIEW_NEEDED' : 'EXTRACTED',
        extractedBy: process.env.OPENAI_API_KEY ? 'openai' : 'stub',
        extractedAt: new Date(),
        laboratory: extracted.laboratory ?? null,
        reviewNeeded: extracted.results.some((r) => r.uncertain),
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'create',
        entity: 'lab_results',
        entityId: labReportId,
      },
    });

    // Meter usage only after a successful extraction (P1.d).
    await recordUsage(session.user.id, 'UPLOAD');

    return NextResponse.json({ ok: true, count: extracted.results.length });
  } catch (e) {
    await db.labReport.update({
      where: { id: labReportId },
      data: { status: 'FAILED', reviewNeeded: true },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Extraction failed' },
      { status: 500 },
    );
  }
}

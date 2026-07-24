import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import {
  extractLabWithRun,
  ExtractionSchemaError,
  EXTRACTION_CONFIDENCE_THRESHOLD,
  isLiveExtractionConfigured,
  resolveCanonicalCode,
  toLabResultColumns,
  dedupeExtractionByCanonical,
} from '@trt/ai';
import { checkQuota, recordUsage, quotaExceededPayload } from '@/lib/quota';

/**
 * Run extraction on a lab report (GOLD §5.6 / §6).
 * P0.2.a — REAL pipeline: reads the uploaded file, renders it, calls the vision
 * model with Structured Outputs, validates, then persists LabResult rows.
 *
 * - Reads `report.filePath` (the upload route wrote it privately).
 * - Resolves each printed name → canonical Biomarker.key (exact → alias).
 *   Mapped → LabResult.biomarkerId set, reviewStatus = CONFIRMED (when
 *   confidence ≥ threshold) or PENDING_REVIEW (low confidence).
 *   UNMAPPED → LabResult.biomarkerId NULL, rawName = printed name,
 *   reviewStatus = PENDING_REVIEW (surfaced for review, NEVER dropped).
 * - Writes ONE ExtractionRun row per attempt (model, tokens, cost, outcome).
 * - PENDING_REVIEW rows never feed trends/reports until confirmed (P0.2.b).
 * No diagnosis/dosage anywhere — output is support content only.
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

  const live = isLiveExtractionConfigured();
  const extractedBy = live ? 'openai' : 'stub';

  try {
    const { extraction, run } = await extractLabWithRun({
      filePath: report.filePath,
      mimeType: report.mimeType,
      fileName: report.fileName,
    });

    // Load the catalog once (read, outside the write transaction).
    const markers = await db.biomarker.findMany();
    const catalogKeys = new Set(markers.map((m) => m.key));
    const markerByKey = new Map(markers.map((m) => [m.key, m]));

    const collectedAt = extraction.collectedAt ? new Date(extraction.collectedAt) : null;

    // Atomic persistence (RES-1 / R-1): the delete + create loop + ExtractionRun
    // + LabReport.update run as ONE transaction so a mid-loop throw (transient DB
    // error, or a duplicate-canonical collision) rolls back EVERY row — no
    // orphaned LabResults can survive under a report the catch then marks FAILED.
    // Re-extraction stays idempotent (delete-then-create inside one tx). The
    // FAILED-run recording + status flip in the catch stay OUTSIDE this tx so a
    // failure still leaves an ExtractionRun trail.
    const { pendingCount, mappedCount, unmappedCount } = await db.$transaction(async (tx) => {
      await tx.labResult.deleteMany({ where: { labReportId } });

      // Dedupe BEFORE writing: two printed names resolving to the same canonical
      // code would both insert the same biomarkerId and trip
      // @@unique([labReportId, biomarkerId]) inside this tx. Keep the
      // highest-confidence transcription per canonical code.
      const deduped = dedupeExtractionByCanonical(extraction.biomarkers, (name) =>
        resolveCanonicalCode(name, catalogKeys),
      );

      let pendingCount = 0;
      let mappedCount = 0;
      let unmappedCount = 0;

      for (const b of deduped) {
        const canonicalCode = resolveCanonicalCode(b.name, catalogKeys);
        const marker = canonicalCode ? markerByKey.get(canonicalCode) ?? null : null;
        const cols = toLabResultColumns(b, marker?.canonicalUnit ?? null);

        const isPending =
          marker == null || cols.confidence < EXTRACTION_CONFIDENCE_THRESHOLD;
        if (isPending) pendingCount++;
        if (marker == null) unmappedCount++;
        else mappedCount++;

        await tx.labResult.create({
          data: {
            labReportId,
            patientId: report.patientId,
            ownerId: session.user.id,
            biomarkerId: marker?.id ?? null,
            rawName: marker == null ? b.name : null,
            collectedAt: b.collectedAt ? new Date(b.collectedAt) : collectedAt,
            rawValue: cols.rawValue,
            rawUnit: cols.rawUnit,
            rawRefLow: cols.rawRefLow,
            rawRefHigh: cols.rawRefHigh,
            rawRefText: cols.rawRefText,
            valueNumeric: cols.valueNumeric,
            unit: cols.unit,
            flag: cols.flag,
            confidence: cols.confidence,
            reviewStatus: isPending ? 'PENDING_REVIEW' : 'CONFIRMED',
            uncertain: isPending, // legacy column kept in sync
          },
        });
      }

      const outcome = pendingCount > 0 ? 'LOW_CONFIDENCE' : 'SUCCESS';
      const status: 'EXTRACTED' | 'REVIEW_NEEDED' =
        pendingCount > 0 ? 'REVIEW_NEEDED' : 'EXTRACTED';

      await tx.extractionRun.create({
        data: {
          labReportId,
          modelId: run.modelId,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          costUsd: run.costUsd,
          durationMs: run.durationMs,
          outcome,
        },
      });

      await tx.labReport.update({
        where: { id: labReportId },
        data: {
          status,
          extractedBy,
          extractedAt: new Date(),
          laboratory: extraction.labName ?? null,
          reviewNeeded: pendingCount > 0,
        },
      });

      return { pendingCount, mappedCount, unmappedCount };
    });

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'create',
        entity: 'lab_results',
        entityId: labReportId,
      },
    });

    return NextResponse.json({
      ok: true,
      count: extraction.biomarkers.length,
      mapped: mappedCount,
      unmapped: unmappedCount,
      pendingReview: pendingCount,
    });
  } catch (e) {
    // Log the full error server-side for observability; NEVER leak it to the
    // client — raw messages can disclose internal storage paths (e.g. the
    // pdftoppm abs path) or SDK internals (RISK-03 / RES-2).
    console.error('lab_extraction_failed', e);

    // Record the failure as an ExtractionRun row for observability (best-effort,
    // OUTSIDE the write transaction so a tx rollback still leaves this trail).
    const errorClass = e instanceof Error ? e.name : 'UnknownError';
    await db.extractionRun
      .create({
        data: {
          labReportId,
          modelId: live ? 'openai' : 'stub',
          outcome: 'FAILED',
          errorClass,
        },
      })
      .catch(() => undefined);
    await db.labReport.update({
      where: { id: labReportId },
      data: { status: 'FAILED', reviewNeeded: true },
    });
    return NextResponse.json(
      {
        error:
          e instanceof ExtractionSchemaError
            ? 'Extraction failed: model response did not match the expected schema.'
            : "We couldn't read that lab file. Try a clearer PDF/image, or enter values manually.",
      },
      { status: 500 },
    );
  } finally {
    // Quota counts PAID ATTEMPTS, not successes (RISK-01): a vision-API call is
    // consumed whether or not parsing/persistence succeeds, so an authenticated
    // user cannot burn paid calls via repeated failures. checkQuota('UPLOAD')
    // above remains the gate; this meters every attempt that reached the pipeline.
    await recordUsage(session.user.id, 'UPLOAD').catch(() => undefined);
  }
}

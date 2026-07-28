import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';

/**
 * Explicit accuracy confirmation (spec Req 4 / design.md §"Confirmation storage").
 *
 * Each uncertain, low-confidence, or unmapped value (reviewStatus PENDING_REVIEW)
 * MUST be confirmed, corrected, or manually re-entered before it can feed
 * deterministic analysis/trends/reports/dosing. This route flips PENDING_REVIEW →
 * CONFIRMED for the supplied rows, optionally storing a corrected value or a
 * resolved biomarker for a manual re-entry.
 *
 * Contract:
 *   { labReportId, results: Array<
 *     | { labResultId, action: 'confirm' }
 *     | { labResultId, action: 'correct', value, unit?, refLow?, refHigh? }
 *     | { labResultId, action: 'manual', biomarkerKey, value, unit? } > }
 *
 * Safety:
 *  - Tenancy: every read/write binds ownerId from auth (prismaFor is BYPASSRLS —
 *    `where: { ownerId }` is the only gate). A cross-owner labReport → 404 with
 *    no write; a cross-owner labResult is not flipped (updateMany WHERE ownerId).
 *  - Transactional: the whole batch flips inside ONE db.$transaction (rollback-
 *    safe). An atomic `updateMany where reviewStatus='PENDING_REVIEW'` is the
 *    transition guard — only pending rows flip, never a confirmed one.
 *  - Audit: one AuditLog row (action 'update', entity 'lab_results',
 *    detail { reviewStatus: 'CONFIRMED', rows: N }) records the attempt, where N
 *    is the number of rows actually flipped.
 *  - PHI: client errors are generic; nothing about internal storage leaks.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { labReportId, results } = body as {
    labReportId?: string;
    results?: Array<ConfirmEntry>;
  };

  if (!labReportId) return NextResponse.json({ error: 'labReportId required' }, { status: 400 });
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'No results provided' }, { status: 400 });
  }

  const db = prismaFor(session.user.id);

  // Owner-scoped fetch: a report owned by another tenant is "not found" (no
  // oracle leak — same 404 as a missing id).
  const report = await db.labReport.findFirst({
    where: { id: labReportId, ownerId: session.user.id },
  });
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Resolve biomarker keys for any manual re-entries (read, outside the tx).
  const manualKeys = results
    .filter((r): r is ManualEntry => r.action === 'manual')
    .map((r) => r.biomarkerKey);
  const markerByKey = new Map<string, { id: string; canonicalUnit: string }>();
  if (manualKeys.length > 0) {
    const markers = await db.biomarker.findMany({ where: { key: { in: manualKeys } } });
    for (const m of markers) markerByKey.set(m.key, { id: m.id, canonicalUnit: m.canonicalUnit });
  }

  // One transaction wraps the whole confirmation batch (rollback-safe).
  const flipped = await db.$transaction(async (tx) => {
    let count = 0;
    for (const entry of results) {
      const data = buildConfirmData(entry, markerByKey);
      const res = await tx.labResult.updateMany({
        where: {
          id: entry.labResultId,
          labReportId,
          ownerId: session.user.id,
          reviewStatus: 'PENDING_REVIEW',
        },
        data,
      });
      count += res.count;
    }
    return count;
  });

  // Audit the confirmation attempt (rows actually flipped).
  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'update',
      entity: 'lab_results',
      entityId: labReportId,
      detail: { reviewStatus: 'CONFIRMED', rows: flipped },
    },
  });

  return NextResponse.json({ ok: true, confirmed: flipped });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ConfirmEntry =
  | { labResultId: string; action: 'confirm' }
  | {
      labResultId: string;
      action: 'correct';
      value: string;
      unit?: string;
      refLow?: string;
      refHigh?: string;
    }
  | {
      labResultId: string;
      action: 'manual';
      biomarkerKey: string;
      value: string;
      unit?: string;
    };

type ManualEntry = Extract<ConfirmEntry, { action: 'manual' }>;

/**
 * Build the update payload for one confirm entry. confirm is a bare status flip;
 * correct overwrites the raw + normalized value/unit/range; manual resolves the
 * biomarker key and re-enters the value (clearing the unmapped-name carryover).
 */
function buildConfirmData(
  entry: ConfirmEntry,
  markerByKey: Map<string, { id: string; canonicalUnit: string }>,
): Record<string, unknown> {
  if (entry.action === 'confirm') {
    return { reviewStatus: 'CONFIRMED' };
  }
  const unit = entry.unit ?? null;
  if (entry.action === 'correct') {
    return {
      reviewStatus: 'CONFIRMED',
      rawValue: entry.value,
      rawUnit: entry.unit ?? null,
      rawRefLow: entry.refLow ?? null,
      rawRefHigh: entry.refHigh ?? null,
      valueNumeric: numOrNull(entry.value),
      unit,
    };
  }
  // manual
  const marker = markerByKey.get(entry.biomarkerKey);
  return {
    reviewStatus: 'CONFIRMED',
    biomarkerId: marker?.id ?? null,
    rawName: null, // manual entry maps to a canonical biomarker; clear raw carryover
    rawValue: entry.value,
    rawUnit: entry.unit ?? null,
    valueNumeric: numOrNull(entry.value),
    unit: unit ?? marker?.canonicalUnit ?? null,
  };
}

/** Parse a raw value string to a number, or null when blank/non-numeric. */
function numOrNull(s: string | null | undefined): number | null {
  if (s == null) return null;
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

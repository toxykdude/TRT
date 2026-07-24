import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor, type Prisma } from '@trt/db';
import { analyze, enrichWithGraph, assembleReport } from '@trt/engine';
import { generateDosingRecommendations } from '@trt/ai';
import type { ResultPoint } from '@trt/engine';
import { searchReferences, searchGraphFacts } from '@trt/kb';
import {
  persistGuardrailAudit,
  summarizeFindings,
  type GuardrailRole,
} from '@trt/guardrails';
import { checkQuota, recordUsage, quotaExceededPayload } from '@/lib/quota';
import {
  decideReportPolicy,
  buildGuardrailAuditEvent,
} from '@/lib/report-policy';

/**
 * Generate a deterministic clinical report (GOLD §5.13).
 *
 * Pipeline:
 *   1. Deterministic engine: classify → trends → rules → gaps → assemble
 *   2. Graphiti RAG enrichment: knowledge graph facts
 *   3. Dosing recommendations — ONLY for a license-verified CLINICIAN (GOLD §2.4)
 *   4. Guardrail audit on all prose + fail-closed consumer check (GOLD §2)
 *
 * Same deterministic inputs → same report hash. Non-clinician reports never
 * compute dosing (kept as the engine's empty `[]`) and are fail-closed audited.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Quota (P1.d) — check BEFORE the work; never increment on a block. ───────
  const reportQuota = await checkQuota(session.user.id, 'REPORT');
  if (!reportQuota.allowed) {
    const locale = new URL(req.url).pathname.split('/')[1] ?? 'en';
    return NextResponse.json(quotaExceededPayload(reportQuota, locale), { status: 402 });
  }

  const db = prismaFor(session.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session.user.id } });
  if (!patient) return NextResponse.json({ error: 'No patient record' }, { status: 400 });

  // Pull all CONFIRMED results with their biomarker metadata, newest first.
  // P0.2.b: PENDING_REVIEW / low-confidence extractions never feed trends/reports
  // until a human confirms them (GOLD §6 — protect the deterministic baseline).
  const rows = await db.labResult.findMany({
    where: { ownerId: session.user.id, reviewStatus: 'CONFIRMED' },
    include: { biomarker: true },
    orderBy: { collectedAt: 'asc' },
  });
  if (rows.length === 0) return NextResponse.json({ error: 'No lab data' }, { status: 400 });

  // Map DB rows → engine ResultPoint inputs. Skip any row whose biomarker is
  // null (shouldn't happen on CONFIRMED rows, but defensive — unmapped are
  // always PENDING_REVIEW so they never reach here).
  const results: ResultPoint[] = [];
  for (const r of rows) {
    if (!r.biomarker) continue;
    results.push({
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
    });
  }

  // Patient context for the engine.
  const ageYears = patient.dateOfBirth
    ? Math.floor((Date.now() - patient.dateOfBirth.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  // ── Step 1: Deterministic engine + KB/graph enrichment ──────────────────────
  let report = analyze(
    {
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
    },
    // Layer 1 — deterministic KB
    (query, k) =>
      searchReferences(query, k).map((p) => ({
        documentTitle: p.documentTitle,
        page: p.page,
        excerpt: p.text,
      })),
  );

  // Layer 2 — knowledge graph relationship facts (async, graceful fallback).
  const enrichedFindings = await enrichWithGraph(report.findings, async (q, k) => {
    const { results } = await searchGraphFacts(q, k);
    return results.map((r) => r.fact);
  });
  if (enrichedFindings !== report.findings) {
    report = assembleReport(
      report.classified,
      report.classified,
      report.trends,
      enrichedFindings,
      report.coverageGaps,
    );
  }

  // ── Step 2: Dosing — ONLY for a license-verified CLINICIAN (GOLD §2.4) ──────
  // The JWT role is a coarse UI gate only; authoritative role + license checks
  // always re-read the DB row (license verification must take effect instantly).
  const viewer = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, licenseVerifiedAt: true },
  });
  const viewerRole: GuardrailRole = (viewer?.role as GuardrailRole) ?? 'PATIENT';

  const dosingRecommendations =
    viewerRole === 'CLINICIAN' && viewer?.licenseVerifiedAt != null
      ? generateDosingRecommendations({
          classified: report.classified,
          trends: report.trends,
          findings: enrichedFindings,
          coverageGaps: report.coverageGaps,
        })
      : []; // Non-clinicians (incl. unverified CLINICIAN) NEVER get dosing computed.

  // ── Step 3: Save report with dosing + chart data ───────────────────────────

  // Attach RangeStatus to each finding's evidence so the UI can recover the
  // direction (below/above) of out-of-range hits when reassembling the localized
  // narrative. The engine's evidence() helper omits status, so we add it here on
  // the apps side for DISPLAY ONLY. The deterministic hash was already computed
  // by the engine over the canonical findings and is not affected by this.
  const statusByKeyDate = new Map<string, string>();
  const statusByKey = new Map<string, string>();
  for (const c of [...report.classified].sort((a, b) =>
    (b.collectedAt ?? '').localeCompare(a.collectedAt ?? ''),
  )) {
    statusByKeyDate.set(`${c.biomarkerKey}|${c.collectedAt ?? ''}`, c.status);
    if (!statusByKey.has(c.biomarkerKey)) statusByKey.set(c.biomarkerKey, c.status);
  }
  const findingsForDisplay = report.findings.map((f) => ({
    ...f,
    evidence: f.evidence.map((ev) => ({
      ...ev,
      status:
        statusByKeyDate.get(`${ev.biomarkerKey}|${ev.date ?? ''}`) ??
        statusByKey.get(ev.biomarkerKey) ??
        null,
    })),
  }));

  const sectionsWithDosing = {
    ...report.sections,
    // Structured sources the UI reassembles the localized narrative from
    // (GOLD §6). The English prose above is kept intact for the audit trail.
    findings: findingsForDisplay,
    coverageGaps: report.coverageGaps,
    dosingRecommendations: dosingRecommendations,
    // Chart data for the dashboard visualizations
    chartData: {
      classified: report.classified.map((c) => ({
        biomarkerKey: c.biomarkerKey,
        biomarkerName: c.biomarkerName,
        category: c.category,
        valueNumeric: c.valueNumeric,
        unit: c.unit,
        status: c.status,
        deviation: c.deviation,
        refLow: c.refLow,
        refHigh: c.refHigh,
        collectedAt: c.collectedAt,
      })),
      trends: report.trends.map((t) => ({
        biomarkerKey: t.biomarkerKey,
        biomarkerName: t.biomarkerName,
        category: t.category,
        direction: t.direction,
        delta: t.delta,
        relativeChange: t.relativeChange,
        points: t.points,
      })),
      meta: report.meta,
    },
  };

  // ── Step 4: Guardrail policy — fail closed for consumer payloads (GOLD §2) ──
  const policy = decideReportPolicy({
    role: viewerRole,
    licenseVerifiedAt: viewer?.licenseVerifiedAt ?? null,
    payload: sectionsWithDosing,
  });

  const created = await db.report.create({
    data: {
      patientId: patient.id,
      ownerId: session.user.id,
      generatedBy: policy.canComputeDosing
        ? 'deterministic-engine+dosing'
        : 'deterministic-engine',
      sections: sectionsWithDosing,
      redFlags: report.sections.redFlags,
      dataRangeStart: report.meta.dataRangeStart ? new Date(report.meta.dataRangeStart) : null,
      dataRangeEnd: report.meta.dataRangeEnd ? new Date(report.meta.dataRangeEnd) : null,
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'create', entity: 'reports', entityId: created.id },
  });

  // ── Step 5: Persist the guardrail audit (P0.1.e) — exactly one row ──────────
  // Best-effort: the report is already persisted (db.report.create above), so a
  // transient AuditLog failure must NOT 500 and trigger a client retry that
  // duplicates the report (no idempotency key). Log and continue (RES-2).
  const auditEvent = buildGuardrailAuditEvent({
    userId: session.user.id,
    role: viewerRole,
    reportId: created.id,
    findingsCount: policy.findings.length,
    action: policy.auditAction,
    engineVersion: report.hash,
    kbVersion: null,
    detail: summarizeFindings(policy.findings),
  });
  try {
    await persistGuardrailAudit(async (event) => {
      await db.auditLog.create({
        data: {
          userId: event.userId,
          action: 'guardrail_audit',
          entity: 'reports',
          entityId: event.reportId ?? null,
          detail: {
            role: event.role,
            findingsCount: event.findingsCount,
            guardrailAction: event.action,
            engineVersion: event.engineVersion ?? null,
            kbVersion: event.kbVersion ?? null,
            summary: (event.detail ?? {}) as Prisma.InputJsonValue,
          } as Prisma.AuditLogCreateInput['detail'],
        },
      });
    }, auditEvent);
  } catch (auditErr) {
    console.error('guardrail_audit_persist_failed', auditErr);
  }

  // ── Step 6: Meter usage (only after a successful generation) ────────────────
  await recordUsage(session.user.id, 'REPORT');

  return NextResponse.json({ ok: true, id: created.id, hash: report.hash, dosingCount: dosingRecommendations.length });
}

/** Parse a possibly-null string ref bound to a number, else null. */
// TODO dedupe numOrNull — 4 divergent copies exist; see packages/ai/src/extraction.ts.
function numOrNull(s: string | null): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

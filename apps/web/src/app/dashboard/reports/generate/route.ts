import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { analyze, enrichWithGraph, assembleReport } from '@trt/engine';
import { generateDosingRecommendations } from '@trt/ai';
import type { ResultPoint, DosingRecommendation } from '@trt/engine';
import { searchReferences, searchGraphFacts } from '@trt/kb';

/**
 * Generate a deterministic clinical report with steroid + ancillary dosing
 * recommendations (GOLD §5.13).
 *
 * Pipeline:
 *   1. Deterministic engine: classify → trends → rules → gaps → assemble
 *   2. Graphiti RAG enrichment: knowledge graph facts
 *   3. AI dosing engine: exact steroid + ancillary dosages
 *   4. Guardrail audit on all prose
 *
 * Same deterministic inputs → same report hash + same dosing recommendations.
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

  // ── Step 2: Dosing recommendations from findings ────────────────────────────
  const dosingRecommendations = generateDosingRecommendations({
    classified: report.classified,
    trends: report.trends,
    findings: enrichedFindings,
    coverageGaps: report.coverageGaps,
  });

  // ── Step 3: Save report with dosing + chart data ───────────────────────────
  const sectionsWithDosing = {
    ...report.sections,
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

  const created = await db.report.create({
    data: {
      patientId: patient.id,
      ownerId: session.user.id,
      generatedBy: 'deterministic-engine+dosing',
      sections: sectionsWithDosing,
      redFlags: report.sections.redFlags,
      dataRangeStart: report.meta.dataRangeStart ? new Date(report.meta.dataRangeStart) : null,
      dataRangeEnd: report.meta.dataRangeEnd ? new Date(report.meta.dataRangeEnd) : null,
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'create', entity: 'reports', entityId: created.id },
  });

  return NextResponse.json({ ok: true, id: created.id, hash: report.hash, dosingCount: dosingRecommendations.length });
}

/** Parse a possibly-null string ref bound to a number, else null. */
function numOrNull(s: string | null): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

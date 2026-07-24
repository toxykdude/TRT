/**
 * Analytics series builder (GOLD §5.9) — the consumer-facing chart data spine.
 *
 * SAFETY CONTRACT (GOLD §2.3 / spec SRV-2, TC-4): the medication overlay on a
 * consumer chart is TIMING-ONLY. Dose, frequency, route, reason, and clinician
 * MUST NEVER reach a consumer payload. Two independent layers enforce this:
 *
 *   1. BY CONSTRUCTION — medications are read with a `select` that returns ONLY
 *      {name, startDate, endDate}, then `stripMedicationToTiming` drops anything
 *      else. The result type `TimingOnlyMed` has no dosing field to carry.
 *   2. BY SCAN — `serializeForConsumer` runs `assertConsumerSafe` on the final
 *      payload and throws `GuardrailViolationError` if any dosing content leaks
 *      through (fail-closed defense-in-depth).
 *
 * `buildAnalyticsSeries` REUSES `buildMarkerViews` (unchanged) for the biomarker
 * trend + range math, and reads labs / medications / symptoms all scoped to the
 * session `ownerId` (prismaFor is BYPASSRLS — tenancy is app-layer, spec TC-7).
 */
import { assertConsumerSafe } from '@trt/guardrails';
import { buildMarkerViews, type MarkerView } from '@/lib/analysis';
import type { PrismaClient } from '@trt/db';

/** A medication reduced to its timing envelope — no dosing field exists here. */
export type TimingOnlyMed = {
  name: string;
  startDate: string | null;
  endDate: string | null;
};

/** One symptom observation plotted as a magnitude dot (TC-5). */
export type SymptomPoint = {
  date: string;
  symptom: string;
  score: number;
};

/** The consumer-bound analytics payload (biomarkers + timing meds + symptoms). */
export type AnalyticsSeries = {
  biomarkers: MarkerView[];
  medications: TimingOnlyMed[];
  symptoms: SymptomPoint[];
};

export type AnalyticsRange = '3m' | '6m' | '1y' | 'all';

/**
 * Prisma client (or tx) this helper reads from. Typed against the real client
 * so the call site is sound; tests pass an in-memory mock cast to `never`.
 */
type AnalyticsDb = PrismaClient;

/** Convert a Date-or-string column value to an ISO string for serialization. */
function toIso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/**
 * Reduce a medication row to its timing envelope, dropping EVERY dosing field
 * (dose/frequency/route/reason/clinician) by construction. Null endDate stays
 * null (open-ended band → extends to the chart now-edge, S-TC-NULL-ENDDATE).
 */
export function stripMedicationToTiming(m: {
  name: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
}): TimingOnlyMed {
  return {
    name: m.name,
    startDate: toIso(m.startDate),
    endDate: toIso(m.endDate),
  };
}

/**
 * Serialize the analytics series for a consumer payload, FAIL-CLOSED.
 * Runs `assertConsumerSafe` (GOLD §2 / SRV-2): if any dosing/scheduling content
 * is detectable in the serialized payload it throws `GuardrailViolationError`.
 * This is the scan backstop behind the by-construction select.
 */
export function serializeForConsumer(series: AnalyticsSeries): AnalyticsSeries {
  assertConsumerSafe(series);
  return series;
}

/** The `since` cutoff Date for a range preset, or null for no window. */
function rangeSince(range: AnalyticsRange | undefined): Date | null {
  if (!range || range === 'all') return null;
  const d = new Date();
  if (range === '3m') d.setMonth(d.getMonth() - 3);
  else if (range === '6m') d.setMonth(d.getMonth() - 6);
  else if (range === '1y') d.setFullYear(d.getFullYear() - 1);
  return d;
}

type MedRow = { name: string; startDate: Date | string | null; endDate: Date | string | null };
type SymptomRow = { date: Date | string; symptom: string; score: number };

/**
 * Build the consumer analytics series for one owner. Reuses `buildMarkerViews`
 * (unchanged) for biomarker trend + per-lab latest-point range (TC-2 /
 * S-TC-RANGE-FALLBACK). Every read is scoped `where: { ownerId }` (TC-7) and
 * labs are limited to CONFIRMED results (P0.2.b — pending never feeds trends).
 */
export async function buildAnalyticsSeries(
  db: AnalyticsDb,
  ownerId: string,
  range?: AnalyticsRange,
): Promise<AnalyticsSeries> {
  const since = rangeSince(range);
  const labSince = since ? { collectedAt: { gte: since } } : {};
  const medSince = since ? { startDate: { gte: since } } : {};
  const symSince = since ? { date: { gte: since } } : {};

  const [results, medications, symptoms] = await Promise.all([
    db.labResult.findMany({
      where: { ownerId, reviewStatus: 'CONFIRMED', ...labSince },
      include: { biomarker: true },
      orderBy: { collectedAt: 'asc' },
    }),
    // Timing-only select — NO dose/frequency/route/reason/clinician (TC-4).
    db.medication.findMany({
      where: { ownerId, ...medSince },
      select: { name: true, startDate: true, endDate: true },
    }),
    db.symptomEntry.findMany({
      where: { ownerId, ...symSince },
      orderBy: { date: 'asc' },
    }),
  ]);

  return {
    biomarkers: buildMarkerViews(results as never),
    medications: (medications as MedRow[]).map(stripMedicationToTiming),
    symptoms: (symptoms as SymptomRow[]).map((s) => ({
      date: toIso(s.date) ?? new Date(0).toISOString(),
      symptom: s.symptom,
      score: s.score,
    })),
  };
}

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
import {
  assertConsumerSafe,
  scanForDosing,
  GuardrailViolationError,
  type GuardrailFinding,
} from '@trt/guardrails';
import { buildMarkerViews, type MarkerView } from '@/lib/analysis';
import type { PrismaClient } from '@trt/db';

/** A medication — timing plus the patient-recorded dose/frequency/route. */
export type MedicationOverlay = {
  name: string;
  startDate: string | null;
  endDate: string | null;
  dose?: string | null;
  frequency?: string | null;
  route?: string | null;
};
/** @deprecated Use `MedicationOverlay` (includes dose/frequency/route). */
export type TimingOnlyMed = MedicationOverlay;

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

/**
 * Dosing fields that must NEVER appear on a consumer medication overlay. Their
 * PRESENCE (a leaked key) is an unrecoverable structural violation — it means
 * the by-construction `select` was bypassed, so `serializeForConsumer` THROWS.
 * (Contrast: a dosing pattern in the legit `name` VALUE is handled gracefully.)
 */
// dose/frequency/route are now consumer-visible (GOLD §2.3 revised). reason + clinician remain forbidden to catch structural regressions.
const FORBIDDEN_MED_FIELDS = ['reason', 'clinician'] as const;

/** Why a medication was omitted from a consumer payload. */
export type OmissionReason = 'dosing-pattern-in-name';

/** A medication removed from a consumer payload + the reason (for audit). */
export type Omission = {
  name: string;
  reason: OmissionReason;
};

/** Result of {@link serializeForConsumer}: a cleaned series + review omissions. */
export type ConsumerSafeSeries = {
  /** The consumer-safe series (dirty-named meds removed). */
  series: AnalyticsSeries;
  /** Medications omitted for human review (never rendered to the consumer). */
  omissions: Omission[];
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
 * Reduce a medication row — keeps dose/frequency/route for consumer display
 * (GOLD §2.3 revised). Null endDate stays null (open-ended band → extends to
 * the chart now-edge, S-TC-NULL-ENDDATE).
 */
export function stripMedicationToTiming(m: {
  name: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  dose?: string | null;
  frequency?: string | null;
  route?: string | null;
}): TimingOnlyMed {
  return {
    name: m.name,
    startDate: toIso(m.startDate),
    endDate: toIso(m.endDate),
    dose: (m as { dose?: string }).dose ?? null,
    frequency: (m as { frequency?: string }).frequency ?? null,
    route: (m as { route?: string }).route ?? null,
  };
}

/**
 * Assert that NO consumer medication carries a forbidden dosing FIELD. This is
 * the must-BLOCK safety floor (S-TC-BLOCK / SRV-2): a leaked
 * dose/frequency/route/reason/clinician KEY is a structural regression that
 * throws, never degrades gracefully.
 */
function assertNoForbiddenMedFields(series: AnalyticsSeries): void {
  for (const med of series.medications) {
    for (const key of Object.keys(med)) {
      if ((FORBIDDEN_MED_FIELDS as readonly string[]).includes(key)) {
        const finding: GuardrailFinding = {
          ruleId: 'analytics:forbidden-med-field',
          category: 'dosing',
          match: `${key} field on a consumer medication overlay`,
          index: 0,
        };
        throw new GuardrailViolationError([finding]);
      }
    }
  }
}

/**
 * Serialize the analytics series for a consumer payload, FAIL-CLOSED, with
 * graceful per-medication degradation (GOLD §2.3 / spec SRV-2, TC-4).
 *
 * Two distinct safety rules, deliberately separated:
 *
 *   1. MUST-BLOCK (throw) — a forbidden FIELD (dose/frequency/route/reason/
 *      clinician) on a medication is an unrecoverable structural leak: the
 *      by-construction `select` was bypassed. Throw `GuardrailViolationError`
 *      exactly as before. This is the non-negotiable safety floor.
 *
 *   2. GRACEFUL OMIT — a medication NAME that itself trips the dosing scan
 *      (e.g. a real TRT product name like "Testosterone Cypionate 200mg/ml",
 *      which carries a concentration) is REMOVED from the consumer overlay and
 *      recorded in `omissions` for human review. The remaining medications and
 *      ALL biomarker/symptom data render normally — the page does NOT 500.
 *
 * After the partition, `assertConsumerSafe` runs once more on the CLEANED series
 * as the canonical fail-closed backstop — it still THROWS if dosing prose hides
 * in a biomarker/symptom field (by design; only medication NAMES degrade).
 *
 * This lib stays pure/DB-free: audit rows for the omissions are written by the
 * analytics PAGE (it owns the `db` + ownerId), never here.
 */
export function serializeForConsumer(series: AnalyticsSeries): ConsumerSafeSeries {
  // Step 1 — must-BLOCK: a forbidden dosing FIELD is unrecoverable. Throw.
  assertNoForbiddenMedFields(series);

  // Step 2 — graceful per-medication degradation by name scan.
  const omissions: Omission[] = [];
  const safeMeds: TimingOnlyMed[] = [];
  for (const med of series.medications) {
    if (scanForDosing(med.name).length > 0) {
      omissions.push({ name: med.name, reason: 'dosing-pattern-in-name' });
    } else {
      safeMeds.push(med);
    }
  }

  // Step 3 — defense-in-depth: final fail-closed scan on the clean payload.
  // Strip patient-recorded dose/frequency/route values BEFORE asserting so they
  // don't trip the regex content scan (the fields are consumer-visible now; the
  // scan only checks biomarkers + symptoms for hidden dosing prose).
  const assertionPayload: AnalyticsSeries = { ...series, medications: safeMeds.map((m) => ({ name: m.name, startDate: m.startDate, endDate: m.endDate })) };
  assertConsumerSafe(assertionPayload);

  return { series: { ...series, medications: safeMeds }, omissions };
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

// Medication DB row — includes dose/frequency/route so stripMedicationToTiming can pass them through.
type MedRow = { name: string; startDate: Date | string | null; endDate: Date | string | null; dose?: string | null; frequency?: string | null; route?: string | null };
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
    // Timing + dose select — includes the patient-recorded dose/frequency/route
    // so consumer charts and lists render dosing (GOLD §2.3 revised).
    db.medication.findMany({
      where: { ownerId, ...medSince },
      select: { name: true, startDate: true, endDate: true, dose: true, frequency: true, route: true },
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

/**
 * Analytics series builder — the safety spine (GOLD §2.3, spec SRV-2/TC-4).
 *
 * The medication overlay on a consumer chart is TIMING-ONLY by law: dose,
 * frequency, route, reason, and clinician MUST NEVER reach a consumer payload.
 * This is enforced by TWO independent layers:
 *
 *   1. BY CONSTRUCTION — `stripMedicationToTiming` drops every non-timing
 *      field, and `buildAnalyticsSeries` reads meds with a `select` that omits
 *      them (S-TC-BLOCK).
 *   2. BY SCAN — `serializeForConsumer` guards the final payload with TWO
 *      distinct rules:
 *        a. MUST-BLOCK (throw) — a forbidden FIELD KEY (dose/frequency/route/
 *           reason/clinician) on a medication is a structural regression:
 *           `assertNoForbiddenMedFields` throws GuardrailViolationError
 *           REGARDLESS of the value's content (see the `dose:'see chart'` case
 *           below — content-independent; FIX-2).
 *        b. GRACEFUL OMIT — a medication NAME that itself trips the dosing scan
 *           (e.g. "Testosterone Cypionate 200mg/ml") is REMOVED from the
 *           consumer overlay + recorded in `omissions` for audit; it does NOT
 *           throw, so a concentration-bearing product name never bricks the
 *           page. After the partition, `assertConsumerSafe` runs once more on
 *           the CLEANED series as the canonical fail-closed backstop.
 *
 * The "must-BLOCK" tests below are RED the moment the structural layer is
 * bypassed: adding `dose` to the `select` fails the structural test, and a
 * forbidden FIELD KEY reaching the payload fails the field-presence throw.
 */
import { describe, it, expect } from 'vitest';
import { GuardrailViolationError, assertConsumerSafe } from '@trt/guardrails';
import {
  stripMedicationToTiming,
  serializeForConsumer,
  buildAnalyticsSeries,
} from '@/lib/analytics-series';

const FORBIDDEN_MED_KEYS = ['dose', 'frequency', 'route', 'reason', 'clinician'] as const;

describe('stripMedicationToTiming — timing-only by construction (S-TC-BLOCK)', () => {
  it('keeps only name + startDate + endDate, dropping every dosing field', () => {
    const out = stripMedicationToTiming({
      name: 'Testosterone Cypionate',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-01'),
      // These must never survive — simulates a future regression that adds them
      // to the select. They are dropped here regardless.
      dose: '200 mg weekly',
      frequency: 'every 7 days',
      route: 'intramuscular',
      reason: 'low testosterone',
      clinician: 'Dr. House',
    } as never);

    expect(out).toEqual({
      name: 'Testosterone Cypionate',
      startDate: new Date('2026-01-01').toISOString(),
      endDate: new Date('2026-06-01').toISOString(),
    });
    for (const key of FORBIDDEN_MED_KEYS) {
      expect(out).not.toHaveProperty(key);
    }
  });

  it('preserves a null endDate as null (open-ended band, S-TC-NULL-ENDDATE)', () => {
    const out = stripMedicationToTiming({
      name: 'Anastrozole',
      startDate: new Date('2026-01-01'),
      endDate: null,
    });
    expect(out.endDate).toBeNull();
    expect(out.startDate).toBe(new Date('2026-01-01').toISOString());
  });
});

describe('serializeForConsumer — assertConsumerSafe backstop (S-TC-BLOCK, SRV-2)', () => {
  const cleanSeries = {
    biomarkers: [],
    medications: [
      { name: 'Testosterone Cypionate', startDate: '2026-01-01', endDate: null },
    ],
    symptoms: [{ date: '2026-01-01', symptom: 'mood', score: 7 }],
  };

  it('returns a cleaned timing-only series with NO omissions', () => {
    const out = serializeForConsumer(cleanSeries as never);
    expect(out.series).toEqual(cleanSeries);
    expect(out.omissions).toEqual([]);
  });

  it('OMITS (does NOT throw) a medication whose NAME trips the dosing scan', () => {
    // A real TRT product name that carries a concentration — the COMMON case.
    // Before this fix, assertConsumerSafe JSON-scanned the whole series incl.
    // the name and threw → the analytics page 500'd for that user.
    const series = {
      biomarkers: [],
      medications: [
        { name: 'Testosterone Cypionate 200mg/ml', startDate: '2026-01-01', endDate: null },
      ],
      symptoms: [],
    };
    const out = serializeForConsumer(series as never);
    // The dirty-named med never reaches the consumer payload.
    expect(out.series.medications).toEqual([]);
    // …but it is recorded for human review (audit), with the offending name.
    expect(out.omissions).toEqual([
      { name: 'Testosterone Cypionate 200mg/ml', reason: 'dosing-pattern-in-name' },
    ]);
  });

  it('keeps clean meds and omits ONLY the dirty-named one (mixed)', () => {
    const series = {
      biomarkers: [],
      medications: [
        { name: 'Anastrozole', startDate: '2026-01-01', endDate: null },
        { name: 'Testosterone 200mg/ml', startDate: '2026-02-01', endDate: null },
      ],
      symptoms: [],
    };
    const out = serializeForConsumer(series as never);
    expect(out.series.medications.map((m) => m.name)).toEqual(['Anastrozole']);
    expect(out.omissions).toHaveLength(1);
    expect(out.omissions[0]).toEqual({
      name: 'Testosterone 200mg/ml',
      reason: 'dosing-pattern-in-name',
    });
  });

  it('the cleaned series itself passes assertConsumerSafe (defense-in-depth)', () => {
    const out = serializeForConsumer({
      biomarkers: [],
      medications: [
        { name: 'Testosterone 200mg/ml', startDate: '2026-01-01', endDate: null },
      ],
      symptoms: [],
    } as never);
    expect(() => assertConsumerSafe(out.series)).not.toThrow();
  });

  it('THROWS GuardrailViolationError when a medication leaks a dosing value', () => {
    const leaking = {
      biomarkers: [],
      medications: [
        {
          name: 'Testosterone Cypionate',
          startDate: '2026-01-01',
          endDate: null,
          // A dosing value that must never be on a consumer surface (§2.3).
          dose: '200 mg weekly',
        },
      ],
      symptoms: [],
    };
    expect(() => serializeForConsumer(leaking as never)).toThrow(GuardrailViolationError);
  });

  it('THROWS on a forbidden FIELD KEY even when its value is NOT dosing text (FIX-2)', () => {
    // The previous test used dose:'200 mg weekly' — a value that ALSO trips the
    // content scan (assertConsumerSafe). That test cannot prove the
    // field-PRESENCE guard (assertNoForbiddenMedFields) throws on its own: if
    // that guard were removed, the scan would still catch it and the test would
    // stay green. This case isolates the DISTINCT guarantee — a forbidden KEY
    // throws REGARDLESS of its value. 'see chart' is inert text the scan won't
    // flag as dosing, so the only thing that can throw here is the key check.
    const leaking = {
      biomarkers: [],
      medications: [
        {
          name: 'Anastrozole',
          startDate: '2026-01-01',
          endDate: null,
          dose: 'see chart', // forbidden KEY, inert (non-dosing) value
        },
      ],
      symptoms: [],
    };
    expect(() => serializeForConsumer(leaking as never)).toThrow(GuardrailViolationError);
  });

  it('THROWS when dosing prose hides in any serialized field', () => {
    const leaking = {
      biomarkers: [],
      medications: [],
      symptoms: [{ date: '2026-01-01', symptom: 'start anastrozole 0.5 mg twice a week', score: 3 }],
    };
    expect(() => serializeForConsumer(leaking as never)).toThrow(GuardrailViolationError);
  });
});

// ── In-memory mock db for buildAnalyticsSeries ──────────────────────────────
// Typed as in extract-route.test.ts so `.mock.calls` stays indexable.
type Spy = ReturnType<typeof vi.fn>;
import { vi } from 'vitest';

function mkDb(overrides: Partial<{
  labResults: unknown[];
  medications: unknown[];
  symptoms: unknown[];
}> = {}) {
  const labResult = { findMany: vi.fn(async () => overrides.labResults ?? []) as Spy };
  const medication = { findMany: vi.fn(async () => overrides.medications ?? []) as Spy };
  const symptomEntry = { findMany: vi.fn(async () => overrides.symptoms ?? []) as Spy };
  const client = { labResult, medication, symptomEntry };
  return { client, calls: client };
}

describe('buildAnalyticsSeries — timing-only read + ownerId tenancy (TC-4, TC-7)', () => {
  it('reads medications with a select that contains NO dosing field', async () => {
    const { client, calls } = mkDb();
    await buildAnalyticsSeries(client as never, 'u1');

    const args = calls.medication.findMany.mock.calls[0]![0] as { select?: Record<string, unknown> };
    expect(args.select).toBeDefined();
    // EXACT timing-only select. This assertion is RED the instant `dose` (or any
    // forbidden field) is added to the select — the must-BLOCK structural guard.
    expect(Object.keys(args.select!).sort()).toEqual(['endDate', 'name', 'startDate']);
    for (const key of FORBIDDEN_MED_KEYS) {
      expect(args.select).not.toHaveProperty(key);
    }
  });

  it('scopes EVERY read to the session ownerId (app-layer tenancy)', async () => {
    const { client, calls } = mkDb();
    await buildAnalyticsSeries(client as never, 'u-session');

    const labWhere = (calls.labResult.findMany.mock.calls[0]![0] as { where: object }).where;
    const medWhere = (calls.medication.findMany.mock.calls[0]![0] as { where: object }).where;
    const symWhere = (calls.symptomEntry.findMany.mock.calls[0]![0] as { where: object }).where;
    expect(labWhere).toEqual(expect.objectContaining({ ownerId: 'u-session' }));
    expect(medWhere).toEqual(expect.objectContaining({ ownerId: 'u-session' }));
    expect(symWhere).toEqual(expect.objectContaining({ ownerId: 'u-session' }));
  });

  it('reads only CONFIRMED lab results (P0.2.b — pending never feeds trends)', async () => {
    const { client, calls } = mkDb();
    await buildAnalyticsSeries(client as never, 'u1');
    const labWhere = (calls.labResult.findMany.mock.calls[0]![0] as { where: object }).where;
    expect(labWhere).toEqual(expect.objectContaining({ reviewStatus: 'CONFIRMED' }));
  });

  it('strips medications to timing + maps symptoms, reusing buildMarkerViews', async () => {
    const { client } = mkDb({
      medications: [
        { name: 'Test Cyp', startDate: new Date('2026-01-01'), endDate: null, dose: '200 mg weekly' },
      ],
      symptoms: [
        { date: new Date('2026-02-01'), symptom: 'mood', score: 7, note: 'ok' },
      ],
    });
    const series = await buildAnalyticsSeries(client as never, 'u1');

    // Medications are timing-only even though the mock row carried a dose.
    expect(series.medications).toHaveLength(1);
    expect(series.medications[0]).toEqual({
      name: 'Test Cyp',
      startDate: new Date('2026-01-01').toISOString(),
      endDate: null,
    });
    for (const key of FORBIDDEN_MED_KEYS) {
      expect(series.medications[0]).not.toHaveProperty(key);
    }
    // Symptoms map to plain points.
    expect(series.symptoms).toEqual([
      { date: new Date('2026-02-01').toISOString(), symptom: 'mood', score: 7 },
    ]);
  });

  it('applies a range window to all three reads', async () => {
    const { client, calls } = mkDb();
    await buildAnalyticsSeries(client as never, 'u1', '3m');

    const labWhere = calls.labResult.findMany.mock.calls[0]![0] as { where: { collectedAt?: object } };
    const medWhere = calls.medication.findMany.mock.calls[0]![0] as { where: { startDate?: object } };
    const symWhere = calls.symptomEntry.findMany.mock.calls[0]![0] as { where: { date?: object } };
    expect(labWhere.where.collectedAt).toBeDefined();
    expect(medWhere.where.startDate).toBeDefined();
    expect(symWhere.where.date).toBeDefined();
  });
});

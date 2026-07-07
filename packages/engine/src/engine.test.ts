/**
 * Golden-case tests for the deterministic engine.
 *
 * These pin the engine's contract:
 *   1. Determinism — identical inputs produce an identical report (same hash).
 *   2. Correct classification — ranges are honored.
 *   3. Red-flag rules fire on the right thresholds.
 *   4. Pattern rules combine markers correctly.
 *   5. Coverage gaps are detected.
 *   6. GOLD §2 — output never prescribes/diagnoses (guardrail audit ok).
 */
import { describe, it, expect } from 'vitest';
import { analyze, classifyResult } from './index';
import type { ResultPoint, PatientContext } from './types';

const basePatient: PatientContext = {
  sex: 'male',
  ageYears: 40,
  sleepHoursPerNight: 7,
  alcoholUse: 'occasional',
  smokingStatus: 'never',
  medicalConditions: null,
  medicationsText: null,
};

function mk(
  biomarkerKey: string,
  biomarkerName: string,
  category: string,
  valueNumeric: number,
  unit: string,
  refLow: number,
  refHigh: number,
  collectedAt: string,
  extra: Partial<ResultPoint> = {},
): ResultPoint {
  return {
    biomarkerKey,
    biomarkerName,
    category,
    valueNumeric,
    unit,
    collectedAt,
    refLow,
    refHigh,
    refText: `${refLow} - ${refHigh} ${unit}`,
    rawValue: String(valueNumeric),
    flag: null,
    ...extra,
  };
}

describe('classifyResult', () => {
  const base = mk('t', 'T', 'hormone', 0, 'ng/dL', 264, 916, '2026-01-01');

  it('classifies a normal value', () => {
    expect(classifyResult({ ...base, valueNumeric: 500 }).status).toBe('NORMAL');
  });
  it('classifies below-range as LOW', () => {
    expect(classifyResult({ ...base, valueNumeric: 200 }).status).toBe('LOW');
  });
  it('classifies above-range as HIGH', () => {
    expect(classifyResult({ ...base, valueNumeric: 1200 }).status).toBe('HIGH');
  });
  it('classifies near-upper as BORDERLINE_HIGH', () => {
    // band = 652, 10% = 65.2; high border starts at 916-65.2 = 850.8
    expect(classifyResult({ ...base, valueNumeric: 870 }).status).toBe('BORDERLINE_HIGH');
  });
  it('classifies non-numeric as NON_NUMERIC', () => {
    expect(classifyResult({ ...base, valueNumeric: null }).status).toBe('NON_NUMERIC');
  });
  it('returns NO_RANGE when range missing', () => {
    expect(classifyResult({ ...base, refLow: null, refHigh: null }).status).toBe('NO_RANGE');
  });
});

describe('analyze — determinism', () => {
  const results: ResultPoint[] = [
    mk('total_testosterone', 'Total Testosterone', 'hormone', 350, 'ng/dL', 264, 916, '2026-01-01'),
    mk('hematocrit', 'Hematocrit', 'cbc', 55, '%', 41, 53, '2026-01-01'),
    mk('psa', 'PSA', 'prostate', 1.2, 'ng/mL', 0, 4, '2026-01-01'),
  ];

  it('produces identical hash for identical inputs', () => {
    const r1 = analyze({ patient: basePatient, results });
    const r2 = analyze({ patient: basePatient, results });
    expect(r1.hash).toBe(r2.hash);
  });

  it('produces a different hash when data changes', () => {
    const r1 = analyze({ patient: basePatient, results });
    const r2 = analyze({
      patient: basePatient,
      results: results.map((r) => (r.biomarkerKey === 'hematocrit' ? { ...r, valueNumeric: 50 } : r)),
    });
    expect(r1.hash).not.toBe(r2.hash);
  });
});

describe('analyze — red flags', () => {
  it('fires a red flag for hematocrit >= 54', () => {
    const r = analyze({
      patient: basePatient,
      results: [mk('hematocrit', 'Hematocrit', 'cbc', 56, '%', 41, 53, '2026-01-01')],
    });
    expect(r.findings.some((f) => f.ruleId === 'RF-HEMATOCRIT-HIGH')).toBe(true);
    expect(r.sections.redFlags.length).toBeGreaterThan(0);
  });

  it('fires a red flag for PSA >= 4.0', () => {
    const r = analyze({
      patient: basePatient,
      results: [mk('psa', 'PSA', 'prostate', 5.0, 'ng/mL', 0, 4, '2026-01-01')],
    });
    expect(r.findings.some((f) => f.ruleId === 'RF-PSA-ELEVATED')).toBe(true);
  });

  it('does NOT fire a red flag for hematocrit in range', () => {
    const r = analyze({
      patient: basePatient,
      results: [mk('hematocrit', 'Hematocrit', 'cbc', 48, '%', 41, 53, '2026-01-01')],
    });
    expect(r.findings.some((f) => f.ruleId === 'RF-HEMATOCRIT-HIGH')).toBe(false);
  });
});

describe('analyze — patterns', () => {
  it('detects low testosterone pattern', () => {
    const r = analyze({
      patient: basePatient,
      results: [mk('total_testosterone', 'Total Testosterone', 'hormone', 200, 'ng/dL', 264, 916, '2026-01-01')],
    });
    expect(r.findings.some((f) => f.ruleId === 'PT-LOW-T')).toBe(true);
  });

  it('detects atherogenic lipid pattern (LDL + Trig high, HDL low)', () => {
    const r = analyze({
      patient: basePatient,
      results: [
        mk('ldl', 'LDL', 'lipid', 145, 'mg/dL', 0, 100, '2026-01-01'),
        mk('triglycerides', 'Triglycerides', 'lipid', 180, 'mg/dL', 0, 150, '2026-01-01'),
        mk('hdl', 'HDL', 'lipid', 35, 'mg/dL', 40, 60, '2026-01-01'),
      ],
    });
    expect(r.findings.some((f) => f.ruleId === 'PT-ATHEROGENIC-LIPIDS')).toBe(true);
  });

  it('detects rising hematocrit trend', () => {
    const r = analyze({
      patient: basePatient,
      results: [
        mk('hematocrit', 'Hematocrit', 'cbc', 48, '%', 41, 53, '2026-01-01'),
        mk('hematocrit', 'Hematocrit', 'cbc', 52, '%', 41, 53, '2026-04-01'),
      ],
    });
    expect(r.trends.find((t) => t.biomarkerKey === 'hematocrit')?.direction).toBe('UP');
  });
});

describe('analyze — coverage gaps', () => {
  it('reports missing panels', () => {
    const r = analyze({
      patient: basePatient,
      results: [mk('total_testosterone', 'Total Testosterone', 'hormone', 500, 'ng/dL', 264, 916, '2026-01-01')],
    });
    // many panels missing
    expect(r.coverageGaps.length).toBeGreaterThan(1);
    expect(r.sections.suggestedAdditionalTests.length).toBeGreaterThan(0);
  });

  it('reports no gaps for a complete panel', () => {
    const full: ResultPoint[] = [
      mk('total_testosterone', 'Total Testosterone', 'hormone', 500, 'ng/dL', 264, 916, '2026-01-01'),
      mk('free_testosterone', 'Free Testosterone', 'hormone', 100, 'pg/mL', 47, 244, '2026-01-01'),
      mk('shbg', 'SHBG', 'hormone', 30, 'nmol/L', 16.5, 55.9, '2026-01-01'),
      mk('lh', 'LH', 'hormone', 5, 'mIU/mL', 1.7, 8.6, '2026-01-01'),
      mk('fsh', 'FSH', 'hormone', 4, 'mIU/mL', 1.5, 12.4, '2026-01-01'),
      mk('estradiol_sensitive', 'Estradiol', 'hormone', 25, 'pg/mL', 10, 40, '2026-01-01'),
      mk('prolactin', 'Prolactin', 'hormone', 8, 'ng/mL', 4, 15.2, '2026-01-01'),
      mk('tsh', 'TSH', 'thyroid', 2, 'mIU/L', 0.4, 4.5, '2026-01-01'),
      mk('free_t3', 'Free T3', 'thyroid', 3, 'pg/mL', 2.3, 4.2, '2026-01-01'),
      mk('free_t4', 'Free T4', 'thyroid', 1.2, 'ng/dL', 0.8, 1.8, '2026-01-01'),
      mk('hemoglobin', 'Hemoglobin', 'cbc', 15, 'g/dL', 13.5, 17.5, '2026-01-01'),
      mk('hematocrit', 'Hematocrit', 'cbc', 48, '%', 41, 53, '2026-01-01'),
      mk('rbc', 'RBC', 'cbc', 5, 'M/uL', 4.3, 5.9, '2026-01-01'),
      mk('wbc', 'WBC', 'cbc', 6, 'K/uL', 3.4, 9.6, '2026-01-01'),
      mk('platelets', 'Platelets', 'cbc', 250, 'K/uL', 150, 450, '2026-01-01'),
      mk('alt', 'ALT', 'cmp', 30, 'U/L', 7, 56, '2026-01-01'),
      mk('ast', 'AST', 'cmp', 25, 'U/L', 10, 40, '2026-01-01'),
      mk('creatinine', 'Creatinine', 'cmp', 1.0, 'mg/dL', 0.7, 1.3, '2026-01-01'),
      mk('egfr', 'eGFR', 'cmp', 100, 'mL/min', 90, 120, '2026-01-01'),
      mk('bun', 'BUN', 'cmp', 14, 'mg/dL', 7, 20, '2026-01-01'),
      mk('hdl', 'HDL', 'lipid', 50, 'mg/dL', 40, 60, '2026-01-01'),
      mk('ldl', 'LDL', 'lipid', 90, 'mg/dL', 0, 100, '2026-01-01'),
      mk('triglycerides', 'Triglycerides', 'lipid', 100, 'mg/dL', 0, 150, '2026-01-01'),
      mk('total_cholesterol', 'Total Cholesterol', 'lipid', 170, 'mg/dL', 0, 200, '2026-01-01'),
      mk('a1c', 'A1C', 'metabolic', 5.2, '%', 4, 5.6, '2026-01-01'),
      mk('glucose', 'Glucose', 'metabolic', 90, 'mg/dL', 70, 99, '2026-01-01'),
      mk('hscrp', 'hs-CRP', 'inflammation', 1, 'mg/L', 0, 3, '2026-01-01'),
    ];
    const r = analyze({ patient: basePatient, results: full });
    expect(r.coverageGaps.length).toBe(0);
  });
});

describe('analyze — GOLD §2 guardrail audit', () => {
  it('guardrail audit passes on a red-flag-heavy report', () => {
    const r = analyze({
      patient: basePatient,
      results: [
        mk('hematocrit', 'Hematocrit', 'cbc', 58, '%', 41, 53, '2026-01-01'),
        mk('psa', 'PSA', 'prostate', 6, 'ng/mL', 0, 4, '2026-01-01'),
        mk('alt', 'ALT', 'cmp', 150, 'U/L', 7, 56, '2026-01-01'),
      ],
    });
    const audit = (r as unknown as { guardrailAudit: { ok: boolean } }).guardrailAudit;
    expect(audit.ok).toBe(true);
  });
});

describe('analyze — knowledge-base enrichment (Goal 1.3)', () => {
  const fakeKb = (query: string, _k?: number) => [
    {
      documentTitle: `Anabolics Book (${query.split(' ')[0]})`,
      page: 42,
      excerpt: 'Reference material about this biomarker and its clinical interpretation.',
    },
  ];

  it('attaches KB references to findings when a search fn is provided', () => {
    const r = analyze(
      {
        patient: basePatient,
        results: [mk('hematocrit', 'Hematocrit', 'cbc', 56, '%', 41, 53, '2026-01-01')],
      },
      fakeKb,
    );
    const f = r.findings.find((x) => x.biomarkerKey === 'hematocrit');
    expect(f?.references).toBeDefined();
    expect(f!.references!.length).toBeGreaterThan(0);
    expect(r.sections.knowledgeBaseReferences.length).toBeGreaterThan(0);
  });

  it('produces identical references (same hash) for the same KB search fn', () => {
    const r1 = analyze(
      { patient: basePatient, results: [mk('hematocrit', 'Hematocrit', 'cbc', 56, '%', 41, 53, '2026-01-01')] },
      fakeKb,
    );
    const r2 = analyze(
      { patient: basePatient, results: [mk('hematocrit', 'Hematocrit', 'cbc', 56, '%', 41, 53, '2026-01-01')] },
      fakeKb,
    );
    expect(r1.hash).toBe(r2.hash);
  });

  it('produces a different hash with vs without KB enrichment', () => {
    const none = analyze({
      patient: basePatient,
      results: [mk('hematocrit', 'Hematocrit', 'cbc', 56, '%', 41, 53, '2026-01-01')],
    });
    const withKb = analyze(
      { patient: basePatient, results: [mk('hematocrit', 'Hematocrit', 'cbc', 56, '%', 41, 53, '2026-01-01')] },
      fakeKb,
    );
    expect(none.hash).not.toBe(withKb.hash);
  });
});

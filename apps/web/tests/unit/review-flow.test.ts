/**
 * Review surface pure helpers (spec Req 4 / design.md §"Confirmation surface").
 *
 * The review page shows every PENDING_REVIEW row for one owner-scoped labReport
 * with its biomarker name, value, unit, and the REASON it landed in review.
 * Users confirm accuracy, correct the value, or re-enter manually. These helpers
 * are the testable core; the page wiring is verified by typecheck + manual
 * Playwright (this repo's vitest config has no jsdom — same layer decision as
 * extract-flow.ts in S1).
 */
import { describe, it, expect } from 'vitest';
import { toReviewRow, buildReviewRows } from '@/lib/review-flow';

const THRESHOLD = 0.9;

describe('toReviewRow — biomarker/value/unit/uncertainty reason', () => {
  it('flags an UNMAPPED biomarker (biomarkerId null, rawName set)', () => {
    const row = toReviewRow(
      {
        id: 'r-a',
        biomarkerId: null,
        rawName: 'Indice de Eosinofilos',
        rawValue: '2.1',
        rawUnit: '%',
        rawRefLow: '0.5',
        rawRefHigh: '5.0',
        rawRefText: null,
        confidence: 0.99,
        unit: '%',
      },
      { key: null, name: null, canonicalUnit: null },
      THRESHOLD,
    );
    expect(row).toEqual({
      labResultId: 'r-a',
      name: 'Indice de Eosinofilos', // printed name surfaced (no catalog match)
      value: '2.1',
      unit: '%',
      refText: '0.5 - 5.0 %',
      reason: 'unmapped',
    });
  });

  it('flags a LOW-CONFIDENCE mapped value (confidence below threshold)', () => {
    const row = toReviewRow(
      {
        id: 'r-b',
        biomarkerId: 'bm-testo',
        rawName: null,
        rawValue: '500',
        rawUnit: 'ng/dL',
        rawRefLow: '240',
        rawRefHigh: '870',
        rawRefText: null,
        confidence: 0.6,
        unit: 'ng/dL',
      },
      { key: 'total_testosterone', name: 'Total Testosterone', canonicalUnit: 'ng/dL' },
      THRESHOLD,
    );
    expect(row.reason).toBe('low_confidence');
    expect(row.name).toBe('Total Testosterone'); // canonical display name
    expect(row.refText).toBe('240 - 870 ng/dL');
  });

  it('uses the printed refText verbatim when present (per-lab range, GOLD §5.7)', () => {
    const row = toReviewRow(
      {
        id: 'r-c',
        biomarkerId: 'bm-hct',
        rawName: null,
        rawValue: '54',
        rawUnit: '%',
        rawRefLow: null,
        rawRefHigh: null,
        rawRefText: '41% - 53%',
        confidence: 0.55,
        unit: '%',
      },
      { key: 'hematocrit', name: 'Hematocrit', canonicalUnit: '%' },
      THRESHOLD,
    );
    expect(row.refText).toBe('41% - 53%');
  });

  it('shows "—" for a missing value (non-numeric extraction)', () => {
    const row = toReviewRow(
      {
        id: 'r-d',
        biomarkerId: null,
        rawName: 'Some Marker',
        rawValue: null,
        rawUnit: null,
        rawRefLow: null,
        rawRefHigh: null,
        rawRefText: null,
        confidence: 0.4,
        unit: null,
      },
      { key: null, name: null, canonicalUnit: null },
      THRESHOLD,
    );
    expect(row.value).toBe('—');
    expect(row.unit).toBe('—');
  });
});

describe('buildReviewRows — owner-scoped list shaping', () => {
  it('maps every PENDING row to a review row, unmapped + low-confidence both surfaced', () => {
    const rows = buildReviewRows(
      [
        {
          id: 'r-a',
          biomarkerId: null,
          rawName: 'Indice de Eosinofilos',
          rawValue: '2.1',
          rawUnit: '%',
          rawRefLow: '0.5',
          rawRefHigh: '5.0',
          rawRefText: null,
          confidence: 0.99,
          unit: '%',
          biomarker: null,
        },
        {
          id: 'r-b',
          biomarkerId: 'bm-testo',
          rawName: null,
          rawValue: '500',
          rawUnit: 'ng/dL',
          rawRefLow: '240',
          rawRefHigh: '870',
          rawRefText: null,
          confidence: 0.6,
          unit: 'ng/dL',
          biomarker: { key: 'total_testosterone', name: 'Total Testosterone', canonicalUnit: 'ng/dL' },
        },
      ],
      THRESHOLD,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.reason).sort()).toEqual(['low_confidence', 'unmapped']);
    // Every row carries the fields the surface must render.
    for (const r of rows) {
      expect(r).toEqual(
        expect.objectContaining({ labResultId: expect.any(String), name: expect.any(String), reason: expect.any(String) }),
      );
    }
  });

  it('returns an empty list when there is nothing pending', () => {
    expect(buildReviewRows([], THRESHOLD)).toEqual([]);
  });
});

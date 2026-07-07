/**
 * Range classification — deterministic.
 *
 * Given a result and its (per-lab) reference range, assign a {@link RangeStatus}
 * and a signed deviation. Reference ranges are per-lab/per-assay (GOLD §5.7):
 * we never assume a single global range; the authoritative range travels with
 * each result. If the per-lab range is missing we fall back to the biomarker
 * catalog's *typical* default, but always mark the classification so a reader
 * knows the range source.
 */
import type { ClassifiedResult, RangeStatus, ResultPoint } from './types';

/** Reference range actually used, with provenance. */
function resolveRange(r: ResultPoint, fallback?: { low: number | null; high: number | null }) {
  const low = r.refLow ?? fallback?.low ?? null;
  const high = r.refHigh ?? fallback?.high ?? null;
  const usedFallback = !(r.refLow != null && r.refHigh != null) && fallback != null;
  return { low, high, usedFallback };
}

/** Width of the borderline band, as a fraction of the reference band (each end). */
const BORDERLINE_FRACTION = 0.1;

export function classifyResult(
  r: ResultPoint,
  fallback?: { low: number | null; high: number | null },
): ClassifiedResult {
  if (r.valueNumeric == null) {
    return { ...r, status: 'NON_NUMERIC', deviation: null };
  }
  const { low, high } = resolveRange(r, fallback);
  if (low == null || high == null || high <= low) {
    return { ...r, status: 'NO_RANGE', deviation: null };
  }
  const v = r.valueNumeric;
  const band = high - low;
  const border = band * BORDERLINE_FRACTION;

  let status: RangeStatus;
  let deviation: number | null;
  if (v < low) {
    status = 'LOW';
    deviation = v - low; // negative
  } else if (v < low + border) {
    status = 'BORDERLINE_LOW';
    deviation = v - low;
  } else if (v > high) {
    status = 'HIGH';
    deviation = v - high; // positive
  } else if (v > high - border) {
    status = 'BORDERLINE_HIGH';
    deviation = v - high;
  } else {
    status = 'NORMAL';
    deviation = 0;
  }
  return { ...r, status, deviation };
}

export function classifyAll(
  results: ResultPoint[],
  fallbacks?: Record<string, { low: number | null; high: number | null }>,
): ClassifiedResult[] {
  return results.map((r) => classifyResult(r, fallbacks?.[r.biomarkerKey]));
}

// ── Convenience accessors ─────────────────────────────────────────────────────

export const isAbnormal = (s: RangeStatus) =>
  s === 'LOW' || s === 'HIGH' || s === 'BORDERLINE_LOW' || s === 'BORDERLINE_HIGH';

export const isOutOfBand = (s: RangeStatus) => s === 'LOW' || s === 'HIGH';

export const statusLabel = (s: RangeStatus): string =>
  ({
    LOW: 'Below range',
    BORDERLINE_LOW: 'Borderline low',
    NORMAL: 'In range',
    BORDERLINE_HIGH: 'Borderline high',
    HIGH: 'Above range',
    NON_NUMERIC: 'Non-numeric',
    NO_RANGE: 'No reference range',
  })[s];

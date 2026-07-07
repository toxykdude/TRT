/**
 * Trend computation — deterministic.
 *
 * For each biomarker, sort its points by date and characterize the direction
 * (UP/DOWN/FLAT) and magnitude of change from first to last. Trend logic uses
 * *normalized* values (GOLD §5.6) so comparisons across labs are valid, but a
 * relative-change threshold guards against noise when the absolute values are
 * small. Reference ranges differ by lab/assay (GOLD §5.7), so trend status is
 * computed per-point from each point's own range.
 */
import type { ClassifiedResult, Trend, TrendDirection } from './types';

const MIN_POINTS_FOR_TREND = 2;
/** relative change below this (in absolute %) is considered flat */
const FLAT_RELATIVE_THRESHOLD = 0.05;
/** absolute change below this (in canonical units) is flat regardless of % */
const FLAT_ABSOLUTE_THRESHOLD = 0.001;

export function computeTrends(classified: ClassifiedResult[]): Trend[] {
  const byMarker = new Map<string, ClassifiedResult[]>();
  for (const c of classified) {
    const arr = byMarker.get(c.biomarkerKey) ?? [];
    arr.push(c);
    byMarker.set(c.biomarkerKey, arr);
  }

  const trends: Trend[] = [];
  for (const [key, points] of byMarker) {
    // chronological order; null dates sort last but keep stable relative order
    const sorted = [...points].sort((a, b) => {
      const da = a.collectedAt ? new Date(a.collectedAt).getTime() : Infinity;
      const db = b.collectedAt ? new Date(b.collectedAt).getTime() : Infinity;
      return da - db;
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const name = (last ?? first)?.biomarkerName ?? key;
    const category = (last ?? first)?.category ?? 'other';

    if (sorted.length < MIN_POINTS_FOR_TREND || !first || !last) {
      trends.push({
        biomarkerKey: key,
        biomarkerName: name,
        category,
        direction: 'INSUFFICIENT',
        delta: null,
        relativeChange: null,
        points: sorted.map((p) => ({
          date: p.collectedAt,
          value: p.valueNumeric,
          status: p.status,
        })),
      });
      continue;
    }

    const fv = first.valueNumeric;
    const lv = last.valueNumeric;
    let direction: TrendDirection = 'FLAT';
    let delta: number | null = null;
    let relativeChange: number | null = null;

    if (fv != null && lv != null) {
      delta = lv - fv;
      relativeChange = fv !== 0 ? delta / Math.abs(fv) : null;
      const absSmall = Math.abs(delta) < FLAT_ABSOLUTE_THRESHOLD;
      const relSmall = relativeChange != null && Math.abs(relativeChange) < FLAT_RELATIVE_THRESHOLD;
      direction = absSmall || relSmall ? 'FLAT' : delta > 0 ? 'UP' : 'DOWN';
    }

    trends.push({
      biomarkerKey: key,
      biomarkerName: name,
      category,
      direction,
      delta,
      relativeChange,
      points: sorted.map((p) => ({
        date: p.collectedAt,
        value: p.valueNumeric,
        status: p.status,
      })),
    });
  }

  return trends.sort((a, b) => a.biomarkerName.localeCompare(b.biomarkerName));
}

export const trendArrow = (d: TrendDirection): string =>
  ({ UP: '↑', DOWN: '↓', FLAT: '→', INSUFFICIENT: '·' })[d];

export const trendWord = (d: TrendDirection): string =>
  ({ UP: 'rising', DOWN: 'falling', FLAT: 'stable', INSUFFICIENT: 'single value' })[d];

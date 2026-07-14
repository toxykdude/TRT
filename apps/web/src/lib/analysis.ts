/**
 * Analysis logic for the comprehensive analysis page.
 * Pure data transformation — no JSX, so it parses cleanly under SWC.
 */
import { classifyResult } from '@trt/engine';

export type MarkerView = {
  key: string;
  name: string;
  category: string;
  status: string;
  latestValue: string | null;
  unit: string | null;
  refText: string | null;
  refLow: number | null;
  refHigh: number | null;
  trend: 'UP' | 'DOWN' | 'FLAT' | 'SINGLE';
  points: { date: string; value: number | null; status: string }[];
};

type LabResultWithBiomarker = {
  biomarkerKey: string;
  biomarkerName: string;
  category: string;
  collectedAt: Date | null;
  valueNumeric: number | null;
  unit: string | null;
  rawValue: string | null;
  rawUnit: string | null;
  rawRefLow: string | null;
  rawRefHigh: string | null;
  rawRefText: string | null;
  flag: string | null;
  biomarker: {
    key: string;
    name: string;
    category: string;
    canonicalUnit: string;
    refLow: number | null;
    refHigh: number | null;
  };
};

function numOrNull(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function buildMarkerViews(results: LabResultWithBiomarker[]): MarkerView[] {
  const byMarker = new Map<string, LabResultWithBiomarker[]>();
  for (const r of results) {
    const arr = byMarker.get(r.biomarker.key) ?? [];
    arr.push(r);
    byMarker.set(r.biomarker.key, arr);
  }

  const markers: MarkerView[] = [];
  for (const [key, points] of byMarker) {
    const sorted = [...points].sort((a, b) => {
      const da = a.collectedAt?.getTime() ?? 0;
      const db = b.collectedAt?.getTime() ?? 0;
      return da - db;
    });
    const latest = sorted[sorted.length - 1];
    if (!latest) continue;
    const refLow = numOrNull(latest.rawRefLow) ?? latest.biomarker.refLow ?? null;
    const refHigh = numOrNull(latest.rawRefHigh) ?? latest.biomarker.refHigh ?? null;
    const classified = classifyResult({
      biomarkerKey: key,
      biomarkerName: latest.biomarker.name,
      category: latest.biomarker.category,
      collectedAt: latest.collectedAt?.toISOString() ?? null,
      valueNumeric: latest.valueNumeric,
      unit: latest.unit ?? latest.biomarker.canonicalUnit,
      rawValue: latest.rawValue,
      refLow,
      refHigh,
      refText: latest.rawRefText,
      flag: latest.flag,
    });

    const vals = sorted.map((s) => s.valueNumeric).filter((v): v is number => v != null);
    let trend: MarkerView['trend'] = 'SINGLE';
    if (vals.length >= 2) {
      const delta = vals[vals.length - 1]! - vals[0]!;
      const rel = vals[0] !== 0 ? delta / Math.abs(vals[0]) : 0;
      trend = Math.abs(delta) < 0.001 || Math.abs(rel) < 0.05 ? 'FLAT' : delta > 0 ? 'UP' : 'DOWN';
    }

    markers.push({
      key,
      name: latest.biomarker.name,
      category: latest.biomarker.category,
      status: classified.status,
      latestValue: latest.rawValue,
      unit: latest.rawUnit,
      refText: latest.rawRefText,
      refLow,
      refHigh,
      trend,
      points: sorted.map((s) => ({
        date: s.collectedAt?.toISOString().slice(0, 10) ?? '—',
        value: s.valueNumeric,
        status: classifyResult({
          biomarkerKey: key,
          biomarkerName: '',
          category: '',
          collectedAt: null,
          valueNumeric: s.valueNumeric,
          unit: null,
          rawValue: null,
          refLow: numOrNull(s.rawRefLow) ?? s.biomarker.refLow ?? null,
          refHigh: numOrNull(s.rawRefHigh) ?? s.biomarker.refHigh ?? null,
          refText: null,
          flag: s.flag,
        }).status,
      })),
    });
  }

  markers.sort((a, b) => {
    const aAbn = a.status === 'LOW' || a.status === 'HIGH' ? 0 : 1;
    const bAbn = b.status === 'LOW' || b.status === 'HIGH' ? 0 : 1;
    if (aAbn !== bAbn) return aAbn - bAbn;
    return a.category.localeCompare(b.category);
  });

  return markers;
}

export function groupByCategory(markers: MarkerView[]): Map<string, MarkerView[]> {
  const cats = new Map<string, MarkerView[]>();
  for (const m of markers) {
    const arr = cats.get(m.category) ?? [];
    arr.push(m);
    cats.set(m.category, arr);
  }
  return cats;
}

export const TREND_LABEL: Record<string, string> = {
  UP: 'rising',
  DOWN: 'falling',
  FLAT: 'stable',
  SINGLE: '',
};

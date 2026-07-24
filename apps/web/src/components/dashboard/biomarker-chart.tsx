'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  Brush,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { scoreRadius, scoreOpacity } from '@/lib/symptoms';
import type { TimingOnlyMed, SymptomPoint } from '@/lib/analytics-series';

type DataPoint = {
  date: string;
  value: number | null;
  status: string;
};

type Props = {
  biomarkerName: string;
  unit?: string | null;
  data: DataPoint[];
  refLow?: number | null;
  refHigh?: number | null;
  className?: string;
  /** Timing-only medication bands (ReferenceArea per medication, TC-3). */
  medications?: TimingOnlyMed[];
  /** Symptom magnitude dots, encoded by radius+opacity (TC-5, AA-safe). */
  symptoms?: SymptomPoint[];
  /** Zoom brush (TC-6). */
  brush?: boolean;
};

// Merged timeline row: the biomarker Line reads `value`; symptom dots read
// `symptomScore`. Overlay-only dates land here as rows with a null biomarker
// value so they become valid X-axis categories (categorical axis alignment).
type Row = {
  date: string;
  value: number | null;
  status: string;
  symptomScore?: number;
};

/** Normalize an ISO/Date-string to the 'YYYY-MM-DD' category used on the axis. */
function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  return iso.length >= 10 ? iso.slice(0, 10) : null;
}

// Recharts passes cx/cy/payload to a Scatter dot render callback. It has no
// exported precise type for this, so we declare the shape we read from it.
type ScatterDotProps = { cx?: number; cy?: number; payload?: Row };

/**
 * Interactive biomarker trend chart (GOLD §5.9).
 *
 * COMPOSED (not forked): the internal chart is a Recharts `ComposedChart` so an
 * optional medication timing band (`ReferenceArea`), symptom magnitude dots
 * (`Scatter`), and zoom (`Brush`) can share one axis. When NO overlays are
 * passed (the analysis-page caller) the merged timeline equals the input data
 * exactly and the line renders identically — a strict superset, zero behavior
 * change. Reference range is shaded green; out-of-range points are red/amber.
 *
 * Symptom magnitude is encoded by dot RADIUS + OPACITY (never color alone —
 * WCAG AA, spec TC-5) and plotted on a hidden secondary axis so it never
 * collides with the biomarker's value scale.
 */
export function BiomarkerChart({
  biomarkerName,
  unit,
  data,
  refLow,
  refHigh,
  className,
  medications,
  symptoms,
  brush,
}: Props) {
  const t = useTranslations('Charts');
  const hasRange = refLow != null && refHigh != null;
  const hasMeds = (medications?.length ?? 0) > 0;
  const hasSymptoms = (symptoms?.length ?? 0) > 0;

  // ── Merge overlay dates into the timeline (categorical-axis alignment) ────
  // When there are no overlays this map is just the input points in order, so
  // the rendered line is byte-for-byte the same as before.
  const rowByDate = new Map<string, Row>();
  for (const d of data) {
    rowByDate.set(d.date, { date: d.date, value: d.value, status: d.status });
  }
  if (hasSymptoms) {
    for (const s of symptoms!) {
      const key = dayKey(s.date) ?? s.date;
      const row = rowByDate.get(key) ?? { date: key, value: null, status: '' };
      row.symptomScore = s.score;
      rowByDate.set(key, row);
    }
  }
  const nowEdge = new Date().toISOString().slice(0, 10);
  if (hasMeds) {
    // Anchor medication start/end dates as categories so ReferenceArea bands
    // span correctly. A null endDate extends to the chart now-edge.
    for (const m of medications!) {
      const start = dayKey(m.startDate);
      const end = dayKey(m.endDate) ?? nowEdge;
      if (start && !rowByDate.has(start)) rowByDate.set(start, { date: start, value: null, status: '' });
      if (!rowByDate.has(end)) rowByDate.set(end, { date: end, value: null, status: '' });
    }
  }
  const merged = [...rowByDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const allVals = [...data.map((d) => d.value).filter((v): v is number => v != null)];
  if (refLow != null) allVals.push(refLow);
  if (refHigh != null) allVals.push(refHigh);
  const min = allVals.length ? Math.min(...allVals) : 0;
  const max = allVals.length ? Math.max(...allVals) : 100;
  const pad = (max - min) * 0.15 || 1;
  const yDomain: [number, number] = [Math.max(0, min - pad), max + pad];

  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">{biomarkerName}</h4>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        {hasRange && (
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {t('ref', { low: refLow, high: refHigh })}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={merged} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis yAxisId="value" domain={yDomain} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          {/* Hidden secondary axis so symptom magnitude never distorts the value scale. */}
          {hasSymptoms && (
            <YAxis yAxisId="symptom" domain={[0, 10]} hide />
          )}
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(v: number) => [`${v} ${unit ?? ''}`, biomarkerName]}
          />
          {hasRange && refLow != null && refHigh != null && (
            // Pre-existing range band (hardcoded green left as-is — out of scope).
            <ReferenceArea yAxisId="value" y1={refLow} y2={refHigh} fill="#10b981" fillOpacity={0.08} />
          )}
          {hasRange && refLow != null && (
            <ReferenceLine yAxisId="value" y={refLow} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          {hasRange && refHigh != null && (
            <ReferenceLine yAxisId="value" y={refHigh} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          {/* Medication timing bands (TC-3): timing-only, never dosing (§2.3). */}
          {hasMeds &&
            medications!.map((m, i) => {
              const x1 = dayKey(m.startDate);
              const x2 = dayKey(m.endDate) ?? nowEdge;
              if (!x1) return null;
              return (
                <ReferenceArea
                  key={`med-${i}`}
                  yAxisId="value"
                  x1={x1}
                  x2={x2}
                  fill="hsl(var(--primary))"
                  fillOpacity={0.06}
                  stroke="hsl(var(--primary))"
                  strokeOpacity={0.25}
                  strokeDasharray="4 4"
                />
              );
            })}
          {/* Symptom magnitude dots (TC-5): radius + opacity encode the score. */}
          {hasSymptoms && (
            <Scatter
              yAxisId="symptom"
              dataKey="symptomScore"
              fill="hsl(var(--primary))"
              // Per-point shape: dot size + opacity encode the score (AA-safe).
              shape={(props: ScatterDotProps) => {
                const score = props.payload?.symptomScore;
                if (score == null || props.cx == null || props.cy == null) return <g aria-hidden />;
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={scoreRadius(score)}
                    fill="hsl(var(--primary))"
                    fillOpacity={scoreOpacity(score)}
                  />
                );
              }}
            />
          )}
          <Line
            yAxisId="value"
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 4, fill: 'hsl(var(--primary))' }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          {brush && <Brush dataKey="date" height={20} stroke="hsl(var(--primary))" fill="hsl(var(--muted))" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

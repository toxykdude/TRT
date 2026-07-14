'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';

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
};

/**
 * Interactive biomarker trend chart (GOLD §5.9).
 * Reference range is shaded green; out-of-range points are red/amber.
 */
export function BiomarkerChart({ biomarkerName, unit, data, refLow, refHigh, className }: Props) {
  const hasRange = refLow != null && refHigh != null;
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
            Ref: {refLow} – {refHigh}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis domain={yDomain} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
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
            <ReferenceArea y1={refLow} y2={refHigh} fill="#10b981" fillOpacity={0.08} />
          )}
          {hasRange && refLow != null && (
            <ReferenceLine y={refLow} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          {hasRange && refHigh != null && (
            <ReferenceLine y={refHigh} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 4, fill: 'hsl(var(--primary))' }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

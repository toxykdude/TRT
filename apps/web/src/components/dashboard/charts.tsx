'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { resolveCompoundName, resolveDosingField } from '@/lib/dosing-i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassifiedItem = {
  biomarkerKey: string;
  biomarkerName: string;
  category: string;
  valueNumeric: number | null;
  unit: string | null;
  status: string;
  deviation: number | null;
  refLow: number | null;
  refHigh: number | null;
  collectedAt: string | null;
};

type TrendItem = {
  biomarkerKey: string;
  biomarkerName: string;
  category: string;
  direction: string;
  delta: number | null;
  relativeChange: number | null;
  points: { date: string | null; value: number | null; status: string }[];
};

export type ChartData = {
  classified: ClassifiedItem[];
  trends: TrendItem[];
  meta: {
    resultCount: number;
    classifiedCount: number;
    findingCount: number;
    redFlagCount: number;
  };
};

// ── Colors ────────────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  LOW: '#EF4444',
  BORDERLINE_LOW: '#F59E0B',
  NORMAL: '#10B981',
  BORDERLINE_HIGH: '#F59E0B',
  HIGH: '#EF4444',
  NON_NUMERIC: '#737791',
  NO_RANGE: '#737791',
};

const CHART_COLORS = {
  blue: '#0EA5E9',
  green: '#10B981',
  red: '#EF4444',
  purple: '#8B5CF6',
  orange: '#F59E0B',
  magenta: '#BF00FF',
  yellow: '#FCB859',
  teal: '#14B8A6',
};

// ── Stat Tile ─────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  unit,
  caption,
  trend,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  caption?: string;
  trend?: 'up' | 'down' | 'flat';
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'red' | 'purple' | 'orange';
}) {
  const bgMap = {
    blue: 'bg-blue-50 dark:bg-blue-950/30',
    green: 'bg-emerald-50 dark:bg-emerald-950/30',
    red: 'bg-red-50 dark:bg-red-950/30',
    purple: 'bg-purple-50 dark:bg-purple-950/30',
    orange: 'bg-orange-50 dark:bg-orange-950/30',
  };
  const iconBg = {
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };
  const trendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  return (
    <div className={`rounded-2xl ${bgMap[color]} p-4`}>
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${iconBg[color]} text-white`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>}
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
      {caption && (
        <div className="mt-1 flex items-center gap-1">
          <TrendIcon className="h-3 w-3 text-gray-400" />
          <p className="text-xs text-gray-500">{caption}</p>
        </div>
      )}
    </div>
  );
}

// ── Chart Card Wrapper ────────────────────────────────────────────────────────

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className || ''}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── 1. Biomarker Trend Chart (multi-line) ─────────────────────────────────────

export function BiomarkerTrendChart({ trends, keys }: { trends: TrendItem[]; keys: string[] }) {
  const biomarkersT = useTranslations('Biomarkers');
  // Build chart data from trend points, keyed by date
  const dateMap = new Map<string, Record<string, number | null>>();
  const series: { key: string; name: string; color: string }[] = [];
  const colorMap = [CHART_COLORS.blue, CHART_COLORS.red, CHART_COLORS.green, CHART_COLORS.purple];

  keys.forEach((key, i) => {
    const trend = trends.find((t) => t.biomarkerKey === key);
    if (!trend) return;
    const name = biomarkersT.has(key) ? biomarkersT(key) : trend.biomarkerName;
    series.push({ key, name, color: colorMap[i % colorMap.length]! });
    trend.points.forEach((p) => {
      const date = p.date ? new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A';
      if (!dateMap.has(date)) dateMap.set(date, {});
      dateMap.get(date)![key] = p.value;
    });
  });

  const data = Array.from(dateMap.entries()).map(([date, vals]) => ({ date, ...vals }));

  if (data.length === 0) return <EmptyChart />;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737791' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#737791' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: s.color }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── 2. Reference Range Comparison (grouped bar) ───────────────────────────────

export function RangeComparisonChart({ classified, keys }: { classified: ClassifiedItem[]; keys: string[] }) {
  const t = useTranslations('Charts');
  const biomarkersT = useTranslations('Biomarkers');
  // Show latest value vs refLow/refHigh for each biomarker
  const latest = new Map<string, ClassifiedItem>();
  for (const c of classified) {
    const existing = latest.get(c.biomarkerKey);
    if (!existing || (c.collectedAt && existing.collectedAt && c.collectedAt > existing.collectedAt)) {
      latest.set(c.biomarkerKey, c);
    }
  }

  const data = keys
    .map((k) => {
      const c = latest.get(k);
      if (!c || c.valueNumeric == null) return null;
      const label = biomarkersT.has(k) ? biomarkersT(k) : c.biomarkerName;
      return {
        name: label.length > 15 ? label.slice(0, 12) + '…' : label,
        value: c.valueNumeric,
        refLow: c.refLow ?? 0,
        refHigh: c.refHigh ?? 0,
        status: c.status,
        unit: c.unit || '',
      };
    })
    .filter(Boolean) as Array<{ name: string; value: number; refLow: number; refHigh: number; status: string; unit: string }>;

  if (data.length === 0) return <EmptyChart />;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737791' }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: '#737791' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
          formatter={(v: number, name: string) => {
            if (name === 'value') return [v, t('yourValue')];
            if (name === 'refLow') return [v, t('refLowLabel')];
            return [v, t('refHighLabel')];
          }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === 'value' ? t('yourValue') : v === 'refLow' ? t('refLowLabel') : t('refHighLabel'))} />
        <Bar dataKey="refLow" fill={CHART_COLORS.yellow} radius={[4, 4, 0, 0]} barSize={20} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={20}>
          {data.map((d, i) => (
            <Cell key={i} fill={STATUS_COLORS[d.status] || CHART_COLORS.blue} />
          ))}
        </Bar>
        <Bar dataKey="refHigh" fill={CHART_COLORS.orange} radius={[4, 4, 0, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 3. Status Distribution Donut ──────────────────────────────────────────────

export function StatusDonutChart({ classified }: { classified: ClassifiedItem[] }) {
  const statusT = useTranslations('Status');
  const counts = new Map<string, number>();
  for (const c of classified) {
    counts.set(c.status, (counts.get(c.status) || 0) + 1);
  }

  const data = Array.from(counts.entries())
    .map(([status, count]) => ({
      name: statusT(status),
      value: count,
      color: STATUS_COLORS[status] || CHART_COLORS.blue,
    }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) return <EmptyChart />;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── 4. Hormone Area Chart ─────────────────────────────────────────────────────

export function HormoneAreaChart({ trends, biomarkerKey }: { trends: TrendItem[]; biomarkerKey: string }) {
  const trend = trends.find((t) => t.biomarkerKey === biomarkerKey);
  if (!trend || trend.points.length === 0) return <EmptyChart />;

  const data = trend.points.map((p) => ({
    date: p.date ? new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A',
    value: p.value,
  }));

  const latest = trend.points[trend.points.length - 1];
  const refLow = trend.points.length > 0 ? null : null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <defs>
          <linearGradient id={`gradient-${biomarkerKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737791' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#737791' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS.blue}
          strokeWidth={2.5}
          fill={`url(#gradient-${biomarkerKey})`}
          dot={{ r: 4, fill: CHART_COLORS.blue }}
          activeDot={{ r: 6 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── 5. Dosing Protocol Table ──────────────────────────────────────────────────

type DosingRec = {
  compound: string;
  compoundKey: string;
  protocolKey: string;
  dose: string;
  frequency: string;
  route: string;
  cycleLength: string;
  indication: string;
  expectedBiomarkerShift: string;
  ragSourceIds: string[];
  priority: 'clinical_priority' | 'standard' | 'alternative';
  notes?: string;
  indicationParams?: Record<string, string | number>;
};

const PRIORITY_BAR = {
  clinical_priority: CHART_COLORS.red,
  standard: CHART_COLORS.blue,
  alternative: CHART_COLORS.purple,
};

export function DosingTable({ recommendations }: { recommendations: DosingRec[] }) {
  const t = useTranslations('Charts');
  const compoundsT = useTranslations('Compounds');
  const protocolsT = useTranslations('DosingProtocols');
  if (recommendations.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        {t('noDosing')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="pb-3 pr-4 font-medium">{t('thNumber')}</th>
            <th className="pb-3 pr-4 font-medium">{t('thCompound')}</th>
            <th className="pb-3 pr-4 font-medium">{t('thDose')}</th>
            <th className="pb-3 pr-4 font-medium">{t('thFrequency')}</th>
            <th className="pb-3 pr-4 font-medium">{t('thPriority')}</th>
          </tr>
        </thead>
        <tbody>
          {recommendations.map((rec, i) => {
            const color = PRIORITY_BAR[rec.priority];
            const pct = rec.priority === 'clinical_priority' ? 95 : rec.priority === 'standard' ? 65 : 35;
            return (
              <tr key={i} className="border-b last:border-0">
                <td className="py-3 pr-4 text-gray-400">{String(i + 1).padStart(2, '0')}</td>
                <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">{resolveCompoundName(rec, compoundsT, protocolsT)}</td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{resolveDosingField(rec, 'dose', compoundsT, protocolsT)}</td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{resolveDosingField(rec, 'frequency', compoundsT, protocolsT)}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${color}15`, color }}
                    >
                      {rec.priority === 'clinical_priority'
                        ? t('priorityLabel')
                        : rec.priority === 'standard'
                          ? t('standardLabel')
                          : t('altLabel')}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 6. Category Coverage Stacked Bar ──────────────────────────────────────────

export function CategoryCoverageChart({ classified }: { classified: ClassifiedItem[] }) {
  const t = useTranslations('Charts');
  const categoriesT = useTranslations('Categories');
  const categoryMap = new Map<string, { normal: number; abnormal: number; total: number }>();

  for (const c of classified) {
    const cat = c.category || 'other';
    if (!categoryMap.has(cat)) categoryMap.set(cat, { normal: 0, abnormal: 0, total: 0 });
    const entry = categoryMap.get(cat)!;
    entry.total++;
    if (c.status === 'NORMAL') entry.normal++;
    else entry.abnormal++;
  }

  const data = Array.from(categoryMap.entries()).map(([cat, vals]) => ({
    name: categoriesT.has(cat) ? categoriesT(cat) : cat.charAt(0).toUpperCase() + cat.slice(1),
    normal: vals.normal,
    abnormal: vals.abnormal,
  }));

  if (data.length === 0) return <EmptyChart />;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737791' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#737791' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="normal" stackId="a" fill={CHART_COLORS.green} radius={[0, 0, 0, 0]} barSize={30} name={t('normal')} />
        <Bar dataKey="abnormal" stackId="a" fill={CHART_COLORS.red} radius={[4, 4, 0, 0]} barSize={30} name={t('outOfRange')} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function EmptyChart() {
  const t = useTranslations('Charts');
  return (
    <div className="flex h-48 items-center justify-center">
      <p className="text-sm text-gray-400">{t('insufficientData')}</p>
    </div>
  );
}

export { CHART_COLORS };

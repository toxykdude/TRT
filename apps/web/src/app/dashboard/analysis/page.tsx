import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { classifyResult, statusLabel, trendWord } from '@trt/engine';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SafetyBanner } from '@/components/safety-banner';
import { BiomarkerChart } from '@/components/dashboard/biomarker-chart';
import { fmtDate, cn } from '@/lib/utils';
import { Flag, Activity, TrendingUp, AlertTriangle, Network, ArrowRight, FlaskConical } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  LOW: 'text-red-500',
  BORDERLINE_LOW: 'text-amber-500',
  HIGH: 'text-red-500',
  BORDERLINE_HIGH: 'text-amber-500',
  NORMAL: 'text-emerald-500',
  NON_NUMERIC: 'text-muted-foreground',
  NO_RANGE: 'text-muted-foreground',
};
const STATUS_BG: Record<string, string> = {
  LOW: 'bg-red-500/10 border-red-500/20',
  HIGH: 'bg-red-500/10 border-red-500/20',
  BORDERLINE_LOW: 'bg-amber-500/10 border-amber-500/20',
  BORDERLINE_HIGH: 'bg-amber-500/10 border-amber-500/20',
  NORMAL: 'bg-emerald-500/10 border-emerald-500/20',
  NON_NUMERIC: 'bg-muted/40 border-border',
  NO_RANGE: 'bg-muted/40 border-border',
};

function numOrNull(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default async function AnalysisPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);

  // Fetch all results + the latest report (for graph facts + findings)
  const [results, reports] = await Promise.all([
    db.labResult.findMany({
      where: { ownerId: session!.user.id },
      include: { biomarker: true },
      orderBy: { collectedAt: 'asc' },
    }),
    db.report.findMany({
      where: { ownerId: session!.user.id },
      orderBy: { generatedAt: 'desc' },
      take: 1,
    }),
  ]);

  const latestReport = reports[0];
  const reportSections = latestReport?.sections as Record<string, unknown> | null;

  // Group results by biomarker for charts + classification
  const byMarker = new Map<string, typeof results>();
  for (const r of results) {
    const arr = byMarker.get(r.biomarker.key) ?? [];
    arr.push(r);
    byMarker.set(r.biomarker.key, arr);
  }

  // Classify each biomarker's latest value + build chart data
  type MarkerView = {
    key: string;
    name: string;
    category: string;
    status: string;
    latestValue: string | null;
    unit: string | null;
    refText: string | null;
    refLow: number | null;
    refHigh: number | null;
    points: { date: string; value: number | null; status: string }[];
    trend: 'UP' | 'DOWN' | 'FLAT' | 'SINGLE';
  };
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
    // trend
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

  // Sort: abnormal first, then by category
  markers.sort((a, b) => {
    const aAbn = a.status === 'LOW' || a.status === 'HIGH' ? 0 : 1;
    const bAbn = b.status === 'LOW' || b.status === 'HIGH' ? 0 : 1;
    if (aAbn !== bAbn) return aAbn - bAbn;
    return a.category.localeCompare(b.category);
  });

  // Group by category for the grid
  const categories = new Map<string, MarkerView[]>();
  for (const m of markers) {
    const arr = categories.get(m.category) ?? [];
    arr.push(m);
    categories.set(m.category, arr);
  }

  const redFlags = (reportSections?.redFlags as string[]) ?? [];
  const graphFacts = (reportSections?.knowledgeGraphFacts as string[]) ?? [];
  const questions = (reportSections?.questionsForPhysician as string[]) ?? [];
  const additionalTests = (reportSections?.suggestedAdditionalTests as string[]) ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comprehensive Analysis</h1>
          <p className="text-sm text-muted-foreground">
            {markers.length} biomarker{markers.length === 1 ? '' : 's'} analyzed ·{' '}
            {markers.filter((m) => m.status === 'LOW' || m.status === 'HIGH').length} out of range
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/reports">View full report →</Link>
        </Button>
      </div>

      <SafetyBanner variant="banner" />

      {/* Red flags */}
      {redFlags.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Flag className="h-4 w-4" /> Priority review ({redFlags.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {redFlags.map((rf, i) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span>{rf}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(() => {
          const normal = markers.filter((m) => m.status === 'NORMAL').length;
          const high = markers.filter((m) => m.status === 'HIGH').length;
          const low = markers.filter((m) => m.status === 'LOW').length;
          const borderline = markers.filter((m) => m.status.startsWith('BORDERLINE')).length;
          const tiles = [
            { label: 'In range', value: normal, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Above range', value: high, color: 'text-red-500', bg: 'bg-red-500/10' },
            { label: 'Below range', value: low, color: 'text-red-500', bg: 'bg-red-500/10' },
            { label: 'Borderline', value: borderline, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          ];
          return tiles.map((t) => (
            <Card key={t.label} className={cn('border-0', t.bg)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-2xl font-bold">{t.value}</p>
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                </div>
                <Activity className={cn('h-5 w-5', t.color)} />
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {/* Biomarker charts by category */}
      {markers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FlaskConical className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No lab results yet. Upload or enter your results to see the analysis.
            </p>
            <Button asChild>
              <Link href="/dashboard/labs">Add your labs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...categories.entries()].map(([cat, ms]) => (
            <div key={cat}>
              <h3 className="mb-3 text-sm font-medium capitalize text-muted-foreground">{cat}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {ms.map((m) => (
                  <BiomarkerChart
                    key={m.key}
                    biomarkerName={`${m.name} ${m.trend !== 'SINGLE' ? `(${trendWord(m.trend)})` : ''}`}
                    unit={m.unit}
                    data={m.points}
                    refLow={m.refLow}
                    refHigh={m.refHigh}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TRT clinical context (from the graph) */}
      {graphFacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4 text-primary" /> Clinical context from the knowledge base
            </CardTitle>
            <CardDescription>
              Medical entity relationships relevant to your results, extracted from the clinical literature.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {graphFacts.slice(0, 12).map((fact, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
                >
                  <Network className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                  <span>{fact}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions for physician + additional tests */}
      <div className="grid gap-4 lg:grid-cols-2">
        {questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discussion points for your clinician</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                {questions.slice(0, 6).map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
        {additionalTests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suggested additional tests</CardTitle>
              <CardDescription>For discussion when data are incomplete.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {additionalTests.slice(0, 8).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <SafetyBanner variant="footer" />
    </div>
  );
}

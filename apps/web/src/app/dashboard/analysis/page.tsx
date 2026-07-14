import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SafetyBanner } from '@/components/safety-banner';
import { BiomarkerChart } from '@/components/dashboard/biomarker-chart';
import { buildMarkerViews, groupByCategory, TREND_LABEL } from '@/lib/analysis';
import { cn } from '@/lib/utils';
import { Flag, Activity, AlertTriangle, Network, ArrowRight, FlaskConical } from 'lucide-react';

export default async function AnalysisPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);

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

  const markers = buildMarkerViews(results as never);
  const categories = groupByCategory(markers);
  const latestReport = reports[0];
  const sections = (latestReport?.sections ?? {}) as Record<string, unknown>;
  const redFlags = (sections.redFlags as string[]) ?? [];
  const graphFacts = (sections.knowledgeGraphFacts as string[]) ?? [];
  const questions = (sections.questionsForPhysician as string[]) ?? [];
  const additionalTests = (sections.suggestedAdditionalTests as string[]) ?? [];

  const normalCount = markers.filter((m) => m.status === 'NORMAL').length;
  const highCount = markers.filter((m) => m.status === 'HIGH').length;
  const lowCount = markers.filter((m) => m.status === 'LOW').length;
  const borderlineCount = markers.filter((m) => m.status.startsWith('BORDERLINE')).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comprehensive Analysis</h1>
          <p className="text-sm text-muted-foreground">
            {markers.length} biomarkers analyzed · {highCount + lowCount} out of range
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/reports">View full report</Link>
        </Button>
      </div>

      <SafetyBanner variant="banner" />

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'In range', value: normalCount, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Above range', value: highCount, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: 'Below range', value: lowCount, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: 'Borderline', value: borderlineCount, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        ].map((t) => (
          <Card key={t.label} className={cn('border-0', t.bg)}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-2xl font-bold">{t.value}</p>
                <p className="text-xs text-muted-foreground">{t.label}</p>
              </div>
              <Activity className={cn('h-5 w-5', t.color)} />
            </CardContent>
          </Card>
        ))}
      </div>

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
                    biomarkerName={m.name + (TREND_LABEL[m.trend] ? ` (${TREND_LABEL[m.trend]})` : '')}
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

      {graphFacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4 text-primary" /> Clinical context from the knowledge base
            </CardTitle>
            <CardDescription>
              Medical entity relationships relevant to your results, from the clinical literature.
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

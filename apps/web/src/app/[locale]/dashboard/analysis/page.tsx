import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SafetyBanner } from '@/components/safety-banner';
import { BiomarkerChart } from '@/components/dashboard/biomarker-chart';
import { buildMarkerViews, groupByCategory, type MarkerView } from '@/lib/analysis';
import { assembleLocalizedNarrative, type ReportSectionsLike } from '@/lib/report-i18n';
import { cn } from '@/lib/utils';
import { Flag, Activity, AlertTriangle, Network, FlaskConical } from 'lucide-react';

const TREND_KEY: Record<MarkerView['trend'], string> = {
  UP: 'trendRising',
  DOWN: 'trendFalling',
  FLAT: 'trendStable',
  SINGLE: '',
};

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Analysis');
  const biomarkersT = await getTranslations('Biomarkers');
  const categoriesT = await getTranslations('Categories');
  const reportT = await getTranslations('Report');
  const findingsT = await getTranslations('Findings');
  const statusT = await getTranslations('Status');
  const trendT = await getTranslations('Trend');

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
  const sections = (latestReport?.sections ?? {}) as ReportSectionsLike;
  // Reassemble red flags / questions / suggested tests in the active locale from
  // the structured data. Legacy reports fall back to stored English inside the
  // helper. Graph facts are source citations and stay verbatim.
  const narr = assembleLocalizedNarrative(sections, {
    report: reportT,
    findings: findingsT,
    status: statusT,
    trend: trendT,
    biomarkers: biomarkersT,
    categories: categoriesT,
  });
  const redFlags = narr.redFlags;
  const graphFacts = (sections.knowledgeGraphFacts as string[]) ?? [];
  const questions = narr.questionsForPhysician;
  const additionalTests = narr.suggestedAdditionalTests;

  const normalCount = markers.filter((m) => m.status === 'NORMAL').length;
  const highCount = markers.filter((m) => m.status === 'HIGH').length;
  const lowCount = markers.filter((m) => m.status === 'LOW').length;
  const borderlineCount = markers.filter((m) => m.status.startsWith('BORDERLINE')).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('summary', { analyzed: markers.length, outOfRange: highCount + lowCount })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/reports">{t('viewFullReport')}</Link>
        </Button>
      </div>

      <SafetyBanner variant="banner" />

      {redFlags.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Flag className="h-4 w-4" /> {t('priorityReview', { count: redFlags.length })}
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
          { label: t('inRange'), value: normalCount, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: t('aboveRange'), value: highCount, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: t('belowRange'), value: lowCount, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: t('borderline'), value: borderlineCount, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        ].map((tile) => (
          <Card key={tile.label} className={cn('border-0', tile.bg)}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-2xl font-bold">{tile.value}</p>
                <p className="text-xs text-muted-foreground">{tile.label}</p>
              </div>
              <Activity className={cn('h-5 w-5', tile.color)} />
            </CardContent>
          </Card>
        ))}
      </div>

      {markers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FlaskConical className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('noResults')}</p>
            <Button asChild>
              <Link href="/dashboard/labs">{t('addYourLabs')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...categories.entries()].map(([cat, ms]) => (
            <div key={cat}>
              <h3 className="mb-3 text-sm font-medium capitalize text-muted-foreground">{categoriesT.has(cat) ? categoriesT(cat) : cat}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {ms.map((m) => {
                  const trendKey = TREND_KEY[m.trend];
                  const localizedName = biomarkersT.has(m.key) ? biomarkersT(m.key) : m.name;
                  const name = trendKey
                    ? `${localizedName} (${t(trendKey as never)})`
                    : localizedName;
                  return (
                    <BiomarkerChart
                      key={m.key}
                      biomarkerName={name}
                      unit={m.unit}
                      data={m.points}
                      refLow={m.refLow}
                      refHigh={m.refHigh}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {graphFacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4 text-primary" /> {t('clinicalContext')}
            </CardTitle>
            <CardDescription>{t('clinicalContextDesc')}</CardDescription>
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
              <CardTitle className="text-base">{t('discussionPoints')}</CardTitle>
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
              <CardTitle className="text-base">{t('suggestedTests')}</CardTitle>
              <CardDescription>{t('suggestedTestsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {additionalTests.slice(0, 8).map((tt, i) => (
                  <li key={i}>{tt}</li>
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

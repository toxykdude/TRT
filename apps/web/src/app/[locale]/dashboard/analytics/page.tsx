import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { BiomarkerChart } from '@/components/dashboard/biomarker-chart';
import { buildAnalyticsSeries, serializeForConsumer, type AnalyticsRange } from '@/lib/analytics-series';
import { groupByCategory } from '@/lib/analysis';
import { cn } from '@/lib/utils';
import { FlaskConical } from 'lucide-react';

const RANGES: AnalyticsRange[] = ['3m', '6m', '1y', 'all'];

const RANGE_LABEL: Record<AnalyticsRange, string> = {
  '3m': 'range3m',
  '6m': 'range6m',
  '1y': 'range1y',
  all: 'rangeAll',
};

function parseRange(v: string | undefined): AnalyticsRange {
  return v === '3m' || v === '6m' || v === '1y' ? v : 'all';
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Analytics');

  const session = await auth();
  const ownerId = session!.user.id;
  const db = prismaFor(ownerId);
  const range = parseRange((await searchParams).range);

  // ownerId is the real tenancy gate (prismaFor is BYPASSRLS, TC-7). Every read
  // — the stat aggregates AND buildAnalyticsSeries — filters where:{ ownerId }.
  const [series, labs, results, byCategory] = await Promise.all([
    buildAnalyticsSeries(db, ownerId, range),
    db.labReport.count({ where: { ownerId } }),
    db.labResult.count({ where: { ownerId, reviewStatus: 'CONFIRMED' } }),
    db.labResult.groupBy({
      by: ['biomarkerId'],
      _count: true,
      where: { ownerId, reviewStatus: 'CONFIRMED' },
    }),
  ]);

  // SRV-2 / fail-closed: scan the consumer payload before it reaches the chart.
  // A forbidden dosing FIELD still throws (must-BLOCK); a medication NAME that
  // trips the scan is omitted gracefully + audited (AGENTS §6) so the page never
  // 500s for a user whose med is named with a concentration (e.g. "… 200mg/ml").
  const { series: safeSeries, omissions } = serializeForConsumer(series);
  // Audit each omission for human review (ownerId-scoped). The offending name
  // lives ONLY in this audit row (server-side) — never on the consumer surface.
  // Non-fatal: safety is guaranteed by the omission in the pure lib, so an audit
  // write failure must NEVER re-brick the page (that would undo this fix).
  for (const om of omissions) {
    try {
      await db.auditLog.create({
        data: {
          userId: ownerId,
          action: 'guardrail_omit',
          entity: 'medication',
          detail: { reason: om.reason, name: om.name },
        },
      });
    } catch {
      // Best-effort audit; the consumer payload is already safe (med omitted).
    }
  }
  const categories = groupByCategory(safeSeries.biomarkers);
  const hasCharts = safeSeries.biomarkers.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <SafetyBanner />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('labReports')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('biomarkerValues')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{results}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('distinctMarkers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{byCategory.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Range preset chips (TC-6) — server-first via URL searchParam. */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Button
            key={r}
            asChild
            variant={r === range ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/dashboard/analytics?range=${r}`}>{t(RANGE_LABEL[r] as never)}</Link>
          </Button>
        ))}
      </div>

      {omissions.length > 0 && (
        <p role="note" className="text-xs text-muted-foreground">
          {t('medsOmittedNotice', { count: omissions.length })}
        </p>
      )}

      {hasCharts ? (
        <div className="space-y-6">
          {[...categories.entries()].map(([cat, ms]) => (
            <div key={cat}>
              <h3 className="mb-3 text-sm font-medium capitalize text-muted-foreground">{cat}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {ms.map((m) => (
                  <BiomarkerChart
                    key={m.key}
                    biomarkerName={m.name}
                    unit={m.unit}
                    data={m.points}
                    refLow={m.refLow}
                    refHigh={m.refHigh}
                    // Timing-only medication overlay (TC-3); dose never reaches here.
                    medications={safeSeries.medications}
                    // Symptom magnitude dots (TC-5).
                    symptoms={safeSeries.symptoms}
                    brush
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Honest empty-state (S-TC-EMPTY): no fabricated chart.
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FlaskConical className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t('emptyTitle')}</p>
            <p className="max-w-md text-xs text-muted-foreground">{t('emptyWhat')}</p>
            <Button asChild>
              <Link href="/dashboard/labs">{t('goToLabs')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

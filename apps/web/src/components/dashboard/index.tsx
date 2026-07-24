'use client';

import {
  Pill,
  Syringe,
  Activity,
  AlertTriangle,
  TestTube,
  Droplet,
  HeartPulse,
  Target,
  ArrowLeft,
  FileText,
  BookOpen,
  Network,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  StatTile,
  ChartCard,
  BiomarkerTrendChart,
  RangeComparisonChart,
  StatusDonutChart,
  HormoneAreaChart,
  CategoryCoverageChart,
  DosingTable,
  CHART_COLORS,
  type ChartData,
} from './charts';

type DosingRec = {
  compound: string;
  dose: string;
  frequency: string;
  route: string;
  cycleLength: string;
  indication: string;
  expectedBiomarkerShift: string;
  ragSourceIds: string[];
  priority: 'clinical_priority' | 'standard' | 'alternative';
  notes?: string;
};

type ReportData = {
  executiveSummary: string;
  hormoneTrends: string;
  cbcTrends: string;
  estradiolTrends: string;
  shbgTrends: string;
  thyroidTrends: string;
  metabolicHealth: string;
  cardiovascularRiskFactors: string;
  questionsForPhysician: string[];
  suggestedAdditionalTests: string[];
  redFlags: string[];
  lifestyleFactors: string;
  guidelineReferences: string[];
  knowledgeBaseReferences: string[];
  knowledgeGraphFacts: string[];
  dosingRecommendations?: DosingRec[];
  chartData?: ChartData;
};

export function Dashboard({
  report,
}: {
  report: { sections: ReportData; generatedAt: string; generatedBy: string; redFlags: string[] };
}) {
  const t = useTranslations('Report');
  const statusT = useTranslations('Status');
  const s = report.sections;
  const dosing = s.dosingRecommendations || [];
  const chart = s.chartData;
  const classified = chart?.classified || [];
  const trends = chart?.trends || [];
  const meta = chart?.meta;

  // Helper: latest value for a biomarker
  const latestVal = (key: string) => {
    const items = classified.filter((c) => c.biomarkerKey === key);
    const latest = items.sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))[0];
    return latest;
  };

  const totalT = latestVal('total_testosterone');
  const estradiol = latestVal('estradiol_sensitive');
  const hematocrit = latestVal('hematocrit');
  const freeT = latestVal('free_testosterone');
  const shbg = latestVal('shbg');

  const trendDir = (key: string): 'up' | 'down' | 'flat' => {
    const t = trends.find((t) => t.biomarkerKey === key);
    if (!t) return 'flat';
    return t.direction === 'UP' ? 'up' : t.direction === 'DOWN' ? 'down' : 'flat';
  };

  const clinicalPriority = dosing.filter((d) => d.priority === 'clinical_priority').length;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-1 -ml-2">
            <Link href="/dashboard/reports"><ArrowLeft className="mr-1 h-4 w-4" /> {t('backToReports')}</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('generatedAt', { date: report.generatedAt, by: report.generatedBy })}
            {meta && ` · ${t('resultCount', { count: meta.resultCount })} · ${t('findingCount', { count: meta.findingCount })}`}
          </p>
        </div>
      </div>

      {/* ── Row 1: KPI Stat Tiles + Trend Chart ─────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stat tiles (2/3 width) */}
        <ChartCard title={t('labSummary')} subtitle={t('labSummarySub')} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label={t('statTotalT')}
              value={totalT?.valueNumeric ?? '—'}
              unit="ng/dL"
              icon={TestTube}
              color={totalT?.status === 'LOW' ? 'red' : totalT?.status === 'HIGH' ? 'orange' : 'green'}
              caption={totalT ? statusT(totalT.status) : t('noData')}
              trend={trendDir('total_testosterone')}
            />
            <StatTile
              label={t('statEstradiol')}
              value={estradiol?.valueNumeric ?? '—'}
              unit="pg/mL"
              icon={Droplet}
              color={estradiol?.status === 'HIGH' ? 'purple' : 'blue'}
              caption={estradiol ? statusT(estradiol.status) : t('noData')}
              trend={trendDir('estradiol_sensitive')}
            />
            <StatTile
              label={t('statHematocrit')}
              value={hematocrit?.valueNumeric ?? '—'}
              unit="%"
              icon={HeartPulse}
              color={hematocrit?.status === 'HIGH' ? 'red' : 'green'}
              caption={hematocrit ? statusT(hematocrit.status) : t('noData')}
              trend={trendDir('hematocrit')}
            />
            <StatTile
              label={t('statFreeT')}
              value={freeT?.valueNumeric ?? '—'}
              unit="pg/mL"
              icon={Activity}
              color={freeT?.status === 'LOW' ? 'orange' : 'green'}
              caption={freeT ? statusT(freeT.status) : t('noData')}
              trend={trendDir('free_testosterone')}
            />
          </div>
        </ChartCard>

        {/* Trend chart (1/3 width) */}
        <ChartCard title={t('trendsTitle')} subtitle={t('trendsSub')}>
          <BiomarkerTrendChart
            trends={trends}
            keys={['total_testosterone', 'estradiol_sensitive', 'hematocrit', 'shbg']}
          />
        </ChartCard>
      </div>

      {/* ── Row 2: Three equal chart cards ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title={t('refRangesTitle')} subtitle={t('refRangesSub')}>
          <RangeComparisonChart
            classified={classified}
            keys={['total_testosterone', 'free_testosterone', 'estradiol_sensitive', 'hematocrit', 'shbg']}
          />
        </ChartCard>

        <ChartCard title={t('statusTitle')} subtitle={t('statusSub')}>
          <StatusDonutChart classified={classified} />
        </ChartCard>

        <ChartCard title={t('coverageTitle')} subtitle={t('coverageSub')}>
          <CategoryCoverageChart classified={classified} />
        </ChartCard>
      </div>

      {/* ── Row 3: Dosing + Hormone detail charts ───────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title={t('dosingTitle')}
          subtitle={t('dosingSub', { protocols: dosing.length, priority: clinicalPriority })}
          className="lg:col-span-2"
        >
          <DosingTable recommendations={dosing} />
        </ChartCard>

        <ChartCard title={t('hormoneTotalT')} subtitle={t('historicalTrend')}>
          <HormoneAreaChart trends={trends} biomarkerKey="total_testosterone" />
        </ChartCard>
      </div>

      {/* ── Row 4: Individual biomarker charts ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title={t('hormoneEstradiol')} subtitle={t('historicalTrend')}>
          <HormoneAreaChart trends={trends} biomarkerKey="estradiol_sensitive" />
        </ChartCard>
        <ChartCard title={t('hormoneHematocrit')} subtitle={t('historicalTrend')}>
          <HormoneAreaChart trends={trends} biomarkerKey="hematocrit" />
        </ChartCard>
        <ChartCard title={t('hormoneShbg')} subtitle={t('historicalTrend')}>
          <HormoneAreaChart trends={trends} biomarkerKey="shbg" />
        </ChartCard>
      </div>

      {/* ── Row 5: Tabs for text sections ───────────────────────────────────── */}
      <Tabs defaultValue="dosing" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="dosing">{t('tabDosing')}</TabsTrigger>
          <TabsTrigger value="flags">{t('tabFlags')}</TabsTrigger>
          <TabsTrigger value="trends">{t('tabTrends')}</TabsTrigger>
          <TabsTrigger value="refs">{t('tabRefs')}</TabsTrigger>
          <TabsTrigger value="summary">{t('tabSummary')}</TabsTrigger>
        </TabsList>

        {/* Dosing Detail */}
        <TabsContent value="dosing" className="space-y-4">
          {dosing.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {dosing.map((rec, i) => (
                <DosingDetailCard key={i} rec={rec} />
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t('noDosing')}</CardContent></Card>
          )}
        </TabsContent>

        {/* Red Flags */}
        <TabsContent value="flags" className="space-y-3">
          {s.redFlags?.length > 0 ? (
            s.redFlags.map((flag, i) => (
              <Card key={i} className="border-red-500/30 bg-red-500/5">
                <CardContent className="flex items-start gap-3 py-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">{flag}</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t('noFlags')}</CardContent></Card>
          )}
        </TabsContent>

        {/* Trend Text */}
        <TabsContent value="trends" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <TextCard title={t('txtHormone')} body={s.hormoneTrends} />
            <TextCard title={t('txtCbc')} body={s.cbcTrends} />
            <TextCard title={t('txtEstradiol')} body={s.estradiolTrends} />
            <TextCard title={t('txtShbg')} body={s.shbgTrends} />
            <TextCard title={t('txtThyroid')} body={s.thyroidTrends} />
            <TextCard title={t('txtMetabolic')} body={s.metabolicHealth} />
            <TextCard title={t('txtCardio')} body={s.cardiovascularRiskFactors} />
            <TextCard title={t('txtLifestyle')} body={s.lifestyleFactors} />
          </div>
        </TabsContent>

        {/* References */}
        <TabsContent value="refs" className="space-y-4">
          {s.knowledgeBaseReferences?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" /> {t('kbRefs', { count: s.knowledgeBaseReferences.length })}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {s.knowledgeBaseReferences.map((r, i) => (
                    <li key={i} className="border-l-2 border-purple-500/40 pl-3 text-sm text-muted-foreground">{r}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {s.knowledgeGraphFacts?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Network className="h-4 w-4" /> {t('graphFacts', { count: s.knowledgeGraphFacts.length })}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {s.knowledgeGraphFacts.map((f, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Summary */}
        <TabsContent value="summary" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('execSummary')}</CardTitle></CardHeader>
            <CardContent><p className="text-sm leading-relaxed text-muted-foreground">{s.executiveSummary}</p></CardContent>
          </Card>
          {s.questionsForPhysician?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t('questionsTitle')}</CardTitle></CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {s.questionsForPhysician.map((q, i) => <li key={i}>{q}</li>)}
                </ol>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function DosingDetailCard({ rec }: { rec: DosingRec }) {
  const t = useTranslations('Report');
  const priorityMap = {
    clinical_priority: { labelKey: 'badgePriority' as const, cls: 'bg-red-500/10 text-red-600 border-red-500/20' },
    standard: { labelKey: 'badgeStandard' as const, cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    alternative: { labelKey: 'badgeAlternative' as const, cls: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  };
  const p = priorityMap[rec.priority];
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {rec.route === 'oral' ? <Pill className="h-4 w-4 text-blue-500" /> : <Syringe className="h-4 w-4 text-blue-500" />}
              {rec.compound}
            </CardTitle>
            <CardDescription>{rec.indication}</CardDescription>
          </div>
          <Badge variant="outline" className={p.cls}>{t(p.labelKey)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">{t('detailDose')} </span><span className="font-semibold">{rec.dose}</span></div>
          <div><span className="text-muted-foreground">{t('detailFreq')} </span><span className="font-semibold">{rec.frequency}</span></div>
          <div><span className="text-muted-foreground">{t('detailRoute')} </span><span className="font-semibold">{rec.route}</span></div>
          <div><span className="text-muted-foreground">{t('detailCycle')} </span><span className="font-semibold">{rec.cycleLength}</span></div>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium">{rec.expectedBiomarkerShift}</span>
          </div>
        </div>
        {rec.notes && <p className="text-xs text-muted-foreground italic">{rec.notes}</p>}
        {rec.ragSourceIds?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {rec.ragSourceIds.slice(0, 4).map((src, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{src}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TextCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-blue-500" />{title}</CardTitle></CardHeader>
      <CardContent><p className="text-sm leading-relaxed text-muted-foreground">{body}</p></CardContent>
    </Card>
  );
}

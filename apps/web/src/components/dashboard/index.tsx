'use client';

import {
  Activity,
  TrendingUp,
  Pill,
  Syringe,
  Target,
  Calendar,
  Beaker,
  AlertTriangle,
  BookOpen,
  Network,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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
};

const priorityConfig = {
  clinical_priority: { label: 'Priority', className: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400' },
  standard: { label: 'Standard', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400' },
  alternative: { label: 'Alternative', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400' },
};

export function Dashboard({ report }: { report: { sections: ReportData; generatedAt: string; generatedBy: string; redFlags: string[] } }) {
  const s = report.sections;
  const dosing = s.dosingRecommendations || [];
  const clinicalPriorityCount = dosing.filter((d) => d.priority === 'clinical_priority').length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <a href="/dashboard/reports">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Reports
            </a>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Clinical Report</h1>
          <p className="text-sm text-muted-foreground">
            Generated {report.generatedAt} · {report.generatedBy}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Dosing Recommendations"
          value={dosing.length.toString()}
          subtitle={`${clinicalPriorityCount} clinical priority`}
          icon={Pill}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          title="Red Flags"
          value={(s.redFlags || []).length.toString()}
          subtitle={s.redFlags?.length > 0 ? 'Needs attention' : 'All clear'}
          icon={AlertTriangle}
          color={s.redFlags?.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
          bgColor={s.redFlags?.length > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}
        />
        <KpiCard
          title="KB References"
          value={(s.knowledgeBaseReferences || []).length.toString()}
          subtitle="Cited passages"
          icon={BookOpen}
          color="text-purple-600 dark:text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <KpiCard
          title="Graph Facts"
          value={(s.knowledgeGraphFacts || []).length.toString()}
          subtitle="Relationship facts"
          icon={Network}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-500/10"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dosing" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="dosing">Dosing</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="flags">Red Flags</TabsTrigger>
          <TabsTrigger value="refs">References</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        {/* Dosing Tab */}
        <TabsContent value="dosing" className="space-y-4">
          {dosing.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {dosing.map((rec, i) => (
                <DosingCard key={i} rec={rec} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Pill className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No dosing recommendations yet. Generate a report with lab data to see protocols.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendCard title="Hormone Trends" body={s.hormoneTrends} />
            <TrendCard title="CBC Trends" body={s.cbcTrends} />
            <TrendCard title="Estradiol Trends" body={s.estradiolTrends} />
            <TrendCard title="SHBG Trends" body={s.shbgTrends} />
            <TrendCard title="Thyroid Trends" body={s.thyroidTrends} />
            <TrendCard title="Metabolic Health" body={s.metabolicHealth} />
            <TrendCard title="Cardiovascular Risk" body={s.cardiovascularRiskFactors} />
            <TrendCard title="Lifestyle Factors" body={s.lifestyleFactors} />
          </div>
        </TabsContent>

        {/* Red Flags Tab */}
        <TabsContent value="flags" className="space-y-4">
          {s.redFlags?.length > 0 ? (
            <div className="space-y-3">
              {s.redFlags.map((flag, i) => (
                <Card key={i} className="border-red-500/30 bg-red-500/5">
                  <CardContent className="flex items-start gap-3 py-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{flag}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No red flags detected.</p>
              </CardContent>
            </Card>
          )}

          {s.questionsForPhysician?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Questions for your physician</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  {s.questionsForPhysician.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* References Tab */}
        <TabsContent value="refs" className="space-y-4">
          {s.knowledgeBaseReferences?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4" /> Knowledge Base References
                </CardTitle>
                <CardDescription>Cited passages from the medical corpus</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {s.knowledgeBaseReferences.map((r, i) => (
                    <li key={i} className="border-l-2 border-purple-500/40 pl-3 text-sm text-muted-foreground">
                      {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {s.knowledgeGraphFacts?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Network className="h-4 w-4" /> Knowledge Graph Relationships
                </CardTitle>
                <CardDescription>Medical entity relationships from the corpus</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {s.knowledgeGraphFacts.map((fact, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-orange-500" />
                      <span className="text-muted-foreground">{fact}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {s.guidelineReferences?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Guideline References</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {s.guidelineReferences.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.executiveSummary}</p>
            </CardContent>
          </Card>

          {s.suggestedAdditionalTests?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Beaker className="h-4 w-4" /> Suggested Additional Tests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {s.suggestedAdditionalTests.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  bgColor,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className={cn('rounded-xl p-3', bgColor)}>
            <Icon className={cn('h-6 w-6', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DosingCard({ rec }: { rec: DosingRec }) {
  const config = priorityConfig[rec.priority];
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {rec.route === 'oral' ? (
                <Pill className="h-4 w-4 text-blue-500" />
              ) : (
                <Syringe className="h-4 w-4 text-blue-500" />
              )}
              {rec.compound}
            </CardTitle>
            <CardDescription className="mt-1">{rec.indication}</CardDescription>
          </div>
          <Badge variant="outline" className={cn('shrink-0', config.className)}>
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dosing grid */}
        <div className="grid grid-cols-2 gap-3">
          <DoseDetail icon={Pill} label="Dose" value={rec.dose} />
          <DoseDetail icon={Calendar} label="Frequency" value={rec.frequency} />
          <DoseDetail icon={Syringe} label="Route" value={rec.route} />
          <DoseDetail icon={Activity} label="Cycle" value={rec.cycleLength} />
        </div>

        {/* Expected shift */}
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-green-600 dark:text-green-400" />
            <div>
              <span className="text-xs text-muted-foreground">Expected shift: </span>
              <span className="text-sm font-medium">{rec.expectedBiomarkerShift}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {rec.notes && (
          <p className="text-xs text-muted-foreground italic">{rec.notes}</p>
        )}

        {/* RAG sources */}
        {rec.ragSourceIds?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Sources:</span>
            {rec.ragSourceIds.slice(0, 4).map((src, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">
                {src}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DoseDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function TrendCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import type { DeterministicReport } from '@trt/engine';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';
import { ArrowLeft, Flag, HelpCircle, Beaker, BookOpen } from 'lucide-react';

type ReportRow = {
  id: string;
  generatedAt: Date;
  generatedBy: string;
  sections: DeterministicReport['sections'];
  redFlags: string[];
  dataRangeStart: Date | null;
  dataRangeEnd: Date | null;
};

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const db = prismaFor(session!.user.id);

  const report = (await db.report.findFirst({
    where: { id, ownerId: session!.user.id },
  })) as ReportRow | null;

  if (!report) notFound();

  const s = report.sections;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/reports">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clinical report</h1>
          <p className="text-sm text-muted-foreground">
            Generated {fmtDate(report.generatedAt)} · {report.generatedBy}
          </p>
        </div>
      </div>

      <SafetyBanner />

      {report.redFlags.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Flag className="h-4 w-4" /> Red flags — prompt clinician review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {report.redFlags.map((rf, i) => (
                <li key={i}>{rf}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Executive summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{s.executiveSummary}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Hormone trends" body={s.hormoneTrends} />
        <SectionCard title="CBC trends" body={s.cbcTrends} />
        <SectionCard title="Estradiol trends" body={s.estradiolTrends} />
        <SectionCard title="SHBG trends" body={s.shbgTrends} />
        <SectionCard title="Thyroid trends" body={s.thyroidTrends} />
        <SectionCard title="Metabolic health" body={s.metabolicHealth} />
        <SectionCard title="Cardiovascular risk factors" body={s.cardiovascularRiskFactors} />
        <SectionCard title="Lifestyle factors" body={s.lifestyleFactors} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" /> Questions for your physician
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {s.questionsForPhysician.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beaker className="h-4 w-4" /> Suggested additional tests
          </CardTitle>
          <CardDescription>For discussion with your clinician when data are incomplete.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {s.suggestedAdditionalTests.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Guideline references
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {s.guidelineReferences.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

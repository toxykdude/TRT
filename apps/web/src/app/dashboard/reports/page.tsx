import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';
import { fmtDate } from '@/lib/utils';
import { GenerateReportButton } from '@/components/dashboard/generate-report-button';

export default async function ReportsPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);

  const [reports, resultCount] = await Promise.all([
    db.report.findMany({ orderBy: { generatedAt: 'desc' }, take: 10 }),
    db.labResult.count(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Structured clinical summaries for your healthcare provider.
        </p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>Generate a clinical report</CardTitle>
          <CardDescription>
            Produces a guideline-informed summary from your recorded labs. Educational only — it
            does not diagnose or prescribe (GOLD §5.13).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateReportButton resultCount={resultCount} disabled={resultCount === 0} />
          {resultCount === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Upload and extract a lab first.</p>
          )}
        </CardContent>
      </Card>

      {reports.length === 0 ? (
        <PlaceholderCard
          title="No reports yet"
          what="Generated reports appear here. They summarize your trends and list red flags and questions to discuss with your clinician."
          next="PDF/Word export and trend charts are part of the next pass."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent reports</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <span>Report · {fmtDate(r.generatedAt)}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.generatedBy} · {r.redFlags.length} red flag{r.redFlags.length === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

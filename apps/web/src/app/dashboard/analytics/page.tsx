import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';

export default async function AnalyticsPage() {
  const session = await auth();
  const db = prismaFor(session!.user.id);
  const [labs, results, byCategory] = await Promise.all([
    db.labReport.count(),
    db.labResult.count(),
    db.labResult.groupBy({
      by: ['biomarkerId'],
      _count: true,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Counts and coverage across your records.</p>
      </div>
      <SafetyBanner />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lab reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Biomarker values</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{results}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distinct biomarkers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{byCategory.length}</div>
          </CardContent>
        </Card>
      </div>
      <PlaceholderCard
        title="Interactive trend charts — coming next"
        what="Per-biomarker line charts with reference-range overlays, medication overlays, and symptom overlays (GOLD §5.9) are part of the next pass."
        next="Recharts-powered charts with hover, zoom, and date-range compare."
      />
    </div>
  );
}

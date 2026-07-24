import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Analytics');

  const session = await auth();
  const db = prismaFor(session!.user.id);
  const [labs, results, byCategory] = await Promise.all([
    db.labReport.count(),
    // P0.2.b: only CONFIRMED values count toward analytics aggregates.
    db.labResult.count({ where: { reviewStatus: 'CONFIRMED' } }),
    db.labResult.groupBy({
      by: ['biomarkerId'],
      _count: true,
      where: { reviewStatus: 'CONFIRMED' },
    }),
  ]);

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
      <PlaceholderCard
        title={t('chartsTitle')}
        what={t('chartsWhat')}
        next={t('chartsNext')}
      />
    </div>
  );
}

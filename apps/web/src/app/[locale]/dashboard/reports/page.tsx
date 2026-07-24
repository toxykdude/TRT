import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';
import { fmtDate } from '@/lib/utils';
import { GenerateReportButton } from '@/components/dashboard/generate-report-button';

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Reports');

  const session = await auth();
  const db = prismaFor(session!.user.id);

  const [reports, resultCount] = await Promise.all([
    db.report.findMany({ orderBy: { generatedAt: 'desc' }, take: 10 }),
    db.labResult.count(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>{t('generateTitle')}</CardTitle>
          <CardDescription>{t('generateDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateReportButton resultCount={resultCount} disabled={resultCount === 0} />
          {resultCount === 0 && <p className="mt-2 text-xs text-muted-foreground">{t('uploadFirst')}</p>}
        </CardContent>
      </Card>

      {reports.length === 0 ? (
        <PlaceholderCard
          title={t('noReportsTitle')}
          what={t('noReportsWhat')}
          next={t('noReportsNext')}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('recentReports')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <Link href={`/dashboard/reports/${r.id}`} className="font-medium hover:underline">
                    {t('reportLabel', { date: fmtDate(r.generatedAt) })}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {r.generatedBy} · {t('redFlags', { count: r.redFlags.length })}
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

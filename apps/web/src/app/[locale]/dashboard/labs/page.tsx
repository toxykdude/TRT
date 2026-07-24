import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { UploadZone } from '@/components/dashboard/upload-zone';
import { ManualEntry } from '@/components/dashboard/manual-entry';
import { LabsList } from '@/components/dashboard/labs-list';
import { fmtDate } from '@/lib/utils';

export default async function LabsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Labs');

  const session = await auth();
  const db = prismaFor(session!.user.id);

  const reports = await db.labReport.findMany({
    where: { ownerId: session!.user.id },
    orderBy: { uploadedAt: 'desc' },
    include: { _count: { select: { results: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>{t('uploadTitle')}</CardTitle>
          <CardDescription>{t('uploadDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadZone />
          <div className="mt-4 flex items-center gap-3 border-t pt-4">
            <ManualEntry />
            <span className="text-xs text-muted-foreground">
              {t('or')}{' '}
              <Link href="/dashboard/labs/results" className="text-primary hover:underline">
                {t('viewResults')}
              </Link>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('yourReports')}</CardTitle>
          <CardDescription>{t('reportCount', { count: reports.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          <LabsList
            reports={reports.map((r) => ({
              id: r.id,
              fileName: r.fileName,
              uploadedAt: fmtDate(r.uploadedAt),
              status: r.status,
              resultCount: r._count.results,
              reviewNeeded: r.reviewNeeded,
              laboratory: r.laboratory,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

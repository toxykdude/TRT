import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { FlaskConical, FileText, Upload, ArrowRight, Activity } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SafetyBanner } from '@/components/safety-banner';
import { fmtDate } from '@/lib/utils';

export default async function DashboardHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Overview');
  const tCommon = await getTranslations('Dashboard');

  const session = await auth();
  const db = prismaFor(session!.user.id);

  const [patient, labCount, latestResults] = await Promise.all([
    db.patient.findUnique({ where: { ownerId: session!.user.id } }),
    db.labReport.count(),
    db.labResult.findMany({
      orderBy: { collectedAt: 'desc' },
      take: 5,
      include: { biomarker: true },
    }),
  ]);

  const name = session?.user.name;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {patient && name ? t('welcomeBackName', { name }) : t('welcomeBack')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SafetyBanner />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('labReports')}</CardTitle>
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labCount}</div>
            <p className="text-xs text-muted-foreground">{t('uploadedFiles')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('biomarkerValues')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{labCount > 0 ? latestResults.length : 0}</div>
            <p className="text-xs text-muted-foreground">{t('mostRecent')}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('yourAnalysis')}</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href="/dashboard/analysis">
                {t('viewAnalysis')} <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('recentValues')}</CardTitle>
          <CardDescription>{t('recentValuesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {latestResults.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
              <p>{t('noResults')}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/labs">
                  {t('goToLabs')} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">{t('thBiomarker')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('thValue')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('thRange')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('thFlag')}</th>
                    <th className="pb-2 font-medium">{t('thCollected')}</th>
                  </tr>
                </thead>
                <tbody>
                  {latestResults.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-4">{r.biomarker.name}</td>
                      <td className="py-2 pr-4">
                        {r.rawValue ?? '—'} {r.rawUnit ?? ''}
                        {r.uncertain && (
                          <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                            {tCommon('review')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{r.rawRefText ?? '—'}</td>
                      <td className="py-2 pr-4">{r.flag ?? '—'}</td>
                      <td className="py-2 text-muted-foreground">{fmtDate(r.collectedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

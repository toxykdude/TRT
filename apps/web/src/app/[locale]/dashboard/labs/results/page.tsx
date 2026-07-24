import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { classifyResult } from '@trt/engine';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { Button } from '@/components/ui/button';
import { fmtDate, cn } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  LOW: 'text-red-500',
  BORDERLINE_LOW: 'text-amber-500',
  HIGH: 'text-red-500',
  BORDERLINE_HIGH: 'text-amber-500',
  NORMAL: 'text-emerald-500',
  NON_NUMERIC: 'text-muted-foreground',
  NO_RANGE: 'text-muted-foreground',
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.LabsResults');
  const tCommon = await getTranslations('Dashboard');
  const statusT = await getTranslations('Status');

  const session = await auth();
  const db = prismaFor(session!.user.id);

  const results = await db.labResult.findMany({
    where: { ownerId: session!.user.id },
    include: { biomarker: true },
    orderBy: { collectedAt: 'desc' },
  });

  // Group by biomarker for a per-marker view.
  const byMarker = new Map<string, typeof results>();
  for (const r of results) {
    const arr = byMarker.get(r.biomarker.key) ?? [];
    arr.push(r);
    byMarker.set(r.biomarker.key, arr);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/labs">{t('backToLabs')}</Link>
        </Button>
      </div>

      <SafetyBanner />

      {byMarker.size === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('noResults')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from(byMarker.entries()).map(([key, points]) => {
            const latest = points[0]!;
            const classified = classifyResult({
              biomarkerKey: key,
              biomarkerName: latest.biomarker.name,
              category: latest.biomarker.category,
              collectedAt: latest.collectedAt?.toISOString() ?? null,
              valueNumeric: latest.valueNumeric,
              unit: latest.unit ?? latest.biomarker.canonicalUnit,
              rawValue: latest.rawValue,
              refLow: numOrNull(latest.rawRefLow) ?? latest.biomarker.refLow ?? null,
              refHigh: numOrNull(latest.rawRefHigh) ?? latest.biomarker.refHigh ?? null,
              refText: latest.rawRefText,
              flag: latest.flag,
            });
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{latest.biomarker.name}</CardTitle>
                    <span className={cn('text-xs font-medium', STATUS_STYLE[classified.status])}>
                      {statusT(classified.status)}
                    </span>
                  </div>
                  <CardDescription className="capitalize">{latest.biomarker.category}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {latest.rawValue ?? '—'}{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      {latest.rawUnit ?? ''}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('rangeLabel')}: {latest.rawRefText ?? '—'} · {fmtDate(latest.collectedAt)} ·{' '}
                    {t('valueCount', { count: points.length })}
                    {latest.uncertain && ` · ${tCommon('review')}`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function numOrNull(s: string | null): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

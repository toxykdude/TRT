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

  // Group by biomarker for a per-marker view. Unmapped rows (biomarker null
  // since P0.2.a) are grouped under their printed rawName so they surface for
  // review instead of being dropped. This page shows ALL rows (review surface).
  const byMarker = new Map<string, typeof results>();
  for (const r of results) {
    const key = r.biomarker?.key ?? `raw:${r.rawName ?? 'unknown'}`;
    const arr = byMarker.get(key) ?? [];
    arr.push(r);
    byMarker.set(key, arr);
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
            const biomarker = latest.biomarker;
            // Null-safe display fields: unmapped rows (biomarker null) use the
            // printed rawName + raw range; status falls back to NO_RANGE.
            const biomarkerName = biomarker?.name ?? latest.rawName ?? '—';
            const category = biomarker?.category ?? 'unknown';
            const canonicalUnit = biomarker?.canonicalUnit ?? null;
            const refLow = numOrNull(latest.rawRefLow) ?? biomarker?.refLow ?? null;
            const refHigh = numOrNull(latest.rawRefHigh) ?? biomarker?.refHigh ?? null;
            const isPending = latest.reviewStatus === 'PENDING_REVIEW';
            const classified = classifyResult({
              biomarkerKey: biomarker?.key ?? key,
              biomarkerName,
              category,
              collectedAt: latest.collectedAt?.toISOString() ?? null,
              valueNumeric: latest.valueNumeric,
              unit: latest.unit ?? canonicalUnit,
              rawValue: latest.rawValue,
              refLow,
              refHigh,
              refText: latest.rawRefText,
              flag: latest.flag,
            });
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{biomarkerName}</CardTitle>
                    <span className={cn('text-xs font-medium', STATUS_STYLE[classified.status])}>
                      {statusT(classified.status)}
                    </span>
                  </div>
                  <CardDescription className="capitalize">{category}</CardDescription>
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
                    {isPending && ` · ${tCommon('review')}`}
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

// TODO dedupe numOrNull — 4 divergent copies exist; see packages/ai/src/extraction.ts.
function numOrNull(s: string | null): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

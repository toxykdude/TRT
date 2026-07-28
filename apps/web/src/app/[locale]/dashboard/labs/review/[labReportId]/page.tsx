import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { ReviewForm } from '@/components/dashboard/review-form';
import { buildReviewRows } from '@/lib/review-flow';

/**
 * Explicit accuracy confirmation surface (spec Req 4 / design.md).
 *
 * Lists every PENDING_REVIEW row for one owner-scoped labReport with its
 * biomarker name, printed value, unit, and uncertainty reason, plus confirm /
 * correct / manual actions. The disclaimer is NON-DISMISSIBLE (GOLD §2.5).
 *
 * Tenancy: the labReport fetch binds ownerId from auth (prismaFor is BYPASSRLS —
 * `where: { ownerId }` is the only gate); a cross-owner report → notFound() (no
 * oracle leak, same 404 as a missing id). The pending list is scoped the same way.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; labReportId: string }>;
}) {
  const { locale, labReportId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Review');

  const session = await auth();
  if (!session?.user?.id) notFound();

  const db = prismaFor(session.user.id);

  // Owner-scoped report fetch — cross-owner is "not found".
  const report = await db.labReport.findFirst({
    where: { id: labReportId, ownerId: session.user.id },
  });
  if (!report) notFound();

  // Owner-scoped PENDING_REVIEW list (P0.2.b — pending never feeds trends).
  const results = await db.labResult.findMany({
    where: { labReportId, ownerId: session.user.id, reviewStatus: 'PENDING_REVIEW' },
    include: { biomarker: true },
    orderBy: { collectedAt: 'asc' },
  });

  const rows = buildReviewRows(results as never);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* NON-DISMISSIBLE clinical disclaimer (GOLD §2.5) — no close affordance. */}
      <SafetyBanner variant="banner" />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('nothingPending')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('reviewTitle')}</CardTitle>
            <CardDescription>{t('reviewDesc', { count: rows.length })}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewForm labReportId={labReportId} rows={rows} locale={locale} />
          </CardContent>
        </Card>
      )}

      <SafetyBanner variant="footer" />
    </div>
  );
}

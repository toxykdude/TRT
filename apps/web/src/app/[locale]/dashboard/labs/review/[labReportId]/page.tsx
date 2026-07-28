import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { ReviewForm } from '@/components/dashboard/review-form';
import { buildReviewRows } from '@/lib/review-flow';
import { loadReviewData } from '@/lib/review-data';

/**
 * Explicit accuracy confirmation surface (spec Req 4 / design.md).
 *
 * Lists every PENDING_REVIEW row for one owner-scoped labReport with its
 * biomarker name, printed value, unit, and uncertainty reason, plus confirm /
 * correct / manual actions. The disclaimer is NON-DISMISSIBLE (GOLD §2.5).
 *
 * Tenancy: `loadReviewData` binds ownerId on both the report fetch and the
 * pending list (prismaFor is BYPASSRLS — `where: { ownerId }` is the only gate);
 * a cross-owner report → notFound() (no oracle leak, same 404 as a missing id),
 * and the pending-list query is never issued (no PHI read).
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

  // Owner-scoped fetch — cross-owner returns null (no pending-list read issued).
  const data = await loadReviewData(db, labReportId, session.user.id);
  if (!data) notFound();

  const rows = buildReviewRows(data.results as never);

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

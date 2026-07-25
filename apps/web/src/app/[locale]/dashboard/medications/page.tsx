import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { MedicationEntryForm } from '@/components/dashboard/medication-entry-form';
import { fetchMedicationsForConsumer } from '@/lib/medications-list';
import { fmtDate } from '@/lib/utils';

/**
 * Medications page (GOLD §5.11 / spec ME-1..ME-7, SRV-1 / FIX-H).
 *
 * The patient's OWN dashboard surface: lists their medication history and hosts
 * the entry form. SAFETY (GOLD §2.3 / spec OQ#1, SRV-3): the list is TIMING-ONLY
 * — `fetchMedicationsForConsumer` selects only {id, name, startDate, endDate};
 * dose/frequency/route/reason/clinician are NEVER read here, so they can never
 * render. The §2.5 SafetyBanner is present (SRV-1 / ME-5).
 *
 * FIX-H — graceful degradation: a medication whose NAME carries a dosing pattern
 * (e.g. a concentration-bearing product name) is OMITTED from `meds` by the
 * helper and surfaced here ONLY as a COUNT notice (never the offending name),
 * consistent with the analytics overlay. The page no longer 500s on that case.
 */
export default async function MedicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Medications');

  const session = await auth();
  const ownerId = session!.user.id;
  const db = prismaFor(ownerId);

  // ownerId is the real tenancy gate (prismaFor is BYPASSRLS, TC-7). FIX-H: the
  // helper now partitions by name scan → { meds, omissions } (graceful omit).
  const { meds, omissions } = await fetchMedicationsForConsumer(db, ownerId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>{t('listTitle')}</CardTitle>
          <CardDescription>{t('listDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {meds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('emptyList')}</p>
          ) : (
            <ul className="divide-y">
              {meds.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('startDate')}: {fmtDate(m.startDate)}
                    {' · '}
                    {t('endDate')}: {m.endDate ? fmtDate(m.endDate) : t('ongoing')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* FIX-H — count-only notice: dirty-named meds were omitted for review.
              The offending names are NEVER rendered (GOLD §2.3). */}
          {omissions.length > 0 ? (
            <p className="mt-4 text-xs text-muted-foreground" role="note">
              {t('medsOmittedNotice', { count: omissions.length })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('addTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <MedicationEntryForm />
        </CardContent>
      </Card>
    </div>
  );
}

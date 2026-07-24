import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { SymptomEntryForm } from '@/components/dashboard/symptom-entry-form';
import { isKnownSymptom } from '@/lib/symptoms';
import { fmtDate } from '@/lib/utils';

/**
 * Symptoms page (GOLD §5.10 / spec SE-1..SE-5, SRV-1).
 *
 * The patient's OWN dashboard surface: lists their symptom log and hosts the
 * entry form. The §2.5 SafetyBanner is present (SRV-1 / SE-4). Every read is
 * scoped `where: { ownerId }` — prismaFor is BYPASSRLS, so app-layer scoping is
 * the real tenancy gate (TC-7). (The previous stub counted without ownerId — a
 * tenancy bug now fixed.)
 */

/** Symptom machine key → its translation key under Dashboard.Symptoms. */
const SYMPTOM_LABEL_KEY: Record<string, string> = {
  energy: 'symptomEnergy',
  mood: 'symptomMood',
  libido: 'symptomLibido',
  sleep: 'symptomSleep',
  recovery: 'symptomRecovery',
};

export default async function SymptomsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Symptoms');

  const session = await auth();
  const ownerId = session!.user.id;
  const db = prismaFor(ownerId);

  // ownerId is the real tenancy gate (prismaFor is BYPASSRLS, TC-7).
  const entries = await db.symptomEntry.findMany({
    where: { ownerId },
    orderBy: { date: 'desc' },
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
          <CardTitle>{t('listTitle')}</CardTitle>
          <CardDescription>{t('listDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('emptyList')}</p>
          ) : (
            <ul className="divide-y">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium">
                    {/* Only the fixed §5.10 set is stored; unknown keys fall back to the raw value. */}
                    {isKnownSymptom(e.symptom) ? t(SYMPTOM_LABEL_KEY[e.symptom] as never) : e.symptom}
                    {' · '}
                    <span className="text-muted-foreground">{t('score')}: {String(e.score)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(e.date)}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('addTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SymptomEntryForm />
        </CardContent>
      </Card>
    </div>
  );
}

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { SafetyBanner } from '@/components/safety-banner';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';

export default async function SymptomsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Symptoms');

  const session = await auth();
  const db = prismaFor(session!.user.id);
  const count = await db.symptomEntry.count();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <SafetyBanner />
      <PlaceholderCard
        title={t('trackingTitle', { count })}
        what={t('trackingWhat')}
        next={t('trackingNext')}
      />
    </div>
  );
}

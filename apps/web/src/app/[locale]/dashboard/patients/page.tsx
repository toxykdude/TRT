import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SafetyBanner } from '@/components/safety-banner';
import { ProfileForm } from '@/components/dashboard/profile-form';

export default async function PatientsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Patients');

  const session = await auth();
  const db = prismaFor(session!.user.id);
  const patient = await db.patient.findUnique({ where: { ownerId: session!.user.id } });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>{t('profileTitle')}</CardTitle>
          <CardDescription>{t('profileDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {patient ? <ProfileForm patient={patient} /> : <p className="text-sm text-muted-foreground">{t('noProfile')}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

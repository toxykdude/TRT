import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prismaFor } from '@trt/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SafetyBanner } from '@/components/safety-banner';
import { ThemeToggle } from '@/components/theme-toggle';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Dashboard.Settings');

  const session = await auth();
  const db = prismaFor(session!.user.id);
  const auditCount = await db.auditLog.count();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SafetyBanner />

      <Card>
        <CardHeader>
          <CardTitle>{t('appearanceTitle')}</CardTitle>
          <CardDescription>{t('appearanceDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('accountTitle')}</CardTitle>
          <CardDescription>
            {t('accountDesc', { email: session?.user.email ?? '', count: auditCount })}
          </CardDescription>
        </CardHeader>
      </Card>

      <PlaceholderCard
        title={t('exportTitle')}
        what={t('exportWhat')}
        next={t('exportNext')}
      />
    </div>
  );
}

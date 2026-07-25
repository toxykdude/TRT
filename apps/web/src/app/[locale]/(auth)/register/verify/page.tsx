import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { VerifyForm } from '@/components/auth/verify-form';
import { Link, redirect } from '@/i18n/navigation';

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user) redirect({ href: '/dashboard', locale });

  const t = await getTranslations('Auth.Verify');
  const email = (await searchParams).email?.trim() ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {email ? t('subtitle', { email }) : t('missingEmail')}
        </p>
      </div>

      {email && <VerifyForm email={email} />}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t('restart')}
        </Link>
      </p>
    </div>
  );
}

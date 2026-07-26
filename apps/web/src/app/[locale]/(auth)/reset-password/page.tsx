import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Link, redirect } from '@/i18n/navigation';

export default async function ResetPasswordPage({
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

  const t = await getTranslations('Auth.Reset');
  const email = (await searchParams).email?.trim() ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {email ? t('subtitle', { email }) : t('missingEmail')}
        </p>
      </div>

      {email && (
        <p
          role="status"
          className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
        >
          {t('confirmation')}
        </p>
      )}

      {email && <ResetPasswordForm email={email} />}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          {t('restart')}
        </Link>
      </p>
    </div>
  );
}

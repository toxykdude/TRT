import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { googleAction } from '@/app/actions';
import { SignupForm } from '@/components/auth/signup-form';
import { Button } from '@/components/ui/button';
import { Link, redirect } from '@/i18n/navigation';

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user) redirect({ href: '/dashboard', locale });

  const t = await getTranslations('Auth.Register');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SignupForm />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">{t('or')}</span>
        </div>
      </div>

      <form action={googleAction}>
        <Button variant="outline" type="submit" className="w-full">
          {t('google')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}

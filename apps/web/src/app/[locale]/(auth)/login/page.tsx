import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { loginAction, googleAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, redirect } from '@/i18n/navigation';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ verified?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user) redirect({ href: '/dashboard', locale });

  const t = await getTranslations('Auth.Login');
  const justVerified = (await searchParams).verified === '1';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {justVerified && (
        <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          {t('verified')}
        </p>
      )}

      <form action={loginAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('password')}</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full">
          {t('submit')}
        </Button>
      </form>

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
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t('createOne')}
        </Link>
      </p>
    </div>
  );
}

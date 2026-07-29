import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { presentAuthError } from '@/lib/auth-error';

/**
 * Auth.js error page (`pages.error` in `@/lib/auth`).
 *
 * Replaces the built-in @auth/core page, which renders every non-allowlisted
 * throw as "Server error / There is a problem with the server configuration" —
 * unbranded, unlocalized, and with no way forward. The single most common cause
 * in production is an expired PKCE cookie (`InvalidCheck`, 15-minute Max-Age),
 * which a retry fixes; see `@/lib/auth-error` for the full mapping.
 *
 * The `?error=` param is never rendered — `presentAuthError` collapses anything
 * unrecognised to a fixed key, so the query string cannot inject content here.
 */
export default async function AuthErrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { error } = await searchParams;
  const { key, retryable } = presentAuthError(error);

  const t = await getTranslations('Auth.Error');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p role="status" className="text-sm text-muted-foreground">
          {t(`reason.${key}`)}
        </p>
      </div>

      {retryable ? (
        <Button asChild className="w-full">
          <Link href="/login">{t('retry')}</Link>
        </Button>
      ) : (
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">{t('backToSignIn')}</Link>
        </Button>
      )}

      <p className="text-sm text-muted-foreground">{t('persists')}</p>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/" className="font-medium text-primary hover:underline">
          {t('home')}
        </Link>
      </p>
    </div>
  );
}

import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Combined edge middleware:
 *  1. next-intl — locale detection, prefixing (`/dashboard` → `/es/dashboard`),
 *     and the `NEXT_LOCALE` cookie.
 *  2. Dashboard auth gate (GOLD §5.3, defense-in-depth). Auth.js v5 stores its
 *     session in an encrypted cookie named `authjs.session-token`
 *     (`__Secure-...` under HTTPS). Block early if absent; the layout does the
 *     authoritative check. We avoid importing next-auth/middleware (its exports
 *     shift between beta versions).
 *
 * The matcher excludes /api (auth API routes at /api/auth/* must be bypassed),
 * Next internals, and static files.
 */
const TOKEN_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

const intlMiddleware = createIntlMiddleware(routing);

function localeFromPath(pathname: string): string {
  const first = pathname.split('/').filter(Boolean)[0];
  if (first && (routing.locales as readonly string[]).includes(first)) {
    return first;
  }
  return routing.defaultLocale;
}

export default function middleware(req: NextRequest) {
  // 1) Locale routing first — may itself return a redirect (e.g. adding prefix).
  const response = intlMiddleware(req);

  // 2) Dashboard auth gate.
  const { pathname } = req.nextUrl;
  if (pathname.includes('/dashboard')) {
    const token =
      req.cookies.get(TOKEN_COOKIE)?.value || req.cookies.get('authjs.session-token')?.value;
    if (!token) {
      const locale = localeFromPath(pathname);
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/login`;
      url.searchParams.set('callbackUrl', req.nextUrl.pathname);
      const redirect = NextResponse.redirect(url);
      // Preserve any cookies/headers set by the intl middleware.
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  return response;
}

export const config = {
  // Match all pathnames except for /api, /_next, /_vercel, and static files.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

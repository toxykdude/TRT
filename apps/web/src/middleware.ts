import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge-side auth gate for /dashboard/* (GOLD §5.3).
 *
 * Defense-in-depth alongside the per-layout auth() check. Auth.js v5 stores its
 * session in an encrypted cookie named `authjs.session-token` (or `__Secure-...`
 * under HTTPS). We block early if absent; the layout does the authoritative
 * check. This avoids importing the beta next-auth/middleware entry whose exports
 * shift between versions.
 */
const TOKEN_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

export function middleware(req: NextRequest) {
  const token =
    req.cookies.get(TOKEN_COOKIE)?.value || req.cookies.get('authjs.session-token')?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};

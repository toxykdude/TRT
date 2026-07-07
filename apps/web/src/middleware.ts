export { default } from 'next-auth/middleware';

export const config = {
  // Protect everything under /dashboard; auth routes + api/auth are public.
  matcher: ['/dashboard/:path*'],
};

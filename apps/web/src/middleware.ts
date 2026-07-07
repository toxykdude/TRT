import { withAuth } from 'next-auth/middleware';

// Protect everything under /dashboard (GOLD §5.3). Defense-in-depth alongside
// the per-layout auth() guard. Auth routes + api/auth remain public.
export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: ['/dashboard/:path*'],
};

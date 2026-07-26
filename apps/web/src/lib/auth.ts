import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { prisma } from '@trt/db';
import { verifyOtp, evaluateOtpAttempt } from '@/lib/otp';

/**
 * Auth.js v5 configuration.
 * - Prisma adapter persists sessions/accounts in Postgres.
 * - `login-otp` Credentials provider: authorizes on (email, code) ONLY — it
 *   never sees a password. Password verification happens earlier, in
 *   `requestLoginOtp` (apps/web/src/app/actions.ts), which mints a `LoginOtp`
 *   row after a successful `verifyUserPassword`. That row's existence is the
 *   proof the password step already passed, so THIS is the only path that can
 *   mint a session. A password-only Credentials provider must never be
 *   reintroduced alongside this one — that would let anyone POST straight to
 *   /api/auth/callback/credentials and skip the OTP, making 2FA decorative.
 * - Google provider: wired, needs GOOGLE_CLIENT_ID/SECRET to activate. Google
 *   runs its own 2FA, so it bypasses this OTP step by design.
 *
 * Sign-up creates a User via the *service* client (no RLS context yet).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  // Behind the Cloudflare Tunnel the Host header is the public domain
  // (trt.powerhousegym.co), which differs from the local bind address. Auth.js
  // rejects untrusted hosts by default; trust it explicitly.
  trustHost: true,
  theme: { logo: '/icon.svg' },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      id: 'login-otp',
      credentials: { email: {}, code: {} },
      async authorize(creds) {
        const email = (creds?.email as string | undefined)?.trim().toLowerCase();
        const code = creds?.code as string | undefined;
        if (!email || !code) return null;

        const record = await prisma.loginOtp.findUnique({ where: { email } });
        const matches = record ? await verifyOtp(code, record.codeHash) : false;
        const decision = evaluateOtpAttempt(record, matches, new Date());

        switch (decision.status) {
          case 'not_found':
          case 'expired':
            return null;
          case 'locked':
            // Burn the record so a locked code can never be retried.
            await prisma.loginOtp.delete({ where: { email } }).catch(() => {});
            return null;
          case 'mismatch':
            await prisma.loginOtp.update({
              where: { email },
              data: { attempts: { increment: 1 } },
            });
            return null;
          case 'ok':
            break; // fall through to session mint below
        }

        // decision.status === 'ok': delete the row and load the user in one
        // transaction so a verified code can never be replayed into a second
        // session. Include passwordChangedAt so the jwt callback can stamp
        // the token's epoch without a second DB round trip.
        const user = await prisma.$transaction(async (tx) => {
          const u = await tx.user.findUnique({ where: { email } });
          await tx.loginOtp.delete({ where: { email } });
          return u;
        });
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          passwordChangedAt: user.passwordChangedAt,
        } as {
          id: string;
          email: string;
          name?: string;
          role: string;
          passwordChangedAt: Date | null;
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // role is carried in the JWT for coarse UI gating. Authoritative role
        // checks (report generation, /admin) always re-read the DB row, since
        // license verification and role changes must take effect immediately.
        token.role = (user as { role?: string }).role ?? 'PATIENT';
        // Stamp the password epoch this token was minted under (§6 of the
        // plan). Present on the login-otp authorize() return above and on the
        // Prisma adapter's OAuth user; Google users have it null → epoch 0,
        // so a password reset (which they can't have) never affects them.
        const changedAt = (user as { passwordChangedAt?: Date | null }).passwordChangedAt;
        token.pwdAt = changedAt ? changedAt.getTime() : 0;
        return token;
      }

      // Subsequent request on an existing token: re-check against the LIVE
      // passwordChangedAt. session.strategy = 'jwt' means resetting a
      // password does not, by itself, revoke tokens already in the wild —
      // this is what actually makes that revocation happen. Returning null
      // invalidates the token; Auth.js then reports an empty/unauthenticated
      // session, which is exactly "reload the other browser → signed out".
      if (token.id) {
        const current = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { passwordChangedAt: true },
        });
        const changedAtMs = current?.passwordChangedAt?.getTime() ?? 0;
        if (changedAtMs > ((token.pwdAt as number | undefined) ?? 0)) {
          return null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as 'PATIENT' | 'CLINICIAN' | 'ADMIN') ?? 'PATIENT';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { prisma } from '@trt/db';

/**
 * Auth.js v5 configuration.
 * - Prisma adapter persists sessions/accounts in Postgres.
 * - Credentials provider: email + bcrypt-hashed password (local DB).
 * - Google provider: wired, needs GOOGLE_CLIENT_ID/SECRET to activate.
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
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = creds?.email as string | undefined;
        const password = creds?.password as string | undefined;
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

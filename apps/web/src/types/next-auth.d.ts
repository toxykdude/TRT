import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /** Coarse UI gate only — routes re-read the DB for authoritative checks. */
      role: 'PATIENT' | 'CLINICIAN' | 'ADMIN';
    } & DefaultSession['user'];
  }
}

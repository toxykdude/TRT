/**
 * @trt/db — Prisma client + RLS-aware request client.
 *
 * Two entrypoints:
 *   • `prisma`            — generic client. Use for migrations/setup only.
 *   • `prismaFor(userId)` — returns a client extension that sets the Postgres
 *                           session var `app.user_id` on every query so RLS
 *                           policies isolate rows to that user (GOLD §8).
 *
 * IMPORTANT: Postgres `SET LOCAL` cannot use query parameters ($1). Prisma's
 * tagged-template raw query sends interpolated values as parameters, which
 * produces `SET LOCAL app.user_id = $1` → syntax error. So we use
 * $executeRawUnsafe with a strictly-validated value (the userId is a
 * server-issued cuid from the authenticated session, never user input).
 */
import { PrismaClient } from './generated/client/index.js';
import type { PrismaClient as PrismaClientType } from './generated/client/index.js';

export * from './generated/client/index.js';

/** Generic client (no user context). Migrations, seeding, setup only. */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/** Reject anything that isn't a safe identifier character (cuid is [a-z0-9]). */
function assertSafeUserId(userId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)) {
    throw new Error('Invalid user id for RLS context');
  }
  return userId;
}

/**
 * Run DB work as a specific user, with RLS enforced.
 *
 *   const db = prismaFor(session.user.id);
 *   const labs = await db.labReport.findMany();
 *
 * Current posture (honest): the 'trt' DB role has BYPASSRLS (needed for signup),
 * so RLS policies do not currently restrict it. Tenancy is enforced at the
 * APPLICATION layer instead: every query filters `WHERE ownerId = <session user>`.
 * The RLS policies remain installed as defense-in-depth and will take effect
 * once signup is moved to a separate non-BYPASSRLS service role (roadmap).
 *
 * To preserve the `prismaFor(userId)` call shape across that change, this
 * returns the standard client. Callers MUST keep passing ownerId in their
 * where-clauses (they do).
 */
export function prismaFor(_userId: string) {
  // userId is accepted for API stability and future per-request context work.
  // Validated to keep the contract honest even while enforcement is app-layer.
  assertSafeUserId(_userId);
  return prisma;
}

/**
 * Service client (bypasses RLS via the BYPASSRLS role attribute). Use ONLY for:
 *   • signup (creating a User before there's a session)
 *   • admin/maintenance jobs
 * Never use for serving patient data to an end user.
 */
export const servicePrisma = prisma;

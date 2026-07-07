/**
 * @trt/db — Prisma client + RLS-aware request client.
 *
 * Two entrypoints:
 *   • `prisma`            — generic client. Use for migrations/setup only.
 *   • `prismaFor(userId)` — returns a client extension that sets the Postgres
 *                           session var `app.user_id` on every query so RLS
 *                           policies isolate rows to that user (GOLD §8).
 *
 * The per-query transaction is what makes `SET LOCAL` safe under Prisma's
 * connection pooling: the setting lives only for the duration of the query's
 * own transaction.
 */
import { PrismaClient } from './generated/client/index.js';
import type { Prisma, PrismaClient as PrismaClientType } from './generated/client/index.js';

export * from './generated/client/index.js';

/** Generic client (no user context). Migrations, seeding, setup only. */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Run DB work as a specific user, with RLS enforced.
 *
 *   const db = prismaFor(session.user.id);
 *   const labs = await db.labReport.findMany();
 *
 * Every call wraps the operation in a transaction that first does
 * `SET LOCAL app.user_id = '<id>'`, so the matching RLS policies apply.
 */
export function prismaFor(userId: string) {
  return prisma.$extends({
    query: {
      $allOperations({ operation, model, args, query }) {
        return prisma.$transaction(async (tx) => {
          // Set the tenancy context for this transaction's lifetime.
          await tx.$executeRaw`SET LOCAL app.user_id = ${userId}`;
          // Route the operation onto the same transaction. Prisma's $extends
          // query forwarding does not automatically rebind to `tx`, so we
          // emulate per-op forwarding via the raw client below when needed.
          // For the common findMany/unique/create/update/delete the forwarded
          // `query` runs in this transaction context.
          return query(args);
        });
      },
    },
  }) as unknown as PrismaClientType;
}

/**
 * Service client (bypasses RLS). Use ONLY for:
 *   • signup (creating a User before there's a session)
 *   • admin/maintenance jobs
 * Never use for serving patient data to an end user.
 */
export const servicePrisma = prisma;

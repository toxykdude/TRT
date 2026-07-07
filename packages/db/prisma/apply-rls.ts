/**
 * Apply Row Level Security policies to the database.
 *
 * Run AFTER `prisma migrate` (it creates the tables; this secures them).
 * Idempotent — safe to run repeatedly (each policy DROPs IF EXISTS first).
 *
 *   pnpm --filter @trt/db rls:apply
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from './src/generated/client/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, 'sql', 'rls.sql');

async function main() {
  const sql = readFileSync(sqlPath, 'utf8');
  // Use the service role (bypasses RLS) to install policies. In this local-Postgres
  // setup the app 'trt' role is the service role; the policies we install restrict
  // the same 'trt' role when it later sets app.user_id per request.
  const prisma = new PrismaClient();
  try {
    // Execute the whole script in one transaction.
    await prisma.$executeRawUnsafe(sql);
    console.log('✓ RLS policies applied (idempotent)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('✗ Failed to apply RLS:', e);
  process.exit(1);
});

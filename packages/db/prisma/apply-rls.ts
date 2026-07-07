/**
 * Apply Row Level Security policies to the database.
 *
 * Run AFTER `prisma migrate` (it creates the tables; this secures them).
 * Idempotent — safe to run repeatedly (each policy DROPs IF EXISTS first).
 *
 *   pnpm --filter @trt/db rls:apply
 *
 * Implementation note: Prisma's $executeRawUnsafe runs a single prepared
 * statement, and Postgres prepared statements cannot hold multiple commands.
 * So we split rls.sql on ';' and run each statement individually, skipping
 * function bodies (which legitimately contain ';') by tracking $$ ... $$ blocks.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/generated/client/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, 'sql', 'rls.sql');

/** Split SQL into individual statements, respecting $$ ... $$ dollar-quoted blocks. */
function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  const lines = sql.split('\n');
  for (const line of lines) {
    // strip line comments
    const commentIdx = line.indexOf('--');
    const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    current += code + '\n';
    // toggle dollar-quote state on each $$ occurrence
    const parts = code.split('$$');
    if (parts.length > 1) {
      // odd number of $$ means we toggled state an odd number of times
      if ((parts.length - 1) % 2 === 1) inDollar = !inDollar;
    }
    // split on ';' only when NOT inside a dollar-quoted body
    if (!inDollar && current.trim().endsWith(';')) {
      const stmt = current.trim();
      if (stmt.length > 1) statements.push(stmt);
      current = '';
    }
  }
  const tail = current.trim();
  if (tail.length > 1) statements.push(tail);
  return statements;
}

async function main() {
  const sql = readFileSync(sqlPath, 'utf8');
  const statements = splitSql(sql);
  const prisma = new PrismaClient();
  try {
    let applied = 0;
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        applied++;
      } catch (e) {
        // surface the failing statement for debugging
        const msg = e instanceof Error ? e.message : String(e);
        console.error('✗ statement failed:', stmt.slice(0, 80).replace(/\n/g, ' '), '\n  →', msg);
        throw e;
      }
    }
    console.log(`✓ RLS policies applied (${applied} statements, idempotent)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('✗ Failed to apply RLS:', e);
  process.exit(1);
});

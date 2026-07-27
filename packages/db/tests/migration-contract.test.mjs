import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsRoot = join(packageRoot, 'prisma', 'migrations');
const schemaPath = join(packageRoot, 'prisma', 'schema.prisma');
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

function normalize(statement) {
  return statement.replace(/\s+/g, ' ').trim();
}

function tableContract(sql, table) {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const create = sql.match(new RegExp(`CREATE TABLE "${escapedTable}" \\([\\s\\S]*?\\n\\);`));
  const indexes =
    sql.match(new RegExp(`CREATE (?:UNIQUE )?INDEX "[^"]+" ON "${escapedTable}"\\([^;]+;`, 'g')) ??
    [];

  return {
    create: create ? normalize(create[0]) : null,
    indexes: indexes.map(normalize).sort(),
  };
}

test('registration OTP model is represented exactly in migration history', () => {
  const expectedSql = execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaPath, '--script'],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'postgresql://localhost:5432/schema_contract' },
    },
  );
  const migratedSql = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => readFileSync(join(migrationsRoot, entry.name, 'migration.sql'), 'utf8'))
    .join('\n');

  const expected = tableContract(expectedSql, 'signup_otps');
  const migrated = tableContract(migratedSql, 'signup_otps');

  assert.ok(expected.create, 'Prisma schema must declare the registration OTP table');
  assert.deepEqual(migrated, expected);
});

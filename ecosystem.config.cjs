/**
 * pm2 ecosystem — Graphiti/Neo4j KB ingestion workers.
 *
 * WHAT THESE ARE
 * - ONE-SHOT workers. Each runs scripts/ingest_shard.py, processes its shard of
 *   the corpus, and EXITS when the KB is fully indexed (prints "up to date" and
 *   returns 0). There is no poll/sleep loop inside the script.
 *
 * OPS MODEL — DO NOT AUTO-RESPAWN
 * - autorestart: false on every entry. A one-shot script must be allowed to exit.
 * - NEVER set autorestart:true here. Doing so respawns each clean exit-0
 *   instantly; the last time that happened it caused a 146k+ restart loop.
 * - max_restarts: 1 + a short min_uptime are backstops only.
 *
 * WHEN TO RE-INGEST
 * - Re-ingestion is NOT a pm2 concern. Trigger it on demand — e.g. a cron/systemd
 *   one-shot that runs `pm2 restart ecosystem.config.cjs` (or starts the 4 by
 *   name) AFTER a `git pull` on the KB corpus. Do not rely on pm2 to keep these
 *   alive; that is exactly the bug this file exists to prevent.
 *
 * SECRETS
 * - No secrets in this file. The script loads /opt/trt-rag/.env itself at runtime
 *   (custom loader → os.environ.setdefault). NEO4J_PASSWORD must be set there;
 *   the script fails fast if it is missing.
 *
 * NOTE
 * - The app servers `trt`, `trt-graph`, and `trt-mcp` are healthy, managed
 *   separately, and are intentionally NOT defined in this file.
 */
const base = {
  script: 'scripts/ingest_shard.py',
  cwd: '/opt/trt',
  interpreter: '/opt/trt/.venv/bin/python3',
  autorestart: false,
  max_restarts: 1,
  min_uptime: '10s',
  env: {
    PYTHONUNBUFFERED: '1',
  },
};

const apps = [
  { ...base, name: 'ingest-0', args: '0 4' },
  { ...base, name: 'ingest-1', args: '1 4' },
  { ...base, name: 'ingest-2', args: '2 4' },
  { ...base, name: 'ingest-3', args: '3 4' },
];

module.exports = { apps };

/**
 * pm2 ecosystem — TRT web app processes (production + development).
 *
 * WHY THIS EXISTS
 * The existing `ecosystem.config.cjs` (root) manages ONLY the Graphiti RAG
 * ingest one-shot workers and explicitly excludes the web servers. That file's
 * comment says `trt`, `trt-graph`, `trt-mcp` are "managed separately" — i.e.
 * ad-hoc `pm2 start` on the box, not version-controlled.
 *
 * This file brings the WEB app processes into version control so the CI/CD
 * pipeline can provision them reproducibly. Per GOLD §4 + AGENTS.md §1.5, the
 * deploy model is now GitHub Actions → SSH → `ci-deploy.sh` → `pm2 reload`.
 *
 * ONE-TIME PROVISION (on the LXC box, as root):
 *   pm2 start ecosystem.web.config.cjs --only trt
 *   pm2 start ecosystem.web.config.cjs --only trt-dev
 *   pm2 save && pm2 startup    # persist across reboots
 *
 * AFTER THAT, do NOT call `pm2 start` from CI — `ci-deploy.sh` calls
 * `pm2 reload <name> --update-env` which is zero-downtime. `pm2 start` would
 * create a duplicate process.
 *
 * ENVIRONMENT
 * Next.js auto-loads `apps/web/.env.local` from the cwd. CI renders that file
 * on every deploy from GitHub Environment secrets. pm2 does NOT need env vars
 * defined here except PORT + NODE_ENV (used before Next.js loads .env.local).
 */
const webBase = {
  // IMPORTANT: do NOT use 'node_modules/.bin/next' — that's a shell wrapper script
  // and pm2 tries to execute it as JS (SyntaxError). Point at the JS entry point.
  script: 'node_modules/next/dist/bin/next',
  args: 'start',
  autorestart: true,
  max_restarts: 10,
  max_memory_restart: '1G',
  time: true,
  watch: false,
};

const apps = [
  {
    ...webBase,
    name: 'trt',
    cwd: '/opt/trt/apps/web',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
    },
  },
  {
    ...webBase,
    name: 'trt-dev',
    cwd: '/opt/trt-dev/apps/web',
    env: {
      NODE_ENV: 'development',
      PORT: '3001',
    },
  },
];

module.exports = { apps };

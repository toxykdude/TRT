# Deployment & Operations

The app runs on a Debian 13 LXC behind Cloudflare Tunnel(s). GitHub is the
single source of truth; GitHub Actions is the only deploy motor. No manual
`git pull`, `pm2 restart`, or `.env` editing on the box — all of that is now
driven by CI from version-controlled workflows.

## Topology

```
PROD:  Browser → https://my-testo.com     → cloudflared → 127.0.0.1:3000 → Next.js (pm2 `trt`)     → Postgres `trt`
DEV:   Browser → https://dev.my-testo.com → cloudflared → 127.0.0.1:3001 → Next.js (pm2 `trt-dev`) → Postgres `trt_dev`
```

- `cloudflared` runs on a separate host and forwards `my-testo.com` → `http://10.162.36.45:3000` and `dev.my-testo.com` → `http://10.162.36.45:3001`.
- Next.js binds `0.0.0.0:300x`; pm2 keeps both processes alive across reboots.
- The two Postgres databases (`trt`, `trt_dev`) are **physically separate**. DEV holds synthetic seed data only — never real PHI.
- Migrated from `trt.powerhousegym.co` 2026-07. If `trt.powerhousegym.co` still resolves, the old tunnel route must be removed from the cloudflared config.

## Stack versions (installed on the LXC)

| Component | Version |
|---|---|
| Node.js | 20 LTS |
| pnpm | 10.x (via corepack) |
| PostgreSQL | 17 |
| pm2 | latest (global) |
| Next.js | 15 |

## CI/CD pipeline

Four workflows live in `.github/workflows/`:

| Workflow | Trigger | Effect |
|---|---|---|
| `pr-validation.yml` | every PR → main | lint, typecheck, unit tests, build verification. Blocks merge on failure. |
| `deploy-dev.yml` | every PR + push to `feature/*` | Renders DEV `.env.local` from GitHub secrets, scp's to box, runs `ci-deploy.sh development`. Posts the DEV URL on the PR. |
| `deploy-production.yml` | push to main (post-merge) | Same flow, `production` env, `my-testo.com`. |
| `rollback.yml` | manual dispatch (`workflow_dispatch`) | Pick environment + SHA/tag + reason. Checks out that ref and redeploys. Forward-only migrations are NOT reversed. |

`scripts/ci-deploy.sh` is the box-side deploy entry point. It: fetches, pins to `TARGET_SHA`, `pnpm install --frozen-lockfile`, `prisma migrate deploy`, `pnpm --filter @trt/web build`, `pm2 reload --update-env`, and appends to `/var/log/trt-deploy.log`. It never touches secrets — `.env.local` is rendered on the GitHub runner from secrets and scp'd before the script runs.

GitHub Environments: `development` and `production`, each with its own secret set. `main` is branch-protected (PR required, `Lint + Typecheck + Test + Build` status check required, no force-push, no deletion).

## First-time setup (already done on prod; needed for DEV)

### Part 1 — LXC box (one-time, as root)

```bash
# 1. Generate the deploy SSH keypair (the public half goes to GitHub, the
#    private half NEVER leaves the box's authorized_keys workflow).
ssh-keygen -t ed25519 -f /root/.ssh/trt_ci_deploy -N "" -C "trt-ci-deploy"
cat /root/.ssh/trt_ci_deploy.pub >> /root/.ssh/authorized_keys
# Print the private key — paste it into the LXC_SSH_KEY GitHub secret:
cat /root/.ssh/trt_ci_deploy

# 2. Disable root password auth (forces key-only — kills the .env password risk):
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/'       /etc/ssh/sshd_config
systemctl restart sshd

# 3. Capture known_hosts for the LXC_KNOWN_HOSTS secret:
ssh-keyscan -H 10.162.36.45 2>/dev/null

# 4. Create the trt_dev database + role (DEV only; trt already exists for prod):
runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE trt_dev LOGIN PASSWORD '<strong-dev-password>';
CREATE DATABASE trt_dev OWNER trt_dev;
GRANT ALL PRIVILEGES ON DATABASE trt_dev TO trt_dev;
SQL

# 5. Clone the DEV checkout (prod already exists at /opt/trt):
git clone https://github.com/toxykdude/TRT.git /opt/trt-dev
cd /opt/trt-dev && corepack enable && pnpm install

# 6. Provision both pm2 processes from the version-controlled config:
pm2 start ecosystem.web.config.cjs --only trt
pm2 start ecosystem.web.config.cjs --only trt-dev
pm2 save && pm2 startup systemd -u root --hp /root   # one-time, persist across reboots

# 7. Cloudflared: add the DEV route. On the cloudflared host, add to its config:
#    ingress:
#      - hostname: dev.my-testo.com
#        service: http://10.162.36.45:3001
#      - hostname: my-testo.com
#        service: http://10.162.36.45:3000
#    (remove the trt.powerhousegym.co ingress — it's decommissioned)
#    Then: systemctl restart cloudflared
#    DNS: ensure both hostnames CNAME to the tunnel's hostname in Cloudflare.
```

### Part 2 — GitHub (from a machine with `gh` CLI)

```bash
gh auth login --scopes repo,workflow

# Create three env files OUTSIDE the repo, then source each in turn:
#   ~/.trt-secrets-infra.env  → LXC_HOST, LXC_SSH_USER, LXC_SSH_KEY, LXC_KNOWN_HOSTS
#   ~/.trt-secrets-dev.env    → DATABASE_URL (trt_dev), AUTH_SECRET, NEXTAUTH_SALT,
#                               OPENAI_* (stub ok), RESEND_API_KEY (empty ok),
#                               EMAIL_FROM, GOOGLE_CLIENT_* (empty ok), MCP_AUTH_TOKEN
#   ~/.trt-secrets-prod.env   → same vars, prod values (real DATABASE_URL, real OPENAI_API_KEY, etc.)

source ~/.trt-secrets-infra.env && bash scripts/setup-github.sh infra
source ~/.trt-secrets-dev.env   && bash scripts/setup-github.sh env development
source ~/.trt-secrets-prod.env  && bash scripts/setup-github.sh env production
```

After the first prod deploy, `/opt/trt/apps/web/.env.local` is **rendered by CI** and owned by the workflow. Do not hand-edit it — the next deploy overwrites it.

## Day-to-day (no commands needed)

1. Branch from `main`, push commits.
2. Open a PR → `pr-validation` runs, then `deploy-dev` deploys the PR to `dev.my-testo.com` and comments the URL.
3. Validate on DEV (no PHI — synthetic data only).
4. Merge the PR → `deploy-production` ships to `my-testo.com` automatically.

## Rollback

Actions tab → **Rollback** → Run workflow → pick `environment`, `ref` (SHA/tag), `reason`.

**Warning**: rollback redeploys the old CODE but `prisma migrate deploy` is forward-only. If a migration ran between the rollback target and HEAD, the old code may not match the new schema. Inspect `packages/db/prisma/migrations/` between the two refs before rolling back. There is no automatic DB rollback — that requires manual SQL.

## Memory note (2 GB LXC)

No file-backed swap (CoW storage backend rejects `swapon`). `next build` has peaked within 2 GB for this app. If a future build OOMs, build on a beefier runner (already where CI runs) — the CI workflow already builds on `ubuntu-latest` then `pm2 reload`s on the box, so the build itself doesn't tax the LXC.

## Verification (post-deploy)

```bash
# On the box:
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/           # 200 (prod)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/           # 200 (dev)
pm2 logs trt --lines 20                                                  # no errors

# Audit trail (every deploy appends one line):
tail -20 /var/log/trt-deploy.log

# Engine + guardrail tests (deterministic correctness):
pnpm --filter @trt/engine test                                           # 31 tests pass
pnpm --filter @trt/ai test                                               # guardrail tests pass
```

## Common operations

| Task | Command |
|---|---|
| View prod logs | `pm2 logs trt` |
| View dev logs | `pm2 logs trt-dev` |
| Status | `pm2 list` |
| Psql into prod DB | `runuser -u postgres -- psql -d trt` |
| Psql into dev DB | `runuser -u postgres -- psql -d trt_dev` |
| Check RLS | `runuser -u postgres -- psql -d trt -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('patients','lab_results','users') ORDER BY relname;"` |
| Update biomarkers | edit `packages/db/prisma/seed.ts` → PR → CI deploys |
| Force re-render `.env.local` | push any commit to main (or re-run the deploy workflow from Actions UI) |

## Secrets

All secrets live in GitHub Environments (`development`, `production`) or as repo-level secrets (`LXC_*`). The `.env.local` on the box is rendered from them on every deploy. **Never** commit secrets, never hand-edit `.env.local`, never paste credentials into chat or docs.

The following are NOT in GitHub secrets by design:
- **GitHub PAT** — circular risk (the repo's own access token inside the repo's secrets).
- **LXC root password** — replaced by the `trt_ci_deploy` SSH key. Root password auth is disabled.
- **Cloudflare tunnel token** — lives in cloudflared config on its host, not consumed by the app.

## Secrets rotation

| Secret | How to rotate |
|---|---|
| `LXC_SSH_KEY` | Generate new keypair on box → append pubkey to authorized_keys → update GitHub secret → remove old key from authorized_keys |
| `DATABASE_URL` | `ALTER ROLE ... PASSWORD` in psql → update GitHub Environment secret → next deploy picks it up |
| `AUTH_SECRET` | `openssl rand -base64 32` → update GitHub secret → next deploy signs out all sessions |
| `OPENAI_API_KEY` | Rotate at Z.AI → update `production` secret only (DEV stays empty/stub) |
| `RESEND_API_KEY` | Rotate at Resend → update `production` secret only |

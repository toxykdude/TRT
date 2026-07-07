# Deployment & Operations

The app runs on a Debian 13 LXC behind a Cloudflare Tunnel.

## Topology

```
Browser → https://trt.powerhousegym.co → (remote cloudflared) → http://10.162.36.45:3000 → Next.js (pm2) → Postgres 17 (local)
```

- The `cloudflared` connector runs on a **separate host** and forwards to the LXC.
  Point its ingress for `trt.powerhousegym.co` at `http://10.162.36.45:3000`.
- Next.js binds `0.0.0.0:3000` (so the tunnel can reach it) and is managed by pm2.

## Stack versions (installed on the LXC)

| Component | Version |
|---|---|
| Node.js | 20 LTS |
| pnpm | 10.x (via corepack) |
| PostgreSQL | 17 |
| pm2 | latest (global) |
| Next.js | 15 |

## First-time setup (already done; documented for rebuilds)

```bash
# On the LXC (root), one-time:
apt-get install -y git ca-certificates curl gnupg build-essential postgresql postgresql-contrib locales
locale-gen en_US.UTF-8 && update-locale LANG=en_US.UTF-8

# Node 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
corepack enable && corepack prepare pnpm@10.18.0 --activate

# Postgres role + DB (generate a strong password)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE trt LOGIN PASSWORD '<strong-password>';
CREATE DATABASE trt OWNER trt;
GRANT ALL PRIVILEGES ON DATABASE trt TO trt;
SQL
```

## App deploy

```bash
cd /opt/trt
git pull
pnpm install                      # first time; or --frozen-lockfile once lockfile is committed
pnpm exec prisma generate --schema packages/db/prisma/schema.prisma
pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
pnpm --filter @trt/db rls:apply   # apply Row Level Security (idempotent)
pnpm --filter @trt/db seed        # seed the biomarker catalog (idempotent)
pnpm --filter @trt/web build

# Run (boot-persistent)
pm2 start "node_modules/.bin/next start -H 0.0.0.0 -p 3000" --name trt --cwd /opt/trt/apps/web
pm2 save
pm2 startup systemd -u root --hp /root   # one-time, enables the systemd unit
```

The `.env` lives at `/opt/trt/.env` (chmod 600, gitignored) and holds:
`DATABASE_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`, `NEXTAUTH_SALT`, and optional
`GOOGLE_CLIENT_*` / `OPENAI_API_KEY`.

## Redeploy after a code change

```bash
cd /opt/trt
git pull
pnpm --filter @trt/web build
pm2 restart trt --update-env
```

If the schema changed, also run `prisma migrate deploy` + `rls:apply` before the build.

## Memory note (2 GB LXC)

The box has **no file-backed swap** (the storage backend is CoW; `swapon` rejects
it). `next build` peaked comfortably within 2 GB for this app. If a future build
OOMs, build on a beefier machine and rsync `apps/web/.next/` to the LXC, then
`pm2 restart`.

## Verification (post-deploy)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/           # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login      # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/dashboard  # 307 (redirect)
pm2 logs trt --lines 20                                            # no errors
pnpm --filter @trt/ai test                                         # 14 guardrail tests pass
```

## Common operations

| Task | Command |
|---|---|
| View logs | `pm2 logs trt` |
| Restart | `pm2 restart trt` |
| Status | `pm2 list` |
| Psql into DB | `runuser -u postgres -- psql -d trt` |
| Check RLS | `runuser -u postgres -- psql -d trt -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('patients','lab_results','users') ORDER BY relname;"` |
| Update biomarkers | edit `packages/db/prisma/seed.ts`, then `pnpm --filter @trt/db seed` |

## ⚠️ Rotate these secrets (shared to set this up)

These credentials were pasted into the setup session and live in `/opt/trt/.env`
and the project's local `.env`. **Rotate all of them once the deployment is
confirmed working:**

1. **GitHub PAT** (`github_pat_...`) — GitHub → Settings → Developer settings →
   Personal access tokens → revoke; generate a new one (minimal scope) if pushes
   are still needed.
2. **LXC root password** — change it and keep SSH key-only auth.
3. **Postgres `trt` password** — rotate, update `DATABASE_URL` in `.env`, restart pm2.
4. **`AUTH_SECRET`** — regenerate with `openssl rand -base64 32`, update `.env`,
   restart pm2 (this signs out all sessions).

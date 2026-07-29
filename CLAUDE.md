# CLAUDE.md — TRT Project (Claude Code entry point)

TRT is a **TRT/hormone-health lab-report analysis platform**: a patient uploads
bloodwork → the deterministic engine returns dose recommendations + biomarker
trend insights. Patient-first; clinician features are roadmap/gated.

> Read in this order: **[GOLD.md](./GOLD.md)** (source of truth) →
> **[AGENTS.md](./AGENTS.md)** (operating manual) → **[STATUS.md](./STATUS.md)**
> (current state) → **[RESUME.md](./RESUME.md)** (where we left off).

## Read STATUS.md for current state
**[STATUS.md](./STATUS.md)** is the always-current snapshot. Start there before
touching anything.

## Safety rules (non-negotiable)
- **GOLD wins.** If anything conflicts with [GOLD.md](./GOLD.md), GOLD is right
  unless GOLD is being deliberately revised. See GOLD §2 (Prime Directive).
- **Consumer payloads fail closed.** Every consumer-bound output goes through the
  canonical `packages/guardrails` → `assertConsumerSafe`. Diagnostic prose and
  RAG/protocol dosing are clinician-only. Disclaimers are mandatory +
  non-dismissible on every clinical surface (GOLD §2.5).
- **`ownerId` binding is mandatory.** `prismaFor(userId)` is BYPASSRLS — Postgres
  RLS is NOT the tenancy gate. Every read filters `where: { ownerId }`; every
  write binds `ownerId` from `auth()`. A missing `ownerId` = cross-tenant PHI leak.

## Commands
| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Tests (all workspaces) | `pnpm test` |
| Build (Next.js) | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| DB migrate (dev) | `pnpm --filter @trt/db prisma:migrate dev` |

`@trt/db` `typecheck` is RED (pre-existing debt) — see STATUS.md → Open Follow-ups.

## Project layout
```
apps/web/              # Next.js 15 App Router (routes, components, lib)
packages/
├── db/                # Prisma schema + client + migrations
├── ai/                # extraction (Z.AI glm-4.6v), analysis, report pipelines
├── engine/            # deterministic rules engine (classify → trends → rules)
├── guardrails/        # canonical consumer-safety filter (assertConsumerSafe)
└── mcp/               # retrieval-only MCP server (KB + graph + platform docs)
openspec/              # SDD artifacts (changes/, specs/)
docs/                  # architecture, deployment, engine, mcp docs
```

## Engram + SDD
This repo uses **hybrid Spec-Driven Development**: OpenSpec files in `openspec/`
plus **Engram** persistent memory. SDD history is searchable — `mem_search` the
change name (e.g. `streamline-upload-to-insight`) to pull explore/proposal/spec/
design/tasks/apply/verify/archive artifacts. Phase flow:
explore → propose → spec → design → tasks → apply → verify → archive.
Config: `openspec/config.yaml` (`strict_tdd: true`, `test_command: pnpm test`).

## LXC access — reaching the production/DEV host

The LXC is the single box running both PROD and DEV. **CI/CD is the normal deploy
path** (push `main` → prod, PR → DEV). SSH is for infrastructure fixes, hot
restarts, log inspection, or Cloudflare tunnel maintenance only — never for
editing `.env.local` (it's overwritten by CI on every deploy).

### SSH in

```bash
ssh -i /root/.ssh/faceapp root@10.162.36.45
```

- Host: `10.162.36.45` (Debian LXC, hostname `TRT`)
- Key: `/root/.ssh/faceapp` (ed25519, `faceapp@OpencodePersonal`)
- If key auth fails, the LXC root's `authorized_keys` needs the public key added.

### What's on the box

| | Production | DEV |
|---|---|---|
| pm2 process | `trt` | `trt-dev` |
| Port | `:3000` | `:3001` |
| Checkout | `/opt/trt` | `/opt/trt-dev` |
| Postgres DB | `trt` | `trt_dev` (synthetic seed only) |
| Public URL | `https://my-testo.com` | `https://dev.my-testo.com` |
| Direct URL | `http://10.162.36.45:3000` | `http://10.162.36.45:3001` |

### Common operations (over SSH)

```bash
# pm2 status / logs / restart
pm2 list
pm2 logs trt --lines 50          # prod app logs
pm2 logs trt-dev --lines 50      # dev app logs
pm2 reload trt --update-env      # graceful prod restart
pm2 reload trt-dev --update-env  # graceful dev restart

# deploy log (appended by every CI deploy)
tail -50 /var/log/trt-deploy.log

# Prisma direct (emergency only — CI runs migrate deploy automatically)
cd /opt/trt && pnpm --filter @trt/db prisma migrate deploy
```

### Cloudflare Tunnel (remotely managed)

The tunnel runs as a **systemd token-file service** — there is no local
`config.yml`. Ingress and public hostnames are controlled remotely via the
Cloudflare API or dashboard, then pushed to the connector automatically.

- Service: `systemctl status cloudflared` (active, auto-restarts)
- Tunnel ID: `26903a94-e8e1-4c0a-b5f2-abbb9fdbc256`
- Account ID: `57edffbb9eab6225844d20533265a5ac`
- Token file: `/etc/cloudflared/token`
- Connector metrics: `curl http://127.0.0.1:20241/config` (shows current ingress)
- Ingress routes: `my-testo.com` → `:3000`, `www.my-testo.com` → `:3000`,
  `dev.my-testo.com` → `:3001`, catch-all → `http_status:404`

**To add or change a public hostname:** modify the tunnel's remote ingress +
create/update the DNS record via the Cloudflare API (using a token with
`Cloudflare Tunnel:Edit` + `DNS:Edit` + `Zone:Read` scopes). The connector
receives the new config within seconds — no restart needed.

```bash
# Verify connector received remote config
curl -s http://127.0.0.1:20241/config | python3 -m json.tool

# Verify public DNS resolves
dig +short @1.1.1.1 dev.my-testo.com
```

### Credentials note

The Cloudflare API token, Stripe keys, and Resend key live as plain-text notes
in the workspace `.env` file (not a valid dotenv). These should eventually move
to GitHub Environment secrets or a secret manager. Production `.env.local` on
the box is rendered by CI from GitHub secrets — **do not hand-edit it**.

---

See **[SKILL.md](./SKILL.md)** for the full capabilities/workflow index.

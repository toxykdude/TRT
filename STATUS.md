# STATUS — TRT Project
> Last updated: 2026-07-29. Read this before starting work.
> Quick orientation: [GOLD.md](./GOLD.md) · [AGENTS.md](./AGENTS.md) · [RESUME.md](./RESUME.md)

## Production (my-testo.com)
| | |
|---|---|
| URL | `https://my-testo.com` |
| Host | Debian LXC `10.162.36.45`, pm2 process `trt` on `:3000` |
| DB | Postgres `trt` |
| Main HEAD | `5996f70` (Merge PR #10, 2026-07-29) |

**Live features:** auth (credentials + Google), lab upload (PDF/JPG/PNG/HEIC) →
**AI auto-extraction** (Z.AI `glm-4.6v`) → PENDING_REVIEW confirm surface →
CONFIRMED-only analysis/trends/reports, per-biomarker trend charts (`/dashboard/
analytics`, Recharts `<Brush>` + per-lab reference overlay), medication + symptom
entry, dose recommendations from the deterministic engine for every authenticated
user. All production deploys green.

**Key commits on main:** `07e3e29` (env-trap fix) · `7d6e6a0` (idempotent metering
+ FREE=1) · `eb5839f` (upload returns labReportId) · `b05e6ac` (auto-extract +
error surfacing) · `6efa429` (review surface + confirm route) · `b811c1f`
(confirmed-only must-BLOCK + tenant isolation) · `8adde6b` (hardening: metering
log + retry ownerId).

## DEV (dev.my-testo.com)
| | |
|---|---|
| URL | `https://dev.my-testo.com` (also `http://10.162.36.45:3001`) |
| Host | same LXC, pm2 `trt-dev` on `:3001` |
| DB | Postgres `trt_dev` (**synthetic seed data only — never real PHI**) |

DEV Cloudflare tunnel **restored 2026-07-29** — it had been broken (missing DNS
record + tunnel ingress); fixed by adding both via the Cloudflare API.

## Latest Shipped Change
**`streamline-upload-to-insight`** — delivered the end-to-end upload→insight loop.
Merged via PRs #8, #9, #10 on 2026-07-29. Full SDD trail at
`openspec/changes/archive/2026-07-28-streamline-upload-to-insight/`; synced spec
at `openspec/specs/upload-to-insight-workflow/spec.md` (7 requirements, 14 scenarios).

What it changed:
1. **Auto-extraction** — upload starts extraction automatically (no manual
   button); visible `EXTRACTING` badge.
2. **FREE tier = 1 extraction** (`plans.ts` `FREE.uploadsPerMonth` 0 → 1).
3. **OpenAI env-trap fix** (`packages/ai/src/openai.ts`) — `??` → `||`; startup
   `warnIfConfigIncomplete()` via `apps/web/instrumentation.ts`.
4. **Idempotent extraction metering** (`extract/route.ts`) — gate + metering fire
   only on `status==='UPLOADED'` via atomic `updateMany` claim; FAILED→EXTRACTING
   retries bypass gate + metering (no double-charge); FAILED audit trail kept.
5. **Structured error surfacing** — `labs-list.tsx` shows structured 402
   (`QuotaExceededDialog`), retry, manual-entry (was silently swallowed).
6. **PENDING_REVIEW confirm surface** — `labs/confirm/route.ts` + review page;
   confirm/correct/manual-re-entry flips → CONFIRMED in a transaction w/ AuditLog;
   cross-owner → 404; non-dismissible SafetyBanner.
7. **Confirmed-only must-BLOCK invariant** — `analytics-series.ts` post-query
   CONFIRMED filter; content-independent test proves PENDING_REVIEW never reaches
   analysis/trends/reports/dosing.

**Test suite (green):** web 232/232 · ai 29/29 · guardrails 63/63 · engine 25/25 ·
kb 7/7 · mcp 24/24.

## Open Follow-ups
| ID | Severity | Item |
|---|---|---|
| **W-1** | WARNING (blocks next prod only) | Manual Playwright harness (5 scenarios) documented in `.../streamline-upload-to-insight/playwright-harness.md` but **NOT run** against live DEV/prod. DOM render wiring verified only by typecheck/build. Run pre-merge of the next change. |
| **S-3** | SUGGESTION (non-blocking) | `extract/route.ts:228-231` catch-block FAILED-flip uses `update({where:{id}})` without `ownerId`. Tenancy safe (upstream `findFirst` gates ownerId) — defense-in-depth parity only. |
| — | Debt (pre-existing) | `@trt/db` `typecheck` RED (missing `@types/node`, prisma outside rootDir). Scope CI typecheck per-package or fix the db tsconfig. |
| — | Stale doc | GOLD.md §4 still says "Vercel"; production is pm2 on LXC behind Cloudflare Tunnel. |
| — | Security | Plain-text credentials in workspace `.env` (Stripe keys, Cloudflare token, Resend key) — should move to GitHub Environment secrets or a secret manager. |

## Active SDD Changes
- `streamline-upload-to-insight` — **archived** 2026-07-28 (PASS WITH WARNINGS,
  0 CRITICAL). Delta spec promoted to `openspec/specs/upload-to-insight-workflow/`.
- No in-progress changes. Search Engram (`mem_search <change-name>`) for any other trail.

## Infrastructure
| | |
|---|---|
| Prod | pm2 `trt` `:3000`, DB `trt`, Debian LXC `10.162.36.45` |
| DEV | pm2 `trt-dev` `:3001`, DB `trt_dev` (synthetic) |
| Cloudflare tunnel | Remotely-managed, token-file service. ID `26903a94-e8e1-4c0a-b5f2-abbb9fdbc256`, account `57edffbb9eab6225844d20533265a5ac`. Ingress: `my-testo.com`→`:3000`, `www.my-testo.com`→`:3000`, `dev.my-testo.com`→`:3001`, catch-all→404. Config is **remote** (not local YAML); changes via Cloudflare API or dashboard. |
| CI/CD | GitHub Actions on self-hosted runner `trt-lxc` (== the LXC). Workflows: `pr-validation.yml`, `deploy-dev.yml`, `deploy-production.yml`, `rollback.yml`. Deploy script: `scripts/ci-deploy.sh` (pull → `pnpm install --frozen-lockfile` → `prisma migrate deploy` → build → `pm2 reload --update-env` → log). `.env.local` rendered from GitHub Environment secrets — **do not hand-edit on the box.** |
| AI extraction | Z.AI `glm-4.6v` via OpenAI-compatible client (`packages/ai`). Config in `.env.local`: `OPENAI_API_KEY`, `OPENAI_API_URL=https://api.z.ai/api/coding/paas/v4`, `OPENAI_MODEL=glm-4.6v`. `pdftoppm` renders PDF→PNG. Deterministic stub when key unset (local dev). |

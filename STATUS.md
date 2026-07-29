# STATUS — TRT Project
> Last updated: 2026-07-29. Read this before starting work.
> Quick orientation: [GOLD.md](./GOLD.md) · [AGENTS.md](./AGENTS.md) · [RESUME.md](./RESUME.md)

## Production (my-testo.com)
| | |
|---|---|
| URL | `https://my-testo.com` |
| Host | Debian LXC `10.162.36.45`, pm2 process `trt` on `:3000` |
| DB | Postgres `trt` |
| Main HEAD | `8fd9b08` (Merge PR #11, 2026-07-29) |

**Live features:** auth (credentials + Google) with a localized Auth.js error
page for sign-in interruptions, lab upload (PDF/JPG/PNG/HEIC) →
**AI auto-extraction** (Z.AI `glm-4.6v`) → PENDING_REVIEW confirm surface →
CONFIRMED-only analysis/trends/reports, per-biomarker trend charts (`/dashboard/
analytics`, Recharts `<Brush>` + per-lab reference overlay), medication + symptom
entry, dose recommendations from the deterministic engine for every authenticated
user. All production deploys green.

**Key commits on main:** `07e3e29` (env-trap fix) · `7d6e6a0` (idempotent metering
+ FREE=1) · `eb5839f` (upload returns labReportId) · `b05e6ac` (auto-extract +
error surfacing) · `6efa429` (review surface + confirm route) · `b811c1f`
(confirmed-only must-BLOCK + tenant isolation) · `8adde6b` (hardening: metering
log + retry ownerId) · `e047578` (localized Auth.js error page) · `2b56e70`
(icon.svg + favicon fix).

## DEV (dev.my-testo.com)
| | |
|---|---|
| URL | `https://dev.my-testo.com` (also `http://10.162.36.45:3001`) |
| Host | same LXC, pm2 `trt-dev` on `:3001` |
| DB | Postgres `trt_dev` (**synthetic seed data only — never real PHI**) |

DEV Cloudflare tunnel **restored 2026-07-29** — it had been broken (missing DNS
record + tunnel ingress); fixed by adding both via the Cloudflare API.

## Latest Shipped Change
**`fix/auth-error-page`** (PR #11) — replaced the Auth.js default "Server error /
There is a problem with the server configuration" dead-end with a localized,
branded error page, and fixed the always-broken `theme.logo`/favicon 404s.
Merged 2026-07-29 (`8fd9b08`). Ad hoc fix, not run through the SDD pipeline (no
`openspec/` change folder) — full diagnosis + implementation trail is in Engram
only (`mem_search` `"auth-error-page"` or `"InvalidCheck"`).

Root cause: Auth.js flattens every throw not in its `clientErrors` allowlist to
`?error=Configuration`. In production that bucket is dominated by `InvalidCheck`
— the `__Secure-authjs.pkce.code_verifier` cookie has `Max-Age=900`, so ~15 min
on the Google consent screen, a mid-flow refresh, or a deploy landing mid-flow
all produced the misleading "server misconfiguration" page even though a retry
succeeds. Confirmed via prod log (`pm2 logs trt`) + a live PKCE round-trip
against `my-testo.com`, not inferred.

What it changed:
1. **`presentAuthError`** (`apps/web/src/lib/auth-error.ts`) — closed exact-match
   table mapping Auth.js error codes to `{ key, retryable }`. `Configuration`/
   `MissingCSRF` → retryable "interrupted"; `AccessDenied` and account-linking
   conflicts → non-retryable. Unrecognised `?error=` values collapse to
   `unknown` — the attacker-controlled query param never reaches the page.
2. **`/auth-error` page** in the `(auth)` route group — inherits the branded
   layout + `SafetyBanner`; `pages.error` wired in `@/lib/auth`.
3. **`apps/web/public/icon.svg`** — first git-tracked file under
   `apps/web/public/`; fixes `theme.logo` and the browser's implicit
   `/favicon.ico` probe (declared explicitly in `generateMetadata`).

**Previous shipped change — `streamline-upload-to-insight`** (2026-07-29, PRs
#8–#10): delivered the end-to-end upload→insight loop. Full SDD trail at
`openspec/changes/archive/2026-07-28-streamline-upload-to-insight/`; synced spec
at `openspec/specs/upload-to-insight-workflow/spec.md` (7 requirements, 14 scenarios).

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

**Test suite (green):** web 239/239 · ai 29/29 · guardrails 63/63 · engine 25/25 ·
kb 7/7 · mcp 24/24 (387 total).

## Open Follow-ups
| ID | Severity | Item |
|---|---|---|
| **W-1** | WARNING (blocks next prod only) | Manual Playwright harness (5 scenarios) documented in `.../streamline-upload-to-insight/playwright-harness.md` but **NOT run** against live DEV/prod. DOM render wiring verified only by typecheck/build. Run pre-merge of the next change. |
| **S-3** | SUGGESTION (non-blocking) | `extract/route.ts:228-231` catch-block FAILED-flip uses `update({where:{id}})` without `ownerId`. Tenancy safe (upstream `findFirst` gates ownerId) — defense-in-depth parity only. |
| — | Stale doc (GOLD needs a deliberate revision, not a silent sync) | GOLD.md §4 "Backend / Data" and "Auth" bullets still list Supabase (Postgres + Auth + Storage). The actual stack is local Postgres on the LXC + Prisma + Auth.js v5 (Credentials + Google) + local-disk file storage (`writeFile`, mode `0o600`) — zero Supabase usage anywhere in code. Flag for the product owner before editing GOLD. |
| — | Untracked assets | `apps/web/public/brand/*.svg` + `README.md` (4 logo concepts) are local, untracked marketing work. `apps/web/public/icon.svg`'s provenance comment references `my-testo-monogram.svg`, which isn't committed yet — that comment will dangle until `public/brand/` lands. |
| — | Security | Plain-text credentials in workspace `.env` (Stripe keys, Cloudflare token, Resend key) — should move to GitHub Environment secrets or a secret manager. |

**Resolved this pass (2026-07-29):** `@trt/db` `typecheck` is now **green** —
confirmed via `pnpm typecheck` across all 7 workspaces before merging PR #11.
The RED-debt item is removed from this list and from every doc that repeated
it (`AGENTS.md`, `CLAUDE.md`, `SKILL.md`, `RESUME.md`) — see AGENTS.md §1.6 for
why that matters. The "GOLD §4 says Vercel" item is also removed: GOLD.md §4
line 87 already correctly documents pm2/LXC and explicitly notes "Vercel is
out" — that follow-up had gone stale itself. The real GOLD divergence is
Supabase (above), not Vercel.

## Active SDD Changes
- `streamline-upload-to-insight` — **archived** 2026-07-28 (PASS WITH WARNINGS,
  0 CRITICAL). Delta spec promoted to `openspec/specs/upload-to-insight-workflow/`.
- `fix/auth-error-page` (PR #11, 2026-07-29) — **not an SDD change**; shipped
  directly (diagnose → branch → PR → DEV-verify → merge → prod-verify). No
  `openspec/` folder exists for it. Full trail in Engram
  (`mem_search "auth-error-page"` / `"InvalidCheck"`).
- No in-progress SDD changes. Search Engram (`mem_search <change-name>`) for any other trail.

## Infrastructure
| | |
|---|---|
| Prod | pm2 `trt` `:3000`, DB `trt`, Debian LXC `10.162.36.45` |
| DEV | pm2 `trt-dev` `:3001`, DB `trt_dev` (synthetic) |
| Cloudflare tunnel | Remotely-managed, token-file service. ID `26903a94-e8e1-4c0a-b5f2-abbb9fdbc256`, account `57edffbb9eab6225844d20533265a5ac`. Ingress: `my-testo.com`→`:3000`, `www.my-testo.com`→`:3000`, `dev.my-testo.com`→`:3001`, catch-all→404. Config is **remote** (not local YAML); changes via Cloudflare API or dashboard. |
| CI/CD | GitHub Actions, two runner classes. `pr-validation.yml` (lint/typecheck/test/build gate) runs on GitHub-hosted `ubuntu-latest` — no LXC access, no secrets. `deploy-dev.yml`, `deploy-production.yml`, `rollback.yml` run `[self-hosted, LXC]` (the box itself). Deploy script: `scripts/ci-deploy.sh` (pull → `pnpm install --frozen-lockfile` → `prisma migrate deploy` → build → `pm2 reload --update-env` → log). `.env.local` rendered from GitHub Environment secrets on the LXC runner — **do not hand-edit on the box.** |
| AI extraction | Z.AI `glm-4.6v` via OpenAI-compatible client (`packages/ai`). Config in `.env.local`: `OPENAI_API_KEY`, `OPENAI_API_URL=https://api.z.ai/api/coding/paas/v4`, `OPENAI_MODEL=glm-4.6v`. `pdftoppm` renders PDF→PNG. Deterministic stub when key unset (local dev). |
